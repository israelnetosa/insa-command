import { test } from 'node:test';
import assert from 'node:assert/strict';
import { responderLocal, lerValor } from '../src/local.ts';
import { dossie, type Toolkit } from '../src/manuel.ts';

function tk() {
  const propostas: any[] = []; const simulados: number[] = [];
  const pos = (t: string, qtd: number, preco: number, zona: string, renda: number, magic: any, extra: any = {}) => ({
    ticker: t, qtd, preco_medio: preco, preco, var_dia: 0.4, valor: qtd * preco, peso: 25, zona, teto_bazin: preco * 1.1,
    renda_mes_estimada: renda, yoc: 8, resultado: 0, resultado_pct: 0, cotacao_ok: true, magic, ...extra });
  const st = {
    totais: { patrimonio: 2300, investido: 2000, caixa: 300, resultado: 10, resultado_dia: 4.2, renda_mes_estimada: 13, renda_12m_recebida: 0, renda_referencia: 13, dy_carteira: 7.8 },
    missao: { meta_mensal: 1000, proximo_marco: 25, progresso_marco: 52, falta_marco: 12, progresso_meta: 1.3, fase: { id: 'f1', nome: 'Fase 1' }, maior_posicao: { ticker: 'AAAA11', peso: 50, teto: 60 }, em_ataque: 1 },
    posicoes: [pos('AAAA11', 10, 100, 'ataque', 8, { magic: 125, faltam: 115, progresso: 8, custo_faltante: 11500, ativo: false, cotas_por_mes: 0.08 }),
      pos('MXRF11', 130, 9.2, 'neutra', 13, { magic: 92, faltam: 0, progresso: 100, custo_faltante: 0, ativo: true, cotas_por_mes: 1.4 }, { var_dia: -1.2 })],
    fases: [{ id: 'f1', nome: 'Fase 1', pesos: { AAAA11: 60, MXRF11: 40 } }],
    magic: { ativos: ['MXRF11'], proximo: 'AAAA11', custo_total: 11500, cotas_por_mes: 1.48, sem_provento: [] },
    projecao: { marcos: { base: [{ renda: 25, meses: 7 }, { renda: 100, meses: 40 }] } },
    calendario: Array.from({ length: 12 }, (_, i) => ({ mes: 'm' + i, recebido: 1, estimado: 2 })),
    alertas: [{ texto: 'R$ 300,00 em caixa: caixa parado.' }], em_pregao: true, aporte_mensal: 500, matriz: { caixa_pct: 13.04, caixa_ok: false, regras: { congelados: ['BBAS3'] }, blocos: [
      { id: 'caixa', nome: 'Caixa / Renda Fixa', peso: 13.04, alvo: 20, teto: 25, status: 'vermelho', tickers: [] },
      { id: 'fiis', nome: 'FIIs', peso: 86.96, alvo: 20, teto: 25, status: 'congelado', tickers: ['AAAA11', 'MXRF11'] }] },
    plano: { renda_fixa: 0, compra: null, fila: [], bloqueios: [], destinos: 0 },
    ordem_mensal: { renda_fixa: 250, compra: { ticker: 'AAAA11', qtd: 2, preco: 100, valor: 200, motivo: 'FIIs 5 pp abaixo do alvo' }, sobra_para_rf: 50, trava_caixa: true, destinos: 2,
      fila: [{ bloco: 'fiis', distancia_pp: 5, candidatos: [{ ticker: 'AAAA11', desconto_pm: -1, var_dia: 0.4, preco: 100, fomo: false }] }], bloqueios: ['Trava de caixa: teste.'] },
    radar: [{ marco: 100, atingido: false, progresso: 13, falta: 87, capital_extra: 13000 }, { marco: 500, atingido: false, progresso: 2.6, falta: 487, capital_extra: null }], regras: ['Comprar o mais atrasado.'], estrategia: null,
  };
  const t: Toolkit = {
    state: async () => st,
    ultimos: async () => [],
    cotacao: async () => ({ preco: 101, variacao: 1, fonte: 'yahoo' }),
    simular: async (v) => { simulados.push(v); return { caixa_atual: 300, aporte: v, ordem: { renda_fixa: v / 2, compra: { ticker: 'AAAA11', qtd: 8, preco: 100, valor: 800, motivo: 'FIIs abaixo do alvo' }, trava_caixa: true, destinos: 2, sobra_para_rf: 0, fila: [], bloqueios: [] }, renda_mensal_adicional_estimada: 6.4 }; },
    propor: async (l) => { const p = { id: propostas.length + 1, lancamento: { custos: 0, ...l }, efeito: { caixa: { antes: 300, depois: 10 }, posicao: l.ticker ? { ticker: l.ticker, qtd: { antes: 10, depois: 13 }, preco_medio: { antes: 100, depois: 99 } } : null, avisos: [] } }; propostas.push(p); return p; },
  };
  return { t, propostas, simulados };
}
const agora = new Date('2026-11-04T15:00:00Z');

test('valores em português', () => {
  assert.equal(lerValor('1.500,50'), 1500.5);
  assert.equal(lerValor('98,5'), 98.5);
  assert.equal(lerValor('98.50'), 98.5);
  assert.equal(lerValor('2 mil'), 2000);
  assert.equal(lerValor('1,5k'), 1500);
  assert.equal(lerValor('R$ 500'), 500);
});

test('onde aplicar um aporte: simula sem IA e sem tokens', async () => {
  const { t, simulados } = tk();
  const r = await responderLocal('Onde aplico o aporte de R$ 1.500 deste mês?', t, agora);
  assert.ok(r);
  assert.equal(r!.provedor, 'Local');
  assert.deepEqual(r!.uso, { entrada: 0, saida: 0 });
  assert.deepEqual(simulados, [1500]);
  assert.match(r!.texto, /## 1\. Status do Núcleo[\s\S]*VERMELHO[\s\S]*## 2\. Alertas de Risco[\s\S]*CONGELADO[\s\S]*## 3\. Ordem de Execução[\s\S]*R\$ 750,00 → Renda Fixa[\s\S]*8 × AAAA11[\s\S]*## 4\. Radar de Escala/);
  const r2 = await responderLocal('onde aplicar?', t, agora);
  assert.deepEqual(simulados, [1500, 500]);   // sem valor: usa o aporte mensal
  assert.match(r2!.texto, /R\$ 250,00 → Renda Fixa/);
});

test('intenções do dia a dia respondem localmente', async () => {
  const { t } = tk();
  const casos: [string, RegExp][] = [
    ['Leitura do dia', /Patrimônio total: R\$ 2\.300,00/],
    ['Quais pelotões estão na zona de ataque?', /zona de ataque: AAAA11/],
    ['Magic Number', /ativo em MXRF11[\s\S]*Próximo a ativar: AAAA11/],
    ['Quando chego no próximo marco?', /~7 meses/],
    ['Renda do mês', /Maiores pagadores: MXRF11/],
    ['Varra as oportunidades da fase', /1\. FIIs: 5 pp abaixo · AAAA11/],
    ['e o AAAA11?', /AAAA11: 10 cotas/],
    ['bom dia', /Leitura com o pregão aberto/],
  ];
  for (const [q, re] of casos) {
    const r = await responderLocal(q, t, agora);
    assert.ok(r, q); assert.match(r!.texto, re, q);
  }
});

test('perguntas abertas e pesquisas vão para a IA', async () => {
  const { t } = tk();
  for (const q of ['Pesquise as notícias do AAAA11', 'ia: leitura do dia', 'Por que o AAAA11 caiu?', 'Vale a pena comprar BBAS3?', 'Qual a data-com do MXRF11?', 'Me fale sobre a Selic'])
    assert.equal(await responderLocal(q, t, agora), null, q);
});

test('lançamentos em texto viram proposta (nada é gravado)', async () => {
  const { t, propostas } = tk();
  const r = await responderLocal('Comprei 3 AAAA11 a 97,80 com custos de 0,50', t, agora);
  assert.deepEqual(r!.propostas, [1]);
  assert.deepEqual(propostas[0].lancamento, { custos: 0.5, tipo: 'compra', data: '2026-11-04', ticker: 'AAAA11', qtd: 3, preco: 97.8 });
  assert.match(r!.texto, /Nada foi gravado/);
  await responderLocal('recebi R$ 12,35 de rendimentos do MXRF11 ontem', t, agora);
  assert.deepEqual(propostas[1].lancamento, { custos: 0, tipo: 'provento', data: '2026-11-03', ticker: 'MXRF11', valor: 12.35, subtipo: 'rendimento' });
  await responderLocal('aportei 1,5 mil', t, agora);
  assert.deepEqual(propostas[2].lancamento, { custos: 0, tipo: 'aporte', data: '2026-11-04', valor: 1500 });
  // frase que não deu para entender vai para a IA
  assert.equal(await responderLocal('comprei umas cotas de AAAA11 semana passada', t, agora), null);
});

test('dossiê compacto: bem menor que antes', async () => {
  const { t } = tk();
  const d = await dossie(t, { regras: ['Comprar o mais atrasado.'], agora });
  assert.match(d, /AAAA11 10 100 100 0\.4% 25 fiis ataque/);
  assert.ok(d.length < 1200, `dossiê com ${d.length} caracteres`);
});

test('modo econômico (estrito): sem "ia:" nunca devolve null, então a IA não é chamada', async () => {
  const { t } = tk();
  for (const q of ['vamos analisar a carteira e proximos passos', 'qual o próximo passo para alcançar os 25/mês?', 'o que acha do mercado?',
    'Pesquise as notícias do AAAA11', 'comprei umas cotas semana passada', 'xyz', 'e o ZZZZ11?']) {
    const r = await responderLocal(q, t, agora, true);
    assert.ok(r, q);
    assert.deepEqual(r!.uso, { entrada: 0, saida: 0 }, q);
  }
  const r = await responderLocal('qual o próximo passo para alcançar os 40/mês?', t, agora, true);
  assert.match(r!.texto, /alvo R\$ 40,00\/mês: faltam R\$ 27,00/);
  assert.match(r!.texto, /R\$ 250,00 em RF \+ 8 AAAA11 → \+R\$ 6,40\/mês/);
  assert.match((await responderLocal('Pesquise as notícias do AAAA11', t, agora, true))!.texto, /ia: Pesquise/);
  // com o prefixo, vai para a IA
  assert.equal(await responderLocal('ia: analise a carteira', t, agora, true), null);
});
