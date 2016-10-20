import {Movie, Show, Season, Episode} from 'eon.extension.framework/models/metadata/video';

import Log from '../../../core/logger';
import Plugin from '../../../core/plugin';


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
            console.warn('Unable to parse release date: %o', movieInfo.releaseOrFirstAiringDate.valueDate);
        }

        // Construct movie
        return new Movie(
            Plugin,
            movieInfo.titleId,
            movieInfo.title,
            year,
            movieInfo.runtime.valueMillis
        );
    }

    static parseEpisode(episodeInfo) {
        let showInfo = Parser._findAncestor(episodeInfo, 'SERIES');
        let seasonInfo = Parser._findAncestor(episodeInfo, 'SEASON');

        // Construct show
        let show = new Show(
            Plugin,
            showInfo.titleId,
            showInfo.title
        );

        // Construct season
        let season = new Season(
            Plugin,
            seasonInfo.titleId,
            seasonInfo.title,
            null,
            seasonInfo.number,

            show
        );

        // Construct episode
        return new Episode(
            Plugin,
            episodeInfo.titleId,
            episodeInfo.title,
            episodeInfo.number,
            episodeInfo.runtime.valueMillis,

            show,
            season
        );
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
