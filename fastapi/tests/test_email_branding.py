"""Automated Brand Verification Suite for Milestone 3 Features 11, 12, 14.

Validates:
- Feature 11: Transactional Email Rebrand in services/email_service.py
- Feature 12: Chrome Extension Rebrand in extension/
- Feature 14: Legal Docs Rebrand in docs/legal/
- Category B Preservation: Sending domains, emails, URLs, internal IDs remain intact.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from services.email_service import (
    _brand_wrapper,
    send_pro_activation_email,
    send_weekly_digest,
    send_welcome_email,
)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


class TestFeature11EmailBranding:
    """Verifies Feature 11 transactional email branding in email_service.py."""

    def test_brand_wrapper_contains_quickai_studio(self):
        """Header banner must render 'QuickAI Studio', never 'QuickAI Short'."""
        html = _brand_wrapper("Test Header", "<p>Test Content</p>")
        assert "QuickAI Studio" in html
        assert "QuickAI Short" not in html
        # Category B check: domain quickaishort.online must still be present
        assert "quickaishort.online" in html

    @pytest.mark.asyncio
    async def test_welcome_email_subject_and_body(self):
        """Welcome email must have subject 'Welcome to QuickAI Studio'."""
        with patch("services.email_service._send", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = True
            result = await send_welcome_email("test@example.com", "Creator")
            assert result is True
            mock_send.assert_awaited_once()
            args, _ = mock_send.call_args
            kind, to_email, subject, html = args
            assert kind == "welcome"
            assert to_email == "test@example.com"
            assert subject == "Welcome to QuickAI Studio"
            assert "QuickAI Studio" in html
            assert "QuickAI Short" not in html
            # Preserves editor link
            assert "https://quickaishort.online/editor" in html

    @pytest.mark.asyncio
    async def test_pro_activation_email_subject(self):
        """Pro activation email subject must be 'Welcome to QuickAI Studio Pro'."""
        with patch("services.email_service._send", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = True
            result = await send_pro_activation_email("pro@example.com", "ProUser")
            assert result is True
            mock_send.assert_awaited_once()
            args, _ = mock_send.call_args
            kind, to_email, subject, html = args
            assert kind == "pro_activation"
            assert subject == "Welcome to QuickAI Studio Pro"
            assert "QuickAI Studio" in html
            assert "QuickAI Short" not in html

    @pytest.mark.asyncio
    async def test_weekly_digest_email_subject_and_title(self):
        """Weekly digest subject and title must be 'Your week on QuickAI Studio'."""
        with patch("services.email_service._send", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = True
            stats = {"export_count": 12, "ai_runs": 45, "credits_balance": 180}
            result = await send_weekly_digest("user@example.com", stats)
            assert result is True
            mock_send.assert_awaited_once()
            args, _ = mock_send.call_args
            kind, to_email, subject, html = args
            assert kind == "weekly_digest"
            assert subject == "Your week on QuickAI Studio"
            assert "Your week on QuickAI Studio" in html
            assert "QuickAI Short" not in html

    def test_email_service_source_has_zero_quickai_short(self):
        """Source file fastapi/services/email_service.py must have 0 occurrences of 'QuickAI Short'."""
        src_path = REPO_ROOT / "fastapi" / "services" / "email_service.py"
        content = src_path.read_text(encoding="utf-8")
        assert "QuickAI Short" not in content
        # Category B assertions
        assert "quickaishort.online" in content
        assert "contact@quickaishort.online" in content


class TestFeature12ExtensionBranding:
    """Verifies Feature 12 Chrome extension rebranding in extension/."""

    def test_manifest_name_and_title(self):
        """manifest.json must have name 'QuickAI Studio' and default_title 'QuickAI Studio'."""
        manifest_path = REPO_ROOT / "extension" / "manifest.json"
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        assert data.get("name") == "QuickAI Studio"
        assert data.get("action", {}).get("default_title") == "QuickAI Studio"
        assert "Shorts" not in data.get("name", "")

    def test_content_js_button_text(self):
        """content.js must set button text to '✦ QuickAI Studio'."""
        content_path = REPO_ROOT / "extension" / "content.js"
        code = content_path.read_text(encoding="utf-8")
        assert 'btn.innerText = "✦ QuickAI Studio";' in code
        assert 'btn.innerText = "✦ QuickAI Short";' not in code

    def test_content_js_console_logs(self):
        """content.js logs should identify as [QuickAI Studio]."""
        content_path = REPO_ROOT / "extension" / "content.js"
        code = content_path.read_text(encoding="utf-8")
        assert "[QuickAI Studio]" in code
        assert "[QuickAI Shorts]" not in code

    def test_extension_readme_branding(self):
        """extension/README.md must reference QuickAI Studio."""
        readme_path = REPO_ROOT / "extension" / "README.md"
        text = readme_path.read_text(encoding="utf-8")
        assert "# QuickAI Studio — Chrome Extension Guide" in text
        assert "✦ QuickAI Studio" in text
        assert "QuickAI Short —" not in text
        assert "✦ QuickAI Short" not in text


class TestFeature14LegalDocsBranding:
    """Verifies Feature 14 legal documents rebrand in docs/legal/."""

    def test_terms_markdown_branding(self):
        """docs/legal/TERMS.md must reference QuickAI Studio and preserve domain."""
        terms_path = REPO_ROOT / "docs" / "legal" / "TERMS.md"
        text = terms_path.read_text(encoding="utf-8")
        assert "# Terms of Service — QuickAI Studio" in text
        assert "use of QuickAI Studio at **quickaishort.online**" in text
        assert "QuickAI Short" not in text
        # Category B preservation
        assert "contact@quickaishort.online" in text
        assert "quickaishort.online" in text

    def test_privacy_markdown_branding(self):
        """docs/legal/PRIVACY.md must reference QuickAI Studio and preserve domain."""
        privacy_path = REPO_ROOT / "docs" / "legal" / "PRIVACY.md"
        text = privacy_path.read_text(encoding="utf-8")
        assert "# Privacy Policy — QuickAI Studio" in text
        assert "QuickAI Studio (“QuickAI,” “we,” “us,” or “our”)" in text
        assert "QuickAI Short" not in text
        # Category B preservation
        assert "contact@quickaishort.online" in text
        assert "quickaishort.online" in text
