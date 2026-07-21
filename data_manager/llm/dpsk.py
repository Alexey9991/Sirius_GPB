from openai import OpenAI


class dpsk:
    def __init__(self, api_key, prompt, messages_limit=7, model='deepseek-v4-flash'):
        self.client = OpenAI(api_key=api_key, base_url='https://api.deepseek.com')
        self.model = model
        self.prompt = prompt
        self.messages_limit = messages_limit
        self.reset_history(prompt)

    def reset_history(self, prompt=None):
        if prompt is not None:
            self.prompt = prompt
        self.messages = [{'role': 'system', 'content': self.prompt}]

    def chat(self, text, stream=False, model=None):
        active_model = model or self.model
        self.messages.append({'role': 'user', 'content': text})
        response = self.client.chat.completions.create(
            model=active_model,
            messages=self.messages,
            stream=stream,
        )
        message = response.choices[0].message
        self.messages.append({'role': message.role, 'content': message.content})
        self._trim_history()
        return message.content

    def _trim_history(self):
        while len(self.messages) >= self.messages_limit:
            for index, message in enumerate(self.messages):
                if index > 0 and message['role'] != 'system':
                    del self.messages[index]
                    break
        self.reset_history(self.prompt)
