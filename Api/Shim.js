import EventEmitter from 'eventemitter3';
import IsNil from 'lodash-es/isNil';
import Merge from 'lodash-es/merge';
import Runtime from 'wes/runtime';

import {awaitBody} from '@radon-extension/framework/Document/Await';
import {createScript} from '@radon-extension/framework/Utilities/Script';

import Log from '../Core/Logger';


export class AmazonVideoShimEvents extends EventEmitter {
    initialize() {
        // Bind to events
        this._bind('neon.event', (e) => this._onEvent(e));
    }

    _bind(event, callback) {
        try {
            document.body.addEventListener(event, callback);
        } catch(e) {
            Log.error('Unable to bind to "%s"', event, e);
            return false;
        }

        Log.debug('Bound to "%s"', event);
        return true;
    }

    _onEvent(e) {
        if(!e || !e.detail) {
            Log.error('Invalid event received:', e);
            return;
        }

        // Decode event
        let event;

        try {
            event = JSON.parse(e.detail);
        } catch(err) {
            Log.error('Unable to decode event: %s', err && err.message, err);
            return;
        }

        // Emit request
        this.emit(event.type, ...event.args);
    }
}

class AmazonVideoShim extends EventEmitter {
    constructor() {
        super();

        this._events = new AmazonVideoShimEvents();

        this._configuration = null;

        this._injected = false;
        this._injecting = null;
    }

    get events() {
        return this._events;
    }

    inject(options) {
        if(this._injected) {
            return Promise.resolve();
        }

        // Inject shim into page (if not already injecting)
        if(IsNil(this._injecting)) {
            this._injecting = this._inject(options);
        }

        // Return current promise
        return this._injecting;
    }

    configuration(refresh = false) {
        if(!IsNil(this._configuration) && !refresh) {
            return Promise.resolve(this._configuration);
        }

        return this.inject().then(() =>
            this._request('configuration')
        );
    }

    // region Private Methods

    _await(type, options) {
        options = Merge({
            timeout: 10 * 1000  // 10 seconds
        }, options || {});

        // Create promise
        return new Promise((resolve, reject) => {
            let listener;

            // Create timeout callback
            let timeoutId = setTimeout(() => {
                if(!IsNil(listener)) {
                    this._events.removeListener(type, listener);
                }

                // Reject promise
                reject(new Error('Request timeout'));
            }, options.timeout);

            // Create listener callback
            listener = (event) => {
                clearTimeout(timeoutId);

                // Resolve promise
                resolve(event);
            };

            // Wait for event
            this._events.once(type, listener);
        });
    }

    _emit(type, ...args) {
        let request = new CustomEvent('neon.event', {
            detail: JSON.stringify({
                type: type,
                args: args || []
            })
        });

        // Emit event on the document
        document.body.dispatchEvent(request);
    }

    _request(type, ...args) {
        let request = new CustomEvent('neon.request', {
            detail: JSON.stringify({
                type: type,
                args: args || []
            })
        });

        // Emit request on the document
        document.body.dispatchEvent(request);

        // Wait for response
        return this._await(type);
    }

    _inject(options) {
        options = Merge({
            timeout: 10 * 1000  // 10 seconds
        }, options || {});

        // Wait until body is available
        return awaitBody().then(() => {
            let script = createScript(document, Runtime.getURL('/Plugins/amazonvideo/Shim.js'));

            // Initialize events interface
            this._events.initialize();

            // Insert script into page
            (document.head || document.documentElement).appendChild(script);

            // Wait for "configuration" event
            return this._await('configuration', {
                timeout: options.timeout
            }).then((configuration) => {
                // Update state
                this._configuration = configuration;
                this._injected = true;
                this._injecting = null;

                // Resolve promise with ready state
                return !IsNil(configuration);
            }, () => {
                // Update state
                this._configuration = null;
                this._injected = false;
                this._injecting = null;

                // Reject promise
                return Promise.reject(new Error('Inject timeout'));
            });
        });
    }

    // endregion
}

export default new AmazonVideoShim();
