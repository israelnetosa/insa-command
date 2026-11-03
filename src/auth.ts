// Autenticação de dono único com passkey (WebAuthn).
// Sem senha, sem OAuth de terceiros. O primeiro registro exige o SETUP_TOKEN (segredo do Worker);
// novos dispositivos só podem ser adicionados por quem já está logado.

import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SETUP_TOKEN?: string;
  BRAPI_TOKEN?: string;
  RP_ID?: string;          // ex.: insa.seudominio.com (padrão: host da requisição)
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  /** Presente só no app de Windows: troca passkey + cookie por bloqueio local com PIN. */
  DESKTOP?: {
    session(): Promise<Record<string, unknown>>;
    handle(req: Request, path: string): Promise<Response | null>;
    isUnlocked(): boolean;
    backup?(motivo: string): Promise<string>;
  };
}

const SESSION_COOKIE = '__Host-insa_s';
const CHALLENGE_COOKIE = '__Host-insa_c';
const SESSION_DAYS = 30;
const DEVICE_DAYS = 365;

export const enc = new TextEncoder();
export async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return isoBase64URL.fromBuffer(new Uint8Array(d));
}
function randomToken(bytes = 32) {
  return isoBase64URL.fromBuffer(crypto.getRandomValues(new Uint8Array(bytes)));
}
export function timingSafeEqual(a: string, b: string) {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function getCookie(req: Request, name: string) {
  const h = req.headers.get('Cookie') ?? '';
  for (const part of h.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}
const cookie = (name: string, value: string, maxAge: number) =>
  `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

function rp(req: Request, env: Env) {
  const url = new URL(req.url);
  return { rpID: env.RP_ID || url.hostname, origin: url.origin };
}

async function audit(env: Env, acao: string, dados?: unknown) {
  await env.DB.prepare('INSERT INTO audit (acao, dados) VALUES (?, ?)').bind(acao, dados ? JSON.stringify(dados) : null).run();
}

export async function isConfigured(env: Env) {
  const r = await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM credentials) + (SELECT COUNT(*) FROM settings WHERE chave = 'dono_configurado') AS n`).first<{ n: number }>();
  return (r?.n ?? 0) > 0;
}

/** Token da sessão: cookie (navegador/celular) ou cabeçalho Authorization: Bearer (app de Windows falando com a nuvem). */
function tokenDaRequisicao(req: Request) {
  const a = req.headers.get('Authorization') ?? '';
  if (a.startsWith('Bearer ')) return a.slice(7).trim() || null;
  return getCookie(req, SESSION_COOKIE);
}

export async function currentSession(req: Request, env: Env) {
  const tok = tokenDaRequisicao(req);
  if (!tok) return null;
  const row = await env.DB.prepare('SELECT token_hash, expires_at, id, ultimo_uso FROM sessions WHERE token_hash = ?')
    .bind(await sha256(tok)).first<{ token_hash: string; expires_at: number; id: string | null; ultimo_uso: number | null }>();
  if (!row || row.expires_at < Date.now()) return null;
  // registra o uso no máximo a cada 10 min (evita escrita a cada requisição)
  if (!row.ultimo_uso || Date.now() - row.ultimo_uso > 600_000)
    await env.DB.prepare('UPDATE sessions SET ultimo_uso = ? WHERE token_hash = ?').bind(Date.now(), row.token_hash).run();
  return row;
}

async function saveChallenge(env: Env, challenge: string, kind: 'register' | 'login') {
  const id = randomToken(16);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM challenges WHERE expires_at < ?').bind(Date.now()),
    env.DB.prepare('INSERT INTO challenges (id, challenge, kind, expires_at) VALUES (?, ?, ?, ?)')
      .bind(id, challenge, kind, Date.now() + 5 * 60_000),
  ]);
  return cookie(CHALLENGE_COOKIE, id, 300);
}

/** Consome o desafio (uso único). */
async function takeChallenge(req: Request, env: Env, kind: 'register' | 'login') {
  const id = getCookie(req, CHALLENGE_COOKIE);
  if (!id) return null;
  const row = await env.DB.prepare('DELETE FROM challenges WHERE id = ? AND kind = ? RETURNING challenge, expires_at')
    .bind(id, kind).first<{ challenge: string; expires_at: number }>();
  if (!row || row.expires_at < Date.now()) return null;
  return row.challenge;
}

async function criarSessao(req: Request, env: Env, dias: number, rotulo?: string) {
  const tok = randomToken();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('INSERT INTO sessions (token_hash, created_at, expires_at, user_agent, id, rotulo, ultimo_uso) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(await sha256(tok), now, now + dias * 86400_000, (req.headers.get('User-Agent') ?? '').slice(0, 200), randomToken(9), (rotulo ?? '').slice(0, 60) || null, now),
  ]);
  return { tok, cookie: cookie(SESSION_COOKIE, tok, dias * 86400) };
}
async function newSession(req: Request, env: Env) { return (await criarSessao(req, env, SESSION_DAYS)).cookie; }

async function tentativasRecentes(env: Env, acao: string) {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit WHERE acao = ? AND em > datetime('now','-1 hour')`).bind(acao).first<{ n: number }>();
  return r?.n ?? 0;
}
const rotuloDe = (b: any, req: Request) => String(b.rotulo ?? '').trim().slice(0, 60) || (/android/i.test(req.headers.get('User-Agent') ?? '') ? 'Celular Android' : 'Aparelho');

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });

async function setupBlocked(env: Env) {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit WHERE acao = 'setup_token_invalido' AND em > datetime('now','-1 hour')`).first<{ n: number }>();
  return (r?.n ?? 0) >= 5;
}

export async function handleAuth(req: Request, env: Env, path: string): Promise<Response | null> {
  const { rpID, origin } = rp(req, env);

  if (path === '/api/auth/register/options' && req.method === 'POST') {
    const body: any = await req.json().catch(() => ({}));
    const configured = await isConfigured(env);
    const session = await currentSession(req, env);
    if (configured && !session) return json({ erro: 'Já existe um dono. Entre com a passkey para adicionar outro dispositivo.' }, 403);
    if (!configured) {
      if (!env.SETUP_TOKEN) return json({ erro: 'SETUP_TOKEN não configurado no servidor.' }, 500);
      if (await setupBlocked(env)) return json({ erro: 'Muitas tentativas. Aguarde 1 hora.' }, 429);
      if (!timingSafeEqual(String(body.setupToken ?? ''), env.SETUP_TOKEN)) {
        await audit(env, 'setup_token_invalido');
        return json({ erro: 'Código de configuração inválido.' }, 401);
      }
    }
    const existing = await env.DB.prepare('SELECT id, transports FROM credentials').all<{ id: string; transports: string | null }>();
    const options = await generateRegistrationOptions({
      rpName: 'INSA Command', rpID, userName: 'comandante', userDisplayName: 'Comandante',
      userID: new Uint8Array(enc.encode('insa-owner')),
      attestationType: 'none',
      excludeCredentials: existing.results.map(c => ({ id: c.id, transports: c.transports ? JSON.parse(c.transports) : undefined })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    return json(options, 200, { 'Set-Cookie': await saveChallenge(env, options.challenge, 'register') });
  }

  if (path === '/api/auth/register/verify' && req.method === 'POST') {
    const body: any = await req.json();
    const configured = await isConfigured(env);
    if (configured && !(await currentSession(req, env))) return json({ erro: 'Não autorizado.' }, 403);
    const expectedChallenge = await takeChallenge(req, env, 'register');
    if (!expectedChallenge) return json({ erro: 'Desafio expirado. Tente de novo.' }, 400);
    let v;
    try {
      v = await verifyRegistrationResponse({ response: body.credential, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
    } catch (e) { return json({ erro: 'Falha na verificação da passkey.', detalhe: String(e) }, 400); }
    if (!v.verified || !v.registrationInfo) return json({ erro: 'Passkey não verificada.' }, 400);
    const c = v.registrationInfo.credential;
    await env.DB.prepare('INSERT INTO credentials (id, public_key, counter, transports, device_label) VALUES (?, ?, ?, ?, ?)')
      .bind(c.id, isoBase64URL.fromBuffer(c.publicKey), c.counter, JSON.stringify(c.transports ?? []), String(body.deviceLabel ?? 'Dispositivo').slice(0, 60)).run();
    await audit(env, 'passkey_registrada', { device: body.deviceLabel });
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.append('Set-Cookie', cookie(CHALLENGE_COOKIE, '', 0));
    headers.append('Set-Cookie', await newSession(req, env));
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  if (path === '/api/auth/login/options' && req.method === 'POST') {
    const creds = await env.DB.prepare('SELECT id, transports FROM credentials').all<{ id: string; transports: string | null }>();
    if (!creds.results.length) return json({ erro: 'Nenhuma passkey registrada.' }, 409);
    const options = await generateAuthenticationOptions({
      rpID, userVerification: 'required',
      allowCredentials: creds.results.map(c => ({ id: c.id, transports: c.transports ? JSON.parse(c.transports) : undefined })),
    });
    return json(options, 200, { 'Set-Cookie': await saveChallenge(env, options.challenge, 'login') });
  }

  if (path === '/api/auth/login/verify' && req.method === 'POST') {
    const body: any = await req.json();
    const expectedChallenge = await takeChallenge(req, env, 'login');
    if (!expectedChallenge) return json({ erro: 'Desafio expirado. Tente de novo.' }, 400);
    const row = await env.DB.prepare('SELECT id, public_key, counter, transports FROM credentials WHERE id = ?')
      .bind(body.credential?.id ?? '').first<{ id: string; public_key: string; counter: number; transports: string | null }>();
    if (!row) { await audit(env, 'login_credencial_desconhecida'); return json({ erro: 'Passkey desconhecida.' }, 401); }
    let v;
    try {
      v = await verifyAuthenticationResponse({
        response: body.credential, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
        credential: { id: row.id, publicKey: isoBase64URL.toBuffer(row.public_key), counter: row.counter, transports: row.transports ? JSON.parse(row.transports) : undefined },
      });
    } catch (e) { await audit(env, 'login_falhou', { e: String(e) }); return json({ erro: 'Falha na verificação.' }, 401); }
    if (!v.verified) return json({ erro: 'Não verificado.' }, 401);
    await env.DB.prepare(`UPDATE credentials SET counter = ?, last_used_at = datetime('now') WHERE id = ?`)
      .bind(v.authenticationInfo.newCounter, row.id).run();
    await audit(env, 'login_ok');
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.append('Set-Cookie', cookie(CHALLENGE_COOKIE, '', 0));
    headers.append('Set-Cookie', await newSession(req, env));
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  // ───────── aparelhos pareados ─────────
  // 1º aparelho: código de configuração (segredo SETUP_TOKEN), só enquanto não existir dono.
  if (path === '/api/auth/dispositivo/configurar' && req.method === 'POST') {
    const b: any = await req.json().catch(() => ({}));
    if (await isConfigured(env)) return json({ erro: 'A nuvem já tem dono. Use um código de pareamento gerado num aparelho conectado.' }, 409);
    if (!env.SETUP_TOKEN) return json({ erro: 'SETUP_TOKEN não configurado no servidor.' }, 500);
    if (await tentativasRecentes(env, 'setup_token_invalido') >= 5) return json({ erro: 'Muitas tentativas. Aguarde 1 hora.' }, 429);
    if (!timingSafeEqual(String(b.setupToken ?? ''), env.SETUP_TOKEN)) { await audit(env, 'setup_token_invalido'); return json({ erro: 'Código de configuração inválido.' }, 401); }
    const s = await criarSessao(req, env, DEVICE_DAYS, rotuloDe(b, req));
    await env.DB.prepare(`INSERT OR REPLACE INTO settings (chave, valor) VALUES ('dono_configurado', ?)`).bind(JSON.stringify(new Date().toISOString())).run();
    await audit(env, 'dispositivo_configurado', { rotulo: rotuloDe(b, req) });
    return json({ ok: true, ...(new URL(req.url).searchParams.get('token') === '1' ? { token: s.tok } : {}) }, 200, { 'Set-Cookie': s.cookie });
  }

  // Aparelho conectado gera um código de 8 dígitos, válido por 10 minutos e de uso único.
  if (path === '/api/auth/dispositivo/codigo' && req.method === 'POST') {
    if (!(await currentSession(req, env))) return json({ erro: 'Não autorizado.' }, 401);
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 100_000_000;
    const codigo = String(n).padStart(8, '0');
    const expira = Date.now() + 10 * 60_000;
    await env.DB.batch([
      env.DB.prepare('DELETE FROM pareamentos WHERE expira < ?').bind(Date.now()),
      env.DB.prepare('INSERT OR REPLACE INTO pareamentos (codigo_hash, expira) VALUES (?, ?)').bind(await sha256(codigo), expira),
    ]);
    await audit(env, 'codigo_pareamento_gerado');
    return json({ codigo, expira });
  }

  // Aparelho novo entra com o código. Limite global de 10 erros por hora (8 dígitos = 100 milhões de combinações).
  if (path === '/api/auth/dispositivo/parear' && req.method === 'POST') {
    const b: any = await req.json().catch(() => ({}));
    if (await tentativasRecentes(env, 'pareamento_invalido') >= 10) return json({ erro: 'Muitas tentativas. Aguarde 1 hora.' }, 429);
    const codigo = String(b.codigo ?? '').replace(/\D/g, '');
    const row = codigo.length === 8
      ? await env.DB.prepare('DELETE FROM pareamentos WHERE codigo_hash = ? RETURNING expira').bind(await sha256(codigo)).first<{ expira: number }>()
      : null;
    if (!row || row.expira < Date.now()) { await audit(env, 'pareamento_invalido'); return json({ erro: 'Código inválido ou expirado. Gere um novo no aparelho conectado.' }, 401); }
    const s = await criarSessao(req, env, DEVICE_DAYS, rotuloDe(b, req));
    await audit(env, 'dispositivo_pareado', { rotulo: rotuloDe(b, req) });
    return json({ ok: true, ...(new URL(req.url).searchParams.get('token') === '1' ? { token: s.tok } : {}) }, 200, { 'Set-Cookie': s.cookie });
  }

  if (path === '/api/auth/dispositivos' && req.method === 'GET') {
    const atual = await currentSession(req, env);
    if (!atual) return json({ erro: 'Não autorizado.' }, 401);
    const r = await env.DB.prepare('SELECT id, rotulo, user_agent, created_at, ultimo_uso, expires_at FROM sessions WHERE expires_at > ? ORDER BY ultimo_uso DESC').bind(Date.now()).all<any>();
    return json(r.results.map(x => ({ ...x, atual: x.id === atual.id })));
  }

  const rev = path.match(/^\/api\/auth\/dispositivos\/([\w-]{6,20})\/revogar$/);
  if (rev && req.method === 'POST') {
    if (!(await currentSession(req, env))) return json({ erro: 'Não autorizado.' }, 401);
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(rev[1]).run();
    await audit(env, 'dispositivo_revogado', { id: rev[1] });
    return json({ ok: true });
  }

  if (path === '/api/auth/logout' && req.method === 'POST') {
    const tok = getCookie(req, SESSION_COOKIE);
    if (tok) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(tok)).run();
    return json({ ok: true }, 200, { 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) });
  }

  if (path === '/api/auth/logout-all' && req.method === 'POST') {
    if (!(await currentSession(req, env))) return json({ erro: 'Não autorizado.' }, 401);
    await env.DB.prepare('DELETE FROM sessions').run();
    await audit(env, 'logout_todos');
    return json({ ok: true }, 200, { 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) });
  }

  return null;
}

export { json };
