/**
 * Chrome 76 runtime smoke suite. Runs inside the Docker image built from ./Dockerfile
 * (Chromium r662092 = 76.0.3797.0 + puppeteer-core 1.17), against an app server that
 * runs in a SEPARATE container. Driven by test/chrome76/run.sh; see AGENTS.md.
 *
 * For each scenario: load the page at 1920x1080, wait until photos are visibly on screen,
 * hold for a settle period, then screenshot. A scenario fails on any pageerror,
 * console.error (includes CSP violations and failed resource loads), CSP
 * securitypolicyviolation event, failed same-origin request, wrong display mode, or a
 * black / mostly empty screen.
 *
 * Scenarios other than the default pick their album the way the Playwright E2E helper
 * (test/e2e/helpers/scenario.mjs) does: request interception redirects /album/35 to the
 * server's test-only /album/scenario/:name route. No product change needed.
 *
 * Env: BASE_URL, OUT_DIR, CHROME_BIN, CHROME76_CPU_THROTTLE (1 = off),
 *      CHROME76_SCENARIOS (comma list of names), CHROME76_SETTLE_MS, CHROME76_READY_TIMEOUT_MS.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL || 'http://app:3000';
const OUT_DIR = process.env.OUT_DIR || '/out';
const CHROME_BIN = process.env.CHROME_BIN || '/opt/chrome-linux/chrome';
const CPU_THROTTLE = Number(process.env.CHROME76_CPU_THROTTLE || 1);
const SETTLE_MS = Number(process.env.CHROME76_SETTLE_MS || 5000);
const READY_TIMEOUT_MS = Number(process.env.CHROME76_READY_TIMEOUT_MS || 60000);
const VIEWPORT = { width: 1920, height: 1080 };

// scenario: directory under <library>/scenarios/ (null = the default random album, no
// interception). mode: expected body.mode-<mode> (null = any). minImages / minCoverage:
// "not a black screen" thresholds, measured on images visible inside the viewport.
const SCENARIOS = [
  { name: 'grid-default', scenario: null, mode: null, minImages: 1, minCoverage: 0.3 },
  { name: 'grid-full-panorama', scenario: 'full-panorama', mode: 'grid', minImages: 5, minCoverage: 0.5 },
  { name: 'grid-full-no-panorama', scenario: 'full-no-panorama', mode: 'grid', minImages: 5, minCoverage: 0.5 },
  { name: 'tiny-4-mixed', scenario: 'tiny-4-mixed', mode: 'tiny', minImages: 2, minCoverage: 0.3 },
  { name: 'tiny-6-portrait', scenario: 'tiny-6-portrait', mode: 'tiny', minImages: 2, minCoverage: 0.3 },
  { name: 'tiny-2-portrait', scenario: 'tiny-2-portrait', mode: 'tiny', minImages: 2, minCoverage: 0.3 },
  { name: 'single-landscape', scenario: 'single-landscape', mode: 'single', minImages: 1, minCoverage: 0.3 },
  { name: 'single-panorama', scenario: 'single-panorama', mode: 'single', minImages: 1, minCoverage: 0.3 },
  { name: 'single-exif6', scenario: 'single-exif6', mode: 'single', minImages: 1, minCoverage: 0.3 },
];

// Known, harmless noise that is not a Chrome 76 problem; keep this list short and specific.
//  - Synology thumbnails (@eaDir/SYNOPHOTO_THUMB_*) are absent from the fixture library, so the
//    app's fallback to the original photo shows up as a 404.
const isThumb404 = (url) => /\/@eaDir\/[^/]+\/SYNOPHOTO_THUMB_\w+\.jpg$/.test(url || '');

/**
 * Runs in the page (Chrome 76: keep it ES2019). Measures what a viewer actually sees:
 * decoded images under #content that are displayed, mostly opaque and inside the viewport.
 */
function measureScreen() {
  var vw = window.innerWidth;
  var vh = window.innerHeight;
  var mode = (document.body.className.match(/mode-(\w+)/) || [])[1] || null;
  var imgs = Array.prototype.slice.call(document.querySelectorAll('#content img'));
  var visible = [];
  imgs.forEach(function (img) {
    if (!img.complete || !img.naturalWidth) return;
    var r = img.getBoundingClientRect();
    var left = Math.max(r.left, 0);
    var top = Math.max(r.top, 0);
    var right = Math.min(r.right, vw);
    var bottom = Math.min(r.bottom, vh);
    if (right - left < 20 || bottom - top < 20) return;
    var opacity = 1;
    for (var el = img; el && el.nodeType === 1; el = el.parentElement) {
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      opacity *= parseFloat(cs.opacity);
    }
    if (opacity < 0.5) return;
    visible.push({ left: left, top: top, right: right, bottom: bottom });
  });
  // Coverage: area of the union's bounding box over the viewport. Coarse on purpose, it
  // only has to tell "photos fill the screen" from "a sliver of it".
  var coverage = 0;
  if (visible.length) {
    var l = Math.min.apply(null, visible.map(function (v) { return v.left; }));
    var t = Math.min.apply(null, visible.map(function (v) { return v.top; }));
    var rr = Math.max.apply(null, visible.map(function (v) { return v.right; }));
    var b = Math.max.apply(null, visible.map(function (v) { return v.bottom; }));
    coverage = ((rr - l) * (b - t)) / (vw * vh);
  }
  return {
    mode: mode,
    imageCount: imgs.length,
    visibleImages: visible.length,
    coverage: Math.round(coverage * 100) / 100,
  };
}

function screenIsGood(m, spec) {
  return (
    (spec.mode === null || m.mode === spec.mode) &&
    m.visibleImages >= spec.minImages &&
    m.coverage >= spec.minCoverage
  );
}

function cgroupPeakBytes() {
  for (const f of ['/sys/fs/cgroup/memory.peak', '/sys/fs/cgroup/memory/memory.max_usage_in_bytes']) {
    try {
      return Number(fs.readFileSync(f, 'utf8').trim());
    } catch (e) {
      /* try the next cgroup layout */
    }
  }
  return null;
}

// A page stuck in a busy loop never answers CDP calls; bound every one so the run fails
// that scenario instead of hanging.
function guard(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms (page unresponsive?)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function runScenario(browser, spec) {
  const problems = [];
  const started = Date.now();
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (/Failed to load resource/.test(msg.text()) && isThumb404(msg.location().url)) return;
    problems.push(`console.error: ${msg.text()}`);
  });
  page.on('requestfailed', (req) => {
    const failure = req.failure();
    // Aborted fetches are normal (the app aborts prefetches on transitions).
    if (failure && failure.errorText === 'net::ERR_ABORTED') return;
    problems.push(`requestfailed: ${req.url()} ${failure ? failure.errorText : ''}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().endsWith('/favicon.ico') && !isThumb404(res.url())) {
      problems.push(`HTTP ${res.status()}: ${res.url()}`);
    }
  });
  await page.evaluateOnNewDocument(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__cspViolations.push(`${e.violatedDirective} blocked ${e.blockedURI}`);
    });
  });

  if (CPU_THROTTLE > 1) {
    const client = await page.target().createCDPSession();
    await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  }

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (spec.scenario && /^\/album\/35$/.test(url.pathname)) {
      req.continue({ url: `${url.origin}/album/scenario/${spec.scenario}` });
    } else {
      req.continue();
    }
  });

  let measured = null;
  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Poll from node with page.evaluate: page.waitForFunction would need eval, which the
    // app's CSP (script-src 'self') blocks, and bypassing CSP would hide violations.
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let ready = false;
    while (Date.now() < deadline) {
      if (screenIsGood(await guard(page.evaluate(measureScreen), 30000, 'measure'), spec)) {
        ready = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!ready) problems.push(`black or incomplete screen: not ready within ${READY_TIMEOUT_MS} ms`);
    // Hold: late errors (animations, swaps, watchdogs) and a screen that goes black again.
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    measured = await guard(page.evaluate(measureScreen), 30000, 'measure');
    if (!screenIsGood(measured, spec)) {
      problems.push(
        `black or incomplete screen after settle: ${JSON.stringify(measured)} ` +
          `(want mode ${spec.mode || 'any'}, >= ${spec.minImages} images, coverage >= ${spec.minCoverage})`
      );
    }
    const csp = await guard(page.evaluate(() => window.__cspViolations), 30000, 'csp read');
    csp.filter((v) => v !== 'img-src blocked data').forEach((v) => problems.push(`CSP violation: ${v}`));
  } catch (e) {
    problems.push(`harness error: ${e.message}`);
  }

  const shot = path.join(OUT_DIR, `${spec.name}${problems.length ? '-FAILED' : ''}.png`);
  try {
    await guard(page.screenshot({ path: shot }), 60000, 'screenshot');
  } catch (e) {
    problems.push(`screenshot failed: ${e.message}`);
  }
  await guard(page.close(), 15000, 'page.close').catch(() => {});
  return {
    name: spec.name,
    ok: problems.length === 0,
    problems: [...new Set(problems)],
    measured,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    screenshot: path.basename(shot),
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const only = (process.env.CHROME76_SCENARIOS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const specs = only.length ? SCENARIOS.filter((s) => only.includes(s.name)) : SCENARIOS;
  if (!specs.length) throw new Error(`No scenario matches CHROME76_SCENARIOS=${only.join(',')}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_BIN,
    headless: true,
    // /dev/shm is sized by the container (--shm-size); no GPU on the display in headless.
    // --no-zygote + --browser-subprocess-path: under qemu amd64 emulation (arm64 Docker hosts)
    // the zygote's single-thread check aborts, and without an explicit path Chromium re-execs
    // /proc/self/exe, which is qemu itself. Harmless on native amd64.
    args: [
      '--no-sandbox',
      '--no-zygote',
      `--browser-subprocess-path=${CHROME_BIN}`,
      '--disable-gpu',
      '--force-device-scale-factor=1',
    ],
  });
  const version = await browser.version();
  console.log(`Browser: ${version}  CPU throttle: ${CPU_THROTTLE}x  base: ${BASE_URL}`);
  if (!/Chrome\/76\./.test(version)) {
    await browser.close();
    throw new Error(`Expected Chrome 76, got ${version}`);
  }

  const results = [];
  for (const spec of specs) {
    const r = await runScenario(browser, spec);
    results.push(r);
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.seconds}s)  ${JSON.stringify(r.measured)}`);
    r.problems.forEach((p) => console.log(`        ${p}`));
  }
  await browser.close();

  const peak = cgroupPeakBytes();
  const summary = { version, cpuThrottle: CPU_THROTTLE, cgroupPeakMemoryMiB: peak && Math.round(peak / 1048576), results };
  fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(summary, null, 2));
  if (peak) console.log(`Container cgroup peak memory: ${Math.round(peak / 1048576)} MiB`);

  // The container runs as root; make the output removable by the host user.
  fs.chmodSync(OUT_DIR, 0o777);
  for (const f of fs.readdirSync(OUT_DIR)) fs.chmodSync(path.join(OUT_DIR, f), 0o666);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} scenarios passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
