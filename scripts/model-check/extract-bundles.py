"""Build the model check's input for each answer of a regression run (owner answer 198a).

One bundle per answer turn: the conversation up to that turn (the user's prompts and the earlier answers), the answer
to check, and the research record (each AskRigor tool call of the turns so far, with its arguments and result text,
and the AI's own web searches). The harness's release-test preamble is not included, and neither are the protocol
pages, the access calls or the final check's own results: the model check judges the answer against what the research
read, independently of the code check. Nothing here judges meaning; it copies and trims.

Usage: python3 -I extract-bundles.py <regress-dir> <out-dir> [case ...]
"""
import json
import os
import re
import sys

# Calls whose results are not evidence: the protocol, access, saving, the final check and lesson reports.
NOT_EVIDENCE = {"load_protocol", "get_protocol_manifest", "verify_protocol_integrity", "manage_research_access",
                "finalize_research", "save_research_findings", "submit_lesson_candidate", "submit_research_contribution",
                "review_research_contribution", "review_evidence_gap_submissions"}
RESULT_LIMIT = 12_000      # characters kept of one call's result
RECORD_LIMIT = 400_000     # characters kept of a turn's whole research record
SHORT_TEXT = 400           # a result text shorter than this also gets its structured result


def turn_files(regress, case):
    """The case's turns in order: (prompt path, log path, answer path)."""
    turns = [(f"{regress}/cases/{case}.md", f"{regress}/logs/{case}.jsonl", f"{regress}/out/{case}.md")]
    n = 2
    while os.path.exists(f"{regress}/cases/{case}.turn{n}.md"):
        turns.append((f"{regress}/cases/{case}.turn{n}.md", f"{regress}/logs/{case}.turn{n}.jsonl",
                      f"{regress}/out/{case}.turn{n}.md"))
        n += 1
    return turns


def read(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as handle:
            return handle.read()
    except OSError:
        return None


def result_text(result):
    """The call's text; when the text is short (such as "completed."), its structured result too, which holds the
    states the text leaves out (how far a source was read, why it was refused)."""
    if not isinstance(result, dict):
        return ""
    parts = [part.get("text", "") for part in result.get("content") or [] if isinstance(part, dict)]
    text = "\n".join(p for p in parts if p)
    structured = result.get("structured_content", result.get("structuredContent"))
    if structured is not None and len(text) < SHORT_TEXT:
        text = (text + "\n" if text else "") + "[structured result] " + json.dumps(structured, ensure_ascii=False)
    return text


def research_calls(log_path, turn):
    calls = []
    text = read(log_path) or ""
    for line in text.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        item = event.get("item") if isinstance(event, dict) else None
        if event.get("type") != "item.completed" or not isinstance(item, dict):
            continue
        if item.get("type") == "mcp_tool_call":
            tool = str(item.get("tool", "")).split(".")[-1]
            if tool in NOT_EVIDENCE:
                continue
            body = result_text(item.get("result"))
            if item.get("error"):
                body = f"ERROR: {item.get('error')}\n{body}"
            if len(body) > RESULT_LIMIT:
                body = body[:RESULT_LIMIT] + f"\n[... {len(body) - RESULT_LIMIT} more characters not shown]"
            calls.append({"turn": turn, "tool": tool, "arguments": item.get("arguments"), "result": body})
        elif item.get("type") == "web_search":
            calls.append({"turn": turn, "tool": "web_search", "arguments": {"query": item.get("query")},
                          "result": "(the AI's own web search; its results are not in the log)"})
    return calls


def main():
    regress, out_dir = sys.argv[1], sys.argv[2]
    cases = sys.argv[3:] or sorted(name[:-3] for name in os.listdir(f"{regress}/cases")
                                   if name.endswith(".md") and not re.search(r"\.turn\d+\.md$", name))
    os.makedirs(out_dir, exist_ok=True)
    made = 0
    for case in cases:
        conversation, record = [], []
        for index, (prompt_path, log_path, answer_path) in enumerate(turn_files(regress, case), start=1):
            prompt, answer = read(prompt_path), read(answer_path)
            if prompt is None or answer is None or not answer.strip():
                print(f"{case} turn {index}: no prompt or answer; skipped", file=sys.stderr)
                break
            record.extend(research_calls(log_path, index))
            # Each call carries its number in the whole record, the same in every turn's bundle, which the check
            # cites (the development set's checks miscounted unnumbered calls).
            kept, total = [], 0
            for number, call in enumerate(record, start=1):
                numbered = {"call": number, **call}
                size = len(json.dumps(numbered, ensure_ascii=False))
                if total + size > RECORD_LIMIT:
                    kept.append({"turn": call["turn"], "tool": "(record trimmed)",
                                 "result": f"calls {number} to {len(record)} not shown"})
                    break
                kept.append(numbered)
                total += size
            bundle = {"case": case, "turn": index, "conversation": list(conversation),
                      "question": prompt.strip(), "answer": answer.strip(), "research": kept}
            name = case if index == 1 else f"{case}.turn{index}"
            with open(f"{out_dir}/{name}.json", "w", encoding="utf-8") as handle:
                json.dump(bundle, handle, ensure_ascii=False, indent=1)
            made += 1
            conversation += [{"role": "user", "text": prompt.strip()}, {"role": "assistant", "text": answer.strip()}]
    print(f"{made} bundles in {out_dir}")


if __name__ == "__main__":
    main()
