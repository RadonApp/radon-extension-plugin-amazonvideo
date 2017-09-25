import {MovieIdentifier, EpisodeIdentifier} from 'neon-extension-framework/models/video';
import {isDefined} from 'neon-extension-framework/core/helpers';

import Log from 'neon-extension-source-amazonvideo/core/logger';
import Interface from './base';


export default class MetadataInterface extends Interface {
    get(ids) {
        return this._client
            .request('POST', '/cdp/catalog/GetASINDetails', {
                query: {
                    'asinlist': ids,
                    'IncludeAll': 'T',
                    'version': 2
                }
            })
            .then((data) => {
                return data.message.body.titles;
            });
    }

    getShowSeasons(showIds) {
        return this._client
            .request('POST', '/cdp/catalog/GetASINDetails', {
                query: {
                    'SeriesASIN': showIds,
                    'ContentType': 'TVSeason',
                    'playbackInformationRequired': false,
                    'version': 2
                }
            })
            .then((data) => {
                return data.message.body.titles;
            });
    }

    getShowSeason(showId, seasonNumber) {
        return this.getShowSeasons(showId).then((seasons) => {
            for(let i = 0; i < seasons.length; ++i) {
                let season = seasons[i];

                if(season.number !== seasonNumber) {
                    continue;
                }

                return season;
            }

            Log.warn('Unable to find season %d in %o', seasonNumber, seasons);
            return null;
        });
    }

    getSeasonEpisodes(seasonIds) {
        return this._client
            .request('POST', '/cdp/catalog/GetASINDetails', {
                query: {
                    'SeasonASIN': seasonIds,
                    'IncludeAll': 'T',
                    'NumberOfResults': 400,
                    'playbackInformationRequired': true,
                    'version': 2
                }
            })
            .then((data) => {
                return data.message.body.titles;
            });
    }

    getSeasonEpisode(seasonId, seasonNumber, episodeNumber) {
        return this.getSeasonEpisodes(seasonId).then((episodes) => {
            for(let i = 0; i < episodes.length; ++i) {
                let episode = episodes[i];
                let season = episode.ancestorTitles[1];  // TODO Match ancestors by "contentType"

                if(season.number !== seasonNumber) {
                    continue;
                }

                if(episode.number !== episodeNumber) {
                    continue;
                }

                return episode;
            }

            Log.warn('Unable to find episode %dx%d in %o', seasonNumber, episodeNumber, episodes);
            return null;
        });
    }

    resolve(identifier) {
        return this.get(identifier.key).then((items) => {
            if(!isDefined(items) || items.length !== 1) {
                return Promise.reject(new Error('Invalid response returned'));
            }

            let item = items[0];

            // Movie
            if(identifier instanceof MovieIdentifier && item.contentType === 'MOVIE') {
                return item;
            }

            // Episode identifier
            if(identifier instanceof EpisodeIdentifier) {
                // Process season metadata
                if(item.contentType === 'SEASON') {
                    let series = this._findAncestor(item, 'SERIES');

                    // Find episode in `item.titleId`
                    if(item.number === identifier.number) {
                        return this.getSeasonEpisode(item.titleId, identifier.season.number, identifier.number);
                    }

                    // Find season in `series.titleId`
                    return this.getShowSeason(series.titleId, identifier.season.number).then((season) =>
                        // Find episode in `season.titleId`
                        this.getSeasonEpisode(season.titleId, identifier.season.number, identifier.number)
                    );
                }

                // Process episode metadata
                if(item.contentType === 'EPISODE') {
                    let series = this._findAncestor(item, 'SERIES');
                    let season = this._findAncestor(item, 'SEASON');

                    // Return `item` (if it matches the identifier)
                    if(season.number === identifier.season.number && item.number === identifier.number) {
                        return item;
                    }

                    // Find episode in `season.titleId`
                    if(season.number === identifier.season.number) {
                        return this.getSeasonEpisode(season.titleId, identifier.season.number, identifier.number);
                    }

                    // Find season in `series.titleId`
                    return this.getShowSeason(series.titleId, identifier.season.number).then((season) =>
                        // Find episode in `season.titleId`
                        this.getSeasonEpisode(season.titleId, identifier.season.number, identifier.number)
                    );
                }
            }

            return Promise.reject(new Error(
                'Unsupported content type: "' + item.contentType + '"'
            ));
        });
    }

    _findAncestor(item, contentType) {
        for(let i = 0; i < item.ancestorTitles.length; ++i) {
            let ancestor = item.ancestorTitles[i];

            if(ancestor.contentType === contentType) {
                return ancestor;
            }
        }

        return null;
    }
}
