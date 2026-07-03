from openai import OpenAI
import re
from pymorphy3 import MorphAnalyzer


class dpsk:
    def __init__(self, api_key, messages_limit=7, prompt="You are a helpful assistant", model="deepseek-chat"):
        self.client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
        self.messages_limit = messages_limit
        self.del_history(prompt)
        self.model = model

    def chat(self, text, stream=False, model=None):
        model = self.model if not model else model
        self.messages.append({"role": "user", "content": text})

        response = self.client.chat.completions.create(
            model=model,
            messages=self.messages,
            stream=stream)
        self.messages.append({
            "role": response.choices[0].message.role,
            "content": response.choices[0].message.content
        })

        while len(self.messages) >= self.messages_limit:
            for i, msg in enumerate(self.messages):
                if i > 0 and msg["role"] != "system":
                    del self.messages[i]
                    break

        return response.choices[0].message.content

    def del_history(self, prompt="You are a helpful assistant"):
        if prompt:
            self.prompt = prompt
        self.messages = [{"role": "system", "content": self.prompt}]


morph = MorphAnalyzer()


def preprocess(text):
    if not isinstance(text, str):
        return ""

    # Нижний регистр
    text = text.lower()

    # Замена ё -> е
    text = text.replace("ё", "е")

    # Удаление HTML
    text = re.sub(r"<.*?>", " ", text)

    # Удаление ссылок
    text = re.sub(r"http\S+|www\.\S+", " ", text)

    # Оставляем только буквы и цифры
    text = re.sub(r"[^а-яa-z0-9\s]", " ", text)

    # Удаляем лишние пробелы
    text = re.sub(r"\s+", " ", text).strip()

    # Лемматизация
    lemmas = [
        morph.parse(word)[0].normal_form
        for word in text.split()
    ]

    return " ".join(lemmas)
