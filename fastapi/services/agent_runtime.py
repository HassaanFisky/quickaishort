"""Agent Runtime Guardrails & Scaffold Verification.

This service implements declarative agent scaffolds validation, presence checks,
and environment variable validation before AI/tool execution.
"""

import os
import re
import logging
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

# Scaffold files are located relative to this file
SCAFFOLDS_DIR = Path(__file__).resolve().parent.parent / "agent" / "scaffolds"

REQUIRED_SCAFFOLDS = ["SOUL.md", "IDENTITY.md", "AGENTS.md", "MEMORY.md", "BOOTSTRAP.md"]

PLACEHOLDER_PATTERNS = [
    r"\[TODO\]",
    r"\[PLACEHOLDER\]",
    r"\bYOUR_[A-Z0-9_]+\b",
    r"\bCHANGE_ME\b"
]

AGENT_ENV_CONFIGS = {
    "ai_editor_agent": {
        "required": ["GEMINI_API_KEY"],
        "optional": ["GEMINI_PRIMARY_MODEL", "GEMINI_FREE_MODEL"],
    },
    "preflight_agent": {
        "required": ["GEMINI_API_KEY", "GOOGLE_CLOUD_PROJECT"],
        "optional": ["SERPAPI_KEY", "YOUTUBE_OAUTH_CREDENTIALS"],
    },
    "viral_agent": {
        "required": ["GEMINI_API_KEY", "REDIS_URL"],
        "optional": ["GEMINI_PRIMARY_MODEL", "GEMINI_FREE_MODEL"],
    },
    "director_agent": {
        "required": ["GEMINI_API_KEY", "GOOGLE_CLOUD_PROJECT"],
        "optional": ["GEMINI_PRIMARY_MODEL"],
    },
    "render_agent": {
        "required": ["REDIS_URL", "GOOGLE_CLOUD_PROJECT", "EXPORT_SIGNING_SECRET"],
        "optional": ["PUBLIC_API_URL"],
    },
}


def load_scaffold_file(name: str) -> str:
    """Load a scaffold file by name from the scaffolds directory."""
    safe_name = os.path.basename(name)
    file_path = SCAFFOLDS_DIR / safe_name
    if not file_path.exists():
        raise FileNotFoundError(f"Scaffold file not found: {name}")
    return file_path.read_text(encoding="utf-8")


def validate_scaffolds() -> list[dict]:
    """Validate all required scaffolds exist and are free from placeholders."""
    issues = []
    if not SCAFFOLDS_DIR.exists():
        issues.append({
            "type": "error",
            "message": f"Scaffolds directory does not exist: {SCAFFOLDS_DIR}"
        })
        return issues

    for filename in REQUIRED_SCAFFOLDS:
        file_path = SCAFFOLDS_DIR / filename
        if not file_path.exists():
            issues.append({
                "type": "error",
                "message": f"Missing required scaffold file: {filename}"
            })
            continue

        try:
            content = file_path.read_text(encoding="utf-8")
            if not content.strip():
                issues.append({
                    "type": "error",
                    "message": f"Scaffold file is empty: {filename}"
                })
                continue

            # Search for placeholders
            for pattern in PLACEHOLDER_PATTERNS:
                if re.search(pattern, content):
                    issues.append({
                        "type": "error",
                        "message": f"Placeholder pattern '{pattern}' detected in scaffold file: {filename}"
                    })
        except Exception as e:
            issues.append({
                "type": "error",
                "message": f"Failed to read scaffold file '{filename}': {str(e)}"
            })

    return issues


def check_environment_for_agent(agent_name: str) -> list[dict]:
    """Check required and optional environment variables for a specific agent."""
    issues = []
    config = AGENT_ENV_CONFIGS.get(agent_name)
    if not config:
        issues.append({
            "type": "error",
            "message": f"Unknown agent name: {agent_name}"
        })
        return issues

    for var in config["required"]:
        if not os.environ.get(var):
            issues.append({
                "type": "error",
                "variable": var,
                "message": f"Missing required environment variable: {var}"
            })

    for var in config["optional"]:
        if not os.environ.get(var):
            issues.append({
                "type": "warning",
                "variable": var,
                "message": f"Missing optional environment variable: {var}"
            })

    return issues


def get_agent_runtime_report(agent_name: str | None = None) -> dict:
    """Compile agent verification results into a detailed runtime check report."""
    scaffold_issues = validate_scaffolds()
    agents_to_check = [agent_name] if agent_name else list(AGENT_ENV_CONFIGS.keys())
    
    env_issues = {}
    readiness = {}
    
    for agent in agents_to_check:
        issues = check_environment_for_agent(agent)
        env_issues[agent] = issues
        
        has_scaffold_errors = any(i["type"] == "error" for i in scaffold_issues)
        has_env_errors = any(i["type"] == "error" for i in issues)
        
        readiness[agent] = {
            "ready": not (has_scaffold_errors or has_env_errors),
            "status": "ready" if not (has_scaffold_errors or has_env_errors) else "not_ready"
        }

    return {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "scaffolds_directory": str(SCAFFOLDS_DIR),
        "scaffolds_status": "valid" if not any(i["type"] == "error" for i in scaffold_issues) else "invalid",
        "scaffold_issues": scaffold_issues,
        "environment_issues": env_issues,
        "readiness": readiness
    }


def ensure_agent_ready(agent_name: str, strict: bool = False) -> bool:
    """Assert agent readiness. Throws on error in strict mode, logs warnings in non-strict mode."""
    scaffold_issues = validate_scaffolds()
    env_issues = check_environment_for_agent(agent_name)
    
    critical_errors = []
    warnings = []
    
    for issue in scaffold_issues:
        if issue["type"] == "error":
            critical_errors.append(f"Scaffold error: {issue['message']}")
        else:
            warnings.append(f"Scaffold warning: {issue['message']}")
            
    for issue in env_issues:
        if issue["type"] == "error":
            critical_errors.append(f"Environment error: {issue['message']}")
        else:
            warnings.append(f"Environment warning: {issue['message']}")

    for warn in warnings:
        logger.warning(warn)

    if critical_errors:
        error_msg = f"Agent '{agent_name}' is not ready: " + "; ".join(critical_errors)
        if strict:
            logger.error(error_msg)
            raise RuntimeError(error_msg)
        else:
            logger.warning(f"[NON-STRICT MODE] {error_msg}")
            return False
            
    return True
