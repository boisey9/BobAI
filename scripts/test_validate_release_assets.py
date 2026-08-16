#!/usr/bin/env python3

from __future__ import annotations

import json
import struct
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import validate_release_assets as validation


def png_chunk(chunk_type: bytes, payload: bytes) -> bytes:
    # The validator intentionally does not verify CRC values, so a zero CRC is
    # sufficient for focused chunk-structure regression tests.
    return (
        struct.pack(">I", len(payload))
        + chunk_type
        + payload
        + b"\x00\x00\x00\x00"
    )


def rgb_png(width: int, height: int, include_trns: bool) -> bytes:
    ihdr = struct.pack(
        ">IIBBBBB",
        width,
        height,
        8,  # bit depth
        2,  # truecolour / RGB
        0,
        0,
        0,
    )
    chunks = [png_chunk(b"IHDR", ihdr)]
    if include_trns:
        chunks.append(png_chunk(b"tRNS", b"\x00" * 6))
    chunks.append(png_chunk(b"IEND", b""))
    return validation.PNG_SIGNATURE + b"".join(chunks)


class ReleaseAssetValidationTests(unittest.TestCase):
    def make_icon_set(self, root: Path, *, include_trns: bool) -> None:
        icon_set = root / "AppIcon.appiconset"
        icon_set.mkdir(parents=True)
        (icon_set / "Contents.json").write_text(
            json.dumps(
                {
                    "images": [
                        {
                            "filename": "BobAI-AppIcon-1024.png",
                            "idiom": "universal",
                            "platform": "ios",
                            "size": "1024x1024",
                        }
                    ],
                    "info": {"author": "xcode", "version": 1},
                }
            ),
            encoding="utf-8",
        )
        (icon_set / "BobAI-AppIcon-1024.png").write_bytes(
            rgb_png(1024, 1024, include_trns)
        )

    def test_accepts_opaque_rgb_app_icon(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            assets = Path(directory)
            self.make_icon_set(assets, include_trns=False)

            with patch.object(validation, "ASSETS", assets):
                validation.validate_app_icon()

    def test_rejects_rgb_app_icon_with_trns_transparency(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            assets = Path(directory)
            self.make_icon_set(assets, include_trns=True)

            with patch.object(validation, "ASSETS", assets):
                with self.assertRaisesRegex(
                    validation.ValidationError,
                    "tRNS transparency",
                ):
                    validation.validate_app_icon()


if __name__ == "__main__":
    unittest.main()
