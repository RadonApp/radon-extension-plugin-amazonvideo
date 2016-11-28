/* eslint-disable no-multi-spaces, key-spacing */
import {hasClass, hasClassTree, isDefined} from 'eon.extension.framework/core/helpers';

import EventEmitter from 'eventemitter3';
import merge from 'lodash-es/merge';

import Log from 'eon.extension.source.amazonvideo/core/logger';


export default class PlayerObserver extends EventEmitter {
    constructor() {
        super();

        // Construct mutation observer
        this._observer = new MutationObserver(
            this._onMutations.bind(this)
        );

        // Private attributes
        this._contentTitlePanel = null;
        this._contentTitle = null;
        this._contentSubtitle = null;

        this._changedTimeout = null;

        this._listeners = {};
        this._visible = false;
    }

    bind(document, options) {
        // Set default options
        options = merge({
            interval: 500,
            timeout: 10 * 1000
        }, options || {});

        // Reset state
        this._playerContentElement = null;
        this._videoElement = null;

        // Bind to page elements
        return new Promise((resolve, reject) => {
            let attempts = 0;

            let attemptBind = () => {
                // Try find video element
                let playerContent = document.querySelector('#dv-player-content');

                if(playerContent !== null) {
                    // Update state
                    this._playerContentElement = playerContent;

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
        this._removeAllEventListeners();

        // Reset state
        this._playerContentElement = null;
        this._videoElement = null;
    }

    getDuration() {
        if(this._videoElement === null || this._videoElement.duration === 0) {
            return null;
        }

        return this._videoElement.duration * 1000;
    }

    getTime() {
        if(this._videoElement === null || this._videoElement.duration === 0) {
            return null;
        }

        return this._videoElement.currentTime * 1000;
    }

    // region Event handlers

    _onPlayerStyleChanged() {
        let visible = this._playerContentElement.style.opacity === '1';

        // Ensure visibility has changed
        if(visible === this._visible) {
            return;
        }

        Log.debug('Player visibility changed to %o', visible);

        // Emit change
        if(visible) {
            setTimeout(() => this.emit('opened'), 100);
        } else {
            setTimeout(() => this.emit('closed'), 100);
        }

        // Update current state
        this._visible = visible;
    }

    _onVideoNodeAdded(node) {
        if(node.src.indexOf('blob:https://www.amazon.com/') !== 0) {
            Log.debug('Ignoring video with incorrect "src" attribute:', node);
            return;
        }

        Log.debug('Found video element:', node);

        // Video player found, bind to events
        this._videoElement = node;

        // Bind to video player events
        this._addEventListeners();
    }

    _onContentTitleChanged() {
        // Retrieve current content title
        let {title, subtitle} = this._getContentTitle();

        // Ensure title has changed
        if(this._contentTitle === title && this._contentSubtitle === subtitle) {
            return;
        }

        // Update content title
        this._contentTitle = title;
        this._contentSubtitle = subtitle;

        // Cancel existing "changed" event timeout
        if(isDefined(this._changedTimeout)) {
            clearTimeout(this._changedTimeout);

            // Reset state
            this._changedTimeout = null;
        }

        // Emit "changed" event in 2 seconds
        this._changedTimeout = setTimeout(() => {
            // Emit event
            this.emit('changed', {
                title: this._contentTitle,
                subtitle: this._contentSubtitle
            });

            // Reset state
            this._changedTimeout = null;
        }, 2000);
    }

    _getContentTitle() {
        // Retrieve content title
        let title = this._contentTitlePanel.querySelector('.title');

        if(!isDefined(title) || title.innerHTML.length === 0) {
            return {
                title: null,
                subtitle: null
            };
        }

        // Retrieve content subtitle
        let subtitle = this._contentTitlePanel.querySelector('.subtitle');

        if(!isDefined(subtitle) || subtitle.innerHTML.length === 0) {
            return {
                title: title.innerHTML,
                subtitle: null
            };
        }

        // Build content title object
        return {
            title: title.innerHTML,
            subtitle: subtitle.innerHTML
        };
    }

    // region Mutations

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
            this._contentTitlePanel = node;

            this._onNodeAdded(node.querySelector('.title'));
            this._onNodeAdded(node.querySelector('.subtitle'));
        } else if(hasClass(node, 'rendererContainer')) {
            this._onNodeAdded(node.querySelector('video'));
        } else if(node.tagName === 'VIDEO') {
            this._onVideoNodeAdded(node);
        } else if(hasClassTree(node, 'title', 'contentTitlePanel')) {
            this._onContentTitleChanged();
        } else if(hasClassTree(node, 'subtitle', 'contentTitlePanel')) {
            this._onContentTitleChanged();
        } else if(hasClassTree(node, null, 'title', 'contentTitlePanel')) {
            this._onContentTitleChanged();
        } else if(hasClassTree(node, null, 'subtitle', 'contentTitlePanel')) {
            this._onContentTitleChanged();
        } else {
            Log.warn('Unknown node added: %o', node);
            return false;
        }

        // Observe node changes
        this._observe(node, {
            attributes: true,
            childList: true
        });

        return true;
    }

    _onNodeAttributeChanged(attributeName, node) {
        if(node.id === 'dv-player-content' && attributeName === 'style') {
            this._onPlayerStyleChanged();
        } else if(node.tagName === 'VIDEO' && attributeName === 'src') {
            this._onVideoNodeAdded(node);
        } else {
            Log.warn('Unknown node attribute %o changed on %o', attributeName, node);
            return false;
        }

        return true;
    }

    // endregion

    // endregion

    // region Private methods

    _observe(node, options) {
        if(!isDefined(node)) {
            Log.warn('Invalid node: %o', node);
            return false;
        }

        Log.trace('Observing node: %o (options: %o)', node, options);
        this._observer.observe(node, options);

        // Trigger initial events
        if(node.id === 'dv-player-content') {
            this._onPlayerStyleChanged();
        }

        return true;
    }

    _addEventListeners() {
        Log.trace('Binding to player events');

        // Bind player events
        this._addEventListener('loadstart',         () => this.emit('loading'));
        this._addEventListener('loadedmetadata',    () => this.emit('loaded'));

        this._addEventListener('playing',           () => this.emit('started'));
        this._addEventListener('pause',             () => this.emit('paused'));
        this._addEventListener('ended',             () => this.emit('stopped'));

        this._addEventListener('seeked', () => {
            this.emit('seeked', this.getTime(), this.getDuration());
        });

        this._addEventListener('timeupdate', () => {
            this.emit('progress', this.getTime(), this.getDuration());
        });
    }

    _addEventListener(type, listener) {
        if(!this._videoElement) {
            return false;
        }

        // Add event listener
        Log.trace('Adding event listener %o for type %o', listener, type);
        this._videoElement.addEventListener(type, listener);

        // Store listener reference
        if(typeof this._listeners[type] === 'undefined') {
            this._listeners[type] = [];
        }

        this._listeners[type].push(listener);
        return true;
    }

    _removeAllEventListeners() {
        if(!isDefined(this._videoElement)) {
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
                this._videoElement.removeEventListener(type, listener);
            }
        }

        return true;
    }

    // endregion
}
