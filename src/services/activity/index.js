import IsNil from 'lodash-es/isNil';
import Runtime from 'wes/runtime';

import ActivityService, {ActivityEngine} from 'neon-extension-framework/services/source/activity';
import Registry from 'neon-extension-framework/core/registry';
import {createScript} from 'neon-extension-framework/core/helpers/script';

import Log from '../../core/logger';
import Plugin from '../../core/plugin';
import Shim from '../../core/shim';
import PlayerMonitor from './player/monitor';


export class AmazonVideoActivityService extends ActivityService {
    constructor() {
        super(Plugin);

        this.engine = null;
        this.monitor = null;
    }

    initialize() {
        super.initialize();

        // Construct activity engine
        this.engine = new ActivityEngine(this.plugin, {
            fetchMetadata: this._fetchMetadata.bind(this),
            isEnabled: this._isPlayerVisible.bind(this)
        });

        // Bind to document
        this.bind();
    }

    bind() {
        if(document.body === null) {
            Log.info('Document body not loaded yet, will try again in 500ms');
            setTimeout(() => this.bind(), 500);
            return;
        }

        if(document.querySelector('#dv-web-player') === null) {
            Log.info('Player not loaded yet, will try again in 500ms');
            setTimeout(() => this.bind(), 500);
            return;
        }

        // Initialize player monitor
        this.monitor = new PlayerMonitor();

        // Bind activity engine to monitor
        this.engine.bind(this.monitor);

        // Inject shim
        this._inject()
            .then(() => this.monitor.bind(document))
            .catch((error) => {
                Log.error('Unable to inject shim:', error);
            });
    }

    _inject() {
        return new Promise((resolve) => {
            let script = createScript(document, Runtime.getURL('/source/amazonvideo/shim/shim.js'));

            // Bind shim api to page
            Shim.bind(document);

            // Wait for "ready" event
            Shim.once('ready', () => {
                resolve();
            });

            // TODO implement timeout?

            // Insert script into page
            (document.head || document.documentElement).appendChild(script);
        });
    }

    _getDuration() {
        if(IsNil(this.monitor)) {
            return null;
        }

        return this.monitor.player.getDuration();
    }

    _fetchMetadata(item) {
        Log.trace('Fetching metadata for %o', item);

        return Promise.resolve(item);
    }

    _isPlayerVisible() {
        let playerContent = document.querySelector('#dv-player-content');

        if(IsNil(playerContent)) {
            return false;
        }

        return playerContent.style.opacity === '1';
    }
}

// Register service
Registry.registerService(new AmazonVideoActivityService());
