'use strict';

// Janelas de edição: registro (com calculadora), conta, bem/dívida, pagamento, categoria e escolha de emblema.

const Sheets = (() => {
  const { h, icon, slot, button, money, evaluate, centsToInput, sheet, confirm, toast, sound } = UI;
  const D = () => Store.data;

  const TYPE_NAMES = { expense: 'Despesa', income: 'Receita', transfer: 'Transferir' };

  const activeAccounts = () => D().accounts.filter(a => !a.archived);
  const cats = kind => D().categories.filter(c => c.kind === kind && !c.hidden);

  function field(label, input) {
    return h('div', h('label.field', label), input);
  }

  function moneyInput(cents, placeholder) {
    return h('input', { inputmode: 'decimal', value: centsToInput(cents), placeholder: placeholder || '0,00' });
  }

  // fileira rolável de espaços com nome embaixo
  function picker(items, selected, onPick, label) {
    const row = h('div.picker');
    const name = id => (items.find(i => i.id === id) || {}).name || '';
    const caption = label ? h('label.field', label, h('span', { style: 'color:#000' }, selected ? ': ' + name(selected) : '')) : null;
    for (const it of items) {
      const cell = h('div.cell' + (it.id === selected ? '.selected' : ''), {
        onclick: () => {
          sound('click');
          row.querySelectorAll('.cell').forEach(c => c.classList.remove('selected'));
          row.querySelectorAll('.slot').forEach(c => c.classList.remove('selected'));
          cell.classList.add('selected');
          cell.firstChild.classList.add('selected');
          if (caption) caption.lastChild.textContent = ': ' + it.name;
          onPick(it.id);
        },
      }, slot(it.icon, { big: true, selected: it.id === selected }), h('span', it.name));
      row.appendChild(cell);
    }
    requestAnimationFrame(() => {
      const sel = row.querySelector('.cell.selected');
      if (sel) row.scrollLeft = sel.offsetLeft - row.clientWidth / 2 + sel.clientWidth / 2;
    });
    return caption ? h('div', caption, row) : row;
  }

  // ---------- registro ----------

  function tx(opts = {}) {
    const old = opts.tx;
    const accounts = activeAccounts();
    if (!accounts.length) {
      toast('Crie uma conta primeiro', 'Seu primeiro baú fica em Inventário', { plain: true, icon: 'chest' });
      return;
    }
    const st = {
      type: old ? old.type : opts.type || 'expense',
      expr: old ? centsToInput(old.amount) : '',
      category: old ? old.category : opts.category || null,
      account: old ? old.account : opts.account || (App.lastAccount() && accounts.some(a => a.id === App.lastAccount())
        ? App.lastAccount() : accounts[0].id),
      to: old ? old.to : null,
      date: old ? old.date : opts.date || Store.today(),
      note: old ? old.note || '' : '',
    };
    if (old && (old.type === 'debt' || old.type === 'adjust')) return special(old);

    const title = old ? 'Editar registro' : 'Novo registro';
    sheet(title, ctx => {
      const { body, foot } = ctx;
      if (!st.category || !cats(st.type).some(c => c.id === st.category)) {
        const list = cats(st.type);
        st.category = st.type === 'transfer' ? null : list.length ? list[0].id : null;
      }
      if (st.type === 'transfer' && (!st.to || st.to === st.account)) {
        const other = accounts.find(a => a.id !== st.account);
        st.to = other ? other.id : null;
      }

      const tabs = h('div.tabs', ['expense', 'income', 'transfer'].map(t => h('div.tab' + (st.type === t ? '.on' : ''), {
        onclick: () => {
          if (st.type === t) return;
          sound('click');
          st.type = t;
          ctx.refresh();
        },
      }, TYPE_NAMES[t])));

      const exprEl = h('div.expr');
      const valEl = h('div.val');
      const display = h('div.display.' + st.type, exprEl, valEl);
      const paint = () => {
        const v = evaluate(st.expr);
        const isCalc = /[+\-×÷]/.test(st.expr.replace(/^-/, ''));
        exprEl.textContent = isCalc ? st.expr : '';
        valEl.textContent = v != null ? money(v) : st.expr ? '?' : money(0);
      };
      paint();

      const key = k => {
        if (k === '⌫') st.expr = st.expr.slice(0, -1);
        else if ('+−×÷'.includes(k)) {
          if (!st.expr) return;
          st.expr = /[+−×÷]$/.test(st.expr) ? st.expr.slice(0, -1) + k : st.expr + k;
        } else if (k === ',') {
          const lastNum = st.expr.split(/[+−×÷]/).pop();
          if (lastNum.includes(',')) return;
          st.expr += lastNum ? ',' : '0,';
        } else {
          const lastNum = st.expr.split(/[+−×÷]/).pop();
          if (/,\d\d$/.test(lastNum)) return;
          if (st.expr.length > 24) return;
          st.expr += k;
        }
        paint();
      };
      const keypad = h('div.keypad', ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', ',', '0', '⌫', '+']
        .map(k => {
          const b = button(k, () => key(k));
          if (k === '⌫') {
            let timer;
            b.addEventListener('pointerdown', () => { timer = setTimeout(() => { st.expr = ''; paint(); UI.buzz(30); }, 500); });
            ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => clearTimeout(timer)));
          }
          return b;
        }));

      body.append(tabs, h('div.inset', { style: 'border-top:none' }, display, keypad));

      if (st.type !== 'transfer') {
        body.append(picker(cats(st.type), st.category, id => { st.category = id; }, 'Categoria'));
      }
      body.append(picker(accounts, st.account, id => {
        st.account = id;
        if (st.type === 'transfer' && st.to === id) ctx.refresh();
      }, st.type === 'transfer' ? 'De' : 'Conta'));
      if (st.type === 'transfer') {
        if (accounts.length < 2) body.append(h('p.muted', 'Crie outra conta para transferir entre elas.'));
        else body.append(picker(accounts, st.to, id => { st.to = id; }, 'Para'));
      }

      const date = h('input', { type: 'date', value: st.date, oninput: e => { st.date = e.target.value; } });
      const note = h('input', { value: st.note, placeholder: st.type === 'income' ? 'De quem?' : 'Descrição', maxlength: 80,
        oninput: e => { st.note = e.target.value; } });
      body.append(h('div.row', { style: 'gap:6px' },
        h('div', { style: 'flex:0 0 46%' }, field('Data', date)), h('div.grow', field('Nota', note))));

      if (old) {
        foot.append(button('Excluir', () => confirm('Excluir registro?', 'Este registro será quebrado para sempre.', 'Excluir',
          () => { Store.deleteTx(old.id); sound('break'); ctx.close(true); }, { danger: true, icon: 'barrier' }), 'danger'));
      }
      foot.append(button(old ? 'Salvar' : 'Registrar', () => {
        const amount = evaluate(st.expr);
        if (!amount || amount <= 0) {
          toast('Digite um valor', null, { plain: true, icon: 'barrier' });
          return;
        }
        if (!st.date) return toast('Escolha a data', null, { plain: true, icon: 'clock' });
        if (st.type === 'transfer' && (!st.to || st.to === st.account)) {
          return toast('Escolha a conta de destino', null, { plain: true, icon: 'ender_pearl' });
        }
        const t = {
          id: old ? old.id : undefined, type: st.type, amount, account: st.account, date: st.date, note: st.note.trim(),
          category: st.type === 'transfer' ? undefined : st.category, to: st.type === 'transfer' ? st.to : undefined,
        };
        App.lastAccount(st.account);
        Store.saveTx(t);
        sound(st.type === 'income' ? 'orb' : 'pop');
        ctx.close(true);
      }, 'ok'));
    }, { icon: 'writable_book' });
  }

  // ajustes de saldo e pagamentos de dívida: só valor, data e nota
  function special(old) {
    const isDebt = old.type === 'debt';
    sheet(isDebt ? 'Pagamento de dívida' : 'Ajuste de saldo', ctx => {
      const amount = moneyInput(old.amount);
      const date = h('input', { type: 'date', value: old.date });
      const note = h('input', { value: old.note || '', maxlength: 80 });
      const acc = D().accounts.find(a => a.id === old.account);
      ctx.body.append(h('p', { style: 'margin:2px' }, 'Conta: ' + (acc ? acc.name : '?')),
        field(isDebt ? 'Valor pago' : 'Diferença (use - para reduzir)', amount), field('Data', date), field('Nota', note));
      ctx.foot.append(button('Excluir', () => { Store.deleteTx(old.id); sound('break'); ctx.close(true); }, 'danger'),
        button('Salvar', () => {
          const v = evaluate(amount.value);
          if (v == null || (isDebt && v <= 0)) return toast('Valor inválido', null, { plain: true, icon: 'barrier' });
          Store.saveTx({ id: old.id, amount: v, date: date.value || old.date, note: note.value.trim() });
          ctx.close(true);
        }, 'ok'));
    }, { dialog: true, icon: isDebt ? 'iron_chain' : 'comparator' });
  }

  // ---------- conta ----------

  function account(old) {
    const st = old ? Object.assign({}, old) : { name: '', type: 'checking', icon: 'chest', initial: 0, archived: false };
    let iconTouched = !!old;
    sheet(old ? 'Editar conta' : 'Nova conta (baú)', ctx => {
      const { body, foot } = ctx;
      const name = h('input', { value: st.name, placeholder: 'Ex.: Banco, Carteira…', maxlength: 40,
        oninput: e => { st.name = e.target.value; } });
      const type = h('select', { onchange: e => {
        st.type = e.target.value;
        if (!iconTouched) {
          st.icon = Store.ACCOUNT_TYPES.find(t => t.id === st.type).icon;
          iconSlot.replaceWith(iconSlot = makeIcon());
        }
      } }, Store.ACCOUNT_TYPES.map(t => h('option', { value: t.id, selected: t.id === st.type }, t.name)));
      const makeIcon = () => slot(st.icon, { big: true, onclick: () => pickIcon(st.icon, n => {
        st.icon = n;
        iconTouched = true;
        iconSlot.replaceWith(iconSlot = makeIcon());
      }) });
      let iconSlot = makeIcon();
      const initial = moneyInput(st.initial);

      body.append(h('div.row', h('div', { style: 'padding-top:30px' }, iconSlot),
        h('div.grow', field('Nome', name), field('Tipo', type))));
      body.append(field(old ? 'Saldo inicial' : 'Quanto tem nela hoje?', initial));
      if (st.type === 'credit' || !old) {
        body.append(h('p.muted', { style: 'margin:6px 2px 0' },
          'Cartão de crédito: use um valor negativo para a fatura em aberto (ex.: -350).'));
      }

      if (old) {
        const bal = Store.balance(old.id);
        body.append(h('div.inset', { style: 'margin-top:12px' },
          h('div.row', h('span.grow', 'Saldo atual'), h('b', { style: 'font-weight:normal;color:' + (bal < 0 ? '#a00' : '#060') },
            money(bal)))),
        h('div.btn-row', { style: 'margin-top:6px' },
          button('Ajustar saldo', () => adjust(old)),
          button('Ver histórico', () => { ctx.close(true); App.go('history', { account: old.id }); })));
        body.append(h('div', { style: 'margin-top:8px' },
          UI.check('Arquivar (esconde da tela inicial)', !!st.archived, v => { st.archived = v; })));
      }

      if (old) {
        foot.append(button('Excluir', () => confirm('Excluir ' + old.name + '?',
          'A conta e todos os registros dela serão apagados. Não dá para desfazer.', 'Excluir tudo', () => {
            Store.deleteAccount(old.id);
            sound('anvil', 0.3);
            ctx.close(true);
          }, { danger: true, icon: 'tnt_minecart' }), 'danger'));
      }
      foot.append(button('Salvar', () => {
        const v = initial.value.trim() ? evaluate(initial.value) : 0;
        if (!st.name.trim()) return toast('Dê um nome à conta', null, { plain: true, icon: 'name_tag' });
        if (v == null) return toast('Valor inválido', null, { plain: true, icon: 'barrier' });
        st.name = st.name.trim();
        st.initial = v;
        Store.saveAccount(st);
        sound('levelup', 0.2);
        ctx.close(true);
      }, 'ok'));
    }, { icon: 'chest' });
  }

  function adjust(acc) {
    sheet('Ajustar saldo: ' + acc.name, ctx => {
      const cur = Store.balance(acc.id);
      const real = moneyInput(cur);
      ctx.body.append(h('p', { style: 'margin:2px 2px 6px' },
        'Digite quanto a conta tem de verdade. A diferença vira um registro de ajuste (não conta como gasto).'),
      field('Saldo real', real));
      setTimeout(() => real.select(), 50);
      ctx.foot.append(button('Cancelar', () => ctx.close()), button('Ajustar', () => {
        const v = evaluate(real.value);
        if (v == null) return toast('Valor inválido', null, { plain: true, icon: 'barrier' });
        if (v !== cur) {
          Store.saveTx({ type: 'adjust', amount: v - cur, account: acc.id, date: Store.today(), note: 'Ajuste de saldo' });
          sound('anvil', 0.25);
        }
        ctx.close(true);
      }, 'ok'));
    }, { dialog: true, icon: 'comparator' });
  }

  // ---------- bens e dívidas ----------

  function asset(kind, old) {
    const isDebt = kind === 'debt';
    const st = old ? Object.assign({}, old) : { kind, name: '', icon: isDebt ? 'iron_chain' : 'painting', note: '' };
    const presets = isDebt ? Store.DEBT_PRESETS : Store.ASSET_PRESETS;
    sheet(old ? st.name : isDebt ? 'Nova dívida' : 'Novo bem', ctx => {
      const { body, foot } = ctx;
      const name = h('input', { value: st.name, maxlength: 40, placeholder: isDebt ? 'Ex.: Empréstimo' : 'Ex.: Apartamento',
        oninput: e => { st.name = e.target.value; } });
      const makeIcon = () => slot(st.icon, { big: true, onclick: () => pickIcon(st.icon, n => {
        st.icon = n;
        iconSlot.replaceWith(iconSlot = makeIcon());
      }) });
      let iconSlot = makeIcon();
      const cur = old ? Store.assetValue(old) : null;
      const value = moneyInput(cur);
      const date = h('input', { type: 'date', value: Store.today() });
      const note = h('input', { value: st.note || '', maxlength: 80, placeholder: 'Opcional' });

      if (!old) {
        body.append(h('div.picker', presets.map(p => h('div.cell', {
          onclick: () => {
            sound('click');
            st.name = p.name;
            st.icon = p.icon;
            name.value = p.name;
            iconSlot.replaceWith(iconSlot = makeIcon());
          },
        }, slot(p.icon), h('span', p.name)))));
      }
      body.append(h('div.row', h('div', { style: 'padding-top:30px' }, iconSlot), h('div.grow', field('Nome', name))));
      body.append(h('div.row', { style: 'gap:6px' },
        h('div.grow', field(isDebt ? 'Quanto falta pagar' : 'Valor atual', value)),
        h('div', { style: 'flex:0 0 44%' }, field('Em', date))));
      body.append(field('Nota', note));

      if (old) {
        const hist = old.history.slice(-4).reverse();
        const pays = isDebt ? D().tx.filter(t => t.type === 'debt' && t.debt === old.id) : [];
        if (isDebt) {
          body.append(h('div.btn-row', { style: 'margin-top:10px' },
            button('Registrar pagamento', () => pay(old))));
        }
        body.append(h('label.field', 'Histórico'),
          h('div.inset', hist.map(x => h('div.row', h('span.grow', fmtDate(x.date) + (isDebt ? ' saldo' : ' valor')),
            h('span', money(x.value)))),
          pays.slice(-6).reverse().map(t => h('div.row', { onclick: () => tx({ tx: t }), style: 'cursor:pointer' },
            h('span.grow', fmtDate(t.date) + ' pago'), h('span', { style: 'color:#060' }, '-' + money(t.amount))))));
        body.append(h('div', { style: 'margin-top:8px' },
          UI.check(isDebt ? 'Quitada (arquivar)' : 'Vendido (arquivar)', !!st.archived, v => { st.archived = v; })));
        foot.append(button('Excluir', () => confirm('Excluir ' + old.name + '?', 'Apaga o item e o histórico dele.', 'Excluir',
          () => { Store.deleteAsset(old.id); sound('break'); ctx.close(true); }, { danger: true, icon: 'barrier' }), 'danger'));
      }

      foot.append(button('Salvar', () => {
        const v = evaluate(value.value);
        if (!st.name.trim()) return toast('Dê um nome', null, { plain: true, icon: 'name_tag' });
        if (v == null || v < 0) return toast('Valor inválido', null, { plain: true, icon: 'barrier' });
        st.name = st.name.trim();
        st.note = note.value.trim();
        Store.saveAsset(st, v, date.value || Store.today());
        sound(isDebt ? 'anvil' : 'levelup', 0.25);
        ctx.close(true);
      }, 'ok'));
    }, { icon: isDebt ? 'iron_chain' : 'painting' });
  }

  function pay(debt) {
    const accounts = activeAccounts();
    if (!accounts.length) return toast('Crie uma conta primeiro', null, { plain: true, icon: 'chest' });
    let account = App.lastAccount() || accounts[0].id;
    if (!accounts.some(a => a.id === account)) account = accounts[0].id;
    sheet('Pagar: ' + debt.name, ctx => {
      const left = Store.assetValue(debt);
      const amount = moneyInput(null, 'Falta ' + money(left));
      const date = h('input', { type: 'date', value: Store.today() });
      ctx.body.append(field('Valor pago', amount), picker(accounts, account, id => { account = id; }, 'Saiu da conta'),
        field('Data', date));
      ctx.foot.append(button('Cancelar', () => ctx.close()), button('Pagar', () => {
        const v = evaluate(amount.value);
        if (!v || v <= 0) return toast('Valor inválido', null, { plain: true, icon: 'barrier' });
        Store.saveTx({ type: 'debt', debt: debt.id, amount: v, account, date: date.value || Store.today(), note: debt.name });
        sound('orb');
        if (v >= left) toast('Dívida quitada!', debt.name, { icon: 'elytra' });
        ctx.close(true);
      }, 'ok'));
    }, { dialog: true, icon: 'iron_chain' });
  }

  // ---------- categorias ----------

  function categories() {
    sheet('Categorias', ctx => {
      for (const kind of ['expense', 'income']) {
        ctx.body.append(h('label.field', kind === 'expense' ? 'Despesas' : 'Receitas'),
          h('div.grid', cats(kind).map(c => h('div.cell', { onclick: () => category(c, ctx.refresh) },
            slot(c.icon, { big: true }), h('span', c.name))),
          h('div.cell', { onclick: () => category({ kind }, ctx.refresh) }, slot('writable_book', { big: true }),
            h('span', '+ Nova'))));
      }
    }, { icon: 'crafting_table' });
  }

  function category(old, done) {
    const st = Object.assign({ name: '', icon: 'bucket' }, old);
    sheet(st.id ? 'Editar categoria' : 'Nova categoria', ctx => {
      const name = h('input', { value: st.name, maxlength: 24, oninput: e => { st.name = e.target.value; } });
      const makeIcon = () => slot(st.icon, { big: true, onclick: () => pickIcon(st.icon, n => {
        st.icon = n;
        iconSlot.replaceWith(iconSlot = makeIcon());
      }) });
      let iconSlot = makeIcon();
      ctx.body.append(h('div.row', h('div', { style: 'padding-top:30px' }, iconSlot), h('div.grow', field('Nome', name))));
      if (st.id) {
        ctx.foot.append(button('Excluir', () => {
          Store.deleteCategory(st.id);
          ctx.close(true);
          done && done();
        }, 'danger'));
      }
      ctx.foot.append(button('Salvar', () => {
        if (!st.name.trim()) return toast('Dê um nome', null, { plain: true, icon: 'name_tag' });
        st.name = st.name.trim();
        Store.saveCategory(st);
        ctx.close(true);
        done && done();
      }, 'ok'));
    }, { dialog: true, icon: st.icon });
  }

  // ---------- escolha de emblema (inventário criativo) ----------

  const ICON_NAMES_PT = {
    chest: 'baú', ender_chest: 'baú ender cofre', emerald: 'esmeralda dinheiro', diamond: 'diamante', gold_ingot: 'ouro',
    iron_ingot: 'ferro', bread: 'pão comida', cooked_beef: 'carne comida', minecart: 'carro transporte', book: 'livro',
    map: 'mapa viagem', clock: 'relógio', compass: 'bússola', bundle: 'bolsa carteira', painting: 'quadro arte',
    oak_door: 'casa porta', iron_door: 'casa porta', golden_apple: 'saúde maçã', cake: 'bolo festa', bone: 'pet osso',
    redstone: 'energia luz', paper: 'papel imposto', name_tag: 'cartão etiqueta', iron_chain: 'corrente dívida',
    elytra: 'asas viagem', saddle: 'cavalo sela', music_disc_cat: 'música disco', experience_bottle: 'xp rendimento',
  };

  function pickIcon(current, onPick) {
    sheet('Escolha um emblema', ctx => {
      const grid = h('div.icon-grid');
      const search = h('input', { placeholder: 'Buscar…', style: 'margin-bottom:8px', oninput: () => fill(search.value) });
      const fill = q => {
        q = q.trim().toLowerCase();
        grid.textContent = '';
        for (const n of ITEM_NAMES) {
          if (q && !n.includes(q) && !(ICON_NAMES_PT[n] || '').includes(q)) continue;
          grid.appendChild(slot(n, { selected: n === current, title: n.replace(/_/g, ' '),
            onclick: () => { ctx.close(true); onPick(n); } }));
        }
      };
      fill('');
      ctx.body.append(search, grid);
    }, { icon: 'crafting_table', sound: false });
  }

  function fmtDate(d) {
    const [y, m, day] = d.split('-');
    return day + '/' + m + '/' + y.slice(2);
  }

  return { tx, account, adjust, asset, pay, categories, category, pickIcon, fmtDate, TYPE_NAMES };
})();
