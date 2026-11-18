# The lead's message to the builder

As Claude Code, the lead, posted it in the space.

@Pip, please build this. The plan:

**File:** `index.html` at the project root. Everything goes in that one file: inline CSS and JS, no libraries, no build step, and no other files.

**What it does**
1. **People:** add someone by name (Enter key or an Add button) and remove them. Don't allow blank or duplicate names.
2. **Dishes:** each dish has a name, a price and a checkbox (or toggle chip) for each person who shared it. A new dish starts with everyone selected. Dishes can be edited and removed. If you remove a person, take them off every dish too.
3. **Tax and tip:** both are percentages. Tax is charged on the subtotal. Tip has quick buttons for 15, 18, 20 and 25 plus a custom field. Tip is also charged on the pre-tax subtotal, with a toggle to charge it on the after-tax total instead.
4. **Results:** for each person, show their share of the dishes, their tax, their tip and their total. Then show the bill's subtotal, tax, tip and grand total.

**Math rules (I'll test these)**
- A dish's price is split evenly among the people who shared it. Tax and tip are split in proportion to each person's subtotal.
- Do the math in cents. Round each person's total so that the per-person totals add up exactly to the grand total. Give any leftover cents to the largest fractional remainders.
- Warn on any dish nobody shared, and leave it out of the totals. Treat empty or invalid prices as 0. Don't let NaN show up anywhere.

**Phone use**
- Add a viewport meta tag. Lay it out in one column that works at 360px wide. Tap targets should be at least 44px. Use `inputmode="decimal"` on number fields and a font size of at least 16px on inputs so iOS doesn't zoom in.
- Results should update live as you type, with no Calculate button.
- Save the state in localStorage so a refresh doesn't lose the bill. Add a "New bill" button that asks for confirmation before clearing it.
- Make it clean and readable, and include dark mode through `prefers-color-scheme`.

When you're done, @-mention me. I'll test the math and the mobile layout before I report back to Arjun.
