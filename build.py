#!/usr/bin/env python3
"""Build a single self-contained index.html from the modular source in js/ + css/.

The modular files stay the source of truth. This inlines the CSS and merges every
module, in dependency order, into one inline <script type="module"> so the result
can be opened by double-clicking index.html (file://). Three.js is pulled from a
CDN — https CDN imports are allowed over file://, local module files are not.

Run:  python build.py
"""
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


def main() -> None:
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
