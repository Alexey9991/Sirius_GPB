import re

import joblib
import nltk
import pymorphy3
from nltk.corpus import stopwords


class TextClassifier:
    def __init__(self, model_path='classifier_model.pkl', tfidf_path='tfidf_vectorizer.pkl'):
        self.model = joblib.load(model_path)
        self.tfidf = joblib.load(tfidf_path)
        nltk.download('stopwords', quiet=True)
        self.morph = pymorphy3.MorphAnalyzer()
        self.stopwords = set(stopwords.words('russian'))
        self.cache = {}

    def _lemma(self, word):
        if word not in self.cache:
            self.cache[word] = self.morph.parse(word)[0].normal_form
        return self.cache[word]

    def _clean(self, text):
        if not isinstance(text, str):
            return ''
        text = re.sub(r'[^\w\s]', '', text.lower())
        text = re.sub(r'\d+', '', text)
        cleaned = []
        for word in text.split():
            if len(word) <= 2 or word in self.stopwords:
                continue
            try:
                normal = self._lemma(word)
            except Exception:
                continue
            if normal not in self.stopwords and len(normal) > 2:
                cleaned.append(normal)
        return ' '.join(cleaned)

    def process(self, df, text_column='text', keep_only_positive=False):
        result = df.copy()
        result['cleaned_text'] = result[text_column].apply(self._clean)
        result = result[result['cleaned_text'].str.len() > 0]
        features = self.tfidf.transform(result['cleaned_text'])
        result['prediction'] = self.model.predict(features)
        if keep_only_positive:
            result = result[result['prediction'] == 1]
        return result.drop(['cleaned_text', 'prediction'], axis=1)
