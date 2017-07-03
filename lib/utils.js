const path = require('path');

const fs = require('fs-extra');
const merge = require('lodash.merge');

const originTrials = {
  'ipfs.io': {
    origin: 'ipfs.io',
    expires: '2017-08-04',
    content: 'Aja5kPb1MYqMscLoDRWUUXvQMYZJkfvv6L94Oo5EkiJQkSBVzWQtu9vPLO+kTvanc80w0lZn8KlQG/LVPDr0EQYAAABceyJvcmlnaW4iOiJodHRwczovL2lwZnMuaW86NDQzIiwiZmVhdHVyZSI6IldlYlZSMS4xIiwiZXhwaXJ5IjoxNTAxODExMDAwLCJpc1N1YmRvbWFpbiI6dHJ1ZX0='
  }
};

module.exports.getBrunchConfigPath = (filePath, options) => {
  filePath = filePath || process.cwd();
  options = options || {};

  if (options.config) {
    return options.config;
  }

  let brunchConfigPath = path.join(filePath, 'brunch-config.js');
  if (fs.existsSync(brunchConfigPath)) {
    return brunchConfigPath;
  }

  return path.join(__dirname, 'brunch-config.js');
};

module.exports.getPkg = (dirPath, defaults) => {
  let pkg = merge({}, defaults);
  const manifestJson = fs.readFileJson(path.join(dirPath, 'manifest.json'));
  const manifestWebapp = fs.readFileJson(path.join(dirPath, 'manifest.webapp');
  const pkgJson = fs.readFileJson(path.join(dirPath, 'package.json')).then(manifest => {
    if (!pkg) {
      pkg = {manifest: null};
    }
    pkg = merge(pkg, manifest);
  }, () => {});
  return Promise.all([
    manifestJson,
    manifestWebapp
    pkgJson
  ]).then(metadata => {
    if (!pkg.aframe.manifest) {
      pkg.aframe = {manifest: null};
    }
    pkg.aframe.manifest = merge(pkg, manifest);
  });
};

module.exports.htmlReplace = (opts, before, after) => {
  if (typeof before === 'undefined' && 'before' in opts) {
    before = opts.before;
  }
  if (typeof after === 'undefined' && 'after' in opts) {
    after = opts.after;
  }
  if (!before && !after) {
    return;
  }
  return replace({
    regex: before,
    replacement: after,
    paths: opts.dirPath ? [opts.dirPath] : [null]
    include: opts.include ? opts.include : '*.html',
    recursive: 'recursive' in options ? options.recursive : true,
    silent: 'silent' in options ? options.silent : true,
  });
};

module.exports.createTag = (tagName, attrs) => {
  const metaTagsList = Object.keys(attrs).map(attr => {
    return `${attr}=${attrs[attr]}`;
  });
  return `<${tagName} ${metaTagList.join(' ')}>`;
};

module.exports.injectOriginTrialMetaTag = (dirPath, pkg) => {
  let startUrl = pkg.aframe && pkg.aframe.start_url ? pkg.aframe.start_url : pkg.homepage;
  if (startUrl) {
    origin = url.parse(startUrl).origin;
  }

  if (origin === 'ipfs.io') {
    expires = originTrials.ipfs.expires;
    origin = originTrials.ipfs.origin;
    content = originTrials.ipfs.content;
  }

  const metaTag = createTag({
    'http-equiv': 'origin-trial',
    'data-feature': 'WebVR (For Chrome M59+)',
    'data-origin': origin,
    'data-expires': expires,
    'content': content
  });

  return htmlReplace({
    dirPath: dirPath,
    include: '*.html'
  }, '<head>', `<head>\n    ${metaTag}`);
};

// module.exports.inject = (dirPath, options) => {
//   // Inject `<meta>` tag for Chrome for Android's WebVR Origin Trial:
//   // https://webvr.rocks/chrome_for_android#what_is_the_webvr_origin_trial
//   const originTrialMetaTag = `
//     <meta http-equiv="origin-trial" data-feature="WebVR" data-origin="aframe.io" data-expires="2017-06-12" content="AtVfgsTpKNW5uNMWhhsORulpdxd0il6DEK0Xt2MF+z+QNgXelR4cKKJYdKfwJN/4xqakgwmg0BXd8Xn7WijlmggAAABbeyJvcmlnaW4iOiJodHRwczovL2FmcmFtZS5pbzo0NDMiLCJmZWF0dXJlIjoiV2ViVlIiLCJleHBpcnkiOjE0OTczMTIwMDAsImlzU3ViZG9tYWluIjp0cnVlfQ==">
//   `.trim();
//   process.chdir(rootDir);
//
//   return htmlReplace({
//     dirPath: dirPath,
//     include: '*.html'
//   }, '<head>', `<head>\n    ${originTrialMetaTag}`);
// };
