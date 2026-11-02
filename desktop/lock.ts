// Bloqueio local por PIN (app de Windows).
// O PIN nunca é guardado: só o hash PBKDF2 com sal. Tentativas erradas aumentam a espera.
// O app se bloqueia sozinho após 30 minutos sem uso.

import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import type { LocalD1 } from './d1';

const ITER = 310_000;
const IDLE_MS = 30 * 60_000;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

export function createLock(db: LocalD1) {
  let unlockedAt = 0;
  let lastUse = 0;
  let fails = 0;
  let blockedUntil = 0;

  const getPin = async () => {
    const r = await db.prepare(`SELECT valor FROM settings WHERE chave = 'pin'`).first<{ valor: string }>();
    return r ? JSON.parse(r.valor) as { salt: string; hash: string; iter: number } : null;
  };
  const hash = (pin: string, salt: string, iter = ITER) => pbkdf2Sync(pin, Buffer.from(salt, 'base64'), iter, 32, 'sha256').toString('base64');
  const validPin = (p: unknown) => typeof p === 'string' && /^\d{6,12}$/.test(p);
  const audit = (acao: string) => db.prepare('INSERT INTO audit (acao) VALUES (?)').bind(acao).run();
  const savePin = async (pin: string) => {
    const salt = randomBytes(16).toString('base64');
    await db.prepare(`INSERT OR REPLACE INTO settings (chave, valor) VALUES ('pin', ?)`).bind(JSON.stringify({ salt, hash: hash(pin, salt), iter: ITER })).run();
  };
  const check = async (pin: string) => {
    const p = await getPin();
    if (!p) return false;
    const a = Buffer.from(hash(pin, p.salt, p.iter), 'base64'), b = Buffer.from(p.hash, 'base64');
    return a.length === b.length && timingSafeEqual(a, b);
  };

  return {
    isUnlocked() {
      const ok = unlockedAt > 0 && Date.now() - lastUse < IDLE_MS;
      if (ok) lastUse = Date.now(); else unlockedAt = 0;
      return ok;
    },
    lock() { unlockedAt = 0; },
    async session() {
      const ok = unlockedAt > 0 && Date.now() - lastUse < IDLE_MS;
      return { autenticado: ok, configurado: !!(await getPin()), desktop: true };
    },
    async handle(req: Request, path: string): Promise<Response | null> {
      if (!path.startsWith('/api/auth/')) return null;
      const body: any = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

      if (path === '/api/auth/pin/setup' && req.method === 'POST') {
        if (await getPin()) return json({ erro: 'O PIN já existe.' }, 409);
        if (!validPin(body.pin)) return json({ erro: 'O PIN deve ter de 6 a 12 dígitos.' }, 400);
        await savePin(body.pin); await audit('pin_criado');
        unlockedAt = lastUse = Date.now();
        return json({ ok: true });
      }
      if (path === '/api/auth/pin/unlock' && req.method === 'POST') {
        if (Date.now() < blockedUntil) return json({ erro: `Aguarde ${Math.ceil((blockedUntil - Date.now()) / 1000)} s.` }, 429);
        if (validPin(body.pin) && await check(body.pin)) {
          fails = 0; unlockedAt = lastUse = Date.now(); await audit('desbloqueio_ok');
          return json({ ok: true });
        }
        fails++; await audit('pin_incorreto');
        if (fails >= 3) blockedUntil = Date.now() + Math.min(2 ** (fails - 3) * 30_000, 60 * 60_000);
        return json({ erro: 'PIN incorreto.' }, 401);
      }
      if (path === '/api/auth/pin/change' && req.method === 'POST') {
        if (!this.isUnlocked()) return json({ erro: 'Desbloqueie primeiro.' }, 401);
        if (!(validPin(body.atual) && await check(body.atual))) return json({ erro: 'PIN atual incorreto.' }, 401);
        if (!validPin(body.novo)) return json({ erro: 'O novo PIN deve ter de 6 a 12 dígitos.' }, 400);
        await savePin(body.novo); await audit('pin_alterado');
        return json({ ok: true });
      }
      if ((path === '/api/auth/logout' || path === '/api/auth/logout-all') && req.method === 'POST') {
        unlockedAt = 0; return json({ ok: true });
      }
      return json({ erro: 'Indisponível no app de Windows.' }, 404);
    },
  };
}
