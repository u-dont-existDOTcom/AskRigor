# Puts each case's key next to the blinded readers' output, for the Claude session's match (a judgment of meaning,
# made by reading; nothing here decides it). Usage: python3 assemble.py key.json reader-a.json reader-b.json
import json, sys
key, a, b = (json.load(open(p)) for p in sys.argv[1:4])
for cid in sorted(key):
    k, ra, rb = key[cid], a.get(cid, {}), b.get(cid, {})
    print(f"## {cid} ({k['label']}; {k['centrality']}; {k.get('location')})")
    print(f"- planted: {k['planted']}")
    print(f"- caught if: {k['caught_if']}" + (f"\n- in part if: {k['partial_if']}" if k.get("partial_if") else ""))
    v = ra.get("verdict") or {}
    print(f"- verdict ({v.get('level')}): {v.get('quote')}")
    for c in rb.get("claims", []):
        print(f"  - [{c.get('label')}] {c.get('quote')}\n      reader B: {c.get('reason')}")
    for n in rb.get("numbers", []):
        if n.get("label") != "CORRECT":
            print(f"  - number [{n.get('label')}] {n.get('quote')} :: {n.get('note')}")
    print()
