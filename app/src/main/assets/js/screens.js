'use strict';

// Telas: Início, Inventário (contas, bens, dívidas), Histórico, Resumo e Ajustes, mais a tela de boas-vindas.

const Screens = (() => {
  const { h, icon, slot, button, money, moneyEl, sound, toast, confirm } = UI;
  const D = () => Store.data;

  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro',
    'novembro', 'dezembro'];
  const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  const monthName = m => {
    const [y, mo] = m.split('-').map(Number);
    const n = MONTHS[mo - 1];
    return n[0].toUpperCase() + n.slice(1) + (y !== new Date().getFullYear() ? ' ' + y : '');
  };

  function dayLabel(date) {
    const t = Store.today();
    if (date === t) return 'Hoje';
    const y = new Date();
    y.setDate(y.getDate() - 1);
    if (date === Store.iso(y)) return 'Ontem';
    const [yy, m, d] = date.split('-').map(Number);
    const wd = WEEKDAYS[new Date(yy, m - 1, d).getDay()];
    return wd[0].toUpperCase() + wd.slice(1) + ', ' + d + ' de ' + MONTHS[m - 1];
  }

  const catOf = id => D().categories.find(c => c.id === id);
  const accOf = id => D().accounts.find(a => a.id === id);

  // uma linha de registro
  function txRow(t, opts = {}) {
    let ic, title, sub, amount;
    const acc = accOf(t.account);
    if (t.type === 'transfer') {
      const to = accOf(t.to);
      ic = 'ender_pearl';
      title = t.note || 'Transferência';
      sub = (acc ? acc.name : '?') + ' → ' + (to ? to.name : '?');
      amount = opts.account === t.to ? t.amount : opts.account === t.account ? -t.amount : 0;
    } else if (t.type === 'adjust') {
      ic = 'comparator';
      title = 'Ajuste de saldo';
      sub = acc ? acc.name : '';
      amount = t.amount;
    } else if (t.type === 'debt') {
      const debt = D().assets.find(a => a.id === t.debt);
      ic = debt ? debt.icon : 'iron_chain';
      title = 'Pagamento: ' + (debt ? debt.name : t.note || 'dívida');
      sub = acc ? acc.name : '';
      amount = -t.amount;
    } else {
      const c = catOf(t.category);
      ic = c ? c.icon : 'barrier';
      title = t.note || (c ? c.name : 'Sem categoria');
      sub = (t.note && c ? c.name + ' · ' : '') + (acc ? acc.name : '');
      amount = t.type === 'expense' ? -t.amount : t.amount;
    }
    const amountEl = t.type === 'transfer' && !opts.account
      ? h('span.money.c-aqua', money(t.amount))
      : h('span.money' + (amount < 0 ? '' : '.c-green'), money(amount, { sign: true }));
    return h('div.item', { onclick: () => Sheets.tx({ tx: t }) },
      slot(ic),
      h('div.grow', h('div.name', title), h('div.sub', sub)),
      h('div.right', amountEl, opts.balance != null ? h('div.sub', money(opts.balance)) : null));
  }

  function accountRow(a) {
    const b = Store.balance(a.id);
    const type = Store.ACCOUNT_TYPES.find(t => t.id === a.type);
    return h('div.item', { onclick: () => Sheets.account(a) },
      slot(a.icon),
      h('div.grow', h('div.name', a.name), h('div.sub', type ? type.name : '')),
      moneyEl(b));
  }

  // ---------- Início ----------

  function home(root) {
    const d = D();
    const s = d.settings;
    const tot = Store.totals();
    const m = Store.ym(Store.today());
    const flow = Store.monthFlow(m);

    const hero = h('div.hero',
      h('div.label', 'Patrimônio líquido'),
      h('div.value' + (tot.net < 0 ? '.neg' : ''), money(tot.net)));
    root.append(hero);

    // meta = barra de experiência
    if (s.goal > 0) {
      const pct = Math.max(0, Math.min(1, tot.net / s.goal));
      root.append(h('div.xp', { style: 'margin:8px 0 2px' },
        h('div.level', Math.floor(pct * 100) + '%'),
        h('div.bar', h('div.fill', { style: 'width:' + (pct * 100) + '%;--full:' + (pct > 0 ? 100 / pct : 100) + '%' }))),
      h('div.small.center', { style: 'margin-top:2px' }, 'Meta: ' + money(s.goal, { short: true })));
    }

    // orçamento = barra de fome (10 coxas; cada uma vale 1/10 do orçamento)
    if (s.budget > 0) {
      const left = Math.max(0, s.budget - flow.expense);
      const halves = Math.ceil((left / s.budget) * 20);
      const food = h('div.food');
      for (let i = 0; i < 10; i++) {
        const v = halves - i * 2;
        food.append(h('img', { src: 'mc/gui/food_' + (v >= 2 ? 'full' : v === 1 ? 'half' : 'empty') + '.png', alt: '' }));
      }
      root.append(h('div', { style: 'margin-top:12px' },
        h('div.row', h('span.small.grow', 'Orçamento'),
          h('span', { class: flow.expense > s.budget ? 'c-red' : '' }, money(flow.expense, { short: true }) + ' / ' +
            money(s.budget, { short: true }))),
        food));
    }

    root.append(h('div.stats',
      h('div.stat', h('div.k', 'Entrou no mês'), h('div.v.c-green', money(flow.income))),
      h('div.stat', h('div.k', 'Saiu no mês'), h('div.v.c-red', money(flow.expense))),
      h('div.stat', h('div.k', 'Contas'), h('div.v', money(tot.cash))),
      h('div.stat', h('div.k', 'Bens - dívidas'), h('div.v', money(tot.assets - tot.debts)))));

    root.append(h('div.quick',
      button([icon('cooked_beef'), 'Despesa'], () => Sheets.tx({ type: 'expense' })),
      button([icon('emerald'), 'Receita'], () => Sheets.tx({ type: 'income' })),
      button([icon('ender_pearl'), 'Transferir'], () => Sheets.tx({ type: 'transfer' }))));

    const accounts = d.accounts.filter(a => !a.archived);
    root.append(h('h2', icon('chest', 's24'), h('span.grow', 'Baús'),
      button('+', () => Sheets.account(), 'icon-btn')));
    root.append(h('div.list', accounts.length ? accounts.map(accountRow)
      : h('div.empty', 'Nenhuma conta ainda. Toque em + para criar seu primeiro baú.')));

    const recent = Store.sortedTx().slice(0, 6);
    root.append(h('h2', icon('writable_book', 's24'), h('span.grow', 'Últimos registros'),
      recent.length ? button('Ver tudo', () => App.go('history')) : null));
    root.append(h('div.list', recent.length ? recent.map(t => txRow(t))
      : h('div.empty', 'Nada registrado ainda. Use os botões acima.')));
  }

  // ---------- Inventário ----------

  function inventory(root, st) {
    const tab = st.invTab || 'accounts';
    const tot = Store.totals();
    root.append(h('div.stats', { style: 'margin-top:0' },
      h('div.stat', h('div.k', 'Ativos'), h('div.v.c-green', money(tot.cash + tot.assets))),
      h('div.stat', h('div.k', 'Dívidas'), h('div.v.c-red', money(-tot.debts)))));
    root.append(h('div', { style: 'height:14px' }));

    const tabs = [['accounts', 'chest', 'Contas'], ['assets', 'painting', 'Bens'], ['debts', 'iron_chain', 'Dívidas']];
    root.append(h('div.tabs', tabs.map(([id, ic, name]) => h('div.tab' + (tab === id ? '.on' : ''), {
      onclick: () => { sound('click'); App.go('inventory', { invTab: id }); },
    }, icon(ic, 's24'), name))));

    const body = h('div.list.tab-body');
    root.append(body);
    if (tab === 'accounts') {
      const list = D().accounts.filter(a => !a.archived);
      const archived = D().accounts.filter(a => a.archived);
      list.forEach(a => body.append(accountRow(a)));
      if (!list.length) body.append(h('div.empty', 'Nenhuma conta ativa.'));
      root.append(h('div', { style: 'margin-top:10px' }, button([icon('chest', 's24'), 'Nova conta'], () => Sheets.account(), 'block')));
      if (archived.length) {
        root.append(h('h2', 'Arquivadas'), h('div.list', archived.map(accountRow)));
      }
    } else {
      const kind = tab === 'debts' ? 'debt' : 'asset';
      const list = D().assets.filter(a => a.kind === kind && !a.archived);
      const archived = D().assets.filter(a => a.kind === kind && a.archived);
      const row = a => {
        const v = Store.assetValue(a);
        const last = a.history[a.history.length - 1];
        return h('div.item', { onclick: () => Sheets.asset(kind, a) },
          slot(a.icon),
          h('div.grow', h('div.name', a.name), h('div.sub', (a.note ? a.note + ' · ' : '') +
            (last ? 'atualizado em ' + Sheets.fmtDate(last.date) : ''))),
          h('span.money' + (kind === 'debt' ? '.c-red' : ''), money(kind === 'debt' ? -v : v)));
      };
      list.forEach(a => body.append(row(a)));
      if (!list.length) {
        body.append(h('div.empty', kind === 'debt'
          ? 'Nenhuma dívida. Livre como uma elytra!'
          : 'Cadastre imóveis, veículos, ouro, cripto e outros bens.'));
      }
      root.append(h('div', { style: 'margin-top:10px' }, button(kind === 'debt'
        ? [icon('iron_chain', 's24'), 'Nova dívida'] : [icon('painting', 's24'), 'Novo bem'], () => Sheets.asset(kind), 'block')));
      if (archived.length) {
        root.append(h('h2', kind === 'debt' ? 'Quitadas' : 'Vendidos'), h('div.list', archived.map(row)));
      }
    }
  }

  // ---------- Histórico ----------

  function monthNav(m, onChange) {
    const cur = Store.ym(Store.today());
    return h('div.month-nav',
      button(h('img', { src: 'mc/gui/page_backward.png', alt: 'Mês anterior' }), () => onChange(Store.addMonths(m, -1))),
      h('div.m.shadow', monthName(m)),
      m < cur ? button(h('img', { src: 'mc/gui/page_forward.png', alt: 'Próximo mês' }), () => onChange(Store.addMonths(m, 1)))
        : h('div', { style: 'width:44px' }));
  }

  function history(root, st) {
    const m = st.month || Store.ym(Store.today());
    const acc = st.account || '';
    root.append(monthNav(m, nm => App.go('history', { month: nm })));
    const sel = h('select', { onchange: e => App.go('history', { account: e.target.value }) },
      h('option', { value: '' }, 'Todas as contas'),
      D().accounts.map(a => h('option', { value: a.id, selected: a.id === acc }, a.name)));
    root.append(sel);

    const flow = Store.monthFlow(m, acc);
    root.append(h('div.stats',
      h('div.stat', h('div.k', 'Entrou'), h('div.v.c-green', money(flow.income))),
      h('div.stat', h('div.k', 'Saiu'), h('div.v.c-red', money(flow.expense)))));

    const list = Store.sortedTx().filter(t => Store.ym(t.date) === m &&
      (!acc || t.account === acc || t.to === acc));
    if (!list.length) {
      root.append(h('div.list', { style: 'margin-top:12px' }, h('div.empty', 'Nenhum registro neste mês.')));
      return;
    }
    // saldo corrente da conta filtrada depois de cada registro
    let running = acc ? Store.balance(acc, Store.monthEnd(m)) : null;
    const days = {};
    for (const t of list) (days[t.date] = days[t.date] || []).push(t);
    for (const date of Object.keys(days)) {
      const items = days[date];
      let spent = 0;
      for (const t of items) if (t.type === 'expense') spent += t.amount;
      root.append(h('div.day-head', h('span', dayLabel(date)), spent ? h('span.c-gray', '-' + money(spent)) : null));
      const box = h('div.list');
      for (const t of items) {
        box.append(txRow(t, { account: acc || null, balance: running }));
        if (running != null) {
          let delta = 0;
          if (t.account === acc) delta = t.type === 'income' || t.type === 'adjust' ? t.amount : -t.amount;
          if (t.type === 'transfer' && t.to === acc) delta = t.amount;
          running -= delta;
        }
      }
      root.append(box);
    }
  }

  // ---------- Resumo ----------

  function summary(root, st) {
    const m = st.month || Store.ym(Store.today());
    root.append(monthNav(m, nm => App.go('summary', { month: nm })));
    const flow = Store.monthFlow(m);
    const prev = Store.monthFlow(Store.addMonths(m, -1));
    const saved = flow.income - flow.expense;
    const rate = flow.income > 0 ? Math.round((saved / flow.income) * 100) : null;

    root.append(h('div.stats', { style: 'margin-top:0' },
      h('div.stat', h('div.k', 'Receitas'), h('div.v.c-green', money(flow.income))),
      h('div.stat', h('div.k', 'Despesas'), h('div.v.c-red', money(flow.expense))),
      h('div.stat', h('div.k', 'Sobrou'), h('div.v' + (saved < 0 ? '.c-red' : '.c-yellow'), money(saved))),
      h('div.stat', h('div.k', 'Taxa de economia'), h('div.v.c-aqua', rate == null ? '—' : rate + '%'))));

    // patrimônio nos últimos 6 meses: colunas de blocos
    const months = [];
    for (let i = 5; i >= 0; i--) months.push(Store.addMonths(m, -i));
    const nets = months.map(mm => Store.totals(Store.monthEnd(mm) < Store.today() ? Store.monthEnd(mm) : Store.today()).net);
    // cada coluna é uma pilha de 1 a 5 blocos inteiros; o minério mostra a altura (pilhas iguais, minério igual)
    // e o maior mês vira diamante. Mês negativo: netherrack.
    const max = Math.max(1, ...nets.map(Math.abs));
    const best = Math.max(...nets);
    const stackOf = v => {
      if (!v) return { n: 0 };
      const n = Math.max(1, Math.round((Math.abs(v) / max) * 5));
      if (v < 0) return { n, block: 'netherrack' };
      return { n, block: v === best ? 'diamond_block' : ORES[n - 1] };
    };
    root.append(h('h2', icon('gold_block', 's24'), 'Patrimônio por mês'));
    root.append(h('div.list',
      h('div.chart', months.map((mm, i) => {
        const v = nets[i];
        const st = stackOf(v);
        return h('div.col' + (mm === m ? '.cur' : '') + (v < 0 ? '.neg' : ''), { title: money(v) },
          h('div.val', compact(v)),
          st.n ? h('div.stack', { style: 'height:calc(var(--b) * ' + st.n + ');background-image:url(mc/block/' +
            st.block + '.png)' }) : null);
      })),
      h('div.ground'),
      h('div.months', months.map(mm => h('span' + (mm === m ? '.cur' : ''), MONTHS_SHORT[Number(mm.slice(5)) - 1]))),
      h('div.legend', h('span', 'Blocos:'),
        [['coal_block', '1'], ['copper_block', '2'], ['iron_block', '3'], ['gold_block', '4–5'], ['diamond_block', 'recorde']]
          .map(([b, t]) => h('span', h('img', { src: 'mc/block/' + b + '.png', alt: '' }), t)),
        nets.some(v => v < 0) ? h('span', h('img', { src: 'mc/block/netherrack.png', alt: '' }), 'negativo') : null)));

    for (const kind of ['expense', 'income']) {
      const list = D().categories.filter(c => c.kind === kind && flow.byCat[c.id])
        .sort((a, b) => flow.byCat[b.id] - flow.byCat[a.id]);
      const total = kind === 'expense' ? flow.expense : flow.income;
      root.append(h('h2', icon(kind === 'expense' ? 'cooked_beef' : 'emerald', 's24'),
        kind === 'expense' ? 'Despesas por categoria' : 'Receitas por categoria'));
      if (!list.length) {
        root.append(h('div.list', h('div.empty', 'Nada neste mês.')));
        continue;
      }
      const top = flow.byCat[list[0].id];
      root.append(h('div.list.bars', list.map(c => {
        const v = flow.byCat[c.id];
        const pv = prev.byCat[c.id] || 0;
        const diff = pv ? Math.round(((v - pv) / pv) * 100) : null;
        const n = D().tx.filter(t => t.category === c.id && Store.ym(t.date) === m).length;
        return h('div.item', { onclick: () => App.go('history', { month: m }) },
          slot(c.icon, { count: n > 1 ? n : null }),
          h('div.grow',
            h('div.row', h('span.grow.ellipsis', c.name), h('span', money(v))),
            h('div.b' + (kind === 'income' ? '.inc' : ''), h('i', { style: 'width:' + (v / top) * 100 + '%' })),
            h('div.row.sub', h('span.grow.ellipsis', Math.round((v / total) * 100) + '% do total'),
              !diff ? null : h('span', { class: (kind === 'expense' ? diff > 0 : diff < 0) ? 'c-red' : 'c-green' },
                (diff > 0 ? '↑' : '↓') + Math.abs(diff) + '% vs. anterior'))));
      })));
    }
  }

  const ORES = ['coal_block', 'copper_block', 'iron_block', 'gold_block', 'gold_block'];

  function compact(v) {
    const a = Math.abs(v) / 100;
    const s = a >= 1e6 ? (a / 1e6).toFixed(1).replace('.', ',') + 'M' : a >= 1e3 ? Math.round(a / 1e3) + 'k' : String(Math.round(a));
    return (v < 0 ? '-' : '') + s;
  }

  // ---------- Ajustes ----------

  const CURRENCIES = [['BRL', 'Real (R$)'], ['USD', 'Dólar (US$)'], ['EUR', 'Euro (€)'], ['GBP', 'Libra (£)'],
    ['ARS', 'Peso argentino'], ['CLP', 'Peso chileno'], ['MXN', 'Peso mexicano'], ['JPY', 'Iene (¥)'], ['CAD', 'Dólar canadense'],
    ['AUD', 'Dólar australiano'], ['CHF', 'Franco suíço'], ['AOA', 'Kwanza'], ['MZN', 'Metical']];

  const WOODS = [['oak', 'Carvalho'], ['spruce', 'Pinheiro'], ['birch', 'Bétula'], ['jungle', 'Selva'], ['acacia', 'Acácia'],
    ['dark_oak', 'Carvalho escuro'], ['mangrove', 'Mangue'], ['cherry', 'Cerejeira'], ['pale_oak', 'Carvalho pálido'],
    ['bamboo', 'Bambu'], ['crimson', 'Carmesim'], ['warped', 'Distorcida'], ['none', 'Sem madeira (cor do tema)']];

  function woodPicker(key) {
    const cur = D().settings[key];
    const row = h('div.picker');
    for (const [id, name] of WOODS) {
      const cell = h('div.cell' + (id === cur ? '.selected' : ''), {
        onclick: () => {
          if (D().settings[key] === id) return;
          sound('click');
          Store.setSetting(key, id);
          App.applyTheme();
        },
      }, h('div.slot.big.swatch' + (id === cur ? '.selected' : ''),
        id === 'none' ? h('img', { src: 'mc/item/barrier.png', alt: '' })
          : h('img', { src: 'mc/block/' + id + '_planks.png', alt: '' })),
      h('span', name));
      row.append(cell);
    }
    requestAnimationFrame(() => {
      const sel = row.querySelector('.cell.selected');
      if (sel) row.scrollLeft = sel.offsetLeft - row.clientWidth / 2 + sel.clientWidth / 2;
    });
    return row;
  }

  const THEMES = [['overworld', 'Superfície (terra)'], ['deep', 'Cavernas (ardósia)'], ['nether', 'Nether'], ['end', 'The End']];

  function settings(root) {
    const s = D().settings;
    const wrap = h('div.on-dark');
    root.append(wrap);
    const moneyField = (label, key, hint) => {
      const inp = h('input', { inputmode: 'decimal', value: UI.centsToInput(s[key]), placeholder: hint,
        onchange: () => {
          const v = inp.value.trim() ? UI.evaluate(inp.value) : 0;
          if (v == null || v < 0) { toast('Valor inválido', null, { plain: true, icon: 'barrier' }); return; }
          Store.setSetting(key, v);
          toast('Salvo', label, { plain: true, icon: 'writable_book' });
        } });
      return [h('label.field', label), inp];
    };

    wrap.append(h('h2', icon('name_tag', 's24'), 'Jogador'));
    wrap.append(h('label.field', 'Seu nome'), h('input', { value: s.player, maxlength: 16,
      onchange: e => Store.setSetting('player', e.target.value.trim() || 'Steve') }));

    wrap.append(h('h2', icon('emerald', 's24'), 'Dinheiro'));
    wrap.append(h('label.field', 'Moeda'), h('select', { onchange: e => { Store.setSetting('currency', e.target.value); App.resetFormat(); } },
      CURRENCIES.map(([c, n]) => h('option', { value: c, selected: c === s.currency }, c + ' · ' + n))));
    wrap.append(...moneyField('Meta de patrimônio (barra de XP)', 'goal', 'Sem meta'));
    wrap.append(...moneyField('Orçamento mensal (barra de fome)', 'budget', 'Sem orçamento'));
    wrap.append(h('div', { style: 'margin-top:10px' }, button([icon('crafting_table', 's24'), 'Categorias'], () => Sheets.categories(), 'block')));

    wrap.append(h('h2', icon('painting', 's24'), 'Aparência e som'));
    wrap.append(h('label.field', 'Tema'), h('select', { onchange: e => { Store.setSetting('theme', e.target.value); App.applyTheme(); } },
      THEMES.map(([t, n]) => h('option', { value: t, selected: t === s.theme }, n))));
    wrap.append(h('label.field', 'Madeira do topo'), woodPicker('topWood'));
    wrap.append(h('label.field', 'Madeira da barra inferior'), woodPicker('bottomWood'));
    wrap.append(h('div', { style: 'margin-top:8px' },
      UI.check('Sons do jogo', s.sound, v => Store.setSetting('sound', v)),
      UI.check('Vibração', s.vibrate, v => Store.setSetting('vibrate', v))));

    wrap.append(h('h2', icon('ender_chest', 's24'), 'Backup'));
    wrap.append(h('p.small', { style: 'margin:0 0 8px' }, 'Seus dados ficam só neste aparelho. Guarde uma cópia de vez em quando.'));
    wrap.append(h('div.btn-row',
      button('Exportar', () => App.exportBackup()),
      button('Importar', () => App.importBackup())));

    wrap.append(h('h2', icon('nether_star', 's24'), 'Conquistas'));
    wrap.append(h('div', button([icon('knowledge_book', 's24'), 'Ver conquistas'], () => App.showAchievements(), 'block')));

    wrap.append(h('h2', icon('tnt_minecart', 's24'), 'Zona de perigo'));
    wrap.append(h('div.btn-row',
      button('Apagar tudo', () => confirm('Apagar o mundo?', 'Todas as contas, registros, bens e dívidas serão apagados. ' +
        'Exporte um backup antes se quiser guardar.', 'Apagar tudo', () => {
        Store.wipe();
        sound('anvil', 0.4);
        App.boot();
      }, { danger: true, icon: 'tnt_minecart' }), 'danger')));

    wrap.append(h('div.copy.center', { style: 'margin-top:28px' },
      h('div', 'Minecoin ' + App.version()),
      h('div', 'Texturas, fonte e sons: Minecraft © Mojang AB.'),
      h('div', 'Projeto de fã sem vínculo com a Mojang ou a Microsoft.'),
      h('div', 'Inspirado no Tally (MIT).')));
  }

  // ---------- boas-vindas ----------

  const SPLASHES = ['Juros compostos!', 'Agora em reais!', 'Craftando riqueza!', '100% offline!', 'Sem creepers no orçamento!',
    'Diamantes são eternos!', 'Também tente: poupar!', 'Pix de esmeraldas!', 'Minerando economias!', 'Não cave para baixo!',
    'Feito de blocos!', 'Reserva de emergência!'];

  function welcome(root) {
    const splash = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
    root.append(h('div.welcome',
      h('img', { src: 'mc/gui/logo.png', alt: '', style: 'width:96px;height:96px' }),
      h('div.logo-name', 'MINECOIN'),
      h('div.splash', splash),
      h('div.btns',
        button('Novo mundo', () => { Store.start(false); sound('levelup', 0.3); App.boot(); }),
        button('Mundo de exemplo', () => { Store.start(true); sound('levelup', 0.3); App.boot(); }),
        button('Importar backup', () => App.importBackup())),
      h('div.copy', 'Seu patrimônio, bloco por bloco.')));
  }

  return { home, inventory, history, summary, settings, welcome, monthName };
})();
