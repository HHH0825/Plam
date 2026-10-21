"""Compare the old fixed-quality encoder with byte-bounded storage, without user data."""
import io
import json
import random
import sys
from pathlib import Path

from PIL import Image
from werkzeug.datastructures import FileStorage

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from palm.photo import normalized_photo, thumbnail_bytes


def jpeg(image, quality):
    stream = io.BytesIO()
    image.save(stream, "JPEG", quality=quality, optimize=True)
    return stream.getvalue()


def describe(encoded):
    with Image.open(io.BytesIO(encoded)) as image:
        return {"bytes": len(encoded), "width": image.width, "height": image.height}


def main():
    rows = []
    for name, size in (("landscape", (2300, 1500)), ("portrait", (1500, 2300)), ("small", (100, 70))):
        image = Image.frombytes("RGB", size, random.Random(41).randbytes(size[0] * size[1] * 3))
        source = jpeg(image, 93)
        old = image.copy()
        old.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        old_full = jpeg(old, 85)
        with Image.open(io.BytesIO(old_full)) as decoded:
            decoded.thumbnail((480, 480), Image.Resampling.LANCZOS)
            old_thumb = jpeg(decoded, 80)
        new_full = normalized_photo(FileStorage(stream=io.BytesIO(source), filename="generated.jpg"))
        rows.append({"fixture": name, "input": describe(source), "old_full": describe(old_full),
                     "new_full": describe(new_full), "old_thumb": describe(old_thumb),
                     "new_thumb": describe(thumbnail_bytes(new_full))})
    print(json.dumps(rows, indent=2))


if __name__ == "__main__":
    main()
