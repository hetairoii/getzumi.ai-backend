from fastapi import APIRouter

router = APIRouter()

#sin finiquitar


@router.post("", summary="LogInUser")
async def login():
    return {"status": "ok"}