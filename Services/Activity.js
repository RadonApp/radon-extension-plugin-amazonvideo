import Find from 'lodash-es/find';
import Get from 'lodash-es/get';
import IsNil from 'lodash-es/isNil';

import ActivityService, {ActivityEngine} from '@radon-extension/framework/Services/Source/Activity';
import Registry from '@radon-extension/framework/Core/Registry';
import {MediaTypes} from '@radon-extension/framework/Core/Enums';

import Api from '../Api';
import Log from '../Core/Logger';
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
            getMetadata: this.getMetadata.bind(this),
            fetchMetadata: this.fetchMetadata.bind(this),

            isEnabled: () => true
        });

        // Bind activity engine to player monitor
        this.engine.bind(this.player);

        // Inject shim
        ShimApi.inject().then((ready) => {
            if(!ready) {
                Log.warn('Unable to monitor player (no configuration found)');
                return;
            }

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

            // Update season
            episode.season.update(Plugin.id, {
                keys: {
                    id: metadata.titleId
                }
            });

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
        let showId = Get(item.season.show.keys, [Plugin.id, 'id']);

        if(IsNil(showId)) {
            return Promise.resolve(item);
        }

        // Update item `fetchedAt` timestamp
        item.update(Plugin.id, {
            fetchedAt: Date.now()
        });

        // Ignore movies
        if(item.type !== MediaTypes.Video.Episode) {
            return Promise.resolve(item);
        }

        // Update metadata
        return Promise.resolve()
            .then(() => this.updateEpisode(showId, item))
            .then(() => this.updateSeason(showId, item))
            .then(() => this.updateShow(showId, item));
    }

    updateEpisode(showId, episode) {
        let seasonId = Get(episode.season.keys, [Plugin.id, 'id']);

        if(IsNil(seasonId)) {
            return Promise.resolve();
        }

        Log.debug('Fetching episode %d of season "%s"', episode.number, seasonId);

        // Fetch episode metadata
        return Api.metadata.getSeasonEpisode(seasonId, episode.number).then((metadata) => {
            if(IsNil(metadata)) {
                return Promise.reject(new Error('Unable to fetch episode metadata'));
            }

            let year = this._getYear(metadata.releaseOrFirstAiringDate);

            // Update show
            if(episode.season.number === 1 && episode.number === 1) {
                episode.season.show.update(Plugin.id, { year });
            }

            // Update season
            if(episode.number === 1) {
                episode.season.update(Plugin.id, { year });
            }

            // Update episode
            episode.update(Plugin.id, {
                keys: {
                    id: metadata.titleId
                },

                // Metadata
                title: metadata.title,
                number: metadata.number,

                duration: metadata.runtime.valueMillis,

                // Timestamps
                fetchedAt: Date.now()
            });

            return true;
        });
    }

    updateSeason(showId, episode) {
        Log.debug('Fetching season %d of show "%s"', episode.season.number, showId);

        let seasonId;

        // Fetch season metadata
        return Api.metadata.getShowSeason(showId, episode.season.number).then((metadata) => {
            if(IsNil(metadata)) {
                return Promise.reject(new Error('Unable to fetch season metadata'));
            }

            // Retrieve season identifier
            seasonId = metadata.titleId;

            // Update season
            episode.season.update(Plugin.id, {
                keys: {
                    id: seasonId
                },

                // Metadata
                number: metadata.number,

                // Timestamps
                fetchedAt: Date.now()
            });

            return true;
        }).then(() => {
            if(!IsNil(episode.season.year)) {
                return Promise.resolve();
            }

            Log.debug('Fetching episode 1 of season "%s"', seasonId);

            // Fetch first episode in season
            return Api.metadata.getSeasonEpisode(seasonId, 1).then((metadata) => {
                // Update season
                episode.season.update(Plugin.id, {
                    year: this._getYear(metadata.releaseOrFirstAiringDate)
                });
            }, (err) => {
                Log.info(
                    'Unable to fetch episode 1 of season "%s": %s',
                    seasonId, (err && err.message) ? err.message : err
                );
            });
        }).then(() => {
            if(!IsNil(episode.season.show.year)) {
                return Promise.resolve();
            }

            // Update show
            if(episode.season.number === 1) {
                episode.season.show.update(Plugin.id, { year: episode.season.year });
            }

            return true;
        });
    }

    updateShow(showId, episode) {
        Log.debug('Fetching show "%s"', showId);

        // Fetch show metadata
        return Api.metadata.getShow(showId).then((metadata) => {
            if(IsNil(metadata)) {
                return Promise.reject(new Error('Unable to fetch show metadata'));
            }

            // Update show
            episode.season.show.update(Plugin.id, {
                keys: {
                    id: showId
                },

                // Metadata
                title: metadata.title,

                // Timestamps
                fetchedAt: Date.now()
            });

            return true;
        }).then(() => {
            if(!IsNil(episode.season.show.year)) {
                return Promise.resolve();
            }

            Log.debug('Fetching episode 1x01 of show "%s"', showId);

            // Fetch first episode in season
            return Api.metadata.getShowEpisode(showId, 1, 1).then((metadata) => {
                // Update season
                episode.season.show.update(Plugin.id, {
                    year: this._getYear(metadata.releaseOrFirstAiringDate)
                });

                return true;
            }, (err) => {
                Log.info(
                    'Unable to fetch episode 1x01 of show "%s": %s',
                    showId, (err && err.message) ? err.message : err
                );
            });
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
}

// Register service
Registry.registerService(new AmazonVideoActivityService());
