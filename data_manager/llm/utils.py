import json
import re


def parse_llm_json(value):
    if isinstance(value, dict):
        return value
    if not isinstance(value, str):
        value = str(value)

    value = value.strip()
    value = re.sub(r'^```(?:json)?\s*', '', value, flags=re.IGNORECASE)
    value = re.sub(r'\s*```$', '', value)

    try:
        return json.loads(value)
    except json.JSONDecodeError:
        fixed = re.sub(r'\bTrue\b', 'true', value)
        fixed = re.sub(r'\bFalse\b', 'false', fixed)
        fixed = re.sub(r'\bNone\b', 'null', fixed)
        try:
            return json.loads(fixed)
        except json.JSONDecodeError:
            return {}
