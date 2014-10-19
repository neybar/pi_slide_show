(function() {
    "use strict";

    var window_ratio = $(window).width() / $(window).height();
    window_ratio = (window_ratio > 1.4) ? 'wide' : 'normal';

    var time_to_shuffle = 1 * 60 * 1000;
    var refresh_album_time   = 15 * 60 * 1000;

    var build_div = function(el, width, columns, distance) {
        var img = el.clone();
        var div = $("<div></div>");
        div.addClass("pure-u-"+width+"-"+columns);
        div.addClass('photo');
        div.append(img);

        return div;
    }

    var build_row = function(row, photos) {
        row = $(row);
        if (row.height()) {
            row.parent().css('height', row.height());
        }
        row.empty();
        row.toggle('drop', 1000, function() {
            // A row can have a number of different configurations:
            // if wide then a minumum of 3, and a maximum of 10
            // if normal then a minimum of 2 and a maximum of 8
            var columns = (window_ratio === 'wide') ? 5 : 4;
            var used_columns = 0;
            var distance = _.sample(["far_left","far_right"], 1)[0];

            while (used_columns < columns) {
                var photo;
                var width;
                var div;
                if (columns - used_columns >= 2) {
                    photo = _.sample(photos.photos, 1)[0];
                    console.log(photo);
                    width = (photo.orientation === 'landscape') ? 2 : 1;
                    div = build_div(photo.el, width, columns, distance);
                } else {
                    width = 1;
                    photo = _.sample(photos.photos, 1)[0];
                    div = build_div(photo.el, width, columns, distance);
                    if (photo.orientation === 'landscape') {
                        photo = _.sample(photos.landscape, 1)[0];
                        div.append(photo.el);
                    }
                }

                used_columns += width;
                row.append(div);
            }
            row.toggle('drop', 1000, function() {
                row.parent().css('height', '');
            });
        });
    };

    var shuffle_row = function(row, photos) {
        // pick one of the columns.
        // decide if I'm going to just fill that same column or try a different configuration
        // animate out of view the old column(s) letting the columns collapse any space
        // animate the new column(s) into view by adding to either the right or left of the row
    };

    var shuffle_show = function(end_time, photos) {
        console.log('about to shuffle the show');
        if (_.now() > end_time) {
            // quittin' time.
            stage_photos();
        } else {
            // pick a new photo to show
            build_row(_.sample(['#top_row', '#bottom_row'], 1)[0], photos);
            _.delay(shuffle_show, time_to_shuffle, end_time, photos);
        }
    };

    var slide_show = function(photos) {
        // Not sure if I should iterate through old photos and explicitly remove from DOM?
        //photos = staging_photos.slice(0);
        // prepare stage
        // Build up initial show
        build_row('#top_row', photos);
        build_row('#bottom_row', photos);

        var start_time = _.now();
        var end_time = start_time + (refresh_album_time);

        _.delay(shuffle_show, time_to_shuffle, end_time, photos);
    };

    var finish_staging = function(staging_photos, count) {
        if (staging_photos.length < count) {
            return false;
        } else {
            var data = {
                photos: staging_photos,
                landscape: _.where(staging_photos, { orientation: 'landscape' }),
                portrait: _.where(staging_photos, { orientation: 'portrait' }),
                panorama: _.where(staging_photos, { panorama: true })
            };
            slide_show(data);
            console.log(data);
        }
    };

    var stage_photos = function() {
        var staging_photos = [];
        $.getJSON("slideshow.json")
        .success( function(data) {
            $.each(data.images, function(key, value) {
                var el = new Image;
                $(el).on('load', function() {
                    var height = this.height;
                    var width  = this.width;
                    var orientation = height > width ? 'portrait' : 'landscape';
                    var el = $(this);
                    el.addClass('pure-img '+ orientation);
                    var div = $("<div class='img_box'></div>");
                    div.append(el);
                    staging_photos.push({
                        el: div,
                        height: height,
                        width: width,
                        orientation: orientation,
                        panorama: width / height > 1.5 ? true : false,
                    });
                    finish_staging(staging_photos, data.count);
                });
                el.src = value.file;
            });
        });
    };

    stage_photos();
})();
