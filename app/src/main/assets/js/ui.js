'use strict';

// Peças da interface: criação de elementos, itens, botões, folhas (janelas), sons, notificações e dinheiro.

const UI = (() => {
  // h('div.classe', {atributos}, ...filhos)
  function h(sel, attrs, ...kids) {
    const [tag, ...cls] = sel.split('.');
    const el = document.createElement(tag || 'div');
    if (cls.length) el.className = cls.join(' ');
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
      kids.unshift(attrs);
      attrs = null;
    }
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className += ' ' + v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    add(el, kids);
    return el;
  }

  function add(el, kids) {
    for (const k of kids) {
      if (k == null || k === false) continue;
      if (Array.isArray(k)) add(el, k);
      else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    }
  }

  const itemSrc = name => 'mc/item/' + (ITEM_NAMES.includes(name) ? name : 'barrier') + '.png';

  function icon(name, cls) {
    return h('img.ico' + (cls ? '.' + cls : ''), { src: itemSrc(name), alt: '' });
  }

  function slot(name, opts = {}) {
    const el = h('div.slot' + (opts.big ? '.big' : '') + (opts.onclick ? '.pick' : '') + (opts.selected ? '.selected' : ''),
      { onclick: opts.onclick ? e => { sound('click'); opts.onclick(e); } : null, title: opts.title || null },
      h('img', { src: itemSrc(name), alt: '' }),
      opts.count ? h('span.count', String(opts.count)) : null);
    return el;
  }

  function button(label, onclick, cls) {
    return h('button' + (cls ? '.' + cls.split(' ').join('.') : ''), {
      type: 'button',
      onclick: e => {
        sound('click');
        onclick && onclick(e);
      },
    }, label);
  }

  function check(label, on, onchange) {
    const el = h('div.check' + (on ? '.on' : ''), {
      onclick: () => {
        on = !on;
        el.classList.toggle('on', on);
        sound('click');
        onchange(on);
      },
    }, h('div.box'), h('span', label));
    return el;
  }

  // ---------- sons e vibração ----------

  const audio = {};

  function sound(name, volume) {
    const s = Store.data && Store.data.settings;
    if (s && !s.sound) return;
    try {
      let a = audio[name];
      if (!a) a = audio[name] = new Audio('sound/' + name + '.ogg');
      const p = a.cloneNode();
      p.volume = volume != null ? volume : name === 'click' ? 0.35 : 0.6;
      p.play().catch(() => {});
    } catch (e) { /* sem som neste aparelho */ }
    if (name !== 'click') buzz(name === 'levelup' ? 60 : 20);
  }

  function buzz(ms) {
    const s = Store.data && Store.data.settings;
    if (s && !s.vibrate) return;
    if (window.MinecoinNative && MinecoinNative.vibrate) MinecoinNative.vibrate(ms);
    else if (navigator.vibrate) navigator.vibrate(ms);
  }

  // ---------- dinheiro ----------

  const fmtCache = {};

  function money(cents, opts = {}) {
    const cur = (Store.data && Store.data.settings.currency) || 'BRL';
    const key = cur + (opts.short ? 's' : '');
    if (!fmtCache[key]) {
      try {
        fmtCache[key] = new Intl.NumberFormat('pt-BR', {
          style: 'currency', currency: cur,
          minimumFractionDigits: opts.short ? 0 : 2, maximumFractionDigits: opts.short ? 0 : 2,
        });
      } catch (e) {
        fmtCache[key] = { format: v => cur + ' ' + v.toFixed(2) };
      }
    }
    const s = fmtCache[key].format(Math.abs(cents) / 100);
    if (opts.sign && cents > 0) return '+' + s;
    return (cents < 0 ? '-' : '') + s;
  }

  function moneyEl(cents, opts = {}) {
    const cls = opts.color === false ? '' : cents < 0 ? '.c-red' : opts.green && cents > 0 ? '.c-green' : '';
    return h('span.money' + cls, money(cents, opts));
  }

  // "12,50+3x2" -> centavos; null quando não é uma conta válida
  function evaluate(expr) {
    const src = String(expr).replace(/\s/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
      .replace(/\./g, '').replace(/,/g, '.');
    if (!src) return null;
    let i = 0;
    const num = () => {
      const m = /^\d*\.?\d+|^\d+\.?/.exec(src.slice(i));
      if (!m) throw new Error('número');
      i += m[0].length;
      return parseFloat(m[0]);
    };
    const factor = () => {
      if (src[i] === '-') { i++; return -factor(); }
      if (src[i] === '(') { i++; const v = sum(); i++; return v; }
      return num();
    };
    const term = () => {
      let v = factor();
      while (src[i] === '*' || src[i] === '/') {
        const op = src[i++];
        const r = factor();
        v = op === '*' ? v * r : v / r;
      }
      return v;
    };
    const sum = () => {
      let v = term();
      while (src[i] === '+' || src[i] === '-') {
        const op = src[i++];
        const r = term();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    };
    try {
      const v = sum();
      if (i !== src.length || !isFinite(v)) return null;
      return Math.round(v * 100);
    } catch (e) {
      return null;
    }
  }

  const centsToInput = c => c ? (c / 100).toFixed(2).replace('.', ',').replace(/,00$/, '') : '';

  // ---------- folhas (janelas por cima da tela) ----------

  const stack = [];

  function sheet(title, build, opts = {}) {
    const layers = document.getElementById('layers');
    const body = h('div.body');
    const foot = h('div.foot');
    const panel = h('div.sheet.panel',
      h('div.head', opts.icon ? icon(opts.icon, 's24') : null, h('div.t', title),
        h('button.close', { type: 'button', 'aria-label': 'Fechar', onclick: () => close() })),
      body, foot);
    const layer = h('div.layer' + (opts.dialog ? '.dialog' : ''), {
      onclick: e => { if (e.target === layer) close(); },
    }, panel);
    const ctx = {
      body, foot, panel,
      close,
      refresh: () => {
        body.textContent = '';
        foot.textContent = '';
        build(ctx);
        foot.style.display = foot.childNodes.length ? '' : 'none';
      },
      onclose: null,
    };
    function close(silent) {
      const i = stack.indexOf(ctx);
      if (i < 0) return;
      stack.splice(i, 1);
      // a janela desce e o fundo some nos mesmos passos da abertura, ao contrário (veja .layer.closing)
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) layer.remove();
      else {
        layer.classList.add('closing');
        panel.addEventListener('animationend', () => layer.remove(), { once: true });
        setTimeout(() => layer.remove(), 400);
      }
      if (!silent && opts.sound !== false) sound('chest_close', 0.25);
      ctx.onclose && ctx.onclose();
    }
    ctx.refresh();
    layers.appendChild(layer);
    stack.push(ctx);
    if (opts.sound !== false) sound('chest_open', 0.25);
    return ctx;
  }

  function closeTop() {
    const top = stack[stack.length - 1];
    if (!top) return false;
    top.close();
    return true;
  }

  function closeAll() {
    while (stack.length) stack[stack.length - 1].close(true);
  }

  function confirm(title, text, yesLabel, onYes, opts = {}) {
    sheet(title, ctx => {
      ctx.body.append(h('p', { style: 'margin:4px 2px 8px' }, text));
      ctx.foot.append(button('Cancelar', () => ctx.close()),
        button(yesLabel, () => { ctx.close(true); onYes(); }, opts.danger ? 'danger' : 'ok'));
    }, { dialog: true, icon: opts.icon, sound: false });
  }

  // ---------- notificações ----------

  function toast(t1, t2, opts = {}) {
    const box = document.getElementById('toasts');
    const el = h('div.toast' + (opts.plain ? '.plain' : '') + (opts.goal ? '.goal' : ''),
      opts.icon ? icon(opts.icon) : null,
      h('div', h('div.t1', t1), t2 ? h('div.t2', t2) : null));
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), opts.plain ? 2600 : 5000);
    if (opts.plain) el.style.animation = 'slidein .3s steps(6), slideout .3s steps(6) 2.2s forwards';
  }

  return { h, icon, slot, button, check, sound, buzz, money, moneyEl, evaluate, centsToInput, sheet, closeTop, closeAll,
    confirm, toast, itemSrc, get open() { return stack.length; } };
})();
