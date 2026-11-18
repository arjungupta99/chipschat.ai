# Recipe Box — plan

Plain HTML, CSS and JavaScript. No libraries, no build step, no network requests.
Everything is stored in `localStorage` and survives a reload.

## Files

| File | What it holds |
|---|---|
| `index.html` | The single page: header, search, list, detail, editor, shopping list views |
| `styles.css` | Mobile-first styles |
| `quantity.js` | Pure functions: parse/format amounts, parse ingredient lines, scale, merge into a shopping list. No DOM. |
| `app.js` | State, storage, rendering, event handling |
| `tests.html` | Opens in a browser and runs assertions against `quantity.js`, showing pass/fail on the page |
| `.chips/run.json` | `{"run": "python3 -m http.server 4173 --bind 127.0.0.1", "opens": "http://localhost:4173"}` |

Load `quantity.js` before `app.js` with plain `<script>` tags (no modules, so it also works when opened as a file). Expose its functions on one global, `window.Qty`.

## Data

`localStorage["recipeBox.v1"]` holds `{ "recipes": [Recipe], "selected": [id] }`.

```
Recipe = {
  id: string,            // crypto.randomUUID() with a Date.now()+random fallback
  title: string,
  servings: number,      // > 0
  ingredients: string[], // one line each, as typed: "1 1/2 cups flour"
  steps: string[],       // one step each
  updatedAt: number
}
```

Read storage inside try/catch; on bad JSON start empty rather than crash. Save after every change.
On first run with nothing stored, add 2–3 sample recipes that share ingredients (e.g. flour, sugar, eggs) so the shopping list can be tried at once.

## Views (one page, switched by `location.hash`)

- `#/` — list. Search box at top filters live by title **and** ingredient text, case-insensitive. Each row: checkbox (for the shopping list), title, servings. A bar shows "N selected — Shopping list" when any are ticked. "+ New recipe" button.
- `#/recipe/<id>` — detail. Title, a servings stepper (− / number input / +) that scales every ingredient amount live; steps as a numbered list. Edit and Delete buttons. Delete asks `confirm()`. Scaling is view-only; it does not change the saved recipe.
- `#/edit/<id>` and `#/new` — form: title (required), servings (required, number ≥ 1), ingredients textarea (one per line), steps textarea (one per line). Blank lines dropped. Save / Cancel.
- `#/shopping` — merged list from the ticked recipes, each at its saved servings. Show which recipes it came from. Each line has a tick-off checkbox (not saved is fine). "Clear selection" button.

Unknown id in the hash → back to `#/`. Browser back button must work.

## quantity.js — the heart of it

### Parsing an amount
Accept at the start of an ingredient line:
- integers `2`, decimals `1.5`, `.5`
- fractions `1/2`, mixed `1 1/2`
- unicode vulgar fractions `½ ⅓ ⅔ ¼ ¾ ⅕ ⅖ ⅗ ⅘ ⅙ ⅚ ⅛ ⅜ ⅝ ⅞`, alone or after a whole number with or without a space: `1½`, `1 ½`
- ranges `2-3` / `2–3`: keep both ends, scale both, show as a range; for merging use the upper end.

Keep amounts as exact fractions internally (`{n, d}` integers, reduced) so 1/3 + 2/3 = 1 exactly. Decimals become fractions (1.5 → 3/2).

### Parsing a line
`parseIngredient("1 1/2 cups flour")` → `{ qty, unit: "cup", name: "flour", raw }`.
- After the amount, if the next word is a known unit (any case, singular/plural/abbrev, optional trailing `.`), take it as the unit.
- The rest is the name; trim it, drop a leading `of ` ("2 cups of flour"), and for the merge key lowercase it and drop anything after a comma ("onion, chopped" → "onion").
- No amount ("salt to taste", "pinch of salt") → `qty: null`, kept as written.

Unit table (canonical name → aliases), at least:
- volume: `tsp` (teaspoon(s), t, tsp.), `tbsp` (tablespoon(s), T, tbs, tbsp.), `cup` (cups, c), `ml` (milliliter(s), millilitre(s)), `l` (liter(s), litre(s)), `fl oz`
- weight: `g` (gram(s)), `kg`, `oz` (ounce(s)), `lb` (lbs, pound(s))
- count-ish: `clove`, `can`, `pinch`, `slice`, `stick`, `piece` — merge only with the same unit

Note `T` = tbsp and `t` = tsp is case-sensitive; everything else is case-insensitive.

### Merging (shopping list)
Group by `name key` + unit family:
- Same canonical unit → add exactly. `2 cups flour` + `1 cup flour` → `3 cups flour`.
- Same family but different units → convert and add: volume via tsp (3 tsp = 1 tbsp, 16 tbsp = 1 cup) and ml (1 cup = 240 ml, 1 tsp ≈ 5 ml); weight via g (1 oz = 28.35 g, 1 lb = 16 oz). Within US volume (tsp/tbsp/cup) stay exact and show in the largest unit that gives a whole-or-simple amount (e.g. 4 tbsp + 1/4 cup → 1/2 cup). Mixing metric and US: show in the unit used by the first recipe, rounded sensibly. Keep it simple; correctness for the same unit matters most.
- No unit (`2 eggs` + `3 eggs`) → add the counts → `5 eggs`. Treat simple plurals as the same name (`egg`/`eggs`, `tomato`/`tomatoes`) when building the key.
- Lines with no amount: list once per name ("salt — to taste"), no adding.
- Different units that can't convert (cup vs clove): separate lines.

### Formatting
`formatQty` shows friendly kitchen fractions, not decimals:
- exact fractions with denominator 2, 3, 4, 8 → `1 ½`, `⅓`, `2 ¾`, `⅛` (unicode glyphs, whole part then a space)
- other values: round to nearest 1/8 if within 0.02, else up to 2 decimals with trailing zeros dropped
- 1.5 → `1 ½`; 3 → `3`; 0.333… (from 1/3) → `⅓`
- Pluralise the unit sensibly in display: `1 cup`, `3 cups`, `½ cup`; abbreviations (tsp, tbsp, g, ml) never pluralise.

Scaling: `qty × (newServings / savedServings)`, exact fractions throughout, then format.

## Phone

- `<meta name="viewport" content="width=device-width, initial-scale=1">`
- Single column, max-width ~720px centred on desktop.
- Tap targets ≥ 44px; inputs `font-size: 16px` or more (stops iOS zoom).
- Sticky header with search; sticky bottom action bar for "Shopping list" when items are ticked.
- `prefers-color-scheme: dark` support.
- Respect `env(safe-area-inset-bottom)` for the bottom bar.

## Safety
Render user text with `textContent` / `createElement`, never `innerHTML` with recipe data.

## Done means
1. `tests.html` shows all passing, covering at least: `1 1/2`, `½`, `1½`, `1 ½`, `.5`, `2-3`; `2 cups flour` + `1 cup flour` = `3 cups flour`; `1 1/2 cups flour` + `½ cup flour` = `2 cups flour`; `1/3 cup` + `2/3 cup` = `1 cup`; `2 eggs` + `3 eggs` = `5 eggs`; `1 tbsp` + `3 tsp` = `2 tbsp`; scaling 4 → 6 servings of `1 1/2 cups` = `2 ¼ cups`; no-amount lines kept.
2. Add, edit, delete, search, scale, tick, shopping list all work in a browser, and survive reload.
3. `python3 -m http.server 4173 --bind 127.0.0.1` from the project folder serves it.
