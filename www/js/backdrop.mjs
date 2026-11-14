/**
 * Blurred Backdrop Module
 *
 * Fills the margins around a contain-fit photo with a pre-blurred, darkened copy of the
 * same photo. The copy is rendered once into a tiny canvas (cheap) and the canvas element
 * itself is placed in a layer (object-fit: cover); only opacity animates, so there is no
 * runtime CSS blur or rAF loop. It is not exported as a data: URL because the CSP
 * (img-src 'self') blocks data: URLs in CSS backgrounds.
 * Every function takes cfg (window.SlideshowConfig in the browser). Do not import
 * constants from config.mjs here: the E2E config override patches window.SlideshowConfig.
 */

const DEFAULTS = {
    BACKDROP_ENABLED: true,
    BACKDROP_SIZE_PX: 64,
    BACKDROP_BLUR_PX: 4,
    BACKDROP_BRIGHTNESS: 0.55,
    BACKDROP_FADE_MS: 800
};

const FALLBACK_FILL = '#111';

function val(cfg, key) {
    const v = cfg ? cfg[key] : undefined;
    if (typeof DEFAULTS[key] === 'boolean') return typeof v === 'boolean' ? v : DEFAULTS[key];
    return typeof v === 'number' && !isNaN(v) ? v : DEFAULTS[key];
}

/**
 * Backdrop canvas size: long edge = BACKDROP_SIZE_PX, aspect ratio kept, integers >= 1.
 * @returns {{w: number, h: number}}
 */
export function backdropSize(naturalW, naturalH, cfg) {
    const size = val(cfg, 'BACKDROP_SIZE_PX');
    const long = Math.max(naturalW, naturalH);
    if (!(long > 0)) return { w: 1, h: 1 };
    const scale = size / long;
    return {
        w: Math.max(1, Math.round(naturalW * scale)),
        h: Math.max(1, Math.round(naturalH * scale))
    };
}

/** CSS/canvas filter string for the backdrop copy. */
export function backdropFilter(cfg) {
    return 'blur(' + val(cfg, 'BACKDROP_BLUR_PX') + 'px) brightness(' +
        val(cfg, 'BACKDROP_BRIGHTNESS') + ') saturate(1.2)';
}

/**
 * Downscale an already-loaded img element into a small canvas element.
 * @returns {HTMLCanvasElement|null} null on failure (caller falls back to a solid fill)
 */
export function makeBackdrop(img, cfg, doc) {
    try {
        doc = doc || document;
        const w0 = img.naturalWidth || img.width;
        const h0 = img.naturalHeight || img.height;
        const size = backdropSize(w0, h0, cfg);
        const canvas = doc.createElement('canvas');
        canvas.width = size.w;
        canvas.height = size.h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        if ('filter' in ctx) ctx.filter = backdropFilter(cfg);
        ctx.drawImage(img, 0, 0, size.w, size.h);
        return canvas;
    } catch (e) {
        return null;
    }
}

/**
 * Two crossfading layers (A/B) plus a fallback darkening overlay inside containerEl.
 * @param {HTMLElement} containerEl
 * @param {Object} cfg
 * @param {Document} [doc]
 */
export function createBackdropController(containerEl, cfg, doc) {
    doc = doc || containerEl.ownerDocument || document;
    const enabled = val(cfg, 'BACKDROP_ENABLED');
    const fadeMs = val(cfg, 'BACKDROP_FADE_MS');
    const brightness = val(cfg, 'BACKDROP_BRIGHTNESS');

    function makeLayer(cls) {
        const el = doc.createElement('div');
        el.className = 'backdrop_layer ' + cls;
        el.style.opacity = '0';
        el.style.transition = 'opacity ' + fadeMs + 'ms linear';
        containerEl.appendChild(el);
        return el;
    }

    const layers = [makeLayer('backdrop_a'), makeLayer('backdrop_b')];
    const overlay = doc.createElement('div');
    overlay.className = 'backdrop_overlay';
    overlay.style.opacity = '0';
    containerEl.appendChild(overlay);

    let active = -1;       // index of visible layer
    // Without ctx.filter, makeBackdrop draws unfiltered and the overlay does the darkening.
    let filterSupported = false;
    try {
        const probe = doc.createElement('canvas');
        const pctx = probe.getContext && probe.getContext('2d');
        filterSupported = !!pctx && 'filter' in pctx;
    } catch (e) { /* treat as unsupported */ }

    function emptyLayer(layer) {
        while (layer.firstChild) layer.removeChild(layer.firstChild);
    }

    // The cached canvas stays with the img_box; each layer gets its own copy so showing
    // the same box twice in a row never moves a canvas out of a still-fading layer.
    function setBackground(layer, source) {
        emptyLayer(layer);
        let shown = false;
        if (source) {
            try {
                const copy = doc.createElement('canvas');
                copy.width = source.width;
                copy.height = source.height;
                copy.getContext('2d').drawImage(source, 0, 0);
                layer.appendChild(copy);
                shown = true;
            } catch (e) { /* fall back to the solid fill */ }
        }
        layer.style.backgroundColor = shown ? '' : FALLBACK_FILL;
        return shown;
    }

    function getCanvas(imgBox) {
        let canvas = imgBox.data('backdrop-canvas');
        if (canvas) return canvas;
        const img = imgBox.find('img')[0];
        if (!img) return null;
        canvas = makeBackdrop(img, cfg, doc);
        if (canvas) imgBox.data('backdrop-canvas', canvas);
        return canvas;
    }

    return {
        /**
         * Crossfade to the backdrop for imgBox (jQuery). Resolves once the new layer is visible.
         * @returns {Promise<void>}
         */
        show: function (imgBox) {
            const canvas = enabled ? getCanvas(imgBox) : null;
            const next = active === 0 ? 1 : 0;
            const nextEl = layers[next];
            const shown = setBackground(nextEl, canvas);
            overlay.style.opacity = shown && !filterSupported ? String(1 - brightness) : '0';
            return new Promise(function (resolve) {
                nextEl.style.opacity = '1';
                if (active >= 0) layers[active].style.opacity = '0';
                active = next;
                setTimeout(resolve, fadeMs);
            });
        },

        /** Remove backgrounds and cached state (renderer teardown). */
        clear: function () {
            active = -1;
            layers.forEach(function (l) {
                l.style.opacity = '0';
                emptyLayer(l);
                l.style.backgroundColor = '';
            });
            overlay.style.opacity = '0';
        }
    };
}

if (typeof window !== 'undefined') {
    window.SlideshowBackdrop = {
        backdropSize: backdropSize,
        backdropFilter: backdropFilter,
        makeBackdrop: makeBackdrop,
        createBackdropController: createBackdropController
    };
}
