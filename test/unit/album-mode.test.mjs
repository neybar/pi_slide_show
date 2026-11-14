import { describe, it, expect } from 'vitest';
import {
    getAlbumMode, resolveAlbumMode, qualityForAlbum, getAlbumDuration, getPrefetchLeadTime, albumNameFromPath,
    minPhotosForMode, panPlan, singlePanoramaPlan
} from '../../www/js/album-mode.mjs';

describe('getAlbumMode', () => {
    it('classifies boundaries with defaults (TINY_ALBUM_MAX 10)', () => {
        expect(getAlbumMode(0)).toBeNull();
        expect(getAlbumMode(-1, {})).toBeNull();
        expect(getAlbumMode(1, {})).toBe('single');
        expect(getAlbumMode(2, {})).toBe('tiny');
        expect(getAlbumMode(10, {})).toBe('tiny');
        expect(getAlbumMode(11, {})).toBe('grid');
        expect(getAlbumMode(12, {})).toBe('grid');
    });
    it('honours custom TINY_ALBUM_MAX', () => {
        const cfg = { TINY_ALBUM_MAX: 4 };
        expect(getAlbumMode(4, cfg)).toBe('tiny');
        expect(getAlbumMode(5, cfg)).toBe('grid');
    });
});

describe('resolveAlbumMode', () => {
    it('resolves server vs loaded counts', () => {
        expect(resolveAlbumMode(35, 3, {})).toBe('grid');
        expect(resolveAlbumMode(2, 1, {})).toBe('single');
        expect(resolveAlbumMode(5, 5, {})).toBe('tiny');
        expect(resolveAlbumMode(1, 0, {})).toBeNull();
        expect(resolveAlbumMode(0, 0, {})).toBeNull();
    });
});

describe('getAlbumDuration', () => {
    it('grid and single use their config values', () => {
        expect(getAlbumDuration('grid', 35, {})).toBe(900000);
        expect(getAlbumDuration('single', 1, {})).toBe(90000);
        expect(getAlbumDuration('single', 1, { SINGLE_PHOTO_DURATION_MS: 5000 })).toBe(5000);
    });
    it('floor always wins at defaults: every tiny album plays 2 min', () => {
        for (let n = 2; n <= 10; n++) {
            expect(getAlbumDuration('tiny', n, {})).toBe(120000);
        }
    });
    it('laps exceed the floor when configured', () => {
        expect(getAlbumDuration('tiny', 10, { TINY_HERO_LAPS: 2 })).toBe(200000);
    });
    it('is capped at ALBUM_DURATION_MS', () => {
        expect(getAlbumDuration('tiny', 10, { TINY_MIN_DURATION_MS: 2000000 })).toBe(900000);
        expect(getAlbumDuration('tiny', 10, { ALBUM_DURATION_MS: 60000 })).toBe(60000);
    });
});

describe('getPrefetchLeadTime', () => {
    it('clamps to duration minus SWAP_INTERVAL', () => {
        expect(getPrefetchLeadTime(90000, {})).toBe(60000);
        expect(getPrefetchLeadTime(40000, {})).toBe(30000);
        expect(getPrefetchLeadTime(40000, { PREFETCH_LEAD_TIME: 5000, SWAP_INTERVAL: 1000 })).toBe(5000);
    });
});

describe('minPhotosForMode', () => {
    it('single and tiny need 1 photo, whatever the config', () => {
        expect(minPhotosForMode('single', 1, {})).toBe(1);
        expect(minPhotosForMode('tiny', 4, {})).toBe(1);
        expect(minPhotosForMode('tiny', 10, undefined)).toBe(1);
        expect(minPhotosForMode('single', 1, { MIN_PHOTOS_FOR_TRANSITION: 20 })).toBe(1);
        expect(minPhotosForMode('tiny', 4, { MIN_PHOTOS_FOR_TRANSITION: 20 })).toBe(1);
    });
    it('grid needs min(MIN_PHOTOS_FOR_TRANSITION, album size) with defaults', () => {
        expect(minPhotosForMode('grid', 35, {})).toBe(15);
        expect(minPhotosForMode('grid', 35)).toBe(15);
        expect(minPhotosForMode('grid', 15, {})).toBe(15);
        expect(minPhotosForMode('grid', 12, {})).toBe(12);
        expect(minPhotosForMode('grid', 11, {})).toBe(11);
    });
    it('grid honours custom MIN_PHOTOS_FOR_TRANSITION', () => {
        expect(minPhotosForMode('grid', 35, { MIN_PHOTOS_FOR_TRANSITION: 20 })).toBe(20);
        expect(minPhotosForMode('grid', 12, { MIN_PHOTOS_FOR_TRANSITION: 20 })).toBe(12);
        expect(minPhotosForMode('grid', 35, { MIN_PHOTOS_FOR_TRANSITION: 1 })).toBe(1);
        expect(minPhotosForMode('grid', 35, { MIN_PHOTOS_FOR_TRANSITION: 'x' })).toBe(15);
    });
    it('grid with an unknown album size falls back to MIN_PHOTOS_FOR_TRANSITION', () => {
        expect(minPhotosForMode('grid', 0, {})).toBe(15);
        expect(minPhotosForMode('grid', undefined, {})).toBe(15);
        expect(minPhotosForMode('grid', NaN, { MIN_PHOTOS_FOR_TRANSITION: 8 })).toBe(8);
    });
});

describe('albumNameFromPath', () => {
    it('returns "YYYY Album" from a library path', () => {
        expect(albumNameFromPath('photos/2019/July - Hawaii Trip/IMG_0001.jpg')).toBe('2019 July - Hawaii Trip');
        expect(albumNameFromPath('photos/2024/Mock Album 0/p00.jpg')).toBe('2024 Mock Album 0');
    });
    it('returns "" for a path with no year folder', () => {
        expect(albumNameFromPath('photos/album1/photo54.jpg')).toBe('');
    });
    it('returns "" for "" and undefined', () => {
        expect(albumNameFromPath('')).toBe('');
        expect(albumNameFromPath(undefined)).toBe('');
    });
});

describe('defaults', () => {
    it('work with {} , undefined and non-numeric fields', () => {
        expect(getAlbumMode(3)).toBe('tiny');
        expect(getAlbumMode(3, { TINY_ALBUM_MAX: 'x' })).toBe('tiny');
        expect(getAlbumDuration('grid', 20, undefined)).toBe(900000);
        expect(getPrefetchLeadTime(900000)).toBe(60000);
    });
});

describe('qualityForAlbum', () => {
    it('uses final quality for single and tiny albums with defaults', () => {
        expect(qualityForAlbum(1, {})).toBe('XL');
        expect(qualityForAlbum(2, {})).toBe('XL');
        expect(qualityForAlbum(10, {})).toBe('XL');
        expect(qualityForAlbum(11, {})).toBe('M');
        expect(qualityForAlbum(35, {})).toBe('M');
    });
    it('honours custom cfg', () => {
        const cfg = { TINY_ALBUM_MAX: 4, INITIAL_QUALITY: 'S', FINAL_QUALITY: 'L' };
        expect(qualityForAlbum(4, cfg)).toBe('L');
        expect(qualityForAlbum(5, cfg)).toBe('S');
    });
});

describe('panPlan', () => {
    it('returns the negative overflow and duration at the given speed', () => {
        expect(panPlan(3000, 1000, 10)).toEqual({ distance: -2000, duration: 200 });
    });
    it('returns null when the image fits or the speed is not positive', () => {
        expect(panPlan(1000, 1000, 10)).toBeNull();
        expect(panPlan(900, 1000, 10)).toBeNull();
        expect(panPlan(3000, 1000, 0)).toBeNull();
    });
});

describe('singlePanoramaPlan', () => {
    it('is null for a non-panorama or a panorama that fits the width', () => {
        expect(singlePanoramaPlan(1.5, 1920, 1080, {})).toBeNull();
        expect(singlePanoramaPlan(2.1, 1920, 800, {})).toBeNull();
        expect(singlePanoramaPlan(2.0, 1000, 1080, {})).toBeNull(); // not above the threshold
    });
    it('sweeps in half the play time when that is under the speed cap', () => {
        // 2.4:1 at 1080 = 2592 wide, overflow 672: 672 px / 45 s = 14.9 px/s
        const p = singlePanoramaPlan(2.4, 1920, 1080, {});
        expect(p.distance).toBe(-672);
        expect(p.duration).toBeCloseTo(45, 6);
        expect(p.playMs).toBe(90000);
    });
    it('caps the speed and stretches the play time to one round trip', () => {
        // 4:1 at 1080 = 4320 wide, overflow 2400: capped at 40 px/s = 60 s each way
        const p = singlePanoramaPlan(4, 1920, 1080, {});
        expect(p.distance).toBe(-2400);
        expect(p.duration).toBe(60);
        expect(p.playMs).toBe(120000);
    });
    it('caps the stretched play time at ALBUM_DURATION_MS', () => {
        const p = singlePanoramaPlan(4, 1920, 1080, { ALBUM_DURATION_MS: 100000 });
        expect(p.duration).toBe(60);
        expect(p.playMs).toBe(100000);
    });
    it('honours config overrides', () => {
        const p = singlePanoramaPlan(4, 1920, 1080, { SINGLE_PANORAMA_MAX_PAN_PX_PER_SEC: 100, SINGLE_PHOTO_DURATION_MS: 40000 });
        expect(p.duration).toBe(24);
        expect(p.playMs).toBe(48000);
    });
});

describe('getAlbumDuration with a single panorama', () => {
    const hero = (aspect) => ({ aspect, viewportW: 1920, viewportH: 1080 });
    it('extends the play time for a slow-panning panorama', () => {
        expect(getAlbumDuration('single', 1, {}, hero(4))).toBe(120000);
    });
    it('keeps SINGLE_PHOTO_DURATION_MS for other photos or no hero info', () => {
        expect(getAlbumDuration('single', 1, {}, hero(1.5))).toBe(90000);
        expect(getAlbumDuration('single', 1, {})).toBe(90000);
        expect(getAlbumDuration('tiny', 4, {}, hero(4))).toBe(getAlbumDuration('tiny', 4, {}));
    });
});
