# Policy: Documentation Freshness

Last reviewed: 2026-06-26
Enforced by: [`hooks/scripts/check_doc_freshness.py`](../hooks/scripts/check_doc_freshness.py)

## Why

Stale docs are worse than missing docs: they mislead humans and agents alike. A visible
review marker plus a staleness window keeps durable docs trustworthy.

## Rules & defaults

| Rule | Default | Tier |
|---|---|---|
| Durable docs carry a freshness marker | `Last reviewed: YYYY-MM-DD` near the top | soft gate |
| Staleness window before review is due | 180 days | advisory (warn), CI soft gate |
| Hard-stale threshold | 365 days | hard gate in CI |
| Marker required in these paths | `policies/`, `templates/`, `inventory/`, root `*.md` | soft gate |
| Exempt paths | `.context/`, `CHANGELOG.md`, auto-generated indexes, `notes_and_ideas/` | n/a |

### Marker format

Put one of these within the first ~10 lines of the doc:

```
Last reviewed: 2026-06-26
```

The checker parses the date, compares to today, and reports docs past the window.

## Reviewing a doc (what "reviewed" means)

1. Re-read it against the current code/behavior.
2. Fix anything inaccurate; verify commands, paths, links.
3. Update the date only after the content is confirmed current.

> Bumping the date without re-reading defeats the policy. The date asserts "a human/agent
> confirmed this is accurate as of this date."

## Generated indexes

Auto-generated lists (e.g. directory indexes) should be regenerated, not hand-dated. Track
their generator and last-run instead of a manual marker.
