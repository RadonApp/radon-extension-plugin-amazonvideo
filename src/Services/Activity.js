import Find from 'lodash-es/find';
import Get from 'lodash-es/get';
import IsNil from 'lodash-es/isNil';

import ActivityService, {ActivityEngine} from 'neon-extension-framework/Services/Source/Activity';
import Registry from 'neon-extension-framework/Core/Registry';
import Api from 'neon-extension-source-amazonvideo/Api';
import Log from 'neon-extension-source-amazonvideo/Core/Logger';
import PlayerMonitor from 'neon-extension-source-amazonvideo/Player/Monitor';
import Plugin from 'neon-extension-source-amazonvideo/Core/Plugin';
import ShimApi from 'neon-extension-source-amazonvideo/Api/Shim';
import {MediaTypes} from 'neon-extension-framework/Core/Enums';


export class NetflixActivityService extends ActivityService {
    constructor() {
        super(Plugin);

        this.player = new PlayerMonitor();
        this.engine = null;
    }

    initialize() {
        super.initialize();

        // Create activity engine
        this.engine = new ActivityEngine(this.plugin, {
            getMetadata: this.getMetadata.bind(this),
            fetchMetadata: this.fetchMetadata.bind(this),

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

    getMetadata(item) {
        let duration = this.player.getDuration();

        // Ensure duration is valid
        if(IsNil(duration) || duration <= 0) {
            return Promise.reject(new Error(
                'Unable to retrieve video duration'
            ));
        }

        // Update duration
        if(IsNil(item.duration) || duration > item.duration) {
            item.duration = duration;
        }

        // Retrieve season identifier
        let id = Get(item.season.keys, [Plugin.id, 'id']);

        if(IsNil(id)) {
            return Promise.resolve(item);
        }

        Log.debug('Fetching item "%s"', id);

        // Fetch item metadata
        return Api.metadata.get(id).then((titles) => {
            let title = titles[0];

            if(title.contentType === 'SEASON') {
                let series = Find(title.ancestorTitles, (title) => title.contentType === 'SERIES');

                // Update show
                item.season.show.update(Plugin.id, {
                    keys: {
                        id: series.titleId
                    },

                    // Metadata
                    title: series.title
                });

                // Remove key from season (may not be correct)
                delete item.season.keys[Plugin.id].id;
            } else {
                Log.warn('Unknown title: %o', title);
            }

            return item;
        });
    }

    fetchMetadata(item) {
        let id = Get(item.season.show.keys, [Plugin.id, 'id']);

        if(IsNil(id)) {
            return Promise.resolve(item);
        }

        let fetchedAt = Date.now();

        // Update item `fetchedAt` timestamp
        item.update(Plugin.id, { fetchedAt });

        // Ignore movies
        if(item.type !== MediaTypes.Video.Episode) {
            return Promise.resolve(item);
        }

        // Update metadata
        return Promise.resolve()
            // Update show
            .then(() => this.updateShow(
                id,
                item.season.show,
                fetchedAt
            ))
            // Update season
            .then((show) => this.updateSeason(
                Get(show.keys, [Plugin.id, 'id']),
                item.season,
                fetchedAt
            ))
            // Update episode
            .then((season) => this.updateEpisode(
                Get(season.keys, [Plugin.id, 'id']),
                item
            ));
    }

    updateShow(id, item, fetchedAt) {
        Log.debug('Fetching show "%s"', id);

        // Fetch show metadata
        return Api.metadata.get(id).then((titles) => {
            let show = titles[0];

            if(IsNil(show)) {
                return Promise.reject(new Error('Unable to fetch show metadata'));
            }

            // Resolve year
            return this._resolveYear(show).then((year) => {
                // Update show
                item.update(Plugin.id, {
                    keys: {
                        id: show.titleId
                    },

                    // Metadata
                    title: show.title,
                    year,

                    // Timestamps
                    fetchedAt
                });

                return item;
            });
        });
    }

    updateSeason(id, item, fetchedAt) {
        Log.debug('Fetching season %d for show "%s"', item.number, id);

        // Fetch season metadata
        return Api.metadata.getShowSeason(id, item.number).then((season) => {
            if(IsNil(season)) {
                return Promise.reject(new Error('Unable to fetch season metadata'));
            }

            // Update season
            item.update(Plugin.id, {
                keys: {
                    id: season.titleId
                },

                // Metadata
                number: season.number,

                // Retrieve year from season
                year: this._getYear(season.releaseOrFirstAiringDate),

                // Timestamps
                fetchedAt
            });

            return item;
        });
    }

    updateEpisode(id, item) {
        Log.debug('Fetching episode %dx%d for season "%s"', item.season.number, item.number, id);

        // Fetch episode metadata
        return Api.metadata.getSeasonEpisode(id, item.season.number, item.number).then((episode) => {
            if(IsNil(episode)) {
                return Promise.reject(new Error('Unable to fetch episode metadata'));
            }

            // Update episode
            item.update(Plugin.id, {
                keys: {
                    id: episode.titleId
                },

                // Metadata
                title: episode.title,
                number: episode.number
            });

            return item;
        });
    }

    _getYear(releaseOrFirstAiringDate) {
        try {
            return (new Date(releaseOrFirstAiringDate.valueDate / 1000)).getFullYear();
        } catch(e) {
            Log.warn('Unable to parse date: %o', releaseOrFirstAiringDate.valueDate);
            return null;
        }
    }

    _resolveYear(title) {
        let year = this._getYear(title.releaseOrFirstAiringDate);

        // Resolve show year from first season (if earlier)
        if(title.contentType === 'SERIES') {
            return Api.metadata.getShowSeason(title.titleId, 1).then((season) => {
                let seasonYear = this._getYear(season.releaseOrFirstAiringDate);

                if(!IsNil(year) && !IsNil(seasonYear)) {
                    return year < seasonYear ? year : seasonYear;
                }

                if(!IsNil(seasonYear)) {
                    return seasonYear;
                }

                return year;
            });
        }

        // Return title year
        return Promise.resolve(year);
    }
}

// Register service
Registry.registerService(new NetflixActivityService());
