"""Adversarial SSRF and Video URL Whitelist Verification Suite.

Milestone 2 Empirical Security Challenge:
Stress-tests VideoService.extract_video_id, VideoService.download_segment,
VideoService.download_segment_sync, and main._require_youtube_url against:
1. Cloud Metadata Services (AWS, GCP, Azure, Alibaba, DigitalOcean, IPv6)
2. Loopback & RFC1918 Private IP ranges (127.0.0.1, 10.x, 172.16-31.x, 192.168.x)
3. Alternative & Obfuscated IP encodings (octal, hex, dword, IPv6, IPv4-mapped)
4. Domain Suffix Spoofing, Subdomain Prepending, and Userinfo Injection
5. Malicious URL Schemes (file, ftp, gopher, dict, ldap, javascript, data, php)
6. Path Traversal and Special Character Injection
7. Legitimate Whitelisted Formats (YouTube watch, shorts, live, embed, youtu.be, TikTok)
"""

from __future__ import annotations

import re
import pytest
from fastapi import HTTPException

import main
from services.video_service import VideoService


# ==============================================================================
# 1. Cloud Metadata IP Adversarial Vectors
# ==============================================================================

CLOUD_METADATA_URLS = [
    # AWS / OpenStack / DigitalOcean / Azure IMDS
    "http://169.254.169.254/latest/meta-data/12345678901",
    "https://169.254.169.254/latest/meta-data/credentials/12345678901",
    "http://169.254.169.254/metadata/v1.json/12345678901",
    "http://169.254.169.254/opentracing/12345678901",
    # GCP Internal Metadata
    "http://metadata.google.internal/computeMetadata/v1/12345678901",
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    "http://169.254.169.254/computeMetadata/v1/12345678901",
    # Alibaba Cloud Metadata
    "http://100.100.100.200/latest/meta-data/12345678901",
    # Oracle Cloud Metadata
    "http://192.0.0.192/latest/meta-data/12345678901",
    # AWS IPv6 IMDSv2
    "http://[fd00:ec2::254]/latest/meta-data/12345678901",
]


# ==============================================================================
# 2. Loopback & RFC1918 Private Network Vectors
# ==============================================================================

PRIVATE_NETWORK_URLS = [
    # Loopback (127.0.0.0/8)
    "http://127.0.0.1:8000/12345678901",
    "http://127.0.0.1:6379/12345678901",  # Redis probe
    "http://127.0.0.1:27017/12345678901",  # MongoDB probe
    "http://127.0.0.2:8000/12345678901",
    "http://127.127.127.127:8000/12345678901",
    "http://localhost:8000/12345678901",
    "http://0.0.0.0:8000/12345678901",
    # Class A Private (10.0.0.0/8)
    "http://10.0.0.1/12345678901",
    "http://10.0.0.1:8000/12345678901",
    "http://10.255.255.254/12345678901",
    # Class B Private (172.16.0.0/12)
    "http://172.16.0.1/12345678901",
    "http://172.20.0.1:5432/12345678901",
    "http://172.31.255.255/12345678901",
    # Class C Private (192.168.0.0/16)
    "http://192.168.1.1/12345678901",
    "http://192.168.0.100:8080/12345678901",
    "http://192.168.178.1/12345678901",
    # Carrier Grade NAT (100.64.0.0/10)
    "http://100.64.0.1/12345678901",
]


# ==============================================================================
# 3. Obfuscated & Alternative IP Formats
# ==============================================================================

OBFUSCATED_IP_URLS = [
    # Octal IP (0177.0.0.1 == 127.0.0.1)
    "http://0177.0.0.1/12345678901",
    # Hexadecimal IP (0x7f000001 == 127.0.0.1)
    "http://0x7f000001/12345678901",
    # Integer/Dword IP (2130706433 == 127.0.0.1)
    "http://2130706433/12345678901",
    # Integer/Dword IP for metadata (2852039166 == 169.254.169.254)
    "http://2852039166/12345678901",
    # Hex metadata (0xa9fea9fe == 169.254.169.254)
    "http://0xa9fea9fe/12345678901",
    # IPv6 loopback
    "http://[::1]/12345678901",
    "http://[0:0:0:0:0:0:0:1]/12345678901",
    # IPv4-mapped IPv6
    "http://[::ffff:127.0.0.1]/12345678901",
    "http://[::ffff:169.254.169.254]/12345678901",
]


# ==============================================================================
# 4. Domain Suffix Spoofing & Domain Confusion
# ==============================================================================

DOMAIN_SPOOFING_URLS = [
    # Attacker suffix domain
    "http://youtube.com.attacker.com/12345678901",
    "https://youtube.com.evil.org/watch?v=12345678901",
    "http://youtu.be.attacker.com/12345678901",
    "https://tiktok.com.evil-corp.net/video/12345678901",
    # Prefix / Subdomain spoofing
    "http://notyoutube.com/watch?v=12345678901",
    "http://fakeyoutube.com/watch?v=12345678901",
    "http://attacker-youtube.com/watch?v=12345678901",
    "http://faketiktok.com/video/12345678901",
    # TLD substitution
    "https://youtube.org/watch?v=12345678901",
    "https://youtube.net/watch?v=12345678901",
    "https://youtube.co/watch?v=12345678901",
    "https://youtu.be.co/12345678901",
    # Hyphenated lookalikes
    "https://youtube-com.attacker.com/12345678901",
    "https://tiktok-com.attacker.com/video/12345678901",
    # Userinfo spoofing
    "http://youtube.com@attacker.com/12345678901",
    "http://youtube.com:password@attacker.com/12345678901",
    "http://youtu.be@evil.com/12345678901",
    "http://tiktok.com@evil.com/video/12345678901",
    # Port variations with untrusted hosts
    "http://attacker.com:80/youtube.com/12345678901",
]


# ==============================================================================
# 5. Malicious Schemes & Smuggling Payloads
# ==============================================================================

MALICIOUS_SCHEME_URLS = [
    "file:///etc/passwd",
    "file:///c:/windows/win.ini",
    "ftp://evil.com/12345678901",
    "gopher://127.0.0.1:6379/_flushall",
    "dict://127.0.0.1:11211/stat",
    "ldap://127.0.0.1:389/dc=example,dc=com",
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "php://filter/convert.base64-encode/resource=index.php",
    "blob:https://youtube.com/12345678901",
    "ws://127.0.0.1:8000/12345678901",
    "wss://evil.com/12345678901",
]


# ==============================================================================
# 6. Valid Whitelisted URLs
# ==============================================================================

VALID_WHITELISTED_URLS = [
    ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://m.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://www.youtube.com/live/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://www.youtube.com/v/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"),
    ("https://youtu.be/dQw4w9WgXcQ?t=42s", "dQw4w9WgXcQ"),
    ("https://www.tiktok.com/@quickai/video/7123456789012345678", "7123456789012345678"),
    ("https://vm.tiktok.com/ZMlabc123/", "ZMlabc123"),
    ("https://www.tiktok.com/t/ZTdabc123/", "ZTdabc123"),
]


# ==============================================================================
# Test Cases
# ==============================================================================

class TestAdversarialSSRFCloudMetadata:
    """Empirical challenge: Cloud metadata endpoints MUST return None and NEVER leak internal credentials."""

    @pytest.mark.parametrize("url", CLOUD_METADATA_URLS)
    def test_extract_video_id_rejects_cloud_metadata(self, url: str):
        result = VideoService.extract_video_id(url)
        assert result is None, f"Security Breach: extract_video_id accepted metadata URL: {url}"

    @pytest.mark.parametrize("url", CLOUD_METADATA_URLS)
    def test_require_youtube_url_rejects_cloud_metadata(self, url: str):
        with pytest.raises(HTTPException) as exc_info:
            main._require_youtube_url(url)
        assert exc_info.value.status_code == 400


class TestAdversarialSSRFPrivateNetworks:
    """Empirical challenge: RFC1918 & loopback network endpoints MUST return None."""

    @pytest.mark.parametrize("url", PRIVATE_NETWORK_URLS)
    def test_extract_video_id_rejects_private_networks(self, url: str):
        result = VideoService.extract_video_id(url)
        assert result is None, f"Security Breach: extract_video_id accepted private network URL: {url}"

    @pytest.mark.parametrize("url", PRIVATE_NETWORK_URLS)
    def test_require_youtube_url_rejects_private_networks(self, url: str):
        with pytest.raises(HTTPException) as exc_info:
            main._require_youtube_url(url)
        assert exc_info.value.status_code == 400


class TestAdversarialSSRFOpbfuscatedIPs:
    """Empirical challenge: Hex, octal, dword integer, and IPv6 encodings MUST return None."""

    @pytest.mark.parametrize("url", OBFUSCATED_IP_URLS)
    def test_extract_video_id_rejects_obfuscated_ips(self, url: str):
        result = VideoService.extract_video_id(url)
        assert result is None, f"Security Breach: extract_video_id accepted obfuscated IP URL: {url}"


class TestAdversarialSSRFDomainSpoofing:
    """Empirical challenge: Suffix domains, subdomain tricks, and userinfo confusion MUST return None."""

    @pytest.mark.parametrize("url", DOMAIN_SPOOFING_URLS)
    def test_extract_video_id_rejects_domain_spoofing(self, url: str):
        result = VideoService.extract_video_id(url)
        assert result is None, f"Security Breach: extract_video_id accepted spoofed domain URL: {url}"


class TestAdversarialSSRFMaliciousSchemes:
    """Empirical challenge: Non-HTTP/HTTPS schemes (file, ftp, gopher, dict, etc.) MUST return None."""

    @pytest.mark.parametrize("url", MALICIOUS_SCHEME_URLS)
    def test_extract_video_id_rejects_malicious_schemes(self, url: str):
        result = VideoService.extract_video_id(url)
        assert result is None, f"Security Breach: extract_video_id accepted malicious scheme URL: {url}"


class TestAdversarialDownstreamSegmentDownloadGuards:
    """Empirical challenge: Untrusted URLs passed to download_segment and download_segment_sync MUST raise ValueError."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "url",
        [
            "http://169.254.169.254/latest/meta-data/12345678901",
            "http://127.0.0.1:8000/12345678901",
            "http://youtube.com.attacker.com/12345678901",
            "file:///etc/passwd",
            "ftp://evil.com/12345678901",
        ],
    )
    async def test_download_segment_async_raises_value_error_on_ssrf(self, tmp_path, url: str):
        with pytest.raises(ValueError, match=r"Invalid (or untrusted video URL|video ID format)"):
            await VideoService.download_segment(url, 0, 10, str(tmp_path))

    @pytest.mark.parametrize(
        "url",
        [
            "http://169.254.169.254/latest/meta-data/12345678901",
            "http://127.0.0.1:8000/12345678901",
            "http://youtube.com.attacker.com/12345678901",
            "file:///etc/passwd",
            "ftp://evil.com/12345678901",
        ],
    )
    def test_download_segment_sync_raises_value_error_on_ssrf(self, tmp_path, url: str):
        with pytest.raises(ValueError, match=r"Invalid (or untrusted video URL|video ID format)"):
            VideoService.download_segment_sync(url, 0.0, 10.0, str(tmp_path))

    @pytest.mark.parametrize(
        "invalid_id",
        [
            "../../../etc/passwd",
            "too_short",
            "this_id_is_way_too_long_to_be_a_valid_id",
            "id-with-space ",
            "invalid!char",
        ],
    )
    def test_download_segment_sync_rejects_malformed_raw_id(self, tmp_path, invalid_id: str):
        with pytest.raises(ValueError, match="Invalid video ID format"):
            VideoService.download_segment_sync(invalid_id, 0.0, 10.0, str(tmp_path))


class TestLegitimateVideoUrlExtraction:
    """Verifies that legitimate whitelisted URLs continue to extract cleanly and accurately."""

    @pytest.mark.parametrize("url,expected_id", VALID_WHITELISTED_URLS)
    def test_extract_video_id_valid_platforms(self, url: str, expected_id: str):
        extracted = VideoService.extract_video_id(url)
        assert extracted == expected_id, f"Failed to extract {expected_id} from {url}: got {extracted}"
