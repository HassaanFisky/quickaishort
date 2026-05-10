import requests
import json

url = "https://quickaishort-api-946316698978.us-central1.run.app/api/process-video"
payload = {
    "videoId": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "start_sec": 0,
    "end_sec": 5,
    "user_id": "verification_agent",
    "aspect_ratio": "9:16",
    "quality": "low",
    "captions": {"enabled": False},
    "watermark_enabled": False
}

print(f"Triggering render at {url}...")
response = requests.post(url, json=payload)
print(f"Status: {response.status_code}")
print(f"Response: {response.text}")
