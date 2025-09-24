const VERSION = 'v0.5.2';
document.getElementById('version').textContent = VERSION;
console.info(`Version ${VERSION}`);

import '../css/ouaib.css';

import { marked } from 'marked';
import { baseUrl } from "marked-base-url";
import { pandoc } from "marked-pandoc";
import { newtab } from "marked-newtab";
import { config } from './config.js';
import { gui } from './gui.js';
import { lcms } from './lcms.js';
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history as cmhistory, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import { html, htmlLanguage } from "@codemirror/lang-html";
import { css, cssLanguage } from "@codemirror/lang-css";
import { javascript, javascriptLanguage } from "@codemirror/lang-javascript";
import { linter, lintKeymap, lintGutter } from '@codemirror/lint';
import { HTMLHint } from 'htmlhint';
import { aura } from '@uiw/codemirror-theme-aura';

let _htmlEditor = null;   // Codemirror editor for html
let _cssEditor = null;    // Codemirror editor for css
let _jsEditor = null;     // Codemirror editor for js
let _skipLogin = false;   // Don't ask for login anymore
let _nsix = false;        // If embedded in a nsix challenge

let _journeys = [];    // All journeys
let _journey = null;   // Current journey
let _activity = null;  // Current activity
let _activityIdx = -1; // Current activity index
let _quiz = [];        // Current quiz
let _questionIdx = 0;  // Current question index
let _question = null;  // Current question
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

async function handleMessage(msg) {
  if (!_activity || (msg.data.activity && msg.data.activity !== _activity.id)) {
    _activity = await lcms.fetchActivity(msg.data.activity);
    if (_activity && _activity.quiz) {
      _quiz = _activity.quiz;
    }
  }
  if (_quiz && _quiz.questions && msg.data.question < _quiz.questions.length) {
    _questionIdx = msg.data.question;
    displayExercise();
  } else {
    const instruction = document.getElementById('instruction');
    instruction.innerHTML = '<div class="error">🔍️ Erreur : question non trouvée.</div>';
    console.warn(msg.data.question, _quiz.questions);
  }

}
window.addEventListener('message', handleMessage, false)

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
  instruction.innerHTML = '';
  progress.classList.add('hidden');
  main.classList.add('hidden');
  if (_nsix) {
    menu.style.display = 'none';
  } else {
    menu.style.display = 'block';
    menu.style.transform = 'translate(0, 0)';
  }
}

let main = null;
let markers = null;
let delta_x = 0

function updateListTx() {
  if(main === null) { return; }
  main.animate({
    transform: `t${-delta_x * MARKER_W}`
  }, 1000, mina.easeinout, () => {
    for (let i = 0; i < markers.length; i++) {
      let content = markers[i].children();
      content[0].attr('stroke', _activityIdx === i ? '#006CC5' : '#444');
      content[1].attr('fill', _activityIdx === i ? '#006CC5' : '#444');
    }
  });
  markers[delta_x].attr('display', 'none');
  if(dx > 0) {
  } else if (dx < 0) {
    previous.attr('display', 'inline');
  }
}

/// Check if all activity questions are done.
function isDone(journey, actIdx) {
  if (!journey || !journey.results) { return false; }
  const act = journey.activities[actIdx];
  if (act && journey.results[act.id]) {
    let ok = true;
    for (const r of journey.results[act.id]) {
      if (!(r.success || r.done)) {
        ok = false;
      }
    }
    return ok;
  }
  return false;
}

/// Display activities list for navigation on top.
function displayActivitiesNav() {
  if (!_journey) { return; }    // embedded
  const navTemplate = document.querySelector('#nav-template');
  const elt = document.getElementById('progress');
  elt.innerHTML = '';
  elt.classList.remove('hidden')

  markers = [];
  let lastDone = false;
  for (let i = 0; i < _journey.activities.length; i++) {
    const done  = isDone(_journey, i);
    const marker = document.importNode(navTemplate.content, true);
    const ne = marker.querySelector('.nav-elt');
    ne.textContent = i;
    if (lastDone) {
      ne.classList.add('available');
      ne.onclick = async () => {
        await loadActivity(i, true);
        displayExercise();
      };
    }
    if (done) {
      lastDone = true;
      ne.classList.add('valid');
      ne.onclick = async () => {
        await loadActivity(i, true);
        displayExercise();
      };
    } else {
      lastDone = false;
      ne.classList.remove('valid');
    }
    if (_activityIdx === i) {
      ne.classList.add('selected');
    } else {
      ne.classList.remove('selected');
    }
    elt.appendChild(marker);
  }
}

let updateTimeout = null;
function updateHTML(content) {
  sessionStorage.setItem(getHTMLKey(), content);
  refreshPreview();
}
function updateCSS(content) {
  sessionStorage.setItem(getCSSKey(), content);
  refreshPreview();
}
function updateJS(content) {
  sessionStorage.setItem(getJSKey(), content);
  refreshPreview();
}
function refreshPreview() {
  let outputFrame = document.getElementById("output");
  if (outputFrame) {
    const outputDoc =
      outputFrame.contentDocument || outputFrame.contentWindow.document;
    const htmlContent = _htmlEditor.state.doc.toString();
    const cssContent = _cssEditor.state.doc.toString();
    const jsContent = _jsEditor.state.doc.toString();
    const content = `<!DOCTYPE html><head><meta charset="ascii"><style>${cssContent}</style></head><body>${htmlContent}<script type="module">${jsContent.trim()}</script></body></html>`;
    outputDoc.open();
    outputDoc.write(content);
    outputDoc.close();
  }
  let to = document.getElementById('testsOutput');
  if (to) { to.style.display = 'none'; }
}

const htmlLintConfig = {
  "tag-pair": true, // Tag must be paired.
  "attr-no-duplication": true, // Elements cannot have duplicate attributes.
  "tag-self-close": true, // Empty tags must be self closed.
  "src-not-empty": true, // The src attribute of an img(script,link) must have a value.
  "id-unique": true, // The value of id attributes must be unique.
};
function HTMLlinter() {
    return (view) => {
        let { state } = view;
        let diagnostics = [];
        for (let { from, to } of htmlLanguage.findRegions(state)) {
          let content = state.sliceDoc(from, to);
          let checkres = HTMLHint.verify(content, htmlLintConfig);
          for(let check of checkres) {
            diagnostics.push({
              from: state.doc.line(check.line).from,
              to: state.doc.line(check.line).to,
              severity: check.type,
              message: check.message
            });
          }
        }
        return diagnostics;
    };
}
function mapPos(line, col, doc, offset) {
    return doc.line(line + offset.line).from + col + (line == 1 ? offset.col - 1 : -1);
}
function translateDiagnostic(input, doc, offset) {
    let start = mapPos(input.line, input.column, doc, offset);
    let result = {
        from: start,
        to: input.endLine != null && input.endColumn != 1 ? mapPos(input.endLine, input.endColumn, doc, offset) : start,
        message: input.message,
        source: input.ruleId ? "htmlhint:" + input.ruleId : "htmlhint",
        severity: input.severity == 1 ? "warning" : "error",
    };
    if (input.fix) {
        let { range, text } = input.fix, from = range[0] + offset.pos - start, to = range[1] + offset.pos - start;
        result.actions = [{
                name: "fix",
                apply(view, start) {
                    view.dispatch({ changes: { from: start + from, to: start + to, insert: text }, scrollIntoView: true });
                }
            }];
    }
    return result;
}

function initHTMLEditor() {
  let sizeTheme = EditorView.theme({
    ".cm-content, .cm-gutter": {minHeight: "200px"},
  });
  _htmlEditor = new EditorView({
    extensions: [
      sizeTheme,
      aura,           // theme "aura"
      cmhistory(),
      keymap.of([
        { key: "Ctrl-Enter", run: checkResult },
        ...defaultKeymap, ...historyKeymap
      ]),
      html(),
      syntaxHighlighting(defaultHighlightStyle),
      lineNumbers(),
      lintGutter(),
      linter(HTMLlinter()),
      EditorView.updateListener.of(v => {
        if (v && v.changes
            && (v.changes.inserted.length || v.changes.sections.length > 2)) {
          if (updateTimeout) { clearTimeout(updateTimeout); }
          updateTimeout = setTimeout(() => {
            updateHTML(v.state.doc.toString());
          }, 300);
        }
      })
    ],
    parent: document.getElementById('htmlsrc')
  });
}
function initCSSEditor() {
  let sizeTheme = EditorView.theme({
    ".cm-content, .cm-gutter": {minHeight: "200px"},
  });
  _cssEditor = new EditorView({
    extensions: [
      sizeTheme,
      aura,           // theme "aura"
      cmhistory(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      css(),
      syntaxHighlighting(defaultHighlightStyle),
      lineNumbers(),
      lintGutter(),
      linter(HTMLlinter()),
      EditorView.updateListener.of(v => {
        if (v && v.changes
            && (v.changes.inserted.length || v.changes.sections.length > 2)) {
          if (updateTimeout) { clearTimeout(updateTimeout); }
          updateTimeout = setTimeout(() => {
            updateCSS(v.state.doc.toString());
          }, 300);
        }
      })
    ],
    parent: document.getElementById('csssrc')
  });
}
function initJSEditor() {
  let sizeTheme = EditorView.theme({
    ".cm-content, .cm-gutter": {minHeight: "200px"},
  });
  _jsEditor = new EditorView({
    extensions: [
      sizeTheme,
      aura,           // theme "aura"
      cmhistory(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      javascript(),
      syntaxHighlighting(defaultHighlightStyle),
      lineNumbers(),
      lintGutter(),
      linter(HTMLlinter()),
      EditorView.updateListener.of(v => {
        if (v && v.changes
            && (v.changes.inserted.length || v.changes.sections.length > 2)) {
          if (updateTimeout) { clearTimeout(updateTimeout); }
          updateTimeout = setTimeout(() => {
            updateJS(v.state.doc.toString());
          }, 300);
        }
      })
    ],
    parent: document.getElementById('jssrc')
  });
}

/**
 * Affiche l'exercice en cours.
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

  if (_quiz.questions) {
    _question = _quiz.questions[_questionIdx];
  }
  if (_question) {
    let proghtml = ' ';  // one space to force reload
    let progcss = ' ';   // one space to force reload
    let progjs = ' ';    // one space to force reload
    let lastproghtml = sessionStorage.getItem(getHTMLKey());
    let lastprogcss = sessionStorage.getItem(getCSSKey());
    let lastprogjs = sessionStorage.getItem(getJSKey());
    if(!_htmlEditor) {
      initHTMLEditor();
    }
    if(!_cssEditor) {
      initCSSEditor();
    }
    if(!_jsEditor) {
      initJSEditor();
    }
    loadTestsCSV(_question.answers);

    // title.innerHTML = _question.title || 'Entrainement';
    marked.use(baseUrl(`https://filedn.nsix.fr/act/${_activity.id}/`));
    marked.use(pandoc);
    marked.use(newtab);


    let md = _question.instruction;
    instruction.innerHTML = marked.parse(md);
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
    if(_question.proposal && _question.proposal.length > 0) {
      proghtml = _question.proposal;
      progcss = '';
      progjs = '';
      let cssidx = proghtml.indexOf('_CSS_');
      let jsidx = proghtml.indexOf('_JS_');
      if (cssidx > -1 || jsidx > -1) {
        if (cssidx === -1) {
          proghtml = _question.proposal.substring(0, jsidx);
          progcss = ' ';
          progjs = _question.proposal.substring(jsidx + 5);
        } else {
          proghtml = _question.proposal.substring(0, cssidx);
          if (jsidx === -1) {
            progcss = _question.proposal.substring(cssidx + 6);
            progjs = ' ';
          } else {
            progcss = _question.proposal.substring(cssidx + 6, jsidx);
            progjs = _question.proposal.substring(jsidx + 5);
          }
        }
      }
      document.getElementById('resetbtn').classList.remove('hidden');
    } else {
      document.getElementById('resetbtn').classList.add('hidden');
    }
    let helpBtn = document.getElementById('help');
    let helpPanel = document.getElementById('help-panel');
    helpPanel.innerHTML = '';
    if(_question.help) {
      let helps = _question.help.split(/\n/);
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
    let result = _user?.results?.find(r => r.activity_id == _question.id);
    if(lastproghtml && lastproghtml.length) {
      proghtml = lastproghtml;
    } else {
      if (result) {
        try {
          let content = JSON.parse(result.response);
          if (content.html) {
            proghtml = content.html;
          } else {
            content = JSON.parse(content);
            proghtml = content.html;
          }
        } catch(error) {
          proghtml = result.response;
        }
      }
    }
    if(lastprogcss && lastprogcss.length) {
      progcss = lastprogcss;
    } else {
      if (result) {
        try {
          let content = JSON.parse(result.response);
          if (content.css) {
            progcss = content.css;
          } else {
            content = JSON.parse(content);
            progcss = content.css;
          }
        } catch(error) {
          console.error('Error reading CSS content.');
        }
      }
    }
    if(lastprogjs && lastprogjs.length) {
      progjs = lastprogjs;
    } else {
      if (result) {
        try {
          let content = JSON.parse(result.response);
          if (content.js) {
            progjs = content.js;
          } else {
            content = JSON.parse(content);
            progjs = content.js;
          }
        } catch(error) {
          console.error('Error reading JS content.');
        }
      }
    }
    _htmlEditor.dispatch({
      changes: {from: 0, to: _htmlEditor.state.doc.length, insert: proghtml}
    });
    _cssEditor.dispatch({
      changes: {from: 0, to: _cssEditor.state.doc.length, insert: progcss}
    });
    _jsEditor.dispatch({
      changes: {from: 0, to: _jsEditor.state.doc.length, insert: progjs}
    });
    // register exercise start
    // TODO lcms
  } else {
    if(!_htmlEditor) { initHTMLEditor(); }
    if(!_cssEditor) { initCSSEditor(); }
    if(!_jsEditor) { initJSEditor(); }
    instruction.innerHTML = marked.parse('**Bravo !** Tous les exercices de ce niveau sont terminés !');
    _htmlEditor.dispatch({changes: {from: 0, to: _htmlEditor.state.doc.length, insert: '' }});
    updateHTML('');
  }

  displayActivitiesNav();
}

// Go to next exercise
async function nextQuestion() {
  const successOverlay = document.getElementById('overlay');
  successOverlay.classList.add('hidden');
  var outputpre = document.getElementById('output');
  outputpre.innerHTML = '';

  // si il reste des questions
  if (_questionIdx + 1 < _quiz.questions.length) {
    _questionIdx++;
  } else {
    // si il reste des activités
    let idx = _activityIdx + 1;
    while (idx < _journey.activities.length) {
      if (!isDone(_journey, idx)) {
        await loadActivity(idx);
        break;
      }
      idx++;
    }
    // si toutes les activites sont terminees
    if (idx >= _journey.activities.length) {
      _activityIdx = -1;
      _questionIdx = -1;
    }
  }

  // if (_activity.questions)
  // _questionIdx++;
  displayExercise();
}

async function loadActivity(idx, force=false) {
  _activityIdx = idx;
  _activity = _journey.activities[idx];
  if (_activity && _activity.quiz_id) {
    const results = _journey.results[_activity.id];
    _quiz = await lcms.fetchQuiz(_activity.quiz_id);
    _questionIdx = force ? '0' : -1;
    if (results) {
      for (let i = 0; i < results.length; i++) {
        if(!results[i].done) {
          _questionIdx = i;
          break;;
        }
      }
    } else {
      _questionIdx = 0;
    }
  }
}

// Load exercises from remote LCMS
async function loadJourney(level, pushHistory){
  if(!level) { return console.warn('Missing level'); }
  if(!_user && !_skipLogin) {
    return gui.loginWarning();
  }
  gui.showLoading();

  _journey = _journeys[level-1];
  _activityIdx = -1;
  _questionIdx = -1;

  if (_journey) {
    if (!_journey.results) { _journey.results = {}; }
    for (let i = 0; i < _journey.activities.length; i++) {
      if (!isDone(_journey, i)) {
        await loadActivity(i);
        break;
      }
    }
  }
  // Kludge to hide HTML and/or CSS editor for first exercises
  const tabElt = document.querySelector('#main .tabs');
  if (level === 1) {  // no tab for first journey
    tabElt.style.display = 'none';
  } else if (level === 2) {  // no js tab for second journey
    const jstab = document.querySelector('#tab-js');
    jstab.style.display = 'none';
    tabElt.style.display = 'flex';
  } else {
    const jstab = document.querySelector('#tab-js');
    jstab.style.display = 'flex';
    tabElt.style.display = 'flex';
  }
  gui.hideLoading();
  if(pushHistory) {
    history.pushState({'level': level}, '', `/?parcours=${level}`);
  }
  displayExercise();
}

// Reload initial HTML content
function resetHTML(){
  if(_question && _question.proposal && _question.proposal.length > 0) {
    if(_htmlEditor) {
      let htmlcontent = _question.proposal;
      let csscontent = '';
      let jscontent = '';
      let cssidx = htmlcontent.indexOf('_CSS_');
      let jsidx = htmlcontent.indexOf('_JS_');
      if (cssidx > -1 || jsidx > -1) {
        if (cssidx === -1) {
          htmlcontent = _question.proposal.substring(0, jsidx);
          csscontent = ' ';
          jscontent = _question.proposal.substring(jsidx + 5);
        } else {
          htmlcontent = _question.proposal.substring(0, cssidx);
          if (jsidx === -1) {
            csscontent = _question.proposal.substring(cssidx + 6);
            jscontent = ' ';
          } else {
            csscontent = _question.proposal.substring(cssidx + 6, jsidx);
            jscontent = _question.proposal.substring(jsidx + 5);
          }
        }
      }
      // _htmlEditor.setValue(_question.proposal);
      _htmlEditor.dispatch({
        changes: {
          from: 0,
          to: _htmlEditor.state.doc.length,
          insert: htmlcontent
        }
      });
      _cssEditor.dispatch({
        changes: {
          from: 0,
          to: _cssEditor.state.doc.length,
          insert: csscontent
        }
      });
      _jsEditor.dispatch({
        changes: {
          from: 0,
          to: _jsEditor.state.doc.length,
          insert: jscontent
        }
      });
    }
  }
}

function runCheck(doc, test) {
  let res = {
    passed: false,
    expected: test.value.trim(),
    found : 'Échec du test'
  };
  const methods = ['contains', 'style', 'attribute', 'exists'];
  // TODO hasClass, checked, disabled, hidden, greaterThan
  // ignore witespaces msg.replace(/\s+/g, '') == msg1.replace(/\s+/g, '');
  if (methods.includes(test.method)) {
    let elts = doc.querySelectorAll(test.selector);
    if (elts.length < 1) {
      res.found = `Élément non trouvé : ${test.selector}`;
    } else {
      for (let elt of elts) {
        if (elt && !res.passed) {
          if (test.method === 'exists') {
            res.found = 'existe';
            res.expected = 'existe';
            res.passed = true;
          } else if (test.method === 'contains') {
            let tc = elt.textContent.trim();
            res.found = tc;
            res.passed = (tc === res.expected);
          } else if (test.method === 'style') {
            let exp = res.expected.split('=');
            let style = getComputedStyle(elt);
            res.found = style[exp[0]];
            res.passed = (style[exp[0]] === exp[1].replaceAll('"', ''));
          } else if (test.method === 'attribute') {
            let exp = res.expected.split('=');
            if (elt.attributes[exp[0]]) {
              res.found = elt.attributes[exp[0]].value;
              res.passed = (elt.attributes[exp[0]].value === exp[1].replaceAll('"', ''));
            }
          }
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
  if (!_question) { return; }
  let outputFrame = document.getElementById("output");
  let outputDoc = outputFrame.contentDocument || outputFrame.contentWindow.document;
  let nbFailed = _tests.length;
  let table = document.importNode(document.querySelector('#results-table').content, true);
  let lineTemplate = document.querySelector('#result-line');
  let lints = HTMLHint.verify(_htmlEditor.state.doc.toString(), htmlLintConfig)
  let syntaxErr = 0;
  table.querySelector('thead td.aide').style.display = 'table-cell';
  for (let err of lints) {
    let line = document.importNode(lineTemplate.content, true);
    let cells = line.querySelectorAll('td');
    let tbody = table.querySelector('tbody');
    let tds = line.querySelectorAll('td');
    syntaxErr++;
    line.querySelector('tr').classList.add('ko');
    tds[0].textContent = 'Syntaxe HTML correcte.';
    tds[1].textContent = err.message;
    tds[2].textContent = '';
    tbody.append(line);
  }
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
        cells[2].textContent = _tests[i].option;
        cells[2].style.display = 'table-cell';
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
    if (syntaxErr === 0 && nbFailed === 0) {
      let response = {
        'html': _htmlEditor.state.doc.toString(),
        'css': _cssEditor.state.doc.toString(),
        'js': _jsEditor.state.doc.toString()
      };
      if(_nsix) {
        window.parent.window.postMessage({
          'answer': '__done__',
          'content': response,
          'from': 'web.nsix.fr'
        }, '*');
      } else {
        lcms.registerSuccess(_question.id, _activity.id, JSON.stringify(response), (data) => {
          if(!_journey.results[_activity.id]) {
            _journey.results[_activity.id] = [data];
          } else {
            _journey.results[_activity.id].push(data);
          }
          updateAchievements();
        });
        gui.displaySuccess();
      }
    }
  }
  const elt = document.createElement('div');
  let content = '';
  if(nbFailed > 0 || syntaxErr > 0) {
    elt.classList.add('failed');
    content = `Résultat : ${_tests.length} test`;
    if(_tests.length > 1) { content += 's'; }
    content += `, ${nbFailed} échec`
    if(nbFailed > 1) { content += 's'; }
    if(syntaxErr > 0) {
      content += `, ${syntaxErr} erreur${syntaxErr > 1 ? 's' : ''} de syntaxe.`;
    }
  } else {
    elt.classList.add('success');
    if(_tests.length > 1) {
      content = `Succès des ${_tests.length} tests`;
    } else {
      content = `Succès de ${_tests.length} test`;
    }
  }
  elt.innerHTML += `<div class="result">${content}</div>`;
  elt.appendChild(table);
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

function getHTMLKey(){
  let key = 'html';
  if(_user) {
    key += '_' + _user.externalId;
  }
  if(_question) {
    key += '_' + _question.id;
  }
  return key;
}
function getCSSKey(){
  let key = 'css';
  if(_user) {
    key += '_' + _user.externalId;
  }
  if(_question) {
    key += '_' + _question.id;
  }
  return key;
}
function getJSKey(){
  let key = 'js';
  if(_user) {
    key += '_' + _user.externalId;
  }
  if(_question) {
    key += '_' + _question.id;
  }
  return key;
}

function logout() {
  const cookies = ['usrssot'];
  for (let cookie of cookies) {
    document.cookie=`${cookie}=; domain=${config.cookieDomain}; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
  location.reload();
}

/// Affiche le pourcentage de completion des parcours
function updateAchievements() {
  if(!_user || !_journeys) { return; }
  for (let i = 1; i <= _journeys.length ; i++){
    if (!_journeys[i-1] || !_journeys[i-1].activities) { continue; }
    let elt = document.querySelector(`#level-${i} .percent`);
    if (!elt) { continue; }
    let total =  _journeys[i-1].activities.length;
    let done = 0;
    for (let k in _journeys[i-1].results) {
      done += _journeys[i-1].results[k].length;
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
  marked.setOptions({
    gfm: true
  });

  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('checkbtn').addEventListener('click', checkResult);
  document.getElementById('homebtn').addEventListener('click', () => { displayMenu(); history.pushState(null, '', '/'); });
  document.getElementById('nextbtn').addEventListener('click', nextQuestion);
  document.getElementById('resetbtn').addEventListener('click', resetHTML);
  document.getElementById('login').addEventListener('click', login);
  document.getElementById('login2').addEventListener('click', login);
  // document.getElementById('skip-login-btn').addEventListener('click', registerSkipLogin);
  document.getElementById('level-1').addEventListener('click', () => loadJourney(1, true));
  document.getElementById('level-2').addEventListener('click', () => loadJourney(2, true));
  document.getElementById('level-3').addEventListener('click', () => loadJourney(3, true));
  // document.getElementById('level-4').addEventListener('click', () => loadJourney(4, true));
  document.getElementById('profileMenuBtn').addEventListener('click', gui.toggleMenu);

  document.getElementById('help').addEventListener('click', gui.showHelp);
  document.getElementById('help-panel').addEventListener('click', gui.hideHelp);

  document.getElementById('tab-html').addEventListener('click', gui.opentab);
  document.getElementById('tab-css').addEventListener('click', gui.opentab);
  document.getElementById('tab-js').addEventListener('click', gui.opentab);

  addEventListener('popstate', evt => {
    if(evt.state && evt.state.level) {
      loadJourney(evt.state.level);
    } else {
      displayMenu();
    }
  });

  lcms.loadUser(async (user) => {
    let loaded = false;
    if(user && !user.err) {
      _user = user;
      document.getElementById('username').innerHTML = user.firstName || 'Moi';
      document.getElementById('profile-menu').classList.remove('hidden');
      if (config.activity || config.embedded) {
        console.info("NSIX Embedded activity");

        document.getElementById('profile').style.display ='none';
        document.getElementById('homebtn').style.display = 'none';
        document.getElementById('logo').style.display ='none';

        window.parent.window.postMessage({
          'state': '__intialized__',
          'from': 'python.nsix.fr'
        }, '*');
        loaded = true;
      } else {
        _journeys = await lcms.fetchJourneys();
        updateAchievements();
        if(config.parcours >= 0) {
          loadJourney(config.parcours);
          loaded = true;
        }
      }
    } else {
      document.getElementById('login').classList.remove('hidden');
      _user = null;
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
