const { defineConfig } = require('@vue/cli-service');
const path = require('path');

module.exports = defineConfig({
  // Set publicPath to './' for CDN deployment
  // This ensures all assets are loaded relative to the HTML file
  publicPath: './',
  
  outputDir: 'dist',
  
  // Disable asset inlining to keep all files separate
  chainWebpack: config => {
    config.module
      .rule('images')
      .set('parser', {
        dataUrlCondition: {
          maxSize: 1 // Force all images to be separate files
        }
      });
  },
  
  pages: {
    sceneCollection: {
      entry: 'src/sceneCollection.js',
      template: 'public/sceneCollection.html',
      filename: 'sceneCollection.html',
      title: 'Scene Collection',
      chunks: ['chunk-vendors', 'chunk-common', 'sceneCollection']
    },
    settings: {
      entry: 'src/settings.js',
      template: 'public/settings.html',
      filename: 'settings.html',
      title: 'Settings',
      chunks: ['chunk-vendors', 'chunk-common', 'settings']
    }
  },
  
  productionSourceMap: false
});
