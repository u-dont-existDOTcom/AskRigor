"""Collect one model-check reply into <name>.result.json: the checker's JSON object, its usage and timing.

Usage: python3 -I collect-result.py <claude|codex> <out-dir> <name> <exit-code> <seconds>
"""
import json
import sys


def read(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as handle:
            return handle.read()
    except OSError:
        return ""


def first_object(text):
    """The first complete JSON object in text (a reply may wrap it in a code fence)."""
    decoder = json.JSONDecoder()
    for start, char in enumerate(text):
        if char != "{":
            continue
        try:
            value, _ = decoder.raw_decode(text[start:])
        except ValueError:
            continue
        if isinstance(value, dict):
            return value
    return None


def main():
    engine, out, name, code, seconds = sys.argv[1:6]
    reply, usage = "", {}
    if engine == "claude":
        envelope = first_object(read(f"{out}/{name}.raw.json")) or {}
        reply = envelope.get("result") or ""
        usage = {"usage": envelope.get("usage"), "model_usage": envelope.get("modelUsage"),
                 "is_error": envelope.get("is_error"), "notional_cost_usd": envelope.get("total_cost_usd")}
    else:
        reply = read(f"{out}/{name}.reply.md")
        for line in read(f"{out}/{name}.raw.jsonl").splitlines():
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if event.get("type") == "turn.completed":
                usage = {"usage": event.get("usage")}
    checked = first_object(reply)
    result = {"engine": engine, "name": name, "exit_code": int(code), "seconds": int(seconds), **usage,
              "parsed": checked is not None, "verdict": (checked or {}).get("verdict"),
              "summary": (checked or {}).get("summary"), "problems": (checked or {}).get("problems")}
    if checked is None:
        result["reply_start"] = reply[:400]
    with open(f"{out}/{name}.result.json", "w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, indent=1)
    problems = result["problems"] if isinstance(result["problems"], list) else []
    print(f"{name}: exit {code}, {seconds}s, verdict {result['verdict']}, {len(problems)} problems")


if __name__ == "__main__":
    main()
