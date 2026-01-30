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
     * Picks from landscape, portrait, or panorama stores based on availability.
     * @returns {Object|null} - Object with { $imgBox, orientation, aspectRatio, columns } or null if store is empty
     */
    var selectRandomPhotoFromStore = function() {
        var photo_store = $('#photo_store');
        var allPhotos = photo_store.find('#landscape div.img_box, #portrait div.img_box, #panorama div.img_box');

        if (allPhotos.length === 0) {
            return null;
        }

        var $imgBox = allPhotos.random();
        if ($imgBox.length === 0) {
            return null;
        }

        var orientation = $imgBox.data('orientation');
        var aspectRatio = $imgBox.data('aspect_ratio');
        var isPanorama = $imgBox.data('panorama') || false;

        // Determine columns needed based on orientation
        var columns;
        if (isPanorama) {
            var totalColumns = (window_ratio === 'wide') ? 5 : 4;
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

            if (remainingColumns >= 2) {
                // Can fit either landscape (2 cols) or portrait (1 col)
                // Select based on container shape
                photo = selectPhotoForContainer(containerAspectRatio);
                if (!photo) break; // No photos available
                width = (photo.data('orientation') === 'landscape') ? 2 : 1;
            } else {
                // Only 1 column remaining, prefer portrait
                photo = selectPhotoForContainer(containerAspectRatio);
                if (!photo) break; // No photos available
                width = (photo.data('orientation') === 'landscape') ? 2 : 1;
                if (width > remainingColumns) {
                    // Put it back and stop - can't fit
                    photo_store.find('#landscape').append(photo);
                    break;
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

        // Select a new photo from the store
        var newPhotoData = selectRandomPhotoFromStore();
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
     * Select a photo from the store that best matches the container aspect ratio.
     * Prefers portrait for tall containers, landscape for wide containers.
     * @param {number} containerAspectRatio - Width/height ratio of the container
     * @returns {jQuery|null} - The selected img_box element, or null if none available
     */
    var selectPhotoForContainer = function(containerAspectRatio) {
        var photo_store = $('#photo_store');
        var portraits = photo_store.find('#portrait div.img_box');
        var landscapes = photo_store.find('#landscape div.img_box');

        // Container is taller than wide - prefer portrait
        if (containerAspectRatio < 1) {
            if (portraits.length > 0) {
                return portraits.random().detach();
            } else if (landscapes.length > 0) {
                return landscapes.random().detach();
            }
        }
        // Container is wider than tall - prefer landscape
        else {
            if (landscapes.length > 0) {
                return landscapes.random().detach();
            } else if (portraits.length > 0) {
                return portraits.random().detach();
            }
        }

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

            var columnsToFill = panoramaContainer ? (columns - panoramaColumns) : columns;
            while (used_columns < columns && (panoramaOnLeft || used_columns < columnsToFill)) {
                var photo;
                var width;
                var div;
                var remainingColumns = panoramaOnLeft ? (columns - used_columns) : (columnsToFill - used_columns);

                // Calculate container aspect ratio to prefer matching photo orientation
                var containerWidth = (remainingColumns / columns) * viewportWidth;
                var containerAspectRatio = containerWidth / viewportHeight;

                if (remainingColumns >= 2) {
                    // Container can fit landscape (2 cols) or portrait (1 col)
                    // Select based on container shape
                    photo = selectPhotoForContainer(containerAspectRatio);
                    if (!photo) break; // No photos available
                    width = (photo.data('orientation') === 'landscape') ? 2 : 1;
                    div = build_div(photo, width, columns);
                } else {
                    // Only 1 column remaining - must use portrait or stack landscapes
                    width = 1;
                    photo = selectPhotoForContainer(containerAspectRatio);
                    if (!photo) break; // No photos available
                    div = build_div(photo, width, columns);
                    if (photo.data('orientation') === 'landscape') {
                        // Stack a second landscape in the same column
                        var secondPhoto = photo_store.find('#landscape div.img_box').random().detach();
                        if (secondPhoto.length > 0) {
                            div.append(secondPhoto);
                        }
                    }
                }

                div.data('display_time', Date.now());
                div.data('columns', width);
                used_columns += width;
                row.append(div);
            }

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
