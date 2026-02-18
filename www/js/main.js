(function() {
    "use strict";

    // Load configuration from shared config module (see www/js/config.mjs)
    // Falls back to defaults if config not loaded yet
    var cfg = window.SlideshowConfig || {};

    // Load photo store module for photo selection logic (see www/js/photo-store.mjs)
    var photoStore = window.SlideshowPhotoStore || {};

    // Load utility functions from shared utils module (see www/js/utils.mjs)
    var utils = window.SlideshowUtils || {};

    var window_ratio = $(window).width() / $(window).height();
    window_ratio = (window_ratio > 1.4) ? 'wide' : 'normal';
    var sheet = (function() {
        var style = document.createElement('style');
        style.appendChild(document.createTextNode(""));
        document.head.appendChild(style);
        return style.sheet;
    })();

    var resize = function() {
        var half_height = $(window).height() / 2;
        $('div.shelf').css('height', half_height);

        // Clear ALL existing rules to prevent CSSOM bloat on repeated resizes
        while (sheet.cssRules && sheet.cssRules.length > 0) {
            sheet.deleteRule(0);
        }
        // Add single rule for portrait height
        sheet.insertRule(".portrait { max-width: 100%; height: " + half_height + "px; }", 0);
    };

    $(window).resize(resize);
    resize();

    var refresh_album_time = 15 * 60 * 1000;

    // Configuration constants - loaded from www/js/config.mjs (shared with tests)
    var SWAP_INTERVAL = cfg.SWAP_INTERVAL || 10 * 1000;
    var nextRowToSwap = 'top';             // Alternating row tracker (top/bottom)

    // Panorama configuration
    var PANORAMA_ASPECT_THRESHOLD = cfg.PANORAMA_ASPECT_THRESHOLD || 2.0;
    var PANORAMA_USE_PROBABILITY = cfg.PANORAMA_USE_PROBABILITY || 0.5;
    var PANORAMA_STEAL_PROBABILITY = cfg.PANORAMA_STEAL_PROBABILITY || 0.5;
    var PANORAMA_POSITION_LEFT_PROBABILITY = cfg.PANORAMA_POSITION_LEFT_PROBABILITY || 0.5;
    var PAN_SPEED_PX_PER_SEC = cfg.PAN_SPEED_PX_PER_SEC || 10;

    // Layout variety configuration
    var ORIENTATION_MATCH_PROBABILITY = cfg.ORIENTATION_MATCH_PROBABILITY || 0.7;
    var FILL_RIGHT_TO_LEFT_PROBABILITY = cfg.FILL_RIGHT_TO_LEFT_PROBABILITY || 0.5;
    var INTER_ROW_DIFFER_PROBABILITY = cfg.INTER_ROW_DIFFER_PROBABILITY || 0.7;
    var STACKED_LANDSCAPES_PROBABILITY = cfg.STACKED_LANDSCAPES_PROBABILITY || 0.3;

    // Inter-row pattern variation tracking
    // Stores the pattern signature of the last built top row (e.g., "LLP", "PLL", "LPL")
    // L = landscape (2 cols), P = portrait (1 col), S = stacked landscapes (1 col)
    var lastTopRowPattern = null;

    /**
     * Get a random fill direction for building rows.
     * Uses FILL_RIGHT_TO_LEFT_PROBABILITY to determine direction.
     * @returns {string} - 'ltr' (left-to-right) or 'rtl' (right-to-left)
     */
    var getRandomFillDirection = function() {
        return Math.random() < FILL_RIGHT_TO_LEFT_PROBABILITY ? 'rtl' : 'ltr';
    };

    /**
     * Convert a pattern array to a signature string.
     * Maps slot widths to letters: 2 -> 'L' (landscape), 1 -> 'P' (portrait/stacked)
     * @param {number[]} pattern - Array of slot widths, e.g., [2, 1, 2]
     * @returns {string} - Pattern signature, e.g., "LPL"
     */
    var patternToSignature = function(pattern) {
        return pattern.map(function(width) {
            return width === 2 ? 'L' : 'P';
        }).join('');
    };

    /**
     * Check if two pattern signatures are different.
     * @param {string} sig1 - First pattern signature
     * @param {string} sig2 - Second pattern signature
     * @returns {boolean} - True if patterns are different
     */
    var patternsAreDifferent = function(sig1, sig2) {
        return sig1 !== sig2;
    };

    /**
     * Reset inter-row pattern tracking.
     * Called on full page refresh to start fresh.
     */
    var resetPatternTracking = function() {
        lastTopRowPattern = null;
    };

    // Slide animation configuration - horizontal only (left/right)
    var SLIDE_DIRECTIONS = ['left', 'right'];
    var pendingAnimationTimers = [];          // Track animation timers for cleanup

    // Three-phase animation timing constants (loaded from config.mjs)
    var SHRINK_ANIMATION_DURATION = cfg.SHRINK_ANIMATION_DURATION || 400;
    var SLIDE_IN_ANIMATION_DURATION = cfg.SLIDE_IN_ANIMATION_DURATION || 800;
    var PHASE_OVERLAP_DELAY = cfg.PHASE_OVERLAP_DELAY || 200;
    var FILL_STAGGER_DELAY = cfg.FILL_STAGGER_DELAY || 100;

    // Watchdog and recovery configuration (loaded from config.mjs)
    var WATCHDOG_INTERVAL_MS = cfg.WATCHDOG_INTERVAL_MS || 3000;
    var WATCHDOG_STUCK_GRACE_PERIOD_MS = cfg.WATCHDOG_STUCK_GRACE_PERIOD_MS || 1000;
    var WATCHDOG_LOAD_ERROR_DELAY_MS = cfg.WATCHDOG_LOAD_ERROR_DELAY_MS || 500;
    var WATCHDOG_SWAP_DEFER_MS = cfg.WATCHDOG_SWAP_DEFER_MS || 100;

    // Album transition configuration (loaded from config.mjs)
    var PREFETCH_LEAD_TIME = window.SlideshowPrefetch.clampPrefetchLeadTime(
        cfg.PREFETCH_LEAD_TIME || 60000,
        refresh_album_time,
        SWAP_INTERVAL
    );
    var ALBUM_TRANSITION_ENABLED = cfg.ALBUM_TRANSITION_ENABLED !== false;
    var ALBUM_TRANSITION_FADE_DURATION = cfg.ALBUM_TRANSITION_FADE_DURATION || 1000;
    var PREFETCH_MEMORY_THRESHOLD_MB = cfg.PREFETCH_MEMORY_THRESHOLD_MB || 100;
    var FORCE_RELOAD_INTERVAL = cfg.FORCE_RELOAD_INTERVAL || 8;
    var MIN_PHOTOS_FOR_TRANSITION = cfg.MIN_PHOTOS_FOR_TRANSITION || 15;

    // Album transition state
    var nextAlbumData = null;               // Holds pre-fetched album JSON
    var nextAlbumPhotos = [];               // Holds pre-loaded img_box elements
    var prefetchStarted = false;            // Prevents duplicate prefetch
    var prefetchComplete = false;           // Signals ready for transition
    var transitionCount = 0;                // Tracks successful transitions for periodic reload
    var prefetchAbortController = null;     // AbortController for canceling stale prefetch requests

    // Progressive enhancement: full shrink animation vs instant vanish
    // Set to false for low-powered devices (older Raspberry Pis)
    var ENABLE_SHRINK_ANIMATION = cfg.ENABLE_SHRINK_ANIMATION !== false;

    /**
     * Check if the device supports full shrink animation.
     * Returns false if:
     * - User prefers reduced motion (media query)
     * - ENABLE_SHRINK_ANIMATION is false (manual override)
     * @returns {boolean} - True if full animation should be used
     */
    var supportsFullAnimation = function() {
        // Check for prefers-reduced-motion media query
        if (typeof window !== 'undefined' && window.matchMedia) {
            var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
            if (prefersReducedMotion.matches) {
                return false;
            }
        }
        return ENABLE_SHRINK_ANIMATION;
    };

    /**
     * Get a random slide direction for photo swap animation (left or right only).
     * @returns {string} - One of 'left', 'right'
     */
    var getRandomSlideDirection = function() {
        return SLIDE_DIRECTIONS[Math.floor(Math.random() * SLIDE_DIRECTIONS.length)];
    };

    /**
     * Get the CSS class for shrink-to-corner animation based on direction and shelf position.
     * Corner selection follows the pattern:
     * - left + top shelf → bottom-left
     * - left + bottom shelf → top-left
     * - right + top shelf → bottom-right
     * - right + bottom shelf → top-right
     * @param {string} direction - 'left' or 'right'
     * @param {boolean} isTopRow - True if the photo is in the top row
     * @returns {string} - CSS class name for the shrink animation
     */
    var getShrinkCornerClass = function(direction, isTopRow) {
        if (direction === 'left') {
            return isTopRow ? 'shrink-to-bottom-left' : 'shrink-to-top-left';
        } else {
            return isTopRow ? 'shrink-to-bottom-right' : 'shrink-to-top-right';
        }
    };

    /**
     * Get the opposite direction for slide-in animation.
     * New photos should enter from the opposite edge of where the gravity pulls.
     * @param {string} direction - 'left' or 'right' (gravity/shrink direction)
     * @returns {string} - The opposite direction for slide-in entry
     */
    var getOppositeDirection = function(direction) {
        return direction === 'left' ? 'right' : 'left';
    };

    // --- Helper Functions for Individual Photo Swap ---

    /**
     * Phase A: Shrink or vanish the photos being removed.
     * Uses shrink-to-corner animation on capable devices, instant vanish on low-powered devices.
     * @param {jQuery[]} photosToRemove - Array of photo divs to animate out
     * @param {string} direction - 'left' or 'right' (determines shrink corner)
     * @param {boolean} isTopRow - True if photos are in the top row
     * @returns {Promise} - Resolves when Phase A animation completes
     */
    var animatePhaseA = function(photosToRemove, direction, isTopRow) {
        return new Promise(function(resolve) {
            if (photosToRemove.length === 0) {
                resolve();
                return;
            }

            var useFullAnimation = supportsFullAnimation();

            if (useFullAnimation) {
                // Full shrink-to-corner animation
                var shrinkClass = getShrinkCornerClass(direction, isTopRow);
                photosToRemove.forEach(function($photo) {
                    $photo.addClass(shrinkClass);
                });

                var timerId = setTimeout(function() {
                    resolve();
                }, SHRINK_ANIMATION_DURATION);
                pendingAnimationTimers.push(timerId);
            } else {
                // Instant vanish for low-powered devices
                photosToRemove.forEach(function($photo) {
                    $photo.addClass('instant-vanish');
                });

                // Small delay to ensure the class is applied before resolving
                var timerId = setTimeout(function() {
                    resolve();
                }, 50);
                pendingAnimationTimers.push(timerId);
            }
        });
    };

    /**
     * Phase C: Slide in the new photo with bounce effect.
     * @param {jQuery} $newPhotoDiv - The new photo div to animate in
     * @param {string} direction - 'left' or 'right' (direction photo enters from)
     * @param {number} [delayMs] - Optional CSS animation-delay in ms (compositor-thread accurate)
     * @returns {Promise} - Resolves when Phase C animation completes
     */
    var animatePhaseC = function($newPhotoDiv, direction, delayMs) {
        return new Promise(function(resolve) {
            // Make photo visible and start slide-in animation
            $newPhotoDiv.css('visibility', 'visible');
            if (delayMs != null && delayMs > 0) {
                $newPhotoDiv.css('animation-delay', delayMs + 'ms');
            }
            $newPhotoDiv.addClass('slide-in-from-' + direction);

            var totalDuration = (delayMs || 0) + SLIDE_IN_ANIMATION_DURATION;
            var timerId = setTimeout(function() {
                // Clean up animation class and delay
                $newPhotoDiv.removeClass('slide-in-from-' + direction);
                $newPhotoDiv.css('animation-delay', '');
                resolve();
            }, totalDuration);
            pendingAnimationTimers.push(timerId);
        });
    };

    /**
     * Animate the swap of photos in a row with three-phase animation sequence.
     * Phase A: Shrink-to-corner (or instant vanish) the old photos
     * Phase B: Gravity fill - adjacent photos slide into the empty space
     * Phase C: Slide in the new photo with bounce effect
     * @param {string} row - Row selector ('#top_row' or '#bottom_row')
     * @param {jQuery[]} photosToRemove - Array of photo divs to remove
     * @param {jQuery} $newPhotoDiv - The new photo div to insert
     * @param {number} insertionIndex - Position where new photo should be inserted
     * @param {number} extraColumns - Extra columns available after new photo (for fill photos)
     * @param {number} totalColumnsInGrid - Total columns in the grid (4 or 5)
     */
    var animateSwap = function(row, photosToRemove, $newPhotoDiv, insertionIndex, extraColumns, totalColumnsInGrid) {
        var $row = $(row);
        var photo_store = $('#photo_store');

        // Pause quality upgrades during animation to prevent visual glitches
        upgradesPaused = true;

        // Randomly choose gravity direction - everything moves towards gravity
        // If gravity is RIGHT: old photo shrinks right, photos slide right, new enters from left
        // If gravity is LEFT: old photo shrinks left, photos slide left, new enters from right
        var gravityDirection = getRandomSlideDirection();
        var entryDirection = (gravityDirection === 'right') ? 'left' : 'right';
        var isTopRow = row === '#top_row';

        // Clear any pending animation timers from previous swaps
        pendingAnimationTimers.forEach(function(timerId) {
            clearTimeout(timerId);
        });
        pendingAnimationTimers = [];

        // Guard clause: if no photos to remove, nothing to animate
        if (photosToRemove.length === 0) {
            console.log('animateSwap: No photos to remove, skipping animation');
            // Return orphaned img_box to store to prevent leak
            var $orphan = $newPhotoDiv.find('.img_box');
            if ($orphan.length > 0) {
                var orphanOrientation = $orphan.data('orientation');
                // Validate orientation before using in selector
                var validOrientations = ['portrait', 'landscape', 'panorama'];
                if (validOrientations.indexOf(orphanOrientation) === -1) {
                    console.error('animateSwap: Invalid orientation for orphan, using fallback', orphanOrientation);
                    orphanOrientation = 'landscape';
                }
                var $destination = photo_store.find('#' + orphanOrientation).first();
                if ($destination.length > 0) {
                    $destination.append($orphan);
                } else {
                    console.error('animateSwap: Cannot find photo store location for orientation', orphanOrientation);
                }
            }
            upgradesPaused = false;
            return;
        }

        // Fill photos created during Phase A callback, used in post-Phase-B/C callback
        var fillPhotos = [];

        // Capture positions of remaining photos BEFORE any DOM changes
        // This is critical for FLIP animation - we need original positions
        var photosToRemoveElements = new Set(photosToRemove.map(function($p) { return $p[0]; }));
        var $remainingPhotos = $row.find('.photo').filter(function() {
            return !photosToRemoveElements.has(this);
        });
        var positionsBeforeRemoval = [];
        $remainingPhotos.each(function() {
            positionsBeforeRemoval.push({
                $photo: $(this),
                left: $(this).offset().left
            });
        });

        // Phase A: Shrink or vanish the old photos
        // Old photos shrink towards gravity (the direction everything moves)
        animatePhaseA(photosToRemove, gravityDirection, isTopRow)
            .then(function() {
                // Remove old photos from DOM
                photosToRemove.forEach(function($photo) {
                    var $imgBox = $photo.find('.img_box');
                    if ($imgBox.length > 0) {
                        $imgBox.detach();
                        var orientation = $imgBox.data('orientation');
                        photo_store.find('#' + orientation).first().append($imgBox);
                    }
                    $photo.remove();
                });

                // Insert new photo at the appropriate edge (hidden)
                $newPhotoDiv.css('visibility', 'hidden');
                if (entryDirection === 'left') {
                    $row.prepend($newPhotoDiv);
                } else {
                    $row.append($newPhotoDiv);
                }

                // Create and insert fill photos BEFORE FLIP calculation
                // so remaining photos see their true final positions
                if (extraColumns > 0) {
                    fillPhotos = photoStore.fillRemainingSpace($, build_div, row, $newPhotoDiv, extraColumns, totalColumnsInGrid);
                    fillPhotos.forEach(function($fillPhoto, index) {
                        $fillPhoto.css('visibility', 'hidden');
                        if (entryDirection === 'left') {
                            if (index === 0) {
                                $newPhotoDiv.after($fillPhoto);
                            } else {
                                fillPhotos[index - 1].after($fillPhoto);
                            }
                        } else {
                            $row.append($fillPhoto);
                        }
                    });
                }

                // Capture positions AFTER removal and insertion (including fill photos)
                // Compare against positions BEFORE removal for smooth FLIP animation
                var photosToSlide = [];
                $remainingPhotos.each(function(i) {
                    var $photo = $(this);
                    var oldLeft = positionsBeforeRemoval[i].left;
                    var newLeft = $photo.offset().left;
                    var delta = oldLeft - newLeft;

                    // Only animate photos that actually moved
                    if (Math.abs(delta) > 1) {
                        photosToSlide.push({
                            $photo: $photo,
                            delta: delta
                        });
                    }
                });

                // Phase B: Gravity fill - animate from old positions to new positions
                // Start Phase B immediately
                var phaseBPromise = animatePhaseBGravityFLIP(photosToSlide);

                // Phase C: Slide in new photo while Phase B is still running
                // Uses CSS animation-delay for compositor-thread accurate timing
                var phaseCPromise = animatePhaseC($newPhotoDiv, entryDirection, PHASE_OVERLAP_DELAY);

                // Wait for both Phase B and C to complete
                return Promise.all([phaseBPromise, phaseCPromise]);
            })
            .then(function() {
                // Animate fill photos visible (already in DOM from pre-insertion)
                if (fillPhotos.length > 0) {
                    fillPhotos.forEach(function($fillPhoto, index) {
                        $fillPhoto.css({
                            'visibility': 'visible',
                            'animation-delay': (index * FILL_STAGGER_DELAY) + 'ms'
                        });
                        $fillPhoto.addClass('slide-in-from-' + entryDirection);
                    });

                    // Single cleanup timer for all fill photos
                    var totalTime = (Math.max(0, fillPhotos.length - 1) * FILL_STAGGER_DELAY) + SLIDE_IN_ANIMATION_DURATION;
                    var cleanupId = setTimeout(function() {
                        fillPhotos.forEach(function($fp) {
                            $fp.removeClass('slide-in-from-' + entryDirection);
                            $fp.css('animation-delay', '');
                            $fp.css('opacity', '');  // Clear inline opacity so photo stays visible
                        });
                    }, totalTime);
                    pendingAnimationTimers.push(cleanupId);
                }
            })
            .then(function() {
                // Resume quality upgrades after animation completes
                upgradesPaused = false;
            })
            .catch(function(error) {
                console.error('animateSwap: Animation error:', error);
                // Resume upgrades even on error
                upgradesPaused = false;
            });
    };

    /**
     * Phase B: Gravity fill using FLIP technique with bounce effect.
     * Animates photos from their captured old positions to their current positions,
     * with the same bounce effect as Phase C slide-in for visual consistency.
     * @param {{$photo: jQuery, delta: number}[]} photosToSlide - Array of photo/delta pairs
     * @returns {Promise} - Resolves when animation completes
     */
    var animatePhaseBGravityFLIP = function(photosToSlide) {
        return new Promise(function(resolve) {
            if (photosToSlide.length === 0) {
                resolve();
                return;
            }

            // Apply CSS animation with custom properties for FLIP offset and bounce direction
            photosToSlide.forEach(function(item) {
                // Guard against detached elements
                if (!item.$photo[0]) return;

                // Delta is oldLeft - newLeft
                // Positive delta means photo moved left (was further right before)
                // Negative delta means photo moved right (was further left before)
                //
                // Bounce physics: overshoot destination, then settle back
                // ←←← Moving left (delta > 0)  → overshoot left  → bounce-sign: -1
                // →→→ Moving right (delta < 0) → overshoot right → bounce-sign: +1
                var bounceSign = item.delta > 0 ? -1 : 1;

                item.$photo[0].style.setProperty('--gravity-offset', item.delta + 'px');
                item.$photo[0].style.setProperty('--bounce-sign', bounceSign);
                item.$photo.addClass('gravity-bounce');
            });

            // Use same duration as slide-in for consistent bounce timing
            var timerId = setTimeout(function() {
                // Clean up animation class and custom properties
                photosToSlide.forEach(function(item) {
                    // Guard against detached elements
                    if (!item.$photo[0]) return;

                    item.$photo.removeClass('gravity-bounce');
                    item.$photo[0].style.removeProperty('--gravity-offset');
                    item.$photo[0].style.removeProperty('--bounce-sign');
                });
                resolve();
            }, SLIDE_IN_ANIMATION_DURATION);
            pendingAnimationTimers.push(timerId);
        });
    };

    /**
     * Main swap algorithm: Replace one photo in a row with a new photo from the store.
     * Alternates between top and bottom rows on each call.
     * Uses weighted selection (older photos more likely to be replaced).
     */
    var swapSinglePhoto = function() {
        var photo_store = $('#photo_store');
        var totalColumns = (window_ratio === 'wide') ? 5 : 4;

        // Determine which row to swap (alternating)
        var row = (nextRowToSwap === 'top') ? '#top_row' : '#bottom_row';
        nextRowToSwap = (nextRowToSwap === 'top') ? 'bottom' : 'top';

        // Select a photo to replace using weighted random selection
        var $targetPhoto = photoStore.selectPhotoToReplace($, row);
        if (!$targetPhoto) {
            console.log('swapSinglePhoto: No eligible photos to replace in ' + row);
            return;
        }

        // Calculate container aspect ratio based on target photo's position
        var $row = $(row);
        var $allPhotos = $row.find('.photo');
        var targetIndex = $allPhotos.index($targetPhoto);
        var targetColumns = photoStore.getPhotoColumns($targetPhoto);
        var viewportWidth = $(window).width();
        var viewportHeight = $(window).height() / 2;
        var containerWidth = (targetColumns / totalColumns) * viewportWidth;
        var containerAspectRatio = containerWidth / viewportHeight;

        // Determine if target is at edge (first or last position in row)
        var isEdgePosition = (targetIndex === 0 || targetIndex === $allPhotos.length - 1);

        // Select a new photo from the store with context-aware selection
        var newPhotoData = photoStore.selectRandomPhotoFromStore($, window_ratio, containerAspectRatio, isEdgePosition);
        if (!newPhotoData) {
            console.log('swapSinglePhoto: No photos available in store');
            return;
        }

        var $imgBox = newPhotoData.$imgBox;
        var neededColumns = newPhotoData.columns;

        // Make space for the new photo (may need to remove adjacent photos)
        var spaceInfo = photoStore.makeSpaceForPhoto($, row, $targetPhoto, neededColumns);
        if (!spaceInfo) {
            console.log('swapSinglePhoto: Unable to make space for ' + neededColumns + ' columns in ' + row);
            // Return the photo to the store
            var orientation = $imgBox.data('orientation');
            photo_store.find('#' + orientation).first().append($imgBox);
            return;
        }

        // Detach the img_box from the store
        $imgBox.detach();

        // Build the new photo div
        var $newPhotoDiv = build_div($imgBox, neededColumns, totalColumns);
        $newPhotoDiv.data('display_time', Date.now());
        $newPhotoDiv.data('columns', neededColumns);

        // Handle panorama styling if applicable
        if (newPhotoData.isPanorama) {
            $newPhotoDiv.addClass('panorama-container');

            // Set explicit height
            var viewportHeight = $(window).height() / 2;
            $newPhotoDiv.css('height', viewportHeight + 'px');

            // Check for overflow and add panning animation
            var containerWidth = ($(window).width() / totalColumns) * neededColumns;
            var imageDisplayWidth = viewportHeight * newPhotoData.aspectRatio;

            if (imageDisplayWidth > containerWidth) {
                $newPhotoDiv.addClass('panorama-overflow');
                var panDistance = -(imageDisplayWidth - containerWidth);
                var panDuration = Math.abs(panDistance) / PAN_SPEED_PX_PER_SEC;
                $newPhotoDiv[0].style.setProperty('--pan-distance', panDistance + 'px');
                $newPhotoDiv[0].style.setProperty('--pan-duration', panDuration + 's');
            }
        }

        // Calculate extra columns for fill photos
        var extraColumns = spaceInfo.totalColumns - neededColumns;

        // Animate the swap
        animateSwap(row, spaceInfo.photosToRemove, $newPhotoDiv, spaceInfo.insertionIndex, extraColumns, totalColumns);
    };

    // --- End Helper Functions ---

    var reduce = function (numerator,denominator) {
        if (isNaN(numerator) || isNaN(denominator)) return NaN;
        var gcd = function gcd(a,b){
            return b ? gcd(b, a%b) : a;
        };
        gcd = gcd(numerator,denominator);
        return [numerator/gcd, denominator/gcd];
    }

    var build_div = function(el, width, columns) {
        var div = $("<div></div>");
        var reduced = reduce(width, columns);
        div.addClass("pure-u-"+reduced[0]+"-"+reduced[1]);
        div.addClass('photo');
        div.append(el);

        return div;
    }

    /**
     * Generate a random row pattern specifying slot widths.
     * Each slot width is either 1 (portrait) or 2 (landscape).
     * The pattern sums to totalColumns.
     * @param {number} totalColumns - Total columns to fill (4 or 5)
     * @param {number} landscapeCount - Number of landscape photos available
     * @param {number} portraitCount - Number of portrait photos available
     * @param {string|null} avoidSignature - Optional pattern signature to avoid (for inter-row variation)
     * @returns {number[]} - Array of slot widths, e.g., [2, 1, 2] or [1, 2, 2]
     */
    var generateRowPattern = function(totalColumns, landscapeCount, portraitCount, avoidSignature) {
        // Inner function to generate a single pattern
        var generateSinglePattern = function() {
            var pattern = [];
            var remaining = totalColumns;

            // Track available photos as we "use" them in the pattern
            var availableLandscapes = landscapeCount;
            var availablePortraits = portraitCount;

            while (remaining > 0) {
                if (remaining === 1) {
                    // Only one column left - must use portrait (or stacked landscapes)
                    pattern.push(1);
                    if (availablePortraits > 0) {
                        availablePortraits--;
                    } else {
                        // Will need to use stacked landscapes
                        availableLandscapes = Math.max(0, availableLandscapes - 2);
                    }
                    remaining = 0;
                } else if (remaining >= 2) {
                    // Can fit landscape (2 cols) or portrait (1 col)
                    // Randomly decide based on available photos
                    var canUseLandscape = availableLandscapes > 0;
                    var canUsePortrait = availablePortraits > 0 || availableLandscapes >= 2; // Portrait slot can use stacked landscapes

                    // If no photos tracked as available, still generate slots
                    // The builder will use selectPhotoForContainer as fallback
                    if (!canUseLandscape && !canUsePortrait) {
                        // Default to 1-column slots for remaining space
                        // These can be filled by any available photo via fallback
                        pattern.push(1);
                        remaining -= 1;
                        continue;
                    }

                    var usePortrait;
                    if (!canUseLandscape) {
                        usePortrait = true;
                    } else if (!canUsePortrait) {
                        usePortrait = false;
                    } else {
                        // Both available - randomly choose
                        // Weight slightly towards landscape since it's more visually interesting
                        usePortrait = Math.random() < 0.4;
                    }

                    if (usePortrait) {
                        pattern.push(1);
                        if (availablePortraits > 0) {
                            availablePortraits--;
                        } else {
                            availableLandscapes = Math.max(0, availableLandscapes - 2);
                        }
                        remaining -= 1;
                    } else {
                        pattern.push(2);
                        availableLandscapes--;
                        remaining -= 2;
                    }
                }
            }

            return pattern;
        };

        // Generate initial pattern
        var pattern = generateSinglePattern();

        // If we should try to avoid a specific pattern signature
        if (avoidSignature && Math.random() < INTER_ROW_DIFFER_PROBABILITY) {
            var currentSignature = patternToSignature(pattern);
            var maxAttempts = 3; // Soft preference: try a few times but don't force
            var attempts = 0;

            while (!patternsAreDifferent(currentSignature, avoidSignature) && attempts < maxAttempts) {
                pattern = generateSinglePattern();
                currentSignature = patternToSignature(pattern);
                attempts++;
            }
        }

        return pattern;
    };

    /**
     * Build a row of photos with random layout pattern.
     * Fades out existing photos, rebuilds with new layout, and fades back in.
     * @param {string|jQuery} row - Row selector ('#top_row' or '#bottom_row')
     * @param {boolean} [skipAnimation=false] - Skip fade animations (used during album transitions when parent is already faded out)
     */
    var build_row = function(row, skipAnimation) {
        var photo_store = $('#photo_store');
        row = $(row);

        var rebuildRow = function() {
            // detach all the child divs and put them back in the photo_store
            row.find('div.img_box').each( function() {
                var el = $(this);
                el.detach();
                photo_store.find('#'+el.data('orientation')).first().append(el);
            });
            row.empty();

            // With configured chance, release panorama from the OTHER row so this row can use it
            // Skip panorama stealing during album transitions (both rows are built fresh)
            var otherRow = (row.attr('id') === 'top_row') ? '#bottom_row' : '#top_row';
            var otherRowHasPanorama = !skipAnimation && $(otherRow).find('.panorama-container').length > 0;
            var shouldRebuildOtherRow = false;
            if (otherRowHasPanorama && Math.random() < PANORAMA_STEAL_PROBABILITY) {
                // Return ALL photos from the other row to storage (not just panorama)
                $(otherRow).find('div.img_box').each(function() {
                    var el = $(this);
                    el.detach();
                    photo_store.find('#'+el.data('orientation')).first().append(el);
                });
                $(otherRow).empty();
                shouldRebuildOtherRow = true;
            }

            // A row can have a number of different configurations:
            // if wide then a minumum of 3, and a maximum of 10
            // if normal then a minimum of 2 and a maximum of 8
            var columns = (window_ratio === 'wide') ? 5 : 4;
            var used_columns = 0;

            // Check for available panoramas and build container (but don't append yet)
            // Only use panorama with configured probability to avoid over-fitting
            var panoramaContainer = null;
            var panoramaColumns = 0;
            var panoramaDiv = photo_store.find('#panorama div.img_box').first();
            var usePanorama = panoramaDiv.length > 0 && Math.random() < PANORAMA_USE_PROBABILITY;
            if (usePanorama) {
                var panoramaPhoto = panoramaDiv.detach();
                var imageRatio = panoramaPhoto.data('aspect_ratio');
                panoramaColumns = photoStore.calculatePanoramaColumns($, imageRatio, columns);

                // Create panorama container
                panoramaContainer = build_div(panoramaPhoto, panoramaColumns, columns);
                panoramaContainer.addClass('panorama-container');

                // Set explicit height (Pure CSS grid items are inline-block and don't stretch)
                var viewportHeight = $(window).height() / 2;
                panoramaContainer.css('height', viewportHeight + 'px');

                // Check if image will overflow and needs panning animation
                var containerWidth = ($(window).width() / columns) * panoramaColumns;
                var imageDisplayWidth = viewportHeight * imageRatio;

                if (imageDisplayWidth > containerWidth) {
                    panoramaContainer.addClass('panorama-overflow');
                    // Calculate pan distance (negative because we translate left)
                    var panDistance = -(imageDisplayWidth - containerWidth);
                    // Calculate pan duration based on distance (10px per second for slow pan)
                    var panDuration = Math.abs(panDistance) / PAN_SPEED_PX_PER_SEC;
                    // Set CSS custom properties using native style API (jQuery .css() doesn't reliably support custom properties)
                    panoramaContainer[0].style.setProperty('--pan-distance', panDistance + 'px');
                    panoramaContainer[0].style.setProperty('--pan-duration', panDuration + 's');
                }
            }

            // Randomly decide if panorama goes on left or right
            var panoramaOnLeft = Math.random() < PANORAMA_POSITION_LEFT_PROBABILITY;

            // If panorama exists and goes on left, append it first
            if (panoramaContainer && panoramaOnLeft) {
                panoramaContainer.data('display_time', Date.now());
                panoramaContainer.data('columns', panoramaColumns);
                row.append(panoramaContainer);
                used_columns += panoramaColumns;
            }

            // Fill columns with landscape/portrait photos
            // Calculate viewport dimensions for aspect ratio calculations
            var viewportWidth = $(window).width();
            var viewportHeight = $(window).height() / 2;

            // Get random fill direction (ltr or rtl)
            var fillDirection = getRandomFillDirection();

            // Build photos into array first, then append based on fill direction
            var photoDivs = [];
            var columnsToFill = panoramaContainer ? (columns - panoramaColumns) : columns;

            // Count available photos for pattern generation
            var landscapeCount = photo_store.find('#landscape div.img_box').length;
            var portraitCount = photo_store.find('#portrait div.img_box').length;

            // Determine if this is top or bottom row for inter-row pattern variation
            var isTopRow = row.attr('id') === 'top_row';
            var avoidSignature = isTopRow ? null : lastTopRowPattern;

            // Generate a random row pattern based on available photos
            // For bottom row, try to avoid matching the top row's pattern
            var pattern = generateRowPattern(columnsToFill, landscapeCount, portraitCount, avoidSignature);

            // Store pattern signature for inter-row variation
            var patternSignature = patternToSignature(pattern);
            if (isTopRow) {
                lastTopRowPattern = patternSignature;
            }

            // Build photos according to the pattern
            for (var i = 0; i < pattern.length; i++) {
                var width = pattern[i];
                var photo;
                var div;

                // Calculate container aspect ratio for photo selection
                var containerWidth = (width / columns) * viewportWidth;
                var containerAspectRatio = containerWidth / viewportHeight;

                if (width === 2) {
                    // 2-column slot: select a landscape photo
                    photo = photo_store.find('#landscape div.img_box').random().detach();
                    if (!photo || photo.length === 0) {
                        // Fallback: try any photo with selectPhotoForContainer (includes clone fallback)
                        photo = photoStore.selectPhotoForContainer($, containerAspectRatio);
                        if (!photo) {
                            // Ultimate fallback: clone a landscape from page
                            photo = photoStore.clonePhotoFromPage($, 'landscape');
                        }
                        if (!photo) continue; // Skip this slot only if truly nothing available
                        // If we got a portrait, adjust width to 1
                        if (photo.data('orientation') === 'portrait') {
                            width = 1;
                        }
                    }
                    div = build_div(photo, width, columns);
                } else {
                    // 1-column slot: randomly choose between portrait and stacked landscapes
                    var portraits = photo_store.find('#portrait div.img_box');
                    var currentLandscapeCount = photo_store.find('#landscape div.img_box').length;
                    var hasPortraits = portraits.length > 0;
                    var hasEnoughLandscapes = currentLandscapeCount >= 2;

                    // Decide: use stacked landscapes with STACKED_LANDSCAPES_PROBABILITY,
                    // but only if we have enough landscapes and fallback available
                    var useStackedLandscapes = hasEnoughLandscapes &&
                        (Math.random() < STACKED_LANDSCAPES_PROBABILITY || !hasPortraits);

                    if (useStackedLandscapes) {
                        // Use stacked landscapes
                        div = photoStore.createStackedLandscapes($, build_div, columns);
                        if (!div) {
                            // Fallback to portrait if stacked landscapes failed
                            photo = portraits.random().detach();
                            if (photo && photo.length > 0) {
                                div = build_div(photo, width, columns);
                            } else {
                                // Fallback: try any photo (includes clone fallback)
                                photo = photoStore.selectPhotoForContainer($, containerAspectRatio);
                                if (!photo) {
                                    // Ultimate fallback: clone from page
                                    photo = photoStore.clonePhotoFromPage($, 'portrait');
                                }
                                if (!photo) continue; // Skip only if truly nothing
                                div = build_div(photo, width, columns);
                            }
                        }
                    } else if (hasPortraits) {
                        // Use portrait
                        photo = portraits.random().detach();
                        div = build_div(photo, width, columns);
                    } else {
                        // Fallback: try any available photo (includes clone fallback)
                        photo = photoStore.selectPhotoForContainer($, containerAspectRatio);
                        if (!photo) {
                            // Ultimate fallback: clone a portrait from page
                            photo = photoStore.clonePhotoFromPage($, 'portrait');
                        }
                        if (!photo) continue; // Skip only if truly nothing available
                        div = build_div(photo, width, columns);
                    }
                }

                div.data('display_time', Date.now());
                div.data('columns', width);
                photoDivs.push(div);
            }

            // Reverse array if fill direction is right-to-left
            if (fillDirection === 'rtl') {
                photoDivs.reverse();
            }

            // Append photos in the determined order
            // Panorama on left was already appended, so regular photos come after
            // Panorama on right will be appended after the loop
            photoDivs.forEach(function(div) {
                row.append(div);
                used_columns += div.data('columns');
            });

            // If panorama exists and goes on right, append it last
            if (panoramaContainer && !panoramaOnLeft) {
                panoramaContainer.data('display_time', Date.now());
                panoramaContainer.data('columns', panoramaColumns);
                row.append(panoramaContainer);
                used_columns += panoramaColumns;
            }

            if (skipAnimation) {
                // Show row immediately, then rebuild other row if needed
                row.show();
                if (shouldRebuildOtherRow) {
                    build_row(otherRow, skipAnimation);
                }
            } else {
                // Fade in the row, then rebuild other row if needed (avoids race condition)
                row.toggle('fade', 1000, function() {
                    if (shouldRebuildOtherRow) {
                        build_row(otherRow);
                    }
                });
            }
        };

        if (skipAnimation) {
            // Skip fade-out animation — rebuild row synchronously
            rebuildRow();
        } else {
            // Fade out the row, rebuild in callback, then fade back in
            row.toggle('fade', 1000, rebuildRow);
        }
    };

    // Track the shuffle timer for cleanup
    var shuffleTimerId = null;

    /**
     * Clear all pending timers before page operations.
     * Prevents orphaned timers from accumulating in browser memory.
     */
    var clearAllPendingTimers = function() {
        // Clear animation timers
        pendingAnimationTimers.forEach(function(timerId) {
            clearTimeout(timerId);
        });
        pendingAnimationTimers = [];

        // Clear shuffle timer
        if (shuffleTimerId) {
            clearTimeout(shuffleTimerId);
            shuffleTimerId = null;
        }

        // Clear watchdog interval to prevent memory leak
        if (watchdogInterval) {
            clearInterval(watchdogInterval);
            watchdogInterval = null;
        }
    };

    /**
     * Check if there is enough memory available for pre-fetching.
     * Uses the prefetch module's pure function with performance.memory API.
     * Returns true (allow prefetch) if API is unavailable for graceful degradation.
     * @returns {boolean} - True if memory is sufficient or API unavailable
     */
    var hasEnoughMemoryForPrefetch = function() {
        var performanceMemory = (typeof performance !== 'undefined' && performance.memory) ? performance.memory : null;
        var hasMem = window.SlideshowPrefetch.hasEnoughMemoryForPrefetch(performanceMemory, PREFETCH_MEMORY_THRESHOLD_MB);

        if (performanceMemory) {
            var available = performanceMemory.jsHeapSizeLimit - performanceMemory.usedJSHeapSize;
            debugLog('Prefetch memory check: ' + Math.round(available / 1024 / 1024) + 'MB available, threshold: ' + PREFETCH_MEMORY_THRESHOLD_MB + 'MB, result: ' + hasMem);
        } else {
            debugLog('Prefetch memory check: API unavailable, allowing prefetch');
        }

        return hasMem;
    };

    /**
     * Create an img_box element from a loaded image.
     * Shared helper to ensure consistent img_box creation across prefetch and initial load.
     *
     * @param {Image} img - The loaded image element
     * @param {Object} photoData - Photo metadata { file, originalFilePath }
     * @param {string} quality - Quality level ('M', 'XL', or 'original')
     * @returns {jQuery} - The img_box div element
     */
    var createImgBox = function(img, photoData, quality) {
        var height = img.height;
        var width = img.width;
        var aspect_ratio = width / height;
        var orientation = height > width ? 'portrait' : 'landscape';
        var is_panorama = aspect_ratio > PANORAMA_ASPECT_THRESHOLD;
        var $img = $(img);
        $img.addClass('pure-img ' + orientation);
        // Extract filename for alt text (e.g., "photo7" from "photos/album2/photo7.jpg")
        var filePath = photoData.file || '';
        var fileName = filePath.split('/').pop() || 'Photo';
        fileName = fileName.replace(/\.[^.]+$/, '') || fileName;
        $img.attr('alt', fileName);

        var div = $("<div class='img_box'></div>");
        div.data('height', height);
        div.data('width', width);
        div.data('aspect_ratio', aspect_ratio);
        div.data('orientation', is_panorama ? 'panorama' : orientation);
        div.data('panorama', is_panorama);
        div.data('quality-level', quality);
        div.data('original-file-path', photoData.originalFilePath || photoData.file);
        div.append($img);

        // Add error handler for images that fail to load in live cells
        // Use .one() to ensure handler fires only once (prevents multiple handlers accumulating)
        $img.one('error', function() {
            var $photo = $(this).closest('.photo');
            if ($photo.length && $photo.parents('#top_row, #bottom_row').length) {
                console.warn('Image failed to load in cell, scheduling recovery:', filePath);
                $photo.data('needs-recovery', Date.now());
            }
        });

        return div;
    };

    /**
     * Pre-fetch the next album while the current one displays.
     * Fetches album data and preloads images with initial quality.
     * Sets prefetchComplete = true when ready for transition.
     */
    var prefetchNextAlbum = function() {
        // Memory guard
        if (!hasEnoughMemoryForPrefetch()) {
            console.warn('Prefetch: Insufficient memory, will fall back to reload');
            prefetchComplete = false;
            return;
        }

        // Cancel any previous in-flight prefetch before starting a new one
        if (prefetchAbortController) {
            prefetchAbortController.abort();
        }

        // Create new AbortController for this prefetch
        prefetchAbortController = new AbortController();
        var signal = prefetchAbortController.signal;

        debugLog('Prefetch: Starting album pre-fetch');

        fetch('/album/25?xtime=' + Date.now(), { signal: signal })
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('Album fetch failed: ' + response.status);
                }
                return response.json();
            })
            .then(function(data) {
                if (!window.SlideshowPrefetch.validateAlbumData(data)) {
                    debugLog('Prefetch: Invalid or empty album data');
                    prefetchComplete = false;
                    return;
                }
                nextAlbumData = data;
                debugLog('Prefetch: Album data received (' + data.images.length + ' photos)');

                // Preload images with initial quality
                return loadPhotosInBatches(data.images, INITIAL_QUALITY, LOAD_BATCH_SIZE);
            })
            .then(function(results) {
                // Process results into img_box elements but DON'T add to photo_store yet
                // Store them in nextAlbumPhotos for the transition
                nextAlbumPhotos = [];
                results.forEach(function(item) {
                    if (!item.result.loaded || !item.result.img) {
                        item.result = null;
                        return;
                    }

                    var img = item.result.img;
                    var photoData = {
                        file: item.value.file,
                        originalFilePath: item.originalFilePath
                    };
                    var div = createImgBox(img, photoData, INITIAL_QUALITY);

                    nextAlbumPhotos.push(div);

                    // Clear the result reference
                    item.result = null;
                });

                // Clear results array
                results.length = 0;

                prefetchComplete = true;
                debugLog('Prefetch: Complete (' + nextAlbumPhotos.length + ' photos ready)');
            })
            .catch(function(error) {
                if (window.SlideshowPrefetch.isAbortError(error)) {
                    debugLog('Prefetch: Cancelled (transition started or new prefetch)');
                    return;
                }
                console.error('Prefetch: Error:', error);
                nextAlbumData = null;
                nextAlbumPhotos = [];
                prefetchComplete = false;
            });
    };

    /**
     * Transition to the next pre-fetched album with a fade-out → fade-in sequence.
     * Creates a clear visual "chapter break" between albums.
     * Falls back to location.reload() if prefetch is incomplete or insufficient photos.
     */
    var transitionToNextAlbum = function() {
        // Check if forced reload is due for memory hygiene
        if (window.SlideshowPrefetch.shouldForcedReload(transitionCount, FORCE_RELOAD_INTERVAL)) {
            debugLog('Transition: Periodic reload for memory hygiene (count: ' + transitionCount + ')');
            clearAllPendingTimers();
            location.reload();
            return;
        }

        // Check prefetch status
        var fallbackCheck = window.SlideshowPrefetch.shouldFallbackToReload(
            prefetchComplete,
            nextAlbumPhotos.length,
            MIN_PHOTOS_FOR_TRANSITION
        );
        if (fallbackCheck.shouldReload) {
            debugLog('Transition: Falling back to reload (reason: ' + fallbackCheck.reason + ', photos: ' + nextAlbumPhotos.length + ')');
            clearAllPendingTimers();
            location.reload();
            return;
        }

        debugLog('Transition: Starting album transition (' + nextAlbumPhotos.length + ' photos)');

        // Cancel any in-flight prefetch
        if (prefetchAbortController) {
            prefetchAbortController.abort();
            prefetchAbortController = null;
        }

        // Clear all pending timers (swap timers, animation timers)
        clearAllPendingTimers();

        var photo_store = $('#photo_store');
        var $topRow = $('#top_row');
        var $bottomRow = $('#bottom_row');
        var $content = $('#content');

        // Phase 1: Fade Out - Fade out the content area
        $content.animate({ opacity: 0 }, ALBUM_TRANSITION_FADE_DURATION, function() {
            // Return current photos to a temp area for cleanup
            var $oldPhotos = $topRow.find('div.img_box, div.photo').add($bottomRow.find('div.img_box, div.photo'));

            // Clear rows
            $topRow.empty();
            $bottomRow.empty();

            // Clear old photos from photo_store
            photo_store.find('#landscape').empty();
            photo_store.find('#portrait').empty();
            photo_store.find('#panorama').empty();

            // Remove old photo DOM elements (help GC)
            $oldPhotos.each(function() {
                $(this).find('img').attr('src', '');
                $(this).removeData();
            });
            $oldPhotos.remove();
            $oldPhotos = null;

            // Move nextAlbumPhotos to photo_store (categorized by orientation)
            var landscape = photo_store.find('#landscape');
            var portrait = photo_store.find('#portrait');
            var panorama = photo_store.find('#panorama');

            nextAlbumPhotos.forEach(function(div) {
                var orientation = div.data('orientation');
                if (orientation === 'panorama') {
                    panorama.append(div);
                } else if (orientation === 'landscape') {
                    landscape.append(div);
                } else {
                    portrait.append(div);
                }
            });

            // Clear nextAlbumPhotos references
            nextAlbumPhotos = [];
            nextAlbumData = null;

            // Reset inter-row pattern tracking for fresh layout
            resetPatternTracking();

            // Build new rows synchronously (skip animation — parent is faded out)
            build_row('#top_row', true);
            build_row('#bottom_row', true);

            // Update album name
            var src = photo_store.find('img').first().attr('src');
            var regex = /(\d\d\d\d)\/(.*?)\//;
            var m = regex.exec(src);
            var year = m ? m[1] : '';
            var album = m ? m[2] : '';
            if (year && album) {
                $('.album_name').text(year + ' ' + album);
            }

            // Phase 2: Fade In - Fade in with new photos
            $content.animate({ opacity: 1 }, ALBUM_TRANSITION_FADE_DURATION, function() {
                // Reset prefetch flags for next cycle
                prefetchStarted = false;
                prefetchComplete = false;

                // Increment transition count
                transitionCount++;

                // Restart shuffle cycle with new end_time
                var new_end_time = _.now() + refresh_album_time;
                _.delay(new_shuffle_show, SWAP_INTERVAL, new_end_time);

                // Start background quality upgrades for new photos
                debugLog('Transition: Starting background upgrades for new album');
                startBackgroundUpgrades();

                debugLog('Transition: Album transition complete (count: ' + transitionCount + ')');
            });
        });
    };

    /**
     * New shuffle show function using individual photo swap algorithm.
     * Swaps one photo at a time every SWAP_INTERVAL ms.
     * Pre-fetches next album before transition time.
     * Uses seamless transition or falls back to reload.
     * @param {number} end_time - Timestamp when the show should transition to next album
     */
    var new_shuffle_show = function(end_time) {
        // Check if it's time to start pre-fetching
        if (ALBUM_TRANSITION_ENABLED && !prefetchStarted && _.now() > end_time - PREFETCH_LEAD_TIME) {
            prefetchStarted = true;
            prefetchNextAlbum();
        }

        if (_.now() > end_time) {
            if (ALBUM_TRANSITION_ENABLED) {
                transitionToNextAlbum();
            } else {
                // Clear all pending timers before reload to prevent memory leaks
                clearAllPendingTimers();
                location.reload();
            }
        } else {
            // Swap one photo using the individual photo swap algorithm
            swapSinglePhoto();
            // Schedule next swap and track the timer ID
            shuffleTimerId = setTimeout(function() {
                new_shuffle_show(end_time);
            }, SWAP_INTERVAL);
        }
    };

    // Animation watchdog - monitors live cells for stuck-invisible state or load errors
    var watchdogInterval = null;

    /**
     * Start the animation watchdog to scan for and recover stuck-invisible cells.
     * Runs every 3 seconds looking for:
     * - Cells that fail to load images
     * - Cells stuck with opacity:0 or visibility:hidden after animations complete
     */
    var startAnimationWatchdog = function() {
        if (watchdogInterval) {
            clearInterval(watchdogInterval);
        }

        watchdogInterval = setInterval(function() {
            var now = Date.now();
            // Calculate threshold based on animation config to avoid false positives
            var maxFillPhotos = 5;
            var maxAnimationTime = (maxFillPhotos - 1) * FILL_STAGGER_DELAY + SLIDE_IN_ANIMATION_DURATION;
            var STUCK_THRESHOLD_MS = maxAnimationTime + WATCHDOG_STUCK_GRACE_PERIOD_MS;

            $('#top_row .photo, #bottom_row .photo').each(function() {
                var $photo = $(this);
                if (!$photo || !$photo.length) return;  // Skip detached elements

                var needsRecovery = $photo.data('needs-recovery');

                // Check for load error flag set by onerror handler
                if (needsRecovery && (now - needsRecovery) > WATCHDOG_LOAD_ERROR_DELAY_MS) {
                    debugLog('Watchdog: queueing recovery swap for failed image load');
                    $photo.removeData('needs-recovery');
                    // Queue swap instead of calling directly to avoid race condition during animations
                    // Mark as oldest so it gets swapped next
                    $photo.data('display_time', 0);
                    // Defer swap to avoid concurrent animation conflicts
                    _.delay(swapSinglePhoto, WATCHDOG_SWAP_DEFER_MS);
                    return;
                }

                // Check for stuck invisible cells
                var visibility = $photo.css('visibility');
                var opacityStr = $photo.css('opacity');
                var isHidden = visibility === 'hidden';
                var isOpaque = opacityStr ? parseFloat(opacityStr) < 0.01 : false;
                var stuckSince = $photo.data('stuck-since');

                if (isHidden || isOpaque) {
                    if (!stuckSince) {
                        $photo.data('stuck-since', now);
                    } else if (now - stuckSince > STUCK_THRESHOLD_MS) {
                        debugLog('Watchdog: recovering stuck-invisible cell');
                        $photo.css({ visibility: 'visible', opacity: '' });
                        $photo.removeData('stuck-since');
                    }
                } else {
                    $photo.removeData('stuck-since');
                }
            });
        }, WATCHDOG_INTERVAL_MS);
    };

    var slide_show = function() {
        var photo_store = $('#photo_store');
        // Not sure if I should iterate through old photos and explicitly remove from DOM?
        // photos = staging_photos.slice(0);
        // prepare stage
        // Build up initial show (with fade-in animation for first display)
        build_row('#top_row');
        build_row('#bottom_row');

        // grab the first picture and pull out the album name
        var src = photo_store.find('img').first().attr('src');
        var regex = /(\d\d\d\d)\/(.*?)\//;
        var m = regex.exec(src);
        var year = m ? m[1] : '';
        var album = m ? m[2] : '';

        if (year && album) {
            $('.album_name').text(year + ' ' + album);
            console.log(year, album);
        }

        var start_time = _.now();
        var end_time = start_time + refresh_album_time;

        // Start the animation watchdog to monitor and recover stuck cells
        startAnimationWatchdog();

        // Use new individual photo swap algorithm instead of row-based shuffle
        _.delay(new_shuffle_show, SWAP_INTERVAL, end_time);
    };

    var finish_staging = function(count) {
        var photo_store = $('#photo_store');
        if (photo_store.find('div.img_box').length < count) {
            return false;
        } else {
            slide_show();
        }
    };

    // Timeout for image preloading (prevents hung Image objects)
    var IMAGE_PRELOAD_TIMEOUT = cfg.IMAGE_PRELOAD_TIMEOUT || 30000;

    var preloadImage = function(src, fallbackSrc) {
        return new Promise(function(resolve) {
            var img = new Image();
            var resolved = false;
            var timeoutId = null;

            var cleanup = function() {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
            };

            var resolveOnce = function(result) {
                if (!resolved) {
                    resolved = true;
                    cleanup();
                    resolve(result);
                }
            };

            // Timeout protection - cancel loading if too slow
            timeoutId = setTimeout(function() {
                if (!resolved) {
                    img.src = ''; // Cancel pending request
                    resolveOnce({ img: null, loaded: false });
                }
            }, IMAGE_PRELOAD_TIMEOUT);

            img.onload = function() { resolveOnce({ img: img, loaded: true }); };
            img.onerror = function() {
                if (fallbackSrc && !resolved) {
                    img.onload = function() { resolveOnce({ img: img, loaded: true }); };
                    img.onerror = function() { resolveOnce({ img: null, loaded: false }); };
                    img.src = fallbackSrc;
                } else {
                    resolveOnce({ img: null, loaded: false });
                }
            };
            img.src = src;
        });
    };

    // buildThumbnailPath - imported from utils.mjs (www/js/utils.mjs)
    var buildThumbnailPath = utils.buildThumbnailPath;

    // --- Progressive Loading Helper Functions ---

    // Progressive loading configuration from config.mjs
    var PROGRESSIVE_LOADING_ENABLED = cfg.PROGRESSIVE_LOADING_ENABLED !== false;
    var INITIAL_BATCH_SIZE = cfg.INITIAL_BATCH_SIZE || 15;
    var INITIAL_QUALITY = cfg.INITIAL_QUALITY || 'M';
    var FINAL_QUALITY = cfg.FINAL_QUALITY || 'XL';
    var UPGRADE_BATCH_SIZE = cfg.UPGRADE_BATCH_SIZE || 5;
    var UPGRADE_DELAY_MS = cfg.UPGRADE_DELAY_MS || 100;
    var LOAD_BATCH_SIZE = cfg.LOAD_BATCH_SIZE || 5;
    var DEBUG_PROGRESSIVE_LOADING = cfg.DEBUG_PROGRESSIVE_LOADING || false;

    /**
     * Log a message only if DEBUG_PROGRESSIVE_LOADING is enabled.
     * @param {...*} args - Arguments to pass to console.log
     */
    var debugLog = function() {
        if (DEBUG_PROGRESSIVE_LOADING) {
            console.log.apply(console, arguments);
        }
    };

    /**
     * Log a warning only if DEBUG_PROGRESSIVE_LOADING is enabled.
     * @param {...*} args - Arguments to pass to console.warn
     */
    var debugWarn = function() {
        if (DEBUG_PROGRESSIVE_LOADING) {
            console.warn.apply(console, arguments);
        }
    };

    // qualityLevel - imported from utils.mjs (www/js/utils.mjs)
    var qualityLevel = utils.qualityLevel;

    /**
     * Preload an image with quality metadata.
     * Wrapper around preloadImage() that includes quality info in the result.
     * @param {Object} photoData - Photo data object with file property
     * @param {string} quality - Quality level: 'M' or 'XL'
     * @returns {Promise<Object>} - { value, result, quality, originalFilePath }
     */
    var preloadImageWithQuality = function(photoData, quality) {
        var thumbnailSrc = buildThumbnailPath(photoData.file, quality);
        var originalSrc = photoData.file;
        return preloadImage(thumbnailSrc, originalSrc).then(function(result) {
            return {
                value: photoData,
                result: result,
                quality: quality,
                originalFilePath: photoData.file
            };
        });
    };

    /**
     * Delay helper for throttling operations.
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise} - Resolves after delay
     */
    var delay = function(ms) {
        return new Promise(function(resolve) {
            setTimeout(resolve, ms);
        });
    };

    /**
     * Load photos in batches to prevent network/CPU saturation.
     * @param {Object[]} photos - Array of photo data objects
     * @param {string} quality - Quality level: 'M' or 'XL'
     * @param {number} batchSize - Number of photos per batch
     * @returns {Promise<Object[]>} - Array of all loaded results
     */
    var loadPhotosInBatches = function(photos, quality, batchSize) {
        var results = [];
        var batches = [];

        // Split photos into batches
        for (var i = 0; i < photos.length; i += batchSize) {
            batches.push(photos.slice(i, i + batchSize));
        }

        // Process batches sequentially
        var processNextBatch = function(batchIndex) {
            if (batchIndex >= batches.length) {
                return Promise.resolve(results);
            }

            var batch = batches[batchIndex];
            var batchPromises = batch.map(function(photo) {
                return preloadImageWithQuality(photo, quality);
            });

            return Promise.all(batchPromises).then(function(batchResults) {
                results = results.concat(batchResults);
                return processNextBatch(batchIndex + 1);
            });
        };

        return processNextBatch(0);
    };

    // Flag to pause upgrades during animations
    var upgradesPaused = false;

    /**
     * Upgrade a single image to higher quality.
     * @param {jQuery} $imgBox - The img_box div containing the image
     * @param {string} targetQuality - Target quality level: 'XL' or 'original'
     * @returns {Promise<boolean>} - True if upgrade succeeded, false if skipped
     */
    var upgradeImageQuality = function($imgBox, targetQuality) {
        return new Promise(function(resolve) {
            // Skip if upgrades are paused (during animations)
            if (upgradesPaused) {
                resolve(false);
                return;
            }

            // Get current quality level
            var currentQuality = $imgBox.data('quality-level') || INITIAL_QUALITY;
            var currentLevel = qualityLevel(currentQuality);
            var targetLevel = qualityLevel(targetQuality);

            // Skip if already at target quality or higher
            if (currentLevel >= targetLevel) {
                resolve(false);
                return;
            }

            // Get the original file path
            var originalFilePath = $imgBox.data('original-file-path');
            if (!originalFilePath) {
                resolve(false);
                return;
            }

            // Build the higher quality thumbnail path
            var thumbnailSrc = buildThumbnailPath(originalFilePath, targetQuality);
            var fallbackSrc = originalFilePath;

            // Preload the higher quality image
            preloadImage(thumbnailSrc, fallbackSrc).then(function(result) {
                if (!result.loaded || !result.img) {
                    resolve(false);
                    return;
                }

                // Check again if upgrades are paused (could have changed during load)
                if (upgradesPaused) {
                    result.img = null;
                    resolve(false);
                    return;
                }

                // Update the image src
                var $img = $imgBox.find('img');
                if ($img.length > 0) {
                    $img.attr('src', result.img.src);
                    $imgBox.data('quality-level', targetQuality);
                }

                // Null out reference to help GC
                result.img = null;
                resolve(true);
            });
        });
    };

    /**
     * Upgrade all photos to target quality in batches.
     * @param {string} targetQuality - Target quality level: 'XL' or 'original'
     * @returns {Promise} - Resolves when all upgrades complete
     */
    var upgradePhotosInBatches = function(targetQuality) {
        var $imgBoxes = $('#photo_store').find('.img_box').toArray();
        var batches = [];

        // Split into batches
        for (var i = 0; i < $imgBoxes.length; i += UPGRADE_BATCH_SIZE) {
            batches.push($imgBoxes.slice(i, i + UPGRADE_BATCH_SIZE));
        }

        var processedCount = 0;
        var totalCount = $imgBoxes.length;

        // Process batches sequentially with delays
        var processNextBatch = function(batchIndex) {
            if (batchIndex >= batches.length) {
                debugLog('Progressive loading: Upgrade complete (' + processedCount + '/' + totalCount + ')');
                return Promise.resolve();
            }

            var batch = batches[batchIndex];
            var upgradePromises = batch.map(function(imgBox) {
                return upgradeImageQuality($(imgBox), targetQuality);
            });

            return Promise.allSettled(upgradePromises).then(function(results) {
                // Count successful upgrades vs failures
                var successes = results.filter(function(r) { return r.status === 'fulfilled'; }).length;
                var failures = results.length - successes;
                processedCount += successes;
                if (failures > 0) {
                    debugWarn('Progressive loading: ' + failures + ' upgrade(s) failed in batch ' + batchIndex);
                }
                // Log progress every few batches
                if (batchIndex > 0 && batchIndex % 2 === 0) {
                    debugLog('Progressive loading: Upgrading... (' + processedCount + '/' + totalCount + ')');
                }
                // Delay before next batch
                return delay(UPGRADE_DELAY_MS);
            }).then(function() {
                return processNextBatch(batchIndex + 1);
            });
        };

        return processNextBatch(0);
    };

    /**
     * Start background quality upgrades after initial display.
     * Upgrades all photos from initial quality (M) to final quality (XL).
     */
    var startBackgroundUpgrades = function() {
        debugLog('Progressive loading: Starting background upgrades to ' + FINAL_QUALITY);
        upgradePhotosInBatches(FINAL_QUALITY).catch(function(error) {
            console.error('Progressive loading: Upgrade error:', error);
        });
    };

    // --- End Progressive Loading Helper Functions ---

    /**
     * Process loaded photo results and add to photo store.
     * @param {Object[]} results - Array of { value, result, quality, originalFilePath }
     * @param {jQuery} photo_store - The photo store element
     * @param {string} quality - Quality level of loaded images
     */
    var processLoadedPhotos = function(results, photo_store, quality) {
        var landscape = photo_store.find('#landscape');
        var portrait = photo_store.find('#portrait');
        var panorama = photo_store.find('#panorama');

        results.forEach(function(item) {
            if (!item.result.loaded || !item.result.img) {
                // Clear reference even for failed loads
                item.result = null;
                return;
            }

            var img = item.result.img;
            var photoData = {
                file: item.value.file,
                originalFilePath: item.originalFilePath
            };
            var div = createImgBox(img, photoData, quality);

            // Append to appropriate orientation bucket
            var orientation = div.data('orientation');
            if (orientation === 'panorama') {
                panorama.append(div);
            } else if (orientation === 'landscape') {
                landscape.append(div);
            } else if (orientation === 'portrait') {
                portrait.append(div);
            }

            // Clear the result reference to allow GC of the preload metadata
            // (the img element itself is now in the DOM)
            item.result = null;
        });

        // Clear the results array reference
        results.length = 0;
    };

    var stage_photos = function() {
        // Reset inter-row pattern tracking on full page refresh
        resetPatternTracking();

        var photo_store = $('#photo_store');

        $.getJSON("/album/25?xtime="+_.now())
        .fail(function(jqXHR, textStatus, errorThrown) {
            console.error('Failed to fetch album:', textStatus, errorThrown);
            _.delay(stage_photos, 5000);
        })
        .done(function(data) {
            if (!PROGRESSIVE_LOADING_ENABLED) {
                // Original behavior: load all photos with XL quality
                var preloadPromises = data.images.map(function(value) {
                    var thumbnailSrc = buildThumbnailPath(value.file, FINAL_QUALITY);
                    var originalSrc = value.file;
                    return preloadImage(thumbnailSrc, originalSrc).then(function(result) {
                        return { value: value, result: result, quality: FINAL_QUALITY, originalFilePath: value.file };
                    });
                });

                Promise.all(preloadPromises).then(function(results) {
                    processLoadedPhotos(results, photo_store, FINAL_QUALITY);
                    finish_staging(data.count);
                });
                return;
            }

            // Progressive loading: Stage 1 - Load first batch with M quality (fast display)
            debugLog('Progressive loading: Stage 1 - Loading initial ' + INITIAL_BATCH_SIZE + ' photos with ' + INITIAL_QUALITY + ' quality');
            var initialBatch = data.images.slice(0, INITIAL_BATCH_SIZE);
            var remainingBatch = data.images.slice(INITIAL_BATCH_SIZE);

            loadPhotosInBatches(initialBatch, INITIAL_QUALITY, LOAD_BATCH_SIZE)
                .then(function(initialResults) {
                    // Process initial batch and display immediately
                    processLoadedPhotos(initialResults, photo_store, INITIAL_QUALITY);
                    debugLog('Progressive loading: Stage 1 complete - Displaying slideshow');
                    finish_staging(initialBatch.length);

                    // Stage 2: Load remaining photos in background (non-blocking)
                    if (remainingBatch.length > 0) {
                        debugLog('Progressive loading: Stage 2 - Loading remaining ' + remainingBatch.length + ' photos');
                        loadPhotosInBatches(remainingBatch, INITIAL_QUALITY, LOAD_BATCH_SIZE)
                            .then(function(remainingResults) {
                                processLoadedPhotos(remainingResults, photo_store, INITIAL_QUALITY);
                                debugLog('Progressive loading: Stage 2 complete - All photos loaded');

                                // Stage 3: Start background upgrades to XL quality
                                debugLog('Progressive loading: Stage 3 - Starting background upgrades');
                                startBackgroundUpgrades();
                            })
                            .catch(function(error) {
                                console.error('Progressive loading: Stage 2 error:', error);
                                // Still start upgrades for photos that did load
                                startBackgroundUpgrades();
                            });
                    } else {
                        // No remaining batch, just start upgrades
                        debugLog('Progressive loading: Stage 3 - Starting background upgrades');
                        startBackgroundUpgrades();
                    }
                })
                .catch(function(error) {
                    console.error('Progressive loading: Stage 1 error:', error);
                    // Fallback: retry with traditional loading
                    _.delay(stage_photos, 5000);
                });
        });
    };

    stage_photos();
})();

