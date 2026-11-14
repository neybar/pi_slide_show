/**
 * Album Display Mode Module
 *
 * Pure functions that classify an album by photo count and decide how long it plays.
 * Every function takes cfg (window.SlideshowConfig in the browser) and falls back to
 * built-in defaults. Do not import constants from config.mjs here: the E2E config
 * override patches window.SlideshowConfig, which main.js passes in as cfg.
 */

import { clampPrefetchLeadTime } from './prefetch.mjs';

const DEFAULTS = {
    SWAP_INTERVAL: 10 * 1000,
    PREFETCH_LEAD_TIME: 60000,
    ALBUM_DURATION_MS: 15 * 60 * 1000,
    SINGLE_PHOTO_DURATION_MS: 90 * 1000,
    TINY_ALBUM_MAX: 10,
    TINY_MIN_DURATION_MS: 2 * 60 * 1000,
    TINY_HERO_LAPS: 1,
    PANORAMA_ASPECT_THRESHOLD: 2.0,
    SINGLE_PANORAMA_MAX_PAN_PX_PER_SEC: 40,
    MIN_PHOTOS_FOR_TRANSITION: 15
};

function val(cfg, key) {
    const v = cfg ? cfg[key] : undefined;
    return typeof v === 'number' && !isNaN(v) ? v : DEFAULTS[key];
}

/**
 * @param {number} count - Photo count
 * @param {Object} [cfg]
 * @returns {'single'|'tiny'|'grid'|null} null when count < 1
 */
export function getAlbumMode(count, cfg) {
    if (!(count >= 1)) return null;
    if (count === 1) return 'single';
    return count <= val(cfg, 'TINY_ALBUM_MAX') ? 'tiny' : 'grid';
}

/**
 * Pick the mode from the server's count and the number of photos actually loaded.
 * A big album stays grid even if only its first batch (or fewer) loaded.
 */
export function resolveAlbumMode(serverCount, loadedCount, cfg) {
    if (getAlbumMode(serverCount, cfg) === 'grid') return 'grid';
    return getAlbumMode(loadedCount, cfg);
}

/**
 * Quality to load an album at, from the server's count (known before any image loads).
 * Single and tiny albums skip the progressive M stage: a fullscreen M thumbnail is mushy.
 * @param {number} serverCount
 * @param {Object} [cfg]
 * @returns {string} cfg.FINAL_QUALITY for single/tiny, else cfg.INITIAL_QUALITY
 */
export function qualityForAlbum(serverCount, cfg) {
    const mode = getAlbumMode(serverCount, cfg);
    const initial = (cfg && cfg.INITIAL_QUALITY) || 'M';
    const final = (cfg && cfg.FINAL_QUALITY) || 'XL';
    return mode === 'single' || mode === 'tiny' ? final : initial;
}

/**
 * Horizontal pan for an image wider than its container (shared by the grid and the
 * single-photo hero).
 * @param {number} imgW - Displayed image width (px)
 * @param {number} containerW - Visible width (px)
 * @param {number} speedPxPerSec
 * @returns {{distance: number, duration: number}|null} distance is negative (pan left,
 *     px); duration is seconds per direction; null when the image fits (or speed <= 0)
 */
export function panPlan(imgW, containerW, speedPxPerSec) {
    if (!(imgW > containerW) || !(speedPxPerSec > 0)) return null;
    const overflow = imgW - containerW;
    return { distance: -overflow, duration: overflow / speedPxPerSec };
}

/**
 * Pan plan for a single-photo panorama shown height-bound. One sweep (one direction)
 * takes half the album's play time, but never faster than
 * SINGLE_PANORAMA_MAX_PAN_PX_PER_SEC. When the cap leaves the sweep longer than that,
 * the play time stretches to one round trip, up to ALBUM_DURATION_MS.
 * @param {number} aspect - Photo aspect ratio (w / h)
 * @param {number} viewportW - Hero area width (px)
 * @param {number} viewportH - Hero area height (px)
 * @param {Object} [cfg]
 * @returns {{distance: number, duration: number, playMs: number}|null} null when the
 *     photo is not a panorama or fits the width (it stays contain-fit)
 */
export function singlePanoramaPlan(aspect, viewportW, viewportH, cfg) {
    if (!(aspect > val(cfg, 'PANORAMA_ASPECT_THRESHOLD'))) return null;
    const imgW = viewportH * aspect;
    if (!(imgW > viewportW)) return null;
    const baseMs = val(cfg, 'SINGLE_PHOTO_DURATION_MS');
    const wanted = (imgW - viewportW) / (baseMs / 2000);
    const speed = Math.min(wanted, val(cfg, 'SINGLE_PANORAMA_MAX_PAN_PX_PER_SEC'));
    const plan = panPlan(imgW, viewportW, speed);
    if (!plan) return null;
    const roundTripMs = plan.duration * 2000;
    plan.playMs = Math.min(Math.max(baseMs, roundTripMs), val(cfg, 'ALBUM_DURATION_MS'));
    return plan;
}

/**
 * @param {'single'|'tiny'|'grid'} mode
 * @param {number} count
 * @param {Object} [cfg]
 * @param {{aspect: number, viewportW: number, viewportH: number}} [hero] - Single mode:
 *     the photo and hero area, so a panning panorama gets time for a full round trip
 * @returns {number} Play time in ms
 */
export function getAlbumDuration(mode, count, cfg, hero) {
    const albumMs = val(cfg, 'ALBUM_DURATION_MS');
    if (mode === 'single') {
        const plan = hero && singlePanoramaPlan(hero.aspect, hero.viewportW, hero.viewportH, cfg);
        return plan ? plan.playMs : val(cfg, 'SINGLE_PHOTO_DURATION_MS');
    }
    if (mode === 'tiny') {
        const laps = count * val(cfg, 'SWAP_INTERVAL') * val(cfg, 'TINY_HERO_LAPS');
        return Math.min(Math.max(val(cfg, 'TINY_MIN_DURATION_MS'), laps), albumMs);
    }
    return albumMs;
}

/**
 * Photos the next album must have loaded for a seamless transition into it;
 * fewer and the transition falls back to a reload. Single and tiny albums need 1.
 * A grid album needs MIN_PHOTOS_FOR_TRANSITION, or all of its photos when it has
 * fewer (so an 11-14 photo album transitions once every photo loaded).
 * @param {'single'|'tiny'|'grid'} mode - The next album's resolved mode
 * @param {number} serverCount - The next album's photo count from /album
 * @param {Object} [cfg]
 * @returns {number}
 */
export function minPhotosForMode(mode, serverCount, cfg) {
    if (mode === 'single' || mode === 'tiny') return 1;
    const min = val(cfg, 'MIN_PHOTOS_FOR_TRANSITION');
    return serverCount >= 1 ? Math.min(min, serverCount) : min;
}

/**
 * Prefetch lead time clamped to this album's duration.
 */
export function getPrefetchLeadTime(duration, cfg) {
    return clampPrefetchLeadTime(val(cfg, 'PREFETCH_LEAD_TIME'), duration, val(cfg, 'SWAP_INTERVAL'));
}

const ALBUM_PATH_RE = /(\d\d\d\d)\/(.*?)\//;

/**
 * Album name shown on screen, from one of the album's photo paths
 * (e.g. 'photos/2019/July - Hawaii/IMG_1.jpg' -> '2019 July - Hawaii').
 * Render it with .text(), never .html().
 * @param {string} [file]
 * @returns {string} 'YYYY Album', or '' when the path has no year folder
 */
export function albumNameFromPath(file) {
    if (typeof file !== 'string') return '';
    const m = ALBUM_PATH_RE.exec(file);
    return m && m[2] ? m[1] + ' ' + m[2] : '';
}

if (typeof window !== 'undefined') {
    window.SlideshowAlbumMode = {
        getAlbumMode: getAlbumMode,
        resolveAlbumMode: resolveAlbumMode,
        qualityForAlbum: qualityForAlbum,
        getAlbumDuration: getAlbumDuration,
        panPlan: panPlan,
        singlePanoramaPlan: singlePanoramaPlan,
        getPrefetchLeadTime: getPrefetchLeadTime,
        minPhotosForMode: minPhotosForMode,
        albumNameFromPath: albumNameFromPath
    };
}
