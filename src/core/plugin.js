import SourcePlugin from 'neon-extension-framework/base/plugins/source';


export class AmazonVideoPlugin extends SourcePlugin {
    constructor() {
        super('amazonvideo');
    }
}

export default new AmazonVideoPlugin();
