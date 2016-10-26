import {
    Group,
    Page,
    EnableOption,
    SelectOption
} from 'eon.extension.framework/services/configuration/models';

import Plugin from 'eon.extension.source.amazonvideo/core/plugin';


export default [
    new Page(Plugin, null, Plugin.title, [
        new EnableOption(Plugin, 'enabled', 'Enabled', {
            default: false,

            type: 'plugin',
            permissions: true,
            contentScripts: true
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
    ])
];
