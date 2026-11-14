// @vitest-environment jsdom
/**
 * Photo Store Module Tests
 *
 * Tests for www/js/photo-store.mjs functions that manage photo selection,
 * weighted replacement, and space management for the slideshow.
 *
 * These run on jsdom with the real jQuery 3.7.1 the browser loads and the real
 * $.fn.random (see test/unit/helpers/dom-harness.mjs). Where a test needs a fixed
 * random value it spies on Math.random; where it needs a failure that real DOM
 * can't produce (e.g. a detach race), it spies on $.fn.random.
 *
 * jsdom doesn't compute layout, so the viewport is set with setViewport() and
 * nothing here depends on offset() or element widths.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    $,
    createDom,
    setViewport,
    makeImgBox,
    addToStore,
    makePhotoDiv,
    addToRow,
    buildDiv
} from './helpers/dom-harness.mjs';
import * as PhotoStore from '../../www/js/photo-store.mjs';
import { ORIENTATION_MATCH_PROBABILITY, PANORAMA_USE_PROBABILITY } from '../../www/js/config.mjs';

const realRandom = $.fn.random;

/** Number of img_boxes in a #photo_store bucket ('landscape', 'portrait' or 'panorama'). */
function storeCount(bucket) {
    return $('#' + bucket + ' div.img_box').length;
}

/** Fill the photo store. Each entry is makeImgBox() options. */
function populateStore({ portraits = [], landscapes = [], panoramas = [] }) {
    for (const o of portraits) addToStore(makeImgBox({ ...o, orientation: 'portrait' }));
    for (const o of landscapes) addToStore(makeImgBox({ ...o, orientation: o.orientation || 'landscape' }));
    for (const o of panoramas) addToStore(makeImgBox({ ...o, orientation: 'panorama' }));
}

/** Put the given orientations on the page as img_boxes inside .photo divs in #top_row. */
function populateRow(row, specs) {
    for (const spec of specs) {
        addToRow(row, makePhotoDiv(makeImgBox(spec)));
    }
}

beforeEach(() => {
    createDom();
    // selectPhotoForContainer and friends log when nothing is available
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Photo Store Module', () => {
    describe('getPhotoColumns', () => {
        it('should use data("columns") as primary lookup', () => {
            const $photo = $('<div class="photo pure-u-1-5"></div>').data('columns', 3);
            expect(PhotoStore.getPhotoColumns($photo)).toBe(3);
        });

        it('should prefer data("columns") over CSS class', () => {
            const $photo = $('<div class="photo pure-u-2-5"></div>').data('columns', 4);
            // data attribute says 4, CSS class says 2 — data wins
            expect(PhotoStore.getPhotoColumns($photo)).toBe(4);
        });

        it('should coerce string data("columns") to number', () => {
            const $photo = $('<div class="photo pure-u-1-5"></div>').data('columns', '3');
            const columns = PhotoStore.getPhotoColumns($photo);
            expect(columns).toBe(3);
            expect(typeof columns).toBe('number');
        });

        it('should fall back to CSS class when data("columns") is not set', () => {
            const $photo = $('<div class="photo pure-u-2-5"></div>');
            expect(PhotoStore.getPhotoColumns($photo)).toBe(2);
        });

        it('should fall back to CSS class when data("columns") is 0', () => {
            const $photo = $('<div class="photo pure-u-2-5"></div>').data('columns', 0);
            expect(PhotoStore.getPhotoColumns($photo)).toBe(2);
        });

        it('should fall back to CSS class when data("columns") is negative', () => {
            const $photo = $('<div class="photo pure-u-3-5"></div>').data('columns', -1);
            expect(PhotoStore.getPhotoColumns($photo)).toBe(3);
        });

        it('should extract columns from pure-u-1-4 class', () => {
            expect(PhotoStore.getPhotoColumns($('<div class="photo pure-u-1-4"></div>'))).toBe(1);
        });

        it('should extract columns from pure-u-2-5 class', () => {
            expect(PhotoStore.getPhotoColumns($('<div class="photo pure-u-2-5"></div>'))).toBe(2);
        });

        it('should extract columns from pure-u-1-5 class', () => {
            expect(PhotoStore.getPhotoColumns($('<div class="photo pure-u-1-5"></div>'))).toBe(1);
        });

        it('should return 1 if no pure-u class found', () => {
            expect(PhotoStore.getPhotoColumns($('<div class="photo"></div>'))).toBe(1);
        });

        it('should return 1 if no class attribute', () => {
            expect(PhotoStore.getPhotoColumns($('<div></div>'))).toBe(1);
        });
    });

    describe('getAdjacentPhoto', () => {
        let $left, $middle, $right;

        beforeEach(() => {
            $left = makePhotoDiv(null, { cls: 'left' });
            $middle = makePhotoDiv(null, { cls: 'middle' });
            $right = makePhotoDiv(null, { cls: 'right' });
            addToRow('#top_row', [$left, $middle, $right]);
        });

        it('should return left neighbor when direction is left', () => {
            const result = PhotoStore.getAdjacentPhoto($middle, 'left');
            expect(result[0]).toBe($left[0]);
        });

        it('should return right neighbor when direction is right', () => {
            const result = PhotoStore.getAdjacentPhoto($middle, 'right');
            expect(result[0]).toBe($right[0]);
        });

        it('should return null when no left neighbor', () => {
            expect(PhotoStore.getAdjacentPhoto($left, 'left')).toBeNull();
        });

        it('should return null when no right neighbor', () => {
            expect(PhotoStore.getAdjacentPhoto($right, 'right')).toBeNull();
        });

        it('should return null for invalid direction', () => {
            expect(PhotoStore.getAdjacentPhoto($middle, 'invalid')).toBeNull();
        });

        it('should skip non-.photo siblings', () => {
            // prev('.photo') / next('.photo') only match the immediately adjacent sibling,
            // so a non-photo element in between means there is no neighbor.
            $middle.before('<div class="spacer"></div>');
            expect(PhotoStore.getAdjacentPhoto($middle, 'left')).toBeNull();
        });
    });

    describe('selectPhotoToReplace', () => {
        it('should return null when no photos in row', () => {
            expect(PhotoStore.selectPhotoToReplace($, '#top_row')).toBeNull();
        });

        it('should return null when no photos have display_time', () => {
            addToRow('#top_row', makePhotoDiv(makeImgBox()));
            expect(PhotoStore.selectPhotoToReplace($, '#top_row')).toBeNull();
        });

        it('should only consider photos in the requested row', () => {
            const now = Date.now();
            addToRow('#bottom_row', makePhotoDiv(makeImgBox(), { displayTime: now - 60000 }));
            expect(PhotoStore.selectPhotoToReplace($, '#top_row')).toBeNull();
        });

        describe('weighted selection', () => {
            const NOW = 1_700_000_000_000;
            let $oldPhoto, $newPhoto;

            beforeEach(() => {
                vi.useFakeTimers({ toFake: ['Date'] });
                vi.setSystemTime(NOW);
                // Weights: old = 60000 ms on screen, new = 5000 ms; total 65000
                $oldPhoto = makePhotoDiv(makeImgBox(), { displayTime: NOW - 60000, cls: 'old' });
                $newPhoto = makePhotoDiv(makeImgBox(), { displayTime: NOW - 5000, cls: 'new' });
                addToRow('#top_row', [$oldPhoto, $newPhoto]);
            });

            afterEach(() => {
                vi.useRealTimers();
            });

            it('should select the older photo when the roll lands in its share', () => {
                vi.spyOn(Math, 'random').mockReturnValue(0.5); // 32500 <= 60000
                const result = PhotoStore.selectPhotoToReplace($, '#top_row');
                expect(result[0]).toBe($oldPhoto[0]);
            });

            it('should select the newer photo when the roll lands past the older share', () => {
                vi.spyOn(Math, 'random').mockReturnValue(0.99); // 64350 > 60000
                const result = PhotoStore.selectPhotoToReplace($, '#top_row');
                expect(result[0]).toBe($newPhoto[0]);
            });

            it('should return the exact boundary photo when roll equals cumulative weight', () => {
                vi.spyOn(Math, 'random').mockReturnValue(60000 / 65000);
                const result = PhotoStore.selectPhotoToReplace($, '#top_row');
                expect(result[0]).toBe($oldPhoto[0]);
            });

            it('should give a just-displayed photo the minimum 1s weight', () => {
                $newPhoto.data('display_time', NOW); // 0 ms on screen -> clamped to 1000
                // total = 60000 + 1000; a roll at 0.999 lands in the new photo's share
                vi.spyOn(Math, 'random').mockReturnValue(0.999);
                const result = PhotoStore.selectPhotoToReplace($, '#top_row');
                expect(result[0]).toBe($newPhoto[0]);
            });

            it('should skip photos without display_time', () => {
                $oldPhoto.removeData('display_time');
                vi.spyOn(Math, 'random').mockReturnValue(0);
                const result = PhotoStore.selectPhotoToReplace($, '#top_row');
                expect(result[0]).toBe($newPhoto[0]);
            });

            it('should select photo with higher weight (older photo) more often', () => {
                vi.restoreAllMocks();
                vi.spyOn(console, 'log').mockImplementation(() => {});
                const selections = { old: 0, new: 0 };
                for (let i = 0; i < 200; i++) {
                    const result = PhotoStore.selectPhotoToReplace($, '#top_row');
                    selections[result[0] === $oldPhoto[0] ? 'old' : 'new']++;
                }
                // 60s vs 5s weights: expect ~92% old, ~8% new
                expect(selections.old).toBeGreaterThan(selections.new);
                expect(selections.old).toBeGreaterThan(200 * 0.75);
            });
        });
    });

    describe('clonePhotoFromPage', () => {
        it('should return null when no photos on page', () => {
            expect(PhotoStore.clonePhotoFromPage($)).toBeNull();
        });

        it('should clone a random photo when photos exist', () => {
            populateRow('#top_row', [{ id: 'photo1', width: 1920, height: 1080, aspect_ratio: 1.78 }]);

            const result = PhotoStore.clonePhotoFromPage($);
            expect(result).toBeTruthy();
            expect(result.data('height')).toBe(1080);
            expect(result.data('width')).toBe(1920);
            expect(result.data('aspect_ratio')).toBe(1.78);
            expect(result.data('orientation')).toBe('landscape');
            expect(result.data('panorama')).toBe(false);
        });

        it('should return a detached copy and leave the original on the page', () => {
            populateRow('#top_row', [{ id: 'photo1' }]);

            const result = PhotoStore.clonePhotoFromPage($);
            expect(result[0]).not.toBe($('#photo1')[0]);
            expect(result.attr('id')).toBe('photo1');
            expect(result.parent().length).toBe(0);
            expect($('#top_row #photo1').length).toBe(1);
            expect(result.find('img').length).toBe(1);
        });

        it('should copy only the five layout data keys (clone(false) drops the rest)', () => {
            populateRow('#top_row', [{ id: 'photo1' }]);

            const result = PhotoStore.clonePhotoFromPage($);
            expect(result.data('quality-level')).toBeUndefined();
            expect(result.data('original-file-path')).toBeUndefined();
        });

        it('should prefer matching orientation when specified', () => {
            populateRow('#top_row', [
                { id: 'l1', orientation: 'landscape' },
                { id: 'p1', orientation: 'portrait' },
                { id: 'l2', orientation: 'landscape' }
            ]);

            // The orientation filter makes this deterministic
            for (let i = 0; i < 30; i++) {
                expect(PhotoStore.clonePhotoFromPage($, 'portrait').attr('id')).toBe('p1');
                expect(PhotoStore.clonePhotoFromPage($, 'landscape').data('orientation')).toBe('landscape');
            }
        });

        it('should fall back to any photo when no photo matches the preferred orientation', () => {
            populateRow('#top_row', [{ id: 'l1', orientation: 'landscape' }]);

            const result = PhotoStore.clonePhotoFromPage($, 'portrait');
            expect(result.attr('id')).toBe('l1');
            expect(result.data('orientation')).toBe('landscape');
        });

        it('should look in both rows but not in the photo store', () => {
            populateRow('#top_row', [{ id: 'top' }]);
            populateRow('#bottom_row', [{ id: 'bottom' }]);
            populateStore({ landscapes: [{ id: 'stored' }] });

            const ids = new Set();
            for (let i = 0; i < 100; i++) {
                ids.add(PhotoStore.clonePhotoFromPage($).attr('id'));
            }
            expect(ids).toEqual(new Set(['top', 'bottom']));
        });

        it('should pick via $.fn.random', () => {
            populateRow('#top_row', [{ id: 'a' }, { id: 'b' }]);
            vi.spyOn(Math, 'random').mockReturnValue(0.9);
            expect(PhotoStore.clonePhotoFromPage($).attr('id')).toBe('b');
            Math.random.mockReturnValue(0);
            expect(PhotoStore.clonePhotoFromPage($).attr('id')).toBe('a');
        });

        it('should find a photo appended earlier in the same build_row call', () => {
            // Regression test for the incremental-append refactor: build_row() now
            // appends each photo to #top_row immediately, so when a later iteration
            // exhausts the photo store, clonePhotoFromPage must be able to find the
            // earlier-appended siblings via the existing #top_row/#bottom_row selector.
            // This locks in the load-bearing invariant the refactor introduced.
            // Simulates: photo store empty, but an earlier iteration of the same
            // build_row() call already appended one photo to #top_row.
            populateRow('#top_row', [{ id: 'earlier-appended', orientation: 'portrait', width: 1080, height: 1920, aspect_ratio: 0.5625 }]);

            const result = PhotoStore.clonePhotoFromPage($, 'portrait');
            expect(result).not.toBeNull();
            expect(result.data('orientation')).toBe('portrait');
            expect(result.data('aspect_ratio')).toBe(0.5625);
        });
    });

    describe('selectPhotoForContainer', () => {
        it('should return null when no photos available and clone fails', () => {
            expect(PhotoStore.selectPhotoForContainer($, 1.5, false)).toBeNull();
        });

        it('should clone a page photo when the store is empty', () => {
            populateRow('#top_row', [
                { id: 'l1', orientation: 'landscape' },
                { id: 'p1', orientation: 'portrait' }
            ]);

            // Tall container prefers portrait, wide prefers landscape
            expect(PhotoStore.selectPhotoForContainer($, 0.5, false).attr('id')).toBe('p1');
            expect(PhotoStore.selectPhotoForContainer($, 1.5, false).attr('id')).toBe('l1');
        });

        it('should prefer portrait for tall containers when matching enabled', () => {
            populateStore({ portraits: [{ id: 'p1' }], landscapes: [{ id: 'l1' }] });
            vi.spyOn(Math, 'random').mockReturnValue(ORIENTATION_MATCH_PROBABILITY - 0.01);

            const result = PhotoStore.selectPhotoForContainer($, 0.5, false);
            expect(result.attr('id')).toBe('p1');
        });

        it('should prefer landscape for wide containers when matching enabled', () => {
            populateStore({ portraits: [{ id: 'p1' }], landscapes: [{ id: 'l1' }] });
            vi.spyOn(Math, 'random').mockReturnValue(ORIENTATION_MATCH_PROBABILITY - 0.01);

            const result = PhotoStore.selectPhotoForContainer($, 1.5, false);
            expect(result.attr('id')).toBe('l1');
        });

        it('should detach the selected photo from the store', () => {
            populateStore({ portraits: [{ id: 'p1' }, { id: 'p2' }], landscapes: [{ id: 'l1' }] });
            vi.spyOn(Math, 'random').mockReturnValue(0);

            const result = PhotoStore.selectPhotoForContainer($, 0.5, false);
            expect(result.parent().length).toBe(0);
            expect(storeCount('portrait')).toBe(1);
            expect(storeCount('landscape')).toBe(1);
            expect($('#photo_store #' + result.attr('id')).length).toBe(0);
        });

        it('should keep jQuery data on the detached photo', () => {
            populateStore({ portraits: [{ id: 'p1', aspect_ratio: 0.6 }] });
            vi.spyOn(Math, 'random').mockReturnValue(0);

            const result = PhotoStore.selectPhotoForContainer($, 0.5, false);
            expect(result.data('orientation')).toBe('portrait');
            expect(result.data('aspect_ratio')).toBe(0.6);
        });

        it('should fall back to landscape when a tall container has no portraits', () => {
            populateStore({ landscapes: [{ id: 'l1' }] });
            vi.spyOn(Math, 'random').mockReturnValue(0);

            expect(PhotoStore.selectPhotoForContainer($, 0.5, false).attr('id')).toBe('l1');
        });

        it('should fall back to portrait when a wide container has no landscapes', () => {
            populateStore({ portraits: [{ id: 'p1' }] });
            vi.spyOn(Math, 'random').mockReturnValue(0);

            expect(PhotoStore.selectPhotoForContainer($, 1.5, false).attr('id')).toBe('p1');
        });

        it('should select from all photos when the match roll fails', () => {
            populateStore({ portraits: [{ id: 'p1' }], landscapes: [{ id: 'l1' }] });
            // Roll >= ORIENTATION_MATCH_PROBABILITY skips matching. $.fn.random then
            // uses the same value: 0.99 * 2 -> index 1 of [landscape, portrait] (DOM order).
            vi.spyOn(Math, 'random').mockReturnValue(0.99);

            const result = PhotoStore.selectPhotoForContainer($, 1.5, false);
            expect(result.attr('id')).toBe('p1');
        });

        it('should select randomly when forceRandom is true', () => {
            populateStore({ portraits: [{ id: 'p1' }], landscapes: [{ id: 'l1' }] });
            // With forceRandom the match roll is never taken. Math.random = 0 picks
            // the first photo in the combined set (the landscape), even though a tall
            // container would prefer the portrait under matching.
            vi.spyOn(Math, 'random').mockReturnValue(0);

            const result = PhotoStore.selectPhotoForContainer($, 0.5, true);
            expect(result.attr('id')).toBe('l1');
        });

        it('should select from populated store (happy path)', () => {
            populateStore({
                portraits: [{ id: 'p1' }, { id: 'p2' }],
                landscapes: [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }]
            });

            const result = PhotoStore.selectPhotoForContainer($, 1.5, false);
            expect(result).toBeTruthy();
            expect(['portrait', 'landscape']).toContain(result.data('orientation'));
        });

        it('should exercise orientation matching probability with both orientations available', () => {
            populateStore({
                portraits: [{ id: 'p1' }, { id: 'p2' }],
                landscapes: [{ id: 'l1' }, { id: 'l2' }]
            });

            // Select many times, putting each photo back so the store never depletes
            function run(aspect, iterations) {
                const counts = { portrait: 0, landscape: 0 };
                for (let i = 0; i < iterations; i++) {
                    const result = PhotoStore.selectPhotoForContainer($, aspect, false);
                    expect(result).toBeTruthy();
                    counts[result.data('orientation')]++;
                    addToStore(result);
                }
                return counts;
            }

            const iterations = 200;
            // With ORIENTATION_MATCH_PROBABILITY = 0.7 the preferred orientation is chosen
            // ~70% of the time plus half of the remainder (random pick): ~85% overall.
            // Threshold of 55% is far below the mean.
            const tall = run(0.5, iterations);
            expect(tall.portrait).toBeGreaterThan(tall.landscape);
            expect(tall.portrait).toBeGreaterThan(iterations * 0.55);

            const wide = run(2.0, iterations);
            expect(wide.landscape).toBeGreaterThan(wide.portrait);
            expect(wide.landscape).toBeGreaterThan(iterations * 0.55);
        });
    });

    describe('createStackedLandscapes', () => {
        it('should create stacked-landscapes div with two landscape photos', () => {
            populateStore({ landscapes: [{ id: 'landscape1' }, { id: 'landscape2' }] });

            const result = PhotoStore.createStackedLandscapes($, buildDiv, 4);

            expect(result).toBeTruthy();
            expect(result.hasClass('stacked-landscapes')).toBe(true);
            expect(result.hasClass('photo')).toBe(true);
            expect(result.hasClass('pure-u-1-4')).toBe(true);
            const boxes = result.children('.img_box');
            expect(boxes.length).toBe(2);
            expect(new Set(boxes.toArray().map(b => b.id))).toEqual(new Set(['landscape1', 'landscape2']));
            // Both photos were taken from the store
            expect(storeCount('landscape')).toBe(0);
        });

        it('should use the .stacked-landscapes child order the CSS relies on', () => {
            populateStore({ landscapes: [{ id: 'landscape1' }, { id: 'landscape2' }] });

            const result = PhotoStore.createStackedLandscapes($, buildDiv, 5);
            // CSS styles .stacked-landscapes .img_box:first-child and :last-child
            expect(result.children().first().hasClass('img_box')).toBe(true);
            expect(result.children().last().hasClass('img_box')).toBe(true);
            expect(result.children().first()[0]).not.toBe(result.children().last()[0]);
        });

        it('should leave extra landscapes in the store', () => {
            populateStore({ landscapes: [{ id: 'l1' }, { id: 'l2' }, { id: 'l3' }] });

            PhotoStore.createStackedLandscapes($, buildDiv, 4);
            expect(storeCount('landscape')).toBe(1);
        });

        it('should return null when fewer than 2 landscapes available', () => {
            populateStore({ landscapes: [{ id: 'landscape1' }] });

            expect(PhotoStore.createStackedLandscapes($, buildDiv, 4)).toBeNull();
            expect(storeCount('landscape')).toBe(1);
        });

        it('should return null when no landscapes available', () => {
            expect(PhotoStore.createStackedLandscapes($, buildDiv, 4)).toBeNull();
        });

        it('should ignore portraits', () => {
            populateStore({ portraits: [{ id: 'p1' }, { id: 'p2' }], landscapes: [{ id: 'l1' }] });

            expect(PhotoStore.createStackedLandscapes($, buildDiv, 4)).toBeNull();
            expect(storeCount('portrait')).toBe(2);
        });

        // Real DOM can't make random() return nothing for a non-empty set, so the
        // restore paths below simulate the detach race by stubbing $.fn.random once.
        describe('restoring photos when a pick fails', () => {
            function emptyThenReal() {
                return vi.spyOn($.fn, 'random')
                    .mockImplementationOnce(() => $())
                    .mockImplementation(realRandom);
            }

            function realThenEmpty() {
                return vi.spyOn($.fn, 'random')
                    .mockImplementationOnce(realRandom)
                    .mockImplementationOnce(() => $())
                    .mockImplementation(realRandom);
            }

            it('should restore firstPhoto to store when secondPhoto pick comes back empty', () => {
                populateStore({ landscapes: [{ id: 'landscape1' }, { id: 'landscape2' }] });
                realThenEmpty();

                const result = PhotoStore.createStackedLandscapes($, buildDiv, 4);

                expect(result).toBeNull();
                // firstPhoto was detached and must be back in #landscape
                expect(storeCount('landscape')).toBe(2);
            });

            it('should restore secondPhoto to store when firstPhoto random selection returns empty', () => {
                populateStore({ landscapes: [{ id: 'landscape1' }, { id: 'landscape2' }] });
                emptyThenReal();

                const result = PhotoStore.createStackedLandscapes($, buildDiv, 4);

                expect(result).toBeNull();
                // secondPhoto was detached successfully and should be restored
                expect(storeCount('landscape')).toBe(2);
            });

            it('should handle both picks coming back empty', () => {
                populateStore({ landscapes: [{ id: 'landscape1' }, { id: 'landscape2' }] });
                vi.spyOn($.fn, 'random').mockImplementation(() => $());

                const result = PhotoStore.createStackedLandscapes($, buildDiv, 4);

                expect(result).toBeNull();
                expect(storeCount('landscape')).toBe(2);
            });

            it('should keep jQuery data on a restored photo', () => {
                populateStore({ landscapes: [{ id: 'landscape1', aspect_ratio: 1.6 }, { id: 'landscape2', aspect_ratio: 1.6 }] });
                realThenEmpty();

                PhotoStore.createStackedLandscapes($, buildDiv, 4);

                expect($('#landscape div.img_box').first().data('orientation')).toBe('landscape');
                expect($('#landscape div.img_box').first().data('aspect_ratio')).toBe(1.6);
            });
        });
    });

    describe('calculatePanoramaColumns', () => {
        it('should return 3 columns for 2:1 ratio in 1920x1080 with 5 columns', () => {
            // Row height = 1080/2 = 540, cell width = 1920/5 = 384
            // Cell ratio = 384/540 ≈ 0.711, columns needed = ceil(2/0.711) = 3
            setViewport(1920, 1080);
            expect(PhotoStore.calculatePanoramaColumns($, 2.0, 5)).toBe(3);
        });

        it('should return 4 columns for 3:1 ratio in 1920x1080 with 5 columns', () => {
            // Cell ratio ≈ 0.711, columns needed = ceil(3/0.711) = ceil(4.22) = 5, clamped to 4
            setViewport(1920, 1080);
            expect(PhotoStore.calculatePanoramaColumns($, 3.0, 5)).toBe(4);
        });

        it('should return 3 columns for 3:1 ratio with 4 columns (normal mode)', () => {
            setViewport(1920, 1080);
            expect(PhotoStore.calculatePanoramaColumns($, 3.0, 4)).toBe(3);
        });

        it('should clamp to totalColumns-1 for very wide panoramas', () => {
            setViewport(1920, 1080);
            expect(PhotoStore.calculatePanoramaColumns($, 6.0, 5)).toBe(4);
            expect(PhotoStore.calculatePanoramaColumns($, 10.0, 4)).toBe(3);
        });

        it('should never return less than 2 columns', () => {
            // Very tall viewport makes cell ratio high, so fewer columns needed
            setViewport(500, 2000);
            expect(PhotoStore.calculatePanoramaColumns($, 2.0, 5)).toBeGreaterThanOrEqual(2);
        });

        it('should handle zero viewport height (division by zero guard)', () => {
            setViewport(1920, 0);
            // Guard returns max(2, totalColumns - 1)
            expect(PhotoStore.calculatePanoramaColumns($, 3.0, 5)).toBe(4);
        });

        it('should handle negative viewport height', () => {
            setViewport(1920, -100);
            expect(PhotoStore.calculatePanoramaColumns($, 3.0, 4)).toBe(3);
        });

        it('should return correct columns for 4:3 viewport with 4 columns', () => {
            // Row height = 768/2 = 384, cell width = 1024/4 = 256
            // Cell ratio = 256/384 ≈ 0.667, columns needed = ceil(2/0.667) = 3
            setViewport(1024, 768);
            expect(PhotoStore.calculatePanoramaColumns($, 2.0, 4)).toBe(3);
        });

        it('should handle various viewport sizes consistently', () => {
            const viewports = [
                { width: 1280, height: 720 },
                { width: 1920, height: 1080 },
                { width: 2560, height: 1440 },
                { width: 3840, height: 2160 },
                { width: 800, height: 600 },
            ];

            for (const vp of viewports) {
                setViewport(vp.width, vp.height);
                for (let columns = 3; columns <= 6; columns++) {
                    const result = PhotoStore.calculatePanoramaColumns($, 3.0, columns);
                    expect(result).toBeGreaterThanOrEqual(2);
                    expect(result).toBeLessThanOrEqual(columns - 1);
                }
            }
        });

        it('should return 2 when totalColumns is 3 (min equals max)', () => {
            // With 3 columns, min is 2 and max is 3-1=2, so always 2
            setViewport(1920, 1080);
            expect(PhotoStore.calculatePanoramaColumns($, 5.0, 3)).toBe(2);
        });

        it('should calculate columns for 2.5:1 panorama in 16:9 viewport with 5 columns', () => {
            // Row height = 540, cell width = 384, cell ratio ≈ 0.711
            // Columns needed = ceil(2.5/0.711) = ceil(3.52) = 4
            setViewport(1920, 1080);
            expect(PhotoStore.calculatePanoramaColumns($, 2.5, 5)).toBe(4);
        });
    });

    describe('selectRandomPhotoFromStore', () => {
        // Viewport is 1920x1080 (set by createDom)

        it('should return null when photo store is empty', () => {
            expect(PhotoStore.selectRandomPhotoFromStore($, 'normal')).toBeNull();
        });

        it('should return landscape photo with columns=2', () => {
            populateStore({ landscapes: [{ id: 'l1', aspect_ratio: 1.5 }] });

            const result = PhotoStore.selectRandomPhotoFromStore($, 'normal');
            expect(result).not.toBeNull();
            expect(result.orientation).toBe('landscape');
            expect(result.columns).toBe(2);
            expect(result.isPanorama).toBe(false);
            expect(result.$imgBox.attr('id')).toBe('l1');
        });

        it('should return portrait photo with columns=1', () => {
            populateStore({ portraits: [{ id: 'p1', aspect_ratio: 0.67 }] });

            const result = PhotoStore.selectRandomPhotoFromStore($, 'normal');
            expect(result).not.toBeNull();
            expect(result.orientation).toBe('portrait');
            expect(result.columns).toBe(1);
            expect(result.isPanorama).toBe(false);
        });

        it('should use 5 columns for wide window_ratio', () => {
            populateStore({ portraits: [{ id: 'p1', aspect_ratio: 0.67 }] });

            const result = PhotoStore.selectRandomPhotoFromStore($, 'wide');
            expect(result).not.toBeNull();
            // Portrait always gets 1 column regardless of total columns
            expect(result.columns).toBe(1);
        });

        it('should use 4 columns for normal window_ratio', () => {
            populateStore({ landscapes: [{ id: 'l1', aspect_ratio: 1.5 }] });

            const result = PhotoStore.selectRandomPhotoFromStore($, 'normal');
            expect(result).not.toBeNull();
            expect(result.columns).toBe(2);
        });

        it('should select panorama with probability when panoramas available', () => {
            populateStore({
                portraits: [{ id: 'p1', aspect_ratio: 0.67 }],
                landscapes: [{ id: 'l1', aspect_ratio: 1.5 }],
                panoramas: [{ id: 'pano1', aspect_ratio: 3.0 }]
            });

            // Run many times to observe panorama selection, restoring the store each time
            let panoramaCount = 0;
            const iterations = 200;
            for (let i = 0; i < iterations; i++) {
                const result = PhotoStore.selectRandomPhotoFromStore($, 'normal');
                if (result.isPanorama) {
                    panoramaCount++;
                }
                addToStore(result.$imgBox);
            }

            // PANORAMA_USE_PROBABILITY = 0.5, so expect ~50% panoramas
            // Allow reasonable variance: between 25% and 75%
            expect(panoramaCount).toBeGreaterThan(iterations * 0.25);
            expect(panoramaCount).toBeLessThan(iterations * 0.75);
        });

        it('should return panorama with calculated column count', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.1); // Force panorama selection (< 0.5)
            populateStore({ panoramas: [{ id: 'pano1', aspect_ratio: 3.0 }] });

            const result = PhotoStore.selectRandomPhotoFromStore($, 'normal');
            expect(result).not.toBeNull();
            expect(result.isPanorama).toBe(true);
            expect(result.orientation).toBe('panorama');
            // 3:1 ratio in 1920x1080 with 4 cols: cellRatio = (1920/4)/(1080/2) = 480/540 ≈ 0.889
            // columnsNeeded = ceil(3/0.889) = ceil(3.375) = 4, clamped to totalColumns-1 = 3
            expect(result.columns).toBe(3);
            // The panorama was taken from the store
            expect(storeCount('panorama')).toBe(0);
        });

        it('should return panorama with correct columns in wide mode', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.1); // Force panorama selection (< 0.5)
            populateStore({ panoramas: [{ id: 'pano1', aspect_ratio: 3.0 }] });

            const result = PhotoStore.selectRandomPhotoFromStore($, 'wide');
            expect(result).not.toBeNull();
            expect(result.isPanorama).toBe(true);
            // 3:1 ratio in 1920x1080 with 5 cols: cellRatio = (1920/5)/(1080/2) = 384/540 ≈ 0.711
            // columnsNeeded = ceil(3/0.711) = ceil(4.22) = 5, clamped to 4
            expect(result.columns).toBe(4);
        });

        it('should handle panorama flag from data attribute on non-panorama-store photo', () => {
            // A photo can have panorama=true in its data but be stored in landscape
            // (e.g., aspect_ratio > PANORAMA_ASPECT_THRESHOLD but not in #panorama store)
            populateStore({ landscapes: [{ id: 'l1', aspect_ratio: 2.5, panorama: true }] });

            const result = PhotoStore.selectRandomPhotoFromStore($, 'normal');
            expect(result).not.toBeNull();
            expect(result.isPanorama).toBe(true);
            // Should calculate panorama columns instead of defaulting to 2
            // 2.5:1 ratio in 1920x1080 with 4 cols: cellRatio = 480/540 ≈ 0.889
            // columnsNeeded = ceil(2.5/0.889) = ceil(2.81) = 3
            expect(result.columns).toBe(3);
        });

        it('should bypass orientation matching when forceRandom is active at edge positions', () => {
            // When isEdgePosition=true and the forceRandom coin flip succeeds,
            // selectPhotoForContainer receives forceRandom=true, bypassing
            // orientation matching and selecting randomly from all photos.
            //
            // With Math.random = 0:
            //   - panorama check: no panoramas
            //   - forceRandom: isEdgePosition && 0 < 0.5 -> true
            //   - selectPhotoForContainer: forceRandom=true -> random from all, index 0
            //     of the combined set in DOM order (#landscape before #portrait)
            vi.spyOn(Math, 'random').mockReturnValue(0);
            populateStore({
                portraits: [{ id: 'p1', aspect_ratio: 0.67 }],
                landscapes: [{ id: 'l1', aspect_ratio: 1.5 }]
            });

            // Tall container (0.3) would prefer the portrait under orientation matching
            const result = PhotoStore.selectRandomPhotoFromStore($, 'normal', 0.3, true);
            expect(result).not.toBeNull();
            expect(result.orientation).toBe('landscape');
        });

        it('should not force random when edge position coin flip fails', () => {
            // When isEdgePosition=true but the coin flip fails (Math.random >= 0.5),
            // forceRandom is false, so normal orientation matching applies
            vi.spyOn(Math, 'random').mockReturnValue(0.6);
            populateStore({
                portraits: [{ id: 'p1', aspect_ratio: 0.67 }],
                landscapes: [{ id: 'l1', aspect_ratio: 1.5 }]
            });

            // With Math.random=0.6: forceRandom = true && 0.6 < 0.5 -> false
            // ORIENTATION_MATCH_PROBABILITY check: 0.6 < 0.7 -> true (use matching)
            // Container aspect will determine which orientation is preferred
            const result = PhotoStore.selectRandomPhotoFromStore($, 'normal', 0.3, true);
            expect(result).not.toBeNull();
            // With matching enabled and tall container (0.3), prefers portrait
            expect(result.orientation).toBe('portrait');
        });

        it('should return result with all expected properties', () => {
            populateStore({ portraits: [{ id: 'p1', aspect_ratio: 0.67 }] });

            const result = PhotoStore.selectRandomPhotoFromStore($, 'normal');
            expect(result).not.toBeNull();
            expect(result).toHaveProperty('$imgBox');
            expect(result).toHaveProperty('orientation');
            expect(result).toHaveProperty('aspectRatio');
            expect(result).toHaveProperty('isPanorama');
            expect(result).toHaveProperty('columns');
            expect(result.aspectRatio).toBe(0.67);
        });

        it('should not select panorama when Math.random >= PANORAMA_USE_PROBABILITY', () => {
            vi.spyOn(Math, 'random').mockReturnValue(Math.max(PANORAMA_USE_PROBABILITY, 0.99));
            populateStore({
                portraits: [{ id: 'p1', aspect_ratio: 0.67 }],
                panoramas: [{ id: 'pano1', aspect_ratio: 3.0 }]
            });

            const result = PhotoStore.selectRandomPhotoFromStore($, 'normal');
            expect(result).not.toBeNull();
            // Panorama skipped; falls through to selectPhotoForContainer, which finds the portrait
            expect(result.isPanorama).toBe(false);
            expect(result.orientation).toBe('portrait');
            expect(storeCount('panorama')).toBe(1);
        });

        it('should select panorama when Math.random < PANORAMA_USE_PROBABILITY', () => {
            vi.spyOn(Math, 'random').mockReturnValue(PANORAMA_USE_PROBABILITY - 0.4);
            populateStore({
                portraits: [{ id: 'p1', aspect_ratio: 0.67 }],
                panoramas: [{ id: 'pano1', aspect_ratio: 3.0 }]
            });

            const result = PhotoStore.selectRandomPhotoFromStore($, 'normal');
            expect(result).not.toBeNull();
            expect(result.isPanorama).toBe(true);
            expect(result.orientation).toBe('panorama');
        });

        it('should skip panorama selection when no panoramas in store', () => {
            populateStore({
                portraits: [{ id: 'p1', aspect_ratio: 0.67 }],
                landscapes: [{ id: 'l1', aspect_ratio: 1.5 }]
            });

            // Should never return panorama even after many tries
            for (let i = 0; i < 20; i++) {
                const result = PhotoStore.selectRandomPhotoFromStore($, 'normal');
                expect(result).not.toBeNull();
                expect(result.isPanorama).toBe(false);
                addToStore(result.$imgBox);
            }
        });

        it('should handle panorama detach returning empty gracefully', () => {
            // Edge case: panoramas.length > 0 but .random().detach() returns empty
            // (possible race condition in real DOM between length check and detach).
            // Real DOM can't do that, so stub $.fn.random to return an empty set once.
            vi.spyOn(Math, 'random').mockReturnValue(0.1); // Force panorama path (< 0.5)
            vi.spyOn($.fn, 'random').mockImplementationOnce(() => $());
            populateStore({ panoramas: [{ id: 'pano1', aspect_ratio: 3.0 }] });

            // When panorama detach returns empty, the function builds a result
            // with undefined data values — verify it doesn't throw
            const result = PhotoStore.selectRandomPhotoFromStore($, 'normal');
            // Function returns a result object even with undefined data
            // (this is a known limitation — no guard after detach)
            expect(result).not.toBeNull();
            expect(result.isPanorama).toBe(true);
            expect(result.columns).toBeTypeOf('number');
        });

        it('should use containerAspectRatio when provided', () => {
            // With a very tall container (aspectRatio < 1), should tend to select portrait
            populateStore({
                portraits: [{ id: 'p1', aspect_ratio: 0.67 }],
                landscapes: [{ id: 'l1', aspect_ratio: 1.5 }]
            });

            let portraitCount = 0;
            const iterations = 100;
            for (let i = 0; i < iterations; i++) {
                const result = PhotoStore.selectRandomPhotoFromStore($, 'normal', 0.3, false);
                if (result.orientation === 'portrait') {
                    portraitCount++;
                }
                addToStore(result.$imgBox);
            }

            // With containerAspectRatio=0.3 (very tall), ORIENTATION_MATCH_PROBABILITY=0.7
            // should result in ~70% portrait selections
            expect(portraitCount).toBeGreaterThan(iterations * 0.5);
        });
    });

    describe('makeSpaceForPhoto', () => {
        it('should return null when target photo not in row', () => {
            addToRow('#top_row', makePhotoDiv(makeImgBox(), { columns: 2 }));
            const $stranger = makePhotoDiv(makeImgBox(), { columns: 2 });

            expect(PhotoStore.makeSpaceForPhoto($, '#top_row', $stranger, 2)).toBeNull();
        });

        it('should return null when not enough space available', () => {
            const $photo = makePhotoDiv(makeImgBox(), { cls: 'pure-u-1-4' });
            addToRow('#top_row', $photo);

            // Request 5 columns but only 1 available (no adjacent photos)
            expect(PhotoStore.makeSpaceForPhoto($, '#top_row', $photo, 5)).toBeNull();
        });

        it('should return the target alone when it already spans enough columns', () => {
            const $a = makePhotoDiv(makeImgBox(), { columns: 1 });
            const $b = makePhotoDiv(makeImgBox(), { columns: 2 });
            addToRow('#top_row', [$a, $b]);

            const result = PhotoStore.makeSpaceForPhoto($, '#top_row', $b, 2);
            expect(result.photosToRemove.map(p => p[0])).toEqual([$b[0]]);
            expect(result.totalColumns).toBe(2);
            expect(result.insertionIndex).toBe(1);
        });

        it('should expand toward a neighbor until enough columns are freed', () => {
            const $a = makePhotoDiv(makeImgBox(), { columns: 1 });
            const $b = makePhotoDiv(makeImgBox(), { columns: 2 });
            const $c = makePhotoDiv(makeImgBox(), { columns: 2 });
            addToRow('#top_row', [$a, $b, $c]);

            vi.spyOn(Math, 'random').mockReturnValue(0); // start direction: left
            const left = PhotoStore.makeSpaceForPhoto($, '#top_row', $b, 3);
            expect(left.photosToRemove.map(p => p[0])).toEqual([$b[0], $a[0]]);
            expect(left.totalColumns).toBe(3);
            expect(left.insertionIndex).toBe(0);

            Math.random.mockReturnValue(0.9); // start direction: right
            const right = PhotoStore.makeSpaceForPhoto($, '#top_row', $b, 3);
            expect(right.photosToRemove.map(p => p[0])).toEqual([$b[0], $c[0]]);
            expect(right.totalColumns).toBe(4);
            expect(right.insertionIndex).toBe(1);
        });
    });

    describe('fillRemainingSpace', () => {
        it('should return empty array when no columns remaining', () => {
            const $newPhoto = makePhotoDiv(makeImgBox(), { columns: 4 });
            const result = PhotoStore.fillRemainingSpace($, buildDiv, '#top_row', $newPhoto, 0, 4);
            expect(result).toEqual([]);
        });

        it('should handle empty photo store gracefully', () => {
            const $newPhoto = makePhotoDiv(makeImgBox(), { columns: 3 });

            // Nothing in the store and nothing on the page to clone
            expect(PhotoStore.fillRemainingSpace($, buildDiv, '#top_row', $newPhoto, 1, 4)).toEqual([]);
            expect(PhotoStore.fillRemainingSpace($, buildDiv, '#top_row', $newPhoto, 2, 4)).toEqual([]);
        });

        it('should fill 2 remaining columns with a landscape from the store', () => {
            populateStore({ landscapes: [{ id: 'l1' }] });
            const $newPhoto = makePhotoDiv(makeImgBox(), { columns: 2 });
            vi.spyOn(Math, 'random').mockReturnValue(0);

            const result = PhotoStore.fillRemainingSpace($, buildDiv, '#top_row', $newPhoto, 2, 4);
            expect(result.length).toBe(1);
            expect(result[0].data('columns')).toBe(2);
            expect(result[0].data('display_time')).toBeTypeOf('number');
            expect(result[0].hasClass('pure-u-2-4')).toBe(true);
            expect(result[0].find('#l1').length).toBe(1);
            expect(storeCount('landscape')).toBe(0);
        });

        it('should fill the last column with a portrait when stacking is not chosen', () => {
            populateStore({ portraits: [{ id: 'p1' }], landscapes: [{ id: 'l1' }, { id: 'l2' }] });
            const $newPhoto = makePhotoDiv(makeImgBox(), { columns: 3 });
            // 0.99: no edge-position force and STACKED_LANDSCAPES_PROBABILITY roll fails
            vi.spyOn(Math, 'random').mockReturnValue(0.99);

            const result = PhotoStore.fillRemainingSpace($, buildDiv, '#top_row', $newPhoto, 1, 4);
            expect(result.length).toBe(1);
            expect(result[0].data('columns')).toBe(1);
            expect(result[0].find('#p1').length).toBe(1);
            expect(result[0].hasClass('stacked-landscapes')).toBe(false);
        });

        it('should fill the last column with stacked landscapes when no portraits remain', () => {
            populateStore({ landscapes: [{ id: 'l1' }, { id: 'l2' }] });
            const $newPhoto = makePhotoDiv(makeImgBox(), { columns: 3 });

            const result = PhotoStore.fillRemainingSpace($, buildDiv, '#top_row', $newPhoto, 1, 4);
            expect(result.length).toBe(1);
            expect(result[0].hasClass('stacked-landscapes')).toBe(true);
            expect(result[0].data('columns')).toBe(1);
        });

        it('should clone a page photo for the last column when the store is empty', () => {
            populateRow('#top_row', [{ id: 'onpage', orientation: 'landscape' }]);
            const $newPhoto = makePhotoDiv(makeImgBox(), { columns: 3 });

            const result = PhotoStore.fillRemainingSpace($, buildDiv, '#top_row', $newPhoto, 1, 4);
            expect(result.length).toBe(1);
            expect(result[0].data('columns')).toBe(1);
            expect(result[0].find('#onpage').length).toBe(1);
        });
    });
});
