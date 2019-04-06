/* eslint-disable no-multi-spaces, key-spacing */
import EventEmitter from 'eventemitter3';
import IsNil from 'lodash-es/isNil';

import {Movie, Show, Season, Episode} from '@radon-extension/framework/Models/Metadata/Video';

import Log from '../Core/Logger';
import Plugin from '../Core/Plugin';
import PlayerObserver from '../Observer/Player';
import ShimApi from '../Api/Shim';


const URL_PATTERNS = [
    /^https:\/\/www\.amazon\.com\/dp\/([a-z0-9]*).*?$/i,
    /^https:\/\/www\.amazon\.com\/.*?\/dp\/([a-z0-9]*).*?$/i,
    /^https:\/\/www\.amazon\.com\/gp\/product\/([a-z0-9]*).*?$/i,
    /^https:\/\/www\.amazon\.com\/gp\/video\/detail\/([a-z0-9]*).*?$/i
];

export default class PlayerMonitor extends EventEmitter {
    constructor() {
        super();

        // Private attributes
        this._currentPageTitleId = null;
        this._currentItem = null;
        this._currentMedia = null;

        // Bind to player events
        PlayerObserver.on('media.changed',  this.onMediaChanged.bind(this));

        PlayerObserver.on('opened',         this.onOpened.bind(this));
        PlayerObserver.on('closed',         this.onClosed.bind(this));
        PlayerObserver.on('loaded',         this.onLoaded.bind(this));
        PlayerObserver.on('started',        this.onStarted.bind(this));

        PlayerObserver.on('paused',         this.emit.bind(this, 'paused'));
        PlayerObserver.on('stopped',        this.emit.bind(this, 'stopped'));

        PlayerObserver.on('progress',       this.emit.bind(this, 'progress'));
        PlayerObserver.on('seeked',         this.emit.bind(this, 'seeked'));

        // Bind to shim events
        ShimApi.events.on('video.play', this.onVideoPlay.bind(this));
    }

    start() {
        // Start observing player
        PlayerObserver.start();
    }

    reset() {
        Log.trace('PlayerMonitor.reset');

        // Reset state
        this._currentItem = null;
        this._currentMedia = null;
    }

    // region Event Handlers

    onOpened() {
        Log.trace('PlayerMonitor.onOpened');

        // Ensure item exists
        if(IsNil(this._currentItem)) {
            return;
        }

        // Emit "opened" event
        this.emit('opened', this._currentItem);
    }

    onLoaded(duration) {
        Log.trace('PlayerMonitor.onLoaded');

        // Update item
        if(!this._updateItem(duration)) {
            return;
        }

        // Emit "loaded" event
        this.emit('loaded', this._currentItem);
    }

    onStarted() {
        Log.trace('PlayerMonitor.onStarted');

        // Ensure item exists
        if(IsNil(this._currentItem)) {
            return;
        }

        // Emit "started" event
        this.emit('started');
    }

    onClosed() {
        Log.trace('PlayerMonitor.onClosed');

        if(IsNil(this._currentItem)) {
            return;
        }

        // Emit "closed" event
        this.emit('closed', this._currentItem);
    }

    onMediaChanged({ previous, current }) {
        Log.trace('PlayerMonitor.onMediaChanged: %o -> %o', previous, current);

        // Update state
        this._currentMedia = current;
    }

    onVideoPlay(attributes) {
        Log.trace('PlayerMonitor.onVideoPlay: %o', attributes);

        // Ensure identifier exists
        if(IsNil(attributes.pageTitleId)) {
            Log.debug('No "pageTitleId" found in play attributes: %o', attributes);
            return;
        }

        // Update state
        this._currentPageTitleId = attributes.pageTitleId;
    }

    // endregion

    // region Private Methods

    _updateItem(duration) {
        let item = null;

        // Try construct track
        try {
            item = this._createItem(duration);
        } catch(e) {
            Log.error('Unable to create track: %s', e.message || e);
        }

        // Ensure track exists
        if(IsNil(item)) {
            Log.warn('Unable to parse item', this._currentMedia);

            // Clear current item
            this._currentItem = null;
            return false;
        }

        // Update current item
        this._currentItem = item;
        return true;
    }

    _createItem(duration) {
        if(IsNil(this._currentMedia)) {
            return null;
        }

        // Retrieve ASIN
        let asin = this._getPageTitleId();

        if(IsNil(asin)) {
            return null;
        }

        // Create metadata
        let media = this._currentMedia;

        // - Movie
        if(media.type === 'movie') {
            return this._createMovie(asin, media, duration);
        }

        // - Episode
        if(media.type === 'episode') {
            return this._createEpisode(asin, media, duration);
        }

        // Unknown media type
        throw new Error(`Unknown media type: ${media.type}`);
    }

    _createMovie(asin, { title }, duration) {
        return Movie.create(Plugin.id, {
            keys: {
                asin
            },

            // Metadata
            title,
            duration
        });
    }

    _createEpisode(asin, { number, title, season }, duration) {
        return Episode.create(Plugin.id, {
            // Metadata
            number,
            title,
            duration,

            // Children
            season: this._createSeason(asin, season)
        });
    }

    _createSeason(asin, { number, show }) {
        return Season.create(Plugin.id, {
            keys: {
                asin
            },

            // Metadata
            number,

            // Children
            show: this._createShow(show)
        });
    }

    _createShow({ title }) {
        return Show.create(Plugin.id, {
            title
        });
    }

    _getPageTitleId() {
        let url = window.location.href;

        // Find match in the current url
        for(let i = 0; i < URL_PATTERNS.length; ++i) {
            let pattern = URL_PATTERNS[i];
            let match = pattern.exec(url);

            if(match === null) {
                continue;
            }

            if(match !== null) {
                Log.trace('Found title identifier: %o (url: %o)', match[1], url);
                return match[1];
            }
        }

        Log.info('%o didn\'t match any patterns', url);

        // Fallback to clicked title identifier
        if(!IsNil(this._currentPageTitleId)) {
            Log.trace('Found title identifier: %o', this._currentPageTitleId);
            return this._currentPageTitleId;
        }

        // No title identifier found
        Log.warn('Unable to find title identifier');
        return null;
    }

    // endregion
}
