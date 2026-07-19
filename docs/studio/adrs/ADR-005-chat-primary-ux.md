# ADR-005 — Chat-Primary Editor UX

- **Status:** Proposed → implement in Phase S2  
- **Date:** 2026-07-18  

## Context

Vision: conversation primary, timeline secondary. Current `EditorLayout` already mounts `AIPanel` and gates dense inspectors behind `?advanced=1`, but canvas+dock still dominate default feel.

## Decision

Make **chat column the default primary surface**. Timeline remains always available as contextual dock. Power-user three-panel layout stays behind `advanced=1` (or equivalent toggle).

Ads (when added): **ComingSoonGate** blur — never ship unfinished ads UI live.

## Consequences

- Layout CSS/IA work, not new editor engine  
- Onboarding copy teaches “talk to edit”  
- Advanced mode preserves existing workflows  

## Evidence

`EditorLayout.tsx`, `AIPanel.tsx`, product vision `01-product-vision.md`
