import {hasClass, hasClassTree, isDefined, round} from 'eon.extension.framework/core/helpers';
import {
    MovieIdentifier,
    ShowIdentifier,
    SeasonIdentifier,
    EpisodeIdentifier,
    KeyType
} from 'eon.extension.framework/models/activity/identifier';

import EventEmitter from 'eventemitter3';
import merge from 'lodash-es/merge';

import Log from '../../../core/logger';

const URL_PATTERNS = [
    /^https:\/\/www\.amazon\.com\/dp\/([a-z0-9]*).*?$/i,
    /^https:\/\/www\.amazon\.com\/.*?\/dp\/([a-z0-9]*).*?$/i,
    /^https:\/\/www\.amazon\.com\/gp\/product\/([a-z0-9]*).*?$/i,
    /^https:\/\/www\.amazon\.com\/gp\/video\/detail\/([a-z0-9]*).*?$/i
];


export default class PlayerMonitor extends EventEmitter {
    constructor() {
        super();

        this._listeners = {};
        this._observer = null;
        this._playerContent = null;
        this._metadata = null;

        this._currentIdentifier = null;
        this._visible = false;
    }

    initialize() {
        Log.debug('Initializing player monitor');

        this._playerContent = null;

        // Construct mutation observer
        this._observer = new MutationObserver(
            (mutations) => this._onMutations(mutations)
        );
    }

    bind(document, options) {
        options = merge({
            interval: 500,
            timeout: 10 * 1000
        }, options || {});

        // Reset state
        this._playerContent = null;
        this._metadata = null;

        // Create bind() promise
        return new Promise((resolve, reject) => {
            let attempts = 0;

            let attemptBind = () => {
                // Try find video element
                let playerContent = document.querySelector('#dv-player-content');

                if(playerContent !== null) {
                    // Update state
                    this._playerContent = playerContent;

                    // Observe "#dv-player-content" changes
                    this._observe(playerContent, {
                        attributes: true,
                        childList: true
                    });

                    // Observer "#dv-web-player" changes
                    this._observe(playerContent.querySelector('#dv-web-player'), {
                        childList: true
                    });

                    // Resolve promise
                    resolve();
                    return;
                }

                // Check if `options.timeout` has been reached
                if(attempts * options.interval > options.timeout) {
                    reject(new Error('Unable to find video element'));
                    return;
                }

                // Increment attempts count
                attempts++;

                // Attempt another bind in `options.interval` milliseconds
                setTimeout(attemptBind, options.interval);
            };

            // Attempt bind
            attemptBind();
        });
    }

    dispose() {
        // Unbind player events
        this._unbindPlayerEvents();

        // Reset state
        this._playerContent = null;
        this._metadata = null;

        // Emit player "closed" event
        this.emit('closed');
    }

    _observe(node, options) {
        if(!isDefined(node)) {
            Log.warn('Invalid node: %o', node);
            return false;
        }

        Log.trace('Observing node: %o (options: %o)', node, options);
        this._observer.observe(node, options);

        // Trigger initial events
        if(node.id === 'dv-player-content') {
            this._onPlayerContentStyleChanged();
        }

        return true;
    }

    _bindPlayerEvents() {
        Log.trace('Binding to player events');

        // Bind player events
        this._addEventListener('loadstart', () => this._onVideoLoading());
        this._addEventListener('seeked', () => this._onVideoSeeked());
        this._addEventListener('playing', () => this._onPlaying());
        this._addEventListener('pause', () => this.emit('paused'));
        this._addEventListener('ended', () => this.emit('stopped'));

        this._addEventListener('timeupdate', () => {
            this.emit('progress', this._getPlayerTime(), this._getPlayerDuration());
        });
    }

    _unbindPlayerEvents() {
        Log.trace('Unbinding from player events');

        // Unbind player events
        if(this._metadata !== null) {
            this._removeEventListeners();
        }
    }

    _addEventListener(type, listener) {
        if(!this._metadata) {
            return false;
        }

        // Add event listener
        Log.trace('Adding event listener %o for type %o', listener, type);
        this._metadata.addEventListener(type, listener);

        // Store listener reference
        if(typeof this._listeners[type] === 'undefined') {
            this._listeners[type] = [];
        }

        this._listeners[type].push(listener);
        return true;
    }

    _removeEventListeners() {
        if(!this._metadata) {
            return false;
        }

        for(let type in this._listeners) {
            if(!this._listeners.hasOwnProperty(type)) {
                continue;
            }

            let listeners = this._listeners[type];

            for(let i = 0; i < listeners.length; ++i) {
                let listener = listeners[i];

                Log.debug('Removing event listener %o for type %o', listener, type);
                this._metadata.removeEventListener(type, listener);
            }
        }

        return true;
    }

    // region Event handlers

    _onMutations(mutations) {
        for(let i = 0; i < mutations.length; ++i) {
            this._onMutation(mutations[i]);
        }
    }

    _onMutation(mutation) {
        if(mutation.type === 'childList') {
            this._onNodeActions('add', mutation.addedNodes);
            this._onNodeActions('remove', mutation.removedNodes);
        } else if(mutation.type === 'attributes') {
            this._onNodeAttributeChanged(mutation.attributeName, mutation.target);
        } else {
            Log.warn('Unknown mutation:', mutation);
            return false;
        }

        return true;
    }

    _onNodeActions(action, nodes) {
        for(let i = 0; i < nodes.length; ++i) {
            let node = nodes[i];

            if(action === 'add') {
                this._onNodeAdded(node);
            } else {
                Log.warn('Unknown mutation action %o for %o', action, node);
            }
        }
    }

    _onNodeAdded(node) {
        if(!isDefined(node)) {
            return false;
        }

        // Process node addition
        if(node.id === 'dv-web-player') {
            this._onNodeAdded(node.querySelector('.webPlayerContainer'));
        } else if(hasClass(node, 'webPlayerContainer')) {
            this._onNodeAdded(node.querySelector('.webPlayerElement'));
        } else if(hasClass(node, 'webPlayerElement')) {
            this._onNodeAdded(node.querySelector('.cascadesContainer'));
        } else if(hasClass(node, 'cascadesContainer')) {
            this._onNodeAdded(node.querySelector('.contentTitlePanel'));
            this._onNodeAdded(node.querySelector('.rendererContainer'));
        } else if(hasClass(node, 'contentTitlePanel')) {
            this._onNodeAdded(node.querySelector('.title'));
            this._onNodeAdded(node.querySelector('.subtitle'));
        } else if(hasClass(node, 'rendererContainer')) {
            this._onNodeAdded(node.querySelector('video'));
        } else if(node.tagName === 'VIDEO') {
            this._onVideoLoaded(node);
        } else if(hasClassTree(node, 'title', 'contentTitlePanel')) {
            this._onPlaying();
        } else if(hasClassTree(node, 'subtitle', 'contentTitlePanel')) {
            this._onPlaying();
        } else if(hasClassTree(node, null, 'title', 'contentTitlePanel')) {
            this._onPlaying();
        } else if(hasClassTree(node, null, 'subtitle', 'contentTitlePanel')) {
            this._onPlaying();
        } else {
            Log.warn('Unknown node added: %o', node);
            return false;
        }

        // Observe node changes
        this._observe(node, {
            childList: true
        });

        return true;
    }

    _onNodeAttributeChanged(attributeName, node) {
        if(node.id === 'dv-player-content' && attributeName === 'style') {
            this._onPlayerContentStyleChanged();
        } else {
            Log.warn('Unknown node attribute %o changed on %o', attributeName, node);
            return false;
        }

        return true;
    }

    _onPlayerContentStyleChanged() {
        let visible = this._playerContent.style.opacity === '1';

        // Ensure visibility has changed
        if(visible === this._visible) {
            return;
        }

        Log.debug('Player visibility changed to %o', visible);

        // Emit change
        if(visible) {
            setTimeout(this._onVideoOpened.bind(this), 100);
        } else {
            setTimeout(this._onVideoClosed.bind(this), 100);
        }

        // Update current state
        this._visible = visible;
    }

    _onVideoLoading() {
        // Update current identifier
        return this._updateIdentifier()
            .then((changed) => {
                // Emit "created" event (if the identifier has changed)
                if(changed) {
                    Log.trace('Identifier changed, emitting "created" event (identifier: %o)', this._currentIdentifier);
                    this.emit('created', this._currentIdentifier);
                }

                return true;
            }, (err) => {
                Log.warn('Unable to update identifier, error:', err);
            });
    }

    _onVideoLoaded(video) {
        this._metadata = video;

        // Bind to video player events
        this._bindPlayerEvents();
    }

    _onVideoOpened() {
        // Update current identifier
        return this._updateIdentifier()
            .then(() => {
                // Emit events
                this.emit('opened', this._currentIdentifier);
                this.emit('created', this._currentIdentifier);
                return true;
            }, (err) => {
                Log.warn('Unable to update identifier, error:', err);
            });
    }

    _onVideoClosed() {
        // Emit "closed" event
        this.emit('closed', this._currentIdentifier);
        return true;
    }

    _onVideoSeeked() {
        // Emit "seeked" event
        let time = this._getPlayerTime();
        let duration = this._getPlayerDuration();

        this.emit('seeked', this._calculateProgress(time, duration), time, duration);
    }

    _onPlaying() {
        Log.trace('Playing');

        // Update current identifier
        return this._updateIdentifier()
            .then((changed) => {
                // Emit event
                if(changed) {
                    Log.trace('Identifier changed, emitting "created" event (identifier: %o)', this._currentIdentifier);
                    this.emit('created', this._currentIdentifier);
                } else {
                    this.emit('started');
                }

                return true;
            }, (err) => {
                Log.warn('Unable to update identifier, error:', err);
            });
    }

    // endregion

    // region Helpers

    _calculateProgress(time, duration) {
        return round((parseFloat(time) / duration) * 100, 2);
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

    _getIdentifier() {
        // Try find content title panel
        return this._getContentTitlePanel()
            .then((contentTitlePanel) => new Promise((resolve, reject) => {
                let attempts = 0;

                let get = () => {
                    // Retrieve page key (movie, season or episode asin)
                    let key = this._getPageAsin();

                    if(!isDefined(key)) {
                        reject(new Error('Unable to retrieve page asin'));
                        return;
                    }

                    // Detect content
                    let identifier = this._constructIdentifier(contentTitlePanel, key);

                    if(!isDefined(identifier)) {
                        if(attempts < 50) {
                            attempts += 1;
                            setTimeout(get, 100);
                            return;
                        }

                        reject(new Error('Unable to retrieve item identifier'));
                        return;
                    }

                    // Return media identifier
                    resolve(identifier);
                };

                // Try retrieve identifier
                get();
            }));
    }

    _getContentTitlePanel() {
        return new Promise((resolve, reject) => {
            let attempts = 0;

            let get = () => {
                let contentTitlePanel = document.querySelector('#dv-web-player .contentTitlePanel');

                if(!isDefined(contentTitlePanel)) {
                    if(attempts < 50) {
                        attempts += 1;
                        setTimeout(get, 100);
                        return;
                    }

                    reject(new Error('Unable to find content title panel'));
                    return;
                }

                // Found element
                resolve(contentTitlePanel);
            };

            // Try find content title panel
            get();
        });
    }

    _getPlayerDuration() {
        if(this._metadata === null || this._metadata.duration === 0) {
            return null;
        }

        return this._metadata.duration * 1000;
    }

    _getPlayerTime() {
        if(this._metadata === null || this._metadata.duration === 0) {
            return null;
        }

        return this._metadata.currentTime * 1000;
    }

    _constructIdentifier(node, key) {
        // Retrieve elements
        let title = node.querySelector('.title').innerHTML;
        let subtitle = node.querySelector('.subtitle').innerHTML;

        if(title.length === 0) {
            return null;
        }

        // Movie
        if(subtitle.length === 0) {
            return new MovieIdentifier(
                KeyType.Exact, key,
                title
            );
        }

        // Episode
        let episodeMatch = /^Season (\d+), Ep\. (\d+) (.+)$/g.exec(subtitle);

        if(episodeMatch !== null) {
            return new EpisodeIdentifier(
                KeyType.Relation, key,

                // Show
                new ShowIdentifier(
                    KeyType.Missing, null,
                    title
                ),

                // Season
                new SeasonIdentifier(
                    KeyType.Missing, null,
                    parseInt(episodeMatch[1], 10)
                ),

                // Episode number
                parseInt(episodeMatch[2], 10),

                // Episode title
                episodeMatch[3]
            );
        }

        // Unknown item
        Log.error('Unable to detect content (title: %o, subtitle: %o)', title, subtitle);
        return null;
    }

    _updateIdentifier() {
        return this._getIdentifier()
            .then((identifier) => {
                // Determine if content has changed
                if(identifier === this._currentIdentifier) {
                    return false;
                }

                if(isDefined(identifier) && identifier.matches(this._currentIdentifier)) {
                    return false;
                }

                // Update state
                this._currentIdentifier = identifier;
                return true;
            });
    }

    // endregion
}
