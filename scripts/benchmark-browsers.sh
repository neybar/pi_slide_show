#!/usr/bin/env bash
# Compare Chromium vs Lightpanda E2E test performance
# Runs each browser suite 3 times, captures timing, outputs comparison table

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
RESULTS_DIR="/tmp/playwright-benchmark"
RUNS=3

rm -rf "$RESULTS_DIR"
mkdir -p "$RESULTS_DIR"

# Node.js script (inline) to parse Playwright JSON reporter output
PARSE_RESULTS_SCRIPT="$(cat <<'NODEJS'
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const tests = [];
for (const suite of data.suites ?? []) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const duration = test.results?.[0]?.duration ?? 0;
      const status = test.results?.[0]?.status ?? 'unknown';
      tests.push({ title: `${suite.title} > ${spec.title}`, duration, status });
    }
  }
}
console.log(JSON.stringify(tests));
NODEJS
)"

run_suite() {
  local browser="$1"   # chromium or lightpanda
  local run="$2"
  local out="$RESULTS_DIR/${browser}-run${run}.json"
  local time_file="$RESULTS_DIR/${browser}-run${run}.time"

  echo "  Run $run..."
  local start=$SECONDS
  npx playwright test --project="$browser" --reporter=json 2>/dev/null > "$out" || true
  echo $((SECONDS - start)) > "$time_file"
}

# Parse all runs for a browser into per-test averages: title -> {total_ms, total_wall, pass_count, fail_count}
summarize() {
  local browser="$1"
  local summary_file="$RESULTS_DIR/${browser}-summary.json"

  node --input-type=commonjs -e "$PARSE_RESULTS_SCRIPT" "$RESULTS_DIR/${browser}-run1.json" > /dev/null 2>&1 || {
    echo "[]" > "$summary_file"
    return
  }

  node --input-type=commonjs - "$browser" "$RESULTS_DIR" "$RUNS" <<'NODEJS'
const fs = require('fs');
const browser = process.argv[2];
const dir = process.argv[3];
const runs = parseInt(process.argv[4]);

const parseScript = (jsonFile) => {
  const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  const tests = [];
  const walk = (suites, prefix) => {
    for (const suite of suites ?? []) {
      const title = prefix ? `${prefix} > ${suite.title}` : suite.title;
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          const duration = test.results?.[0]?.duration ?? 0;
          const status = test.results?.[0]?.status ?? 'unknown';
          tests.push({ title: `${title} > ${spec.title}`, duration, status });
        }
      }
      walk(suite.suites, title);
    }
  };
  walk(data.suites, '');
  return tests;
};

const totals = {};
for (let i = 1; i <= runs; i++) {
  const file = `${dir}/${browser}-run${i}.json`;
  if (!fs.existsSync(file)) continue;
  const tests = parseScript(file);
  for (const t of tests) {
    if (!totals[t.title]) totals[t.title] = { duration: 0, passed: 0, failed: 0, count: 0 };
    totals[t.title].duration += t.duration;
    totals[t.title].count++;
    if (t.status === 'passed') totals[t.title].passed++;
    else totals[t.title].failed++;
  }
}

const summary = Object.entries(totals).map(([title, d]) => ({
  title,
  avg_ms: Math.round(d.duration / d.count),
  passed: d.passed,
  failed: d.failed,
}));
fs.writeFileSync(`${dir}/${browser}-summary.json`, JSON.stringify(summary, null, 2));
NODEJS
}

print_table() {
  local chromium_file="$RESULTS_DIR/chromium-summary.json"
  local lightpanda_file="$RESULTS_DIR/lightpanda-summary.json"

  node --input-type=commonjs - "$chromium_file" "$lightpanda_file" "$RESULTS_DIR" "$RUNS" <<'NODEJS'
const fs = require('fs');
const [,, chromiumFile, lightpandaFile, dir, runs] = process.argv;

const load = (f) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : [];
const chromium = load(chromiumFile);
const lightpanda = load(lightpandaFile);

const lpMap = Object.fromEntries(lightpanda.map(t => [t.title, t]));

// Wall clock totals
const wallTimes = (browser) => {
  const times = [];
  for (let i = 1; i <= parseInt(runs); i++) {
    const f = `${dir}/${browser}-run${i}.time`;
    if (fs.existsSync(f)) times.push(parseInt(fs.readFileSync(f).trim()));
  }
  return times.length ? Math.round(times.reduce((a, b) => a + b) / times.length) : null;
};

const chromiumWall = wallTimes('chromium');
const lightpandaWall = wallTimes('lightpanda');

console.log('\n=== Browser Benchmark Results ===\n');
console.log(`Runs per browser: ${runs}`);

console.log('\n--- Wall-clock time (full suite) ---');
console.log(`  Chromium:   ${chromiumWall ?? 'N/A'}s`);
console.log(`  Lightpanda: ${lightpandaWall ?? 'N/A'}s`);
if (chromiumWall && lightpandaWall) {
  const ratio = (chromiumWall / lightpandaWall).toFixed(2);
  console.log(`  Speedup:    ${ratio}x`);
}

console.log('\n--- Per-test results ---');
const col = (s, n) => String(s).padEnd(n);
console.log(col('Test', 60) + col('Chromium', 12) + col('LP', 12) + col('Speedup', 10) + 'LP Status');
console.log('-'.repeat(100));

let passCount = 0, failCount = 0;
for (const c of chromium) {
  const lp = lpMap[c.title];
  const lpMs = lp ? `${lp.avg_ms}ms` : 'N/A';
  const speedup = lp ? (c.avg_ms / lp.avg_ms).toFixed(1) + 'x' : 'N/A';
  const status = lp ? (lp.failed > 0 ? 'FAIL' : 'PASS') : 'NOT RUN';
  if (lp) lp.failed > 0 ? failCount++ : passCount++;
  console.log(col(c.title.slice(-58), 60) + col(`${c.avg_ms}ms`, 12) + col(lpMs, 12) + col(speedup, 10) + status);
}

console.log('\n--- Summary ---');
const total = passCount + failCount;
console.log(`  Lightpanda: ${passCount}/${total} tests passed (${total ? Math.round(passCount/total*100) : 0}%)`);
console.log(`\nResults saved to: ${dir}/`);
NODEJS
}

cd "$PROJECT_ROOT"

echo "=== Chromium runs ==="
for i in $(seq 1 $RUNS); do
  run_suite "chromium" "$i"
done
summarize "chromium"

echo ""
echo "=== Lightpanda runs ==="
echo "Note: Lightpanda must be running — use: ./scripts/lightpanda.sh start"
for i in $(seq 1 $RUNS); do
  run_suite "lightpanda" "$i"
done
summarize "lightpanda"

echo ""
print_table
