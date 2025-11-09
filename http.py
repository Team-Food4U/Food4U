import time, requests

def get_html(url, retries=3, timeout=20):
    for i in range(retries):
        r = requests.get(url, timeout=timeout, headers={"User-Agent": "umass-menu-bot/0.1"})
        if r.ok:
            return r.text
        time.sleep(2*(i+1))
    r.raise_for_status()
