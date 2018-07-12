/* eslint-disable no-console */
import FetchJsonp from 'fetch-jsonp';
import IsNil from 'lodash-es/isNil';

import {generateRandomString} from '@radon-extension/framework/Utilities/Value';

import Resource from './Base';


export default class ConfigurationResource extends Resource {
    constructor(shim) {
        super(shim);

        this._token = null;

        // Bind to requests
        this.requests.on('configuration', this.request.bind(this));

        // Emit "configuration" event
        this.request();
    }

    request() {
        // Retrieve player token
        this._getToken().then((token) => {
            // Retrieve player configuration
            let playerConfig = this._getPlayerConfiguration();

            if(IsNil(playerConfig)) {
                return Promise.reject(new Error('Unable to find player configuration'));
            }

            // Retrieve device identifier
            let deviceId = localStorage['atvwebplayer_deviceid'];

            if(IsNil(deviceId)) {
                return Promise.reject(new Error('Unable to find device identifier'));
            }

            // Emit "configuration" event
            this.emit('configuration', {
                deviceID: deviceId,
                deviceTypeID: 'AOAGZA014O5RE',  // HTML5 Device
                firmware: 1,

                marketplaceID: playerConfig.marketplaceId,
                customerID: playerConfig.customerId,
                token: token
            });

            // Resolve promise
            return true;
        }).catch((err) => {
            console.warn((err && err.message) ? err.message : err);

            // Emit "configuration" event
            this.emit('configuration', null);
        });
    }

    _getToken() {
        if(!IsNil(this._token)) {
            return Promise.resolve(this._token);
        }

        // Request token
        return FetchJsonp('https://www.amazon.com/gp/video/streaming/player-token.json', {
            jsonpCallbackFunction: 'onWebToken_' + generateRandomString(32, '0123456789abcdefghijklmnopqrstuvwxyz')
        }).then((response) => {
            if(!response.ok) {
                return Promise.reject(new Error('Unable to request player token'));
            }

            // Parse response
            return response.json().then((data) => {
                if(IsNil(data.token)) {
                    return Promise.reject(new Error('Invalid player token'));
                }

                // Cache token
                this._token = data.token;

                // Resolve promise with token
                return data.token;
            });
        });
    }

    _getPlayerConfiguration() {
        // Retrieve player node
        let player = document.querySelector('#av-wconf-dv-web-player-cfg');

        if(IsNil(player)) {
            return null;
        }

        // Retrieve configuration attribute
        let value = player.innerText;

        if(IsNil(value)) {
            return null;
        }

        // Parse configuration json
        return JSON.parse(value);
    }
}
