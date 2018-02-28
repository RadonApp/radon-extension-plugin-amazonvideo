import ConfigurationService from 'neon-extension-framework/services/configuration';
import Registry from 'neon-extension-framework/core/registry';

import Options from './options';
import Plugin from '../../core/plugin';


export class AmazonVideoConfigurationService extends ConfigurationService {
    constructor() {
        super(Plugin, Options);
    }
}

// Register service
Registry.registerService(new AmazonVideoConfigurationService());
