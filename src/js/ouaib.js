const VERSION = 'v0.1.0';
document.getElementById('version').textContent = VERSION;

import '../css/ouaib.css';

import { marked } from 'marked';
import { config } from './config.js';
import { gui } from './gui.js';
import { lcms } from './lcms.js';
import { EditorView, keymap, lineNumbers } from "@codemirror/view"
import {defaultKeymap, history as cmhistory, historyKeymap} from "@codemirror/commands"
import {syntaxHighlighting, defaultHighlightStyle} from "@codemirror/language"
import {html} from "@codemirror/lang-html"

let _htmlEditor = null; // Codemirror editor
let _skipLogin = false;   // Don't ask for login anymore
let _nsix = false;        // If embedded in a nsix challenge

let _journeys = [];    // All journeys
let _journey = null;   // Current journey
let _exercises = [];   // All exercises for current journey
let _exerciseIdx = 0;  // Current exercise index
let _exercise = null;  // Current exercise
let _tests = [];       // Tests for current exercise
let _over = false;     // currently running program is terminated
let _lastFocus = null; // focused element before program start (for graphical display only)

let _user = null;

const imgCache = {};

// Resize src textarea when parent div is resized
new ResizeObserver((entries) => {
  for (const entry of entries) {
    let editor = document.querySelector('#htmlsrc > .CodeMirror');
    if (editor) {
      editor.style.height = entry.contentRect.height + 'px';
    }
  }
}).observe(document.getElementById('htmlsrc'));

/**
 * Load CSV tests from question format is :
 * method command;selector;expected result;option
 * option may either be :
 *  - hide : hide the test content (in order to avoid cheating)
 *  - any sentence : displayed as help
 */
function loadTestsCSV(csv) {
  _tests = [];
  if (!csv) { return; }
  let lines = csv.split('\n');
  for (let line of lines) {
    let val = line.split(';');
    if (val.length > 1) {
      // TODO oop for tests
      if(val[0].startsWith('live:')) {
        let elts = val[0].substring(5).trim().split(/\s+/)
        _tests.push({
          'live': true,
          'method': `${val[0].substring(5)} ${val[1]}`,
          'global': elts[0],
          'fn': elts[1],
          'selector': val[1],
          'value': val[2],
          'passed': false
        });
      } else {
        _tests.push({
          'live': false,
          'method': val[0],
          'selector': val[1],
          'value': val[2],
          'option': val[3]
        });
      }
    }
  }
}

/// Display main menu (journey selection)
function displayMenu() {
  const menu = document.getElementById('mainmenu');
  const progress = document.getElementById('progress');
  const main = document.getElementById('main');
  const instruction = document.getElementById('instruction');
  gui.hideHelp();
  _journey = null;
  _exercises = [];
  instruction.innerHTML = '';
  progress.classList.add('hidden');
  main.classList.add('hidden');
  menu.style.display = 'block';
  menu.style.transform = 'translate(0, 0)';
}

let main = null;
let markers = null;
let delta_x = 0

function updateListTx() {
  if(main === null) { return; }
  console.info(main.attr('transform'));
  main.animate({
    transform: `t${-delta_x * MARKER_W}`
  }, 1000, mina.easeinout, () => {
    for (let i = 0; i < markers.length; i++) {
      let content = markers[i].children();
      content[0].attr('stroke', _exerciseIdx === i ? '#006CC5' : '#444');
      content[1].attr('fill', _exerciseIdx === i ? '#006CC5' : '#444');
    }
  });
  markers[delta_x].attr('display', 'none');
  if(dx > 0) {
  } else if (dx < 0) {
    previous.attr('display', 'inline');
  }
}

/// Display exercices list for navigation on top.
function displayExercisesNav() {
  const enabled = ['#ffeebc', '#366f9f', '#234968'];
  const disabled = ['#aaaaaa', '#333333', '#777777'];
  const MARKER_RADIUS = 12;
  const MARKER_PX = 24;
  const MARKER_PY = 24;
  const MARKER_W = 42;

  let navTemplate = document.querySelector('#nav-template');
  let elt = document.getElementById('progress');
  elt.innerHTML = '';
  elt.classList.remove('hidden')

  // let main = sp.g();
  markers = [];
  let lastDone = false;
  for (let i = 0; i < _exercises.length; i++) {
    let x = MARKER_PX + MARKER_W*i;
    if (!_user.results) { break; }
    let done  = _user.results.find(r => r.activity_id == _exercises[i].id && r.success)
    let marker = document.importNode(navTemplate.content, true);
    let ne = marker.querySelector('.nav-elt');
    ne.textContent = i;
    if (lastDone) {
      ne.classList.add('available');
      ne.onclick = () => {
        _exerciseIdx = i;
        displayExercise();
      };
    }
    if (done) {
      lastDone = true;
      ne.classList.add('valid');
      ne.onclick = () => {
        _exerciseIdx = i;
        displayExercise();
      };
    } else {
      lastDone = false;
      ne.classList.remove('valid');
    }
    if (_exerciseIdx === i) {
      ne.classList.add('selected');
    } else {
      ne.classList.remove('selected');
    }
    elt.appendChild(marker);
  }
}

let updateDelay = null;
function updateHTML(content) {
  let outputFrame = document.getElementById("output");
  if (outputFrame) {
    let outputDoc =
      outputFrame.contentDocument || outputFrame.contentWindow.document;
    outputDoc.open();
    outputDoc.write(content);
    outputDoc.close();
  }
  localStorage.setItem(getHTMLKey(), _htmlEditor.state.doc.toString());
  let to = document.getElementById('testsOutput');
  if (to) { to.style.display = 'none'; }
}


function initHTMLEditor() {
  let defaultTheme = EditorView.theme({
    ".cm-content, .cm-gutter": {minHeight: "200px"},
    "&": {
      color: "white",
      backgroundColor: "#034"
    },
    ".cm-content": {
      caretColor: "#0e9"
    },
    "&.cm-focused .cm-cursor": {
      borderLeftColor: "#0e9"
    },
    "&.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "#074"
    },
    ".cm-gutters": {
      backgroundColor: "#045",
      color: "#ddd",
      border: "none"
    }
  }, {dark: true});
  _htmlEditor = new EditorView({
    extensions: [
      defaultTheme,
      cmhistory(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      html(),
      syntaxHighlighting(defaultHighlightStyle),
      lineNumbers(),
      EditorView.updateListener.of(v => {
        if (v && v.changes
            && (v.changes.inserted.length || v.changes.sections.length > 2)) {
          if (updateDelay) { clearTimeout(updateDelay); }
          updateDelay = setTimeout(() => {
            updateHTML(v.state.doc.toString());
          }, 300);
        }
      })
    ],
    parent: document.getElementById('htmlsrc')
  });
}

/**
 * Affiche l'exercice en cours (_exercises[_exerciseIdx]).
 */
function displayExercise() {
  const instruction = document.getElementById('instruction');
  const main = document.getElementById('main');
  const menu = document.getElementById('mainmenu');
  const help = document.getElementById('help');
  const output = document.getElementById('output');
  menu.style.transform = 'translate(0, 100vh)';
  setTimeout(() => { menu.style.display = 'none' }, 300);
  main.classList.remove('hidden');
  help.classList.remove('hidden');
  output.classList.add('md:w-1/2');

  _exercise = _exercises[_exerciseIdx];

  if (_exercise) {
    let prog = ' ';  // one space to force reload
    let lastprog = localStorage.getItem(getHTMLKey());
    if(!_htmlEditor) {
      initHTMLEditor();
    }
    if(_exercise.tests) { // deprecated format
      loadTestsCSV(_exercise.tests);
    } else {
      loadTestsCSV(_exercise.validation);
    }
    // title.innerHTML = _exercise.title || 'Entrainement';
    if(_exercise.instruction) { // deprecated format
      instruction.innerHTML = marked.parse(_exercise.instruction);
    } else {
      instruction.innerHTML = marked.parse(_exercise.intro);
    }
    // TODO ?
    // renderMathInElement(instruction, {
    //   delimiters: [
    //       {left: '$$', right: '$$', display: true},
    //       {left: '$', right: '$', display: false},
    //       {left: '\\(', right: '\\)', display: false},
    //       {left: '\\[', right: '\\]', display: true}
    //   ],
    //   throwOnError : false
    // });
    if(_exercise.proposal && _exercise.proposal.length > 0) {
      prog = _exercise.proposal;
      document.getElementById('resetbtn').classList.remove('hidden');
    } else {
      document.getElementById('resetbtn').classList.add('hidden');
    }
    let helpBtn = document.getElementById('help');
    let helpPanel = document.getElementById('help-panel');
    helpPanel.innerHTML = '';
    if(_exercise.help) {
      let helps = _exercise.help.split(/\n/);
      for(let msg of helps) {
        if(msg.startsWith('* ')) { msg = msg.substring(2, msg.length); }
        let c = document.createElement('div');
        c.innerHTML = marked.parse(msg);
        helpPanel.appendChild(c);
      }
      helpBtn.classList.remove('hidden');
    } else {
      helpBtn.classList.add('hidden');
    }
    let result = _user?.results?.find(r => r.activity_id == _exercise.id);
    if(lastprog && lastprog.length) {
      prog = lastprog;
    } else {
      if (result) {
        try {
          let content = JSON.parse(result.response);
          if (content.html) {
            prog = content.html;
          } else {
            content = JSON.parse(content);
            prog = content.html;
          }
        } catch(error) {
          prog = result.response;
        }
      }
    }
    _htmlEditor.dispatch({
      changes: {from: 0, to: _htmlEditor.state.doc.length, insert: prog}
    });
    // register exercise start
    // TODO lcms
  } else {
    if(!_htmlEditor) { initHTMLEditor(); }
    instruction.innerHTML = marked.parse('**Bravo !** Tous les exercices de ce niveau sont terminés !');
    _htmlEditor.dispatch({changes: {from: 0, to: _htmlEditor.state.doc.length, insert: '' }});
    updateHTML('');
  }

  displayExercisesNav();
}

// Go to next exercise
function nextExercise() {
  const successOverlay = document.getElementById('overlay');
  successOverlay.classList.add('hidden');
  var outputpre = document.getElementById('output');
  outputpre.innerHTML = ''
  _exerciseIdx++;
  displayExercise();
}

// Load exercises from remote LCMS
function loadExercises(level, pushHistory){
  if(!level) { return console.warn('Missing level'); }
  if(!_user && !_skipLogin) {
    return gui.loginWarning();
  }
  gui.showLoading();

  _journey = _journeys[level-1];
  _exercises = _journey.activities;
  _exerciseIdx = -1;
  if (config.exidx >= 0) {
    _exerciseIdx = config.exidx;
  } else if (_user) {
    for (let i in _exercises) {
      if (_exerciseIdx < 0) {
        if (_user.results) {
          let r = _user.results.find(r => {
            return r.activity_id == _exercises[i].id;
          });
          if(!r || !r.success) {
            _exerciseIdx = parseInt(i);
          }
        }
      }
    }
  } else {
    _exerciseIdx = 0;
  }
  gui.hideLoading();
  if(pushHistory) {
    history.pushState({'level': level}, '', `/?parcours=${level}`);
  }
  displayExercise();
}

// Reload initial HTML content
function resetHTML(){
  if(_exercise && _exercise.proposal && _exercise.proposal.length > 0) {
    if(_htmlEditor) {
      // _htmlEditor.setValue(_exercise.proposal);
      _htmlEditor.dispatch({
        changes: {
          from: 0,
          to: _htmlEditor.state.doc.length,
          insert: _exercise.proposal
        }
      });
    }
  }
}

function runCheck(doc, test) {
  console.info(test);
  let res = {
    passed: false,
    expected: test.value.trim(),
    found : 'Échec du test'
  };
  if (test.method === 'contains') {
    let elts = doc.querySelectorAll(test.selector);
    if (elts.length < 1) {
      res.found = `Élément non trouvé : ${test.selector}`;
    } else {
      for (let elt of elts) {
        if (elt && !res.passed) {
          let tc = elt.textContent.trim();
          res.found = tc;
          res.passed = (tc === res.expected);
        }
      }
    }
  } else {
    console.error('Unknown test method', test.method, test);
  }
  return res;
}

/// Checks HTML content result
async function checkResult() {
  if (!_exercise) { return; }
  let outputFrame = document.getElementById("output");
  let outputDoc = outputFrame.contentDocument || outputFrame.contentWindow.document;
  let nbFailed = _tests.length;
  let table = document.importNode(document.querySelector('#results-table').content, true);
  let lineTemplate = document.querySelector('#result-line');
  let hasHelp = false;
  _tests.forEach(t => {
    if (t && t.option && t.option !== 'hide') { hasHelp = true; }
  });
  table.querySelector('thead td.aide').style.display = hasHelp ? 'table-cell' : 'none';
  if(_tests.length > 0) {
    nbFailed = 0;
    for (let i = 0 ; i < _tests.length; i++) {
      let line = null;
      let result = runCheck(outputDoc, _tests[i]);
      if (!result.passed) { nbFailed++; }
      if (_tests[i].option !== 'hide') {
        line = document.importNode(lineTemplate.content, true);
        let cells = line.querySelectorAll('td');
        // cells[0].textContent = _tests[i].method;
        cells[0].textContent = result.expected;
        cells[1].textContent = result.found;
        if(hasHelp) {
          cells[2].textContent = _tests[i].option;
          cells[2].style.display = 'table-cell';
        } else {
          cells[2].style.display = 'none';
        }
      }
      if(result.passed) {
        line && line.querySelector('tr').classList.add('ok');
      } else {
        line && line.querySelector('tr').classList.add('ko');
      }
      if(line) {
        let tbody = table.querySelector('tbody');
        tbody.append(line);
      }
    }
    if (nbFailed === 0) {
      // TODO
      // const answer = sha256('TODO');
      // if(parent) {
      //   parent.window.postMessage({
      //     'answer': answer,
      //     'from': 'web.nsix.fr'
      //   }, '*');
      // }

      let response = {
        'html': _htmlEditor.state.doc.toString()
      };
      lcms.registerSuccess(_exercise.id, JSON.stringify(response), (data) => {
        config.log('Userinfo:', JSON.stringify(data));
        _user.results.push(data);
        updateAchievements();
      });
      gui.displaySuccess();
    }
  }
  const elt = document.createElement('div');
  let content = '';
  if(nbFailed > 0) {
    elt.classList.add('failed');
    content = `Résultat : ${_tests.length} test`;
    if(_tests.length > 1) { content += 's'; }
    content += `, ${nbFailed} échec`
    if(nbFailed > 1) { content += 's'; }
  } else {
    elt.classList.add('success');
    if(_tests.length > 1) {
      content = `Succès des ${_tests.length} tests`;
    } else {
      content = `Succès de ${_tests.length} test`;
    }
  }
  elt.innerHTML += `<div class="result">${content}</div>`;
  if(_tests.find(t => t.option !== 'hide')){
    elt.appendChild(table);
  }
  let toelt = document.getElementById('testsOutput')
  toelt.innerHTML = '';
  toelt.appendChild(elt);
  toelt.style.display = 'block';

  if(_lastFocus) { _lastFocus.focus(); }
}

function login() {
  const current = location.href;
  location.href = `${config.nsixLoginUrl}?dest=${current}`;
}
function registerSkipLogin() {
  _skipLogin = true;
}

async function loadResults() {
  let token = lcms.getAuthToken();
  if(token) {
    let parcours = [];
    for (let j of _journeys) {
      parcours.push(`"${j.code}"`);
    }
    const res = await fetch(config.lcmsUrl + `/resultats/?parcours=[${parcours.join(',')}]`, {
      'headers': {
        'Authorization': 'Bearer ' + token
      }
    });
    if (res && res.status === 200) {
      const results = await res.json()
      config.log('Results found', results);
      return results;
    }
    console.error('Unable to fetch results', res);
    return null;
  }
  return null;
}

function getHTMLKey(){
  let key = 'html'
  if(_user) {
    key += '_' + _user.externalId;
  }
  if(_exercise) {
    key += '_' + _exercise.id;
  }
  return key;
}

function logout() {
  const cookies = ['neossot'];
  for (let cookie of cookies) {
    document.cookie=`${cookie}=; domain=${config.cookieDomain}; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
  location.reload();
}

function updateAchievements() {
  if(!_user || !_journeys) { return; }
  for (let i = 1; i <= _journeys.length ; i++){
    if (!_journeys[i-1] || !_journeys[i-1].activities) { continue; }
    let elt = document.querySelector(`#level-${i} .percent`);
    if (!elt) { continue; }
    let total =  _journeys[i-1].activities.length;
    let done = 0;
    for (let ch of _journeys[i-1].activities){
      if (_user.results) {
        let result = _user.results.find(r => r.activity_id == ch.id);
        if(result && result.success) {
          done++;
        }
      }
    }
    let percent = 100.0 * done / total;
    let stars = Math.round(percent/20);
    let starsContent = '';
    for(let j = 1; j <= 5; j++){
      let color = 'text-gray-400';
      if(j <= stars) { color = 'text-yellow-500'; }
      starsContent += `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 fill-current ${color}"><path d="M8.128 19.825a1.586 1.586 0 0 1-1.643-.117 1.543 1.543 0 0 1-.53-.662 1.515 1.515 0 0 1-.096-.837l.736-4.247-3.13-3a1.514 1.514 0 0 1-.39-1.569c.09-.271.254-.513.475-.698.22-.185.49-.306.776-.35L8.66 7.73l1.925-3.862c.128-.26.328-.48.577-.633a1.584 1.584 0 0 1 1.662 0c.25.153.45.373.577.633l1.925 3.847 4.334.615c.29.042.562.162.785.348.224.186.39.43.48.704a1.514 1.514 0 0 1-.404 1.58l-3.13 3 .736 4.247c.047.282.014.572-.096.837-.111.265-.294.494-.53.662a1.582 1.582 0 0 1-1.643.117l-3.865-2-3.865 2z"></path></svg>`;
    }
    elt.innerHTML = `&nbsp; ${Math.round(percent)} % terminé`;
    document.querySelector(`#level-${i} .stars`).innerHTML = starsContent;
    document.querySelector(`#level-${i} .achievement`).title = `${done} / ${total} réussi${(done > 0) ? 's' : ''}`;
  }
}

async function init(){
  _journeys = await lcms.fetchJourneys();

  marked.setOptions({
    gfm: true
  });

  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('checkbtn').addEventListener('click', checkResult);
  document.getElementById('homebtn').addEventListener('click', () => { displayMenu(); history.pushState(null, '', '/'); });
  document.getElementById('nextbtn').addEventListener('click', nextExercise);
  document.getElementById('resetbtn').addEventListener('click', resetHTML);
  document.getElementById('login').addEventListener('click', login);
  document.getElementById('login2').addEventListener('click', login);
  // document.getElementById('skip-login-btn').addEventListener('click', registerSkipLogin);
  document.getElementById('level-1').addEventListener('click', () => loadExercises(1, true));
  // document.getElementById('level-2').addEventListener('click', () => loadExercises(2, true));
  // document.getElementById('level-3').addEventListener('click', () => loadExercises(3, true));
  // document.getElementById('level-4').addEventListener('click', () => loadExercises(4, true));
  document.getElementById('profileMenuBtn').addEventListener('click', gui.toggleMenu);

  document.getElementById('help').addEventListener('click', gui.showHelp);
  document.getElementById('help-panel').addEventListener('click', gui.hideHelp);

  addEventListener('popstate', evt => {
    if(evt.state && evt.state.level) {
      loadExercises(evt.state.level);
    } else {
      displayMenu();
    }
  });

  lcms.loadUser(async (user) => {
    // TODO session cache
    config.log('User loaded', user);

    if(user) {
      _user = user;
      document.getElementById('username').innerHTML = user.firstName || 'Moi';
      document.getElementById('profile-menu').classList.remove('hidden');
      _user.results = await loadResults();
      updateAchievements();
    } else {
      document.getElementById('login').classList.remove('hidden');
      _user = null;
    }

    let loaded = false;
    let lvl = config.parcours;
    if(lvl >= 0) {
      loadExercises(lvl);
      loaded = true;
    }
    if(!loaded) { displayMenu(); }
    gui.hideLoading();
  });
}

// if in iframe (i.e. nsix challenge)
_nsix = window.location !== window.parent.location;
const elts = document.querySelectorAll(_nsix ? '.nsix' : '.standalone');
for (let e of elts) {
  e.classList.remove('hidden');
}

init();
