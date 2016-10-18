import {isDefined} from 'eon.extension.framework/core/helpers';

import merge from 'lodash-es/merge';
import URI from 'urijs';

import ShimApi from './shim';


class AmazonVideoMetadataApi {
    constructor() {
        this._configuration = null;
    }

    get(key) {
        // Retrieve player configuration
        return this._getConfiguration()
            .then((configuration) => {
                let parameters = merge({
                    asin: key,
                    consumptionType: 'Streaming',
                    desiredResources: 'CatalogMetadata',
                    resourceUsage: 'CacheResources',
                    videoMaterialType: 'Feature',
                    titleDecorationScheme: 'primary-content'
                }, configuration);

                // Build URL
                let url = new URI('https://atv-ps.amazon.com/cdp/catalog/GetPlaybackResources')
                    .search(parameters)
                    .toString();

                // Request metadata
                return fetch(url, {
                    method: 'POST'
                });
            })
            .then((response) => {
                if(!response.ok) {
                    return Promise.reject(new Error(
                        'Unable to retrieve metadata for item'
                    ));
                }

                return response.json();
            })
            .then((data) => {
                if(!isDefined(data) || !isDefined(data.catalogMetadata)) {
                    return Promise.reject(new Error(
                        'Invalid metadata returned for item'
                    ));
                }

                return data.catalogMetadata;
            });
    }

    _getConfiguration() {
        if(isDefined(this._configuration)) {
            return Promise.resolve(this._configuration);
        }

        return ShimApi.request('configuration').then((configuration) => {
            this._configuration = configuration;

            return configuration;
        });
    }
}

export default new AmazonVideoMetadataApi();
