import base64
import datetime
import json
import os
import re
from typing import Optional, Tuple

import requests


class GeminiImageService:
    def __init__(self, api_key: str, api_url: str = "https://api.apiyi.com/v1/chat/completions"):
        self.api_key = api_key
        self.api_url = api_url
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }

    def generate_image_bytes(self, prompt: str, model: str) -> Tuple[bool, Optional[bytes], str]:
        # ...existing code (payload creation)...
        payload = {
            "model": model,
            "stream": False,
            "messages": [{"role": "user", "content": prompt}],
        }

        response = requests.post(self.api_url, headers=self.headers, json=payload, timeout=300)

        if response.status_code != 200:
            return False, None, f"API error: {response.text}"

        try:
            result = response.json()
            content = result["choices"][0]["message"]["content"]
        except (KeyError, IndexError, json.JSONDecodeError):
             return False, None, "Invalid response format"

        # Extraer base64
        pattern = r"data:image/([^;]+);base64,([A-Za-z0-9+/=]+)"
        match = re.search(pattern, content)
        if not match:
            return False, None, "No image found in response"

        image_data = base64.b64decode(match.group(2))
        return True, image_data, "Success"