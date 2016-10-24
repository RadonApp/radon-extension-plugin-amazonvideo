import {isDefined} from 'eon.extension.framework/core/helpers';

import merge from 'lodash-es/merge';
import URI from 'urijs';

import ShimApi from 'eon.extension.source.amazonvideo/core/shim';
import MetadataInterface from './interfaces/metadata';


const BaseUrl = 'https://atv-ps.amazon.com';

export class Api {
    constructor() {
        // Construct interfaces
        this.metadata = new MetadataInterface(this);
    }

    request(method, path, options) {
        options = merge({
            query: {}
        }, options || {});

        // Retrieve configuration
        return this._getConfiguration()
            .then((configuration) => {
                // Add configuration parameters
                options.query = merge({}, configuration, options.query || {});

                // Build URL
                let url = new URI(BaseUrl + path)
                    .search(options.query)
                    .toString();

                // Send request
                return fetch(url, {
                    method: method
                });
            })
            .then((response) => {
                if(!response.ok) {
                    return Promise.reject(new Error('Request failed'));
                }

                // TODO Verify content-type
                return response.json();
            });
    }

    // region Methods

    getPlaybackResources(id) {
        return this.request('POST', '/cdp/catalog/GetPlaybackResources', {
            query: {
                'asin': id,
                'consumptionType': 'Streaming',
                'desiredResources': 'CatalogMetadata',
                'resourceUsage': 'CacheResources',
                'videoMaterialType': 'Feature',
                'titleDecorationScheme': 'primary-content'
            }
        });
    }

    // endregion

    // region Private methods

    _getConfiguration() {
        if(isDefined(this._configuration)) {
            return Promise.resolve(this._configuration);
        }

        return ShimApi.request('configuration').then((configuration) => {
            this._configuration = configuration;

            return configuration;
        });
    }

    // endregion
}

export default new Api();
