"""Rate-limit decorators must actually be wired to the registered endpoint.

Root defect this guards against
-------------------------------
`@limiter.limit(...)` placed ABOVE `@app.get(...)` silently does nothing.
`@app.get` registers whatever function it receives, so when it runs first
(i.e. is the inner/lower decorator) FastAPI captures the *undecorated*
function; slowapi's wrapper is then applied to a name the router never sees.

Empirically confirmed against slowapi before the fix: an endpoint declared
`3/minute` in the broken order served 8/8 requests with 200, and the
Limiter's global `default_limits` did NOT apply either — such endpoints have
NO rate limiting whatsoever.

Correct order (slowapi documented):

    @app.get("/path")          # outer — registers the wrapped function
    @limiter.limit("30/minute")  # inner — wraps first
    async def handler(request: Request): ...

The wrapped endpoint's code object is slowapi's `async_wrapper`/`sync_wrapper`,
which is what these tests assert on.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from fastapi.routing import APIRoute

import main

_SLOWAPI_WRAPPERS = {"async_wrapper", "sync_wrapper"}

# Endpoints that perform costly work: third-party media extraction (yt-dlp),
# unbounded byte proxying, or paid AI inference. A missing limit here is a
# direct cost-amplification and abuse vector, not a cosmetic issue.
COSTLY_PATHS = {
    "/api/info",
    "/api/proxy",
    "/api/proxy-video",
    "/api/audio",
    "/api/stream-info",
    "/api/analyze",
    "/api/preflight",
    "/api/direct",
    "/api/create-video",
    "/api/adk/generate",
    "/api/adk/enhance",
}

MAIN_PY = Path(__file__).resolve().parents[1] / "main.py"

# Matches the broken stacking: @limiter.limit(...) directly above @app.<verb>(...)
_BROKEN_ORDER = re.compile(
    r"^@limiter\.limit\([^\n]*\)\n@app\.(?:get|post|put|delete|patch|head)\(",
    re.MULTILINE,
)


def _routes_by_path():
    out: dict[str, list[APIRoute]] = {}
    for r in main.app.routes:
        if isinstance(r, APIRoute):
            out.setdefault(r.path, []).append(r)
    return out


class TestDecoratorOrderIsNotReintroduced:
    def test_main_py_has_no_limiter_above_route_decorator(self):
        """Static guard — catches the mistake at review time, on any endpoint."""
        offenders = _BROKEN_ORDER.findall(MAIN_PY.read_text())
        assert offenders == [], (
            f"{len(offenders)} endpoint(s) declare @limiter.limit ABOVE the route "
            "decorator, which silently disables rate limiting. Put @app.<verb> first."
        )


class TestCostlyEndpointsAreActuallyLimited:
    @pytest.mark.parametrize("path", sorted(COSTLY_PATHS))
    def test_costly_endpoint_is_wrapped_by_slowapi(self, path):
        routes = _routes_by_path().get(path)
        assert routes, f"{path} is not registered — update COSTLY_PATHS"

        for route in routes:
            code_name = route.endpoint.__code__.co_name
            assert code_name in _SLOWAPI_WRAPPERS, (
                f"{'/'.join(sorted(route.methods))} {path} "
                f"({route.endpoint.__name__}) is NOT rate limited: registered "
                f"function is '{code_name}', not a slowapi wrapper."
            )

    def test_every_declared_limit_in_main_reaches_a_route(self):
        """The number of limited routes must cover every @limiter.limit in main.py."""
        declared = len(re.findall(r"^@limiter\.limit\(", MAIN_PY.read_text(), re.M))
        wrapped = sum(
            1
            for r in main.app.routes
            if isinstance(r, APIRoute)
            and r.endpoint.__module__ == "main"
            and r.endpoint.__code__.co_name in _SLOWAPI_WRAPPERS
        )
        assert wrapped >= declared, (
            f"main.py declares {declared} rate limits but only {wrapped} routes are "
            "wrapped — some decorators are not taking effect."
        )


class TestLimiterInfrastructure:
    def test_limiter_is_installed_on_the_app(self):
        assert getattr(main.app.state, "limiter", None) is not None

    def test_slowapi_middleware_is_registered(self):
        names = [m.cls.__name__ for m in main.app.user_middleware]
        assert (
            "SlowAPIMiddleware" in names
        ), "SlowAPIMiddleware missing — per-endpoint limits do not run without it."
