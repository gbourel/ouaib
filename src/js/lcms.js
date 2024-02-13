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
  fetchJourney: (code) => {
    return new Promise((resolve, reject) => {
      let token = lcms.getAuthToken();
      const req = new Request(`${config.lcmsUrl}/parcours/code/${code}`, {
        'headers': { 'Authorization': `Bearer ${token}` }
      });
      fetch(req).then(res => { return res.json(); })
      .then(journey => {
        resolve(journey);
      });
    });
  },
  fetchJourneys: async () => {
    let res = [];
    let codes = [
      'QBWOHF', // HTML
      'SICKKR', // CSS
      'AXSUFL', // Web
    ];
    for (let code of codes) {
      res.push(await lcms.fetchJourney(code));
    }
    return res
  },
  fetchActivity: (actId) => {
    return new Promise((resolve, reject) => {
      const token = lcms.getAuthToken();
      const req = new Request(`${config.lcmsUrl}/activity/${actId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetch(req).then(res => { return res.json(); })
      .then(async act => {
        resolve(act);
      });
    });
  },
  fetchQuiz: (quizId) => {
    return new Promise((resolve, reject) => {
      const token = lcms.getAuthToken();
      const req = new Request(`${config.lcmsUrl}/quiz/${quizId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetch(req).then(res => { return res.json(); })
      .then(async quiz => {
        resolve(quiz);
      });
    });
  },
  // fetchResults: async (journeys) => {
  //   let token = lcms.getAuthToken();
  //   if(token) {
  //     let parcours = [];
  //     for (let j of journeys) {
  //       parcours.push(`"${j.code}"`);
  //     }
  //     const res = await fetch(`${config.lcmsUrl}/resultats/?parcours=[${parcours.join(',')}]`, {
  //       'headers': { 'Authorization': `Bearer ${token}` }
  //     });
  //     if (res && res.status === 200) {
  //       const results = await res.json()
  //       return results;
  //     }
  //     console.error('Unable to fetch results', res);
  //     return null;
  //   }
  //   return null;
  // },
  // Send succes to lcms api
  registerSuccess: (questionId, activityId, content, cb) => {
    if (config.preview) {
      return console.info('Preview mode: no success registration');
    }
    const token = lcms.getAuthToken();
    if(token) {
      const body = {
        'question_id': questionId,
        'activity_id': activityId,
        'duration': 0,
        'success': true,
        'response': content
      };
      // FIXME start_time end_time duration attempts
      const req = new Request(`${config.lcmsUrl}/resultats/save/question`,  {
        'method': 'PUT',
        'headers': {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        'body': JSON.stringify(body)
      });
      fetch(req).then(res => { return res.json(); })
      .then(cb);
    }
  }
};

