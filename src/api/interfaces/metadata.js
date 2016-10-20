import {isDefined} from 'eon.extension.framework/core/helpers';

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

            console.warn(
                'Unable to find season %d in %o',
                seasonNumber,
                seasons
            );
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

            console.warn(
                'Unable to find episode %dx%d in %o',
                seasonNumber,
                episodeNumber,
                episodes
            );
            return null;
        });
    }

    resolve(id, identifier) {
        return this.get(id).then((items) => {
            if(!isDefined(items) || items.length !== 1) {
                return Promise.reject(new Error('Invalid response returned'));
            }

            let item = items[0];

            // Movie
            if(item.contentType === 'MOVIE') {
                return item;
            }

            // Season
            if(item.contentType === 'SEASON') {
                if(!isDefined(identifier) || !isDefined(identifier.episode)) {
                    return Promise.reject(new Error('Episode identifier is required'));
                }

                // Retrieve identifier parameters
                let seasonNumber = identifier.episode.season;
                let episodeNumber = identifier.episode.number;

                // Find ancestors
                let series = this._findAncestor(item, 'SERIES');

                // Find episode in `item.titleId`
                if(item.number === seasonNumber) {
                    return this.getSeasonEpisode(item.titleId, seasonNumber, episodeNumber);
                }

                // Find season in `series.titleId`
                return this.getShowSeason(series.titleId, seasonNumber).then((season) =>
                    // Find episode in `season.titleId`
                    this.getSeasonEpisode(season.titleId, seasonNumber, episodeNumber)
                );
            }

            // Episode
            if(item.contentType === 'EPISODE') {
                if(!isDefined(identifier) || !isDefined(identifier.episode)) {
                    return Promise.reject(new Error('Episode identifier is required'));
                }

                // Retrieve identifier parameters
                let seasonNumber = identifier.episode.season;
                let episodeNumber = identifier.episode.number;

                // Find ancestors
                let series = this._findAncestor(item, 'SERIES');
                let season = this._findAncestor(item, 'SEASON');

                // Return `item` (if it matches the identifier)
                if(season.number === seasonNumber && item.number === episodeNumber) {
                    return item;
                }

                // Find episode in `season.titleId`
                if(season.number === seasonNumber) {
                    return this.getSeasonEpisode(season.titleId, seasonNumber, episodeNumber);
                }

                // Find season in `series.titleId`
                return this.getShowSeason(series.titleId, seasonNumber).then((season) =>
                    // Find episode in `season.titleId`
                    this.getSeasonEpisode(season.titleId, seasonNumber, episodeNumber)
                );
            }

            return Promise.reject(new Error(
                'Unknown item content type: "' + item.contentType + '"'
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
