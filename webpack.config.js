const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const path = require('path');

module.exports = (env, argv) => {
  let config = {
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
      }),
    ],
    experiments: {
      asyncWebAssembly: true
    },
    devtool: "eval-source-map",
    devServer: {
      static: './static',
      port: 3000,
    },
  };

  if (argv.mode === 'production') {
    config.devtool = 'source-map';
    config.plugins.push(new CopyPlugin({
      patterns: [{
        from: path.resolve(__dirname, "static", "**/*"),
        to: "[name][ext]",
      }],
    }));
  }

  return config;
};