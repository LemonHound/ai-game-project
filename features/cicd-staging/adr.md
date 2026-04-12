# ADR: CI/CD Staging Environment Decisions

## Context

The project needed a staging tier between PR merges and production deploys. Several infrastructure
decisions were required: GCP project scope, service topology, branch strategy, promotion workflow,
and operational settings. This ADR records the decisions that have been made; open questions are
tracked in the spec.

## Decisions

### 1. Same GCP project; separate Cloud Run service

Staging runs in the same GCP project as production. A separate GCP project would add IAM and billing
complexity (cross-project permissions, separate billing accounts, duplicated service enablement) with
no meaningful isolation benefit at current scale.

The staging service is a distinct Cloud Run service (`game-ai-website-staging`) sharing the same
Artifact Registry. This provides a clean separation of traffic and URL without requiring a second
image build or a second project.

### 2. Only merges to `main` trigger a staging deploy

Feature branches do not get staging deploys. `main` is always staging-eligible code. There is no
separate staging branch — the branch strategy in CLAUDE.md (draft PR → squash merge to main) already
ensures that only reviewed, CI-passing code reaches main.

### 3. Automatic promotion on staging test pass

Staging tests pass → the same image is promoted to production automatically. No human approval gate
between staging and production.

Rationale: a manual gate adds latency to every deploy without adding safety if the tests are
reliable. If false-positive staging failures become a problem, a manual gate can be added. Start
simple.

### 4. Staging scales to zero

Staging Cloud Run instance scales to zero when idle. Staging is only alive during a post-merge deploy
cycle (a few minutes per merge). Persistent-instance billing for a service that runs ~5% of the
time is not justified.

### 5. Image promotion, not rebuild

The exact image (by SHA) deployed to staging is promoted to production. No second build step.
Rebuilding would risk introducing variance between the tested and deployed artifact, defeating the
purpose of staging.
