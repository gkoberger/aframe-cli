const path = require('path');

const brunch = require('brunch');
const logger = require('loggy');

const utils = require('./utils.js');

const getBrunchConfigPath = utils.getBrunchConfigPath;
const inject = utils.inject;

const build = (filePath, options) => {
  return new Promise((resolve, reject) => {
    filePath = filePath || process.cwd();
    options = options || {};
    options.config = options.config || getBrunchConfigPath(filePath, options);

    let builtPath = null;
    try {
      builtPath = require(options.config).paths.public;
    } catch (err) {
      throw err;
    }

    logger.log(`Building project "${filePath}" to "${builtPath}"…`);

    try {
      brunch.build(options, () => {
        resolve(builtPath);
      });
    } catch (err) {
      logger.error(`Could not build project "${filePath}" …`);
      reject(err);
    }
  }).then(builtPath => {
    if (builtPath) {
      logger.log(`Built project "${filePath}" to "${builtPath}"`);
      return inject(builtPath);
    } else {
      logger.log(`Built project "${filePath}"`);
      return Promise.resolve(false);
    }
  }).catch(err => {
    logger.log(`Could not build "${filePath}" to "${builtPath}"`);
    throw err;
  });
};

exports.build = build;
