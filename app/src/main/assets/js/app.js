'use strict';

// Liga tudo: navegação pela barra de atalhos, cabeçalho, conquistas, backup e o botão Voltar do Android.

const App = (() => {
  const { h, icon, sound, toast } = UI;
  const VERSION = '1.0.0';

  const TABS = [
    { id: 'home', icon: 'chest', name: 'Início', title: () => greeting() },
    { id: 'inventory', icon: 'diamond', name: 'Inventário', title: () => 'Inventário' },
    { id: 'history', icon: 'writable_book', name: 'Histórico', title: () => 'Histórico' },
    { id: 'summary', icon: 'compass', name: 'Resumo', title: () => 'Resumo' },
    { id: 'settings', icon: 'redstone', name: 'Ajustes', title: () => 'Ajustes' },
  ];

  const state = { tab: 'home', invTab: 'accounts', month: null, account: '' };
  const scroll = {};
  let last = null;

  function greeting() {
    const hr = new Date().getHours();
    const g = hr < 5 ? 'Boa noite' : hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';
    return g + ', ' + (Store.data ? Store.data.settings.player : 'Steve');
  }

  function lastAccount(id) {
    if (id) {
      last = id;
      try { localStorage.setItem('bau.lastAccount', id); } catch (e) { /* sem armazenamento */ }
    }
    if (!last) try { last = localStorage.getItem('bau.lastAccount'); } catch (e) { /* idem */ }
    return last;
  }

  // ---------- desenho ----------

  function render() {
    const screen = document.getElementById('screen');
    // redesenhar a mesma aba (depois de salvar algo) mantém a rolagem onde estava
    const keep = screen.dataset.tab === state.tab ? screen.scrollTop : scroll[state.tab] || 0;
    screen.dataset.tab = Store.data ? state.tab : '';
    const top = document.getElementById('top');
    const bar = document.getElementById('hotbar');
    screen.textContent = '';
    top.textContent = '';
    if (!Store.data) {
      top.style.display = 'none';
      bar.style.display = 'none';
      Screens.welcome(screen);
      return;
    }
    top.style.display = '';
    bar.style.display = '';
    const tab = TABS.find(t => t.id === state.tab);
    top.append(icon(tab.icon, 's24'), h('h1.shadow', tab.title()));
    const wrap = h('div.wrap');
    screen.append(wrap);
    Screens[state.tab](wrap, state);
    screen.scrollTop = keep;
    drawHotbar();
  }

  function drawHotbar(flash) {
    const bar = document.getElementById('hotbar');
    bar.textContent = '';
    const idx = TABS.findIndex(t => t.id === state.tab);
    const label = h('div.label' + (flash ? '' : '.fade'), TABS[idx].name);
    const slots = h('div.bar',
      h('div.sel', { style: 'left:calc(var(--h) * ' + (idx * 20 - 1) + ')' }),
      TABS.map(t => h('div.hs', {
        role: 'button', 'aria-label': t.name,
        onclick: () => {
          if (t.id === state.tab) {
            document.getElementById('screen').scrollTo({ top: 0, behavior: 'smooth' });
            return;
          }
          sound('click');
          go(t.id);
          drawHotbar(true);
        },
      }, h('img', { src: UI.itemSrc(t.icon), alt: '' }))));
    bar.append(label, slots);
    if (flash) requestAnimationFrame(() => requestAnimationFrame(() => label.classList.add('fade')));
  }

  function go(tab, extra) {
    const screen = document.getElementById('screen');
    scroll[state.tab] = screen.scrollTop;
    screen.dataset.tab = '';
    if (tab !== state.tab) {
      scroll[tab] = 0;
      if (tab === 'history' && !(extra && 'account' in extra)) state.account = '';
    }
    state.tab = tab;
    Object.assign(state, extra || {});
    if (extra && ('month' in extra || 'account' in extra || 'invTab' in extra)) scroll[tab] = 0;
    render();
  }

  const THEME_BARS = { overworld: '#1b1b1b', deep: '#101014', nether: '#1d0606', end: '#120a1c' };

  // tábuas ampliadas 3x e escurecidas para o texto branco continuar legível
  // (endereço absoluto: dentro de uma variável CSS, url() relativo seria resolvido a partir de css/)
  const woodBg = wood => 'linear-gradient(rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0.36)), url("' +
    new URL('mc/block/' + wood + '_planks.png', document.baseURI).href + '") 0 0 / 48px 48px';

  // cor média da madeira com o mesmo escurecimento, para a barra de status do Android
  function shade(hex) {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v * 0.72));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function applyTheme() {
    const s = Store.data ? Store.data.settings : { theme: 'overworld' };
    const root = document.documentElement;
    root.dataset.theme = s.theme;
    const wood = k => s[k] && s[k] !== 'none' && WOOD_COLORS[s[k]] ? s[k] : null;
    for (const [k, prop] of [['topWood', '--top-bg'], ['bottomWood', '--bottom-bg']]) {
      if (wood(k)) root.style.setProperty(prop, woodBg(wood(k)));
      else root.style.removeProperty(prop);
    }
    if (window.BauNative && BauNative.setBarColor) {
      BauNative.setBarColor(wood('topWood') ? shade(WOOD_COLORS[wood('topWood')]) : THEME_BARS[s.theme] || '#1b1b1b');
    }
  }

  // ---------- conquistas ----------

  const ADVANCEMENTS = [
    { id: 'first_account', icon: 'chest', name: 'Pegando madeira', desc: 'Crie seu primeiro baú (conta)',
      test: d => d.accounts.length > 0 },
    { id: 'first_tx', icon: 'writable_book', name: 'Diário de bordo', desc: 'Faça seu primeiro registro',
      test: d => d.tx.some(t => t.type === 'expense' || t.type === 'income') },
    { id: 'first_asset', icon: 'painting', name: 'Colecionador', desc: 'Cadastre um bem',
      test: d => d.assets.some(a => a.kind === 'asset') },
    { id: 'tx_100', icon: 'enchanted_book', name: 'Escriba encantado', desc: 'Chegue a 100 registros',
      test: d => d.tx.length >= 100 },
    { id: 'nw_1k', icon: 'iron_ingot', name: 'Idade do ferro', desc: 'Patrimônio de 1.000',
      test: (d, t) => t.net >= 100000 },
    { id: 'nw_10k', icon: 'gold_ingot', name: 'Febre do ouro', desc: 'Patrimônio de 10.000',
      test: (d, t) => t.net >= 1000000 },
    { id: 'nw_100k', icon: 'diamond', name: 'Diamantes!', desc: 'Patrimônio de 100.000',
      test: (d, t) => t.net >= 10000000 },
    { id: 'nw_1m', icon: 'netherite_ingot', name: 'Coberto de netherite', desc: 'Patrimônio de 1.000.000',
      test: (d, t) => t.net >= 100000000 },
    { id: 'goal', icon: 'nether_star', name: 'Meta alcançada', desc: 'Encha a barra de XP da sua meta', goal: true,
      test: (d, t) => d.settings.goal > 0 && t.net >= d.settings.goal },
    { id: 'saver', icon: 'emerald', name: 'Economia de sobrevivência', desc: 'Feche um mês com mais receitas que despesas',
      test: d => closedMonths(d).some(m => { const f = Store.monthFlow(m); return f.income > f.expense && f.expense > 0; }) },
    { id: 'budget', icon: 'golden_carrot', name: 'Dieta balanceada', desc: 'Feche um mês dentro do orçamento',
      test: d => d.settings.budget > 0 && closedMonths(d).some(m => {
        const f = Store.monthFlow(m);
        return f.expense > 0 && f.expense <= d.settings.budget;
      }) },
    { id: 'debt_free', icon: 'elytra', name: 'Livre como uma elytra', desc: 'Quite uma dívida',
      test: d => d.assets.some(a => a.kind === 'debt' && (a.archived || Store.assetValue(a) <= 0)) },
    { id: 'streak', icon: 'clock', name: 'Rotina de mineração', desc: 'Registre algo em 7 dias seguidos',
      test: d => streak(d) >= 7 },
    { id: 'backup', icon: 'ender_chest', name: 'Baú do Ender', desc: 'Exporte um backup',
      test: d => !!d.achievements.backup },
  ];

  function closedMonths(d) {
    const cur = Store.ym(Store.today());
    return [...new Set(d.tx.map(t => Store.ym(t.date)))].filter(m => m < cur);
  }

  function streak(d) {
    const days = [...new Set(d.tx.filter(t => t.created).map(t => Store.iso(new Date(t.created))))].sort();
    let best = 0, run = 0, prev = null;
    for (const day of days) {
      const dt = new Date(day + 'T12:00:00');
      run = prev && (dt - prev) / 86400000 < 1.5 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = dt;
    }
    return best;
  }

  let checking = false;

  function checkAdvancements(silent) {
    const d = Store.data;
    if (!d || checking) return;
    checking = true;
    const t = Store.totals();
    const won = [];
    for (const a of ADVANCEMENTS) {
      if (d.achievements[a.id]) continue;
      let ok = false;
      try { ok = a.test(d, t); } catch (e) { ok = false; }
      if (ok) {
        d.achievements[a.id] = Store.today();
        won.push(a);
      }
    }
    if (won.length) {
      Store.commit();
      if (!silent) {
        won.forEach((a, i) => setTimeout(() => {
          toast(a.goal ? 'Desafio concluído!' : 'Conquista feita!', a.name, { icon: a.icon, goal: a.goal });
          sound('levelup', 0.4);
        }, 400 + i * 1200));
      }
    }
    checking = false;
  }

  function showAchievements() {
    const d = Store.data;
    UI.sheet('Conquistas', ctx => {
      const n = ADVANCEMENTS.filter(a => d.achievements[a.id]).length;
      ctx.body.append(h('div.c-label', { style: 'margin:0 2px 8px' }, n + ' de ' + ADVANCEMENTS.length + ' desbloqueadas'));
      ctx.body.append(h('div.list', ADVANCEMENTS.map(a => {
        const got = d.achievements[a.id];
        return h('div.adv' + (got ? '' : '.locked'), UI.slot(a.icon),
          h('div.grow', h('div.n', a.name), h('div.d', a.desc + (got ? ' · ' + Sheets.fmtDate(got) : ''))));
      })));
    }, { icon: 'knowledge_book' });
  }

  // ---------- backup ----------

  function backupName() {
    return 'bau-backup-' + Store.today() + '.json';
  }

  function exportBackup() {
    const d = Store.data;
    d.achievements.backup = d.achievements.backup || Store.today();
    Store.commit();
    Store.flush();
    const json = JSON.stringify(Object.assign({ app: 'bau', exported: new Date().toISOString() }, d), null, 1);
    if (window.BauNative) {
      BauNative.exportBackup(json, backupName());
      return;
    }
    const a = h('a', { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: backupName() });
    document.body.append(a);
    a.click();
    a.remove();
    toast('Backup exportado', backupName(), { plain: true, icon: 'ender_chest' });
  }

  function importBackup() {
    if (window.BauNative) {
      BauNative.importBackup();
      return;
    }
    const inp = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    inp.onchange = () => {
      const f = inp.files[0];
      inp.remove();
      if (f) f.text().then(onImport);
    };
    document.body.append(inp);
    inp.click();
  }

  function onImport(text) {
    let obj;
    try {
      obj = JSON.parse(text);
      if (!obj || !Array.isArray(obj.accounts) || !Array.isArray(obj.tx)) throw new Error('formato');
    } catch (e) {
      toast('Arquivo inválido', 'Não é um backup do Baú', { plain: true, icon: 'barrier' });
      return;
    }
    const doIt = () => {
      delete obj.app;
      delete obj.exported;
      Store.replace(obj);
      UI.closeAll();
      sound('levelup', 0.3);
      toast('Backup importado', obj.accounts.length + (obj.accounts.length === 1 ? ' conta, ' : ' contas, ') + obj.tx.length + ' registros', { plain: true, icon: 'ender_chest' });
      boot();
    };
    if (Store.data && (Store.data.tx.length || Store.data.accounts.length)) {
      UI.confirm('Substituir dados?', 'O backup vai substituir tudo o que está no app agora.', 'Substituir', doIt,
        { danger: true, icon: 'ender_chest' });
    } else doIt();
  }

  function onExported(ok) {
    toast(ok ? 'Backup exportado' : 'Backup não salvo', ok ? backupName() : null, { plain: true, icon: ok ? 'ender_chest' : 'barrier' });
  }

  // botão Voltar do Android: fecha a janela de cima, depois volta ao Início; false deixa o app sair
  function back() {
    if (UI.closeTop()) return true;
    if (Store.data && state.tab !== 'home') {
      go('home');
      return true;
    }
    Store.flush();
    return false;
  }

  function boot() {
    Store.load();
    state.tab = 'home';
    state.account = '';
    state.month = null;
    applyTheme();
    booted = false;
    if (Store.data) checkAdvancements(true);
    booted = !!Store.data;
    render();
  }

  let booted = false;

  Store.onChange(() => {
    if (!Store.data) return;
    if (!booted) return;
    render();
    checkAdvancements(false);
  });

  window.addEventListener('pagehide', () => Store.flush());
  document.addEventListener('visibilitychange', () => { if (document.hidden) Store.flush(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') UI.closeTop(); });

  // ponte para o Android
  window.Bau = { back, onImport, onExported, flush: () => Store.flush() };

  return {
    go, boot, render, applyTheme, lastAccount, showAchievements, exportBackup, importBackup,
    resetFormat: () => location.reload(), version: () => (window.BauNative && BauNative.version ? BauNative.version() : VERSION),
  };
})();

document.fonts && document.fonts.load('16px MC').finally(App.boot);
if (!document.fonts) App.boot();
