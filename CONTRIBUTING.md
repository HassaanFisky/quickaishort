# 🤝 Contributing to QuickAIShort.online

Thank you for your interest in contributing to QuickAIShort.online. We welcome contributions from the engineering community to help optimize our video processing, agentic AI pipelines, and user interfaces. 

To maintain the elite engineering quality, security, and performance standards of this repository, we ask that all contributors adhere to the guidelines below.

---

## 1. Quick Contribution Rules

1. **Direct Pull Requests:** Feel free to open a Pull Request directly for bugs and small feature optimizations. You do not need to ask for permission for clear, non-breaking improvements.
2. **Focused & Atomic Changes:** Submit one logical feature or bug fix per Pull Request. This keeps code reviews highly efficient and reduces regression risk.
3. **Local Validation:** Ensure all lint and build checks pass successfully in your local environment prior to submission.
4. **Adhere to Code Patterns:** Align your implementation with the established architecture, folder layout, and design conventions of the codebase.
5. **Conventional Commits:** Write clean, descriptive, and structured commit messages that specify the scope and intent of the change.

---

## 2. Local Development Lifecycle

To set up your workstation and validate your changes:

```bash
# 1. Clone the repository
git clone https://github.com/HassaanFisky/quickaishort.git
cd quickaishort

# 2. Install dependencies (Frontend and Backend)
pnpm install
# In a separate terminal or virtual environment:
cd fastapi && pip install -r requirements.txt

# 3. Spin up the development server
pnpm dev

# 4. Run local static analysis and typescript checks
pnpm lint
pnpm tsc --noEmit
```

---

## 3. Contribution Classifications

### High-Priority Focus Areas:
* **Bug Fixes:** Address structural issues with reproducible steps.
* **Performance Enhancements:** Optimize FFMpeg transcoding profiles or agent latency with benchmark metrics.
* **Accessibility (a11y):** Improve screen reader support, keyboard navigation, and contrast levels.
* **Security Hardening:** Identify and secure potential input injection vectors or dependencies.

### Standard Contributions:
* **New Caption Themes:** Propose modern CSS caption layouts and animation sets.
* **UI/UX Polish:** Improve micro-animations, loading skeletons, and interactive transitions.
* **Localization:** Add robust multilingual support files.

### Architectural Proposals (Discuss First):
* Adding heavy third-party dependencies.
* Modifying core database schema layouts (MongoDB).
* Introducing breaking changes to API endpoints.
* *Please open a structural RFC (Request for Comments) issue before implementing major structural refactors.*

---

## 4. Code Quality & Standards

* **TypeScript:** Strict mode typing is strictly enforced across the frontend workspace.
* **Linting & Formatting:** Ensure code complies with ESLint and Prettier.
* **Directory Layout:** Preserve the clean boundary between `fastapi/` (Python core services) and `frontend/` (Next.js client interface).
* **Environment Isolation:** Never commit local `.env` or configurations containing private tokens.

---

## 5. Commit Message Standard

We follow the **Conventional Commits** specification to ensure clean and automated release management. Please prefix your commits with the correct action identifier:

* `feat:` A new user-facing feature.
* `fix:` A bug fix.
* `docs:` Documentation updates only.
* `perf:` Code changes that improve performance.
* `refactor:` Code changes that neither fix a bug nor add a feature.
* `test:` Adding missing tests or correcting existing tests.

*Example:* `feat(caption): add modern glow glassmorphic caption theme`

---

## 6. Pull Request & Review Pipeline

1. **Branch Naming:** Create a focused branch off `main` (e.g., `feat/face-tracking-opt` or `fix/paddle-webhook-signature`).
2. **Implement & Format:** Write clean code, run quality checks (`pnpm lint`), and test locally.
3. **Submit PR:** Complete all sections of the [Pull Request Template](file:///.github/PULL_REQUEST_TEMPLATE.md).
4. **Static CI Gates:** GitHub Actions will automatically run typescript checks, backend smoke imports, and linter pipelines.
5. **Code Review:** The engineering team reviews Pull Requests within 48 hours. Small bug fixes may be approved and merged immediately. Large architecture modifications require thorough discussion and consensus.

---

## 7. Licensing & Code Handoff

By contributing to QuickAIShort.online, you agree that your code will be licensed under the project's **MIT License** and that you possess all intellectual property rights to the submitted code.

---

**Thank you for your dedication to building the future of automated video creation!**
