import ConfigurationService from 'neon-extension-framework/services/configuration';
import Registry from 'neon-extension-framework/core/registry';

import Plugin from 'neon-extension-source-amazonvideo/core/plugin';
import Options from './options';


export class AmazonVideoConfigurationService extends ConfigurationService {
    constructor() {
        super(Plugin, Options);
    }
}

// Register service
Registry.registerService(new AmazonVideoConfigurationService());
