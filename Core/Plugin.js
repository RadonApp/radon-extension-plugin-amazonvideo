import SourcePlugin from '@radon-extension/framework/Models/Plugin/Source';


export class AmazonVideoPlugin extends SourcePlugin {
    constructor() {
        super('amazonvideo');
    }
}

export default new AmazonVideoPlugin();
