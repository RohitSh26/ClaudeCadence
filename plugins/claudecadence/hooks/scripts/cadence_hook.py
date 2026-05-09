#!/usr/bin/env python3
"""ClaudeCadence — single hook handler for all Claude Code lifecycle events.

Reads the hook payload from stdin (JSON), decides whether the event is
worth logging, and appends a timeline node to:

    $CLAUDE_PROJECT_DIR/.claude/cadence/data/nodes.js

On first run for a project, also bootstraps the .claude/cadence/ directory
by copying the static viewer files from $CLAUDE_PLUGIN_ROOT/viewer/.

Hook input shape (per Claude Code docs): a JSON object on stdin with
common fields (session_id, transcript_path, cwd, hook_event_name) plus
event-specific fields (tool_name, tool_input, tool_response, prompt).

This script is intentionally fail-soft: any exception writes a stub
diagnostic to stderr and exits 0. A broken viewer should never block
your Claude Code session.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import sys
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path

# ─────────────────────────── Filesystem layout ────────────────────────────

PLUGIN_ROOT = Path(os.environ.get("CLAUDE_PLUGIN_ROOT", Path(__file__).resolve().parents[2]))
PROJECT_DIR = Path(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd())
CADENCE_DIR = PROJECT_DIR / ".claude" / "cadence"
DATA_DIR = CADENCE_DIR / "data"
NODES_JS = DATA_DIR / "nodes.js"
VIEWER_SOURCE = PLUGIN_ROOT / "viewer"

# v1.2: per-turn grouping. UserPromptSubmit writes a new turn_id here;
# every subsequent hook reads it and tags its node. Stop clears it.
CURRENT_TURN_FILE = CADENCE_DIR / ".current_turn.txt"

# Hub: per-user registry of all cadences across projects (v1.0).
HUB_DIR = Path(os.environ.get("CLAUDECADENCE_HUB_DIR") or (Path.home() / ".claude" / "cadence"))
REGISTRY_JSON = HUB_DIR / "registry.json"

NODES_HEADER = (
    "/**\n"
    " * ClaudeCadence — timeline nodes for this project.\n"
    " * Auto-managed by hooks. Do not edit by hand.\n"
    " */\n"
    "window.TIMELINE_NODES = "
)
NODES_FOOTER = ";\n"

# ─────────────────────────── Bootstrap ────────────────────────────────────


def bootstrap_project() -> None:
    """Copy viewer files into the project on first run; create empty nodes.js."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not NODES_JS.exists():
        NODES_JS.write_text(NODES_HEADER + "[]" + NODES_FOOTER)
    if VIEWER_SOURCE.exists():
        for item in VIEWER_SOURCE.iterdir():
            target = CADENCE_DIR / item.name
            if item.is_dir():
                if not target.exists():
                    shutil.copytree(item, target)
            else:
                if not target.exists():
                    shutil.copy2(item, target)


def register_in_hub(session_id: str | None = None) -> None:
    """Add this project to the per-user registry (idempotent)."""
    HUB_DIR.mkdir(parents=True, exist_ok=True)
    # Copy hub viewer files (home.html, _home.js, etc.) on first run.
    hub_source = PLUGIN_ROOT / "hub"
    if hub_source.exists():
        for item in hub_source.iterdir():
            target = HUB_DIR / item.name
            if item.is_dir():
                if not target.exists():
                    shutil.copytree(item, target)
            else:
                if not target.exists():
                    shutil.copy2(item, target)
    # Load + update registry.
    registry: dict = {"version": 1, "cadences": []}
    if REGISTRY_JSON.exists():
        try:
            registry = json.loads(REGISTRY_JSON.read_text())
        except json.JSONDecodeError:
            pass
    cadences = registry.setdefault("cadences", [])
    project_path = str(PROJECT_DIR.resolve())
    name = PROJECT_DIR.name or "unnamed"
    # Sanitize the slug used in URLs: lowercase, alnum + dash only.
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "unnamed"
    # Disambiguate slug if another project already has it.
    existing = {c.get("slug"): c for c in cadences}
    if slug in existing and existing[slug].get("path") != project_path:
        suffix = 2
        while f"{slug}-{suffix}" in existing:
            suffix += 1
        slug = f"{slug}-{suffix}"

    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    found = next((c for c in cadences if c.get("path") == project_path), None)
    if found is None:
        cadences.append({
            "slug": slug,
            "name": name,
            "path": project_path,
            "first_seen": now,
            "last_session_id": session_id or "",
        })
    else:
        if session_id:
            found["last_session_id"] = session_id
        # Keep the first slug we picked even if the disambiguation walk would have
        # produced a different one — the URL must stay stable.
    REGISTRY_JSON.write_text(json.dumps(registry, indent=2, ensure_ascii=False))


# ─────────────────────────── Node persistence ─────────────────────────────


def load_nodes() -> list[dict]:
    if not NODES_JS.exists():
        return []
    text = NODES_JS.read_text()
    m = re.search(r"window\.TIMELINE_NODES\s*=\s*(\[.*\])\s*;", text, flags=re.DOTALL)
    if not m:
        return []
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return []


def save_nodes(nodes: list[dict]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    NODES_JS.write_text(NODES_HEADER + json.dumps(nodes, indent=2, ensure_ascii=False) + NODES_FOOTER)


def new_id(seq: int, ts: str) -> str:
    safe_ts = ts.replace(":", "-").replace("Z", "")
    rand = uuid.uuid4().hex[:6]
    return f"n_{seq:04d}_{safe_ts}_{rand}"


def current_turn_id() -> str | None:
    """Read the open turn id (if any) from the state file. None = no open turn."""
    try:
        if CURRENT_TURN_FILE.exists():
            t = CURRENT_TURN_FILE.read_text().strip()
            return t or None
    except OSError:
        pass
    return None


def begin_turn() -> str:
    """Open a new turn — write a fresh id, return it."""
    tid = "t_" + uuid.uuid4().hex[:10]
    CADENCE_DIR.mkdir(parents=True, exist_ok=True)
    try:
        CURRENT_TURN_FILE.write_text(tid)
    except OSError:
        pass
    return tid


def end_turn() -> None:
    """Close the current turn (clear the file). Stop calls this."""
    try:
        if CURRENT_TURN_FILE.exists():
            CURRENT_TURN_FILE.unlink()
    except OSError:
        pass


def append_node(node: dict) -> None:
    nodes = load_nodes()
    seq = len(nodes) + 1
    ts = node.get("ts") or datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    node.setdefault("ts", ts)
    node.setdefault("id", new_id(seq, ts))
    node.setdefault("session", "main")
    node.setdefault("kind", "response")
    node.setdefault("status", "completed")
    node.setdefault("tags", [])
    node.setdefault("blocks", [])
    if "parents" not in node:
        node["parents"] = [nodes[-1]["id"]] if nodes else []
    # v1.2: attach turn_id if a turn is open. Don't override a pre-set one.
    if "turn_id" not in node:
        tid = current_turn_id()
        if tid:
            node["turn_id"] = tid
    nodes.append(node)
    save_nodes(nodes)


# ─────────────────────────── Event handlers ───────────────────────────────


def handle_session_start(payload: dict) -> dict | None:
    bootstrap_project()
    return {
        "agent": "external",
        "kind": "ci",
        "status": "completed",
        "title": "Session started",
        "summary": f"Working in {PROJECT_DIR.name}",
        "tags": ["session", "start"],
        "session": payload.get("session_id", "main")[:12],
    }


def handle_user_prompt(payload: dict) -> dict | None:
    prompt = (payload.get("prompt") or "").strip()
    if not prompt:
        return None
    # v1.2: open a fresh turn — every event after this attaches to it
    # until Stop closes it. Done BEFORE we build the node so the prompt
    # itself also carries the new turn_id.
    tid = begin_turn()
    # Slash commands look like "/foo bar" — keep them but tag distinctively.
    is_slash = prompt.startswith("/")
    title_line = prompt.split("\n", 1)[0]
    title = (title_line[:96] + "…") if len(title_line) > 96 else title_line
    summary = prompt[:160].replace("\n", " ").strip()
    if len(prompt) > 160:
        summary += "…"
    blocks = []
    # Always include the full prompt as a body block so the timeline holds the truth, not a teaser.
    blocks.append({"type": "markdown", "value": prompt[:8000]})
    return {
        "agent": "founder",
        "kind": "decision" if is_slash else "response",
        "status": "completed",
        "title": title,
        "summary": summary,
        "tags": ["prompt"] + (["slash"] if is_slash else []),
        "session": payload.get("session_id", "main")[:12],
        "turn_id": tid,
        "blocks": blocks,
    }


def _short(s: str, n: int = 100) -> str:
    s = (s or "").replace("\n", " ").strip()
    return s[:n] + ("…" if len(s) > n else "")


def handle_pre_tool_use(payload: dict) -> dict | None:
    tool = payload.get("tool_name", "")
    tool_input = payload.get("tool_input", {}) or {}
    if tool in ("Agent", "Task"):
        sub = (
            tool_input.get("subagent_type")
            or tool_input.get("agent_type")
            or "subagent"
        )
        desc = tool_input.get("description") or ""
        prompt_preview = _short(tool_input.get("prompt") or "", 200)
        blocks = []
        if prompt_preview:
            blocks.append({"type": "markdown", "value": prompt_preview})
        return {
            "agent": "orchestrator",
            "kind": "fork",
            "status": "in_progress",
            "title": f"Dispatched → {sub}" + (f": {_short(desc, 80)}" if desc else ""),
            "summary": _short(desc or prompt_preview, 160),
            "tags": ["fork", "dispatch", str(sub)],
            "session": payload.get("session_id", "main")[:12],
            "blocks": blocks,
        }
    return None


def handle_post_tool_use(payload: dict) -> dict | None:
    tool = payload.get("tool_name", "")
    tool_input = payload.get("tool_input", {}) or {}
    tool_response = payload.get("tool_response", {})
    session_id = payload.get("session_id", "main")[:12]

    if tool in ("Agent", "Task"):
        sub = tool_input.get("subagent_type") or tool_input.get("agent_type") or "subagent"
        result_text = ""
        if isinstance(tool_response, dict):
            result_text = (tool_response.get("result") or tool_response.get("content") or "")
        elif isinstance(tool_response, str):
            result_text = tool_response
        result_text = _short(result_text, 600)
        blocks = []
        if result_text:
            blocks.append({"type": "markdown", "value": result_text})
        return {
            "agent": str(sub),
            "kind": "merge",
            "status": "completed",
            "title": f"{sub} returned",
            "summary": _short(result_text, 160) or "completed",
            "tags": ["merge", "subagent", str(sub)],
            "session": session_id,
            "blocks": blocks,
        }

    if tool == "Bash":
        cmd = (tool_input.get("command") or "").strip()
        if not cmd:
            return None
        # Skip truly noisy commands; everything else surfaces.
        if re.match(r"^\s*(cd|ls|pwd|cat|echo|true|false|wc)(\s|$)", cmd):
            return None
        # Classify by first token.
        first_token = cmd.split(None, 1)[0] if cmd else ""
        if "gh run" in cmd or "gh pr checks" in cmd:
            kind = "ci"
        elif "gh pr" in cmd or "gh issue" in cmd:
            kind = "pr"
        elif first_token == "git":
            kind = "commit"
        else:
            kind = "tool_call"
        first_line = _short(cmd.split("\n", 1)[0], 120)
        return {
            "agent": "external",
            "kind": kind,
            "status": "completed",
            "title": f"$ {first_line}",
            "summary": tool_input.get("description") or "",
            "tags": ["bash", first_token],
            "session": session_id,
            "blocks": [{"type": "code", "lang": "bash", "value": cmd[:2000]}],
        }

    if tool in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
        path = tool_input.get("file_path") or tool_input.get("notebook_path") or "unknown"
        verb = {"Write": "Wrote", "Edit": "Edited", "MultiEdit": "Edited (multi)", "NotebookEdit": "Edited notebook"}.get(tool, "Touched")
        # Try to give a size hint from the response.
        size_hint = ""
        if isinstance(tool_response, dict):
            content = tool_response.get("content") or ""
            if isinstance(content, str) and "\n" in content:
                size_hint = f" · {content.count(chr(10))+1} lines"
        return {
            "agent": "orchestrator",
            "kind": "tool_call",
            "status": "completed",
            "title": f"{verb} {path}",
            "summary": size_hint.lstrip(" ·") or "",
            "tags": ["file", verb.lower().split()[0]],
            "session": session_id,
        }

    if tool == "Read":
        path = tool_input.get("file_path") or "unknown"
        return {
            "agent": "orchestrator",
            "kind": "tool_call",
            "status": "completed",
            "title": f"Read {path}",
            "summary": "",
            "tags": ["file", "read"],
            "session": session_id,
        }

    if tool in ("Grep", "Glob"):
        pattern = tool_input.get("pattern") or tool_input.get("path") or ""
        return {
            "agent": "orchestrator",
            "kind": "tool_call",
            "status": "completed",
            "title": f"{tool} {_short(pattern, 80)}",
            "summary": "",
            "tags": ["search", tool.lower()],
            "session": session_id,
        }

    if tool in ("WebFetch", "WebSearch"):
        target = tool_input.get("url") or tool_input.get("query") or ""
        return {
            "agent": "orchestrator",
            "kind": "tool_call",
            "status": "completed",
            "title": f"{tool}: {_short(target, 80)}",
            "summary": "",
            "tags": ["web", tool.lower()],
            "session": session_id,
        }

    return None


def handle_subagent_stop(payload: dict) -> dict | None:
    session_id = payload.get("session_id", "main")[:12]
    sub = (
        payload.get("subagent_type")
        or payload.get("agent_type")
        or payload.get("agent")
        or "subagent"
    )
    return {
        "agent": str(sub),
        "kind": "merge",
        "status": "completed",
        "title": f"{sub} done",
        "summary": "Returned to orchestrator",
        "tags": ["subagent", "stop", str(sub)],
        "session": session_id,
    }


def _last_assistant_text(transcript_path: str | None) -> str | None:
    """Walk the JSONL transcript backwards and return the most recent
    assistant text. Robust to multiple known shapes:
        {"type": "assistant", "message": {"content": [{"type": "text", "text": "..."}]}}
        {"type": "assistant", "content": [{"type": "text", "text": "..."}]}
        {"role": "assistant", "content": "..."}
        {"type": "assistant", "text": "..."}
    """
    if not transcript_path:
        return None
    p = Path(transcript_path)
    if not p.exists():
        return None
    try:
        lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return None
    for line in reversed(lines):
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        kind = obj.get("type") or obj.get("role")
        if kind != "assistant":
            continue
        # Many possible shapes — try them in order.
        msg = obj.get("message") or obj
        content = msg.get("content") or obj.get("content") or msg.get("text") or obj.get("text")
        if isinstance(content, str):
            text = content.strip()
            if text:
                return text
        elif isinstance(content, list):
            parts: list[str] = []
            for block in content:
                if not isinstance(block, dict):
                    continue
                btype = block.get("type")
                if btype == "text" and isinstance(block.get("text"), str):
                    parts.append(block["text"])
                elif btype is None and isinstance(block.get("text"), str):
                    parts.append(block["text"])
            joined = "\n".join(p for p in parts if p).strip()
            if joined:
                return joined
    return None


def handle_stop(payload: dict) -> dict | None:
    session_id = payload.get("session_id", "main")[:12]
    # Capture the turn id BEFORE clearing — the response node must still belong
    # to the closing turn. end_turn() is called at the bottom.
    tid = current_turn_id()
    text = _last_assistant_text(payload.get("transcript_path"))
    node: dict | None
    if text:
        first_line = text.split("\n", 1)[0].strip()
        title = (first_line[:96] + "…") if len(first_line) > 96 else (first_line or "Claude responded")
        summary = text[:160].replace("\n", " ").strip()
        if len(text) > 160:
            summary += "…"
        node = {
            "agent": "orchestrator",
            "kind": "response",
            "status": "completed",
            "title": title,
            "summary": summary,
            "tags": ["response"],
            "session": session_id,
            "blocks": [{"type": "markdown", "value": text[:8000]}],
        }
    else:
        # Fallback when transcript isn't readable — better than nothing.
        node = {
            "agent": "orchestrator",
            "kind": "response",
            "status": "completed",
            "title": "Claude responded",
            "summary": "(transcript not readable; install path or permission issue)",
            "tags": ["response", "stop"],
            "session": session_id,
        }
    # Stamp the closing turn id, then close the turn so subsequent
    # orphan events (e.g. background hooks) don't accrete to it.
    if tid:
        node["turn_id"] = tid
    end_turn()
    return node


HANDLERS = {
    "SessionStart": handle_session_start,
    "UserPromptSubmit": handle_user_prompt,
    "PreToolUse": handle_pre_tool_use,
    "PostToolUse": handle_post_tool_use,
    "SubagentStop": handle_subagent_stop,
    "Stop": handle_stop,
}


# ─────────────────────────── Main ─────────────────────────────────────────


def main() -> int:
    raw = sys.stdin.read()
    if not raw.strip():
        return 0
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"[claudecadence] malformed hook input: {exc}", file=sys.stderr)
        return 0

    bootstrap_project()
    try:
        register_in_hub(session_id=payload.get("session_id"))
    except Exception as exc:  # noqa: BLE001 — fail-soft per design
        print(f"[claudecadence] hub registration failed: {exc}", file=sys.stderr)

    event = payload.get("hook_event_name", "")
    handler = HANDLERS.get(event)
    if handler is None:
        return 0

    try:
        node = handler(payload)
    except Exception as exc:  # noqa: BLE001 — fail-soft per design
        print(f"[claudecadence] handler error ({event}): {exc}", file=sys.stderr)
        return 0

    if node is None:
        return 0

    try:
        append_node(node)
    except Exception as exc:  # noqa: BLE001 — fail-soft per design
        print(f"[claudecadence] append error: {exc}", file=sys.stderr)
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
