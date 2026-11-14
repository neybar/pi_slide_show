/**
 * On-device diagnostics (pi_slide_show-6fx)
 *
 * The kiosk has no keyboard, so the page reports what it sees back to the server it was loaded
 * from: errors, the current mode and album, a frame-time summary and memory. Does nothing unless
 * the server enabled it (DIAG_ENABLED injects <meta name="diagnostics" content="on">).
 *
 * Reads the body's mode-* class and the .album_name text, so main.js needs no hooks. Does not
 * import config.mjs (the server adds ?v= to script URLs, which would load a second copy); it
 * reads window.SlideshowConfig with built-in defaults, like the other modules.
 *
 * Cost while enabled: one requestAnimationFrame callback per frame (a subtraction and an array
 * store). The sort for percentiles runs once per report, on at most FRAME_CAP samples.
 */

const DEFAULTS = {
    DIAG_INTERVAL_MS: 60000,
    DIAG_ERROR_MIN_GAP_MS: 5000
};

const FRAME_CAP = 4096;       // frame deltas kept per window (60 s at 60 fps is 3600)
const MAX_EVENTS = 20;        // queued events per report
const MAX_BODY_CHARS = 15000; // server limit is 16 KB

function val(cfg, key) {
    const v = cfg ? cfg[key] : undefined;
    return typeof v === 'number' && !isNaN(v) && v > 0 ? v : DEFAULTS[key];
}

/**
 * p50/p95/max of frame-to-frame deltas.
 * @param {ArrayLike<number>} deltas - ms between frames
 * @param {number} n - how many entries of deltas are valid
 * @returns {{n: number, p50: number, p95: number, max: number}|null}
 */
export function summarizeFrames(deltas, n) {
    if (!n) return null;
    var sorted = Array.prototype.slice.call(deltas, 0, n).sort(function (a, b) { return a - b; });
    var at = function (q) { return sorted[Math.min(n - 1, Math.floor(q * n))]; };
    var round = function (x) { return Math.round(x * 10) / 10; };
    return { n: n, p50: round(at(0.5)), p95: round(at(0.95)), max: round(sorted[n - 1]) };
}

/** Stringify anything for an event message without throwing. */
export function describe(value) {
    if (value instanceof Error) return value.name + ': ' + value.message;
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch (e) { return String(value); }
}

/** @returns {string} grid | single | tiny | '' from a body className */
export function modeFromClassName(className) {
    var m = /(?:^|\s)mode-(\w+)/.exec(className || '');
    return m ? m[1] : '';
}

/**
 * Wire everything up. Returns a stop function (used by tests); in the browser the page
 * keeps it running until unload.
 * @param {Window} win
 * @param {Object} [cfg] - window.SlideshowConfig
 */
export function startDiagnostics(win, cfg) {
    var doc = win.document;
    var intervalMs = val(cfg, 'DIAG_INTERVAL_MS');
    var minGapMs = val(cfg, 'DIAG_ERROR_MIN_GAP_MS');

    var events = [];
    var deltas = new Float32Array(FRAME_CAP);
    var frameCount = 0;
    var lastFrame = 0;
    var rafId = 0;
    var lastErrorSend = 0;
    var errorTimer = 0;
    var started = win.performance.now();
    var originalConsoleError = win.console.error;

    function queue(type, message, source, line, col) {
        if (events.length >= MAX_EVENTS) events.shift();
        events.push({
            type: type,
            message: String(message).slice(0, 300),
            source: source ? String(source).slice(0, 200) : '',
            line: line || 0,
            col: col || 0
        });
        scheduleErrorSend();
    }

    function onFrame(t) {
        if (lastFrame) {
            // Past the cap keep the newest samples in place of the oldest
            deltas[frameCount < FRAME_CAP ? frameCount++ : (Math.random() * FRAME_CAP) | 0] = t - lastFrame;
        }
        lastFrame = t;
        rafId = win.requestAnimationFrame(onFrame);
    }

    function buildReport(reason) {
        var album = doc.querySelector('.album_name');
        var mem = win.performance && win.performance.memory;
        return {
            reason: reason,
            mode: modeFromClassName(doc.body && doc.body.className),
            album: album ? (album.textContent || '').trim().slice(0, 120) : '',
            userAgent: win.navigator.userAgent,
            viewport: { w: win.innerWidth, h: win.innerHeight },
            uptimeMs: Math.round(win.performance.now() - started),
            frames: summarizeFrames(deltas, frameCount),
            memory: mem ? {
                usedMB: Math.round(mem.usedJSHeapSize / 1048576),
                totalMB: Math.round(mem.totalJSHeapSize / 1048576),
                limitMB: Math.round(mem.jsHeapSizeLimit / 1048576)
            } : null,
            events: events
        };
    }

    function send(reason) {
        var report = buildReport(reason);
        var body = JSON.stringify(report);
        // Oversized (should not happen with the caps): drop events rather than the report
        if (body.length > MAX_BODY_CHARS) {
            report.events = report.events.slice(-3);
            body = JSON.stringify(report);
        }
        events = [];
        if (reason === 'interval') frameCount = 0;
        try {
            var blob = new win.Blob([body], { type: 'application/json' });
            if (win.navigator.sendBeacon && win.navigator.sendBeacon('diag', blob)) return;
            win.fetch('diag', { method: 'POST', body: blob, headers: { 'Content-Type': 'application/json' }, keepalive: true })
                .catch(function () {});
        } catch (e) {
            // Diagnostics must never break the slideshow
        }
    }

    // Immediate on an error, but at most one per minGapMs; later errors ride the next send
    function scheduleErrorSend() {
        if (errorTimer) return;
        var wait = Math.max(0, lastErrorSend + minGapMs - Date.now());
        errorTimer = win.setTimeout(function () {
            errorTimer = 0;
            lastErrorSend = Date.now();
            send('error');
        }, wait);
    }

    function onError(e) {
        // Resource load errors (img/script) don't bubble and have no message; the watchdog handles images
        if (!e || !e.message) return;
        queue('error', e.message, e.filename, e.lineno, e.colno);
    }
    function onRejection(e) { queue('unhandledrejection', describe(e && e.reason)); }
    function onCsp(e) {
        queue('csp', e.violatedDirective + ' blocked ' + e.blockedURI, e.sourceFile, e.lineNumber, e.columnNumber);
    }

    win.addEventListener('error', onError);
    win.addEventListener('unhandledrejection', onRejection);
    doc.addEventListener('securitypolicyviolation', onCsp);
    win.console.error = function () {
        try {
            queue('console', Array.prototype.map.call(arguments, describe).join(' '));
        } catch (e) {
            // Never let reporting break the caller's console.error
        }
        return originalConsoleError.apply(this, arguments);
    };

    rafId = win.requestAnimationFrame(onFrame);
    var intervalId = win.setInterval(function () { send('interval'); }, intervalMs);

    return function stop() {
        win.removeEventListener('error', onError);
        win.removeEventListener('unhandledrejection', onRejection);
        doc.removeEventListener('securitypolicyviolation', onCsp);
        win.console.error = originalConsoleError;
        win.cancelAnimationFrame(rafId);
        win.clearInterval(intervalId);
        win.clearTimeout(errorTimer);
    };
}

if (typeof document !== 'undefined') {
    var flag = document.querySelector('meta[name="diagnostics"]');
    if (flag && flag.getAttribute('content') === 'on') {
        startDiagnostics(window, window.SlideshowConfig);
    }
}
