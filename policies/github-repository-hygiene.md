# Policy: GitHub Repository Hygiene & Sensitive-Data Gates

Last reviewed: 2026-07-15
Enforced by: GitHub rulesets/branch protection, hooks, CI, and selected GitHub Apps.

## Purpose

Set a small, enforceable GitHub baseline before a repository receives real work. Scale it
to the data it may contain: a public utility needs less process than a medical product, but
neither should accept direct pushes, red CI, credentials, personal data, or machine-specific
paths by accident.

This policy complements [`security-baseline.md`](security-baseline.md). It does **not** make
a project HIPAA-, GDPR-, or otherwise compliance-certified. In particular, a scanner cannot
prove that PHI is absent. For a regulated project, obtain the organization's privacy,
security, legal, and compliance decisions before committing or sending data to a CI service.

## 1. Classify before configuring

Capture the intended data classification in `.context/project-profile.md` and choose a tier.
If the answer is unknown, use the more protective tier until it is resolved.

| Tier | Use when | Minimum decision |
|---|---|---|
| Standard | Source code and public/synthetic test data only | State that real PII/PHI and production exports are prohibited. |
| Sensitive | The repo may hold internal identifiers, restricted designs, or de-identified data | Define allowed data, prohibited patterns/paths, an exception owner, and a local+CI content gate. |
| Regulated | Medical, financial, identity, education, government, or similarly regulated work | Treat all real regulated data as prohibited unless an approved data-handling design says otherwise; complete a threat/risk review and obtain the required contracts, retention, access, audit, and incident-response approvals. |

**Data rule:** source control is not a data store. Do not commit production dumps, patient
records, support tickets, screenshots, PDFs, chat transcripts, database backups, or model
training corpora containing real people. Use deterministic synthetic fixtures and document
their provenance. De-identification is a risk decision, not a label a developer can apply
unilaterally.

For a medical or other highly regulated repository, also document: permitted data classes,
where scans run, who can read workflow logs/artifacts, retention periods, encryption and key
ownership, approved subprocessors, audit requirements, a breach/escalation contact, and how
an accidental disclosure is contained. Do not upload candidate PHI to a third-party scanner
without an approved data-processing arrangement and explicit authorization.

## 2. Protect the default branch

Prefer a named **repository ruleset** targeting the default branch (use legacy branch
protection only where rulesets are unavailable). Start in evaluate mode if the repository is
already busy, fix failures, then make it active. GitHub rulesets can require PRs, status
checks, reviews, deployments, signed commits, and code-scanning results; push rulesets can
restrict paths, extensions, path length, and file size. They do not inspect a file's content
for PII or PHI. See GitHub's [available ruleset rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
and [push-ruleset limits](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository).

| Control | Standard | Sensitive / regulated |
|---|---|---|
| Pull requests | Require PRs; block direct pushes to the default branch | Same; allow bypass only to a small, named break-glass group. |
| Reviews | 1 approval; dismiss stale approvals; require resolved conversations | 2 approvals or 1 + required CODEOWNER; require approval of the latest push for high-risk paths. |
| Checks | Require the fast CI, tests, secret scan, and policy/data gate; require branches up to date or use merge queue | Same, plus required SAST/code scanning and any approved privacy/data gate. |
| History | Block force pushes and deletions; restrict pushes | Also consider signed commits and linear history where the team can support them. |
| Deployment | Optional staging deployment gate | Require an approved staging/control environment when a deployable service warrants it. |
| Exceptions | Keep the bypass list narrow and review it periodically | Record who bypassed, why, approval, remediation, and whether an incident review is required. |

Use stable, specific required-check names (for example, `ci / test`, `ci / policy`,
`security / secret scan`, `security / sensitive data`) and remove obsolete checks when a
workflow is renamed. A required status check only protects a branch if the matching workflow
actually runs for that PR. Protect workflow, policy, dependency, and deployment files with
`CODEOWNERS` so the people responsible for the controls review their changes.

For active repositories with frequent merges, a merge queue can replace repeatedly rebasing
PRs just to satisfy “up to date”; GitHub documents it as an alternative to that requirement
for protected branches. [Branch-protection settings](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
also support the same core PR, status-check, review, and conversation controls.

## 3. Enable GitHub's built-in security floor

Enable only features available to the repository's plan and data classification, then verify
alerts are owned and triaged.

1. Enable the dependency graph, Dependabot alerts, security updates, and version-update PRs.
2. Enable secret scanning and push protection where available. Push protection blocks many
   credentials *before* they reach the repository; configure custom secret patterns only for
   high-confidence, organization-specific secrets. It is not a generic PII/PHI detector.
   [GitHub push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection)
   explains its bypass and custom-pattern behavior.
3. Enable CodeQL code scanning. Default setup is a sensible low-maintenance start for eligible
   repositories; use the advanced workflow when the build, query suite, paths, or language
   matrix need deliberate control. [CodeQL setup types](https://docs.github.com/en/code-security/concepts/code-scanning/setup-types)
   describes the trade-off. Require the resulting scan through the ruleset only after it is
   reliable and findings have an owner.
4. Add `CODEOWNERS`, issue/PR templates, a security contact or `SECURITY.md`, and a clear
   vulnerability-reporting route. Keep repository visibility, collaborators, teams, deploy
   keys, environment secrets, and GitHub App permissions least-privileged.
5. Pin third-party Actions to reviewed full commit SHAs where the project risk warrants it;
   grant each workflow only the permissions it needs (normally `contents: read`), and keep
   workflow artifact/log retention appropriate for the data classification.

## 4. Hooks and CI: block sensitive content before it spreads

Local hooks make feedback fast; CI makes the control unavoidable. Run the same checker in
both places and make the CI job a required check. Keep finding output minimal: report a path,
line number, rule ID, and remediation—not the sensitive match itself. For medical or regulated
repositories, the first-party strict gate scans every Git-indexed file (not just a PR diff),
including tests and `.xlsx` internals, and fails closed on images, DICOM, extensionless, and
opaque files unless an exact file hash has named human approval. See
[`inventory/medical-data-security.md`](../inventory/medical-data-security.md).

For the same tier, install a `commit-msg` gate. File approvals must never apply to immutable
commit prose: reject PII/PHI, local paths/usernames/hostnames, private network addresses, and
PACS/DICOM endpoints in the message; refer to a sanitized issue or incident record instead.

| Risk | Local hook | Required CI job | Notes |
|---|---|---|---|
| Credentials | gitleaks + `detect-private-key` | gitleaks and scheduled history scan | Already included in [`hooks/.pre-commit-config.yaml`](../hooks/.pre-commit-config.yaml). |
| Absolute local paths | A fast staged-diff rule | Re-run against the PR diff | Detect Unix home paths, Windows drive paths, and `file://` URLs; allow only documented portable examples. Prefer project-relative paths, env vars, or config values. |
| PII / PHI | Project-specific staged-diff rule | Re-run on the PR diff and block | Match known identifiers and high-confidence formats; allow reviewed test fixtures by path and rule ID, never by silently disabling the scanner. |
| Binary / data exports | Filename, extension, size, and allowlist rule | Re-run and scan unpacked permitted fixtures if justified | A ruleset can block risky paths/extensions/sizes; content inspection needs a hook or CI scanner. |

Do not enable a broad “PII regex” as a hard gate without measuring it against representative
synthetic fixtures. It will either miss context-sensitive data or block ordinary numbers and
documentation. Start it in report-only mode, add domain-specific recognizers (for example,
patient or member identifier formats), define a false-positive process, and promote only
high-confidence rules to blocking.

For text-heavy or sensitive projects, consider running [Microsoft Presidio](https://microsoft.github.io/presidio/)
locally or in an approved isolated runner; it supports predefined and custom PII recognizers
but explicitly cannot guarantee complete detection. For healthcare/FHIR projects, also evaluate
[phi-scan](https://pypi.org/project/phi-scan/) as a local-first PHI/PII scanner: it can scan a
Git diff and produce CI-friendly output. Pin and test it against synthetic representative data
before relying on it—its PyPI release is currently marked alpha. For medical projects, use
domain-approved recognizers and include OCR/image/PDF handling if those files are
permitted—otherwise block those file types outright. Do not send repository contents to an
external DLP, AI review, or GitHub App without confirming data residency, retention, access
controls, contractual terms, and any required BAA/DPA.

Per-commit and per-PR gates only see the current diff. For Sensitive and Regulated tiers, also
schedule a periodic **repo-wide, full-history PII/PHI audit** (analogous to the scheduled
credential history scan above)—the working tree and every reachable commit, not just recent
changes. There is no official GitHub "PII audit" product; GitHub-native scanning covers
credentials, not personal data. Use a local-first tool such as [Octopii](https://github.com/redhuntlabs/Octopii)
(OCR + NLP + regex over images, PDFs, and documents) or a Presidio-based scan; run it offline
against a local checkout and treat findings as triage for human review. Do not route a regulated
repo's contents through a SaaS repo scanner without the data-residency and BAA/DPA review above.
This audit runs periodically, not at bootstrap—see [`prompts/maintenance-loop.md`](../prompts/maintenance-loop.md).

### Recommended implementation contract

Before wiring a sensitive-data workflow, write a small project-owned configuration that names:

- prohibited file paths/extensions and size caps;
- allowed fixture directories and why they are safe;
- absolute-path patterns, portable replacements, and narrowly scoped examples;
- PII/PHI rule IDs, confidence levels, and test cases (positive and negative);
- exception owner, expiry, and review record; and
- the CI job name that branch rules require.

For standard/sensitive projects, the checker may scan only added/changed text where justified.
For medical/regulated projects, scan all tracked files and do not exempt directories, tests,
generated files, or unknown extensions. In every tier, redact matches from logs, exit non-zero
for blocking rules, and have tests proving it catches a synthetic representative sample. A
pre-commit hook is a convenience; a required PR check is the merge control.

## 5. GitHub Apps and outside services

Treat every App as a data processor with code and metadata access. Install the smallest
useful set, scope it to selected repositories, give it minimum permissions, review its
retention/training/subprocessor terms, and periodically remove unused Apps. See the curated
options in [`inventory/github-apps.md`](../inventory/github-apps.md).

- **Start small:** Dependabot plus GitHub-native scanning is enough for many standard repos.
- **Add review quality deliberately:** CodeRabbit, DeepSource, or similar can improve review,
  but their PR/code access must be acceptable for the classification.
- **Add unified security only when owned:** Snyk or Aikido can centralize SCA/SAST/container
  posture, but designate a team to triage and remediate findings before making their checks
  required.
- **For regulated work:** prefer an approved internal/contracted DLP and runners over sending
  source or candidate sensitive text to a convenience SaaS. Verify the service agreement and
  organizational policy first; no template recommendation substitutes for that review.

## 6. Rollout and recurring verification

1. Inventory current branches, collaborators, Apps, workflows, secrets, environments, and
   data-bearing files before enabling gates.
2. Configure the default-branch ruleset in evaluate/advisory mode where possible; establish
   the required check names and fix noisy checks.
3. Install hooks, make CI required, enable GitHub's built-in scans, and test a deliberately
   synthetic blocked example in a throwaway branch.
4. Turn the ruleset active. Document break-glass access and make bypasses auditable.
5. At least quarterly—and after a domain, team, or data-classification change—review ruleset
   bypasses, failed/renamed checks, CODEOWNERS, App access, alert backlog, false positives,
   and workflow permissions/retention.

If sensitive data reaches the remote despite these gates: stop sharing it, revoke/rotate any
credentials, restrict access, follow the organization's incident process, and only then plan
history remediation. Rewriting Git history does not remove clones, caches, logs, artifacts,
or third-party copies.
