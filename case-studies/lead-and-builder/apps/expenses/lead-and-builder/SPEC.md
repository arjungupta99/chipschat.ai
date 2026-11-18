# Split — shared expenses app (spec)

Plain HTML, CSS, JavaScript. No libraries, no build step, no network. Works when `index.html` is opened directly (file://) and when served.

## Files
- `index.html` — markup shell, loads `money.js` then `app.js` (plain `<script>`, not modules, so file:// works).
- `styles.css` — mobile-first, works from 320px wide; touch targets ≥ 44px; `<meta name="viewport">`.
- `money.js` — pure functions, no DOM. Exposed on `window.Money` and via `module.exports` when `module` exists, so it can be tested with `node`.
- `app.js` — state, storage, rendering, event handling.
- `tests/money.test.js` — runs with `node tests/money.test.js`, no dependencies, exits non-zero on failure.
- `.chips/run.json` — `{"run": "python3 -m http.server 4173"}` or similar that prints its address; check it in your copy.

## Money rules (money.js)
- All amounts stored and computed as **integer cents**. Never add floats.
- `parseCents("12.5") → 1250`, `"12.345"` → invalid, `"-1"` → invalid, `""` → invalid, `"0"` → invalid for an expense total. Accept `"1,234.56"`? No — reject commas to stay simple; accept leading `$`.
- `formatCents(1250) → "12.50"` (display adds currency symbol).
- `splitEqual(total, ids)` → map id→cents. Base = floor(total/n); the remaining r cents go 1 each to r people. **Fair leftover:** which people get the extra cent is decided deterministically but not always the same person — order participants by a rotation keyed on the expense id (e.g. hash of expense id mod n as start index), so across many expenses pennies spread out. Sum must equal total exactly.
- `splitShares(total, {id: weight})` → weights are positive integers. Use largest-remainder method: each gets floor(total*w/W); leftover cents go to the largest fractional remainders, ties broken by the same rotation as above. Sum equals total.
- `splitExact(total, {id: cents})` → valid only if the cents sum to total exactly; otherwise return an error naming the difference (e.g. "Off by $0.03"). Zero for a person is allowed; negative is not.
- `balances(group)` → map memberId→cents. Payer of an expense +total, each participant −share. Payment from A to B: A +amount, B −amount. Sum of all balances is always 0.
- `settleUp(balances)` → list of {from, to, amount}. Greedy: repeatedly match largest debtor with largest creditor, pay min of the two. Gives at most n−1 payments. (Truly minimal is NP-hard; greedy is what's expected — but first pair off any debtor/creditor with exactly equal amounts, which removes payments greedy would otherwise make.) Ties broken by member name for stable output.

## Data model (localStorage key `split.v1`, one JSON object)
```
{ version: 1,
  groups: [{ id, name, createdAt,
    members: [{ id, name }],
    expenses: [{ id, description, amountCents, paidBy, date (YYYY-MM-DD), createdAt,
                 split: { mode: "equal"|"shares"|"exact",
                          participants: [ids]        // equal
                          | weights: {id: int}       // shares
                          | amounts: {id: cents} },  // exact
                 shares: {id: cents} }],             // computed result, saved so history is stable
    payments: [{ id, from, to, amountCents, date, createdAt, note }] }] }
```
- Save after every change. On load, if JSON is corrupt, don't wipe it: keep the raw string under `split.v1.backup` and start empty with a visible notice.
- IDs: `Date.now().toString(36) + random`.
- Recompute `shares` whenever an expense is saved/edited.

## Screens (single page, hash routing so reload keeps your place)
1. **Groups** (`#/`): list of groups with member count and your total spend; "New group" (name + members, at least 2). Delete group with confirm.
2. **Group** (`#/g/<id>`), tabs or sections:
   - **Balances**: each member, green "is owed $x" / red "owes $x" / "settled up".
   - **Settle up**: the suggested payments; each has a "Record" button that pre-fills a payment.
   - **History**: expenses and payments merged, newest first (by date, then createdAt). Each row: description, amount, who paid, date; tap to edit; delete with confirm.
   - Buttons: "Add expense", "Record payment", "Export CSV", "Members" (add/rename; removing a member is only allowed if they appear in no expense or payment — say why otherwise).
3. **Expense form** (add & edit): description, amount, paid by (select), date (default today), split mode switch:
   - Equal: checkbox per member (default all checked), shows each person's computed share live.
   - Shares: number input per member (default 1, 0 = not included), live per-person amounts.
   - Exact: amount input per member, live "Remaining: $x.xx" which must be $0.00 before Save is enabled.
   - Validation messages inline; no `alert()`.
4. **Payment form** (add & edit): from, to (must differ), amount, date, optional note.

Use `<dialog>` or a full-screen panel for forms; must be usable on a phone.

## CSV export
- Filename `<group-name>-expenses.csv`. Columns: `Date,Type,Description,Amount,Paid by,Paid to,` then one column per member with that member's share (payments: blank member columns, "Paid to" filled).
- Rows oldest first. Amounts as `12.50`. Proper CSV quoting (quote fields containing `,` `"` or newline; double inner quotes). Guard against formula injection: prefix a `'` to fields starting with `= + - @`. UTF-8 BOM so Excel reads names correctly.
- Download via Blob + `<a download>`.

## Safety
- Render all user text with `textContent` / escaped, never raw `innerHTML` with user data.

## Done means
- `node tests/money.test.js` passes, covering: equal split 100¢/3 sums to 100 and leftover spreads across expenses; shares 2:1:1 of $10.01; exact mismatch rejected; balances sum to zero; settle-up on several cases yields ≤ n−1 payments that zero every balance; parse/format edge cases.
- Reload keeps all data and current screen. Edit/delete of expenses and payments update balances.
