import { describe, it, expect } from 'vitest';
import { computeFilmstripLayout, stripPositionForHero, nextOrder } from '../../www/js/filmstrip.mjs';

const VIEWPORTS = [[1920, 1080], [1024, 768]];
const CAP = 2.0;
const GAP = 8;

const PORTRAIT = 0.67;
const LANDSCAPE = 1.5;
const PANO = 3.0;

function sets(n) {
    const out = {
        portrait: Array(n).fill(PORTRAIT),
        landscape: Array(n).fill(LANDSCAPE),
        mixed: Array.from({ length: n }, (_, i) => (i % 2 ? PORTRAIT : LANDSCAPE))
    };
    out.pano = Array.from({ length: n }, (_, i) => (i === 0 ? PANO : LANDSCAPE));
    return out;
}

function inside(r, outer) {
    return r.x >= outer.x && r.y >= outer.y &&
        r.x + r.w <= outer.x + outer.w && r.y + r.h <= outer.y + outer.h;
}
function intersects(a, b) {
    return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
function allInts(r) {
    return [r.x, r.y, r.w, r.h].every(Number.isInteger);
}

function checkInvariants(L, { vw, vh, heroAspect, aspects, position }) {
    const viewport = { x: 0, y: 0, w: vw, h: vh };
    expect(allInts(L.hero) && allInts(L.strip) && allInts(L.heroArea)).toBe(true);
    expect(inside(L.hero, viewport)).toBe(true);
    expect(inside(L.strip, viewport)).toBe(true);
    expect(inside(L.hero, L.heroArea)).toBe(true);
    if (aspects.length) {
        expect(intersects(L.hero, L.strip)).toBe(false);
        expect(intersects(L.heroArea, L.strip)).toBe(false);
    }
    expect(L.cells).toHaveLength(aspects.length);

    // hero aspect and binding axis
    expect(Math.abs(L.hero.w - L.hero.h * heroAspect)).toBeLessThanOrEqual(1);
    const touchesW = L.hero.w === L.heroArea.w;
    const touchesH = L.hero.h === L.heroArea.h;
    expect(touchesW || touchesH).toBe(true);

    const below = position === 'below';
    L.cells.forEach((c, i) => {
        expect(allInts(c)).toBe(true);
        expect(inside(c, L.strip)).toBe(true);
        for (let j = i + 1; j < L.cells.length; j++) {
            expect(intersects(c, L.cells[j])).toBe(false);
        }
        const a = aspects[i];
        if (below) {
            if (a > CAP) expect(Math.abs(c.w - c.h * CAP)).toBeLessThanOrEqual(1);
            else expect(Math.abs(c.w - c.h * a)).toBeLessThanOrEqual(1);
        } else if (1 / a > CAP) {
            expect(Math.abs(c.h - c.w * CAP)).toBeLessThanOrEqual(1);
        } else {
            expect(Math.abs(c.h - c.w / a)).toBeLessThanOrEqual(1);
        }
    });

    // centered group
    if (L.cells.length) {
        const first = L.cells[0];
        const last = L.cells[L.cells.length - 1];
        if (below) {
            const lead = first.x - L.strip.x;
            const trail = L.strip.x + L.strip.w - (last.x + last.w);
            expect(Math.abs(lead - trail)).toBeLessThanOrEqual(1);
            const vl = first.y - L.strip.y;
            const vt = L.strip.y + L.strip.h - (first.y + first.h);
            expect(Math.abs(vl - vt)).toBeLessThanOrEqual(1);
        } else {
            const lead = first.y - L.strip.y;
            const trail = L.strip.y + L.strip.h - (last.y + last.h);
            expect(Math.abs(lead - trail)).toBeLessThanOrEqual(1);
            const vl = first.x - L.strip.x;
            const vt = L.strip.x + L.strip.w - (first.x + first.w);
            expect(Math.abs(vl - vt)).toBeLessThanOrEqual(1);
        }
    }
}

describe('stripPositionForHero', () => {
    it('is right for portrait, below otherwise', () => {
        expect(stripPositionForHero(0.67)).toBe('right');
        expect(stripPositionForHero(1.0)).toBe('below');
        expect(stripPositionForHero(1.5)).toBe('below');
        expect(stripPositionForHero(3.0)).toBe('below');
    });
});

describe('computeFilmstripLayout invariants', () => {
    for (const [vw, vh] of VIEWPORTS) {
        for (const position of ['below', 'right']) {
            for (let n = 1; n <= 9; n++) {
                for (const [name, aspects] of Object.entries(sets(n))) {
                    for (const heroAspect of [PORTRAIT, 1.0, LANDSCAPE, PANO]) {
                        it(`${vw}x${vh} ${position} n=${n} ${name} hero=${heroAspect}`, () => {
                            const L = computeFilmstripLayout({
                                viewportW: vw, viewportH: vh, heroAspect,
                                stripAspects: aspects, position
                            });
                            checkInvariants(L, { vw, vh, heroAspect, aspects, position });
                        });
                    }
                }
            }
        }
    }
});

describe('computeFilmstripLayout specifics', () => {
    it('defaults position from the hero aspect', () => {
        const p = computeFilmstripLayout({ viewportW: 1920, viewportH: 1080, heroAspect: 0.67, stripAspects: [1] });
        expect(p.strip.x + p.strip.w).toBe(1920);
        expect(p.strip.h).toBe(1080);
        const l = computeFilmstripLayout({ viewportW: 1920, viewportH: 1080, heroAspect: 1.5, stripAspects: [1] });
        expect(l.strip.y + l.strip.h).toBe(1080);
        expect(l.strip.w).toBe(1920);
    });

    it('uses the configured sizes and gap', () => {
        const L = computeFilmstripLayout({
            viewportW: 1920, viewportH: 1080, heroAspect: 1.5, stripAspects: [1.5, 1.5], position: 'below'
        });
        expect(L.strip.h).toBe(216);
        expect(L.heroArea.h).toBe(1080 - 216 - GAP);
        expect(L.cells[1].x - (L.cells[0].x + L.cells[0].w)).toBeGreaterThanOrEqual(GAP - 1);
        const R = computeFilmstripLayout({
            viewportW: 1920, viewportH: 1080, heroAspect: 0.67, stripAspects: [1, 1], position: 'right'
        });
        expect(R.strip.w).toBe(307);
        expect(R.heroArea.w).toBe(1920 - 307 - GAP);
    });

    it('scales cells down when the natural length exceeds the strip', () => {
        const aspects = Array(9).fill(1.5);
        const L = computeFilmstripLayout({
            viewportW: 1024, viewportH: 768, heroAspect: 1.5, stripAspects: aspects, position: 'below'
        });
        expect(L.cells[0].h).toBeLessThan(L.strip.h);
        // 9 cells at the full strip height would need 9 * 1.5 * 154 + 64 > 1024
        expect(L.cells[0].h).toBeLessThan(154);
        // and a short row does not scale
        const S = computeFilmstripLayout({
            viewportW: 1024, viewportH: 768, heroAspect: 1.5, stripAspects: [1.5, 1.5], position: 'below'
        });
        expect(S.cells[0].h).toBe(S.strip.h);
    });

    it('scales down in the right position too', () => {
        const L = computeFilmstripLayout({
            viewportW: 1024, viewportH: 768, heroAspect: 0.67, stripAspects: Array(9).fill(0.67), position: 'right'
        });
        expect(L.cells[0].w).toBeLessThan(L.strip.w);
    });

    it('caps a panorama cell and keeps it inside the strip', () => {
        const L = computeFilmstripLayout({
            viewportW: 1920, viewportH: 1080, heroAspect: 1.5, stripAspects: [PANO], position: 'below'
        });
        expect(L.cells[0].w).toBe(L.cells[0].h * 2);
    });

    it('handles an empty strip: hero area is the whole viewport', () => {
        const below = computeFilmstripLayout({
            viewportW: 1920, viewportH: 1080, heroAspect: 1.5, stripAspects: [], position: 'below'
        });
        expect(below.cells).toEqual([]);
        expect(below.strip.h).toBe(0);
        expect(below.heroArea).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
        expect(below.hero).toEqual({ x: 150, y: 0, w: 1620, h: 1080 });
        const right = computeFilmstripLayout({
            viewportW: 1920, viewportH: 1080, heroAspect: 0.67, stripAspects: [], position: 'right'
        });
        expect(right.strip.w).toBe(0);
        expect(right.heroArea).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
    });

    it('both orientations of consecutive conveyor layouts satisfy the invariants', () => {
        const photos = [PORTRAIT, LANDSCAPE, 1.0, PORTRAIT, PANO];
        for (const [vw, vh] of VIEWPORTS) {
            for (let hero = 0; hero < photos.length; hero++) {
                const rest = photos.slice(hero + 1).concat(photos.slice(0, hero));
                const heroAspect = photos[hero];
                const position = stripPositionForHero(heroAspect);
                const L = computeFilmstripLayout({
                    viewportW: vw, viewportH: vh, heroAspect, stripAspects: rest
                });
                checkInvariants(L, { vw, vh, heroAspect, aspects: rest, position });
            }
        }
    });

    it('snapshots', () => {
        const snap = (o) => {
            const L = computeFilmstripLayout(o);
            return { hero: L.hero, strip: L.strip, cells: L.cells };
        };
        const a = snap({ viewportW: 1920, viewportH: 1080, heroAspect: 1.5, stripAspects: [0.67, 1.5, 1.0] });
        const b = snap({ viewportW: 1024, viewportH: 768, heroAspect: 0.67, stripAspects: [1.5, 3.0, 0.67] });
        expect(a).toMatchInlineSnapshot(`
          {
            "cells": [
              {
                "h": 216,
                "w": 144,
                "x": 610,
                "y": 864,
              },
              {
                "h": 216,
                "w": 324,
                "x": 762,
                "y": 864,
              },
              {
                "h": 216,
                "w": 216,
                "x": 1094,
                "y": 864,
              },
            ],
            "hero": {
              "h": 856,
              "w": 1284,
              "x": 318,
              "y": 0,
            },
            "strip": {
              "h": 216,
              "w": 1920,
              "x": 0,
              "y": 864,
            },
          }
        `);
        expect(b).toMatchInlineSnapshot(`
          {
            "cells": [
              {
                "h": 109,
                "w": 164,
                "x": 860,
                "y": 172,
              },
              {
                "h": 55,
                "w": 164,
                "x": 860,
                "y": 289,
              },
              {
                "h": 244,
                "w": 164,
                "x": 860,
                "y": 352,
              },
            ],
            "hero": {
              "h": 768,
              "w": 515,
              "x": 168,
              "y": 0,
            },
            "strip": {
              "h": 768,
              "w": 164,
              "x": 860,
              "y": 0,
            },
          }
        `);
    });
});

describe('nextOrder', () => {
    it('rotates left by one without mutating its input', () => {
        const order = ['a', 'b', 'c', 'd'];
        const next = nextOrder(order);
        expect(next).toEqual(['b', 'c', 'd', 'a']);
        expect(order).toEqual(['a', 'b', 'c', 'd']);
        expect(next).not.toBe(order);
    });

    it('returns to the start after N ticks, each id hero exactly once', () => {
        for (const n of [2, 3, 4, 10]) {
            const start = Array.from({ length: n }, (_, i) => 'p' + i);
            let order = start;
            const heroes = [];
            for (let t = 0; t < n; t++) {
                heroes.push(order[0]);
                order = nextOrder(order);
            }
            expect(order).toEqual(start);
            expect(new Set(heroes).size).toBe(n);
            expect(heroes.slice().sort()).toEqual(start.slice().sort());
        }
    });

    it('handles short and missing orders', () => {
        expect(nextOrder(['a'])).toEqual(['a']);
        expect(nextOrder([])).toEqual([]);
        expect(nextOrder(undefined)).toEqual([]);
    });
});
