/*
 * Split — money helpers.
 *
 * Pure functions only: no DOM, no storage.
 * Every amount is an integer number of cents; no floating-point arithmetic.
 *
 * Loaded as a plain script in the browser (window.Money) and required
 * directly by the Node test file (module.exports).
 */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------- basics */

  function isInt(value) {
    return typeof value === 'number' && isFinite(value) && Math.floor(value) === value;
  }

  /** FNV-1a 32-bit hash. Used only to rotate leftover pennies fairly. */
  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  function startIndex(seed, length) {
    if (!length) return 0;
    return hash(seed == null ? '' : String(seed)) % length;
  }

  /** Rotate an id list so leftover pennies do not always land on one person. */
  function rotate(ids, seed) {
    var n = ids.length;
    var start = startIndex(seed, n);
    var out = [];
    for (var i = 0; i < n; i++) out.push(ids[(start + i) % n]);
    return out;
  }

  function uniqueIds(ids) {
    var seen = Object.create(null);
    for (var i = 0; i < ids.length; i++) {
      if (typeof ids[i] !== 'string' || !ids[i] || seen[ids[i]]) return false;
      seen[ids[i]] = true;
    }
    return true;
  }

  /* ------------------------------------------------------------ formatting */

  /**
   * Parse a money string into integer cents.
   * Accepts "12", "12.5", ".50" is rejected, a leading "$" and surrounding
   * spaces are fine. Commas, signs and more than two decimals are rejected.
   * Returns null when the value is not a valid non-negative amount.
   */
  function parseCents(value) {
    if (typeof value === 'number') {
      if (!isFinite(value) || value < 0) return null;
      var cents = Math.round(value * 100);
      if (Math.abs(value * 100 - cents) > 1e-6) return null;
      return cents;
    }
    if (typeof value !== 'string') return null;
    var s = value.trim();
    if (s.charAt(0) === '$') s = s.slice(1).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    var parts = s.split('.');
    var whole = parseInt(parts[0], 10);
    var frac = parts[1] ? parseInt((parts[1] + '00').slice(0, 2), 10) : 0;
    if (!isFinite(whole) || !isFinite(frac)) return null;
    return whole * 100 + frac;
  }

  /** 1250 -> "12.50"; -50 -> "-0.50". */
  function formatCents(cents) {
    if (!isInt(cents)) return '';
    var sign = cents < 0 ? '-' : '';
    var abs = Math.abs(cents);
    var frac = abs % 100;
    return sign + Math.floor(abs / 100) + '.' + (frac < 10 ? '0' + frac : String(frac));
  }

  /** 1250 -> "$12.50"; -50 -> "-$0.50". */
  function formatMoney(cents) {
    if (!isInt(cents)) return '';
    return (cents < 0 ? '-$' : '$') + formatCents(Math.abs(cents));
  }

  /* ---------------------------------------------------------------- splits */

  /**
   * Split equally among ids.
   * Each person gets floor(total / n); the leftover cents go one each to the
   * first people in an order rotated by the expense id.
   */
  function splitEqual(total, ids, seed) {
    if (!isInt(total) || total < 0 || !Array.isArray(ids) || !ids.length) return null;
    if (!uniqueIds(ids)) return null;
    var n = ids.length;
    var base = Math.floor(total / n);
    var leftover = total - base * n;
    var order = rotate(ids, seed);
    var result = Object.create(null);
    for (var i = 0; i < n; i++) result[ids[i]] = base;
    for (var j = 0; j < leftover; j++) result[order[j]] += 1;
    return result;
  }

  /**
   * Split in proportion to positive integer weights using largest remainders.
   * Weights of 0 are not valid here; leave those people out of the map.
   */
  function splitShares(total, weights, seed) {
    if (!isInt(total) || total < 0 || !weights || typeof weights !== 'object') return null;
    var ids = Object.keys(weights);
    if (!ids.length || !uniqueIds(ids)) return null;
    var weightTotal = 0;
    for (var i = 0; i < ids.length; i++) {
      var w = weights[ids[i]];
      if (!isInt(w) || w <= 0) return null;
      weightTotal += w;
    }
    if (!weightTotal) return null;

    var result = Object.create(null);
    var remainder = Object.create(null);
    var used = 0;
    for (var j = 0; j < ids.length; j++) {
      var id = ids[j];
      var exact = total * weights[id];
      result[id] = Math.floor(exact / weightTotal);
      remainder[id] = exact % weightTotal;
      used += result[id];
    }

    var leftover = total - used;
    var rank = Object.create(null);
    rotate(ids, seed).forEach(function (id, index) { rank[id] = index; });
    var order = ids.slice().sort(function (a, b) {
      if (remainder[b] !== remainder[a]) return remainder[b] - remainder[a];
      return rank[a] - rank[b];
    });
    for (var k = 0; k < leftover; k++) result[order[k]] += 1;
    return result;
  }

  /**
   * Exact amounts, in cents. Every amount must be a non-negative integer and
   * the amounts must add up to the total. Zero is allowed.
   * Returns {ok: true, shares} or {ok: false, error}.
   */
  function splitExact(total, amounts) {
    if (!isInt(total) || total < 0 || !amounts || typeof amounts !== 'object') {
      return { ok: false, error: 'Invalid total' };
    }
    var ids = Object.keys(amounts);
    var sum = 0;
    for (var i = 0; i < ids.length; i++) {
      var amount = amounts[ids[i]];
      if (!isInt(amount) || amount < 0) {
        return { ok: false, error: 'Amounts must be whole cents, zero or more' };
      }
      sum += amount;
    }
    if (sum !== total) {
      return { ok: false, error: 'Off by $' + formatCents(Math.abs(total - sum)) };
    }
    var shares = Object.create(null);
    for (var j = 0; j < ids.length; j++) shares[ids[j]] = amounts[ids[j]];
    return { ok: true, shares: shares };
  }

  /** Recompute one expense's per-person shares from its split definition. */
  function computeShares(expense) {
    if (!expense) return {};
    var split = expense.split || {};
    var total = expense.amountCents;
    var result = null;
    if (split.mode === 'equal') {
      result = splitEqual(total, split.participants || [], expense.id);
    } else if (split.mode === 'shares') {
      result = splitShares(total, split.weights || {}, expense.id);
    } else if (split.mode === 'exact') {
      var exact = splitExact(total, split.amounts || {});
      result = exact.ok ? exact.shares : null;
    }
    return result || {};
  }

  /* -------------------------------------------------------------- balances */

  /**
   * Net balance per member, in cents.
   * Positive means the member is owed money; negative means they owe.
   * Expenses: payer +total, each participant −share.
   * Payments: from +amount, to −amount.
   * The balances always add up to zero when the data is consistent.
   */
  function balances(group) {
    var result = Object.create(null);
    (group.members || []).forEach(function (member) { result[member.id] = 0; });

    (group.expenses || []).forEach(function (expense) {
      var shares = expense.shares;
      if (!shares || !Object.keys(shares).length) shares = computeShares(expense);
      if (result[expense.paidBy] == null) result[expense.paidBy] = 0;
      result[expense.paidBy] += expense.amountCents;
      Object.keys(shares || {}).forEach(function (id) {
        if (result[id] == null) result[id] = 0;
        result[id] -= shares[id];
      });
    });

    (group.payments || []).forEach(function (payment) {
      if (result[payment.from] == null) result[payment.from] = 0;
      if (result[payment.to] == null) result[payment.to] = 0;
      result[payment.from] += payment.amountCents;
      result[payment.to] -= payment.amountCents;
    });

    return result;
  }

  /* ------------------------------------------------------------- settle up */

  /**
   * Fewest-payment suggestion. First pairs debtors and creditors whose
   * amounts match exactly, then greedily matches the largest remaining debtor
   * with the largest remaining creditor. Ties are broken by member name so
   * the list is stable. Returns [{from, to, amount}] with integer cents.
   */
  function settleUp(balancesMap, names) {
    var nameOf = typeof names === 'function'
      ? names
      : function (id) { return (names && names[id]) || id; };

    var debtors = [];
    var creditors = [];
    Object.keys(balancesMap || {}).forEach(function (id) {
      var amount = balancesMap[id];
      if (!isInt(amount) || amount === 0) return;
      var person = { id: id, amount: Math.abs(amount), name: nameOf(id) };
      if (amount < 0) debtors.push(person);
      else creditors.push(person);
    });

    function byAmountThenName(a, b) {
      if (b.amount !== a.amount) return b.amount - a.amount;
      var byName = String(a.name).localeCompare(String(b.name));
      if (byName) return byName;
      return String(a.id).localeCompare(String(b.id));
    }
    debtors.sort(byAmountThenName);
    creditors.sort(byAmountThenName);

    var payments = [];

    /* Exact matches first: these remove a payment greedy would otherwise add. */
    for (var i = 0; i < debtors.length; i++) {
      if (!debtors[i].amount) continue;
      for (var j = 0; j < creditors.length; j++) {
        if (creditors[j].amount !== debtors[i].amount) continue;
        payments.push({ from: debtors[i].id, to: creditors[j].id, amount: debtors[i].amount });
        debtors[i].amount = 0;
        creditors[j].amount = 0;
        break;
      }
    }

    var openDebtors = debtors.filter(function (person) { return person.amount > 0; });
    var openCreditors = creditors.filter(function (person) { return person.amount > 0; });

    /* Then repeatedly match the largest remaining debtor with the largest
       remaining creditor. Re-sorting keeps that true after partial payments. */
    while (openDebtors.length && openCreditors.length) {
      openDebtors = openDebtors.filter(function (person) { return person.amount > 0; });
      openCreditors = openCreditors.filter(function (person) { return person.amount > 0; });
      if (!openDebtors.length || !openCreditors.length) break;
      openDebtors.sort(byAmountThenName);
      openCreditors.sort(byAmountThenName);
      var debtor = openDebtors[0];
      var creditor = openCreditors[0];
      var pay = Math.min(debtor.amount, creditor.amount);
      payments.push({ from: debtor.id, to: creditor.id, amount: pay });
      debtor.amount -= pay;
      creditor.amount -= pay;
    }

    return payments;
  }

  /* ---------------------------------------------------------------- export */

  var Money = {
    parseCents: parseCents,
    formatCents: formatCents,
    formatMoney: formatMoney,
    splitEqual: splitEqual,
    splitShares: splitShares,
    splitExact: splitExact,
    computeShares: computeShares,
    balances: balances,
    settleUp: settleUp,
    hash: hash
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Money;
  if (root) root.Money = Money;
})(typeof globalThis !== 'undefined' ? globalThis : this);
