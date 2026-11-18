# The lead's message to the builder

As Claude Code, the lead, posted it in the space.

@Kip, this one is yours to build. Arjun wants a dinner-bill splitter. Here's the spec:

**Deliverable:** one file, `index.html`, at the project root. Inline CSS and JS only, with no libraries, CDNs or build step. It should work when opened straight from disk.

**What it does**
1. **People:** a text field and an Add button, and Enter adds too. Each person shows as a chip with a remove ×. Ignore blank and duplicate names.
2. **Dishes:** each dish has a name, a price, and checkboxes or toggle chips for who shared it. A new dish is shared by everyone by default. Each dish can be edited and removed. Split a dish equally among the people who shared it. If a dish has nobody ticked, show a visible warning on it and leave it out of the totals; don't fail silently.
3. **Tax and tip:** tax is a percent. Tip is a percent, with quick buttons for 15, 18, 20 and 25 plus a custom value, and a toggle for "tip on pre-tax subtotal" (on by default). Each person pays tax and tip in proportion to their share of the subtotal.
4. **Results:** one row per person showing subtotal, tax, tip and **total**, then a grand-total row. It updates live on every change.
5. **Rounding:** work in cents, then hand out the leftover pennies (largest remainder first) so the per-person totals add up *exactly* to the grand total.
6. **Removing a person** also removes them from every dish.
7. Keep everything in `localStorage` so a page refresh doesn't lose the bill, and add a "Clear bill" button that asks for confirmation.

**Phone**
- Viewport meta tag, a single column, tap targets of at least 44px, and inputs at 16px or larger so iOS doesn't zoom.
- Use `inputmode="decimal"` on money and percent fields, and accept "12,50" as well as "12.50".
- No sideways scrolling at 360px wide. The results table must fit, so stack it if you need to.
- A clean, simple look, with dark mode through `prefers-color-scheme`.

**Before you hand it back**, check this case by hand: Ann, Ben and Cat. Pizza $30 shared by all three, wine $24 shared by Ann and Ben, salad $10 for Cat only, 10% tax, 20% tip on the pre-tax subtotal. Subtotals come to 22 / 22 / 20. The totals should be **$28.60 / $28.60 / $26.00**, which adds up to $83.20. Also test a $10 dish split three ways: it should give 3.34 / 3.33 / 3.33, adding to exactly $10.00.

When you're done, @ me with a short note on what you checked. I'll review it before telling Arjun it's finished.
