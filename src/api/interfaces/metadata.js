import Log from '../../core/logger';
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
