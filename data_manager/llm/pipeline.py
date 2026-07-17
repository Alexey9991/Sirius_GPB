import pandas as pd

from .preprocessing import RED_FLAGS, contains_red_flags
from .utils import parse_llm_json


class RiskSignalExtractor:
    def __init__(self, classifier, llm_client, red_flags=None):
        self.classifier = classifier
        self.llm_client = llm_client
        self.red_flags = RED_FLAGS if red_flags is None else red_flags

    def filter_news(self, df, text_column='content'):
        filtered = self.classifier.process(
            df,
            text_column=text_column,
            keep_only_positive=True,
        )
        return filtered[filtered[text_column].apply(lambda text: contains_red_flags(text, self.red_flags))]

    def extract_from_dataframe(self, df, text_column='content'):
        filtered = self.filter_news(df, text_column=text_column)
        signals = []
        signal_id = 1

        for _, row in filtered.iterrows():
            raw_response = self.llm_client.chat(row[text_column])
            parsed_response = parse_llm_json(raw_response)
            for signal in parsed_response.get('signals', []):
                signals.append(self._build_signal_row(signal_id, row, signal))
                signal_id += 1

        return pd.DataFrame(
            signals,
            columns=[
                'id',
                'news_id',
                'risk_level',
                'risk_category',
                'city',
                'developer',
                'project',
                'date',
            ],
        )

    def _build_signal_row(self, signal_id, news_row, signal):
        location = signal.get('location')
        return {
            'id': signal_id,
            'news_id': news_row.get('id'),
            'risk_level': signal.get('risk_score'),
            'risk_category': signal.get('category'),
            'city': None if location in (None, False) else location,
            'developer': signal.get('developer'),
            'project': signal.get('zk'),
            'date': news_row.get('date'),
        }
