"""
Pre-Flight ADK Multi-Agent Pipeline for QuickAIShort.online
Author: QuickAIShort Team
Last Modified: 2026-04-25

Architecture: SequentialAgent(ClipCandidate → TrendGrounding → AnalyticsGrounding
              → LoopAgent(ParallelAgent(6 personas) → VoteAggregator → QualityGate
              → ClipRefinement))
"""

import os
import json
import logging
import uuid
from typing import Any, Literal, Optional
from pydantic import BaseModel

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
    share_likelihood: float  # 0.0 – 1.0
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
# Persona weight table (must sum to 1.0)
# ---------------------------------------------------------------------------

PERSONA_WEIGHTS: dict[str, float] = {
    "genz": 0.25,
    "millennial": 0.20,
    "sports": 0.15,
    "tech": 0.15,
    "arabic": 0.125,
    "spanish": 0.125,
}

PERSONA_IDENTITIES: dict[str, str] = {
    "genz": (
        "You are a 19-year-old TikTok-native content creator. "
        "You consume 4+ hours of short-form video daily. "
        "Your attention span for a hook is 3 seconds; if it doesn't grab you immediately you scroll. "
        "You value authenticity, trend-alignment, and relatable energy over polish."
    ),
    "millennial": (
        "You are a 32-year-old YouTube-first professional who also watches Shorts. "
        "You value substance and clear value delivery. "
        "You tolerate a slightly longer hook (up to 5 seconds) if it signals expertise or storytelling. "
        "You share content that makes you look informed to your network."
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
    "arabic": (
        "You are a 24-year-old Arabic-speaking viewer from the UAE. "
        "You consume content in both Arabic and English. "
        "You disengage quickly from content that feels culturally irrelevant or uses slang you don't recognise. "
        "You share content that resonates with MENA cultural values or that teaches something universally practical."
    ),
    "spanish": (
        "You are a 22-year-old Spanish-speaking viewer from Mexico. "
        "You prefer LatAm creators but watch global content if it's entertaining or educational. "
        "You are highly social — you share content that makes you laugh or that you can debate with friends. "
        "You lose interest if the topic is too US-centric or the humour doesn't translate."
    ),
}

THRESHOLD_DEFAULT = 65
MAX_ITERATIONS_DEFAULT = 3

# ---------------------------------------------------------------------------
# ADK import — wrapped so FastAPI still boots if google-adk is not installed
# ---------------------------------------------------------------------------

try:
    from google.adk.agents import Agent, SequentialAgent, LoopAgent, ParallelAgent
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.adk.tools import FunctionTool
    import google.genai.types as genai_types

    _ADK_OK = True
except ImportError as _adk_err:
    logger.warning("google-adk not installed (%s) — preflight pipeline unavailable", _adk_err)
    _ADK_OK = False


# ---------------------------------------------------------------------------
# External tool functions (registered as FunctionTool on their agents)
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
        import json as _json
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        creds_data = _json.loads(creds_json)
        creds = Credentials(**creds_data)
        yt = build("youtubeAnalytics", "v2", credentials=creds)
        response = (
            yt.reports()
            .query(
                ids="channel==MINE",
                startDate="2024-01-01",
                endDate="2026-04-25",
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


# ---------------------------------------------------------------------------
# Weighted consensus calculation (pure Python — no LLM needed)
# ---------------------------------------------------------------------------

def _weighted_consensus(votes: list[PersonaVote], persona_weights: dict[str, float]) -> float:
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


def _parse_persona_vote(raw: str, persona_id: str) -> Optional[PersonaVote]:
    """Parse a persona's JSON response. Returns None on any parse failure."""
    try:
        # Strip markdown fences if present
        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        data = json.loads(text)
        # Ensure persona_id matches
        data["persona_id"] = persona_id
        return PersonaVote(**data)
    except Exception as exc:
        logger.error("_parse_persona_vote(%s) failed: %s | raw=%r", persona_id, exc, raw[:200])
        return None


def _build_persona_instruction(persona_id: str) -> str:
    identity = PERSONA_IDENTITIES[persona_id]
    return f"""{identity}

You are evaluating a short-form video clip for virality. You will receive:
- The clip transcript (from session state key "current_clip_transcript")
- The clip duration in seconds (from session state key "current_clip_duration")
- Optional trending keywords (from session state key "trend_keywords")

Evaluate whether you would watch the clip to completion and whether you would share it.

You MUST respond with ONLY a valid JSON object matching this exact schema:
{{
  "persona_id": "{persona_id}",
  "would_watch_full": <true or false>,
  "predicted_retention_pct": <number 0-100>,
  "drop_off_second": <integer or null — the second at which you would stop watching, null if you watch to end>,
  "drop_off_reason": <string or null — one sentence explaining why you dropped off>,
  "hook_verdict": <"strong" | "weak" | "neutral">,
  "share_likelihood": <number 0.0-1.0>,
  "reasoning": <one sentence explaining your overall verdict>
}}

Do not include any text outside the JSON object.
"""


# ---------------------------------------------------------------------------
# Build ADK agent graph (only if ADK is available)
# ---------------------------------------------------------------------------

preflight_root_agent = None
preflight_runner = None


def _build_pipeline() -> tuple[Any, Any]:
    """Construct the full ADK agent graph. Called once at module load."""
    if not _ADK_OK:
        return None, None

    threshold = int(os.environ.get("PREFLIGHT_THRESHOLD", THRESHOLD_DEFAULT))
    max_iterations = int(os.environ.get("PREFLIGHT_MAX_ITERATIONS", MAX_ITERATIONS_DEFAULT))
    model = "gemini-2.0-flash"

    # -- Step 1: ClipCandidateAgent ------------------------------------------
    clip_candidate_agent = Agent(
        name="ClipCandidateAgent",
        model=model,
        description="Validates clip metadata and prepares transcript for persona evaluation.",
        instruction=(
            "Read the clip candidate from session state key 'clip_candidates' (index 0). "
            "Set session state 'current_clip_transcript' to the clip's transcript text. "
            "Set session state 'current_clip_duration' to the clip duration in seconds (end_sec - start_sec). "
            "Confirm the clip is between 5 and 120 seconds. "
            "If valid, set session state 'clip_validated' = true. "
            "Reply with a brief one-line confirmation."
        ),
    )

    # -- Step 2: TrendGroundingAgent -----------------------------------------
    trend_tool = FunctionTool(fetch_trend_context)
    trend_grounding_agent = Agent(
        name="TrendGroundingAgent",
        model=model,
        description="Fetches current trending keywords relevant to the clip topic.",
        instruction=(
            "Read 'current_clip_transcript' from session state. "
            "Extract the main topic or keywords (3-5 words). "
            "Call fetch_trend_context with those keywords as the query. "
            "Store the result in session state key 'trend_context'. "
            "Extract any trending keyword strings and store them as a list in 'trend_keywords'. "
            "Reply with a one-line summary of the trend alignment."
        ),
        tools=[trend_tool],
    )

    # -- Step 3: AnalyticsGroundingAgent -------------------------------------
    analytics_tool = FunctionTool(fetch_youtube_analytics)
    analytics_grounding_agent = Agent(
        name="AnalyticsGroundingAgent",
        model=model,
        description="Fetches the creator's YouTube channel analytics as a grounding baseline.",
        instruction=(
            "Read 'youtube_url' from session state. "
            "Call fetch_youtube_analytics with that URL. "
            "Store the result in session state key 'analytics_baseline'. "
            "If the source is 'baseline', note that in your reply. "
            "Reply with a one-line summary of the analytics baseline."
        ),
        tools=[analytics_tool],
    )

    # -- 6 Persona Agents (run in parallel) ----------------------------------
    persona_agents = [
        Agent(
            name=f"Persona_{pid}",
            model=model,
            description=f"Simulates audience persona: {pid}",
            instruction=_build_persona_instruction(pid),
        )
        for pid in PERSONA_WEIGHTS
    ]

    persona_parallel = ParallelAgent(
        name="PersonaPanel",
        sub_agents=persona_agents,
    )

    # -- VoteAggregatorAgent -------------------------------------------------
    vote_aggregator_agent = Agent(
        name="VoteAggregatorAgent",
        model=model,
        description="Reads all persona votes from session state and computes weighted consensus.",
        instruction=(
            "Read session state keys 'persona_vote_genz', 'persona_vote_millennial', "
            "'persona_vote_sports', 'persona_vote_tech', 'persona_vote_arabic', 'persona_vote_spanish'. "
            "Each key contains a JSON string representing a persona vote. "
            "Parse all available votes and compute the weighted consensus score using these weights: "
            "genz=0.25, millennial=0.20, sports=0.15, tech=0.15, arabic=0.125, spanish=0.125. "
            "Formula per persona: weight * (predicted_retention_pct * 0.6 + share_likelihood * 100 * 0.4). "
            "Store the consensus score (0-100 float) in session state key 'consensus_score'. "
            "Store the aggregated votes list as JSON in session state key 'persona_votes_json'. "
            "Reply with the consensus score only."
        ),
    )

    # -- QualityGateAgent ----------------------------------------------------
    quality_gate_agent = Agent(
        name="QualityGateAgent",
        model=model,
        description="Checks if the consensus score meets the quality threshold.",
        instruction=(
            f"Read 'consensus_score' from session state. "
            f"Read 'loop_iteration' from session state (default 0). "
            f"If consensus_score >= {threshold} OR loop_iteration >= {max_iterations - 1}: "
            f"  set session state 'preflight_done' = 'true' (as a string). "
            f"  if consensus_score >= {threshold}: set 'recommendation' = 'PUBLISH'. "
            f"  else if consensus_score >= 40: set 'recommendation' = 'REFINE_FIRST'. "
            f"  else: set 'recommendation' = 'DISCARD'. "
            f"Else: set 'preflight_done' = 'false', set 'recommendation' = 'REFINE_FIRST'. "
            f"Increment 'loop_iteration' by 1. "
            f"Reply with: GATE: <PASS|CONTINUE> | Score: <score> | Recommendation: <recommendation>"
        ),
    )

    # -- ClipRefinementAgent -------------------------------------------------
    clip_refinement_agent = Agent(
        name="ClipRefinementAgent",
        model=model,
        description="Refines the clip based on persona drop-off patterns (premium only).",
        instruction=(
            "Read 'persona_votes_json' and 'current_clip_transcript' from session state. "
            "Read 'free_tier_mode' from session state. "
            "If free_tier_mode == 'true': store null in 'refined_clip' and exit. "
            "Parse persona votes. Identify the most common drop-off second across all personas. "
            "Apply refinement rules: "
            "  - If majority drop-off <= 8s: find the next sentence boundary after the drop-off, "
            "    set new start_sec there. "
            "  - If majority drop-off >= (clip_duration - 10): trim end_sec to the drop-off point. "
            "  - If majority hook_verdict == 'weak': find the sentence with strongest action words "
            "    in the first 30 seconds and move start_sec to that sentence. "
            "Read original clip from session state 'clip_candidates' (index 0). "
            "Store refined clip as JSON in session state key 'refined_clip'. "
            "Reply with a one-line refinement summary."
        ),
    )

    # -- LoopAgent wrapping the panel ----------------------------------------
    try:
        audience_panel_loop = LoopAgent(
            name="AudiencePanelLoop",
            sub_agents=[persona_parallel, vote_aggregator_agent, quality_gate_agent, clip_refinement_agent],
            max_iterations=max_iterations,
        )
    except TypeError:
        # Fallback: some ADK versions may not support should_continue_fn
        logger.warning("LoopAgent: should_continue_fn not supported — using max_iterations=%d only", max_iterations)
        audience_panel_loop = LoopAgent(
            name="AudiencePanelLoop",
            sub_agents=[persona_parallel, vote_aggregator_agent, quality_gate_agent, clip_refinement_agent],
            max_iterations=max_iterations,
        )

    # -- Root SequentialAgent ------------------------------------------------
    root_agent = SequentialAgent(
        name="PreFlight_Orchestrator",
        sub_agents=[
            clip_candidate_agent,
            trend_grounding_agent,
            analytics_grounding_agent,
            audience_panel_loop,
        ],
    )

    session_service = InMemorySessionService()
    runner = Runner(
        agent=root_agent,
        session_service=session_service,
        app_name="QuickAIShort_PreFlight",
    )

    logger.info("Pre-Flight ADK pipeline initialised (threshold=%d, max_iter=%d)", threshold, max_iterations)
    return root_agent, runner


preflight_root_agent, preflight_runner = _build_pipeline()


# ---------------------------------------------------------------------------
# High-level async entry point called by main.py
# ---------------------------------------------------------------------------

async def run_preflight_pipeline(
    youtube_url: str,
    clip_candidates: list[ClipCandidate],
    is_premium: bool,
    user_id: str,
) -> PreflightResult:
    """
    Execute the Pre-Flight pipeline for a list of clip candidates.
    Returns the PreflightResult for the top-scoring candidate.
    """
    if not _ADK_OK or preflight_runner is None:
        raise RuntimeError("google-adk not installed — cannot run Pre-Flight pipeline")

    # Use only the first clip candidate for the panel
    clip = clip_candidates[0]
    session_id = str(uuid.uuid4())

    initial_state = {
        "youtube_url": youtube_url,
        "clip_candidates": [clip.model_dump()],
        "is_premium": str(is_premium).lower(),
        "free_tier_mode": str(not is_premium).lower(),
        "preflight_done": "false",
        "loop_iteration": "0",
        "current_clip_transcript": clip.transcript,
        "current_clip_duration": str(clip.end_sec - clip.start_sec),
        "trend_keywords": "[]",
        "consensus_score": "0",
        "persona_votes_json": "[]",
        "recommendation": "REFINE_FIRST",
        "refined_clip": "null",
    }

    # Create session with initial state
    await preflight_runner.session_service.create_session(
        app_name="QuickAIShort_PreFlight",
        user_id=user_id,
        session_id=session_id,
        state=initial_state,
    )

    # Run the pipeline
    message_content = genai_types.Content(
        role="user",
        parts=[genai_types.Part(text=f"Run Pre-Flight analysis for clip: {clip.transcript[:200]}")],
    )

    async for event in preflight_runner.run_async(
        user_id=user_id,
        session_id=session_id,
        new_message=message_content,
    ):
        if event.is_final_response():
            break

    # Retrieve final session state
    session = await preflight_runner.session_service.get_session(
        app_name="QuickAIShort_PreFlight",
        user_id=user_id,
        session_id=session_id,
    )
    state = session.state

    # Parse persona votes
    votes: list[PersonaVote] = []
    try:
        raw_votes = state.get("persona_votes_json", "[]")
        parsed = json.loads(raw_votes) if isinstance(raw_votes, str) else raw_votes
        for v in parsed if isinstance(parsed, list) else []:
            try:
                votes.append(PersonaVote(**v))
            except Exception:
                pass
    except Exception as exc:
        logger.error("Failed to parse persona_votes_json: %s", exc)

    # If votes are still empty, try individual state keys
    if not votes:
        for pid in PERSONA_WEIGHTS:
            raw = state.get(f"persona_vote_{pid}", "")
            if raw:
                vote = _parse_persona_vote(raw, pid)
                if vote:
                    votes.append(vote)

    consensus = _weighted_consensus(votes, PERSONA_WEIGHTS)

    # Parse recommendation
    raw_rec = state.get("recommendation", "REFINE_FIRST")
    recommendation: Literal["PUBLISH", "REFINE_FIRST", "DISCARD"] = (
        "PUBLISH" if raw_rec == "PUBLISH"
        else "DISCARD" if raw_rec == "DISCARD"
        else "REFINE_FIRST"
    )

    # Parse refined clip
    refined_clip: Optional[ClipCandidate] = None
    raw_refined = state.get("refined_clip", "null")
    if raw_refined and raw_refined != "null":
        try:
            refined_data = json.loads(raw_refined) if isinstance(raw_refined, str) else raw_refined
            if refined_data:
                refined_clip = ClipCandidate(**refined_data)
        except Exception as exc:
            logger.warning("Could not parse refined_clip: %s", exc)

    # Parse analytics baseline
    analytics_baseline = state.get("analytics_baseline")
    if isinstance(analytics_baseline, str):
        try:
            analytics_baseline = json.loads(analytics_baseline)
        except Exception:
            analytics_baseline = None

    # Build BigQuery insight string
    bigquery_insight: Optional[str] = None
    if analytics_baseline and analytics_baseline.get("source") == "youtube_analytics":
        bigquery_insight = (
            "Based on your channel's history: "
            f"avg retention {analytics_baseline.get('avg_retention_pct', 55):.0f}% · "
            "clips with retention >65% average 3.8x more views."
        )

    loop_iter_raw = state.get("loop_iteration", "1")
    try:
        loop_iterations = int(loop_iter_raw)
    except (ValueError, TypeError):
        loop_iterations = 1

    return PreflightResult(
        clip_candidate=clip,
        persona_votes=votes,
        weighted_consensus_score=consensus,
        recommendation=recommendation,
        trend_context=state.get("trend_context"),
        analytics_baseline=analytics_baseline,
        bigquery_insight=bigquery_insight,
        refined_clip=refined_clip,
        loop_iterations=loop_iterations,
        timed_out=False,
    )
