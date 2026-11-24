#!/usr/bin/env python3
"""Build the static launcher mark from the checked-in icon sources.

The launcher is deliberately not localized. The app-icon renderer writes four
master layers: the rounded icon, a full-bleed maskable square, the adaptive
background and the adaptive foreground. This script is the single source for
the web favicon/touch sizes, the boot-splash UI mark, the maskable PWA art, and
every Android density, including the system launch icon.
It writes a snapshot file as it goes, so a stale output or a changed master is
visible in review instead of only on a phone.

    node scripts/build-app-icon.mjs
    python3 scripts/build-static-icons.py --write
    node scripts/check-icon-snapshots.mjs
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
SOURCES = {
    "assets/icon.png": ROOT / "assets/icon.png",
    "assets/icon-maskable.png": ROOT / "assets/icon-maskable.png",
    "assets/icon-adaptive-background.png": ROOT / "assets/icon-adaptive-background.png",
    "assets/icon-adaptive-foreground.png": ROOT / "assets/icon-adaptive-foreground.png",
}
SNAPSHOTS = ROOT / "assets/icon-snapshots.json"

DENSITIES = [
    ("ldpi", 36, 81),
    ("mdpi", 48, 108),
    ("hdpi", 72, 162),
    ("xhdpi", 96, 216),
    ("xxhdpi", 144, 324),
    ("xxxhdpi", 192, 432),
]
# (path, size, source layer). Apple's touch icon is square because iOS applies
# its own squircle; the regular browser sizes keep the rounded plate.
WEB = [
    ("icons/icon-180.png", 180, "assets/icon-maskable.png"),
    ("icons/icon-192.png", 192, "assets/icon.png"),
    ("icons/icon-512.png", 512, "assets/icon.png"),
    ("icons/icon-1024.png", 1024, "assets/icon.png"),
    ("icons/icon-maskable-512.png", 512, "assets/icon-maskable.png"),
    ("icons/icon-maskable-1024.png", 1024, "assets/icon-maskable.png"),
]
# The boot splash draws the mark at up to 152 CSS px, so it needs 456 px for a
# 3x screen. WebP keeps that near 8 KiB where a PNG would be about 120 KiB, and
# the Chromium 60 WebView floor renders it.
SPLASH_MARK = ("icons/mark-456.webp", 456, "assets/icon.png", 80)
# Android draws windowSplashScreenAnimatedIcon at 288dp and masks the inner
# 192dp circle. The old launch theme used the 108dp adaptive icon, which the
# system scaled 2.67x at every density; this 288dp drawable carries the rounded
# mark in the inner two-thirds, so the mask sees the plate at 1:1. WebP keeps
# the six densities near 60 KiB where lossless PNG would add about 800 KiB.
SPLASH_ICON_DP = 288
SPLASH_ICON_QUALITY = 90
ANDROID = [
    "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml",
    "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml",
    "android/app/src/main/res/values/ic_launcher_background.xml",
]
ADAPTIVE_XML = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
"""
BACKGROUND_XML = """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#3b3833</color>
</resources>
"""


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


def round_icon(image: Image.Image, size: int) -> Image.Image:
    art = resize(image, size)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    art.putalpha(Image.composite(art.getchannel("A"), Image.new("L", (size, size), 0), mask))
    return art


def build() -> tuple[dict[str, bytes], list[dict]]:
    layers = {path: Image.open(file).convert("RGBA") for path, file in SOURCES.items()}
    files: dict[str, bytes] = {}
    entries: list[dict] = []

    for relative, size, source in WEB:
        image = resize(layers[source], size)
        data = save_png(image)
        files[relative] = data
        entries.append(entry(relative, data, image.size))

    relative, size, source, quality = SPLASH_MARK
    image = resize(layers[source], size)
    data = save_webp(image, quality)
    files[relative] = data
    entries.append(entry(relative, data, image.size))

    res = ROOT / "android/app/src/main/res"
    for qualifier, legacy_size, foreground_size in DENSITIES:
        splash_size = round(legacy_size / 48 * SPLASH_ICON_DP)
        art = round(splash_size * 2 / 3)
        if art > layers["assets/icon.png"].width:
            raise SystemExit(
                f"[static icons] the {qualifier} splash icon needs {art}px of art from a "
                f"{layers['assets/icon.png'].width}px master; it would be upscaled"
            )
        splash = Image.new("RGBA", (splash_size, splash_size), (0, 0, 0, 0))
        splash.alpha_composite(
            resize(layers["assets/icon.png"], art),
            ((splash_size - art) // 2, (splash_size - art) // 2),
        )
        data = save_webp(splash, SPLASH_ICON_QUALITY)
        relative = f"android/app/src/main/res/drawable-{qualifier}/splash_icon.webp"
        files[relative] = data
        entries.append(entry(relative, data, splash.size))

        directory = res / f"mipmap-{qualifier}"
        generated = {
            "ic_launcher_background.png": resize(layers["assets/icon-adaptive-background.png"], foreground_size),
            "ic_launcher_foreground.png": resize(layers["assets/icon-adaptive-foreground.png"], foreground_size),
            "ic_launcher.png": legacy(layers["assets/icon.png"], legacy_size),
            "ic_launcher_round.png": round_icon(layers["assets/icon.png"], legacy_size),
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
    source_bytes = {path: file.read_bytes() for path, file in SOURCES.items()}
    snapshot = {
        "source": "assets/icon.png",
        "sourceSha256": digest(source_bytes["assets/icon.png"]),
        "sources": {path: digest(data) for path, data in source_bytes.items()},
        "files": entries,
    }
    return files, [snapshot]


def save_png(image: Image.Image) -> bytes:
    from io import BytesIO

    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def save_webp(image: Image.Image, quality: int) -> bytes:
    from io import BytesIO

    buffer = BytesIO()
    image.save(buffer, format="WEBP", quality=quality, method=6)
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
    if current.get("sources") != expected.get("sources"):
        problems.append("an icon source changed; rebuild the icons and snapshots")

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
    print(f"[static icons] {len(expected['files'])} files match the icon sources and their snapshots")
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
