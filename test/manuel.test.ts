import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { conversar, CONFIG_PADRAO, _limparCacheModelos, type Toolkit } from '../src/manuel.ts';

const CLAUDE = { ...CONFIG_PADRAO, provedor: 'claude' as const, modeloClaude: 'claude-sonnet-5-5' };
beforeEach(() => _limparCacheModelos());

// Carteira fictícia e toolkit em memória
function tkFicticio() {
  const propostas: any[] = [];
  const st = {
    totais: { patrimonio: 2300, investido: 2000, caixa: 300, resultado: 10, resultado_dia: 2, renda_mes_estimada: 13, renda_12m_recebida: 0, dy_carteira: 7.8 },
    missao: { meta_mensal: 1000, proximo_marco: 25, progresso_marco: 52, fase: { id: 'f1', nome: 'Fase 1' }, maior_posicao: { ticker: 'AAAA11', peso: 50, teto: 60 }, em_ataque: 1 },
    posicoes: [{ ticker: 'AAAA11', qtd: 10, preco_medio: 100, preco: 100, var_dia: 0.5, valor: 1000, peso: 50, zona: 'ataque', renda_mes_estimada: 8, cotacao_ok: true, yoc: 9.6 },
      { ticker: 'BBBB3', qtd: 50, preco_medio: 20, preco: 20, var_dia: -1, valor: 1000, peso: 50, zona: 'espera', renda_mes_estimada: 5, cotacao_ok: true, yoc: 6 }],
    fases: [{ id: 'f1', nome: 'Fase 1', pesos: { AAAA11: 60, BBBB3: 40 } }],
    plano: { compras: [{ ticker: 'AAAA11', qtd: 3, preco: 100, valor: 300 }], sobra: 0 },
    alertas: [], em_pregao: false, aporte_mensal: 500, regras: ['Comprar o mais atrasado.'], estrategia: null,
  };
  const tk: Toolkit = {
    state: async () => st,
    ultimos: async () => [],
    cotacao: async () => ({ preco: 100 }),
    simular: async (v) => ({ aporte: v, compras: [{ ticker: 'AAAA11', qtd: 8, preco: 100, valor: 800 }], sobra: 0 }),
    propor: async (l) => { const p = { id: propostas.length + 1, lancamento: l, efeito: { caixa: { antes: 300, depois: 0 } } }; propostas.push(p); return p; },
  };
  return { tk, propostas };
}

// fetch simulado: responde em sequência e grava as requisições
function fakeFetch(respostas: Record<string, any[]>) {
  const chamadas: { url: string; body: any }[] = [];
  const f = (async (url: any, init?: any) => {
    const u = String(url);
    chamadas.push({ url: u, body: init?.body ? JSON.parse(init.body) : null });
    const chave = Object.keys(respostas).find(k => u.includes(k));
    const fila = chave ? respostas[chave] : undefined;
    const r = fila?.length ? fila.shift() : { status: 404, json: { erro: 'sem mock' } };
    return new Response(JSON.stringify(r.json ?? r), { status: r.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { f, chamadas };
}

test('Claude usa ferramenta e responde; dossiê vai como dado no system', async () => {
  const { tk } = tkFicticio();
  const { f, chamadas } = fakeFetch({
    'api.anthropic.com/v1/messages': [
      { content: [{ type: 'tool_use', id: 't1', name: 'simular_aporte', input: { valor: 500 } }], stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 20 } },
      { content: [{ type: 'text', text: 'Senhor, com R$ 500 o plano compra 8 AAAA11.' }], stop_reason: 'end_turn', usage: { input_tokens: 150, output_tokens: 30 } },
    ],
  });
  const r = await conversar({ texto: 'Onde aplico R$ 500?', historico: [], tk, cfg: CLAUDE, chaves: { anthropic: 'k' }, fetch: f });
  assert.equal(r.provedor, 'Claude');
  assert.match(r.texto, /8 AAAA11/);
  assert.deepEqual(r.ferramentas.map(e => e.ferramenta), ['simular_aporte']);
  assert.deepEqual(r.uso, { entrada: 250, saida: 50 });
  const sys = chamadas[0].body.system[0].text as string;
  assert.deepEqual(chamadas[0].body.system[0].cache_control, { type: 'ephemeral' });   // cache de prompt
  assert.ok(chamadas[0].body.max_tokens <= 1000);
  assert.match(sys, /<dossie>[\s\S]*AAAA11[\s\S]*<\/dossie>/);
  assert.match(sys, /DADO da carteira/);
  // o resultado da ferramenta volta como tool_result
  assert.equal(chamadas[1].body.messages.at(-1).content[0].type, 'tool_result');
});

test('propor_lancamento só cria proposta (nada é gravado)', async () => {
  const { tk, propostas } = tkFicticio();
  const { f } = fakeFetch({
    'api.anthropic.com/v1/messages': [
      { content: [{ type: 'tool_use', id: 't1', name: 'propor_lancamento', input: { tipo: 'compra', data: '2026-11-03', ticker: 'AAAA11', qtd: 2, preco: 99 } }], stop_reason: 'tool_use' },
      { content: [{ type: 'text', text: 'Preparei a proposta. Clique em Confirmar para gravar.' }], stop_reason: 'end_turn' },
    ],
  });
  const r = await conversar({ texto: 'Comprei 2 AAAA11 a 99', historico: [], tk, cfg: CLAUDE, chaves: { anthropic: 'k' }, fetch: f });
  assert.deepEqual(r.propostas, [1]);
  assert.equal(propostas.length, 1);
  assert.equal(propostas[0].lancamento.ticker, 'AAAA11');
});

test('Claude falha → Gemini assume com as mesmas ferramentas', async () => {
  const { tk } = tkFicticio();
  const { f } = fakeFetch({
    'api.anthropic.com': [{ status: 529, json: { error: 'overloaded' } }],
    '/v1beta/models?pageSize': [{ models: [{ name: 'models/gemini-3.6-flash' }, { name: 'models/gemini-3.8-flash' }, { name: 'models/gemini-3.8-flash-tts' }, { name: 'models/gemini-3.5-flash-lite' }] }],
    ':generateContent': [
      { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'varrer_oportunidades', args: {} }, thoughtSignature: 'abc' }] } }] },
      { candidates: [{ content: { role: 'model', parts: [{ text: 'Senhor, o mais atrasado é AAAA11.' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } },
    ],
  });
  const r = await conversar({ texto: 'Varra oportunidades', historico: [], tk, cfg: CLAUDE, chaves: { anthropic: 'k', gemini: 'g' }, fetch: f });
  assert.equal(r.provedor, 'Gemini');
  assert.equal(r.modelo, 'gemini-3.5-flash-lite');   // modo econômico: Flash-Lite primeiro, ignora tts
  assert.match(r.texto, /AAAA11/);
  assert.deepEqual(r.ferramentas.map(e => e.ferramenta), ['varrer_oportunidades']);
});

test('pesquisa vai pelo Gemini com Google Search e traz fontes', async () => {
  const { tk } = tkFicticio();
  const { f, chamadas } = fakeFetch({
    'api.anthropic.com/v1/messages': [
      { content: [{ type: 'tool_use', id: 't1', name: 'pesquisar_fontes', input: { pergunta: 'proventos AAAA11 novembro' } }], stop_reason: 'tool_use' },
      { content: [{ type: 'text', text: 'Segundo o RI, R$ 0,80 por cota.' }], stop_reason: 'end_turn' },
    ],
    '/v1beta/models?pageSize': [{ models: [{ name: 'models/gemini-3.8-flash' }] }],
    ':generateContent': [{ candidates: [{ content: { parts: [{ text: 'Provento de R$ 0,80 anunciado.' }] },
      groundingMetadata: { groundingChunks: [{ web: { uri: 'https://ri.exemplo.com/fato', title: 'RI Exemplo' } }] } }] }],
  });
  const r = await conversar({ texto: 'Proventos de AAAA11?', historico: [], tk, cfg: CLAUDE, chaves: { anthropic: 'k', gemini: 'g' }, fetch: f });
  assert.deepEqual(r.fontes, [{ titulo: 'RI Exemplo', url: 'https://ri.exemplo.com/fato' }]);
  const g = chamadas.find(c => c.url.includes(':generateContent'))!;
  assert.deepEqual(g.body.tools, [{ google_search: {} }]);
});

test('sem chaves: erro claro; falha depois de proposta não duplica no outro provedor', async () => {
  const { tk } = tkFicticio();
  await assert.rejects(conversar({ texto: 'oi', historico: [], tk, cfg: CONFIG_PADRAO, chaves: {}, fetch: fakeFetch({}).f }), /Nenhuma chave/);
  const { tk: tk2, propostas } = tkFicticio();
  const { f, chamadas } = fakeFetch({
    'api.anthropic.com/v1/messages': [
      { content: [{ type: 'tool_use', id: 't1', name: 'propor_lancamento', input: { tipo: 'aporte', data: '2026-11-03', valor: 500 } }], stop_reason: 'tool_use' },
      { status: 500, json: { error: 'x' } },
    ],
  });
  await assert.rejects(conversar({ texto: 'Aportei 500', historico: [], tk: tk2, cfg: CLAUDE, chaves: { anthropic: 'k', gemini: 'g' }, fetch: f }), /proposta/);
  assert.equal(propostas.length, 1);
  assert.ok(!chamadas.some(c => c.url.includes('generativelanguage')));
});

test('Claude sem crédito + Gemini sobrecarregado: tenta de novo uma vez e troca de modelo', async () => {
  const { tk } = tkFicticio();
  const { f, chamadas } = fakeFetch({
    'api.anthropic.com': [{ status: 400, json: { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } } }],
    '/v1beta/models?pageSize': [{ models: [{ name: 'models/gemini-3.8-flash' }, { name: 'models/gemini-3.6-flash' }, { name: 'models/gemini-3.5-flash-lite' }] }],
    ':generateContent': [
      { status: 503, json: { error: { code: 503, message: 'This model is currently experiencing high demand.' } } },
      { status: 503, json: { error: { code: 503, message: 'high demand' } } },
      { candidates: [{ content: { role: 'model', parts: [{ text: 'Senhor, aqui está.' }] } }] },
    ],
  });
  const r = await conversar({ texto: 'oi', historico: [], tk, cfg: { ...CLAUDE, economico: false }, chaves: { anthropic: 'sem-credito', gemini: 'g' }, fetch: f });
  assert.equal(r.provedor, 'Gemini');
  assert.equal(r.modelo, 'gemini-3.6-flash');
  const gens = chamadas.filter(c => c.url.includes(':generateContent')).map(c => c.url.match(/models\/([^:]+)/)![1]);
  assert.deepEqual(gens, ['gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.6-flash']);
});

test('limite (429) troca de modelo na hora e o modelo esgotado fica de fora nas próximas', async () => {
  const { tk } = tkFicticio();
  const { f, chamadas } = fakeFetch({
    '/v1beta/models?pageSize': [{ models: [{ name: 'models/gemini-3.8-flash' }, { name: 'models/gemini-3.5-flash-lite' }] }],
    ':generateContent': [
      { status: 429, json: { error: { code: 429, message: 'Quota exceeded for metric generate_content_free_tier_requests, limit: 20 PerDay' } } },
      { candidates: [{ content: { role: 'model', parts: [{ text: 'Resposta 1' }] } }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 50, thoughtsTokenCount: 30 } },
      { candidates: [{ content: { role: 'model', parts: [{ text: 'Resposta 2' }] } }] },
    ],
  });
  const r = await conversar({ texto: 'analise aberta', historico: [], tk, cfg: CONFIG_PADRAO, chaves: { gemini: 'g' }, fetch: f });
  assert.equal(r.modelo, 'gemini-3.8-flash');
  assert.deepEqual(r.uso, { entrada: 900, saida: 80 });                 // raciocínio conta como saída
  const r2 = await conversar({ texto: 'outra', historico: [], tk, cfg: CONFIG_PADRAO, chaves: { gemini: 'g' }, fetch: f });
  assert.equal(r2.modelo, 'gemini-3.8-flash');
  const gens = chamadas.filter(c => c.url.includes(':generateContent'));
  assert.deepEqual(gens.map(c => c.url.match(/models\/([^:]+)/)![1]), ['gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.8-flash']);
  // saída limitada e raciocínio baixo nos Gemini 3+
  assert.equal(gens[1].body.generationConfig.maxOutputTokens, 900);
  assert.equal(gens[1].body.generationConfig.thinkingConfig.thinkingLevel, 'low');
});

test('todos os modelos no limite: mensagem diz que as respostas locais seguem funcionando', async () => {
  const { tk } = tkFicticio();
  const q = { status: 429, json: { error: { code: 429, message: 'Resource exhausted' } } };
  const { f } = fakeFetch({
    '/v1beta/models?pageSize': [{ models: [{ name: 'models/gemini-3.8-flash' }, { name: 'models/gemini-3.5-flash-lite' }] }],
    ':generateContent': [q, q],
  });
  await assert.rejects(conversar({ texto: 'x', historico: [], tk, cfg: CONFIG_PADRAO, chaves: { gemini: 'g' }, fetch: f }), /respostas locais continuam/);
});

test('pesquisa repetida vem do cache, sem chamar o Google', async () => {
  const { tk } = tkFicticio();
  const mem = new Map<string, string>();
  tk.memo = { get: async k => mem.get(k) ?? null, set: async (k, v) => { mem.set(k, v); } };
  const resp = () => [
    { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'pesquisar_fontes', args: { pergunta: 'Proventos AAAA11' } } }] } }] },
    { candidates: [{ content: { parts: [{ text: 'R$ 0,80' }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://ri.x/f', title: 'RI' } }] } }] },
    { candidates: [{ content: { role: 'model', parts: [{ text: 'Senhor, R$ 0,80.' }] } }] },
  ];
  const { f, chamadas } = fakeFetch({ '/v1beta/models?pageSize': [{ models: [{ name: 'models/gemini-3.8-flash' }] }], ':generateContent': [...resp(), resp()[0], resp()[2]] });
  await conversar({ texto: 'a', historico: [], tk, cfg: CONFIG_PADRAO, chaves: { gemini: 'g' }, fetch: f });
  const r = await conversar({ texto: 'b', historico: [], tk, cfg: CONFIG_PADRAO, chaves: { gemini: 'g' }, fetch: f });
  assert.equal(chamadas.filter(c => c.body?.tools?.[0]?.google_search).length, 1);
  assert.ok(r.ferramentas.some(e => e.ferramenta === 'cache'));
  assert.deepEqual(r.fontes, [{ titulo: 'RI', url: 'https://ri.x/f' }]);
});

test('mensagem de erro final é clara quando tudo falha', async () => {
  const { tk } = tkFicticio();
  const { f } = fakeFetch({
    'api.anthropic.com': [{ status: 401, json: { error: { message: 'invalid x-api-key' } } }],
    '/v1beta/models?pageSize': [{ models: [{ name: 'models/gemini-3.8-flash' }] }],
    ':generateContent': [{ status: 403, json: { error: { message: 'API key not valid' } } }],
  });
  await assert.rejects(conversar({ texto: 'oi', historico: [], tk, cfg: CLAUDE, chaves: { anthropic: 'outra', gemini: 'g' }, fetch: f }),
    (e: Error) => /Claude: chave inválida/.test(e.message) && /Gemini: chave inválida/.test(e.message));
});
