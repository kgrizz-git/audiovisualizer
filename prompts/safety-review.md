# Safety Review Prompt

Run a structured safety review of an AI/ML system, agentic workflow, or automated
pipeline and produce a completed [`templates/safety-review.md`](../templates/safety-review.md).

Use this for: AI model deployments, agentic systems with real-world actions, automated
data pipelines affecting users, or any system where incorrect outputs cause harm.

## Process

1. **Understand the system** — what does it do, what can it act on autonomously,
   who are the affected users, and what is the blast radius of a failure?

2. **Work through the harm taxonomy** — for each category in the template, gather
   evidence and mark status. Do not skip categories without a reason.

3. **Enumerate threat scenarios** — for each plausible failure mode, describe:
   - What triggers it.
   - What the impact is (severity × likelihood).
   - What mitigation exists today.
   - What residual risk remains.

4. **Check human oversight** — every system that takes irreversible real-world actions
   must have a human checkpoint or a clear, documented rationale for why it does not.

5. **Verify constraints & guardrails** — check that stated limits (rate limits, scope
   limits, content filters, output validation) are actually implemented and tested.

6. **Fill in the template** — produce a verdict with specific blocking items if any.

## Output

A completed `templates/safety-review.md` with:

- System description sufficient for someone unfamiliar to understand scope.
- Harm taxonomy fully checked.
- Threat scenarios with blast radius estimates.
- Human oversight gaps identified.
- Verdict with actionable blocking items.

## Constraints

- A "low risk" verdict requires positive evidence, not absence of findings.
- Do not approve agentic systems that can take irreversible actions without human
  oversight unless there is an explicit documented rationale.
- If you cannot assess a category (e.g. you cannot inspect model weights), say so explicitly.
