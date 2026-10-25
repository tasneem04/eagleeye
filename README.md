# EagleEye

An AI football vision coach that teaches young players to scan the pitch. You watch a synthetic bird's-eye sequence, pause it and click a player. EagleEye then draws the open teammates, passing triangles and free space, and Microsoft Foundry agents explain what the player should see.

> Built for the Microsoft × Premier League "Inside the Game" hackathon. **All data is synthetic**: fictional Blue and Red teams, shirt numbers only, and moments generated in code. No real players, clubs or match data are used.

## Run locally

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env          # then check the endpoint and agent names
az login                        # Foundry agents use Entra ID (DefaultAzureCredential)
.\.venv\Scripts\python.exe -m uvicorn backend.app:app --reload
```

Open http://localhost:8000. Set `EAGLEEYE_MODE=mock` in `.env` to run without Azure.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest
```

## Regenerate the synthetic scenarios

```powershell
python scripts/generate_scenarios.py
```

## KnowledgeScout (self-updating football knowledge)

KnowledgeScout is a background agent: it is **not** part of the analysis click, so it adds no waiting time.
Each run picks one topic (one the admin types in, otherwise the next gap such as set pieces or 1v1 defending), asks the `KnowledgeScout` Foundry agent to research it with the Foundry **Web Search** tool, and checks the reply in code: no links, no real players, clubs or competitions, no long quotes, no duplicates of what the agents already know.

- `SCOUT_MODE=review` (default): the result is saved as a proposal in `knowledge/proposals/`. Approve or reject it in the app (Knowledge badge, then **Scout proposals**), by API or with the script.
- `SCOUT_MODE=auto`: checked results are applied straight away.
- Approved notes go into the marked block at the end of `knowledge/football_reference.md`. A numbered copy is saved in `knowledge/versions/`, an entry is added to `knowledge/CHANGELOG.md`, and the file is re-uploaded to TacticalContextAgent's File Search, replacing the old copy. `coaching_principles.md` is never touched by the scout.
- Without `AGENT_KNOWLEDGE_SCOUT`, or in mock mode, the scout uses offline samples written by the team, so the flow can be shown without Azure.

```powershell
python scripts/run_scout.py                 # one research round
python scripts/run_scout.py --list          # proposals
python scripts/run_scout.py --approve P1    # apply a proposal and sync it
python scripts/run_scout.py --sync          # re-upload both knowledge files to File Search
```

API: `GET /api/scout`, `POST /api/scout/run` (`{"topic": ..., "wait": true}` optional), `GET /api/scout/proposals`, `POST /api/scout/approve/{id}`, `POST /api/scout/reject/{id}`, `POST /api/knowledge/sync`. Running, approving, rejecting and syncing need the admin token (see below).
Set `SCOUT_INTERVAL_HOURS` to run it on a timer (off by default). Portal setup: see `backend/agents/instructions/knowledge_scout.md`.

## Players are learners, not judges

Nothing a player does changes the coaching knowledge. Only KnowledgeScout research that the coach approves, and the geometry computed in code, decide what is correct.

- **"Did you understand?"** sits under every explanation and every training debrief. A "Not really" goes to the coach's review list (Scout panel, admin only). It never changes a knowledge file or an agent. From there, the coach can turn it into a KnowledgeScout topic, and approval is still needed.
- **Weak spots and the next drill.** The Train mode keeps the player's last 30 drills **in their own browser** (the server stores nothing about players). `POST /api/training/next` works out their weak spots and picks the drill that trains the main one:
  - not scanning enough;
  - a blind shoulder;
  - deciding too slowly;
  - a closed body;
  - risky choices.

  "Reset my progress" clears it.

## Security (for the public demo)

- **Admin actions** need the `X-Admin-Token` header: scout research, approve, reject, the knowledge sync, and the list of unclear explanations.
  - Set `ADMIN_TOKEN` to a long random value on the server. In the app, unlock it in the Scout panel; the token is kept only for that browser tab.
  - **It fails closed:** without `ADMIN_TOKEN`, only requests made on the same machine count as admin, so a forgotten setting locks these actions rather than opening them.
- **Rate limits** apply per visitor: 20 uncached analyses, 30 drill debriefs and 10 "unclear" flags per minute, plus an overall cap of 120 API calls per minute. A visitor is identified by a salted hash of the client address that Azure's proxy adds; the raw address is never stored.
- **A global budget of agent calls** applies per hour (`AGENT_CALLS_PER_HOUR`, default 600). Above it, answers use the offline text instead of spending more.
- **Raw error details** are shown only to the admin, or with `EAGLEEYE_DEBUG=1`.
- **Security headers:** Content-Security-Policy, `nosniff`, `DENY` framing and a strict referrer policy. `EAGLEEYE_ENV=production` also turns off the API docs.
- **Deploy checklist:**
  - `ADMIN_TOKEN` set as an App Service setting;
  - HTTPS only;
  - a managed identity with only the Foundry User (Azure AI User) role, and no keys;
  - `SCOUT_INTERVAL_HOURS=0` and `EAGLEEYE_ENV=production`.

  Give judges the admin token only in the submission's private testing notes.

## Roadmap (after the hackathon)

- Learning from real matches, only with properly licensed data, and outside this hackathon. This submission uses synthetic data only, as the rules require.
