#!/usr/bin/env python3
"""Build a single self-contained index.html from the modular source in js/ + css/.

The modular files stay the source of truth. This inlines the CSS and merges every
module, in dependency order, into one inline <script type="module"> so the result
can be opened by double-clicking index.html (file://). Three.js is pulled from a
CDN — https CDN imports are allowed over file://, local module files are not.

Run:  python build.py
"""
import json
import os
import re
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
    "js/firebase-config.js",
    "js/saves.js",
    "js/main.js",
]

IMPORT_RE = re.compile(r"^\s*import\b")
EXPORT_RE = re.compile(r"^(\s*)export\s+")


def strip_module_syntax(src: str) -> str:
    """Drop import statements (single or multi-line) and the `export ` keyword.

    Every module ends up in one shared scope, so imported names resolve on their
    own; only the statements themselves have to go.
    """
    out = []
    in_import = False
    for line in src.splitlines():
        if in_import:
            # A multi-line import ends on the line that closes it.
            if "from " in line or line.rstrip().endswith(";"):
                in_import = False
            continue
        if IMPORT_RE.match(line):
            # If the statement has not finished on this line, keep skipping.
            if "from " not in line and not line.rstrip().endswith(";"):
                in_import = True
            continue
        out.append(EXPORT_RE.sub(r"\1", line))
    return "\n".join(out)


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


def write_elevenlabs_config() -> None:
    """Write js/elevenlabs-config.js from .env.local or environment variables."""
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
    keys = {
        "apiKey": os.environ.get("FIREBASE_API_KEY"),
        "authDomain": os.environ.get("FIREBASE_AUTH_DOMAIN"),
        "projectId": os.environ.get("FIREBASE_PROJECT_ID"),
        "storageBucket": os.environ.get("FIREBASE_STORAGE_BUCKET"),
        "messagingSenderId": os.environ.get("FIREBASE_MESSAGING_SENDER_ID"),
        "appId": os.environ.get("FIREBASE_APP_ID"),
    }
    if not keys["apiKey"] or not keys["projectId"]:
        return
    lines = ["export const FIREBASE_CONFIG = {"]
    for name, value in keys.items():
        lines.append(f"  {name}: {json.dumps(value)},")
    lines.append("};")
    path = ROOT / "js/firebase-config.js"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"  wrote {path.name} from environment variables")


def main() -> None:
    write_elevenlabs_config()
    write_firebase_config()
    css = (ROOT / "css/style.css").read_text(encoding="utf-8")

    chunks = []
    for rel in JS_ORDER:
        path = ROOT / rel
        if not path.exists():
            print(f"  skip (missing): {rel}")
            continue
        chunks.append(f"// ===== {rel} =====\n{strip_module_syntax(path.read_text(encoding='utf-8'))}")
    js = "\n\n".join(chunks)

    template = (ROOT / "build/template.html").read_text(encoding="utf-8")
    html = template.replace("/*__CSS__*/", css).replace("/*__JS__*/", js)

    out = ROOT / "index.html"
    out.write_text(html, encoding="utf-8")
    print(f"Built {out.name} ({len(html):,} bytes) from {len(chunks)} modules.")


if __name__ == "__main__":
    main()
