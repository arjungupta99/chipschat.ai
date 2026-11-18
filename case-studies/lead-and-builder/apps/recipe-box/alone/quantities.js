// Reading, scaling and adding up ingredient amounts like "1 1/2 cups flour" or "½ tsp salt".
// Works in the browser (window.Quantities) and in Node (require) so it can be tested.
(function (root) {
  'use strict';

  const UNICODE_FRACTIONS = {
    '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4,
    '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5, '⅘': 4 / 5, '⅙': 1 / 6, '⅚': 5 / 6,
    '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8,
  };
  const UF = Object.keys(UNICODE_FRACTIONS).join('');

  // One amount: "1½", "1 ½", "1 1/2", "3/4", "½", "1.5", "2"
  const NUM = `(?:\\d+(?:\\.\\d+)?\\s*[${UF}]|\\d+\\s+\\d+\\s*[/⁄]\\s*\\d+|\\d+\\s*[/⁄]\\s*\\d+|\\d*\\.\\d+|\\d+|[${UF}])`;
  // An amount or a range ("2-3", "2 to 3") at the start of a line
  const LEADING_AMOUNT = new RegExp(`^(${NUM})(?:(?:\\s*[-–—]\\s*|\\s+to\\s+)(${NUM}))?(?=\\s|[a-zA-Z]|$)\\s*`);

  // [canonical, singular label, plural label, words people write]
  const UNIT_TABLE = [
    ['cup', 'cup', 'cups', ['cup', 'cups', 'c']],
    ['tbsp', 'tbsp', 'tbsp', ['tbsp', 'tbsps', 'tbs', 'tbl', 'tablespoon', 'tablespoons', 'T']],
    ['tsp', 'tsp', 'tsp', ['tsp', 'tsps', 'teaspoon', 'teaspoons', 't']],
    ['g', 'g', 'g', ['g', 'gr', 'gram', 'grams', 'gramme', 'grammes']],
    ['kg', 'kg', 'kg', ['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms']],
    ['ml', 'ml', 'ml', ['ml', 'mL', 'milliliter', 'milliliters', 'millilitre', 'millilitres']],
    ['l', 'L', 'L', ['l', 'L', 'liter', 'liters', 'litre', 'litres']],
    ['floz', 'fl oz', 'fl oz', ['fl oz', 'fl. oz.', 'fl. oz', 'fluid ounce', 'fluid ounces']],
    ['oz', 'oz', 'oz', ['oz', 'ounce', 'ounces']],
    ['lb', 'lb', 'lb', ['lb', 'lbs', 'pound', 'pounds']],
    ['pint', 'pint', 'pints', ['pint', 'pints', 'pt']],
    ['quart', 'quart', 'quarts', ['quart', 'quarts', 'qt']],
    ['pinch', 'pinch', 'pinches', ['pinch', 'pinches']],
    ['dash', 'dash', 'dashes', ['dash', 'dashes']],
    ['clove', 'clove', 'cloves', ['clove', 'cloves']],
    ['can', 'can', 'cans', ['can', 'cans', 'tin', 'tins']],
    ['jar', 'jar', 'jars', ['jar', 'jars']],
    ['package', 'package', 'packages', ['package', 'packages', 'pkg', 'pkgs', 'packet', 'packets']],
    ['slice', 'slice', 'slices', ['slice', 'slices']],
    ['stick', 'stick', 'sticks', ['stick', 'sticks']],
    ['bunch', 'bunch', 'bunches', ['bunch', 'bunches']],
    ['sprig', 'sprig', 'sprigs', ['sprig', 'sprigs']],
    ['handful', 'handful', 'handfuls', ['handful', 'handfuls']],
    ['piece', 'piece', 'pieces', ['piece', 'pieces']],
  ];
  const UNITS = {};
  const CASE_SENSITIVE = new Set(['T', 't', 'L']);
  const UNIT_WORDS = []; // [word, canonical], longest first
  for (const [canon, one, many, words] of UNIT_TABLE) {
    UNITS[canon] = { one, many };
    for (const w of words) UNIT_WORDS.push([w, canon]);
  }
  UNIT_WORDS.sort((a, b) => b[0].length - a[0].length);
  const DECIMAL_UNITS = new Set(['g', 'kg', 'ml', 'l']);

  function parseNumber(s) {
    s = s.trim();
    let m = s.match(new RegExp(`^(\\d+(?:\\.\\d+)?)?\\s*([${UF}])$`));
    if (m) return (m[1] ? parseFloat(m[1]) : 0) + UNICODE_FRACTIONS[m[2]];
    m = s.match(/^(?:(\d+)\s+)?(\d+)\s*[/⁄]\s*(\d+)$/);
    if (m) return Number(m[3]) === 0 ? NaN : (m[1] ? Number(m[1]) : 0) + Number(m[2]) / Number(m[3]);
    return parseFloat(s);
  }

  function readUnit(rest) {
    for (const [word, canon] of UNIT_WORDS) {
      const head = rest.slice(0, word.length);
      const same = CASE_SENSITIVE.has(word) ? head === word : head.toLowerCase() === word.toLowerCase();
      if (!same) continue;
      const after = rest.slice(word.length);
      // the unit must be a whole word ("c" must not match "carrots"); allow "tbsp." too
      const m = after.match(/^\.?(?:\s+|$)/);
      if (m) return { unit: canon, rest: after.slice(m[0].length) };
    }
    return { unit: '', rest };
  }

  // "2 cups flour, sifted" -> { min: 2, max: 2, unit: 'cup', rest: 'flour, sifted', name: 'flour' }
  // A line without a leading amount ("salt to taste") gives { min: null, rest: line, name: line }.
  function parseIngredient(line) {
    const text = String(line).trim();
    const m = text.match(LEADING_AMOUNT);
    if (m) {
      const min = parseNumber(m[1]);
      const max = m[2] ? parseNumber(m[2]) : min;
      if (isFinite(min) && isFinite(max) && min > 0) {
        const { unit, rest } = readUnit(text.slice(m[0].length));
        return { text, min, max, unit, rest, name: mainName(rest) };
      }
    }
    return { text, min: null, max: null, unit: '', rest: text, name: mainName(text) };
  }

  // The part of an ingredient you'd shop for: drop "of", notes after a comma, and (bracketed) notes.
  function mainName(rest) {
    return rest
      .replace(/^of\s+/i, '')
      .replace(/\([^)]*\)/g, ' ')
      .split(/,|;|\s+-\s+/)[0]
      .replace(/\s+/g, ' ')
      .trim();
  }

  function singular(word) {
    const w = word.toLowerCase();
    if (/(ss|us|is)$/.test(w) || w.length <= 3) return word;
    if (/ies$/.test(w)) return word.slice(0, -3) + 'y';
    if (/(oes|ches|shes|xes|sses|zes)$/.test(w)) return word.slice(0, -2);
    if (/s$/.test(w)) return word.slice(0, -1);
    return word;
  }

  function plural(word) {
    const w = word.toLowerCase();
    if (/s$/.test(w)) return word;
    if (/(potato|tomato)$/.test(w)) return word + 'es';
    if (/(ch|sh|x|z)$/.test(w)) return word + 'es';
    if (/[^aeiou]y$/.test(w)) return word.slice(0, -1) + 'ies';
    return word + 's';
  }

  // Make the last word of the name agree with the amount, only for countable things with no unit ("3 eggs").
  function agree(name, amount, unit) {
    if (unit || !name) return name;
    const m = name.match(/^(.*?)([A-Za-z]+)$/);
    if (!m) return name;
    return m[1] + (amount > 1 ? plural(m[2]) : singular(m[2]));
  }

  const NICE = [[1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'],
    [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞']];

  function formatNumber(x, unit) {
    const decimal = String(Math.round(x * 100) / 100);
    if (DECIMAL_UNITS.has(unit)) return decimal;
    const whole = Math.floor(x + 1e-9);
    const frac = x - whole;
    if (frac < 0.01) return String(whole);
    if (frac > 0.99) return String(whole + 1);
    for (const [v, glyph] of NICE) {
      if (Math.abs(frac - v) < 0.01) return whole ? whole + glyph : glyph;
    }
    return decimal;
  }

  function formatAmount(min, max, unit) {
    const qty = min === max || Math.abs(min - max) < 1e-9
      ? formatNumber(min, unit)
      : formatNumber(min, unit) + '–' + formatNumber(max, unit);
    if (!unit) return qty;
    const u = UNITS[unit];
    return qty + ' ' + (max > 1 ? u.many : u.one);
  }

  // One ingredient line multiplied by factor. Lines without an amount come back unchanged.
  function scaleLine(line, factor) {
    const p = parseIngredient(line);
    if (p.min === null || factor === 1) return p.text;
    const max = p.max * factor;
    return (formatAmount(p.min * factor, max, p.unit) + ' ' + agreeRest(p.rest, max, p.unit)).trim();
  }

  // Like agree(), but keeps notes after the main name ("eggs, beaten").
  function agreeRest(rest, amount, unit) {
    const name = mainName(rest);
    if (!name || unit || /^of\s/i.test(rest)) return rest;
    const i = rest.indexOf(name);
    if (i < 0) return rest;
    return rest.slice(0, i) + agree(name, amount, unit) + rest.slice(i + name.length);
  }

  function nameKey(name) {
    return name.toLowerCase().split(' ').map(singular).join(' ');
  }

  // items: [{ line, factor, source }] -> [{ key, text, sources }] with the same ingredient added up.
  function combine(items) {
    const groups = new Map();
    for (const { line, factor = 1, source } of items) {
      const p = parseIngredient(line);
      if (!p.text) continue;
      const hasAmount = p.min !== null;
      const key = hasAmount ? p.unit + '|' + nameKey(p.name) : '-|' + nameKey(p.name || p.text);
      let g = groups.get(key);
      if (!g) {
        g = { key, hasAmount, unit: p.unit, name: p.name || p.text, text: p.text, min: 0, max: 0, sources: [] };
        groups.set(key, g);
      }
      if (hasAmount) {
        g.min += p.min * factor;
        g.max += p.max * factor;
      }
      if (source && !g.sources.includes(source)) g.sources.push(source);
    }
    return [...groups.values()]
      .map((g) => ({
        key: g.key,
        sources: g.sources,
        name: g.name,
        text: g.hasAmount
          ? (formatAmount(g.min, g.max, g.unit) + ' ' + agree(g.name, g.max, g.unit)).trim()
          : g.text,
      }))
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  }

  const api = { parseNumber, parseIngredient, formatNumber, formatAmount, scaleLine, combine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Quantities = api;
})(typeof window !== 'undefined' ? window : globalThis);
