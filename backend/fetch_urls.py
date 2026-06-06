import requests
r = requests.get("http://127.0.0.1:8000/library", timeout=10)
data = r.json()
reels = data.get("reels", [])
print(f"Found {len(reels)} existing reels")
for reel in reels[:5]:
    url = reel.get("original_url", "N/A")
    print(f"  URL: {url}")
