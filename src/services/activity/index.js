import Extension from 'neon-extension-browser/extension';
import ActivityService, {ActivityEngine} from 'neon-extension-framework/services/source/activity';
import MessagingBus from 'neon-extension-framework/messaging/bus';
import Registry from 'neon-extension-framework/core/registry';
import {isDefined} from 'neon-extension-framework/core/helpers';
import {createScript} from 'neon-extension-framework/core/helpers/script';

import uuid from 'uuid';

import Api from 'neon-extension-source-amazonvideo/api';
import Log from 'neon-extension-source-amazonvideo/core/logger';
import Plugin from 'neon-extension-source-amazonvideo/core/plugin';
import Shim from 'neon-extension-source-amazonvideo/core/shim';
import Parser from './core/parser';
import PlayerMonitor from './player/monitor';


export class AmazonVideoActivityService extends ActivityService {
    constructor() {
        super(Plugin);

        this.bus = null;
        this.engine = null;
        this.monitor = null;
    }

    initialize() {
        super.initialize();

        // Construct messaging bus
        this.bus = new MessagingBus(Plugin.id + ':activity:' + uuid.v4());
        this.bus.connect('neon-extension-core:scrobble');

        // Construct activity engine
        this.engine = new ActivityEngine(this.plugin, this.bus, {
            getDuration: this._getDuration.bind(this),
            getMetadata: this._getMetadata.bind(this),

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
        return new Promise((resolve, reject) => {
            let script = createScript(document, Extension.getUrl('/source/amazonvideo/shim/shim.js'));

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
        if(!isDefined(this.monitor)) {
            return null;
        }

        return this.monitor.player.getDuration();
    }

    _getMetadata(identifier) {
        Log.trace('Fetching metadata for %o', identifier);

        // Retrieve metadata for `identifier`
        return Api.metadata.resolve(identifier).then((item) => {
            Log.trace('Received item: %o', item);

            // Parse item into metadata models
            let metadata = Parser.parse(item);

            if(!isDefined(metadata)) {
                Log.info('Unable to parse item: %o', item);
                return null;
            }

            Log.trace('Parsed item, metadata: %o', metadata);
            return metadata;
        });
    }

    _isPlayerVisible() {
        let playerContent = document.querySelector('#dv-player-content');

        if(!isDefined(playerContent)) {
            return false;
        }

        return playerContent.style.opacity === '1';
    }
}

// Register service
Registry.registerService(new AmazonVideoActivityService());
