"""Run KnowledgeScout from the command line.

Run from the repo root:
  python scripts/run_scout.py                       # one research round (topic chosen automatically)
  python scripts/run_scout.py --topic "1v1 defending and jockeying"
  python scripts/run_scout.py --list                # show proposals
  python scripts/run_scout.py --approve P3          # apply a pending proposal (+ File Search sync)
  python scripts/run_scout.py --reject P3
  python scripts/run_scout.py --sync                # re-upload both knowledge files to File Search

Uses the same .env settings as the app: the KnowledgeScout agent (AGENT_KNOWLEDGE_SCOUT) if Foundry
is configured, otherwise the offline samples; SCOUT_MODE=review (default) or auto.
"""

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

from backend.agents.pipeline import Pipeline  # noqa: E402
from backend.learning.knowledge_sync import KnowledgeSync  # noqa: E402
from backend.learning.scout import KnowledgeScout  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description="EagleEye KnowledgeScout")
    parser.add_argument("--topic", help="research this topic instead of the automatic choice")
    parser.add_argument("--list", action="store_true", help="list proposals")
    parser.add_argument("--approve", metavar="ID", help="approve a pending proposal")
    parser.add_argument("--reject", metavar="ID", help="reject a pending proposal")
    parser.add_argument("--sync", action="store_true", help="re-upload both knowledge files to File Search")
    args = parser.parse_args()

    pipeline = Pipeline.from_env()
    sync = None
    if pipeline.foundry is not None:
        sync = KnowledgeSync(pipeline.foundry.project, os.getenv("KNOWLEDGE_VECTOR_STORE_ID", "").strip(),
                             os.getenv("AGENT_TACTICAL_CONTEXT", "").strip())
    scout = KnowledgeScout(ROOT / "knowledge",
                           runner=pipeline.foundry, agent_name=os.getenv("AGENT_KNOWLEDGE_SCOUT", "").strip(),
                           mode=os.getenv("SCOUT_MODE", "review").strip().lower(), sync=sync)
    try:
        if args.list:
            for p in scout.list_proposals():
                print(f"{p['id']:<5} {p['status']:<9} {p['source']:<15} {p['topic']}")
        elif args.approve:
            print(scout.approve(args.approve, reviewer="cli"))
        elif args.reject:
            print(scout.reject(args.reject, reviewer="cli"))
        elif args.sync:
            if sync is None:
                print("Mock mode: nothing to sync.")
            else:
                for name, status in sync.sync_all(ROOT / "knowledge").items():
                    print(f"{name}: {status}")
        else:
            result = scout.run(args.topic)
            print(f"{result['proposal']}: {result['topic']} ({result['reason']}; source: {result['source']})")
            print(f"  status: {result['status']}, {result['accepted_insights']} insights kept, "
                  f"{result['rejected_items']} items filtered")
            print(f"  review it in knowledge/proposals/{result['proposal']}.md")
            if result.get("version"):
                print(f"  applied as football_reference v{result['version']}; sync: {scout.status()['sync_status']}")
    finally:
        pipeline.close()


if __name__ == "__main__":
    main()
