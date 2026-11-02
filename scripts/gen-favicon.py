from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parent.parent
src = Image.open(root / "logo.png").convert("RGBA")
w, h = src.size
box = (int(w * 0.08), int(h * 0.08), int(w * 0.92), int(h * 0.92))
icon = src.crop(box)


def save_png(size: int, name: str) -> None:
    icon.resize((size, size), Image.Resampling.LANCZOS).save(root / name, optimize=True)


save_png(16, "favicon-16x16.png")
save_png(32, "favicon-32x32.png")
save_png(180, "apple-touch-icon.png")
save_png(512, "icon-512.png")

ico_sizes = [(16, 16), (32, 32), (48, 48)]
imgs = [icon.resize(s, Image.Resampling.LANCZOS) for s in ico_sizes]
imgs[0].save(
    root / "favicon.ico",
    format="ICO",
    sizes=[(i.width, i.height) for i in imgs],
    append_images=imgs[1:],
)
print("OK")
