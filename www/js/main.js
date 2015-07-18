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

            // A row can have a number of different configurations:
            // if wide then a minumum of 3, and a maximum of 10
            // if normal then a minimum of 2 and a maximum of 8
            var columns = (window_ratio === 'wide') ? 5 : 4;
            var used_columns = 0;

            while (used_columns < columns) {
                var photo;
                var width;
                var div;
                var img_div = photo_store.find('div.img_box');
                if (columns - used_columns >= 2) {
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

                used_columns += width;
                row.append(div);
            }
            row.toggle('fade', 1000);
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
        var year = m[1];
        var album = m[2];

        $('.album_name').html(year + ' ' + album);
        console.log(year, album);

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

    var stage_photos = function() {
        var photo_store = $('#photo_store');
        var landscape = $('#landscape');
        var portrait = $('#portrait');
        var panorama = $('#panorama');

        $.getJSON("/photos/slideshow.json?xtime="+_.now())
        .success( function(data) {
            $.each(data.images, function(key, value) {
                var el = new Image;
                $(el).on('load', function() {
                    var height = this.height;
                    var width  = this.width;
                    var orientation = height > width ? 'portrait' : 'landscape';
                    var is_panorama = width / height > 1.5 ? true : false;
                    var el = $(this);
                    el.addClass('pure-img '+ orientation);

                    var div = $("<div class='img_box'></div>");
                    div.data( 'height', height );
                    div.data( 'width', width );
                    div.data( 'orientation', orientation );
                    div.data( 'panorama', is_panorama );
                    div.append(el);

                    if ( orientation === 'landscape' ) {
                        landscape.append(div);
                    } else if ( orientation === 'portrait' ) {
                        portrait.append(div);
                    }

                    finish_staging(data.count);
                });
                //var src = value.file.replace(/(\w*\.\w{3,4})/, "@eaDir/$1/SYNOPHOTO_THUMB_XL.jpg");
                var s = value.file.split('/');
                s.splice(s.length - 1, 0, '@eaDir');
                s.splice(s.length, 0, 'SYNOPHOTO_THUMB_XL.jpg');
                el.src = s.join('/');
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
