"""Photo variants, legacy lazy generation, atomic swaps and tenant boundaries."""
import io
import random
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from palm import create_app, initialize_app
from palm.database import get_db
from palm.photo import thumbnail_key, PHOTO_STORED_MAX_BYTES, THUMBNAIL_MAX_BYTES


class PhotoTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="wwj-photo-")
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.folder = root / "photos"
        self.app = initialize_app(create_app({"TESTING": True, "DATABASE": str(root / "db.sqlite3"),
            "PHOTO_DIR": str(self.folder), "WECHAT_CODE_EXCHANGER": lambda code: "user-" + code}))
        self.client = self.app.test_client()
        self.headers = {"Authorization": "Bearer " + self.client.post("/api/mp/auth/login", json={"code": "a"}).json["token"]}
        self.other = {"Authorization": "Bearer " + self.client.post("/api/mp/auth/login", json={"code": "b"}).json["token"]}
        row = self.client.post("/api/mp/items", headers=self.headers, json={"name": "相机", "category": "数码",
            "icon_type": "digital", "purchase_date": "2025-01-01", "purchase_price": "25", "status": "active"})
        self.id = row.json["id"]
        self.url = f"/api/mp/items/{self.id}/photo"

    def upload(self, color="sage", size=(1400, 1000)):
        stream = io.BytesIO()
        Image.new("RGB", size, "#65735e" if color == "sage" else "#ddb4a7").save(stream, "PNG")
        stream.seek(0)
        return self.client.post(self.url, headers=self.headers, data={"photo": (stream, "photo.png")})

    def key(self):
        with self.app.app_context():
            return get_db().execute("SELECT photo_key FROM items WHERE id=?", (self.id,)).fetchone()[0]

    def test_variants_and_versions_keep_original_aspect_and_permissions(self):
        response = self.upload()
        self.assertEqual(response.status_code, 200)
        version = response.json["photo_version"]
        self.assertTrue(version)
        self.assertNotIn(self.key(), version)
        self.assertEqual(self.client.get("/api/mp/items", headers=self.headers).json[0]["photo_version"], version)
        for suffix, size in (("", (1280, 914)), ("?size=thumb", (320, 229))):
            with self.client.get(self.url + suffix, headers=self.headers) as image:
                self.assertEqual(Image.open(io.BytesIO(image.data)).size, size)
                self.assertIn("no-store", image.headers["Cache-Control"])
        self.assertEqual(self.client.get(self.url + "?size=thumb", headers=self.other).status_code, 404)
        self.assertEqual(self.client.get(self.url + "?size=thumb").status_code, 401)
        self.assertEqual(self.client.get(self.url + "?size=invalid", headers=self.headers).status_code, 400)
        self.assertEqual(self.client.get(self.url + "?size=invalid", headers=self.other).status_code, 404)

    def test_legacy_generation_replace_remove_and_trash_cleanup(self):
        first = self.upload().json["photo_version"]
        key = self.key(); original = (self.folder / key).read_bytes()
        (self.folder / thumbnail_key(key)).unlink()
        with self.client.get(self.url + "?size=thumb", headers=self.headers) as result:
            self.assertEqual(result.status_code, 200)
        self.assertEqual((self.folder / key).read_bytes(), original)
        second = self.upload("rose").json["photo_version"]
        self.assertNotEqual(first, second)
        self.assertFalse((self.folder / key).exists())
        self.assertFalse((self.folder / thumbnail_key(key)).exists())
        self.client.delete(self.url, headers=self.headers)
        self.assertEqual(list(self.folder.iterdir()), [])
        self.assertIsNone(self.client.get(f"/api/mp/items/{self.id}", headers=self.headers).json["photo_version"])
        self.upload(); key = self.key()
        self.client.delete(f"/api/mp/items/{self.id}", headers=self.headers)
        self.assertEqual(self.client.get(self.url + "?size=thumb", headers=self.headers).status_code, 404)
        self.assertTrue((self.folder / key).exists())
        self.client.post(f"/api/mp/trash/{self.id}/restore", headers=self.headers)
        self.assertEqual(self.key(), key)
        self.client.delete(f"/api/mp/items/{self.id}", headers=self.headers)
        self.client.delete(f"/api/mp/trash/{self.id}", headers=self.headers)
        self.assertEqual(list(self.folder.iterdir()), [])

    def test_failed_swap_preserves_old_files_and_expiry_cleans_both(self):
        self.upload(); key = self.key()
        with patch("palm.photo.swap_photo_key", side_effect=RuntimeError("rollback")):
            with self.assertRaises(RuntimeError): self.upload("rose")
        self.assertEqual(self.key(), key)
        self.assertEqual({p.name for p in self.folder.iterdir()}, {key, thumbnail_key(key)})
        self.client.delete(f"/api/mp/items/{self.id}", headers=self.headers)
        with self.app.app_context():
            old = (datetime.now(timezone.utc) - timedelta(days=31)).isoformat(timespec="seconds")
            get_db().execute("UPDATE items SET deleted_at=? WHERE id=?", (old, self.id)); get_db().commit()
        self.client.get("/api/mp/trash", headers=self.headers)
        self.assertEqual(list(self.folder.iterdir()), [])

    def test_busy_photo_is_bounded_and_small_photos_are_not_enlarged(self):
        # High-frequency generated pixels exercise quality reduction and downscaling.
        size = (2300, 1500)
        photo = Image.frombytes("RGB", size, random.Random(41).randbytes(size[0] * size[1] * 3))
        stream = io.BytesIO(); photo.save(stream, "JPEG", quality=93); stream.seek(0)
        response = self.client.post(self.url, headers=self.headers, data={"photo": (stream, "busy.jpg")})
        self.assertEqual(response.status_code, 200)
        response.request.environ["wsgi.input"].close()
        response.request.close()
        response.close()
        for suffix, limit, side in (("", PHOTO_STORED_MAX_BYTES, 1600), ("?size=thumb", THUMBNAIL_MAX_BYTES, 480)):
            with self.client.get(self.url + suffix, headers=self.headers) as response:
                self.assertLessEqual(len(response.data), limit)
                with Image.open(io.BytesIO(response.data)) as saved:
                    self.assertLessEqual(max(saved.size), side)
                    self.assertAlmostEqual(saved.width / saved.height, size[0] / size[1], delta=.01)
                    self.assertEqual(saved.format, "JPEG")
        self.upload(size=(100, 70))
        with self.client.get(self.url + "?size=thumb", headers=self.headers) as response:
            self.assertEqual(Image.open(io.BytesIO(response.data)).size, (100, 70))

    def test_orientation_metadata_and_transparency_are_normalized(self):
        stream = io.BytesIO()
        photo = Image.new("RGB", (180, 100), "#807060")
        exif = photo.getexif(); exif[274] = 6; exif[315] = "synthetic metadata"
        photo.save(stream, "JPEG", exif=exif); stream.seek(0)
        self.assertEqual(self.client.post(self.url, headers=self.headers,
            data={"photo": (stream, "camera.jpg")}).status_code, 200)
        with self.client.get(self.url, headers=self.headers) as response:
            with Image.open(io.BytesIO(response.data)) as result:
                self.assertEqual(result.size, (100, 180))
                self.assertEqual(dict(result.getexif()), {})
        stream = io.BytesIO(); Image.new("RGBA", (45, 30), (0, 0, 0, 0)).save(stream, "PNG"); stream.seek(0)
        self.assertEqual(self.client.post(self.url, headers=self.headers,
            data={"photo": (stream, "transparent.png")}).status_code, 200)
        with self.client.get(self.url, headers=self.headers) as response:
            with Image.open(io.BytesIO(response.data)) as result:
                self.assertEqual(result.mode, "RGB")
                self.assertTrue(all(channel > 230 for channel in result.getpixel((10, 10))))


if __name__ == "__main__": unittest.main()
