"""Football-eye check: print every outfield player's best off-ball position.

Run from the repo root:  python scripts/check_positions.py [scenario_id]

Read the output like a coach would. If a suggested run looks wrong, tune the
constants in backend/space_value.py and backend/geometry.py before demoing.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.geometry import analyze  # noqa: E402


def main():
    for path in sorted((ROOT / "data" / "scenarios").glob("*.json")):
        scenario = json.loads(path.read_text(encoding="utf-8"))
        if len(sys.argv) > 1 and scenario["id"] != sys.argv[1]:
            continue
        k = scenario["key_frame"]
        frame, prev = scenario["frames"][k], scenario["frames"][k - 1] if k else None
        owner = frame["ball"]["owner"]
        print(f"\n== {scenario['id']}  (key moment {k + 1}, ball with #{owner})")

        carrier = analyze(frame, owner, scenario["attacking_direction"], prev)
        print("Carrier options (id, space value, open):",
              [(o["id"], o["space_value"], o["open"]) for o in carrier["teammates"][:6]],
              "| xG", carrier["shot"]["xg"])

        team = next(p["team"] for p in frame["players"] if p["id"] == owner)
        for p in frame["players"]:
            if p["team"] != team or p["id"] == owner or p["role"] == "goalkeeper":
                continue
            sv = analyze(frame, p["id"], scenario["attacking_direction"], prev)["space_value"]
            best = sv["best_position"]
            if best is None:
                print(f"  #{p['id']:>2} {p['role']:<22} {sv['note']}")
                continue
            free = "" if best["available_here"] else "  [get free]"
            print(f"  #{p['id']:>2} {p['role']:<22} value {sv['value_here']:.3f} -> {best['value']:.3f} "
                  f"(gain {best['gain']:+.3f})  {best['direction_text']}{free}")


if __name__ == "__main__":
    main()
