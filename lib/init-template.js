const exec = require('child_process').exec;
const path = require('path');

const brunch = require('brunch');
const chalk = require('chalk');
const clipboardy = require('clipboardy');
const fs = require('fs-extra');
const ghauth = require('ghauth');
const GitHubApi = require('github');
const install = require('deps-install');
const logger = require('loggy');
const opn = require('opn');

const cleanURL = require('./clean-url.js');
const printBanner = require('./print-banner.js');

const defaultCommandName = 'aframe new';
const defaultProjectName = 'aframe-scene';
const defaultGitHubRepoName = 'aframe-scene';
const defaultTemplateAlias = 'aframe-default-template';
const defaultTemplateUrl = `aframevr-userland/${defaultTemplateAlias}`;

const postInstall = (templateAlias, rootPath, options, silent) => {
  if (typeof silent === 'undefined') {
    silent = 'silent' in options;
  }

  if (!options.git && !options.github) {
    return Promise.resolve(false);
  }

  let github;
  if (options.github) {
    github = new GitHubApi({
      debug: options.debug
    });
  }

  const cwd = process.cwd();

  if (cwd !== rootPath) {
    process.chdir(rootPath);
  }

  const projectName = options.name || path.basename(rootPath);

  const openProjectDir = projectDir => {
    if (options['no-open']) {
      return false;
    }

    const projectPath = projectDir || rootPath;

    clipboardy.writeSync(projectPath);

    process.chdir(projectPath);
  };

  const ghLoadProjectPage = (ghPath, timeout) => new Promise((resolve, reject) => {
    const ghUrl = `https://github.com/${ghPath}`;

    clipboardy.writeSync(ghUrl);

    if (options['no-github-open']) {
      return Promise.resolve(false);
    }

    setTimeout(() => {
      opn(ghUrl, {wait: false})
      .then(resolve)
      .catch(reject);
    }, timeout || 500);
  });

  const pkgJsonPath = path.join(rootPath, 'package.json');

  const rewritePkgJson = pkgObj => new Promise((resolve, reject) => {
    logger.info('rewritePkgJson', pkgObj);

    // Rewrite the `package.json` file for the newly created project.
    if (!pkgObj.aframe) {
      pkgObj.aframe = {};
    }
    if (!pkgObj.aframe.basedOn) {
      pkgObj.aframe.basedOn = {};
    }
    pkgObj.aframe.projectName = projectName;
    pkgObj.aframe.basedOn[pkgObj.name] = pkgObj.version;
    pkgObj.aframe.keywords = (pkgObj.aframe.keywords || []).concat([
      projectName,
      'aframe',
      'aframe-scene',
      pkgObj.name,
      'webvr',
      'vr',
    ]);

    pkgObj.name = projectName;
    pkgObj.version = '0.0.0';
    pkgObj.private = true;

    console.log(pkgJsonPath, pkgObj);

    return fs.writeJson(pkgJsonPath, pkgObj).then(() => {
      return Promise.resolve(pkgObj);
    });
  });

  const createGitRepo = pkgObj => {
    if (options['no-git-commit']) {
      return false;
    }

    return new Promise((resolve, reject) => {
      exec(`git commit -am "🎈 Initial commit"`, (err, stdout, stderr) => {
        if (err) {
          if (!silent) {
            logger.error(`Error creating initial commit for local Git repo for "${rootPath}": ${err}`);
          }

          reject(err);
          return;
        }

        resolve(pkgObj);
      });
    }).then(ghPath => {
      logger.log(`Created initial commit for local Git repo for "${projectName}": ${rootPath}`);

      openProjectDir(rootPath);

      return Promise.resolve(pkgObj);
    });
  };

  const createGitHubRepo = pkgObj => {
    return new Promise((resolve, reject) => {
      let ghOwner;
      let ghOrg;
      let ghRepo = projectName;
      let ghPath;
      let ghDescription = pkgObj.description;

      if (typeof options.github === 'string') {
        const ghChunks = options.github.trim().split('/');
        if (ghChunks.length < 2) {
          ghRepo = options.github;
        } else {
          ghOrg = ghChunks[0];
          ghRepo = ghChunks[1];
        }
      } else if (ghRepo && ghRepo.startsWith('aframe-') && ghRepo.endsWith('-template')) {
        ghRepo = ghRepo.replace(/-template$/, '-scene');
      }

      const ghCreatedRepo = (err, res) => {
        if (err) {
          if (!err.message || err.message[0] !== '{') {
            throw err;  // This is not a JSON response.
          }

          err = JSON.parse(err.message);

          if (err.errors && err.errors[0]) {
            if (err.errors[0].resource === 'Repository' &&
                err.errors[0].field === 'name' &&
                err.errors[0].message.match(/name already exists/i)) {
              logger.warn(`Skipped creating already-existent GitHub repo "${ghPath}"`);
              ghLoadProjectPage(ghPath);
            } else {
              if (!silent) {
                logger.error(`Error creating GitHub repo "${ghPath}": ${err.errors[0].message}`);
              }
            }
          }

          reject(err);
          return;
        }

        if (!silent) {
          logger.log(`Created GitHub repo: "${ghPath}"`);
        }

        resolve(ghPath);
      };

      ghauth({
        configName: 'create-repository',
        scopes: [
          'repo'
        ]
      }, (err, auth) => {
        if (err) {
          if (!silent) {
            logger.error(`Error authenticating with GitHub to create repo "${ghPath}": ${err}`);
          }

          reject(err);
          return;
        }

        github.authenticate({
          type: 'oauth',
          token: auth.token
        });

        ghOwner = ghOrg || auth.user;
        ghPath = `${ghOwner}/${ghRepo}`;

        pkgObj.github.owner = ghOwner;
        pkgObj.github.repo = ghRepo;
        pkgObj.github.path = ghPath;

        if (ghOrg) {
          github.repos.createForOrg({
            org: ghOrg,
            name: ghRepo,
            description: ghDescription
          }, ghCreatedRepo);
        } else {
          github.repos.create({
            name: ghRepo,
            description: ghDescription
          }, ghCreatedRepo);
        }
      });
    }).then(ghPath => new Promise((resolve, reject) => {
      logger.log(`Created local Git repo for "${projectName}": ${rootPath}`);

      exec('git remote', (err, stdout, stderr) => {
        if (err) {
          if (!silent) {
            logger.error(`Error getting the remote repo URL for GitHub repo "${ghPath}": ${err}`);
          }

          reject(err);
          return;
        }

        if (stdout.indexOf('origin') > -1) {
          // Don't set the remote URL for `origin` if one is already set.
          resolve(ghPath);
          return;
        }

        exec(`git remote add origin git@github.com:${ghPath}.git`, (err, stdout, stderr) => {
          if (err) {
            if (!silent) {
              logger.error(`Error setting the remote repo URL for GitHub repo "${ghPath}": ${err}`);
            }

            reject(err);
            return;
          }

          resolve(ghPath);
        });
      });
    })).then(ghPath => {
      logger.log(`Finished creating GitHub repo: ${chalk.bold.green.underline(`https://github.com/${ghPath}`)}`);

      openProjectDir(rootPath);

      ghLoadProjectPage(ghPath);
    });
  };

  return new Promise((resolve, reject) => {
    exec('git init .', (err, stdout, stderr) => {
      if (err) {
        if (!silent) {
          logger.error(`Unexpected error: ${err}`);
        }

        reject(err);
        return;
      }

      if (stderr) {
        if (!silent) {
          logger.error(`Error: ${stderr}`);
        }

        reject(stderr);
        return;
      }

      if (!silent && stdout) {
        // logger.info(`Output: ${stdout}`);
      }

      resolve(stdout);
    });
  }).then(() => {
    logger.log(`Created local Git repo for "${projectName}": ${rootPath}`);
    return fs.readJson(pkgJsonPath);
  }).then(
    pkgObj => rewritePkgJson
  ).then(pkgObj => new Promise((resolve, reject) => {
    logger.log(`Rewrote "package.json" for "${projectName}": ${projectName}`);
    return Promise.resolve(pkgObj);
  }).then(pkgObj => {
    if (options.github) {
      return createGitRepo(pkgObj).then(createGitHubRepo(pkgObj));
    } else if (options.git) {
      return createGitRepo(pkgObj);
    } else {
      return Promise.resolve(pkgObj);
    }
  })).then(result => {
    return Promise.resolve(result);
  });
};

const initTemplate = (templateAlias, options) => {
  options = options || {};

  const cwd = process.cwd();

  const rootPath = path.resolve(options.rootPath || cwd).trim();
  const commandName = options.commandName || defaultCommandName;

  if (!templateAlias || typeof templateAlias !== 'string' ||
      templateAlias.charAt(0) === '.' && rootPath === cwd) {
    return printBannerAndExit(commandName);
  }

  const copyTemplateDir = () => {
    logger.log(`Using template "${templateAlias}" …`);

    const filter = filepath => !/^\.(git|hg|svn)$/.test(path.basename(filepath));
    logger.log(`Copying local template to "${rootPath}" …`);

    // TODO: Perhaps have `rootPath` default to `my-aframe-project` (or `defaultProjectName`).
    return fs.copy(templateDir, rootPath, {errorOnExist: true, filter}).then(() => {
      const pkgType = ['package', 'bower'];
      try {
        install({
          rootPath,
          pkgType,
          logger
        });
      } catch (err) {
        throw err;
      }
      return postInstall(templateAlias, rootPath, options);
    });
  };

  let templateDir = path.join(__dirname, '..', 'templates', templateAlias);

  if (fs.existsSync(templateDir)) {
    return copyTemplateDir();
  }

  templateAlias = `aframe-${templateAlias}-template`;
  templateDir = path.join(__dirname, '..', 'templates', templateAlias);

  if (fs.existsSync(templateDir)) {
    return copyTemplateDir();
  }

  if (templateAlias.indexOf('/') === -1 && templateAlias.startsWith('aframe-')) {
    templateAlias = 'aframevr-userland/' + templateAlias;
  }

  const initSkeleton = require('init-skeleton').init;

  logger.log(`Using template "${templateAlias}" …`);

  return initSkeleton(templateAlias, {
    logger,
    rootPath,
    commandName
  }).then(() => {
    return postInstall(templateAlias, rootPath, options);
  });
};

exports.init = initTemplate;
exports.cleanURL = cleanURL;
exports.printBanner = commandName => {
  return printBanner(commandName).catch(err => {
    // console.log(err.message);
  });
};
