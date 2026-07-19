# ADR-006 — Prompt-JSON Tools → Native Function Calling

- **Status:** Accepted migration path  
- **Date:** 2026-07-18  

## Context

AI editor uses prompt-listed tools and `generate_content` JSON parsing. Native Gemini function calling is not used on this path. Dual prompt dialects exist (rich actions vs 17 Premiere-like tools).

## Decision

1. Unify catalogue first  
2. Add **native function declarations** via `google-genai` tools API  
3. Keep JSON text fallback for one release  
4. Do not claim “function calling orchestration” in marketing until T-2.1 ships  

## Consequences

- Better structured tool args; fewer parse failures  
- Still returns client actions for interactive tools  
- Sanitiser remains mandatory gate  

## Evidence

`gemini_client.py`, `ai_editor_engine.py`, absence of FunctionDeclaration on editor path (grep)
