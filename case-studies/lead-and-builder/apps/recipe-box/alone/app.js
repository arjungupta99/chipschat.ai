(function () {
  'use strict';

  const Q = window.Quantities;
  const STORE_KEY = 'recipeBox.v1';
  const app = document.getElementById('app');

  // ---------- storage ----------

  // recipes: [{ id, title, servings, ingredients: [line], steps: [line], updated }]
  // selected: { recipeId: servings } — recipes ticked for the shopping list
  // bought: { itemKey: true } — items ticked off on the shopping list
  let state = { recipes: [], selected: {}, bought: {} };
  let storageOk = true;

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved && Array.isArray(saved.recipes)) {
        state = { recipes: saved.recipes, selected: saved.selected || {}, bought: saved.bought || {} };
      }
    } catch (e) {
      storageOk = false;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      storageOk = true;
    } catch (e) {
      storageOk = false;
    }
  }

  const findRecipe = (id) => state.recipes.find((r) => r.id === id);
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const sorted = () => [...state.recipes].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));

  // ---------- helpers ----------

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plural = (n, one, many) => `${fmtServings(n)} ${n === 1 ? one : many}`;
  const fmtServings = (n) => String(Math.round(n * 100) / 100);
  const $ = (sel) => app.querySelector(sel);

  function go(hash, replace) {
    if (replace) location.replace(hash);
    else location.hash = hash;
  }

  function header(left, right) {
    return `<header class="bar">${left}<div class="bar-actions">${right || ''}</div></header>`;
  }
  const backLink = (href, label) => `<a class="back" href="${href}"><span aria-hidden="true">‹</span> ${label}</a>`;
  const storageWarning = () => storageOk ? '' :
    '<p class="warning">This browser isn’t letting the app save. Changes will be lost when you reload (private browsing can cause this).</p>';

  // ---------- list ----------

  let query = '';

  function matches(r, terms) {
    const hay = [r.title, ...r.ingredients, ...r.steps].join('\n').toLowerCase();
    return terms.every((t) => hay.includes(t));
  }

  function renderList() {
    document.title = 'Recipe Box';
    const count = state.recipes.length;
    app.innerHTML = `
      ${header('<h1 class="brand">Recipe Box</h1>', '<a class="btn primary" href="#/new">+ Add recipe</a>')}
      ${storageWarning()}
      ${count ? `
        <label class="search">
          <span class="visually-hidden">Search recipes</span>
          <input id="search" type="search" placeholder="Search titles, ingredients, steps…" value="${esc(query)}" autocomplete="off">
        </label>
        <p class="hint">Tick recipes to make one shopping list.</p>
        <ul id="cards" class="cards"></ul>` : `
        <div class="empty">
          <p>No recipes yet.</p>
          <a class="btn primary" href="#/new">Add your first recipe</a>
          <button class="btn" id="examples" type="button">Add two example recipes</button>
        </div>`}
      <div id="selbar"></div>`;

    if (!count) {
      $('#examples').addEventListener('click', addExamples);
      return;
    }
    const search = $('#search');
    search.addEventListener('input', () => { query = search.value; renderCards(); });
    renderCards();
    renderSelBar();
  }

  function renderCards() {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const list = sorted().filter((r) => matches(r, terms));
    const cards = $('#cards');
    if (!list.length) {
      cards.innerHTML = `<li class="none">No recipes match “${esc(query.trim())}”.</li>`;
      return;
    }
    cards.innerHTML = list.map((r) => `
      <li class="card${state.selected[r.id] ? ' is-selected' : ''}">
        <label class="tick" title="Add to shopping list">
          <input type="checkbox" data-id="${esc(r.id)}" ${state.selected[r.id] ? 'checked' : ''}>
          <span class="visually-hidden">Add ${esc(r.title)} to shopping list</span>
        </label>
        <a href="#/recipe/${encodeURIComponent(r.id)}">
          <strong>${esc(r.title)}</strong>
          <span class="meta">${plural(r.servings, 'serving', 'servings')} · ${plural(r.ingredients.length, 'ingredient', 'ingredients')}</span>
        </a>
      </li>`).join('');
    cards.querySelectorAll('input[type=checkbox]').forEach((box) => {
      box.addEventListener('change', () => {
        setSelected(box.dataset.id, box.checked);
        box.closest('.card').classList.toggle('is-selected', box.checked);
        renderSelBar();
      });
    });
  }

  function renderSelBar() {
    const n = Object.keys(state.selected).length;
    $('#selbar').innerHTML = n ? `
      <div class="selbar">
        <button class="btn ghost" id="clearsel" type="button">Clear</button>
        <a class="btn primary" href="#/shopping">Shopping list (${n})</a>
      </div>` : '';
    if (n) $('#clearsel').addEventListener('click', () => { clearSelection(); renderCards(); renderSelBar(); });
  }

  function setSelected(id, on, servings) {
    const r = findRecipe(id);
    if (on && r) state.selected[id] = servings || state.selected[id] || r.servings;
    else delete state.selected[id];
    save();
  }

  function clearSelection() {
    state.selected = {};
    state.bought = {};
    save();
  }

  // ---------- one recipe ----------

  const scaledTo = {}; // recipeId -> servings chosen on the recipe page (this visit)

  function renderRecipe(id) {
    const r = findRecipe(id);
    if (!r) return renderMissing();
    document.title = r.title + ' · Recipe Box';
    const servings = scaledTo[id] || r.servings;
    app.innerHTML = `
      ${header(backLink('#/', 'Recipes'), `<a class="btn" href="#/edit/${encodeURIComponent(id)}">Edit</a>`)}
      ${storageWarning()}
      <article class="recipe">
        <h1>${esc(r.title)}</h1>
        <div class="scaler">
          <span class="scaler-label" id="serv-label">Servings</span>
          <div class="stepper" role="group" aria-labelledby="serv-label">
            <button class="btn round" id="less" type="button" aria-label="Fewer servings">−</button>
            <input id="servings" type="number" inputmode="decimal" min="0.25" step="any" value="${fmtServings(servings)}" aria-labelledby="serv-label">
            <button class="btn round" id="more" type="button" aria-label="More servings">+</button>
          </div>
          <button class="btn ghost small" id="reset" type="button">Reset</button>
        </div>
        <p class="scale-note" id="scale-note"></p>
        <h2>Ingredients</h2>
        <ul class="ingredients" id="ingredients"></ul>
        ${r.steps.length ? `<h2>Steps</h2><ol class="steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
        <div class="actions">
          <button class="btn" id="toggle-shop" type="button"></button>
          <button class="btn danger" id="delete" type="button">Delete recipe</button>
        </div>
      </article>`;

    const input = $('#servings');
    const toggle = $('#toggle-shop');

    function current() {
      const v = parseFloat(input.value);
      return v > 0 ? v : r.servings;
    }

    function update() {
      const s = current();
      const factor = s / r.servings;
      if (s === r.servings) delete scaledTo[id];
      else scaledTo[id] = s;
      $('#ingredients').innerHTML = r.ingredients.length
        ? r.ingredients.map((line) => `<li>${esc(Q.scaleLine(line, factor))}</li>`).join('')
        : '<li class="none">No ingredients listed.</li>';
      $('#scale-note').textContent = factor === 1 ? '' : `Scaled from ${plural(r.servings, 'serving', 'servings')} (×${fmtServings(factor)})`;
      $('#reset').hidden = factor === 1;
      // keep the shopping list in step with the servings shown here
      if (state.selected[id] && state.selected[id] !== s) { state.selected[id] = s; save(); }
      const on = !!state.selected[id];
      toggle.textContent = on ? '✓ On shopping list' : 'Add to shopping list';
      toggle.classList.toggle('primary', !on);
    }

    input.addEventListener('input', update);
    input.addEventListener('blur', () => { input.value = fmtServings(current()); update(); });
    $('#less').addEventListener('click', () => {
      const s = current();
      input.value = fmtServings(s > 1 ? Math.ceil(s) - 1 : Math.max(0.25, s / 2));
      update();
    });
    $('#more').addEventListener('click', () => {
      const s = current();
      input.value = fmtServings(s < 1 ? Math.min(1, s * 2) : Math.floor(s) + 1);
      update();
    });
    $('#reset').addEventListener('click', () => { input.value = fmtServings(r.servings); update(); });
    toggle.addEventListener('click', () => { setSelected(id, !state.selected[id], current()); update(); });
    $('#delete').addEventListener('click', () => {
      if (!confirm(`Delete “${r.title}”? This can’t be undone.`)) return;
      state.recipes = state.recipes.filter((x) => x.id !== id);
      delete state.selected[id];
      delete scaledTo[id];
      save();
      go('#/', true);
    });
    update();
  }

  function renderMissing() {
    app.innerHTML = `${header(backLink('#/', 'Recipes'))}
      <div class="empty"><p>That recipe isn’t here any more.</p><a class="btn primary" href="#/">Back to recipes</a></div>`;
  }

  // ---------- add / edit ----------

  function renderEdit(id) {
    const r = id ? findRecipe(id) : null;
    if (id && !r) return renderMissing();
    document.title = (r ? 'Edit ' + r.title : 'New recipe') + ' · Recipe Box';
    const back = r ? `#/recipe/${encodeURIComponent(id)}` : '#/';
    app.innerHTML = `
      ${header(backLink(back, 'Cancel'), '')}
      <form class="editor" id="editor" novalidate>
        <h1>${r ? 'Edit recipe' : 'New recipe'}</h1>
        <label class="field">
          <span>Title</span>
          <input name="title" required autocomplete="off" value="${esc(r ? r.title : '')}" placeholder="e.g. Banana bread">
        </label>
        <label class="field narrow">
          <span>Servings</span>
          <input name="servings" type="number" inputmode="decimal" min="0.25" step="any" required value="${r ? esc(r.servings) : '4'}">
        </label>
        <label class="field">
          <span>Ingredients <small>one per line, amount first</small></span>
          <textarea name="ingredients" rows="8" placeholder="2 cups flour&#10;1 1/2 tsp baking powder&#10;½ cup sugar&#10;2 eggs&#10;Salt to taste">${esc(r ? r.ingredients.join('\n') : '')}</textarea>
        </label>
        <label class="field">
          <span>Steps <small>one per line</small></span>
          <textarea name="steps" rows="8" placeholder="Heat the oven to 180°C.&#10;Mix the dry ingredients.">${esc(r ? r.steps.join('\n') : '')}</textarea>
        </label>
        <p class="error" id="error" role="alert"></p>
        <div class="actions">
          <a class="btn" href="${back}">Cancel</a>
          <button class="btn primary" type="submit">${r ? 'Save changes' : 'Save recipe'}</button>
        </div>
      </form>`;

    const form = $('#editor');
    const f = form.elements;
    if (!r) f.title.focus();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = f.title.value.trim();
      const servings = parseFloat(f.servings.value);
      const error = $('#error');
      if (!title) { error.textContent = 'Give the recipe a title.'; f.title.focus(); return; }
      if (!(servings > 0)) { error.textContent = 'Servings must be a number above 0.'; f.servings.focus(); return; }
      const lines = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean);
      const recipe = {
        id: r ? r.id : newId(),
        title,
        servings,
        ingredients: lines(f.ingredients.value).map((l) => l.replace(/^[-•*]\s+/, '')),
        steps: lines(f.steps.value).map((l) => l.replace(/^(?:step\s*)?\d+\s*[.):-]\s*/i, '')),
        updated: Date.now(),
      };
      if (r) {
        Object.assign(r, recipe);
        if (state.selected[r.id] && r.servings !== servings) state.selected[r.id] = servings;
        delete scaledTo[r.id];
      } else {
        state.recipes.push(recipe);
      }
      save();
      go(`#/recipe/${encodeURIComponent(recipe.id)}`, true);
    });
  }

  // ---------- shopping list ----------

  function renderShopping() {
    document.title = 'Shopping list · Recipe Box';
    // forget recipes that were deleted
    for (const id of Object.keys(state.selected)) if (!findRecipe(id)) delete state.selected[id];
    const chosen = sorted().filter((r) => state.selected[r.id]);

    if (!chosen.length) {
      app.innerHTML = `${header(backLink('#/', 'Recipes'))}
        <h1>Shopping list</h1>
        <div class="empty"><p>No recipes ticked yet. Tick recipes on the list, or use “Add to shopping list” on a recipe.</p>
        <a class="btn primary" href="#/">Choose recipes</a></div>`;
      return;
    }

    const items = Q.combine(chosen.flatMap((r) =>
      r.ingredients.map((line) => ({ line, factor: state.selected[r.id] / r.servings, source: r.title }))));
    const left = items.filter((i) => !state.bought[i.key]).length;

    app.innerHTML = `
      ${header(backLink('#/', 'Recipes'), '<button class="btn ghost" id="clear-all" type="button">Clear list</button>')}
      ${storageWarning()}
      <h1>Shopping list</h1>
      <section class="chosen" aria-label="Recipes on this list">
        ${chosen.map((r) => `
          <div class="chosen-row">
            <a href="#/recipe/${encodeURIComponent(r.id)}">${esc(r.title)}</a>
            <label class="mini-servings">
              <input type="number" inputmode="decimal" min="0.25" step="any" data-id="${esc(r.id)}" value="${fmtServings(state.selected[r.id])}">
              <span>servings</span>
            </label>
            <button class="btn ghost small" data-remove="${esc(r.id)}" type="button" aria-label="Remove ${esc(r.title)} from list">✕</button>
          </div>`).join('')}
      </section>
      <p class="hint">${items.length ? `${left} of ${items.length} item${items.length === 1 ? '' : 's'} left · tap an item when it’s in the basket` : 'These recipes have no ingredients.'}</p>
      <ul class="shop">
        ${items.map((i) => `
          <li class="${state.bought[i.key] ? 'is-bought' : ''}">
            <label>
              <input type="checkbox" data-key="${esc(i.key)}" ${state.bought[i.key] ? 'checked' : ''}>
              <span class="item">
                <span class="item-text">${esc(i.text)}</span>
                ${chosen.length > 1 ? `<span class="from">${esc(i.sources.join(', '))}</span>` : ''}
              </span>
            </label>
          </li>`).join('')}
      </ul>
      ${Object.keys(state.bought).length ? '<button class="btn ghost" id="untick" type="button">Untick all items</button>' : ''}`;

    app.querySelectorAll('.chosen input[type=number]').forEach((input) => {
      input.addEventListener('change', () => {
        const v = parseFloat(input.value);
        if (v > 0) { state.selected[input.dataset.id] = v; save(); }
        renderShopping();
      });
    });
    app.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => {
      setSelected(b.dataset.remove, false);
      renderShopping();
    }));
    app.querySelectorAll('.shop input[type=checkbox]').forEach((box) => box.addEventListener('change', () => {
      if (box.checked) state.bought[box.dataset.key] = true;
      else delete state.bought[box.dataset.key];
      save();
      renderShopping();
    }));
    $('#clear-all').addEventListener('click', () => {
      if (!confirm('Untick all recipes and clear the shopping list?')) return;
      clearSelection();
      go('#/', true);
    });
    const untick = $('#untick');
    if (untick) untick.addEventListener('click', () => { state.bought = {}; save(); renderShopping(); });
  }

  // ---------- examples ----------

  function addExamples() {
    state.recipes.push({
      id: newId(), title: 'Buttermilk pancakes', servings: 4, updated: Date.now(),
      ingredients: ['2 cups flour', '2 tbsp sugar', '1 1/2 tsp baking powder', '½ tsp salt', '2 cups buttermilk', '2 eggs', '3 tbsp butter, melted'],
      steps: ['Whisk the flour, sugar, baking powder and salt in a bowl.', 'Beat the buttermilk, eggs and melted butter together, then stir into the dry ingredients until just combined.', 'Cook ¼ cup of batter at a time on a hot buttered pan until bubbles form, then flip.'],
    }, {
      id: newId(), title: 'Banana bread', servings: 8, updated: Date.now(),
      ingredients: ['1 cup flour', '½ cup sugar', '1 tsp baking soda', '¼ tsp salt', '3 ripe bananas, mashed', '1 egg', '⅓ cup butter, melted', '1 tsp vanilla'],
      steps: ['Heat the oven to 175°C / 350°F and grease a loaf tin.', 'Mix the bananas, melted butter, sugar, egg and vanilla.', 'Stir in the flour, baking soda and salt.', 'Bake for about 60 minutes, until a skewer comes out clean.'],
    });
    save();
    render();
  }

  // ---------- routing ----------

  function render() {
    const [, view, id] = (location.hash || '#/').split('/');
    const rid = id ? decodeURIComponent(id) : '';
    if (view === 'recipe') renderRecipe(rid);
    else if (view === 'edit') renderEdit(rid);
    else if (view === 'new') renderEdit('');
    else if (view === 'shopping') renderShopping();
    else renderList();
    window.scrollTo(0, 0);
  }

  // another tab changed the data
  window.addEventListener('storage', (e) => {
    if (e.key !== STORE_KEY) return;
    load();
    if (!document.querySelector('#editor')) render();
  });
  window.addEventListener('hashchange', render);
  load();
  render();
})();
