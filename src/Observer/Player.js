/* eslint-disable no-multi-spaces, key-spacing */
import Debounce from 'lodash-es/debounce';
import EventEmitter from 'eventemitter3';
import Filter from 'lodash-es/filter';
import IsEqual from 'lodash-es/isEqual';
import IsNil from 'lodash-es/isNil';
import Map from 'lodash-es/map';

import Log from 'neon-extension-source-amazonvideo/Core/Logger';

import Observer from './Base';


export class PlayerVideoObserver extends EventEmitter {
    constructor() {
        super();

        this._listeners = {};
        this._node = null;
    }

    // region Public Methods

    start(node) {
        if(!IsNil(this._node)) {
            this.stop();
        }

        Log.trace('Observing video: %o', node);

        // Update state
        this._node = node;

        // Bind events
        this._addEventListener('loadstart',         () => this.emit('loading'));
        this._addEventListener('loadedmetadata',    () => this.emit('loaded'));

        this._addEventListener('playing',           () => this.emit('started'));
        this._addEventListener('pause',             () => this.emit('paused'));
        this._addEventListener('ended',             () => this.emit('stopped'));

        // TODO Duration should be emitted separately
        this._addEventListener('seeked',            () => this.emit('seeked', this._getTime()));
        this._addEventListener('timeupdate',        () => this.emit('progress', this._getTime()));

        // Emit "loading" event
        this.emit('loading');

        // Emit "loaded" event (if already loaded)
        if(this._node.readyState >= 2) {
            this.emit('loaded');
        }

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

    getDuration() {
        if(IsNil(this._node) || this._node.duration === 0) {
            return null;
        }

        return this._node.duration * 1000;
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

        this.container = null;
        this.controls = null;
        this.info = null;

        this.title = null;
        this.subtitle = null;

        // Create debounced observe function
        this.observeVideo = Debounce(this._observeVideo.bind(this), 2500);

        // Private attributes
        this._currentTitle = null;
        this._currentSubtitles = null;
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
        this.video = this.observe(this.container, '.rendererContainer video')
            .on('added', this.onVideoAdded.bind(this))
            .on('removed', this.onVideoRemoved.bind(this));

        // Observe title
        this.title = this.observe(this.info, '.title', { text: true })
            .on('mutation', this.onTitleChanged.bind(this));

        // Observe subtitle
        this.subtitle = this.observe(this.info, '.subtitle', { text: true })
            .on('mutation', this.onSubtitleChanged.bind(this));
    }

    getDuration() {
        if(IsNil(this._videoObserver)) {
            return null;
        }

        return this._videoObserver.getDuration();
    }

    // region Event Handlers

    onPlayerClassChanged({ node }) {
        if(node.classList.contains('dv-player-fullscreen')) {
            this.emit('opened');
        } else {
            this.emit('closed');
        }
    }

    onVideoAdded({ node }) {
        Log.trace('Video added: %o', node);

        // Update state
        this._currentVideo = node;

        // Observe video
        this.observeVideo();
    }

    onVideoRemoved({ node }) {
        Log.trace('Video removed: %o', node);

        // Reset state
        this._currentVideo = null;

        // Stop observing video
        this._videoObserver.stop();
    }

    onTitleChanged() {
        let current = this.title.first().innerText || null;

        // Ensure title has changed
        if(this._currentTitle === current) {
            return;
        }

        // Retrieve previous title
        let previous = this._currentTitle;

        // Update current title
        this._currentTitle = current;

        // Emit event
        this.emit('title', { previous, current });

        // Log title change
        Log.trace('Title changed to %o', current);

        // Observe video
        this.observeVideo();
    }

    onSubtitleChanged() {
        let current = Filter(Map(this.subtitle.all(), (node) => node.innerText || null, IsNil));

        if(current.length === 0) {
            current = null;
        }

        // Ensure subtitle(s) have changed
        if(IsEqual(this._currentSubtitles, current)) {
            return;
        }

        // Retrieve previous subtitle(s)
        let previous = this._currentSubtitles;

        // Update current subtitle(s)
        this._currentSubtitles = current;

        // Emit event
        this.emit('subtitle', { previous, current });

        // Log subtitle change
        Log.trace('Subtitle changed to %o', current);

        // Observe video
        this.observeVideo();
    }

    // endregion

    _observeVideo() {
        if(IsNil(this._currentTitle)) {
            return;
        }

        if(IsNil(this._currentVideo)) {
            Log.error('Unable to observe video, no node available');
            return;
        }

        // Start observing video
        this._videoObserver.start(this._currentVideo);
    }
}

export default new PlayerObserver();
