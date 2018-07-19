import Event from 'neon-extension-framework/Document/Event';

import Resource from './Base';


export default class VideoResource extends Resource {
    constructor(shim) {
        super(shim);

        // Listen for play click events
        Event.on(
            document, 'click', '.js-deeplinkable, .deeplinkable a, .deeplinkable input',
            this._onPlayClicked.bind(this)
        );
    }

    _onPlayClicked(element) {
        let attributes = Object.assign({}, element.dataset);

        if(Object.keys(attributes).length < 1) {
            return;
        }

        // Emit "video.play" event
        this.emit('video.play', attributes);
    }
}
