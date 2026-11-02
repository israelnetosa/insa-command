// INSA Command · app de Windows (Electron)
// Roda o mesmo servidor do app web, mas local: banco SQLite na pasta do usuário,
// protocolo interno insa:// (nenhuma porta de rede aberta) e chaves de IA cifradas pelo Windows (DPAPI).

import { app, BrowserWindow, protocol, ipcMain, safeStorage, shell, Menu, dialog, Notification } from 'electron';
import { autoUpdater } from 'electron-updater';
import { join, extname, normalize } from 'node:path';
import { readFile, writeFile, mkdir, copyFile, readdir, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import worker from '../src/index';
import { LocalD1 } from './d1';
import { createLock } from './lock';
import { refreshQuotes } from '../src/market';
import migration0001 from '../migrations/0001_init.sql';
import migration0002 from '../migrations/0002_live.sql';
import migration0003 from '../migrations/0003_manuel.sql';

const SCHEME = 'insa';
const ORIGIN = `${SCHEME}://app`;
protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId('com.insa.command');

let win: BrowserWindow | null = null;
let db: LocalD1;
const dataDir = () => app.getPath('userData');
const publicDir = () => join(app.getAppPath(), 'public');

// ───────── segredos (chaves de IA) cifrados pelo Windows ─────────
const SECRET_NAMES = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'BRAPI_TOKEN'] as const;
type SecretName = typeof SECRET_NAMES[number];
let secrets: Partial<Record<SecretName, string>> = {};
const secretsFile = () => join(dataDir(), 'secrets.bin');
function loadSecrets() {
  try {
    if (!existsSync(secretsFile())) return;
    const buf = readFileSync(secretsFile());
    secrets = JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8'));
  } catch { secrets = {}; }
}
async function saveSecrets() {
  const s = JSON.stringify(secrets);
  await writeFile(secretsFile(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(s) : Buffer.from(s, 'utf8'), { mode: 0o600 });
}

// ───────── arquivos da interface ─────────
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};
const ASSETS = {
  async fetch(input: Request | string) {
    const url = new URL(typeof input === 'string' ? input : input.url);
    let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (rel.includes('..')) return new Response('Proibido', { status: 403 });
    if (!rel) rel = 'index.html';
    let file = join(publicDir(), rel);
    if (!existsSync(file)) file = join(publicDir(), 'index.html');   // SPA
    const body = await readFile(file);
    return new Response(body, { headers: { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' } });
  },
};

let env: any;
function buildEnv() {
  const lock: ReturnType<typeof createLock> & { backup?: (m: string) => Promise<string> } = createLock(db);
  // Cópia completa e consistente do banco antes de operações de risco (ex.: migração)
  lock.backup = async (motivo: string) => {
    const dir = join(dataDir(), 'backups'); await mkdir(dir, { recursive: true });
    const nome = `insa-${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)}-${motivo.replace(/[^a-z0-9-]/gi, '')}.sqlite`;
    const destino = join(dir, nome);
    db.raw.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
    return destino;
  };
  env = {
    DB: db, ASSETS, DESKTOP: lock,
    get GEMINI_API_KEY() { return secrets.GEMINI_API_KEY; },
    get ANTHROPIC_API_KEY() { return secrets.ANTHROPIC_API_KEY; },
    get BRAPI_TOKEN() { return secrets.BRAPI_TOKEN; },
  };
  return lock;
}

// ───────── atualizações ─────────
type Feed = { provider: 'github'; owner: string; repo: string } | { provider: 'generic'; url: string };
let updateStatus: Record<string, unknown> = { estado: 'parado' };
const sendUpdate = (s: Record<string, unknown>) => { updateStatus = s; win?.webContents.send('insa:update', s); };
// Canal de fábrica: releases públicos do GitHub do dono (só instaladores, nunca dados da carteira)
const FEED_PADRAO: Feed = { provider: 'github', owner: 'israelnetosa', repo: 'insa-command' };
async function getFeed(): Promise<Feed | null> {
  const r = await db.prepare(`SELECT valor FROM settings WHERE chave = 'update_feed'`).first<{ valor: string }>();
  return r ? JSON.parse(r.valor) : FEED_PADRAO;
}
async function checkUpdates(manual = false) {
  if (!app.isPackaged) { sendUpdate({ estado: 'dev', texto: 'Atualizações só funcionam na versão instalada.' }); return updateStatus; }
  const feed = await getFeed();
  if (!feed) { sendUpdate({ estado: 'sem_canal', texto: 'Canal de atualização não configurado. Instale a nova versão por cima: seus dados são mantidos.' }); return updateStatus; }
  autoUpdater.setFeedURL(feed as any);
  try { await autoUpdater.checkForUpdates(); }
  catch (e) { sendUpdate({ estado: 'erro', texto: 'Não foi possível verificar: ' + String((e as Error).message).slice(0, 140) }); }
  return updateStatus;
}
function wireUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => sendUpdate({ estado: 'verificando', texto: 'Verificando atualizações…' }));
  autoUpdater.on('update-not-available', () => sendUpdate({ estado: 'atual', texto: `Você está na versão mais recente (${app.getVersion()}).` }));
  autoUpdater.on('update-available', (i) => sendUpdate({ estado: 'baixando', versao: i.version, texto: `Baixando a versão ${i.version}…` }));
  autoUpdater.on('download-progress', (p) => sendUpdate({ estado: 'baixando', progresso: Math.round(p.percent), texto: `Baixando… ${Math.round(p.percent)}%` }));
  autoUpdater.on('update-downloaded', (i) => {
    sendUpdate({ estado: 'pronta', versao: i.version, texto: `Versão ${i.version} pronta. Reinicie para aplicar.` });
    if (Notification.isSupported()) new Notification({ title: 'INSA Command', body: `Atualização ${i.version} pronta para instalar.` }).show();
  });
  autoUpdater.on('error', (e) => sendUpdate({ estado: 'erro', texto: 'Erro na atualização: ' + String(e?.message ?? e).slice(0, 140) }));
}

// ───────── IPC: só o que a interface precisa, nada além ─────────
function wireIpc(lock: ReturnType<typeof createLock>) {
  const guard = () => { if (!lock.isUnlocked()) throw new Error('App bloqueado.'); };
  ipcMain.handle('insa:info', () => ({ versao: app.getVersion(), dados: dataDir(), plataforma: process.platform }));
  ipcMain.handle('insa:update:status', () => updateStatus);
  ipcMain.handle('insa:update:check', () => checkUpdates(true));
  ipcMain.handle('insa:update:install', () => { guard(); setImmediate(() => autoUpdater.quitAndInstall(false, true)); return true; });
  ipcMain.handle('insa:update:feed:get', async () => { guard(); return getFeed(); });
  ipcMain.handle('insa:update:feed:set', async (_e, f: any) => {
    guard();
    let feed: Feed | null = null;
    if (f?.provider === 'github' && /^[\w.-]+$/.test(f.owner ?? '') && /^[\w.-]+$/.test(f.repo ?? '')) feed = { provider: 'github', owner: f.owner, repo: f.repo };
    else if (f?.provider === 'generic' && /^https:\/\//.test(f.url ?? '')) feed = { provider: 'generic', url: f.url };
    else if (f) throw new Error('Canal inválido.');
    if (feed) await db.prepare(`INSERT OR REPLACE INTO settings (chave, valor) VALUES ('update_feed', ?)`).bind(JSON.stringify(feed)).run();
    else await db.prepare(`DELETE FROM settings WHERE chave = 'update_feed'`).run();
    return feed;
  });
  ipcMain.handle('insa:keys:status', () => { guard(); return Object.fromEntries(SECRET_NAMES.map(n => [n, !!secrets[n]])); });
  ipcMain.handle('insa:keys:set', async (_e, name: SecretName, value: string) => {
    guard();
    if (!SECRET_NAMES.includes(name)) throw new Error('Chave desconhecida.');
    const v = String(value ?? '').trim();
    if (v) secrets[name] = v.slice(0, 400); else delete secrets[name];
    await saveSecrets();
    await db.prepare('INSERT INTO audit (acao, dados) VALUES (?, ?)').bind('chave_ia_alterada', JSON.stringify({ name, definida: !!v })).run();
    return true;
  });
  ipcMain.handle('insa:data:open', () => { guard(); return shell.openPath(dataDir()); });
  ipcMain.handle('insa:data:backup', async () => {
    guard();
    const r = await dialog.showSaveDialog(win!, { title: 'Salvar cópia do banco', defaultPath: `insa-command-${new Date().toISOString().slice(0, 10)}.sqlite`, filters: [{ name: 'SQLite', extensions: ['sqlite'] }] });
    if (r.canceled || !r.filePath) return false;
    db.raw.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    await copyFile(join(dataDir(), 'insa.sqlite'), r.filePath);
    return true;
  });
  ipcMain.handle('insa:lock', () => { lock.lock(); return true; });
  // Arquivo de migração na pasta Downloads (o mais recente). Só lê arquivos com o nome do formato.
  ipcMain.handle('insa:migracao:procurar', async () => {
    guard();
    // Downloads do sistema, ~/Downloads e a pasta de dados do app (nessa ordem de preferência por data)
    const pastas = [...new Set([app.getPath('downloads'), join(app.getPath('home'), 'Downloads'), dataDir()])];
    try {
      const achados: { dir: string; n: string; t: number }[] = [];
      for (const dir of pastas) {
        const nomes = await readdir(dir).catch(() => [] as string[]);
        for (const n of nomes.filter(n => /^insa-migracao-[\w-]+\.json$/i.test(n))) achados.push({ dir, n, t: (await stat(join(dir, n))).mtimeMs });
      }
      if (!achados.length) return null;
      const { dir, n: maisNovo } = achados.sort((a, b) => b.t - a.t)[0];
      const txt = await readFile(join(dir, maisNovo), 'utf8');
      if (txt.length > 2_000_000) return null;
      return { nome: maisNovo, conteudo: JSON.parse(txt) };
    } catch { return null; }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 880, minWidth: 380, minHeight: 600,
    backgroundColor: '#071016', title: 'INSA Command', autoHideMenuBar: true, show: false,
    icon: join(publicDir(), 'icons', 'icon-512.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false,
      devTools: !app.isPackaged,
    },
  });
  win.once('ready-to-show', () => win?.show());
  // Se a janela travar ou o processo de desenho cair, recarrega sozinho (os dados ficam no banco local)
  let travas = 0;
  win.webContents.on('render-process-gone', (_e, d) => { if (d.reason !== 'clean-exit' && travas++ < 5) setTimeout(() => win?.webContents.reload(), 500); });
  let semResposta = false;
  win.webContents.on('unresponsive', () => { semResposta = true; setTimeout(() => { if (semResposta && win && !win.isDestroyed() && travas++ < 5) win.webContents.forcefullyCrashRenderer(); }, 8000); });
  win.webContents.on('responsive', () => { semResposta = false; });
  win.on('show', () => win?.webContents.send('insa:visivel', true));
  win.on('hide', () => win?.webContents.send('insa:visivel', false));
  win.on('minimize', () => win?.webContents.send('insa:visivel', false));
  win.on('restore', () => win?.webContents.send('insa:visivel', true));
  // Nunca navegar para fora do app; links externos abrem no navegador padrão
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN)) { e.preventDefault(); if (url.startsWith('https://')) shell.openExternal(url); } });
  win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.session.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === 'notifications' || perm === 'clipboard-sanitized-write'));
  win.loadURL(`${ORIGIN}/#/cockpit`);
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await mkdir(dataDir(), { recursive: true });
  db = new LocalD1(join(dataDir(), 'insa.sqlite'));
  db.migrate([migration0001, migration0002, migration0003]);
  loadSecrets();
  const lock = buildEnv();
  wireIpc(lock);
  wireUpdater();

  protocol.handle(SCHEME, async (req) => {
    try { return await worker.fetch(req, env); }
    catch (e) { console.error(e); return new Response('Erro interno', { status: 500 }); }
  });

  createWindow();

  // Cotações em segundo plano: mesma regra do servidor (5 min no pregão, 1x/hora fora)
  const tick = () => worker.scheduled({ scheduledTime: Date.now() } as any, env).catch(() => null);
  setTimeout(async () => {
    const t = await db.prepare('SELECT ticker FROM assets WHERE ativo = 1').all<{ ticker: string }>();
    if (t.results.length) { await refreshQuotes(db as any, t.results.map(r => r.ticker), secrets.BRAPI_TOKEN).catch(() => null); }
  }, 4000);
  setInterval(tick, 5 * 60_000);

  // Verifica atualizações 10 s após abrir e a cada 6 horas
  setTimeout(() => checkUpdates(), 10_000);
  setInterval(() => checkUpdates(), 6 * 3600_000);
});
