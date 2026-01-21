import os
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field


router = APIRouter()


class ApiyiVideoSubmitRequest(BaseModel):
	model_config = ConfigDict(extra="allow")

	prompt: str = Field(min_length=1, description="Text prompt for video generation")
	model: str = Field(default="veo3", description="APIYI model name (e.g. 'veo3')")
	images: list[str] = Field(default_factory=list, description="Optional image URLs")
	enhance_prompt: bool = Field(default=True, description="Whether to enhance the prompt")


class ApiyiVideoGenerateResponse(BaseModel):
	provider: str = "apiyi"
	status_code: int
	data: Any


def _get_required_env(name: str) -> str:
	value = os.getenv(name)
	if not value:
		raise HTTPException(
			status_code=500,
			detail=(
				f"Missing required environment variable '{name}'. "
				"Set it in your environment (or Netlify Environment Variables)."
			),
		)
	return value


@router.post("", summary="Submit video generation (APIYI)", response_model=ApiyiVideoGenerateResponse)
async def submit_video_easy_mode(body: ApiyiVideoSubmitRequest) -> ApiyiVideoGenerateResponse:
	api_key = _get_required_env("APIYI_API_KEY")
	base_url = os.getenv("APIYI_BASE_URL", "").strip() or "https://api.apiyi.com"
	path = os.getenv("APIYI_SUBMIT_PATH", "").strip() or "veo/v1/api/video/submit"
	timeout_s = float(os.getenv("APIYI_TIMEOUT_SECONDS", "60"))

	url = f"{base_url.rstrip('/')}/{path.lstrip('/')}"

	headers = {
		"Authorization": f"Bearer {api_key}",
		"Accept": "application/json",
		"Content-Type": "application/json",
	}

	payload = body.model_dump(exclude_none=True)

	try:
		async with httpx.AsyncClient(timeout=timeout_s) as client:
			resp = await client.post(url, headers=headers, json=payload)
	except httpx.TimeoutException as exc:
		raise HTTPException(status_code=504, detail=f"APIYI request timed out: {exc}") from exc
	except httpx.RequestError as exc:
		raise HTTPException(status_code=502, detail=f"APIYI request failed: {exc}") from exc

	try:
		data: Any = resp.json()
	except ValueError:
		content_type = (resp.headers.get("content-type") or "").lower()
		body_prefix = resp.text[:300]
		raise HTTPException(
			status_code=502,
			detail={
				"message": "APIYI returned a non-JSON response (likely wrong endpoint or auth issue)",
				"provider_status": resp.status_code,
				"provider_url": url,
				"provider_content_type": content_type,
				"provider_body_prefix": body_prefix,
			},
		)

	if resp.status_code >= 400:
		raise HTTPException(
			status_code=502,
			detail={
				"message": "APIYI returned an error",
				"provider_status": resp.status_code,
				"provider_response": data,
			},
		)

	return ApiyiVideoGenerateResponse(status_code=resp.status_code, data=data)

