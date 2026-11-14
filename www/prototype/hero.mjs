/**
 * THROWAWAY review prototype (pi_slide_show-249.15): single hero and hero + filmstrip.
 * Not part of the app and not covered by tests. Imports the real modules:
 *   backdrop.mjs (createBackdropController, makeBackdrop), filmstrip.mjs
 *   (computeFilmstripLayout, stripPositionForHero), utils.mjs (buildThumbnailPath).
 *
 * Params: n (1..10, default 4), shapes=portrait,landscape,panorama,square,mixed, swap (ms, 10000),
 * relocate=flip|fade, blur, brightness, size, strip, col, gap, frame=on|off, original=1 (n=1),
 * hud=1, name=0, auto=1 (kiosk script), dwell (ms per auto scenario, default 60000).
 *
 * The backdrop controller is used as-is (canvas layers, no data: URLs, so CSP is fine).
 */
import * as config from '../js/config.mjs';
import { createBackdropController, makeBackdrop } from '../js/backdrop.mjs';
import { computeFilmstripLayout, stripPositionForHero } from '../js/filmstrip.mjs';
import { buildThumbnailPath } from '../js/utils.mjs';

// nextOrder is specified in 249.7 (filmstrip.mjs) but not landed yet: rotate left by one.
const nextOrder = (order) => order.slice(1).concat(order[0]);

const Q = new URLSearchParams(location.search);
const num = (k, d) => (Q.has(k) && Q.get(k) !== '' && !isNaN(Number(Q.get(k))) ? Number(Q.get(k)) : d);
const AUTO = Q.get('auto') === '1';
const DWELL = num('dwell', 60000);
const HUD_ON = AUTO || Q.get('hud') === '1';

const cfg = Object.assign({}, config, {
    BACKDROP_BLUR_PX: num('blur', config.BACKDROP_BLUR_PX),
    BACKDROP_BRIGHTNESS: num('brightness', config.BACKDROP_BRIGHTNESS),
    BACKDROP_SIZE_PX: num('size', config.BACKDROP_SIZE_PX),
    FILMSTRIP_HEIGHT_PCT: num('strip', config.FILMSTRIP_HEIGHT_PCT),
    FILMSTRIP_WIDTH_PCT: num('col', config.FILMSTRIP_WIDTH_PCT),
    FILMSTRIP_GAP_PX: num('gap', config.FILMSTRIP_GAP_PX)
});
const FRAME = Q.get('frame') !== 'off';
const SHOW_NAME = Q.get('name') !== '0';
const DUR = config.SLIDE_IN_ANIMATION_DURATION;
const STAGGER = config.FILL_STAGGER_DELAY;
const FADE_OUT_MS = 250;
const FADE_IN_MS = 400;

const $stage = document.getElementById('stage');
const $label = document.getElementById('label');
const $hud = document.getElementById('hud');
// Report the browser version to the server log (a 404 the reviewer can grep for).
try { fetch('/prototype/ua-report?' + encodeURIComponent(navigator.userAgent)).catch(function () {}); } catch (e) { /* ignore */ }
if (AUTO) document.body.classList.add('auto');

// ---------- helpers ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const heapMB = () => (performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null);

function stats(deltas) {
    if (!deltas.length) return { frames: 0, longest: 0, p95: 0 };
    const s = deltas.slice().sort((a, b) => a - b);
    return {
        frames: s.length,
        longest: s[s.length - 1],
        p95: s[Math.max(0, Math.ceil(s.length * 0.95) - 1)]
    };
}

function shapeOf(aspect) {
    if (aspect >= 2.0) return 'panorama';
    if (aspect >= 1.05) return 'landscape';
    if (aspect >= 0.95) return 'square';
    return 'portrait';
}

function loadImg(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('load failed'));
        img.src = src;
    });
}

// ---------- photo acquisition ----------

const usedFiles = new Set();

async function fetchAlbum() {
    for (let i = 0; i < 20; i++) {
        try {
            const r = await fetch('/album/35');
            const j = await r.json();
            if (j.images && j.images.length) return j.images.map((x) => x.file);
        } catch (e) { /* retry */ }
        await sleep(500);
    }
    return [];
}

/** Probe aspect cheaply with the M thumbnail (falls back to the original). */
async function probe(file) {
    try {
        const img = await withTimeout(loadImg('/' + buildThumbnailPath(file, 'M')), 15000);
        return { aspect: img.naturalWidth / img.naturalHeight, thumb: true };
    } catch (e) {
        try {
            const img = await withTimeout(loadImg('/' + file), 20000);
            return { aspect: img.naturalWidth / img.naturalHeight, thumb: false };
        } catch (e2) { return null; }
    }
}

async function loadFull(file) {
    let img;
    let xlIsOriginal = false;
    try {
        img = await withTimeout(loadImg('/' + buildThumbnailPath(file, 'XL')), 30000);
    } catch (e) {
        img = await withTimeout(loadImg('/' + file), 30000);
        xlIsOriginal = true; // no Synology thumbnail: the "XL" is already the original file
    }
    return {
        file: file,
        origPath: '/' + file,
        xlIsOriginal: xlIsOriginal,
        img: img,
        aspect: img.naturalWidth / img.naturalHeight,
        store: {},
        data: function (k, v) { if (v === undefined) return this.store[k]; this.store[k] = v; return this; },
        find: function () { return [img]; }
    };
}

/**
 * Pick n photos. shapes: list of 'portrait'|'landscape'|'panorama'|'square' (keep only those) or
 * ['mixed'] (guarantee at least one portrait and one landscape when n >= 2).
 */
async function acquire(n, shapes, needThumb) {
    const mixed = shapes.includes('mixed');
    const want = shapes.filter((s) => s !== 'mixed');
    const chosen = [];
    const picked = [];
    const needs = () => {
        if (!mixed || n < 2) return [];
        const have = picked.map(shapeOf);
        return ['portrait', 'landscape'].filter((s) => !have.includes(s));
    };
    const deadline = Date.now() + 90000;
    for (let album = 0; album < 60 && chosen.length < n && Date.now() < deadline; album++) {
        const files = (await fetchAlbum()).filter((f) => !usedFiles.has(f));
        for (let i = 0; i < files.length && chosen.length < n; i += 8) {
            const batch = files.slice(i, i + 8);
            const aspects = await Promise.all(batch.map(probe)); // parallel: a NAS round trip each
            for (let j = 0; j < batch.length && chosen.length < n; j++) {
                const pr = aspects[j];
                if (pr === null || (needThumb && !pr.thumb)) continue;
                const sh = shapeOf(pr.aspect);
                if (want.length && !want.includes(sh)) continue;
                const missing = needs();
                if (missing.length >= n - chosen.length && !missing.includes(sh)) continue;
                try {
                    const p = await loadFull(batch[j]);
                    if (needThumb && p.xlIsOriginal) continue;
                    usedFiles.add(batch[j]);
                    chosen.push(p);
                    picked.push(p.aspect);
                } catch (e) { /* skip */ }
            }
        }
    }
    return chosen;
}

// ---------- metrics / HUD ----------

let hudState = null; // { sc, last }

function renderHud() {
    if (!HUD_ON || !hudState) { $hud.hidden = true; return; }
    const { sc, last } = hudState;
    const p = sc.params;
    const h = heapMB();
    const all = stats(sc.deltas);
    const lines = [
        'n=' + p.n + (p.shapes.length ? ' ' + p.shapes.join(',') : '') + (p.n > 1 ? ' relocate=' + p.relocate + ' swap=' + p.swap : '') +
            (p.original ? ' original=1' : ''),
        'blur ' + cfg.BACKDROP_BLUR_PX + ' bright ' + cfg.BACKDROP_BRIGHTNESS + ' size ' + cfg.BACKDROP_SIZE_PX +
            ' strip ' + cfg.FILMSTRIP_HEIGHT_PCT + '% col ' + cfg.FILMSTRIP_WIDTH_PCT + '% gap ' + cfg.FILMSTRIP_GAP_PX + ' frame ' + (FRAME ? 'on' : 'off'),
        'makeBackdrop ms: last ' + (sc.bdLast == null ? '-' : sc.bdLast.toFixed(1)) + '  max ' + (sc.bdMax == null ? '-' : sc.bdMax.toFixed(1)),
        'last ' + (last ? last.label : '-') + ': frames ' + (last ? last.frames : '-') + '  longest ' + (last ? last.longest.toFixed(1) : '-') +
            ' ms  p95 ' + (last ? last.p95.toFixed(1) : '-') + ' ms',
        'scenario: frames ' + all.frames + '  longest ' + all.longest.toFixed(1) + ' ms  p95 ' + all.p95.toFixed(1) + ' ms',
        'JS heap only: ' + (h == null ? 'n/a' : h.toFixed(0) + ' MB') + ' (decoded images not included)'
    ];
    if (sc.orig) lines.push('original: ' + sc.orig);
    if (sc.note) lines.push(sc.note);
    const cv = /Chrom(?:e|ium)\/([\d.]+)/.exec(navigator.userAgent);
    lines.push('browser: ' + (cv ? 'Chrome ' + cv[1] : navigator.userAgent));
    $hud.textContent = lines.join('\n');
    $hud.hidden = false;
}

// ---------- scenario ----------

function newScenario(params) {
    return { params: params, deltas: [], bdLast: null, bdMax: null, heap: null, orig: null, note: '', dead: false, timers: [] };
}

function later(sc, fn, ms) {
    const t = setTimeout(() => { if (!sc.dead) fn(); }, ms);
    sc.timers.push(t);
    return t;
}

/** Sample rAF deltas for ms; folded into the scenario totals and shown as "last". */
function sample(sc, label, ms) {
    const s = { label: label, deltas: [], end: performance.now() + ms };
    let prev = null;
    const step = (t) => {
        if (sc.dead || sc.frozen) return;
        if (prev !== null) s.deltas.push(t - prev);
        prev = t;
        if (performance.now() < s.end) { requestAnimationFrame(step); return; }
        for (const d of s.deltas) sc.deltas.push(d);
        hudState = { sc: sc, last: Object.assign({ label: label }, stats(s.deltas)) };
        sc.heap = heapMB();
        renderHud();
    };
    requestAnimationFrame(step);
}

function makeBox(photo) {
    const box = document.createElement('div');
    box.className = 'box';
    photo.img.className = '';
    photo.img.alt = '';
    box.appendChild(photo.img);
    photo.box = box;
    return box;
}

function setRect(box, r) {
    box.style.left = r.x + 'px';
    box.style.top = r.y + 'px';
    box.style.width = r.w + 'px';
    box.style.height = r.h + 'px';
    box._r = { x: r.x, y: r.y, w: r.w, h: r.h };
}

function clearMotion(box) {
    box.style.transition = '';
    box.style.transform = '';
}

/** Mount the DOM for one scenario into #stage. Returns { stop() }. */
async function runScenario(params, photos) {
    $stage.textContent = '';
    $hud.className = '';
    document.querySelectorAll('.name').forEach((e) => e.remove());
    $stage.className = FRAME ? 'frame' : '';
    const sc = newScenario(params);
    hudState = { sc: sc, last: null };

    const $bd = document.createElement('div');
    $bd.className = 'backdrop';
    const $layer = document.createElement('div');
    $layer.className = 'layer';
    $stage.appendChild($bd);
    $stage.appendChild($layer);
    const backdrop = createBackdropController($bd, cfg);

    const $name = document.createElement('div');
    $name.className = 'name bottom';
    $name.textContent = 'Sample album name';
    if (SHOW_NAME) document.body.appendChild($name);

    function showBackdrop(photo) {
        const t0 = performance.now();
        const canvas = makeBackdrop(photo.img, cfg, document);
        const ms = performance.now() - t0;
        sc.bdLast = ms;
        sc.bdMax = sc.bdMax == null ? ms : Math.max(sc.bdMax, ms);
        if (canvas) photo.data('backdrop-canvas', canvas); else photo.store = {};
        return backdrop.show(photo);
    }

    const cleanups = [];
    const stop = () => {
        sc.dead = true;
        sc.timers.forEach(clearTimeout);
        cleanups.forEach((f) => f());
        backdrop.clear();
        $stage.textContent = '';
        $name.remove();
        photos.forEach((p) => { p.img.src = ''; });
    };

    if (params.n === 1) {
        const photo = photos[0];
        const box = makeBox(photo);
        box.style.top = box.style.right = box.style.bottom = box.style.left = '0';
        box.style.opacity = '0';
        box.style.transform = 'scale(0.98)';
        box.style.transformOrigin = '50% 50%';
        $layer.appendChild(box);
        showBackdrop(photo);
        sample(sc, 'entrance', DUR + 700);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            box.style.transition = 'opacity ' + DUR + 'ms ease-in-out, transform ' + DUR + 'ms ease-in-out';
            box.style.opacity = '1';
            box.style.transform = 'none';
        }));
        if (params.original) {
            sc.orig = 'waiting for XL entrance';
            if (photo.xlIsOriginal) {
                // Synology hides @eaDir over SMB, so on such a server the "XL" file is already the original.
                const mp0 = (photo.img.naturalWidth * photo.img.naturalHeight) / 1e6;
                sc.orig = photo.img.naturalWidth + 'x' + photo.img.naturalHeight + ' (' + mp0.toFixed(1) + ' MP, ~' + (mp0 * 4).toFixed(0) +
                    ' MB decoded) NO @eaDir XL here: hero already the original, swap skipped';
            } else later(sc, async () => {
                const t0 = performance.now();
                let im = new Image();
                im.src = photo.origPath;
                try {
                    await withTimeout(im.decode(), config.IMAGE_PRELOAD_TIMEOUT);
                } catch (e) {
                    sc.orig = 'failed (' + e.message + '), keeping XL';
                    return;
                }
                if (sc.dead) return;
                const decodeMs = performance.now() - t0;
                const mp = (im.naturalWidth * im.naturalHeight) / 1e6;
                sc.orig = im.naturalWidth + 'x' + im.naturalHeight + ' (' + mp.toFixed(1) + ' MP, ~' + (mp * 4).toFixed(0) +
                    ' MB decoded) load+decode ' + decodeMs.toFixed(0) + ' ms';
                sample(sc, 'orig swap', 1500);
                photo.img.src = photo.origPath;
                im = null;
            }, DUR + 500);
        }
        return { sc: sc, stop: stop };
    }

    // ---- tiny: hero + filmstrip ----
    const vw = () => window.innerWidth;
    const vh = () => window.innerHeight;
    let order = photos.slice();
    const layoutFor = (o) => computeFilmstripLayout({
        viewportW: vw(), viewportH: vh(), heroAspect: o[0].aspect,
        stripAspects: o.slice(1).map((p) => p.aspect), cfg: cfg
    });
    let position = stripPositionForHero(order[0].aspect);
    // HUD goes to the corner away from the strip so it never covers it
    const setName = (pos) => {
        $name.className = 'name ' + (pos === 'below' ? 'top' : 'bottom');
        $hud.className = pos === 'below' ? 'tr' : 'tl';
    };

    function applyLayout(o, lay) {
        o.forEach((p, i) => {
            setRect(p.box, i === 0 ? lay.hero : lay.cells[i - 1]);
            p.box.classList.toggle('is-hero', i === 0);
        });
    }

    photos.forEach((p) => $layer.appendChild(makeBox(p)));
    let lay = layoutFor(order);
    applyLayout(order, lay);
    setName(position);
    $layer.style.opacity = '0';
    showBackdrop(order[0]);
    requestAnimationFrame(() => requestAnimationFrame(() => {
        $layer.style.transition = 'opacity ' + DUR + 'ms ease-in-out';
        $layer.style.opacity = '1';
    }));
    sample(sc, 'entrance', DUR + 700);

    let rotating = false;
    const onResize = () => {
        if (rotating) return;
        photos.forEach((p) => clearMotion(p.box));
        lay = layoutFor(order);
        applyLayout(order, lay);
    };
    window.addEventListener('resize', onResize);
    cleanups.push(() => window.removeEventListener('resize', onResize));

    function rotate() {
        if (rotating) return;
        const newOrder = nextOrder(order);
        const oldHero = order[0];
        const newHero = newOrder[0];
        if (!newHero.img.complete || !newHero.img.naturalWidth) return;
        rotating = true;

        const newPos = stripPositionForHero(newHero.aspect);
        const relocating = newPos !== position;
        const newLay = layoutFor(newOrder);
        const oldRects = new Map(photos.map((p) => [p.box, Object.assign({}, p.box._r)]));
        const flipDelays = relocating && params.relocate === 'flip';
        const total = (relocating && params.relocate === 'fade' ? FADE_OUT_MS : 0) + DUR +
            (flipDelays ? STAGGER * (photos.length - 1) : 0);
        sample(sc, relocating ? 'rotation+relocate' : 'rotation', total + 250);
        showBackdrop(newHero);

        const play = () => {
            order = newOrder;
            position = newPos;
            lay = newLay;
            setName(newPos);
            applyLayout(newOrder, newLay);
            newHero.box.style.zIndex = '3';
            oldHero.box.style.zIndex = '2';
            const moving = [];
            newOrder.forEach((p, i) => {
                const b = p.box;
                const o = oldRects.get(b);
                const n = b._r;
                const fadeCell = relocating && params.relocate === 'fade' && p !== newHero && p !== oldHero;
                if (fadeCell) {
                    b.style.transition = 'none';
                    b.style.opacity = '0';
                    return;
                }
                if (o.x === n.x && o.y === n.y && o.w === n.w && o.h === n.h) return;
                b.style.transition = 'none';
                b.style.transform = 'translate(' + (o.x - n.x) + 'px,' + (o.y - n.y) + 'px) scale(' + (o.w / n.w) + ',' + (o.h / n.h) + ')';
                moving.push({ b: b, delay: flipDelays ? i * STAGGER : 0 });
            });
            void $layer.offsetWidth; // commit the inverted state
            requestAnimationFrame(() => {
                moving.forEach((m) => {
                    m.b.style.transition = 'transform ' + DUR + 'ms ease-in-out ' + m.delay + 'ms';
                    m.b.style.transform = 'none';
                });
                if (relocating && params.relocate === 'fade') {
                    newOrder.forEach((p) => {
                        if (p === newHero || p === oldHero) return;
                        p.box.style.transition = 'opacity ' + FADE_IN_MS + 'ms linear';
                        p.box.style.opacity = '1';
                    });
                }
            });
            later(sc, () => {
                photos.forEach((p) => { clearMotion(p.box); p.box.style.zIndex = ''; p.box.style.opacity = ''; });
                rotating = false;
            }, (flipDelays ? STAGGER * (photos.length - 1) : 0) + DUR + 80);
        };

        if (relocating && params.relocate === 'fade') {
            photos.forEach((p) => {
                if (p === newHero || p === oldHero) return;
                p.box.style.transition = 'opacity ' + FADE_OUT_MS + 'ms linear';
                p.box.style.opacity = '0';
            });
            later(sc, play, FADE_OUT_MS);
        } else {
            play();
        }
    }

    const iv = setInterval(() => { if (!sc.dead) rotate(); }, params.swap);
    cleanups.push(() => clearInterval(iv));
    // a startup-skew guard: the first rotation waits a full interval from now
    return { sc: sc, stop: stop };
}

// ---------- parameters and driver ----------

function urlParams() {
    const shapes = (Q.get('shapes') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const n = Math.max(1, Math.min(10, Math.round(num('n', 4))));
    return {
        n: n,
        shapes: shapes,
        swap: num('swap', 10000),
        relocate: Q.get('relocate') === 'fade' ? 'fade' : 'flip',
        original: n === 1 && Q.get('original') === '1'
    };
}

function scriptList() {
    const t = (n, shapes, relocate) => ({ n: n, shapes: shapes, relocate: relocate, swap: 3000, original: false });
    const s = (shapes, original) => ({ n: 1, shapes: shapes, relocate: 'flip', swap: 3000, original: !!original });
    return [
        s(['landscape']), s(['portrait']), s(['panorama']),
        s(['landscape'], true), s(['portrait'], true), s(['landscape'], true),
        t(4, ['mixed'], 'flip'), t(4, ['mixed'], 'fade'),
        t(10, ['mixed'], 'flip'), t(10, ['mixed'], 'fade')
    ];
}

function describe(p) {
    const what = p.n === 1 ? 'n=1 ' + (p.shapes[0] || 'any') + (p.original ? ' original=1' : '')
        : 'n=' + p.n + ' ' + (p.shapes.join(',') || 'any') + ', relocate=' + p.relocate;
    return what;
}

async function prepare(params, labelPrefix) {
    $label.textContent = (labelPrefix || '') + describe(params) + '  (loading photos...)';
    const photos = await acquire(params.n, params.shapes, false);
    if (!photos.length) {
        $label.textContent = (labelPrefix || '') + describe(params) + '  (no matching photos found)';
        return null;
    }
    return { params: params, photos: photos };
}

async function launch(prep, labelPrefix) {
    const params = prep.params;
    const photos = prep.photos;
    const p = Object.assign({}, params, { n: Math.min(params.n, photos.length) });
    if (photos.length < params.n) p.note = 'only ' + photos.length + ' photos found';
    const run = await runScenario(p, photos);
    if (p.note) run.sc.note = p.note;
    $label.textContent = (labelPrefix || '') + describe(params);
    return run;
}

async function runOne(params, labelPrefix) {
    const prep = await prepare(params, labelPrefix);
    return prep ? launch(prep, labelPrefix) : null;
}

function showSummary(rows) {
    const el = document.createElement('div');
    el.id = 'summary';
    const pad = (s, w) => String(s).padEnd(w);
    let t = pad('scenario', 34) + pad('longest ms', 12) + pad('p95 ms', 9) + pad('mkBackdrop ms', 15) + 'JS heap MB\n';
    for (const r of rows) {
        const st = stats(r.sc.deltas);
        t += pad(r.title, 34) + pad(st.longest.toFixed(1), 12) + pad(st.p95.toFixed(1), 9) +
            pad(r.sc.bdMax == null ? '-' : r.sc.bdMax.toFixed(1), 15) + (r.sc.heap == null ? 'n/a' : r.sc.heap.toFixed(0)) +
            (r.sc.orig ? '   orig: ' + r.sc.orig.replace(/\(.*?\) /, '') : '') + '\n';
    }
    el.innerHTML = '<h1>Summary</h1>';
    const pre = document.createElement('div');
    pre.textContent = t + '\n(JS heap only, decoded images not included. Guide: p95 < ~33 ms, makeBackdrop < ~50 ms.)';
    el.appendChild(pre);
    document.body.appendChild(el);
    return el;
}

async function autoLoop() {
    const script = scriptList();
    for (;;) {
        const rows = [];
        usedFiles.clear();
        let prev = null; // previous run: stays on screen (frozen metrics) while the next loads
        for (let i = 0; i < script.length; i++) {
            const prefix = (i + 1) + ' of ' + script.length + ': ';
            let nextPrep = null;
            while (!(nextPrep = await prepare(script[i], prefix))) await sleep(3000);
            if (prev) prev.stop();
            const run = await launch(nextPrep, prefix);
            renderHud();
            const hudTimer = setInterval(renderHud, 500);
            await sleep(DWELL);
            clearInterval(hudTimer);
            run.sc.frozen = true;
            run.sc.heap = heapMB();
            renderHud();
            rows.push({ title: (i + 1) + ' ' + describe(script[i]).replace(', relocate=', ' '), sc: run.sc });
            // Report this scenario's numbers to the server log (a 404 the reviewer can grep for),
            // so nobody has to photograph the summary screen.
            try {
                const st = stats(run.sc.deltas);
                const r = rows[rows.length - 1];
                const msg = [r.title, 'longest=' + st.longest.toFixed(1), 'p95=' + st.p95.toFixed(1),
                    'frames=' + run.sc.deltas.length,
                    'mkBackdrop=' + (r.sc.bdMax == null ? '-' : r.sc.bdMax.toFixed(1)),
                    'heapMB=' + (r.sc.heap == null ? 'n/a' : r.sc.heap.toFixed(0)),
                    r.sc.orig ? 'orig=' + r.sc.orig : ''].join(' | ');
                fetch('/prototype/metrics-report?' + encodeURIComponent(msg.slice(0, 400))).catch(function () {});
            } catch (e) { /* ignore */ }
            prev = run;
        }
        prev.stop();
        $label.textContent = 'Summary';
        $hud.hidden = true;
        const el = showSummary(rows);
        window.__heroSummary = rows.map((r) => ({ title: r.title, stats: stats(r.sc.deltas), bdMax: r.sc.bdMax, heap: r.sc.heap, orig: r.sc.orig }));
        await sleep(DWELL);
        el.remove();
    }
}

async function single() {
    const params = urlParams();
    const run = await runOne(params, '');
    $label.textContent = '';
    if (!run) { $label.textContent = 'no matching photos found'; return; }
    window.__heroRun = run;
    setInterval(renderHud, 500);
    renderHud();
}

window.addEventListener('error', (e) => { $label.textContent = 'error: ' + e.message; });
window.addEventListener('unhandledrejection', (e) => { $label.textContent = 'error: ' + (e.reason && e.reason.message); });

if (AUTO) autoLoop(); else single();
