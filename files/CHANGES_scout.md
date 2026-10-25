# KnowledgeScout + plan and instruction updates: change list (for Tasneem to review)

Everything here was done on the box copy `/workspace/eagleeye/hinata` only. I did not touch your PC, `/workspace/eagleeye/work`, or any Azure/Foundry resource. Nothing is applied until you approve.

Baseline: `/workspace/eagleeye/hinata-before-scout`. Full diff: `scout.diff`. Instruction diff only: `instructions.diff`. Plan diff: `PLAN_updated.diff`. Changed and new files with their paths: `scout_files.zip` (19 files, including `PLAN_updated.md`).

Tests: **81 passed** (55 before, plus 26 new in `backend/tests/test_scout.py`). Command: `../.venv_h/bin/python -m pytest -q` from `hinata`. The `.venv` named in the brief does not exist on the box, so I used `.venv_h`.

## What it does, in plain words
KnowledgeScout is a new **background** Foundry agent. It keeps EagleEye's football knowledge growing so the other agents know more:
1. **Picks a topic.** It starts with phases that viewers rated badly (at least 2 👎 and more 👎 than 👍). Otherwise it rotates through 12 gap topics, such as set pieces, 1v1 defending, communication, weak foot and rondos. It skips anything researched in the last 3 days. You can also type your own topic.
2. **Researches it.** The `KnowledgeScout` agent uses the Foundry **Web Search** tool and replies in a fixed JSON format: insights, rules of thumb, and one worked situation.
3. **Checks the reply in code.** The reply is treated as untrusted. Code throws out:
   - links and web addresses;
   - real players, coaches, clubs, leagues and competitions (a denylist plus a check for capitalised names);
   - quotes of more than 12 words, markdown and instruction-like text;
   - rules of thumb with no number;
   - near-duplicates of anything already in either knowledge file.
4. **Makes a proposal** (`knowledge/proposals/P{n}.json` and `.md`). In **review mode (the default)** a person approves or rejects it with the new **🔭 Scout** button in the header, the API, or `scripts/run_scout.py`. In `auto` mode it applies itself.
5. **Applies it** only inside the marked block (`<!-- scout:start/end -->`) of section I at the end of `football_reference.md`. Sections A–H and `coaching_principles.md` never change. On approval:
   - the reply is checked again;
   - a numbered copy is saved to `knowledge/versions/football_reference.v{n}.md`;
   - a CHANGELOG entry is written, with source **domains only** (never in the knowledge file);
   - **both** knowledge files are re-uploaded to the File Search store, replacing the old copies, so TacticalContextAgent uses the new knowledge on the next click.
6. **Works without Azure.** If the agent isn't set up, or its reply is unusable, it uses one of 6 offline samples written in our own words and labels the proposal "offline sample".

It never runs inside an analysis click, so it adds no latency. It runs on demand, or on an optional timer (`SCOUT_INTERVAL_HOURS`, off by default).

## Files
New:
- `backend/learning/scout.py`: KnowledgeScout (topic choice, checks, proposals, approve/reject, versioning, sync).
- `backend/learning/scout_samples.py`: 6 offline samples, written by us.
- `backend/agents/instructions/knowledge_scout.md`: portal steps and the instructions to paste.
- `scripts/run_scout.py`: `--topic`, `--list`, `--approve P1`, `--reject P1`, `--sync`.
- `frontend/js/scout.js`: the Scout panel (research, pending cards with Approve/Reject, recent list). It uses textContent only, so there is no HTML injection.
- `backend/tests/test_scout.py`: 26 tests.

Changed:
- `backend/app.py`: the scout is created at startup, with an optional timer thread. New endpoints:
  - `POST /api/knowledge/sync`
  - `GET /api/scout`
  - `POST /api/scout/run`
  - `GET /api/scout/proposals`
  - `GET /api/scout/proposals/{id}`
  - `POST /api/scout/approve/{id}`
  - `POST /api/scout/reject/{id}`
- `backend/learning/knowledge_sync.py`: `sync_all()` re-uploads both knowledge files.
- `knowledge/football_reference.md`: added the empty section "I. Researched notes (KnowledgeScout)" with the markers. A–H are unchanged.
- `frontend/index.html`, `js/api.js`, `js/main.js`, `styles.css`: the Scout button and panel.
- `.env.example`: `AGENT_KNOWLEDGE_SCOUT=`, `SCOUT_MODE=review`, `SCOUT_INTERVAL_HOURS=0`.
- `README.md`: a new "KnowledgeScout" section.
- Agent instructions (JSON reply formats **unchanged**):
  - `tactical_context_agent.md`: step 2 now uploads **both** files to one File Search store. The knowledge paragraph says which sections to use (1 scanning, 2–4 phases/risk/keep, 6 lines, 8.2 xG table, 9 transitions, 10 youth language, 11 lessons, and the worked situations). Section I comes below A–H and the principles.
  - `decision_agent.md`: principles are hints and the geometry wins; xG of about 0.1 or more with a clear lane counts as a real chance; a fast-decision line for transitions; reason and scan_cue in simple words with numbers only.
  - `coach_agent.md`: ages about 10–16; write for 10–12 unless told otherwise (13–16 may use terms with a short explanation); talk about the moment, not the person; numbers only; praise the scan.
- `PLAN_updated.md` (a new copy, not overwriting `plan_current.md`):
  - status rows for knowledge v3, KnowledgeScout and the instructions;
  - the agent flow now shows PrinciplesCurator and KnowledgeScout as background agents feeding File Search;
  - updated Key files, .env and the portal checklist;
  - the timeline from 24 Oct evening;
  - KnowledgeScout verification steps;
  - Rejected items reconciled. "Web search at runtime" and "5th agent" stay rejected **for the click path**. The scout is a background agent, review mode is on by default, and filters plus versioning handle the copyright and trust risks. The new cost and eligibility risk is listed.
  - I also removed the duplicated "Rejected" bullet list that repeated the items above it.

## Instructions to re-paste in the Foundry portal
1. **TacticalContextAgent**: re-paste the instructions **and** upload `football_reference.md` to its File Search (with the new v3 `coaching_principles.md`).
2. **DecisionAgent**: re-paste.
3. **CoachAgent**: re-paste (or paste the full text when you create it).
4. **KnowledgeScout** (new, optional): create it, add the **Web search** tool, and paste `knowledge_scout.md`.

FieldMapper and PrinciplesCurator are unchanged.

## Rules check: PASS
- **Microsoft only:** Foundry prompt agents (azure-ai-projects), the Foundry Web Search tool, File Search, and Azure. No other AI provider.
- **Synthetic data only:** the worked situations use Blue/Red shirt numbers. No real match data is used or stored.
- **No real players, clubs or leagues in content:** checked by grep across all added lines. The only real names are in the scout's **denylist** and in the negative tests that prove they are rejected. They are filter code, not content, and never reach the knowledge files or the UI.
- **No copyrighted material, own words:** the offline samples are written by us. Live notes are paraphrased by the agent, quotes over 12 words are rejected, a human reviews them, and sources are kept as domain names in the CHANGELOG only.
- **No links in the knowledge files:** links are rejected in code. The only URLs in the diff are `example.org` in tests and the instructions.
- **English only, no anime references.**
