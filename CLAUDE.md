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
| `test.js` | Headless smoke test: `node test.js`. Run before every commit. Also freezes the date in each block and checks that targets and coaching go the right way. | When adding new containers or changing block logic |
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
8. **Exercise levels are only ever appended.** `S.lvl`, `S.reps` keys
   (`"A0:3"`) and `S.snap` store level indices, so removing, reordering or
   rewording an existing entry of `lvls` silently changes what the user has
   already done. Add harder variants at the end of the list; `test.js` pins the
   original levels. New variants must stay equipment-free and elbow-safe: tempo,
   pauses, lever length and support, never grip or dips.

## Layout of `index.html`

Read it in this order; the script is one long IIFE-free block and order matters.

```
<style>          tokens, then components in rough page order
<div id=top>     sticky: header (title + mark, colour set per view) and
                 the sub-tab pills, rebuilt by goView. Pills share the width
                 and wrap rather than scroll sideways: keep them to five per
                 view with one-word labels.
<div id=ctxbar>  portion strip, only on the Assiette view, scrolls with content
<main>           one .view per tab, one .sub per sub-tab:
                 accueil  Aujourd'hui (actions only) | Le plan | Repères
                          the last two are .acc.grp accordions holding all the
                          explanatory content (rules, calendar, family,
                          sandwich, recipe sources, session guide, chart guide)
                 assiette Cette semaine | Frigo | Semaine prochaine
                          Cette semaine: the file's meals to tick, grouped by
                          `type` (pd / dej / din, guessed by `typeRepas` when
                          absent) in file order, carbs adapted to the day; the
                          #ctxbar strip (today's portions and the "Jour de
                          sport" toggle) shows only here.
                          Frigo: one list of chips — the file's fridge, items
                          bought (ticked in the shopping list), hand-added
                          items. Tap = consumed, cross = removed (confirmed),
                          consumed items hidden behind a toggle.
                          Semaine prochaine: the five-step ritual (counts,
                          catalogue of base meals with quantities, copy the
                          request, paste Claude's answer or pick a file,
                          shopping list with tick = bought and cross = removed,
                          plus copy-to-clipboard). The portions guide lives in
                          Plan > Repères.
                 seances  Séance A | Séance B
                 suivi    Poids | Taille | Sommeil | Alcool | Séances (calendar
                          of completed sessions + per-exercise evolution).
                          Every sub-tab opens with its chart.
                 reglages single page
<footer>
.tabbar          five bottom tabs
#courses, #run   full-screen overlays (shopping page, guided workout)
<script>
  1. storage helpers: ld / st, keys KS KA KV KU KW KR
  2. static data: WEEK, RULES, HANDS, MEALS, EX
  3. router: VIEWS, TABLABELS, goView, goSub
  4. accueil: BLOCS_DEF, buildBlocs, BLOCS, finPlan, blocIdx, enDeficit,
     renderProg (progress bar + block-change card), renderObj, renderPhases
  5. assiette: targetFor, estJourSport / setJourSport (per-day flag in
     A.sportDay), renderCtx (portion strip), renderTarget, renderProchaine
     (counts in W.nb, picks with quantities in W.next, catalogue from MEALS)
  6. séances: runStart… guided mode, renderSeance, checkComplete,
     renderHist (stats), renderCal (month calendar, CAL state), renderEvo, spark
  7. suivi: avg7, chart, renderW, renderT, addVal;
     backup: exporter (share sheet, download fallback), renderBackup, import, wipe
  8. semaine: esc, usedSet, refreshSem, renderSemaine, resumeSemaine /
     copierResume (next-week summary to clipboard), bindRecs, adaptPortions
     (rewrites a recipe's single carbs line to today's target), cmpPortions,
     refreshCmp, frigoItems / renderFrigo (Frigo tab, FRIGO_ALL toggle), achats
     (bought items), renderCourses (step 5 shopping list), texteCourses /
     copierCourses, ajouterExtra, etatSemaine (state lines) / resumeSemaine
     (the full request for Claude), copier (clipboard helper with textarea
     fallback), KR, renderRepasInfo, loadSemaine, chargerRepas (pasted text or
     file, code fences tolerated)
  9. meal-file import handlers
 10. sommeil / alcool
 11. feedback loop: analyse, tailleTrend, coachTexte, renderQuick, renderWaist,
     renderSleepQuick, renderDrinkQuick, renderSeanceQuick, renderCoach, renderBilan
 12. réglages: renderFs, renderDebut / appliquerDebut (plan start date);
     install prompt + diagnostic
 13. init: seed date inputs, call every render*, expose window.__plan for
     test.js, goView('accueil')
</script>
```

### localStorage keys

| Key | Holds |
|---|---|
| `plan.v1.seances` | `lvl` (level per exercise), `reps` (per exercise+level), `last`, `snap` (per-session snapshots), `log`, `done`, `day` |
| `plan.v1.assiette` | `fav` (legacy favourites, no longer used but kept), `mode` (legacy mirror of the sport flag), `sportDay` (ISO date: today is a sport day when it equals today) |
| `plan.v1.suivi` | `w` weight, `t` waist, `s` sleep hours, `a` drinks — all `[{d:'YYYY-MM-DD', v:Number}]` |
| `plan.v1.ui` | `fsx` text scale, `v` migration version, `bloc` last acknowledged plan block, `exp` date of the last backup, `debut` first day of the plan (default `2026-09-07`, editable in Settings) |
| `plan.v1.semaine` | `sem` (week label), `done` (meal `r<i>`, aparté `a<i>` and shopping `c<g>_<i>` checkboxes), `hide` (shopping items removed from the list by hand), `gone` (file or bought fridge items removed by hand), `extra` (fridge items added by hand), `xdone` (fridge items marked consumed, keyed by label), `next` (meals picked for next week, `{title: count}`, emptied when a file is loaded), `nb` (`{pd, dej, din}` how many breakfasts, lunches, dinners to plan). `done`/`hide`/`gone` reset with the week; `extra`/`xdone`/`nb` survive it |
| `plan.v1.repas` | `{at, data}` — a `repas.json` imported from the Settings tab, overrides the fetched file |

Export/import in Settings serialises every `plan.v1.*` key, so any new key is
included automatically.

## The plan blocks

`BLOCS` drives real behaviour, not just display. Each entry is
`[name, start, end, isDeficit, description]`. It is built by `buildBlocs()`
from `BLOCS_DEF` (name, length in weeks, isDeficit, description) and the start
date in `plan.v1.ui.debut`; changing the date in Settings shifts every block and
keeps the lengths. Never hardcode a plan date elsewhere: use `BLOCS`,
`finPlan()` and the `frl` / `frm` / `frs` formatters.

- Portion targets: `targetFor()` returns one cupped hand of carbs in a deficit
  block, two otherwise, plus one on a sport day. Recipes in the Semaine tab
  show their carbs line rewritten to that target (`adaptPortions`); protein and
  vegetables are never rewritten.
- Coaching: during a non-deficit block a flat weight is reported as success, and
  losing more than 0.3 kg/week triggers a warning to eat more. Getting this
  backwards would tell the user to cut calories during the maintenance block,
  which is the opposite of the plan. `test.js` checks both directions.
- A flat or slightly rising weight with the waist down 1 cm or more over three
  weeks (`tailleTrend`) is reported as recomposition, not a plateau.
- Entering a new block shows a one-time card on the home screen.

## Weekly ritual

The "Semaine prochaine" sub-tab of Assiette drives it in five steps. The user
sets how many breakfasts, lunches and dinners to plan, picks base meals with
quantities (the same breakfast three times is normal), and copies a request.
The user does this from a plain Claude conversation on the phone, not from
this repo, so `resumeSemaine()` builds a self-contained prompt: the state (block
and portions, meals done and not done, what is left in the fridge, counts,
picks, weight and waist trend), the rules, the whole `MEALS` catalogue with
portions, and the exact JSON format. Keep that prompt in sync when the format
or the rules change; `test.js` checks it carries every section and every base
meal.

Claude's job from that text: keep every picked meal (repeated as asked),
complete each category with other base meals up to the counts, prefer meals
that use what is left in the fridge, and write `courses` as what is missing
once the fridge is subtracted. `utilise` labels may come from `frigo` or from
`courses` items, since bought items become fridge chips. The user pastes the
answer in step 4 (`chargerRepas` strips code fences and prose) or picks a file;
loading empties the picks. Step 5 is the shopping list: a ticked item counts
as in the fridge, a removed one is ignored. Committing `repas.json` to the repo
still works as the default when nothing was loaded.

```jsonc
{
  "semaine": "Semaine du 7 au 13 septembre",   // resets the checkboxes when it changes
  "note": "one line of context",
  "frigo": ["Gaspacho", "Taboulé"],            // exact labels
  "congelo": ["Lardons"], "congeloNote": "…",
  "repas": [{
    "titre": "…", "type": "din",                // pd | dej | din; groups the list, file order = recommended order
    "quand": "Ce soir",
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
