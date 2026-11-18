import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore módulo da interface, em JavaScript
import { interpretar, numerosPorExtenso, tirarChamada, lerProposta } from '../web/voz.js';
// @ts-ignore
import { visema, humor } from '../web/rosto.js';

test('voz: chamada do Manuel e comandos', () => {
  assert.deepEqual(tirarChamada('Hey Manuel, leitura do dia'), { texto: 'leitura do dia', chamou: true, saudacao: true });
  assert.equal(tirarChamada('Manuel: zona de ataque').texto, 'zona de ataque');
  assert.equal(interpretar('bom dia Manuel').tipo, 'perguntar');
  assert.deepEqual(interpretar('Manuel, leitura do dia'), { tipo: 'enviar', texto: 'leitura do dia' });
  const a = interpretar('hey Manuel vamos registrar um aporte');
  assert.equal(a.aguardar, 'aporte');
  assert.deepEqual(interpretar('quinhentos reais', { aguardando: 'aporte' }), { tipo: 'enviar', texto: 'aportei 500' });
  assert.deepEqual(interpretar('confirmo', { pendente: true }), { tipo: 'confirmar' });
  assert.deepEqual(interpretar('cancela', { pendente: true }), { tipo: 'recusar' });
  assert.equal(interpretar('confirmo').tipo, 'enviar');   // sem proposta pendente, "confirmo" não grava nada
});

test('voz: números falados viram algarismos', () => {
  assert.equal(numerosPorExtenso('comprei dois BTLG11 a noventa e sete e oitenta'), 'comprei 2 BTLG11 a 97,80');
  assert.equal(numerosPorExtenso('recebi doze reais e trinta e cinco centavos do MXRF11'), 'recebi 12,35 do MXRF11');
  assert.equal(numerosPorExtenso('mil e quinhentos'), '1500');
  assert.equal(numerosPorExtenso('cento e vinte'), '120');
  assert.equal(numerosPorExtenso('aportei 1,5 mil'), 'aportei 1,5 mil');
  assert.equal(numerosPorExtenso('registrar um aporte'), 'registrar um aporte');
});

test('voz: o Manuel repete o valor da proposta', () => {
  const brl = (n: number) => 'R$ ' + n.toFixed(2).replace('.', ',');
  assert.match(lerProposta({ lancamento: { tipo: 'aporte', valor: 500, data: '2026-11-18' } }, brl), /aporte de R\$ 500,00.*18\/11.*confirmo/);
  assert.match(lerProposta({ lancamento: { tipo: 'compra', ticker: 'BTLG11', qtd: 2, preco: 97.8 } }, brl), /compra de 2 BTLG11 a R\$ 97,80/);
});

test('rosto: visemas e humor', () => {
  assert.deepEqual(visema('m'), [0, 0.45, 0]);
  assert.ok(visema('a')[0] > visema('i')[0]);
  assert.ok(visema('u')[2] > 0.9);
  assert.equal(humor({ variacao_pct: -2 }).nome, 'sério');
  assert.equal(humor({ variacao_pct: 1 }).nome, 'confiante');
  assert.equal(humor({ ouvindo: true }).nome, 'atento');
});
