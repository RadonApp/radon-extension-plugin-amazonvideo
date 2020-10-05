var fs = require('fs');
var path = require('path');
var uuid = require('uuid');
var webpack = require('webpack');


let libraries = [
    fs.realpathSync(path.resolve(__dirname, 'node_modules/@radon-extension/framework')),
    fs.realpathSync(path.resolve(__dirname, 'node_modules/lodash-es')),
    fs.realpathSync(path.resolve(__dirname, 'node_modules/wes'))
];

module.exports = function(config) {
    var phantomStoragePath = path.resolve('.phantomjs/' + uuid.v4());

    config.set({
        basePath: './',
        frameworks: ['jasmine'],

        browserNoActivityTimeout: 100 * 1000,
        failOnEmptyTestSuite: false,

        files: [
            'node_modules/@babel/polyfill/dist/polyfill.js',
            'node_modules/jasmine-promises/dist/jasmine-promises.js',
            'node_modules/whatwg-fetch/fetch.js',

            './karma.init.js'
        ],

        preprocessors: {
            './karma.init.js': ['webpack', 'sourcemap']
        },

        reporters: [
            'progress',

            'coverage',
            'html'
        ],

        coverageReporter: {
            dir: 'Build/Coverage',

            reporters: [
                { type: 'html', subdir: '.', includeAllSources: true },
                { type: 'json', subdir: '.', includeAllSources: true },
                { type: 'lcovonly', subdir: '.', includeAllSources: true }
            ]
        },

        htmlReporter: {
            outputDir: 'Build/Tests',

            focusOnFailures: true,
            preserveDescribeNesting: true
        },

        customLaunchers: {
            'PhantomJS_D2': {
                base: 'PhantomJS',

                flags: [
                    '--local-storage-path=' + phantomStoragePath,
                    '--local-storage-quota=32768',

                    '--offline-storage-path=' + phantomStoragePath,
                    '--offline-storage-quota=32768'
                ],

                options: {
                    settings: {
                        userAgent: (
                            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
                            'Chrome/66.0.3359.181 ' +
                            'Safari/537.36 ' +
                            'PhantomJS'
                        ),
                        webSecurityEnabled: false
                    }
                }
            }
        },

        webpack: {
            devtool: 'inline-source-map',

            module: {
                rules: [
                    {
                        test: /\.js$/,
                        include: path.resolve('./'),
                        exclude: libraries,

                        oneOf: [
                            { test: /\.Spec\.js$/, use: { loader: 'babel-loader' } },
                            { test: /\.js$/, use: { loader: 'babel-loader', options: { plugins: ['istanbul'] } } }
                        ]
                    },
                    {
                        test: /\.js$/,
                        include: libraries,

                        use: {
                            loader: 'babel-loader',
                            options: {
                                babelrc: true,
                                extends: path.join(`${__dirname}/.babelrc`),
                                cacheDirectory: true
                            }
                        }
                    },
                    {
                        test: /\.s?css$/,
                        use: ['file-loader']
                    }
                ]
            },

            resolve: {
                alias: {
                    '@radon-extension/framework': fs.realpathSync(
                        path.resolve(__dirname, 'node_modules/@radon-extension/framework')
                    ),

                    '@radon-extension/core': fs.realpathSync(__dirname),

                    // Dependencies
                    'lodash-amd': 'lodash-es'
                },

                modules: [
                    fs.realpathSync(path.resolve(__dirname, 'node_modules')),
                    'node_modules'
                ]
            },

            plugins: [
                new webpack.DefinePlugin({
                    'neon.browser': '{}',
                    'neon.manifests': '{}',

                    'process.env': {
                        'NODE_ENV': '"development"',
                        'TEST': 'true'
                    }
                })
            ]
        },

        webpackMiddleware: {
            noInfo: true,
            stats: 'errors-only'
        }
    });
};
