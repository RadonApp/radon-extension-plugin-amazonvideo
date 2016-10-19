import {isDefined} from 'eon.extension.framework/core/helpers';
import {Movie, Show, Season, Episode} from 'eon.extension.framework/models/metadata/video';

import Log from '../../../core/logger';
import Plugin from '../../../core/plugin';


export default class Parser {
    // region Public methods

    static parse(key, metadata) {
        let item = metadata.catalog;

        if(item.type === 'MOVIE') {
            return Parser.parseMovie(key, item);
        } else if(item.type === 'EPISODE') {
            return Parser.parseEpisode(key, item, metadata.family.tvAncestors);
        }

        Log.error('Unknown metadata type: %o', item.type);
        return null;
    }

    static parseMovie(key, movie) {
        return Parser._constructMovie(key, movie);
    }

    static parseEpisode(key, episode, ancestors) {
        let show, season;

        // Find season and show items
        ancestors.forEach((ancestor) => {
            if(!isDefined(ancestor) || !isDefined(ancestor.catalog)) {
                return;
            }

            let item = ancestor.catalog;

            if(item.type === 'SHOW') {
                show = item;
            } else if(item.type === 'SEASON') {
                season = item;
            }
        });

        // Construct episode
        return Parser._constructEpisode(
            key,
            episode,
            season,
            show
        );
    }

    // endregion

    // region Private methods

    static _constructMovie(key, movie) {
        return new Movie(
            Plugin,
            key,
            movie.title,
            null,
            movie.runtimeSeconds * 1000
        );
    }

    static _constructShow(show) {
        return new Show(
            Plugin,
            show.id,
            show.title
        );
    }

    static _constructSeason(season, show) {
        return new Season(
            Plugin,
            season.id,
            season.title,
            null,
            season.seasonNumber,

            Parser._constructShow(show)
        );
    }

    static _constructEpisode(key, episode, season, show) {
        return new Episode(
            Plugin,
            key,
            episode.title,
            episode.episodeNumber,
            episode.runtimeSeconds * 1000,

            Parser._constructShow(show),
            Parser._constructSeason(season, show)
        );
    }

    // endregion
}
