import ActivityService, {ActivityEngine} from '@radon-extension/framework/Services/Source/Activity';
import Registry from '@radon-extension/framework/Core/Registry';

import PlayerMonitor from '../Player/Monitor';
import Plugin from '../Core/Plugin';
import ShimApi from '../Api/Shim';


export class AmazonVideoActivityService extends ActivityService {
    constructor() {
        super(Plugin);

        this.player = new PlayerMonitor();
        this.engine = null;
    }

    initialize() {
        super.initialize();

        // Create activity engine
        this.engine = new ActivityEngine(this.plugin, {
            isEnabled: () => true
        });

        // Bind activity engine to player monitor
        this.engine.bind(this.player);

        // Inject shim
        ShimApi.inject().then(() => {
            // Start monitoring player
            this.player.start();
        });
    }
}

// Register service
Registry.registerService(new AmazonVideoActivityService());
