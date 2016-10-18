import SourcePlugin from 'eon.extension.framework/base/plugins/source';

import Manifest from '../../manifest.json';


export class AmazonVideoPlugin extends SourcePlugin {
    constructor() {
        super('amazonvideo', Manifest);
    }
}

export default new AmazonVideoPlugin();
