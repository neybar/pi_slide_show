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
    FILMSTRIP_MAX_CELL_ASPECT: 2.0,
    TINY_PAIR_PORTRAITS: true,
    TINY_PAIR_MIN_SCALE: 0.9
};

function val(cfg, key) {
    const v = cfg ? cfg[key] : undefined;
    return typeof v === 'number' && !isNaN(v) ? v : DEFAULTS[key];
}

function pairingEnabled(cfg) {
    return cfg && typeof cfg.TINY_PAIR_PORTRAITS === 'boolean' ? cfg.TINY_PAIR_PORTRAITS : true;
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
 * Area that the hero(es) are centred in, for a given strip position and cell count.
 */
function heroAreaFor(vw, vh, below, hasCells, cfg) {
    const gap = Math.max(0, Math.round(val(cfg, 'FILMSTRIP_GAP_PX')));
    if (!hasCells) return { x: 0, y: 0, w: vw, h: vh };
    if (below) {
        const sh = Math.round(vh * val(cfg, 'FILMSTRIP_HEIGHT_PCT') / 100);
        return { x: 0, y: 0, w: vw, h: Math.max(0, vh - sh - gap) };
    }
    const sw = Math.round(vw * val(cfg, 'FILMSTRIP_WIDTH_PCT') / 100);
    return { x: 0, y: 0, w: Math.max(0, vw - sw - gap), h: vh };
}

/** Height of two heroes side by side that fit area (aspects a0, a1, one gap between them). */
function pairHeight(area, a0, a1, gap) {
    let h = Math.floor(Math.min(area.h, (area.w - gap) / (a0 + a1)));
    // Rounded widths can exceed the area by a pixel; shrink until the group fits.
    while (h > 0 && Math.round(a0 * h) + gap + Math.round(a1 * h) > area.w) h--;
    return Math.max(0, h);
}

/**
 * How many heroes to show: 2 (two portraits side by side) or 1.
 * Two only when pairing is enabled, the first two photos of the conveyor are both portraits
 * (aspect < 1), and the pair fits: each keeps at least TINY_PAIR_MIN_SCALE of the height it
 * would have as a single hero. The pair's area is the 'right' layout's hero area, or the whole
 * viewport when the conveyor has only these two photos (no strip).
 * @param {Object} opts
 * @param {number} opts.viewportW
 * @param {number} opts.viewportH
 * @param {number[]} opts.aspects - aspect (w/h) of the whole conveyor, hero first
 * @param {Object} [opts.cfg]
 * @returns {1|2}
 */
export function heroCountFor(opts) {
    const cfg = opts.cfg;
    const aspects = opts.aspects || [];
    if (!pairingEnabled(cfg) || aspects.length < 2) return 1;
    if (!(aspects[0] < 1.0) || !(aspects[1] < 1.0)) return 1;
    const a0 = validAspect(aspects[0]);
    const a1 = validAspect(aspects[1]);
    const vw = Math.round(opts.viewportW);
    const vh = Math.round(opts.viewportH);
    const gap = Math.max(0, Math.round(val(cfg, 'FILMSTRIP_GAP_PX')));
    const area = heroAreaFor(vw, vh, false, aspects.length > 2, cfg);
    const pairH = pairHeight(area, a0, a1, gap);
    const minScale = val(cfg, 'TINY_PAIR_MIN_SCALE');
    return pairH >= minScale * containFit(area, a0).h && pairH >= minScale * containFit(area, a1).h
        ? 2 : 1;
}

/**
 * @param {Object} opts
 * @param {number} opts.viewportW
 * @param {number} opts.viewportH
 * @param {number} [opts.heroAspect] - width / height of a single hero (same as heroAspects: [a])
 * @param {number[]} [opts.heroAspects] - aspects of the 1 or 2 heroes, left to right. Two heroes
 *   are laid out side by side at one height, with the strip on the right.
 * @param {number[]} opts.stripAspects - aspect (w/h) of each strip photo, in display order
 * @param {'below'|'right'} [opts.position] - defaults to stripPositionForHero(first hero aspect)
 * @param {Object} [opts.cfg]
 * @returns {{heroArea: Object, hero: Object, heroes: Object[], strip: Object, cells: Object[]}}
 *   hero is heroes[0]
 */
export function computeFilmstripLayout(opts) {
    const vw = Math.round(opts.viewportW);
    const vh = Math.round(opts.viewportH);
    const aspects = (opts.stripAspects || []).map(validAspect);
    const cfg = opts.cfg;
    const heroAspects = (opts.heroAspects && opts.heroAspects.length > 0
        ? opts.heroAspects.slice(0, 2) : [opts.heroAspect]).map(validAspect);
    const paired = heroAspects.length === 2;
    const position = opts.position || (paired ? 'right' : stripPositionForHero(opts.heroAspect === undefined
        ? heroAspects[0] : opts.heroAspect));
    const gap = Math.max(0, Math.round(val(cfg, 'FILMSTRIP_GAP_PX')));
    const cap = val(cfg, 'FILMSTRIP_MAX_CELL_ASPECT');
    const below = position !== 'right';

    let strip;
    if (aspects.length === 0) {
        strip = below ? { x: 0, y: vh, w: vw, h: 0 } : { x: vw, y: 0, w: 0, h: vh };
    } else if (below) {
        const sh = Math.round(vh * val(cfg, 'FILMSTRIP_HEIGHT_PCT') / 100);
        strip = { x: 0, y: vh - sh, w: vw, h: sh };
    } else {
        const sw = Math.round(vw * val(cfg, 'FILMSTRIP_WIDTH_PCT') / 100);
        strip = { x: vw - sw, y: 0, w: sw, h: vh };
    }
    const heroArea = heroAreaFor(vw, vh, below, aspects.length > 0, cfg);

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

    let heroes;
    if (paired) {
        const h = pairHeight(heroArea, heroAspects[0], heroAspects[1], gap);
        const w0 = Math.round(heroAspects[0] * h);
        const w1 = Math.round(heroAspects[1] * h);
        const x0 = heroArea.x + Math.floor((heroArea.w - (w0 + gap + w1)) / 2);
        const y = heroArea.y + Math.floor((heroArea.h - h) / 2);
        heroes = [{ x: x0, y: y, w: w0, h: h }, { x: x0 + w0 + gap, y: y, w: w1, h: h }];
    } else {
        heroes = [containFit(heroArea, heroAspects[0])];
    }

    return {
        heroArea: heroArea,
        hero: heroes[0],
        heroes: heroes,
        strip: strip,
        cells: cells
    };
}

/**
 * One rotation of the tiny-album conveyor: the next hero is strip[0], the old hero joins the
 * end of the strip and the rest shift one cell toward the start (rotate left by one). Every
 * photo is hero exactly once per lap of order.length rotations. With step 2 (a pair of heroes)
 * the pair leaves together and the next two photos become the heroes.
 * @param {Array} order - hero first, then the strip in display order (not mutated)
 * @param {number} [step=1] - heroes shown; clamped to 1..order.length
 * @returns {Array} a new array; unchanged when order.length <= step (a static pair)
 */
export function nextOrder(order, step) {
    if (!order) return [];
    const n = order.length;
    const k = Math.max(1, Math.min(n, Math.floor(step) || 1));
    if (n < 2 || n <= k) return order.slice();
    return order.slice(k).concat(order.slice(0, k));
}

/**
 * Reorder a tiny album so portraits (aspect < 1) come in adjacent pairs, with one landscape
 * between pairs while landscapes last. Extra landscapes go at the end; a lone leftover portrait
 * goes right after the last pair. The relative order inside each class is kept. With fewer than
 * 2 portraits this is the identity. Caveat: an all-portrait album with an odd count has no
 * landscape to separate the lone portrait from the first pair, so greedy pairing at that point
 * repeats a photo as a hero within a lap.
 * @param {number[]} aspects - aspect (w/h) per photo
 * @returns {number[]} a permutation of indices 0..aspects.length-1
 */
export function groupPortraits(aspects) {
    const list = aspects || [];
    const portraits = [];
    const landscapes = [];
    list.forEach((a, i) => (a < 1.0 ? portraits : landscapes).push(i));
    if (portraits.length < 2) return list.map((_, i) => i);
    const out = [];
    let l = 0;
    const pairs = Math.floor(portraits.length / 2);
    for (let p = 0; p < pairs; p++) {
        out.push(portraits[2 * p], portraits[2 * p + 1]);
        if (p < pairs - 1 && l < landscapes.length) out.push(landscapes[l++]);
    }
    if (portraits.length % 2 === 1) out.push(portraits[portraits.length - 1]);
    while (l < landscapes.length) out.push(landscapes[l++]);
    return out;
}

if (typeof window !== 'undefined') {
    window.SlideshowFilmstrip = {
        stripPositionForHero: stripPositionForHero,
        computeFilmstripLayout: computeFilmstripLayout,
        nextOrder: nextOrder,
        heroCountFor: heroCountFor,
        groupPortraits: groupPortraits
    };
}
