#!/usr/bin/env python3
"""Generate committed BobAI PNG assets from the editable SVG sources."""

from __future__ import annotations

import sys
from pathlib import Path

try:
    import cairosvg
    from PIL import Image
except ImportError as exc:
    raise SystemExit(
        "Install the asset generator dependencies with: "
        "python3 -m pip install cairosvg pillow"
    ) from exc

ROOT = Path(__file__).resolve().parents[1]
DESIGN = ROOT / "docs" / "design"
ASSETS = ROOT / "BobAI" / "Resources" / "Assets.xcassets"


def render_svg(source: Path, destination: Path, size: int) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    cairosvg.svg2png(
        url=str(source),
        write_to=str(destination),
        output_width=size,
        output_height=size,
    )


def generate_app_icon() -> None:
    destination = (
        ASSETS
        / "AppIcon.appiconset"
        / "BobAI-AppIcon-1024.png"
    )
    render_svg(DESIGN / "BobAI-AppIcon.svg", destination, 1024)

    with Image.open(destination) as image:
        image.convert("RGB").save(
            destination,
            format="PNG",
            optimize=True,
        )


def generate_launch_images() -> None:
    source = DESIGN / "BobCoreLaunch.svg"
    image_set = ASSETS / "BobCoreLaunch.imageset"
    for filename, size in (
        ("BobCoreLaunch.png", 240),
        ("BobCoreLaunch@2x.png", 480),
        ("BobCoreLaunch@3x.png", 720),
    ):
        render_svg(source, image_set / filename, size)


def main() -> int:
    generate_app_icon()
    generate_launch_images()
    print("BobAI release PNG assets generated successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
