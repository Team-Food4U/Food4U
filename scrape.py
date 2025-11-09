import datetime as dt
from utils.http import get_html
from utils.db import upsert_location, insert_menu_items
from parsers.dc_playwright import scrape_dc_for_date
from parsers.retail import parse_retail

TODAY = dt.date.today()
DAYS_AHEAD = 6   # today + next 6 days (1 week). adjust as you like.

DC = {
  "Worcester": "https://umassdining.com/locations-menus/worcester/menu",
  "Berkshire": "https://umassdining.com/locations-menus/berkshire/menu",
  "Franklin":  "https://umassdining.com/locations-menus/franklin/menu",
  "Hampshire": "https://umassdining.com/locations-menus/hampshire/menu",
}

RETAIL = {
  "Harvest (Blue Wall)": "https://umassdining.com/menu/harvest-blue-wall-menu",
  "Worcester Café": "https://umassdining.com/menu/worcester-cafe",
  "Hampshire Café": "https://umassdining.com/menu/hampshire-market",
  "The Grill (Blue Wall)": "https://umassdining.com/menu/grill-blue-wall-menu",
  # add more retail as needed
}

def run():
    total = 0

    # -------- Dining Commons (Free) with Playwright, multi-day --------
    for name, url in DC.items():
        loc_id = upsert_location(name, False, url)

        for d in range(DAYS_AHEAD + 1):
            target_date = TODAY + dt.timedelta(days=d)
            items = scrape_dc_for_date(url, target_date)

            rows = [{
              "name": it["name"],
              "location_id": loc_id,
              "date": target_date.isoformat(),
              "meal": it["meal"],
              "price_cents": it["price_cents"],
              "tags": it["tags"],
              "allergens": it["allergens"],
              "nutrition": it["nutrition"],
              "description": None,
              "source_url": it["source_url"]
            } for it in items]

            insert_menu_items(rows)
            print(f"[DC] {name} {target_date}: inserted/merged {len(rows)}")
            total += len(rows)

    # -------- Retail (Paid) stays simple; usually static menus --------
    for name, url in RETAIL.items():
        html = get_html(url)
        loc_id = upsert_location(name, True, url)
        items = parse_retail(html, url)
        rows = [{
          "name": it["name"],
          "location_id": loc_id,
          "date": TODAY.isoformat(),   # retail menus are typically “all day / any day” – store as today
          "meal": it["meal"],
          "price_cents": it["price_cents"],
          "tags": it["tags"],
          "allergens": it["allergens"],
          "nutrition": it["nutrition"],
          "description": None,
          "source_url": it["source_url"]
        } for it in items]
        insert_menu_items(rows)
        print(f"[Retail] {name}: inserted/merged {len(rows)}")
        total += len(rows)

    print(f"TOTAL inserted/merged: {total}")

if __name__ == "__main__":
    run()
