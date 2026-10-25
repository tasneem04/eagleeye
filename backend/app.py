"""EagleEye API and static frontend.

Run from the repo root:  uvicorn backend.app:app --reload

Knowledge rule: players are learners, not judges. Nothing a visitor does changes
the coaching knowledge; only KnowledgeScout research approved by the admin and
the geometry decide what is correct. See backend/security.py for the protection
of admin actions, rate limits and the agent-call budget.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import geometry, training
from .agents.pipeline import Pipeline
from .learning.clarity import MAX_COMMENT_CHARS, MAX_EXPLANATION_CHARS, ClarityStore
from .learning.knowledge_sync import KnowledgeSync
from .learning.scout import KnowledgeScout
from .security import (SECURITY_HEADERS, AgentBudget, RateLimiter, client_key, is_admin, public_stages,
                       require_admin)

ROOT = Path(__file__).resolve().parent.parent
SCENARIO_DIR = ROOT / "data" / "scenarios"
FRONTEND_DIR = ROOT / "frontend"
KNOWLEDGE_DIR = ROOT / "knowledge"
CLARITY_PATH = ROOT / "data" / "feedback" / "clarity.jsonl"
ANALYSIS_CACHE_SIZE = 200
LEVEL = Literal["rookie", "academy", "pro"]

load_dotenv(ROOT / ".env")
logging.basicConfig(level=logging.INFO)
PRODUCTION = os.getenv("EAGLEEYE_ENV", "development").strip().lower() == "production"


def load_scenarios() -> dict[str, dict]:
    scenarios = {}
    for path in sorted(SCENARIO_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        scenarios[data["id"]] = data
    return scenarios


def _all_trials(scenarios: dict[str, dict]) -> dict[str, dict]:
    return {t["id"]: t for s in scenarios.values() for t in training.find_trials(s)}


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.scenarios = load_scenarios()
    app.state.trials = _all_trials(app.state.scenarios)
    # Where each trial's free player is (for choosing drills); kept server-side only.
    app.state.trial_meta = [training.trial_meta(app.state.scenarios[t["scenario_id"]], t)
                            for t in app.state.trials.values()]
    app.state.analysis_cache = {}
    app.state.limiter = RateLimiter(enabled=os.getenv("RATE_LIMITS", "on").strip().lower() != "off")
    app.state.budget = AgentBudget(int(_float_env("AGENT_CALLS_PER_HOUR", 600)))
    app.state.clarity = ClarityStore(CLARITY_PATH)
    pipeline = app.state.pipeline = Pipeline.from_env()
    sync = None
    if pipeline.foundry is not None:
        sync = KnowledgeSync(
            pipeline.foundry.project,
            vector_store_id=os.getenv("KNOWLEDGE_VECTOR_STORE_ID", "").strip(),
            agent_name=os.getenv("AGENT_TACTICAL_CONTEXT", "").strip(),
        )
    app.state.sync = sync
    app.state.scout = KnowledgeScout(
        KNOWLEDGE_DIR,
        runner=pipeline.foundry,
        agent_name=os.getenv("AGENT_KNOWLEDGE_SCOUT", "").strip(),
        mode=os.getenv("SCOUT_MODE", "review").strip().lower(),
        sync=sync,
    )
    stop = threading.Event()
    hours = _float_env("SCOUT_INTERVAL_HOURS")
    if hours > 0:
        threading.Thread(target=_scout_timer, args=(app.state.scout, hours, stop), daemon=True).start()
    yield
    stop.set()
    pipeline.close()


def _float_env(name: str, default: float = 0.0) -> float:
    try:
        return float(os.getenv(name, str(default)) or default)
    except ValueError:
        return default


def _scout_timer(scout: KnowledgeScout, hours: float, stop: threading.Event) -> None:
    """Optional background research: one KnowledgeScout round every `hours` (off by default)."""
    interval = max(hours, 0.25) * 3600
    while not stop.wait(interval):
        try:
            scout.run()
        except Exception:
            logging.getLogger("eagleeye.scout").exception("Scheduled scout run failed")


app = FastAPI(
    title="EagleEye",
    lifespan=lifespan,
    docs_url=None if PRODUCTION else "/docs",
    redoc_url=None,
    openapi_url=None if PRODUCTION else "/openapi.json",
)


@app.middleware("http")
async def protect(request: Request, call_next):
    # A ceiling on every API call per visitor; stricter limits sit on the costly endpoints.
    if request.url.path.startswith("/api/"):
        limiter = request.app.state.limiter
        if not limiter.allow(client_key(request), "api"):
            response = JSONResponse({"detail": "Slow down a little: too many requests. Try again in a minute."}, 429)
        else:
            response = await call_next(request)
    else:
        response = await call_next(request)
    for name, value in SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    return response


class Score(BaseModel):
    home: int = Field(ge=0, le=20)
    away: int = Field(ge=0, le=20)


class Situation(BaseModel):
    minute: int = Field(ge=0, le=130)
    score: Score


class MomentRequest(BaseModel):
    scenario_id: str = Field(max_length=80)
    frame_index: int
    player_id: int
    situation: Situation | None = None  # overrides the scenario's default match situation


def _analyze_moment(scenario: dict, frame_index: int, player_id: int) -> dict:
    prev = scenario["frames"][frame_index - 1] if frame_index > 0 else None
    return geometry.analyze(scenario["frames"][frame_index], player_id, scenario["attacking_direction"], prev)


def _resolve(request: Request, body: MomentRequest) -> tuple[dict, dict]:
    scenario = request.app.state.scenarios.get(body.scenario_id)
    if scenario is None:
        raise HTTPException(404, f"Unknown scenario '{body.scenario_id}'")
    if not 0 <= body.frame_index < len(scenario["frames"]):
        raise HTTPException(422, "frame_index out of range")
    frame = scenario["frames"][body.frame_index]
    if not any(p["id"] == body.player_id for p in frame["players"]):
        raise HTTPException(422, f"Player {body.player_id} is not in this moment")
    return scenario, frame


def _cache_key(scenario_id: str, frame_index: int, player_id: int, situation: dict) -> tuple:
    return scenario_id, frame_index, player_id, json.dumps(situation, sort_keys=True)


@app.get("/api/config")
def config(request: Request):
    return {**request.app.state.pipeline.describe(), "admin": is_admin(request)}


@app.get("/api/admin/check", dependencies=[Depends(require_admin)])
def admin_check():
    return {"admin": True}


@app.get("/api/scenarios")
def list_scenarios(request: Request):
    return [
        {"id": s["id"], "title": s["title"], "description": s["description"], "frames": len(s["frames"])}
        for s in request.app.state.scenarios.values()
    ]


@app.get("/api/scenarios/{scenario_id}")
def get_scenario(scenario_id: str, request: Request):
    scenario = request.app.state.scenarios.get(scenario_id)
    if scenario is None:
        raise HTTPException(404, f"Unknown scenario '{scenario_id}'")
    return scenario


@app.post("/api/geometry")
def moment_geometry(body: MomentRequest, request: Request):
    scenario, _ = _resolve(request, body)
    return _analyze_moment(scenario, body.frame_index, body.player_id)


@app.post("/api/analyze")
def analyze(body: MomentRequest, request: Request):
    scenario, frame = _resolve(request, body)
    geo = _analyze_moment(scenario, body.frame_index, body.player_id)
    situation = body.situation.model_dump() if body.situation else scenario["match_situation"]
    pipeline = request.app.state.pipeline

    # The same click in the same match situation gets the same answer: reuse it instead of
    # waiting ~10 s for the agents again. Answers hit by a temporary failure are not kept.
    key = _cache_key(body.scenario_id, body.frame_index, body.player_id, situation)
    cache = request.app.state.analysis_cache
    if key in cache:
        cached = cache[key]
        return {**cached, "stages": public_stages(cached["stages"], request), "cached": True}

    request.app.state.limiter.check(request, "analyze")
    # Above the hourly budget of agent calls, answer with the offline text instead of spending more.
    offline = not request.app.state.budget.take(pipeline.agent_calls())

    start = time.perf_counter()
    stages = pipeline.run(scenario, frame, body.player_id, geo, situation, offline=offline)
    result = {
        "mode": pipeline.mode,
        "situation": situation,
        "geometry": geo,
        "stages": stages,
        "total_ms": int((time.perf_counter() - start) * 1000),
        "cached": False,
        "budget_reached": offline and pipeline.mode == "foundry",
    }
    if pipeline.mode == "foundry" and not offline and not any(s["retryable"] for s in stages):
        if len(cache) >= ANALYSIS_CACHE_SIZE:
            cache.pop(next(iter(cache)))  # drop the oldest
        cache[key] = result
    return {**result, "stages": public_stages(stages, request)}


@app.get("/api/knowledge")
def knowledge(request: Request):
    """What the agents know. It changes only through KnowledgeScout research the admin approved."""
    scout = request.app.state.scout.status()
    return {
        "reference_version": scout["reference_version"],
        "researched_notes": len(scout["entries"]),
        "sync_status": scout["sync_status"],
        "changes_only_by": "KnowledgeScout research approved by the admin",
    }


@app.post("/api/knowledge/sync", dependencies=[Depends(require_admin)])
def sync_knowledge(request: Request):
    """Re-upload both knowledge files to File Search (replacing older copies of the same name)."""
    sync = request.app.state.sync
    if sync is None:
        return {"synced": False, "files": {}, "message": "mock mode: no File Search to sync"}
    return {"synced": True, "files": sync.sync_all(KNOWLEDGE_DIR)}


# ---- "Did you understand?" (a review queue for the admin; never changes knowledge) ----

class ClarityRequest(BaseModel):
    where: Literal["analyse", "training"]
    understood: bool
    comment: str = Field("", max_length=MAX_COMMENT_CHARS * 2)
    explanation: str = Field("", max_length=MAX_EXPLANATION_CHARS * 2)  # as shown, if the server has no copy
    scenario_id: str | None = Field(None, max_length=80)
    frame_index: int | None = Field(None, ge=0, le=500)
    player_id: int | None = Field(None, ge=0, le=99)
    situation: Situation | None = None
    trial_id: str | None = Field(None, max_length=120)
    level: LEVEL | None = None


@app.post("/api/clarity")
def clarity(body: ClarityRequest, request: Request):
    request.app.state.limiter.check(request, "clarity", "clarity_day")
    context = {"scenario_id": body.scenario_id, "frame_index": body.frame_index, "player_id": body.player_id,
               "trial_id": body.trial_id, "level": body.level,
               "situation": body.situation.model_dump() if body.situation else None}
    explanation, source = body.explanation, "as shown to the player"
    if body.where == "analyse" and body.scenario_id is not None:
        scenario = request.app.state.scenarios.get(body.scenario_id)
        situation = context["situation"] or (scenario or {}).get("match_situation")
        cached = request.app.state.analysis_cache.get(
            _cache_key(body.scenario_id, body.frame_index or 0, body.player_id or 0, situation or {}))
        if cached:  # prefer the server's own copy of what the agents said
            parts = [s["output"] for s in cached["stages"] if s["key"] in ("coach", "decision")]
            explanation, source = "\n".join(parts), "server copy"
    context["explanation_source"] = source
    entry = request.app.state.clarity.append(body.understood, body.comment, body.where, context, explanation)
    return {"id": entry["id"], "saved": True}


@app.get("/api/clarity", dependencies=[Depends(require_admin)])
def clarity_review(request: Request):
    return request.app.state.clarity.review()


# ---- KnowledgeScout (background research, outside the analysis path; admin only) ----------

class ScoutRunRequest(BaseModel):
    topic: str | None = Field(default=None, max_length=80)
    wait: bool = False


class ScoutReviewRequest(BaseModel):
    note: str = Field(default="", max_length=200)


@app.get("/api/scout")
def scout_status(request: Request):
    return request.app.state.scout.status()


@app.post("/api/scout/run", dependencies=[Depends(require_admin)])
def scout_run(request: Request, body: ScoutRunRequest | None = None):
    """Start one research round. By default it runs in the background; wait=true returns the result."""
    scout = request.app.state.scout
    body = body or ScoutRunRequest()
    if body.wait:
        return {"started": True, "result": scout.run(body.topic), "scout": scout.status()}
    started = scout.run_async(body.topic)
    return {"started": started, "message": None if started else "a scout run is already in progress",
            "scout": scout.status()}


@app.get("/api/scout/proposals")
def scout_proposals(request: Request, status: Literal["pending", "approved", "rejected", "stale"] | None = None):
    return {"proposals": request.app.state.scout.list_proposals(status)}


@app.get("/api/scout/proposals/{proposal_id}")
def scout_proposal(proposal_id: str, request: Request):
    proposal = request.app.state.scout.get_proposal(proposal_id)
    if proposal is None:
        raise HTTPException(404, "Unknown proposal")
    return proposal


@app.post("/api/scout/approve/{proposal_id}", dependencies=[Depends(require_admin)])
def scout_approve(proposal_id: str, request: Request):
    scout = request.app.state.scout
    try:
        result = scout.approve(proposal_id)
    except KeyError:
        raise HTTPException(404, "Unknown proposal")
    return {"result": result, "scout": scout.status()}


@app.post("/api/scout/reject/{proposal_id}", dependencies=[Depends(require_admin)])
def scout_reject(proposal_id: str, request: Request, body: ScoutReviewRequest | None = None):
    scout = request.app.state.scout
    try:
        result = scout.reject(proposal_id, note=(body.note if body else ""))
    except KeyError:
        raise HTTPException(404, "Unknown proposal")
    return {"result": result, "scout": scout.status()}


# ---- Player's Eye training ---------------------------------------------------

@app.get("/api/training/trials")
def training_trials(request: Request):
    return {
        "levels": training.LEVELS,
        "fov_deg": training.FOV_DEG,
        "vision": {"identify_deg": training.IDENTIFY_DEG, "colour_deg": training.COLOUR_DEG,
                   "presence_deg": training.PRESENCE_DEG},
        "seen_half_angle_deg": training.SEEN_HALF_ANGLE_DEG,
        "trials": list(request.app.state.trials.values()),
    }


class Choice(BaseModel):
    action: Literal["pass", "dribble", "shoot"]
    target_player_id: int | None = None   # pass receiver, or the teammate a dribble heads towards
    target_x: float | None = Field(default=None, ge=0, le=100)  # dribble destination, scenario units
    target_y: float | None = Field(default=None, ge=0, le=100)


class TrainingSubmission(BaseModel):
    trial_id: str = Field(max_length=120)
    level: LEVEL = "rookie"
    scans: int = Field(ge=0, le=50)
    seen_ids: list[int] = Field(default_factory=list, max_length=30)     # identified (number + team)
    noticed_ids: list[int] = Field(default_factory=list, max_length=30)  # only in peripheral vision
    opened_body: bool = False                                            # received on the half-turn
    choice: Choice
    decision_ms: int | None = Field(default=None, ge=0)


@app.post("/api/training/evaluate")
def training_evaluate(body: TrainingSubmission, request: Request):
    trial = request.app.state.trials.get(body.trial_id)
    if trial is None:
        raise HTTPException(404, f"Unknown trial '{body.trial_id}'")
    request.app.state.limiter.check(request, "evaluate")
    scenario = request.app.state.scenarios[trial["scenario_id"]]
    answer = training.answer_key(scenario, trial)
    result = training.grade(
        answer, body.level, body.scans, body.seen_ids, body.choice.model_dump(),
        noticed_ids=body.noticed_ids, window_s=trial["window_s"], decision_ms=body.decision_ms,
        opened_body=body.opened_body,
    )
    scans_met = body.scans >= result["target_scans"]
    missed_free_teammate = any(m["open"] for m in result["missed"])
    tip = "more" if not scans_met else "further" if missed_free_teammate else "great"
    pipeline = request.app.state.pipeline
    offline = not request.app.state.budget.take(pipeline.agent_calls(coach_only=True))
    debrief = pipeline.debrief(result["facts"], body.level, tip, offline=offline)
    return {
        "trial": trial,
        "result": result,
        "best": answer["best"],
        "key_players": answer["key_players"],
        "facing_deg": answer["facing_deg"],
        "geometry": answer["geometry"],
        "debrief": public_stages([debrief], request)[0],
    }


class MissedItem(BaseModel):
    side: Literal["front", "behind", "left", "right"]
    angle: float = Field(ge=0, le=180)
    open: bool


class HistoryItem(BaseModel):
    trial_id: str = Field(max_length=120)
    level: LEVEL
    score: int = Field(ge=0, le=100)
    verdict: Literal["best", "good", "ok", "risky"]
    scans: int = Field(ge=0, le=50)
    target_scans: int = Field(ge=1, le=20)
    timed: bool = False
    too_slow: bool = False
    opened_body: bool = False
    missed: list[MissedItem] = Field(default_factory=list, max_length=12)


class NextRequest(BaseModel):
    level: LEVEL = "rookie"
    history: list[HistoryItem] = Field(default_factory=list, max_length=30)
    last_trial_id: str | None = Field(None, max_length=120)


@app.post("/api/training/next")
def training_next(body: NextRequest, request: Request):
    """Weak spots and the next drill, from the player's own recent drills (stored in their browser only)."""
    request.app.state.limiter.check(request, "next")
    history = [h.model_dump() for h in body.history]
    return training.recommend(history, body.level, request.app.state.trial_meta, body.last_trial_id)


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
