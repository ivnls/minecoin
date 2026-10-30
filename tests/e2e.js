// Teste ponta a ponta da interface (Playwright + Chromium), sem Android: serve app/src/main/assets e usa o app como
// um usuário. Uma segunda rodada simula a ponte nativa (BauNative) para conferir o caminho do Android.
//
//   node tests/e2e.js            (precisa do pacote "playwright" e do Chromium dele)
//   SHOTS=dir node tests/e2e.js  (também salva capturas de tela em dir/)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', 'app', 'src', 'main', 'assets');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf',
  '.ogg': 'audio/ogg', '.json': 'application/json' };
const SHOTS = process.env.SHOTS;

let failures = 0;
function check(cond, msg) {
  console.log((cond ? '  ok   ' : '  FAIL ') + msg);
  if (!cond) failures++;
}

function serve() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    }).listen(0, () => resolve(server));
  });
}

async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') });
}

const text = (page, sel) => page.locator(sel).first().innerText();
const money = s => Number(s.replace(/[^\d,-]/g, '').replace(',', '.'));

async function keypad(page, keys) {
  for (const k of keys) await page.click(`.keypad button:text-is("${k}")`);
}

async function browserRun(base) {
  console.log('Navegador (localStorage)');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/index.html');
  await page.waitForSelector('text=Novo mundo');
  await shot(page, '01-welcome');

  await page.click('text=Novo mundo');
  await page.waitForSelector('#hotbar .hs');
  check(await page.locator('.item:has-text("Carteira")').count() === 1, 'novo mundo cria a conta Carteira');

  // nova conta com saldo inicial
  await page.click('h2 button:text-is("+")');
  await page.fill('.sheet input >> nth=0', 'Banco Esmeralda');
  await page.fill('.sheet input[inputmode=decimal]', '1.000,50');
  await page.click('.sheet .foot button:has-text("Salvar")');
  await page.waitForSelector('.item:has-text("Banco Esmeralda")');
  check(money(await text(page, '.item:has-text("Banco Esmeralda") .money')) === 1000.5, 'saldo inicial 1.000,50');

  // despesa com conta: 12+3×2 = 18
  await page.click('.quick button:has-text("Despesa")');
  await keypad(page, ['1', '2', '+', '3', '×', '2']);
  check((await text(page, '.display .val')).includes('18,00'), 'calculadora: 12+3×2 = 18,00');
  await page.click('.picker .cell:has-text("Banco")');
  await page.fill('.sheet input[placeholder="Descrição"]', 'Almoço');
  await page.click('.sheet .foot button:has-text("Registrar")');
  await page.waitForSelector('.item:has-text("Almoço")');
  check(money(await text(page, '.item:has-text("Banco Esmeralda") .money')) === 982.5, 'despesa desconta da conta');
  await page.waitForSelector('.toast:has-text("Diário de bordo")');
  check(true, 'conquista "Diário de bordo" aparece');
  await shot(page, '02-home');

  // receita
  await page.click('.quick button:has-text("Receita")');
  await keypad(page, ['5', '0', '0']);
  await page.click('.picker .cell:has-text("Banco")');
  await page.click('.sheet .foot button:has-text("Registrar")');
  await page.waitForTimeout(200);

  // transferência de 100 do banco para a carteira
  await page.click('.quick button:has-text("Transferir")');
  await keypad(page, ['1', '0', '0']);
  await page.click('.sheet .picker >> nth=0 >> .cell:has-text("Banco")');
  await page.click('.sheet .picker >> nth=1 >> .cell:has-text("Carteira")');
  await page.click('.sheet .foot button:has-text("Registrar")');
  await page.waitForTimeout(200);
  check(money(await text(page, '.item:has-text("Banco Esmeralda") .money')) === 1382.5, 'banco: 1000,50 - 18 + 500 - 100');
  check(money(await text(page, '.list .item:has-text("Carteira") >> .money')) === 100, 'carteira recebe 100');
  check(money(await text(page, '.hero .value')) === 1482.5, 'patrimônio = soma das contas');

  // ajuste de saldo
  await page.click('.item:has-text("Banco Esmeralda")');
  await page.click('.sheet button:has-text("Ajustar saldo")');
  await page.fill('.layer.dialog input', '1400');
  await page.click('.layer.dialog button:has-text("Ajustar")');
  await page.waitForTimeout(150);
  await page.click('.sheet .close');
  check(money(await text(page, '.item:has-text("Banco Esmeralda") .money')) === 1400, 'ajuste de saldo leva a 1.400');

  // bem e dívida no inventário
  await page.click('#hotbar .hs[aria-label="Inventário"]');
  await page.click('.tab:has-text("Bens")');
  await page.click('button:has-text("Novo bem")');
  await page.click('.sheet .picker .cell:has-text("Veículo")');
  await page.fill('.sheet input[inputmode=decimal]', '30000');
  await page.click('.sheet .foot button:has-text("Salvar")');
  await page.waitForSelector('.item:has-text("Veículo")');
  await page.click('.tab:has-text("Dívidas")');
  await page.click('button:has-text("Nova dívida")');
  await page.click('.sheet .picker .cell:has-text("Empréstimo")');
  await page.fill('.sheet input[inputmode=decimal]', '2000');
  await page.click('.sheet .foot button:has-text("Salvar")');
  await page.click('.item:has-text("Empréstimo")');
  await page.click('.sheet button:has-text("Registrar pagamento")');
  await page.fill('.layer.dialog input[inputmode=decimal]', '500');
  await page.click('.layer.dialog .picker .cell:has-text("Banco")');
  await page.click('.layer.dialog button:has-text("Pagar")');
  await page.waitForTimeout(150);
  await page.click('.sheet .close');
  check(money(await text(page, '.item:has-text("Empréstimo") .money')) === -1500, 'pagamento reduz a dívida para 1.500');
  await shot(page, '03-inventory');
  await page.click('#hotbar .hs[aria-label="Início"]');
  check(money(await text(page, '.hero .value')) === 1400 - 500 + 100 + 30000 - 1500, 'patrimônio com bens e dívidas');

  // histórico filtrado e resumo
  await page.click('#hotbar .hs[aria-label="Histórico"]');
  check(await page.locator('#screen .item').count() === 5, 'histórico do mês tem 5 registros');
  const bank = await page.locator('select option:has-text("Banco")').getAttribute('value');
  await page.selectOption('#screen select', bank);
  check(await page.locator('#screen .item').count() === 5, 'filtro do banco mostra os 5 registros dele');
  check(money(await text(page, '#screen .item .right .sub')) === 900, 'saldo corrente no registro mais novo (1.400 - 500)');
  await page.click('#hotbar .hs[aria-label="Resumo"]');
  check(await page.locator('.chart .col').count() === 6, 'gráfico de 6 meses');
  const stacks = await page.$$eval('.chart .stack', els => els.map(e => e.getBoundingClientRect().height));
  check(stacks.length > 0 && stacks.every(hh => hh % 32 === 0), 'colunas só com blocos inteiros (múltiplos de 32px)');
  await shot(page, '04-summary');

  // voltar do Android: fecha janela, depois volta ao início, depois deixa sair
  await page.click('#hotbar .hs[aria-label="Ajustes"]');
  await page.click('button:has-text("Categorias")');
  check(await page.evaluate(() => Bau.back()) === true && await page.locator('.layer').count() === 0, 'voltar fecha a janela');
  check(await page.evaluate(() => Bau.back()) === true, 'voltar leva ao início');
  check(await page.evaluate(() => Bau.back()) === false, 'no início, voltar sai do app');

  // madeiras do topo e da barra, cada uma por conta própria
  await page.click('#hotbar .hs[aria-label="Ajustes"]');
  await page.click('.picker >> nth=0 >> .cell:has-text("Cerejeira")');
  await page.click('.picker >> nth=1 >> .cell:has-text("Distorcida")');
  const bgs = await page.evaluate(() => [getComputedStyle(document.getElementById('top')).backgroundImage,
    getComputedStyle(document.getElementById('hotbar')).backgroundImage]);
  check(bgs[0].includes('cherry_planks') && bgs[1].includes('warped_planks'), 'topo de cerejeira e barra distorcida');
  const loaded = await page.evaluate(urls => Promise.all(urls.map(u => fetch(u).then(r => r.ok, () => false))),
    bgs.map(b => /url\("([^"]+)"\)/.exec(b)[1]));
  check(loaded.every(Boolean), 'as texturas de madeira carregam de verdade');
  await page.click('.picker >> nth=1 >> .cell:has-text("Sem madeira")');
  check(!(await page.evaluate(() => getComputedStyle(document.getElementById('hotbar')).backgroundImage)).includes('planks') &&
    (await page.evaluate(() => getComputedStyle(document.getElementById('top')).backgroundImage)).includes('cherry_planks'),
  'barra sem madeira não muda o topo');
  await shot(page, '04b-woods');

  // backup: exporta, apaga tudo, importa
  await page.click('#hotbar .hs[aria-label="Ajustes"]');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Exportar")')]);
  const backupPath = await download.path();
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  check(backup.app === 'bau' && backup.tx.length === 5, 'backup exportado com 5 registros');
  await page.click('button:has-text("Apagar tudo")');
  await page.click('.layer.dialog button:has-text("Apagar tudo")');
  await page.waitForSelector('text=Importar backup');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('text=Importar backup')]);
  await chooser.setFiles(backupPath);
  await page.waitForSelector('.hero .value');
  check(money(await text(page, '.hero .value')) === 29500, 'importar devolve o patrimônio');

  // tema e recarga mantém os dados
  await page.click('#hotbar .hs[aria-label="Ajustes"]');
  await page.selectOption('#screen select >> nth=1', 'nether');
  check(await page.evaluate(() => document.documentElement.dataset.theme) === 'nether', 'tema Nether');
  await page.evaluate(() => Bau.flush());
  await page.reload();
  await page.waitForSelector('#hotbar .hs');
  check(await page.evaluate(() => Store.data.tx.length) === 5, 'dados continuam depois de recarregar');
  await shot(page, '05-nether');

  check(errors.length === 0, 'sem erros de JavaScript' + (errors.length ? ': ' + errors.join('; ') : ''));
  await browser.close();
}

async function animationRun(base) {
  console.log('Animação de fechar');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await page.goto(base + '/index.html');
  await page.click('text=Novo mundo');
  await page.click('.quick button:has-text("Despesa")');
  await page.waitForTimeout(300);
  await page.click('.sheet .close');
  const during = await page.evaluate(() => {
    const layer = document.querySelector('.layer');
    const sheet = layer && layer.querySelector('.sheet');
    return layer && { closing: layer.classList.contains('closing'), name: getComputedStyle(sheet).animationName };
  });
  check(during && during.closing && during.name === 'down', 'Novo registro desce ao fechar (animação "down")');
  await page.waitForTimeout(500);
  check(await page.locator('.layer').count() === 0, 'a janela some ao fim da animação');
  await browser.close();
}

async function nativeRun(base) {
  console.log('Ponte nativa simulada (BauNative)');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    window.__saved = null;
    window.__calls = [];
    window.BauNative = {
      load: () => window.__saved,
      save: json => { window.__saved = json; window.__calls.push('save'); },
      exportBackup: (json, name) => window.__calls.push('export:' + name + ':' + JSON.parse(json).accounts.length),
      importBackup: () => window.__calls.push('import'),
      vibrate: () => window.__calls.push('vibrate'),
      setBarColor: c => window.__calls.push('bar:' + c),
      version: () => '9.9.9',
    };
  });
  await page.goto(base + '/index.html');
  await page.click('text=Mundo de exemplo');
  await page.waitForSelector('.hero .value');
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => JSON.parse(window.__saved));
  check(saved && saved.accounts.length === 5 && saved.tx.length > 50, 'mundo de exemplo salvo pelo BauNative.save');
  await page.click('#hotbar .hs[aria-label="Ajustes"]');
  check((await page.locator('.copy').innerText()).includes('9.9.9'), 'versão vem do app');
  await page.click('button:has-text("Exportar")');
  await page.click('button:has-text("Importar")');
  const calls = await page.evaluate(() => window.__calls);
  check(calls.some(c => /^export:bau-backup-\d{4}-\d\d-\d\d\.json:5$/.test(c)), 'exportar chama BauNative.exportBackup');
  check(calls.includes('import'), 'importar chama BauNative.importBackup');
  check(calls.includes('bar:#755e38'), 'barra de status com a cor do carvalho escurecida');
  // o Android devolve o arquivo escolhido chamando Bau.onImport(texto)
  const json = await page.evaluate(() => window.__saved);
  const obj = JSON.parse(json);
  obj.accounts = obj.accounts.slice(0, 1);
  obj.tx = obj.tx.filter(t => t.account === obj.accounts[0].id && t.type !== 'transfer');
  await page.evaluate(t => Bau.onImport(t), JSON.stringify(obj));
  await page.click('.layer.dialog button:has-text("Substituir")');
  await page.waitForTimeout(300);
  check(await page.evaluate(() => JSON.parse(window.__saved).accounts.length) === 1, 'Bau.onImport substitui os dados');
  await page.evaluate(() => Bau.onImport('isto não é json'));
  check(await page.locator('.toast:has-text("Arquivo inválido")').count() === 1, 'arquivo inválido é recusado');
  await shot(page, '06-native');
  check(errors.length === 0, 'sem erros de JavaScript' + (errors.length ? ': ' + errors.join('; ') : ''));
  await browser.close();
}

(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const base = 'http://localhost:' + server.address().port;
  try {
    await browserRun(base);
    await animationRun(base);
    await nativeRun(base);
  } catch (e) {
    console.error(e);
    failures++;
  }
  server.close();
  console.log(failures ? failures + ' falha(s)' : 'tudo certo');
  process.exit(failures ? 1 : 0);
})();
