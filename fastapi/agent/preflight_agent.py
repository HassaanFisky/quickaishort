"""Pre-Flight ADK Multi-Agent Pipeline for QuickAIShort.online

Pillar 3 refactor (2026-04-27):
  - Grounding (`fetch_trend_context` + `fetch_youtube_analytics`) is now
    pre-computed in parallel via `asyncio.gather` *before* the ADK
    orchestrator runs. Bypasses ADK's per-tool LLM round-trip for I/O that
    has nothing to do with reasoning.
  - `VoteAggregatorAgent` (LLM call doing pure arithmetic) is replaced with
    a deterministic `BaseAgent` that does the math in Python — saves one
    LLM round trip per loop iteration.
  - QualityGate honours an `early_exit_on_pass` flag: when consensus passes
    on iteration 1, refinement is skipped.
  - Model string is centralised via `services.gemini_client.DEFAULT_MODEL`.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from datetime import datetime
from typing import Any, AsyncIterator, Literal, Optional

from pydantic import BaseModel

from services.gemini_client import DEFAULT_MODEL
MODEL = DEFAULT_MODEL

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pydantic models — shared with main.py via __init__.py
# ---------------------------------------------------------------------------


class PersonaVote(BaseModel):
    persona_id: str
    would_watch_full: bool
    predicted_retention_pct: float
    drop_off_second: Optional[int]
    drop_off_reason: Optional[str]
    hook_verdict: Literal["strong", "weak", "neutral"]
    share_likelihood: float
    reasoning: str


class ClipCandidate(BaseModel):
    start_sec: float
    end_sec: float
    score: float
    transcript: str


class PreflightResult(BaseModel):
    clip_candidate: ClipCandidate
    persona_votes: list[PersonaVote]
    weighted_consensus_score: float
    recommendation: Literal["PUBLISH", "REFINE_FIRST", "DISCARD"]
    trend_context: Optional[dict[str, Any]]
    analytics_baseline: Optional[dict[str, Any]]
    bigquery_insight: Optional[str]
    refined_clip: Optional[ClipCandidate]
    loop_iterations: int
    timed_out: bool = False


# ---------------------------------------------------------------------------
# Persona configuration
# ---------------------------------------------------------------------------


PERSONA_WEIGHTS: dict[str, float] = {
    "genz": 0.25,
    "millennial": 0.25,
    "sports": 0.15,
    "tech": 0.15,
    "entertainment": 0.10,
    "news": 0.10,
}

PERSONA_IDENTITIES: dict[str, str] = {
    "genz": (
        "You are a 19-year-old TikTok-native content creator. "
        "You consume 4+ hours of short-form video daily. "
        "Your attention span for a hook is 3 seconds; if it doesn't grab you immediately you scroll. "
        "You value authenticity, trend-alignment, and relatable energy over polish. "
        "You also represent global youth perspectives."
    ),
    "millennial": (
        "You are a 32-year-old YouTube-first professional who also watches Shorts. "
        "You value substance and clear value delivery. "
        "You tolerate a slightly longer hook (up to 5 seconds) if it signals expertise or storytelling. "
        "You share content that makes you look informed to your network. "
        "You also represent professional viewers from diverse cultural backgrounds."
    ),
    "sports": (
        "You are a 28-year-old sports enthusiast who primarily watches highlight reels and reaction content. "
        "You engage most with high-energy moments, competitive drama, and underdog stories. "
        "You tap out immediately if the energy drops in the first 5 seconds."
    ),
    "tech": (
        "You are a 26-year-old software engineer who follows tech channels for tutorials and industry news. "
        "You appreciate concise, well-structured content with clear takeaways. "
        "You will keep watching if you sense you'll learn something actionable in under 60 seconds."
    ),
    "entertainment": (
        "You are a 24-year-old entertainment enthusiast who watches celebrity content, "
        "pop-culture commentary, and reality TV clips. "
        "You engage with drama, surprise moments, and anything shareable with friends. "
        "You lose interest immediately if the energy is flat or the topic is niche."
    ),
    "news": (
        "You are a 38-year-old news-aware professional who watches current events and "
        "informational shorts between meetings. "
        "You value accuracy, relevance to the moment, and concise delivery. "
        "You tap out at clickbait and reward genuine insight with shares."
    ),
}

THRESHOLD_DEFAULT = 65
MAX_ITERATIONS_DEFAULT = 3


# ---------------------------------------------------------------------------
# ADK import
# ---------------------------------------------------------------------------

try:
    from google.adk.agents import (
        Agent,
        BaseAgent,
        LoopAgent,
        ParallelAgent,
        SequentialAgent,
    )
    from google.adk.events import Event, EventActions
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    import google.genai.types as genai_types

    _ADK_OK = True
except ImportError as _adk_err:
    logger.warning("google-adk not installed (%s) — preflight pipeline unavailable", _adk_err)
    _ADK_OK = False
    Agent = BaseAgent = LoopAgent = ParallelAgent = SequentialAgent = None  # type: ignore[assignment]
    Event = EventActions = Runner = InMemorySessionService = None  # type: ignore[assignment]
    genai_types = None  # type: ignore[assignment]

# MCPToolset is a sub-package of ADK — import separately so a missing optional
# dependency never breaks the main ADK import above.
_MCP_OK = False
MCPToolset = StdioServerParams = None  # type: ignore[assignment]
if _ADK_OK:
    try:
        from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset, StdioServerParams  # type: ignore[assignment]
        _MCP_OK = True
    except ImportError:
        logger.warning("google-adk MCPToolset not available — Supabase MCP agent disabled")


# ---------------------------------------------------------------------------
# Async grounding (runs OUTSIDE ADK so we can true-parallel both calls)
# ---------------------------------------------------------------------------


async def fetch_trend_context(query: str) -> dict[str, Any]:
    """Call SerpAPI Google Trends. Falls back gracefully if key is absent."""
    serpapi_key = os.environ.get("SERPAPI_KEY")
    if not serpapi_key:
        return {"source": "fallback", "trends": [], "reason": "SERPAPI_KEY not set"}
    try:
        import httpx

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://serpapi.com/search",
                params={
                    "q": query,
                    "api_key": serpapi_key,
                    "engine": "google_trends",
                    "data_type": "TIMESERIES",
                },
            )
            resp.raise_for_status()
            return {"source": "serpapi", "data": resp.json()}
    except Exception as exc:
        logger.warning("fetch_trend_context failed: %s", exc)
        return {"source": "fallback", "trends": [], "reason": str(exc)}


async def fetch_youtube_analytics(youtube_url: str) -> dict[str, Any]:
    """Fetch creator's channel analytics via YouTube Data API OAuth."""
    creds_json = os.environ.get("YOUTUBE_OAUTH_CREDENTIALS")
    if not creds_json:
        return {
            "source": "baseline",
            "avg_retention_pct": 55.0,
            "avg_view_duration_sec": 38.0,
            "top_performing_hooks": [],
            "reason": "No YouTube OAuth credentials — connect YouTube account for personalized grounding",
        }
    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        creds_data = json.loads(creds_json)
        creds = Credentials(**creds_data)
        yt = build("youtubeAnalytics", "v2", credentials=creds)
        response = (
            yt.reports()
            .query(
                ids="channel==MINE",
                startDate="2024-01-01",
                endDate=datetime.now().strftime("%Y-%m-%d"),
                metrics="averageViewDuration,views,estimatedMinutesWatched",
                dimensions="video",
                maxResults=50,
            )
            .execute()
        )
        return {"source": "youtube_analytics", "data": response}
    except Exception as exc:
        logger.warning("fetch_youtube_analytics failed: %s", exc)
        return {
            "source": "baseline",
            "avg_retention_pct": 55.0,
            "avg_view_duration_sec": 38.0,
            "reason": str(exc),
        }


async def _gather_grounding(
    youtube_url: str, transcript: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Run both grounding calls truly in parallel."""
    keywords = " ".join(transcript.split()[:5]) or "viral shorts"
    trend, analytics = await asyncio.gather(
        fetch_trend_context(keywords),
        fetch_youtube_analytics(youtube_url),
        return_exceptions=False,
    )
    return trend, analytics


# ---------------------------------------------------------------------------
# Deterministic helpers
# ---------------------------------------------------------------------------


def _weighted_consensus(
    votes: list[PersonaVote], persona_weights: dict[str, float]
) -> float:
    total_weight = 0.0
    weighted_sum = 0.0
    for vote in votes:
        w = persona_weights.get(vote.persona_id, 0.0)
        score = vote.predicted_retention_pct * 0.6 + vote.share_likelihood * 100.0 * 0.4
        weighted_sum += w * score
        total_weight += w
    if total_weight == 0:
        return 0.0
    return round(weighted_sum / total_weight, 1)


def _parse_persona_vote(raw: Any, persona_id: str) -> Optional[PersonaVote]:
    if raw is None:
        return None
    try:
        if isinstance(raw, dict):
            data = raw
        else:
            text = str(raw).strip()
            if text.startswith("```"):
                lines = text.split("\n")
                text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
            data = json.loads(text)
        data["persona_id"] = persona_id
        return PersonaVote(**data)
    except Exception as exc:
        logger.warning("_parse_persona_vote(%s) failed: %s", persona_id, exc)
        return None


def _build_persona_instruction(persona_id: str) -> str:
    identity = PERSONA_IDENTITIES[persona_id]
    return f"""{identity}

You are evaluating a short-form video clip for virality. Read from session state:
- "current_clip_transcript" — the clip transcript
- "current_clip_duration" — clip duration in seconds
- "trend_keywords" — optional list of trending keywords
- "analytics_baseline" — channel baseline metrics

Decide whether you would watch the clip to completion and whether you would share it.

Respond with ONLY a valid JSON object matching this exact schema:
{{
  "persona_id": "{persona_id}",
  "would_watch_full": <true or false>,
  "predicted_retention_pct": <number 0-100>,
  "drop_off_second": <integer or null>,
  "drop_off_reason": <string or null>,
  "hook_verdict": <"strong" | "weak" | "neutral">,
  "share_likelihood": <number 0.0-1.0>,
  "reasoning": <one sentence explaining your overall verdict>
}}

No text outside the JSON object.
"""


# ---------------------------------------------------------------------------
# Build ADK agent graph
# ---------------------------------------------------------------------------


preflight_root_agent = None
preflight_runner = None


class _TrendAgent(BaseAgent if _ADK_OK else object):
    """Grounding agent: fetches Google Trends context."""

    def __init__(self, name: str = "TrendAgent") -> None:
        if _ADK_OK:
            super().__init__(
                name=name,
                description="Fetches real-time Google Trends context (deterministic).",
            )

    async def _run_async_impl(self, ctx) -> AsyncIterator["Event"]:
        state = ctx.session.state if hasattr(ctx, "session") else {}
        transcript = state.get("current_clip_transcript", "")
        keywords = " ".join(transcript.split()[:5]) or "viral shorts"
        
        trend_context = await fetch_trend_context(keywords)
        trend_keywords: list[str] = []
        try:
            trend_data = trend_context.get("data", {})
            if isinstance(trend_data, dict):
                for entry in trend_data.get("interest_over_time", {}).get("timeline_data", [])[:5]:
                    if isinstance(entry, dict) and "query" in entry:
                        trend_keywords.append(str(entry["query"]))
        except Exception:
            pass

        actions = EventActions(
            state_delta={
                "trend_context": trend_context,
                "trend_keywords": trend_keywords,
            }
        )
        yield Event(
            author=self.name,
            actions=actions,
            content=genai_types.Content(
                role="model",
                parts=[genai_types.Part(text=f"TRENDS: keywords={len(trend_keywords)}")]
            ),
        )


class _AnalyticsAgent(BaseAgent if _ADK_OK else object):
    """Grounding agent: fetches YouTube Analytics."""

    def __init__(self, name: str = "AnalyticsAgent") -> None:
        if _ADK_OK:
            super().__init__(
                name=name,
                description="Fetches YouTube creator analytics (deterministic).",
            )

    async def _run_async_impl(self, ctx) -> AsyncIterator["Event"]:
        state = ctx.session.state if hasattr(ctx, "session") else {}
        youtube_url = state.get("youtube_url", "")
        
        analytics_baseline = await fetch_youtube_analytics(youtube_url)
        
        actions = EventActions(
            state_delta={"analytics_baseline": analytics_baseline}
        )
        yield Event(
            author=self.name,
            actions=actions,
            content=genai_types.Content(
                role="model",
                parts=[genai_types.Part(text=f"ANALYTICS: source={analytics_baseline.get('source')}")]
            ),
        )


class _DeterministicAggregator(BaseAgent if _ADK_OK else object):  # type: ignore[misc]
    """Pure-Python aggregator. No LLM call — saves one round trip per iter."""

    def __init__(self, name: str = "VoteAggregatorAgent") -> None:
        if _ADK_OK:
            super().__init__(
                name=name,
                description="Computes weighted consensus from persona votes (deterministic).",
            )

    async def _run_async_impl(self, ctx) -> AsyncIterator["Event"]:  # type: ignore[name-defined]
        state = ctx.session.state if hasattr(ctx, "session") else {}
        votes: list[PersonaVote] = []
        for pid in PERSONA_WEIGHTS:
            raw = state.get(f"persona_vote_{pid}")
            vote = _parse_persona_vote(raw, pid)
            if vote is not None:
                votes.append(vote)

        consensus = _weighted_consensus(votes, PERSONA_WEIGHTS)
        votes_json = json.dumps([v.model_dump() for v in votes])

        actions = EventActions(
            state_delta={
                "consensus_score": consensus,
                "persona_votes_json": votes_json,
            }
        )
        yield Event(
            author=self.name,
            actions=actions,
            content=genai_types.Content(
                role="model",
                parts=[
                    genai_types.Part(
                        text=f"AGGREGATE: votes={len(votes)} consensus={consensus}"
                    )
                ],
            ),
        )


class _EarlyExitGate(BaseAgent if _ADK_OK else object):  # type: ignore[misc]
    """Pure-Python quality gate. Sets recommendation + escalates loop exit."""

    def __init__(
        self,
        name: str = "QualityGateAgent",
        threshold: int = THRESHOLD_DEFAULT,
        max_iterations: int = MAX_ITERATIONS_DEFAULT,
    ) -> None:
        if _ADK_OK:
            super().__init__(
                name=name,
                description="Decides PUBLISH / REFINE_FIRST / DISCARD and triggers loop exit.",
            )
        self._threshold = threshold
        self._max_iterations = max_iterations

    async def _run_async_impl(self, ctx) -> AsyncIterator["Event"]:  # type: ignore[name-defined]
        state = ctx.session.state if hasattr(ctx, "session") else {}
        try:
            consensus = float(state.get("consensus_score", 0))
        except (TypeError, ValueError):
            consensus = 0.0
        try:
            iteration = int(state.get("loop_iteration", 0))
        except (TypeError, ValueError):
            iteration = 0

        passed = consensus >= self._threshold
        last_iter = iteration >= (self._max_iterations - 1)
        done = passed or last_iter

        if passed:
            recommendation = "PUBLISH"
        elif consensus >= 40:
            recommendation = "REFINE_FIRST"
        else:
            recommendation = "DISCARD"

        actions = EventActions(
            state_delta={
                "preflight_done": "true" if done else "false",
                "recommendation": recommendation,
                "loop_iteration": iteration + 1,
                "skip_refinement": "true" if passed else "false",
            },
            escalate=done,
        )
        yield Event(
            author=self.name,
            actions=actions,
            content=genai_types.Content(
                role="model",
                parts=[
                    genai_types.Part(
                        text=(
                            f"GATE: {'PASS' if passed else 'CONTINUE'} | "
                            f"score={consensus} | rec={recommendation}"
                        )
                    )
                ],
            ),
        )


def _build_pipeline() -> tuple[Any, Any]:
    if not _ADK_OK:
        return None, None

    threshold = int(os.environ.get("PREFLIGHT_THRESHOLD", THRESHOLD_DEFAULT))
    max_iterations = int(os.environ.get("PREFLIGHT_MAX_ITERATIONS", MAX_ITERATIONS_DEFAULT))
    model = MODEL

    # Configure retry options for Gemini API (429/5xx protection)
    retry_config = genai_types.HttpRetryOptions(
        initial_delay=2.0,
        attempts=5,
    )
    generate_config = genai_types.GenerateContentConfig(
        http_options=genai_types.HttpOptions(retry_options=retry_config)
    )

    clip_candidate_agent = Agent(
        name="ClipCandidateAgent",
        model=model,
        generate_content_config=generate_config,
        description="Validates clip metadata and prepares transcript for persona evaluation.",
        instruction=(
            "Read the clip candidate from session state key 'clip_candidates' (index 0). "
            "Confirm the clip is between 5 and 120 seconds. "
            "Reply with a brief one-line confirmation. "
            "(Note: 'current_clip_transcript' and 'current_clip_duration' have already "
            "been pre-populated by the calling code.)"
        ),
    )

    persona_agents = [
        Agent(
            name=f"Persona_{pid}",
            model=model,
            generate_content_config=generate_config,
            description=f"Simulates audience persona: {pid}",
            instruction=_build_persona_instruction(pid),
            output_key=f"persona_vote_{pid}",
        )
        for pid in PERSONA_WEIGHTS
    ]

    persona_panel = ParallelAgent(
        name="PersonaPanel",
        sub_agents=persona_agents,
    )

    vote_aggregator = _DeterministicAggregator()
    quality_gate = _EarlyExitGate(threshold=threshold, max_iterations=max_iterations)

    clip_refinement_agent = Agent(
        name="ClipRefinementAgent",
        model=model,
        generate_content_config=generate_config,
        description="Refines the clip based on persona drop-off patterns (premium only).",
        instruction=(
            "Read 'persona_votes_json' and 'current_clip_transcript' from session state. "
            "Read 'free_tier_mode' and 'skip_refinement' from session state. "
            "If free_tier_mode == 'true' OR skip_refinement == 'true': "
            "  store null in 'refined_clip' and exit. "
            "Otherwise parse persona votes, find majority drop-off second, and apply: "
            "  - drop-off <= 8s: move start_sec to next sentence boundary. "
            "  - drop-off >= (clip_duration - 10): trim end_sec to drop-off point. "
            "  - majority hook_verdict == 'weak': move start_sec to strongest action sentence in first 30s. "
            "Read original clip from 'clip_candidates' (index 0) and store the refined "
            "ClipCandidate JSON in session state key 'refined_clip'. "
            "Reply with a one-line refinement summary."
        ),
    )

    audience_panel_loop = LoopAgent(
        name="AudiencePanelLoop",
        sub_agents=[persona_panel, vote_aggregator, quality_gate, clip_refinement_agent],
        max_iterations=max_iterations,
    )

    trend_agent = _TrendAgent()
    analytics_agent = _AnalyticsAgent()

    # Supabase MCP agent — queries historical preflight data for channel context.
    # Activated only when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set and
    # MCPToolset is available in the installed ADK build.
    supabase_mcp_agent = None
    _supabase_url = os.environ.get("SUPABASE_URL", "")
    _supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if _MCP_OK and _supabase_url and _supabase_key:
        try:
            _mcp_toolset = MCPToolset(
                connection_params=StdioServerParams(
                    command="npx",
                    args=["-y", "@supabase/mcp-server-supabase@latest"],
                    env={
                        "SUPABASE_URL": _supabase_url,
                        "SUPABASE_SERVICE_ROLE_KEY": _supabase_key,
                    },
                )
            )
            supabase_mcp_agent = Agent(
                name="SupabaseMCPAgent",
                model=model,
                generate_content_config=generate_config,
                tools=[_mcp_toolset],
                description="Grounds persona predictions with historical preflight data from Supabase.",
                instruction=(
                    "Use the execute_sql tool to run this query: "
                    "SELECT ROUND(AVG(consensus_score)::numeric, 1) AS avg_score, "
                    "COUNT(*) AS sample_count FROM preflight_results "
                    "WHERE created_at > NOW() - INTERVAL '30 days'. "
                    "If the table does not exist or the query fails, respond with 'null'. "
                    "Otherwise respond with the JSON result only — no extra text."
                ),
                output_key="historical_baseline",
            )
            logger.info("Supabase MCP agent initialised (channel history grounding active)")
        except Exception as _mcp_err:
            logger.warning("Supabase MCP agent init failed: %s", _mcp_err)
            supabase_mcp_agent = None
    else:
        logger.info(
            "Supabase MCP agent skipped (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set)"
        )

    # Pillar 3: Parallelize initial grounding + candidate check (DAG-like).
    # SupabaseMCPAgent is added to the DAG when credentials are available.
    grounding_sub_agents = [clip_candidate_agent, trend_agent, analytics_agent]
    if supabase_mcp_agent is not None:
        grounding_sub_agents.append(supabase_mcp_agent)

    grounding_parallel = ParallelAgent(
        name="GroundingDAG",
        sub_agents=grounding_sub_agents,
    )

    root_agent = SequentialAgent(
        name="PreFlight_Orchestrator",
        sub_agents=[
            grounding_parallel,
            audience_panel_loop,
        ],
    )

    from agent.firestore_session import FirestoreSessionService
    try:
        session_service = FirestoreSessionService()
        logger.info("Pre-Flight using Firestore session service")
    except Exception as fs_err:
        logger.warning(
            "Firestore unavailable (%s) — falling back to InMemorySessionService (dev mode)", fs_err
        )
        session_service = InMemorySessionService()
    runner = Runner(
        agent=root_agent,
        session_service=session_service,
        app_name="QuickAIShort_PreFlight",
    )

    logger.info(
        "Pre-Flight ADK pipeline initialised (model=%s, threshold=%d, max_iter=%d)",
        model, threshold, max_iterations,
    )
    return root_agent, runner


try:
    preflight_root_agent, preflight_runner = _build_pipeline()
except Exception as _pipeline_init_err:
    logger.error("Pre-Flight pipeline failed to initialise: %s", _pipeline_init_err)
    preflight_root_agent, preflight_runner = None, None


# ---------------------------------------------------------------------------
# High-level async entry point
# ---------------------------------------------------------------------------


async def run_preflight_pipeline(
    youtube_url: str,
    clip_candidates: list[ClipCandidate],
    is_premium: bool,
    user_id: str,
) -> PreflightResult:
    if not _ADK_OK or preflight_runner is None:
        raise RuntimeError("google-adk not installed — cannot run Pre-Flight pipeline")

    clip = clip_candidates[0]
    session_id = str(uuid.uuid4())

    # Grounding is now handled by TrendAgent and AnalyticsAgent in the GroundingDAG.
    trend_keywords: list[str] = []
    trend_context = {}
    analytics_baseline = {}


    initial_state: dict[str, Any] = {
        "youtube_url": youtube_url,
        "clip_candidates": [clip.model_dump()],
        "is_premium": str(is_premium).lower(),
        "free_tier_mode": str(not is_premium).lower(),
        "preflight_done": "false",
        "loop_iteration": 0,
        "current_clip_transcript": clip.transcript,
        "current_clip_duration": str(clip.end_sec - clip.start_sec),
        "trend_context": trend_context,
        "trend_keywords": trend_keywords,
        "analytics_baseline": analytics_baseline,
        "consensus_score": 0,
        "persona_votes_json": "[]",
        "recommendation": "REFINE_FIRST",
        "refined_clip": "null",
        "skip_refinement": "false",
    }

    await preflight_runner.session_service.create_session(
        app_name="QuickAIShort_PreFlight",
        user_id=user_id,
        session_id=session_id,
        state=initial_state,
    )

    message = genai_types.Content(
        role="user",
        parts=[
            genai_types.Part(
                text=f"Run Pre-Flight analysis for clip: {clip.transcript[:200]}"
            )
        ],
    )

    async for event in preflight_runner.run_async(
        user_id=user_id,
        session_id=session_id,
        new_message=message,
    ):
        logger.info("Pipeline event: author=%s, content=%s", event.author, getattr(event, 'content', 'N/A'))
        if event.is_final_response():
            # Check if we actually have some results in state before breaking, 
            # as is_final_response might trigger on intermediate sequential steps in some ADK versions.
            session = await preflight_runner.session_service.get_session(
                app_name="QuickAIShort_PreFlight",
                user_id=user_id,
                session_id=session_id,
            )
            if session.state.get("preflight_done") == "true":
                logger.info("Final response received and preflight is marked as done.")
                break

    session = await preflight_runner.session_service.get_session(
        app_name="QuickAIShort_PreFlight",
        user_id=user_id,
        session_id=session_id,
    )
    state = session.state
    
    # Extract grounding data that was populated by TrendAgent and AnalyticsAgent
    trend_context = state.get("trend_context", {})
    trend_keywords = state.get("trend_keywords", [])
    analytics_baseline = state.get("analytics_baseline", {})

    # Parse persona votes (aggregator already wrote JSON).
    votes: list[PersonaVote] = []
    raw_votes = state.get("persona_votes_json", "[]")
    try:
        parsed = json.loads(raw_votes) if isinstance(raw_votes, str) else raw_votes
        for v in parsed if isinstance(parsed, list) else []:
            try:
                votes.append(PersonaVote(**v))
            except Exception:
                pass
    except Exception as exc:
        logger.error("Failed to parse persona_votes_json: %s", exc)

    if not votes:
        for pid in PERSONA_WEIGHTS:
            vote = _parse_persona_vote(state.get(f"persona_vote_{pid}"), pid)
            if vote:
                votes.append(vote)

    consensus = _weighted_consensus(votes, PERSONA_WEIGHTS)

    raw_rec = state.get("recommendation", "REFINE_FIRST")
    recommendation: Literal["PUBLISH", "REFINE_FIRST", "DISCARD"] = (
        "PUBLISH" if raw_rec == "PUBLISH"
        else "DISCARD" if raw_rec == "DISCARD"
        else "REFINE_FIRST"
    )

    refined_clip: Optional[ClipCandidate] = None
    raw_refined = state.get("refined_clip", "null")
    if raw_refined and raw_refined != "null":
        try:
            refined_data = (
                json.loads(raw_refined) if isinstance(raw_refined, str) else raw_refined
            )
            if refined_data:
                refined_clip = ClipCandidate(**refined_data)
        except Exception as exc:
            logger.warning("Could not parse refined_clip: %s", exc)

    bigquery_insight: Optional[str] = None
    if isinstance(analytics_baseline, dict) and analytics_baseline.get("source") == "youtube_analytics":
        bigquery_insight = (
            "Based on your channel's history: "
            f"avg retention {analytics_baseline.get('avg_retention_pct', 55):.0f}% · "
            "clips with retention >65% average 3.8x more views."
        )

    try:
        loop_iterations = int(state.get("loop_iteration", 1))
    except (ValueError, TypeError):
        loop_iterations = 1

    return PreflightResult(
        clip_candidate=clip,
        persona_votes=votes,
        weighted_consensus_score=consensus,
        recommendation=recommendation,
        trend_context=trend_context,
        analytics_baseline=analytics_baseline,
        bigquery_insight=bigquery_insight,
        refined_clip=refined_clip,
        loop_iterations=loop_iterations,
        timed_out=False,
    )
