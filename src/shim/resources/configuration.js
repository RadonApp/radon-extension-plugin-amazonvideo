import FetchJsonp from 'fetch-jsonp';
import IsNil from 'lodash-es/isNil';

import {generateRandomString} from 'neon-extension-framework/core/helpers';


export default class ConfigurationResource {
    static request() {
        // Retrieve player token
        return this._getToken().then((token) => {
            // Retrieve player configuration
            let playerConfig = this._getPlayerConfiguration();

            if(IsNil(playerConfig)) {
                return Promise.reject(new Error(
                    'Unable to retrieve player configuration'
                ));
            }

            // Retrieve device identifier
            let deviceId = localStorage['atvwebplayer_deviceid'];

            if(IsNil(deviceId)) {
                return Promise.reject(new Error(
                    'Unable to retrieve device identifier'
                ));
            }

            // Return response
            return {
                deviceID: deviceId,
                deviceTypeID: 'AOAGZA014O5RE',  // HTML5 Device
                firmware: 1,

                marketplaceID: playerConfig.marketplaceId,
                customerID: playerConfig.customerId,
                token: token
            };
        });
    }

    static _getToken() {
        return FetchJsonp('https://www.amazon.com/gp/video/streaming/player-token.json', {
            jsonpCallbackFunction: 'onWebToken_' + generateRandomString(32, '0123456789abcdefghijklmnopqrstuvwxyz')
        }).then((response) => {
            if(!response.ok) {
                return Promise.reject(new Error(
                    'Unable to request player token'
                ));
            }

            return response.json().then((data) => {
                if(IsNil(data.token)) {
                    return Promise.reject(new Error(
                        'Unable to request player token'
                    ));
                }

                return data.token;
            });
        });
    }

    static _getPlayerConfiguration() {
        // Retrieve player node
        let player = document.querySelector('#dv-web-player');

        if(IsNil(player)) {
            return null;
        }

        // Retrieve configuration attribute
        let value = player.attributes['data-config'].value;

        if(IsNil(value)) {
            return null;
        }

        // Parse configuration json
        return JSON.parse(value);
    }
}
