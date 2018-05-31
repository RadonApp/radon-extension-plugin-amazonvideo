import Merge from 'lodash-es/merge';
import URI from 'urijs';

import {fetch} from 'neon-extension-framework/Core/Fetch';

import MetadataInterface from './Interfaces/Metadata';
import ShimApi from './Shim';


const BaseUrl = 'https://atv-ps.amazon.com';

export class Api {
    constructor() {
        // Construct interfaces
        this.metadata = new MetadataInterface(this);
    }

    request(method, path, options) {
        options = Merge({
            query: {}
        }, options || {});

        // Retrieve configuration
        return ShimApi.configuration().then((configuration) => {
            // Add configuration parameters
            options.query = Merge({}, configuration, options.query || {});

            // Build URL
            let url = new URI(BaseUrl + path)
                .search(options.query)
                .toString();

            // Send request
            return fetch(url, {
                method: method,
                credentials: 'include'
            });
        }).then((response) => {
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
}

export default new Api();
