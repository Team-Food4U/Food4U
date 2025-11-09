import re
from bs4 import BeautifulSoup

def parse_dc_menu(html: str, page_url: str):
    """
    Very forgiving parser for Dining Commons pages.
    Strategy:
      - look for headings (h2/h3) that might indicate a meal (Breakfast/Lunch/Dinner)
      - take the next <ul>/<ol> and collect <li> items
      - fallback: if nothing matched, collect all <li> items
    """
    soup = BeautifulSoup(html, "html.parser")
    items = []

    # Try to associate items with nearby headings ("Breakfast", "Lunch", etc.)
    for heading in soup.select("h2, h3"):
        meal = guess_meal(heading.get_text(" ").lower())
        ul = heading.find_next(["ul","ol"])
        if not ul:
            continue
        for li in ul.select("li"):
            name = clean(li.get_text(" ", strip=True))
            if not name or "image" in name.lower():
                continue
            items.append({
                "name": name,
                "meal": meal or "All Day",
                "price_cents": None,
                "tags": extract_tags(li),
                "allergens": [],
                "nutrition": {},
                "source_url": page_url
            })

    # Fallback: if nothing matched, grab all list items as a last resort
    if not items:
        for li in soup.select("li"):
            name = clean(li.get_text(" ", strip=True))
            if name:
                items.append({
                    "name": name,
                    "meal": "All Day",
                    "price_cents": None,
                    "tags": extract_tags(li),
                    "allergens": [],
                    "nutrition": {},
                    "source_url": page_url
                })
    return dedupe(items)

def guess_meal(text: str):
    if "breakfast" in text: return "Breakfast"
    if "lunch" in text: return "Lunch"
    if "dinner" in text: return "Dinner"
    if "late night" in text: return "Late Night"
    return None

def extract_tags(node):
    t = node.get_text(" ").lower()
    tags = []
    if "vegan" in t: tags.append("plant_based")
    if "vegetarian" in t: tags.append("vegetarian")
    if "halal" in t: tags.append("halal")
    if "whole" in t and "grain" in t: tags.append("whole_grain")
    return list(set(tags))

def clean(s): 
    return re.sub(r"\s+", " ", s or "").strip()

def dedupe(items):
    seen, out = set(), []
    for it in items:
        key = (it["name"].lower(), it["meal"])
        if key in seen: 
            continue
        seen.add(key); out.append(it)
    return out
