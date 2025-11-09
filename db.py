import os, requests
from dotenv import load_dotenv
from pathlib import Path

# load .env at project root
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

REST = f"{SUPABASE_URL}/rest/v1"
H = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    # upsert & return rows
    "Prefer": "resolution=merge-duplicates,return=representation"
}

def upsert_location(name: str, is_paid: bool, source_url: str) -> str:
    """Upsert by name and return the location id."""
    url = f"{REST}/locations?on_conflict=name"
    r = requests.post(url, headers=H, json=[{
        "name": name,
        "is_paid": is_paid,
        "source_url": source_url
    }])
    if not r.ok:
        print("STATUS:", r.status_code); print("URL:", r.url); print("RESPONSE:", r.text)
        r.raise_for_status()
    return r.json()[0]["id"]

def insert_menu_items(rows: list[dict]) -> None:
    """
    Bulk upsert rows into menu_items using the natural key
    (name, location_id, date, meal). We:
      1) normalize names (trim & collapse spaces)
      2) de-duplicate within this payload by that key
      3) send to Supabase in small chunks to avoid "affect row a second time"
    """
    if not rows:
        return

    # 1) normalize + 2) de-dupe by key
    def norm_name(s: str) -> str:
        return " ".join((s or "").split()).strip()

    dedup_map = {}
    for r in rows:
        r = dict(r)  # shallow copy
        r["name"] = norm_name(r.get("name", ""))
        key = (r["name"].lower(), r["location_id"], r["date"], r.get("meal") or "All Day")
        dedup_map[key] = r

    deduped = list(dedup_map.values())
    if not deduped:
        return

    url = f"{REST}/menu_items?on_conflict=name,location_id,date,meal"

    # 3) chunked POSTs
    CHUNK = 200
    for i in range(0, len(deduped), CHUNK):
        batch = deduped[i:i+CHUNK]
        r = requests.post(url, headers=H, json=batch)
        if not r.ok:
            print("STATUS:", r.status_code)
            print("URL:", r.url)
            print("BATCH SIZE:", len(batch))
            print("RESPONSE:", r.text[:1000])
            r.raise_for_status()

