/* eslint-disable no-multi-spaces, key-spacing */
import Debounce from 'lodash-es/debounce';
import EventEmitter from 'eventemitter3';
import Filter from 'lodash-es/filter';
import IsEqual from 'lodash-es/isEqual';
import IsNil from 'lodash-es/isNil';
import IsString from 'lodash-es/isString';
import Map from 'lodash-es/map';

import Log from '../Core/Logger';
import Observer from './Base';


export class PlayerVideoObserver extends EventEmitter {
    constructor() {
        super();

        this._listeners = {};

        this._loaded = false;
        this._node = null;
    }

    // region Public Methods

    start(node) {
        if(IsNil(node)) {
            throw new Error(`Invalid video: ${node}`);
        }

        // Ensure we aren't already observing this video
        if(this._node === node) {
            Log.trace('Already observing video: %o', node);
            return true;
        }

        // Stop existing video observations
        if(!IsNil(this._node)) {
            this.stop();
        }

        Log.trace('Observing video: %o', node);

        // Update state
        this._loaded = false;
        this._node = node;

        // Bind events
        this._addEventListener('loadstart',         () => this.emit('loading'));
        this._addEventListener('loadedmetadata',    () => this.load());

        this._addEventListener('playing',           () => this.emit('started'));
        this._addEventListener('pause',             () => this.emit('paused'));
        this._addEventListener('ended',             () => this.emit('stopped'));

        this._addEventListener('seeked',            () => this.emit('seeked', this._getTime()));

        this._addEventListener('timeupdate',        () => {
            if(this.load()) {
                return;
            }

            // Emit "progress" event
            this.emit('progress', this._getTime());
        });

        // Emit "loading" event
        this.emit('loading');

        // Emit "loaded" event (if already loaded)
        if(this._node.readyState >= 2) {
            this.load();
        }

        return true;
    }

    load() {
        if(this._loaded) {
            return false;
        }

        // Update state
        this._loaded = true;

        // Emit "loaded" event
        this.emit('loaded');
        return true;
    }

    stop() {
        if(IsNil(this._node)) {
            return false;
        }

        Log.trace('Stopped observing video');

        // Unbind events
        this._removeEventListeners();

        // Update state
        this._node = null;

        return true;
    }

    // endregion

    // region Private Methods

    _getTime() {
        if(IsNil(this._node) || this._node.currentTime === 0) {
            return null;
        }

        return this._node.currentTime * 1000;
    }

    _addEventListener(type, listener) {
        if(IsNil(this._node)) {
            return false;
        }

        Log.trace('Listening for video %o events', type);

        // Add event listener
        this._node.addEventListener(type, listener);

        // Store listener reference (for later cleanup)
        if(IsNil(this._listeners[type])) {
            this._listeners[type] = [];
        }

        this._listeners[type].push(listener);

        return true;
    }

    _removeEventListeners() {
        if(IsNil(this._node)) {
            return false;
        }

        for(let type in this._listeners) {
            if(!this._listeners.hasOwnProperty(type)) {
                continue;
            }

            let listeners = this._listeners[type];

            for(let i = 0; i < listeners.length; ++i) {
                let listener = listeners[i];

                Log.trace('Stopped listening for video %o events', type);

                // Remove event listener
                this._node.removeEventListener(type, listener);
            }

            // Create new array
            this._listeners[type] = [];
        }

        return true;
    }

    // endregion
}

export class PlayerObserver extends Observer {
    constructor() {
        super();

        // Create debounced `onMediaChanged` function
        this.onMediaChanged = Debounce(this._onMediaChanged, 5000);

        // Elements
        this.container = null;
        this.controls = null;
        this.info = null;

        // Text Elements
        this.title = null;
        this.subtitle = null;

        // Private attributes
        this._currentMedia = null;
        this._currentVideo = null;

        // Create video observer
        this._videoObserver = new PlayerVideoObserver();

        this._videoObserver.on('loading',   this.emit.bind(this, 'loading'));
        this._videoObserver.on('loaded',    this.emit.bind(this, 'loaded'));

        this._videoObserver.on('started',   this.emit.bind(this, 'started'));
        this._videoObserver.on('paused',    this.emit.bind(this, 'paused'));
        this._videoObserver.on('stopped',   this.emit.bind(this, 'stopped'));

        this._videoObserver.on('progress',  this.emit.bind(this, 'progress'));
        this._videoObserver.on('seeked',    this.emit.bind(this, 'seeked'));
    }

    create() {
        // Observe body
        this.body = this.observe(document, 'body');

        // Observe player
        this.player = this.observe(this.body, '#dv-web-player', { attributes: ['class'] })
            .onAttributeChanged('class', this.onPlayerClassChanged.bind(this));

        this.container = this.observe(this.player, '.webPlayerContainer .webPlayerElement .cascadesContainer');

        // Observe controls
        this.controls = this.observe(this.container, '.controlsOverlay');
        this.info = this.observe(this.controls, '.contentTitlePanel');

        // Observe video
        this.video = this.observe(this.container, '.rendererContainer video', { attributes: ['src'] })
            .on('mutation', this.onVideoMutation.bind(this));

        // Observe title
        this.title = this.observe(this.info, '.title', { text: true })
            .on('mutation', this.onMediaChanged.bind(this));

        // Observe subtitle
        this.subtitle = this.observe(this.info, '.subtitle', { text: true })
            .on('mutation', this.onMediaChanged.bind(this));
    }

    observeVideo() {
        if(IsNil(this._currentVideo)) {
            Log.debug('Deferring video observations, no video available');
            return;
        }

        // Start observing video
        this._videoObserver.start(this._currentVideo);
    }

    // region Event Handlers

    onPlayerClassChanged({ node }) {
        if(node.classList.contains('dv-player-fullscreen')) {
            this.emit('opened');
        } else {
            this.emit('closed');
        }
    }

    onVideoMutation({ event, node }) {
        if(node.src.indexOf('blob:') < 0) {
            Log.trace('Ignoring video: %o', node);
            return;
        }

        // Process event
        if(event !== 'remove') {
            this.onVideoFound(node);
        } else {
            this.onVideoRemoved(node);
        }
    }

    onVideoFound(node) {
        Log.debug('Video found: %o', node);

        // Stop existing session
        if(!IsNil(this._currentVideo) && this._currentVideo !== node) {
            Log.trace('Video already being observed, emitting remove event');

            // Stop observing existing video
            this.onVideoRemoved({ node: this._currentVideo });
        }

        // Update state
        this._currentVideo = node;

        // Emit changed event
        this.onMediaChanged();
    }

    onVideoRemoved(node) {
        Log.debug('Video removed: %o', node);

        // Ensure video is being observed
        if(IsNil(this._currentVideo)) {
            Log.trace('Ignoring video removed event (no active video)');
            return;
        }

        // Reset state
        this._currentVideo = null;

        // Stop video observations
        this._videoObserver.stop();
    }

    _onMediaChanged() {
        let current = this._createMedia(
            this.title.first(),
            this.subtitle.all()
        );

        // Ensure media has changed
        if(IsEqual(this._currentMedia, current)) {
            return;
        }

        // Store current media
        let previous = this._currentMedia;

        // Update current media
        this._currentMedia = current;

        // Emit "media.changed" event
        this.emit('media.changed', { previous, current });

        // Log media change
        Log.trace('Media changed to %o', current);

        // Start observing video
        if(!IsNil(current)) {
            this.observeVideo();
        }
    }

    // endregion

    // region Private Methods

    _createMedia($title, $subtitles) {
        let title = ($title && $title.innerText) || null;

        // Ensure title exists
        if(IsNil(title) || !IsString(title) || title.length <= 0) {
            return null;
        }

        // Parse subtitles
        let subtitles = Filter(Map($subtitles, (node) =>
            node.innerText || null
        ), (value) =>
            !IsNil(value)
        );

        // Create movie (no identifier exists)
        if(subtitles.length < 1) {
            return this._createMovie(title);
        }

        // Create episode
        return this._createEpisode(title, ...subtitles);
    }

    _createMovie(title) {
        return {
            type: 'movie',

            title
        };
    }

    _createEpisode(show, identifier) {
        let { season, number, title } = this._parseEpisodeIdentifier(identifier);

        if(IsNil(season) || IsNil(number) || IsNil(title)) {
            return null;
        }

        return {
            type: 'episode',

            number,
            title,

            // Children
            season: this._createSeason(show, season)
        };
    }

    _createSeason(show, number) {
        return {
            type: 'season',

            number,

            // Children
            show: this._createShow(show)
        };
    }

    _createShow(title) {
        return {
            type: 'show',

            title
        };
    }

    _parseEpisodeIdentifier(identifier) {
        let match = /^Season (\d+), Ep\. (\d+) (.+)$/g.exec(identifier);

        if(IsNil(match)) {
            return {
                season: null,
                number: null,

                title: null
            };
        }

        // Try parse numbers
        try {
            return {
                season: parseInt(match[1], 10),
                number: parseInt(match[2], 10),

                title: match[3]
            };
        } catch(e) {
            Log.warn('Unable to parse identifier: %o', identifier);

            return {
                season: null,
                number: null,

                title: null
            };
        }
    }

    // endregion
}

export default new PlayerObserver();
