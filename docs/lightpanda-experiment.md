# Lightpanda Browser Experiment

## Overview

[Lightpanda](https://github.com/lightpanda-io/browser) is a headless browser optimized for automation, targeting 9x less memory and 11x faster execution than Chrome (their claim, unverified for this project). It connects via CDP (Chrome DevTools Protocol) on WebSocket port 9222, which Playwright can use via `connectOverCDP`.

This experiment evaluates Lightpanda as a supplemental option for E2E tests. Chromium remains the default.

**Status**: Experiment not yet run. See [Results](#results) below once completed.

---

## Setup

```bash
./scripts/lightpanda.sh start
./scripts/lightpanda.sh status
./scripts/lightpanda.sh stop
# or
docker compose -f docker-compose.lightpanda.yml up -d lightpanda
```

---

## Running Tests

```bash
# Run Lightpanda E2E suite only
npm run test:e2e:lightpanda

# Run both browsers sequentially and save output
npm run test:e2e:compare

# Full benchmark: 3 runs per browser, per-test timing table
npm run test:benchmark
```

Note: Lightpanda must be running before executing any of the above.

---

## Test Compatibility Matrix

| Test File | Included | Risk Factors |
|-----------|----------|--------------|
| `slideshow.spec.mjs` | Yes | `networkidle` (1x), `toBeVisible` (2x), `page.on('response')` |
| `progressive-loading.spec.mjs` | Yes | `page.on('request')`, `MutationObserver`, `addInitScript` |
| `memory-stability.spec.mjs` | Yes | Timer monkey-patching, DOM counting — likely lower risk |
| `network-resilience.spec.mjs` | Yes | `networkidle` (2x), `page.on('response')` |
| `album-transition.spec.mjs` | Yes | All tests are `test.skip()` — no practical risk |
| `accessibility.spec.mjs` | **EXCLUDED** | `@axe-core/playwright` requires full rendering engine |

Existing tests are not modified. Failures against Lightpanda are expected data, not bugs to fix.

---

## Results

*Not yet run. Fill in after executing `npm run test:benchmark`.*

### Pass/Fail Matrix

| Test File | Chromium | Lightpanda |
|-----------|----------|------------|
| slideshow.spec.mjs | - | - |
| progressive-loading.spec.mjs | - | - |
| memory-stability.spec.mjs | - | - |
| network-resilience.spec.mjs | - | - |
| album-transition.spec.mjs | - | - |

### Performance (3-run average)

| Metric | Chromium | Lightpanda | Speedup |
|--------|----------|------------|---------|
| Total suite (wall clock) | - | - | - |

### Known Incompatibilities

*None recorded yet.*

---

## Decision Framework

After running the benchmark, results fall into one of these scenarios:

| Scenario | Condition | Action |
|----------|-----------|--------|
| A | >80% pass AND meaningfully faster | Adopt as fast-feedback layer alongside Chromium |
| B | Faster BUT <50% pass | Do not bifurcate. Keep config dormant, revisit quarterly |
| C | Not meaningfully faster | No adoption. Close experiment |
| D | CDP connection fails or crashes | Document failure, revisit on next nightly release |

**Key principle**: Do not split tests across browsers unless Lightpanda handles enough of the suite to serve as a genuine fast-feedback layer. Partial test suites across browsers create ambiguity about what's actually covered.

---

## Recommendation

*Pending results.*
