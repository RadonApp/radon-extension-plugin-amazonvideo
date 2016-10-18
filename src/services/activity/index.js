import Extension from 'eon.extension.browser/extension';

import {isDefined} from 'eon.extension.framework/core/helpers';
import Registry from 'eon.extension.framework/core/registry';
import MessagingBus from 'eon.extension.framework/messaging/bus';
import Session, {SessionState} from 'eon.extension.framework/models/activity/session';
import ActivityService from 'eon.extension.framework/services/source/activity';

import MetadataApi from '../../api/metadata';
import Parser from './core/parser';
import PlayerMonitor from './monitor/player';
import Plugin from '../../core/plugin';
import ShimApi from '../../api/shim';

var PROGRESS_EVENT_INTERVAL = 5000;  // (in milliseconds)


export class AmazonVideoActivityService extends ActivityService {
    constructor() {
        super(Plugin);

        this.bus = null;
        this.monitor = null;

        this._nextSessionKey = 0;
        this._lastProgressEmittedAt = null;
        this._pauseTimeout = null;

        this._session = null;
        this._video = null;

    }

    initialize() {
        super.initialize();

        // Construct messaging bus
        this.bus = new MessagingBus(Plugin.id + ':activity');
        this.bus.connect('eon.extension.core:scrobble');

        // Bind to document
        this.bind();
    }

    bind() {
        if(document.body === null) {
            console.warn('Document body not loaded yet, will try again in 500ms');
            setTimeout(() => this.bind(), 500);
            return;
        }

        if(document.querySelector('#dv-web-player') === null) {
            console.warn('Player not loaded yet, will try again in 500ms');
            setTimeout(() => this.bind(), 500);
            return;
        }

        // Initialize player monitor
        this.monitor = new PlayerMonitor();
        this.monitor.initialize();

        // Bind to player monitor events
        this.monitor.on('opened', this._onPlayerOpened.bind(this));
        this.monitor.on('closed', this._onPlayerClosed.bind(this));

        this.monitor.on('created', this._onCreated.bind(this));
        this.monitor.on('playing', this._onPlaying.bind(this));
        this.monitor.on('progress', this._onProgress.bind(this));
        this.monitor.on('paused', this._onPaused.bind(this));
        this.monitor.on('ended', this._onEnded.bind(this));

        // Inject netflix shim
        this.inject()
            .then(() => this.monitor.bind(document))
            .catch((error) => {
                console.error('Unable to bind activity service to player', error);
            });
    }

    inject() {
        return new Promise((resolve, reject) => {
            // Inject scripts
            let script = this._createScript(document, '/source/amazonvideo/shim/shim.js');

            // Bind shim api to page
            ShimApi.bind(document);

            // Wait for "ready" event
            ShimApi.once('ready', () => {
                resolve();
            });

            // TODO implement timeout?

            // Insert script into page
            (document.head || document.documentElement).appendChild(script);
        });
    }

    // region Event handlers

    _onPlayerOpened(key, identifier) {
        console.log('Played opened (key: %o, identifier: %o)', key, identifier);
    }

    _onPlayerClosed(key, identifier) {
        console.log('Played closed (key: %o, identifier: %o)', key, identifier);

        if(!isDefined(this._session) || !isDefined(this._session.item)) {
            console.debug('No active session');
            return;
        }

        if(this._session.item.id !== key) {
            console.debug('Session item identifier doesn\'t match');
            return;
        }

        if(this._session.state === SessionState.ended) {
            console.debug('Session has already been ended');
            return;
        }

        // Emit "ended" event
        this._end();
    }

    _onCreated(key, identifier) {
        console.log('Created (key: %o, identifier: %o)', key, identifier);

        // Check if current session matches
        if(isDefined(this._session) && isDefined(this._session.item) && this._session.item.id === key) {
            // Session matches, trigger a "playing" event instead
            this._onPlaying();
            return;
        }

        // Create new session
        this._createSession(key, identifier).then((session) => {
            // Emit "created" event
            this.bus.emit('activity.created', session.dump());
        }, (error) => {
            // Unable to create session
            console.warn('Unable to create session:', error);
        });
    }

    _onPlaying() {
        if(!this._isPlayerVisible()) {
            console.debug('Player is not visible, ignoring "playing" event');
            return;
        }

        console.debug('Video playing');

        if(this._session === null) {
            console.debug('No active session');
            return;
        }

        if(this._session.state === SessionState.playing) {
            console.debug('Session has already been started');
            return;
        }

        // Emit "started" event
        this._start();

        // Clear stalled state
        this._session.stalledAt = null;
        this._session.stalledPreviousState = null;
    }

    _onProgress(progress, time, duration) {
        if(!this._isPlayerVisible()) {
            console.debug('Player is not visible, ignoring "progress" event');
            return;
        }

        if(isNaN(progress) || isNaN(time) || isNaN(duration)) {
            return;
        }

        if(this._session === null) {
            console.debug('No active session');
            return;
        }

        console.debug('Video progress (progress: %o, time: %o, duration: %o)', progress, time, duration);

        // Update activity state
        let state = this._session.state;

        if(this._session.time !== null) {
            if(time > this._session.time) {
                // Progress changed
                state = SessionState.playing;

                // Clear stalled state
                this._session.stalledAt = null;
                this._session.stalledPreviousState = null;
            } else if(time <= this._session.time) {
                // Progress hasn't changed
                if(this._session.state === SessionState.stalled && Date.now() - this._session.stalledAt > 5000) {
                    // Stalled for over 5 seconds, assume paused
                    state = SessionState.paused;
                } else {
                    // Store current state
                    this._session.stalledPreviousState = this._session.state;

                    // Switch to stalled state
                    state = SessionState.stalled;

                    // Update `stalledAt` timestamp
                    this._session.stalledAt = Date.now();
                }
            }
        }

        // Add new sample
        this._session.samples.push(time);

        // Emit event
        if(this._session.state !== state) {
            // Process state change
            this._onStateChanged(this._session.state, state);
        } else if(this._session.state === SessionState.playing && this._session.time !== null) {
            // Emit progress
            this._progress();
        }
    }

    _onStateChanged(previous, current) {
        if(this._session === null) {
            console.debug('No active session');
            return;
        }

        console.debug('Video state changed: %o -> %o', previous, current);

        // Started
        if((previous === SessionState.null || previous === SessionState.paused) && current === SessionState.playing) {
            // Emit "started" event
            this._start();
            return;
        }

        // Paused
        if(previous === SessionState.playing && current === SessionState.paused) {
            // Emit "paused" event
            this._pause();
            return;
        }

        console.warn('Unknown state transition: %o -> %o', previous, current);

        // Update state
        this._session.state = current;
    }

    _shouldEmitProgress() {
        return (
            this._lastProgressEmittedAt === null ||
            Date.now() - this._lastProgressEmittedAt > PROGRESS_EVENT_INTERVAL
        );
    }

    _onPaused() {
        if(!this._isPlayerVisible()) {
            console.debug('Player is not visible, ignoring "paused" event');
            return;
        }

        console.debug('Video paused');

        if(this._session === null) {
            console.debug('No active session');
            return;
        }

        if(this._session.state === SessionState.paused) {
            console.debug('Session has already been paused');
            return;
        }

        // Emit "paused" event
        this._pause();
    }

    _onEnded() {
        if(!this._isPlayerVisible()) {
            console.debug('Player is not visible, ignoring "ended" event');
            return;
        }

        console.debug('Video ended');

        if(this._session === null) {
            console.debug('No active session');
            return;
        }

        if(this._session.state === SessionState.ended) {
            console.debug('Session has already ended');
            return;
        }

        // Emit "ended" event
        this._end();
    }

    // endregion

    // region Private methods

    _createSession(key, identifier) {
        // Construct promise
        return new Promise((resolve, reject) => {
            console.debug('Creating session for video (key: %o, identifier: %o)', key, identifier);

            // Emit "ended" event (if there is an existing session)
            if(this._session !== null && this._session.state !== SessionState.ended) {
                // Emit "ended" event
                this._end();
            }

            // Reset state
            this._video = null;
            this._session = null;

            // Retrieve video metadata
            MetadataApi.get(key).then((metadata) => {
                // Construct metadata object
                this._video = Parser.parse(key, metadata);

                if(this._video === null) {
                    console.warn('Unable to parse metadata:', metadata);

                    // Reject promise
                    reject(new Error('Unable to parse metadata'));
                    return;
                }

                // Construct session
                this._session = new Session(
                    this.plugin,
                    this._nextSessionKey++,
                    this._video,
                    SessionState.LOADING
                );

                // Resolve promise
                resolve(this._session);
            });
        });
    }

    _createScript(document, path) {
        let url = Extension.getUrl(path);

        // Create script element
        let script = document.createElement('script');

        script.src = url;
        script.onload = function() {
            this.remove();
        };

        return script;
    }

    _isPlayerVisible() {
        let playerContent = document.querySelector('#dv-player-content');

        if(!isDefined(playerContent)) {
            return false;
        }

        return playerContent.style.opacity === '1';
    }

    _start() {
        if(this._session === null) {
            return;
        }

        if(this._session.state === SessionState.stalled) {
            // Update session with previous state
            if(this._session.stalledPreviousState !== null) {
                this._session.state = this._session.stalledPreviousState;
            } else {
                this._session.state = SessionState.null;
            }
        }

        if(this._session.state === SessionState.playing) {
            return;
        }

        // Clear pause timeout
        if(this._pauseTimeout !== null) {
            clearTimeout(this._pauseTimeout);
            this._pauseTimeout = null;
        }

        // Update state
        this._session.state = SessionState.playing;

        // Emit event
        this.bus.emit('activity.started', this._session.dump());
    }

    _progress() {
        if(this._session === null) {
            return;
        }

        if(this._session.state === SessionState.ended) {
            return;
        }

        if(!this._shouldEmitProgress()) {
            return;
        }

        // Clear pause timeout
        if(this._pauseTimeout !== null) {
            clearTimeout(this._pauseTimeout);
            this._pauseTimeout = null;
        }

        // Check if video has ended
        if(this._session.state === SessionState.playing && this._session.progress >= 100) {
            console.log('Video has reached 100% progress, marking the session as ended');
            this._end();
            return;
        }

        // Update state
        this._session.state = SessionState.playing;

        // Emit event
        this.bus.emit('activity.progress', this._session.dump());

        // Update timestamp
        this._lastProgressEmittedAt = Date.now();
    }

    _pause() {
        if(this._session.state === SessionState.pausing || this._session.state === SessionState.paused) {
            return;
        }

        // Update state
        this._session.state = SessionState.pausing;

        // Send pause event in 5 seconds
        this._pauseTimeout = setTimeout(() => {
            if(this._session === null || this._session.state !== SessionState.pausing) {
                return;
            }

            // Update state
            this._session.state = SessionState.paused;

            // Emit event
            this.bus.emit('activity.paused', this._session.dump());
        }, 8000);
    }

    _end() {
        // Retrieve latest state
        let state = this._session.state;

        if(state === SessionState.stalled) {
            state = this._session.stalledPreviousState;
        }

        // Ensure session was actually started
        if(state === SessionState.ended || state === SessionState.null || state === SessionState.loading) {
            return;
        }

        // Update state
        this._session.state = SessionState.ended;

        // Emit event
        this.bus.emit('activity.ended', this._session.dump());
    }

    // endregion
}

// Register service
Registry.registerService(new AmazonVideoActivityService());
