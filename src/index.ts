// INSA Command · Worker principal
// Regra de ouro: toda rota /api, exceto login, exige sessão do dono. Nada é público.

import { handleAuth, currentSession, isConfigured, json, type Env } from './auth';
import { buildState, replay, LedgerError, type Movement } from './engine';
import { refreshQuotes, liveRefresh, emPregao, pregao, INDICES } from './market';
import { seedMovements, seedAssets, seedSettings, validarMigracao } from './seed';

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "font-src 'self'",
    "img-src 'self' data:", "connect-src 'self'", "media-src 'self' blob:", "worker-src 'self'",
    "manifest-src 'self'", "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'", "object-src 'none'",
  ].join('; '),
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), geolocation=(), payment=(), usb=(), microphone=(self)',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
};

function withHeaders(res: Response, extra: Record<string, string> = {}) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries({ ...SECURITY_HEADERS, ...extra })) r.headers.set(k, v);
  return r;
}

const MOV_TIPOS = new Set(['compra', 'venda', 'provento', 'aporte', 'retirada', 'desdobramento', 'grupamento', 'taxa', 'ajuste_caixa']);

function normalizeMov(b: any): Movement {
  const tipo = String(b.tipo ?? '');
  if (!MOV_TIPOS.has(tipo)) throw new LedgerError('Tipo de lançamento inválido.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.data ?? ''))) throw new LedgerError('Data deve estar no formato AAAA-MM-DD.');
  const num = (x: any) => (x === '' || x == null ? null : Number(x));
  const t = b.ticker ? String(b.ticker).trim().toUpperCase() : null;
  if (t && !/^[A-Z0-9]{4,7}$/.test(t)) throw new LedgerError('Ticker inválido.');
  const m: Movement = {
    data: b.data, tipo: tipo as Movement['tipo'], ticker: t,
    qtd: num(b.qtd), preco: num(b.preco), valor: num(b.valor), custos: num(b.custos) ?? 0,
    subtipo: b.subtipo ? String(b.subtipo).slice(0, 20) : null,
    nota: b.nota ? String(b.nota).slice(0, 280) : null,
  };
  for (const k of ['qtd', 'preco', 'valor', 'custos'] as const) {
    const v = m[k];
    if (v != null && (!Number.isFinite(v) || Math.abs(v) > 1e9)) throw new LedgerError(`Campo ${k} inválido.`);
  }
  return m;
}

async function loadAll(env: Env) {
  const [movs, assets, quotes, settings] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM movements ORDER BY data, id'),
    env.DB.prepare('SELECT * FROM assets'),
    env.DB.prepare('SELECT * FROM quotes'),
    env.DB.prepare('SELECT chave, valor FROM settings'),
  ]);
  const s: Record<string, any> = {};
  for (const r of settings.results as any[]) s[r.chave] = JSON.parse(r.valor);
  return { movements: movs.results as any[], assets: assets.results as any[], quotes: quotes.results as any[], settings: s };
}

async function state(env: Env) {
  const d = await loadAll(env);
  const st = buildState({
    movements: d.movements, assets: d.assets, quotes: d.quotes,
    fases: d.settings.fases ?? [], missao: d.settings.missao ?? { meta_mensal: 20000, dy_missao: 7, marcos: [25, 100], teto_concentracao: 25 },
    aporte_mensal: d.settings.aporte_mensal ?? 0, calendario_estimado: d.settings.calendario_estimado,
  });
  return { ...st, regras: d.settings.regras ?? [], lentes: d.settings.lentes ?? [], fases: d.settings.fases ?? [], aporte_mensal: d.settings.aporte_mensal ?? 0, estrategia: d.settings.estrategia ?? null, vazio: d.movements.length === 0, em_pregao: emPregao() };
}

async function audit(env: Env, acao: string, dados?: unknown) {
  await env.DB.prepare('INSERT INTO audit (acao, dados) VALUES (?, ?)').bind(acao, dados ? JSON.stringify(dados) : null).run();
}

async function api(req: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname;

  const desk = env.DESKTOP;

  // CSRF: mutações só da própria origem (no desktop, só o próprio app alcança o protocolo interno)
  if (!desk && req.method !== 'GET' && req.method !== 'HEAD') {
    const o = req.headers.get('Origin');
    if (o && o !== url.origin) return json({ erro: 'Origem não permitida.' }, 403);
  }

  if (path === '/api/session') {
    if (desk) return json(await desk.session());
    return json({ autenticado: !!(await currentSession(req, env)), configurado: await isConfigured(env) });
  }
  const auth = desk ? await desk.handle(req, path) : await handleAuth(req, env, path);
  if (auth) return auth;

  // ───────── daqui para baixo, só o dono ─────────
  if (desk ? !desk.isUnlocked() : !(await currentSession(req, env))) return json({ erro: 'Sessão do dono necessária.' }, 401);

  if (path === '/api/state' && req.method === 'GET') {
    try { return json(await state(env)); }
    catch (e) { return json({ erro: e instanceof LedgerError ? e.message : 'Erro ao montar o estado.' }, 500); }
  }

  if (path === '/api/movements' && req.method === 'GET') {
    const lim = Math.min(Number(url.searchParams.get('limit') ?? 200), 1000);
    const r = await env.DB.prepare('SELECT * FROM movements ORDER BY data DESC, id DESC LIMIT ?').bind(lim).all();
    return json(r.results);
  }

  // Prévia: aplica o lançamento num razão simulado e mostra o efeito ANTES de gravar
  if ((path === '/api/movements/preview' || path === '/api/movements') && req.method === 'POST') {
    let m: Movement;
    const body: any = await req.json().catch(() => ({}));
    try { m = normalizeMov(body); } catch (e) { return json({ erro: (e as Error).message }, 400); }
    const d = await loadAll(env);
    let antes, depois;
    try {
      antes = replay(d.movements);
      depois = replay([...d.movements, m]);
    } catch (e) { return json({ erro: (e as Error).message }, 400); }
    const t = m.ticker ?? '';
    const lotA = antes.lots.get(t), lotD = depois.lots.get(t);
    const efeito = {
      caixa: { antes: antes.caixa, depois: depois.caixa },
      posicao: t ? {
        ticker: t,
        qtd: { antes: lotA?.qtd ?? 0, depois: lotD?.qtd ?? 0 },
        preco_medio: { antes: +(lotA?.pm ?? 0).toFixed(2), depois: +(lotD?.pm ?? 0).toFixed(2) },
        realizado: +((lotD?.realizado ?? 0) - (lotA?.realizado ?? 0)).toFixed(2),
      } : null,
      avisos: [] as string[],
    };
    if (depois.caixa < 0) efeito.avisos.push('O caixa ficará negativo. Falta registrar um aporte?');
    if (t && !d.assets.some((a: any) => a.ticker === t)) efeito.avisos.push(`${t} é um ativo novo: será cadastrado e cotado automaticamente.`);

    if (path === '/api/movements/preview') return json({ lancamento: m, efeito });

    if (body.confirmado !== true) return json({ erro: 'Confirmação explícita necessária.' }, 400);
    const ins = await env.DB.prepare(
      `INSERT INTO movements (data, tipo, ticker, qtd, preco, valor, custos, subtipo, nota, origem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual') RETURNING id`,
    ).bind(m.data, m.tipo, m.ticker, m.qtd, m.preco, m.valor, m.custos, m.subtipo, m.nota).first<{ id: number }>();
    if (t) {
      await env.DB.prepare('INSERT OR IGNORE INTO assets (ticker, nome) VALUES (?, ?)').bind(t, t).run();
      await refreshQuotes(env.DB, [t], env.BRAPI_TOKEN).catch(() => null);
    }
    await audit(env, 'lancamento_gravado', { id: ins?.id, ...m });
    return json({ ok: true, id: ins?.id, efeito });
  }

  const anular = path.match(/^\/api\/movements\/(\d+)\/anular$/);
  if (anular && req.method === 'POST') {
    const id = Number(anular[1]);
    const d = await loadAll(env);
    try { replay(d.movements.map((x: any) => (x.id === id ? { ...x, anulado: 1 } : x))); }
    catch (e) { return json({ erro: 'Anular quebraria o razão: ' + (e as Error).message }, 400); }
    await env.DB.prepare('UPDATE movements SET anulado = 1 WHERE id = ?').bind(id).run();
    await audit(env, 'lancamento_anulado', { id });
    return json({ ok: true });
  }

  // Radar ao vivo: atualiza o que estiver velho (60 s no pregão; 10 min fora) e devolve preço, variação e mini-gráfico
  if (path === '/api/market/live' && req.method === 'GET') {
    const assets = await env.DB.prepare('SELECT ticker, nome FROM assets WHERE ativo = 1').all<{ ticker: string; nome: string }>();
    const indices = Object.keys(INDICES);
    const aberto = emPregao();
    const forcar = url.searchParams.get('forcar') === '1';
    await liveRefresh(env.DB, [...assets.results.map(a => a.ticker), ...indices], forcar ? 15_000 : aberto ? 60_000 : 10 * 60_000, env.BRAPI_TOKEN).catch(() => null);
    const st = await state(env);
    const q = await env.DB.prepare('SELECT ticker, preco, fechamento_ant, fonte, cotado_em, buscado_em, serie FROM quotes').all<any>();
    const Q = new Map(q.results.map((r: any) => [r.ticker, r]));
    const agora = Date.now();
    const linha = (t: string, nome: string) => {
      const r: any = Q.get(t);
      if (!r) return { ticker: t, nome, preco: null };
      return {
        ticker: t, nome, preco: r.preco, fechamento_ant: r.fechamento_ant,
        var: r.fechamento_ant ? Math.round((r.preco / r.fechamento_ant - 1) * 10000) / 100 : null,
        atraso_s: Math.max(0, Math.round((agora - r.cotado_em) / 1000)), consultado_ha_s: Math.round((agora - r.buscado_em) / 1000),
        fonte: r.fonte, serie: r.serie ? JSON.parse(r.serie) : null,
      };
    };
    return json({
      agora, pregao: pregao(), em_pregao: aberto,
      indices: indices.map(t => ({ ...linha(t, INDICES[t].nome), moeda: INDICES[t].moeda ?? 'BRL' })),
      ativos: st.posicoes.map(p => ({ ...linha(p.ticker, p.nome), qtd: p.qtd, valor: p.valor, peso: p.peso, zona: p.zona, var_dia_valor: p.var_dia_valor })),
      totais: { patrimonio: st.totais.patrimonio, investido: st.totais.investido, resultado_dia: st.totais.resultado_dia,
        resultado_dia_pct: st.totais.investido ? Math.round(st.totais.resultado_dia / (st.totais.investido - st.totais.resultado_dia) * 10000) / 100 : 0 },
      aviso: 'Dados gratuitos: ações e FIIs da B3 com até ~15 min de atraso; dólar e bitcoin quase em tempo real. Não é preço de execução.',
    });
  }

  if (path === '/api/historico-legado' && req.method === 'GET') {
    const r = await env.DB.prepare(`SELECT valor FROM settings WHERE chave = 'historico_legado'`).first<{ valor: string }>();
    return json(r ? JSON.parse(r.valor) : null);
  }

  if (path === '/api/market/refresh' && req.method === 'POST') {
    const t = await env.DB.prepare('SELECT ticker FROM assets WHERE ativo = 1').all<{ ticker: string }>();
    return json(await refreshQuotes(env.DB, t.results.map(r => r.ticker), env.BRAPI_TOKEN));
  }

  // Importação de migração (arquivo .json do INSA Wallet). Nada vem embutido no app.
  // Com o razão vazio, importa direto. Com lançamentos, só com "substituir": anula tudo (sem apagar) e faz backup antes.
  if (path === '/api/admin/import-migration' && req.method === 'POST') {
    const body: any = await req.json().catch(() => ({}));
    let mig;
    try { mig = validarMigracao(body.migracao, body.posicoes, body.caixa, body.data_base); }
    catch (e) { return json({ erro: (e as Error).message }, 400); }
    if (body.confirmado !== true) return json({ erro: 'Confirmação explícita necessária.' }, 400);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM movements WHERE anulado = 0').first<{ n: number }>();
    const existentes = n?.n ?? 0;
    if (existentes > 0 && body.substituir !== true) return json({ erro: 'O razão já tem lançamentos. Marque "substituir" para anular o razão atual e importar.', existentes }, 409);
    let backup: string | null = null;
    if (existentes > 0 && env.DESKTOP?.backup) backup = await env.DESKTOP.backup('antes-da-migracao');
    const movs = seedMovements(mig);
    try { replay(movs as Movement[]); } catch (e) { return json({ erro: 'Migração inválida: ' + (e as Error).message }, 400); }
    const assets = seedAssets(mig);
    const settings = seedSettings(mig);
    await env.DB.batch([
      env.DB.prepare(`UPDATE movements SET anulado = 1, nota = COALESCE(nota || ' · ', '') || 'anulado pela migração de ' || ? WHERE anulado = 0`).bind(mig.data_base),
      ...assets.map((a: any) => env.DB.prepare(
        `INSERT OR REPLACE INTO assets (ticker, nome, tipo, setor, camada, dy_ref, div_mes_cota, mensal, teto_bazin, hi52, lo52, ativo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      ).bind(a.ticker, a.nome, a.tipo, a.setor, a.camada, a.dy_ref, a.div_mes_cota, a.mensal, a.teto_bazin, a.hi52, a.lo52)),
      ...movs.map((m: any) => env.DB.prepare(
        `INSERT INTO movements (data, tipo, ticker, qtd, preco, valor, estimado, nota, origem) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(m.data, m.tipo, m.ticker ?? null, m.qtd ?? null, m.preco ?? null, m.valor ?? null, m.estimado ?? 0, m.nota, m.origem)),
      ...Object.entries(settings).map(([k, v]) => env.DB.prepare('INSERT OR REPLACE INTO settings (chave, valor) VALUES (?, ?)').bind(k, JSON.stringify(v))),
    ]);
    await audit(env, 'migracao_importada', { data_base: mig.data_base, posicoes: mig.posicoes.length, caixa: mig.caixa, anulados: existentes, backup });
    await refreshQuotes(env.DB, assets.map((a: any) => a.ticker), env.BRAPI_TOKEN).catch(() => null);
    return json({ ok: true, lancamentos: movs.length, ativos: assets.length, anulados: existentes, backup });
  }

  if (path === '/api/export' && req.method === 'GET') {
    const d = await loadAll(env);
    await audit(env, 'exportacao');
    return json({ exportado_em: new Date().toISOString(), ...d }, 200, {
      'Content-Disposition': `attachment; filename="insa-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    });
  }

  // Diagnóstico das chaves de IA: testa sem nunca devolver a chave
  if (path === '/api/ia/status' && req.method === 'GET') {
    const probe = async (url: string, headers: Record<string, string>) => {
      const t0 = Date.now();
      try {
        const r = await fetch(url, { headers });
        return r.ok ? { ok: true, ms: Date.now() - t0 } : { ok: false, erro: `HTTP ${r.status}` };
      } catch (e) { return { ok: false, erro: 'sem conexão' }; }
    };
    const out: Record<string, unknown> = {};
    out.gemini = env.GEMINI_API_KEY
      ? await probe('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { 'x-goog-api-key': env.GEMINI_API_KEY })
      : { ok: false, erro: 'GEMINI_API_KEY não configurada' };
    out.claude = env.ANTHROPIC_API_KEY
      ? await probe('https://api.anthropic.com/v1/models?limit=1', { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' })
      : { ok: false, erro: 'ANTHROPIC_API_KEY não configurada' };
    out.brapi = env.BRAPI_TOKEN ? { ok: true } : { ok: false, erro: 'BRAPI_TOKEN não configurado (usando só Yahoo)' };
    return json(out);
  }

  if (path === '/api/audit' && req.method === 'GET') {
    const r = await env.DB.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 100').all();
    return json(r.results);
  }

  return json({ erro: 'Rota não encontrada.' }, 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try { return withHeaders(await api(req, env, url), { 'Cache-Control': 'no-store' }); }
      catch (e) { console.error(e); return withHeaders(json({ erro: 'Erro interno.' }, 500), { 'Cache-Control': 'no-store' }); }
    }
    const res = await env.ASSETS.fetch(req);
    const extra: Record<string, string> = {};
    // Fontes e ícones podem ficar em cache; HTML, JS e CSS sempre revalidam (atualizações chegam na hora)
    extra['Cache-Control'] = /\/(fonts|icons)\//.test(url.pathname) ? 'public, max-age=604800' : 'no-cache';
    return withHeaders(res, extra);
  },

  // Cron: cotações a cada 5 min no pregão; fora dele, uma consulta por hora basta
  async scheduled(event: ScheduledController, env: Env) {
    const agora = new Date(event.scheduledTime);
    if (!emPregao(agora) && agora.getUTCMinutes() >= 5) return;
    const t = await env.DB.prepare('SELECT ticker FROM assets WHERE ativo = 1').all<{ ticker: string }>();
    await refreshQuotes(env.DB, [...t.results.map(r => r.ticker), ...Object.keys(INDICES)], env.BRAPI_TOKEN);
  },
} satisfies ExportedHandler<Env>;
