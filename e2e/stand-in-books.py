#!/usr/bin/env python3
"""Makes stand-in audiobooks for the local ABS when archive.org can't be reached.

Each book is silent AAC audio in an M4B with evenly spaced chapters, and a made-up cover.
The covers are spread across the colour wheel on purpose (warm, cool, pale, near-black,
saturated), so you can see how the UI's tint sits next to different cover washes.
ABS reads author, series, sequence and narrator from the folder path, as with the
LibriVox books. Needs ffmpeg and Pillow. Idempotent: books that already exist are skipped.

    ./stand-in-books.py            # into data/audiobooks
"""
import os
import random
import shutil
import subprocess
import sys
import tempfile

try:
    from PIL import Image, ImageDraw, ImageFilter, ImageFont
except ImportError:
    sys.exit("Pillow is required: pip install pillow")
if not shutil.which("ffmpeg"):
    sys.exit("ffmpeg is required")

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "audiobooks")

# author, series, sequence, title, narrator, hours, chapters, gradient top, gradient bottom, text, motif
BOOKS = [
    ("Mara Quell", "The Ember Road", 1, "Ash and Iron", "Tom Hale", 9.5, 28, (190, 40, 20), (250, 150, 30), (255, 240, 200), "sun"),
    ("Mara Quell", "The Ember Road", 2, "The Burning Coast", "Tom Hale", 11, 32, (120, 20, 30), (230, 80, 40), (255, 230, 180), "sun"),
    ("Mara Quell", "The Ember Road", 3, "Cinder Crown", "Tom Hale", 12.5, 30, (60, 10, 20), (200, 60, 30), (255, 210, 150), "sun"),
    ("Ines Varga", None, 0, "Glasshouse", "Ruth Adair", 7, 18, (240, 232, 210), (210, 195, 160), (40, 35, 30), "frame"),
    ("Oskar Brandt", None, 0, "Deep Current", "Lena Moss", 10, 24, (5, 60, 80), (20, 160, 170), (220, 250, 250), "waves"),
    ("Priya Nandan", None, 0, "The Orchard Year", "Sam Ortiz", 8, 20, (40, 90, 30), (170, 200, 60), (250, 250, 220), "dots"),
    ("Callum Reyes", "Starfall", 1, "Far Signal", "Dev Patel", 14, 40, (8, 12, 40), (30, 70, 160), (200, 220, 255), "stars"),
    ("Callum Reyes", "Starfall", 2, "Dark Meridian", "Dev Patel", 15, 42, (10, 8, 30), (90, 40, 150), (230, 210, 255), "stars"),
    ("Hana Mori", None, 0, "Paper Lanterns", "Aiko Lane", 6, 14, (250, 215, 90), (240, 140, 60), (60, 30, 20), "dots"),
    ("Edwin Shaw", None, 0, "The Quiet Ledger", "Clare Dunn", 9, 22, (30, 30, 32), (70, 70, 74), (235, 235, 230), "frame"),
]


def font(names, size):
    for n in names:
        try:
            return ImageFont.truetype(n, size)
        except OSError:
            pass
    return ImageFont.load_default(size)


SANS = ["DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "Arial Bold.ttf", "arialbd.ttf"]
SERIF = ["DejaVuSerif-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", "Georgia Bold.ttf", "georgiab.ttf"]


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def cover(path, title, author, top, bottom, fg, motif, seed):
    random.seed(seed)
    w = 1200
    im = Image.new("RGB", (w, w))
    d = ImageDraw.Draw(im)
    for y in range(w):
        d.line([(0, y), (w, y)], fill=lerp(top, bottom, y / w))
    if motif == "sun":
        d.ellipse([300, 380, 900, 980], fill=lerp(bottom, (255, 230, 120), 0.5))
        for i in range(6):
            d.rectangle([0, 760 + i * 60, w, 780 + i * 60], fill=lerp(top, bottom, 0.2 * i))
    elif motif == "waves":
        for i in range(14):
            y = 500 + i * 50
            d.arc([-200, y - 120, w + 200, y + 120], 0, 180, fill=lerp(fg, bottom, i / 14), width=10)
    elif motif == "dots":
        for _ in range(60):
            x, y, r = random.randint(0, w), random.randint(350, w), random.randint(10, 70)
            d.ellipse([x - r, y - r, x + r, y + r], fill=lerp(bottom, fg, random.random() * 0.5))
    elif motif == "stars":
        for _ in range(400):
            x, y, r = random.randint(0, w), random.randint(0, w), random.choice([1, 1, 2, 3])
            d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255))
        im = im.filter(ImageFilter.GaussianBlur(0.6))
        d = ImageDraw.Draw(im)
        d.ellipse([650, 650, 1500, 1500], fill=lerp(bottom, (255, 255, 255), 0.25))
    elif motif == "frame":
        d.rectangle([70, 70, w - 70, w - 70], outline=fg, width=6)
        d.rectangle([95, 95, w - 95, w - 95], outline=fg, width=2)
    tf = font(SERIF if motif == "frame" else SANS, 120)
    af = font(SANS, 56)
    lines, cur = [], ""
    for word in title.upper().split():
        t = f"{cur} {word}".strip()
        if d.textlength(t, font=tf) > w - 220 and cur:
            lines.append(cur)
            cur = word
        else:
            cur = t
    lines.append(cur)
    for i, line in enumerate(lines):
        d.text((w / 2, 170 + i * 140), line, font=tf, fill=fg, anchor="mt")
    d.text((w / 2, w - 170), author.upper(), font=af, fill=fg, anchor="mt")
    im.save(path, quality=88)


def main():
    longest = max(int(b[5] * 3600) for b in BOOKS)
    with tempfile.TemporaryDirectory() as tmp:
        silence = os.path.join(tmp, "silence.m4a")
        made = 0
        for i, (author, series, seq, title, narrator, hours, nch, top, bottom, fg, motif) in enumerate(BOOKS):
            parts = [series, f"{seq} - {title} {{{narrator}}}"] if series else [f"{title} {{{narrator}}}"]
            folder = os.path.join(ROOT, author, *parts)
            out = os.path.join(folder, f"{title}.m4b")
            os.makedirs(folder, exist_ok=True)
            if not os.path.exists(os.path.join(folder, "cover.jpg")):
                cover(os.path.join(folder, "cover.jpg"), title, author, top, bottom, fg, motif, i)
            if os.path.exists(out):
                print(f"  skip  {title}")
                continue
            if not os.path.exists(silence):
                # Encode the silence once at the longest length, then cut each book from it without re-encoding.
                print(f"  encoding {longest // 3600}h of silence (once)...")
                subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono",
                                "-t", str(longest), "-c:a", "aac", "-b:a", "8k", silence], check=True)
            ms = int(hours * 3600) * 1000
            step = ms // nch
            meta = os.path.join(tmp, "chapters.txt")
            with open(meta, "w", encoding="utf-8") as f:
                f.write(f";FFMETADATA1\ntitle={title}\nalbum={title}\nartist={author}\ngenre=Fiction\n")
                for c in range(nch):
                    end = ms if c == nch - 1 else (c + 1) * step
                    f.write(f"[CHAPTER]\nTIMEBASE=1/1000\nSTART={c * step}\nEND={end}\ntitle=Chapter {c + 1}\n")
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", silence, "-i", meta, "-map", "0:a",
                            "-map_metadata", "1", "-map_chapters", "1", "-t", str(ms / 1000), "-c", "copy",
                            "-f", "mp4", out], check=True)
            print(f"  made  {title}")
            made += 1
    print(f"Done: {made} made, {len(BOOKS) - made} already there, in {ROOT}")


if __name__ == "__main__":
    main()
