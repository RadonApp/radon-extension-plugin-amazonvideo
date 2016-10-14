import {isDefined} from 'eon.extension.framework/core/helpers';

import EventEmitter from 'eventemitter3';
import merge from 'lodash-es/merge';


export default class PlayerMonitor extends EventEmitter {
    constructor() {
        super();

        this._listeners = {};
        this._observer = null;
        this._playerContent = null;
        this._video = null;

        this._currentKey = null;
        this._currentIdentifier = null;
        this._visible = false;
    }

    initialize() {
        console.debug('Initializing player monitor');

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
        this._video = null;

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
        this._video = null;

        // Emit player "closed" event
        this.emit('closed');
    }

    _observe(node, options) {
        if(!isDefined(node)) {
            console.warn('Invalid node: %o', node);
            return false;
        }

        console.log('Observing node: %o (options: %o)', node, options);

        this._observer.observe(node, options);
        return true;
    }

    _bindPlayerEvents() {
        console.debug('Binding to player events');

        // Bind player events
        this._addEventListener('playing', () => this._onPlaying());
        this._addEventListener('pause', () => this.emit('paused'));
        this._addEventListener('ended', () => this.emit('ended'));

        this._addEventListener('timeupdate', () => {
            let time = this._getPlayerTime();
            let duration = this._getPlayerDuration();

            this.emit(
                'progress',
                this._calculateProgress(time, duration),
                time,
                duration
            );
        });
    }

    _unbindPlayerEvents() {
        console.debug('Unbinding from player events');

        // Unbind player events
        if(this._video !== null) {
            this._removeEventListeners();
        }
    }

    _addEventListener(type, listener) {
        if(!this._video) {
            return false;
        }

        // Add event listener
        console.debug('Adding event listener %o for type %o', listener, type);
        this._video.addEventListener(type, listener);

        // Store listener reference
        if(typeof this._listeners[type] === 'undefined') {
            this._listeners[type] = [];
        }

        this._listeners[type].push(listener);
        return true;
    }

    _removeEventListeners() {
        if(!this._video) {
            return false;
        }

        for(let type in this._listeners) {
            if(!this._listeners.hasOwnProperty(type)) {
                continue;
            }

            let listeners = this._listeners[type];

            for(let i = 0; i < listeners.length; ++i) {
                let listener = listeners[i];

                console.debug('Removing event listener %o for type %o', listener, type);
                this._video.removeEventListener(type, listener);
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
            console.debug('Unknown mutation:', mutation);
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
                console.debug('Unknown mutation action %o for %o', action, node);
            }
        }
    }

    _onNodeAdded(node) {
        if(!isDefined(node)) {
            return;
        }

        // Process node addition
        if(node.id === 'dv-web-player') {
            this._onNodeAdded(node.querySelector('.webPlayerContainer'));
        } else if(node.className === 'webPlayerContainer') {
            this._onNodeAdded(node.querySelector('.webPlayerElement'));
        } else if(node.className === 'webPlayerElement') {
            this._onNodeAdded(node.querySelector('.cascadesContainer'));
        } else if(node.className === 'cascadesContainer') {
            this._onNodeAdded(node.querySelector('.rendererContainer'));
        } else if(node.className === 'rendererContainer') {
            this._onNodeAdded(node.querySelector('video'));
        } else if(node.tagName === 'VIDEO') {
            this._onVideoLoaded(node);
        } else {
            console.debug('Unknown node added: %o', node);
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
            console.debug('Unknown node attribute %o changed on %o', attributeName, node);
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

        // Emit change
        if(visible) {
            this._onVideoOpened();
        } if(!visible) {
            this._onVideoClosed();
        }

        // Update current state
        this._visible = visible;
    }

    _onVideoLoaded(video) {
        this._video = video;

        // Bind to video player events
        this._bindPlayerEvents();
    }

    _onVideoOpened() {
        if(!this._updateIdentifier().success) {
            return false;
        }

        // Emit events
        this.emit('opened', this._currentKey, this._currentIdentifier);
        this.emit('created', this._currentKey, this._currentIdentifier);

        return true;
    }

    _onVideoClosed() {
        // Emit "closed" event
        this.emit('closed', this._currentKey, this._currentIdentifier);
    }

    _onPlaying() {
        let {changed, success} = this._updateIdentifier();

        if(!success) {
            return false;
        }

        if(changed) {
            this.emit('created', this._currentKey, this._currentIdentifier);
        }

        this.emit('playing');
        return true;
    }

    // endregion

    // region Helpers

    _calculateProgress(time, duration) {
        return this._round2((parseFloat(time) / duration) * 100);
    }

    _getAsin(identifier) {
        if(!isDefined(identifier)) {
            return null;
        }

        // Find movie asin
        if(identifier.type === 'movie') {
            // Find play button
            let button = document.querySelector('#dv-action-box .dv-play-btn a');

            if(!isDefined(button)) {
                return null;
            }

            // Return asin attribute
            return button.getAttribute('data-asin');
        }

        // Find matching episode element
        let episodesElement = document.querySelector('#dv-episode-list .dv-episode-wrap');

        if(!isDefined(episodesElement)) {
            console.warn('Unable to find episodes element');
            return null;
        }

        for(let i = 0; i < episodesElement.children.length; ++i) {
            let episodeElement = episodesElement.children[i];

            // Retrieve title element
            let titleElement = episodeElement.querySelector('.dv-el-title');

            if(!isDefined(titleElement)) {
                continue;
            }

            // Match title string
            let titleMatch = /(\d+)\. (.+)/g.exec(titleElement.innerText);

            if(!isDefined(titleMatch)) {
                continue;
            }

            // Check if element matches requested episode
            let episodeNumber = titleMatch[1];

            if(episodeNumber !== identifier.episode.number) {
                continue;
            }

            // Find play button
            let button = episodeElement.querySelector('.dv-play-button-radial a');

            if(!isDefined(button)) {
                continue;
            }

            // Return asin attribute
            return button.getAttribute('data-asin');
        }

        console.warn('Unable to find episode (identifier: %o)', identifier);
        return null;
    }

    _getIdentifier() {
        // Retrieve title + subtitle from player
        let contentTitlePanel = document.querySelector('#dv-web-player .contentTitlePanel');

        if(!isDefined(contentTitlePanel)) {
            console.warn('Unable to find the "#dv-web-player .contentTitlePanel" node');
            return null;
        }

        // Retrieve content parameters
        let title = contentTitlePanel.querySelector('.title').innerHTML;
        let subtitle = contentTitlePanel.querySelector('.subtitle').innerHTML;

        // Detect content
        let identifier = this._parseTitle(title, subtitle);

        if(!isDefined(identifier)) {
            console.warn('Unable to retrieve item identifier');
            return null;
        }

        // Retrieve item asin
        let key = this._getAsin(identifier);

        if(!isDefined(key)) {
            console.warn('Unable to retrieve item asin');
            return null;
        }

        return {
            key: key,
            identifier: identifier
        };
    }

    _getPlayerDuration() {
        if(this._video === null || this._video.duration === 0) {
            return null;
        }

        return this._video.duration * 1000;
    }

    _getPlayerTime() {
        if(this._video === null || this._video.duration === 0) {
            return null;
        }

        return this._video.currentTime * 1000;
    }

    _parseTitle(title, subtitle) {
        // Movie
        if(subtitle.length === 0) {
            return {
                type: 'movie',
                movie: {
                    title: title
                }
            };
        }

        // Episode
        let episodeMatch = /^Season (\d+), Ep\. (\d+) (.+)$/g.exec(subtitle);

        if(episodeMatch !== null) {
            return {
                type: 'episode',
                episode: {
                    title: episodeMatch[3],
                    season: episodeMatch[1],
                    number: episodeMatch[2],
                },
                show: {
                    title: title,
                }
            }
        }

        // Unknown item
        console.warn('Unable to detect content (title: %o, subtitle: %o)', title, subtitle);
        return null;
    }

    _updateIdentifier() {
        // Retrieve current identifier
        let details = this._getIdentifier();

        if(!isDefined(details)) {
            return {
                changed: null,
                success: false
            };
        }

        // Determine if content has changed
        if(details.key === this._currentKey && details.identifier === this._currentIdentifier) {
            return {
                changed: false,
                success: true
            };
        }

        // Update state
        this._currentKey = details.key;
        this._currentIdentifier = details.identifier;

        return {
            changed: true,
            success: true
        };
    }

    _round2(num) {
        return +(Math.round(num + 'e+2') + 'e-2');
    }

    // endregion
}
