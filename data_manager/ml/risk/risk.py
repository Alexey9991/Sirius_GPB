from transformers import AutoTokenizer, AutoModelForSequenceClassification
from os.path import join as pjoin, dirname
import torch


class RiskPredictor:
    def __init__(self, model_path=pjoin(dirname(__file__), 'bert'), max_length=256):
        self.max_length = max_length
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

        self.tokenizer = AutoTokenizer.from_pretrained(model_path)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_path)
        self.model.to(self.device)
        self.model.eval()

    def predict_proba(self, text: str) -> dict:
        encoding = self.tokenizer(
            text, max_length=self.max_length,
            padding='max_length', truncation=True,
            return_tensors='pt').to(self.device)

        with torch.no_grad():
            outputs = self.model(**encoding)
            probs = torch.softmax(outputs.logits, dim=-1).squeeze().tolist()

        return int(round(probs[1], 2)*100)


if __name__ == "__main__":
    predictor = RiskPredictor()
    probs = predictor.predict_proba('Владивосток, 11 февраля. История долгостроя «Синяя птица» закончилась хорошо: дом сдали. Финансирование достройки шло через региональный фонд. «Ключи в руках — до сих пор не верится», — делятся жильцы. Регион отчитался о закрытии этого адреса в реестре.')
    print(probs)