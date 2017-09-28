import {isDefined} from 'neon-extension-framework/core/helpers';

import Resources from './resources';


export class AmazonVideoShim {
    start() {
        // Listen for shim requests
        document.body.addEventListener('neon.request', (e) => this._onRequestReceived(e));

        // Emit "ready" event
        this.emit('ready');
    }

    emit(type, data) {
        // Construct event
        let event = new CustomEvent('neon.event', {
            detail: {
                type: type,
                data: data || null
            }
        });

        // Emit event on the document
        document.body.dispatchEvent(event);
    }

    respond(requestId, type, data) {
        this.emit('#' + requestId, {
            type: type,
            data: data || null
        });
    }

    resolve(requestId, data) {
        this.respond(requestId, 'resolve', data);
    }

    reject(requestId, data) {
        this.respond(requestId, 'reject', data);
    }

    _onRequestReceived(e) {
        if(!e || !e.detail || !e.detail.id || !e.detail.type) {
            console.error('Unknown event received:', e);
            return;
        }

        let id = e.detail.id;
        let type = e.detail.type;

        // Process request
        if(isDefined(Resources[type])) {
            Resources[type].request(e.detail.data).then(
                (data) => this.resolve(id, data),
                (data) => this.reject(id, data)
            );
        } else {
            console.warn('Received request for an unknown resource: %o', type);
            this.reject(id);
        }
    }
}

// Initialize shim
(new AmazonVideoShim()).start();
