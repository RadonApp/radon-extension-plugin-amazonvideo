import SyncService from 'eon.extension.framework/services/source/sync';
import Registry from 'eon.extension.framework/core/registry';

import Plugin from 'eon.extension.source.amazonvideo/core/plugin';


export class AmazonVideoSyncService extends SyncService {
    constructor() {
        super(Plugin);
    }
}

// Register service
Registry.registerService(new AmazonVideoSyncService());
