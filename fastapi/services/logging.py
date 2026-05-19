"""Structured logging configuration for production observability.

Configures structlog to output JSON for GCP Cloud Logging in production
and pretty-printed logs in development.
"""

import logging
import sys
import os
import uuid
import contextvars
import structlog

# Distributed Tracing context
correlation_id = contextvars.ContextVar("correlation_id", default=None)


def get_correlation_id() -> str:
    """Returns the current correlation ID or generates a new one."""
    cid = correlation_id.get()
    if not cid:
        cid = str(uuid.uuid4())
        correlation_id.set(cid)
    return cid


def setup_logging():
    # Detect if we are in production
    is_prod = os.getenv("ENVIRONMENT", "development").lower() == "production"

    # Standard library logging config
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
    )

    processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
        # Automatically inject correlation ID into every log record
        lambda _, __, event_dict: {
            **event_dict,
            "correlation_id": get_correlation_id(),
        },
    ]

    if is_prod:
        # JSON output for Cloud Logging
        processors.extend(
            [
                structlog.processors.dict_tracebacks,
                structlog.processors.JSONRenderer(),
            ]
        )
    else:
        # Pretty output for local dev
        processors.append(structlog.dev.ConsoleRenderer())

    structlog.configure(
        processors=processors,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str):
    return structlog.get_logger(name)


def log_workload(job_type: str, duration: float, user_id: str, metadata: dict = None):
    """Specific hook for cost-observability in production logs."""
    logger = get_logger("workload_tracker")
    logger.info(
        "workload_complete",
        job_type=job_type,
        duration_sec=round(duration, 2),
        user_id=user_id,
        cost_est_usd=round(duration * 0.0001, 5),  # Heuristic
        **(metadata or {})
    )


def log_metric(
    metric_name: str,
    value: float | int | str,
    user_id: str = "system",
    metadata: dict = None,
):
    """Logs a specific metric for observability dashboards."""
    logger = get_logger("metric_tracker")
    logger.info(
        "metric_event",
        metric_name=metric_name,
        value=value,
        user_id=user_id,
        **(metadata or {})
    )
