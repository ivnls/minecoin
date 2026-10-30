'use strict';

// Dados do Minecoin: contas, registros, bens, dívidas e conquistas. Valores sempre em centavos (inteiros).
// No app Android os dados ficam num arquivo privado (MinecoinNative); no navegador, no localStorage.

const Store = (() => {
  const KEY = 'minecoin.v1';
  let data = null;
  let saveTimer = 0;
  const listeners = [];

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => iso(new Date());
  const ym = date => date.slice(0, 7);
  const monthEnd = m => {
    const [y, mo] = m.split('-').map(Number);
    return iso(new Date(y, mo, 0));
  };
  const addMonths = (m, n) => {
    const [y, mo] = m.split('-').map(Number);
    const d = new Date(y, mo - 1 + n, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  };

  const ACCOUNT_TYPES = [
    { id: 'checking', name: 'Conta corrente', icon: 'chest' },
    { id: 'savings', name: 'Poupança', icon: 'gold_ingot' },
    { id: 'cash', name: 'Dinheiro', icon: 'bundle' },
    { id: 'wallet', name: 'Carteira digital', icon: 'ender_chest' },
    { id: 'credit', name: 'Cartão de crédito', icon: 'name_tag' },
    { id: 'invest', name: 'Investimentos', icon: 'diamond' },
  ];

  const ASSET_PRESETS = [
    { name: 'Imóvel', icon: 'oak_door' },
    { name: 'Veículo', icon: 'minecart' },
    { name: 'Ouro', icon: 'gold_ingot' },
    { name: 'Ações', icon: 'emerald' },
    { name: 'Cripto', icon: 'amethyst_shard' },
    { name: 'Eletrônicos', icon: 'spyglass' },
    { name: 'Joias', icon: 'diamond' },
    { name: 'Arte', icon: 'painting' },
  ];

  const DEBT_PRESETS = [
    { name: 'Empréstimo', icon: 'iron_chain' },
    { name: 'Financiamento', icon: 'iron_door' },
    { name: 'Fatura', icon: 'name_tag' },
    { name: 'Devo a alguém', icon: 'lead' },
  ];

  function defaultCategories() {
    const exp = [
      ['Alimentação', 'cooked_beef'], ['Mercado', 'bread'], ['Transporte', 'minecart'], ['Moradia', 'oak_door'],
      ['Contas', 'redstone'], ['Saúde', 'golden_apple'], ['Educação', 'book'], ['Lazer', 'music_disc_cat'],
      ['Compras', 'bundle'], ['Roupas', 'chainmail_chestplate'], ['Assinaturas', 'clock'], ['Pets', 'bone'],
      ['Presentes', 'cake'], ['Viagem', 'map'], ['Impostos', 'paper'], ['Outros', 'bucket'],
    ];
    const inc = [
      ['Salário', 'emerald'], ['Freela', 'diamond_pickaxe'], ['Rendimentos', 'experience_bottle'],
      ['Presente', 'gold_nugget'], ['Vendas', 'item_frame'], ['Outros', 'iron_nugget'],
    ];
    return exp.map(([name, icon]) => ({ id: uid(), name, icon, kind: 'expense' }))
      .concat(inc.map(([name, icon]) => ({ id: uid(), name, icon, kind: 'income' })));
  }

  function fresh() {
    return {
      version: 1,
      created: today(),
      settings: {
        player: 'Steve',
        currency: 'BRL',
        goal: 0,
        budget: 0,
        sound: true,
        vibrate: true,
        theme: 'overworld',
        topWood: 'oak',
        bottomWood: 'oak',
      },
      accounts: [],
      categories: defaultCategories(),
      tx: [],
      assets: [],
      achievements: {},
    };
  }

  // ---------- persistência ----------

  function load() {
    let raw = null;
    try {
      raw = window.MinecoinNative ? MinecoinNative.load() : localStorage.getItem(KEY);
    } catch (e) { raw = null; }
    if (raw) {
      try { data = migrate(JSON.parse(raw)); } catch (e) { data = null; }
    }
    return data;
  }

  function migrate(d) {
    const base = fresh();
    d.settings = Object.assign(base.settings, d.settings || {});
    for (const k of ['accounts', 'categories', 'tx', 'assets']) if (!Array.isArray(d[k])) d[k] = [];
    if (!d.achievements) d.achievements = {};
    d.version = 1;
    return d;
  }

  function persist() {
    const json = JSON.stringify(data);
    try {
      if (window.MinecoinNative) MinecoinNative.save(json);
      else localStorage.setItem(KEY, json);
    } catch (e) { console.error('falha ao salvar', e); }
  }

  function commit() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 150);
    listeners.forEach(fn => fn());
  }

  function flush() {
    if (saveTimer) { clearTimeout(saveTimer); persist(); saveTimer = 0; }
  }

  function start(withDemo) {
    data = fresh();
    if (withDemo) demo();
    else data.accounts.push({ id: uid(), name: 'Carteira', type: 'cash', icon: 'bundle', initial: 0, created: today() });
    commit();
    flush();
  }

  function replace(obj) {
    data = migrate(obj);
    commit();
    flush();
  }

  function wipe() {
    data = null;
    try {
      if (window.MinecoinNative) MinecoinNative.save('');
      else localStorage.removeItem(KEY);
    } catch (e) { /* nada a fazer */ }
  }

  // ---------- contas ----------

  function balance(accountId, upto) {
    const a = data.accounts.find(x => x.id === accountId);
    if (!a) return 0;
    let b = upto && a.created > upto ? 0 : a.initial || 0;
    for (const t of data.tx) {
      if (upto && t.date > upto) continue;
      if (t.account === accountId) {
        if (t.type === 'expense' || t.type === 'transfer' || t.type === 'debt') b -= t.amount;
        else if (t.type === 'income' || t.type === 'adjust') b += t.amount;
      }
      if (t.type === 'transfer' && t.to === accountId) b += t.amount;
    }
    return b;
  }

  // valor de um bem ou dívida: o último valor informado, menos os pagamentos feitos depois dele (dívidas)
  function assetValue(asset, upto) {
    const hist = asset.history.filter(h => !upto || h.date <= upto);
    if (!hist.length) return 0;
    const last = hist[hist.length - 1];
    let v = last.value;
    if (asset.kind === 'debt') {
      for (const t of data.tx) {
        if (t.type === 'debt' && t.debt === asset.id && (t.created || 0) > (last.at || 0) && (!upto || t.date <= upto)) {
          v -= t.amount;
        }
      }
    }
    return v;
  }

  function totals(upto) {
    let cash = 0, assets = 0, debts = 0;
    for (const a of data.accounts) cash += balance(a.id, upto);
    for (const x of data.assets) {
      if (x.archived && !upto) continue;
      const v = assetValue(x, upto);
      if (x.kind === 'debt') debts += Math.max(0, v);
      else assets += v;
    }
    return { cash, assets, debts, net: cash + assets - debts };
  }

  function monthFlow(m, accountId) {
    let income = 0, expense = 0;
    const byCat = {};
    for (const t of data.tx) {
      if (ym(t.date) !== m) continue;
      if (accountId && t.account !== accountId) continue;
      if (t.type === 'expense') {
        expense += t.amount;
        byCat[t.category] = (byCat[t.category] || 0) + t.amount;
      } else if (t.type === 'income') {
        income += t.amount;
        byCat[t.category] = (byCat[t.category] || 0) + t.amount;
      }
    }
    return { income, expense, byCat };
  }

  function sortedTx() {
    return data.tx.slice().sort((a, b) => (b.date + (b.created || 0)).localeCompare(a.date + (a.created || 0)) ||
      (b.created || 0) - (a.created || 0));
  }

  // ---------- alterações ----------

  function saveAccount(a) {
    if (!a.id) {
      a.id = uid();
      a.created = a.created || today();
      data.accounts.push(a);
    } else {
      const i = data.accounts.findIndex(x => x.id === a.id);
      data.accounts[i] = Object.assign(data.accounts[i], a);
    }
    commit();
    return a;
  }

  function deleteAccount(id) {
    data.accounts = data.accounts.filter(a => a.id !== id);
    data.tx = data.tx.filter(t => t.account !== id && t.to !== id);
    commit();
  }

  function saveTx(t) {
    if (!t.id) {
      t.id = uid();
      t.created = Date.now();
      data.tx.push(t);
    } else {
      const i = data.tx.findIndex(x => x.id === t.id);
      data.tx[i] = Object.assign(data.tx[i], t);
    }
    commit();
    return t;
  }

  function deleteTx(id) {
    data.tx = data.tx.filter(t => t.id !== id);
    commit();
  }

  function saveAsset(x, newValue, date) {
    if (!x.id) {
      x.id = uid();
      x.history = [];
      data.assets.push(x);
    } else {
      const i = data.assets.findIndex(a => a.id === x.id);
      data.assets[i] = Object.assign(data.assets[i], x);
      x = data.assets[i];
    }
    if (newValue != null && newValue !== assetValue(x)) {
      x.history.push({ date: date || today(), value: newValue, at: Date.now() });
      x.history.sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at);
    }
    commit();
    return x;
  }

  function deleteAsset(id) {
    data.assets = data.assets.filter(a => a.id !== id);
    data.tx = data.tx.filter(t => t.debt !== id);
    commit();
  }

  function saveCategory(c) {
    if (!c.id) {
      c.id = uid();
      data.categories.push(c);
    } else {
      const i = data.categories.findIndex(x => x.id === c.id);
      data.categories[i] = Object.assign(data.categories[i], c);
    }
    commit();
  }

  function deleteCategory(id) {
    const used = data.tx.some(t => t.category === id);
    if (used) {
      const c = data.categories.find(x => x.id === id);
      c.hidden = true;
    } else {
      data.categories = data.categories.filter(c => c.id !== id);
    }
    commit();
  }

  function setSetting(k, v) {
    data.settings[k] = v;
    commit();
  }

  // ---------- dados de exemplo ----------

  function demo() {
    const d = data;
    d.settings.goal = 5000000;
    d.settings.budget = 450000;
    const cat = name => d.categories.find(c => c.name === name && c.kind === 'expense').id;
    const inc = name => d.categories.find(c => c.name === name && c.kind === 'income').id;
    const start = addMonths(ym(today()), -5) + '-01';
    const acc = (name, type, icon, initial) => {
      const a = { id: uid(), name, type, icon, initial, created: start };
      d.accounts.push(a);
      return a.id;
    };
    const bank = acc('Banco Esmeralda', 'checking', 'chest', 320000);
    const save = acc('Reserva', 'savings', 'gold_ingot', 1500000);
    const cash = acc('Carteira', 'cash', 'bundle', 15000);
    const card = acc('Cartão Redstone', 'credit', 'name_tag', 0);
    const invest = acc('Corretora', 'invest', 'diamond', 2200000);
    let seed = 7;
    const rnd = (a, b) => {
      seed = (seed * 9301 + 49297) % 233280;
      return Math.round(a + (seed / 233280) * (b - a));
    };
    const tx = (type, amount, account, date, extra) => d.tx.push(Object.assign({
      id: uid(), type, amount, account, date, created: Date.parse(date) + rnd(0, 80000000),
    }, extra));
    const now = today();
    for (let i = 5; i >= 0; i--) {
      const m = addMonths(ym(now), -i);
      const day = n => {
        const s = m + '-' + pad(n);
        return s <= now ? s : null;
      };
      const put = (type, amount, account, n, extra) => {
        const dt = day(n);
        if (dt) tx(type, amount, account, dt, extra);
      };
      put('income', 650000, bank, 5, { category: inc('Salário'), note: 'Salário' });
      if (i % 2 === 0) put('income', rnd(60000, 180000), bank, 18, { category: inc('Freela'), note: 'Projeto de site' });
      put('income', rnd(9000, 16000), invest, 28, { category: inc('Rendimentos') });
      put('expense', 180000, bank, 6, { category: cat('Moradia'), note: 'Aluguel' });
      put('expense', rnd(18000, 26000), bank, 10, { category: cat('Contas'), note: 'Luz e internet' });
      put('expense', 5590, card, 12, { category: cat('Assinaturas'), note: 'Streaming' });
      put('transfer', 100000, bank, 7, { to: save, note: 'Guardar na reserva' });
      put('transfer', 50000, bank, 8, { to: invest });
      put('transfer', 40000, bank, 2, { to: cash, note: 'Saque' });
      for (let w = 0; w < 4; w++) {
        put('expense', rnd(18000, 42000), card, 3 + w * 7, { category: cat('Mercado'), note: 'Supermercado' });
        put('expense', rnd(2500, 9000), cash, 4 + w * 7, { category: cat('Alimentação'), note: 'Padaria' });
        put('expense', rnd(3000, 12000), card, 5 + w * 7, { category: cat('Transporte'), note: 'Uber' });
        if (w % 2) put('expense', rnd(4000, 16000), card, 6 + w * 7, { category: cat('Lazer'), note: 'Cinema' });
      }
      put('expense', rnd(8000, 30000), card, 20, { category: cat('Compras') });
      if (i === 2) put('expense', 35000, bank, 15, { category: cat('Saúde'), note: 'Consulta' });
      put('transfer', rnd(140000, 200000), bank, 25, { to: card, note: 'Pagamento da fatura' });
    }
    d.assets.push({ id: uid(), kind: 'asset', name: 'Carro', icon: 'minecart', note: '',
      history: [{ date: start, value: 4800000, at: 1 }, { date: addMonths(ym(now), -1) + '-01', value: 4650000, at: 2 }] });
    d.assets.push({ id: uid(), kind: 'asset', name: 'Notebook', icon: 'spyglass', note: '',
      history: [{ date: start, value: 450000, at: 1 }] });
    const loan = { id: uid(), kind: 'debt', name: 'Financiamento do carro', icon: 'iron_door', note: '',
      history: [{ date: start, value: 2400000, at: 1 }] };
    d.assets.push(loan);
    for (let i = 5; i >= 0; i--) {
      const dt = addMonths(ym(now), -i) + '-15';
      if (dt <= now) tx('debt', 120000, bank, dt, { debt: loan.id, note: 'Parcela' });
    }
  }

  return {
    get data() { return data; },
    uid, today, iso, ym, monthEnd, addMonths,
    ACCOUNT_TYPES, ASSET_PRESETS, DEBT_PRESETS,
    load, start, replace, wipe, commit, flush, onChange: fn => listeners.push(fn),
    balance, assetValue, totals, monthFlow, sortedTx,
    saveAccount, deleteAccount, saveTx, deleteTx, saveAsset, deleteAsset, saveCategory, deleteCategory, setSetting,
  };
})();
