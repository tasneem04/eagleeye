"""Runs the agent chain for one selected player at one moment.

    step 1 (parallel):  FieldMapper  +  TacticalContextAgent
    step 2:             DecisionAgent (uses FieldMapper text and the tactical mode)

Each stage reads its Foundry agent name from the environment and is enabled
only when that name is set and the stages it depends on are enabled, so agents
can be added one at a time. Every stage has an offline fallback so the chain
never breaks mid-way.
"""

from __future__ import annotations

import logging
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass

from azure.core.exceptions import ClientAuthenticationError, HttpResponseError

from . import decision, messages, mock, tactical

log = logging.getLogger("eagleeye.pipeline")


@dataclass
class Stage:
    key: str
    env_var: str
    title: str
    step: int
    requires: tuple[str, ...] = ()
    agent_name: str = ""


@dataclass
class StageResult:
    key: str
    agent: str
    title: str
    status: str          # "ok" or "fallback"
    source: str          # "foundry" or "mock"
    output: str
    latency_ms: int
    error: str | None = None
    error_detail: str | None = None
    data: dict | None = None  # structured result, for stages that return JSON
    retryable: bool = False   # True if the failure may go away on its own (network, sign-in, throttling)


STAGES = [
    Stage("field_mapper", "AGENT_FIELD_MAPPER", "What the field looks like", step=1),
    Stage("tactical_context", "AGENT_TACTICAL_CONTEXT", "Phase, risk and mode", step=1),
    Stage("decision", "AGENT_DECISION", "Best decision", step=2, requires=("field_mapper",)),
    Stage("coach", "AGENT_COACH", "Coach says", step=3, requires=("decision",)),
]
AUDIENCE = "young player"
LANGUAGE = "English"


class Pipeline:
    def __init__(self, mode: str, foundry, stages: list[Stage]):
        self.mode = mode
        self.foundry = foundry
        self.stages = stages

    @classmethod
    def from_env(cls) -> "Pipeline":
        stages = []
        for stage in STAGES:
            name = os.getenv(stage.env_var, "").strip()
            enabled = {s.key for s in stages}
            if name and all(dep in enabled for dep in stage.requires):
                stages.append(Stage(stage.key, stage.env_var, stage.title, stage.step, stage.requires, name))

        endpoint = os.getenv("FOUNDRY_PROJECT_ENDPOINT", "").strip()
        wants_foundry = os.getenv("EAGLEEYE_MODE", "foundry").strip().lower() == "foundry"
        foundry = None
        if wants_foundry and endpoint:
            from .foundry import FoundryAgents  # imported lazily so mock mode needs no Azure setup
            foundry = FoundryAgents(endpoint)
        return cls("foundry" if foundry else "mock", foundry, stages)

    def describe(self) -> dict:
        return {
            "mode": self.mode,
            "stages": [{"key": s.key, "agent": s.agent_name, "title": s.title, "step": s.step} for s in self.stages],
        }

    def run(self, scenario: dict, frame: dict, player_id: int, geometry: dict, situation: dict,
            offline: bool = False) -> list[dict]:
        """`offline=True` answers every stage with the offline text (used when the call budget is spent)."""
        enabled = {s.key: s for s in self.stages}

        def field_mapper():
            text = messages.field_mapper_input(scenario, frame, player_id)
            return self._run_stage(enabled["field_mapper"], text, lambda: mock.field_mapper(scenario, frame, geometry),
                                   offline)

        def tactical_context():
            text = messages.tactical_input(scenario, geometry, situation)
            result = self._run_stage(enabled["tactical_context"], text,
                                     lambda: mock.tactical_context(geometry, situation), offline)
            result.data = tactical.parse(result.output, geometry, situation)
            return result

        # Step 1: reading the scene and reading the game are independent, so run them together.
        step_one = {k: fn for k, fn in (("field_mapper", field_mapper), ("tactical_context", tactical_context)) if k in enabled}
        with ThreadPoolExecutor(max_workers=max(1, len(step_one))) as pool:
            futures = {k: pool.submit(fn) for k, fn in step_one.items()}
            results = {k: f.result() for k, f in futures.items()}

        # Step 2: decide, following the tactical mode when there is one.
        if "decision" in enabled:
            context = results["tactical_context"].data if "tactical_context" in results else None
            mode = context["mode"] if context else None
            text = messages.decision_input(results["field_mapper"].output, geometry, context)
            result = self._run_stage(enabled["decision"], text, lambda: mock.decision(geometry, mode), offline)
            result.data = decision.parse(result.output, geometry, mode)
            results["decision"] = result

        # Step 3: explain it to the player.
        if "coach" in enabled:
            chosen = results["decision"].data
            context = results["tactical_context"].data if "tactical_context" in results else None
            text = messages.coach_input(chosen, context, geometry, AUDIENCE, LANGUAGE)
            results["coach"] = self._run_stage(enabled["coach"], text, lambda: mock.coach(chosen, geometry), offline)

        return [asdict(results[s.key]) for s in self.stages if s.key in results]

    def agent_calls(self, coach_only: bool = False) -> int:
        """How many Foundry calls a click (or a training debrief) would make right now."""
        if self.foundry is None:
            return 0
        if coach_only:
            return int(any(s.key == "coach" for s in self.stages))
        return len(self.stages)

    def debrief(self, facts: list[str], level: str, tip: str, offline: bool = False) -> dict:
        """CoachAgent's feedback after a training drill (offline template if it isn't set up).

        `tip` is "great", "further" (scanned enough but missed a free teammate) or "more".
        """
        stage = next((s for s in self.stages if s.key == "coach"), None)
        fallback = lambda: mock.coach_debrief(facts, tip)  # noqa: E731
        if stage is None:
            start = time.perf_counter()
            return asdict(StageResult("coach", "CoachAgent", "Coach debrief", "ok", "mock", fallback(), _ms(start)))
        text = messages.coach_debrief_input(facts, level, AUDIENCE, LANGUAGE, tip)
        result = self._run_stage(stage, text, fallback, offline)
        if result.source == "foundry" and tip != "great":
            # Only code decides whether the scanning was great; the model likes the word too much.
            result.output = re.sub(r"\bgreat\b", "good", re.sub(r"\bGreat\b", "Good", result.output))
        return asdict(result)

    def _run_stage(self, stage: Stage, text: str, fallback, offline: bool = False) -> StageResult:
        start = time.perf_counter()
        if self.foundry is None or offline:
            return StageResult(stage.key, stage.agent_name, stage.title, "ok", "mock", fallback(), _ms(start))
        try:
            output = self.foundry.run_agent(stage.agent_name, text)
            return StageResult(stage.key, stage.agent_name, stage.title, "ok", "foundry", output, _ms(start))
        except Exception as exc:
            log.exception("Foundry agent %s failed", stage.agent_name)
            return StageResult(
                stage.key, stage.agent_name, stage.title, "fallback", "mock", fallback(), _ms(start),
                error=_friendly_error(exc, stage.agent_name),
                error_detail=f"{type(exc).__name__}: {exc}",
                retryable=getattr(exc, "status_code", None) != 404,  # a missing agent stays missing
            )

    def close(self) -> None:
        if self.foundry is not None:
            self.foundry.close()


def _friendly_error(exc: Exception, agent_name: str) -> str:
    if isinstance(exc, ClientAuthenticationError):
        return "Not signed in to Azure. Install the Azure CLI, run `az login`, then restart the server."
    status = getattr(exc, "status_code", None)
    if isinstance(exc, HttpResponseError) or status is not None:
        if status in (401, 403):
            return "Signed in, but this account has no access to the Foundry project (it needs the Azure AI User role)."
        if status == 404:
            return f"Agent '{agent_name}' was not found. Check the name in .env matches the Foundry portal exactly."
    first_line = str(exc).strip().splitlines()[0] if str(exc).strip() else type(exc).__name__
    return first_line[:200]


def _ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)
