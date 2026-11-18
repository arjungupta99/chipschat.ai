// Run with: node tests/quantities.test.js
const assert = require('assert');
const Q = require('../quantities.js');

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log('ok   ' + name);
  } catch (e) {
    failed++;
    console.log('FAIL ' + name + '\n     ' + e.message);
  }
}
const texts = (items) => Q.combine(items).map((i) => i.text);

check('reads whole, decimal, fraction, mixed and unicode amounts', () => {
  assert.strictEqual(Q.parseIngredient('2 cups flour').min, 2);
  assert.strictEqual(Q.parseIngredient('1.5 cups milk').min, 1.5);
  assert.strictEqual(Q.parseIngredient('3/4 cup sugar').min, 0.75);
  assert.strictEqual(Q.parseIngredient('1 1/2 cups flour').min, 1.5);
  assert.strictEqual(Q.parseIngredient('½ tsp salt').min, 0.5);
  assert.strictEqual(Q.parseIngredient('1½ cups flour').min, 1.5);
  assert.strictEqual(Q.parseIngredient('1 ½ cups flour').min, 1.5);
  assert.strictEqual(Q.parseIngredient('200g butter').min, 200);
});

check('reads units and names', () => {
  const p = Q.parseIngredient('1 1/2 cups of flour, sifted');
  assert.deepStrictEqual([p.unit, p.name], ['cup', 'flour']);
  assert.strictEqual(Q.parseIngredient('2 Tbsp olive oil').unit, 'tbsp');
  assert.strictEqual(Q.parseIngredient('1 T butter').unit, 'tbsp');
  assert.strictEqual(Q.parseIngredient('1 t vanilla').unit, 'tsp');
  assert.strictEqual(Q.parseIngredient('2 carrots').unit, '');
  assert.strictEqual(Q.parseIngredient('2 cans (14 oz) tomatoes').name, 'tomatoes');
  assert.strictEqual(Q.parseIngredient('Salt to taste').min, null);
});

check('adds the same ingredient across recipes', () => {
  assert.deepStrictEqual(texts([{ line: '2 cups flour' }, { line: '1 cup flour' }]), ['3 cups flour']);
  assert.deepStrictEqual(texts([{ line: '1 1/2 cups flour' }, { line: '½ cup flour' }]), ['2 cups flour']);
  assert.deepStrictEqual(texts([{ line: '1½ cups sugar' }, { line: '1 1/2 cup sugar' }]), ['3 cups sugar']);
  assert.deepStrictEqual(texts([{ line: '1/3 cup oil' }, { line: '1/3 cup oil' }]), ['⅔ cup oil']);
  assert.deepStrictEqual(texts([{ line: '2 eggs' }, { line: '1 egg, beaten' }]), ['3 eggs']);
  assert.deepStrictEqual(texts([{ line: '1 onion, chopped' }, { line: '1 Onion' }]), ['2 onions']);
  assert.deepStrictEqual(texts([{ line: '2 tablespoons butter' }, { line: '1 tbsp butter' }]), ['3 tbsp butter']);
  assert.deepStrictEqual(texts([{ line: '250 g pasta' }, { line: '0.5 kg pasta' }]), ['250 g pasta', '0.5 kg pasta']);
  assert.deepStrictEqual(texts([{ line: 'Salt to taste' }, { line: 'salt to taste' }]), ['Salt to taste']);
});

check('applies each recipe’s scale before adding', () => {
  assert.deepStrictEqual(texts([{ line: '2 cups flour', factor: 2 }, { line: '1 cup flour', factor: 0.5 }]), ['4½ cups flour']);
});

check('keeps track of which recipes an item comes from', () => {
  const [item] = Q.combine([{ line: '1 cup milk', source: 'Pancakes' }, { line: '1 cup milk', source: 'Cake' }]);
  assert.deepStrictEqual(item.sources, ['Pancakes', 'Cake']);
});

check('scales a line', () => {
  assert.strictEqual(Q.scaleLine('2 cups flour', 1.5), '3 cups flour');
  assert.strictEqual(Q.scaleLine('1 1/2 cups flour', 2), '3 cups flour');
  assert.strictEqual(Q.scaleLine('3/4 cup sugar', 0.5), '⅜ cup sugar');
  assert.strictEqual(Q.scaleLine('1 cup milk', 0.5), '½ cup milk');
  assert.strictEqual(Q.scaleLine('2 eggs, beaten', 0.5), '1 egg, beaten');
  assert.strictEqual(Q.scaleLine('1 egg', 3), '3 eggs');
  assert.strictEqual(Q.scaleLine('2-3 cloves garlic', 2), '4–6 cloves garlic');
  assert.strictEqual(Q.scaleLine('Salt to taste', 2), 'Salt to taste');
  assert.strictEqual(Q.scaleLine('1 cup flour', 4 / 3), '1⅓ cups flour');
  assert.strictEqual(Q.scaleLine('100 g butter', 1 / 3), '33.33 g butter');
  assert.strictEqual(Q.scaleLine('2 cups flour', 1), '2 cups flour');
});

check('formats amounts', () => {
  assert.strictEqual(Q.formatAmount(1, 1, 'cup'), '1 cup');
  assert.strictEqual(Q.formatAmount(0.5, 0.5, 'cup'), '½ cup');
  assert.strictEqual(Q.formatAmount(2.25, 2.25, 'cup'), '2¼ cups');
  assert.strictEqual(Q.formatAmount(0.3125, 0.3125, 'cup'), '0.31 cup');
});

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
