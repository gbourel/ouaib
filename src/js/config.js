
export const config = {
  nsixLoginUrl: 'https://www.nsix.fr/login',
  lcmsUrl: 'https://lcms3.nsix.fr/api',
  cookieDomain: '.nsix.fr',
  log: () => {},

  debug: false,
  parcours: -1,
  exidx: -1,
  preview: false
};
const options = {
  debug: 'bool',
  parcours: 'int',
  exidx: 'int',
  preview: 'bool'
}

// Load parameters from url search infos
let search = window.location.search;
if(search && search.length > 0) {
  let vars = search.substring(1).split("&");
  for (let v of vars) {
    let pair = v.split("=");
    if(!(pair[0] in options)) {
      console.warn('Unknown option:', pair[0]);
      continue;
    }
    if (options[pair[0]] === 'bool') {
      config[pair[0]] = true;
    } else if (options[pair[0]] === 'int') {
      config[pair[0]] = parseInt(pair[1]);
    } else {
      config[pair[0]] = pair[1];
    }
  }
}

const host = window.location.host;
const dev = host.startsWith('localhost') || host.indexOf('nsix.test') >= 0;
if(dev) {
  config.nsixLoginUrl = 'http://nsix.test:5173/login'
  config.lcmsUrl = 'http://nsix.test:5000/api';
  config.cookieDomain = '.nsix.test';
}
if(dev || config.debug) {
  config.log = console.info;
}