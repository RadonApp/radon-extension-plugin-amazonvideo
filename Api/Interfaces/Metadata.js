import Interface from './Base';


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

    getShow(showId) {
        return this.get(showId).then((titles) => {
            return titles[0];
        });
    }

    getShowEpisode(showId, season, number) {
        return this.getShowSeason(showId, season).then((season) => {
            return this.getSeasonEpisode(season.titleId, number);
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

            return Promise.reject(new Error('Not Found'));
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

    getSeasonEpisode(seasonId, number) {
        return this.getSeasonEpisodes(seasonId).then((episodes) => {
            for(let i = 0; i < episodes.length; ++i) {
                let episode = episodes[i];

                if(episode.number !== number) {
                    continue;
                }

                return episode;
            }

            return Promise.reject(new Error('Not Found'));
        });
    }
}
