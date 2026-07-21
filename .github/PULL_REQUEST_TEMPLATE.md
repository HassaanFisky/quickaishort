## Pull Request — QuickAI Short

### Description & Context
Explain the change, why it exists, and any linked issues (`Closes #123`). If touching Studio Kernel / Registry / ADK UI, cite the ADR/EP.

---

### Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Performance / cost
- [ ] Security
- [ ] Infra / DevOps
- [ ] Documentation (must separate production vs roadmap)

---

### Verification
- [ ] `cd frontend && npx tsc --noEmit && pnpm build` (FE changes)
- [ ] `python -m py_compile <touched files>` (BE changes)
- [ ] No secrets in diff
- [ ] Did not bypass EP-001 / reopen frozen ADRs without approval
- [ ] ADK UI not documented as live if unchanged Coming Soon

```bash
# Paste relevant command output
```

---

### Security
- [ ] No committed secrets
- [ ] Auth boundaries preserved (JWT verified user id)
- [ ] Safe subprocess args for yt-dlp/ffmpeg
- [ ] Errors sanitized to clients
