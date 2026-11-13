// INSA Command · Worker principal
// Regra de ouro: toda rota /api, exceto login, exige sessão do dono. Nada é público.

import { handleAuth, currentSession, isConfigured, json, type Env } from './auth';
import { buildState, replay, planoCompras, faseAtual, LedgerError, type Movement } from './engine';
import { conversar, voz, explicarErro, CONFIG_PADRAO, type Toolkit, type IAConfig } from './manuel';
import { responderLocal, normalizar } from './local';
import { VOZES_MASCULINAS } from './fala.ts';
import { refreshQuotes, liveRefresh, emPregao, pregao, INDICES, fetchQuote } from './market';
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


// ───────── M.A.N.U.E.L. ─────────
async function lerConfigIA(env: Env) {
  const r = await env.DB.prepare(`SELECT valor FROM settings WHERE chave = 'ia_config'`).first<{ valor: string }>();
  const c = r ? JSON.parse(r.valor) : {};
  // 1.9: a voz passa a ser a natural masculina do Gemini (estilo J.A.R.V.I.S.); uma vez só, depois vale a escolha do dono
  if (!c.voz_v2) {
    c.voz_v2 = true;
    if (env.GEMINI_API_KEY && c.voz_motor !== 'desligada') c.voz_motor = 'gemini';
    if (!VOZES_MASCULINAS.some(([v]) => v === c.voz_nome)) c.voz_nome = 'Charon';
    if (r) await env.DB.prepare(`UPDATE settings SET valor = ? WHERE chave = 'ia_config'`).bind(JSON.stringify(c)).run();
  }
  return { ...CONFIG_PADRAO, limite_diario: 60, limite_tokens: 150000, voz_motor: env.GEMINI_API_KEY ? 'gemini' : 'windows', voz_nome: 'Charon', fala_auto: false, ...c } as IAConfig & { limite_diario: number; limite_tokens: number; voz_motor: string; voz_nome: string; fala_auto: boolean };
}
const hojeISO = () => new Date().toISOString().slice(0, 10);

/** Prévia do efeito de um lançamento no razão atual (não grava). */
async function previa(env: Env, m: Movement) {
  const d = await loadAll(env);
  const antes = replay(d.movements);
  const depois = replay([...d.movements, m]);
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
  return efeito;
}

/** Grava um lançamento validado no razão. */
async function gravar(env: Env, m: Movement, origem: 'manual' | 'ia_confirmada') {
  const ins = await env.DB.prepare(
    `INSERT INTO movements (data, tipo, ticker, qtd, preco, valor, custos, subtipo, nota, origem)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  ).bind(m.data, m.tipo, m.ticker ?? null, m.qtd ?? null, m.preco ?? null, m.valor ?? null, m.custos ?? 0, m.subtipo ?? null, m.nota ?? null, origem).first<{ id: number }>();
  if (m.ticker) {
    await env.DB.prepare('INSERT OR IGNORE INTO assets (ticker, nome) VALUES (?, ?)').bind(m.ticker, m.ticker).run();
    await refreshQuotes(env.DB, [m.ticker], env.BRAPI_TOKEN).catch(() => null);
  }
  await audit(env, origem === 'manual' ? 'lancamento_gravado' : 'lancamento_ia_confirmado', { id: ins?.id, ...m });
  return ins?.id;
}

function toolkit(env: Env): Toolkit {
  let cache: any = null;
  return {
    state: async () => (cache ??= await state(env)),
    ultimos: async (n) => (await env.DB.prepare('SELECT data, tipo, ticker, qtd, preco, valor, anulado FROM movements ORDER BY data DESC, id DESC LIMIT ?').bind(n).all()).results as any[],
    cotacao: async (t) => {
      let q: any = await env.DB.prepare('SELECT ticker, preco, fechamento_ant, fonte, cotado_em FROM quotes WHERE ticker = ?').bind(t).first();
      if (!q || Date.now() - q.cotado_em > 30 * 60_000) { const f = await fetchQuote(t, env.BRAPI_TOKEN).catch(() => null); if (f) q = f; }
      if (!q) return null;
      return { preco: q.preco, fechamento_anterior: q.fechamento_ant, variacao: q.fechamento_ant ? +((q.preco / q.fechamento_ant - 1) * 100).toFixed(2) : null, fonte: q.fonte, cotado_em: new Date(q.cotado_em).toISOString(), aviso: 'B3 gratuita: até ~15 min de atraso' };
    },
    simular: async (v) => {
      const st = cache ??= await state(env);
      const assets = (await env.DB.prepare('SELECT ticker, div_mes_cota FROM assets').all<any>()).results;
      const dmc = new Map(assets.map((a: any) => [a.ticker, a.div_mes_cota ?? 0]));
      const fase = faseAtual(st.totais.patrimonio + v, st.fases);
      const precos: Record<string, number> = {};
      for (const p of st.posicoes) precos[p.ticker] = p.preco;
      const q = (await env.DB.prepare('SELECT ticker, preco FROM quotes').all<any>()).results;
      for (const r of q) precos[r.ticker] ??= r.preco;
      const plano = planoCompras(st.posicoes, st.totais.caixa + v, fase, precos);
      const rendaExtra = plano.compras.reduce((s, c) => s + c.qtd * (Number(dmc.get(c.ticker)) || 0), 0);
      return { caixa_atual: st.totais.caixa, aporte: v, disponivel: +(st.totais.caixa + v).toFixed(2), fase: fase?.nome, compras: plano.compras, sobra: plano.sobra,
        renda_mensal_adicional_estimada: +rendaExtra.toFixed(2), regra: 'ativo mais atrasado contra o peso-alvo, cotas inteiras, sem vendas' };
    },
    propor: async (args, pedido) => {
      const m = normalizeMov(args);
      const efeito = await previa(env, m);
      const r = await env.DB.prepare('INSERT INTO propostas (lancamento, efeito, pedido) VALUES (?, ?, ?) RETURNING id')
        .bind(JSON.stringify(m), JSON.stringify(efeito), pedido).first<{ id: number }>();
      return { id: r!.id, lancamento: m, efeito };
    },
    memo: {
      get: async (k) => (await env.DB.prepare('SELECT valor FROM ia_cache WHERE chave = ? AND expira > ?').bind(k, Date.now()).first<{ valor: string }>())?.valor ?? null,
      set: async (k, v, min) => {
        await env.DB.batch([
          env.DB.prepare('INSERT OR REPLACE INTO ia_cache (chave, valor, expira) VALUES (?, ?, ?)').bind(k, v, Date.now() + min * 60_000),
          env.DB.prepare('DELETE FROM ia_cache WHERE expira < ?').bind(Date.now()),
        ]);
      },
    },
  };
}

async function propostasPorIds(env: Env, ids: number[]) {
  if (!ids.length) return [];
  const r = await env.DB.prepare(`SELECT * FROM propostas WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<any>();
  return r.results.map((p: any) => ({ ...p, lancamento: JSON.parse(p.lancamento), efeito: p.efeito ? JSON.parse(p.efeito) : null }));
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
    return json({ autenticado: !!(await currentSession(req, env)), configurado: await isConfigured(env), nuvem: true });
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

  // ───────── M.A.N.U.E.L. ─────────
  if (path === '/api/manuel/conversa' && req.method === 'GET') {
    const msgs = (await env.DB.prepare('SELECT * FROM (SELECT * FROM conversa ORDER BY id DESC LIMIT 80) ORDER BY id').all<any>()).results
      .map((m: any) => ({ ...m, meta: m.meta ? JSON.parse(m.meta) : null }));
    const ids = msgs.flatMap((m: any) => m.meta?.propostas ?? []);
    const cfg = await lerConfigIA(env);
    const uso = await env.DB.prepare('SELECT * FROM ia_uso WHERE dia = ?').bind(hojeISO()).first<any>();
    return json({ mensagens: msgs, propostas: await propostasPorIds(env, ids), config: cfg,
      chaves: { claude: !!env.ANTHROPIC_API_KEY, gemini: !!env.GEMINI_API_KEY }, uso: uso ?? { dia: hojeISO(), chamadas: 0, entrada: 0, saida: 0, locais: 0 } });
  }

  if (path === '/api/manuel/mensagem' && req.method === 'POST') {
    const body: any = await req.json().catch(() => ({}));
    const texto = String(body.texto ?? '').trim().slice(0, 4000);
    if (!texto) return json({ erro: 'Mensagem vazia.' }, 400);
    const cfg = await lerConfigIA(env);
    const tk = toolkit(env);
    const economico = cfg.economico !== false;
    const registrar = async (r: { texto: string; provedor: string; modelo: string; ferramentas: any[]; propostas: number[]; fontes: any[]; uso: { entrada: number; saida: number } }, extra: { local?: boolean; cache?: boolean } = {}) => {
      const meta = { provedor: r.provedor, modelo: r.modelo, ferramentas: r.ferramentas, propostas: r.propostas, fontes: r.fontes, uso: r.uso, ...extra };
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO conversa (papel, texto) VALUES ('usuario', ?)`).bind(texto),
        env.DB.prepare(`INSERT INTO conversa (papel, texto, meta) VALUES ('manuel', ?, ?)`).bind(r.texto || '(sem texto)', JSON.stringify(meta)),
        extra.local || extra.cache
          ? env.DB.prepare(`INSERT INTO ia_uso (dia, locais) VALUES (?, 1) ON CONFLICT(dia) DO UPDATE SET locais = locais + 1`).bind(hojeISO())
          : env.DB.prepare(`INSERT INTO ia_uso (dia, chamadas, entrada, saida) VALUES (?, 1, ?, ?)
        ON CONFLICT(dia) DO UPDATE SET chamadas = chamadas + 1, entrada = entrada + excluded.entrada, saida = saida + excluded.saida`).bind(hojeISO(), r.uso.entrada, r.uso.saida),
      ]);
      return json({ texto: r.texto, meta, propostas: await propostasPorIds(env, r.propostas) });
    };

    // 1. Motor local: só o que é dado puro e determinístico (leitura, zona, magic number, marcos, renda,
    // um ativo, lançamentos claros). Qualquer coisa que peça interpretação, sugestão, humor ou cenário
    // (ex.: "o que acha?", "e agora?", perguntas vagas ou de bate-papo) devolve null e cai para a IA —
    // sem precisar do prefixo "ia:". É isso que faz o M.A.N.U.E.L. responder como um agente, não um robô de leitura.
    const local = await responderLocal(texto, tk, new Date(), false).catch(() => null);
    if (local) return registrar(local, { local: true });
    // 2. Mesma pergunta com a mesma carteira na última hora: reaproveita a resposta
    const st = await tk.state();
    const digital = (st.posicoes || []).map((p: any) => `${p.ticker}:${p.qtd}`).join(',') + '|' + st.totais.caixa + '|' + hojeISO();
    const chave = 'resp:' + normalizar(texto.replace(/^ia:\s*/i, '')) + '#' + digital;
    if (economico) {
      const salvo = await tk.memo!.get(chave).catch(() => null);
      if (salvo) return registrar({ ...JSON.parse(salvo), propostas: [], uso: { entrada: 0, saida: 0 } }, { cache: true });
    }
    // 3. IA, dentro dos limites do dia
    const uso = await env.DB.prepare('SELECT chamadas, entrada, saida FROM ia_uso WHERE dia = ?').bind(hojeISO()).first<{ chamadas: number; entrada: number; saida: number }>();
    if ((uso?.chamadas ?? 0) >= cfg.limite_diario) return json({ erro: `Limite diário de ${cfg.limite_diario} consultas à IA atingido. As respostas locais continuam funcionando. Ajuste em Ajustes → Inteligência.` }, 429);
    if ((uso?.entrada ?? 0) + (uso?.saida ?? 0) >= cfg.limite_tokens) return json({ erro: `Teto diário de ${(cfg.limite_tokens / 1000).toFixed(0)}k tokens atingido. As respostas locais continuam funcionando. Ajuste em Ajustes → Inteligência.` }, 429);
    const hist = (await env.DB.prepare('SELECT papel, texto FROM (SELECT * FROM conversa ORDER BY id DESC LIMIT 12) ORDER BY id').all<any>()).results;
    let r;
    try {
      r = await conversar({ texto: texto.replace(/^ia:\s*/i, ''), historico: hist, tk, cfg, chaves: { anthropic: env.ANTHROPIC_API_KEY, gemini: env.GEMINI_API_KEY },
        estrategia: st.estrategia, regras: st.regras });
    } catch (e) { return json({ erro: (e as Error).message }, 502); }
    if (economico && !r.propostas.length && r.texto)
      await tk.memo!.set(chave, JSON.stringify({ texto: r.texto, provedor: r.provedor, modelo: r.modelo, ferramentas: r.ferramentas, fontes: r.fontes }), 60).catch(() => null);
    return registrar(r);
  }

  if (path === '/api/manuel/limpar' && req.method === 'POST') {
    await env.DB.prepare('DELETE FROM conversa').run();
    await audit(env, 'conversa_limpa');
    return json({ ok: true });
  }

  const prop = path.match(/^\/api\/manuel\/propostas\/(\d+)\/(confirmar|recusar)$/);
  if (prop && req.method === 'POST') {
    const id = Number(prop[1]);
    const p = (await propostasPorIds(env, [id]))[0];
    if (!p) return json({ erro: 'Proposta não encontrada.' }, 404);
    if (p.status !== 'pendente') return json({ erro: `Proposta já ${p.status}.` }, 409);
    if (prop[2] === 'recusar') {
      await env.DB.prepare(`UPDATE propostas SET status = 'recusada', resolvida_em = datetime('now') WHERE id = ?`).bind(id).run();
      await audit(env, 'proposta_recusada', { id });
      return json({ ok: true, status: 'recusada' });
    }
    let m: Movement;
    try { m = normalizeMov(p.lancamento); await previa(env, m); }   // revalida contra o razão de agora
    catch (e) { return json({ erro: 'A proposta não é mais válida: ' + (e as Error).message }, 400); }
    const movId = await gravar(env, m, 'ia_confirmada');
    await env.DB.prepare(`UPDATE propostas SET status = 'confirmada', resolvida_em = datetime('now'), movimento_id = ? WHERE id = ?`).bind(movId, id).run();
    return json({ ok: true, status: 'confirmada', movimento_id: movId });
  }

  if (path === '/api/manuel/voz' && req.method === 'POST') {
    if (!env.GEMINI_API_KEY) return json({ erro: 'Voz natural requer a chave do Gemini.' }, 400);
    const body: any = await req.json().catch(() => ({}));
    const cfg = await lerConfigIA(env);
    try {
      const audio = await voz(String(body.texto ?? '').slice(0, 1500), env.GEMINI_API_KEY, String(body.voz || cfg.voz_nome), fetch);
      return new Response(audio, { headers: { 'Content-Type': 'audio/wav' } });
    } catch (e) { return json({ erro: (e as Error).message }, 502); }
  }

  if (path === '/api/manuel/config' && req.method === 'POST') {
    const b: any = await req.json().catch(() => ({}));
    const atual = await lerConfigIA(env);
    const novo = {
      provedor: b.provedor === 'gemini' ? 'gemini' : b.provedor === 'claude' ? 'claude' : atual.provedor,
      modeloClaude: /^claude-[a-z0-9.-]{3,60}$/.test(b.modeloClaude ?? '') ? b.modeloClaude : atual.modeloClaude,
      modeloGemini: b.modeloGemini === 'auto' || /^gemini-[a-z0-9.-]{3,60}$/.test(b.modeloGemini ?? '') ? b.modeloGemini : atual.modeloGemini,
      limite_diario: Number.isInteger(b.limite_diario) && b.limite_diario >= 1 && b.limite_diario <= 1000 ? b.limite_diario : atual.limite_diario,
      limite_tokens: Number.isInteger(b.limite_tokens) && b.limite_tokens >= 5000 && b.limite_tokens <= 5_000_000 ? b.limite_tokens : atual.limite_tokens,
      economico: typeof b.economico === 'boolean' ? b.economico : atual.economico !== false,
      voz_motor: ['windows', 'gemini', 'desligada'].includes(b.voz_motor) ? b.voz_motor : atual.voz_motor,
      voz_nome: /^[A-Za-z]{2,20}$/.test(b.voz_nome ?? '') ? b.voz_nome : atual.voz_nome,
      fala_auto: typeof b.fala_auto === 'boolean' ? b.fala_auto : atual.fala_auto,
      voz_v2: true,
    };
    await env.DB.prepare(`INSERT OR REPLACE INTO settings (chave, valor) VALUES ('ia_config', ?)`).bind(JSON.stringify(novo)).run();
    return json(novo);
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

  // Recebe o razão completo de outro aparelho (ex.: o PC indo para a nuvem). Só com o razão daqui vazio.
  if (path === '/api/admin/import-completo' && req.method === 'POST') {
    const b: any = await req.json().catch(() => null);
    if (!b || !Array.isArray(b.movements) || !Array.isArray(b.assets) || typeof b.settings !== 'object') return json({ erro: 'Formato inválido.' }, 400);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM movements WHERE anulado = 0').first<{ n: number }>();
    if ((n?.n ?? 0) > 0) return json({ erro: 'A nuvem já tem lançamentos. Nada foi importado.', existentes: n?.n }, 409);
    const TIPOS = new Set(['saldo_inicial', 'compra', 'venda', 'provento', 'aporte', 'retirada', 'desdobramento', 'grupamento', 'taxa', 'ajuste_caixa']);
    const movs = b.movements.filter((m: any) => TIPOS.has(m.tipo) && /^\d{4}-\d{2}-\d{2}$/.test(m.data)).slice(0, 20000);
    try { replay(movs); } catch (e) { return json({ erro: 'Razão recebido é inválido: ' + (e as Error).message }, 400); }
    const s = (v: unknown, max = 280) => (v == null ? null : String(v).slice(0, max));
    const num = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const BLOQUEADAS = new Set(['pin', 'update_feed', 'dono_configurado']);
    await env.DB.batch([
      ...b.assets.filter((a: any) => /^[A-Z0-9]{4,7}$/.test(a.ticker)).map((a: any) => env.DB.prepare(
        `INSERT OR REPLACE INTO assets (ticker, nome, tipo, setor, camada, dy_ref, div_mes_cota, mensal, teto_bazin, hi52, lo52, ativo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(a.ticker, s(a.nome, 80), s(a.tipo, 40), s(a.setor, 60), s(a.camada, 60), num(a.dy_ref), num(a.div_mes_cota), a.mensal ? 1 : 0, num(a.teto_bazin), num(a.hi52), num(a.lo52), a.ativo === 0 ? 0 : 1)),
      ...movs.map((m: any) => env.DB.prepare(
        `INSERT INTO movements (data, tipo, ticker, qtd, preco, valor, custos, subtipo, estimado, nota, origem, criado_em, anulado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?)`,
      ).bind(m.data, m.tipo, s(m.ticker, 7), num(m.qtd), num(m.preco), num(m.valor), num(m.custos) ?? 0, s(m.subtipo, 20), m.estimado ? 1 : 0, s(m.nota), s(m.origem, 40) ?? 'importacao', s(m.criado_em, 30), m.anulado ? 1 : 0)),
      ...Object.entries(b.settings).filter(([k]) => !BLOQUEADAS.has(k) && /^[a-z_]{2,40}$/.test(k))
        .map(([k, v]) => env.DB.prepare('INSERT OR REPLACE INTO settings (chave, valor) VALUES (?, ?)').bind(k, JSON.stringify(v))),
    ]);
    await audit(env, 'importacao_completa', { lancamentos: movs.length, ativos: b.assets.length });
    await refreshQuotes(env.DB, b.assets.map((a: any) => a.ticker), env.BRAPI_TOKEN).catch(() => null);
    return json({ ok: true, lancamentos: movs.length, ativos: b.assets.length });
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
    // Claude: uma mensagem mínima (1 token) — só ela revela falta de crédito; listar modelos passa mesmo sem saldo
    if (env.ANTHROPIC_API_KEY) {
      const t0 = Date.now(); const cfg = await lerConfigIA(env);
      try {
        const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST',
          headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: cfg.modeloClaude, max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] }) });
        out.claude = r.ok ? { ok: true, ms: Date.now() - t0 } : { ok: false, erro: explicarErro('Claude', r.status, await r.text().catch(() => '')).message };
      } catch { out.claude = { ok: false, erro: 'sem conexão' }; }
    } else out.claude = { ok: false, erro: 'ANTHROPIC_API_KEY não configurada' };
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
