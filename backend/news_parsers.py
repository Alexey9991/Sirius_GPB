import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, unquote, urlparse, parse_qs



headers_for_requests = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
}
attempts = 5


class NewsParser:
    def __init__(self, parser_site, links_parser=None, parsered_link=None, get_news=None):
        self.parser_site = parser_site
        self.links_parser = links_parser
        if callable(self.links_parser):
            self.get_links = self.links_parser
        self.parsered_link = parsered_link if parsered_link else parser_site
        
        self.get_news_config = {}
        if callable(get_news):
            self.get_news = get_news
        elif isinstance(get_news, dict):
            self.get_news_config = get_news
        else:
            raise TypeError('The "get_news" argument can be a command or a dictionary ' \
            'containing the necessary data to extract information from resources.')

        self.cached_news = {}
        self.news_links = self.get_links()


    def get_links(self):
        response = requests.get(self.parsered_link, headers=headers_for_requests)
        soup = BeautifulSoup(response.text, 'html.parser')

        news_links = []
        news_a_tags = soup.select(self.links_parser)
        for a in news_a_tags:
            href = a.get('href', '')
            href = urljoin(self.parser_site, href) if href.startswith("/") else href
            news_name = a.get_text(strip=True)
            news_links.append((news_name, href))

        return news_links


    def reload_links(self, add_cached_news=None):
        if add_cached_news:
            self.cached_news[add_cached_news[0]] = add_cached_news[1]
        if len(self.cached_news)==len(self.news_links):
            self.cached_news = {}
            self.news_links = self.get_links()


    def get_image_link(self, soup, selector):
        img_elem = soup.select_one(selector)
        img_link = None

        if img_elem:
            img_link = img_elem.get('src')

            if img_link and 'url=' in img_link:
                parsed_url = urlparse(img_link)
                query_params = parse_qs(parsed_url.query)
                
                if 'url' in query_params:
                    img_link = unquote(query_params['url'][0])

            if not img_link or img_link.startswith('data:') or img_link.startswith('/_next/image'):
                if img_elem.get('srcset'):
                    srcset = img_elem['srcset']
                    potential_link = srcset.split(',')[0].split(' ')[0].strip()
                    if 'url=' in potential_link:
                        parsed_url = urlparse(potential_link)
                        query_params = parse_qs(parsed_url.query)
                        if 'url' in query_params:
                            img_link = unquote(query_params['url'][0])
                    else:
                        img_link = potential_link

        return img_link


    def get_news(self, news_link, attempt=1):
        if news_link in list(self.cached_news.keys()):
            return self.cached_news[news_link]

        response = requests.get(news_link, headers=headers_for_requests)
        soup = BeautifulSoup(response.text, 'html.parser')
        news_content = {}

        for key, item in self.get_news_config.items():
            try:
                if key=="content":
                    news_content[key] = '\n'.join([elem.get_text(strip=True) 
                        for elem in soup.select(item) if elem.get_text(strip=True)])
                else:
                    news_content[key] = soup.select_one(item).get_text(strip=True)
            except:
                news_content[key] = None

        self.reload_links(add_cached_news=(news_link, news_content))
        if not map(lambda x: x[1], news_content.items()):
            if attempt==5:
                return None
            news_content = self.get_news(news_link, attempt+1)
        return news_content



class RiaRU(NewsParser):
    def __init__(self):
        super().__init__(
            "https://realty.ria.ru", ".list-item__title.color-font-hover-only", "https://realty.ria.ru/economy/",
            get_news={
                "title": '.article__title',
                "content": 'div.article__body.js-mediator-article.mia-analytics div.article__text',
                "date": "div.article__info-date",
                "source": "div.media__copyright-item.m-copyright",
                "category": "a.article__tags-item"
            }
        )



class RBK(NewsParser):
    def __init__(self):
        super().__init__(
            "https://realty.rbc.ru", ".no-wrap.g-inline-text-badges__text", "https://realty.rbc.ru/company_news/",
            get_news={
                "title": '.article__header__title-in.js-slide-title',
                "content": 'div.article__text.article__text_free.js-article-body div.article__text__overview',
                "date": "time.article__header__date",
                "category": "a.article__header__category"
            }
        )



parsers = {
    "https://realty.ria.ru": RiaRU,
    "https://realty.rbc.ru": RBK
}


def import_parsers():
    loc_parsers = parsers
    for url in list(loc_parsers.keys()):
        loc_parsers[url] = loc_parsers[url]()
    return loc_parsers