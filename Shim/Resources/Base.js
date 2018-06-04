export default class Resource {
    constructor(shim) {
        this.shim = shim;
    }

    get requests() {
        return this.shim.requests;
    }

    emit(type, ...args) {
        // Construct event
        let event = new CustomEvent('neon.event', {
            detail: JSON.stringify({
                type: type,
                args: args || []
            })
        });

        // Emit event on the document
        document.body.dispatchEvent(event);
    }
}
