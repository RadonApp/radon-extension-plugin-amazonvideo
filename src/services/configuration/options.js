import {
    CheckboxOption,
    EnableOption,
    SelectOption,
    Group
} from 'eon.extension.framework/services/configuration/models';

import Plugin from '../../core/plugin';


export default [
    new EnableOption(Plugin, 'enabled', 'Enabled', {
        default: false,

        contentScripts: Plugin.contentScripts,
        permissions: Plugin.permissions
    }),

    new Group(Plugin, 'developer', 'Developer', [
        new SelectOption(Plugin, 'developer.log_level', 'Log Level', [
            {key: 'error', label: 'Error'},
            {key: 'warning', label: 'Warning'},
            {key: 'notice', label: 'Notice'},
            {key: 'info', label: 'Info'},
            {key: 'debug', label: 'Debug'},
            {key: 'trace', label: 'Trace'}
        ], {
            default: 'warning'
        })
    ])
];
