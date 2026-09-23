#!/usr/bin/env python3
"""Build a single self-contained index.html from the modular source in js/ + css/.

The modular files stay the source of truth. This inlines the CSS and merges every
module, in dependency order, into one inline <script type="module"> so the result
can be opened by double-clicking index.html (file://). Three.js is pulled from a
CDN — https CDN imports are allowed over file://, local module files are not.

Run:
  python build.py              # local dev (may include elevenlabs-config.js)
  python build.py --prod       # production — no API keys in the bundle
  BLOCKWORDS_PROD=1 python build.py
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Order matters: definitions first, main.js last (it boots the game on load).
JS_ORDER = [
    "js/noise.js",
    "js/blocks.js",
    "js/atlas.js",
    "js/worldgen.js",
    "js/chunk.js",
    "js/world.js",
    "js/items.js",
    "js/crafting.js",
    "js/inventory.js",
    "js/player.js",
    "js/entities.js",
    "js/sky.js",
    "js/audio.js",
    "js/elevenlabs-config.js",
    "js/speech.js",
    "js/words.js",
    "js/quests.js",
    "js/ui.js",
    "js/teacher-config.js",
    "js/firebase-config.js",
    "js/saves.js",
    "js/main.js",
]

IMPORT_RE = re.compile(r"^\s*import\b")
EXPORT_RE = re.compile(r"^(\s*)export\s+")


def is_prod() -> bool:
    if os.environ.get("BLOCKWORDS_PROD", "").lower() in ("1", "true", "yes"):
        return True
    return "--prod" in sys.argv


def strip_module_syntax(src: str) -> str:
    """Drop import statements (single or multi-line) and the `export ` keyword."""
    out = []
    in_import = False
    for line in src.splitlines():
        if in_import:
            if "from " in line or line.rstrip().endswith(";"):
                in_import = False
            continue
        if IMPORT_RE.match(line):
            if "from " not in line and not line.rstrip().endswith(";"):
                in_import = True
            continue
        out.append(EXPORT_RE.sub(r"\1", line))
    return "\n".join(out)


TOP_DECL_RE = re.compile(r"^(?:export\s+)?(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)")

# Browser globals a module must never redeclare: in the merged bundle every
# top-level name shares one scope, so `const Audio = {...}` in one file hides
# `new Audio()` in every other file.
SHADOW_GUARD = {
    "Audio", "Image", "Option", "Map", "Set", "Event", "Node", "Text", "Range",
    "Selection", "Request", "Response", "Headers", "URL", "Blob", "File",
    "Element", "Document", "Window", "Screen", "Storage", "Performance",
    "Animation", "Worker", "Notification", "Location", "History", "Promise",
    "Symbol", "Error", "Date", "Math", "JSON", "Number", "String", "Object",
    "Array", "Function", "Boolean", "RegExp", "Proxy", "Reflect",
}


def check_top_level_names(files: list[tuple[str, str]]) -> None:
    """Fail the build on a duplicate top-level name or a shadowed browser global."""
    seen: dict[str, str] = {}
    problems = []
    for rel, src in files:
        for line in src.splitlines():
            m = TOP_DECL_RE.match(line)
            if not m:
                continue
            name = m.group(1)
            if name in SHADOW_GUARD:
                problems.append(f"{rel}: top-level `{name}` shadows the browser global")
            if name in seen and seen[name] != rel:
                problems.append(f"{rel}: `{name}` is already declared in {seen[name]}")
            seen.setdefault(name, rel)
    if problems:
        print("Build failed — names clash in the merged bundle:")
        for p in problems:
            print("  " + p)
        sys.exit(1)


def load_env_file(path: Path) -> dict[str, str]:
    """Read KEY=value lines from a .env file."""
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def project_env() -> dict[str, str]:
    """Merge process env with .env.local (file wins for local dev)."""
    merged = dict(os.environ)
    merged.update(load_env_file(ROOT / ".env.local"))
    return merged


def write_elevenlabs_config(prod: bool) -> None:
    """Write js/elevenlabs-config.js for local dev only — never in production."""
    if prod:
        path = ROOT / "js/elevenlabs-config.js"
        if path.exists():
            path.unlink()
            print("  prod: removed elevenlabs-config.js (use pre-recorded clips)")
        return
    env = project_env()
    api_key = env.get("ELEVENLABS_API_KEY")
    if not api_key or api_key == "YOUR_API_KEY":
        return
    example = ROOT / "js/elevenlabs-config.example.js"
    if not example.exists():
        return
    src = example.read_text(encoding="utf-8").replace("YOUR_API_KEY", api_key)
    path = ROOT / "js/elevenlabs-config.js"
    path.write_text(src, encoding="utf-8")
    print(f"  wrote {path.name} from .env.local")


def write_firebase_config() -> None:
    """Write js/firebase-config.js from environment variables (Vercel / CI)."""
    env = project_env()
    keys = {
        "apiKey": env.get("FIREBASE_API_KEY"),
        "authDomain": env.get("FIREBASE_AUTH_DOMAIN"),
        "projectId": env.get("FIREBASE_PROJECT_ID"),
        "storageBucket": env.get("FIREBASE_STORAGE_BUCKET"),
        "messagingSenderId": env.get("FIREBASE_MESSAGING_SENDER_ID"),
        "appId": env.get("FIREBASE_APP_ID"),
    }
    if not keys["apiKey"] or not keys["projectId"]:
        return
    lines = ["export const FIREBASE_CONFIG = {"]
    for name, value in keys.items():
        lines.append(f"  {name}: {json.dumps(value)},")
    lines.append("};")
    path = ROOT / "js/firebase-config.js"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"  wrote {path.name} from environment")


def write_teacher_config() -> None:
    """Write js/teacher-config.js with teacher PIN from environment."""
    env = project_env()
    pin = env.get("TEACHER_PIN", "4826")
    path = ROOT / "js/teacher-config.js"
    path.write_text(
        f"export const TEACHER_PIN = {json.dumps(pin)};\n",
        encoding="utf-8",
    )
    print(f"  wrote {path.name}")


def build_js_order(prod: bool) -> list[str]:
    order = list(JS_ORDER)
    if prod:
        order = [p for p in order if p != "js/elevenlabs-config.js"]
    return order


def main() -> None:
    prod = is_prod()
    if prod:
        print("  production build (no ElevenLabs API key in bundle)")
    write_elevenlabs_config(prod)
    write_firebase_config()
    write_teacher_config()
    css = (ROOT / "css/style.css").read_text(encoding="utf-8")

    chunks = []
    sources = []
    for rel in build_js_order(prod):
        path = ROOT / rel
        if not path.exists():
            print(f"  skip (missing): {rel}")
            continue
        src = path.read_text(encoding="utf-8")
        sources.append((rel, src))
        chunks.append(f"// ===== {rel} =====\n{strip_module_syntax(src)}")
    check_top_level_names(sources)
    js = "\n\n".join(chunks)

    template = (ROOT / "build/template.html").read_text(encoding="utf-8")
    html = template.replace("/*__CSS__*/", css).replace("/*__JS__*/", js)

    out = ROOT / "index.html"
    out.write_text(html, encoding="utf-8")
    print(f"Built {out.name} ({len(html):,} bytes) from {len(chunks)} modules.")


if __name__ == "__main__":
    main()
