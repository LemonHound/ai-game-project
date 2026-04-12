# ADR: Build Optimization Approach

## Context

Every push to main triggers a full GCP Cloud Build run — Docker build (including `npm ci` and
`pip install` from scratch), push to Artifact Registry, migration, and deploy — taking 4–6 minutes
end-to-end. Four options were evaluated for reducing build time.

## Decision

**Implement Docker layer caching (option 1) now.**

Pull the `latest` image before building and pass it as `--cache-from`. On a cache hit (no changes
to `package-lock.json` or `requirements.txt`), `npm ci` and `pip install` are skipped, saving
2–3 minutes per build. The change is 3 lines in `cloudbuild.yaml` with no architectural changes.

## Rejected Alternatives

### Option 2: Build on GH Actions, push image, Cloud Build deploy only

Most scalable long-term. GH Actions compute is free; Cloud Build billing drops to migration +
deploy only (~1–2 min). Rejected for now because it requires Workload Identity Federation setup
and a coordination contract between two CI systems. Added complexity not justified at current
build frequency. Revisit when build cost or frequency becomes a real constraint.

### Option 3: Developer builds locally before pushing

Discipline-dependent, not automatable, not suitable for team workflow. Rejected entirely.

### Option 4: Separate base image layer

Most cache-efficient approach. Rejected for now because it requires a separate Cloud Build trigger
or GH Actions workflow to rebuild the base image on dep changes — more infrastructure to maintain.
This becomes attractive if option 1 proves insufficient (e.g., frequent dep changes break caching
often enough to erode the savings).

## Future Direction

Option 2 (GH Actions build + Cloud Build deploy) is the planned upgrade path. The
`test-coverage-overhaul` spec's `repository_dispatch`-based post-deploy hook already establishes
the coordination point between GH Actions and Cloud Build, which option 2 would extend.
