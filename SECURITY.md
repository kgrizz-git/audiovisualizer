# Security Policy

Last reviewed: 2026-07-31

## Supported versions

AudioVisualizer is pre-1.0 (`0.x` on the default branch). Security fixes land on
`main` of this repository; there are no long-lived release branches yet.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Prefer one of these private channels:

1. **GitHub private vulnerability reporting** (preferred when enabled): on the
   repository page, use **Security → Advisories → Report a vulnerability**, or open
   https://github.com/kgrizz-git/audiovisualizer/security/advisories/new
2. If private reporting is unavailable, contact the maintainer via the email listed on
   the GitHub profile that owns this repository
   ([@kgrizz-git](https://github.com/kgrizz-git)).

Include enough detail to reproduce the issue (affected version or commit, steps,
impact). Do not attach real user MIDI files or other personal data unless we ask for a
minimal synthetic fixture.

You can expect an acknowledgment when the report is received. Fix timing depends on
severity and whether a coordinated disclosure is needed; we will say so if a public
issue or advisory will follow.

## Scope

In scope: this repository’s application code, build/CI configuration, and documented
local tooling that could leak secrets, execute untrusted input unsafely, or compromise
users who run or host the app as intended.

Out of scope (report only if you believe we mishandle it): third-party npm packages
already tracked upstream, social-engineering of GitHub accounts, and denial-of-service
against GitHub or CDN infrastructure we do not operate.

## Non-security feedback

Bugs, feature ideas, and documentation suggestions belong in **GitHub Issues**, not
security advisories. See the Contributing note in [`README.md`](README.md).
