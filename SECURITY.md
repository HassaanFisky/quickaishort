# 🔒 QuickAIShort.online — Security & Privacy Architecture Policy

This document outlines the official security architecture, compliance standards, and data retention policies for the QuickAI Short production platform. As a high-performance, enterprise-grade video optimization platform, we treat security and user privacy as foundational requirements.

---

## 1. Authentication, Authorization & Session Management

To protect user accounts and subscription credits, all entry points are hardened behind high-entropy security layers:

* **OAuth 2.0 Integration:** Authentication is strictly delegated to trusted identity providers (Google, GitHub, and secure passwordless magic links) using NextAuth.js.
* **Cryptographically Signed Session Tokens:** Session cookies are stored with maximum security flags:
  * `HttpOnly` to prevent Cross-Site Scripting (XSS) token theft.
  * `Secure` to enforce transport-layer encryption (HTTPS) at all times.
  * `SameSite=Lax` to eliminate Cross-Site Request Forgery (CSRF) vectors.
* **API Rate Limiting:** Dynamic rate limiting is implemented globally at the Cloud Run and API Gateway tiers to restrict excessive requests per IP and authenticated user ID.
* **Strict CORS Enforced:** Cross-Origin Resource Sharing (CORS) rules are hardlocked to validated production domains (e.g., `*.quickaishort.online`) and reject all unlisted origin handshakes.

---

## 2. PII Minimization & Privacy Engineering

We implement data minimization principles matching GDPR and CCPA frameworks:

* **PII Minimization:** We only collect and store the minimal amount of Personally Identifiable Information (PII) required to deliver services: user email address and display name.
* **No Content Profiling:** We never analyze user transcriptions or visual video data to build behavioral advertising profiles. All AI models process content in isolated transient memory.
* **Audit Trail Protection:** System logs reference unique, non-identifying tenant UUIDs (`usr_...`) rather than actual user emails or names to ensure complete structural anonymity in telemetry.

---

## 3. Storage Architecture & Encryption at Rest

Our storage pipelines are fully decoupled from local storage disks and secured inside enterprise-grade environments:

* **Decoupled GridFS Storage:** In production, raw uploads, intermediate video proxies, and final exports are written directly to MongoDB Atlas GridFS buckets. No long-term local file storage is maintained on Cloud Run containers.
* **Bucket Access Isolation:** Cloud storage buckets (Google Cloud Storage) enforce strict Private Bucket Policies, denying direct public read access.
* **Cryptographically Signed URLs:** If cloud buckets are utilized for downloads, files are delivered exclusively via time-bound Presigned URLs with short-lived expiration windows (max 15 minutes).

---

## 4. Rigorous Data Retention Matrix

Data is automatically purged from our environments as soon as its functional lifecycle concludes:

| Data Class | Retention Period | Automatic Purge Trigger |
| :--- | :--- | :--- |
| **Raw Uploaded Videos** | 7 Days | Automated cron job based on execution timestamp. |
| **Intermediate Video Proxies** | 24 Hours | Auto-delete upon completion of face-tracking and crop jobs. |
| **Exported Shorts** | 90 Days / User Controlled | Deleted instantly upon user request, or after 90 days of storage. |
| **Caption Tracks (SRT/VTT)** | Cascaded with Video | Automatically hard-deleted when the parent video is deleted. |
| **Telemetry & Teleprocess Logs** | 30 Days | Automatic rotation and truncation policies. |

---

## 5. Security & Safe Exception Architectures

* **Secret Manager Integration:** All production keys (Gemini API keys, Paddle secrets, Resend tokens, MongoDB cluster URIs) are injected at runtime via GCP Secret Manager and Vercel Environment Variables.
* **No Hardcoded Tokens:** Committing plaintext credentials or environment configurations to the Git tree is strictly prohibited and guarded against by automated CI lint actions.
* **Input Injection Mitigation:** Safe parameters wrap command-line invocations of utilities like `yt-dlp` and `FFmpeg` to prevent remote command injections.
* **Masked Internal Exceptions:** API handlers catch and sanitize errors before returning responses to clients. This ensures server stack traces, database schema shapes, and file system paths are never exposed to external actors.

---

## 6. Telemetry & Security Incident Response

All state changes and billing transactions generate immutable, structured JSON logs. In the event of a security anomaly:

1. **Detection:** Real-time anomaly alerts fire based on credit depletion thresholds or unauthorized IP rate spikes.
2. **Containment:** Affected microservices are immediately quarantined, and active user session tokens are invalidated atomically.
3. **Investigation:** System engineers trace security logs using non-PII correlation tokens.
4. **Remediation:** Vulnerability patching is deployed under a zero-downtime rolling update strategy, and compliance notices are distributed to affected users within 72 hours where required by law.

---

## 7. Reporting Vulnerabilities

If you discover a security vulnerability, please report it privately to our engineering security response team:

📩 **Email:** security@quickaishorts.online

Please do not open public GitHub issues or Devpost tickets for potential security vulnerabilities. We will investigate and address all private reports within 24 hours.
