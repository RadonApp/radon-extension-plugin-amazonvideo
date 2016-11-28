/* eslint-disable no-multi-spaces, key-spacing */
import {isDefined} from 'eon.extension.framework/core/helpers';
import {
    MovieIdentifier,
    ShowIdentifier,
    SeasonIdentifier,
    EpisodeIdentifier,
    KeyType
} from 'eon.extension.framework/models/video';

import EventEmitter from 'eventemitter3';

import Log from 'eon.extension.source.amazonvideo/core/logger';
import PlayerObserver from './observer';


const URL_PATTERNS = [
    /^https:\/\/www\.amazon\.com\/dp\/([a-z0-9]*).*?$/i,
    /^https:\/\/www\.amazon\.com\/.*?\/dp\/([a-z0-9]*).*?$/i,
    /^https:\/\/www\.amazon\.com\/gp\/product\/([a-z0-9]*).*?$/i,
    /^https:\/\/www\.amazon\.com\/gp\/video\/detail\/([a-z0-9]*).*?$/i
];

export default class PlayerMonitor extends EventEmitter {
    constructor() {
        super();

        // Construct player observer
        this.player = new PlayerObserver();
        this.player.on('opened',     this._onOpened.bind(this));
        this.player.on('closed',     this._onClosed.bind(this));
        this.player.on('loaded',    this._onLoaded.bind(this));

        this.player.on('changed',    this._onStarted.bind(this));
        this.player.on('started',    this._onStarted.bind(this));

        this.player.on('seeked',     this.emit.bind(this, 'seeked'));
        this.player.on('progress',   this.emit.bind(this, 'progress'));
        this.player.on('paused',     this.emit.bind(this, 'paused'));
        this.player.on('stopped',    this.emit.bind(this, 'stopped'));

        // Private attributes
        this._currentIdentifier = null;
    }

    bind(document, options) {
        return this.player.bind(document, options);
    }

    dispose() {
        // Dispose observer
        this.player.dispose();

        // Emit player "closed" event
        this.emit('closed');
    }

    // region Event handlers

    _onOpened() {
        // Update current identifier
        return this._getIdentifier()
            .then((identifier) => {
                // Emit "opened" event
                this.emit('opened', identifier);
                return true;
            }, (err) => {
                Log.warn('Unable to retrieve identifier, error:', err);
            });
    }

    _onClosed() {
        // Emit "closed" event
        this.emit('closed', this._currentIdentifier);
        return true;
    }

    _onLoaded() {
        // Update current identifier
        return this._updateIdentifier()
            .then((changed) => {
                // Emit "created" event (if the identifier has changed)
                if(changed) {
                    Log.trace('Identifier changed, emitting "created" event (identifier: %o)', this._currentIdentifier);
                    this.emit('created', this._currentIdentifier);
                } else {
                    this.emit('loaded', this._currentIdentifier)
                }

                return true;
            }, (err) => {
                Log.warn('Unable to update identifier, error:', err);
            });
    }

    _onStarted() {
        Log.trace('Started');

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

    // region Private methods

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
        return this._findContentTitlePanel()
            .then((contentTitlePanel) => new Promise((resolve, reject) => {
                let attempts = 0;

                let retry = (target) => {
                    if(attempts < 50) {
                        attempts += 1;
                        setTimeout(target, 100);
                        return;
                    }

                    reject(new Error('Unable to retrieve item identifier'));
                };

                let get = () => {
                    // Ensure title element has been inserted
                    let title = contentTitlePanel.querySelector('.title');

                    if(!isDefined(title) || title.innerHTML.length === 0) {
                        retry(get);
                        return;
                    }

                    // Retrieve page key (movie, season or episode asin)
                    let key = this._getPageAsin();

                    if(!isDefined(key)) {
                        reject(new Error('Unable to retrieve page asin'));
                        return;
                    }

                    // Detect content
                    let identifier = this._constructIdentifier(contentTitlePanel, key);

                    if(!isDefined(identifier)) {
                        retry(get);
                        return;
                    }

                    // Return media identifier
                    resolve(identifier);
                };

                // Try retrieve identifier
                get();
            }));
    }

    _findContentTitlePanel() {
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
