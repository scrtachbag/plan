#!/usr/bin/env node
/*
 * Smoke test for index.html.
 *
 * The app is one long script with no module boundaries: a ReferenceError halfway
 * through silently kills every statement after it, and the page still looks fine
 * until you notice half the UI never rendered. A syntax check does not catch that.
 * This runs the real script against a fake DOM and fails loudly.
 *
 *   node test.js
 *
 * Exit code 0 means safe to commit.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const realSetTimeout = setTimeout;
let failures = 0;

function fail(msg) { failures++; console.log('  FAIL  ' + msg); }
function pass(msg) { console.log('  ok    ' + msg); }

/* ---------- 1. files present ---------- */
console.log('\nFiles');
const REQUIRED = ['index.html', 'repas.json', 'sw.js', 'manifest.json',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
REQUIRED.forEach(f => {
  fs.existsSync(path.join(ROOT, f)) ? pass(f) : fail(f + ' is missing');
});

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const script = (html.match(/<script>([\s\S]*)<\/script>/) || [])[1];
if (!script) { fail('no <script> block found in index.html'); process.exit(1); }

/* ---------- 2. style conventions ---------- */
console.log('\nConventions');

const style = (html.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1];
const rawFontSizes = [];
style.split('\n').forEach(line => {
  if (line.includes('fsx-exempt')) return;          // deliberately fixed, documented in CLAUDE.md
  [...line.matchAll(/font-size:\s*(?!calc)([0-9.]+px)/g)].forEach(m => rawFontSizes.push(m[1]));
});
rawFontSizes.length
  ? fail('font-size not wrapped in calc(... * var(--fsx)): ' + rawFontSizes.join(', ') +
         '  (only .tabbar .lab may be fixed — check it is that one)')
  : pass('every font-size scales with --fsx');

const braceRules = [...style.matchAll(/\{[^{}]*\}/g)].map(m => m[0])
  .filter(r => /border-left:\s*[0-9]/.test(r) && /border-radius/.test(r));
braceRules.length
  ? fail('coloured side border on a rounded block draws a curly brace: ' + braceRules[0])
  : pass('no side border on a rounded block');

/* ---------- 3. service worker version ---------- */
console.log('\nService worker');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const version = (sw.match(/VERSION\s*=\s*'([^']+)'/) || [])[1];
version ? pass('cache version is ' + version + " — bump it if index.html changed")
        : fail('no VERSION found in sw.js');

/* ---------- 4. repas.json shape ---------- */
console.log('\nrepas.json');
let repas = null;
try {
  repas = JSON.parse(fs.readFileSync(path.join(ROOT, 'repas.json'), 'utf8'));
  pass('parses as JSON');
} catch (e) { fail('invalid JSON: ' + e.message); }

if (repas) {
  const fridge = new Set(repas.frigo || []);
  const referenced = new Set();
  [...(repas.repas || []), ...(repas.aparte || [])].forEach(r => {
    (r.utilise || []).forEach(x => referenced.add(x));
  });
  const unknown = [...referenced].filter(x => !fridge.has(x));
  unknown.length
    ? fail('utilise labels absent from frigo (they will never grey out): ' + unknown.join(', '))
    : pass('every utilise label matches a frigo entry');

  const orphans = [...fridge].filter(x => !referenced.has(x));
  orphans.length
    ? console.log('  note  fridge items used by no meal: ' + orphans.join(', '))
    : pass('every fridge item is used by at least one meal');

  const badPortions = [];
  (repas.repas || []).forEach(r => (r.portions || []).forEach(p => {
    const hasUnit = /paume|poing|main en coupe|pouce/.test(p);
    const hasNum = /^[0-9½]/.test(p);
    if (hasUnit && !hasNum) badPortions.push(r.titre + ' → "' + p + '"');
  }));
  badPortions.length
    ? fail('portion strings with a unit but no leading number: ' + badPortions.join('; '))
    : pass('portion strings are parseable by cmpPortions');
}

/* ---------- 5. run the script against a fake DOM ---------- */
console.log('\nRuntime');

const filled = [];
function makeEl(id) {
  const el = {
    id, value: '', textContent: '', className: '', disabled: false, files: [],
    scrollTop: 0, dataset: {}, style: { setProperty() {} },
    classList: { add() {}, remove() {}, toggle() { return false; }, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, click() {}, remove() {},
    insertAdjacentHTML() {}, appendChild() {},
    querySelector() { return makeEl('_'); }, querySelectorAll() { return []; },
    get innerHTML() { return ''; },
    set innerHTML(v) { if (id !== '_') filled.push(id); }
  };
  return el;
}

const staticIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));

global.document = {
  getElementById: id => makeEl(id),
  querySelector: () => makeEl('_'),
  querySelectorAll: () => [],
  createElement: () => makeEl('_'),
  documentElement: { style: { setProperty() {} } },
  body: { dataset: {} },
  addEventListener() {}
};
global.window = { addEventListener() {}, matchMedia: () => ({ matches: false }), scrollTo() {} };
global.location = { protocol: 'https:' };
global.navigator = {
  serviceWorker: { register: () => Promise.resolve(), getRegistration: () => Promise.resolve(null) }
};
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] || null; },
  setItem(k, v) { this._d[k] = v; },
  removeItem(k) { delete this._d[k]; },
  key(i) { return Object.keys(this._d)[i]; },
  get length() { return Object.keys(this._d).length; }
};
global.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(repas || {}) });
global.FileReader = function () {};
global.Blob = function () {};
global.URL = { createObjectURL: () => '' };
global.confirm = () => false;
global.setInterval = () => 0;
global.clearInterval = () => {};
global.setTimeout = () => 0;

process.on('unhandledRejection', e => fail('unhandled promise rejection: ' + (e && e.message)));

try {
  new Function(script)();
  pass('script runs to completion with no exception');
} catch (e) {
  fail('exception: ' + e.message + '\n        ' + (e.stack.split('\n')[1] || '').trim());
}

/* containers that must receive content, checked after the fetch promise settles */
realSetTimeout(() => {
  console.log('\nRendered containers');
  const MUST_FILL = ['prog', 'week', 'rules', 'phases', 'hands', 'tgt', 'ctxbar',
    'semwrap', 'repasinfo', 'quickwrap', 'waistwrap', 'sleepwrap', 'drinkwrap',
    'coachwrap', 'wstats', 'sstats', 'astats', 'hstats', 'evowrap', 'fsopts',
    's-seances-A', 's-seances-B'];
  MUST_FILL.forEach(id => {
    if (!staticIds.has(id)) fail(id + ' is referenced but absent from the markup');
    else if (!filled.includes(id)) fail(id + ' was never filled — a render function did not run');
    else pass(id);
  });

  console.log('');
  if (failures) {
    console.log(failures + ' failure' + (failures > 1 ? 's' : '') + '. Do not commit.\n');
    process.exit(1);
  }
  console.log('All checks passed. Safe to commit.\n');
}, 80);
