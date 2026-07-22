from json_repair import repair_json
import json

from .dpsk import dpsk
from config.settings import settings


ENTITY_EXTRACTION_PROMPT = """Ты — модель извлечения сущностей из новостей о недвижимости.

Из текста новости извлеки:
- project — название жилого комплекса (без "ЖК", кавычек, декоративных элементов)
- developer — название застройщика (без организационно-правовых форм: ООО, АО, ПАО)
- city — город, где находится объект, или где происходят события

Правила:
1. Если сущность не упоминается в тексте — верни пустую строку.
2. Не придумывай данные, которых нет в тексте.
3. Для одного и того же застройщика/ЖК всегда используй одинаковое написание.

Верни ТОЛЬКО JSON-объект, без markdown, без пояснений.
Формат: {
    "project": "название или пустая строка",
    "developer": "название или пустая строка",
    "city": "название или пустая строка"}"""


class ProjectExtractor:
    def __init__(self):
        self.client = dpsk(settings.OPENAI_API_KEY, prompt=ENTITY_EXTRACTION_PROMPT)

    def extract(self, text: str) -> dict[str, str | None]:
        raw = self.client.chat(text)
        try:
            return ProjectExtractor._parse_response(raw)
        except (json.JSONDecodeError, ValueError, TypeError):
            return ProjectExtractor._empty_result()

    @staticmethod
    def _parse_response(raw: str) -> dict[str, str | None]:
        repaired = repair_json(raw)
        data = json.loads(repaired)
        return {"project": data.get("project"),
                "developer": data.get("developer"),
                "city": data.get("city")}

    @staticmethod
    def _empty_result() -> dict[str, None]:
        return {"project": None, "developer": None, "city": None}