# Adding a New Feature
1. Each feature will be given a new folder in the /features/ folder (found in the root)
2. Each of these folders will have a spec.md file
3. Design conversation: reference CLAUDE.md + provided spec.md, refine the approach
4. Update spec.md with final design, create adr.md if significant changes to architecture will be made
   Each spec must include a **Test Cases** section listing every new scenario, which tier it belongs to
   (unit / API integration / E2E / manual), and the concrete test name. A feature is not considered complete
   until all automated test cases pass in CI and any manual cases are documented in the manual checklist.
5. Implementation conversation: reference CLAUDE.md + finalized spec.md

# Conversation Preferences
* Keep responses brief. Only provide explanations when requested.
* Never use emojis or comments in code unless explicitly requested.
* Write simple code, use best practice naming conventions.
* Check your work - after each response, review the response and note any potential mistakes or files that should be
  checked for consistency / conflicts.
* Provide suggestions for refactoring, simplification, or modernization. Unless otherwise directed, this should always
  be initiated through a new feature/folder and spec.md file.

# Stack
* Backend: FastAPI (Python 3.11+), PostgreSQL via psycopg2
* Frontend: React 18 + TypeScript, Vite, React Router v6, TanStack Query, Zustand, Tailwind CSS + DaisyUI
* Observability: OpenTelemetry — auto-instrumented FastAPI + psycopg2; GCP Cloud Trace + Cloud Monitoring in prod, console exporter locally
* Testing: Jest (unit), Playwright (E2E / API / smoke)
* CI/CD: GitHub Actions → GCP Cloud Run (see Branch Hygiene)
* Secrets: GCP Secret Manager (never use .env in production)
* Logs: GCP Cloud Logging (stdout from Cloud Run, never use print())

# Branch Hygiene
* Whenever writing code, ensure that it is up to date with the target branch
* Whenever pulling code, check the following:
  1. Pull all open PRs - for any open PRs, check if they are blocked due to merge conflicts.
  2. If any PRs are blocked, resolve them immediately. If more than one is blocked in this way, go back to step 1 and
     repeat until all PRs are unblocked.
  3. If no PRs are blocked, wait until they are merged. This may involve replying to the conversation and requesting a
     prompt like 'continue' before reassessing.
  4. If there are no open PRs (e.g. nothing outstanding for main branch), proceed with the pull.
* Whenever pushing code:
  1. Fetch and rebase onto `origin/main`.
  2. Scan for open PRs. If any are open, resolve them first.
  3. Push the code.
  4. Retrieve the PR that was submitted, and check that it has no merge conflicts. If any are present, resolve them.
  5. Enable auto-merge: `gh pr merge <number> --auto --squash`
* For implementation pushes (any change to runtime behavior — features, bug fixes where a test could plausibly fail):
  6. Watch GitHub Actions inline: `gh run watch`. If CI fails, fix immediately and push again.
  7. Once the PR is merged, GitHub Actions will build, push to Artifact Registry, and deploy to Cloud Run
     automatically. Do **not** block waiting for the deploy (takes ~3–5 min). At the start of the **next**
     conversation, run `gh run list --workflow=deploy.yml --limit=5` to check the last deploy status before
     starting new work. Any failed deploy must be fixed as the first priority before new features.
     To check Cloud Run service health directly: `gcloud run services describe ai-game-app --region=us-central1`

# General Instructions
* You will be told if the conversation is either planning or implementation. If not told, ask.
  * For planning, reference "Adding a New Feature" steps 1-4.
  * For implementation, reference "Adding a New Feature" step 5.
* When implementing a new feature, scan the full codebase for existing code to build on. All current code is synced to
  the project files.
* Backend changes go in `src/backend/`. Frontend components in `src/frontend/src/`, styles in
  `src/frontend/src/styles/input.css`.
* Use `logging` (not `print`) for all backend output.
* All DB queries use parameterized statements via psycopg2 cursor.execute.
* Check your work:
  * Never re-invent the wheel
  * Re-use existing methods and variables when feasible
  * Watch for any potential issues or limitations with the solution provided, and call attention to them. If possible,
    suggest a solution or request clarification.
