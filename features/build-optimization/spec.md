# Build Optimization Spec

**Status: ready**

## Background

Every push to main triggers a full GCP Cloud Build run: Docker build (including `npm ci` and
`pip install` from scratch), push to Artifact Registry, migration job, and service deploy. The
Docker build is the largest cost and time driver. Current build time is approximately 4–6 minutes
end-to-end, billed at GCP Cloud Build compute rates.

## Ideas to Explore

### 1. Docker Layer Caching (low effort, immediate savings)

Pull the `latest` image before building and pass it as `--cache-from`. On a cache hit (no changes
to `package-lock.json` or `requirements.txt`), `npm ci` and `pip install` are skipped entirely,
saving 2–3 minutes per build.

```yaml
- name: 'gcr.io/cloud-builders/docker'
  entrypoint: bash
  args: ['-c', 'docker pull ${_REGION}-docker.pkg.dev/.../${_IMAGE_NAME}:latest || true']

- name: 'gcr.io/cloud-builders/docker'
  args: ['build', '--cache-from', '...latest', '-t', '...:$SHORT_SHA', '-t', '...:latest', '.']
```

**Tradeoff:** Adds a pull step (~10–20s). Cache miss on first build after dep changes — subsequent
builds resume caching.

### 2. Build on GitHub Actions, Push Image to Artifact Registry

Run the Docker build in GitHub Actions CI (which has its own layer caching via
`docker/build-push-action` with `cache-type=gha`). Authenticate to GCP from GitHub Actions using
Workload Identity Federation (no long-lived service account key required), push the built image to
Artifact Registry, then trigger a lightweight Cloud Build job that only runs the migration and
deploy steps — skipping the build entirely.

**Benefit:** GitHub Actions compute is free (within limits). Cloud Build billing is reduced to
migration + deploy steps only (~1–2 min vs. 4–6 min).

**Tradeoff:** More complex pipeline — two CI systems need to coordinate. Workload Identity
Federation setup required. The build step on GH Actions is still on every push regardless of whether
it would deploy (e.g., PRs that don't merge).

### 3. Build Locally Before Pushing

Developer builds and pushes the Docker image to Artifact Registry manually before pushing the
branch. Cloud Build then only runs migration and deploy, similar to option 2.

**Benefit:** No CI compute needed for build at all.

**Tradeoff:** Discipline-dependent — easy to forget or push a stale image. Not automatable. Not
suitable for a team workflow. Probably not the right long-term solution.

### 4. Separate Base Image Layer

Build a `base` image containing only OS deps, Python packages, and Node modules — published
separately and only rebuilt when `requirements.txt` or `package-lock.json` change. The app image
uses `FROM base` and only copies source. This is the most cache-efficient approach and works
regardless of where the build runs.

**Tradeoff:** Requires a separate Cloud Build trigger or GH Actions workflow to rebuild the base
image on dep changes. More infrastructure to maintain.

## Decision

**Implement option 1** (Docker layer caching) now — it's a 3-line change to `cloudbuild.yaml` with
immediate savings and no architectural changes.

**Option 2** (GH Actions build + Cloud Build deploy) is the future direction once build frequency
or cost warrants it. The `test-coverage-overhaul` spec documents a `repository_dispatch`-based
post-deploy hook that would form the coordination point between GH Actions and Cloud Build in
that model. Option 2 is not implemented in this feature — track it as a follow-on.

## Known Requirements

- Must not break the existing migration → deploy sequence
- GOOGLE_REDIRECT_URI and WEBSITE_URL must survive across any build pipeline changes (currently
  set as env vars in the deploy step)
- Staging environment (see cicd-staging spec) must be accounted for in whichever approach is chosen

## Test Cases

| Tier | Name | What it checks |
|------|------|----------------|
| Manual | Build time before/after | Record Cloud Build duration before the change and after the first cache-hit build; verify savings are > 1 minute |
| Manual | Cache miss on dep change | Update `requirements.txt`, trigger a build; verify `pip install` runs in full (no stale cache) |
| Manual | Cache hit on source-only change | Change a Python source file only, trigger build; verify `pip install` and `npm ci` steps are skipped |
| Manual | Migration and deploy sequence intact | After caching change, verify the migration job still runs before the deploy step completes |
