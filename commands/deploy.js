const ghPagesDeploy = require('../lib/deploy-github-pages.js').deploy;

module.exports = provider => {
  const providerToUse = require('../lib/utils').getDeployProvider(provider, 'github-pages');

  switch (providerToUse) {
    case 'github-pages':
      return ghPagesDeploy;
  }
};
