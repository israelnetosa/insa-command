import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerBanco, conferir } from '../src/banco.ts';

const env = { PLUGGY_CLIENT_ID: 'id', PLUGGY_CLIENT_SECRET: 'sec', PLUGGY_ITEM_ID: 'item-1' };
const resp = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status });

test('banco: lê investimentos da Pluggy (paginado) e confere com o app', async () => {
  const chamadas: string[] = [];
  const f = (async (u: string, o?: RequestInit) => {
    chamadas.push(u);
    if (u.endsWith('/auth')) { assert.match(String(o?.body), /"clientId":"id"/); return resp({ apiKey: 'k' }); }
    assert.equal((o?.headers as any)['X-API-KEY'], 'k');
    if (u.includes('/items/item-1')) return resp({ status: 'UPDATED', lastUpdatedAt: '2026-11-17T10:00:00Z', connector: { name: 'MeuPluggy' } });
    if (u.includes('/accounts')) return resp({ results: [{ id: 'a', type: 'BANK', name: 'Conta', balance: 11.86 }] });
    if (u.includes('/investments?') && u.includes('page=1')) return resp({ totalPages: 2, results: [{ id: 'i1', code: 'BTLG11', name: 'BTLG11', type: 'EQUITY', quantity: 8, value: 98.75, balance: 790, amountOriginal: 787.31 }] });
    if (u.includes('/investments?') && u.includes('page=2')) return resp({ totalPages: 2, results: [{ id: 'i2', code: null, name: 'ITUB4 - ITAU UNIBANCO', type: 'EQUITY', quantity: 16, value: 42.27, balance: 676.32, amountOriginal: 624.96 }, { id: 'i3', code: null, name: 'CDB XPTO', type: 'FIXED_INCOME', balance: 100 }] });
    if (u.includes('/investments/i1/transactions')) return resp({ totalPages: 1, results: [{ type: 'BUY', movementType: 'CREDIT', tradeDate: '2026-11-03T00:00:00Z', quantity: 2, value: 97.8, amount: 195.6 }] });
    if (u.includes('/transactions')) return resp({ totalPages: 1, results: [] });
    return resp({}, 404);
  }) as any;
  const b = await lerBanco(env, f);
  assert.equal(b.conexao.status, 'UPDATED');
  assert.deepEqual(b.investimentos.map(i => i.ticker), ['BTLG11', 'ITUB4', null]);
  assert.equal(b.investimentos[0].movimentos[0].data, '2026-11-03');
  const c = conferir([
    { ticker: 'BTLG11', qtd: 8, preco_medio: 98.41, custo: 787.28 },
    { ticker: 'ITUB4', qtd: 15, preco_medio: 39.06, custo: 585.84 },
    { ticker: 'WEGE3', qtd: 5, preco_medio: 50.26, custo: 251.3 },
  ], b);
  const st = Object.fromEntries(c.linhas.map(l => [l.ticker, l.status]));
  assert.deepEqual(st, { BTLG11: 'ok', ITUB4: 'quantidade', WEGE3: 'so_no_app' });
  assert.equal(c.divergencias, 2);
  assert.equal(c.sem_ticker[0].nome, 'CDB XPTO');
  // a chave é reaproveitada: um único /auth
  assert.equal(chamadas.filter(u => u.endsWith('/auth')).length, 1);
});

test('banco: sem segredos, erro claro e nenhuma chamada', async () => {
  await assert.rejects(lerBanco({}, (() => { throw new Error('não deveria chamar'); }) as any), /Faltam os segredos/);
});
