/**
 * On-device diagnostics store (pi_slide_show-6fx).
 *
 * The kiosk page POSTs small JSON reports to /diag; this module validates them, keeps the last
 * MAX_REPORTS in a bounded ring buffer and serves them back. Everything here is data-only:
 * input is whitelisted field by field, strings are trimmed and stripped of control characters,
 * and nothing is ever reflected as HTML or echoed in a response.
 */

export const MAX_REPORTS = 100;          // ring buffer size
export const MAX_BODY_BYTES = 16 * 1024; // request body cap
export const MAX_EVENTS = 20;            // events kept per report
export const GLOBAL_RATE_MAX = 60;       // reports accepted per minute across all clients
const RATE_WINDOW_MS = 60 * 1000;

const MODES = new Set(['grid', 'single', 'tiny']);
const REASONS = new Set(['interval', 'error']);
const EVENT_TYPES = new Set(['error', 'unhandledrejection', 'csp', 'console']);

/** Trim, strip control characters, cap length. Non-strings become ''. */
export function cleanString(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').trim().slice(0, max);
}

function cleanNumber(value, min = 0, max = 1e9) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return Math.round(value * 100) / 100;
}

function cleanFrames(f) {
  if (!f || typeof f !== 'object') return null;
  const out = {
    n: cleanNumber(f.n, 0, 1e7),
    p50: cleanNumber(f.p50, 0, 1e6),
    p95: cleanNumber(f.p95, 0, 1e6),
    max: cleanNumber(f.max, 0, 1e6)
  };
  return out.n === null ? null : out;
}

function cleanMemory(m) {
  if (!m || typeof m !== 'object') return null;
  const out = {
    usedMB: cleanNumber(m.usedMB, 0, 1e6),
    totalMB: cleanNumber(m.totalMB, 0, 1e6),
    limitMB: cleanNumber(m.limitMB, 0, 1e6)
  };
  return out.usedMB === null ? null : out;
}

function cleanEvents(events) {
  if (!Array.isArray(events)) return [];
  const out = [];
  for (const e of events.slice(0, MAX_EVENTS)) {
    if (!e || typeof e !== 'object' || !EVENT_TYPES.has(e.type)) continue;
    out.push({
      type: e.type,
      message: cleanString(e.message, 300),
      source: cleanString(e.source, 200),
      line: cleanNumber(e.line, 0, 1e7),
      col: cleanNumber(e.col, 0, 1e7)
    });
  }
  return out;
}

/**
 * Validate a parsed JSON body into a clean report, or return null if it is not a report.
 * @param {unknown} body
 * @returns {object|null}
 */
export function sanitizeReport(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const viewport = body.viewport && typeof body.viewport === 'object' ? body.viewport : {};
  return {
    reason: REASONS.has(body.reason) ? body.reason : 'interval',
    mode: MODES.has(body.mode) ? body.mode : 'unknown',
    album: cleanString(body.album, 120),
    userAgent: cleanString(body.userAgent, 200),
    viewport: { w: cleanNumber(viewport.w, 0, 100000), h: cleanNumber(viewport.h, 0, 100000) },
    uptimeMs: cleanNumber(body.uptimeMs, 0, 1e12),
    frames: cleanFrames(body.frames),
    memory: cleanMemory(body.memory),
    events: cleanEvents(body.events)
  };
}

const PRIVATE_V4 = [
  /^127\./, /^10\./, /^192\.168\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./
];

/**
 * True for loopback, RFC 1918, link-local and IPv6 unique-local addresses. Pass the socket
 * address, never X-Forwarded-For (a client can set that header).
 */
export function isPrivateAddress(addr) {
  if (typeof addr !== 'string' || !addr) return false;
  let a = addr.toLowerCase();
  if (a.startsWith('::ffff:')) a = a.slice(7);
  if (a === '::1') return true;
  if (PRIVATE_V4.some((re) => re.test(a))) return true;
  return /^f[cd][0-9a-f]{2}:/.test(a) || /^fe[89ab][0-9a-f]:/.test(a);
}

/** Bounded in-memory report store with a global per-minute accept limit. */
export function createDiagnosticsStore({ maxReports = MAX_REPORTS, rateMax = GLOBAL_RATE_MAX, now = Date.now } = {}) {
  const reports = [];
  let windowStart = 0;
  let windowCount = 0;
  let total = 0;

  return {
    /** @returns {boolean} false when the global rate limit rejects the report */
    allow() {
      const t = now();
      if (t - windowStart > RATE_WINDOW_MS) {
        windowStart = t;
        windowCount = 0;
      }
      if (windowCount >= rateMax) return false;
      windowCount++;
      return true;
    },
    add(report, ip) {
      total++;
      reports.push({ receivedAt: new Date(now()).toISOString(), ip: cleanString(ip, 64), ...report });
      if (reports.length > maxReports) reports.splice(0, reports.length - maxReports);
    },
    list() {
      return { total, count: reports.length, reports: reports.slice() };
    }
  };
}

/** One log line per report: enums and numbers, plus the first message JSON-quoted and capped. */
export function formatLogLine(report, ip) {
  const f = report.frames;
  const first = report.events[0];
  return `diag ip=${cleanString(ip, 64)} reason=${report.reason} mode=${report.mode} ` +
    `events=${report.events.length}` +
    (f ? ` frames=${f.n} p95=${f.p95}ms max=${f.max}ms` : '') +
    (report.memory ? ` usedMB=${report.memory.usedMB}` : '') +
    (first ? ` first=${JSON.stringify(first.type + ': ' + first.message.slice(0, 100))}` : '');
}
