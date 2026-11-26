import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay, buildState, zona, LedgerError, type Movement } from '../src/engine.ts';
import { seedMovements } from '../src/seed.ts';

test('preço médio: custos entram, venda não altera o PM e realiza resultado', () => {
  const r = replay([
    { data: '2026-01-02', tipo: 'aporte', valor: 1000 },
    { data: '2026-01-03', tipo: 'compra', ticker: 'ITUB4', qtd: 10, preco: 30, custos: 1 },
    { data: '2026-02-03', tipo: 'compra', ticker: 'ITUB4', qtd: 10, preco: 40 },
    { data: '2026-03-03', tipo: 'venda', ticker: 'ITUB4', qtd: 5, preco: 50 },
  ]);
  const l = r.lots.get('ITUB4')!;
  assert.equal(l.qtd, 15);
  assert.equal(Math.round(l.pm * 100) / 100, 35.05);
  assert.equal(Math.round(l.realizado * 100) / 100, 74.75);
  assert.equal(r.caixa, 1000 - 301 - 400 + 250);
});

test('desdobramento e grupamento preservam o custo total', () => {
  const r = replay([
    { data: '2026-01-01', tipo: 'saldo_inicial', ticker: 'WEGE3', qtd: 10, preco: 40 },
    { data: '2026-02-01', tipo: 'desdobramento', ticker: 'WEGE3', qtd: 2 },
  ]);
  const l = r.lots.get('WEGE3')!;
  assert.equal(l.qtd, 20); assert.equal(l.pm, 20);
  const g = replay([
    { data: '2026-01-01', tipo: 'saldo_inicial', ticker: 'X', qtd: 100, preco: 1 },
    { data: '2026-02-01', tipo: 'grupamento', ticker: 'X', qtd: 10 },
  ]).lots.get('X')!;
  assert.equal(g.qtd, 10); assert.equal(g.pm, 10);
});

test('venda acima da posição é rejeitada', () => {
  assert.throws(() => replay([
    { data: '2026-01-01', tipo: 'saldo_inicial', ticker: 'X', qtd: 1, preco: 1 },
    { data: '2026-01-02', tipo: 'venda', ticker: 'X', qtd: 2, preco: 1 },
  ]), LedgerError);
});

test('movimentos anulados são ignorados', () => {
  const r = replay([
    { data: '2026-01-01', tipo: 'aporte', valor: 100 },
    { data: '2026-01-02', tipo: 'aporte', valor: 999, anulado: 1 },
  ]);
  assert.equal(r.caixa, 100);
});

test('importação: saldo inicial + caixa geram estado e plano coerentes (carteira fictícia)', () => {
  const ficticia = {
    data_base: '2026-01-10', caixa: 300, posicoes: [
      { ticker: 'AAAA11', qtd: 10, preco_medio: 100, div_mes_cota: 0.8 },
      { ticker: 'BBBB3', qtd: 50, preco_medio: 20, div_mes_cota: 0.1 },
    ],
  };
  const st = buildState({
    movements: seedMovements(ficticia) as Movement[], quotes: [],
    assets: [{ ticker: 'AAAA11', div_mes_cota: 0.8 }, { ticker: 'BBBB3', div_mes_cota: 0.1 }],
    fases: [{ id: 'f1', nome: 'Fase 1', ate: null, dy: 7, pesos: { AAAA11: 60, BBBB3: 40 } }],
    missao: { meta_mensal: 1000, dy_missao: 7, marcos: [25, 100], teto_concentracao: 60 }, aporte_mensal: 500,
    agora: new Date('2026-02-01T12:00:00Z'),
  });
  assert.equal(st.totais.investido, 2000);
  assert.equal(st.totais.caixa, 300);
  assert.equal(st.totais.renda_mes_estimada, 13);
  const o = st.plano;   // sem aporte: a ordem usa só o caixa, nunca passa dele
  assert.ok((o.compra?.valor ?? 0) <= 300 && o.destinos <= 2 && st.matriz.blocos.length === 5);
});

test('zona de ataque', () => {
  const a = { ticker: 'T', teto_bazin: 50, hi52: 60, lo52: 40 };
  assert.equal(zona(45, 46, a), 'ataque');
  assert.equal(zona(55, 46, a), 'espera');
  assert.equal(zona(49, 40, { ...a, lo52: 30, hi52: 50 }), 'neutra');
});


import { pregao, emPregao } from '../src/market.ts';
test('relógio do pregão (horário de Brasília)', () => {
  // segunda 02/11/2026 21:00 UTC = 18:00 BRT → fechado, abre terça 10:00 BRT (13:00 UTC)
  const p = pregao(new Date('2026-11-02T21:00:00Z'));
  assert.equal(p.aberto, false); assert.equal(p.evento, 'abertura');
  assert.equal(new Date(p.em).toISOString(), '2026-11-03T13:00:00.000Z');
  // terça 14:00 UTC = 11:00 BRT → aberto, fecha 17:00 BRT (20:00 UTC)
  const q = pregao(new Date('2026-11-03T14:00:00Z'));
  assert.equal(q.aberto, true); assert.equal(new Date(q.em).toISOString(), '2026-11-03T20:00:00.000Z');
  // sexta 21:00 UTC → abre segunda
  assert.equal(new Date(pregao(new Date('2026-11-06T21:00:00Z')).em).toISOString(), '2026-11-09T13:00:00.000Z');
  assert.equal(emPregao(new Date('2026-11-07T15:00:00Z')), false);
});

import { magicNumber } from '../src/engine.ts';
test('Magic Number: cotas para o provento de um mês comprar uma cota', () => {
  // TAEE11 a R$ 45,87 pagando R$ 0,2505/mês por cota → 184 cotas (igual ao INSA Wallet)
  const t = magicNumber(45.87, 0.2505, 11)!;
  assert.equal(t.magic, 184); assert.equal(t.faltam, 173); assert.equal(t.ativo, false);
  assert.equal(t.custo_faltante, 7935.51);
  // BTLG11 a 104,80 com 0,8024 → 131 (igual ao INSA Wallet)
  assert.equal(magicNumber(104.8, 0.8024, 2)!.magic, 131);
  // atingido
  const m = magicNumber(10, 0.1, 100)!;
  assert.equal(m.magic, 100); assert.equal(m.ativo, true); assert.equal(m.faltam, 0); assert.equal(m.progresso, 100); assert.equal(m.cotas_por_mes, 1);
  // não pagador
  assert.equal(magicNumber(66.9, 0, 2), null);
});

test('bitcoin em reais: BTC-USD × dólar no Yahoo, CoinGecko de reserva', async () => {
  const { fetchQuote } = await import('../src/market.ts');
  const orig = globalThis.fetch;
  const chart = (preco: number, ant: number, serie: number[]) => new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: preco, chartPreviousClose: ant, regularMarketTime: 1794884000 }, indicators: { quote: [{ close: serie }] } }] } }));
  try {
    globalThis.fetch = (async (u: string) => u.includes('BTC-USD') ? chart(64000, 65000, [64500, 64000]) : u.includes('BRL%3DX') ? chart(5.8, 5.75, [5.8]) : new Response('', { status: 404 })) as any;
    const q = await fetchQuote('BTCBRL');
    assert.equal(q!.preco, 371200);
    assert.equal(q!.fechamento_ant, 373750);
    assert.deepEqual(q!.serie, [374100, 371200]);
    globalThis.fetch = (async (u: string) => u.includes('coingecko') ? new Response(JSON.stringify({ bitcoin: { brl: 373036, brl_24h_change: 1.32, last_updated_at: 1794884071 } })) : new Response('', { status: 404 })) as any;
    const c = await fetchQuote('BTCBRL');
    assert.equal(c!.preco, 373036);
    assert.match(c!.fonte, /CoinGecko/);
  } finally { globalThis.fetch = orig; }
});

// ───── Matriz 5x20 e as 6 regras ─────
import { ordemAporte, retratoMatriz, radarEscala, MATRIZ_PADRAO as MZ } from '../src/matriz.ts';
const P = (ticker: string, qtd: number, preco: number, pm: number, var_dia: number | null = 0) => ({ ticker, qtd, preco, preco_medio: pm, valor: qtd * preco, var_dia });
// carteira real de 19/11 (aprox.): energia e FIIs acima do teto, caixa quase zero
const REAL = [P('CMIG4', 79, 10.86, 11.08, -0.64), P('BTLG11', 8, 95.39, 98.41, -1.07), P('MXRF11', 88, 8.54, 8.75), P('ITUB4', 15, 39.95, 39.06, -0.6),
  P('TAEE11', 11, 40.31, 39.2), P('NDIV11', 3, 112.45, 115.64, -0.93), P('WEGE3', 5, 51.1, 50.26), P('BITC11', 2, 59.81, 66.91),
  P('EQTL3', 3, 33.31, 37.03), P('BBAS3', 7, 14.11, 20.95), P('RADL3', 7, 13.67, 20.31, -2.57)];

test('matriz: blocos, caixa vermelho e blocos acima do teto congelados', () => {
  const r = retratoMatriz(REAL, 10.1, 0, MZ);
  const b = Object.fromEntries(r.blocos.map(x => [x.id, x]));
  assert.equal(r.caixa_ok, false);
  assert.equal(b.energia.status, 'congelado'); assert.equal(b.fiis.status, 'congelado');
  assert.equal(b.bancos.status, 'abaixo'); assert.ok(Math.abs(r.blocos.reduce((s, x) => s + x.peso, 0) - 100) < 0.05);
});

test('trava de caixa: 50% do aporte em RF, o caixa existente não compra RV, só 1 ativo', () => {
  const o = ordemAporte(REAL, 10.1, 0, 500, MZ);
  assert.equal(o.trava_caixa, true);
  assert.ok(o.renda_fixa >= 250);
  assert.ok(o.compra && o.compra.valor <= 250 + 1e-9);   // RV só com a outra metade
  assert.ok(o.destinos <= 2);
  assert.ok(!['energia', 'fiis'].includes(o.compra!.bloco));   // blocos congelados fora
  assert.equal(Math.round((o.renda_fixa + o.compra!.valor) * 100), 50000);   // troco vai para RF: nada se perde
});

test('anti-FOMO: alta >2% no dia sai da frente; abaixo do PM vai antes', () => {
  const pos = [P('ITUB4', 10, 40, 38, 2.5), P('BBAS3', 1, 14, 20), P('WEGE3', 1, 50, 50), P('CMIG4', 1, 10, 10), P('BTLG11', 1, 95, 95)];
  const m = { ...MZ, congelados: [] };
  const o = ordemAporte(pos, 2000, 0, 300, m);
  const bancos = o.fila.find(f => f.bloco === 'bancos')!;
  assert.deepEqual(bancos.candidatos.map(c => c.ticker), ['BBAS3', 'ITUB4']);
});

test('anti-pulverização: abaixo de R$ 25 mil, nenhum ticker novo entra na fila', () => {
  const o = ordemAporte([P('ITUB4', 1, 40, 40)], 0, 1000, 500, MZ);
  const todos = o.fila.flatMap(f => f.candidatos.map(c => c.ticker));
  assert.deepEqual(todos, ['ITUB4']);
});

test('radar: marcos 100 → 500 → 1.000 → 5.000 → 20.000', () => {
  const r = radarEscala(150, MZ, 500, 9);
  assert.deepEqual(r.map(x => x.marco), [100, 500, 1000, 5000, 20000]);
  assert.equal(r[0].atingido, true); assert.equal(r[1].falta, 350);
});

test('razão: aplicação e resgate de renda fixa movem o caixa', () => {
  const { caixa, rf } = replay([
    { data: '2026-01-01', tipo: 'aporte', valor: 1000 },
    { data: '2026-01-02', tipo: 'aplicacao_rf', valor: 600 },
    { data: '2026-01-03', tipo: 'resgate_rf', valor: 100 },
    { data: '2026-01-04', tipo: 'rendimento_rf', valor: 5 },
  ] as any);
  assert.equal(caixa, 500); assert.equal(rf, 505);
});

test('fila completa: próxima compra primeiro, congelados por último, todos os ativos presentes', async () => {
  const { filaCompleta } = await import('../src/matriz.ts');
  const m = { ...MZ, congelados: [] };
  const o = ordemAporte(REAL, 10.1, 387.91, 500, m);
  const f = filaCompleta(REAL, 10.1, 387.91, m, o);
  assert.equal(f.length, REAL.length);
  assert.equal(f[0].ticker, o.compra!.ticker); assert.equal(f[0].grupo, 'proxima');
  const ult = f.findIndex(x => x.grupo === 'bloco_congelado');
  assert.ok(ult > 0 && f.slice(ult).every(x => x.grupo.endsWith('congelado')));
  assert.deepEqual(f.map(x => x.posicao), REAL.map((_, i) => i + 1));
});
