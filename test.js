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
global.File = function () {};
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

/* ---------- 6. the plan blocks drive targets and coaching ---------- */
/*
 * Getting this backwards would tell the user to cut calories during a maintenance
 * block, the opposite of the plan. "now" is frozen on the first and last day of
 * each block and the coach is fed synthetic weight series.
 */
console.log('\nPlan blocks');
const P = global.window.__plan;
if (!P) {
  fail('window.__plan test hook is missing from index.html');
} else {
  const RealDate = Date;
  let frozen = RealDate.now();
  global.Date = class extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(frozen); }
    static now() { return frozen; }
  };
  const freeze = iso => { frozen = new RealDate(iso + 'T12:00:00').getTime(); };
  const iso = ms => new RealDate(ms).toISOString().slice(0, 10);
  const DAY = 86400000;
  /* one weigh-in a day for `days` days ending today, moving `perWeek` kg a week */
  const weights = (startKg, perWeek, days) => {
    const out = [];
    for (let i = days; i >= 0; i--) out.push({ d: iso(frozen - i * DAY), v: startKg - perWeek * (days - i) / 7 });
    return out;
  };
  const coach = (w, t) => { P.V.w = w; P.V.t = t || []; return P.coachTexte(P.analyse()); };
  const expect = (label, got, want) => got === want ? pass(label) : fail(label + ' — got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want));

  P.BLOCS.forEach((b, i) => {
    const def = b[3];
    [b[1], b[2]].forEach(day => {
      freeze(day);
      const tag = 'bloc ' + (i + 1) + ' (' + b[0] + ') on ' + day + ': ';
      expect(tag + 'blocIdx', P.blocIdx(), i);
      expect(tag + 'enDeficit', P.enDeficit(), def);
      expect(tag + 'carbs target', P.targetFor('normal').v[2][0], def ? '1' : '2');
      expect(tag + 'carbs target on sport days', P.targetFor('sport').v[2][0], def ? '2' : '3');
    });
    freeze(b[1]);
    const tag = 'bloc ' + (i + 1) + ' coach, ';
    expect(tag + 'losing 0.8 kg/week', coach(weights(85, 0.8, 35)).c, def ? 'bad' : 'warn');
    expect(tag + 'losing 0.4 kg/week', coach(weights(85, 0.4, 35)).c, def ? '' : 'warn');
    expect(tag + 'flat for five weeks', coach(weights(85, 0, 35)).c, def ? 'warn' : '');
    expect(tag + 'gaining 0.3 kg/week', coach(weights(85, -0.3, 35)).c, def ? 'warn' : '');
    if (def) {
      const r = coach(weights(85, 0, 35), [{ d: iso(frozen - 28 * DAY), v: 96 }, { d: iso(frozen), v: 94 }]);
      expect(tag + 'flat weight but waist down 2 cm is not a plateau', r.c, '');
      /taille/i.test(r.h) ? pass(tag + 'recomposition message names the waist') : fail(tag + 'recomposition message should name the waist: ' + r.h);
    }
  });

  freeze('2026-08-01');
  expect('before the plan: blocIdx', P.blocIdx(), -1);
  expect('before the plan: carbs target', P.targetFor('normal').v[2][0], '2');

  /* the start date setting lays the blocks out again with the same lengths */
  const ref = P.buildBlocs(P.DEBUT_DEFAUT);
  expect('default start reproduces the original calendar', JSON.stringify(ref.map(b => [b[1], b[2]])),
    JSON.stringify([['2026-09-07', '2026-10-04'], ['2026-10-05', '2026-12-06'], ['2026-12-07', '2027-01-03'],
      ['2027-01-04', '2027-02-28'], ['2027-03-01', '2027-03-28']]));
  const shifted = P.buildBlocs('2026-09-21');
  expect('shifted start: first block starts on the new date', shifted[0][1], '2026-09-21');
  const nextDay = d => new RealDate(new RealDate(d).getTime() + DAY).toISOString().slice(0, 10);
  expect('shifted start: blocks stay contiguous',
    shifted.every((b, i) => i === 0 || b[1] === nextDay(shifted[i - 1][2])), true);
  expect('shifted start: every block keeps its length',
    shifted.every((b, i) => (new RealDate(b[2]) - new RealDate(b[1])) === (new RealDate(ref[i][2]) - new RealDate(ref[i][1]))), true);
  expect('shifted start: plan ends two weeks later', shifted[4][2], '2027-04-11');

  P.V.w = []; P.V.t = [];
  global.Date = RealDate;
}

/* ---------- 7. exercise levels ---------- */
/* Levels are only ever appended: saved data holds level indices (S.lvl, S.reps
   keys "A0:3"), so removing or reordering one would silently change what the
   user has already done. The first four levels of every exercise are pinned. */
console.log('\nExercise levels');
if (P && P.EX) {
  const PINNED = {
    A0: ['Mains contre un mur', 'Mains sur un plan de travail', 'Mains sur une chaise ou une table basse', 'Mains au sol', 'Pieds surélevés sur une chaise'],
    A1: ["S'asseoir sur une chaise et se relever", 'Squat au poids du corps', 'Squat avec 3 secondes de descente', 'Squat bulgare, pied arrière sur une chaise'],
    A2: ['Sur les genoux', 'Planche complète, 20 secondes', 'Planche complète, 45 secondes', 'Planche complète, une jambe décollée'],
    A3: ['Bras seuls, jambes immobiles', 'Jambes seules, bras immobiles', 'Bras et jambe opposés, amplitude courte', 'Bras et jambe opposés, amplitude complète'],
    A4: ['Deux pieds au sol', 'Deux pieds, 3 secondes de maintien en haut', 'Pieds surélevés sur une chaise', 'Une jambe tendue'],
    B0: ['Sans décoller, juste serrer les omoplates', 'Décoller les bras de quelques centimètres', 'Décoller bras et haut de la poitrine', 'Avec 2 secondes de maintien en haut'],
    B1: ["Amplitude courte, jusqu'aux épaules", 'Amplitude complète', 'Amplitude complète, très lente'],
    B2: ['Deux pieds au sol, bassin au sol', 'Deux pieds, épaules sur le canapé', "Une jambe, l'autre pied posé au sol", "Une jambe, l'autre jambe tendue en l'air"],
    B3: ['Fente statique en se tenant à un mur', 'Fente statique sans appui', 'Fente marchée', 'Fente marchée avec 2 secondes en bas'],
    B4: ['Bras seul', 'Jambe seule', 'Bras et jambe opposés', 'Bras et jambe opposés, 3 secondes de maintien'],
    B5: ['Genoux fléchis', 'Jambes tendues', 'Jambes tendues, jambe du dessus levée']
  };
  ['A', 'B'].forEach(k => P.EX[k].ex.forEach((e, i) => {
    const id = k + i, pinned = PINNED[id] || [];
    const kept = pinned.every((l, j) => e.lvls[j] === l);
    kept ? pass(id + ' ' + e.n + ': original levels untouched, ' + e.lvls.length + ' levels')
         : fail(id + ' ' + e.n + ': an original level was changed or reordered — saved level indices would drift');
    if (new Set(e.lvls).size !== e.lvls.length) fail(id + ': duplicate level label');
    if (!(e.start < e.lvls.length)) fail(id + ': start level out of range');
    if (e.lvls.length < 6) fail(id + ': fewer than six levels, the ceiling comes too soon');
  }));
} else fail('EX not exposed on window.__plan');

/* containers that must receive content, checked after the fetch promise settles */
realSetTimeout(() => {
  console.log('\nRendered containers');
  const MUST_FILL = ['prog', 'week', 'rules', 'phases', 'hands', 'tgt', 'ctxbar',
    'semwrap', 'repasinfo', 'quickwrap', 'waistwrap', 'sleepwrap', 'drinkwrap',
    'seancewrap', 'coachwrap', 'backupwrap', 'wstats', 'sstats', 'astats', 'hstats',
    'evowrap', 'fsopts', 's-seances-A', 's-seances-B'];
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
