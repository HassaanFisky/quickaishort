"""Cobalt API client — fast, cookie-free YouTube audio extraction."""

import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

COBALT_API_URL = "https://api.cobalt.tools/"
_COBALT_TIMEOUT = 20.0


async def get_audio_url(youtube_url: str) -> Optional[str]:
    """
    Returns a direct audio download URL from Cobalt's public API, or None on failure.

    Cobalt returns {"status": "tunnel", "url": "..."} for tunnelled streams
    or {"status": "redirect", "url": "..."} for direct CDN links.
    We accept both — the returned URL is suitable for streaming or downloading.
    """
    try:
        async with httpx.AsyncClient(
            timeout=_COBALT_TIMEOUT, follow_redirects=True
        ) as client:
            resp = await client.post(
                COBALT_API_URL,
                json={
                    "url": youtube_url,
                    "downloadMode": "audio",
                    "audioFormat": "mp3",
                    "audioBitrate": "128",
                },
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
            )

        if resp.status_code != 200:
            logger.warning("cobalt: HTTP %s for %s", resp.status_code, youtube_url)
            return None

        data = resp.json()
        status = data.get("status", "")

        if status in ("tunnel", "redirect"):
            url = data.get("url")
            if url:
                logger.info("cobalt: got %s URL for %s", status, youtube_url)
                return url

        if status == "error":
            err = data.get("error", {})
            logger.warning("cobalt: API error %s for %s", err, youtube_url)
        else:
            logger.warning("cobalt: unexpected status=%s body=%s", status, data)

        return None

    except httpx.TimeoutException:
        logger.warning("cobalt: timeout for %s", youtube_url)
        return None
    except Exception as exc:
        logger.warning("cobalt: unexpected error for %s: %s", youtube_url, exc)
        return None


async def download_audio(youtube_url: str, dest_path: str) -> bool:
    """
    Downloads audio from YouTube via Cobalt into dest_path.
    Returns True on success, False on any failure.
    """
    url = await get_audio_url(youtube_url)
    if not url:
        return False

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, read=90.0),
            follow_redirects=True,
        ) as client:
            async with client.stream("GET", url) as resp:
                if resp.status_code not in (200, 206):
                    logger.warning(
                        "cobalt: download returned HTTP %s for %s",
                        resp.status_code,
                        youtube_url,
                    )
                    return False

                with open(dest_path, "wb") as fh:
                    async for chunk in resp.aiter_bytes(32768):
                        fh.write(chunk)

        import os

        size = os.path.getsize(dest_path)
        if size < 10_000:
            logger.warning(
                "cobalt: output too small (%d bytes) for %s", size, youtube_url
            )
            return False

        logger.info("cobalt: downloaded %d bytes for %s", size, youtube_url)
        return True

    except httpx.TimeoutException:
        logger.warning("cobalt: download timeout for %s", youtube_url)
        return False
    except Exception as exc:
        logger.warning("cobalt: download error for %s: %s", youtube_url, exc)
        return False
