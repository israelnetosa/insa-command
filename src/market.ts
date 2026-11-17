// Cotações: Yahoo Finance (preço + mini-gráfico intradiário numa só consulta) e brapi.dev (B3) como reserva.
// Cada cotação guarda a hora do preço NA FONTE e a hora da consulta: o atraso é medido, não suposto.
// Aviso honesto: dados gratuitos da B3 chegam com até ~15 min de atraso. Dólar e bitcoin são praticamente em tempo real.

import type { Quote } from './engine';

const UA = { 'User-Agent': 'Mozilla/5.0 (INSA-Command; uso pessoal)' };

/** Índices e referências do radar. A chave é o nome mostrado; o valor, o símbolo no Yahoo. */
export const INDICES: Record<string, { simbolo: string; nome: string; moeda?: string }> = {
  IBOV:   { simbolo: '^BVSP',   nome: 'Ibovespa' },
  IFIX:   { simbolo: 'IFIX.SA', nome: 'IFIX (FIIs)' },
  USDBRL: { simbolo: 'BRL=X',   nome: 'Dólar' },
  BTCBRL: { simbolo: 'BTC-USD', nome: 'Bitcoin' },   // o Yahoo não tem mais BTC-BRL: convertemos pelo dólar (ver bitcoinBRL)
  SP500:  { simbolo: '^GSPC',   nome: 'S&P 500', moeda: 'USD' },
};
const simbolo = (t: string) => INDICES[t]?.simbolo ?? (t.includes('.') ? t : `${t}.SA`);

export interface LiveQuote extends Quote { serie?: number[] | null; }

async function yahoo(ticker: string): Promise<LiveQuote | null> {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo(ticker))}?range=1d&interval=5m&includePrePost=false`, { headers: UA });
  if (!r.ok) return null;
  const j: any = await r.json();
  const res = j?.chart?.result?.[0];
  const m = res?.meta;
  if (!m?.regularMarketPrice) return null;
  const closes: number[] = (res?.indicators?.quote?.[0]?.close ?? []).filter((x: unknown) => typeof x === 'number');
  const serie = closes.length > 120 ? closes.filter((_, i) => i % Math.ceil(closes.length / 120) === 0) : closes;
  return {
    ticker, preco: m.regularMarketPrice, fechamento_ant: m.chartPreviousClose ?? m.previousClose ?? null,
    fonte: 'Yahoo Finance', cotado_em: (m.regularMarketTime ?? Date.now() / 1000) * 1000,
    buscado_em: Date.now(), serie: serie.length ? serie.map(v => Math.round(v * 100) / 100) : null,
  };
}

async function brapi(ticker: string, token?: string): Promise<LiveQuote | null> {
  if (!token || INDICES[ticker]) return null;
  const r = await fetch(`https://brapi.dev/api/quote/${encodeURIComponent(ticker)}`, { headers: { ...UA, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const q = ((await r.json()) as any)?.results?.[0];
  if (!q?.regularMarketPrice) return null;
  return {
    ticker, preco: q.regularMarketPrice, fechamento_ant: q.regularMarketPreviousClose ?? null,
    fonte: 'brapi.dev (B3)', cotado_em: q.regularMarketTime ? Date.parse(q.regularMarketTime) : Date.now(),
    buscado_em: Date.now(), serie: null,
  };
}

/** Bitcoin em reais: BTC-USD × dólar no Yahoo (com mini-gráfico); reserva no CoinGecko (BRL direto). */
async function bitcoinYahoo(): Promise<LiveQuote | null> {
  const [btc, usd] = await Promise.all([yahoo('BTCBRL'), yahoo('USDBRL')]);
  if (!btc || !usd) return null;
  const fx = usd.preco, fxAnt = usd.fechamento_ant ?? fx;
  return {
    ticker: 'BTCBRL', preco: Math.round(btc.preco * fx * 100) / 100,
    fechamento_ant: btc.fechamento_ant ? Math.round(btc.fechamento_ant * fxAnt * 100) / 100 : null,
    fonte: 'Yahoo Finance (BTC-USD × dólar)', cotado_em: Math.min(btc.cotado_em, usd.cotado_em), buscado_em: Date.now(),
    serie: btc.serie ? btc.serie.map(v => Math.round(v * fx)) : null,
  };
}

async function bitcoinCoingecko(): Promise<LiveQuote | null> {
  const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=brl&include_24hr_change=true&include_last_updated_at=true', { headers: UA });
  if (!r.ok) return null;
  const b = ((await r.json()) as any)?.bitcoin;
  if (!(b?.brl > 0)) return null;
  const chg = Number(b.brl_24h_change);
  return {
    ticker: 'BTCBRL', preco: b.brl, fechamento_ant: Number.isFinite(chg) ? Math.round(b.brl / (1 + chg / 100) * 100) / 100 : null,
    fonte: 'CoinGecko (variação de 24 h)', cotado_em: (b.last_updated_at ?? Date.now() / 1000) * 1000, buscado_em: Date.now(), serie: null,
  };
}

export async function fetchQuote(ticker: string, brapiToken?: string): Promise<LiveQuote | null> {
  const fontes = ticker === 'BTCBRL' ? [bitcoinYahoo, bitcoinCoingecko] : [() => yahoo(ticker), () => brapi(ticker, brapiToken)];
  for (const fonte of fontes) {
    try { const q = await fonte(); if (q) return q; } catch { /* tenta a próxima fonte */ }
  }
  return null;
}

/** Pregão regular da B3: 10h–17h de Brasília (UTC−3), seg–sex. A janela inclui leilões e margem. */
export function emPregao(d = new Date()) {
  const dia = d.getUTCDay();
  const minUTC = d.getUTCHours() * 60 + d.getUTCMinutes();
  return dia >= 1 && dia <= 5 && minUTC >= 12 * 60 + 45 && minUTC <= 20 * 60 + 15;
}

/** Status do pregão e próximo evento (abertura/fechamento), em horário de Brasília. */
export function pregao(d = new Date()) {
  const brt = new Date(d.getTime() - 3 * 3600_000);              // relógio de Brasília
  const dia = brt.getUTCDay(), min = brt.getUTCHours() * 60 + brt.getUTCMinutes();
  const util = dia >= 1 && dia <= 5;
  const abre = 10 * 60, fecha = 17 * 60;
  const aberto = util && min >= abre && min < fecha;
  let alvo = new Date(brt); let evento: 'abertura' | 'fechamento';
  if (aberto) { evento = 'fechamento'; alvo.setUTCHours(17, 0, 0, 0); }
  else {
    evento = 'abertura';
    if (util && min < abre) alvo.setUTCHours(10, 0, 0, 0);
    else { do { alvo.setUTCDate(alvo.getUTCDate() + 1); } while ([0, 6].includes(alvo.getUTCDay())); alvo.setUTCHours(10, 0, 0, 0); }
  }
  return { aberto, evento, em: alvo.getTime() + 3 * 3600_000, nota: 'Feriados da B3 não são considerados.' };
}

async function save(db: D1Database, ok: LiveQuote[]) {
  if (!ok.length) return;
  const status = emPregao() ? 'aberto' : 'fechado';
  await db.batch(ok.map(q => db.prepare(
    `INSERT INTO quotes (ticker, preco, fechamento_ant, fonte, cotado_em, buscado_em, status, serie)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT(ticker) DO UPDATE SET preco=?2, fechamento_ant=?3, fonte=?4, cotado_em=?5, buscado_em=?6, status=?7, serie=COALESCE(?8, serie)`,
  ).bind(q.ticker, q.preco, q.fechamento_ant ?? null, q.fonte, q.cotado_em, q.buscado_em, status, q.serie ? JSON.stringify(q.serie) : null)));
}

export async function refreshQuotes(db: D1Database, tickers: string[], brapiToken?: string) {
  const res = await Promise.all(tickers.map(t => fetchQuote(t, brapiToken)));
  const ok = res.filter((q): q is LiveQuote => !!q);
  await save(db, ok);
  return { atualizadas: ok.length, falharam: tickers.filter(t => !ok.some(q => q.ticker === t)) };
}

// Uma atualização ao vivo por vez, mesmo com várias telas pedindo
let emCurso: Promise<unknown> | null = null;

/** Atualiza só o que está mais velho que maxAgeMs. Responde em até ~8 s mesmo se uma fonte travar. */
export async function liveRefresh(db: D1Database, tickers: string[], maxAgeMs: number, brapiToken?: string) {
  if (emCurso) { await Promise.race([emCurso, new Promise(r => setTimeout(r, 8000))]); return; }
  const rows = await db.prepare('SELECT ticker, buscado_em FROM quotes').all<{ ticker: string; buscado_em: number }>();
  const idade = new Map(rows.results.map(r => [r.ticker, Date.now() - r.buscado_em]));
  const velhos = tickers.filter(t => (idade.get(t) ?? Infinity) > maxAgeMs);
  if (!velhos.length) return;
  emCurso = refreshQuotes(db, velhos, brapiToken).finally(() => { emCurso = null; });
  await Promise.race([emCurso, new Promise(r => setTimeout(r, 8000))]);
}
