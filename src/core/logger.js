import {Logger} from 'neon-extension-framework/core/logger';

import Plugin from './plugin';


export default Logger.create(Plugin.id, () =>
    Plugin.preferences.getString('debugging.log_level')
);
