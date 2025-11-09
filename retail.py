import re
from bs4 import BeautifulSoup

PRICE_RE = re.compile(r"\$(\d+(?:\.\d{2})?)")

def parse_retail(html: str, page_url: str, default_meal="All Day"):
    """
    Retail pages often list items with optional $prices.
    We scan common containers and extract 'Name ($price)' style lines.
    """
    soup = BeautifulSoup(html, "html.parser")
    items = []
    for node in soup.select("li, .menu-item, .node, p"):
        raw = node.get_text(" ", strip=True)
        if not raw:
            continue
        price_cents = None
        m = PRICE_RE.search(raw)
        name = raw
        if m:
            try:
                price_cents = int(round(float(m.group(1))*100))
                name = raw[:m.start()].strip(" •-–—:\t")
            except:
                pass
        if name:
            items.append({
                "name": name,
                "meal": default_meal,
                "price_cents": price_cents,
                "tags": [],
                "allergens": [],
                "nutrition": {},
                "source_url": page_url
            })
    return dedupe(items)

def dedupe(items):
    seen, out = set(), []
    for it in items:
        key = (it["name"].lower(), it.get("price_cents"))
        if key in seen: continue
        seen.add(key); out.append(it)
    return out
