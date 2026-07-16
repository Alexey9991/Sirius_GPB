from nltk.corpus import stopwords
import pymorphy3
import joblib
import nltk
import re


class TextClassifier:
    def __init__(self, model_path='logres.pkl', tfidf_path='tfidf.pkl'):
        self.model = joblib.load(model_path)
        self.tfidf = joblib.load(tfidf_path)
        nltk.download('stopwords', quiet=True)
        self.morph = pymorphy3.MorphAnalyzer()
        self.stopwords = set(stopwords.words('russian'))
        extra_stopwords = {
            'это', 'так', 'вот', 'быть', 'как', 'для', 'или', 'и', 'в', 'на',
            'с', 'к', 'у', 'о', 'об', 'от', 'до', 'по', 'за', 'через', 'без',
            'из', 'под', 'над', 'перед', 'при', 'между', 'сквозь', 'про',
            'а', 'но', 'да', 'же', 'ведь', 'все', 'всё', 'сам', 'сама', 'само',
            'тот', 'та', 'то', 'эти', 'эта', 'этот', 'этих', 'такой', 'такая',
            'мое', 'моя', 'твое', 'твоя', 'наш', 'наша', 'ваш', 'ваша', 'не', 'из за'
        }
        self.stopwords.update(extra_stopwords)

    def _clean(self, text):
        if not isinstance(text, str):
            return ""
        text = re.sub(r'[^\w\s]', '', text.lower())
        text = re.sub(r'\d+', '', text)
        cleaned = []
        for word in text.split():
            if len(word) <= 2 or word in self.stopwords:
                continue
            try:
                normal = self.morph.parse(word)[0].normal_form
                if normal not in self.stopwords and len(normal) > 2:
                    cleaned.append(normal)
            except Exception:
                continue
        return " ".join(cleaned)

    def predict(self, text: str) -> int:
        cleaned_text = self._clean(text)
        if len(cleaned_text) == 0:
            return 0
        X = self.tfidf.transform([cleaned_text])
        prediction = self.model.predict(X)[0]
        return int(prediction)


if __name__ == "__main__":
    classifier = TextClassifier()
    result = classifier.predict("Дольщики проблемного ЖК «Высота» получили ключи: после трех лет ожидания объект достроен благодаря новому подрядчику и господдержке.")
    print(result)