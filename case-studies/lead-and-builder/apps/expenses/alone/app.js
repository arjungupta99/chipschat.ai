(function () {
  'use strict';
  var L = window.Logic;
  var STORE_KEY = 'splitter.v1';

  // ---------- State ----------

  var state = load();
  var ui = { tab: 'activity' };

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && Array.isArray(s.groups)) return s;
      }
    } catch (e) { /* fall through to empty */ }
    return { groups: [] };
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Could not save. Your browser storage may be full or disabled.');
    }
  }

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function findGroup(id) {
    return state.groups.find(function (g) { return g.id === id; });
  }

  function memberName(group, id) {
    var m = group.members.find(function (m) { return m.id === id; });
    return m ? m.name : '(removed)';
  }

  function money(group, cents) { return L.formatMoney(cents, group.currency || ''); }

  function memberInUse(group, id) {
    return group.expenses.some(function (e) {
      return e.paidBy === id || (e.split && e.split[id] > 0);
    }) || group.payments.some(function (p) { return p.from === id || p.to === id; });
  }

  // Expenses and payments together, newest first.
  function history(group) {
    var items = group.expenses.map(function (e) { return { kind: 'expense', item: e }; })
      .concat(group.payments.map(function (p) { return { kind: 'payment', item: p }; }));
    items.sort(function (a, b) {
      if (a.item.date !== b.item.date) return a.item.date < b.item.date ? 1 : -1;
      return (b.item.createdAt || 0) - (a.item.createdAt || 0);
    });
    return items;
  }

  // ---------- Helpers ----------

  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtDate(iso) {
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }

  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  function openDialog(html, onReady) {
    var dlg = $('#dialog');
    dlg.innerHTML = html;
    if (!dlg.open) dlg.showModal();
    if (onReady) onReady(dlg);
    var first = $('[autofocus]', dlg);
    if (first) first.focus();
    return dlg;
  }

  function closeDialog() {
    var dlg = $('#dialog');
    if (dlg.open) dlg.close();
    dlg.innerHTML = '';
  }

  // ---------- Routing ----------

  function route() {
    var m = /^#\/g\/([^/]+)/.exec(location.hash);
    var group = m && findGroup(decodeURIComponent(m[1]));
    if (m && !group) { location.hash = '#/'; return; }
    if (group) renderGroup(group); else renderHome();
    window.scrollTo(0, 0);
  }

  function rerender() {
    var m = /^#\/g\/([^/]+)/.exec(location.hash);
    var group = m && findGroup(decodeURIComponent(m[1]));
    if (group) renderGroup(group); else renderHome();
  }

  // ---------- Home ----------

  function renderHome() {
    document.title = 'Splitter';
    var list = state.groups.map(function (g) {
      var total = g.expenses.reduce(function (s, e) { return s + e.amount; }, 0);
      return '<li><a class="card group-link" href="#/g/' + encodeURIComponent(g.id) + '">' +
        '<span class="group-name">' + esc(g.name) + '</span>' +
        '<span class="muted">' + g.members.length + ' member' + (g.members.length === 1 ? '' : 's') +
        ' · ' + g.expenses.length + ' expense' + (g.expenses.length === 1 ? '' : 's') + '</span>' +
        '<span class="group-total">' + esc(money(g, total)) + '</span></a></li>';
    }).join('');
    $('#app').innerHTML =
      '<header class="topbar"><h1>Splitter</h1></header>' +
      '<main class="content">' +
      (state.groups.length
        ? '<ul class="list">' + list + '</ul>'
        : '<div class="empty"><p>No groups yet.</p><p class="muted">Make one for a trip or a shared house.</p></div>') +
      '</main>' +
      '<div class="actions"><button class="btn primary" id="new-group">New group</button></div>';
    $('#new-group').onclick = function () { groupDialog(null); };
  }

  // ---------- Group ----------

  function renderGroup(group) {
    document.title = group.name + ' · Splitter';
    var bal = L.balances(group);
    var tabs = [['activity', 'History'], ['balances', 'Balances'], ['settle', 'Settle up']];
    var body;
    if (!group.members.length) {
      body = '<div class="empty"><p>This group has no members yet.</p><button class="btn" data-act="edit-group">Add members</button></div>';
    } else if (ui.tab === 'balances') {
      body = renderBalances(group, bal);
    } else if (ui.tab === 'settle') {
      body = renderSettle(group, bal);
    } else {
      body = renderHistory(group);
    }
    $('#app').innerHTML =
      '<header class="topbar">' +
        '<a class="icon-btn" href="#/" aria-label="All groups">&#8592;</a>' +
        '<h1 class="truncate">' + esc(group.name) + '</h1>' +
        '<button class="icon-btn" data-act="menu" aria-label="Group options">&#8943;</button>' +
      '</header>' +
      '<nav class="tabs" role="tablist">' + tabs.map(function (t) {
        return '<button role="tab" aria-selected="' + (ui.tab === t[0]) + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
      }).join('') + '</nav>' +
      '<main class="content">' + body + '</main>' +
      (group.members.length
        ? '<div class="actions"><button class="btn" data-act="add-payment">Record payment</button>' +
          '<button class="btn primary" data-act="add-expense">Add expense</button></div>'
        : '');

    $$('[data-tab]').forEach(function (b) {
      b.onclick = function () { ui.tab = b.dataset.tab; renderGroup(group); };
    });
    $$('[data-act]').forEach(function (b) {
      b.onclick = function () {
        var act = b.dataset.act;
        if (act === 'menu') menuDialog(group);
        else if (act === 'edit-group') groupDialog(group);
        else if (act === 'add-expense') expenseDialog(group, null);
        else if (act === 'add-payment') paymentDialog(group, null);
        else if (act === 'edit-expense') expenseDialog(group, group.expenses.find(function (e) { return e.id === b.dataset.id; }));
        else if (act === 'edit-payment') paymentDialog(group, group.payments.find(function (p) { return p.id === b.dataset.id; }));
        else if (act === 'settle') paymentDialog(group, null, { from: b.dataset.from, to: b.dataset.to, amount: +b.dataset.amount });
      };
    });
  }

  function renderHistory(group) {
    var items = history(group);
    if (!items.length) return '<div class="empty"><p>No expenses yet.</p><p class="muted">Add the first one below.</p></div>';
    var total = group.expenses.reduce(function (s, e) { return s + e.amount; }, 0);
    var lastDate = null;
    var html = '<p class="summary">Total spent <strong>' + esc(money(group, total)) + '</strong></p><ul class="list history">';
    items.forEach(function (x) {
      var it = x.item;
      if (it.date !== lastDate) { html += '<li class="date-head">' + esc(fmtDate(it.date)) + '</li>'; lastDate = it.date; }
      if (x.kind === 'expense') {
        var how = it.splitType === 'shares' ? 'by shares' : it.splitType === 'exact' ? 'exact amounts' : 'equally';
        var n = Object.keys(it.split).filter(function (k) { return it.split[k] > 0; }).length;
        html += '<li><button class="card row" data-act="edit-expense" data-id="' + esc(it.id) + '">' +
          '<span class="row-main"><span class="row-title">' + esc(it.description) + '</span>' +
          '<span class="muted">' + esc(memberName(group, it.paidBy)) + ' paid · split ' + how + ' among ' + n + '</span></span>' +
          '<span class="row-amount">' + esc(money(group, it.amount)) + '</span></button></li>';
      } else {
        html += '<li><button class="card row payment" data-act="edit-payment" data-id="' + esc(it.id) + '">' +
          '<span class="row-main"><span class="row-title">' + esc(memberName(group, it.from)) + ' paid ' + esc(memberName(group, it.to)) + '</span>' +
          '<span class="muted">Payment' + (it.note ? ' · ' + esc(it.note) : '') + '</span></span>' +
          '<span class="row-amount">' + esc(money(group, it.amount)) + '</span></button></li>';
      }
    });
    return html + '</ul>';
  }

  function renderBalances(group, bal) {
    var max = Math.max.apply(null, group.members.map(function (m) { return Math.abs(bal[m.id] || 0); }).concat([1]));
    return '<ul class="list">' + group.members.map(function (m) {
      var b = bal[m.id] || 0;
      var cls = b > 0 ? 'pos' : b < 0 ? 'neg' : 'zero';
      var label = b > 0 ? 'gets back ' + money(group, b) : b < 0 ? 'owes ' + money(group, -b) : 'settled up';
      return '<li class="card balance ' + cls + '"><div class="balance-top"><span>' + esc(m.name) + '</span>' +
        '<span class="balance-amt">' + esc(label) + '</span></div>' +
        '<div class="bar"><span style="width:' + (Math.abs(b) / max * 100).toFixed(1) + '%"></span></div></li>';
    }).join('') + '</ul>';
  }

  function renderSettle(group, bal) {
    var plan = L.settleUp(bal);
    if (!plan.length) return '<div class="empty"><p>Everyone is settled up.</p></div>';
    return '<p class="summary">' + plan.length + ' payment' + (plan.length === 1 ? '' : 's') + ' will clear every debt.</p>' +
      '<ul class="list">' + plan.map(function (p) {
        return '<li class="card row settle"><span class="row-main"><span class="row-title">' +
          esc(memberName(group, p.from)) + ' &#8594; ' + esc(memberName(group, p.to)) + '</span>' +
          '<span class="row-amount">' + esc(money(group, p.amount)) + '</span></span>' +
          '<button class="btn small" data-act="settle" data-from="' + esc(p.from) + '" data-to="' + esc(p.to) + '" data-amount="' + p.amount + '">Record</button></li>';
      }).join('') + '</ul>';
  }

  // ---------- Dialogs ----------

  function menuDialog(group) {
    openDialog(
      '<form method="dialog" class="sheet"><h2>' + esc(group.name) + '</h2>' +
      '<div class="menu">' +
      '<button type="button" class="btn" data-m="edit">Edit group and members</button>' +
      '<button type="button" class="btn" data-m="csv"' + (group.expenses.length || group.payments.length ? '' : ' disabled') + '>Export CSV</button>' +
      '<button type="button" class="btn danger" data-m="delete">Delete group</button>' +
      '<button type="button" class="btn ghost" data-m="close">Close</button>' +
      '</div></form>',
      function (dlg) {
        $$('[data-m]', dlg).forEach(function (b) {
          b.onclick = function () {
            var m = b.dataset.m;
            if (m === 'edit') groupDialog(group);
            else if (m === 'csv') { exportCsv(group); closeDialog(); }
            else if (m === 'delete') {
              if (confirm('Delete "' + group.name + '" and all its expenses and payments? This can\'t be undone.')) {
                state.groups = state.groups.filter(function (g) { return g !== group; });
                save(); closeDialog(); location.hash = '#/';
              }
            } else closeDialog();
          };
        });
      });
  }

  function groupDialog(group) {
    var isNew = !group;
    var draft = group
      ? group.members.map(function (m) { return { id: m.id, name: m.name, used: memberInUse(group, m.id) }; })
      : [];
    openDialog(
      '<form class="sheet" novalidate><h2>' + (isNew ? 'New group' : 'Edit group') + '</h2>' +
      '<label class="field"><span>Name</span><input name="name" required maxlength="60" autofocus placeholder="Lisbon trip" value="' + esc(group ? group.name : '') + '"></label>' +
      '<label class="field"><span>Currency symbol</span><input name="currency" maxlength="4" placeholder="$" value="' + esc(group ? (group.currency || '') : '$') + '"></label>' +
      '<fieldset class="field"><legend>Members</legend><ul class="members"></ul>' +
      '<div class="add-member"><input name="newMember" maxlength="40" placeholder="Add a person" enterkeyhint="done"><button type="button" class="btn small" data-add>Add</button></div></fieldset>' +
      '<p class="error" role="alert"></p>' +
      '<div class="buttons"><button type="button" class="btn ghost" data-cancel>Cancel</button><button class="btn primary">Save</button></div></form>',
      function (dlg) {
        var form = $('form', dlg);
        function drawMembers() {
          $('.members', dlg).innerHTML = draft.map(function (m, i) {
            return '<li><input data-i="' + i + '" value="' + esc(m.name) + '" maxlength="40" aria-label="Member name">' +
              '<button type="button" class="icon-btn" data-rm="' + i + '" aria-label="Remove ' + esc(m.name) + '"' +
              (m.used ? ' disabled title="Has expenses or payments in this group"' : '') + '>&#215;</button></li>';
          }).join('') || '<li class="muted">No one yet.</li>';
          $$('[data-i]', dlg).forEach(function (inp) { inp.oninput = function () { draft[+inp.dataset.i].name = inp.value; }; });
          $$('[data-rm]', dlg).forEach(function (b) { b.onclick = function () { draft.splice(+b.dataset.rm, 1); drawMembers(); }; });
        }
        function addMember() {
          var inp = form.newMember;
          inp.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (name) {
            draft.push({ id: uid(), name: name, used: false });
          });
          inp.value = '';
          drawMembers();
          inp.focus();
        }
        drawMembers();
        $('[data-add]', dlg).onclick = addMember;
        form.newMember.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); addMember(); } };
        $('[data-cancel]', dlg).onclick = closeDialog;
        form.onsubmit = function (e) {
          e.preventDefault();
          if (form.newMember.value.trim()) addMember();
          var err = $('.error', dlg);
          var name = form.name.value.trim();
          var members = draft.map(function (m) { return { id: m.id, name: m.name.trim() }; });
          if (!name) { err.textContent = 'Give the group a name.'; return; }
          if (members.some(function (m) { return !m.name; })) { err.textContent = 'Every member needs a name.'; return; }
          var lower = members.map(function (m) { return m.name.toLowerCase(); });
          if (lower.some(function (n, i) { return lower.indexOf(n) !== i; })) { err.textContent = 'Two members have the same name.'; return; }
          if (isNew) {
            group = { id: uid(), name: name, currency: form.currency.value.trim(), members: members, expenses: [], payments: [], createdAt: Date.now() };
            state.groups.push(group);
          } else {
            group.name = name;
            group.currency = form.currency.value.trim();
            group.members = members;
          }
          save(); closeDialog();
          if (isNew) { ui.tab = 'activity'; location.hash = '#/g/' + encodeURIComponent(group.id); }
          else rerender();
        };
      });
  }

  function memberOptions(group, selected) {
    return group.members.map(function (m) {
      return '<option value="' + esc(m.id) + '"' + (m.id === selected ? ' selected' : '') + '>' + esc(m.name) + '</option>';
    }).join('');
  }

  function expenseDialog(group, expense) {
    var isNew = !expense;
    var id = expense ? expense.id : uid();
    var type = expense ? expense.splitType : 'equal';
    // Remember inputs for every split type so switching back and forth doesn't lose anything.
    var inputs = { equal: {}, shares: {}, exact: {} };
    group.members.forEach(function (m) {
      var v = expense ? expense.split[m.id] : undefined;
      var included = expense ? v > 0 : true;
      inputs.equal[m.id] = included;
      inputs.shares[m.id] = !included ? '' : type === 'shares' ? String(v) : '1';
      inputs.exact[m.id] = expense && type === 'exact' && v > 0 ? L.centsToPlain(v) : '';
    });
    var sym = esc(group.currency || '');

    openDialog(
      '<form class="sheet" novalidate><h2>' + (isNew ? 'Add expense' : 'Edit expense') + '</h2>' +
      '<label class="field"><span>What was it?</span><input name="description" maxlength="80" required autofocus placeholder="Groceries" value="' + esc(expense ? expense.description : '') + '"></label>' +
      '<div class="two">' +
        '<label class="field"><span>Amount' + (sym ? ' (' + sym + ')' : '') + '</span><input name="amount" inputmode="decimal" autocomplete="off" placeholder="0.00" value="' + (expense ? L.centsToPlain(expense.amount) : '') + '"></label>' +
        '<label class="field"><span>Date</span><input name="date" type="date" required value="' + esc(expense ? expense.date : today()) + '"></label>' +
      '</div>' +
      '<label class="field"><span>Paid by</span><select name="paidBy">' + memberOptions(group, expense ? expense.paidBy : group.members[0].id) + '</select></label>' +
      '<fieldset class="field"><legend>Split</legend>' +
        '<div class="seg" role="radiogroup">' +
          [['equal', 'Equally'], ['shares', 'By shares'], ['exact', 'Exact amounts']].map(function (t) {
            return '<label><input type="radio" name="splitType" value="' + t[0] + '"' + (type === t[0] ? ' checked' : '') + '><span>' + t[1] + '</span></label>';
          }).join('') +
        '</div>' +
        '<div class="split-tools"></div>' +
        '<ul class="split"></ul>' +
        '<p class="split-status muted"></p>' +
      '</fieldset>' +
      '<p class="error" role="alert"></p>' +
      '<div class="buttons">' + (isNew ? '' : '<button type="button" class="btn danger" data-delete>Delete</button>') +
        '<span class="spacer"></span><button type="button" class="btn ghost" data-cancel>Cancel</button><button class="btn primary">Save</button></div>' +
      '</form>',
      function (dlg) {
        var form = $('form', dlg);

        function draft() {
          var split = {};
          var bad = false;
          group.members.forEach(function (m) {
            if (type === 'equal') { if (inputs.equal[m.id]) split[m.id] = 1; }
            else if (type === 'shares') {
              var s = inputs.shares[m.id].trim();
              if (s === '' || s === '0') return;
              if (!/^\d+$/.test(s)) { bad = 'Shares must be whole numbers.'; return; }
              split[m.id] = parseInt(s, 10);
            } else {
              var t = inputs.exact[m.id].trim();
              if (t === '') return;
              var c = L.parseMoney(t);
              if (c == null) { bad = 'Check the amount for ' + m.name + '.'; return; }
              if (c > 0) split[m.id] = c;
            }
          });
          return {
            id: id,
            description: form.description.value.trim(),
            amount: L.parseMoney(form.amount.value),
            date: form.date.value,
            paidBy: form.paidBy.value,
            splitType: type,
            split: split,
            bad: bad
          };
        }

        function drawSplit() {
          var tools = $('.split-tools', dlg);
          tools.innerHTML = type === 'equal'
            ? '<button type="button" class="link" data-all>Everyone</button><button type="button" class="link" data-none>No one</button>'
            : '';
          if (type === 'equal') {
            $('[data-all]', dlg).onclick = function () { group.members.forEach(function (m) { inputs.equal[m.id] = true; }); drawSplit(); };
            $('[data-none]', dlg).onclick = function () { group.members.forEach(function (m) { inputs.equal[m.id] = false; }); drawSplit(); };
          }
          $('.split', dlg).innerHTML = group.members.map(function (m) {
            var ctl;
            if (type === 'equal') ctl = '<input type="checkbox" data-m="' + esc(m.id) + '"' + (inputs.equal[m.id] ? ' checked' : '') + '>';
            else if (type === 'shares') ctl = '<input class="num" data-m="' + esc(m.id) + '" inputmode="numeric" placeholder="0" value="' + esc(inputs.shares[m.id]) + '" aria-label="Shares for ' + esc(m.name) + '">';
            else ctl = '<input class="num" data-m="' + esc(m.id) + '" inputmode="decimal" placeholder="0.00" value="' + esc(inputs.exact[m.id]) + '" aria-label="Amount for ' + esc(m.name) + '">';
            var row = '<span class="split-name">' + esc(m.name) + '</span><span class="split-share" data-share="' + esc(m.id) + '"></span>';
            return type === 'equal'
              ? '<li><label class="split-row">' + ctl + row + '</label></li>'
              : '<li><div class="split-row">' + row + ctl + '</div></li>';
          }).join('');
          $$('[data-m]', dlg).forEach(function (inp) {
            var mid = inp.dataset.m;
            if (type === 'equal') inp.onchange = function () { inputs.equal[mid] = inp.checked; preview(); };
            else inp.oninput = function () { inputs[type][mid] = inp.value; preview(); };
          });
          preview();
        }

        // Show each person's share as you type, and how far exact amounts are from the total.
        function preview() {
          var d = draft();
          var status = $('.split-status', dlg);
          var shares = null;
          if (!d.bad && d.amount && type !== 'exact') {
            var r = L.computeShares(d);
            shares = r.shares || null;
          }
          $$('[data-share]', dlg).forEach(function (el) {
            var mid = el.dataset.share;
            el.textContent = shares && shares[mid] != null ? money(group, shares[mid]) : '';
          });
          if (d.bad) { status.textContent = d.bad; return; }
          if (type === 'exact') {
            var sum = Object.keys(d.split).reduce(function (s, k) { return s + d.split[k]; }, 0);
            if (d.amount == null) status.textContent = 'Assigned ' + money(group, sum) + '.';
            else {
              var left = d.amount - sum;
              status.textContent = left === 0 ? 'Adds up to the total.'
                : left > 0 ? money(group, left) + ' left to assign of ' + money(group, d.amount) + '.'
                : money(group, -left) + ' over the total of ' + money(group, d.amount) + '.';
            }
          } else {
            var n = Object.keys(d.split).length;
            status.textContent = n ? 'Split among ' + n + (n === 1 ? ' person.' : ' people.') : 'Pick who shares this.';
          }
        }

        $$('input[name=splitType]', dlg).forEach(function (r) {
          r.onchange = function () { type = r.value; drawSplit(); };
        });
        form.amount.oninput = preview;
        drawSplit();

        $('[data-cancel]', dlg).onclick = closeDialog;
        if (!isNew) $('[data-delete]', dlg).onclick = function () {
          if (!confirm('Delete "' + expense.description + '"?')) return;
          group.expenses = group.expenses.filter(function (e) { return e !== expense; });
          save(); closeDialog(); rerender(); toast('Expense deleted.');
        };

        form.onsubmit = function (e) {
          e.preventDefault();
          var err = $('.error', dlg);
          var d = draft();
          if (!d.description) { err.textContent = 'Say what the expense was.'; return; }
          if (d.amount == null || d.amount <= 0) { err.textContent = 'Enter an amount above zero, like 12.50.'; return; }
          if (!d.date) { err.textContent = 'Pick a date.'; return; }
          if (d.bad) { err.textContent = d.bad; return; }
          var r = L.computeShares(d, group.currency || '');
          if (r.error) { err.textContent = r.error; return; }
          var rec = { id: d.id, description: d.description, amount: d.amount, date: d.date, paidBy: d.paidBy, splitType: d.splitType, split: d.split };
          if (isNew) { rec.createdAt = Date.now(); group.expenses.push(rec); }
          else { rec.createdAt = expense.createdAt; group.expenses[group.expenses.indexOf(expense)] = rec; }
          save(); closeDialog(); rerender(); toast(isNew ? 'Expense added.' : 'Expense updated.');
        };
      });
  }

  function paymentDialog(group, payment, prefill) {
    var isNew = !payment;
    var p = payment || prefill || {};
    var from = p.from || group.members[0].id;
    var to = p.to || (group.members[1] || group.members[0]).id;
    var sym = esc(group.currency || '');
    openDialog(
      '<form class="sheet" novalidate><h2>' + (isNew ? 'Record payment' : 'Edit payment') + '</h2>' +
      '<div class="two">' +
        '<label class="field"><span>From</span><select name="from">' + memberOptions(group, from) + '</select></label>' +
        '<label class="field"><span>To</span><select name="to">' + memberOptions(group, to) + '</select></label>' +
      '</div>' +
      '<div class="two">' +
        '<label class="field"><span>Amount' + (sym ? ' (' + sym + ')' : '') + '</span><input name="amount" inputmode="decimal" autocomplete="off" placeholder="0.00"' + (prefill ? '' : ' autofocus') + ' value="' + (p.amount ? L.centsToPlain(p.amount) : '') + '"></label>' +
        '<label class="field"><span>Date</span><input name="date" type="date" required value="' + esc(p.date || today()) + '"></label>' +
      '</div>' +
      '<label class="field"><span>Note (optional)</span><input name="note" maxlength="80" placeholder="Bank transfer" value="' + esc(p.note || '') + '"></label>' +
      '<p class="error" role="alert"></p>' +
      '<div class="buttons">' + (isNew ? '' : '<button type="button" class="btn danger" data-delete>Delete</button>') +
        '<span class="spacer"></span><button type="button" class="btn ghost" data-cancel>Cancel</button><button class="btn primary">Save</button></div>' +
      '</form>',
      function (dlg) {
        var form = $('form', dlg);
        $('[data-cancel]', dlg).onclick = closeDialog;
        if (!isNew) $('[data-delete]', dlg).onclick = function () {
          if (!confirm('Delete this payment?')) return;
          group.payments = group.payments.filter(function (x) { return x !== payment; });
          save(); closeDialog(); rerender(); toast('Payment deleted.');
        };
        form.onsubmit = function (e) {
          e.preventDefault();
          var err = $('.error', dlg);
          var amount = L.parseMoney(form.amount.value);
          if (form.from.value === form.to.value) { err.textContent = 'Pick two different people.'; return; }
          if (amount == null || amount <= 0) { err.textContent = 'Enter an amount above zero, like 12.50.'; return; }
          if (!form.date.value) { err.textContent = 'Pick a date.'; return; }
          var rec = { id: isNew ? uid() : payment.id, from: form.from.value, to: form.to.value, amount: amount, date: form.date.value, note: form.note.value.trim() };
          if (isNew) { rec.createdAt = Date.now(); group.payments.push(rec); }
          else { rec.createdAt = payment.createdAt; group.payments[group.payments.indexOf(payment)] = rec; }
          save(); closeDialog(); rerender(); toast(isNew ? 'Payment recorded.' : 'Payment updated.');
        };
      });
  }

  // ---------- CSV ----------

  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s; // keep spreadsheets from running it as a formula
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function buildCsv(group) {
    var head = ['Date', 'Type', 'Description', 'Amount', 'Paid by', 'Paid to', 'Split']
      .concat(group.members.map(function (m) { return m.name + ' share'; }));
    var rows = [head];
    history(group).reverse().forEach(function (x) {
      var it = x.item;
      if (x.kind === 'expense') {
        var shares = L.computeShares(it).shares || {};
        rows.push([it.date, 'Expense', it.description, L.centsToPlain(it.amount), memberName(group, it.paidBy), '',
          it.splitType === 'shares' ? 'Shares ' + group.members.filter(function (m) { return it.split[m.id] > 0; }).map(function (m) { return it.split[m.id]; }).join(':')
            : it.splitType === 'exact' ? 'Exact' : 'Equal']
          .concat(group.members.map(function (m) { return shares[m.id] ? L.centsToPlain(shares[m.id]) : ''; })));
      } else {
        rows.push([it.date, 'Payment', it.note || '', L.centsToPlain(it.amount), memberName(group, it.from), memberName(group, it.to), '']
          .concat(group.members.map(function () { return ''; })));
      }
    });
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }

  function exportCsv(group) {
    var blob = new Blob(['﻿' + buildCsv(group)], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (group.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'group') + '-expenses.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- Start ----------

  $('#dialog').addEventListener('cancel', function (e) { e.preventDefault(); closeDialog(); });
  window.addEventListener('hashchange', function () { closeDialog(); ui.tab = 'activity'; route(); });
  // Another tab changed the data: pick it up (unless a form is open here).
  window.addEventListener('storage', function (e) {
    if (e.key === STORE_KEY && !$('#dialog').open) { state = load(); rerender(); }
  });
  window.Splitter = { buildCsv: buildCsv, state: function () { return state; } };
  route();
})();
