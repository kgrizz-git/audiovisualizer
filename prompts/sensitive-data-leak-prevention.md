# Preventing Sensitive Data Leaks In Code (Runtime & Dev)

Last reviewed: 2026-07-16

Use this alongside [`strict-phi-agent-guidance.md`](strict-phi-agent-guidance.md) whenever the
project handles PII, PHI, clinical/FHIR/HL7/DICOM, regulated, or customer data. That guidance
keeps sensitive data **out of the repository and Git history**. This one covers the complementary
risk: **the code you write leaking sensitive data at runtime**, in production *and* in
development — into logs, temp files, test/CI output, caches, crash dumps, telemetry, error
responses, and third-party/AI calls. A file that never enters Git can still leak through a log
line, a stack trace, a cache file, or a Sentry event.

## Core principles

1. **Sanitize at the boundary, deny-by-default.** Redact/allowlist *before* data reaches any
   sink. Never log, cache, or serialize whole request/response/user objects — emit only an
   allowlisted set of non-sensitive fields.
2. **Same rules in dev as in prod.** Developer laptops, local logs, screenshots, `.context/`
   scratch, and CI runners are all leak surfaces. There is no "just debugging" exemption for
   real data. Use synthetic fixtures locally.
3. **Prefer not writing it at all.** The safest sensitive datum is the one never persisted to a
   log, temp file, or cache. Write it only when required, minimize it, and set a short lifetime.
4. **If it must be written, make the user aware and make it easy to clear.** Document every sink
   that *can* hold sensitive data, gitignore local artifacts, and ship a one-command way to purge
   local logs/caches/temp files (see *Awareness & easy clearance*).

## What counts as sensitive here

PII/PHI and identifiers; credentials, tokens, API keys, and session/auth cookies; **local
usernames/logins**; **internal hostnames, private IPs, and PACS/DICOM endpoints**; **absolute
local paths and home-shorthand paths**; access tokens embedded in URLs/query strings; and
device/session/correlation IDs that re-identify a person. Treat these as redaction targets in
every sink below.

## Leak surfaces and default controls

| Surface | How it leaks | Default control |
|---|---|---|
| Application logs (stdout/stderr, structured, aggregated) | Logging whole objects, request bodies, headers, query strings, or f-string interpolation of user data | Structured logging with an allowlist of safe fields; a redaction filter/formatter on the root logger; never log auth headers, bodies, or full URLs with query strings |
| Errors & stack traces | Exception messages and local-variable capture echo record values; verbose errors returned to clients | Generic message + opaque error ID to the client; detailed diagnostics only server-side, redacted; disable local-variable capture in prod tracebacks |
| Temp files / scratch dirs | PHI written to `/tmp`, working files, or `.context/` with default perms, left behind | Avoid if possible; else use a secure temp dir with `0600` perms, delete on exit (`try/finally`), and never derive filenames from patient/user identifiers |
| Caches (HTTP, Redis/memcached, disk, memoization, browser storage) | Sensitive responses cached to disk/CDN; identifiers used as cache keys; `localStorage` retains PHI | `Cache-Control: no-store` for sensitive responses; encrypt cache-at-rest with TTLs; hash/opaque cache keys; do not cache PHI in the browser |
| Test & CI logs, snapshots, fixtures | Real data in fixtures; assertion diffs and CI logs printing payloads; snapshot files committed | Synthetic fixtures only; mask secrets in CI (`::add-mask::` / masked vars); assert logs contain **no** sensitive markers; keep snapshots free of real values |
| Telemetry / APM / error trackers (Sentry, Datadog, …) | SDKs auto-attach request bodies, headers, cookies, and local variables and ship them to a cloud | Scrub before send (`before_send`/`beforeSend`); disable body/cookie/PII capture and `send_default_pii`; no cloud telemetry for regulated data without data-flow approval + any required BAA/DPA |
| LLM / third-party / SDK egress | Prompts, completions, and payloads sent to external APIs; third-party SDKs exfiltrate fields | Redact before the call; keep regulated data on approved/local models; review each SDK's data flow (HoundDog helps — see below) |
| Backups, exports, data dumps, debug endpoints | Unredacted exports and `/debug` routes expose bulk data | Encrypt + access-control exports; gate/remove debug dumps in prod; apply the same redaction to export paths |
| URLs, filenames, and headers | Tokens/IDs in query strings, `Referer` leakage, identifiers baked into filenames | Put secrets/IDs in headers or POST bodies, not URLs; opaque filenames; set `Referrer-Policy` |

## Awareness & easy clearance

- **Inventory the sinks.** Record in `.context/project-profile.md` (and any runbook) every place
  the running app can write sensitive-capable data: log paths, temp dirs, cache stores, export
  locations, telemetry destinations. Future agents and the user need one list to reason about.
- **Gitignore local artifacts** (log dirs, cache dirs, temp exports) so runtime output cannot be
  committed, and keep them under the strict sensitive-data hook's coverage anyway.
- **Ship a clear/purge command.** Provide a documented `make clean-sensitive` (or script) that
  removes local logs, caches, temp files, and scratch exports in one step, so a developer can
  reset a machine after touching real-looking data.
- **State retention.** Note log/cache/backup retention and where redaction is (and is not) yet in
  place — an honest "not redacted here" is better than a silent gap.

## Verify (don't assume)

- Add tests that exercise error/log paths and assert output contains none of: sample PII/PHI
  markers, `password`/`token` values, local usernames, private-IP/hostname patterns, or absolute
  home paths.
- Run a local data-flow scan (**HoundDog**, local CLI/Docker only) to trace sensitive fields into
  logs, files, and SDKs; see [`inventory/medical-data-security.md`](../inventory/medical-data-security.md).
- Grep the codebase for risky sinks before shipping: broad `log.*(request`, `print(`,
  `console.log(` on user objects, `tempfile`/`/tmp` writes, and telemetry init without a scrubber.
- When a suspected leak is found, do **not** paste the value into a ticket, log, or PR. Follow the
  disclosure steps in [`strict-phi-agent-guidance.md`](strict-phi-agent-guidance.md).

## Related

- [`policies/sensitive-data-runtime-leaks.md`](../policies/sensitive-data-runtime-leaks.md) — the rule + enforcement tiers + wiring for the practices in this doc.
- [`strict-phi-agent-guidance.md`](strict-phi-agent-guidance.md) — keeping data out of the repo/history.
- [`inventory/medical-data-security.md`](../inventory/medical-data-security.md) — HoundDog, Presidio, and redaction tooling.
- [`policies/security-baseline.md`](../policies/security-baseline.md), [`policies/github-repository-hygiene.md`](../policies/github-repository-hygiene.md) — secrets, gates, and hygiene tiers.
- `.cursor/rules/codeguard-0-logging.mdc`, `.cursor/rules/codeguard-0-privacy-data-protection.mdc` (and `.windsurf/` `.md` equivalents) — editor-level rules.
