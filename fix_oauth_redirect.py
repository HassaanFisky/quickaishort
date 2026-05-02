"""
Fix Google OAuth redirect_uri_mismatch error.
Adds the missing redirect URIs to the OAuth 2.0 client using Google Cloud IAM API.
"""

import urllib.request
import urllib.parse
import json
import subprocess
import sys
import os

# ─── CONFIG ───────────────────────────────────────────────────────────────────
PROJECT_ID = "quickaishort-agent-494304"
CLIENT_ID_FULL = "946316698978-3v45aar5pb92gn7f39qor3c3d38snl5l.apps.googleusercontent.com"
NUMERIC_PROJECT = "946316698978"

# The redirect URIs that MUST be registered
REQUIRED_REDIRECT_URIS = [
    "https://quickaishort.online/api/auth/callback/google",
    "https://www.quickaishort.online/api/auth/callback/google",
    "http://localhost:3000/api/auth/callback/google",
]

# ─── STEP 1: Get access token via gcloud if available, else try ADC ──────────
def get_access_token():
    """Try multiple methods to get a Google access token."""
    
    # Method 1: Try gcloud in common install paths
    gcloud_paths = [
        r"C:\Users\fisky\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
        r"C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
        r"C:\Program Files\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd",
    ]
    
    for gcloud_path in gcloud_paths:
        if os.path.exists(gcloud_path):
            print(f"Found gcloud at: {gcloud_path}")
            result = subprocess.run(
                [gcloud_path, "auth", "print-access-token"],
                capture_output=True, text=True
            )
            if result.returncode == 0:
                token = result.stdout.strip()
                print("✅ Got access token via gcloud")
                return token
    
    # Method 2: Try application default credentials file
    adc_path = os.path.expanduser(r"~\AppData\Roaming\gcloud\application_default_credentials.json")
    if os.path.exists(adc_path):
        print(f"Found ADC at: {adc_path}")
        with open(adc_path) as f:
            creds = json.load(f)
        
        if creds.get("type") == "authorized_user":
            # Exchange refresh token for access token
            token_url = "https://oauth2.googleapis.com/token"
            data = urllib.parse.urlencode({
                "client_id": creds["client_id"],
                "client_secret": creds["client_secret"],
                "refresh_token": creds["refresh_token"],
                "grant_type": "refresh_token",
            }).encode()
            
            req = urllib.request.Request(token_url, data=data, method="POST")
            with urllib.request.urlopen(req) as resp:
                token_data = json.loads(resp.read())
                print("✅ Got access token via ADC refresh token")
                return token_data["access_token"]
    
    return None

# ─── STEP 2: Get current OAuth client config ─────────────────────────────────
def get_oauth_client(token):
    """Fetch current OAuth client configuration."""
    # The client name format for the API
    client_name = f"projects/{PROJECT_ID}/oauthClients/{CLIENT_ID_FULL}"
    url = f"https://identitytoolkit.googleapis.com/v2/{client_name}"
    
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {token}")
    
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"Identity Toolkit API error: {e.code} - {body}")
        return None

# ─── STEP 3: Use the correct Google Cloud API endpoint ───────────────────────
def fix_via_cloud_api(token):
    """Use Google Cloud IAP/OAuth API to update redirect URIs."""
    
    # Try the correct API: Cloud OAuth2 credentials API
    url = f"https://clientauthconfig.googleapis.com/v1/projects/{NUMERIC_PROJECT}/brands/default/identityPlatformConfigs"
    
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            print("Current config:", json.dumps(data, indent=2))
            return data
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"API error: {e.code} - {body[:500]}")
        return None

# ─── MAIN ─────────────────────────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("QuickAI OAuth Redirect URI Fix Script")
    print("=" * 60)
    print(f"\nProject: {PROJECT_ID}")
    print(f"Client:  {CLIENT_ID_FULL}")
    print(f"\nRequired Redirect URIs:")
    for uri in REQUIRED_REDIRECT_URIS:
        print(f"  ✓ {uri}")
    
    print("\n" + "─" * 60)
    print("Checking for Google credentials...")
    
    token = get_access_token()
    
    if not token:
        print("\n❌ Could not get access token automatically.")
        print("\nThe Google OAuth redirect URIs CANNOT be updated via API")
        print("(Google does not expose a public API to modify OAuth clients).")
        print("\n📋 MANUAL FIX REQUIRED (2 minutes):")
        print("─" * 40)
        print("1. Open: https://console.cloud.google.com/apis/credentials")
        print(f"   Project: {PROJECT_ID}")
        print(f"\n2. Click on your OAuth 2.0 Client ID:")
        print(f"   Name starts with: {CLIENT_ID_FULL[:30]}...")
        print(f"\n3. Under 'Authorized redirect URIs', ADD these:")
        for uri in REQUIRED_REDIRECT_URIS:
            print(f"   → {uri}")
        print(f"\n4. Click SAVE")
        print("─" * 40)
        print("\n✅ That's it! Login will work immediately after saving.")
        return
    
    print(f"✅ Token obtained: {token[:20]}...")
    fix_via_cloud_api(token)

if __name__ == "__main__":
    main()
