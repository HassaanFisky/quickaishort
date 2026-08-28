# F-1 Risk Model — anonymous media proxy access

All claims below are VERIFIED by tracing actual callers, not inferred from
endpoint names or comments.

## A. Who actually calls these endpoints

| Caller | Endpoint | How the URL is consumed |
|---|---|---|
| `components/editor/VideoCanvas.tsx:314` | `/api/proxy-video` | assigned to `<video src>` (line 628-634) |
| `lib/api.ts:136` `getProxyVideoUrl` | `/api/proxy-video` | URL builder |
| `app/editor/page.tsx:53` `getProxyUrl` | `/api/proxy` | passed to `extractAudioData` |
| `hooks/useMediaPipeline.ts:243` `getAudioUrl` | `/api/audio` | passed to `extractAudioData` |
| `lib/api.ts:127` `getVideoInfo` | `/api/info` | **axios** |
| `_archive/VideoWorkspace.orphan.tsx` | `/api/proxy-video` | archived, not routed |

No extension code calls them (`grep extension/` → empty).

## B. Authentication state at invocation — AUTHENTICATED

`frontend/src/middleware.ts` gates `PROTECTED_PREFIXES = ["/dashboard",
"/editor", "/settings", "/history", "/adk"]` and redirects to `/signin` when
`getToken()` returns null. **Every** live caller above is mounted under
`/editor`. There is **no legitimate pre-login use of these endpoints.**

## C. Identity is available — YES

`lib/api.ts:300-320` installs an axios interceptor attaching
`Authorization: Bearer ${session.backendToken}` and `X-User-Id`.

## D/F. THE DECISIVE CONSTRAINT — headers are impossible here

The axios interceptor only covers **axios** calls. The proxy endpoints are
consumed by:

- `<video src={displayUrl}>` — a browser media element. It **cannot** send an
  `Authorization` header. It must also support Range requests for seeking.
- `extractAudioData` → `fetch(source, { signal })`
  (`lib/utils/audioExtractor.ts:23`) — **no headers passed**.

**Therefore adding `Depends(get_verified_user_id)` to these endpoints would
break the editor's video preview and all audio analysis.** This is exactly the
case the mission brief anticipated: the credential must travel *in the URL*.

## E. The correct primitive already exists — REUSE, DO NOT DUPLICATE

`services/signing.py` implements HMAC-SHA256 URL signing over
`f"{job_id}|{user_id}|{expiry}"` with `hmac.compare_digest`, and
`main.py:1627 export_download` already uses it for precisely this trust
boundary: a media URL opened directly by the browser with no headers.

`/api/download/{job_id}` is the proven precedent. The fix extends this same
module rather than introducing a second signing system.

## G. Fixing only two endpoints would be incomplete

`/api/audio` (yt-dlp + FFmpeg extraction) and `/api/stream-info` are the same
class of exposure and same caller population. `/api/proxy-video` has **both**
GET and HEAD registrations. Any fix must cover the set, not the pair.

## Risk model

| Dimension | Current state |
|---|---|
| Attack surface | 4 anonymous endpoints performing yt-dlp resolution + unbounded byte proxying |
| Authentication | **None** at the API layer |
| Authorization | **None** — no user or project ownership check |
| Rate limiting | Per-IP, now genuinely enforced (was inert until `c31e2a9`) |
| Cost exposure | Cloud Run egress billed per GB; `/api/proxy*` stream full YouTube media. Highest per-request cost in the system |
| Legitimate dependency | Editor preview + audio analysis — **authenticated users only** |

Per-IP limits are the sole control and are trivially defeated by a distributed
caller. The endpoints are also a general-purpose YouTube egress laundering
service billed to this project.

## Smallest safe remediation

Extend `services/signing.py` with a domain-separated media-token pair, mint
tokens from an authenticated endpoint, and verify them on the proxy routes —
**gated behind `MEDIA_PROXY_AUTH_REQUIRED` (default `false`)**, following the
existing `RENDER_MANIFEST_REQUIRED` staged-rollout convention in `main.py:143`.

Default-off is deliberate and required for correctness: enabling verification
before the deployed frontend mints tokens would break video preview for every
live user. This lands the mechanism, the primitive and the tests atomically
and reversibly; the flag flip is a separate, instant, revertible operation.
