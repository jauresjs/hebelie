"""Regenerate site hero before.png (aged) and after.png (enhanced) via fal edit."""
import base64
import json
import os
import shutil
import time
import urllib.request
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = "fal-ai/nano-banana/edit"
QUEUE = "https://queue.fal.run"
W, H = 1086, 1448

BEFORE_PROMPT = (
    "Edit this portrait for a medspa marketing BEFORE slider frame. Same person, pose, crop, hair, "
    "background, lighting. Make visible aging cues: more forehead and crow's-feet wrinkles, thinner lips, "
    "slightly sagging jowls and lower-face skin, mild under-eye hollowing, a bit dull uneven skin tone. "
    "Still photorealistic and dignified—not caricature. No text or watermarks."
)

AFTER_PROMPT = (
    "Edit this portrait for a medspa marketing AFTER slider frame. Same person, pose, crop, hair, "
    "background, lighting. Clear aesthetic improvement: fuller shapely lips, tighter jawline and cheeks, "
    "smoother forehead and eye area, firmer lifted skin, even luminous complexion—beautiful but believable. "
    "No duck lips. No text or watermarks."
)


def cover(im, tw, th):
    from PIL import Image

    sw, sh = im.size
    scale = max(tw / sw, th / sh)
    nw, nh = int(sw * scale), int(sh * scale)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return im.crop((left, top, left + tw, top + th))


def api(url, key, method="GET", body=None):
    headers = {"Authorization": f"Key {key}"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())


def run_edit(key, data_url, prompt):
    body = {
        "prompt": prompt,
        "image_urls": [data_url],
        "num_images": 1,
        "output_format": "jpeg",
        "aspect_ratio": "auto",
        "sync_mode": False,
        "limit_generations": True,
    }
    job = api(f"{QUEUE}/{MODEL}", key, "POST", body)
    delay = 1.5
    started = time.time()
    while time.time() - started < 180:
        time.sleep(delay)
        delay = min(delay * 1.35, 4)
        st = api(job["status_url"], key)
        status = st.get("status")
        if status == "COMPLETED":
            out = api(job["response_url"], key)
            url = out["images"][0]["url"]
            with urllib.request.urlopen(url, timeout=60) as r:
                return r.read()
        if status not in (None, "IN_QUEUE", "IN_PROGRESS"):
            raise RuntimeError(f"fal job failed: {st}")
    raise TimeoutError("fal job timed out")


def to_data_url(path: Path) -> str:
    from PIL import Image

    im = cover(Image.open(path).convert("RGB"), W, H)
    buf = BytesIO()
    im.save(buf, format="JPEG", quality=92)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def save_png(raw: bytes, dest: Path) -> None:
    from PIL import Image

    im = cover(Image.open(BytesIO(raw)).convert("RGB"), W, H)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, optimize=True)
    print("Wrote", dest)


def main():
    key = os.environ.get("FAL_KEY", "").strip()
    if not key:
        raise SystemExit("Set FAL_KEY in the environment to run this script.")

    src = ROOT / "before.png.bak"
    if not src.is_file():
        src = ROOT / "before.png"
    if not src.is_file():
        raise SystemExit("Missing before.png or before.png.bak")

    for name in ("before.png", "after.png"):
        p = ROOT / name
        if p.is_file():
            bak = ROOT / f"{name}.bak"
            if not bak.is_file():
                shutil.copy2(p, bak)

    print("Generating BEFORE (aged)...")
    before_raw = run_edit(key, to_data_url(src), BEFORE_PROMPT)
    save_png(before_raw, ROOT / "before.png")

    print("Generating AFTER (enhanced)...")
    after_raw = run_edit(key, to_data_url(ROOT / "before.png"), AFTER_PROMPT)
    save_png(after_raw, ROOT / "after.png")


if __name__ == "__main__":
    main()
