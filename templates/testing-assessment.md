# Testing Assessment: [Scope]

Last reviewed: 2026-07-11
Date: YYYY-MM-DD
Reviewer: [agent or human]
Scope: [module, feature, or full repo]

## Coverage summary

| Layer | Tool | Coverage | Notes |
|---|---|---|---|
| Unit tests | pytest / vitest | X% | |
| Integration tests | | X% | |
| End-to-end | Playwright / etc. | X% | |
| Key happy paths tested | — | ✅ / ❌ | |
| Key error paths tested | — | ✅ / ❌ | |

## Test quality findings

### Test-related TODOs

| Location | Item | Recommended disposition |
|---|---|---|
| `file.py:42` | [TODO, skipped test, xfail, coverage gap] | fix now / plan / issue / remove as stale |

### Missing coverage (ranked by risk)

| Area | Why it matters | Suggested test |
|---|---|---|
| [module/function] | [impact if untested] | [test approach] |

### Weak tests (testing the wrong thing)

| Test | Issue |
|---|---|
| `test_file.py::test_name` | [e.g. only tests happy path, mocks too aggressively] |

### Test hygiene

- [ ] Tests are isolated (no shared mutable state between tests)
- [ ] No tests editing source to force green builds
- [ ] Slow tests separated from fast unit tests
- [ ] Test names describe behavior, not implementation

## Testing strategy recommendations

| Layer | Current | Recommended |
|---|---|---|
| Unit | | |
| Integration | | |
| E2E | | |
| Load / performance | | |

## Blocking gaps (must fix before next release)

- [ ] [gap — owner]

## References

- [pytest docs, coverage thresholds, CI config]
