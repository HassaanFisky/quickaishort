# 💻 QuickAIShort.online — Developer Quickstart Guide

Follow this guide to spin up a fully optimized, production-equivalent local development environment for the QuickAIShort.online platform in under 5 minutes.

---

## 1. Prerequisites & Requirements

Ensure your local workstation has the following runtimes and services installed:

* **Node.js:** version `20.x` or later (Active LTS recommended).
* **Package Manager:** `pnpm` (strongly preferred for workspace integrity) or `npm`/`yarn`.
* **Python:** version `3.10` or later (required for backend AI agent orchestrators).
* **Redis Instance:** (Required for processing task queues and rate limiting caches).
* **MongoDB Instance:** (Either a local community server instance or a free tier MongoDB Atlas URI).

---

## 2. Repository Clonal & Workspace Setup

Clone the repository and initialize the project:

```bash
git clone https://github.com/HassaanFisky/quickaishort.git
cd quickaishort
```

---

## 3. Environment Variable Provisioning

Establish a private environment configuration by creating a `.env.local` file inside the `frontend/` directory and a `.env` file inside the `fastapi/` directory.

### Frontend Environment Configuration (`frontend/.env.local`):
```env
# Production and Local Gateway Mapping
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_APP_URL=http://localhost:3000

# NextAuth Authentication Config
NEXTAUTH_SECRET=a_high_entropy_cryptographic_secret_string
NEXTAUTH_URL=http://localhost:3000
```

### Backend Environment Configuration (`fastapi/.env`):
```env
# FastAPI Gateway Core
PORT=8000
ENV=development

# Database Cluster & Cache Connections
MONGO_URI=mongodb://localhost:27017/quickaishort_dev
REDIS_URL=redis://localhost:6379/0

# Agent intelligence Configuration keys
GEMINI_API_KEY=your_gemini_api_key_here
PADDLE_API_KEY=your_paddle_api_key_here
PADDLE_WEBHOOK_SECRET=your_paddle_webhook_secret_here
```

---

## 4. Install Dependencies & Spin Up Servers

We recommend executing frontend and backend runtimes in isolated terminal sessions.

### Step 3.1: Initialize the Python Backend:
```bash
cd fastapi

# Create and activate a clean virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate

# Install exact python dependencies
pip install -r requirements.txt

# Boot the FastAPI hot-reloading development server
uvicorn main:app --reload --port 8000
```

### Step 3.2: Initialize the Next.js Frontend:
```bash
# From the project root workspace directory
pnpm install

# Spin up the next hot-reloading development client
pnpm dev
```

* **Client Gateway:** Access the visual dashboard locally at `http://localhost:3000`.
* **API Gateway Documentation:** Access interactive Swagger specifications at `http://localhost:8000/docs`.

---

## 5. Local Docker Infrastructure (Optional Fallbacks)

To test Redis or local databases without manual system installs, leverage standard Docker containers:

### Spin Up Redis Container:
```bash
docker run --name quickai-redis -d -p 6379:6379 redis:alpine
```

### Spin Up Local MongoDB Container:
```bash
docker run --name quickai-mongo -d -p 27017:27017 mongo:latest
```

---

## 6. Functional Pipeline Smoke Test

Validate that your local API Gateway resolves agent workflows correctly by running a POST simulation against the preflight suite:

```bash
curl -X POST http://localhost:8000/api/preflight \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

A successful environment setup will return a structured JSON response containing the simulated audience persona consensus scores, transcription nodes, and focal-point crops.

---

## 7. Directory Architecture Overview

The repository enforces a clean, modular separation of concerns between client and server layers:

```text
quickaishort/
├── fastapi/                    # Python Backend Microservices
│   ├── agent/                  # ADK 1.0 Agent Workforce Suite
│   ├── db/                     # MongoDB Operations & GridFS Buckets
│   ├── router/                 # REST Controller Endpoints
│   ├── main.py                 # FastAPI Application Entrypoint
│   └── requirements.txt        # Python Packages Directory
├── frontend/                   # Next.js 14 Web Application
│   ├── src/
│   │   ├── app/                # React App Router Layouts & Pages
│   │   ├── components/         # Premium, Glassmorphic UI Primitives
│   │   └── lib/                # Pusher Sync & API REST Connectors
│   ├── package.json            # Node Package Configuration
│   └── next.config.mjs         # Next.js Build Configurations
├── .github/                    # CI/CD Workflows & Issue Templates
└── README.md                   # Enterprise Repository Landing Page
```

---

## 8. Common Troubleshooting

| Error Code / Symptom | Potential Root Cause | Verified Remediation Strategy |
| :--- | :--- | :--- |
| **`ECONNREFUSED` on port 6379** | Redis service is stopped. | Verify Redis status by running `redis-cli ping` or booting the docker alpine container. |
| **`Authentication Failed`** | Invalid/Missing Gemini API key. | Ensure `GEMINI_API_KEY` is fully declared inside `fastapi/.env` and possesses valid request quotas. |
| **`GridFS Storage Exception`** | Unreachable MongoDB collection. | Validate that your `MONGO_URI` is correct and does not contain unescaped characters in the password. |

---

For architectural deeper dives or production security requirements, refer to [ARCHITECTURE.md](file:///E:/QuickAI%20Short%20orignal/ARCHITECTURE.md) and [SECURITY.md](file:///E:/QuickAI%20Short%20orignal/SECURITY.md).
