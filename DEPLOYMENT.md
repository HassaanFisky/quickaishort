# Vercel Deployment Guide - Quick AI Shorts

Complete guide to deploy Quick AI Shorts to Vercel and connect to `quickaishort.online`.

---

## Prerequisites

- GitHub repository: `HassaanFisky/Quickaishort.online` ✅
- Vercel account (free tier works)
- Domain: `quickaishort.online` (access to DNS settings)
- MongoDB Atlas cluster (or create one)
- Google OAuth credentials

---

## Step 1: Prepare Environment Variables

You'll need these environment variables in Vercel. Prepare them now:

### Required Variables

```env
# Database
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@cluster.mongodb.net/quickai-shorts?retryWrites=true&w=majority

# Authentication (Google OAuth)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXTAUTH_SECRET=your-random-32-char-secret-key-here
NEXTAUTH_URL=https://quickaishort.online

# App Configuration
NEXT_PUBLIC_APP_URL=https://quickaishort.online
NEXT_PUBLIC_APP_NAME=QuickAI Shorts
```

### How to Get These Values

**MongoDB URI:**

1. Go to [MongoDB Atlas](https://cloud.mongodb.com)
2. Create a free cluster (if you don't have one)
3. Click "Connect" → "Connect your application"
4. Copy the connection string
5. Replace `<password>` with your database password

**Google OAuth:**

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable "Google+ API"
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Application type: "Web application"
6. Authorized redirect URIs: `https://quickaishort.online/api/auth/callback/google`
7. Copy Client ID and Client Secret

**NEXTAUTH_SECRET:**
Generate a random 32-character string:

```bash
openssl rand -base64 32
```

Or use: https://generate-secret.vercel.app/32

---

## Step 2: Deploy to Vercel

### Option A: Via Vercel Dashboard (Recommended)

1. **Go to Vercel**: https://vercel.com/new
2. **Import Repository**:
   - Click "Import Git Repository"
   - Select `HassaanFisky/Quickaishort.online`
   - Click "Import"
3. **Configure Project**:
   - Framework Preset: **Next.js** (auto-detected)
   - Root Directory: `./` (leave default)
   - Build Command: `pnpm build` (auto-detected)
   - Output Directory: `.next` (auto-detected)
4. **Add Environment Variables**:
   - Click "Environment Variables"
   - Add all variables from Step 1 (one by one)
   - Select "Production", "Preview", and "Development" for each
5. **Deploy**:
   - Click "Deploy"
   - Wait ~2-3 minutes for build to complete

### Option B: Via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy (from project root)
cd "e:\QuickAI Short\quickai-shorts"
vercel

# Follow prompts:
# - Set up and deploy? Y
# - Which scope? (select your account)
# - Link to existing project? N
# - Project name? quickai-shorts
# - Directory? ./
# - Override settings? N

# Add environment variables
vercel env add MONGODB_URI
vercel env add GOOGLE_CLIENT_ID
vercel env add GOOGLE_CLIENT_SECRET
vercel env add NEXTAUTH_SECRET
vercel env add NEXTAUTH_URL
vercel env add NEXT_PUBLIC_APP_URL
vercel env add NEXT_PUBLIC_APP_NAME

# Deploy to production
vercel --prod
```

---

## Step 3: Connect Custom Domain

1. **In Vercel Dashboard**:
   - Go to your project → Settings → Domains
   - Click "Add Domain"
   - Enter: `quickaishort.online`
   - Click "Add"

2. **Configure DNS** (at your domain registrar):

Vercel will show you DNS records to add. Typically:

**Option A: Using A Records (Recommended)**

```
Type: A
Name: @
Value: 76.76.21.21
TTL: 3600
```

**Option B: Using CNAME**

```
Type: CNAME
Name: @
Value: cname.vercel-dns.com
TTL: 3600
```

**For www subdomain:**

```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
TTL: 3600
```

3. **Wait for DNS Propagation**:
   - Usually takes 5-60 minutes
   - Vercel will auto-issue SSL certificate once DNS is verified

---

## Step 4: Verify Deployment

### Check Build Logs

1. Go to Vercel Dashboard → Your Project → Deployments
2. Click on the latest deployment
3. Check "Build Logs" tab — should show:
   ```
   ✓ Compiled successfully
   ✓ Linting and checking validity of types
   ✓ Collecting page data
   ✓ Generating static pages
   ```

### Test the Application

1. Visit `https://quickaishort.online`
2. **Test Landing Page**: Should load with Hydro-Glass theme
3. **Test Google Login**:
   - Click "Sign In"
   - Sign in with Google
   - Should redirect to dashboard
4. **Test Editor**:
   - Go to `/editor`
   - Check if video canvas loads
   - Verify FFmpeg worker initializes (check browser console)

---

## Step 5: Post-Deployment Configuration

### Update Google OAuth Redirect URIs

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Credentials → Your OAuth Client
3. Add to "Authorized redirect URIs":
   ```
   https://quickaishort.online/api/auth/callback/google
   https://www.quickaishort.online/api/auth/callback/google
   ```

### Enable Vercel Analytics (Optional)

1. Vercel Dashboard → Your Project → Analytics
2. Click "Enable Analytics"

### Set Up Vercel Cron Jobs (Future)

For automated cleanup tasks:

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/cleanup",
      "schedule": "0 0 * * *"
    }
  ]
}
```

---

## Troubleshooting

### Build Fails with "MONGODB_URI is not defined"

- **Fix**: Add `MONGODB_URI` to Vercel environment variables
- Redeploy: Vercel Dashboard → Deployments → ⋯ → Redeploy

### "Invalid redirect URI" on Google Login

- **Fix**: Add `https://quickaishort.online/api/auth/callback/google` to Google OAuth settings

### CORS Errors with FFmpeg

- **Fix**: Already configured in `vercel.json` with COOP/COEP headers
- If still failing, check browser console for specific error

### Domain Not Resolving

- **Check DNS**: Use `dig quickaishort.online` or https://dnschecker.org
- **Wait**: DNS can take up to 48 hours (usually 5-60 min)
- **Verify**: Vercel Dashboard → Domains should show green checkmark

### 500 Internal Server Error

- **Check Logs**: Vercel Dashboard → Your Project → Logs
- **Common causes**:
  - Missing environment variables
  - MongoDB connection timeout
  - Invalid NEXTAUTH_SECRET

---

## Quick Reference

| Resource             | URL                              |
| -------------------- | -------------------------------- |
| Vercel Dashboard     | https://vercel.com/dashboard     |
| MongoDB Atlas        | https://cloud.mongodb.com        |
| Google Cloud Console | https://console.cloud.google.com |
| DNS Checker          | https://dnschecker.org           |
| SSL Checker          | https://www.ssllabs.com/ssltest  |

---

## Next Steps After Deployment

1. **Monitor Performance**: Vercel Analytics
2. **Set Up Error Tracking**: Sentry or Vercel Error Tracking
3. **Configure CDN**: Already handled by Vercel Edge Network
4. **Add Custom 404/500 Pages**: Create `src/app/not-found.tsx` and `src/app/error.tsx`
5. **Set Up Monitoring**: Uptime monitoring (UptimeRobot, Pingdom)

---

**Your app is now live at `https://quickaishort.online`** 🚀
