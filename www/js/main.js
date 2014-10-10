(function() {
    "use strict";

    var photos = [];
    var staging_photos = [];
    var photos_staged = false;

    var finish_staging = function(staging_photos, count) {
        if (staging_photos.length < count) {
            return false;
        } else {
            photos_staged = true;
            console.log(staging_photos);
        }
    };

    var stage_photos = function(staging_photos) {
        staging_photos = [];
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

    stage_photos(staging_photos);
})();
