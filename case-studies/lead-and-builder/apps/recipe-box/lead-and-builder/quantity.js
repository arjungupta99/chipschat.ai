/*
 * quantity.js — amounts as exact fractions, ingredient parsing, scaling and
 * shopping-list merging. Pure functions, no DOM. Exposes one global: Qty.
 */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Exact fractions: { n, d } integers, d > 0, reduced.
   * ------------------------------------------------------------------ */

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      var t = a % b;
      a = b;
      b = t;
    }
    return a || 1;
  }

  function frac(n, d) {
    if (!d) throw new Error('fraction with zero denominator');
    if (!isFinite(n) || !isFinite(d)) throw new Error('fraction with non-finite parts');
    if (d < 0) {
      n = -n;
      d = -d;
    }
    n = Math.round(n);
    d = Math.round(d);
    var g = gcd(n, d);
    return { n: n / g, d: d / g };
  }

  function addFrac(a, b) {
    return frac(a.n * b.d + b.n * a.d, a.d * b.d);
  }

  function subFrac(a, b) {
    return frac(a.n * b.d - b.n * a.d, a.d * b.d);
  }

  function mulFrac(a, b) {
    return frac(a.n * b.n, a.d * b.d);
  }

  function divFrac(a, b) {
    if (!b.n) throw new Error('division by zero fraction');
    return frac(a.n * b.d, a.d * b.n);
  }

  function num(f) {
    return f.n / f.d;
  }

  function fracFromDecimalString(str) {
    var s = String(str).trim();
    var neg = s.charAt(0) === '-';
    if (neg) s = s.slice(1);
    var dot = s.indexOf('.');
    var whole = dot < 0 ? s : s.slice(0, dot);
    var part = dot < 0 ? '' : s.slice(dot + 1);
    whole = whole || '0';
    if (!/^\d*$/.test(whole) || !/^\d*$/.test(part)) {
      throw new Error('bad decimal: ' + str);
    }
    var n = parseInt(whole + part, 10);
    if (isNaN(n)) n = 0;
    var d = Math.pow(10, part.length);
    if (neg) n = -n;
    return frac(n, d);
  }

  /* ------------------------------------------------------------------ *
   * Reading an amount from the start of a line.
   * ------------------------------------------------------------------ */

  var VULGAR = {
    '½': [1, 2], '⅓': [1, 3], '⅔': [2, 3],
    '¼': [1, 4], '¾': [3, 4],
    '⅕': [1, 5], '⅖': [2, 5], '⅗': [3, 5], '⅘': [4, 5],
    '⅙': [1, 6], '⅚': [5, 6],
    '⅛': [1, 8], '⅜': [3, 8], '⅝': [5, 8], '⅞': [7, 8]
  };
  var VULGAR_CHARS = Object.keys(VULGAR).join('');

  var RE_MIXED = /^(\d+)\s+(\d+)\s*\/\s*(\d+)/;
  var RE_WHOLE_VULGAR = new RegExp('^(\\d+)\\s*([' + VULGAR_CHARS + '])');
  var RE_VULGAR = new RegExp('^([' + VULGAR_CHARS + '])');
  var RE_FRACTION = /^(\d+)\s*\/\s*(\d+)/;
  var RE_DECIMAL = /^(\d*\.\d+)/;
  var RE_INTEGER = /^(\d+)/;

  // Returns { value: fraction, len } for an amount at the very start, or null.
  function matchAmount(str) {
    var m = RE_MIXED.exec(str);
    if (m) {
      var d = parseInt(m[3], 10);
      if (!d) return null;
      return {
        value: frac(parseInt(m[1], 10) * d + parseInt(m[2], 10), d),
        len: m[0].length
      };
    }
    m = RE_WHOLE_VULGAR.exec(str);
    if (m) {
      var v = VULGAR[m[2]];
      return {
        value: frac(parseInt(m[1], 10) * v[1] + v[0], v[1]),
        len: m[0].length
      };
    }
    m = RE_VULGAR.exec(str);
    if (m) {
      var g = VULGAR[m[1]];
      return { value: frac(g[0], g[1]), len: m[0].length };
    }
    m = RE_FRACTION.exec(str);
    if (m) {
      var den = parseInt(m[2], 10);
      if (!den) return null;
      return { value: frac(parseInt(m[1], 10), den), len: m[0].length };
    }
    m = RE_DECIMAL.exec(str);
    if (m) {
      return { value: fracFromDecimalString(m[1]), len: m[0].length };
    }
    m = RE_INTEGER.exec(str);
    if (m) {
      return { value: frac(parseInt(m[1], 10), 1), len: m[0].length };
    }
    return null;
  }

  // Returns { lo, hi|null, len } — hi is set for a range like 2-3 / 2–3.
  function parseAmount(str) {
    if (typeof str !== 'string') return null;
    var first = matchAmount(str);
    if (!first) return null;
    var lo = first.value;
    var hi = null;
    var len = first.len;
    var rest = str.slice(len);
    var dash = /^\s*[-\u2013\u2014]\s*/.exec(rest);
    if (dash) {
      var second = matchAmount(rest.slice(dash[0].length));
      if (second) {
        hi = second.value;
        len += dash[0].length + second.len;
      }
    }
    return { lo: lo, hi: hi, len: len };
  }

  /* ------------------------------------------------------------------ *
   * Units.
   * ------------------------------------------------------------------ */

  var UNITS = [
    {
      unit: 'tsp', family: 'volume', plural: 'tsp',
      aliases: ['teaspoon', 'teaspoons', 'teaspoonful', 'teaspoonfuls', 'tsp', 't']
    },
    {
      unit: 'tbsp', family: 'volume', plural: 'tbsp',
      aliases: ['tablespoon', 'tablespoons', 'tablespoonful', 'tablespoonfuls', 'tbsp', 'tbs', 'tbl', 'tblsp', 'T']
    },
    {
      unit: 'cup', family: 'volume', plural: 'cups',
      aliases: ['cup', 'cups', 'c']
    },
    {
      unit: 'fl oz', family: 'volume', plural: 'fl oz',
      aliases: ['fl oz', 'fl. oz', 'floz', 'fluid ounce', 'fluid ounces']
    },
    {
      unit: 'ml', family: 'volume', plural: 'ml',
      aliases: ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres']
    },
    {
      unit: 'l', family: 'volume', plural: 'l',
      aliases: ['l', 'liter', 'liters', 'litre', 'litres']
    },
    {
      unit: 'g', family: 'weight', plural: 'g',
      aliases: ['g', 'gram', 'grams', 'gramme', 'grammes']
    },
    {
      unit: 'kg', family: 'weight', plural: 'kg',
      aliases: ['kg', 'kilogram', 'kilograms', 'kilogramme', 'kilogrammes']
    },
    {
      unit: 'oz', family: 'weight', plural: 'oz',
      aliases: ['oz', 'ounce', 'ounces']
    },
    {
      unit: 'lb', family: 'weight', plural: 'lb',
      aliases: ['lb', 'lbs', 'pound', 'pounds']
    },
    {
      unit: 'clove', family: 'count', plural: 'cloves',
      aliases: ['clove', 'cloves']
    },
    {
      unit: 'can', family: 'count', plural: 'cans',
      aliases: ['can', 'cans']
    },
    {
      unit: 'pinch', family: 'count', plural: 'pinches',
      aliases: ['pinch', 'pinches']
    },
    {
      unit: 'slice', family: 'count', plural: 'slices',
      aliases: ['slice', 'slices']
    },
    {
      unit: 'stick', family: 'count', plural: 'sticks',
      aliases: ['stick', 'sticks']
    },
    {
      unit: 'piece', family: 'count', plural: 'pieces',
      aliases: ['piece', 'pieces']
    }
  ];

  var ALIAS = {};
  var UNIT_INFO = {};
  UNITS.forEach(function (u) {
    UNIT_INFO[u.unit] = u;
    u.aliases.forEach(function (a) {
      ALIAS[a.toLowerCase()] = u;
    });
  });

  // Reads a unit from the start of a string, allowing leading whitespace.
  function takeUnit(rest) {
    var m = /^\s*([A-Za-z]+\.?)\s+([A-Za-z]+\.?)\s*/.exec(rest);
    if (m) {
      var two = (m[1] + ' ' + m[2]).toLowerCase().replace(/\./g, '');
      if (ALIAS[two]) return { info: ALIAS[two], len: m[0].length };
    }
    m = /^\s*([A-Za-z]+\.?)\s*/.exec(rest);
    if (!m) return null;
    var word = m[1];
    var bare = word.replace(/\.$/, '');
    var info = null;
    if (bare === 'T') info = UNIT_INFO.tbsp;
    else if (bare === 't') info = UNIT_INFO.tsp;
    else info = ALIAS[bare.toLowerCase()] || null;
    if (!info) return null;
    return { info: info, len: m[0].length };
  }

  /* ------------------------------------------------------------------ *
   * Ingredient lines.
   * ------------------------------------------------------------------ */

  function cleanName(s) {
    var out = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    out = out.replace(/^of\s+/i, '');
    return out.trim();
  }

  function parseIngredient(line) {
    var raw = line == null ? '' : String(line);
    var s = raw.replace(/\s+/g, ' ').trim();
    var amount = parseAmount(s);
    var qty = null;
    var unit = null;
    var name = cleanName(s);
    if (amount) {
      qty = { lo: amount.lo, hi: amount.hi };
      var rest = s.slice(amount.len);
      var u = takeUnit(rest);
      if (u) {
        unit = u.info.unit;
        rest = rest.slice(u.len);
      }
      name = cleanName(rest);
    }
    return { qty: qty, unit: unit, name: name, raw: raw };
  }

  /* ------------------------------------------------------------------ *
   * Formatting.
   * ------------------------------------------------------------------ */

  var GLYPHS = {
    '1/2': '½', '1/3': '⅓', '2/3': '⅔',
    '1/4': '¼', '3/4': '¾',
    '1/5': '⅕', '2/5': '⅖', '3/5': '⅗', '4/5': '⅘',
    '1/6': '⅙', '5/6': '⅚',
    '1/8': '⅛', '3/8': '⅜', '5/8': '⅝', '7/8': '⅞'
  };

  function glyphFor(n, d) {
    var g = gcd(n, d);
    return GLYPHS[(n / g) + '/' + (d / g)] || null;
  }

  function trimZeros(s) {
    return String(s).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  }

  function formatNumber(v) {
    if (!isFinite(v)) return '';
    var eighth = Math.round(v * 8) / 8;
    if (Math.abs(v - eighth) <= 0.02) {
      return formatFraction(frac(Math.round(eighth * 8), 8));
    }
    return trimZeros(v.toFixed(2));
  }

  function formatFraction(f) {
    if (!f || !f.d) return '';
    if (f.n === 0) return '0';
    if (f.n < 0) return '-' + formatFraction(frac(-f.n, f.d));
    var whole = Math.floor(f.n / f.d);
    var rem = f.n % f.d;
    if (!rem) return String(whole);
    var glyph = glyphFor(rem, f.d);
    if (glyph) return whole ? whole + ' ' + glyph : glyph;
    return formatNumber(num(f));
  }

  function formatQty(q) {
    if (q == null) return '';
    if (typeof q === 'number') return formatNumber(q);
    if (typeof q === 'object' && q.lo) {
      if (q.hi) return formatQty(q.lo) + '–' + formatQty(q.hi);
      return formatQty(q.lo);
    }
    if (typeof q === 'object' && q.n != null) return formatFraction(q);
    return String(q);
  }

  function qtyValue(q) {
    if (q == null) return 0;
    if (typeof q === 'number') return q;
    if (q.lo) return num(q.lo);
    if (q.n != null) return num(q);
    return 0;
  }

  // Ranges pluralise by their upper end: 1-2 cups, not 1-2 cup.
  function qtyUpperValue(q) {
    if (q == null) return 0;
    if (typeof q === 'number') return q;
    if (q.hi) return num(q.hi);
    if (q.lo) return num(q.lo);
    if (q.n != null) return num(q);
    return 0;
  }

  function formatUnit(unit, qty) {
    if (!unit) return '';
    var info = UNIT_INFO[unit];
    if (!info) return unit;
    return qtyUpperValue(qty) > 1 ? info.plural : unit;
  }

  function singular(word) {
    var w = String(word || '').toLowerCase().trim();
    if (!w) return '';
    if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + 'y';
    if (/ves$/.test(w) && w.length > 4) return w.slice(0, -3) + 'f';
    if (/oes$/.test(w)) return w.slice(0, -2);
    if (/(ches|shes|xes|zes|sses)$/.test(w)) return w.slice(0, -2);
    if (/(ss|us|is|sh|ch)$/.test(w)) return w;
    if (/s$/.test(w) && w.length > 3) return w.slice(0, -1);
    return w;
  }

  function pluralize(word) {
    var w = String(word || '');
    if (!w) return '';
    if (/(s|x|z|ch|sh)$/.test(w)) return w + 'es';
    if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies';
    if (/[^aeiou]o$/.test(w)) return w + 'es';
    return w + 's';
  }

  function nameKey(name) {
    var s = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    var comma = s.indexOf(',');
    if (comma >= 0) s = s.slice(0, comma).trim();
    s = s.replace(/^of\s+/, '');
    return singular(s);
  }

  function isPluralName(phrase) {
    var words = String(phrase || '').toLowerCase().split(/\s+/);
    for (var i = 0; i < words.length; i++) {
      var word = words[i].replace(/^[^a-z]+|[^a-z]+$/g, '');
      if (word && singular(word) !== word) return true;
    }
    return false;
  }

  // Shopping rows show a plain lowercase name, without comma notes or "to taste".
  function shoppingName(name) {
    var s = String(name || '').replace(/\s+/g, ' ').trim();
    var comma = s.indexOf(',');
    if (comma >= 0) s = s.slice(0, comma).trim();
    s = s.replace(/[,\s]*\bto taste\b.*$/i, '');
    s = s.replace(/[,\s]+$/, '');
    return s.toLowerCase();
  }

  function keepCase(original, replacement) {
    var first = original.charAt(0);
    if (first && first === first.toUpperCase() && first !== first.toLowerCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  // Changes only the head noun (last word before a comma) when the amount
  // crosses 1. Names with " of " or "(" are left exactly as typed.
  function switchHead(name, wantPlural) {
    var s = String(name || '');
    if (!s) return s;
    if (/\sof\s/i.test(s) || s.indexOf('(') >= 0) return s;

    var comma = s.indexOf(',');
    var head = comma >= 0 ? s.slice(0, comma) : s;
    var tail = comma >= 0 ? s.slice(comma) : '';
    var m = /^(.*?)(\S+)(\s*)$/.exec(head);
    if (!m) return s;

    var before = m[1];
    var word = m[2];
    var after = m[3];
    var lower = word.toLowerCase();
    var alreadyPlural = singular(lower) !== lower;
    if (alreadyPlural === wantPlural) return s;

    var next = wantPlural ? pluralize(lower) : singular(lower);
    next = keepCase(word, next);
    if (next === word) return s;
    return before + next + after + tail;
  }

  // Every plausible singular/plural spelling of the head word, so that
  // "cookie" and "cookies", or "tomato" and "tomatoes", land in one bucket.
  function wordForms(word) {
    var w = String(word || '').toLowerCase();
    var seen = {};
    var out = [];

    function add(form) {
      if (!form || seen[form]) return;
      seen[form] = true;
      out.push(form);
    }

    add(w);
    if (/ies$/.test(w)) {
      add(w.slice(0, -3) + 'y');
      add(w.slice(0, -1));
    }
    if (/ves$/.test(w)) {
      add(w.slice(0, -3) + 'f');
      add(w.slice(0, -1));
    }
    if (/oes$/.test(w)) add(w.slice(0, -2));
    if (/(ches|shes|xes|zes|sses)$/.test(w)) add(w.slice(0, -2));
    if (/s$/.test(w) && !/ss$/.test(w)) add(w.slice(0, -1));
    add(w + 's');
    add(w + 'es');
    if (/[^aeiou]y$/.test(w)) add(w.slice(0, -1) + 'ies');
    return out;
  }

  function phraseVariants(phrase) {
    var s = String(phrase || '').toLowerCase().replace(/\s+/g, ' ').trim();
    s = s.replace(/^of\s+/, '');
    var comma = s.indexOf(',');
    if (comma >= 0) s = s.slice(0, comma).trim();
    s = s.replace(/[,\s]*\bto taste\b.*$/i, '').trim();
    if (!s) return [''];

    var m = /^(.*?)(\S+)\s*$/.exec(s);
    var rest = m ? m[1] : '';
    var head = m ? m[2] : s;
    var forms = wordForms(head);
    var seen = {};
    var out = [];
    forms.forEach(function (form) {
      var key = rest + form;
      if (!seen[key]) {
        seen[key] = true;
        out.push(key);
      }
    });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Scaling.
   * ------------------------------------------------------------------ */

  function toFrac(v) {
    if (v == null) return frac(1, 1);
    if (typeof v === 'number') {
      if (!isFinite(v)) return frac(1, 1);
      if (Math.abs(v - Math.round(v)) < 1e-9) return frac(Math.round(v), 1);
      return fracFromDecimalString(v.toFixed(6));
    }
    if (v.n != null && v.d != null) return frac(v.n, v.d);
    if (v.lo) return v.lo;
    return frac(1, 1);
  }

  function scaleQty(q, factor) {
    if (q == null) return null;
    var f = toFrac(factor);
    if (q.lo) {
      return { lo: mulFrac(q.lo, f), hi: q.hi ? mulFrac(q.hi, f) : null };
    }
    if (q.n != null) return mulFrac(q, f);
    return fracFromDecimalString(String(Number(q) * num(f)));
  }

  // A whole ingredient line, scaled by `factor` (a number or a fraction).
  function formatIngredientText(text, factor) {
    var p = parseIngredient(text);
    if (!p.qty) return p.raw.replace(/\s+/g, ' ').trim();
    var qty = scaleQty(p.qty, factor == null ? 1 : factor);
    var out = [formatQty(qty)];
    if (p.unit) {
      out.push(formatUnit(p.unit, qty));
      out.push(p.name);
    } else {
      out.push(switchHead(p.name, qtyUpperValue(qty) > 1));
    }
    return out.join(' ').trim();
  }

  /* ------------------------------------------------------------------ *
   * Shopping-list merging.
   * ------------------------------------------------------------------ */

  // Exact US volume, measured in teaspoons: 3 tsp = 1 tbsp, 16 tbsp = 1 cup.
  var US_TSP = {
    tsp: frac(1, 1),
    tbsp: frac(3, 1),
    cup: frac(48, 1),
    'fl oz': frac(6, 1)
  };
  // Metric-and-US mixing: 1 tsp = 5 ml, 1 tbsp = 15 ml, 1 cup = 240 ml.
  var ML_PER = {
    tsp: frac(5, 1),
    tbsp: frac(15, 1),
    cup: frac(240, 1),
    'fl oz': frac(30, 1),
    ml: frac(1, 1),
    l: frac(1000, 1)
  };
  var OZ_PER = { oz: frac(1, 1), lb: frac(16, 1) };
  var G_PER = { g: frac(1, 1), kg: frac(1000, 1), oz: frac(567, 20), lb: frac(4536, 10) };

  function mergeValue(q) {
    if (!q) return frac(0, 1);
    if (q.hi) return q.hi;
    if (q.lo) return q.lo;
    return q;
  }

  function sumParts(parts) {
    return parts.reduce(function (acc, p) {
      return addFrac(acc, mergeValue(p.qty));
    }, frac(0, 1));
  }

  function partsInBase(parts, table) {
    return parts.reduce(function (acc, p) {
      var per = table[p.unit];
      if (!per) return acc;
      return addFrac(acc, mulFrac(mergeValue(p.qty), per));
    }, frac(0, 1));
  }

  var SIMPLE_DENOMS = { 1: true, 2: true, 3: true, 4: true, 6: true, 8: true };

  function isSimple(f) {
    return !!SIMPLE_DENOMS[f.d];
  }

  function chooseUsVolume(tsp) {
    var cup = divFrac(tsp, US_TSP.cup);
    if (num(cup) >= 0.25 && isSimple(cup)) return { qty: cup, unit: 'cup' };
    var tbsp = divFrac(tsp, US_TSP.tbsp);
    if (num(tbsp) >= 1 && isSimple(tbsp)) return { qty: tbsp, unit: 'tbsp' };
    return { qty: tsp, unit: 'tsp' };
  }

  function roundFrac(f, unit) {
    var v = num(f);
    var step;
    if (unit === 'ml' || unit === 'g') step = v >= 20 ? 5 : 1;
    else if (unit === 'l' || unit === 'kg') step = 0.05;
    else step = 0.125;
    var rounded = Math.round(v / step) * step;
    return fracFromDecimalString(rounded.toFixed(4));
  }

  function bucketKey(unit) {
    if (!unit) return 'count';
    var info = UNIT_INFO[unit];
    if (!info) return 'unit:' + unit;
    if (info.family === 'count') return 'unit:' + unit;
    return info.family;
  }

  function addName(bucket, name) {
    var clean = shoppingName(name);
    if (clean && bucket.names.indexOf(clean) < 0) bucket.names.push(clean);
  }

  // Prefer a spelling a recipe actually used; fall back to singular/plural
  // only for uncounted names, so mass nouns like "butter" never become "butters".
  function chooseName(bucket) {
    var wantPlural = qtyUpperValue(bucket.qty) > 1;
    for (var i = 0; i < bucket.names.length; i++) {
      if (isPluralName(bucket.names[i]) === wantPlural) return bucket.names[i];
    }
    if (!bucket.unit) {
      var base = bucket.names[0] || shoppingName(bucket.name);
      return switchHead(base, wantPlural);
    }
    return bucket.names[0] || shoppingName(bucket.name);
  }

  function finalize(b) {
    if (!b.parts.length) {
      b.qty = null;
      return b;
    }

    var units = [];
    b.parts.forEach(function (p) {
      if (units.indexOf(p.unit) < 0) units.push(p.unit);
    });

    if (units.length === 1) {
      b.qty = b.parts.length === 1 ? b.parts[0].qty : sumParts(b.parts);
      b.unit = units[0];
      return b;
    }

    var firstUnit = units[0];

    if (b.family === 'volume') {
      var allUs = units.every(function (u) { return !!US_TSP[u]; });
      if (allUs) {
        var tsp = partsInBase(b.parts, US_TSP);
        var chosen = chooseUsVolume(tsp);
        b.qty = chosen.qty;
        b.unit = chosen.unit;
        return b;
      }
      var ml = partsInBase(b.parts, ML_PER);
      var allMetric = units.every(function (u) { return u === 'ml' || u === 'l'; });
      if (allMetric) {
        if (num(ml) >= 1000) {
          b.qty = roundFrac(divFrac(ml, frac(1000, 1)), 'l');
          b.unit = 'l';
        } else {
          b.qty = roundFrac(ml, 'ml');
          b.unit = 'ml';
        }
        return b;
      }
      b.qty = roundFrac(divFrac(ml, ML_PER[firstUnit]), firstUnit);
      b.unit = firstUnit;
      return b;
    }

    if (b.family === 'weight') {
      var allImperial = units.every(function (u) { return u === 'oz' || u === 'lb'; });
      if (allImperial) {
        var oz = partsInBase(b.parts, OZ_PER);
        if (num(oz) >= 16) {
          var lb = divFrac(oz, frac(16, 1));
          if (isSimple(lb)) {
            b.qty = lb;
            b.unit = 'lb';
            return b;
          }
        }
        b.qty = oz;
        b.unit = 'oz';
        return b;
      }
      var grams = partsInBase(b.parts, G_PER);
      var allMetricWeight = units.every(function (u) { return u === 'g' || u === 'kg'; });
      if (allMetricWeight) {
        if (num(grams) >= 1000) {
          b.qty = roundFrac(divFrac(grams, frac(1000, 1)), 'kg');
          b.unit = 'kg';
        } else {
          b.qty = roundFrac(grams, 'g');
          b.unit = 'g';
        }
        return b;
      }
      b.qty = roundFrac(divFrac(grams, G_PER[firstUnit]), firstUnit);
      b.unit = firstUnit;
      return b;
    }

    b.qty = sumParts(b.parts);
    return b;
  }

  // items: [{ text: "1 cup flour", source: "Pancakes" }] or plain strings.
  // Returns rows: { key, name, displayName, unit, family, qty, sources }.
  function buildShoppingList(items) {
    var amountBuckets = [];
    var amountIndex = {};
    var noAmountEntries = [];

    function createBucket(p, key) {
      return {
        key: key,
        name: p.name,
        unit: p.unit,
        family: p.unit ? UNIT_INFO[p.unit].family : 'count',
        parts: [],
        sources: [],
        keys: {},
        names: []
      };
    }

    (items || []).forEach(function (item) {
      if (!item) return;
      var text = typeof item === 'string' ? item : item.text;
      var source = typeof item === 'string' ? null : item.source;
      if (!text) return;
      var p = parseIngredient(text);

      if (!p.qty) {
        noAmountEntries.push({
          name: p.name,
          source: source,
          variants: phraseVariants(p.name)
        });
        return;
      }

      var variants = phraseVariants(p.name);
      var familyKey = bucketKey(p.unit);
      var bucket = null;

      variants.forEach(function (variant) {
        if (!bucket && amountIndex[variant + '|' + familyKey]) {
          bucket = amountIndex[variant + '|' + familyKey];
        }
      });

      if (!bucket) {
        bucket = createBucket(p, variants[0] + '|' + familyKey);
        amountBuckets.push(bucket);
      }

      variants.forEach(function (variant) {
        bucket.keys[variant] = true;
        amountIndex[variant + '|' + familyKey] = bucket;
      });
      addName(bucket, p.name);
      bucket.parts.push({ qty: p.qty, unit: p.unit });
      if (source && bucket.sources.indexOf(source) < 0) bucket.sources.push(source);
    });

    // A "to taste" line joins a row that already has an amount for the same
    // ingredient; only ingredients with no amounts get their own row.
    var noAmountBuckets = [];

    noAmountEntries.forEach(function (entry) {
      var target = null;

      amountBuckets.forEach(function (bucket) {
        if (target) return;
        entry.variants.forEach(function (variant) {
          if (!target && bucket.keys[variant]) target = bucket;
        });
      });

      if (target) {
        if (entry.source && target.sources.indexOf(entry.source) < 0) {
          target.sources.push(entry.source);
        }
        return;
      }

      var bucket = null;
      noAmountBuckets.forEach(function (existing) {
        if (bucket) return;
        entry.variants.forEach(function (variant) {
          if (!bucket && existing.keys[variant]) bucket = existing;
        });
      });

      if (!bucket) {
        bucket = {
          key: entry.variants[0] + '|none',
          name: entry.name,
          unit: null,
          family: 'count',
          parts: [],
          sources: [],
          keys: {},
          names: []
        };
        noAmountBuckets.push(bucket);
      }

      entry.variants.forEach(function (variant) { bucket.keys[variant] = true; });
      addName(bucket, entry.name);
      if (entry.source && bucket.sources.indexOf(entry.source) < 0) {
        bucket.sources.push(entry.source);
      }
    });

    var rows = amountBuckets.concat(noAmountBuckets).map(function (bucket) {
      finalize(bucket);
      bucket.displayName = bucket.parts.length
        ? chooseName(bucket)
        : (bucket.names[0] || shoppingName(bucket.name));
      return bucket;
    });

    rows.sort(function (a, b) {
      return String(a.displayName || a.name).localeCompare(String(b.displayName || b.name));
    });
    return rows;
  }

  function formatShoppingRow(row) {
    if (!row) return '';
    if (!row.qty) return (row.displayName || row.name) + ' — to taste';
    var out = [formatQty(row.qty)];
    if (row.unit) out.push(formatUnit(row.unit, row.qty));
    out.push(row.displayName || row.name);
    return out.join(' ').trim();
  }

  /* ------------------------------------------------------------------ */

  var api = {
    frac: frac,
    addFrac: addFrac,
    subFrac: subFrac,
    mulFrac: mulFrac,
    divFrac: divFrac,
    num: num,
    parseAmount: parseAmount,
    parseIngredient: parseIngredient,
    formatQty: formatQty,
    formatUnit: formatUnit,
    scaleQty: scaleQty,
    formatIngredientText: formatIngredientText,
    buildShoppingList: buildShoppingList,
    formatShoppingRow: formatShoppingRow,
    nameKey: nameKey
  };

  root.Qty = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
