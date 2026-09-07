# Mon plan — project brief

A single-page PWA hosted on GitHub Pages at `https://scrtachbag.github.io/plan/`.
It supports a personal six-month body-recomposition plan: meals, bodyweight
workouts, and daily measurement tracking. Installed on Android as a standalone app.

## Files

| File | Role | Changes how often |
|---|---|---|
| `index.html` | The entire app: markup, CSS and JS in one file. No build, no dependencies. | On feature work |
| `repas.json` | The week's meals, fridge inventory and shopping list. | Weekly |
| `sw.js` | Service worker. Cache-first shell, network-first for `index.html` and `repas.json`. | On every `index.html` change (bump `VERSION`) |
| `manifest.json` | PWA manifest. | Rarely |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | App icons: a descending curve on dark navy. | Rarely |
| `test.js` | Headless smoke test: `node test.js`. Run before every commit. | When adding new containers |
| `CLAUDE.md` | This file. | When conventions change |

## Hard rules

1. **One file.** All app code stays in `index.html`. No bundler, no npm, no CDN
   imports, no framework. The user updates the site by dragging files into the
   GitHub web UI, so extra files cost him real effort.
2. **Run `node test.js` before delivering.** It executes the script against a
   fake DOM and fails on runtime errors. A syntax check is not enough — a
   `ReferenceError` in the middle of the script silently kills everything after
   it, which has already shipped a broken build once.
3. **Bump `VERSION` in `sw.js`** whenever `index.html` changes, or installed
   clients may keep serving the old file.
4. **Every font-size must be `calc(Npx * var(--fsx))`.** `--fsx` is the user's
   text-size setting. A raw `px` font-size will not scale and breaks the setting.
   Deliberate exceptions are marked with a `/*fsx-exempt*/` comment on the same
   line and skipped by `test.js`: the tab-bar labels and the full-screen rest
   countdown, both of which must stay legible at the Compact setting.
5. **Never put a coloured side border on a rounded block.** The border follows
   the corner radius and draws what looks like a curly brace. Carry colour with
   text, fills or full borders instead.
6. **Never change existing `localStorage` key names or value shapes.** They hold
   months of the user's data with no server backup. Migrate in place if a shape
   must change, as `FSMIGR` does for the text-size scale.
7. **UI copy is French.** Code, comments and this document are English.

## Layout of `index.html`

Read it in this order; the script is one long IIFE-free block and order matters.

```
<style>          tokens, then components in rough page order
<header>         dynamic: title + mark, colour set per view
<div id=pills>   sub-tab bar, rebuilt by goView
<div id=ctxbar>  portion strip, only on the Assiette view
<main>           one .view per tab, one .sub per sub-tab
<footer>
.tabbar          five bottom tabs
#courses, #run   full-screen overlays (shopping page, guided workout)
<script>
  1. storage helpers: ld / st, keys KS KA KV KU KW KR
  2. static data: WEEK, RULES, HANDS, MEALS, EX
  3. router: VIEWS, TABLABELS, goView, goSub
  4. accueil: BLOCS, blocIdx, enDeficit, progress bar, block-change card
  5. assiette: targetFor, renderTarget, favourites, base meal list
  6. séances: runStart… guided mode, renderSeance, checkComplete,
     renderHist, renderEvo, spark
  7. suivi: avg7, chart, renderW, renderT
  8. semaine: esc, usedSet, refreshSem, renderSemaine, bindRecs,
     cmpPortions, refreshCmp, ouvrirCourses, KR, renderRepasInfo, loadSemaine
  9. meal-file import handlers
 10. sommeil / alcool
 11. feedback loop: analyse, coachTexte, renderQuick, renderWaist,
     renderSleepQuick, renderDrinkQuick, renderCoach, renderBilan
 12. install prompt + diagnostic
 13. init: seed date inputs, call every render*, goView('accueil')
</script>
```

### localStorage keys

| Key | Holds |
|---|---|
| `plan.v1.seances` | `lvl` (level per exercise), `reps` (per exercise+level), `last`, `snap` (per-session snapshots), `log`, `done`, `day` |
| `plan.v1.assiette` | `fav` (favourite meals), `mode` |
| `plan.v1.suivi` | `w` weight, `t` waist, `s` sleep hours, `a` drinks — all `[{d:'YYYY-MM-DD', v:Number}]` |
| `plan.v1.ui` | `fsx` text scale, `v` migration version, `bloc` last acknowledged plan block |
| `plan.v1.semaine` | `sem` (week label), `done` (meal and shopping checkboxes) |
| `plan.v1.repas` | `{at, data}` — a `repas.json` imported from the Settings tab, overrides the fetched file |

Export/import in Settings serialises every `plan.v1.*` key, so any new key is
included automatically.

## The plan blocks

`BLOCS` drives real behaviour, not just display. Each entry is
`[name, start, end, isDeficit, description]`.

- Portion targets: `targetFor()` returns one cupped hand of carbs in a deficit
  block, two otherwise.
- Coaching: during a non-deficit block a flat weight is reported as success, and
  losing weight triggers a warning to eat more. Getting this backwards would tell
  the user to cut calories during the maintenance block, which is the opposite of
  the plan.
- Entering a new block shows a one-time card on the home screen.

## Weekly ritual

The user describes what is in his fridge; the assistant returns a new
`repas.json`. He can either commit it or load it from Settings on the phone.

```jsonc
{
  "semaine": "Semaine du 7 au 13 septembre",   // resets the checkboxes when it changes
  "note": "one line of context",
  "frigo": ["Gaspacho", "Taboulé"],            // exact labels
  "congelo": ["Lardons"], "congeloNote": "…",
  "repas": [{
    "titre": "…", "quand": "Ce soir",
    "portions": ["2 paumes de poulet", "1 main en coupe de riz", "2 poings de légumes"],
    "prot": "35 g de protéines",
    "note": "…",
    "utilise": ["Gaspacho", "Jambon blanc"]    // MUST match `frigo` labels exactly
  }],
  "aparte": [{ "titre": "…", "texte": "…", "utilise": ["Pâté"] }],
  "courses": [{ "rayon": "Légumes", "items": ["Concombre"] }],
  "coursesNote": "…"
}
```

`utilise` labels must match `frigo` labels character for character — that link is
what greys out a fridge item once every meal using it is ticked.

Portion strings are parsed by `cmpPortions()`: they must start with a number and
contain one of `paume`, `poing`, `main en coupe`, `pouce`.

## Domain rules baked into the content

Do not silently contradict these when editing copy; they are the plan.

- Hand portions, never scales or calorie counting: palm = protein, fist =
  vegetables, cupped hand = carbs, thumb = fat.
- Target rate is 0.4 kg per week. Faster is treated as a problem, not a win.
- Two 30-minute bodyweight sessions a week. No gym, no equipment.
- Dips and inverted rows are deliberately excluded (elbow); planks are on
  forearms, never on hands.
- Meals are shared with children; the deficit, portion control and tracking are
  never applied to them.
- The app is not medical advice and says so in the footer and Settings.

## Deliberately out of scope

A full calorie counter, which contradicts the hand-portion principle. Push
notifications, which need a server. Accounts or cloud sync — the JSON export is
the backup. A native APK; the PWA covers the need without a toolchain.
