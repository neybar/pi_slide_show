/**
 * Safe page reload for the kiosk.
 *
 * The display has no keyboard. A reload that lands while the server is down (a deploy
 * restart, a NAS reboot) leaves Chrome on its network error page, which has no refresh,
 * so the display stays stuck. safeReload() probes the server first and reloads only on
 * a 2xx. Otherwise the current page keeps running and the probe retries with backoff.
 *
 * Pure logic with injected probe/reload/timer so it is unit-testable.
 */

/**
 * Delay before retry number `attempt` (0-based): base, doubling, capped at max.
 * @param {number} attempt
 * @param {number} baseMs
 * @param {number} maxMs
 * @returns {number} delay (ms)
 */
export function reloadBackoffDelay(attempt, baseMs, maxMs) {
    return Math.min(maxMs, baseMs * Math.pow(2, attempt));
}

/**
 * Probe the server with a cheap same-origin HEAD request. Resolves true only for 2xx.
 * Never rejects: a network error, a timeout and a 5xx all resolve false.
 * @param {number} timeoutMs - Abort the request after this long
 * @returns {Promise<boolean>}
 */
export function probeServer(timeoutMs) {
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = controller ? setTimeout(function() { controller.abort(); }, timeoutMs) : null;
    var options = { method: 'HEAD', cache: 'no-store' };
    if (controller) options.signal = controller.signal;
    return fetch(location.pathname, options).then(function(response) {
        clearTimeout(timer);
        return response.ok;
    }, function() {
        clearTimeout(timer);
        return false;
    });
}

/**
 * Build a safeReload function. At most one request is pending at a time: calls while
 * one is waiting are ignored.
 * @param {Object} deps
 * @param {Function} deps.probe - () => Promise<boolean>, true when the server answers 2xx
 * @param {Function} deps.reload - Performs the reload (called once, only after a good probe)
 * @param {number} deps.baseMs - First retry delay
 * @param {number} deps.maxMs - Retry delay cap
 * @param {Function} [deps.onDeferred] - ({reason, attempt, nextDelayMs}) after a failed probe
 * @param {Function} [deps.setTimer] - setTimeout replacement (tests)
 * @param {Function} [deps.clearTimer] - clearTimeout replacement (tests)
 * @returns {{request: Function, cancel: Function, isPending: Function}}
 */
export function createSafeReload(deps) {
    var setTimer = deps.setTimer || setTimeout;
    var clearTimer = deps.clearTimer || clearTimeout;
    var pending = false;
    var generation = 0;
    var timerId = null;

    function attempt(reason, n, gen) {
        deps.probe().then(function(ok) {
            if (gen !== generation) return;   // cancelled while probing
            if (ok) {
                pending = false;
                deps.reload();
                return;
            }
            var delay = reloadBackoffDelay(n, deps.baseMs, deps.maxMs);
            if (deps.onDeferred) deps.onDeferred({ reason: reason, attempt: n + 1, nextDelayMs: delay });
            timerId = setTimer(function() {
                timerId = null;
                attempt(reason, n + 1, gen);
            }, delay);
        });
    }

    return {
        request: function(reason) {
            if (pending) return false;
            pending = true;
            attempt(reason, 0, generation);
            return true;
        },
        // Drop a waiting request (e.g. a seamless transition succeeded after all)
        cancel: function() {
            generation++;
            pending = false;
            if (timerId !== null) { clearTimer(timerId); timerId = null; }
        },
        isPending: function() { return pending; }
    };
}

// Browser global exports for non-module scripts (main.js)
if (typeof window !== 'undefined') {
    window.SlideshowSafeReload = {
        reloadBackoffDelay: reloadBackoffDelay,
        probeServer: probeServer,
        createSafeReload: createSafeReload
    };
}
