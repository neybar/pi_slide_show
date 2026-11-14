/**
 * DOM harness for unit tests that run on jsdom with the real jQuery the browser loads.
 *
 * Use from a test file that starts with `// @vitest-environment jsdom`. The harness takes jQuery
 * from www/node_modules (the same copy www/index.html loads), binds it to the jsdom window, and
 * installs the real $.fn.random from www/js/utils.mjs.
 *
 * jsdom does no layout, so $(window).width()/height() read documentElement.clientWidth/clientHeight,
 * which are 0 by default. createDom() and setViewport() give them values. offset() and element
 * widths stay 0.
 */

import { createRequire } from 'node:module';
import { initJQueryRandom } from '../../../www/js/utils.mjs';

const require = createRequire(import.meta.url);
const jQueryModule = require('../../../www/node_modules/jquery');

// jQuery 3.x exports a factory when it cannot find a window; otherwise it is already bound.
export const $ = typeof jQueryModule.fn === 'object' ? jQueryModule : jQueryModule(window);

window.$ = $;
window.jQuery = $;
initJQueryRandom();

// Same structure as the slideshow part of www/index.html
const DEFAULT_HTML = `
    <div id="content">
        <div class="shelf"><div class="pure-g" id="top_row"></div></div>
        <div class="shelf"><div class="pure-g" id="bottom_row"></div></div>
    </div>
    <div id="photo_store">
        <div id="landscape"></div>
        <div id="portrait"></div>
        <div id="panorama"></div>
    </div>`;

/**
 * Make $(window).width()/height() return fixed values (jsdom has no layout).
 */
export function setViewport(width, height) {
    Object.defineProperty(document.documentElement, 'clientWidth', { value: width, configurable: true });
    Object.defineProperty(document.documentElement, 'clientHeight', { value: height, configurable: true });
}

/**
 * Replace the page body with the photo-store skeleton (or custom html) and reset the viewport
 * to 1920x1080.
 * @param {string} [html] - Body markup; defaults to #top_row, #bottom_row and #photo_store buckets.
 * @returns {jQuery} - $ (for convenience)
 */
export function createDom(html = DEFAULT_HTML) {
    document.body.innerHTML = html;
    setViewport(1920, 1080);
    return $;
}

/**
 * Create a detached div.img_box with the jQuery data keys createImgBox() sets in main.js.
 * @param {Object} [opts]
 * @param {string} [opts.id] - Element id, handy for assertions
 * @param {string} [opts.orientation] - 'landscape' (default), 'portrait' or 'panorama'
 * @param {number} [opts.width]
 * @param {number} [opts.height]
 * @param {number} [opts.aspect_ratio] - Defaults to width / height
 * @param {boolean} [opts.panorama] - Defaults to orientation === 'panorama'
 * @returns {jQuery}
 */
export function makeImgBox({ id, orientation = 'landscape', width, height, aspect_ratio, panorama } = {}) {
    if (width === undefined || height === undefined) {
        if (orientation === 'portrait') {
            width = 1080;
            height = 1620;
        } else if (orientation === 'panorama') {
            width = 3000;
            height = 1000;
        } else {
            width = 1620;
            height = 1080;
        }
    }
    const $box = $("<div class='img_box'></div>");
    if (id) {
        $box.attr('id', id);
    }
    const $img = $('<img>').addClass('pure-img ' + orientation).attr('alt', id || 'Photo');
    $box.data('height', height);
    $box.data('width', width);
    $box.data('aspect_ratio', aspect_ratio !== undefined ? aspect_ratio : width / height);
    $box.data('orientation', orientation);
    $box.data('panorama', panorama !== undefined ? panorama : orientation === 'panorama');
    $box.data('quality-level', 'M');
    $box.data('original-file-path', 'photos/test/' + (id || 'photo') + '.jpg');
    $box.append($img);
    return $box;
}

/**
 * Put img_boxes into the #photo_store bucket matching their orientation data
 * (#landscape, #portrait or #panorama).
 * @param {jQuery|jQuery[]} boxes
 * @returns {jQuery|jQuery[]} - boxes, as passed in
 */
export function addToStore(boxes) {
    for (const $box of [].concat(boxes)) {
        $('#' + $box.data('orientation')).append($box);
    }
    return boxes;
}

/**
 * A .photo div (the wrapper build_div() makes) around an optional element.
 * @param {jQuery} [$el] - img_box (or anything) to wrap
 * @param {Object} [opts]
 * @param {number} [opts.columns] - Sets data('columns')
 * @param {number} [opts.displayTime] - Sets data('display_time')
 * @param {string} [opts.cls] - Extra class names, e.g. 'pure-u-2-5'
 * @returns {jQuery}
 */
export function makePhotoDiv($el, { columns, displayTime, cls } = {}) {
    const $div = $('<div></div>').addClass('photo');
    if (columns !== undefined) {
        $div.data('columns', columns);
    }
    if (displayTime !== undefined) {
        $div.data('display_time', displayTime);
    }
    if (cls) {
        $div.addClass(cls);
    }
    if ($el) {
        $div.append($el);
    }
    return $div;
}

/**
 * Append .photo divs to #top_row or #bottom_row.
 * @param {string} row - '#top_row' or '#bottom_row'
 * @param {jQuery|jQuery[]} photoDivs
 */
export function addToRow(row, photoDivs) {
    for (const $div of [].concat(photoDivs)) {
        $(row).append($div);
    }
}

/**
 * build_div as main.js defines it (pure-u class plus .photo, no jQuery data), for the
 * functions that take it as a parameter. The fraction is not reduced.
 */
export function buildDiv(el, width, columns) {
    return $('<div></div>')
        .addClass('pure-u-' + width + '-' + columns)
        .addClass('photo')
        .append(el);
}
