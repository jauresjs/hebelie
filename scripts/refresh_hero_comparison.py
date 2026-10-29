"""Regenerate hero before.png (aged) and after.png (treatments) from the current before.png only."""
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

TREATMENTS = {
    "lips": ("Lip filler", "lips", "clearly fuller lips with defined border", "no duck lip"),
    "skin": ("Skin rejuvenation", "full face", "brighter, more even tone; healthy glow", "keep pores"),
    "facelift": ("Facelift", "lower face and jaw", "marked reduction in jowling; tighter jawline", "same identity"),
    "botox": ("Botox", "forehead and crow's feet", "forehead lines and crow's feet clearly softened", "natural brow"),
    "cheeks": ("Cheek filler", "cheekbones", "restored mid-face volume and lift", "no chipmunk cheeks"),
}

BEFORE_PROMPT = (
    "Edit this portrait for a medspa BEFORE slider frame. Same person, pose, crop, hair, background, lighting. "
    "Subtle but visible aging: more fine lines on forehead and crow's feet, slightly thinner lips, mild jowl "
    "softness and lower-face laxity, gentle under-eye tiredness, slightly duller skin tone. Photorealistic, "
    "same identity—not a different person, not caricature. No text or watermarks."
)

DEMO_NOTE = (
    "Marketing AFTER slider: clearly improved at a glance—firmer jaw and cheeks, smoother forehead and eye area, "
    "fuller lips, more even luminous skin—same person, same pose, same crop. No text overlays."
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


def run_edit_job(key, body):
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


def baseline_data_url(src: Path) -> str:
    from PIL import Image

    im = cover(Image.open(src).convert("RGB"), W, H)
    buf = BytesIO()
    im.save(buf, format="JPEG", quality=92)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def build_after_request(data_url: str):
    preserve = (
        "Edit the supplied portrait. Same individual, age, ethnicity, hair, clothes, background, framing, lighting. "
        "No text, labels, arrows, or watermarks. Photorealistic clinical photography."
    )
    procs = ["facelift", "botox", "cheeks", "lips", "skin"]
    steps = []
    for i, pid in enumerate(procs, 1):
        label, area, change, excl = TREATMENTS[pid]
        steps.append(f"{i}. {label}. Area: {area}. Change: {change}. Exclusions: {excl}.")
    prompt = "Retouch with these treatments together. " + preserve + " " + " ".join(steps) + " " + DEMO_NOTE
    return {
        "prompt": prompt,
        "image_urls": [data_url],
        "num_images": 1,
        "output_format": "jpeg",
        "aspect_ratio": "auto",
        "sync_mode": False,
        "limit_generations": True,
    }


def build_before_request(data_url: str):
    return {
        "prompt": BEFORE_PROMPT,
        "image_urls": [data_url],
        "num_images": 1,
        "output_format": "jpeg",
        "aspect_ratio": "auto",
        "sync_mode": False,
        "limit_generations": True,
    }


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

    src = ROOT / "before.png"
    if not src.is_file():
        raise SystemExit("Missing before.png")

    archive = ROOT / "hero_baseline.png"
    shutil.copy2(src, archive)
    print("Baseline snapshot:", archive)

    data_url = baseline_data_url(src)

    print("Generating BEFORE (aged) from current hero source...")
    before_raw = run_edit_job(key, build_before_request(data_url))
    save_png(before_raw, ROOT / "before.png")

    print("Generating AFTER (treatments) from same hero source...")
    after_raw = run_edit_job(key, build_after_request(data_url))
    save_png(after_raw, ROOT / "after.png")


if __name__ == "__main__":
    main()
