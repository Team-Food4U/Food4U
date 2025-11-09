from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
import re
from datetime import date
from typing import List, Dict

MEALS = ["Breakfast", "Lunch", "Dinner", "Late Night"]

def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip()

def _guess_meal_from_text(t: str):
    tl = t.lower()
    if "breakfast" in tl: return "Breakfast"
    if "lunch" in tl: return "Lunch"
    if "dinner" in tl: return "Dinner"
    if "late night" in tl: return "Late Night"
    return None

def _extract_list_items(container) -> List[str]:
    """Collect visible <li> or text-ish nodes inside a container."""
    items = []
    # First try <li>
    for li in container.select("li"):
        txt = _clean(li.get_text(" ", strip=True))
        if txt and "image" not in txt.lower():
            items.append(txt)
    # Fallback: pull <p> or direct text blocks if no <li>
    if not items:
        for node in container.select("p, .menu-item, .views-row, .node, div"):
            txt = _clean(node.get_text(" ", strip=True))
            if txt and len(txt.split()) >= 2:
                items.append(txt)
    # De-dupe
    seen, out = set(), []
    for it in items:
        k = it.lower()
        if k in seen: continue
        seen.add(k); out.append(it)
    return out

def scrape_dc_for_date(url: str, target_date: date) -> List[Dict]:
    """
    Use a headless browser to render the page, try to set/select the date if a picker exists,
    and collect menu items grouped by meal for that date.
    Returns: [{"name":..., "meal":..., "source_url": url}, ...]
    """
    result = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context()
        page = ctx.new_page()

        # 1) Navigate
        page.goto(url, timeout=60000)
        page.wait_for_load_state("domcontentloaded")
        # give JS some time to populate widgets
        page.wait_for_timeout(1500)

        # 2) Try to set date if there's a <input type="date"> or date widget
        #    We'll try common patterns; if not present, we just scrape what's on screen.
        dt_str = target_date.isoformat()
        try:
            # Plain date input
            date_input = page.query_selector('input[type="date"]')
            if date_input:
                date_input.fill(dt_str)
                page.keyboard.press("Enter")
                page.wait_for_timeout(1200)
        except:
            pass

        # Some sites use select dropdowns or prev/next buttons. Try clicking visible buttons that look like date controls.
        try:
            # If there’s a button/tab for the target weekday or date, click it.
            # This is heuristic; safe if not found.
            pretty = target_date.strftime("%b").lower()  # e.g., "Nov"
            weekday = target_date.strftime("%A")         # e.g., "Friday"
            candidates = [weekday, pretty, target_date.strftime("%-d"), target_date.strftime("%d")]
            for label in candidates:
                el = page.get_by_text(label, exact=False)
                if el and el.count() > 0:
                    el.nth(0).click()
                    page.wait_for_timeout(800)
                    break
        except:
            pass

        # 3) Expand meal tabs if present (Breakfast/Lunch/Dinner/Late Night)
        for meal in MEALS:
            try:
                # Click any tab/button that looks like the meal name
                tab = page.get_by_text(meal, exact=False)
                if tab and tab.count() > 0:
                    tab.nth(0).click()
                    page.wait_for_timeout(500)
            except:
                pass

        # 4) Grab the fully-rendered HTML and parse
        html = page.content()
        browser.close()

    soup = BeautifulSoup(html, "html.parser")

    # Strategy A: sections under headings (h2/h3) → the next list container
    found_any = False
    for heading in soup.select("h2, h3"):
        meal = _guess_meal_from_text(heading.get_text(" ", strip=True))
        container = heading.find_next(["section","div","ul","ol"])
        if not container: 
            continue
        items = _extract_list_items(container)
        for name in items:
            result.append({
                "name": name,
                "meal": meal or "All Day",
                "price_cents": None,
                "tags": [],
                "allergens": [],
                "nutrition": {},
                "source_url": url
            })
            found_any = True

    # Strategy B (fallback): scan visible containers for lists and infer meal from ancestor text.
    if not found_any:
        for block in soup.select("section, div"):
            items = _extract_list_items(block)
            if not items: 
                continue
            # infer meal by looking at the block text
            block_text = _clean(block.get_text(" ", strip=True))
            meal = _guess_meal_from_text(block_text) or "All Day"
            for name in items:
                result.append({
                    "name": name,
                    "meal": meal,
                    "price_cents": None,
                    "tags": [],
                    "allergens": [],
                    "nutrition": {},
                    "source_url": url
                })

    # Final de-dupe by (name, meal)
    seen, out = set(), []
    for it in result:
        k = (it["name"].lower(), it["meal"])
        if k in seen: 
            continue
        seen.add(k); out.append(it)
    return out
