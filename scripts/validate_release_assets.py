#!/usr/bin/env python3
"""Validate BobAI release-critical iOS assets without third-party packages."""

from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "BobAI" / "Resources" / "Assets.xcassets"
PROJECT = ROOT / "project.yml"
LAUNCH_STORYBOARD = (
    ROOT / "BobAI" / "Resources" / "LaunchScreen.storyboard"
)
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


class ValidationError(RuntimeError):
    pass


def png_info(path: Path) -> tuple[int, int, int, bool]:
    data = path.read_bytes()
    if data[:8] != PNG_SIGNATURE:
        raise ValidationError(f"{path} is not a PNG file")

    width: int | None = None
    height: int | None = None
    color_type: int | None = None
    has_transparency_chunk = False
    offset = len(PNG_SIGNATURE)
    saw_iend = False

    while offset + 12 <= len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        chunk_type = data[offset + 4 : offset + 8]
        payload_start = offset + 8
        payload_end = payload_start + length
        chunk_end = payload_end + 4  # trailing CRC

        if chunk_end > len(data):
            raise ValidationError(f"{path} contains a truncated PNG chunk")

        if chunk_type == b"IHDR":
            if length != 13:
                raise ValidationError(f"{path} has an invalid PNG IHDR chunk")
            width, height, _bit_depth, color_type = struct.unpack(
                ">IIBB", data[payload_start : payload_start + 10]
            )
        elif chunk_type == b"tRNS":
            has_transparency_chunk = True
        elif chunk_type == b"IEND":
            saw_iend = True
            break

        offset = chunk_end

    if width is None or height is None or color_type is None:
        raise ValidationError(f"{path} has no PNG IHDR chunk")
    if not saw_iend:
        raise ValidationError(f"{path} has no PNG IEND chunk")

    return width, height, color_type, has_transparency_chunk


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def load_json(path: Path) -> dict[str, object]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValidationError(
            f"Invalid JSON at {path}: {exc}"
        ) from exc


def validate_app_icon() -> None:
    icon_set = ASSETS / "AppIcon.appiconset"
    manifest = load_json(icon_set / "Contents.json")
    images = manifest.get("images")
    require(
        isinstance(images, list) and len(images) == 1,
        "AppIcon must contain one universal source image",
    )

    filename = (
        images[0].get("filename")
        if isinstance(images[0], dict)
        else None
    )
    require(
        filename == "BobAI-AppIcon-1024.png",
        "AppIcon manifest filename is incorrect",
    )

    icon = icon_set / str(filename)
    width, height, color_type, has_transparency_chunk = png_info(icon)
    require(
        (width, height) == (1024, 1024),
        "AppIcon must be exactly 1024 x 1024",
    )
    require(
        color_type in {0, 2, 3},
        "AppIcon must be opaque and must not contain an alpha channel",
    )
    require(
        not has_transparency_chunk,
        "AppIcon must be opaque and must not contain a tRNS transparency chunk",
    )


def validate_launch_assets() -> None:
    image_set = ASSETS / "BobCoreLaunch.imageset"
    manifest = load_json(image_set / "Contents.json")
    images = manifest.get("images")
    require(
        isinstance(images, list) and len(images) == 3,
        "Launch image set must include 1x, 2x, and 3x images",
    )

    expected = {
        "BobCoreLaunch.png": (240, 240),
        "BobCoreLaunch@2x.png": (480, 480),
        "BobCoreLaunch@3x.png": (720, 720),
    }
    for filename, dimensions in expected.items():
        width, height, _color_type, _has_trns = png_info(
            image_set / filename
        )
        require(
            (width, height) == dimensions,
            f"{filename} must be {dimensions[0]} x {dimensions[1]}",
        )

    storyboard = LAUNCH_STORYBOARD.read_text(encoding="utf-8")
    require(
        'launchScreen="YES"' in storyboard,
        "Launch storyboard is not marked as a launch screen",
    )
    require(
        'image="BobCoreLaunch"' in storyboard,
        "Launch storyboard does not reference BobCoreLaunch",
    )


def validate_project_settings() -> None:
    project = PROJECT.read_text(encoding="utf-8")
    require(
        "ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon" in project,
        "project.yml does not select the AppIcon asset catalog",
    )
    require(
        "INFOPLIST_KEY_UILaunchStoryboardName: LaunchScreen" in project,
        "project.yml does not select LaunchScreen.storyboard",
    )
    require(
        "INFOPLIST_KEY_UILaunchScreen_Generation" not in project,
        "Generated and storyboard launch screens must not both be enabled",
    )


def main() -> int:
    try:
        validate_app_icon()
        validate_launch_assets()
        validate_project_settings()
    except (OSError, ValidationError) as exc:
        print(
            f"Release asset validation failed: {exc}",
            file=sys.stderr,
        )
        return 1

    print("BobAI release assets validated successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
