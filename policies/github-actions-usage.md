# Policy: GitHub Actions Minutes & Storage (Use Smartly)

Last reviewed: 2026-07-09
Enforced by: convention + [`ci/scripts/check_gha_usage.py`](../ci/scripts/check_gha_usage.py).
See also [`ci/README.md`](../ci/README.md).

## Why

GitHub Actions is the right default for CI on GitHub-hosted projects. Free and paid
minutes and artifact/package storage are finite. Agents and humans should **use GHA
deliberately**, not avoid it out of fear and not burn quota with careless schedules,
matrix explosions, or huge artifacts.

## Principles

1. **Prefer GHA when it pays.** PR gates, required checks, and security scans that must
   run on every change belong in Actions.
2. **Estimate before expanding.** When adding or changing workflows, schedules, matrices,
   runners, or artifact retention, estimate monthly minutes and storage impact and note
   it in the PR (even roughly).
3. **Fast lane stays cheap.** Keep required PR jobs short; put heavy work on
   `workflow_dispatch`, path filters, or infrequent schedules.
4. **Measure periodically.** Run the usage script (or billing UI) before large CI changes
   and after suspicious bill spikes.

## What burns minutes

| Pattern | Risk | Prefer |
|---|---|---|
| `schedule:` every hour / many cron workflows | High continuous burn | Daily/weekly; combine jobs |
| Large OS/version matrices on every PR | Multiplicative minutes | Matrix only on main/nightly; subset on PR |
| macOS / Windows / larger runners | Higher billable multipliers | Linux for default; other OS on schedule or manual |
| Re-running full suites on docs-only PRs | Waste | `paths:` / `paths-ignore:` filters |
| No cache on deps | Longer jobs every run | `actions/cache` / setup-*-cache |
| Fail-fast off + huge matrix | Many parallel losers | Fail-fast on; shard intentionally |

Public repos: Actions minutes for standard GitHub-hosted runners on public repos are
generally free; still watch **storage** (artifacts, caches, Packages) and avoid abusive
schedules. Private repos: minutes and storage both count against the account quota.

## What burns storage

| Pattern | Risk | Prefer |
|---|---|---|
| Artifacts kept 90 days by default | Accumulates GB | Short `retention-days:` (e.g. 3–14) |
| Uploading build trees / datasets as artifacts | Large blobs | Upload only needed reports; use releases/LFS for big binaries |
| Unbounded caches | Cache storage quota | Narrow cache keys; delete stale caches |
| Packages (container/npm) without GC | Silent growth | Retention policies; delete untagged images |

## Estimation checklist (required for CI PRs)

Before merging workflow changes, answer in the PR body:

1. **Trigger:** Which events? (`pull_request`, `push`, `schedule`, `workflow_dispatch`)
2. **Frequency:** Rough runs/month (e.g. 20 PRs × 2 pushes + 30 nightly = ~70).
3. **Duration:** Expected wall-clock per run (from similar jobs or a dry run).
4. **Minutes/month ≈** `runs/month × job-minutes × OS multiplier` (sum jobs; matrices multiply).
5. **Storage:** Artifact size × retention days × runs that upload; cache footprint.
6. **Compare:** Is this < ~5–10% of remaining monthly minutes/storage, or justified?

Rough OS multipliers for **private** repo billable minutes (order-of-magnitude; confirm
current GitHub pricing docs): Linux ≈ 1×, Windows ≈ 2×, macOS ≈ 10×. Larger/hosted
runners cost more.

## Agent instructions

When editing `.github/workflows/` or `ci/examples/`:

- Do **not** add frequent crons, broad matrices, or long retention without an estimate.
- Prefer extending an existing workflow over adding a new always-on schedule.
- After non-trivial CI changes, suggest running:
  ```bash
  python3 ci/scripts/check_gha_usage.py --repo
  python3 ci/scripts/check_gha_usage.py --account
  ```
- If usage APIs are forbidden (token scope), say so and point to
  https://github.com/settings/billing (user) or org billing settings.

## Remediation when usage is high

1. Disable or lengthen noisy `schedule:` workflows.
2. Narrow PR matrices; move full matrix to nightly.
3. Cut artifact `retention-days` and delete old artifacts/caches.
4. Path-filter docs/chore PRs out of heavy jobs.
5. Re-check usage after a week.
