(function() {
    "use strict";

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
        //sheet.insertRule(".portrait { max-width: 100%; height: "+half_height+"px;}",0);
        try { sheet.removeRule(0); } catch(e) {}
        sheet.addRule(".portrait", "max-width: 100%; height: "+half_height+"px;");
    };

    $(window).resize(resize);
    resize();

    var refresh_album_time = 15 * 60 * 1000;

    // Individual photo swap configuration constants
    var SWAP_INTERVAL = 20 * 1000;         // Swap one photo every 20 seconds
    var MIN_DISPLAY_TIME = 60 * 1000;      // Minimum time before photo is eligible for swap
    var nextRowToSwap = 'top';             // Alternating row tracker (top/bottom)
    var isFirstSwap = true;                // Skip MIN_DISPLAY_TIME on first swap

    // Panorama configuration constants
    var PANORAMA_ASPECT_THRESHOLD = 2.0;      // Aspect ratio above which image is considered panorama
    var PANORAMA_USE_PROBABILITY = 0.5;       // Chance to use panorama when available
    var PANORAMA_STEAL_PROBABILITY = 0.5;     // Chance to steal panorama from other row
    var PANORAMA_POSITION_LEFT_PROBABILITY = 0.5;  // Chance to place panorama on left vs right
    var PAN_SPEED_PX_PER_SEC = 10;            // Animation pan speed in pixels per second

    // Layout variety configuration constants
    var ORIENTATION_MATCH_PROBABILITY = 0.7;  // Probability to prefer matching orientation (landscape for wide, portrait for narrow)
    var FILL_RIGHT_TO_LEFT_PROBABILITY = 0.5; // Probability to fill row right-to-left instead of left-to-right
    var INTER_ROW_DIFFER_PROBABILITY = 0.7;   // Probability to prefer different pattern from other row
    var STACKED_LANDSCAPES_PROBABILITY = 0.3; // Probability to use stacked landscapes instead of portrait for 1-col slots

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

    // Slide animation configuration
    var SLIDE_DIRECTIONS = ['up', 'down', 'left', 'right'];
    var SLIDE_ANIMATION_DURATION = 1200;      // Animation duration in milliseconds (matches CSS)
    var pendingAnimationTimers = [];          // Track animation timers for cleanup

    /**
     * Get a random slide direction for photo swap animation.
     * @returns {string} - One of 'up', 'down', 'left', 'right'
     */
    var getRandomSlideDirection = function() {
        return SLIDE_DIRECTIONS[Math.floor(Math.random() * SLIDE_DIRECTIONS.length)];
    };

    /**
     * Get the opposite direction for slide-out animation.
     * @param {string} direction - The incoming direction
     * @returns {string} - The opposite direction
     */
    var getOppositeDirection = function(direction) {
        var opposites = {
            'up': 'down',
            'down': 'up',
            'left': 'right',
            'right': 'left'
        };
        return opposites[direction] || 'down';
    };

    // --- Helper Functions for Individual Photo Swap ---

    /**
     * Extract the number of columns a photo spans from its Pure CSS class.
     * Pure CSS classes use format: pure-u-X-Y where X/Y is the fraction.
     * For a 5-column grid, pure-u-2-5 means 2 columns.
     * Falls back to data('columns') if class parsing fails.
     * @param {jQuery} $photo - The photo div element (with .photo class)
     * @returns {number} - Number of columns the photo spans
     */
    var getPhotoColumns = function($photo) {
        // First try to get from data attribute (set in Phase 2)
        var dataColumns = $photo.data('columns');
        if (dataColumns && dataColumns > 0) {
            return dataColumns;
        }

        // Fallback: parse from Pure CSS class
        var classList = $photo.attr('class') || '';
        var match = classList.match(/pure-u-(\d+)-(\d+)/);
        if (match) {
            return parseInt(match[1], 10);
        }

        // Default to 1 if unable to determine
        return 1;
    };

    /**
     * Get the adjacent photo in a row (left or right neighbor).
     * @param {jQuery} $photo - The photo div element (with .photo class)
     * @param {string} direction - 'left' or 'right'
     * @returns {jQuery|null} - The adjacent photo, or null if none exists
     */
    var getAdjacentPhoto = function($photo, direction) {
        if (direction === 'left') {
            var $prev = $photo.prev('.photo');
            return $prev.length > 0 ? $prev : null;
        } else if (direction === 'right') {
            var $next = $photo.next('.photo');
            return $next.length > 0 ? $next : null;
        }
        return null;
    };

    /**
     * Select a random photo from the photo store with its metadata.
     * Uses randomized orientation selection based on ORIENTATION_MATCH_PROBABILITY.
     * Optionally considers container aspect ratio for better matching.
     * @param {number} [containerAspectRatio] - Optional width/height ratio of the target container
     * @param {boolean} [isEdgePosition=false] - If true, this is an edge position (left/right most)
     * @returns {Object|null} - Object with { $imgBox, orientation, aspectRatio, columns } or null if store is empty
     */
    var selectRandomPhotoFromStore = function(containerAspectRatio, isEdgePosition) {
        var photo_store = $('#photo_store');
        var totalColumns = (window_ratio === 'wide') ? 5 : 4;

        // Check for panoramas first - with configured probability
        var panoramas = photo_store.find('#panorama div.img_box');
        if (panoramas.length > 0 && Math.random() < PANORAMA_USE_PROBABILITY) {
            var $panorama = panoramas.random().detach();
            var panoAspect = $panorama.data('aspect_ratio');
            var panoColumns = calculatePanoramaColumns(panoAspect, totalColumns);
            return {
                $imgBox: $panorama,
                orientation: 'panorama',
                aspectRatio: panoAspect,
                isPanorama: true,
                columns: panoColumns
            };
        }

        // Use selectPhotoForContainer for randomized orientation selection
        // If no container aspect ratio provided, use a default based on typical 2-column landscape
        var viewportWidth = $(window).width();
        var viewportHeight = $(window).height() / 2;
        var defaultColumns = 2;
        var defaultAspect = containerAspectRatio || ((defaultColumns / totalColumns) * viewportWidth / viewportHeight);

        // Edge positions are more likely to be portrait (1 col) at row ends
        // Force random selection for edge positions to add variety
        var forceRandom = isEdgePosition && Math.random() < 0.5;

        var $imgBox = selectPhotoForContainer(defaultAspect, forceRandom);
        if (!$imgBox) {
            console.log('selectRandomPhotoFromStore: No photos available in store');
            return null;
        }

        var orientation = $imgBox.data('orientation');
        var aspectRatio = $imgBox.data('aspect_ratio');
        var isPanorama = $imgBox.data('panorama') || false;

        // Determine columns needed based on orientation
        var columns;
        if (isPanorama) {
            columns = calculatePanoramaColumns(aspectRatio, totalColumns);
        } else if (orientation === 'landscape') {
            columns = 2;
        } else {
            columns = 1;
        }

        return {
            $imgBox: $imgBox,
            orientation: orientation,
            aspectRatio: aspectRatio,
            isPanorama: isPanorama,
            columns: columns
        };
    };

    /**
     * Select a photo to replace from a row using weighted random selection.
     * Photos that have been displayed longer have higher probability of being selected.
     * @param {string} row - Row selector ('#top_row' or '#bottom_row')
     * @param {boolean} skipTimeCheck - If true, ignore MIN_DISPLAY_TIME requirement
     * @returns {jQuery|null} - The selected photo div, or null if no photos are eligible
     */
    var selectPhotoToReplace = function(row, skipTimeCheck) {
        var now = Date.now();
        var $row = $(row);
        var $photos = $row.find('.photo');

        if ($photos.length === 0) {
            return null;
        }

        // Filter to only photos that have been displayed >= MIN_DISPLAY_TIME
        // (unless skipTimeCheck is true, e.g., for the first swap)
        var eligiblePhotos = [];
        $photos.each(function() {
            var $photo = $(this);
            var displayTime = $photo.data('display_time');
            var meetsTimeRequirement = skipTimeCheck || (displayTime && (now - displayTime) >= MIN_DISPLAY_TIME);
            if (displayTime && meetsTimeRequirement) {
                eligiblePhotos.push({
                    $photo: $photo,
                    displayTime: displayTime,
                    weight: now - displayTime  // Weight = time on screen (older = higher weight)
                });
            }
        });

        // Return null if no photos are eligible yet
        if (eligiblePhotos.length === 0) {
            return null;
        }

        // Calculate total weight for weighted random selection
        var totalWeight = 0;
        for (var i = 0; i < eligiblePhotos.length; i++) {
            totalWeight += eligiblePhotos[i].weight;
        }

        // Weighted random selection
        var randomValue = Math.random() * totalWeight;
        var cumulativeWeight = 0;
        for (var j = 0; j < eligiblePhotos.length; j++) {
            cumulativeWeight += eligiblePhotos[j].weight;
            if (randomValue <= cumulativeWeight) {
                return eligiblePhotos[j].$photo;
            }
        }

        // Fallback: return the last eligible photo (shouldn't normally reach here)
        return eligiblePhotos[eligiblePhotos.length - 1].$photo;
    };

    /**
     * Make space for a new photo by removing adjacent photos.
     * Starts from target photo and expands in a random direction until enough columns are freed.
     * @param {string} row - Row selector ('#top_row' or '#bottom_row')
     * @param {jQuery} $targetPhoto - The initially selected photo to replace
     * @param {number} neededColumns - Number of columns needed for the new photo
     * @returns {Object|null} - { photosToRemove: jQuery[], insertionIndex: number, totalColumns: number } or null if unable
     */
    var makeSpaceForPhoto = function(row, $targetPhoto, neededColumns) {
        var $row = $(row);
        var $allPhotos = $row.find('.photo');
        var targetIndex = $allPhotos.index($targetPhoto);

        if (targetIndex === -1) {
            return null;
        }

        // Start with the target photo
        var photosToRemove = [$targetPhoto];
        var totalColumns = getPhotoColumns($targetPhoto);
        var leftIndex = targetIndex;
        var rightIndex = targetIndex;

        // Pick a random initial direction
        var directions = ['left', 'right'];
        var currentDirection = directions[Math.floor(Math.random() * 2)];

        // Keep removing adjacent photos until we have enough space
        while (totalColumns < neededColumns) {
            var $adjacent = null;

            // Try current direction first
            if (currentDirection === 'left' && leftIndex > 0) {
                leftIndex--;
                $adjacent = $allPhotos.eq(leftIndex);
            } else if (currentDirection === 'right' && rightIndex < $allPhotos.length - 1) {
                rightIndex++;
                $adjacent = $allPhotos.eq(rightIndex);
            }

            // If current direction exhausted, try opposite
            if (!$adjacent || $adjacent.length === 0) {
                currentDirection = (currentDirection === 'left') ? 'right' : 'left';

                if (currentDirection === 'left' && leftIndex > 0) {
                    leftIndex--;
                    $adjacent = $allPhotos.eq(leftIndex);
                } else if (currentDirection === 'right' && rightIndex < $allPhotos.length - 1) {
                    rightIndex++;
                    $adjacent = $allPhotos.eq(rightIndex);
                }
            }

            // If no more adjacent photos in either direction, we can't make enough space
            if (!$adjacent || $adjacent.length === 0) {
                break;
            }

            photosToRemove.push($adjacent);
            totalColumns += getPhotoColumns($adjacent);

            // Alternate direction for next iteration
            currentDirection = (currentDirection === 'left') ? 'right' : 'left';
        }

        // If we still don't have enough space, return null
        if (totalColumns < neededColumns) {
            return null;
        }

        return {
            photosToRemove: photosToRemove,
            insertionIndex: leftIndex,
            totalColumns: totalColumns
        };
    };

    /**
     * Fill remaining space in a row after inserting a new photo.
     * Selects photos from the store that fit the remaining columns.
     * Prefers photos whose orientation matches the container shape.
     * @param {string} row - Row selector ('#top_row' or '#bottom_row')
     * @param {jQuery} $newPhoto - The newly inserted photo div
     * @param {number} remainingColumns - Number of columns still available
     * @param {number} totalColumnsInGrid - Total columns in the grid (4 or 5)
     * @returns {jQuery[]} - Array of newly created photo divs to animate in
     */
    var fillRemainingSpace = function(row, $newPhoto, remainingColumns, totalColumnsInGrid) {
        var photo_store = $('#photo_store');
        var newPhotos = [];

        // Calculate viewport dimensions for aspect ratio calculations
        var viewportWidth = $(window).width();
        var viewportHeight = $(window).height() / 2;

        while (remainingColumns > 0) {
            var photo;
            var width;
            var div;

            // Calculate container aspect ratio for remaining space
            var containerWidth = (remainingColumns / totalColumnsInGrid) * viewportWidth;
            var containerAspectRatio = containerWidth / viewportHeight;

            // Last fill (remaining space = 1 column) is likely at an edge position
            var isEdgePosition = (remainingColumns === 1);
            // Use forceRandom for edge positions to add variety
            var forceRandom = isEdgePosition && Math.random() < 0.5;

            if (remainingColumns >= 2) {
                // Can fit either landscape (2 cols) or portrait (1 col)
                // Select based on container shape with randomization
                photo = selectPhotoForContainer(containerAspectRatio, forceRandom);
                if (!photo) break; // No photos available
                width = (photo.data('orientation') === 'landscape') ? 2 : 1;
            } else {
                // Only 1 column remaining - MUST get a 1-col photo (portrait or stacked)
                // Use same logic as build_row: randomly choose between portrait and stacked landscapes
                var portraits = photo_store.find('#portrait div.img_box');
                var landscapeCount = photo_store.find('#landscape div.img_box').length;
                var hasPortraits = portraits.length > 0;
                var hasEnoughLandscapes = landscapeCount >= 2;

                // Decide: use stacked landscapes with STACKED_LANDSCAPES_PROBABILITY,
                // but only if we have enough landscapes and fallback available
                var useStackedLandscapes = hasEnoughLandscapes &&
                    (Math.random() < STACKED_LANDSCAPES_PROBABILITY || !hasPortraits);

                if (useStackedLandscapes) {
                    // Use stacked landscapes for this 1-col slot
                    var stackedDiv = createStackedLandscapes(photo_store, totalColumnsInGrid);
                    if (stackedDiv) {
                        stackedDiv.data('display_time', Date.now());
                        stackedDiv.data('columns', 1);
                        stackedDiv.css('opacity', '0');
                        newPhotos.push(stackedDiv);
                        remainingColumns -= 1;
                        continue; // Skip the normal photo handling below
                    }
                    // Stacked landscapes failed, fall through to portrait
                }

                if (hasPortraits) {
                    photo = portraits.random().detach();
                    width = 1;
                } else {
                    // No portraits and stacked landscapes didn't work - clone from page
                    photo = clonePhotoFromPage('portrait');
                    if (!photo) {
                        // Truly nothing available - clone any photo
                        photo = clonePhotoFromPage();
                        if (!photo) break;
                    }
                    width = 1; // Force 1-col regardless of actual orientation
                }
            }

            div = build_div(photo, width, totalColumnsInGrid);
            div.data('display_time', Date.now());
            div.data('columns', width);
            div.css('opacity', '0'); // Start invisible for fade-in animation

            newPhotos.push(div);
            remainingColumns -= width;
        }

        return newPhotos;
    };

    /**
     * Animate the swap of photos in a row with slide transitions.
     * Old photos slide out in one direction while new photo slides in from the opposite.
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
        var slideDirection = getRandomSlideDirection();
        var slideOutDirection = getOppositeDirection(slideDirection);

        // Clear any pending animation timers from previous swaps
        pendingAnimationTimers.forEach(function(timerId) {
            clearTimeout(timerId);
        });
        pendingAnimationTimers = [];

        // Insert new photo at the correct position (initially hidden off-screen)
        $newPhotoDiv.addClass('slide-in-from-' + slideDirection);
        $newPhotoDiv.css('visibility', 'visible');

        // Insert at the correct position
        var $allPhotos = $row.find('.photo');
        if (insertionIndex === 0 || $allPhotos.length === 0) {
            $row.prepend($newPhotoDiv);
        } else if (insertionIndex >= $allPhotos.length) {
            $row.append($newPhotoDiv);
        } else {
            $allPhotos.eq(insertionIndex).before($newPhotoDiv);
        }

        // Animate old photos out with slide-out animation
        photosToRemove.forEach(function($photo) {
            $photo.addClass('slide-out-to-' + slideOutDirection);
        });

        // After animation completes, clean up old photos and add fill photos
        var mainTimerId = setTimeout(function() {
            // Return old photos to store
            photosToRemove.forEach(function($photo) {
                var $imgBox = $photo.find('.img_box');
                if ($imgBox.length > 0) {
                    $imgBox.detach();
                    var orientation = $imgBox.data('orientation');
                    photo_store.find('#' + orientation).first().append($imgBox);
                }
                $photo.remove();
            });

            // Remove animation classes from new photo
            $newPhotoDiv.removeClass('slide-in-from-' + slideDirection);

            // Fill remaining space with additional photos if needed
            if (extraColumns > 0) {
                var fillPhotos = fillRemainingSpace(row, $newPhotoDiv, extraColumns, totalColumnsInGrid);

                // Insert fill photos after the new photo and animate them in
                fillPhotos.forEach(function($fillPhoto, index) {
                    // Stagger the fill photo animations slightly
                    var staggerTimerId = setTimeout(function() {
                        $fillPhoto.addClass('slide-in-from-' + slideDirection);
                        $newPhotoDiv.after($fillPhoto);

                        // Remove animation class after it completes
                        var cleanupTimerId = setTimeout(function() {
                            $fillPhoto.removeClass('slide-in-from-' + slideDirection);
                            $fillPhoto.css('opacity', '1');
                        }, SLIDE_ANIMATION_DURATION);
                        pendingAnimationTimers.push(cleanupTimerId);
                    }, index * 100);
                    pendingAnimationTimers.push(staggerTimerId);
                });
            }
        }, SLIDE_ANIMATION_DURATION);
        pendingAnimationTimers.push(mainTimerId);
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
        // Skip time check on first swap so the show starts immediately
        var $targetPhoto = selectPhotoToReplace(row, isFirstSwap);
        if (!$targetPhoto) {
            console.log('swapSinglePhoto: No eligible photos to replace in ' + row);
            return;
        }

        // First swap complete, enforce time check from now on
        isFirstSwap = false;

        // Calculate container aspect ratio based on target photo's position
        var $row = $(row);
        var $allPhotos = $row.find('.photo');
        var targetIndex = $allPhotos.index($targetPhoto);
        var targetColumns = getPhotoColumns($targetPhoto);
        var viewportWidth = $(window).width();
        var viewportHeight = $(window).height() / 2;
        var containerWidth = (targetColumns / totalColumns) * viewportWidth;
        var containerAspectRatio = containerWidth / viewportHeight;

        // Determine if target is at edge (first or last position in row)
        var isEdgePosition = (targetIndex === 0 || targetIndex === $allPhotos.length - 1);

        // Select a new photo from the store with context-aware selection
        var newPhotoData = selectRandomPhotoFromStore(containerAspectRatio, isEdgePosition);
        if (!newPhotoData) {
            console.log('swapSinglePhoto: No photos available in store');
            return;
        }

        var $imgBox = newPhotoData.$imgBox;
        var neededColumns = newPhotoData.columns;

        // Make space for the new photo (may need to remove adjacent photos)
        var spaceInfo = makeSpaceForPhoto(row, $targetPhoto, neededColumns);
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

    /**
     * Create a stacked-landscapes container for a 1-column slot.
     * Places two landscape photos stacked vertically, each taking half the height.
     * @param {jQuery} photo_store - The photo store jQuery element
     * @param {number} columns - Total columns in the grid (4 or 5)
     * @returns {jQuery|null} - The stacked-landscapes div, or null if not enough landscapes available
     */
    var createStackedLandscapes = function(photo_store, columns) {
        var landscapes = photo_store.find('#landscape div.img_box');
        if (landscapes.length < 2) {
            return null;
        }

        // Get two random landscapes
        var firstPhoto = landscapes.random().detach();
        landscapes = photo_store.find('#landscape div.img_box'); // Refresh after detach
        var secondPhoto = landscapes.random().detach();

        if (!firstPhoto || firstPhoto.length === 0 || !secondPhoto || secondPhoto.length === 0) {
            // Put back any detached photo and return null
            if (firstPhoto && firstPhoto.length > 0) {
                photo_store.find('#landscape').append(firstPhoto);
            }
            return null;
        }

        // Create container div for 1-column width
        var div = build_div(firstPhoto, 1, columns);
        div.addClass('stacked-landscapes');
        div.append(secondPhoto);

        // CSS uses .stacked-landscapes .img_box:first-child and :last-child
        // to apply half-height styling, so no additional classes needed

        return div;
    };

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
     * Clone a random photo from an existing row when the store is empty.
     * This ensures we always have photos to fill the grid.
     * @param {string} [preferOrientation] - Optional preferred orientation ('portrait' or 'landscape')
     * @returns {jQuery|null} - A cloned img_box element, or null if no photos exist on page
     */
    var clonePhotoFromPage = function(preferOrientation) {
        var $allPhotos = $('#top_row .img_box, #bottom_row .img_box');
        if ($allPhotos.length === 0) {
            return null;
        }

        // If we have a preference, try to find matching orientation first
        if (preferOrientation) {
            var $matching = $allPhotos.filter(function() {
                return $(this).data('orientation') === preferOrientation;
            });
            if ($matching.length > 0) {
                $allPhotos = $matching;
            }
        }

        // Pick a random photo and clone it
        // Use clone(false) to skip event handlers - we only need the DOM structure
        var $original = $allPhotos.random();
        var $clone = $original.clone(false);

        // Copy the necessary data attributes (clone(false) doesn't copy jQuery data)
        $clone.data({
            height: $original.data('height'),
            width: $original.data('width'),
            aspect_ratio: $original.data('aspect_ratio'),
            orientation: $original.data('orientation'),
            panorama: $original.data('panorama')
        });

        return $clone;
    };

    /**
     * Select a photo from the store that best matches the container aspect ratio.
     * Uses probability-based selection: ORIENTATION_MATCH_PROBABILITY chance to prefer
     * matching orientation (portrait for tall containers, landscape for wide containers),
     * otherwise picks randomly from all available photos.
     * @param {number} containerAspectRatio - Width/height ratio of the container
     * @param {boolean} [forceRandom=false] - If true, always pick randomly regardless of container shape
     * @returns {jQuery|null} - The selected img_box element, or null if none available
     */
    var selectPhotoForContainer = function(containerAspectRatio, forceRandom) {
        var photo_store = $('#photo_store');
        var portraits = photo_store.find('#portrait div.img_box');
        var landscapes = photo_store.find('#landscape div.img_box');

        // If no photos available in store, clone from existing photos on page
        if (portraits.length === 0 && landscapes.length === 0) {
            var preferOrientation = containerAspectRatio < 1 ? 'portrait' : 'landscape';
            var $clone = clonePhotoFromPage(preferOrientation);
            if ($clone) {
                return $clone;
            }
            console.log('selectPhotoForContainer: No photos available anywhere');
            return null;
        }

        // Determine if we should use matching orientation or random selection
        // Roll against ORIENTATION_MATCH_PROBABILITY (default 70% prefer matching)
        var useMatchingOrientation = !forceRandom && Math.random() < ORIENTATION_MATCH_PROBABILITY;

        // Determine which orientation the container prefers
        var containerPrefersPortrait = containerAspectRatio < 1;
        var preferredOrientation = containerPrefersPortrait ? 'portrait' : 'landscape';

        if (useMatchingOrientation) {
            // Use matching orientation logic
            if (containerPrefersPortrait) {
                // Container is taller than wide - prefer portrait
                if (portraits.length > 0) {
                    return portraits.random().detach();
                } else if (landscapes.length > 0) {
                    // Fallback: only landscapes available
                    return landscapes.random().detach();
                }
            } else {
                // Container is wider than tall - prefer landscape
                if (landscapes.length > 0) {
                    return landscapes.random().detach();
                } else if (portraits.length > 0) {
                    // Fallback: only portraits available
                    return portraits.random().detach();
                }
            }
        } else {
            // Random selection: pick from all available photos regardless of container shape
            var allPhotos = photo_store.find('#portrait div.img_box, #landscape div.img_box');
            if (allPhotos.length > 0) {
                return allPhotos.random().detach();
            }
        }

        // Should not reach here, but return null as safety fallback
        console.log('selectPhotoForContainer: No photos available in store (portraits: ' + portraits.length + ', landscapes: ' + landscapes.length + ')');
        return null;
    };

    // Calculate how many columns a panorama should span
    // SYNC: Keep in sync with test/unit/panorama.test.mjs calculatePanoramaColumns function
    var calculatePanoramaColumns = function(imageRatio, totalColumns) {
        // Calculate cell aspect ratio from viewport dimensions
        var viewportWidth = $(window).width();
        var viewportHeight = $(window).height() / 2; // Each row is half the viewport height

        // Guard against division by zero (edge case: minimized window)
        if (viewportHeight <= 0) {
            return Math.max(2, totalColumns - 1);
        }

        var cellWidth = viewportWidth / totalColumns;
        var cellRatio = cellWidth / viewportHeight;

        // Calculate columns needed for panorama to fill vertical space
        var columnsNeeded = Math.ceil(imageRatio / cellRatio);

        // Clamp result between 2 and (totalColumns - 1) to leave room for a portrait
        return Math.max(2, Math.min(columnsNeeded, totalColumns - 1));
    }

    var build_row = function(row) {
        var photo_store = $('#photo_store');
        row = $(row);
        row.toggle('fade', 1000, function() {
            // detach all the child divs and put them back in the photo_store
            row.find('div.img_box').each( function() {
                var el = $(this);
                el.detach();
                photo_store.find('#'+el.data('orientation')).first().append(el);
            });
            row.empty();

            // With configured chance, release panorama from the OTHER row so this row can use it
            var otherRow = (row.attr('id') === 'top_row') ? '#bottom_row' : '#top_row';
            var otherRowHasPanorama = $(otherRow).find('.panorama-container').length > 0;
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
                panoramaColumns = calculatePanoramaColumns(imageRatio, columns);

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
                        photo = selectPhotoForContainer(containerAspectRatio);
                        if (!photo) {
                            // Ultimate fallback: clone a landscape from page
                            photo = clonePhotoFromPage('landscape');
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
                        div = createStackedLandscapes(photo_store, columns);
                        if (!div) {
                            // Fallback to portrait if stacked landscapes failed
                            photo = portraits.random().detach();
                            if (photo && photo.length > 0) {
                                div = build_div(photo, width, columns);
                            } else {
                                // Fallback: try any photo (includes clone fallback)
                                photo = selectPhotoForContainer(containerAspectRatio);
                                if (!photo) {
                                    // Ultimate fallback: clone from page
                                    photo = clonePhotoFromPage('portrait');
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
                        photo = selectPhotoForContainer(containerAspectRatio);
                        if (!photo) {
                            // Ultimate fallback: clone a portrait from page
                            photo = clonePhotoFromPage('portrait');
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

            // Fade in the row, then rebuild other row if needed (avoids race condition)
            row.toggle('fade', 1000, function() {
                if (shouldRebuildOtherRow) {
                    build_row(otherRow);
                }
            });
        });
    };

    /**
     * New shuffle show function using individual photo swap algorithm.
     * Swaps one photo at a time every SWAP_INTERVAL ms.
     * Reloads the page after refresh_album_time to get fresh photos from the server.
     * @param {number} end_time - Timestamp when the show should reload with fresh photos
     */
    var new_shuffle_show = function(end_time) {
        if (_.now() > end_time) {
            // Time to reload and get fresh photos from the server
            location.reload();
        } else {
            // Swap one photo using the individual photo swap algorithm
            swapSinglePhoto();
            // Schedule next swap
            _.delay(new_shuffle_show, SWAP_INTERVAL, end_time);
        }
    };

    var slide_show = function() {
        var photo_store = $('#photo_store');
        // Not sure if I should iterate through old photos and explicitly remove from DOM?
        // photos = staging_photos.slice(0);
        // prepare stage
        // Build up initial show
        build_row('#top_row', photo_store);
        build_row('#bottom_row', photo_store);

        // grab the first picture and pull out the album name
        var src = photo_store.find('img').first().attr('src');
        var regex = /(\d\d\d\d)\/(.*?)\//;
        var m = regex.exec(src);
        var year = m ? m[1] : '';
        var album = m ? m[2] : '';

        if (year && album) {
            $('.album_name').html(year + ' ' + album);
            console.log(year, album);
        }

        var start_time = _.now();
        var end_time = start_time + refresh_album_time;

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

    var preloadImage = function(src, fallbackSrc) {
        return new Promise(function(resolve) {
            var img = new Image();
            img.onload = function() { resolve({ img: img, loaded: true }); };
            img.onerror = function() {
                if (fallbackSrc) {
                    img.onload = function() { resolve({ img: img, loaded: true }); };
                    img.onerror = function() { resolve({ img: img, loaded: false }); };
                    img.src = fallbackSrc;
                } else {
                    resolve({ img: img, loaded: false });
                }
            };
            img.src = src;
        });
    };

    var buildThumbnailPath = function(filePath) {
        var s = filePath.split('/');
        s.splice(s.length - 1, 0, '@eaDir');
        s.splice(s.length, 0, 'SYNOPHOTO_THUMB_XL.jpg');
        return s.join('/');
    };

    var stage_photos = function() {
        // Reset inter-row pattern tracking on full page refresh
        resetPatternTracking();

        var photo_store = $('#photo_store');
        var landscape = $('#landscape');
        var portrait = $('#portrait');
        var panorama = $('#panorama');

        $.getJSON("/album/25?xtime="+_.now())
        .fail(function(jqXHR, textStatus, errorThrown) {
            console.error('Failed to fetch album:', textStatus, errorThrown);
            _.delay(stage_photos, 5000);
        })
        .done(function(data) {
            var preloadPromises = data.images.map(function(value) {
                var thumbnailSrc = buildThumbnailPath(value.file);
                var originalSrc = value.file;
                return preloadImage(thumbnailSrc, originalSrc).then(function(result) {
                    return { value: value, result: result };
                });
            });

            Promise.all(preloadPromises).then(function(results) {
                results.forEach(function(item) {
                    if (!item.result.loaded) {
                        return;
                    }

                    var img = item.result.img;
                    var height = img.height;
                    var width = img.width;
                    var aspect_ratio = width / height;
                    var orientation = height > width ? 'portrait' : 'landscape';
                    var is_panorama = aspect_ratio > PANORAMA_ASPECT_THRESHOLD;
                    var $img = $(img);
                    $img.addClass('pure-img ' + orientation);

                    var div = $("<div class='img_box'></div>");
                    div.data('height', height);
                    div.data('width', width);
                    div.data('aspect_ratio', aspect_ratio);
                    div.data('orientation', is_panorama ? 'panorama' : orientation);
                    div.data('panorama', is_panorama);
                    div.append($img);

                    if (is_panorama) {
                        panorama.append(div);
                    } else if (orientation === 'landscape') {
                        landscape.append(div);
                    } else if (orientation === 'portrait') {
                        portrait.append(div);
                    }
                });

                finish_staging(data.count);
            });
        });
    };

    stage_photos();
})();

// Added in a random function to the dom.  Use like so:
// $('div').random() to pick a random element
$.fn.random = function()
{
    var ret = $();

    if(this.length > 0)
        ret = ret.add(this[Math.floor((Math.random() * this.length))]);

    return ret;
};
