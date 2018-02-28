import EventEmitter from 'eventemitter3';

import Log from './logger';


class AmazonVideoShimApi extends EventEmitter {
    constructor() {
        super();

        this.document = null;

        this._nextRequestId = 1;
    }

    bind(document) {
        this.document = document;

        // Listen for shim events
        this.document.body.addEventListener('neon.event', (e) => this._onEventReceived(e));
    }

    request(type, data) {
        return new Promise((resolve, reject) => {
            let requestId = this._nextRequestId++;

            // Construct request
            let event = new CustomEvent('neon.request', {
                detail: {
                    id: requestId,
                    type: type,
                    data: data || null
                }
            });

            // Listen for response
            this.once('#' + requestId, (response) => {
                if(response.type === 'resolve') {
                    resolve(response.data);
                } else {
                    reject(response.data);
                }
            });

            // Emit request on the document
            this.document.body.dispatchEvent(event);
        });
    }

    // region Private methods

    _onEventReceived(e) {
        if(!e || !e.detail || !e.detail.type) {
            Log.warn('Received an unknown event:', e);
            return;
        }

        Log.trace('Received "' + e.detail.type + '" event:', e.detail.data);

        // Emit event
        this.emit(e.detail.type, e.detail.data || null);
    }

    // endregion
}

export default new AmazonVideoShimApi();
