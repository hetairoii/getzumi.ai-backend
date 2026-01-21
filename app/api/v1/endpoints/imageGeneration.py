from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field
import os
from bson import ObjectId

from app.services.gemini_image_service import GeminiImageService
from app.services.image_repository import ImageRepository

router = APIRouter()

# ... Request classes ...
class ImageGenerationRequest(BaseModel):
    prompt: str = Field(..., description="Prompt")
    model: str = Field("nano-banana-pro")

class ImageGenerationResponse(BaseModel):
    success: bool
    image_id: str
    message: str

@router.post("/generate", response_model=ImageGenerationResponse)
async def generate_image(request: ImageGenerationRequest, req: Request):
    api_key = os.getenv("APIYI_API_KEY")
    service = GeminiImageService(api_key=api_key)

    # 1. Obtener bytes crudos
    success, img_bytes, msg = service.generate_image_bytes(request.prompt, request.model)
    
    if not success or not img_bytes:
        raise HTTPException(status_code=502, detail=msg)

    db = getattr(req.app.state, "db", None)
    repo = ImageRepository(db)
    
    # 2. Comprimir y guardar en Mongo
    img_id = await repo.insert_compressed_record(request.prompt, request.model, img_bytes)

    return ImageGenerationResponse(
        success=True, 
        image_id=img_id,
        message=f"Imagen guardada. Ver en: /api/v1/generate/view/{img_id}"
    )

@router.get("/view/{image_id}", summary="Ver imagen generada")
async def get_image(image_id: str, req: Request):
    db = getattr(req.app.state, "db", None)
    repo = ImageRepository(db)
    
    # 3. Recuperar binario
    doc = await repo.get_image_data(image_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Imagen no encontrada")

    # 4. Retornar respuesta de imagen directa
    return Response(content=doc["image_data"], media_type=doc["content_type"])