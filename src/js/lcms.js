import { config } from './config.js';

export const lcms = {
  getAuthToken: () => {
    let token = null;
    if(document.cookie) {
      const name = 'neossot='
      let cookies = decodeURIComponent(document.cookie).split(';');
      for (let c of cookies) {
        if(token == null) {
          let idx = c.indexOf(name);
          if(idx > -1) {
            token = c.substring(name.length + idx);
          }
        }
      }
    }
    return token;
  },
  loadUser: (cb) => {
    let token = lcms.getAuthToken();
    if(token) {
      const meUrl = config.lcmsUrl + '/auth/userinfo';
      const req = new Request(meUrl);
      fetch(req, {
        'headers': {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }).then(res => {
        let json = null;
        if(res.status === 200) {
          json = res.json();
        }
        return json;
      }).then(data => {
        cb(data);
      }).catch(err => {
        console.warn('Unable to fetch user', err);
        config.log(cb);
        cb(null);
      });
    } else {
      cb(null);
    }
  },
  fetchJourney: (jid) => {
    return new Promise((resolve, reject) => {
      const req = new Request(`${jid}`);
      fetch(req).then(res => { return res.json(); })
      .then(journey => {
        resolve(journey);
      });
    });
  },
  fetchJourneys: async () => {
    let res = [];
    let jids = [
      `${config.lcmsUrl}/parcours/code/QBWOHF`, // HTML
      `${config.lcmsUrl}/parcours/code/SICKKR`, // CSS
      // `${config.lcmsUrl}/parcours/code/TODO`, // ?
      // `${config.lcmsUrl}/parcours/code/TODO`  // ?
    ];
    for (let jid of jids) {
      res.push(await lcms.fetchJourney(jid));
    }
    return res
  },
  // Send succes to lcms api
  registerSuccess: (activityId, content, cb) => {
    if (config.preview) {
      return console.info('Preview mode: no success registration');
    }
    const token = lcms.getAuthToken();
    if(token) {
      const body = {
        'activity_id': activityId,
        'duration': 0,
        'success': true,
        'response': content
      };
      // FIXME start_time end_time duration attempts
      const req = new Request(config.lcmsUrl + '/activity/' + activityId,  {
        'method': 'POST',
        'headers': {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        'body': JSON.stringify(body)
      });
      fetch(req).then(res => { return res.json(); })
      .then(cb);
    }
  }
};

