from datetime import datetime
from typing import Any, Optional
import io
from PIL import Image
from bson import ObjectId, Binary
from motor.motor_asyncio import AsyncIOMotorDatabase

class ImageRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self._collection = db["generated_images"]

    async def insert_compressed_record(
        self,
        prompt: str,
        model: str,
        image_bytes: bytes,
        quality: int = 70  # Calidad de compresión (1-100)
    ) -> str:
        # 1. Comprimir imagen en memoria usando Pillow
        image = Image.open(io.BytesIO(image_bytes))
        
        # Convertir a RGB si es PNG (para poder guardar como JPEG)
        if image.mode in ("RGBA", "P"):
             image = image.convert("RGB")

        output_io = io.BytesIO()
        # Guardamos como JPEG para comprimir
        image.save(output_io, format="JPEG", quality=quality, optimize=True)
        compressed_data = output_io.getvalue()

        # 2. Crear documento
        doc = {
            "prompt": prompt,
            "model": model,
            "image_data": Binary(compressed_data), # Guardar binario
            "content_type": "image/jpeg",
            "created_at": datetime.utcnow(),
        }
        
        result = await self._collection.insert_one(doc)
        return str(result.inserted_id)

    async def get_image_data(self, image_id: str) -> Optional[dict]:
        try:
            doc = await self._collection.find_one({"_id": ObjectId(image_id)})
            return doc
        except Exception:
            return None