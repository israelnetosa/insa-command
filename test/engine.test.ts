import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay, buildState, planoCompras, zona, LedgerError, type Movement } from '../src/engine.ts';
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
  const gasto = st.plano.compras.reduce((s, c) => s + c.valor, 0);
  assert.ok(gasto <= 300 && st.plano.sobra >= 0 && st.plano.compras.every(c => c.qtd > 0));
});

test('zona de ataque', () => {
  const a = { ticker: 'T', teto_bazin: 50, hi52: 60, lo52: 40 };
  assert.equal(zona(45, 46, a), 'ataque');
  assert.equal(zona(55, 46, a), 'espera');
  assert.equal(zona(49, 40, { ...a, lo52: 30, hi52: 50 }), 'neutra');
});

test('plano de compras respeita cotas inteiras e o caixa', () => {
  const p = planoCompras([{ ticker: 'A', valor: 0, preco: 100 }], 250,
    { id: 'f', nome: 'f', ate: null, dy: 7, pesos: { A: 50, B: 50 } }, { A: 100, B: 30 });
  const total = p.compras.reduce((s, c) => s + c.valor, 0);
  assert.ok(total <= 250);
  assert.equal(Math.round((total + p.sobra) * 100) / 100, 250);
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
