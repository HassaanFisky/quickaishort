# QuickAI Short Agent Scaffolds & Guardrails

This directory contains the declarative scaffolds defining the roles, personas, memory schemes, and safety constitutions for all agents in the QuickAI Short ecosystem.

## Scaffold Structure

- [SOUL.md](file:///e:/QuickAI%20Short%20orignal/fastapi/agent/scaffolds/SOUL.md): Philosophic core, safety boundaries, and anti-hallucination rules.
- [IDENTITY.md](file:///e:/QuickAI%20Short%20orignal/fastapi/agent/scaffolds/IDENTITY.md): Tone, style, and simulation persona definitions.
- [AGENTS.md](file:///e:/QuickAI%20Short%20orignal/fastapi/agent/scaffolds/AGENTS.md): Technical definitions, allowed/forbidden actions, memory rules, and environment catalogs.
- [MEMORY.md](file:///e:/QuickAI%20Short%20orignal/fastapi/agent/scaffolds/MEMORY.md): State persistence, caching, and TTL strategies.
- [BOOTSTRAP.md](file:///e:/QuickAI%20Short%20orignal/fastapi/agent/scaffolds/BOOTSTRAP.md): Bootstrap routines, placeholder scanning, and strict verification logic.

## Runtime Guardrails
The agent runtime checks are managed by `services/agent_runtime.py`. Before invoking any agent features:
1. All scaffolds are verified for presence and placeholders.
2. The environment variables required for the agent are checked.
3. If strict validation is enabled and fails, a runtime error is raised. Otherwise, warnings are logged and operation degrades gracefully.
