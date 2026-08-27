# Developer Changelog

Internal / developer-facing changes that do not belong in the public
[`CHANGELOG.md`](CHANGELOG.md). See [`policies/changelog-conventions.md`](policies/changelog-conventions.md).

Last reviewed: 2026-07-31

## Unreleased

### Changed
- Agent guidance: do not add or raise policy/hook exemptions (`# policy:… allow=`,
  allowlists, gate-silencing NOSONAR/disables, skipping hooks) without explicit human
  approval — [`AGENTS.md`](AGENTS.md) working rule 7, mirrored under Exemptions in
  [`policies/file-size-and-counts.md`](policies/file-size-and-counts.md). SemVer: none.

### Fixed
- PR review (Sonar/Sourcery): shared `ci/scripts/github_slug.py` validates `--repo` for
  both `check_gha_usage` and `check_open_prs`; doc-freshness/file-size hooks fail closed
  on path-escape instead of silently skipping; split composite test asserts (python:S9073).
  SemVer: none.
- PR review follow-ups: classify ignore/required paths with repo-relative paths after
  confinement (root `README.md`/`AGENTS.md` freshness and parent-dir `backups/` false
  ignores), allow GitHub `.github` repo slugs in `check_gha_usage`, and isolate open-PR
  stamp tests in per-test temp dirs. SemVer: none.
- SonarCloud Security rating E: suppress false-positive path-injection Blocker on
  constant-path inventory writes (`pythonsecurity:S2083`), confine CLI file paths via
  shared `hooks/scripts/path_guard.confined_path` (with `# NOSONAR pythonsecurity:S8707`
  on sinks — Sonar does not treat custom helpers as sanitizers), tighten GitHub
  owner/repo/login allow-lists before `gh` argv construction (`# NOSONAR` for S8705),
  use `npm ci --ignore-scripts` in CI, and pin `gitleaks/gitleaks-action` to a full
  commit SHA. Tests: `tests.hooks.test_path_guard`, `tests.ci.test_path_guard_and_open_prs`.
  SemVer: none (tooling/CI). Follow-up: gitleaks-action `@v3` before Node 20 removal
  (2026-09-16).

### Added
- UI layout/usability plan [`plans/2026-07-29-ui-layout-and-usability.md`](plans/2026-07-29-ui-layout-and-usability.md) and expanded recommendations in [`dev-docs/ui-suggestions.md`](dev-docs/ui-suggestions.md) (mode-aware controls, overlay header, geometry picker, config URL, paper theme, etc.). SemVer: docs only until phases ship.
- Phase 1 of that plan: `src/ui/controlApplicability.ts` plus Vitest coverage for mode-aware controls and canvas `showLegend` preview toggle. SemVer: covered in public changelog (**MINOR**).
- CI public-release hardening on `prepare-public-release`: Vitest coverage folded into
  `npm run validate` (no second test pass), `npm audit --audit-level=high` (hard on main,
  advisory on PRs), parallel **Policy** job for license/clean/smoke gates, Semgrep via a
  pinned `semgrep/semgrep:1.169.0` digest scanning `src/` `hooks/scripts/` `tests/`
  `ci/scripts/`, and an uploaded `coverage-lcov` artifact. SemVer: none (tooling only).
- `hooks/scripts/check_public_repo_clean.py` (wired as `check-public-repo-clean` in
  `.pre-commit-config.yaml`, `hooks/install.sh`, and `.github/workflows/ci.yml`): scans every
  tracked file for email addresses (excluding reserved example/test domains), absolute paths,
  `file://` URIs, and private IPv4 addresses so the repo never leaks local identity.
  Allowlisting via `.repo-clean-allowlist` or inline `# policy:repo-clean allow=<token>`.
- Backlog item to configure default-branch rulesets / CODEOWNERS before inviting outside
  PRs (`dev-docs/TO_DO.md` → Repository / release hygiene). SemVer: none.
- `.github/CODEOWNERS` (`* @kgrizz-git`), issue forms, and PR template; TO_DO updated so
  remaining work is ruleset enforcement + private vulnerability reporting. SemVer: none.
- CI fixes: license inventory gate moved back onto **Validate** (needs `npm ci` /
  license-checker); Semgrep uses `p/python` instead of dead `p/python-security` registry
  pack; `.coderabbit.yaml` disables auto-review (opt-in via `@coderabbitai review`).
  SemVer: none.
- Clean-gate hardening from CodeRabbit review: `git ls-files -z`, single-pass file read,
  CI `--redact` (local hooks still show matches), `persist-credentials: false` on
  Policy/Semgrep checkouts, SECURITY.md + blank-issue chooser aligned with private vuln
  reporting, doc/policy accuracy for index-vs-history scope. SemVer: none.
- License-inventory unit tests (`tests.hooks.test_check_license_inventory`) run on
  **Validate** after `npm ci`, not on the Python-only **Policy** job — the repo
  integration smoke needs license-checker enrichment. SemVer: none.

### Changed
- ESLint `complexity` rule escalated from `warn` to `error` at 15, making the policy's
  hard cyclomatic-complexity cap a blocking lint/CI gate. Seven pre-existing offenders
  (max 37) are grandfathered with inline `eslint-disable-next-line complexity` comments
  tagged for refactor when next touched. Updated `policies/file-size-and-counts.md` to
  reflect the hard gate and removed the lizard usage recipe in favor of a note on why
  lizard is not used (TS-only codebase; ESLint covers it without a Python dependency);
  annotated the lizard row in `inventory/security-quality.md` accordingly.
- Refactored oversized files to pass the 800-line hook: extracted SoundFont library UI (`src/ui/soundfontLibraryUI.ts`), audio voice options row builder (`src/ui/voiceOptionsUI.ts`), 3D geometry builders (`src/renderers/three/geometryBuilders.ts`), onset pulses (`src/renderers/three/onsetPulses.ts`), and scene atmosphere (`src/renderers/three/sceneAtmosphere.ts`) into sibling modules. Both `src/ui/app.ts` (714 lines) and `src/renderers/three/ThreeDRenderer.ts` (499 lines) now pass comfortably without exemptions.
- Vitest excludes nested `.kilo/` / `.worktrees/` checkouts so local test and coverage runs
  do not double-count sibling worktree suites; `.kilo/` is gitignored.
- `check_public_repo_clean.py` fails closed when `git ls-files` cannot run (previously a Git
  failure returned an empty file list and the gate silently passed).

### Removed
- Public-release prep: removed the template's PHI/medical enforcement infrastructure
  (`check_sensitive_data.py`, `check_commit_message_sensitive_data.py`,
  `check_scan_contract.py`, `check_gitignore_protected.py`, `check_forbidden_paths.py`,
  their `.example` configs, `ci/examples/strict-sensitive-data.yml`,
  `inventory/medical-data-security.md`, `prompts/strict-phi-agent-guidance.md`,
  `policies/sensitive-data-scan-gates.md`, `policies/sensitive-data-runtime-leaks.md`)
  and scrubbed PHI/medical wording from the hooks, CI, policies, prompts, and inventory docs.
- Replaced absolute `file:///Users/...` links with relative paths in `CHANGELOG.dev.md`,
  `assessments/`, and `plans/specs/`; dropped an author username from an archived plan.
- Smoke tests: replaced the removed sensitive-data/scan-gate/commit-message test classes in
  `tests/test_policy_hooks_smoke.py` with `PublicRepoCleanHookTests`; CI now runs the full
  policy-hook smoke suite plus the license-inventory tests.

### Added
- Added plan assessment for Polar Walk Mode in [assessments/2026-07-27-polar-walk-mode-assessment.md](assessments/2026-07-27-polar-walk-mode-assessment.md).
- Pre-commit git hook: runs `check_file_size.py`, `check_todo_limits.py`, and
  `check_doc_freshness.py` on staged files at commit time.
- Pre-push git hook: runs `npm run validate` (type-check + test + build) before push.
- `hooks/install.sh`: idempotent hook installer; wired into `package.json` `prepare` so
  hooks auto-install on `npm install`.
- `check_todo_limits.py` now rejects checked-off `[x]` items in backlog files as a hard
  error, enforcing the policy that completed items must be removed after changelog recording.
- Plan template (`templates/plan.md`) now includes a "Completion checklist" section with
  explicit steps: update status, archive plan, add changelog entry, remove from backlog.

### Changed
- Aligned four contradicting policy documents on backlog/changelog procedures:
  `agent-workflow.md` (order of operations: changelog first, then remove from backlog),
  `changelog-conventions.md` (VERSION bumped at release only, not per-PR),
  `plans-and-todos.md` (backlog path is `dev-docs/TO_DO.md`, archive means `plans/archive/`
  only — removed `DONE-`/`ARCHIVED-` prefix alternative).
- Cleaned `dev-docs/TO_DO.md`: removed 14 stale checked-off `[x]` items and 2 obsolete
  `- Note:` entries that violated the remove-after-changelog policy. File reduced from
  42 lines to 21 lines of active work only.
- `check_todo_limits.py` default targets now include `dev-docs/TO_DO.md` and `dev-docs/todo.md`.
- Corrected the black-background accent implementation per user feedback: replaced per-track circular-mean accents (multiple competing colors and an unintentionally strong glow) with a single merged accent computed as the duration×velocity-weighted circular mean of mapped note hues across all visible tracks — mirroring the existing "Weight → velocity × sounding overlap" coloring already used by tonal-time-lines band colors, so a sustained or loudly struck note carries proportionally more weight than a grace note and the accent reflects the perceived average color. Added `getDominantScoreAccent` in `src/core/mapper/scoreMapper.ts`; rewired `app.ts` `atmosphereColors()` to return a one-element array. The 2D `drawAtmosphere` now paints one centered radial glow at 12% opacity (reverting the bumped 22%); the 3D `setBackground` uses a single subtle merged hue at 25% saturation / 8% lightness (per the archived plan) rather than a multi-stop 75%/15% gradient. Applied the same duration×velocity weighting to `getAverageScoreBackground` for cross-mode consistency. Added weighted mapper tests for both helpers.
- Clarified agent workflow, plan, TODO, and changelog policies: completed backlog items are
  removed from `dev-docs/TO_DO.md` after being recorded in the public or developer changelog.
- Upgraded devDependencies `vite` to `^8.1.5` and `vitest` to `^4.1.10` to resolve high and critical dev-tooling security vulnerabilities.
- Added `esbuild` (`^0.28.1`) explicitly to devDependencies to ensure offline CLI render builds execute reliably without relying on transitive hoisted binaries from Vite.
- Updated `tests/soundfontPlayer.test.ts` types for compatibility with Vitest 4's `vi.fn` generics.

### Added
- Implemented 2D `polar_fan` and 3D `3d_polar_fan` display modes: added visual mapping math, symmetric fit-to-canvas layout centering, legend content switch cases, index.html variation select options, CLI mode support, and canvas line glow. Added unit tests for both variations.
- Added plan assessment for the polar octave fan display modes in [tmp/2026-07-26T12:45-polar-octave-fan-modes-assessment.md](tmp/2026-07-26T12:45-polar-octave-fan-modes-assessment.md).
- Added a TODO item to randomize visualizer mode and initial loaded bundled MIDI at launch in [dev-docs/TO_DO.md](dev-docs/TO_DO.md).
- SoundFont asset bundler script (`scripts/bundle-soundfonts.js` and `npm run bundle:soundfonts`) to fetch and bundle offline FluidR3 GM soundfont samples into `public/soundfonts/`.
- Gitignore policy rule for bundled audio patches (`public/soundfonts/**/*.js`) to keep large binary asset files out of Git history.
- SoundFont patch loader, player, voice router, and sustain window unit tests (`tests/audio/soundfont/`).
- `SustainEvent` domain type added to `TrackScore` in `src/core/types.ts` to represent MIDI CC64 pedal states.
- MIDI CC64 sustain pedal event parsing in `src/core/midi/parser.ts`.
- Offline sustain helper functions (`buildSustainWindows`, `getSustainedDuration`, `sustainEventsForChannel`) in `src/audio/soundfont/sustainWindows.ts` to compute active pedal windows and extend note durations for soundfont playback synthesis.
- Cross-references in `AGENTS.md` to `policies/changelog-conventions.md` and `policies/plans-and-todos.md` for better discoverability of changelog format and plan lifecycle rules.

### Fixed
- License inventory `--check` no longer fails on Linux CI when the inventory was
  generated on macOS: optional/platform packages ignore host-local
  `license-checker` repository URLs and `node_modules` LICENSE fallbacks.

### Added
- Expanded bundled demo MIDI set: Mutopia/Wikimedia public-domain rags plus
  generator-built modern genre style studies (including rock and house);
  documented provenance in `public/demo-midi/README.md`.

### Changed
- Replaced seed-template `template-checks.yml` with app-focused `.github/workflows/ci.yml`
  (`npm run validate`, license inventory `--check` + unit tests, gitleaks). `ci/examples/`
  remains inactive reference material.

### Added
- Third-party license inventory Phase 2: full transitive lockfile v3 catalog with
  versions, content-diff `--check` (read-only), `--human-review` cadence (warn 30 /
  hard 180 days; faster hard when Unknown/strong-copyleft present), production strong
  copyleft + Unknown hard gates, pinned `license-checker@25.0.1` (via npx in the hook
  script), policy `policies/third-party-licenses.md`, fixture tests under `tests/hooks/`,
  and CI wiring in `.github/workflows/ci.yml` (plus a note in `ci/examples/ci.yml`).
  README points at the inventory for attribution.
- `prompts/bootstrap-checklist.md`: a phase-by-phase tick-list companion to
  `bootstrap-project.md`.
- `template-checks` GitHub Actions workflow: path-filtered validation for maintained
  Markdown, Actions examples, shell hooks, Python policy scripts, and committed secrets.
- `prompts/sensitive-data-leak-prevention.md`: runtime/dev leak-prevention guidance
  (logs, temp files, test/CI output, caches, telemetry, third-party/AI egress) with
  a leak-surface control table, awareness/easy-clearance practices, and verification
  steps.
- `inventory/cloud-and-infra.md`: **Observability & error monitoring** section —
  self-hosted Sentry (`getsentry/self-hosted`), managed Sentry free tier, GlitchTip,
  and OpenTelemetry, with the keep-event-data-on-your-infra caveat.

### Changed
- Template CI pins Markdownlint and applies the repository's established style choices;
  gitleaks receives the read-only pull-request permission it needs for PR scans.

## [0.4.4] - 2026-07-09

### Added
- `ci/scripts/check_open_prs.py` — advisory `gh pr list` helper with `--branch`,
  `--once-per-day` stamp under `.context/`, and `--json`.
- `ci/examples/open-prs-advisory.yml` — optional daily/advisory Actions reminder
  (`continue-on-error`; never a required check).
- Agent wiring: `policies/commits-and-branches.md`, `prompts/new-agent-session.md`,
  `prompts/maintenance-loop.md`, `AGENTS.md`, `hooks/README.md`, `ci/README.md`.
- Smoke tests for `--help` and once-per-day stamp skip.

### Changed
- Daily open-PR guidance: agents must inspect `.context/open-prs-check.stamp`
  first and skip the script when fresh (token-cheaper than invoking Python/`gh`).

## [0.4.3] - 2026-07-09

### Added
- Archon (`coleam00/archon` / archon.diy) under harness + ai-agent-platforms.
- Pantheon (pantheon.k-dense.ai) under tools-index research + catalog K-Dense section.
- Cross-IDE handoff options (Passoff, handoff, ai-sync) with Reddit discussion seed.
- Sphinx/Pandoc expanded blurbs in `tools-index.md` documentation section.

## [0.4.2] - 2026-07-09

### Added
- `inventory/knowledge-graph-code-mapping.md`: section **AI-generated code wikis & repo
  documentation** — Google Code Wiki, DeepWiki SaaS, deepwiki-open, RepoWiki,
  FSoft CodeWiki, repowise (+ vs-DeepWiki comparison), Ry Walker survey link.

## [0.4.1] - 2026-07-09

### Added
- `policies/github-actions-usage.md` — estimate minutes/storage when changing CI;
  use GHA deliberately (not fearfully, not carelessly).
- `ci/scripts/check_gha_usage.py` — repo run timing + account billing usage summary
  via `gh` (consolidated billing API; legacy actions/shared-storage endpoints retired).

### Changed
- `inventory/search-apis.md`: Firecrawl listed as a crawl tool only (removed API-key
  dashboard / Notes_and_Ideas credential wording from that entry).
- `ci/README.md` / `AGENTS.md`: link usage policy and script.

## [0.4.0] - 2026-07-09

### Added
- Policies: `changelog-conventions.md`, `plans-and-todos.md`; `plans/README.md`.
- Hook: `check_todo_limits.py` (soft 150 / hard 300 lines); optional `prune_backups.sh`.
- Smoke tests: `tests/test_policy_hooks_smoke.py` (unittest) for TODO/file-size hooks.
- Inventory: Salesforce 7 patterns; Osmani harness/factory/long-running; Graphify+NetworkX;
  GraphRAG Workbench; Codex Security plugin; GitHub license compliance preview; Firecrawl
  (product only — no API keys in-repo).
- Agent stubs (`GEMINI.md`, `QWEN.md`, `CLAUDE.md`) clarified as pointers to `AGENTS.md`.

### Changed
- File-size soft/hard defaults: 600 / 1000 lines (was 400 / 800).
- `hooks/README.md` documents existing gitleaks + lint hooks alongside new policy checks.
