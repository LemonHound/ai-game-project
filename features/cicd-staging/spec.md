# CI/CD Staging Environment Spec

**Status: draft** — open questions below must be resolved before implementation can begin

## Background

Current pipeline: GitHub Actions CI (lint, unit, E2E tests against local docker-compose) → on merge to `main`,
GCP Cloud Build builds the image and deploys to a single Cloud Run service (production). There is no staging
tier. E2E tests that require a live deployment (smoke tests against a real Cloud Run URL, integration tests that
test real GCP services) cannot run before code reaches production.

## Scope

Add a staging tier to the CI/CD pipeline. Every merge to `main` deploys to a staging Cloud Run service first.
Automated tests run against staging. The same image is promoted to production only after tests pass.

## Proposed Pipeline (to be confirmed in planning)

1. **PR open** → GitHub Actions CI: lint, unit tests, API tests, E2E tests (docker-compose local environment) —
   unchanged from current
2. **Merge to main** → Cloud Build: build Docker image, push to Artifact Registry, deploy to **staging** Cloud
   Run service
3. **Post-staging deploy** → automated E2E / smoke test suite runs against the staging URL
4. **On pass** → promote the same image (no rebuild) to **production** Cloud Run
5. **On fail** → block production promotion, flag for review; staging remains on new version for debugging

## Known Requirements

- Staging environment must mirror production configuration (same Cloud Run settings, same secrets structure)
- Production deploy must not occur without passing staging tests — hard gate, not advisory
- Image promotion from staging to production (same artifact, no second build)
- Staging URL must be accessible for manual testing but should not be treated as public-facing
- There must be a documented rollback mechanism if issues are discovered after production promotion
- The CLAUDE.md branch hygiene and push workflow must be updated to reflect the new pipeline steps

## Resolved Questions

- **GCP project**: Same GCP project as production. Separate GCP project adds IAM and billing
  complexity with no isolation benefit at this scale.
- **Staging service**: Separate Cloud Run service (`game-ai-website-staging`). Shares the same
  Artifact Registry; no second image build.
- **Branch strategy**: Only merges to `main` trigger a staging deploy. No separate staging branch.
  `main` always represents staging-eligible code.
- **Promotion**: Automatic — staging tests pass → same image promoted to production with no human
  gate. Manual approval is added only if false-positive staging failures become a recurring problem.
- **Staging scale-to-zero**: Yes. Staging Cloud Run scales to zero when idle.

## Open Questions

These must be resolved before implementation begins.

### Database

- Staging DB strategy: separate Cloud SQL instance, or same instance with a dedicated staging
  database? (Separate instance provides stronger isolation; same instance is cheaper. Consider
  whether staging migrations could affect production if misconfigured.)
- Does the staging deploy run migrations against the staging DB before promoting to production,
  validating that migrations are safe?

### Secrets

- Staging secrets in GCP Secret Manager: (a) separate secret names with `-staging` suffix,
  (b) same secrets with a staging-specific version label, or (c) environment variable overrides
  in the Cloud Run staging service definition. Choose before implementation.

### Test Suite

- Which tests run against staging? All existing E2E/smoke suite, or a dedicated staging-only subset?
- How are staging-specific seed data fixtures managed and reset between test runs?
- Who is notified on staging test failures (Slack alert, GH check, or both)?

### Cost

- Estimate the monthly cost of a persistent Cloud SQL staging instance vs. ephemeral
  (created/destroyed per deploy). The pipeline architecture differs depending on this choice.

## Test Cases

| Tier | Name | What it checks |
|------|------|----------------|
| Manual | Staging deploy on merge to main | Merge a PR; verify Cloud Build deploys to staging, not production |
| Manual | Staging tests block production | Break a staging test; verify production deploy does not proceed |
| Manual | Image promotion (no rebuild) | Verify the same image SHA deployed to staging is promoted to production |
| Manual | Staging scale-to-zero | Leave staging idle; verify it scales to zero; verify next deploy spins it back up |
| Manual | Rollback mechanism | Trigger a rollback; verify the previous image version is deployed to production |
