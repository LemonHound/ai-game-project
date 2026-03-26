# CI/CD Staging Environment Spec

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

## Open Questions

### Environment Isolation
- **Decided:** same GCP project, separate Cloud Run service for staging (no separate GCP project)
- Staging DB strategy: separate Cloud SQL instance, same instance with a separate database, or schema isolation?
- How are staging secrets managed in GCP Secret Manager (separate secret names/versions vs. environment
  variable override)?

### Test Strategy for Staging
- What test suite runs against staging? All existing E2E? Only smoke tests? New staging-specific tests?
- How are staging-specific test fixtures or seed data managed?
- Who is responsible for keeping staging data clean between runs?

### Promotion Workflow
- Automatic promotion on test pass, or manual approval step before production?
- What constitutes a "blocking" failure vs. a warning?
- How is the deploy-to-production step triggered in Cloud Build (separate trigger, same trigger with stages)?

### Branch Strategy
- Does every branch merge get a staging deploy, or only `main`?
- Is there a separate staging branch, or does `main` always represent staging-eligible code?

### Cost & Operations
- What are the cost implications of a persistent staging Cloud Run service + Cloud SQL instance?
- Should staging scale to zero when not in use?
- Who gets notified on staging test failures?

## Test Cases

_To be defined during planning session._
