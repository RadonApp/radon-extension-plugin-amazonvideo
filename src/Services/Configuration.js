import ConfigurationService from 'neon-extension-framework/Services/Configuration';
import Registry from 'neon-extension-framework/Core/Registry';
import Plugin from 'neon-extension-source-amazonvideo/Core/Plugin';
import {Page} from 'neon-extension-framework/Models/Configuration';
import {EnableOption} from 'neon-extension-framework/Models/Configuration/Options';


export const Options = [
    new Page(Plugin, null, [
        new EnableOption(Plugin, 'enabled', {
            default: false,

            type: 'plugin',
            permissions: true,
            contentScripts: true
        })
    ])
];

export class AmazonVideoConfigurationService extends ConfigurationService {
    constructor() {
        super(Plugin, Options);
    }
}

// Register service
Registry.registerService(new AmazonVideoConfigurationService());
