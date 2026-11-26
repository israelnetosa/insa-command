import { relatorioNucleo } from './relatorio.ts';
// M.A.N.U.E.L. · respostas locais (0 tokens)
//
// As perguntas do dia a dia (leitura da carteira, onde aplicar um aporte, zona de ataque, Magic Number,
// marcos, renda, um ativo, lançamentos simples) são respondidas pelo próprio motor do app, sem chamar IA.
// A IA fica para o que exige raciocínio aberto ou pesquisa na web.

import type { Toolkit, Resultado } from './manuel';

const brl = (n: number) => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number | null | undefined) => n == null ? '—' : `${n > 0 ? '+' : ''}${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const num = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** Minúsculas e sem acentos, para casar intenções. */
export function normalizar(t: string) {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

/** "1.500,50" → 1500.5 · "98,5" → 98.5 · "98.50" → 98.5 · "2 mil" → 2000 · "1,5k" → 1500 */
export function lerValor(s: string): number | null {
  const m = s.match(/(\d[\d.,]*)\s*(mil|k)?\b/);
  if (!m) return null;
  let x = m[1].replace(/[.,]$/, '');
  if (x.includes(',')) x = x.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(x)) x = x.replace(/\./g, '');
  const v = Number(x) * (m[2] ? 1000 : 1);
  return Number.isFinite(v) ? v : null;
}

// Perguntas que pedem opinião, pesquisa ou fatos externos: vão para a IA.
const PEDE_IA = /\b(noticia|mercado|o que (voce )?acha|fato relevante|resultado trimestral|balanco|data.?com|anunci|pesquis|por ?que|opiniao|vale a pena|compar|setor|macro|selic|juro|inflacao|ipca|guidance|internet|fonte|explique|explica|risco de|cenario|deveria|recomenda|melhor fii|melhor acao|analise (completa|profunda|fundamentalista))/;
const TICKER = /\b([a-z]{4}\d{1,2})\b/g;

// Humor de J.A.R.V.I.S.: uma tirada curta no fim, nunca no lugar do dado. Varia por dia e pergunta, sem sorteio.
const TIRADAS: Record<string, string[]> = {
  // simular_aporte: sem tirada — o parecer do Board termina no veredito
  zona: ['Preço abaixo do teto não é ordem de compra; a fila do alvo manda.', 'Margem de segurança registrada. Alocação continua pela regra.'],
  magic_number: ['Cada cota reinvestida reduz o custo de capital do próximo aporte.'],
  projecao: ['Projeção depende de premissas de DY e aporte; não é garantia.', 'Sensibilidade principal: constância do aporte.'],
  proximos_passos: ['Execução mensal sem desvio vale mais que timing.'],
  renda: ['Renda ainda é marginal frente ao patrimônio; o motor é o aporte.', 'DRIP integral até a meta. Nenhum provento consumido.'],
  varrer_oportunidades: ['Fila por distância ao alvo; empate técnico favorece BTLG11, depois CMIG4.'],
  focar_ativo: ['Dados na mesa. A decisão é sua.'],
  propor_lancamento: ['Proposta pronta. Só grava com a sua confirmação.'],
  requer_ia: ['Pergunta de análise: exige a IA (consome tokens).'],
};
function comTirada(resposta: string, chave: string, t: string, agora: Date) {
  const lista = TIRADAS[chave]; if (!lista?.length) return resposta;
  const n = [...(t + agora.toISOString().slice(0, 10))].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return `${resposta}\n${lista[n % lista.length]}`;
}

function hojeBRT(agora: Date) { return new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10); }

/**
 * @param estrito modo econômico: sem o prefixo "ia:", NUNCA chama a IA. O que o motor não sabe responder
 *                vira um panorama com próximos passos e a dica de como acionar a IA.
 */
export async function responderLocal(texto: string, tk: Toolkit, agora = new Date(), estrito = false): Promise<Resultado | null> {
  const t = normalizar(texto);
  if (!t || t.startsWith('ia:') || t.startsWith('/ia')) return null;   // o Senhor pediu a IA explicitamente
  const ok = (resposta: string, ferramenta: string, propostas: number[] = []): Resultado => ({
    texto: comTirada(resposta, ferramenta, t, agora), provedor: 'Local', modelo: 'motor do app', propostas, fontes: [],
    ferramentas: [{ ferramenta, ok: true, resumo: '0 tokens' }], uso: { entrada: 0, saida: 0 },
  });

  // 1. Lançamentos declarados ("comprei 10 BTLG11 a 98,50") → proposta para confirmar
  const lanc = await lancamento(t, tk, agora, texto);
  if (lanc) return ok(lanc.texto, 'propor_lancamento', [lanc.id]);
  if (/\b(comprei|vendi|recebi|aportei|depositei|transferi|apliquei|resgatei)\b/.test(t)) {
    if (!estrito) return null;   // não entendi os números: a IA interpreta
    return ok(['Não consegui ler os números desse lançamento. Formatos que entendo sem IA:',
      '- comprei 3 BTLG11 a 97,80 (opcional: com custos de 0,50)', '- vendi 2 ITUB4 a 40', '- recebi R$ 12,35 do MXRF11 ontem', '- aportei 500',
      'Ou use o Registrar, ou envie "ia: <sua frase>" para a IA interpretar (gasta tokens).'].join('\n'), 'ajuda_lancamento');
  }

  if (PEDE_IA.test(t)) {
    if (!estrito) return null;
    return ok(['Essa pergunta pede pesquisa ou opinião, e isso só a IA faz (gasta tokens).',
      `Para acionar, envie: ia: ${texto.trim().slice(0, 120)}`,
      'Sem IA eu respondo: leitura do dia, próximos passos, onde aplicar R$ X, zona de ataque, Magic Number, marcos, renda e um ativo (ex.: "e o BTLG11?").'].join('\n'), 'requer_ia');
  }
  const s = await tk.state();
  const posicoes: any[] = s.posicoes || [];
  const fase = (s.fases || []).find((f: any) => f.id === s.missao?.fase?.id);

  // Próximos passos rumo a um alvo de renda ("o que fazer para chegar a 25/mês?", "analisar a carteira")
  const passos = async (cabecalho?: string) => {
    const mi = s.missao;
    const alvoTxt = t.match(/(\d[\d.,]*)\s*(?:reais\s*)?(?:\/|por|ao|de renda (?:por|ao))\s*mes/);
    const alvo = (alvoTxt ? lerValor(alvoTxt[1]) : null) ?? mi.proximo_marco;
    const ref = s.totais.renda_referencia ?? s.totais.renda_mes_estimada;
    const falta = Math.max(0, alvo - ref);
    const aporte = Number(s.aporte_mensal) || 0;
    const sim = await tk.simular(aporte);
    const add = Number(sim.renda_mensal_adicional_estimada) || 0;
    const oc = sim.ordem ?? {};
    const compras = [oc.renda_fixa > 0 ? `${brl(oc.renda_fixa)} em RF` : '', oc.compra ? `${oc.compra.qtd} ${oc.compra.ticker}` : ''].filter(Boolean).join(' + ');
    return [
      cabecalho ?? '',
      `Renda hoje ${brl(ref)}/mês; alvo ${brl(alvo)}/mês${falta ? `: faltam ${brl(falta)}/mês.` : ': alvo já alcançado.'}`,
      `Próximo aporte (${brl(aporte)}): ${compras || 'nenhum destino'}${add ? ` → +${brl(add)}/mês` : ''}.`,
      falta && add ? (add >= falta ? 'Esse aporte sozinho fecha o alvo.' : `No ritmo atual, ~${Math.ceil(falta / add)} aporte(s) até o alvo (os proventos reinvestidos aceleram).`) : '',
      (oc.bloqueios ?? []).slice(0, 3).map((b: string) => `- ${b}`).join('\n'),
      `Magic Number (só FIIs, bancos e energia): próximo ${s.magic?.proximo ?? '—'}.`,
    ].filter(Boolean).join('\n');
  };
  if (/(proximos? passos?|analis|alcanc|chegar (a|em|nos?|aos?)|bater (a|o|os)|o que (fazer|faco|fazemos)|plano de acao|como (chego|chegar|acelero|acelerar))/.test(t))
    return ok(await passos(), 'proximos_passos');

  // 2. Onde aplicar um aporte
  const valor = /r\$|\d/.test(t) ? lerValor(t.replace(/\b[a-z]{4}\d{1,2}\b/g, '')) : null;
  const ehProjecao = /(marco|meta|projec|quanto tempo|quando (vou|chego|atinj|alcan|bato|chegarei))/.test(t);
  if (!ehProjecao && ((valor != null && /(aplic|invest|aport|coloc|compr|distribu|aloc|gastar|usar)/.test(t)) ||
      /(onde aplic|onde invist|plano de compra|o que compr|onde compr|onde coloc|caixa parado|soldado ocioso)/.test(t))) {
    const v = valor ?? (Number(s.aporte_mensal) || 0);
    const sim = await tk.simular(v);
    return ok(relatorioNucleo(s, sim.ordem, v, { rendaExtra: sim.renda_mensal_adicional_estimada }), 'simular_aporte');
  }

  // 3. Oportunidades / mais atrasados
  if (/(oportunidad|varr|atrasad|prioridad|o que esta para tras|fila de compra)/.test(t)) {
    const o = s.ordem_mensal ?? s.plano ?? {};
    const fila: any[] = o.fila ?? [];
    if (!fila.length) return ok('Nenhum bloco de renda variável abaixo do alvo e fora do teto: o próximo aporte vai para renda fixa.', 'varrer_oportunidades');
    const nomes = new Map((s.matriz?.blocos ?? []).map((b: any) => [b.id, b.nome]));
    return ok(['Fila da matriz 5x20 (bloco mais distante abaixo do alvo primeiro; dentro dele, abaixo do PM e sem alta >2% no dia):',
      ...fila.map((f: any, i: number) => `${i + 1}. ${nomes.get(f.bloco) ?? f.bloco}: ${num(f.distancia_pp)} pp abaixo · ${(f.candidatos ?? []).map((c: any) => `${c.ticker} ${brl(c.preco)} (${pct(c.desconto_pm)} vs PM${c.fomo ? ', FOMO' : ''})`).join(' · ') || 'sem ativo elegível'}`),
      ...(o.bloqueios ?? []).map((b: string) => `- ${b}`),
    ].join('\n'), 'varrer_oportunidades');
  }

  // 4. Zona de ataque
  if (/(zona|ataque|barat|desconto|abaixo do teto|teto bazin|preco teto)/.test(t)) {
    const at = posicoes.filter(p => p.zona === 'ataque');
    const neu = posicoes.filter(p => p.zona === 'neutra');
    const esp = posicoes.filter(p => p.zona === 'espera');
    const fmt = (p: any) => `${p.ticker} ${brl(p.preco)} (PM ${brl(p.preco_medio)}${p.teto_bazin ? `, teto ${brl(p.teto_bazin)}` : ''})`;
    return ok([
      at.length ? `Em zona de ataque: ${at.map(fmt).join('; ')}.` : 'Nenhum ativo em zona de ataque agora.',
      neu.length ? `Neutros (abaixo do teto): ${neu.map(p => p.ticker).join(', ')}.` : '',
      esp.length ? `Em espera (acima do teto): ${esp.map(p => p.ticker).join(', ')}.` : '',
      'Zona de ataque = abaixo do teto Bazin e perto do preço médio ou na metade inferior das 52 semanas.',
    ].filter(Boolean).join('\n'), 'zona');
  }

  // 5. Magic Number
  if (/(magic|magico|bola de neve)/.test(t)) {
    const m = s.magic || {};
    const lista = posicoes.filter(p => p.magic).sort((a, b) => a.magic.custo_faltante - b.magic.custo_faltante);
    return ok([
      `Magic Number ativo em ${m.ativos?.length ? m.ativos.join(', ') : 'nenhum ativo ainda'}. Próximo a ativar: ${m.proximo ?? '—'}.`,
      ...lista.slice(0, 6).map(p => `- ${p.ticker}: ${p.qtd}/${p.magic.magic} cotas (${num(p.magic.progresso)}%)${p.magic.ativo ? ' · ATIVO' : ` · faltam ${p.magic.faltam} = ${brl(p.magic.custo_faltante)}`}`),
      `Para ativar todos: ${brl(m.custo_total)}. Hoje os proventos compram ${num(m.cotas_por_mes)} cota/mês sozinhos.`,
      m.sem_provento?.length ? `Sem provento cadastrado: ${m.sem_provento.join(', ')}.` : '',
    ].filter(Boolean).join('\n'), 'magic_number');
  }

  // 6. Marcos e projeção
  if (/(marco|meta|projec|quanto tempo|quando (vou|chego|atinj|alcan|bato|chegarei)|independencia|liberdade financeira)/.test(t)) {
    const mi = s.missao; const base = s.projecao?.marcos?.base || [];
    const prox = base.find((x: any) => x.renda >= mi.proximo_marco) ?? base[0];
    const quando = (m: number | null) => m == null ? 'além de 60 anos' : m < 12 ? `${m} meses` : `${(m / 12).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos`;
    return ok([
      `Renda de referência ${brl(s.totais.renda_referencia)}/mês. Próximo marco: ${brl(mi.proximo_marco)}/mês (${num(mi.progresso_marco)}%, faltam ${brl(mi.falta_marco)}).`,
      prox ? `No cenário base (DY 7,1%, aporte ${brl(s.aporte_mensal)}/mês, reinvestindo): marco em ~${quando(prox.meses)}.` : '',
      base.length ? `Marcos no cenário base: ${base.map((x: any) => `${brl(x.renda)} em ${quando(x.meses)}`).join(' · ')}.` : '',
      `Meta final: ${brl(mi.meta_mensal)}/mês (${num(mi.progresso_meta)}%). É projeção, não promessa.`,
    ].filter(Boolean).join('\n'), 'projecao');
  }

  // 7. Renda e proventos
  if (/(renda|provento|dividend|quanto (recebo|ganho|rende)|calendario)/.test(t)) {
    const top = [...posicoes].sort((a, b) => b.renda_mes_estimada - a.renda_mes_estimada).slice(0, 5);
    const mes = (s.calendario || [])[new Date(agora.getTime() - 3 * 3600_000).getUTCMonth()];
    return ok([
      `Renda estimada ${brl(s.totais.renda_mes_estimada)}/mês (DY da carteira ${num(s.totais.dy_carteira)}%). Recebido nos últimos 12 meses: ${brl(s.totais.renda_12m_recebida)}.`,
      mes ? `Este mês (${mes.mes}): recebido ${brl(mes.recebido)}, estimado ${brl(mes.estimado)}.` : '',
      `Maiores pagadores: ${top.map(p => `${p.ticker} ${brl(p.renda_mes_estimada)}`).join(' · ')}.`,
      'Datas-com e anúncios novos: pergunte "ia: proventos anunciados de <ticker>" para eu pesquisar.',
    ].filter(Boolean).join('\n'), 'renda');
  }

  // 8. Um ativo específico (pergunta curta com ticker)
  const tickers = [...t.matchAll(TICKER)].map(m => m[1].toUpperCase());
  if (tickers.length === 1 && t.length <= 70) {
    const tic = tickers[0];
    const p = posicoes.find(x => x.ticker === tic);
    const q = await tk.cotacao(tic).catch(() => null);
    const alvo = fase?.pesos?.[tic] ?? 0;
    if (!p && !q) return estrito ? ok(`Não encontrei ${tic} na carteira nem cotação. Para pesquisar, envie: ia: ${texto.trim().slice(0, 100)}`, 'focar_ativo') : null;
    if (!p) return ok(`${tic} não está na carteira. Cotação: ${brl(q.preco)} (${pct(q.variacao)} no dia, ${q.fonte}). Alvo na fase: ${num(alvo)}%.`, 'focar_ativo');
    return ok([
      `${tic}: ${num(p.qtd)} cotas · PM ${brl(p.preco_medio)}${p.pm_estimado ? ' (estimado)' : ''} · preço ${brl(q?.preco ?? p.preco)} (${pct(q?.variacao ?? p.var_dia)} no dia).`,
      `Valor ${brl(p.valor)} · resultado ${brl(p.resultado)} (${pct(p.resultado_pct)}) · peso ${num(p.peso)}% / alvo ${num(alvo)}% · zona ${p.zona}${p.teto_bazin ? ` · teto ${brl(p.teto_bazin)}` : ''}.`,
      `Renda ${brl(p.renda_mes_estimada)}/mês (YoC ${num(p.yoc)}%).${p.magic ? ` Magic Number ${p.qtd}/${p.magic.magic}${p.magic.ativo ? ' · ATIVO' : ` · faltam ${p.magic.faltam} (${brl(p.magic.custo_faltante)})`}.` : ''}`,
    ].join('\n'), 'focar_ativo');
  }

  // 9. Leitura do dia
  if (/(resumo|leitura|status|situac|panorama|briefing|relatorio|como (esta|anda|vai|ficou)|^(bom dia|boa tarde|boa noite|ola|oi)\b|carteira hoje|hoje)/.test(t)) {
    const tot = s.totais;
    const o = s.ordem_mensal ?? s.plano;
    const pc = posicoes.find(p => p.ticker === o?.compra?.ticker);
    const rendaExtra = pc && pc.qtd ? (pc.renda_mes_estimada / pc.qtd) * o.compra.qtd : 0;
    return ok(`Leitura ${s.em_pregao ? 'com o pregão aberto' : 'com o pregão fechado'}.\n` + relatorioNucleo(s, o, Number(s.aporte_mensal) || 0, { rendaExtra }),
      tot.resultado_dia > 0.5 ? 'leitura_alta' : tot.resultado_dia < -0.5 ? 'leitura_baixa' : 'leitura');
  }
  if (!estrito) return null;
  // Modo econômico: sem "ia:" a IA nunca é chamada. Devolve o panorama com os próximos passos.
  return ok((await passos()) + '\nPara uma análise aberta da IA (gasta tokens), comece a mensagem com "ia:".', 'proximos_passos');
}

/** Reconhece lançamentos simples escritos em português e prepara a proposta (nunca grava). */
async function lancamento(t: string, tk: Toolkit, agora: Date, original: string) {
  const data = /\bontem\b/.test(t) ? hojeBRT(new Date(agora.getTime() - 86400_000))
    : (t.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? hojeBRT(agora));
  let mov: any = null;
  let m = t.match(/\b(comprei|vendi)\s+(\d+)\s+(?:cotas?\s+|acoes\s+|acao\s+)?(?:de\s+|do\s+|da\s+)?([a-z]{4}\d{1,2})\s+(?:a|por|@|cada|ao preco de|pagando)\s*(?:r\$\s*)?(\d[\d.,]*)/);
  if (m) {
    const custos = t.match(/(?:custo|taxa|corretagem)s?\s*(?:de\s*)?(?:r\$\s*)?(\d[\d.,]*)/);
    mov = { tipo: m[1] === 'comprei' ? 'compra' : 'venda', data, ticker: m[3].toUpperCase(), qtd: Number(m[2]), preco: lerValor(m[4]), custos: custos ? lerValor(custos[1]) ?? 0 : 0 };
  }
  m = mov ? null : t.match(/\brecebi\s+(?:r\$\s*)?(\d[\d.,]*)\s+(?:reais\s+)?(?:de\s+)?(?:(rendimentos?|dividendos?|jcp|juros sobre capital)\s+)?(?:de|do|da)?\s*([a-z]{4}\d{1,2})/);
  if (m) {
    const sub = !m[2] ? (m[3].endsWith('11') ? 'rendimento' : 'dividendo') : m[2].startsWith('rend') ? 'rendimento' : m[2].startsWith('div') ? 'dividendo' : 'jcp';
    mov = { tipo: 'provento', data, ticker: m[3].toUpperCase(), valor: lerValor(m[1]), subtipo: sub };
  }
  m = mov ? null : t.match(/\b(aportei|depositei|transferi)\s+(?:r\$\s*)?(\d[\d.,]*\s*(?:mil|k)?)/);
  if (m && !/\b[a-z]{4}\d{1,2}\b/.test(t) && !/(renda fixa|tesouro|selic|cdb|cdi)/.test(t)) mov = { tipo: 'aporte', data, valor: lerValor(m[2]) };
  // renda fixa (bloco Caixa da matriz): aplicar/resgatar movimenta o caixa; "tenho X em renda fixa" registra saldo existente
  m = mov ? null : t.match(/\b(apliquei|investi|coloquei|resgatei|saquei|tenho|rendeu|rendimento de)\s+(?:r\$\s*)?(\d[\d.,]*\s*(?:mil|k)?)\s*(?:reais\s*)?(?:(?:em|na|no|da|do|de)\s+)?(?:a\s+)?(renda fixa|tesouro(?: selic)?|selic|cdb|cdi|reserva)/);
  if (m) {
    const v = lerValor(m[2]);
    mov = /^(resgatei|saquei)/.test(m[1]) ? { tipo: 'resgate_rf', data, valor: v }
      : /^(tenho|rendeu|rendimento)/.test(m[1]) ? { tipo: 'rendimento_rf', data, valor: v }
      : { tipo: 'aplicacao_rf', data, valor: v };
  }
  if (!mov || [mov.qtd, mov.preco, mov.valor].some(v => v === null || (v !== undefined && !(v > 0)))) return null;

  const p = await tk.propor(mov, original.slice(0, 280));
  const L = p.lancamento, e = p.efeito;
  const desc = L.tipo === 'aporte' ? `aporte de ${brl(L.valor)}`
    : L.tipo === 'aplicacao_rf' ? `aplicação de ${brl(L.valor)} em renda fixa (sai do caixa)`
    : L.tipo === 'resgate_rf' ? `resgate de ${brl(L.valor)} da renda fixa (volta ao caixa)`
    : L.tipo === 'rendimento_rf' ? `saldo/rendimento de ${brl(L.valor)} em renda fixa`
    : L.tipo === 'provento' ? `provento (${L.subtipo}) de ${brl(L.valor)} de ${L.ticker}`
    : `${L.tipo} de ${L.qtd} ${L.ticker} a ${brl(L.preco)}${L.custos ? ` + custos ${brl(L.custos)}` : ''}`;
  return { id: p.id, texto: [
    `Preparei a proposta: ${desc}, em ${L.data.split('-').reverse().join('/')}.`,
    `Caixa: ${brl(e.caixa.antes)} → ${brl(e.caixa.depois)}.${e.posicao ? ` ${e.posicao.ticker}: ${num(e.posicao.qtd.antes)} → ${num(e.posicao.qtd.depois)} cotas, PM ${brl(e.posicao.preco_medio.antes)} → ${brl(e.posicao.preco_medio.depois)}.` : ''}`,
    ...(e.avisos || []).map((a: string) => `Aviso: ${a}`),
    'Nada foi gravado. Clique em "Confirmar" para lançar no razão.',
  ].join('\n') };
}
