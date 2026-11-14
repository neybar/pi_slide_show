import { describe, it, expect } from 'vitest';
import { backdropSize, backdropFilter, makeBackdrop } from '../../www/js/backdrop.mjs';

function fakeDoc({ withFilter = true, noContext = false, throwOnDraw = false } = {}) {
    const calls = [];
    const ctx = {
        drawImage: (...a) => {
            if (throwOnDraw) throw new Error('boom');
            calls.push(['drawImage', ...a]);
        }
    };
    if (withFilter) ctx.filter = 'none';
    const canvas = {
        width: 0, height: 0,
        getContext: () => (noContext ? null : ctx),
        // Must never be called: a data: URL would be blocked by the CSP (img-src 'self')
        toDataURL: () => { throw new Error('toDataURL must not be used'); }
    };
    return { doc: { createElement: () => canvas }, canvas, ctx, calls };
}

describe('backdropSize', () => {
    it('handles landscape, portrait, panorama and 1x1', () => {
        expect(backdropSize(6000, 4000, {})).toEqual({ w: 64, h: 43 });
        expect(backdropSize(4000, 6000, {})).toEqual({ w: 43, h: 64 });
        expect(backdropSize(10000, 1000, {})).toEqual({ w: 64, h: 6 });
        expect(backdropSize(1, 1, {})).toEqual({ w: 64, h: 64 });
        expect(backdropSize(10000, 10, {})).toEqual({ w: 64, h: 1 });
    });
    it('honours BACKDROP_SIZE_PX', () => {
        expect(backdropSize(200, 100, { BACKDROP_SIZE_PX: 20 })).toEqual({ w: 20, h: 10 });
    });
});

describe('backdropFilter', () => {
    it('uses defaults and custom cfg', () => {
        expect(backdropFilter({})).toBe('blur(4px) brightness(0.55) saturate(1.2)');
        expect(backdropFilter({ BACKDROP_BLUR_PX: 8, BACKDROP_BRIGHTNESS: 0.3 }))
            .toBe('blur(8px) brightness(0.3) saturate(1.2)');
    });
});

describe('makeBackdrop', () => {
    const img = { naturalWidth: 6000, naturalHeight: 4000 };
    it('sets filter when supported and returns the canvas, not a string', () => {
        const f = fakeDoc();
        expect(makeBackdrop(img, {}, f.doc)).toBe(f.canvas);
        expect(f.ctx.filter).toBe('blur(4px) brightness(0.55) saturate(1.2)');
        expect(f.canvas.width).toBe(64);
        expect(f.canvas.height).toBe(43);
        expect(f.calls).toEqual([['drawImage', img, 0, 0, 64, 43]]);
    });
    it('does not set filter when the context lacks it', () => {
        const f = fakeDoc({ withFilter: false });
        expect(makeBackdrop(img, {}, f.doc)).toBe(f.canvas);
        expect('filter' in f.ctx).toBe(false);
    });
    it('returns null without a 2d context', () => {
        expect(makeBackdrop(img, {}, fakeDoc({ noContext: true }).doc)).toBeNull();
    });
    it('returns null when drawing throws', () => {
        expect(makeBackdrop(img, {}, fakeDoc({ throwOnDraw: true }).doc)).toBeNull();
    });
});
