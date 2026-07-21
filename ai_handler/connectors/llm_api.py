from openai import OpenAI


class dpsk:
    def __init__(self, api_key, messages_limit=7,
                 prompt="You are a helpful assistant", model="deepseek-v4-flash"):
        self.client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
        self.messages_limit = messages_limit
        self.del_history(prompt)
        self.model = model
        self.prompt = prompt

    def chat(self, text, stream=False, model=None, del_history=False):
        model = self.model if not model else model
        self.messages.append({"role": "user", "content": text})
        response = self.client.chat.completions.create(
            model=model, messages=self.messages, stream=stream)
        self.messages.append({
            "role": response.choices[0].message.role,
            "content": response.choices[0].message.content
        })
        while len(self.messages)>=self.messages_limit:
            for i, msg in enumerate(self.messages):
                if i>0 and msg["role"]!="system":
                    del self.messages[i]
                    break
        if del_history:
          self.del_history(self.prompt)
        return response.choices[0].message.content

    def del_history(self, prompt=None):
        if prompt is not None:
            self.prompt = prompt
        self.messages = [{"role": "system", "content": self.prompt}]