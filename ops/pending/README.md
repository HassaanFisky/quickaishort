# Pending patches

Changes that are complete and verified but cannot be pushed by the Arena
GitHub App because its token lacks the `workflows` permission. GitHub rejects
any push that creates or updates a file under `.github/workflows/`.

## 0001-ci-consolidate-workflows.patch

Consolidates the two overlapping CI workflows (`linter.yml`,
`deploy-video-pipeline.yml`) into a single `.github/workflows/ci.yml` with four
jobs: backend-quality, backend-tests, frontend-quality, capability-registry.

The backend pytest suite currently does **not** run on pull requests. This
patch is what adds that gate, and installs ffmpeg so the two `skipif`-guarded
render-path tests actually execute instead of silently skipping.

Verified locally before it was set aside (see the PR description):

    black --check fastapi/            -> 150 files unchanged
    flake8 fastapi/ --select=E9,F63,F7,F82 -> 0
    python fastapi/scripts/check_registry_sync.py -> OK
    cd fastapi && pytest tests/ -q    -> 340 passed, 2 skipped

Apply with either:

    git am ops/pending/0001-ci-consolidate-workflows.patch

or, to review first:

    git apply --stat ops/pending/0001-ci-consolidate-workflows.patch
    git apply ops/pending/0001-ci-consolidate-workflows.patch

After applying, update branch protection: the old required status check names
no longer exist and must be replaced with the four new job names above,
otherwise pull requests will block forever waiting on checks that never report.
