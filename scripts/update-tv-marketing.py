#!/usr/bin/env python3
"""Update raster-only Liniers PPTX marketing slides without rewriting OOXML.

The PPTX is a 40-page deck of four picture tiles per slide. Replacing only
the picture parts on slides 2, 15 and 20 preserves *all* movie relationships,
video action timing, slide count, layouts, native Geraldine geometry, etc.

This script runs during GitHub Actions after verified Hostinger download and
BEFORE prerendering 40 display JPEGs. Slide graphics stay offline in the APK.
"""
from __future__ import annotations
import argparse
from collections import Counter
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import statistics
import zipfile

from PIL import Image, ImageDraw, ImageFont
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE

KNOWN_SHA = "bdb35bfa366b7c2570a36a0d5b1172836765d50796a8e772345b5a5ccf6f25c7"
KNOWN_SIZE = 34796967
WIDTH, HEIGHT = 1920, 1080
SCALE = 2
RED = (255, 68, 55)
FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
]
FONT_PATH = next((p for p in FONT_PATHS if Path(p).is_file()), None)
if not FONT_PATH:
    raise RuntimeError("DejaVu/Liberation bold fonts not available on runner")

def ttf(size):
    return ImageFont.truetype(FONT_PATH, round(size))

def b(value):
    return round(value * SCALE)

def draw_fitted(im, text, box, *, color, max_font, min_font=14):
    draw = ImageDraw.Draw(im)
    x0, y0, x1, y1 = [b(v) for v in box]
    max_w, max_h = x1-x0, y1-y0
    for size in range(round(max_font), round(min_font)-1, -1):
        font = ttf(size * SCALE)
        bbox = draw.textbbox((0, 0), text, font=font)
        w, h = bbox[2]-bbox[0], bbox[3]-bbox[1]
        if w <= max_w and h <= max_h:
            dx = x0 + (max_w-w)//2-bbox[0]
            dy = y0 + (max_h-h)//2-bbox[1]
            draw.text((dx,dy), text, font=font, fill=color)
            return
    raise RuntimeError("Text cannot fit in target box: " + text)

def make_canvas(prs, slide):
    canvas = Image.new("RGB", (WIDTH, HEIGHT), (255,255,255))
    tile_parts = {}
    for shape in slide.shapes:
        if shape.shape_type != MSO_SHAPE_TYPE.PICTURE:
            continue
        if not shape.width or not shape.height:
            continue
        im = Image.open(BytesIO(shape.image.blob)).convert("RGB")
        x0 = round(shape.left / prs.slide_width * WIDTH)
        y0 = round(shape.top / prs.slide_height * HEIGHT)
        w = round(shape.width / prs.slide_width * WIDTH)
        h = round(shape.height / prs.slide_height * HEIGHT)
        if w < 1 or h < 1: continue
        canvas.paste(im.resize((w, h), Image.Resampling.LANCZOS), (x0, y0))
        rel_id = shape._element.blipFill.blip.rEmbed
        part = slide.part.related_part(rel_id)
        key = str(part.partname).lstrip("/")
        tile_parts[key] = (x0, y0, w, h, im.size, shape.image.ext.lower())
    return canvas, tile_parts

def repaint_team(image):
    # The +200 heading sits on a flat off-white area (first of four tiles).
    # Change only the original '2' glyph to '3', retaining its plus and zeros.
    offwhite = image.getpixel((b(45), b(176)))
    draw = ImageDraw.Draw(image)
    draw.rectangle([b(114),b(164),b(177),b(252)],fill=offwhite)
    draw_fitted(image, "3", (115,169,177,247),color=RED,max_font=100)

def repaint_owners(image):
    # A deep near-black badge hides the previous +4.000 without breaking the
    # collage background, and stays well above the white subtitle.
    overlay = Image.new("RGBA",image.size,(0,0,0,0))
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle([b(305),b(208),b(660),b(300)],
                           radius=b(13), fill=(13,14,18,247))
    image.paste(Image.alpha_composite(image.convert("RGBA"),overlay).convert("RGB"))
    draw_fitted(image, "+4.700", (312,215,654,293),
                color=RED,max_font=92,min_font=70)

def repaint_google(image, screenshot=None):
    # Keep original white paper, testimonials, Google stars and the Spazios
    # building photograph. Update both the big count and Google card count.
    draw = ImageDraw.Draw(image)
    bg = image.getpixel((b(37), b(300)))
    draw.rectangle([b(44),b(302),b(187),b(339)],fill=bg)
    draw_fitted(image, "+3.000",(47,302,163,333),
                color=(11,12,16),max_font=31,min_font=25)
    if screenshot:
        # The provided portrait screenshot is cropped only to fit the existing
        # centre card; the original file remains unchanged.
        supplied = Image.open(screenshot).convert("RGB")
        x0,y0,x1,y1=(416,102,736,440)
        card_w,card_h=b(x1-x0),b(y1-y0)
        ratio=min(card_w/supplied.width,card_h/supplied.height)
        img=supplied.resize((round(supplied.width*ratio),
                             round(supplied.height*ratio)),Image.Resampling.LANCZOS)
        ImageDraw.Draw(image).rounded_rectangle([b(x0-3),b(y0-3),b(x1+3),b(y1+3)],
                           radius=b(9),fill=(255,255,255))
        image.paste(img,(b(x0)+(card_w-img.width)//2,
                         b(y0)+(card_h-img.height)//2))
    else:
        # No new source screenshot was accessible on the CI runner. Ensure
        # existing Google card still truthfully displays the new review count.
        bg2=image.getpixel((b(589),b(291)))
        draw.rectangle([b(496),b(292),b(667),b(316)],fill=bg2)
        draw_fitted(image,"3.022 opiniones en Google",(498,297,664,311),
                    color=(53,62,74),max_font=14,min_font=11)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--pptx",default="android-tv/app/src/main/assets/bundle/presentation.pptx")
    parser.add_argument("--manifest",default="android-tv/app/src/main/assets/bundle/manifest.json")
    parser.add_argument("--google-photo",type=Path,default=None)
    parser.add_argument("--preview-dir",type=Path,default=None)
    args=parser.parse_args()
    path=Path(args.pptx)
    original=path.read_bytes()
    digest=sha256(original).hexdigest()
    if len(original)!=KNOWN_SIZE or digest!=KNOWN_SHA:
        raise RuntimeError(f"Refusing to modify unknown presentation: {len(original)} bytes SHA {digest}")
    if args.google_photo and not args.google_photo.is_file():
        raise RuntimeError(f"Requested Google photo absent: {args.google_photo}")
    prs=Presentation(BytesIO(original))
    if len(prs.slides)!=40:
        raise RuntimeError("Expected 40 slides, not "+str(len(prs.slides)))
    replacement={}
    part_occurrences=Counter()
    for n,slide in enumerate(prs.slides,1):
        for sh in slide.shapes:
            if sh.shape_type==MSO_SHAPE_TYPE.PICTURE:
                p=str(slide.part.related_part(sh._element.blipFill.blip.rEmbed).partname).lstrip("/")
                part_occurrences[p]+=1
    for slide_no,editor in [
        (2,repaint_team),
        (15,lambda im:repaint_google(im,args.google_photo)),
        (20,repaint_owners),
    ]:
        canvas, parts=make_canvas(prs,prs.slides[slide_no-1])
        if len(parts)!=4:
            raise RuntimeError(f"Unexpected tile structure on slide {slide_no}: {len(parts)}")
        editor(canvas)
        if args.preview_dir:
            args.preview_dir.mkdir(parents=True,exist_ok=True)
            canvas.save(args.preview_dir/f"slide-{slide_no:02d}.jpg",format="JPEG",quality=86)
        for part, (x,y,w,h,dimensions,ext) in parts.items():
            if part_occurrences[part]!=1:
                raise RuntimeError(f"Shared media part would affect another slide: {part}")
            tile=canvas.crop((x,y,x+w,y+h)).resize(dimensions,Image.Resampling.LANCZOS)
            stream=BytesIO()
            if ext in ("jpg","jpeg"):
                tile.save(stream,format="JPEG",quality=95,subsampling=0,optimize=True)
            elif ext=="png":
                tile.save(stream,format="PNG",optimize=True)
            else:
                raise RuntimeError(f"Unsupported source image format: {part} {ext}")
            replacement[part]=stream.getvalue()
        print(f"Updated visual slide {slide_no}: {len(parts)} original image tiles replaced")
    temp=path.with_suffix(".patched.pptx")
    with zipfile.ZipFile(BytesIO(original)) as inp,zipfile.ZipFile(temp,"w") as out:
        names=set(inp.namelist())
        if not set(replacement)<=names:
            raise RuntimeError("Missing image parts: "+repr(set(replacement)-names))
        for info in inp.infolist():
            out.writestr(info,replacement.get(info.filename,inp.read(info.filename)))
    with zipfile.ZipFile(temp) as test:
        if test.testzip() is not None:raise RuntimeError("Repacked PPTX failed ZIP CRC")
    patched=temp.read_bytes()
    checked=Presentation(BytesIO(patched))
    assert len(checked.slides)==40
    assert len(checked.slides[20].shapes)==len(prs.slides[20].shapes)
    temp.replace(path)
    manifest_path=Path(args.manifest)
    metadata=json.loads(manifest_path.read_text())
    if metadata["presentation"]["sha256"]!=KNOWN_SHA:
        raise RuntimeError("Bundle manifest does not match expected original deck")
    metadata["presentation"]["source_sha256"]=KNOWN_SHA
    metadata["presentation"]["sha256"]=sha256(patched).hexdigest()
    metadata["presentation"]["size"]=len(patched)
    manifest_path.write_text(json.dumps(metadata,indent=2)+"\n")
    print(f"Updated PPTX: {len(patched)} bytes SHA-256 {sha256(patched).hexdigest()}")
    print("Slide count 40; original Geraldine movie and OOXML timing untouched")
if __name__=="__main__": main()
