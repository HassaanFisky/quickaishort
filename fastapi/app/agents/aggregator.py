from typing import List
from app.models.schemas import PersonaResult, PreflightDecision

def aggregate_scores(results: List[PersonaResult]) -> PreflightDecision:
    """
    Calculates the final decision purely in Python (no LLM).
    Returns RENDER, REVISE, or REJECT.
    """
    if not results:
        return PreflightDecision(
            viral_score=0.0,
            decision="REJECT",
            persona_results=[],
            refinement_notes=["No persona results available."]
        )

    num_personas = len(results)
    
    avg_hook = sum(r.hook_score for r in results) / num_personas
    avg_clarity = sum(r.clarity_score for r in results) / num_personas
    avg_retention = sum(r.retention_score for r in results) / num_personas
    avg_visual = sum(r.visual_match_score for r in results) / num_personas
    avg_emotion = sum(r.emotion_score for r in results) / num_personas
    avg_novelty = sum(r.novelty_score for r in results) / num_personas
    
    avg_drop_sec = sum(r.predicted_drop_second for r in results) / num_personas
    avg_confidence = sum(r.confidence for r in results) / num_personas

    # Weights
    hook_weight = 0.30
    clarity_weight = 0.15
    retention_weight = 0.25
    visual_match_weight = 0.10
    emotion_weight = 0.10
    novelty_weight = 0.10

    raw_score = (
        (avg_hook * hook_weight) +
        (avg_clarity * clarity_weight) +
        (avg_retention * retention_weight) +
        (avg_visual * visual_match_weight) +
        (avg_emotion * emotion_weight) +
        (avg_novelty * novelty_weight)
    )

    notes = []
    decision = "RENDER"
    
    # Penalties and hard rules
    if avg_drop_sec < 4.0:
        raw_score -= 10
        notes.append("Severe drop-off risk before 4s. Hook must be rewritten.")
        decision = "REVISE"

    if avg_confidence < 0.60:
        notes.append("Low confidence across personas. Result is uncertain.")

    if avg_visual < 50:
        notes.append("Visuals do not match the narrative well. Asset swap required.")
        decision = "REVISE"

    if raw_score < 60:
        decision = "REJECT"
    elif 60 <= raw_score < 75 and decision != "REJECT":
        decision = "REVISE"
    
    # Compile top refinement notes from personas if revising
    if decision == "REVISE":
        for r in results:
            notes.extend(r.recommended_changes[:1]) # take top recommendation from each

    return PreflightDecision(
        viral_score=round(raw_score, 2),
        decision=decision,
        persona_results=results,
        refinement_notes=list(set(notes))
    )
