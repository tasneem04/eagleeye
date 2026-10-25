"""KnowledgeScout: background research that keeps the agents' football knowledge growing.

KnowledgeScout runs OUTSIDE the per-click analysis path (on demand, from a script
or on an optional timer). Each run:

1. Picks ONE topic: the topic the admin asked for, otherwise the next gap in a
   rotating topic list. Viewer actions never choose or change knowledge.
2. Asks the `KnowledgeScout` Foundry agent (which has the Foundry Web Search tool)
   to research it and reply with structured JSON written in its own words. In mock
   mode, or if the agent fails, an offline sample written by the team is used.
3. Validates every item in code (the web is untrusted input):
   - no links or domain names, no markup or instruction-like text;
   - no real players, coaches, clubs, leagues or competitions (denylist + name heuristic);
   - no long quotations; length limits; rules of thumb must contain a number;
   - near-duplicates of existing knowledge are dropped.
4. Review mode (default, SCOUT_MODE=review): saves a proposal in
   knowledge/proposals/ for a human to approve or reject.
   Auto mode (SCOUT_MODE=auto): applies the validated proposal immediately.
5. Applying writes ONLY the block between the scout markers in
   knowledge/football_reference.md, saves a numbered snapshot, adds a CHANGELOG
   entry (with source domains, which never go into the knowledge file) and
   re-uploads the file to the agents' File Search store.

coaching_principles.md is never touched by the scout.
"""

from __future__ import annotations

import json
import logging
import re
import shutil
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

from ..agents.replies import extract_json
from .guards import SUSPICIOUS
from .scout_samples import SAMPLES

log = logging.getLogger("eagleeye.scout")

SCOUT_START = "<!-- scout:start -->"
SCOUT_END = "<!-- scout:end -->"
EMPTY_BLOCK = "_No researched notes yet._"
SECTION_HEADING = "## I. Researched notes (KnowledgeScout)"
SECTION_INTRO = (
    "Added by the KnowledgeScout agent after code checks (and, in review mode, human approval). "
    "Written in our own words; no real players, clubs or competitions. "
    "If anything here disagrees with sections A-H or with coaching_principles.md, those win."
)

MODES = ("review", "auto")
MAX_INSIGHTS = 6
MAX_RULES = 5
MIN_INSIGHTS = 2
MAX_ENTRIES = 12
MAX_SOURCES = 5
INSIGHT_CHARS = (20, 300)
RULE_CHARS = (20, 200)
SITUATION_CHARS = (15, 400)
SUMMARY_CHARS = (0, 300)
MAX_QUOTE_WORDS = 12
DUPLICATE_OVERLAP = 0.6
RECENT_TOPIC_DAYS = 3
SITUATION_FIELDS = ("situation", "scan", "best_decision", "why", "common_mistake")
SITUATION_LABELS = {
    "situation": "Situation", "scan": "Scan", "best_decision": "Best decision",
    "why": "Why", "common_mistake": "Common mistake",
}

# Gaps in the current knowledge files, researched in rotation.
TOPICS = [
    "attacking set pieces (corners and free kicks)",
    "defending set pieces and throw-ins",
    "1v1 defending and jockeying",
    "on-pitch communication",
    "receiving with both feet",
    "small-sided games and rondos",
    "pressing triggers and the counter-press",
    "goalkeeper distribution and starting attacks",
    "crossing versus cut-backs in the final third",
    "rest defence and protecting against counter-attacks",
    "decision speed and first touch under pressure",
    "coaching feedback for young players",
]

# Real names must never enter the knowledge files (hackathon rules). The heuristic
# below catches most other names; this list covers the most likely ones.
DENYLIST = [
    # leagues, competitions, governing bodies
    "premier league", "la liga", "laliga", "bundesliga", "serie a", "ligue 1", "eredivisie", "champions league",
    "europa league", "conference league", "world cup", "copa america", "copa del rey", "fa cup", "carabao",
    "fifa", "uefa", "mls", "saudi pro league", "roshn", "afc", "caf", "concacaf", "conmebol", "olympic",
    "euro 20", "nations league", "efl", "championship side",
    # clubs
    "arsenal", "chelsea", "liverpool", "manchester", "man city", "man utd", "tottenham", "spurs", "everton",
    "newcastle", "aston villa", "west ham", "brighton", "wolves", "crystal palace", "fulham", "brentford",
    "nottingham", "bournemouth", "leicester", "leeds", "southampton", "barcelona", "barca", "real madrid",
    "atletico", "sevilla", "valencia", "bayern", "dortmund", "leverkusen", "juventus", "inter milan",
    "ac milan", "napoli", "roma", "lazio", "psg", "paris saint", "marseille", "ajax", "psv", "feyenoord",
    "benfica", "porto", "sporting cp", "sporting lisbon", "celtic", "rangers", "galatasaray", "fenerbahce", "al hilal", "al nassr",
    "al ittihad", "al ahli", "boca", "river plate", "flamengo", "santos",
    # players and coaches
    "messi", "ronaldo", "neymar", "mbappe", "mbappé", "haaland", "salah", "de bruyne", "modric", "modrić",
    "kroos", "xavi", "iniesta", "busquets", "pirlo", "zidane", "pele", "pelé", "maradona", "cruyff", "cruijff",
    "beckham", "rodri", "bellingham", "saka", "kane", "lewandowski", "benzema", "griezmann", "pedri", "gavi",
    "guardiola", "klopp", "mourinho", "ancelotti", "arteta", "ferguson", "wenger", "conte", "tuchel",
    "bielsa", "sacchi", "michels", "simeone", "postecoglou", "zeman", "nagelsmann", "ten hag",
    "pochettino", "löw", "deschamps", "southgate", "rangnick", "sarri", "de zerbi",
    # fiction (copyrighted characters/series)
    "ao ashi", "aoashi", "blue lock", "captain tsubasa", "tsubasa", "inazuma", "ashito", "fukuda", "isagi",
]
DENY_RE = re.compile(r"(?<![a-z])(" + "|".join(re.escape(d.strip()) for d in DENYLIST) + r")(?![a-z])", re.IGNORECASE)
LINK_RE = re.compile(r"(https?://|www\.|\b[\w-]+\.(com|org|net|io|co|uk|edu|gov|info|tv|de|es|fr|it|sa)\b)", re.IGNORECASE)
CITATION_RE = re.compile(r"(et al\.?|\(\s*(19|20)\d\d\s*\)|according to|study by|research by)", re.IGNORECASE)
QUOTE_RE = re.compile(r"[\"“”«»](.+?)[\"“”«»]")
MARKUP_RE = re.compile(r"(<!--|-->|^\s*#+\s|\[[^\]]*\]\(|\|)")
CAPS_WORD = re.compile(r"^[A-Z][a-zà-ÿ'’-]+$")
# Capitalised words that are fine in the middle of a sentence.
CAPS_OK = {"Blue", "Red", "EagleEye", "I", "Scan", "Situation", "Why", "Best", "Common", "VAR", "xG"}
STOPWORDS = set("""a an the and or but if then so to of in on at by for with from into onto is are was be been
being it its this that these those as he him his she her they them their we our you your i not no do does
can will would should could may might must than when while where which who what there here up down out
over under again more most very just also only about""".split())


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _words(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9#]+", text.lower()) if w not in STOPWORDS and len(w) > 1}


def overlap(a: str, b: str) -> float:
    wa, wb = _words(a), _words(b)
    return len(wa & wb) / len(wa | wb) if wa and wb else 0.0


def knowledge_units(*texts: str) -> list[str]:
    """Sentences/bullets of existing knowledge, used for de-duplication."""
    units = []
    for text in texts:
        for line in text.splitlines():
            line = re.sub(r"[*_`>|-]+", " ", line).strip()
            for part in re.split(r"(?<=[.!?])\s+", line):
                if len(_words(part)) >= 5:
                    units.append(part)
    return units


# ---- validation -------------------------------------------------------------

def check_text(text, limits: tuple[int, int], need_number: bool = False) -> str | None:
    """Why a piece of researched text is not allowed into the knowledge, or None if it is fine."""
    if not isinstance(text, str):
        return "not text"
    text = " ".join(text.split())
    if not limits[0] <= len(text) <= limits[1]:
        return f"length {len(text)} outside {limits[0]}-{limits[1]} characters"
    if LINK_RE.search(text):
        return "contains a link or domain name"
    if SUSPICIOUS.search(text) or MARKUP_RE.search(text):
        return "contains markup or instruction-like text"
    match = DENY_RE.search(text)
    if match:
        return f"mentions a real name or competition ('{match.group(0).strip()}')"
    if CITATION_RE.search(text):
        return "reads like a citation or quote of a real person"
    for quoted in QUOTE_RE.findall(text):
        if len(quoted.split()) > MAX_QUOTE_WORDS:
            return "contains a long quotation"
    name = _looks_like_name(text)
    if name:
        return f"looks like a real name ('{name}')"
    if need_number and not re.search(r"\d", text):
        return "rule of thumb has no number"
    return None


def _looks_like_name(text: str) -> str | None:
    """Two or more capitalised words in a row that do not start a sentence."""
    for sentence in re.split(r"(?<=[.!?:;])\s+", text):
        tokens = [t.strip(",()'’\"“”") for t in sentence.split()]
        run: list[str] = []
        for i, token in enumerate(tokens):
            if i > 0 and CAPS_WORD.match(token) and token not in CAPS_OK:
                run.append(token)
                if len(run) >= 2:
                    return " ".join(run)
            else:
                run = []
    return None


def _clean(text: str) -> str:
    return " ".join(str(text).split())


def validate(raw: dict, existing: list[str]) -> tuple[dict | None, list[dict]]:
    """Filter one researched topic. Returns (clean entry or None, rejected items with reasons)."""
    rejected: list[dict] = []
    if not isinstance(raw, dict):
        return None, [{"item": "reply", "reason": "reply was not a JSON object"}]
    seen = list(existing)

    def keep(kind: str, text, limits, need_number=False) -> str | None:
        reason = check_text(text, limits, need_number)
        if reason is None:
            clean = _clean(text)
            if any(overlap(clean, other) >= DUPLICATE_OVERLAP for other in seen):
                reason = "near-duplicate of existing knowledge"
            else:
                seen.append(clean)
                return clean
        rejected.append({"item": kind, "text": _clean(text)[:160] if isinstance(text, str) else "", "reason": reason})
        return None

    topic = _clean(raw.get("topic", ""))[:80]
    if check_text(topic, (3, 80)) is not None:
        return None, [{"item": "topic", "text": topic, "reason": check_text(topic, (3, 80))}]

    insights = [t for t in (keep("insight", x, INSIGHT_CHARS) for x in _list(raw.get("insights"))[:MAX_INSIGHTS]) if t]
    rules = [t for t in (keep("rule of thumb", x, RULE_CHARS, True) for x in _list(raw.get("rules_of_thumb"))[:MAX_RULES]) if t]

    situation = None
    sit = raw.get("situation")
    if isinstance(sit, dict):
        fields = {}
        for key in SITUATION_FIELDS:
            reason = check_text(sit.get(key), SITUATION_CHARS)
            if reason:
                rejected.append({"item": f"situation.{key}", "text": _clean(sit.get(key, ""))[:160], "reason": reason})
                break
            fields[key] = _clean(sit[key])
        else:
            situation = fields
    elif sit:
        rejected.append({"item": "situation", "text": "", "reason": "situation was not an object"})

    summary = _clean(raw.get("summary", ""))
    if summary and check_text(summary, SUMMARY_CHARS):
        rejected.append({"item": "summary", "text": summary[:160], "reason": check_text(summary, SUMMARY_CHARS)})
        summary = ""

    if len(insights) < MIN_INSIGHTS:
        rejected.append({"item": "proposal", "text": topic, "reason": f"fewer than {MIN_INSIGHTS} new, valid insights"})
        return None, rejected
    entry = {"topic": topic, "summary": summary, "insights": insights, "rules_of_thumb": rules, "situation": situation}
    return entry, rejected


def clean_sources(sources) -> list[str]:
    """Host names only (for the changelog/proposal, never for the knowledge file)."""
    hosts = []
    for s in _list(sources):
        if not isinstance(s, str):
            continue
        host = re.sub(r"^[a-z]+://", "", s.strip().lower()).split("/")[0].split("?")[0]
        host = host.removeprefix("www.")
        if re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", host) and host not in hosts:
            hosts.append(host)
    return hosts[:MAX_SOURCES]


def _list(value) -> list:
    return value if isinstance(value, list) else []


# ---- topic choice -----------------------------------------------------------

def pick_topic(state: dict, pending: set[str]) -> tuple[str, str]:
    """The next gap topic in the rotation, skipping topics researched recently or waiting for review."""
    recent_cut = _now() - timedelta(days=RECENT_TOPIC_DAYS)
    recent = {h["topic"] for h in state.get("history", []) if datetime.fromisoformat(h["at"]) >= recent_cut}
    n = len(TOPICS)
    for step in range(n):
        index = (state.get("next_topic", 0) + step) % n
        if TOPICS[index] not in pending and TOPICS[index] not in recent:
            state["next_topic"] = (index + 1) % n
            return TOPICS[index], "next gap in the topic rotation"
    state["next_topic"] = (state.get("next_topic", 0) + 1) % n
    return TOPICS[state["next_topic"] - 1], "next gap in the topic rotation"


# ---- the agent --------------------------------------------------------------

def scout_input(topic: str, reason: str, existing_topics: list[str]) -> str:
    return "\n".join([
        f"Topic to research: {topic}",
        f"Why this topic: {reason}",
        "Already covered by scout notes: " + ("; ".join(existing_topics) if existing_topics else "nothing yet"),
        "Audience: young players (about 10-16) and their coaches. EagleEye refers to players by team colour and shirt "
        "number only (Blue #8, Red #4).",
        "Use web search, then write the JSON described in your instructions.",
    ])


def offline_sample(topic: str, used: list[str] | tuple = ()) -> dict:
    """The team-written sample for this topic, or the first sample not used yet."""
    if topic not in SAMPLES:
        topic = next((t for t in SAMPLES if t not in used), next(iter(SAMPLES)))
    return {"topic": topic, **json.loads(json.dumps(SAMPLES[topic]))}


# ---- the scout --------------------------------------------------------------

class KnowledgeScout:
    def __init__(self, knowledge_dir: Path, runner=None, agent_name: str = "",
                 mode: str = "review", sync=None):
        self.knowledge_dir = Path(knowledge_dir)
        self.doc_path = self.knowledge_dir / "football_reference.md"
        self.principles_path = self.knowledge_dir / "coaching_principles.md"
        self.proposals_dir = self.knowledge_dir / "proposals"
        self.versions_dir = self.knowledge_dir / "versions"
        self.changelog_path = self.knowledge_dir / "CHANGELOG.md"
        self.state_path = self.knowledge_dir / "scout_state.json"
        self.runner = runner
        self.agent_name = agent_name
        self.mode = mode if mode in MODES else "review"
        self.sync = sync
        self._lock = threading.RLock()
        self._running = False

    # ---- state ----------------------------------------------------------------

    def _load(self) -> dict:
        if self.state_path.exists():
            return json.loads(self.state_path.read_text(encoding="utf-8"))
        return {"version": 1, "entries": [], "history": [], "next_topic": 0, "next_proposal": 1,
                "last_run": None, "last_result": None, "sync_status": None, "synced_version": None}

    def _save(self, state: dict) -> None:
        self.state_path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    def status(self) -> dict:
        state = self._load()
        proposals = self.list_proposals()
        return {
            "mode": self.mode,
            "source": "agent" if (self.runner is not None and self.agent_name) else "offline samples",
            "agent": self.agent_name or None,
            "reference_version": state["version"],
            "entries": [e["topic"] for e in state["entries"]],
            "pending": sum(1 for p in proposals if p["status"] == "pending"),
            "last_run": state["last_run"],
            "last_result": state["last_result"],
            "running": self._running,
            "sync_status": state["sync_status"],
            "synced_version": state["synced_version"],
        }

    # ---- running ----------------------------------------------------------------

    def run_async(self, topic: str | None = None) -> bool:
        if self._running:
            return False
        self._running = True
        threading.Thread(target=self._run_background, args=(topic,), daemon=True).start()
        return True

    def _run_background(self, topic: str | None) -> None:
        try:
            self.run(topic, _flag=False)
        except Exception:
            log.exception("KnowledgeScout run failed")
        finally:
            self._running = False

    def run(self, topic: str | None = None, _flag: bool = True) -> dict:
        """One research round. Returns a summary of what happened."""
        if _flag:
            self._running = True
        try:
            with self._lock:
                state = self._load()
                pending = {p["topic"] for p in self.list_proposals() if p["status"] == "pending"}
                if topic:
                    topic, reason = _clean(topic)[:80], "requested"
                else:
                    topic, reason = pick_topic(state, pending)
                self._save(state)
                existing_topics = [e["topic"] for e in state["entries"]]

            raw, source = self._research(topic, reason, existing_topics)
            if source == "offline sample":
                topic = raw["topic"]

            with self._lock:
                state = self._load()
                sources = clean_sources(raw.get("sources")) if isinstance(raw, dict) else []
                entry, rejected = validate(raw, knowledge_units(*self._knowledge_texts()))
                proposal = self._new_proposal(state, topic, reason, source, entry, rejected, sources)
                state["history"].append({"at": proposal["created"], "topic": topic, "proposal": proposal["id"]})
                state["history"] = state["history"][-50:]
                state["last_run"] = proposal["created"]
                self._save(state)
                result = {"proposal": proposal["id"], "topic": topic, "reason": reason, "source": source,
                          "status": proposal["status"], "accepted_insights": len(entry["insights"]) if entry else 0,
                          "rejected_items": len(rejected)}
                if entry and self.mode == "auto":
                    applied = self._apply(proposal["id"], reviewer="auto")
                    result["status"], result["version"] = applied["status"], applied.get("version")
                state = self._load()
                state["last_result"] = result
                self._save(state)
            return result
        finally:
            if _flag:
                self._running = False

    def _research(self, topic: str, reason: str, existing_topics: list[str]) -> tuple[dict, str]:
        if self.runner is not None and self.agent_name:
            try:
                reply = self.runner.run_agent(self.agent_name, scout_input(topic, reason, existing_topics))
                data = extract_json(reply)
                if data is not None:
                    data.setdefault("topic", topic)
                    return data, "agent"
                log.warning("KnowledgeScout reply was not JSON; using offline sample")
            except Exception:
                log.exception("KnowledgeScout agent call failed; using offline sample")
        return offline_sample(topic, existing_topics), "offline sample"

    def _knowledge_texts(self) -> list[str]:
        return [p.read_text(encoding="utf-8") for p in (self.doc_path, self.principles_path) if p.exists()]

    # ---- proposals --------------------------------------------------------------

    def _new_proposal(self, state, topic, reason, source, entry, rejected, sources) -> dict:
        pid = f"P{state['next_proposal']}"
        state["next_proposal"] += 1
        proposal = {
            "id": pid, "created": _now().isoformat(timespec="seconds"), "topic": topic, "reason": reason,
            "source": source, "sources": sources, "status": "pending" if entry else "rejected",
            "entry": entry, "rejected_items": rejected, "reviewed_by": None if entry else "validation",
            "reviewed_at": None, "version": None, "note": "" if entry else "nothing passed validation",
        }
        self._write_proposal(proposal)
        return proposal

    def _write_proposal(self, proposal: dict) -> None:
        self.proposals_dir.mkdir(parents=True, exist_ok=True)
        (self.proposals_dir / f"{proposal['id']}.json").write_text(json.dumps(proposal, indent=2), encoding="utf-8")
        (self.proposals_dir / f"{proposal['id']}.md").write_text(render_proposal(proposal), encoding="utf-8")

    def get_proposal(self, pid: str) -> dict | None:
        if not re.fullmatch(r"P\d{1,6}", pid or ""):
            return None
        path = self.proposals_dir / f"{pid}.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None

    def list_proposals(self, status: str | None = None) -> list[dict]:
        if not self.proposals_dir.exists():
            return []
        items = [json.loads(p.read_text(encoding="utf-8")) for p in self.proposals_dir.glob("P*.json")]
        items.sort(key=lambda p: -int(p["id"][1:]))
        return [p for p in items if status is None or p["status"] == status]

    def approve(self, pid: str, reviewer: str = "reviewer") -> dict:
        with self._lock:
            return self._apply(pid, reviewer)

    def reject(self, pid: str, note: str = "", reviewer: str = "reviewer") -> dict:
        with self._lock:
            proposal = self.get_proposal(pid)
            if proposal is None:
                raise KeyError(pid)
            if proposal["status"] != "pending":
                return {"id": pid, "status": proposal["status"], "message": "proposal is not pending"}
            proposal.update(status="rejected", reviewed_by=reviewer, reviewed_at=_now().isoformat(timespec="seconds"),
                            note=_clean(note)[:200])
            self._write_proposal(proposal)
            return {"id": pid, "status": "rejected"}

    def _apply(self, pid: str, reviewer: str) -> dict:
        proposal = self.get_proposal(pid)
        if proposal is None:
            raise KeyError(pid)
        if proposal["status"] != "pending":
            return {"id": pid, "status": proposal["status"], "message": "proposal is not pending"}
        now = _now().isoformat(timespec="seconds")

        # Re-check against the knowledge as it is NOW (it may have changed since the proposal).
        state = self._load()
        others = [e for e in state["entries"]]
        existing = knowledge_units(self.principles_path.read_text(encoding="utf-8") if self.principles_path.exists() else "",
                                   _strip_block(self.doc_path.read_text(encoding="utf-8")),
                                   *(render_entry(e) for e in others))
        entry, rejected = validate(proposal["entry"], existing)
        if entry is None:
            proposal.update(status="stale", reviewed_by=reviewer, reviewed_at=now,
                            note="no longer adds enough new knowledge", rejected_items=proposal["rejected_items"] + rejected)
            self._write_proposal(proposal)
            return {"id": pid, "status": "stale"}

        state["version"] += 1
        version = state["version"]
        entry.update(id=pid, version=version, added=now[:10])
        state["entries"].append(entry)
        dropped = []
        while len(state["entries"]) > MAX_ENTRIES:
            dropped.append(state["entries"].pop(0)["topic"])
        self._write_doc(state["entries"])
        self._snapshot(version)
        self._log_changelog(version, proposal, entry, reviewer, rejected, dropped)
        proposal.update(status="approved", reviewed_by=reviewer, reviewed_at=now, version=version, entry=entry,
                        rejected_items=proposal["rejected_items"] + rejected)
        self._write_proposal(proposal)
        self._save(state)

        result = {"id": pid, "status": "approved", "version": version}
        if self.sync is not None:
            result["sync_status"] = self._sync(version)
        return result

    def _sync(self, version: int) -> str:
        try:
            status, synced = self.sync.sync(self.doc_path), version
        except Exception as exc:
            log.exception("Reference sync failed")
            status, synced = f"sync failed: {type(exc).__name__}", None
        state = self._load()
        state["sync_status"] = status
        if synced is not None:
            state["synced_version"] = synced
        self._save(state)
        return status

    # ---- files --------------------------------------------------------------------

    def _write_doc(self, entries: list[dict]) -> None:
        doc = ensure_block(self.doc_path.read_text(encoding="utf-8"))
        start, end = doc.index(SCOUT_START) + len(SCOUT_START), doc.index(SCOUT_END)
        self.doc_path.write_text(doc[:start] + "\n" + render_block(entries) + "\n" + doc[end:], encoding="utf-8")

    def _snapshot(self, version: int) -> None:
        self.versions_dir.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(self.doc_path, self.versions_dir / f"football_reference.v{version}.md")

    def _log_changelog(self, version, proposal, entry, reviewer, rejected, dropped) -> None:
        lines = [f"\n## Reference v{version} ({_now():%Y-%m-%d %H:%M} UTC, KnowledgeScout {proposal['id']}, "
                 f"source: {proposal['source']}, approved by: {reviewer})",
                 f"- added to football_reference.md: {entry['topic']} ({len(entry['insights'])} insights, "
                 f"{len(entry['rules_of_thumb'])} rules of thumb{', 1 worked situation' if entry['situation'] else ''})",
                 "- web sources consulted (domains only, not copied): " + (", ".join(proposal["sources"]) or "none")]
        filtered = len(proposal["rejected_items"]) + len(rejected)
        if filtered:
            lines.append(f"- {filtered} researched items filtered out by the code checks (see proposals/{proposal['id']}.md)")
        for topic in dropped:
            lines.append(f"- removed oldest scout note to stay within {MAX_ENTRIES}: {topic}")
        if not self.changelog_path.exists():
            self.changelog_path.write_text("# Coaching knowledge changelog\n", encoding="utf-8")
        with self.changelog_path.open("a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")


# ---- rendering ------------------------------------------------------------------

def ensure_block(doc: str) -> str:
    if SCOUT_START in doc and SCOUT_END in doc:
        return doc
    return (doc.rstrip() + f"\n\n---\n\n{SECTION_HEADING}\n\n{SECTION_INTRO}\n\n"
            f"{SCOUT_START}\n{EMPTY_BLOCK}\n{SCOUT_END}\n")


def _strip_block(doc: str) -> str:
    if SCOUT_START in doc and SCOUT_END in doc:
        return doc[:doc.index(SCOUT_START)] + doc[doc.index(SCOUT_END) + len(SCOUT_END):]
    return doc


def render_entry(entry: dict, number: int | None = None) -> str:
    title = entry["topic"][:1].upper() + entry["topic"][1:]
    lines = [f"### I.{number} {title}" if number else f"### {title}"]
    if entry.get("version"):
        lines.append(f"_Reference v{entry['version']}, added {entry.get('added', '')}, proposal {entry.get('id', '')}._")
    if entry.get("summary"):
        lines += ["", entry["summary"]]
    lines += ["", "**Key ideas**"] + [f"- {t}" for t in entry["insights"]]
    if entry.get("rules_of_thumb"):
        lines += ["", "**Rules of thumb**"] + [f"- {t}" for t in entry["rules_of_thumb"]]
    if entry.get("situation"):
        lines += ["", "**Worked situation**"]
        lines += [f"- **{SITUATION_LABELS[k]}:** {entry['situation'][k]}" for k in SITUATION_FIELDS]
    return "\n".join(lines)


def render_block(entries: list[dict]) -> str:
    if not entries:
        return EMPTY_BLOCK
    return "\n\n".join(render_entry(e, i) for i, e in enumerate(entries, 1))


def render_proposal(p: dict) -> str:
    lines = [f"# Scout proposal {p['id']}: {p['topic']}", "",
             f"- Status: **{p['status']}**" + (f" (reference v{p['version']})" if p.get("version") else ""),
             f"- Created: {p['created']} UTC",
             f"- Why this topic: {p['reason']}",
             f"- Research source: {p['source']}",
             "- Web domains consulted (not copied, never written to the knowledge file): "
             + (", ".join(p["sources"]) or "none")]
    if p.get("reviewed_by"):
        lines.append(f"- Reviewed by: {p['reviewed_by']} {p.get('reviewed_at') or ''}".rstrip())
    if p.get("note"):
        lines.append(f"- Note: {p['note']}")
    lines += ["", "## Text that would be added to football_reference.md", ""]
    lines.append(render_entry(p["entry"]) if p.get("entry") else "_Nothing passed the checks._")
    lines += ["", "## Filtered out by the code checks", ""]
    lines += [f"- {r['item']}: {r['reason']}" + (f" ({r['text']})" if r.get("text") and "real name" not in r["reason"]
              and "link" not in r["reason"] else "") for r in p.get("rejected_items", [])] or ["- nothing"]
    lines += ["", "## Checks applied", "",
              "- No links or domain names, no markup or instruction-like text",
              "- No real players, coaches, clubs, leagues or competitions (denylist + name heuristic)",
              f"- No quotations over {MAX_QUOTE_WORDS} words; written in own words",
              "- Rules of thumb contain a number",
              f"- Near-duplicates of existing knowledge dropped (overlap >= {DUPLICATE_OVERLAP})"]
    return "\n".join(lines) + "\n"
