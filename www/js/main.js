(function() {
    "use strict";

    var window_ratio = $(window).width() / $(window).height();
    window_ratio = (window_ratio > 1.4) ? 'wide' : 'normal';

    var photos = [];
    var time_to_shuffle = 1 * 60 * 1000;
    var refresh_album_time   = 15 * 60 * 1000;

    var build_row = function(row, photos) {
        // A row can have a number of different configurations:
        // if wide then a minumum of 3, and a maximum of 10
        // if normal then a minimum of 2 and a maximum of 8
        var columns = (window_ratio === 'wide') ? _.random(3,5) : _.random(2,4);
        return row;
    };

    var shuffle_row = function(row, photos) {
        // pick one of the columns.
        // decide if I'm going to just fill that same column or try a different configuration
        // animate out of view the old column(s) letting the columns collapse any space
        // animate the new column(s) into view by adding to either the right or left of the row
    };

    var shuffle_show = function(end_time, top_row, bottom_row, photos) {
        console.log('about to shuffle the show');
        if (_.now() > end_time) {
            // quittin' time.
            stage_photos();
        } else {
            // pick a new photo to show
            shuffle_row(_.random(1, [top_row, bottom_row]), photos);
            _.delay(shuffle_show, time_to_shuffle, end_time, top_row, bottom_row, photos);
        }
    };

    var slide_show = function(staging_photos) {
        var top_row = [];
        $('#top_row').empty();
        var bottom_row = [];
        $('#bottom_row').empty();
        // Not sure if I should iterate through old photos and explicitly remove from DOM?
        photos = staging_photos.slice(0);
        // prepare stage
        // Build up initial show
        build_row(top_row, photos);
        build_row(bottom_row, photos);

        var start_time = _.now();
        var end_time = start_time + (refresh_album_time);

        _.delay(shuffle_show, time_to_shuffle, end_time, top_row, bottom_row, photos);
    };

    var finish_staging = function(staging_photos, count) {
        if (staging_photos.length < count) {
            return false;
        } else {
            slide_show(staging_photos);
            console.log(staging_photos);
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
                    var el = $(this);
                    staging_photos.push({
                        el: el,
                        height: height,
                        width: width,
                        orientation: height > width ? 'portrait' : 'landscape',
                        panorama: width / height > 1.5 ? true : false,
                    });
                    finish_staging(staging_photos, data.count);
                });
                el.src = value;
            });
        });
    };

    stage_photos();
})();
