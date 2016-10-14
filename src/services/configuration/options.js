import {
    CheckboxOption,
    EnableOption,
    Group
} from 'eon.extension.framework/services/configuration/models';

import Plugin from '../../core/plugin';


export default [
    new EnableOption(Plugin, 'enabled', 'Enabled', {
        default: false,

        contentScripts: Plugin.contentScripts,
        permissions: Plugin.permissions
    })
];
