/*
 * app.js — state, storage, rendering and events for the recipe box.
 * User text is always rendered with textContent / createElement, never innerHTML.
 */
(function () {
  'use strict';

  var STORE_KEY = 'recipeBox.v1';
  var Qty = window.Qty;

  var state = { recipes: [], selected: [] };
  var ui = { search: '', checked: {} };

  /* ---------------------------------------------------------------- *
   * DOM helpers
   * ---------------------------------------------------------------- */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value == null || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key.slice(0, 2) === 'on' && typeof value === 'function') {
          node.addEventListener(key.slice(2), value);
        } else if (key === 'checked' || key === 'disabled' || key === 'hidden') {
          node[key] = !!value;
        } else {
          node.setAttribute(key, value === true ? '' : String(value));
        }
      });
    }
    (children || []).forEach(function (child) {
      if (child == null || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /* ---------------------------------------------------------------- *
   * Data and storage
   * ---------------------------------------------------------------- */

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function normalizeRecipe(r) {
    if (!r || typeof r !== 'object') return null;
    var title = typeof r.title === 'string' ? r.title.trim() : '';
    if (!title) return null;
    var servings = Math.round(Number(r.servings));
    if (!isFinite(servings) || servings < 1) servings = 1;
    var ingredients = Array.isArray(r.ingredients)
      ? r.ingredients.filter(function (x) { return typeof x === 'string' && x.trim() !== ''; })
        .map(function (x) { return x.trim(); })
      : [];
    var steps = Array.isArray(r.steps)
      ? r.steps.filter(function (x) { return typeof x === 'string' && x.trim() !== ''; })
        .map(function (x) { return x.trim(); })
      : [];
    return {
      id: typeof r.id === 'string' && r.id ? r.id : uid(),
      title: title,
      servings: servings,
      ingredients: ingredients,
      steps: steps,
      updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now()
    };
  }

  function seedRecipes() {
    var t = Date.now();
    return [
      {
        id: uid(),
        title: 'Buttermilk Pancakes',
        servings: 4,
        ingredients: [
          '2 cups flour',
          '2 tbsp sugar',
          '2 tsp baking powder',
          '½ tsp salt',
          '2 eggs',
          '1 1/2 cups milk',
          '4 tbsp butter, melted'
        ],
        steps: [
          'Whisk the flour, sugar, baking powder and salt in a large bowl.',
          'Beat the eggs with the milk, then stir in the melted butter.',
          'Pour the wet mix into the dry and stir until just combined; a few lumps are fine.',
          'Cook spoonfuls on a buttered pan over medium heat until bubbles form, then flip.'
        ],
        updatedAt: t - 3000
      },
      {
        id: uid(),
        title: 'Everyday Cake',
        servings: 8,
        ingredients: [
          '2 1/4 cups flour',
          '1 1/2 cups sugar',
          '3 eggs',
          '1 cup butter, softened',
          '1 cup milk',
          '1 tbsp vanilla'
        ],
        steps: [
          'Heat the oven to 180°C (350°F) and line a tin.',
          'Cream the butter and sugar until pale.',
          'Beat in the eggs one at a time, then the vanilla.',
          'Fold in the flour and milk in turns, then bake for 35–40 minutes.'
        ],
        updatedAt: t - 2000
      },
      {
        id: uid(),
        title: 'Quick Omelette',
        servings: 2,
        ingredients: [
          '4 eggs',
          '2 tbsp butter',
          '½ cup milk',
          '½ cup cheese, grated',
          '1 pinch salt'
        ],
        steps: [
          'Beat the eggs with the milk and salt.',
          'Melt the butter in a non-stick pan over medium heat.',
          'Pour in the eggs and pull the set edges inward as they cook.',
          'Scatter over the cheese, fold and slide onto a plate.'
        ],
        updatedAt: t - 1000
      }
    ];
  }

  function load() {
    var raw = null;
    try {
      raw = window.localStorage.getItem(STORE_KEY);
    } catch (e) {
      raw = null;
    }

    if (raw == null) {
      state.recipes = seedRecipes();
      state.selected = [];
      save();
      return;
    }

    try {
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || !Array.isArray(data.recipes)) {
        throw new Error('bad shape');
      }
      state.recipes = data.recipes.map(normalizeRecipe).filter(Boolean);
      var ids = {};
      state.recipes.forEach(function (r) { ids[r.id] = true; });
      state.selected = Array.isArray(data.selected)
        ? data.selected.filter(function (id) {
          return typeof id === 'string' && !!ids[id];
        })
        : [];
    } catch (e) {
      state.recipes = [];
      state.selected = [];
    }
  }

  function save() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify({
        recipes: state.recipes,
        selected: state.selected
      }));
    } catch (e) {
      /* Storage full or blocked: the page still works for this visit. */
    }
  }

  function findRecipe(id) {
    for (var i = 0; i < state.recipes.length; i++) {
      if (state.recipes[i].id === id) return state.recipes[i];
    }
    return null;
  }

  function isSelected(id) {
    return state.selected.indexOf(id) >= 0;
  }

  function setSelected(id, on) {
    var i = state.selected.indexOf(id);
    if (on && i < 0) state.selected.push(id);
    if (!on && i >= 0) state.selected.splice(i, 1);
    save();
  }

  function servingsText(n) {
    return n + (n === 1 ? ' serving' : ' servings');
  }

  function splitLines(value) {
    return String(value || '')
      .split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(function (line) { return line !== ''; });
  }

  /* ---------------------------------------------------------------- *
   * Routing
   * ---------------------------------------------------------------- */

  function parseRoute() {
    var path = (window.location.hash || '').replace(/^#/, '');
    if (!path || path === '/') return { view: 'list' };
    var parts = path.split('/').filter(Boolean);
    if (parts[0] === 'recipe' && parts[1]) {
      return { view: 'detail', id: decodeURIComponent(parts[1]) };
    }
    if (parts[0] === 'edit' && parts[1]) {
      return { view: 'edit', id: decodeURIComponent(parts[1]) };
    }
    if (parts[0] === 'new') return { view: 'new' };
    if (parts[0] === 'shopping') return { view: 'shopping' };
    return { view: 'list' };
  }

  function render() {
    var route = parseRoute();
    var app = document.getElementById('app');
    var bar = document.getElementById('bottom-bar');
    var search = document.getElementById('search');

    clear(app);
    clear(bar);
    bar.hidden = true;
    search.hidden = route.view !== 'list';
    if (!search.hidden && search.value !== ui.search) search.value = ui.search;

    if (route.view === 'detail') {
      var recipe = findRecipe(route.id);
      if (!recipe) { window.location.replace('#/'); return; }
      renderDetail(app, recipe);
    } else if (route.view === 'edit') {
      var editing = findRecipe(route.id);
      if (!editing) { window.location.replace('#/'); return; }
      renderEditor(app, editing);
    } else if (route.view === 'new') {
      renderEditor(app, null);
    } else if (route.view === 'shopping') {
      renderShopping(app);
    } else {
      renderList(app);
    }
  }

  /* ---------------------------------------------------------------- *
   * List
   * ---------------------------------------------------------------- */

  function recipeRow(recipe) {
    var check = el('input', {
      type: 'checkbox',
      class: 'pick',
      'aria-label': 'Include ' + recipe.title + ' in the shopping list',
      checked: isSelected(recipe.id)
    });
    check.addEventListener('change', function () {
      setSelected(recipe.id, check.checked);
      render();
    });

    return el('article', { class: 'recipe-row' }, [
      el('label', { class: 'pick-wrap' }, [check]),
      el('a', { class: 'row-main', href: '#/recipe/' + encodeURIComponent(recipe.id) }, [
        el('span', { class: 'row-title', text: recipe.title }),
        el('span', { class: 'row-meta', text: servingsText(recipe.servings) })
      ])
    ]);
  }

  function renderList(app) {
    var query = ui.search.trim().toLowerCase();
    var shown = state.recipes.filter(function (recipe) {
      if (!query) return true;
      if (recipe.title.toLowerCase().indexOf(query) >= 0) return true;
      return recipe.ingredients.some(function (line) {
        return line.toLowerCase().indexOf(query) >= 0;
      });
    });

    var page = el('section', { class: 'page list-page' });
    page.appendChild(el('div', { class: 'page-head' }, [
      el('h1', { class: 'page-title', text: 'Recipes' }),
      el('a', { class: 'btn btn-primary', href: '#/new', text: '+ New recipe' })
    ]));

    if (!state.recipes.length) {
      page.appendChild(el('p', {
        class: 'empty',
        text: 'No recipes yet. Add your first one with “+ New recipe”.'
      }));
    } else if (!shown.length) {
      page.appendChild(el('p', {
        class: 'empty',
        text: 'No recipes match “' + ui.search.trim() + '”.'
      }));
    } else {
      var list = el('div', { class: 'recipe-list' });
      shown.forEach(function (recipe) {
        list.appendChild(recipeRow(recipe));
      });
      page.appendChild(list);
    }

    app.appendChild(page);

    if (state.selected.length) {
      var bar = document.getElementById('bottom-bar');
      bar.hidden = false;
      bar.appendChild(el('span', {
        class: 'bar-count',
        text: state.selected.length + ' selected —'
      }));
      bar.appendChild(el('a', {
        class: 'bar-action',
        href: '#/shopping',
        text: 'Shopping list'
      }));
    }
  }

  /* ---------------------------------------------------------------- *
   * Detail
   * ---------------------------------------------------------------- */

  function renderDetail(app, recipe) {
    var servings = recipe.servings;

    var page = el('section', { class: 'page detail-page' });
    page.appendChild(el('a', { class: 'back', href: '#/', text: '← All recipes' }));
    page.appendChild(el('h1', { class: 'page-title', text: recipe.title }));

    var servingsInput = el('input', {
      type: 'number',
      min: '1',
      step: '1',
      inputmode: 'numeric',
      class: 'servings-input',
      'aria-label': 'Number of servings'
    });
    servingsInput.value = String(servings);

    var note = el('p', { class: 'scale-note' });
    var ingredients = el('ul', { class: 'ingredients' });

    function paintIngredients() {
      clear(ingredients);
      var factor = Qty.divFrac(Qty.frac(servings, 1), Qty.frac(recipe.servings, 1));
      recipe.ingredients.forEach(function (line) {
        ingredients.appendChild(el('li', { text: Qty.formatIngredientText(line, factor) }));
      });
      note.textContent = servings === recipe.servings
        ? 'As written for ' + servingsText(recipe.servings) + '.'
        : 'Scaled from ' + servingsText(recipe.servings) + ' to ' + servingsText(servings) + '.';
    }

    function setServings(value) {
      var v = Math.round(Number(value));
      if (!isFinite(v) || v < 1) v = 1;
      if (v > 999) v = 999;
      servings = v;
      if (servingsInput.value !== String(v)) servingsInput.value = String(v);
      paintIngredients();
    }

    servingsInput.addEventListener('input', function () {
      var v = Number(servingsInput.value);
      if (isFinite(v) && v >= 1) {
        servings = Math.min(999, Math.round(v));
        paintIngredients();
      }
    });
    servingsInput.addEventListener('change', function () {
      setServings(servingsInput.value);
    });

    var minus = el('button', {
      type: 'button',
      class: 'step-btn',
      'aria-label': 'Fewer servings',
      text: '−'
    });
    minus.addEventListener('click', function () { setServings(servings - 1); });

    var plus = el('button', {
      type: 'button',
      class: 'step-btn',
      'aria-label': 'More servings',
      text: '+'
    });
    plus.addEventListener('click', function () { setServings(servings + 1); });

    var stepper = el('div', { class: 'stepper' }, [
      minus,
      el('div', { class: 'stepper-center' }, [
        servingsInput,
        el('span', { class: 'stepper-label', text: 'servings' })
      ]),
      plus
    ]);

    var steps = el('ol', { class: 'steps' });
    if (recipe.steps.length) {
      recipe.steps.forEach(function (step) {
        steps.appendChild(el('li', { text: step }));
      });
    } else {
      steps.appendChild(el('li', { text: 'No steps yet.' }));
    }

    var edit = el('a', {
      class: 'btn btn-secondary',
      href: '#/edit/' + encodeURIComponent(recipe.id),
      text: 'Edit'
    });

    var remove = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Delete' });
    remove.addEventListener('click', function () {
      if (!window.confirm('Delete “' + recipe.title + '”? This cannot be undone.')) return;
      state.recipes = state.recipes.filter(function (r) { return r.id !== recipe.id; });
      state.selected = state.selected.filter(function (id) { return id !== recipe.id; });
      save();
      window.location.hash = '#/';
    });

    page.appendChild(stepper);
    page.appendChild(note);
    page.appendChild(el('h2', { text: 'Ingredients' }));
    page.appendChild(ingredients);
    page.appendChild(el('h2', { text: 'Steps' }));
    page.appendChild(steps);
    page.appendChild(el('div', { class: 'actions' }, [edit, remove]));

    paintIngredients();
    app.appendChild(page);
  }

  /* ---------------------------------------------------------------- *
   * Editor
   * ---------------------------------------------------------------- */

  function renderEditor(app, recipe) {
    var isNew = !recipe;
    var backHref = isNew ? '#/' : '#/recipe/' + encodeURIComponent(recipe.id);

    var page = el('section', { class: 'page editor-page' });
    page.appendChild(el('a', { class: 'back', href: backHref, text: '← Cancel' }));
    page.appendChild(el('h1', {
      class: 'page-title',
      text: isNew ? 'New recipe' : 'Edit recipe'
    }));

    var form = el('form', { class: 'recipe-form' });
    form.noValidate = true;

    var titleInput = el('input', {
      type: 'text',
      id: 'f-title',
      name: 'title',
      autocomplete: 'off',
      placeholder: 'e.g. Lemon drizzle cake'
    });
    titleInput.value = recipe ? recipe.title : '';

    var servingsInput = el('input', {
      type: 'number',
      id: 'f-servings',
      name: 'servings',
      min: '1',
      step: '1',
      inputmode: 'numeric'
    });
    servingsInput.value = String(recipe ? recipe.servings : 4);

    var ingredientsInput = el('textarea', {
      id: 'f-ingredients',
      name: 'ingredients',
      rows: '7',
      placeholder: '1 1/2 cups flour\n½ tsp salt'
    });
    ingredientsInput.value = recipe ? recipe.ingredients.join('\n') : '';

    var stepsInput = el('textarea', {
      id: 'f-steps',
      name: 'steps',
      rows: '7',
      placeholder: 'Mix the dry ingredients.\nBake until golden.'
    });
    stepsInput.value = recipe ? recipe.steps.join('\n') : '';

    var error = el('p', { class: 'error', role: 'alert' });
    error.hidden = true;

    function field(labelText, control, hint) {
      var wrap = el('div', { class: 'field' }, [
        el('label', { for: control.id, text: labelText }),
        control
      ]);
      if (hint) wrap.appendChild(el('span', { class: 'hint', text: hint }));
      return wrap;
    }

    var servingsField = field('Servings', servingsInput);
    servingsField.classList.add('field-narrow');

    var saveButton = el('button', {
      type: 'submit',
      class: 'btn btn-primary',
      text: isNew ? 'Add recipe' : 'Save changes'
    });

    form.appendChild(error);
    form.appendChild(field('Title', titleInput));
    form.appendChild(servingsField);
    form.appendChild(field('Ingredients', ingredientsInput, 'One per line. Amounts like 1 1/2, ½ or 1½ are understood.'));
    form.appendChild(field('Steps', stepsInput, 'One step per line.'));
    form.appendChild(el('div', { class: 'form-actions' }, [
      saveButton,
      el('a', { class: 'btn btn-secondary', href: backHref, text: 'Cancel' })
    ]));

    function fail(message, control) {
      error.textContent = message;
      error.hidden = false;
      control.focus();
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      error.hidden = true;

      var title = titleInput.value.trim();
      var servings = Math.round(Number(servingsInput.value));

      if (!title) {
        fail('Give the recipe a title.', titleInput);
        return;
      }
      if (!isFinite(servings) || servings < 1) {
        fail('Servings must be 1 or more.', servingsInput);
        return;
      }

      var ingredients = splitLines(ingredientsInput.value);
      var steps = splitLines(stepsInput.value);
      var target;

      if (recipe) {
        target = recipe;
        target.title = title;
        target.servings = servings;
        target.ingredients = ingredients;
        target.steps = steps;
        target.updatedAt = Date.now();
      } else {
        target = {
          id: uid(),
          title: title,
          servings: servings,
          ingredients: ingredients,
          steps: steps,
          updatedAt: Date.now()
        };
        state.recipes.push(target);
      }

      save();
      window.location.hash = '#/recipe/' + encodeURIComponent(target.id);
    });

    page.appendChild(form);
    app.appendChild(page);
  }

  /* ---------------------------------------------------------------- *
   * Shopping list
   * ---------------------------------------------------------------- */

  function renderShopping(app) {
    var chosen = state.recipes.filter(function (recipe) {
      return isSelected(recipe.id);
    });

    var page = el('section', { class: 'page shopping-page' });
    page.appendChild(el('a', { class: 'back', href: '#/', text: '← All recipes' }));
    page.appendChild(el('h1', { class: 'page-title', text: 'Shopping list' }));

    if (!chosen.length) {
      page.appendChild(el('p', {
        class: 'empty',
        text: 'Tick a few recipes on the list and their ingredients will add up here.'
      }));
      page.appendChild(el('div', { class: 'shopping-actions' }, [
        el('a', { class: 'btn btn-primary', href: '#/', text: 'Back to recipes' })
      ]));
      app.appendChild(page);
      return;
    }

    var items = [];
    chosen.forEach(function (recipe) {
      recipe.ingredients.forEach(function (line) {
        items.push({ text: line, source: recipe.title });
      });
    });
    var rows = Qty.buildShoppingList(items);

    page.appendChild(el('p', {
      class: 'intro',
      text: 'For ' + chosen.length + (chosen.length === 1 ? ' recipe' : ' recipes') + ': ' +
        chosen.map(function (recipe) { return recipe.title; }).join(', ') + '.'
    }));

    var list = el('div', { class: 'shop-list' });
    rows.forEach(function (row) {
      var line = Qty.formatShoppingRow(row);
      var check = el('input', {
        type: 'checkbox',
        class: 'shop-check',
        'aria-label': 'Tick off ' + line
      });
      var rowEl = el('label', { class: 'shop-row' }, [
        check,
        el('span', { class: 'shop-text' }, [
          el('span', { class: 'shop-line', text: line }),
          el('span', {
            class: 'shop-sources',
            text: row.sources.length ? 'from ' + row.sources.join(', ') : ''
          })
        ])
      ]);
      if (ui.checked[row.key]) {
        rowEl.classList.add('done');
        check.checked = true;
      }
      check.addEventListener('change', function () {
        ui.checked[row.key] = check.checked;
        rowEl.classList.toggle('done', check.checked);
      });
      list.appendChild(rowEl);
    });
    page.appendChild(list);

    var clearButton = el('button', {
      type: 'button',
      class: 'btn btn-secondary',
      text: 'Clear selection'
    });
    clearButton.addEventListener('click', function () {
      state.selected = [];
      Object.keys(ui.checked).forEach(function (key) { delete ui.checked[key]; });
      save();
      window.location.hash = '#/';
    });

    page.appendChild(el('div', { class: 'shopping-actions' }, [
      el('a', { class: 'btn btn-secondary', href: '#/', text: 'Back to recipes' }),
      clearButton
    ]));

    app.appendChild(page);
  }

  /* ---------------------------------------------------------------- *
   * Start
   * ---------------------------------------------------------------- */

  function init() {
    load();

    var search = document.getElementById('search');
    search.addEventListener('input', function () {
      ui.search = search.value;
      if (parseRoute().view === 'list') render();
    });

    window.addEventListener('hashchange', render);
    render();
  }

  init();
})();
