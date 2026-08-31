#!/usr/bin/env python3
"""Pre-generate core teaching speech lines with ElevenLabs (Alice voice).

Covers welcome, praise, vocabulary words and model sentences — not quest
templates (those stay live at runtime).

Usage:
  python scripts/generate_speech.py

Re-enumerates lines from enumerate_speech.mjs automatically.
Skips clips that already exist. Requires ELEVENLABS_API_KEY in .env.local.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LINES_PATH = ROOT / "scripts" / "speech-lines.json"
OUT_DIR = ROOT / "audio" / "speech"
MANIFEST_PATH = OUT_DIR / "manifest.json"
ENV_PATH = ROOT / ".env.local"

VOICE_ID = "Xb7hH8MSUJpSbSDYk0k2"  # Alice
VOICE_NAME = "Alice"
MODEL_ID = "eleven_turbo_v2_5"
VOICE_SETTINGS = {
    "stability": 0.55,
    "similarity_boost": 0.82,
    "style": 0.38,
    "use_speaker_boost": True,
}


def load_env() -> dict[str, str]:
    env = dict(os.environ)
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def speech_key(text: str) -> str:
    return " ".join(
        text.replace("_", " ").replace("*", " ").replace("#", " ").split()
    ).strip().lower()


def speech_file_id(text: str) -> str:
    return hashlib.sha1(speech_key(text).encode("utf-8")).hexdigest()[:12]


def load_lines() -> list[str]:
    script = ROOT / "scripts" / "enumerate_speech.mjs"
    raw = subprocess.check_output(["node", str(script)], cwd=ROOT)
    lines = json.loads(raw.decode("utf-8"))
    LINES_PATH.write_text(json.dumps(lines, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return lines


def load_manifest() -> dict:
    if MANIFEST_PATH.exists():
        return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return {"version": 1, "voice": VOICE_NAME, "voiceId": VOICE_ID, "lines": {}}


def save_manifest(manifest: dict) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    api_key = load_env().get("ELEVENLABS_API_KEY", "")
    if not api_key or not api_key.startswith("sk_"):
        print("ELEVENLABS_API_KEY missing or invalid in .env.local")
        sys.exit(1)

    from elevenlabs import ElevenLabs

    client = ElevenLabs(api_key=api_key)
    lines = load_lines()
    manifest = load_manifest()
    manifest["voice"] = VOICE_NAME
    manifest["voiceId"] = VOICE_ID
    mapping: dict[str, str] = manifest.get("lines", {})

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    made = 0
    skipped = 0
    failed = 0

    print(f"Generating {len(lines)} speech lines -> {OUT_DIR.relative_to(ROOT)}/")

    for i, text in enumerate(lines, 1):
        key = speech_key(text)
        file_id = speech_file_id(text)
        filename = f"{file_id}.mp3"
        out_path = OUT_DIR / filename

        if out_path.exists() and out_path.stat().st_size > 500:
            mapping[key] = filename
            skipped += 1
            continue

        try:
            audio = client.text_to_speech.convert(
                voice_id=VOICE_ID,
                text=text,
                model_id=MODEL_ID,
                voice_settings=VOICE_SETTINGS,
                output_format="mp3_44100_128",
            )
            with open(out_path, "wb") as f:
                for chunk in audio:
                    f.write(chunk)
            mapping[key] = filename
            made += 1
            if i % 25 == 0 or made <= 3:
                print(f"  [{i}/{len(lines)}] {text[:60]}{'…' if len(text) > 60 else ''}")
            time.sleep(0.15)
        except Exception as exc:
            failed += 1
            print(f"  FAIL [{i}] {text[:50]}… — {exc}")
            time.sleep(1.0)

        if i % 50 == 0:
            manifest["lines"] = mapping
            save_manifest(manifest)

    manifest["lines"] = mapping
    save_manifest(manifest)
    print(f"Done: {made} new, {skipped} cached, {failed} failed, {len(mapping)} in manifest")


if __name__ == "__main__":
    main()
