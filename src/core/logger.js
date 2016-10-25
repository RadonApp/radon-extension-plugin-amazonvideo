import {Logger} from 'eon.extension.framework/core/logger';

import Plugin from './plugin';


export default Logger.create(Plugin.id, () =>
    Plugin.preferences.getString('developer.log_level')
);
