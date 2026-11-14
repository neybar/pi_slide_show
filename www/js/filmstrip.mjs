/**
 * Filmstrip Layout Module
 *
 * Pure geometry for the tiny-album layout: a hero photo plus a strip of the other photos.
 * No DOM. Every function takes cfg (window.SlideshowConfig in the browser) and falls back to
 * built-in defaults. Do not import constants from config.mjs here: the E2E config override
 * patches window.SlideshowConfig, which main.js passes in as cfg.
 *
 * All rects are { x, y, w, h } in integer px relative to the viewport's top-left.
 */

const DEFAULTS = {
    FILMSTRIP_HEIGHT_PCT: 20,
    FILMSTRIP_WIDTH_PCT: 16,
    FILMSTRIP_GAP_PX: 8,
    FILMSTRIP_MAX_CELL_ASPECT: 2.0
};

function val(cfg, key) {
    const v = cfg ? cfg[key] : undefined;
    return typeof v === 'number' && !isNaN(v) ? v : DEFAULTS[key];
}

function validAspect(a) {
    return typeof a === 'number' && isFinite(a) && a > 0 ? a : 1;
}

/**
 * @param {number} heroAspect - width / height of the hero photo
 * @returns {'right'|'below'} 'right' for portrait (aspect < 1.0), else 'below'
 */
export function stripPositionForHero(heroAspect) {
    return heroAspect < 1.0 ? 'right' : 'below';
}

function containFit(area, aspect) {
    const a = validAspect(aspect);
    const w = Math.round(Math.min(area.w, area.h * a));
    const h = Math.round(Math.min(area.h, area.w / a));
    return {
        x: area.x + Math.floor((area.w - w) / 2),
        y: area.y + Math.floor((area.h - h) / 2),
        w: w,
        h: h
    };
}

/**
 * Lay out the strip cells along one axis.
 * @param {number[]} factors - along-axis length per cell for a cross-axis size of 1
 *   (the capped aspect factor)
 * @param {number} crossSize - strip size across the strip (px)
 * @param {number} alongSize - strip size along the strip (px)
 * @param {number} gap
 * @returns {{cross: number, spans: Array<{start: number, len: number}>}}
 *   cross = scaled cross-axis size of every cell; spans are relative to the strip start
 */
function layoutAlong(factors, crossSize, alongSize, gap) {
    const n = factors.length;
    const gaps = gap * (n - 1);
    const sum = factors.reduce((s, f) => s + f, 0);
    let cross = crossSize;
    if (sum * cross + gaps > alongSize) {
        // Scale every cell by the same factor; floor so rounding can't overflow the strip.
        cross = Math.max(0, Math.floor(((alongSize - gaps) / sum)));
    }
    const total = sum * cross + gaps;
    let pos = (alongSize - total) / 2;
    const spans = factors.map((f) => {
        const start = Math.round(pos);
        const end = Math.round(pos + f * cross);
        pos += f * cross + gap;
        return { start: start, len: end - start };
    });
    return { cross: cross, spans: spans };
}

/**
 * @param {Object} opts
 * @param {number} opts.viewportW
 * @param {number} opts.viewportH
 * @param {number} opts.heroAspect
 * @param {number[]} opts.stripAspects - aspect (w/h) of each strip photo, in display order
 * @param {'below'|'right'} [opts.position] - defaults to stripPositionForHero(heroAspect)
 * @param {Object} [opts.cfg]
 * @returns {{heroArea: Object, hero: Object, strip: Object, cells: Object[]}}
 */
export function computeFilmstripLayout(opts) {
    const vw = Math.round(opts.viewportW);
    const vh = Math.round(opts.viewportH);
    const aspects = (opts.stripAspects || []).map(validAspect);
    const cfg = opts.cfg;
    const position = opts.position || stripPositionForHero(opts.heroAspect);
    const gap = Math.max(0, Math.round(val(cfg, 'FILMSTRIP_GAP_PX')));
    const cap = val(cfg, 'FILMSTRIP_MAX_CELL_ASPECT');
    const below = position !== 'right';

    let strip;
    let heroArea;
    if (aspects.length === 0) {
        strip = below ? { x: 0, y: vh, w: vw, h: 0 } : { x: vw, y: 0, w: 0, h: vh };
        heroArea = { x: 0, y: 0, w: vw, h: vh };
    } else if (below) {
        const sh = Math.round(vh * val(cfg, 'FILMSTRIP_HEIGHT_PCT') / 100);
        strip = { x: 0, y: vh - sh, w: vw, h: sh };
        heroArea = { x: 0, y: 0, w: vw, h: Math.max(0, vh - sh - gap) };
    } else {
        const sw = Math.round(vw * val(cfg, 'FILMSTRIP_WIDTH_PCT') / 100);
        strip = { x: vw - sw, y: 0, w: sw, h: vh };
        heroArea = { x: 0, y: 0, w: Math.max(0, vw - sw - gap), h: vh };
    }

    let cells = [];
    if (aspects.length > 0) {
        if (below) {
            // Cell width = h * min(aspect, cap)
            const factors = aspects.map((a) => Math.min(a, cap));
            const lay = layoutAlong(factors, strip.h, strip.w, gap);
            const y = strip.y + Math.floor((strip.h - lay.cross) / 2);
            cells = lay.spans.map((s) => ({ x: strip.x + s.start, y: y, w: s.len, h: lay.cross }));
        } else {
            // Cell height = w * min(1 / aspect, cap)
            const factors = aspects.map((a) => Math.min(1 / a, cap));
            const lay = layoutAlong(factors, strip.w, strip.h, gap);
            const x = strip.x + Math.floor((strip.w - lay.cross) / 2);
            cells = lay.spans.map((s) => ({ x: x, y: strip.y + s.start, w: lay.cross, h: s.len }));
        }
    }

    return {
        heroArea: heroArea,
        hero: containFit(heroArea, opts.heroAspect),
        strip: strip,
        cells: cells
    };
}

if (typeof window !== 'undefined') {
    window.SlideshowFilmstrip = {
        stripPositionForHero: stripPositionForHero,
        computeFilmstripLayout: computeFilmstripLayout
    };
}
