# Safety Review: [Title / Scope]

Last reviewed: 2026-07-11
Date: YYYY-MM-DD
Reviewer: [agent or human]
Scope: [model, feature, dataset, prompt, or deployment under review]
Risk tier: low | medium | high | critical

Use this template for AI/ML model behavior, agentic systems, automated pipelines,
and any system where incorrect outputs cause real-world harm.

## System description

What does the system do? Who uses it? What actions can it take autonomously?

## Harm taxonomy

For each category, mark: ✅ mitigated | ⚠️ partial | ❌ unmitigated | N/A.

| Category | Status | Notes |
|---|---|---|
| Incorrect / hallucinated outputs | — | |
| Harmful content generation | — | |
| Privacy / PII exposure | — | |
| Autonomous action with irreversible effects | — | |
| Bias / fairness issues | — | |
| Adversarial / prompt injection | — | |
| Supply chain (model weights, data) | — | |
| Scope creep (agent does more than intended) | — | |
| Failure mode visibility (silent errors) | — | |

## Threat scenarios

For each plausible failure mode, describe the scenario and its blast radius.

### Scenario 1: [name]

- Trigger: ...
- Impact: ...
- Mitigation in place: ...
- Residual risk: ...

## Human oversight

- [ ] Human approval required before irreversible actions
- [ ] Agent output reviewed before user-facing delivery
- [ ] Logging / audit trail for all automated actions
- [ ] Rollback or undo capability exists

## Constraints & guardrails

List technical constraints on the system's behavior (rate limits, scope limits, content
filters, output validation, human-in-the-loop checkpoints).

## Testing

- [ ] Adversarial prompt tests conducted
- [ ] Edge cases and refusal behavior verified
- [ ] Evaluation set documents expected vs actual outputs

## Verdict

**Approved / Approved with conditions / Not approved**

Blocking items before deployment:

- [ ] [item]

## References

- [Anthropic responsible scaling policy, model card, or relevant safety docs]
