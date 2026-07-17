import argparse
import os
from pathlib import Path


def build_parser():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default='df.csv')
    parser.add_argument('--output', default='impact_signals.csv')
    parser.add_argument('--prompt', default='prompt.txt')
    parser.add_argument('--api-key', default=None)
    parser.add_argument('--model', default='deepseek-chat')
    parser.add_argument('--classifier-model', default='models/classifier_model.pkl')
    parser.add_argument('--tfidf', default='models/tfidf_vectorizer.pkl')
    parser.add_argument('--text-column', default='content')
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    api_key = args.api_key or os.getenv('DEEPSEEK_API_KEY')
    if not api_key:
        raise ValueError('Pass --api-key or set DEEPSEEK_API_KEY')

    import pandas as pd

    from .llm_client import DeepSeekClient
    from .pipeline import RiskSignalExtractor
    from .text_classifier import TextClassifier

    prompt = Path(args.prompt).read_text(encoding='utf-8')
    df = pd.read_csv(args.input)

    classifier = TextClassifier(
        model_path=args.classifier_model,
        tfidf_path=args.tfidf,
    )
    llm_client = DeepSeekClient(
        api_key=api_key,
        prompt=prompt,
        model=args.model,
    )
    extractor = RiskSignalExtractor(
        classifier=classifier,
        llm_client=llm_client,
    )
    signals = extractor.extract_from_dataframe(df, text_column=args.text_column)
    signals.to_csv(args.output, index=False)
    print(f'Saved {len(signals)} signals to {args.output}')


if __name__ == '__main__':
    main()
