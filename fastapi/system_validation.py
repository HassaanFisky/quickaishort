"""
QuickAI Short — Production Validation Script
Tests all AI Agents (Viral, Director, Preflight) end-to-end.
"""

import asyncio
import os
import json
import logging
from dotenv import load_dotenv

# Load production env
load_dotenv()

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Validation")

async def test_viral_pipeline():
    logger.info("--- Testing Viral Vision Pipeline ---")
    from agent.viral_agent import run_viral_pipeline
    
    # Using a short educational clip URL for testing
    test_url = "https://www.youtube.com/watch?v=86S8pS21n8k" # What is an AI Agent?
    test_transcript = "In this video, we explore the rise of AI agents. These are autonomous systems that can think, plan, and execute tasks using LLMs. They are the next frontier of software."
    
    try:
        # Note: video_id extraction
        video_id = "86S8pS21n8k"
        results = await run_viral_pipeline(test_transcript, 60.0, video_id=video_id)
        
        logger.info(f"Viral Analysis Success: Found {len(results)} clips")
        for i, clip in enumerate(results[:2]):
            logger.info(f"Clip {i+1}: {clip.reason} | Viral Score: {clip.viralAnalysis.score}")
            logger.info(f"Visual Energy: {clip.viralAnalysis.visualEnergy} (Vision-grounded)")
        return True
    except Exception as e:
        logger.error(f"Viral Pipeline Failed: {e}")
        return False

async def test_director_pipeline():
    logger.info("\n--- Testing Director Storyboard Pipeline ---")
    from agent.director_agent import run_director_pipeline
    
    test_script = "A futuristic short about an AI agent named Antigravity who saves a developer's production deployment at 2 AM."
    
    try:
        result = await run_director_pipeline(test_script, "test_user_123")
        logger.info(f"Director Success: Storyboard generated with {len(result.get('storyboard', []))} scenes")
        logger.info(f"Title: {result.get('title')}")
        return True
    except Exception as e:
        logger.error(f"Director Pipeline Failed: {e}")
        return False

async def test_preflight_pipeline():
    logger.info("\n--- Testing Pre-Flight Audience Pipeline ---")
    from agent.preflight_agent import run_preflight_pipeline, ClipCandidate
    
    test_clips = [
        ClipCandidate(
            start_sec=10.0,
            end_sec=25.0,
            score=85.0,
            transcript="This AI agent is actually saving lives by fixing server bugs in real-time."
        )
    ]
    
    try:
        # source_url is required for multimodal grounding
        source_url = "https://www.youtube.com/watch?v=86S8pS21n8k"
        result = await run_preflight_pipeline(source_url, test_clips, False, "test_user_123")
        
        logger.info(f"Pre-Flight Success: Weighted Consensus Score: {result.get('weighted_consensus_score')}")
        logger.info(f"Recommendation: {result.get('recommendation')}")
        logger.info(f"Persona Count: {len(result.get('persona_votes', []))}")
        return True
    except Exception as e:
        logger.error(f"Pre-Flight Pipeline Failed: {e}")
        return False

async def main():
    logger.info("Starting System-Wide Validation...")
    
    viral_ok = await test_viral_pipeline()
    director_ok = await test_director_pipeline()
    preflight_ok = await test_preflight_pipeline()
    
    logger.info("\n" + "="*40)
    logger.info(f"Viral Pipeline:    {'PASS' if viral_ok else 'FAIL'}")
    logger.info(f"Director Pipeline: {'PASS' if director_ok else 'FAIL'}")
    logger.info(f"Pre-Flight:        {'PASS' if preflight_ok else 'FAIL'}")
    logger.info("="*40)
    
    if all([viral_ok, director_ok, preflight_ok]):
        logger.info("SYSTEM READY FOR PRODUCTION DEPLOYMENT")
    else:
        logger.error("SYSTEM VALIDATION FAILED")

if __name__ == "__main__":
    asyncio.run(main())
