#!/usr/bin/env python3
"""Rebuild fonts/google-sans-flex.woff2 from the pinned Google Sans Flex source.

The app needs the ROND axis pinned at its maximum (the bouncy Material 3
Expressive cut) while keeping optical size and weight variable. The source is
the six-axis demo font from the Google Sans Flex repository, not the four-axis
release currently on Google Fonts.

    python3 -m pip install fonttools brotli
    python3 scripts/build-font.py

The codepoint set is read from the font being replaced, so the rebuild keeps
the same 321-character coverage and cannot silently add or drop a glyph. Use
--output to build somewhere other than fonts/google-sans-flex.woff2.
"""

from __future__ import annotations

import argparse
import pathlib
import sys
import tempfile
import urllib.parse
import urllib.request

from fontTools.subset import Subsetter, Options
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
COMMIT = "9c3785b85ddc03f7f4449031399c99f850da3612"
SOURCE_NAME = "GoogleSansFlex[GRAD,ROND,opsz,slnt,wdth,wght]-144B3.ttf"
SOURCE_URL = (
    "https://raw.githubusercontent.com/googlefonts/googlesans-flex/"
    + COMMIT
    + "/documentation/demo-fonts/"
    + urllib.parse.quote(SOURCE_NAME)
)
DEFAULT_OUTPUT = ROOT / "fonts/google-sans-flex.woff2"
PINS = {"ROND": 100, "GRAD": 0, "slnt": 0, "wdth": 100}
KEEP_AXES = ("opsz", "wght")


def download_source() -> pathlib.Path:
    handle, name = tempfile.mkstemp(suffix=".ttf", prefix="google-sans-flex-")
    path = pathlib.Path(name)
    request = urllib.request.Request(SOURCE_URL, headers={"User-Agent": "sixfold-font-build"})
    with urllib.request.urlopen(request, timeout=120) as response, open(handle, "wb") as out:
        out.write(response.read())
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=pathlib.Path, help="local source TTF (default: download the pinned commit)")
    parser.add_argument("--output", type=pathlib.Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--unicodes-from", type=pathlib.Path, default=DEFAULT_OUTPUT,
                        help="font whose cmap defines the subset (default: the output path)")
    args = parser.parse_args()

    reference = args.unicodes_from if args.unicodes_from.exists() else DEFAULT_OUTPUT
    if not reference.exists():
        print("error: no reference font to read the codepoint set from", file=sys.stderr)
        return 1
    codepoints = sorted(TTFont(reference).getBestCmap())
    print(f"coverage: {len(codepoints)} codepoints from {reference}")

    source = args.source or download_source()
    try:
        font = TTFont(source)
        axes = {axis.axisTag: axis for axis in font["fvar"].axes} if "fvar" in font else {}
        missing = [tag for tag in (*PINS, *KEEP_AXES) if tag not in axes]
        if missing:
            print(f"error: source is missing axes: {', '.join(missing)}", file=sys.stderr)
            return 1
        print("source axes: " + ", ".join(f"{tag} {axes[tag].minValue:g}..{axes[tag].maxValue:g}" for tag in axes))

        # Subset before instancing. Subsetting the instanced font trips a
        # GDEF VarStore reference to a dropped glyph ('uni2002') in current
        # fontTools; the subset-first order produces the same 399-glyph,
        # four-feature font. Keep the same four layout features as the shipped
        # file so a rebuild does not pull in fractions or numerators.
        options = Options()
        options.flavor = "woff2"
        options.notdef_outline = True
        options.recalc_bounds = True
        options.layout_features = ["calt", "liga", "locl", "kern"]
        subsetter = Subsetter(options=options)
        subsetter.populate(unicodes=codepoints)
        subsetter.subset(font)
        font = instantiateVariableFont(font, PINS, inplace=False, updateFontNames=False)
        font.flavor = "woff2"
        args.output.parent.mkdir(parents=True, exist_ok=True)
        font.save(args.output)
    finally:
        if args.source is None:
            source.unlink(missing_ok=True)

    built = TTFont(args.output)
    built_axes = {axis.axisTag: (axis.minValue, axis.maxValue) for axis in built["fvar"].axes} if "fvar" in built else {}
    built_cmap = set(built.getBestCmap())
    missing = sorted(set(codepoints) - built_cmap)
    if missing:
        print(f"error: output is missing U+{missing[0]:04X} and {len(missing) - 1} more", file=sys.stderr)
        return 1
    if any(tag not in built_axes for tag in KEEP_AXES):
        print("error: output lost a variable axis", file=sys.stderr)
        return 1

    size = args.output.stat().st_size
    print(f"wrote {args.output} ({size / 1024:.1f} KB)")
    print("kept axes: " + ", ".join(f"{tag} {built_axes[tag][0]:g}..{built_axes[tag][1]:g}" for tag in KEEP_AXES))
    print(f"pinned: {', '.join(f'{tag}={value:g}' for tag, value in PINS.items())}")
    print(f"cmap: {len(built_cmap)} codepoints")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
