import {generateRandomString, isDefined} from 'neon-extension-framework/core/helpers';

import fetchJsonp from 'fetch-jsonp';


export default class ConfigurationResource {
    static request() {
        // Retrieve player token
        return this._getToken().then((token) => {
            // Retrieve player configuration
            let playerConfig = this._getPlayerConfiguration();

            if(!isDefined(playerConfig)) {
                return Promise.reject(new Error(
                    'Unable to retrieve player configuration'
                ));
            }

            // Retrieve device identifier
            let deviceId = localStorage['atvwebplayer_deviceid'];

            if(!isDefined(deviceId)) {
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
        return fetchJsonp('https://www.amazon.com/gp/video/streaming/player-token.json', {
            jsonpCallbackFunction: 'onWebToken_' + generateRandomString(32, '0123456789abcdefghijklmnopqrstuvwxyz')
        }).then((response) => {
            if(!response.ok) {
                return Promise.reject(new Error(
                    'Unable to request player token'
                ));
            }

            return response.json().then((data) => {
                if(!isDefined(data.token)) {
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

        if(!isDefined(player)) {
            return null;
        }

        // Retrieve configuration attribute
        let value = player.attributes['data-config'].value;

        if(!isDefined(value)) {
            return null;
        }

        // Parse configuration json
        return JSON.parse(value);
    }
}
