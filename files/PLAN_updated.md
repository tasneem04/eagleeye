# EagleEye: Build Plan (Microsoft × Premier League "Inside the Game" Hackathon)

## Status (24 Oct 2026, evening Riyadh)
| Piece | State |
|---|---|
| Scaffolding, venv, scenario generator, `build_up_triangle` scenario (with match situation) | ✅ done |
| Pitch, playback, timeline, click-to-select, overlays, third-man route, scoreboard | ✅ done |
| Geometry engine: lanes, open, triangles, free space, shot, third-man, switch | ✅ done |
| FieldMapper and TacticalContextAgent (parallel), then DecisionAgent; tactical mode drives the decision; 21 tests | ✅ done, ⏳ live test blocked on Azure sign-in |
| Match-situation selector that re-asks the agents on the same click | ✅ done |
| `knowledge/coaching_principles.md` (for File Search) and instructions for all 3 agents | ✅ done |
| **Knowledge v3** (box copy `hinata`): `coaching_principles.md` rewritten (sections 1–10: scanning clock, phases, risk, support, breaking lines, off-ball, xG table, transitions, youth language; section 11 lessons untouched) + new companion `knowledge/football_reference.md` (worked situations A–H + glossary) | ✅ done on the box copy; ⏳ copy to PC and upload `football_reference.md` to File Search |
| **KnowledgeScout** (background research agent): picks a gap/weak topic → Foundry agent with the **Web Search** tool → code checks (no links, no real names, no long quotes, no duplicates) → proposal in `knowledge/proposals/` → approve (UI "Scout" button, API or script) → only the scout block of `football_reference.md` changes → versioned + CHANGELOG → auto re-upload to File Search. Offline samples in mock mode. 81 tests | ✅ code done on the box copy (24 Oct); ⏳ user creates `KnowledgeScout` in the portal (Web Search is billed per search) |
| Agent instructions updated for v3 knowledge: `tactical_context_agent.md` (both File Search files), `decision_agent.md` and `coach_agent.md` (small tweaks, JSON unchanged), new `knowledge_scout.md` | ✅ done on the box copy; ⏳ user re-pastes them in the portal |
| **Football-brain upgrade**: space-value engine with momentum, off-ball best position, heatmap toggle, position advice, football-eye check script; 29 tests | ✅ done (24 Oct). Long-pass lane widening added after the check |
| **Self-improving coaching knowledge** (fully automatic, user's choice). Flow: 👍/👎 + comment → every 3 ratings a background update by the PrinciplesCurator agent (optional) or rule-based lessons → code guardrails (lessons section only, ≥2 ratings of evidence, injection/link filter, limits) → versioned doc + CHANGELOG → auto-sync to TacticalContextAgent's File Search. 35 tests | ✅ done (24 Oct). Sync awaits sign-in |
| **Training mode "Player's Eye"**: Train tab, first-person renderer, head-turn scanning with HUD and compass, memory map, eagle-eye reveal (scan cones, missed players, best vs your choice), score, CoachAgent debrief, progress, 8 validated generated drills; 47 tests; verified end to end in headless Edge (CDP-driven drill) | ✅ done (24 Oct), nothing cut |
| **Training realism and dribble choice**: research-based gaze model in `gaze.js`, then:<br>• tap = 100° glance, 317 ms out, about 0.47 s with the ball out of view; hold = turn to 150°<br>• minimum-jerk motion that runs in drill time, so slow motion slows the head too<br>• players count as seen only when the gaze is steady (≤125°/s); motion blur while sweeping<br>• dribble towards a teammate or into a clicked spot, graded by reach time, a blocker in the path, and space; the coach tip matches what you missed<br>Sources: Anastasopoulos 2015, Aksum 2021, McGuckian. 50 tests | ✅ done (24 Oct) |
| **Human realism v2**:<br>• vision zones: identify ≤30°, colour ≤60°, presence ≤100°, with POV softening and edge blobs, a memory map that shows numbers / coloured ? / grey ?, and half credit for players only glimpsed<br>• half-turn (↑/W, opens the body 45° towards the attack)<br>• research-based levels (scan rate 0.25 / 0.45 / 0.7 per second × a 3.6 s window; decision clock none / 3 s / 1.5 s; speed 0.5 / 0.75 / 1.0)<br>• 15 level drills (8 / 10 / 11 players, press 4.4–6.6 / 2.3–3 / 1.4–1.9 m)<br>55 tests | ✅ done (24 Oct) |
| CoachAgent: wired as Analyse step 3 and training debrief, `coach_agent.md` written | ✅ code done; ⏳ user creates it in the portal (offline template meanwhile). Audience/language toggle not built yet |
| Azure App Service deploy, README, video | ⏭ 26 to 27 Oct |

**Blockers for the user:**
- **Azure sign-in.** `az login` reached a personal account, which has no subscriptions. We need the account or tenant that owns `eagleeye-hackathon-resource`, then `az login --tenant <id>`.
- **Git isn't installed** (`winget install Git.Git`).

## Context
EagleEye teaches young players to scan the pitch and decide. They watch a synthetic bird's-eye sequence, pause it, and click a player. Code draws the open teammates, triangles, third-man options and free space, and Microsoft Foundry agents explain the best action.

- **The hackathon** is Microsoft × Premier League "Inside the Game". **The deadline is 27 Oct 2026, 11:59 pm PT.**
- **How we build:** the user creates each agent by hand in the Foundry portal, and we wire them in one at a time.
- **Endpoint:** `https://<your-resource>.services.ai.azure.com/api/projects/<your-project>`, read from `.env`.

## Agent flow (final design)
```
User clicks player
   ├─► FieldMapper            (moment JSON)                        ─┐  run in PARALLEL
   └─► TacticalContextAgent   (geometry + match situation, File Search) ─┘
                  ▼
            DecisionAgent     (FieldMapper text + geometry + tactical JSON; follows its mode)
                  ▼
             CoachAgent       (decision + audience + language)
                  ▼
   UI: overlays + gold decision arrow + explanation

Background knowledge agents (OUTSIDE the click path: they never add latency to an analysis)
   👍/👎 ratings ──► PrinciplesCurator (every 3 ratings) ──► guardrails ──► coaching_principles.md §11 ─┐
   weak phases / topic gaps ──► KnowledgeScout + Web Search (on demand or timer) ──► code checks       │
        ──► proposal ──► human Approve (review mode) ──► football_reference.md §I ─────────────────────┤
                                                                                                      ▼
                                       versioned copy + CHANGELOG ──► re-upload to File Search ──► TacticalContextAgent
```
- **TacticalContextAgent output (JSON):** `{phase, zone, risk, mode: "keep"|"progress", principles: [...]}`.
  - `keep`: DecisionAgent picks the safest open pass.
  - `progress`: DecisionAgent picks a forward pass, a third-man combination, a dribble into space, or a shot.
- **DecisionAgent output (JSON):** `{mode, action, target_player_id, reason, scan_cue}`.
  - Code validates it: the reply must be JSON, and a pass must go to an open teammate.
  - If either check fails, the app falls back to geometry's choice and flags it.
- **Match situation:** each scenario carries a default, for example "0–0, 63'". The UI has a selector (level / 1–0 up 88' / 0–1 down 85'), so the same moment can produce a different decision. This covers the challenge's *Personalize* stage and makes the risk choice realistic.
- **File Search:** two files written by us, so they're original and copyright-safe: `knowledge/coaching_principles.md` (the principles) and `knowledge/football_reference.md` (worked situations). Both are uploaded to TacticalContextAgent in the portal (Knowledge → File search), which is strong Foundry usage.
- **Knowledge that keeps growing (two background agents):**
  - **PrinciplesCurator** turns viewer ratings into short lessons in section 11 of `coaching_principles.md`.
  - **KnowledgeScout** researches one topic at a time with the Foundry **Web Search** tool (weak phases from ratings first, then gaps such as set pieces, 1v1 defending, communication). Code throws out links, real names, long quotes and duplicates. In review mode (default) a person approves each proposal; only the marked block at the end of `football_reference.md` ever changes. Source domains go to the CHANGELOG only.
  - Both write a numbered version and a CHANGELOG entry, then re-upload the file to File Search (replacing the old copy). This is our "multi-agent orchestration" story: 4 agents on the click + 2 agents that improve their knowledge.
- **Every stage has an offline fallback.** The chain never breaks, and the UI shows the source (Foundry or mock) and the latency for each stage.

## NEXT: Training mode "Player's Eye" (scan, decide, then eagle-eye reveal)

### Why
- **The gap:** the bird's-eye view makes everything easy to see, but on the pitch a player only sees what is in front of them. To know what is behind or beside them, they must turn their head ("check the shoulder") before the ball arrives.
- **The research:**
  - Jordet: Premier League players who scanned more completed more passes (81% vs 64%). Elite midfielders make about 0.6–0.8 scans per second before receiving.
  - "Freeze-frame" (temporal occlusion) training improved anticipation in a 2024 meta-analysis of 12 studies, with gains also shown on field-based tests.
  - Scanning training in virtual reality is promising but preliminary (small studies).
- **Honest claim:** "practise the scanning habit and test the picture you build". We never claim "improves match performance".
- **How it fits:** this turns EagleEye from analysis into **training**, gives **CoachAgent** its job (a personal debrief), and covers the challenge's *Personalize* stage.

### The drill (what the user experiences)
1. **Mode tabs** in the top bar: **Analyse | Train**. Train opens a brief:
   - *"You are Blue #8. The ball is coming from #6. Scan, then choose your pass."*
   - Level: **Rookie** (0.4× speed, target 1 scan), **Academy** (0.7×, target 2) or **Pro** (1.0×, target 3).
2. **First-person phase:** the pitch canvas switches to the receiver's eyes.
   - Eye height is 1.7 m and the view is 90° wide. The body faces the ball.
   - The edges are darkened, like peripheral vision.
   - The ball and players move as in the scenario, slowed by the level.
   - Hold **← / →** (or A/D, or on-screen "check left / check right" buttons, or drag) to turn the head up to ±150°. Releasing snaps the gaze back to the ball.
   - **On screen:** a countdown bar ("ball arrives in 1.8 s"), a scan counter, and a small compass showing the head direction.
   - **What counts:** each head turn of more than 45° away from the ball is one scan, following Jordet's definition. A player counts as "seen" if they come within ±40° of the gaze.
3. **Decision phase:** when the ball arrives, the view freezes and a **memory map** appears.
   - It's a small top-down pitch showing **only the players you saw**, at their last-seen spots and fading with age. Everything else is fogged.
   - Click a teammate to pass, or press **Dribble** or **Shoot**.
4. **Eagle-eye reveal:** the main canvas switches back to the bird's-eye view at the arrival moment. It shows:
   - your **scan cones**, as translucent wedges where your eyes went;
   - the **missed** key players, ringed in dashed red;
   - **your choice** as a white arrow;
   - **the best option** as the gold arrow (reusing `drawDecision`), plus the open lanes (reusing `drawLanes`).
5. **Score card:**
   - **Decision:** best = 100, good = 70 (another open pass), ok = 50 (a valid dribble or shot), risky = 0.
   - **Coverage:** % of key players seen. Key players are the open teammates, the best target and the 2 nearest opponents.
   - **Scans:** compared with the level's target.
   - **Eagle Eye score:** 50% decision, 30% coverage, 20% scans.
6. **Coach debrief (CoachAgent):** 2–4 kid-friendly sentences. Code writes the facts; the agent only phrases them, for example *"You checked left once. #2 was free over your right shoulder. Check that side before the ball leaves #6's foot."* There's an offline template fallback.
7. **Progress:** the last 10 scores and scans per drill are stored in the viewer's browser and shown as a small trend ("scans: 0 → 1 → 3").

### Drills that really require scanning (so players can't memorise them)
- **Scenario trials** come from `backend/training.py` `find_trials(scenario)`. Each one is any pass in flight between teammates: the start is the passer's frame, the arrival is when the receiver gets the ball. `build_up_triangle` gives 2 trials (#8 and #7).
- **Generated drills** come from a seeded `scripts/generate_scenarios.py` `rondo_drill(seed)`, which makes about 8 synthetic drill scenarios:
  - **Shape:** a passer, a receiver, 3–4 teammates and 4–6 opponents, with a ball-in-flight sequence.
  - **Validation:** code checks that exactly 1–2 open options exist, and that the **best option sits more than 100° from the facing direction**. That's outside the starting view, so the drill can only be solved by scanning.
  - **Variety:** the left/right mirror and position jitter are randomised each round.

### How it's built (reusing what exists)
- **`backend/training.py`** (new):
  - `find_trials()`;
  - `answer_key(trial)`, which reuses `geometry.analyze` on the arrival frame with the receiver as carrier, `tactical.rules` for the mode, and `decision.geometry_choice`;
  - `body_relative(bearing, facing)`, giving words like "over your right shoulder", "in front", "behind you";
  - `grade(trial, submission)`, which returns decision, coverage, scans, score, missed players and debrief facts.
- **`backend/app.py`:**
  - `GET /api/training/trials`;
  - `POST /api/training/evaluate`: `{trial_id, level, scans, seen_ids, gaze_samples, choice, decision_ms}` → grade, answer key, arrival geometry, and the debrief stage result.
- **`backend/agents/`:**
  - add a `coach` stage. `messages.coach_debrief_input()` builds the input, `mock.coach_debrief()` is the fallback, and the existing `_run_stage` gives the fallback and friendly errors;
  - `instructions/coach_agent.md` covers both the debrief and the Analyse explanation, with audience and language (EN/AR) parameters;
  - `.env` gets `AGENT_COACH=CoachAgent`.
- **`frontend/js/pov.js`** (new, about 250 lines of canvas, with no 3D library):
  - **`PovView`:** a camera at the receiver; world → camera via yaw; perspective projection with focal = (W/2)/tan(45°);
  - **pitch lines:** sampled every 1 m and clipped where the forward distance f < 0.3 m;
  - **players:** shaded capsules from 0 to 1.8 m tall, sorted far to near, with the shirt number and a ground shadow;
  - **the scene:** a ball, a sky/stand band, a grass gradient and a vignette.
- **`frontend/js/training.js`** (new): a state machine `brief → scanning → deciding → reveal`. It handles head control, scan counting, seen tracking and the memory map (a second small `PitchView`).
- **`frontend/js/overlays.js`:** adds `drawScanCones()`, `drawMissed()` and `drawChoice()`.
- **`index.html`, `main.js`, `styles.css`:** the mode tabs, the Train panel (brief, HUD, score card, debrief, progress), and Analyse code paused while training.
- **Tests (`backend/tests/test_training.py`):**
  - trials found in `build_up_triangle`;
  - `body_relative()` gives the right words for each direction;
  - grading of best, good and risky choices;
  - coverage maths;
  - every generated drill keeps its best option outside the starting 90° view.

### Time-box and cut line (6 h; feature freeze 26 Oct, 12:00 PT, still holds)
Build order: (1) trials and grading backend with tests, (2) the first-person renderer, (3) the scanning phase and HUD, (4) the reveal and score card, (5) the memory map, (6) the CoachAgent debrief, (7) the generated drills, (8) progress.

If time runs short, cut from the end:
1. progress trend;
2. generated drills (keep the scenario trials and mirror them);
3. memory map (replace it with buttons for the players you saw).

The first-person view, the reveal and the score card are never cut.

### Precondition (from the devil's advocate)
**Sign-in must be fixed today.** No Foundry agent has answered live yet. That matters more than any new feature, because the first judging stage checks the required technologies.

## DONE: "Football brain" upgrade of TacticalContextAgent (kept for reference)
**Why:** a vision coach must answer "where should I be?", not only "what do I do with the ball?". The football brain = **code that measures space value** plus **an agent that interprets it with coaching knowledge**. There is no 5th agent in the click chain and no real data, and it keeps its parallel slot.

### How it will look (what the user sees)
```
┌──────────────── PITCH ───────────────────────────────┐  ┌──── PANEL ─────────────────────────────┐
│ BLUE 0–0 RED 63'                       [Heatmap ✓]   │  │ Blue #9 · striker · OFF THE BALL       │
│  ░░▒▒▓▓  ← gold glow = valuable space Blue controls  │  │ Value here 0.08 → best spot 0.21 (×2.6)│
│        ▒▓█▓▒   ◯ "move here" ring                    │  │──────────────────────────────────────── │
│   (9)╌╌╌╌╌╌╌╌▶◯   dashed run line from #9            │  │ 1A FieldMapper   · parallel            │
│          ▲                                           │  │ 1B TacticalContextAgent · parallel     │
│   (6)────┘ green: lane from ball to new spot is open │  │   Progression · Medium risk · Progress │
│                                                      │  │   "Drift 8 m into the right half-space │
└──────────────────────────────────────────────────────┘  │    behind #19: #6 can find you there." │
                                                          │ 2  DecisionAgent  PASS → #8 (on-ball)  │
                                                          └────────────────────────────────────────┘
```
- **Click the ball carrier (on-ball):** same as today (lanes, triangles, third-man, decision arrow), plus:
  - the heatmap;
  - each open teammate's **space value**, so "#8 is the most dangerous open option";
  - a **shot xG** figure.
- **Click a teammate without the ball (off-ball):**
  - a **"move here" ring**, the run line, and the clear passing lane from the ball to that spot;
  - the value gain;
  - TacticalContextAgent's `position_advice` in coach words.
- **Click an opponent:** the analysis is from their team's point of view, as today. Defending positions aren't modelled yet, and the panel says so.
- **Heatmap toggle** in the controls bar. It's on by default when a player is selected.

### How it works
1. **`backend/space_value.py`** (pure code, synthetic inputs, already drafted):
   - **`control()`:** pitch control. It compares each team's fastest arrival at a point (0.7 s reaction + distance at 7 m/s) and squashes the difference to 0–1.
   - **`threat()`:** our own hand-set surface, where closer to goal and more central scores higher. It's documented as not fitted to real data.
   - **`value()`:** control × threat.
   - **`xg()`:** our own formula from distance and angle, with a ×0.4 penalty if the lane is blocked.
   - **`heatmap()`:** a 2.5 m grid of about 1,150 values.
   - **`best_position()`:** searches about 12 m around the runner, keeping only spots that meet three conditions:
     - the runner arrives first, beating every opponent by 0.3 s;
     - the pass lane from the ball is clear;
     - the pass is no longer than 40 m.

     Score = value − a small cost for running distance.
2. **`backend/geometry.py` `analyze()`:**
   - adds `space_value: {value_here, best_position{x,y,value,run_m,gain}, heatmap}`;
   - adds `teammates[].space_value` and `shot.xg`;
   - passes a `lane_ok` callback using the existing `lane_blockers()`, which avoids a circular import;
   - uses the ball origin = the owner's position, or the ball itself while it's in flight. If an opponent has the ball, `best_position` is null.
3. **`backend/agents/messages.py`:**
   - `_geometry_facts()` gains `space_value` (without the heatmap grid);
   - `teammates[].space_value` and `shot.xg` go to TacticalContextAgent and DecisionAgent.
4. **`backend/agents/tactical.py`:**
   - JSON gains `position_advice` (a short string);
   - `rules()` writes a fallback sentence from `best_position` and adds a principle naming the most dangerous open teammate;
   - `parse()` keeps `position_advice`.
5. **Instructions:**
   - update `tactical_context_agent.md`: explain the space-value facts and add `position_advice`. It must only describe `best_position`, never invent one.
   - update `decision_agent.md`: prefer the open teammate with the higher `space_value` in progress mode.
   - The user re-pastes both into the portal.
6. **Frontend:**
   - `overlays.js`: `drawHeatmap()` draws first (gold, alpha ∝ value, only where control > 0.5), then `drawBestPosition()` (ring, dashed run, clear-lane line).
   - `panel.js`: the player card shows on/off-ball and the value gain; the tactical card shows `position_advice`; the geometry card gains xG and the "most dangerous open teammate".
   - `index.html` and `main.js`: a heatmap toggle.
7. **Tests (`backend/tests/test_space_value.py`):**
   - control is high near our players and low near opponents;
   - threat rises toward goal and the centre;
   - xG falls with distance and is penalised when the lane is blocked;
   - in a synthetic case, a blocked runner moves to a spot with a clear lane and higher value;
   - in the scenario's key frame, #9 (marked) gets a best position with gain > 0;
   - existing tests stay green.

### Guardrails from the devil's-advocate review (these change the plan above)
1. **Critical path first, in parallel.**
   - The user sends the Foundry account email and Tenant ID **now**. I sign in, and one live reply is required today.
   - The upgrade is built while waiting, **time-boxed to 4 h**.
   - **Feature freeze: 26 Oct, 12:00 PT.** After that only the deploy, README and video.
2. **One batched portal session for the user**, using one checklist:
   - create TacticalContextAgent, attach File Search, upload `coaching_principles.md` **and `football_reference.md`** (same store);
   - re-paste the instructions for TacticalContextAgent, DecisionAgent and CoachAgent (all updated for knowledge v3);
   - create CoachAgent;
   - create **KnowledgeScout** (gpt-4.1-mini, tool: **Web search**, paste `knowledge_scout.md`), then set `AGENT_KNOWLEDGE_SCOUT=KnowledgeScout` and keep `SCOUT_MODE=review`. Optional; skip it if Web Search is blocked on the subscription;
   - optional: create PrinciplesCurator.
   - DecisionAgent's JSON format stays unchanged.
3. **Football-credibility check (required before it goes in the video):**
   - add `scripts/check_positions.py` to print each attacker's best spot, gain and run for the key frames;
   - adjust `SPEED_MPS`, `REACTION_S` and the threat curve until they pass a football eye;
   - **use the previous keyframe for player momentum:** reach time starts from position + velocity × reaction. It's cheap and fixes the "no momentum" weakness.
4. **Code writes the words, the agent only rephrases.**
   - `best_position` comes with `direction_text` built by the existing `describe.relative_direction()` and `channel()`, for example "8 m ahead-right, into the right half-space".
   - The agent may not add numbers or directions of its own, so the advice can't contradict the ring.
5. **Uncluttered display:**
   - **On-ball click:** lanes, triangles, third-man route and the decision arrow. **No** move ring.
   - **Off-ball click:** **only** the move ring, the run line, the clear lane from the ball, and dimmed players.
   - **Heatmap off by default.** One toggle, used for one shot in the video.
6. **Honest naming:** the UI and README say "simplified pitch control" and "hand-set threat surface (not fitted to real data)", and never claim "xT".
7. **Cut line:** if the check in item 3 isn't convincing by the end of the 4 h, ship only the off-ball move ring, use the rule-based advice, and hide the heatmap.

### Stretch, only if time remains after deployment
- The agent calls the engine as a Foundry **function tool**, or **MCP** after the deploy. Check first that portal agents support it.
- A **Foundry Evaluation**: about 15 hand-labelled synthetic moments, with the agreement score reported in the README.

### Rejected (devil's advocate), reconciled with KnowledgeScout (24 Oct)
- **Real match data:** still rejected. It breaks the synthetic-only rule.
- **Web search inside the analysis click:** still rejected. It's slow, results change between runs, and it's a copyright/trademark risk. KnowledgeScout does **not** do this: it runs on demand (Scout button, API, script) or on an optional timer, never inside an analysis. Analyses only read the approved, versioned file through File Search, so answers stay fast and repeatable.
- **A 5th agent in the click chain:** still rejected (latency, overlap with TacticalContextAgent). KnowledgeScout is a **background** agent like PrinciplesCurator, not a 5th sequential stage, so it adds no waiting time to a click.
- **How the old risks are handled:** web results are treated as untrusted. Code removes links, real players/clubs/competitions (denylist + name check), long quotes, markup and duplicates; review mode needs a human approval; sources are logged as domains only; every change is versioned and can be rolled back from `knowledge/versions/`.
- **New cost/eligibility risk:** Web Search is billed per search ($14 per 1,000) plus model tokens, and may not be allowed on sponsored or free-credit subscriptions. If it's unavailable, KnowledgeScout falls back to the offline samples and the demo still works.
- **Stretch:** a Foundry Evaluation on a hand-labelled set of synthetic moments, giving an agreement score for the README.

## Rules we must follow (from the official rules)
- **Data:** synthetic data only. Use fictional teams (Blue and Red) and numbers only: no real players, clubs, logos or kits.
- **New project:** built after 29 Sep.
- **Pitch:** the elevator pitch must list the Microsoft and Azure technologies used.
- **Video:** under 2:00 on YouTube or Vimeo. It must contain no copyrighted music, anime footage or trademarks.
- **Repo:** public GitHub repo with an MIT license and no secrets.
- **Demo:** a working demo reachable for free until 10 Nov, on Azure App Service.
- **Language:** English.

**Judging:** five criteria at 20% each: tech, agentic design, impact, UX/presentation, category fit (Ingest → Interpret → Explain → Render → Personalize). Target prizes: Grand Prize, plus Best Use of Foundry or Best Multi-Agent.

**Inspiration and science:**
- One README line credits the Ao Ashi "Eagle Eye" (bird's-eye view) as inspiration, with no images.
- The scientific basis is Jordet et al. (2020): more scanning before receiving goes with a higher chance of completing a pass.

## Key files
- `backend/geometry.py`: pure geometry, in metres.
- `backend/agents/`:
  - `pipeline.py`: stages, the parallel group and fallbacks.
  - `foundry.py`: `get_openai_client(agent_name=...)`, then a conversation, then a response.
  - `messages.py`: the input built for each agent.
  - `mock.py`, `decision.py` and `tactical.py`: parsing, validation and rule-based fallbacks.
  - `instructions/*.md`: the text the user pastes into the portal (FieldMapper, TacticalContextAgent, DecisionAgent, CoachAgent, PrinciplesCurator, KnowledgeScout).
- `backend/learning/`:
  - `feedback.py`: ratings store; `curator.py`: PrinciplesCurator flow and guardrails;
  - `scout.py`: KnowledgeScout (topic choice, validation, proposals, approve/reject, versioning); `scout_samples.py`: offline samples;
  - `knowledge_sync.py`: re-uploads `coaching_principles.md` and `football_reference.md` to File Search.
- `knowledge/`: `coaching_principles.md`, `football_reference.md`, `CHANGELOG.md`, `versions/`, `proposals/` (scout), `learning_state.json`, `scout_state.json`.
- `frontend/js/`: `pitch`, `playback`, `overlays`, `panel`, `main` and `api`.
- `scripts/generate_scenarios.py`: writes `data/scenarios/*.json`. `scripts/improve_principles.py` and `scripts/run_scout.py`: run the two knowledge agents by hand.
- `.env`:
  - `AGENT_FIELD_MAPPER`, `AGENT_TACTICAL_CONTEXT`, `AGENT_DECISION` and `AGENT_COACH`;
  - each stage is enabled only when its variable is set;
  - knowledge agents: `AGENT_PRINCIPLES_CURATOR`, `PRINCIPLES_BATCH_SIZE`, `KNOWLEDGE_VECTOR_STORE_ID`, `AGENT_KNOWLEDGE_SCOUT` (empty = offline samples), `SCOUT_MODE` (`review` default, or `auto`), `SCOUT_INTERVAL_HOURS` (0 = off).

## Remaining timeline (today is 24 Oct, evening Riyadh)
- **24 Oct (done):** ✅ football brain; ✅ self-improving knowledge; ✅ training mode "Player's Eye" + human realism v2; ✅ knowledge v3 + `football_reference.md`; ✅ KnowledgeScout and instruction updates (box copy, awaiting review).
- **24–25 Oct:**
  - review the KnowledgeScout change list, then copy the box changes to the PC;
  - the user fixes sign-in, then one portal session (checklist above): File Search with both files, re-paste instructions, CoachAgent, KnowledgeScout;
  - live test of the click chain, then one KnowledgeScout run + approve.
- **26 Oct:** feature freeze 12:00 PT. Azure App Service deploy (managed identity + Foundry User / Azure AI User role); README with architecture and the tech list; make the repo public. Keep `SCOUT_INTERVAL_HOURS=0` on the deployed app (no unattended web search spend).
- **27 Oct (submit by noon PT, about 10 pm Riyadh):** 1:45 video (one shot of the Scout panel: research → approve → knowledge version goes up), then submit. Hard deadline 27 Oct 11:59 pm PT = 28 Oct 9:59 am Riyadh.

## Verification
- `pytest` (81 tests) covers geometry, decision and tactical parsing, space value, training, learning and KnowledgeScout.
- Run `uvicorn backend.app:app --reload` and open http://localhost:8000. Click #6 at the key moment and expect:
  - FieldMapper and TacticalContextAgent in parallel;
  - mode `progress` at 0–0;
  - DecisionAgent picks PASS → #8, or the third-man route.
- Switch the situation to "1–0 up, 88'" and expect mode `keep`.
- Click #9 (off the ball) at the key moment. Expect:
  - the heatmap;
  - the "move here" ring with a clear lane from #6;
  - a value gain above 0;
  - TacticalContextAgent's position advice in the panel.
- **Training:**
  - Train → Rookie: in the first-person view, holding → turns the head and the scan counter rises.
  - With no scanning on the #8 trial, the memory map shows only #6 and the players in front. The reveal marks #2 as missed, and the debrief says to check the right shoulder.
  - Scanning right first finds #2. Choosing them scores "best".
  - Generated drills differ each round.
  - `pytest` passes the training tests.
- **KnowledgeScout:**
  - `pytest` passes `test_scout.py` (validation, block writing, markers, approve/reject, auto mode, sync of both files, API).
  - Mock mode: Scout → "Research a topic" creates a proposal from the offline samples; Approve raises "Reference v" by 1 and adds a note under section I of `football_reference.md`; sections A–H and `coaching_principles.md` are unchanged.
  - Live: the proposal shows "source: agent" and web domains; after approval the CHANGELOG shows the sync, and File Search holds exactly one copy of each file.
- **Live:** each stage card shows "Microsoft Foundry agent". DecisionAgent's JSON is verified, with no warning.
- Before submitting:
  - open the deployed URL in an incognito window;
  - check the video is under 2:00;
  - check there are no secrets in the git history.
