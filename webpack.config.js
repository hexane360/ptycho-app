const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

module.exports = {
  mode: "development",
  devtool: 'eval-source-map',
  entry: {
    index: './src/index.tsx',
  },
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
  },
  module: {
    rules: [
        {
            test: /\.tsx?$/i,
            use: 'ts-loader',
            include: [path.resolve(__dirname, 'src')],
        },
        {
            test: /\.css$/i,
            use: ['style-loader', 'css-loader'],
        },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js', '.tsx', '.jsx'],
  },
  plugins: [
    new HtmlWebpackPlugin({
        filename: 'index.html',
        template: 'index.html',
        favicon: './static/favicon.ico',
    }),
  ],
  experiments: {
    asyncWebAssembly: true
  },
  devServer: {
    static: './static',
    port: 3000,
  },
};