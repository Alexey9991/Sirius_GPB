from parse.parser import NewsRecipient, NewsParser
from impact_signals import ImpactSignalsCreator


class DataManager:
    def __init__(self):
        self.news_recipient = NewsRecipient()
        self.news_parser = NewsParser()
        self.impact_signals_creator = ImpactSignalsCreator()

    def run(self):
        while True:
            self.news_recipient.fetch()
            self.news_parser.run()
            self.impact_signals_creator.run()


if __name__=="__main__":
    DataManager().run()