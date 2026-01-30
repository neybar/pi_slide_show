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

    var time_to_shuffle    = 1 * 60 * 1000;
    var refresh_album_time = 15 * 60 * 1000;

    // Individual photo swap configuration constants
    var SWAP_INTERVAL = 30 * 1000;         // Swap one photo every 30 seconds
    var MIN_DISPLAY_TIME = 60 * 1000;      // Minimum time before photo is eligible for swap
    var nextRowToSwap = 'top';             // Alternating row tracker (top/bottom)

    // Panorama configuration constants
    var PANORAMA_ASPECT_THRESHOLD = 2.0;      // Aspect ratio above which image is considered panorama
    var PANORAMA_USE_PROBABILITY = 0.5;       // Chance to use panorama when available
    var PANORAMA_STEAL_PROBABILITY = 0.5;     // Chance to steal panorama from other row
    var PANORAMA_POSITION_LEFT_PROBABILITY = 0.5;  // Chance to place panorama on left vs right
    var PAN_SPEED_PX_PER_SEC = 10;            // Animation pan speed in pixels per second

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
            var columnsToFill = panoramaContainer ? (columns - panoramaColumns) : columns;
            while (used_columns < columns && (panoramaOnLeft || used_columns < columnsToFill)) {
                var photo;
                var width;
                var div;
                var remainingColumns = panoramaOnLeft ? (columns - used_columns) : (columnsToFill - used_columns);
                var img_div = photo_store.find('#landscape div.img_box, #portrait div.img_box');
                if (remainingColumns >= 2) {
                    photo = img_div.random().detach();
                    width = (photo.data('orientation') === 'landscape') ? 2 : 1;
                    div = build_div(photo, width, columns);
                } else {
                    width = 1;
                    photo = img_div.random().detach();
                    div = build_div(photo, width, columns);
                    if (photo.data('orientation') === 'landscape') {
                        photo = photo_store.find('#landscape div.img_box').random().detach();
                        div.append(photo);
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

    var shuffle_row = function(row, photos) {
        // pick one of the columns.
        // decide if I'm going to just fill that same column or try a different configuration
        // animate out of view the old column(s) letting the columns collapse any space
        // animate the new column(s) into view by adding to either the right or left of the row
    };

    var shuffle_show = function(end_time) {
        var photo_store = $('#photo_store');
        if (_.now() > end_time) {
            // quittin' time.
            // stage_photos();
            location.reload();
        } else {
            // pick a new photo to show
            build_row(_.sample(['#top_row', '#bottom_row'], 1)[0]);
            _.delay(shuffle_show, time_to_shuffle, end_time);
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

        _.delay(shuffle_show, time_to_shuffle, end_time);
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
