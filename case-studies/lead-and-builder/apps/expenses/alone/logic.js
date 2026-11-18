// Pure money and balance logic. All amounts are integer cents.
(function (root) {
  'use strict';

  // "12", "12.3", "12.34", "1,234.50" -> cents. Returns null if not a valid non-negative amount.
  function parseMoney(text) {
    if (typeof text === 'number') text = String(text);
    var s = String(text || '').trim().replace(/[,\s]/g, '').replace(/^[$€£¥]/, '');
    var m = /^(\d*)(?:\.(\d{0,2}))?$/.exec(s);
    if (!m || (m[1] === '' && !m[2])) return null;
    var whole = m[1] === '' ? 0 : parseInt(m[1], 10);
    var frac = (m[2] || '').padEnd(2, '0');
    var cents = whole * 100 + parseInt(frac || '0', 10);
    return Number.isSafeInteger(cents) ? cents : null;
  }

  function formatMoney(cents, symbol) {
    var sign = cents < 0 ? '-' : '';
    var abs = Math.abs(cents);
    var whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return sign + (symbol == null ? '' : symbol) + whole + '.' + String(abs % 100).padStart(2, '0');
  }

  // Plain number for CSV: -1234.5 cents style -> "-12.34"
  function centsToPlain(cents) {
    var sign = cents < 0 ? '-' : '';
    var abs = Math.abs(cents);
    return sign + Math.floor(abs / 100) + '.' + String(abs % 100).padStart(2, '0');
  }

  // Small deterministic string hash, used so leftover pennies don't always land on the same person.
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // Split `total` cents across ids in proportion to integer weights.
  // Everyone gets floor(total*w/W); leftover cents go one each to the largest fractional
  // remainders. Ties are broken by an order rotated by `seed`, so across many expenses
  // nobody is systematically the one who pays the extra penny.
  function allocate(total, ids, weights, seed) {
    var W = 0, i;
    for (i = 0; i < weights.length; i++) W += weights[i];
    if (!ids.length || W <= 0) return null;
    var rot = hash(String(seed || '')) % ids.length;
    var rows = ids.map(function (id, i) {
      var num = total * weights[i];
      var base = Math.floor(num / W);
      return { id: id, base: base, rem: num - base * W, tie: (i - rot + ids.length) % ids.length };
    });
    var given = rows.reduce(function (s, r) { return s + r.base; }, 0);
    var left = total - given;
    var order = rows.slice().sort(function (a, b) { return b.rem - a.rem || a.tie - b.tie; });
    for (i = 0; i < left; i++) order[i].base += 1;
    var out = {};
    rows.forEach(function (r) { out[r.id] = r.base; });
    return out;
  }

  // Work out each person's share of an expense. Returns {shares: {id: cents}} or {error: msg}.
  // expense: {id, amount, splitType: 'equal'|'shares'|'exact', split: {memberId: value}}
  //   equal:  split[id] = 1 for each person included
  //   shares: split[id] = positive integer weight
  //   exact:  split[id] = cents
  function computeShares(expense, symbol) {
    var amount = expense.amount;
    if (!Number.isSafeInteger(amount) || amount <= 0) return { error: 'Enter an amount above zero.' };
    var split = expense.split || {};
    var ids = Object.keys(split).filter(function (id) { return split[id] > 0; });
    if (!ids.length) return { error: 'Pick at least one person to split with.' };
    if (expense.splitType === 'exact') {
      var sum = 0, shares = {};
      for (var i = 0; i < ids.length; i++) {
        var v = split[ids[i]];
        if (!Number.isSafeInteger(v) || v < 0) return { error: 'Exact amounts must be valid money.' };
        shares[ids[i]] = v; sum += v;
      }
      if (sum !== amount) {
        var diff = amount - sum;
        return { error: 'Exact amounts add up to ' + formatMoney(sum, symbol) + ', which is ' +
          formatMoney(Math.abs(diff), symbol) + (diff > 0 ? ' short of ' : ' over ') + 'the total ' + formatMoney(amount, symbol) + '.' };
      }
      return { shares: shares };
    }
    var weights = ids.map(function (id) {
      return expense.splitType === 'shares' ? split[id] : 1;
    });
    for (var j = 0; j < weights.length; j++) {
      if (!Number.isSafeInteger(weights[j]) || weights[j] <= 0) return { error: 'Shares must be whole numbers above zero.' };
    }
    return { shares: allocate(amount, ids, weights, expense.id) };
  }

  // Net balance per member: positive = is owed money, negative = owes money.
  function balances(group) {
    var bal = {};
    group.members.forEach(function (m) { bal[m.id] = 0; });
    function add(id, v) { bal[id] = (bal[id] || 0) + v; }
    group.expenses.forEach(function (e) {
      var r = computeShares(e);
      if (!r.shares) return;
      add(e.paidBy, e.amount);
      Object.keys(r.shares).forEach(function (id) { add(id, -r.shares[id]); });
    });
    group.payments.forEach(function (p) {
      add(p.from, p.amount);
      add(p.to, -p.amount);
    });
    return bal;
  }

  // Greedy: biggest debtor pays biggest creditor. At most n-1 payments.
  function greedySettle(entries) {
    var debtors = entries.filter(function (e) { return e[1] < 0; }).map(function (e) { return [e[0], -e[1]]; });
    var creditors = entries.filter(function (e) { return e[1] > 0; }).map(function (e) { return [e[0], e[1]]; });
    var out = [];
    while (debtors.length && creditors.length) {
      debtors.sort(function (a, b) { return b[1] - a[1]; });
      creditors.sort(function (a, b) { return b[1] - a[1]; });
      var d = debtors[0], c = creditors[0], x = Math.min(d[1], c[1]);
      out.push({ from: d[0], to: c[0], amount: x });
      d[1] -= x; c[1] -= x;
      if (!d[1]) debtors.shift();
      if (!c[1]) creditors.shift();
    }
    return out;
  }

  // Fewest payments that clear every balance. The minimum is (people with a non-zero balance)
  // minus (the most groups they can be split into that each sum to zero), so we search for
  // that partition exactly when it's small enough, then settle each group greedily.
  var EXACT_LIMIT = 14;
  function settleUp(bal) {
    var entries = Object.keys(bal).filter(function (id) { return bal[id] !== 0; })
      .map(function (id) { return [id, bal[id]]; });
    var n = entries.length;
    if (n === 0) return [];
    if (n > EXACT_LIMIT) return greedySettle(entries);

    var full = (1 << n) - 1;
    var sum = new Array(full + 1);
    sum[0] = 0;
    for (var mask = 1; mask <= full; mask++) {
      var low = mask & -mask;
      sum[mask] = sum[mask ^ low] + entries[31 - Math.clz32(low)][1];
    }
    // best[mask] = most zero-sum groups that exactly partition mask (only for zero-sum masks).
    var best = new Int8Array(full + 1).fill(-1);
    var pick = new Int32Array(full + 1);
    best[0] = 0;
    for (mask = 1; mask <= full; mask++) {
      if (sum[mask] !== 0) continue;
      var lowBit = mask & -mask, rest = mask ^ lowBit;
      // Enumerate zero-sum sub-groups that contain the lowest member.
      for (var sub = rest; ; sub = (sub - 1) & rest) {
        var g = sub | lowBit;
        if (sum[g] === 0 && best[mask ^ g] >= 0 && best[mask ^ g] + 1 > best[mask]) {
          best[mask] = best[mask ^ g] + 1;
          pick[mask] = g;
        }
        if (sub === 0) break;
      }
    }
    var out = [];
    mask = full;
    while (mask) {
      var grp = pick[mask];
      var part = [];
      for (var i = 0; i < n; i++) if (grp & (1 << i)) part.push(entries[i].slice());
      out = out.concat(greedySettle(part));
      mask ^= grp;
    }
    return out;
  }

  var api = {
    parseMoney: parseMoney, formatMoney: formatMoney, centsToPlain: centsToPlain,
    allocate: allocate, computeShares: computeShares, balances: balances,
    settleUp: settleUp, greedySettle: greedySettle
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Logic = api;
})(this);
