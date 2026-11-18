'use strict';

/*
 * Tests for money.js. No dependencies: run with `node tests/money.test.js`.
 * Exits non-zero if anything fails.
 */

var assert = require('assert');
var Money = require('../money.js');

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('ok - ' + name);
  } catch (error) {
    failed += 1;
    console.error('FAIL - ' + name);
    console.error('       ' + (error && error.message));
  }
}

function sum(map) {
  return Object.keys(map).reduce(function (total, key) { return total + map[key]; }, 0);
}

function applyTransfers(balances, transfers) {
  var copy = Object.assign({}, balances);
  transfers.forEach(function (transfer) {
    copy[transfer.from] += transfer.amount;
    copy[transfer.to] -= transfer.amount;
  });
  return copy;
}

function allZero(balances) {
  return Object.keys(balances).every(function (id) { return balances[id] === 0; });
}

function balancesWithoutShares(expense) {
  var copy = Object.assign({}, expense);
  delete copy.shares;
  return copy;
}

/* ------------------------------------------------------------ parse/format */

test('parseCents accepts dollars and cents', function () {
  assert.strictEqual(Money.parseCents('12.5'), 1250);
  assert.strictEqual(Money.parseCents('12.50'), 1250);
  assert.strictEqual(Money.parseCents('$12.05'), 1205);
  assert.strictEqual(Money.parseCents(' 7 '), 700);
  assert.strictEqual(Money.parseCents('0.01'), 1);
  assert.strictEqual(Money.parseCents('0'), 0);
  assert.strictEqual(Money.parseCents(12.5), 1250);
});

test('parseCents rejects bad input', function () {
  assert.strictEqual(Money.parseCents('12.345'), null);
  assert.strictEqual(Money.parseCents('-1'), null);
  assert.strictEqual(Money.parseCents(''), null);
  assert.strictEqual(Money.parseCents('   '), null);
  assert.strictEqual(Money.parseCents('1,234.56'), null);
  assert.strictEqual(Money.parseCents('.50'), null);
  assert.strictEqual(Money.parseCents('12.'), null);
  assert.strictEqual(Money.parseCents('$'), null);
  assert.strictEqual(Money.parseCents('twelve'), null);
  assert.strictEqual(Money.parseCents(null), null);
  assert.strictEqual(Money.parseCents(-5), null);
});

test('formatCents is exact and pads cents', function () {
  assert.strictEqual(Money.formatCents(1250), '12.50');
  assert.strictEqual(Money.formatCents(5), '0.05');
  assert.strictEqual(Money.formatCents(0), '0.00');
  assert.strictEqual(Money.formatCents(100000), '1000.00');
  assert.strictEqual(Money.formatCents(-1250), '-12.50');
});

test('formatMoney adds a currency symbol', function () {
  assert.strictEqual(Money.formatMoney(1250), '$12.50');
  assert.strictEqual(Money.formatMoney(-50), '-$0.50');
  assert.strictEqual(Money.formatMoney(0), '$0.00');
});

/* --------------------------------------------------------------- equal split */

test('equal split of 100 cents over 3 adds up exactly', function () {
  var shares = Money.splitEqual(100, ['a', 'b', 'c'], 'expense-1');
  assert.strictEqual(sum(shares), 100);
  assert.ok(shares.a >= 33 && shares.a <= 34);
  assert.ok(shares.b >= 33 && shares.b <= 34);
  assert.ok(shares.c >= 33 && shares.c <= 34);
});

test('equal split leftover pennies rotate across expenses', function () {
  var counts = { a: 0, b: 0, c: 0 };
  for (var i = 0; i < 12; i++) {
    var shares = Money.splitEqual(100, ['a', 'b', 'c'], 'expense-' + i);
    assert.strictEqual(sum(shares), 100);
    Object.keys(shares).forEach(function (id) {
      if (shares[id] === 34) counts[id] += 1;
    });
  }
  assert.ok(counts.a > 0, 'a should sometimes get the extra penny');
  assert.ok(counts.b > 0, 'b should sometimes get the extra penny');
  assert.ok(counts.c > 0, 'c should sometimes get the extra penny');
});

test('equal split is deterministic for the same expense id', function () {
  assert.deepStrictEqual(
    Money.splitEqual(1000, ['a', 'b', 'c'], 'same'),
    Money.splitEqual(1000, ['a', 'b', 'c'], 'same')
  );
});

test('equal split totals always add up', function () {
  for (var total = 0; total <= 500; total++) {
    for (var n = 1; n <= 7; n++) {
      var ids = [];
      for (var i = 0; i < n; i++) ids.push('p' + i);
      var shares = Money.splitEqual(total, ids, 'seed-' + total + '-' + n);
      assert.strictEqual(sum(shares), total, 'total ' + total + ' over ' + n);
    }
  }
});

/* -------------------------------------------------------------- shares split */

test('shares split 2:1:1 of $10.01 uses largest remainders', function () {
  var shares = Money.splitShares(1001, { a: 2, b: 1, c: 1 }, 'dinner');
  assert.strictEqual(shares.a, 501);
  assert.strictEqual(shares.b, 250);
  assert.strictEqual(shares.c, 250);
  assert.strictEqual(sum(shares), 1001);
});

test('shares split ties rotate fairly', function () {
  var counts = { a: 0, b: 0, c: 0 };
  for (var i = 0; i < 12; i++) {
    var shares = Money.splitShares(100, { a: 1, b: 1, c: 1 }, 'tie-' + i);
    assert.strictEqual(sum(shares), 100);
    Object.keys(shares).forEach(function (id) {
      if (shares[id] === 34) counts[id] += 1;
    });
  }
  assert.ok(counts.a > 0 && counts.b > 0 && counts.c > 0);
});

test('shares split totals always add up', function () {
  for (var total = 0; total <= 300; total++) {
    var shares = Money.splitShares(total, { a: 3, b: 2, c: 1, d: 4 }, 'seed-' + total);
    assert.strictEqual(sum(shares), total);
  }
});

test('shares split rejects zero or non-integer weights', function () {
  assert.strictEqual(Money.splitShares(100, { a: 1, b: 0 }, 'x'), null);
  assert.strictEqual(Money.splitShares(100, { a: 1, b: 1.5 }, 'x'), null);
  assert.strictEqual(Money.splitShares(100, {}, 'x'), null);
});

/* --------------------------------------------------------------- exact split */

test('exact split accepts amounts adding up to the total', function () {
  var result = Money.splitExact(1001, { a: 500, b: 300, c: 201 });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(sum(result.shares), 1001);
  assert.strictEqual(result.shares.c, 201);
});

test('exact split allows a zero share', function () {
  var result = Money.splitExact(500, { a: 500, b: 0 });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.shares.b, 0);
});

test('exact split names the difference when amounts are off', function () {
  var result = Money.splitExact(1001, { a: 500, b: 498 });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, 'Off by $0.03');
});

test('exact split rejects negative and fractional cents', function () {
  assert.strictEqual(Money.splitExact(100, { a: -50, b: 150 }).ok, false);
  assert.strictEqual(Money.splitExact(100, { a: 50.5, b: 49.5 }).ok, false);
});

/* ------------------------------------------------------------------ balances */

function sampleGroup() {
  var shares = Money.splitEqual(1001, ['a', 'b', 'c'], 'e1');
  return {
    members: [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Ben' }, { id: 'c', name: 'Cleo' }],
    expenses: [{
      id: 'e1', description: 'Dinner', amountCents: 1001, paidBy: 'a',
      date: '2026-01-02', createdAt: '2026-01-02T19:00:00.000Z',
      split: { mode: 'equal', participants: ['a', 'b', 'c'] }, shares: shares
    }],
    payments: [{
      id: 'p1', from: 'b', to: 'a', amountCents: 250,
      date: '2026-01-03', createdAt: '2026-01-03T10:00:00.000Z', note: ''
    }]
  };
}

test('balances use the saved shares and add to zero', function () {
  var group = sampleGroup();
  var result = Money.balances(group);
  var share = group.expenses[0].shares;
  assert.strictEqual(result.a, 1001 - share.a - 250);
  assert.strictEqual(result.b, 250 - share.b);
  assert.strictEqual(result.c, -share.c);
  assert.strictEqual(result.a + result.b + result.c, 0);
});

test('balances fall back to recomputing missing shares', function () {
  var group = sampleGroup();
  group.expenses[0] = balancesWithoutShares(group.expenses[0]);
  assert.deepStrictEqual(Money.balances(group), Money.balances(sampleGroup()));
});

test('payments move balances between two people', function () {
  var group = {
    members: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    expenses: [],
    payments: [{ id: 'p', from: 'a', to: 'b', amountCents: 1234, date: '2026-01-01', createdAt: '' }]
  };
  var result = Money.balances(group);
  assert.strictEqual(result.a, 1234);
  assert.strictEqual(result.b, -1234);
});

/* ----------------------------------------------------------------- settle up */

test('settle up clears a simple debt in one payment', function () {
  var transfers = Money.settleUp({ a: -500, b: 500 }, { a: 'Ana', b: 'Ben' });
  assert.deepStrictEqual(transfers, [{ from: 'a', to: 'b', amount: 500 }]);
});

test('settled-up balances need no payments', function () {
  assert.deepStrictEqual(Money.settleUp({ a: 0, b: 0 }, { a: 'A', b: 'B' }), []);
});

test('settle up pairs equal amounts first', function () {
  var transfers = Money.settleUp(
    { a: -500, b: -500, c: 500, d: 500 },
    { a: 'Ana', b: 'Ben', c: 'Cleo', d: 'Dev' }
  );
  assert.strictEqual(transfers.length, 2);
  assert.ok(allZero(applyTransfers({ a: -500, b: -500, c: 500, d: 500 }, transfers)));
});

test('settle up greedy case uses n-1 payments and clears everything', function () {
  var balances = { a: -300, b: -200, c: 250, d: 250 };
  var transfers = Money.settleUp(balances, { a: 'Ana', b: 'Ben', c: 'Cleo', d: 'Dev' });
  assert.strictEqual(transfers.length, 3);
  assert.ok(allZero(applyTransfers(balances, transfers)));
  transfers.forEach(function (transfer) { assert.ok(transfer.amount > 0); });
});

test('settle up breaks amount ties by member name', function () {
  var transfers = Money.settleUp(
    { x: -100, y: -100, a: 200 },
    { x: 'Zoe', y: 'Amy', a: 'Mia' }
  );
  assert.strictEqual(transfers[0].from, 'y'); /* Amy before Zoe */
  assert.strictEqual(transfers[0].to, 'a');
  assert.strictEqual(transfers[0].amount, 100);
  assert.strictEqual(transfers[1].from, 'x');
});

test('settle up never mutates the balances it is given', function () {
  var balances = { a: -300, b: -200, c: 250, d: 250 };
  var copy = Object.assign({}, balances);
  Money.settleUp(balances, {});
  assert.deepStrictEqual(balances, copy);
});

test('settle up always clears balances with at most n-1 payments', function () {
  for (var round = 0; round < 60; round++) {
    var people = 2 + (round % 6);
    var balances = {};
    var running = 0;
    for (var i = 0; i < people - 1; i++) {
      var amount = ((round + 1) * 73 + i * 41) % 2401 - 1200;
      balances['m' + i] = amount;
      running += amount;
    }
    balances['m' + (people - 1)] = -running;

    var names = {};
    Object.keys(balances).forEach(function (id) { names[id] = id.toUpperCase(); });

    var transfers = Money.settleUp(balances, names);
    assert.ok(transfers.length <= people - 1, 'round ' + round + ': ' + transfers.length + ' payments for ' + people + ' people');
    assert.ok(allZero(applyTransfers(balances, transfers)), 'round ' + round + ' should clear');
    transfers.forEach(function (transfer) {
      assert.ok(transfer.amount > 0);
      assert.notStrictEqual(transfer.from, transfer.to);
    });
  }
});

/* -------------------------------------------------------------------- report */

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
if (failed) process.exitCode = 1;
