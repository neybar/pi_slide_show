/**
 * Photo Store Module Tests
 *
 * Tests for www/js/photo-store.mjs functions that manage photo selection,
 * weighted replacement, and space management for the slideshow.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as PhotoStore from '../../www/js/photo-store.mjs';

// Create a global window stub for Node.js test environment
// photo-store.mjs references window via $(window)
global.window = {};

// Mock jQuery - minimal implementation for testing
class MockJQuery {
    constructor(selector, elements = []) {
        this.selector = selector;
        this.elements = elements;
        this.length = elements.length;
        this.dataStore = new Map();
    }

    find(selector) {
        // Simple find implementation for testing
        return new MockJQuery(selector, []);
    }

    filter(fn) {
        const filtered = this.elements.filter((el, i) => fn.call(el, i));
        return new MockJQuery(this.selector, filtered);
    }

    each(fn) {
        this.elements.forEach((el, i) => {
            fn.call(el, i);
        });
    }

    eq(index) {
        const el = this.elements[index];
        return el ? new MockJQuery(this.selector, [el]) : new MockJQuery(this.selector, []);
    }

    prev(selector) {
        return new MockJQuery(selector, []);
    }

    next(selector) {
        return new MockJQuery(selector, []);
    }

    attr(name, value) {
        if (arguments.length === 1) {
            // Getter - handle 'class' attribute specially
            if (name === 'class') {
                return this.elements[0]?.className || null;
            }
            return this.elements[0]?.[name] || null;
        }
        // Setter
        this.elements.forEach(el => {
            if (name === 'class') {
                el.className = value;
            } else {
                el[name] = value;
            }
        });
        return this;
    }

    data(key, value) {
        if (typeof key === 'object') {
            // Set multiple data attributes
            Object.entries(key).forEach(([k, v]) => {
                this.dataStore.set(k, v);
            });
            return this;
        }
        if (arguments.length === 1) {
            // Getter
            return this.dataStore.get(key);
        }
        // Setter
        this.dataStore.set(key, value);
        return this;
    }

    clone(deep) {
        const newElements = this.elements.map(el => ({ ...el }));
        const cloned = new MockJQuery(this.selector, newElements);
        // Note: clone(false) doesn't copy dataStore in real jQuery
        if (deep) {
            cloned.dataStore = new Map(this.dataStore);
        }
        return cloned;
    }

    index($element) {
        if ($element && $element.elements && $element.elements[0]) {
            return this.elements.indexOf($element.elements[0]);
        }
        return -1;
    }

    addClass(className) {
        this.elements.forEach(el => {
            el.className = (el.className || '') + ' ' + className;
        });
        return this;
    }

    random() {
        if (this.length === 0) return new MockJQuery(this.selector, []);
        const randomIndex = Math.floor(Math.random() * this.length);
        return new MockJQuery(this.selector, [this.elements[randomIndex]]);
    }

    detach() {
        // Mark as detached and return self
        this.detached = true;
        return this;
    }

    append(element) {
        if (element.elements) {
            this.elements.push(...element.elements);
        } else {
            this.elements.push(element);
        }
        return this;
    }

    remove() {
        this.elements = [];
        return this;
    }

    css(prop, value) {
        return this;
    }
}

// Mock $ function
function createMock$() {
    return function(selector) {
        if (typeof selector === 'string') {
            if (selector === '#photo_store') {
                return mockPhotoStore;
            } else if (selector === '#top_row .img_box, #bottom_row .img_box') {
                return new MockJQuery(selector, []);
            }
            return new MockJQuery(selector, []);
        }
        // Handle window object selector
        if (selector && typeof selector === 'object') {
            return mockWindow;
        }
        return new MockJQuery('element', [selector]);
    };
}

let mockPhotoStore;
let mockWindow;
let mock$;

beforeEach(() => {
    // Reset mocks before each test
    mockPhotoStore = new MockJQuery('#photo_store', []);
    mockPhotoStore.find = function(selector) {
        if (selector === '#portrait div.img_box') {
            return new MockJQuery(selector, []);
        } else if (selector === '#landscape div.img_box') {
            return new MockJQuery(selector, []);
        } else if (selector === '#panorama div.img_box') {
            return new MockJQuery(selector, []);
        } else if (selector === '#portrait' || selector === '#landscape' || selector === '#panorama') {
            const orientation = selector.replace('#', '');
            const mockOrientationStore = new MockJQuery(selector, []);
            mockOrientationStore.append = function(element) {
                return this;
            };
            return mockOrientationStore;
        }
        return new MockJQuery(selector, []);
    };

    // Mock window object (doesn't exist in Node.js test environment)
    const mockWindowObject = {};
    mockWindow = new MockJQuery(mockWindowObject, []);
    mockWindow.width = () => 1920;
    mockWindow.height = () => 1080;

    mock$ = createMock$();
});

describe('Photo Store Module', () => {
    describe('getPhotoColumns', () => {
        it('should extract columns from pure-u-1-4 class', () => {
            const $photo = new MockJQuery('.photo', [{ className: 'photo pure-u-1-4' }]);
            const columns = PhotoStore.getPhotoColumns($photo);
            expect(columns).toBe(1);
        });

        it('should extract columns from pure-u-2-5 class', () => {
            const $photo = new MockJQuery('.photo', [{ className: 'photo pure-u-2-5' }]);
            const columns = PhotoStore.getPhotoColumns($photo);
            expect(columns).toBe(2);
        });

        it('should extract columns from pure-u-1-5 class', () => {
            const $photo = new MockJQuery('.photo', [{ className: 'photo pure-u-1-5' }]);
            const columns = PhotoStore.getPhotoColumns($photo);
            expect(columns).toBe(1);
        });

        it('should return 1 if no pure-u class found', () => {
            const $photo = new MockJQuery('.photo', [{ className: 'photo' }]);
            const columns = PhotoStore.getPhotoColumns($photo);
            expect(columns).toBe(1);
        });

        it('should return 1 if no class attribute', () => {
            const $photo = new MockJQuery('.photo', [{}]);
            const columns = PhotoStore.getPhotoColumns($photo);
            expect(columns).toBe(1);
        });
    });

    describe('getAdjacentPhoto', () => {
        it('should return left neighbor when direction is left', () => {
            const prev = new MockJQuery('.photo', [{ id: 'prev' }]);
            const $photo = new MockJQuery('.photo', [{ id: 'current' }]);
            $photo.prev = () => prev;

            const result = PhotoStore.getAdjacentPhoto($photo, 'left');
            expect(result).toBe(prev);
        });

        it('should return right neighbor when direction is right', () => {
            const next = new MockJQuery('.photo', [{ id: 'next' }]);
            const $photo = new MockJQuery('.photo', [{ id: 'current' }]);
            $photo.next = () => next;

            const result = PhotoStore.getAdjacentPhoto($photo, 'right');
            expect(result).toBe(next);
        });

        it('should return null when no left neighbor', () => {
            const $photo = new MockJQuery('.photo', [{ id: 'current' }]);
            $photo.prev = () => new MockJQuery('.photo', []);

            const result = PhotoStore.getAdjacentPhoto($photo, 'left');
            expect(result).toBeNull();
        });

        it('should return null when no right neighbor', () => {
            const $photo = new MockJQuery('.photo', [{ id: 'current' }]);
            $photo.next = () => new MockJQuery('.photo', []);

            const result = PhotoStore.getAdjacentPhoto($photo, 'right');
            expect(result).toBeNull();
        });

        it('should return null for invalid direction', () => {
            const $photo = new MockJQuery('.photo', [{ id: 'current' }]);
            const result = PhotoStore.getAdjacentPhoto($photo, 'invalid');
            expect(result).toBeNull();
        });
    });

    describe('selectPhotoToReplace', () => {
        it('should return null when no photos in row', () => {
            const $row = new MockJQuery('#top_row', []);
            $row.find = () => new MockJQuery('.photo', []);

            const result = PhotoStore.selectPhotoToReplace(mock$, '#top_row');
            expect(result).toBeNull();
        });

        it('should return null when no photos have display_time', () => {
            const photo1 = {};
            const $photo1 = new MockJQuery('.photo', [photo1]);
            const $row = new MockJQuery('#top_row', []);
            $row.find = () => {
                const $photos = new MockJQuery('.photo', [photo1]);
                $photos.each = function(fn) {
                    fn.call($photo1, 0);
                };
                return $photos;
            };

            const result = PhotoStore.selectPhotoToReplace(mock$, '#top_row');
            expect(result).toBeNull();
        });

        it('should select photo with higher weight (older photo)', () => {
            const now = Date.now();
            const oldPhoto = {};
            const newPhoto = {};

            const $oldPhoto = new MockJQuery('.photo', [oldPhoto]);
            $oldPhoto.data('display_time', now - 60000); // 1 minute ago

            const $newPhoto = new MockJQuery('.photo', [newPhoto]);
            $newPhoto.data('display_time', now - 5000); // 5 seconds ago

            const $row = new MockJQuery('#top_row', []);
            $row.find = () => {
                const $photos = new MockJQuery('.photo', [oldPhoto, newPhoto]);
                $photos.each = function(fn) {
                    // Call fn for each photo element
                    // The mock$ function will be called with 'this' context
                    mock$(oldPhoto); // Make sure mock$ can wrap the element
                    mock$(newPhoto);
                    fn.call(oldPhoto, 0);
                    fn.call(newPhoto, 1);
                };
                $photos.length = 2;
                return $photos;
            };

            // Update mock$ to handle wrapping elements
            const originalMock$ = mock$;
            mock$ = function(selector) {
                if (selector === oldPhoto) {
                    return $oldPhoto;
                } else if (selector === newPhoto) {
                    return $newPhoto;
                } else if (selector === '#top_row') {
                    return $row;
                }
                return originalMock$(selector);
            };

            // Run multiple times to verify weighted selection favors older photo
            const selections = new Map();
            for (let i = 0; i < 100; i++) {
                const result = PhotoStore.selectPhotoToReplace(mock$, '#top_row');
                // Compare underlying elements, not jQuery wrapper objects
                const key = result && result.elements[0] === oldPhoto ? 'old' : 'new';
                selections.set(key, (selections.get(key) || 0) + 1);
            }

            // Older photo should be selected significantly more often
            // With 60s vs 5s weights, expect ~92% old, ~8% new
            expect(selections.get('old')).toBeGreaterThan(selections.get('new') || 0);
        });
    });

    describe('clonePhotoFromPage', () => {
        it('should return null when no photos on page', () => {
            mock$ = function(selector) {
                return new MockJQuery(selector, []);
            };

            const result = PhotoStore.clonePhotoFromPage(mock$);
            expect(result).toBeNull();
        });

        it('should clone a random photo when photos exist', () => {
            const photo1 = { id: 'photo1' };
            const $photo1 = new MockJQuery('.img_box', [photo1]);
            $photo1.data({
                height: 1080,
                width: 1920,
                aspect_ratio: 1.78,
                orientation: 'landscape',
                panorama: false
            });

            mock$ = function(selector) {
                if (selector === '#top_row .img_box, #bottom_row .img_box') {
                    const $allPhotos = new MockJQuery(selector, [photo1]);
                    $allPhotos.random = () => $photo1;
                    return $allPhotos;
                }
                return new MockJQuery(selector, []);
            };

            const result = PhotoStore.clonePhotoFromPage(mock$);
            expect(result).toBeTruthy();
            expect(result.data('height')).toBe(1080);
            expect(result.data('orientation')).toBe('landscape');
        });

        it('should prefer matching orientation when specified', () => {
            const landscape = { id: 'landscape' };
            const portrait = { id: 'portrait' };

            const $landscape = new MockJQuery('.img_box', [landscape]);
            $landscape.data({ orientation: 'landscape' });

            const $portrait = new MockJQuery('.img_box', [portrait]);
            $portrait.data({ orientation: 'portrait' });

            mock$ = function(selector) {
                if (selector === '#top_row .img_box, #bottom_row .img_box') {
                    const $allPhotos = new MockJQuery(selector, [landscape, portrait]);
                    $allPhotos.filter = function(filterFn) {
                        if (filterFn.call($landscape)) {
                            const filtered = new MockJQuery(selector, [landscape]);
                            filtered.random = () => $landscape;
                            return filtered;
                        }
                        return new MockJQuery(selector, []);
                    };
                    $allPhotos.random = () => $landscape;
                    return $allPhotos;
                }
                return new MockJQuery(selector, []);
            };

            const result = PhotoStore.clonePhotoFromPage(mock$, 'landscape');
            expect(result).toBeTruthy();
        });
    });

    describe('selectPhotoForContainer', () => {
        it('should return null when no photos available and clone fails', () => {
            mock$ = function(selector) {
                if (selector === '#photo_store') {
                    const store = new MockJQuery(selector, []);
                    store.find = () => new MockJQuery('div.img_box', []);
                    return store;
                }
                if (selector === '#top_row .img_box, #bottom_row .img_box') {
                    return new MockJQuery(selector, []);
                }
                return new MockJQuery(selector, []);
            };

            const result = PhotoStore.selectPhotoForContainer(mock$, 1.5, false);
            expect(result).toBeNull();
        });

        it('should prefer portrait for tall containers when matching enabled', () => {
            const portrait = { id: 'portrait' };
            const $portrait = new MockJQuery('.img_box', [portrait]);
            $portrait.detach = () => $portrait;

            mock$ = function(selector) {
                if (selector === '#photo_store') {
                    const store = new MockJQuery(selector, []);
                    store.find = (sel) => {
                        if (sel === '#portrait div.img_box') {
                            const portraits = new MockJQuery(sel, [portrait]);
                            portraits.random = () => $portrait;
                            portraits.length = 1;
                            return portraits;
                        }
                        if (sel === '#landscape div.img_box') {
                            return new MockJQuery(sel, []);
                        }
                        return new MockJQuery(sel, []);
                    };
                    return store;
                }
                return new MockJQuery(selector, []);
            };

            // Container aspect ratio < 1 means taller than wide
            // With ~70% chance of matching, should get portrait
            const selections = [];
            for (let i = 0; i < 10; i++) {
                const result = PhotoStore.selectPhotoForContainer(mock$, 0.5, false);
                selections.push(result === $portrait);
            }

            // Should select portrait at least some of the time
            expect(selections.filter(Boolean).length).toBeGreaterThan(0);
        });

        it('should select randomly when forceRandom is true', () => {
            const portrait = { id: 'portrait' };
            const landscape = { id: 'landscape' };
            const $portrait = new MockJQuery('.img_box', [portrait]);
            const $landscape = new MockJQuery('.img_box', [landscape]);

            mock$ = function(selector) {
                if (selector === '#photo_store') {
                    const store = new MockJQuery(selector, []);
                    let detachCalled = false;
                    store.find = (sel) => {
                        if (sel === '#portrait div.img_box') {
                            return new MockJQuery(sel, [portrait]);
                        }
                        if (sel === '#landscape div.img_box') {
                            return new MockJQuery(sel, [landscape]);
                        }
                        if (sel === '#portrait div.img_box, #landscape div.img_box') {
                            const all = new MockJQuery(sel, [portrait, landscape]);
                            all.random = () => {
                                const selected = new MockJQuery(sel, detachCalled ? [landscape] : [portrait]);
                                // Copy dataStore from the source object
                                selected.dataStore = new Map(detachCalled ? $landscape.dataStore : $portrait.dataStore);
                                detachCalled = !detachCalled;
                                return selected;
                            };
                            all.length = 2;
                            return all;
                        }
                        return new MockJQuery(sel, []);
                    };
                    return store;
                }
                return new MockJQuery(selector, []);
            };

            // forceRandom = true should bypass orientation matching
            const result = PhotoStore.selectPhotoForContainer(mock$, 0.5, true);
            expect(result).toBeTruthy();
        });
    });

    describe('Edge cases', () => {
        it('makeSpaceForPhoto should return null when target photo not in row', () => {
            const $photo = new MockJQuery('.photo', [{ id: 'photo1' }]);
            const $row = new MockJQuery('#top_row', []);
            $row.find = () => {
                const $allPhotos = new MockJQuery('.photo', []);
                $allPhotos.index = () => -1; // Not found
                return $allPhotos;
            };

            mock$ = function(selector) {
                if (selector === '#top_row') return $row;
                return new MockJQuery(selector, []);
            };

            const result = PhotoStore.makeSpaceForPhoto(mock$, '#top_row', $photo, 2);
            expect(result).toBeNull();
        });

        it('makeSpaceForPhoto should return null when not enough space available', () => {
            const $photo = new MockJQuery('.photo', [{ id: 'photo1', className: 'pure-u-1-4' }]);
            const $row = new MockJQuery('#top_row', []);
            $row.find = () => {
                const $allPhotos = new MockJQuery('.photo', [{ id: 'photo1' }]);
                $allPhotos.index = () => 0;
                $allPhotos.eq = () => $photo;
                $allPhotos.length = 1;
                return $allPhotos;
            };

            mock$ = function(selector) {
                if (selector === '#top_row') return $row;
                return new MockJQuery(selector, []);
            };

            // Request 5 columns but only 1 available (no adjacent photos)
            const result = PhotoStore.makeSpaceForPhoto(mock$, '#top_row', $photo, 5);
            expect(result).toBeNull();
        });

        it('fillRemainingSpace should return empty array when no columns remaining', () => {
            // Setup mock$ to handle window selector
            // In Node.js test environment, window doesn't exist, so we check for object type
            mock$ = function(selector) {
                if (typeof selector === 'object' && !selector.selector) {
                    return mockWindow;
                }
                return new MockJQuery(selector, []);
            };

            const $newPhoto = new MockJQuery('.photo', [{}]);
            const result = PhotoStore.fillRemainingSpace(mock$, () => {}, '#top_row', $newPhoto, 0, 4);
            expect(result).toEqual([]);
        });

        it('fillRemainingSpace should handle empty photo store gracefully', () => {
            mock$ = function(selector) {
                if (selector === '#photo_store') {
                    const store = new MockJQuery(selector, []);
                    store.find = () => new MockJQuery('div.img_box', []);
                    return store;
                }
                if (selector === window) return mockWindow;
                if (selector === '#top_row .img_box, #bottom_row .img_box') {
                    return new MockJQuery(selector, []);
                }
                return new MockJQuery(selector, []);
            };

            const $newPhoto = new MockJQuery('.photo', [{}]);
            const build_div = (photo, width, columns) => {
                return new MockJQuery('.photo', [{}]);
            };

            const result = PhotoStore.fillRemainingSpace(mock$, build_div, '#top_row', $newPhoto, 1, 4);
            // Should attempt to fill but may return empty if no photos available
            expect(Array.isArray(result)).toBe(true);
        });
    });
});
