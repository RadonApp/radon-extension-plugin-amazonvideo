import {Movie, Show, Season, Episode} from 'eon.extension.framework/models/video';

import Log from 'eon.extension.source.amazonvideo/core/logger';
import Plugin from 'eon.extension.source.amazonvideo/core/plugin';


export default class Parser {
    // region Public methods

    static parse(item) {
        if(item.contentType === 'MOVIE') {
            return Parser.parseMovie(item);
        }

        if(item.contentType === 'EPISODE') {
            return Parser.parseEpisode(item);
        }

        Log.error('Unknown metadata type: %o', item.contentType);
        return null;
    }

    static parseMovie(movieInfo) {
        // Retrieve year from release date
        let year = null;

        try {
            let releaseDate = new Date(movieInfo.releaseOrFirstAiringDate.valueDate / 1000);

            year = releaseDate.getFullYear();
        } catch(err) {
            Log.warn('Unable to parse release date: %o', movieInfo.releaseOrFirstAiringDate.valueDate);
        }

        // Construct movie
        return Movie.create(Plugin, movieInfo.titleId, {
            title: movieInfo.title,
            year: year,
            duration: movieInfo.runtime.valueMillis
        });
    }

    static parseEpisode(episodeInfo) {
        let showInfo = Parser._findAncestor(episodeInfo, 'SERIES');
        let seasonInfo = Parser._findAncestor(episodeInfo, 'SEASON');

        // Construct show
        let show = Show.create(Plugin, showInfo.titleId, {
            title: showInfo.title
        });

        // Construct season
        let season = Season.create(Plugin, seasonInfo.titleId, {
            title: seasonInfo.title,
            number: seasonInfo.number,

            show: show
        });

        // Construct episode
        return Episode.create(Plugin, episodeInfo.titleId, {
            title: episodeInfo.title,
            number: episodeInfo.number,
            duration: episodeInfo.runtime.valueMillis,

            show: show,
            season: season
        });
    }

    // endregion

    // region Private methods

    static _findAncestor(item, contentType) {
        for(let i = 0; i < item.ancestorTitles.length; ++i) {
            let ancestor = item.ancestorTitles[i];

            if(ancestor.contentType === contentType) {
                return ancestor;
            }
        }

        return null;
    }

    // endregion
}
