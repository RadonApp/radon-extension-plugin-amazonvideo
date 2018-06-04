var fs = require('fs');
var path = require('path');
var uuid = require('uuid');
var webpack = require('webpack');


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

            'karma.init.js',

            {pattern: '!(.phantomjs|Build|node_modules)/{**/,}*.js', watched: false}
        ],

        preprocessors: {
            '!(.phantomjs|Build|node_modules)/{**/,}*.js': ['webpack', 'sourcemap']
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

                        oneOf: [
                            { test: /\.Spec\.js$/, use: { loader: 'babel-loader' } },
                            { test: /\.js$/, use: { loader: 'babel-loader', options: { plugins: ['istanbul'] } } }
                        ]
                    },
                    {
                        test: /\.js$/,
                        include: [
                            fs.realpathSync(path.resolve(__dirname, 'node_modules/neon-extension-framework')),
                            fs.realpathSync(path.resolve(__dirname, 'node_modules/lodash-es')),
                            fs.realpathSync(path.resolve(__dirname, 'node_modules/wes'))
                        ],

                        use: {
                            loader: 'babel-loader'
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
                    'neon-extension-framework': fs.realpathSync(
                        path.resolve(__dirname, 'node_modules/neon-extension-framework')
                    ),

                    'neon-extension-core': fs.realpathSync(__dirname)
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
