from __future__ import annotations

import re
from typing import Any

import httpx
from bs4 import BeautifulSoup

from config.settings import settings
from domrf.normalizer import normalize_domrf_object


class DomRfClientError(RuntimeError):
    pass


class DomRfClient:
    def __init__(self) -> None:
        self.timeout = settings.domrf.TIMEOUT
        self.endpoint_templates = settings.domrf.endpoint_templates
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/126.0 Safari/537.36"
            ),
            "Accept": "application/json,text/html;q=0.9,*/*;q=0.8",
            "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.7",
            "Referer": "https://xn--80az8a.xn--d1aqf.xn--p1ai/",
        }
        if settings.domrf.AUTH_TOKEN:
            self.headers["Authorization"] = f"Bearer {settings.domrf.AUTH_TOKEN}"

    async def probe_object(self, object_id: int) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        async with httpx.AsyncClient(
            timeout=self.timeout,
            follow_redirects=True,
            headers=self.headers,
        ) as client:
            for template in self.endpoint_templates:
                url = template.format(object_id=object_id)
                try:
                    response = await client.get(url)
                    content_type = response.headers.get("content-type", "")
                    results.append({
                        "url": url,
                        "status_code": response.status_code,
                        "content_type": content_type,
                        "looks_like_json": "json" in content_type.lower(),
                        "body_preview": response.text[:300],
                    })
                except httpx.HTTPError as exc:
                    results.append({
                        "url": url,
                        "error": str(exc),
                    })
        return results

    async def get_object(self, object_id: int) -> dict[str, Any]:
        raw, source_url = await self._load_object_json(object_id)
        normalized = normalize_domrf_object(raw, object_id=object_id, source_url=source_url)
        return {
            "source": "domrf",
            "source_url": source_url,
            "raw": raw,
            "object": normalized,
        }

    async def _load_object_json(self, object_id: int) -> tuple[dict[str, Any], str]:
        async with httpx.AsyncClient(
            timeout=self.timeout,
            follow_redirects=True,
            headers=self.headers,
        ) as client:
            errors: list[str] = []
            for template in self.endpoint_templates:
                url = template.format(object_id=object_id)
                try:
                    response = await client.get(url)
                except httpx.HTTPError as exc:
                    errors.append(f"{url}: {exc}")
                    continue

                if response.status_code in (401, 403):
                    errors.append(f"{url}: {response.status_code} access denied")
                    continue
                if response.status_code == 404:
                    errors.append(f"{url}: 404 not found")
                    continue
                if response.status_code >= 400:
                    errors.append(f"{url}: HTTP {response.status_code}")
                    continue

                payload = self._decode_json_response(response)
                if payload is not None:
                    return payload, url

                payload = self._extract_json_from_html(response.text)
                if payload is not None:
                    return payload, url

                errors.append(f"{url}: JSON was not found")

        raise DomRfClientError(
            "Не удалось получить JSON наш.дом.рф. "
            "Укажи DOMRF_OBJECT_URL_TEMPLATE из DevTools Copy as cURL. "
            f"Проверенные варианты: {'; '.join(errors)}"
        )

    @staticmethod
    def _decode_json_response(response: httpx.Response) -> dict[str, Any] | None:
        content_type = response.headers.get("content-type", "").lower()
        if "json" not in content_type:
            return None
        try:
            payload = response.json()
        except ValueError:
            return None
        if isinstance(payload, dict):
            return payload
        return {"items": payload}

    @staticmethod
    def _extract_json_from_html(html: str) -> dict[str, Any] | None:
        soup = BeautifulSoup(html, "html.parser")
        for script in soup.find_all("script", type="application/json"):
            text = script.string or script.get_text(strip=True)
            if not text:
                continue
            try:
                import json

                payload = json.loads(text)
            except ValueError:
                continue
            if isinstance(payload, dict):
                return payload

        match = re.search(r"window\.__INITIAL_STATE__\s*=\s*({.*?})\s*</script>", html, re.S)
        if match:
            try:
                import json

                return json.loads(match.group(1))
            except ValueError:
                return None
        return None
