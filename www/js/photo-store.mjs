/**
 * Photo Store Module
 *
 * Manages photo selection logic for the slideshow, including:
 * - Random photo selection from store with orientation matching
 * - Weighted selection for photo replacement (older photos replaced first)
 * - Space management (making room and filling remaining space)
 * - Stacked landscapes creation
 * - Photo cloning when store is empty
 *
 * This module is extracted from main.js to improve testability and maintainability.
 */

// Import configuration constants
import {
    ORIENTATION_MATCH_PROBABILITY,
    STACKED_LANDSCAPES_PROBABILITY,
    PANORAMA_USE_PROBABILITY,
    PANORAMA_ASPECT_THRESHOLD
} from './config.mjs';

/**
 * Extract the number of columns a photo spans.
 * Checks data('columns') first (O(1) lookup set during build_row),
 * then falls back to parsing Pure CSS class (e.g., "pure-u-2-5").
 * @param {jQuery} $photo - The photo div element (with .photo class)
 * @returns {number} - Number of columns the photo spans (1-5)
 */
export function getPhotoColumns($photo) {
    // Primary: fast O(1) lookup from data attribute set during build_row()
    var columns = $photo.data('columns');
    if (columns && columns > 0) {
        return +columns;
    }

    // Fallback: parse from Pure CSS grid class
    var classList = $photo.attr('class');
    if (!classList) {
        return 1;
    }

    // Match Pure CSS grid class pattern: pure-u-{numerator}-{denominator}
    var regex = /pure-u-(\d+)-(\d+)/;
    var match = regex.exec(classList);

    if (match) {
        // Extract numerator (columns spanned) from the class
        return parseInt(match[1], 10);
    }

    // Default to 1 if unable to determine
    return 1;
}

/**
 * Get the adjacent photo in a row (left or right neighbor).
 * @param {jQuery} $photo - The photo div element (with .photo class)
 * @param {string} direction - 'left' or 'right'
 * @returns {jQuery|null} - The adjacent photo, or null if none exists
 */
export function getAdjacentPhoto($photo, direction) {
    if (direction === 'left') {
        var $prev = $photo.prev('.photo');
        return $prev.length > 0 ? $prev : null;
    } else if (direction === 'right') {
        var $next = $photo.next('.photo');
        return $next.length > 0 ? $next : null;
    }
    return null;
}

/**
 * Clone a random photo from an existing row when the store is empty.
 * This ensures we always have photos to fill the grid.
 * @param {jQuery} $ - jQuery instance
 * @param {string} [preferOrientation] - Optional preferred orientation ('portrait' or 'landscape')
 * @returns {jQuery|null} - A cloned img_box element, or null if no photos exist on page
 */
export function clonePhotoFromPage($, preferOrientation) {
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
}

/**
 * Select a photo from the store that best matches the container aspect ratio.
 * Uses probability-based selection: ORIENTATION_MATCH_PROBABILITY chance to prefer
 * matching orientation (portrait for tall containers, landscape for wide containers),
 * otherwise picks randomly from all available photos.
 * @param {jQuery} $ - jQuery instance
 * @param {number} containerAspectRatio - Width/height ratio of the container
 * @param {boolean} [forceRandom=false] - If true, always pick randomly regardless of container shape
 * @returns {jQuery|null} - The selected img_box element, or null if none available
 */
export function selectPhotoForContainer($, containerAspectRatio, forceRandom) {
    var photo_store = $('#photo_store');
    var portraits = photo_store.find('#portrait div.img_box');
    var landscapes = photo_store.find('#landscape div.img_box');

    // If no photos available in store, clone from existing photos on page
    if (portraits.length === 0 && landscapes.length === 0) {
        var preferOrientation = containerAspectRatio < 1 ? 'portrait' : 'landscape';
        var $clone = clonePhotoFromPage($, preferOrientation);
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
}

/**
 * Create a stacked-landscapes photo container (two landscape photos vertically stacked in 1 column).
 * @param {jQuery} $ - jQuery instance
 * @param {Function} build_div - Function to create a photo div with Pure CSS grid classes
 * @param {number} columns - Total columns in the grid (4 or 5)
 * @returns {jQuery|null} - The stacked-landscapes div, or null if not enough landscapes available
 */
export function createStackedLandscapes($, build_div, columns) {
    var photo_store = $('#photo_store');
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
}

/**
 * Calculate how many columns a panorama should span.
 * SYNC: Keep in sync with test/unit/panorama.test.mjs calculatePanoramaColumns function.
 * @param {jQuery} $ - jQuery instance
 * @param {number} imageRatio - Aspect ratio of the panorama image (width / height)
 * @param {number} totalColumns - Total columns in the grid (4 or 5)
 * @returns {number} - Number of columns the panorama should span (2 to totalColumns - 1)
 */
export function calculatePanoramaColumns($, imageRatio, totalColumns) {
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

/**
 * Select a random photo from the photo store with its metadata.
 * Uses randomized orientation selection based on ORIENTATION_MATCH_PROBABILITY.
 * Optionally considers container aspect ratio for better matching.
 * @param {jQuery} $ - jQuery instance
 * @param {string} window_ratio - 'wide' (5 cols) or 'normal' (4 cols)
 * @param {number} [containerAspectRatio] - Optional width/height ratio of the target container
 * @param {boolean} [isEdgePosition=false] - If true, this is an edge position (left/right most)
 * @returns {Object|null} - Object with { $imgBox, orientation, aspectRatio, isPanorama, columns } or null if store is empty
 */
export function selectRandomPhotoFromStore($, window_ratio, containerAspectRatio, isEdgePosition) {
    var photo_store = $('#photo_store');
    var totalColumns = (window_ratio === 'wide') ? 5 : 4;

    // Check for panoramas first - with configured probability
    var panoramas = photo_store.find('#panorama div.img_box');
    if (panoramas.length > 0 && Math.random() < PANORAMA_USE_PROBABILITY) {
        var $panorama = panoramas.random().detach();
        var panoAspect = $panorama.data('aspect_ratio');
        var panoColumns = calculatePanoramaColumns($, panoAspect, totalColumns);
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

    var $imgBox = selectPhotoForContainer($, defaultAspect, forceRandom);
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
        columns = calculatePanoramaColumns($, aspectRatio, totalColumns);
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
}

/**
 * Select a photo to replace from a row using weighted random selection.
 * Photos that have been displayed longer have higher probability of being selected.
 * @param {jQuery} $ - jQuery instance
 * @param {string} row - Row selector ('#top_row' or '#bottom_row')
 * @returns {jQuery|null} - The selected photo div, or null if no photos are eligible
 */
export function selectPhotoToReplace($, row) {
    var now = Date.now();
    var $row = $(row);
    var $photos = $row.find('.photo');

    if ($photos.length === 0) {
        return null;
    }

    // Build list of photos with weights based on time on screen
    // Older photos have higher weight, making them more likely to be replaced
    var eligiblePhotos = [];
    $photos.each(function() {
        var $photo = $(this);
        var displayTime = $photo.data('display_time');
        if (displayTime) {
            eligiblePhotos.push({
                $photo: $photo,
                displayTime: displayTime,
                weight: Math.max(1000, now - displayTime)  // Weight = time on screen (min 1s to avoid zero-weight edge cases)
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
}

/**
 * Make space for a new photo by removing adjacent photos.
 * Starts from target photo and expands in a random direction until enough columns are freed.
 * @param {jQuery} $ - jQuery instance
 * @param {string} row - Row selector ('#top_row' or '#bottom_row')
 * @param {jQuery} $targetPhoto - The initially selected photo to replace
 * @param {number} neededColumns - Number of columns needed for the new photo
 * @returns {Object|null} - { photosToRemove: jQuery[], insertionIndex: number, totalColumns: number } or null if unable
 */
export function makeSpaceForPhoto($, row, $targetPhoto, neededColumns) {
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
}

/**
 * Fill remaining space in a row after inserting a new photo.
 * Selects photos from the store that fit the remaining columns.
 * Prefers photos whose orientation matches the container shape.
 * @param {jQuery} $ - jQuery instance
 * @param {Function} build_div - Function to create a photo div with Pure CSS grid classes
 * @param {string} row - Row selector ('#top_row' or '#bottom_row')
 * @param {jQuery} $newPhoto - The newly inserted photo div
 * @param {number} remainingColumns - Number of columns still available
 * @param {number} totalColumnsInGrid - Total columns in the grid (4 or 5)
 * @returns {jQuery[]} - Array of newly created photo divs to animate in
 */
export function fillRemainingSpace($, build_div, row, $newPhoto, remainingColumns, totalColumnsInGrid) {
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
            photo = selectPhotoForContainer($, containerAspectRatio, forceRandom);
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
                var stackedDiv = createStackedLandscapes($, build_div, totalColumnsInGrid);
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
                photo = clonePhotoFromPage($, 'portrait');
                if (!photo) {
                    // Truly nothing available - clone any photo
                    photo = clonePhotoFromPage($);
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
}

// Browser global exports for non-module scripts (main.js)
if (typeof window !== 'undefined') {
    window.SlideshowPhotoStore = {
        getPhotoColumns: getPhotoColumns,
        getAdjacentPhoto: getAdjacentPhoto,
        selectRandomPhotoFromStore: selectRandomPhotoFromStore,
        selectPhotoToReplace: selectPhotoToReplace,
        selectPhotoForContainer: selectPhotoForContainer,
        fillRemainingSpace: fillRemainingSpace,
        clonePhotoFromPage: clonePhotoFromPage,
        createStackedLandscapes: createStackedLandscapes,
        makeSpaceForPhoto: makeSpaceForPhoto,
        calculatePanoramaColumns: calculatePanoramaColumns
    };
}
