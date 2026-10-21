from io import BytesIO
from pathlib import Path
import os
import secrets
import tempfile
from hashlib import sha256
from flask import current_app
from PIL import Image, ImageOps, UnidentifiedImageError
from .repository import swap_photo_key
from .validation import InputError

PHOTO_MAX_BYTES = 5 * 1024 * 1024
PHOTO_STORED_MAX_BYTES = 200 * 1024
THUMBNAIL_MAX_BYTES = 30 * 1024
PHOTO_MAX_SIDE = 1280
THUMBNAIL_MAX_SIDE = 320
Image.MAX_IMAGE_PIXELS = 24_000_000


def photo_version(photo_key):
    return sha256(photo_key.encode()).hexdigest()[:24] if photo_key else None


def thumbnail_key(photo_key):
    return Path(photo_key).stem + ".thumb.jpg"


def write_atomic(folder, filename, encoded):
    descriptor, temporary = tempfile.mkstemp(prefix="palm-photo-", suffix=".tmp", dir=folder)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(encoded)
        os.replace(temporary, folder / filename)
    finally:
        Path(temporary).unlink(missing_ok=True)


def bounded_jpeg(photo, longest_side, max_bytes, qualities=(82, 75, 68)):
    """Encode a fresh RGB image, dropping metadata and never enlarging it."""
    with photo.convert("RGB") as reduced:
        reduced.thumbnail((longest_side, longest_side), Image.Resampling.LANCZOS)
        while True:
            for quality in qualities:
                with BytesIO() as output:
                    reduced.save(output, "JPEG", quality=quality, optimize=True)
                    encoded = output.getvalue()
                if len(encoded) <= max_bytes:
                    return encoded
            if max(reduced.size) <= 1:
                raise InputError("照片无法压缩，请换一张照片")
            size = max(1, int(max(reduced.size) * 0.8))
            reduced.thumbnail((size, size), Image.Resampling.LANCZOS)


def thumbnail_bytes(encoded):
    with Image.open(BytesIO(encoded)) as photo:
        return bounded_jpeg(photo, THUMBNAIL_MAX_SIDE, THUMBNAIL_MAX_BYTES, (80, 74, 68))


def ensure_thumbnail(photo_key):
    """Derived files are disposable; legacy photos are generated only on demand."""
    from flask import abort
    folder = Path(current_app.config["PHOTO_DIR"])
    source = folder / photo_key
    target = thumbnail_key(photo_key)
    if not source.is_file():
        abort(404)
    if not (folder / target).is_file():
        try:
            encoded = thumbnail_bytes(source.read_bytes())
            write_atomic(folder, target, encoded)
        except FileNotFoundError:
            abort(404)
        # A concurrent replacement/deletion must not leave a detached thumbnail.
        if not source.is_file():
            (folder / target).unlink(missing_ok=True)
            abort(404)
    return target

def remove_photo_file(photo_key):
    from .cloud_runtime import enabled
    if enabled():
        # Metadata swap queued durable GC in the same transaction.
        return
    if not photo_key:
        return
    for filename in (photo_key, thumbnail_key(photo_key)):
        try:
            (Path(current_app.config["PHOTO_DIR"]) / filename).unlink(missing_ok=True)
        except OSError:
            current_app.logger.warning("无法清理旧物品照片：%s", filename)

def normalized_photo(upload):
    if not upload or not upload.filename:
        raise InputError("请选择照片")
    raw = upload.stream.read(PHOTO_MAX_BYTES + 1)
    if len(raw) > PHOTO_MAX_BYTES:
        raise InputError("照片不能超过 5 MB")
    try:
        with Image.open(BytesIO(raw)) as source:
            if source.format not in ("JPEG", "PNG", "WEBP"):
                raise InputError("照片只支持 JPEG、PNG 或 WebP")
            if source.width * source.height > Image.MAX_IMAGE_PIXELS:
                raise InputError("照片尺寸过大")
            # Reduce before EXIF transpose (which copies pixels). JPEG draft also
            # avoids decoding a full camera image into several large RGB buffers.
            source.draft('RGB', (PHOTO_MAX_SIDE, PHOTO_MAX_SIDE))
            source.thumbnail((PHOTO_MAX_SIDE, PHOTO_MAX_SIDE), Image.Resampling.LANCZOS)
            with ImageOps.exif_transpose(source) as photo:
                photo.load()
                photo.thumbnail((PHOTO_MAX_SIDE, PHOTO_MAX_SIDE), Image.Resampling.LANCZOS)
                with photo.convert("RGBA") as rgba, Image.new("RGB", rgba.size, "#f7f4ec") as canvas:
                    with rgba.getchannel("A") as alpha:
                        canvas.paste(rgba, mask=alpha)
                    return bounded_jpeg(canvas, PHOTO_MAX_SIDE, PHOTO_STORED_MAX_BYTES)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise InputError("照片文件无效，请换一张 JPEG、PNG 或 WebP 图片") from exc


def save_photo(item_id, upload):
    encoded = normalized_photo(upload)
    folder = Path(current_app.config["PHOTO_DIR"])
    folder.mkdir(parents=True, exist_ok=True)
    new_key = secrets.token_hex(16) + ".jpg"
    new_file = folder / new_key
    try:
        write_atomic(folder, new_key, encoded)
        write_atomic(folder, thumbnail_key(new_key), thumbnail_bytes(encoded))
        old_key = swap_photo_key(item_id, new_key)
    except Exception:
        new_file.unlink(missing_ok=True)
        (folder / thumbnail_key(new_key)).unlink(missing_ok=True)
        raise
    remove_photo_file(old_key)


def delete_photo(item_id):
    remove_photo_file(swap_photo_key(item_id, None))
