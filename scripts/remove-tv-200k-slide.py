#!/usr/bin/env python3
"""Remove only the obsolete $200,000 monthly installment slide from TV deck 1.6.17."""
import hashlib
import io
from pathlib import Path
from zipfile import ZipFile
from pptx import Presentation

SOURCE_SHA256="946c43c4221cbd6c738d2e92e024f3d37f281f5450f403c2b2277dcc38608aa8"
REMOVE_SLIDE=32
source=Path("MasDuenos_Liniers_2026_Actualizada.pptx")
target=Path("MasDuenos_Liniers_2026_Sin_Diapositiva_200mil.pptx")

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

original=source.read_bytes()
if sha(original)!=SOURCE_SHA256:
    raise RuntimeError("Unexpected source PowerPoint checksum, refusing wrong source")
prs=Presentation(io.BytesIO(original))
if len(prs.slides)!=40:
    raise RuntimeError("Expected 40 slides")
before=[slide.part.blob for slide in prs.slides]
id_to_remove=prs.slides._sldIdLst[REMOVE_SLIDE-1]
prs.part.drop_rel(id_to_remove.rId)
prs.slides._sldIdLst.remove(id_to_remove)
prs.save(target)
updated=Presentation(target)
if len(updated.slides)!=39:
    raise RuntimeError("Expected exactly 39 slides after removing #32")
after=[slide.part.blob for slide in updated.slides]
if after!=before[:31]+before[32:]:
    raise RuntimeError("Non-target slide unexpectedly changed")
with ZipFile(source) as z1, ZipFile(target) as z2:
    if z2.testzip() is not None:
        raise RuntimeError("Corrupted PPTX ZIP")
    vids=[n for n in z1.namelist() if n.startswith("ppt/media/") and n.lower().endswith((".mp4",".mov",".m4v"))]
    if not vids or not all(n in z2.namelist() and z1.read(n)==z2.read(n) for n in vids):
        raise RuntimeError("Embedded Geraldine video is missing or changed")
print("PASS: slide 32 removed, 39 slides total")
print("PASS: every remaining slide is unchanged, including updated marketing figures")
print("PASS: Geraldine video and related slides preserved")
print("OUTPUT",target,target.stat().st_size,"SHA256",sha(target.read_bytes()))
