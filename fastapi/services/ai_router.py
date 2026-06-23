import os
from enum import Enum
from dataclasses import dataclass


class TaskType(str, Enum):
    SIMPLE_COMMAND = "simple_command"
    EDITOR_COMMAND = "editor_command"
    PREFLIGHT = "preflight"
    BACKGROUND = "background"
    ESCALATION = "escalation"


class UserTier(str, Enum):
    FREE = "free"
    PRO = "pro"


@dataclass
class ModelConfig:
    model_name: str
    temperature: float
    max_tokens: int


SIMPLE_KEYWORDS = [
    "add caption",
    "trim",
    "cut",
    "mute",
    "volume",
    "speed up",
    "slow down",
    "rotate",
    "crop",
    "flip",
]


def get_model_for_task(
    task_type: TaskType, user_tier: UserTier = UserTier.FREE, command: str = ""
) -> ModelConfig:

    # FREE TIER — always cheapest model
    if user_tier == UserTier.FREE:
        return ModelConfig(
            model_name=os.getenv("GEMINI_FREE_MODEL", "gemini-2.5-flash-lite"),
            temperature=0.3,
            max_tokens=2048,
        )

    # BACKGROUND WORKERS — cheapest for async jobs
    if task_type == TaskType.BACKGROUND:
        return ModelConfig(
            model_name=os.getenv("GEMINI_FREE_MODEL", "gemini-2.5-flash-lite"),
            temperature=0.1,
            max_tokens=1024,
        )

    # SIMPLE COMMANDS — budget model
    command_lower = command.lower()
    is_simple = any(kw in command_lower for kw in SIMPLE_KEYWORDS)
    if task_type == TaskType.SIMPLE_COMMAND or is_simple:
        return ModelConfig(
            model_name=os.getenv("GEMINI_BUDGET_MODEL", "gemini-2.5-flash"),
            temperature=0.3,
            max_tokens=4096,
        )

    # PREFLIGHT ANALYSIS — primary model
    if task_type == TaskType.PREFLIGHT:
        return ModelConfig(
            model_name=os.getenv("GEMINI_PRIMARY_MODEL", "gemini-2.5-flash"),
            temperature=0.4,
            max_tokens=8192,
        )

    # ESCALATION — pro model only when needed
    if task_type == TaskType.ESCALATION:
        return ModelConfig(
            model_name=os.getenv("GEMINI_PRO_MODEL", "gemini-2.5-pro"),
            temperature=0.5,
            max_tokens=16384,
        )

    # DEFAULT — primary model (editor commands)
    return ModelConfig(
        model_name=os.getenv("GEMINI_PRIMARY_MODEL", "gemini-2.5-flash"),
        temperature=0.4,
        max_tokens=8192,
    )
