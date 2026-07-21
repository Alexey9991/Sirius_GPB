from sqlalchemy import select

from database.engine import session_maker_sync
from database import ImpactSignal, News
from parse.parser import NewsRecipient, NewsParser
from llm.project_extractor import ProjectExtractor
from ml.risk.risk import RiskPredictor



class ImpactSignalsCreator:
    def __init__(self):
        self.project_extractor = ProjectExtractor()
        self.risk_predictor = RiskPredictor()
    
    def run(self):
        db_sess = session_maker_sync()
        stmt = (select(News)
                .outerjoin(ImpactSignal, ImpactSignal.news_id == News.id)
                .where(ImpactSignal.id.is_(None)))
        for news in db_sess.execute(stmt).scalars().all():
            impact_signal = ImpactSignal(news_id=news.id)
            project_elements = self.project_extractor.extract(news.content)
            if filter(lambda x: x[1], project_elements.items()):
                impact_signal.city_id = project_elements.get("city")
                impact_signal.developer_id = project_elements.get("developer")
                impact_signal.project_id = project_elements.get("project")
                impact_signal.risk_level = self.risk_predictor.predict_proba(news.content)
            db_sess.add(impact_signal)
            db_sess.commit()



class DataManager:
    def __init__(self):
        self.news_recipient = NewsRecipient()
        self.news_parser = NewsParser()
        self.impact_signals_creator = ImpactSignalsCreator()

    def run(self):
        while True:
            self.get_news()
            self.impact_signals_creator.run()
    
    def get_news(self):
        self.news_recipient.fetch()
        self.news_parser.run()


if __name__=="__main__":
    DataManager().run()