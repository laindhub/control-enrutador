#!/usr/bin/env python3
"""Reject APK layouts Android 11+ cannot install, even with a valid signature."""
import struct
import sys
import zipfile
from pathlib import Path


def verify(path):
    data = Path(path).read_bytes()
    with zipfile.ZipFile(path) as apk:
        assert apk.testzip() is None, "Corrupt ZIP entry"
        assert len(apk.namelist()) == len(set(apk.namelist())), "Duplicate entries"
        table = apk.getinfo("resources.arsc")
        assert table.compress_type == zipfile.ZIP_STORED, "resources.arsc must be uncompressed for targetSdk >= 30"
        header = struct.unpack_from("<I5H3I2H", data, table.header_offset)
        assert header[0] == 0x04034B50, "Invalid local ZIP header"
        offset = table.header_offset + 30 + header[-2] + header[-1]
        assert offset % 4 == 0, "resources.arsc must be aligned to 4 bytes"
        assert "AndroidManifest.xml" in apk.namelist(), "Missing manifest"
        dex = apk.read("classes.dex")
        assert dex.startswith(b"dex\n"), "Invalid DEX"
        assert struct.unpack_from("<I", dex, 32)[0] == len(dex), "Truncated DEX"
        print(f"PASS: {Path(path).name}: ZIP intact, resources stored/aligned, DEX intact")


if __name__ == "__main__":
    for file in sys.argv[1:]:
        verify(file)
