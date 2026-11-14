import { describe, it, expect } from 'vitest';
import {
    stuckThresholdMs, imgLooksBroken, isInvisible, updateSince, photoNeedsRecovery
} from '../../www/js/watchdog.mjs';
import * as config from '../../www/js/config.mjs';

const img = (src, naturalWidth) => ({
    getAttribute: (name) => (name === 'src' ? src : null),
    naturalWidth,
});

describe('stuckThresholdMs', () => {
    it('is the longest swap animation plus the grace period', () => {
        const expected = 4 * config.FILL_STAGGER_DELAY + config.SLIDE_IN_ANIMATION_DURATION +
            config.WATCHDOG_STUCK_GRACE_PERIOD_MS;
        expect(stuckThresholdMs(config)).toBe(expected);
    });

    it('falls back to defaults without cfg or with bad values', () => {
        expect(stuckThresholdMs()).toBe(2200);
        expect(stuckThresholdMs({ SLIDE_IN_ANIMATION_DURATION: 'x' })).toBe(2200);
    });

    it('follows overrides', () => {
        expect(stuckThresholdMs({ FILL_STAGGER_DELAY: 0, SLIDE_IN_ANIMATION_DURATION: 100,
            WATCHDOG_STUCK_GRACE_PERIOD_MS: 50 })).toBe(150);
    });
});

describe('imgLooksBroken', () => {
    it('flags a missing img, an empty or missing src, and an undecoded image', () => {
        expect(imgLooksBroken(null)).toBe(true);
        expect(imgLooksBroken(undefined)).toBe(true);
        expect(imgLooksBroken(img('', 100))).toBe(true);
        expect(imgLooksBroken(img(null, 100))).toBe(true);
        expect(imgLooksBroken(img('/photos/a.jpg', 0))).toBe(true);
    });

    it('accepts a decoded image', () => {
        expect(imgLooksBroken(img('/photos/a.jpg', 640))).toBe(false);
    });
});

describe('isInvisible', () => {
    it('flags visibility hidden and near-zero opacity', () => {
        expect(isInvisible('1', 'hidden')).toBe(true);
        expect(isInvisible('0', 'visible')).toBe(true);
        expect(isInvisible('0.005', 'visible')).toBe(true);
    });

    it('accepts visible elements, including a missing opacity', () => {
        expect(isInvisible('1', 'visible')).toBe(false);
        expect(isInvisible('0.5', 'visible')).toBe(false);
        expect(isInvisible('', 'visible')).toBe(false);
        expect(isInvisible(undefined, 'visible')).toBe(false);
    });
});

describe('updateSince', () => {
    it('starts, keeps and resets the timestamp', () => {
        expect(updateSince(null, true, 1000)).toBe(1000);
        expect(updateSince(1000, true, 5000)).toBe(1000);
        expect(updateSince(1000, false, 5000)).toBe(null);
        expect(updateSince(undefined, false, 5000)).toBe(null);
    });
});

describe('photoNeedsRecovery', () => {
    const cfg = { WATCHDOG_LOAD_ERROR_DELAY_MS: 500, FILL_STAGGER_DELAY: 100,
        SLIDE_IN_ANIMATION_DURATION: 800, WATCHDOG_STUCK_GRACE_PERIOD_MS: 1000 };

    it('waits WATCHDOG_LOAD_ERROR_DELAY_MS after a load error', () => {
        expect(photoNeedsRecovery(1000, null, 1400, cfg)).toBe(false);
        expect(photoNeedsRecovery(1000, null, 1501, cfg)).toBe(true);
    });

    it('waits the stuck threshold for a broken image', () => {
        expect(photoNeedsRecovery(null, 1000, 3100, cfg)).toBe(false);
        expect(photoNeedsRecovery(null, 1000, 3201, cfg)).toBe(true);
    });

    it('is false for a healthy photo', () => {
        expect(photoNeedsRecovery(null, null, 99999, cfg)).toBe(false);
        expect(photoNeedsRecovery(undefined, undefined, 99999)).toBe(false);
    });
});
