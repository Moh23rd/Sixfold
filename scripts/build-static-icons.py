#!/usr/bin/env python3
"""Build the static launcher mark from assets/icon.png.

The launcher is deliberately not localized. This script is the single source
for the web favicon/touch sizes, the maskable PWA art, and every Android
density. It writes a snapshot file as it goes, so a stale output or a changed
master is visible in review instead of only on a phone.

    python3 scripts/build-static-icons.py --write
    python3 scripts/check-icon-snapshots.mjs
    python3 scripts/build-static-icons.py --check
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/icon.png"
SNAPSHOTS = ROOT / "assets/icon-snapshots.json"
DARK = (59, 56, 51, 255)
CREAM = (246, 241, 232, 255)
MASKABLE_SCALE = 0.75
ADAPTIVE_XML = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
"""
BACKGROUND_XML = """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#f6f1e8</color>
</resources>
"""

DENSITIES = [
    ("ldpi", 36, 81),
    ("mdpi", 48, 108),
    ("hdpi", 72, 162),
    ("xhdpi", 96, 216),
    ("xxhdpi", 144, 324),
    ("xxxhdpi", 192, 432),
]
WEB = [
    ("icons/icon-180.png", 180),
    ("icons/icon-192.png", 192),
    ("icons/icon-512.png", 512),
    ("icons/icon-1024.png", 1024),
    ("icons/icon-maskable-512.png", 512),
    ("icons/icon-maskable-1024.png", 1024),
]
ANDROID = [
    "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml",
    "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml",
    "android/app/src/main/res/values/ic_launcher_background.xml",
]


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def resize(image: Image.Image, size: int) -> Image.Image:
    return image.resize((size, size), Image.Resampling.LANCZOS)


def legacy(image: Image.Image, size: int) -> Image.Image:
    # The pre-adaptive launcher art has a small safe margin inside its square.
    margin = round(size / 24)
    art = resize(image, size - margin * 2)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.alpha_composite(art, (margin, margin))
    return out


def maskable(image: Image.Image, size: int) -> Image.Image:
    # A maskable icon needs its important content inside the central safe zone,
    # and the transparent rounded corners of the normal mark must be filled.
    art_size = max(1, round(size * MASKABLE_SCALE))
    art = resize(image, art_size)
    out = Image.new("RGBA", (size, size), DARK)
    out.alpha_composite(art, ((size - art_size) // 2, (size - art_size) // 2))
    return out


def round_icon(image: Image.Image, size: int) -> Image.Image:
    art = resize(image, size)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    art.putalpha(Image.composite(art.getchannel("A"), Image.new("L", (size, size), 0), mask))
    return art


def build() -> tuple[dict[str, bytes], list[dict]]:
    source = Image.open(SOURCE).convert("RGBA")
    files: dict[str, bytes] = {}
    entries: list[dict] = []

    for relative, size in WEB:
        image = maskable(source, size) if "-maskable-" in relative else resize(source, size)
        data = save_png(image)
        files[relative] = data
        entries.append(entry(relative, data, image.size))

    res = ROOT / "android/app/src/main/res"
    for qualifier, legacy_size, foreground_size in DENSITIES:
        directory = res / f"mipmap-{qualifier}"
        generated = {
            "ic_launcher_background.png": Image.new("RGBA", (foreground_size, foreground_size), CREAM),
            "ic_launcher_foreground.png": resize(source, foreground_size),
            "ic_launcher.png": legacy(source, legacy_size),
            "ic_launcher_round.png": round_icon(source, legacy_size),
        }
        for name, image in generated.items():
            relative = f"android/app/src/main/res/mipmap-{qualifier}/{name}"
            data = save_png(image)
            files[relative] = data
            entries.append(entry(relative, data, image.size))

    for relative, data in [
        (ANDROID[0], ADAPTIVE_XML.encode("utf-8")),
        (ANDROID[1], ADAPTIVE_XML.encode("utf-8")),
        (ANDROID[2], BACKGROUND_XML.encode("utf-8")),
    ]:
        files[relative] = data
        entries.append({
            "path": relative,
            "bytes": len(data),
            "sha256": digest(data),
        })

    entries.sort(key=lambda item: item["path"])
    source_bytes = SOURCE.read_bytes()
    snapshot = {
        "source": "assets/icon.png",
        "sourceSha256": digest(source_bytes),
        "files": entries,
    }
    return files, [snapshot]


def save_png(image: Image.Image) -> bytes:
    from io import BytesIO

    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def entry(relative: str, data: bytes, size: tuple[int, int]) -> dict:
    return {
        "path": relative,
        "width": size[0],
        "height": size[1],
        "bytes": len(data),
        "sha256": digest(data),
    }


def write(files: dict[str, bytes], snapshots: list[dict]) -> None:
    for relative, data in files.items():
        path = ROOT / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    SNAPSHOTS.write_text(json.dumps(snapshots[0], indent=2) + "\n", encoding="utf-8")
    print(f"[static icons] wrote {len(files)} files and {len(snapshots[0]['files'])} snapshots")


def check(files: dict[str, bytes], snapshots: list[dict]) -> int:
    problems: list[str] = []
    expected = snapshots[0]
    if not SNAPSHOTS.exists():
        print("[static icons] assets/icon-snapshots.json is missing")
        return 1
    current = json.loads(SNAPSHOTS.read_text(encoding="utf-8"))
    if current.get("sourceSha256") != expected["sourceSha256"]:
        problems.append("assets/icon.png changed; rebuild the icons and snapshots")

    current_by_path = {item.get("path"): item for item in current.get("files", []) if isinstance(item, dict)}
    for item in expected["files"]:
        path = item["path"]
        built = files[path]
        if digest(built) != item["sha256"] or len(built) != item["bytes"]:
            problems.append(path + " does not match its snapshot")
        actual = ROOT / path
        if not actual.exists() or digest(actual.read_bytes()) != item["sha256"]:
            problems.append(path + " is missing or stale on disk")
        saved = current_by_path.get(path)
        if not saved or saved.get("sha256") != item["sha256"]:
            problems.append(path + " is missing from asset snapshots")
    if len(current.get("files", [])) != len(expected["files"]):
        problems.append("asset snapshots contain an unexpected number of files")

    if problems:
        for problem in problems:
            print("[static icons] " + problem, file=sys.stderr)
        return 1
    print(f"[static icons] {len(expected['files'])} files match assets/icon.png and their snapshots")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="verify the checked-in outputs")
    parser.add_argument("--write", action="store_true", help="write the generated outputs")
    args = parser.parse_args()
    if not args.write and not args.check:
        parser.error("use --write or --check")
    files, snapshots = build()
    if args.write:
        write(files, snapshots)
    if args.check:
        return check(files, snapshots)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
