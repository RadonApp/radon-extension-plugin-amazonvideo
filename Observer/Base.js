import EventEmitter from 'eventemitter3';
import ForEach from 'lodash-es/forEach';

import DocumentObserver from 'neon-extension-framework/Document/Observer';


export default class Observer extends EventEmitter {
    constructor() {
        super();

        this._observers = [];
        this._started = false;
    }

    get(selector) {
        return this._observers[selector] || null;
    }

    start() {
        if(this._started) {
            return;
        }

        // Mark as started
        this._started = true;

        // Create observers
        this.create();

        // Start observers
        ForEach(this._observers, (observer) =>
            observer.start()
        );
    }

    observe(root, selector, options) {
        let observer = DocumentObserver.observe(root, selector, {
            start: false,

            ...(options || {})
        });

        // Store observer reference (for later cleanup)
        this._observers.push(observer);

        // Return observer
        return observer;
    }

    create() {
        throw new Error('Not Implemented');
    }
}
