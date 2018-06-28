/* eslint-disable no-multi-spaces, key-spacing */
import EventEmitter from 'eventemitter3';
import IsNil from 'lodash-es/isNil';

import {Movie, Show, Season, Episode} from 'neon-extension-framework/Models/Metadata/Video';

import Log from '../Core/Logger';
import Plugin from '../Core/Plugin';
import PlayerObserver from '../Observer/Player';


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

    onLoaded() {
        Log.trace('PlayerMonitor.onLoaded');

        // Update item
        if(!this._updateItem()) {
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

        this._currentMedia = current;
    }

    // endregion

    // region Private Methods

    _updateItem() {
        let item = null;

        // Try construct track
        try {
            item = this._createItem();
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

    _createItem() {
        if(IsNil(this._currentMedia)) {
            return null;
        }

        // Retrieve ASIN
        let asin = this._getPageAsin();

        if(IsNil(asin)) {
            return null;
        }

        // Create metadata
        let media = this._currentMedia;

        // - Movie
        if(media.type === 'movie') {
            return this._createMovie(asin, media);
        }

        // - Episode
        if(media.type === 'episode') {
            return this._createEpisode(asin, media);
        }

        // Unknown media type
        throw new Error(`Unknown media type: ${media.type}`);
    }

    _createMovie(asin, { title }) {
        return Movie.create(Plugin.id, {
            keys: {
                asin
            },

            // Metadata
            title
        });
    }

    _createEpisode(asin, { number, title, season}) {
        return Episode.create(Plugin.id, {
            // Metadata
            number,
            title,

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

    _getPageAsin() {
        let url = window.location.href;

        for(let i = 0; i < URL_PATTERNS.length; ++i) {
            let pattern = URL_PATTERNS[i];
            let match = pattern.exec(url);

            if(match === null) {
                Log.trace('%o didn\'t match pattern %o', url, pattern);
                continue;
            }

            if(match !== null) {
                Log.trace('%o matched pattern %o: %o', url, pattern, match[1]);
                return match[1];
            }
        }

        Log.warn('%o didn\'t match any url patterns', url);
        return null;
    }

    // endregion
}
