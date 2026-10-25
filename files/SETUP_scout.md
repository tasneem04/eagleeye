# KnowledgeScout: setup (Foundry portal)

Do this after the Azure sign-in blocker is fixed, in the same portal session as the rest of the checklist. Everything is optional for the demo: without it, the Scout panel uses offline samples.

## 1. Update TacticalContextAgent's knowledge (needed for knowledge v3 anyway)
1. Foundry portal → your project → **Agents** → `TacticalContextAgent`.
2. Paste the new instructions from `backend/agents/instructions/tactical_context_agent.md`.
3. **Knowledge → File search**: upload `knowledge/coaching_principles.md` (v3) and `knowledge/football_reference.md` to the **same** store. If the old principles file is there, delete it so only one copy is left.
4. Optional, for automatic re-upload: copy the vector store ID into `.env` as `KNOWLEDGE_VECTOR_STORE_ID=` (same as for PrinciplesCurator).
5. **Save**. Re-paste `decision_agent.md` and `coach_agent.md` into their agents too.

## 2. Create KnowledgeScout
1. **Agents → New agent**. Name: `KnowledgeScout`. Model: `gpt-4.1-mini` (or any deployed model that supports tools).
2. **Instructions**: paste the code block from `backend/agents/instructions/knowledge_scout.md`.
3. **Tools → Add → Web search**. No Bing resource or connection is needed for general web search. Do **not** add File Search.
4. **Save**, then try it once in the playground with the input `Topic: defending set pieces` and check that the reply is JSON.
5. In `.env`:
   ```
   AGENT_KNOWLEDGE_SCOUT=KnowledgeScout
   SCOUT_MODE=review
   SCOUT_INTERVAL_HOURS=0
   ```
6. Restart the backend, click **🔭 Scout → Research a topic**, open the proposal, and click **Approve**. The Reference version goes up by 1 and the CHANGELOG shows the sync. Or run `python scripts/run_scout.py`, then `--list`, then `--approve P1`.

Role: your account (and later the App Service managed identity) needs **Foundry User** (previously called Azure AI User) on the project. You already need this for the other agents.

## Cost and eligibility
- Prompt agents themselves cost nothing extra. You pay for model tokens as usual.
- Web Search uses Grounding with Bing and costs **$14 per 1,000 transactions** plus tokens. One scout run uses a handful of searches, so a few demo runs cost cents. Keep `SCOUT_INTERVAL_HOURS=0` on the deployed app so nothing searches unattended.
- Grounding with Bing may not be available on some sponsored, free-credit or student subscriptions, and an admin can block it per subscription (`OpenAI.BlockedTools.web_search`). If adding the tool or a run fails, leave `AGENT_KNOWLEDGE_SCOUT` empty: the app falls back to offline samples and the demo still works.
- Data sent to web search leaves the Azure compliance and geographic boundary. The scout only sends a football topic name, never user data.

## Verified Microsoft Learn links (checked 24 Oct 2026)
- Web search tool in Foundry Agent Service (prerequisites, portal and SDK, admin control, security): https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/web-search
- Web grounding overview (choosing web search vs. Bing tools): https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/tools/web-overview
- Web search with the Responses API (behaviour and limits): https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/web-search
- Foundry Agent Service pricing: https://azure.microsoft.com/en-us/pricing/details/foundry-agent-service/
- Grounding with Bing pricing: https://www.microsoft.com/en-us/bing/apis
