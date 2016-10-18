import {Logger} from 'eon.extension.framework/core/logger';

import Plugin from './plugin';


export default new Logger(() =>
    Plugin.preferences.getString('developer.log_level')
);
