import logging
from app.models.schemas import Storyboard, PreflightDecision
from app.agents.director import generate_storyboard
from app.agents.personas import run_all_personas
from app.agents.aggregator import aggregate_scores
from app.utils.logging import structured_log
import time

logger = logging.getLogger(__name__)

async def run_preflight(input_text: str, input_type: str) -> tuple[Storyboard, PreflightDecision]:
    """
    Runs the entire Pre-Flight simulation.
    1. Generates storyboard.
    2. Runs personas.
    3. Aggregates scores.
    4. Runs a 1-time refinement loop if the decision is REVISE.
    """
    # 1. Initial Generation
    logger.info("Generating initial storyboard...")
    t0 = time.time()
    storyboard = await generate_storyboard(input_text, input_type)
    structured_log("preflight_run", "DirectorAgent", "Generated", (time.time() - t0) * 1000)
    
    # 2. First Pass Personas & Aggregation
    logger.info("Running first pass persona simulation...")
    t1 = time.time()
    results = await run_all_personas(storyboard)
    decision = aggregate_scores(results)
    structured_log("preflight_run", "Aggregator", decision.decision, (time.time() - t1) * 1000, {"score": decision.viral_score})
    
    # 3. Check for refinement
    if decision.decision == "REVISE":
        logger.info("Pre-flight returned REVISE. Running 1-time refinement loop...")
        
        # Build refinement context
        refinement_prompt = f"""
        The previous storyboard was marked for REVISION. 
        Notes: {', '.join(decision.refinement_notes)}
        Original Content: {input_text}
        
        Fix the pacing, strengthen the hook (first 3 seconds), and swap weak visual beats.
        Return a highly optimized Storyboard JSON.
        """
        
        # Regenerate based on feedback
        refined_storyboard = await generate_storyboard(refinement_prompt, input_type="feedback")
        
        # Rerun personas on refined version
        refined_results = await run_all_personas(refined_storyboard)
        refined_decision = aggregate_scores(refined_results)
        
        logger.info(f"Refinement complete. New score: {refined_decision.viral_score}")
        return refined_storyboard, refined_decision
        
    return storyboard, decision
