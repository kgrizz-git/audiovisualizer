# Policy: Runtime & Dev Sensitive-Data Leak Prevention

Last reviewed: 2026-07-16
Enforced by: convention + [`hooks/`](../hooks/) + CI. How-to guidance:
[`prompts/sensitive-data-leak-prevention.md`](../prompts/sensitive-data-leak-prevention.md).

## Why

The strict sensitive-data guard keeps PII/PHI/secrets **out of the repo and history**. It does
not stop the *running code* from leaking the same classes of data (PII/PHI, credentials, local
usernames, internal hostnames/IPs, absolute paths) into logs, temp files, test/CI output, caches,
telemetry, or third-party/AI calls — in production *or* development. Redaction *correctness* is
semantic and cannot be fully mechanized, so this policy gates the cheap, checkable proxies and
leaves the judgment to review and to the guidance prompt.

Applies when the project's data classification is `regulated` (or `confidential` with real
customer data). For `public`/`internal` projects it is advisory.

## Rules and enforcement tiers

| Rule | Default check | Tier |
|---|---|---|
| Runtime artifact dirs (logs, caches, temp/scratch exports) are gitignored | `.gitignore` entries + strict `check_sensitive_data.py` blocks any that get staged | hard gate (via existing guard) |
| A one-command clear/purge exists for local logs/caches/temp artifacts | `make clean-sensitive` (or documented script) present | soft gate |
| Sensitive-capable sinks are inventoried | Sinks listed in `.context/project-profile.md` / runbook | advisory |
| Logs/errors do not emit sensitive markers | Tests exercise log/error paths and assert absence of PII/PHI/secret/username/host/path markers | soft gate |
| No unapproved cloud telemetry/APM/error-tracker egress for regulated data | Manual review of SDK init + scrubbers (`before_send`, disable body/cookie/PII capture) | hard gate |
| Data-flow of sensitive fields into logs/files/SDKs is scanned | HoundDog local CLI/Docker scan (see inventory) | advisory → soft once tuned |
| Secrets/tokens masked in CI logs | `::add-mask::` / masked CI variables | soft gate |

There is intentionally **no hard "redaction" gate**: no check can prove a log line is redacted.
Do not add one as a false gate — rely on review, tests, and the data-flow scan.

## Adopting

1. Read [`prompts/sensitive-data-leak-prevention.md`](../prompts/sensitive-data-leak-prevention.md)
   for the leak-surface control table and redaction patterns.
2. Gitignore runtime artifact dirs; keep them under the strict guard's coverage anyway.
3. Add a `clean-sensitive` target/script and document it in the runbook.
4. Add log/error-path tests that assert no sensitive markers appear in output.
5. Inventory sinks (log paths, temp dirs, caches, exports, telemetry destinations) in the project
   profile, with retention and where redaction is / is not yet in place.
6. Evaluate HoundDog (local only) for data-flow scanning; promote to a soft CI gate once tuned.
7. Record the chosen tiers and any accepted risks in an ADR.

## Related

- [`prompts/strict-phi-agent-guidance.md`](../prompts/strict-phi-agent-guidance.md) — repo/history side.
- [`policies/security-baseline.md`](security-baseline.md), [`policies/github-repository-hygiene.md`](github-repository-hygiene.md) — secrets, gates, hygiene tiers.
- [`inventory/medical-data-security.md`](../inventory/medical-data-security.md) — HoundDog, Presidio, redaction tooling.
- [`inventory/cloud-and-infra.md`](../inventory/cloud-and-infra.md) — *Observability & error monitoring*: self-hosted Sentry/GlitchTip/OpenTelemetry for keeping event data on your own infra.
