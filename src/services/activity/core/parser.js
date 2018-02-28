import {Movie, Show, Season, Episode} from 'neon-extension-framework/models/item/video';

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
            Log.warn('Unable to parse release date: %o', movieInfo.releaseOrFirstAiringDate.valueDate);
        }

        // Construct movie
        return Movie.create(Plugin.id, {
            keys: Parser._createKeys({
                id: movieInfo.titleId
            }),

            // Metadata
            title: movieInfo.title,
            year: year,
            duration: movieInfo.runtime.valueMillis
        });
    }

    static parseEpisode(episodeInfo) {
        let showInfo = Parser._findAncestor(episodeInfo, 'SERIES');
        let seasonInfo = Parser._findAncestor(episodeInfo, 'SEASON');

        // Construct show
        let show = Show.create(Plugin.id, {
            keys: Parser._createKeys({
                id: showInfo.titleId
            }),

            // Metadata
            title: showInfo.title
            // TODO year?
        });

        // Construct season
        let season = Season.create(Plugin.id, {
            keys: Parser._createKeys({
                id: seasonInfo.titleId
            }),

            // Metadata
            title: seasonInfo.title,
            number: seasonInfo.number,

            // Children
            show
        });

        // Construct episode
        return Episode.create(Plugin.id, {
            keys: Parser._createKeys({
                id: episodeInfo.titleId
            }),

            // Metadata
            title: episodeInfo.title,
            number: episodeInfo.number,
            duration: episodeInfo.runtime.valueMillis,

            // Children
            show,
            season
        });
    }

    // endregion

    // region Private Methods

    static _createKeys(keys) {
        // TODO Add `keys` with country suffixes
        return keys;
    }

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
