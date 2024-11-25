const path = require('path');
const Dotenv = require('dotenv-webpack');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';

module.exports = {
    mode,
    devtool: mode === 'production' ? 'source-map' : 'cheap-source-map',
    entry: {
        background: './src/background/background.js',
        content: './src/content/content.js',
        popup: './src/popup/popup.js',
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: mode === 'production' ? '[name].[contenthash].js' : '[name].js',
    },
    plugins: [
        new Dotenv({
            systemvars: true,
        }),
        new CopyPlugin({
            patterns: [
                {
                    from: 'manifest.json',
                    to: 'manifest.json',
                },
                {
                    from: 'icons/*',
                    to: 'icons/[name][ext]',
                },
            ],
        }),
        new HtmlWebpackPlugin({
            template: './src/popup/popup.html',
            filename: 'popup.html',
            chunks: ['popup'],
        }),
    ],
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env'],
                    },
                },
            },
            {
                test: /\.html$/,
                use: ['html-loader'],
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader'],
            },
        ],
    },
    optimization: {
        splitChunks: {
            cacheGroups: {
                background: {
                    name: 'background',
                    test: /[\\/]src[\\/]background[\\/]/,
                    chunks: 'initial',
                    priority: 10,
                },
                popup: {
                    name: 'popup',
                    test: /[\\/]src[\\/]popup[\\/]/,
                    chunks: 'initial',
                    priority: 10,
                },
            },
        },
    },
};
