/**
 * Watchdog helpers
 *
 * Pure checks shared by the grid watchdog and the hero watchdog (single and tiny albums)
 * in main.js. No DOM access beyond reading the img object passed in. Every function that
 * needs config takes cfg (window.SlideshowConfig in the browser) and falls back to
 * built-in defaults; do not import config.mjs here (the E2E config override patches
 * window.SlideshowConfig, which main.js passes in).
 */

const DEFAULTS = {
    FILL_STAGGER_DELAY: 100,
    SLIDE_IN_ANIMATION_DURATION: 800,
    WATCHDOG_STUCK_GRACE_PERIOD_MS: 1000,
    WATCHDOG_LOAD_ERROR_DELAY_MS: 500
};

// Most fill photos one grid swap can stagger in
const MAX_FILL_PHOTOS = 5;

function val(cfg, key) {
    const v = cfg ? cfg[key] : undefined;
    return typeof v === 'number' && !isNaN(v) ? v : DEFAULTS[key];
}

/**
 * How long a cell may stay empty, broken or invisible before the watchdog acts: the
 * longest swap animation plus WATCHDOG_STUCK_GRACE_PERIOD_MS.
 * @param {Object} [cfg]
 * @returns {number} ms
 */
export function stuckThresholdMs(cfg) {
    const maxAnimationTime = (MAX_FILL_PHOTOS - 1) * val(cfg, 'FILL_STAGGER_DELAY') +
        val(cfg, 'SLIDE_IN_ANIMATION_DURATION');
    return maxAnimationTime + val(cfg, 'WATCHDOG_STUCK_GRACE_PERIOD_MS');
}

/**
 * True when an img shows nothing: missing, no src, or not decoded (naturalWidth 0, which
 * covers a failed load and one still in flight; the caller's time threshold tells them apart).
 * @param {{getAttribute: Function, naturalWidth: number}|null|undefined} img
 * @returns {boolean}
 */
export function imgLooksBroken(img) {
    if (!img) return true;
    const src = img.getAttribute('src');
    return !src || !img.naturalWidth;
}

/**
 * @param {string} opacity - computed opacity
 * @param {string} visibility - computed visibility
 * @returns {boolean} true if the element can't be seen
 */
export function isInvisible(opacity, visibility) {
    if (visibility === 'hidden') return true;
    return opacity ? parseFloat(opacity) < 0.01 : false;
}

/**
 * Track since when a condition has held.
 * @param {number|null|undefined} since - previous value
 * @param {boolean} active - whether the condition holds now
 * @param {number} now
 * @returns {number|null} the start time, or null when the condition doesn't hold
 */
export function updateSince(since, active, now) {
    if (!active) return null;
    return since || now;
}

/**
 * Whether a hero or filmstrip photo needs recovery: its load failed more than
 * WATCHDOG_LOAD_ERROR_DELAY_MS ago, or it has looked broken for more than
 * stuckThresholdMs(cfg).
 * @param {number|null|undefined} failedAt - time of the img error event
 * @param {number|null|undefined} brokenSince - from updateSince(..., imgLooksBroken(img), ...)
 * @param {number} now
 * @param {Object} [cfg]
 * @returns {boolean}
 */
export function photoNeedsRecovery(failedAt, brokenSince, now, cfg) {
    if (failedAt && now - failedAt > val(cfg, 'WATCHDOG_LOAD_ERROR_DELAY_MS')) return true;
    return !!brokenSince && now - brokenSince > stuckThresholdMs(cfg);
}

if (typeof window !== 'undefined') {
    window.SlideshowWatchdog = {
        stuckThresholdMs: stuckThresholdMs,
        imgLooksBroken: imgLooksBroken,
        isInvisible: isInvisible,
        updateSince: updateSince,
        photoNeedsRecovery: photoNeedsRecovery
    };
}
