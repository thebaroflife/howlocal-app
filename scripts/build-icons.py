# Makes the home-screen icons from the HowLocal logo (a square PNG).
# Usage: python3 scripts/build-icons.py path/to/logo.png
import os
import sys

from PIL import Image

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "assets", "brand", "howlocal-logo.png")
out = os.path.join(root, "assets")
os.makedirs(os.path.join(out, "brand"), exist_ok=True)

logo = Image.open(src).convert("RGB")
logo.save(os.path.join(out, "brand", "howlocal-logo.png"), optimize=True)

for size, name in ((512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png"), (64, "favicon.png")):
    logo.resize((size, size), Image.LANCZOS).save(os.path.join(out, name), optimize=True)
    print("wrote", name)
