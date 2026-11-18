/*
 * Split — shared expenses.
 *
 * Plain browser JavaScript. State lives in localStorage under "split.v1";
 * the current screen lives in the URL hash so a reload returns to it.
 * All money maths is delegated to money.js (integer cents only).
 */
(function () {
  'use strict';

  var Money = window.Money;
  var STORAGE_KEY = 'split.v1';
  var BACKUP_KEY = 'split.v1.backup';

  var state = { version: 1, groups: [] };
  var notice = '';

  var topbar = document.getElementById('topbar');
  var view = document.getElementById('view');
  var toastEl = document.getElementById('toast');
  var toastTimer = null;

  /* ------------------------------------------------------------- helpers */

  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value == null || value === false) return;
        if (key === 'class') el.className = value;
        else if (key === 'text') el.textContent = value;
        else if (key.slice(0, 2) === 'on' && typeof value === 'function') {
          el.addEventListener(key.slice(2), value);
        } else if (key === 'dataset') {
          Object.keys(value).forEach(function (name) { el.dataset[name] = value[name]; });
        } else if (key === 'value') {
          el.value = value;
        } else if (value === true) {
          el.setAttribute(key, '');
        } else {
          el.setAttribute(key, String(value));
        }
      });
    }
    for (var i = 2; i < arguments.length; i++) appendChild(el, arguments[i]);
    return el;
  }

  function appendChild(el, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(function (item) { appendChild(el, item); });
      return;
    }
    el.appendChild(child.nodeType ? child : document.createTextNode(String(child)));
  }

  function button(label, className, onclick, extra) {
    var props = { type: 'button', class: className || 'btn', onclick: onclick };
    if (extra) Object.keys(extra).forEach(function (key) { props[key] = extra[key]; });
    return h('button', props, label);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function todayISO() {
    var now = new Date();
    return now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate());
  }

  function formatDate(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
    var parts = iso.split('-');
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(date.getTime())) return iso;
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function findGroup(id) {
    for (var i = 0; i < state.groups.length; i++) {
      if (state.groups[i].id === id) return state.groups[i];
    }
    return null;
  }

  function memberName(group, id) {
    for (var i = 0; i < group.members.length; i++) {
      if (group.members[i].id === id) return group.members[i].name;
    }
    return 'Unknown';
  }

  function namesMap(group) {
    var map = {};
    group.members.forEach(function (member) { map[member.id] = member.name; });
    return map;
  }

  function groupTotal(group) {
    return group.expenses.reduce(function (sum, expense) { return sum + expense.amountCents; }, 0);
  }

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toastEl.classList.remove('show'); }, 2300);
  }

  function noticeBanner() {
    return h('div', { class: 'notice' }, [
      h('p', {}, notice),
      button('Dismiss', 'link-btn', function () {
        notice = '';
        render();
      })
    ]);
  }

  /* ------------------------------------------------------- confirm dialog */

  function confirmAction(options) {
    var dialog = document.getElementById('confirm-dialog');
    var title = document.getElementById('confirm-title');
    var message = document.getElementById('confirm-message');
    var ok = document.getElementById('confirm-ok');
    var cancel = document.getElementById('confirm-cancel');

    title.textContent = options.title || 'Are you sure?';
    message.textContent = options.message || '';
    ok.textContent = options.okLabel || 'Delete';

    return new Promise(function (resolve) {
      function finish(value) {
        ok.onclick = null;
        cancel.onclick = null;
        dialog.removeEventListener('cancel', onCancel);
        dialog.removeEventListener('click', onBackdrop);
        if (dialog.open) dialog.close();
        resolve(value);
      }
      function onCancel(event) {
        event.preventDefault();
        finish(false);
      }
      function onBackdrop(event) {
        if (event.target === dialog) finish(false);
      }
      ok.onclick = function () { finish(true); };
      cancel.onclick = function () { finish(false); };
      dialog.addEventListener('cancel', onCancel);
      dialog.addEventListener('click', onBackdrop);
      dialog.showModal();
    });
  }

  /* ---------------------------------------------------------------- state */

  function loadState() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (error) { raw = null; }
    if (!raw) return;

    try {
      var data = JSON.parse(raw);
      if (!data || data.version !== 1 || !Array.isArray(data.groups)) {
        throw new Error('Unexpected saved data');
      }
      data.groups.forEach(normaliseGroup);
      state = data;
    } catch (error) {
      try {
        localStorage.setItem(BACKUP_KEY, raw);
        localStorage.removeItem(STORAGE_KEY);
      } catch (ignored) { /* storage may be unavailable */ }
      state = { version: 1, groups: [] };
      notice = 'Your saved data could not be read, so the app started empty. The unreadable copy is kept on this device as a backup.';
    }
  }

  function normaliseGroup(group) {
    if (!group.id) group.id = uid();
    if (!group.name) group.name = 'Untitled group';
    if (!group.createdAt) group.createdAt = new Date().toISOString();
    if (!Array.isArray(group.members)) group.members = [];
    if (!Array.isArray(group.expenses)) group.expenses = [];
    if (!Array.isArray(group.payments)) group.payments = [];

    var hasYou = group.members.some(function (member) { return member.id === group.youId; });
    if (!hasYou) group.youId = group.members.length ? group.members[0].id : null;

    group.expenses.forEach(function (expense) {
      if (!expense.id) expense.id = uid();
      if (!expense.split) {
        expense.split = { mode: 'equal', participants: group.members.map(function (member) { return member.id; }) };
      }
      if (!expense.shares) expense.shares = Money.computeShares(expense);
    });

    group.payments.forEach(function (payment) {
      if (!payment.id) payment.id = uid();
    });
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      toast('Could not save on this device.');
    }
  }

  /* --------------------------------------------------------------- router */

  function parseHash() {
    var raw = String(location.hash || '').replace(/^#/, '');
    var queryAt = raw.indexOf('?');
    var path = queryAt === -1 ? raw : raw.slice(0, queryAt);
    var query = new URLSearchParams(queryAt === -1 ? '' : raw.slice(queryAt + 1));
    var parts = path.split('/').filter(Boolean);
    parts = parts.map(function (part) {
      try { return decodeURIComponent(part); } catch (error) { return part; }
    });
    return { parts: parts, query: query };
  }

  function navigate(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function renderTopbar(back) {
    var inner = h('div', { class: 'topbar-inner' }, [
      h('a', { class: 'brand', href: '#/' }, [
        h('span', { class: 'brand-mark' }, 'S'),
        'Split'
      ])
    ]);
    if (back) {
      inner.appendChild(h('a', { class: 'topbar-link', href: back.href }, back.label));
    }
    topbar.replaceChildren(inner);
  }

  function render() {
    var route = parseHash();
    var parts = route.parts;

    if (parts.length === 0) {
      renderGroups();
      return;
    }
    if (parts[0] === 'new') {
      renderNewGroup();
      return;
    }
    if (parts[0] === 'g' && parts[1]) {
      var group = findGroup(parts[1]);
      if (!group) {
        renderMissing();
        return;
      }
      if (parts[2] === 'members') return renderMembers(group);
      if (parts[2] === 'expense') return renderExpenseForm(group, parts[3]);
      if (parts[2] === 'payment') return renderPaymentForm(group, parts[3], route.query);
      return renderGroup(group);
    }
    renderGroups();
  }

  function renderMissing() {
    renderTopbar(null);
    view.replaceChildren();
    if (notice) view.appendChild(noticeBanner());
    view.appendChild(
      h('div', { class: 'empty' }, [
        h('p', {}, 'That page could not be found.'),
        h('a', { class: 'btn primary', href: '#/' }, 'Back to groups')
      ])
    );
  }

  /* ---------------------------------------------------------- groups list */

  function renderGroups() {
    renderTopbar(null);
    document.title = 'Split — shared expenses';

    view.replaceChildren();
    view.appendChild(
      h('div', { class: 'page-head' }, [
        h('div', {}, [
          h('h1', { class: 'page-title' }, 'Groups'),
          h('p', { class: 'muted' }, 'Trips and shared houses')
        ]),
        h('a', { class: 'btn primary', href: '#/new' }, '+ New group')
      ])
    );

    if (notice) {
      view.appendChild(noticeBanner());
    }

    if (!state.groups.length) {
      view.appendChild(
        h('div', { class: 'empty' }, [
          h('p', {}, 'No groups yet. Make one for a trip or your house.'),
          h('a', { class: 'btn primary', href: '#/new' }, 'Create your first group')
        ])
      );
      return;
    }

    var list = h('div', { class: 'group-list' });
    state.groups.forEach(function (group) {
      var you = null;
      group.members.forEach(function (member) {
        if (member.id === group.youId) you = member;
      });
      var yourSpend = you
        ? group.expenses.reduce(function (sum, expense) {
            return expense.paidBy === you.id ? sum + expense.amountCents : sum;
          }, 0)
        : 0;

      list.appendChild(
        h('a', { class: 'group-card', href: '#/g/' + encodeURIComponent(group.id) }, [
          h('div', { class: 'group-card-head' }, [
            h('h2', {}, group.name),
            h('span', { class: 'chev' }, '\u203A')
          ]),
          h('p', { class: 'meta' }, group.members.length + (group.members.length === 1 ? ' member' : ' members')),
          h('div', { class: 'group-stats' }, [
            h('div', {}, [
              h('span', { class: 'stat-label' }, 'Total spend'),
              h('span', { class: 'stat-value' }, Money.formatMoney(groupTotal(group)))
            ]),
            h('div', {}, [
              h('span', { class: 'stat-label' }, 'Your spend'),
              h('span', { class: 'stat-value' }, Money.formatMoney(yourSpend))
            ])
          ])
        ])
      );
    });
    view.appendChild(list);
  }

  /* ----------------------------------------------------------- group page */

  function renderGroup(group) {
    renderTopbar({ href: '#/', label: 'Groups' });
    document.title = group.name + ' — Split';

    var balances = Money.balances(group);
    var transfers = Money.settleUp(balances, namesMap(group));

    view.replaceChildren();

    var actions = h('div', { class: 'actions-grid' }, [
      button('+ Add expense', 'btn primary', function () {
        navigate('#/g/' + encodeURIComponent(group.id) + '/expense/new');
      }),
      button('Record payment', 'btn', function () {
        navigate('#/g/' + encodeURIComponent(group.id) + '/payment/new');
      }),
      button('Export CSV', 'btn', function () { exportCsv(group); }),
      button('Members', 'btn', function () {
        navigate('#/g/' + encodeURIComponent(group.id) + '/members');
      })
    ]);

    view.appendChild(
      h('div', { class: 'group-head' }, [
        h('div', { class: 'eyebrow' }, group.members.length + ' members'),
        h('h1', { class: 'page-title' }, group.name),
        actions
      ])
    );

    /* Balances */
    var balanceList = h('div', { class: 'balance-list' });
    group.members.forEach(function (member) {
      var amount = balances[member.id] || 0;
      var className = amount > 0 ? 'pos' : (amount < 0 ? 'neg' : 'zero');
      var text = amount > 0
        ? 'is owed ' + Money.formatMoney(amount)
        : (amount < 0 ? 'owes ' + Money.formatMoney(-amount) : 'settled up');
      balanceList.appendChild(
        h('div', { class: 'balance-row' }, [
          h('span', { class: 'avatar' }, initial(member.name)),
          h('span', { class: 'balance-name' }, [
            member.name,
            member.id === group.youId ? h('span', { class: 'chip' }, 'You') : null
          ]),
          h('span', { class: 'balance-amount ' + className }, text)
        ])
      );
    });

    view.appendChild(
      h('section', { class: 'card' }, [
        h('div', { class: 'section-head' }, [
          h('h2', { class: 'section-title' }, 'Balances'),
          h('span', { class: 'muted small' }, group.members.length + (group.members.length === 1 ? ' person' : ' people'))
        ]),
        balanceList
      ])
    );

    /* Settle up */
    var settleCard = h('section', { class: 'card' }, [
      h('div', { class: 'section-head' }, [
        h('h2', { class: 'section-title' }, 'Settle up'),
        transfers.length ? h('span', { class: 'muted small' }, transfers.length + (transfers.length === 1 ? ' payment' : ' payments')) : null
      ])
    ]);

    if (!transfers.length) {
      settleCard.appendChild(h('p', { class: 'settled-note' }, 'Everyone is settled up.'));
    } else {
      transfers.forEach(function (transfer) {
        settleCard.appendChild(
          h('div', { class: 'settle-row' }, [
            h('div', { class: 'settle-who' }, [
              h('strong', {}, memberName(group, transfer.from)),
              h('span', { class: 'arrow' }, ' \u2192 '),
              h('strong', {}, memberName(group, transfer.to))
            ]),
            h('span', { class: 'settle-amount' }, Money.formatMoney(transfer.amount)),
            button('Record', 'btn small', function () {
              var hash = '#/g/' + encodeURIComponent(group.id) + '/payment/new' +
                '?from=' + encodeURIComponent(transfer.from) +
                '&to=' + encodeURIComponent(transfer.to) +
                '&amount=' + transfer.amount;
              navigate(hash);
            })
          ])
        );
      });
    }
    view.appendChild(settleCard);

    /* History */
    var records = [];
    group.expenses.forEach(function (expense) {
      records.push({ type: 'expense', date: expense.date, createdAt: expense.createdAt || '', item: expense });
    });
    group.payments.forEach(function (payment) {
      records.push({ type: 'payment', date: payment.date, createdAt: payment.createdAt || '', item: payment });
    });
    records.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
      return a.item.id < b.item.id ? 1 : (a.item.id > b.item.id ? -1 : 0);
    });

    var historyCard = h('section', { class: 'section' }, [
      h('div', { class: 'section-head' }, [
        h('h2', { class: 'section-title' }, 'History')
      ])
    ]);
    var historyList = h('div', { class: 'history-list' });

    if (!records.length) {
      historyCard.appendChild(
        h('div', { class: 'card' }, h('p', { class: 'muted' }, 'No expenses or payments yet.'))
      );
    } else {
      records.forEach(function (record) {
        historyList.appendChild(historyRow(group, record));
      });
      historyCard.appendChild(historyList);
    }
    view.appendChild(historyCard);

    view.appendChild(
      h('div', { class: 'danger-zone' }, [
        button('Delete group', 'btn', function () {
          confirmAction({
            title: 'Delete this group?',
            message: '\u201C' + group.name + '\u201D and all of its expenses and payments will be removed.',
            okLabel: 'Delete group'
          }).then(function (ok) {
            if (!ok) return;
            state.groups = state.groups.filter(function (item) { return item.id !== group.id; });
            save();
            toast('Group deleted');
            navigate('#/');
          });
        })
      ])
    );
  }

  function initial(name) {
    var trimmed = String(name || '').trim();
    if (!trimmed) return '?';
    return Array.from(trimmed)[0].toUpperCase();
  }

  function historyRow(group, record) {
    var expense = record.type === 'expense' ? record.item : null;
    var payment = record.type === 'payment' ? record.item : null;
    var description;
    var meta;

    if (expense) {
      description = expense.description;
      var modeLabel = expense.split.mode === 'equal' ? 'Equal' : (expense.split.mode === 'shares' ? 'Shares' : 'Exact');
      meta = 'Paid by ' + memberName(group, expense.paidBy) + ' \u00B7 ' + modeLabel + ' split \u00B7 ' + formatDate(expense.date);
    } else {
      description = payment.note || 'Payment';
      meta = memberName(group, payment.from) + ' paid ' + memberName(group, payment.to) + ' \u00B7 ' + formatDate(payment.date);
    }

    var editHash = expense
      ? '#/g/' + encodeURIComponent(group.id) + '/expense/' + encodeURIComponent(expense.id)
      : '#/g/' + encodeURIComponent(group.id) + '/payment/' + encodeURIComponent(payment.id);

    var main = h('button', { type: 'button', class: 'hist-main', 'aria-label': 'Edit ' + description }, [
      h('span', { class: 'hist-top' }, [
        h('span', { class: 'type-badge' }, expense ? 'Expense' : 'Payment'),
        h('span', { class: 'hist-desc' }, description)
      ]),
      h('span', { class: 'hist-amt' }, Money.formatMoney(record.item.amountCents)),
      h('span', { class: 'hist-meta' }, meta)
    ]);
    main.addEventListener('click', function () { navigate(editHash); });

    var remove = h('button', {
      type: 'button',
      class: 'icon-btn',
      'aria-label': 'Delete ' + description,
      title: 'Delete'
    }, '\u00D7');
    remove.addEventListener('click', function () {
      var isExpense = !!expense;
      confirmAction({
        title: isExpense ? 'Delete expense?' : 'Delete payment?',
        message: isExpense
          ? '\u201C' + description + '\u201D will be removed and the balances will update.'
          : 'This payment will be removed and the balances will update.',
        okLabel: 'Delete'
      }).then(function (ok) {
        if (!ok) return;
        if (isExpense) {
          group.expenses = group.expenses.filter(function (item) { return item.id !== expense.id; });
        } else {
          group.payments = group.payments.filter(function (item) { return item.id !== payment.id; });
        }
        save();
        toast(isExpense ? 'Expense deleted' : 'Payment deleted');
        render();
      });
    });

    return h('div', { class: 'hist-row' }, [main, remove]);
  }

  /* --------------------------------------------------------- new group form */

  function renderNewGroup() {
    renderTopbar({ href: '#/', label: '\u2190 Groups' });
    document.title = 'New group — Split';

    var name = '';
    var membersText = '';
    var error = h('p', { class: 'form-error', hidden: true });

    function showError(message) {
      error.textContent = message;
      error.hidden = false;
    }

    var form = h('form', { class: 'sheet', novalidate: true }, [
      h('div', { class: 'sheet-head' }, [
        h('a', { class: 'back-link', href: '#/' }, '\u2190'),
        h('h1', {}, 'New group')
      ]),
      h('div', { class: 'card form-card' }, [
        h('div', { class: 'field' }, [
          h('label', { class: 'label', for: 'group-name' }, 'Group name'),
          h('input', {
            class: 'input', id: 'group-name', type: 'text', placeholder: 'Lisbon trip, Flat 4\u2026',
            autocomplete: 'off',
            oninput: function () { name = this.value; error.hidden = true; }
          })
        ]),
        h('div', { class: 'field' }, [
          h('label', { class: 'label', for: 'group-members' }, 'Members'),
          h('textarea', {
            class: 'input', id: 'group-members', rows: '5',
            placeholder: 'One person per line\nAlex\nSam\nPriya',
            oninput: function () { membersText = this.value; error.hidden = true; }
          }),
          h('span', { class: 'hint' }, 'One person per line. The first person is you.')
        ])
      ]),
      error,
      h('div', { class: 'form-actions' }, [
        h('a', { class: 'btn ghost', href: '#/' }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'submit' }, 'Create group')
      ])
    ]);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var groupName = name.trim();
      var names = membersText.split('\n').map(function (line) { return line.trim(); }).filter(Boolean);

      if (!groupName) return showError('Give the group a name.');
      if (names.length < 2) return showError('Add at least two members, one per line.');

      var seen = {};
      for (var i = 0; i < names.length; i++) {
        var key = names[i].toLowerCase();
        if (seen[key]) return showError('Each member needs a unique name.');
        seen[key] = true;
      }

      var members = names.map(function (memberName) { return { id: uid(), name: memberName }; });
      var group = {
        id: uid(),
        name: groupName,
        createdAt: new Date().toISOString(),
        youId: members[0].id,
        members: members,
        expenses: [],
        payments: []
      };
      state.groups.push(group);
      save();
      toast('Group created');
      navigate('#/g/' + encodeURIComponent(group.id));
    });

    view.replaceChildren(form);
  }

  /* ------------------------------------------------------- expense form */

  function renderExpenseForm(group, expenseId) {
    var existing = null;
    if (expenseId && expenseId !== 'new') {
      group.expenses.forEach(function (expense) {
        if (expense.id === expenseId) existing = expense;
      });
      if (!existing) return renderMissing();
    }

    renderTopbar({ href: '#/g/' + encodeURIComponent(group.id), label: '\u2190 Group' });
    document.title = (existing ? 'Edit expense' : 'Add expense') + ' — Split';

    var draftId = existing ? existing.id : uid();
    var mode = existing ? existing.split.mode : 'equal';
    var amountStr = existing ? Money.formatCents(existing.amountCents) : '';
    var descStr = existing ? existing.description : '';
    var paidBy = existing ? existing.paidBy : (group.youId || (group.members[0] && group.members[0].id));
    var dateStr = existing ? existing.date : todayISO();

    var selected = {};
    if (existing && existing.split.mode === 'equal' && Array.isArray(existing.split.participants)) {
      existing.split.participants.forEach(function (id) { selected[id] = true; });
    } else {
      group.members.forEach(function (member) { selected[member.id] = true; });
    }

    var weights = {};
    group.members.forEach(function (member) {
      var weight = '1';
      if (existing && existing.split.mode === 'shares') {
        weight = existing.split.weights && existing.split.weights[member.id] != null
          ? String(existing.split.weights[member.id]) : '0';
      }
      weights[member.id] = weight;
    });

    var exact = {};
    group.members.forEach(function (member) {
      var value = '';
      if (existing && existing.split.mode === 'exact' && existing.split.amounts && existing.split.amounts[member.id] != null) {
        value = Money.formatCents(existing.split.amounts[member.id]);
      }
      exact[member.id] = value;
    });

    var errorEl = h('p', { class: 'form-error', hidden: true });
    var remainingEl = h('div', { class: 'remaining', hidden: mode !== 'exact' });
    var saveBtn = h('button', { class: 'btn primary', type: 'submit' }, existing ? 'Save changes' : 'Save expense');

    var equalShareEls = {};
    var sharesShareEls = {};
    var equalChecks = {};
    var modeButtons = {};

    var equalSection = h('div', { class: 'split-rows', hidden: mode !== 'equal' });
    group.members.forEach(function (member) {
      var share = h('span', { class: 'share-preview' }, '\u2014');
      equalShareEls[member.id] = share;
      var checkbox = h('input', { type: 'checkbox', class: 'check' });
      checkbox.checked = !!selected[member.id];
      equalChecks[member.id] = checkbox;
      checkbox.addEventListener('change', function () {
        if (checkbox.checked) selected[member.id] = true;
        else delete selected[member.id];
        update();
      });
      equalSection.appendChild(
        h('label', { class: 'split-row' }, [
          checkbox,
          h('span', { class: 'person' }, member.name + (member.id === group.youId ? ' (you)' : '')),
          share
        ])
      );
    });

    var sharesSection = h('div', { class: 'split-rows', hidden: mode !== 'shares' });
    group.members.forEach(function (member) {
      var share = h('span', { class: 'share-preview' }, '\u2014');
      sharesShareEls[member.id] = share;
      var input = h('input', {
        class: 'share-input', type: 'number', min: '0', step: '1', inputmode: 'numeric',
        value: weights[member.id],
        'aria-label': 'Shares for ' + member.name,
        oninput: function () { weights[member.id] = this.value; update(); }
      });
      sharesSection.appendChild(
        h('div', { class: 'split-row' }, [
          h('span', { class: 'person' }, member.name),
          input,
          share
        ])
      );
    });

    var exactSection = h('div', { class: 'split-rows', hidden: mode !== 'exact' });
    group.members.forEach(function (member) {
      var input = h('input', {
        class: 'exact-input', type: 'text', inputmode: 'decimal', placeholder: '0.00',
        value: exact[member.id],
        'aria-label': 'Exact amount for ' + member.name,
        oninput: function () { exact[member.id] = this.value; update(); }
      });
      exactSection.appendChild(
        h('div', { class: 'split-row' }, [
          h('span', { class: 'person' }, member.name),
          input
        ])
      );
    });
    exactSection.appendChild(remainingEl);

    function parseWeights() {
      var result = {};
      var bad = false;
      group.members.forEach(function (member) {
        var raw = String(weights[member.id] == null ? '' : weights[member.id]).trim();
        if (raw === '') return;
        if (!/^\d+$/.test(raw)) { bad = true; return; }
        var value = parseInt(raw, 10);
        if (value > 0) result[member.id] = value;
      });
      return { weights: result, bad: bad };
    }

    function parseExact() {
      var result = {};
      var bad = false;
      group.members.forEach(function (member) {
        var raw = String(exact[member.id] == null ? '' : exact[member.id]).trim();
        if (raw === '') { result[member.id] = 0; return; }
        var value = Money.parseCents(raw);
        if (value == null) bad = true;
        else result[member.id] = value;
      });
      return { amounts: result, bad: bad };
    }

    function selectedIds() {
      return group.members
        .map(function (member) { return member.id; })
        .filter(function (id) { return !!selected[id]; });
    }

    function currentShares() {
      var total = Money.parseCents(amountStr);
      if (total == null || total <= 0) return null;
      if (mode === 'equal') {
        var ids = selectedIds();
        return ids.length ? Money.splitEqual(total, ids, draftId) : null;
      }
      if (mode === 'shares') {
        var parsed = parseWeights();
        if (parsed.bad || !Object.keys(parsed.weights).length) return null;
        return Money.splitShares(total, parsed.weights, draftId);
      }
      return null;
    }

    function update() {
      errorEl.hidden = true;
      var total = Money.parseCents(amountStr);
      var shares = currentShares();

      group.members.forEach(function (member) {
        var value = shares ? shares[member.id] : null;
        var text = value == null ? '\u2014' : Money.formatMoney(value);
        equalShareEls[member.id].textContent = text;
        sharesShareEls[member.id].textContent = text;
      });

      if (mode === 'exact') {
        var parsed = parseExact();
        var allocated = 0;
        Object.keys(parsed.amounts).forEach(function (id) { allocated += parsed.amounts[id]; });
        if (total == null || total <= 0) {
          remainingEl.textContent = 'Enter the expense amount to check the split.';
          remainingEl.className = 'remaining bad';
          saveBtn.disabled = true;
        } else if (parsed.bad) {
          remainingEl.textContent = 'Check the amounts: use dollars and cents, like 12.50.';
          remainingEl.className = 'remaining bad';
          saveBtn.disabled = true;
        } else {
          var difference = total - allocated;
          remainingEl.textContent = difference === 0
            ? 'Remaining: $0.00 \u2014 the split adds up.'
            : 'Remaining: ' + Money.formatMoney(difference);
          remainingEl.className = 'remaining ' + (difference === 0 ? 'ok' : 'bad');
          saveBtn.disabled = difference !== 0;
        }
      } else {
        saveBtn.disabled = false;
      }
    }

    function setMode(next) {
      mode = next;
      Object.keys(modeButtons).forEach(function (key) {
        modeButtons[key].setAttribute('aria-pressed', key === mode ? 'true' : 'false');
      });
      equalSection.hidden = mode !== 'equal';
      sharesSection.hidden = mode !== 'shares';
      exactSection.hidden = mode !== 'exact';
      remainingEl.hidden = mode !== 'exact';

      if (mode === 'equal' && !selectedIds().length) {
        group.members.forEach(function (member) {
          selected[member.id] = true;
          equalChecks[member.id].checked = true;
        });
      }
      update();
    }

    [['equal', 'Equally'], ['shares', 'Shares'], ['exact', 'Exact']].forEach(function (pair) {
      modeButtons[pair[0]] = h('button', {
        type: 'button',
        class: 'seg-btn',
        'aria-pressed': mode === pair[0] ? 'true' : 'false',
        onclick: function () { setMode(pair[0]); }
      }, pair[1]);
    });

    var form = h('form', { class: 'sheet', novalidate: true }, [
      h('div', { class: 'sheet-head' }, [
        h('a', { class: 'back-link', href: '#/g/' + encodeURIComponent(group.id) }, '\u2190'),
        h('h1', {}, existing ? 'Edit expense' : 'Add expense')
      ]),
      h('p', { class: 'sheet-sub' }, group.name),
      h('div', { class: 'card form-card' }, [
        h('div', { class: 'field' }, [
          h('label', { class: 'label', for: 'expense-desc' }, 'Description'),
          h('input', {
            class: 'input', id: 'expense-desc', type: 'text', autocomplete: 'off',
            placeholder: 'Dinner, taxi, groceries\u2026',
            value: descStr,
            oninput: function () { descStr = this.value; errorEl.hidden = true; }
          })
        ]),
        h('div', { class: 'field' }, [
          h('label', { class: 'label', for: 'expense-amount' }, 'Amount'),
          h('div', { class: 'money-wrap' }, [
            h('span', { class: 'money-prefix' }, '$'),
            h('input', {
              class: 'input', id: 'expense-amount', type: 'text', inputmode: 'decimal',
              autocomplete: 'off', placeholder: '0.00', value: amountStr,
              oninput: function () { amountStr = this.value; update(); }
            })
          ])
        ]),
        h('div', { class: 'row-2' }, [
          h('div', { class: 'field' }, [
            h('label', { class: 'label', for: 'expense-paidby' }, 'Paid by'),
            selectInput(group.members, paidBy, 'expense-paidby', function (value) { paidBy = value; })
          ]),
          h('div', { class: 'field' }, [
            h('label', { class: 'label', for: 'expense-date' }, 'Date'),
            h('input', {
              class: 'input', id: 'expense-date', type: 'date', value: dateStr,
              onchange: function () { dateStr = this.value; errorEl.hidden = true; }
            })
          ])
        ]),
        h('div', { class: 'field' }, [
          h('span', { class: 'label' }, 'Split'),
          h('div', { class: 'segmented', role: 'group', 'aria-label': 'Split method' }, [
            modeButtons.equal, modeButtons.shares, modeButtons.exact
          ]),
          equalSection,
          sharesSection,
          exactSection
        ])
      ]),
      errorEl,
      h('div', { class: 'form-actions' }, [
        h('a', { class: 'btn ghost', href: '#/g/' + encodeURIComponent(group.id) }, 'Cancel'),
        saveBtn
      ])
    ]);

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var description = descStr.trim();
      if (!description) return showFormError('Add a description.');

      var total = Money.parseCents(amountStr);
      if (total == null || total <= 0) return showFormError('Enter an amount greater than $0.00.');

      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return showFormError('Choose a valid date.');

      var paidByMember = group.members.some(function (member) { return member.id === paidBy; });
      if (!paidByMember) return showFormError('Choose who paid.');

      var split = null;
      var shares = null;

      if (mode === 'equal') {
        var ids = selectedIds();
        if (!ids.length) return showFormError('Pick at least one person to share this expense.');
        shares = Money.splitEqual(total, ids, draftId);
        split = { mode: 'equal', participants: ids };
      } else if (mode === 'shares') {
        var parsedWeights = parseWeights();
        if (parsedWeights.bad) return showFormError('Shares must be whole numbers, 0 or more.');
        if (!Object.keys(parsedWeights.weights).length) return showFormError('Give at least one person a share above 0.');
        shares = Money.splitShares(total, parsedWeights.weights, draftId);
        split = { mode: 'shares', weights: parsedWeights.weights };
      } else {
        var parsedExact = parseExact();
        if (parsedExact.bad) return showFormError('Enter exact amounts in dollars and cents, like 12.50.');
        var result = Money.splitExact(total, parsedExact.amounts);
        if (!result.ok) {
          return showFormError(result.error + '. Adjust the amounts so they add up exactly.');
        }
        shares = result.shares;
        split = { mode: 'exact', amounts: parsedExact.amounts };
      }

      if (!shares) return showFormError('The split could not be calculated. Check the amounts.');

      var record = {
        id: draftId,
        description: description,
        amountCents: total,
        paidBy: paidBy,
        date: dateStr,
        createdAt: existing ? existing.createdAt : new Date().toISOString(),
        split: split,
        shares: shares
      };

      if (existing) {
        var index = group.expenses.indexOf(existing);
        group.expenses[index] = record;
      } else {
        group.expenses.push(record);
      }
      save();
      toast(existing ? 'Expense updated' : 'Expense added');
      navigate('#/g/' + encodeURIComponent(group.id));
    });

    function showFormError(message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }

    view.replaceChildren(form);
    update();
  }

  function selectInput(members, value, id, onchange) {
    var select = h('select', {
      class: 'input', id: id,
      onchange: function () { onchange(this.value); }
    });
    members.forEach(function (member) {
      var option = h('option', { value: member.id }, member.name);
      if (member.id === value) option.selected = true;
      select.appendChild(option);
    });
    return select;
  }

  /* ------------------------------------------------------- payment form */

  function renderPaymentForm(group, paymentId, query) {
    var existing = null;
    if (paymentId && paymentId !== 'new') {
      group.payments.forEach(function (payment) {
        if (payment.id === paymentId) existing = payment;
      });
      if (!existing) return renderMissing();
    }

    renderTopbar({ href: '#/g/' + encodeURIComponent(group.id), label: '\u2190 Group' });
    document.title = (existing ? 'Edit payment' : 'Record payment') + ' — Split';

    var draftId = existing ? existing.id : uid();
    var from = existing ? existing.from : (query.get('from') || (group.members[0] && group.members[0].id));
    var to = existing ? existing.to : (query.get('to') || (group.members[1] && group.members[1].id) || (group.members[0] && group.members[0].id));
    var amountStr = existing ? Money.formatCents(existing.amountCents) : '';
    var dateStr = existing ? existing.date : todayISO();
    var note = existing ? (existing.note || '') : '';

    var queryAmount = query.get('amount');
    if (!existing && queryAmount != null) {
      var cents = parseInt(queryAmount, 10);
      if (Money.formatCents(cents)) amountStr = Money.formatCents(cents);
    }

    var errorEl = h('p', { class: 'form-error', hidden: true });

    var form = h('form', { class: 'sheet', novalidate: true }, [
      h('div', { class: 'sheet-head' }, [
        h('a', { class: 'back-link', href: '#/g/' + encodeURIComponent(group.id) }, '\u2190'),
        h('h1', {}, existing ? 'Edit payment' : 'Record payment')
      ]),
      h('p', { class: 'sheet-sub' }, group.name),
      h('div', { class: 'card form-card' }, [
        h('div', { class: 'row-2' }, [
          h('div', { class: 'field' }, [
            h('label', { class: 'label', for: 'payment-from' }, 'From'),
            selectInput(group.members, from, 'payment-from', function (value) {
              from = value;
              errorEl.hidden = true;
            })
          ]),
          h('div', { class: 'field' }, [
            h('label', { class: 'label', for: 'payment-to' }, 'To'),
            selectInput(group.members, to, 'payment-to', function (value) {
              to = value;
              errorEl.hidden = true;
            })
          ])
        ]),
        h('div', { class: 'field' }, [
          h('label', { class: 'label', for: 'payment-amount' }, 'Amount'),
          h('div', { class: 'money-wrap' }, [
            h('span', { class: 'money-prefix' }, '$'),
            h('input', {
              class: 'input', id: 'payment-amount', type: 'text', inputmode: 'decimal',
              autocomplete: 'off', placeholder: '0.00', value: amountStr,
              oninput: function () { amountStr = this.value; errorEl.hidden = true; }
            })
          ])
        ]),
        h('div', { class: 'field' }, [
          h('label', { class: 'label', for: 'payment-date' }, 'Date'),
          h('input', {
            class: 'input', id: 'payment-date', type: 'date', value: dateStr,
            onchange: function () { dateStr = this.value; errorEl.hidden = true; }
          })
        ]),
        h('div', { class: 'field' }, [
          h('label', { class: 'label', for: 'payment-note' }, 'Note (optional)'),
          h('input', {
            class: 'input', id: 'payment-note', type: 'text', autocomplete: 'off',
            placeholder: 'Bank transfer, cash\u2026', value: note,
            oninput: function () { note = this.value; }
          })
        ])
      ]),
      errorEl,
      h('div', { class: 'form-actions' }, [
        h('a', { class: 'btn ghost', href: '#/g/' + encodeURIComponent(group.id) }, 'Cancel'),
        h('button', { class: 'btn primary', type: 'submit' }, existing ? 'Save changes' : 'Record payment')
      ])
    ]);

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!from || !to) return showError('Choose who paid and who was paid.');
      if (from === to) return showError('Choose two different people.');
      var fromMember = group.members.some(function (member) { return member.id === from; });
      var toMember = group.members.some(function (member) { return member.id === to; });
      if (!fromMember || !toMember) return showError('Choose who paid and who was paid.');
      var amount = Money.parseCents(amountStr);
      if (amount == null || amount <= 0) return showError('Enter an amount greater than $0.00.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return showError('Choose a valid date.');

      var record = {
        id: draftId,
        from: from,
        to: to,
        amountCents: amount,
        date: dateStr,
        createdAt: existing ? existing.createdAt : new Date().toISOString(),
        note: note.trim()
      };

      if (existing) {
        var index = group.payments.indexOf(existing);
        group.payments[index] = record;
      } else {
        group.payments.push(record);
      }
      save();
      toast(existing ? 'Payment updated' : 'Payment recorded');
      navigate('#/g/' + encodeURIComponent(group.id));
    });

    function showError(message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }

    view.replaceChildren(form);
  }

  /* -------------------------------------------------------- members page */

  function memberUsage(group, memberId) {
    var count = 0;
    group.expenses.forEach(function (expense) {
      if (expense.paidBy === memberId) count++;
      if (expense.shares && expense.shares[memberId] != null) count++;
    });
    group.payments.forEach(function (payment) {
      if (payment.from === memberId || payment.to === memberId) count++;
    });
    return count;
  }

  function renderMembers(group) {
    renderTopbar({ href: '#/g/' + encodeURIComponent(group.id), label: '\u2190 Group' });
    document.title = 'Members — ' + group.name;

    var errorEl = h('p', { class: 'form-error', hidden: true });
    function showError(message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }

    var memberRows = h('div', {});
    group.members.forEach(function (member) {
      var nameInput = h('input', {
        class: 'input', type: 'text', value: member.name,
        'aria-label': 'Name for ' + member.name
      });
      nameInput.addEventListener('input', function () { errorEl.hidden = true; });

      var saveButton = button('Save', 'btn small', function () {
        var nextName = nameInput.value.trim();
        if (!nextName) return showError('Enter a name.');
        var duplicate = group.members.some(function (other) {
          return other.id !== member.id && other.name.toLowerCase() === nextName.toLowerCase();
        });
        if (duplicate) return showError('That name is already used in this group.');
        if (nextName === member.name) return;
        member.name = nextName;
        save();
        toast('Member renamed');
        render();
      });

      var usage = memberUsage(group, member.id);
      var removeButton = h('button', {
        type: 'button', class: 'icon-btn', title: 'Remove member', 'aria-label': 'Remove ' + member.name
      }, '\u00D7');
      removeButton.disabled = usage > 0 || group.members.length <= 2;
      removeButton.addEventListener('click', function () {
        if (removeButton.disabled) return;
        confirmAction({
          title: 'Remove member?',
          message: '\u201C' + member.name + '\u201D will be removed from this group.',
          okLabel: 'Remove'
        }).then(function (ok) {
          if (!ok) return;
          group.members = group.members.filter(function (item) { return item.id !== member.id; });
          if (group.youId === member.id) group.youId = group.members[0].id;
          save();
          toast('Member removed');
          render();
        });
      });

      memberRows.appendChild(h('div', { class: 'member-row' }, [nameInput, saveButton, removeButton]));

      if (usage > 0) {
        memberRows.appendChild(
          h('p', { class: 'member-note' }, 'Can\u2019t remove: this person appears in an expense or payment.')
        );
      } else if (group.members.length <= 2) {
        memberRows.appendChild(
          h('p', { class: 'member-note' }, 'A group needs at least two members.')
        );
      }
    });

    var addName = '';
    var addInput = h('input', {
      class: 'input', type: 'text', placeholder: 'New member name', autocomplete: 'off',
      oninput: function () { addName = this.value; errorEl.hidden = true; }
    });

    function addMember() {
      var name = addName.trim();
      if (!name) return showError('Enter a name for the new member.');
      var duplicate = group.members.some(function (member) {
        return member.name.toLowerCase() === name.toLowerCase();
      });
      if (duplicate) return showError('That name is already used in this group.');
      group.members.push({ id: uid(), name: name });
      save();
      toast('Member added');
      render();
    }

    addInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        addMember();
      }
    });

    var youSelect = h('select', {
      class: 'input',
      onchange: function () {
        group.youId = this.value;
        save();
        toast('Saved');
      }
    });
    group.members.forEach(function (member) {
      var option = h('option', { value: member.id }, member.name);
      if (member.id === group.youId) option.selected = true;
      youSelect.appendChild(option);
    });

    view.replaceChildren(
      h('div', { class: 'sheet' }, [
        h('div', { class: 'sheet-head' }, [
          h('a', { class: 'back-link', href: '#/g/' + encodeURIComponent(group.id) }, '\u2190'),
          h('h1', {}, 'Members')
        ]),
        h('p', { class: 'sheet-sub' }, group.name),
        h('div', { class: 'card form-card' }, [
          h('div', { class: 'field' }, [
            h('span', { class: 'label' }, 'You'),
            h('div', { class: 'you-row' }, [youSelect]),
            h('span', { class: 'hint' }, 'Used for \u201CYour spend\u201D on the groups list.')
          ]),
          h('div', { class: 'field' }, [
            h('span', { class: 'label' }, 'People'),
            memberRows
          ]),
          errorEl,
          h('div', { class: 'add-member' }, [
            addInput,
            button('Add', 'btn', addMember)
          ])
        ]),
        h('div', { class: 'form-actions' }, [
          h('a', { class: 'btn', href: '#/g/' + encodeURIComponent(group.id) }, 'Done')
        ])
      ])
    );
  }

  /* ---------------------------------------------------------- CSV export */

  function csvCell(value) {
    var text = value == null ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    if (/[",\n\r]/.test(text)) text = '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function safeFilename(value) {
    var name = String(value || 'group')
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/[\x00-\x1f\x7f]/g, '')
      .trim();
    return name || 'group';
  }

  function exportCsv(group) {
    var header = ['Date', 'Type', 'Description', 'Amount', 'Paid by', 'Paid to']
      .concat(group.members.map(function (member) { return member.name; }));

    var records = [];

    group.expenses.forEach(function (expense) {
      var shares = expense.shares || Money.computeShares(expense);
      var row = [
        expense.date,
        'Expense',
        expense.description,
        Money.formatCents(expense.amountCents),
        memberName(group, expense.paidBy),
        ''
      ];
      group.members.forEach(function (member) {
        row.push(shares[member.id] == null ? '0.00' : Money.formatCents(shares[member.id]));
      });
      records.push({ date: expense.date, createdAt: expense.createdAt || '', row: row });
    });

    group.payments.forEach(function (payment) {
      var row = [
        payment.date,
        'Payment',
        payment.note || 'Payment',
        Money.formatCents(payment.amountCents),
        memberName(group, payment.from),
        memberName(group, payment.to)
      ];
      group.members.forEach(function () { row.push(''); });
      records.push({ date: payment.date, createdAt: payment.createdAt || '', row: row });
    });

    records.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
      return 0;
    });

    var lines = [header.map(csvCell).join(',')];
    records.forEach(function (record) {
      lines.push(record.row.map(csvCell).join(','));
    });

    var csv = '\uFEFF' + lines.join('\r\n') + '\r\n';
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = safeFilename(group.name) + '-expenses.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast('CSV downloaded');
  }

  /* ----------------------------------------------------------------- init */

  loadState();
  window.addEventListener('hashchange', render);

  if (!location.hash || location.hash === '#') {
    location.hash = '#/';
  } else {
    render();
  }
})();
