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
    title = prompt.split("\n", 1)[0][:80]
    return {
        "agent": "founder",
        "kind": "response",
        "status": "completed",
        "title": title,
        "summary": prompt[:120] + ("…" if len(prompt) > 120 else ""),
        "tags": ["prompt"],
        "session": payload.get("session_id", "main")[:12],
        "blocks": [{"type": "markdown", "value": prompt[:2000]}] if len(prompt) > 80 else [],
    }


def handle_pre_tool_use(payload: dict) -> dict | None:
    tool = payload.get("tool_name", "")
    tool_input = payload.get("tool_input", {}) or {}
    if tool in ("Agent", "Task"):
        sub = tool_input.get("subagent_type") or tool_input.get("description") or "subagent"
        return {
            "agent": "orchestrator",
            "kind": "fork",
            "status": "in_progress",
            "title": f"Dispatched sub-agent: {sub}",
            "summary": (tool_input.get("description") or tool_input.get("prompt", ""))[:120],
            "tags": ["fork", "dispatch", str(sub)],
            "session": payload.get("session_id", "main")[:12],
        }
    return None


def handle_post_tool_use(payload: dict) -> dict | None:
    tool = payload.get("tool_name", "")
    tool_input = payload.get("tool_input", {}) or {}
    tool_response = payload.get("tool_response", {})
    session_id = payload.get("session_id", "main")[:12]

    if tool in ("Agent", "Task"):
        sub = tool_input.get("subagent_type") or "subagent"
        result_text = ""
        if isinstance(tool_response, dict):
            result_text = (tool_response.get("result") or tool_response.get("content") or "")[:200]
        elif isinstance(tool_response, str):
            result_text = tool_response[:200]
        return {
            "agent": str(sub),
            "kind": "merge",
            "status": "completed",
            "title": f"Sub-agent returned: {sub}",
            "summary": result_text or "completed",
            "tags": ["merge", "subagent", str(sub)],
            "session": session_id,
        }

    if tool == "Bash":
        cmd = (tool_input.get("command") or "").strip()
        if not cmd:
            return None
        # Only emit nodes for git/gh/PR-shaped commands. Skip the rest to avoid log noise.
        if not re.search(r"\b(gh|git)\b", cmd):
            return None
        kind = "ci" if "gh run" in cmd else ("pr" if "gh pr" in cmd else "commit")
        first_line = cmd.split("\n", 1)[0]
        if len(first_line) > 100:
            first_line = first_line[:100] + "…"
        return {
            "agent": "external",
            "kind": kind,
            "status": "completed",
            "title": first_line,
            "summary": "(via Bash hook)",
            "tags": ["bash", kind],
            "session": session_id,
            "blocks": [{"type": "code", "lang": "bash", "value": cmd[:2000]}],
        }
    return None


def handle_subagent_stop(payload: dict) -> dict | None:
    session_id = payload.get("session_id", "main")[:12]
    return {
        "agent": "orchestrator",
        "kind": "merge",
        "status": "completed",
        "title": "Sub-agent finished",
        "summary": "Returned to orchestrator",
        "tags": ["subagent", "stop"],
        "session": session_id,
    }


def handle_stop(payload: dict) -> dict | None:
    session_id = payload.get("session_id", "main")[:12]
    return {
        "agent": "orchestrator",
        "kind": "response",
        "status": "completed",
        "title": "Turn ended",
        "summary": "Session turn complete; awaiting next prompt.",
        "tags": ["stop"],
        "session": session_id,
    }


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
