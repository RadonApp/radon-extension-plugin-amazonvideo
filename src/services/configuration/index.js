import ConfigurationService from 'eon.extension.framework/services/configuration';
import Registry from 'eon.extension.framework/core/registry';

import Plugin from '../../core/plugin';
import Options from './options';


export class AmazonVideoConfigurationService extends ConfigurationService {
    constructor() {
        super(Plugin, Options);
    }
}

// Register service
Registry.registerService(new AmazonVideoConfigurationService());
