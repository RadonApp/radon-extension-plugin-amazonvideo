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
        if(item.type === MediaTypes.Video.Episode) {
            return this.getEpisodeMetadata(item);
        }

        if(item.type === MediaTypes.Video.Movie) {
            return this.getMovieMetadata(item);
        }

        return Promise.reject(new Error(`Unknown item type: ${item.type}`));
    }

    getEpisodeMetadata(episode) {
        // Retrieve season identifier
        let asin = Get(episode.season.keys, [Plugin.id, 'asin']);

        if(IsNil(asin)) {
            return Promise.resolve(episode);
        }

        Log.debug('Fetching season "%s"', asin);

        // Fetch item metadata
        return Api.metadata.get(asin).then((titles) => {
            let metadata = titles[0];

            if(IsNil(metadata)) {
                return Promise.reject(new Error('Unable to fetch season metadata'));
            }

            // Find series metadata
            let seriesMetadata = Find(metadata.ancestorTitles, (title) => title.contentType === 'SERIES');

            if(IsNil(seriesMetadata)) {
                return Promise.reject(new Error('Unable to fetch series metadata'));
            }

            // Update show
            episode.season.show.update(Plugin.id, {
                keys: {
                    id: seriesMetadata.titleId
                },

                // Metadata
                title: seriesMetadata.title
            });

            // Remove asin (shouldn't be stored)
            delete episode.season.keys[Plugin.id].asin;

            // Return episode
            return episode;
        });
    }

    getMovieMetadata(movie) {
        // Retrieve season identifier
        let asin = Get(movie.keys, [Plugin.id, 'asin']);

        if(IsNil(asin)) {
            return Promise.resolve(movie);
        }

        Log.debug('Fetching movie "%s"', asin);

        // Fetch movie metadata
        return Api.metadata.get(asin).then((titles) => {
            let metadata = titles[0];

            if(IsNil(metadata)) {
                return Promise.reject(new Error('Unable to fetch movie metadata'));
            }

            // Update movie
            movie.update(Plugin.id, {
                keys: {
                    id: metadata.titleId
                },

                // Metadata
                title: metadata.title,
                year: this._getYear(metadata.releaseOrFirstAiringDate),

                duration: metadata.runtime.valueMillis,

                // Timestamps
                fetchedAt: Date.now()
            });

            // Remove asin (shouldn't be stored)
            delete movie.keys[Plugin.id].asin;

            return movie;
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

    updateShow(id, show, fetchedAt) {
        Log.debug('Fetching show "%s"', id);

        // Fetch show metadata
        return Api.metadata.get(id).then((titles) => {
            let metadata = titles[0];

            if(IsNil(metadata)) {
                return Promise.reject(new Error('Unable to fetch show metadata'));
            }

            // Resolve year
            return this._resolveYear(metadata).then((year) => {
                // Update show
                show.update(Plugin.id, {
                    keys: {
                        id
                    },

                    // Metadata
                    title: metadata.title,
                    year,

                    // Timestamps
                    fetchedAt
                });

                return show;
            });
        });
    }

    updateSeason(id, season, fetchedAt) {
        Log.debug('Fetching season %d for show "%s"', season.number, id);

        // Fetch season metadata
        return Api.metadata.getShowSeason(id, season.number).then((metadata) => {
            if(IsNil(metadata)) {
                return Promise.reject(new Error('Unable to fetch season metadata'));
            }

            // Update season
            season.update(Plugin.id, {
                keys: {
                    id: metadata.titleId
                },

                // Metadata
                number: metadata.number,
                year: this._getYear(metadata.releaseOrFirstAiringDate),

                // Timestamps
                fetchedAt
            });

            return season;
        });
    }

    updateEpisode(id, episode) {
        Log.debug('Fetching episode %dx%d for season "%s"', episode.season.number, episode.number, id);

        // Fetch episode metadata
        return Api.metadata.getSeasonEpisode(id, episode.season.number, episode.number).then((metadata) => {
            if(IsNil(metadata)) {
                return Promise.reject(new Error('Unable to fetch episode metadata'));
            }

            // Update episode
            episode.update(Plugin.id, {
                keys: {
                    id: metadata.titleId
                },

                // Metadata
                title: metadata.title,
                number: metadata.number,

                duration: metadata.runtime.valueMillis
            });

            return episode;
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
Registry.registerService(new AmazonVideoActivityService());
