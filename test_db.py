import datetime as dt
from utils.db import upsert_location, insert_menu_items

TODAY = dt.date.today()

# Upsert Worcester location (returns UUID)
loc_id = upsert_location(
    "Worcester",
    False,
    "https://umassdining.com/locations-menus/worcester/menu"
)
print("Location id:", loc_id)

# Minimal row first
rows = [{
  "name": "Sample Chicken Bowl",
  "location_id": loc_id,
  "date": TODAY.isoformat(),
  "meal": "Dinner",
  "source_url": "https://umassdining.com/locations-menus/worcester/menu"
}]
insert_menu_items(rows)
print("Inserted/merged minimal row for", TODAY)

