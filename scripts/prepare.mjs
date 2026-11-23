#!/usr/bin/env node
/**
 * Prepara um app para compilar.
 *   node scripts/prepare.mjs --app ipedir-delivery --platform android
 *   node scripts/prepare.mjs --app app-loja-12 --platform ios
 *
 * Lê apps/<app>.json (os 3 do iPedir já estão na pasta; os de loja/agência o Master baixa em
 * Apps nas Lojas › Abrir › "Baixar configuração do app" e coloca em apps/).
 * Gera: app.config.json (usado pelo capacitor.config.ts), assets/logo.png (ícone e splash)
 * e www/ (tela de carregando e de "sem conexão").
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, appendFileSync } from 'node:fs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith('--') ? [...acc, [cur.slice(2), all[i + 1]]] : acc), [])
);
const name = args.app;
const platform = args.platform || 'android';

function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

if (!name) fail('Informe o app: --app ipedir-delivery');
if (!['android', 'ios'].includes(platform)) fail('--platform precisa ser android ou ios');

const file = `apps/${name.replace(/\.json$/, '')}.json`;
if (!existsSync(file)) fail(`Não achei ${file}`);

const app = JSON.parse(readFileSync(file, 'utf8'));

// ---------- conferência ----------
const idRe = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const required = ['appKey', 'name', 'appId', 'url'];
for (const k of required) if (!app[k]) fail(`${file}: falta "${k}"`);
if (!idRe.test(app.appId)) fail(`${file}: appId inválido (${app.appId}). Use o formato br.com.empresa.app`);
if (app.iosBundleId && !/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/.test(app.iosBundleId)) fail(`${file}: iosBundleId inválido`);
if (!/^https:\/\//.test(app.url)) fail(`${file}: a url precisa começar com https://`);

const host = new URL(app.url).host;
const hosts = Array.from(new Set([host, ...(app.hosts || [])]));
const color = /^#[0-9a-fA-F]{6}$/.test(app.color || '') ? app.color : '#399742';
const background = /^#[0-9a-fA-F]{6}$/.test(app.background || '') ? app.background : '#ffffff';

const config = {
  appKey: app.appKey,
  name: app.name,
  appId: platform === 'ios' ? (app.iosBundleId || app.appId) : app.appId,
  url: app.url,
  hosts,
  color,
  background,
  driverGps: !!app.driverGps,
  version: app.version || '1.0.0',
};
writeFileSync('app.config.json', JSON.stringify(config, null, 2));

// ---------- ícone (assets/logo.png, quadrado, 1024x1024 de preferência) ----------
mkdirSync('assets', { recursive: true });
if (app.icon && existsSync(app.icon)) {
  copyFileSync(app.icon, 'assets/logo.png');
} else if (app.iconUrl) {
  const res = await fetch(app.iconUrl);
  if (!res.ok) fail(`Não consegui baixar o ícone: ${app.iconUrl} (${res.status})`);
  writeFileSync('assets/logo.png', Buffer.from(await res.arrayBuffer()));
} else {
  fail(`${file}: coloque o ícone em "${app.icon || 'apps/icons/<app>.png'}" (PNG quadrado 1024x1024) ou informe "iconUrl"`);
}

// ---------- www (carregando + sem conexão) ----------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const page = (title, body) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(app.name)}</title>
<style>html,body{margin:0;height:100%;font-family:-apple-system,system-ui,Roboto,sans-serif;background:${background};color:#242525}
.box{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;box-sizing:border-box}
h1{font-size:20px;margin:16px 0 6px}p{font-size:14px;color:#6b7280;margin:0 0 20px;max-width:300px}
button{background:${color};color:#fff;border:0;border-radius:14px;padding:14px 28px;font-weight:800;font-size:14px}
.dot{width:56px;height:56px;border-radius:22%;background:${color};opacity:.9}</style></head>
<body><div class="box"><div class="dot"></div><h1>${esc(title)}</h1>${body}</div></body></html>`;

mkdirSync('www', { recursive: true });
writeFileSync('www/index.html', page(app.name, `<p>Carregando…</p><script>location.replace(${JSON.stringify(app.url)})</script>`));
writeFileSync('www/offline.html', page('Sem conexão', `<p>Confira a internet do celular e tente de novo.</p><button onclick="location.replace(${JSON.stringify(app.url)})">Tentar de novo</button>`));

// ---------- variáveis para os próximos passos do Codemagic ----------
const envLines = [
  `APP_NAME=${app.name}`,
  `APP_ID=${config.appId}`,
  `APP_BG=${background}`,
  `APP_COLOR=${color}`,
  `APP_VERSION=${config.version}`,
  `DRIVER_GPS=${config.driverGps ? '1' : '0'}`,
];
if (process.env.CM_ENV) appendFileSync(process.env.CM_ENV, envLines.join('\n') + '\n');

console.log(`✓ ${app.name} (${config.appId}) pronto para ${platform}`);
console.log(`  abre: ${app.url}`);
