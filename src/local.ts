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

function hojeBRT(agora: Date) { return new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10); }

/**
 * @param estrito modo econômico: sem o prefixo "ia:", NUNCA chama a IA. O que o motor não sabe responder
 *                vira um panorama com próximos passos e a dica de como acionar a IA.
 */
export async function responderLocal(texto: string, tk: Toolkit, agora = new Date(), estrito = false): Promise<Resultado | null> {
  const t = normalizar(texto);
  if (!t || t.startsWith('ia:') || t.startsWith('/ia')) return null;   // o Senhor pediu a IA explicitamente
  const ok = (resposta: string, ferramenta: string, propostas: number[] = []): Resultado => ({
    texto: resposta, provedor: 'Local', modelo: 'motor do app', propostas, fontes: [],
    ferramentas: [{ ferramenta, ok: true, resumo: '0 tokens' }], uso: { entrada: 0, saida: 0 },
  });

  // 1. Lançamentos declarados ("comprei 10 BTLG11 a 98,50") → proposta para confirmar
  const lanc = await lancamento(t, tk, agora, texto);
  if (lanc) return ok(lanc.texto, 'propor_lancamento', [lanc.id]);
  if (/\b(comprei|vendi|recebi|aportei|depositei|transferi)\b/.test(t)) {
    if (!estrito) return null;   // não entendi os números: a IA interpreta
    return ok(['Senhor, não consegui ler os números desse lançamento. Formatos que entendo sem IA:',
      '- comprei 3 BTLG11 a 97,80 (opcional: com custos de 0,50)', '- vendi 2 ITUB4 a 40', '- recebi R$ 12,35 do MXRF11 ontem', '- aportei 500',
      'Ou use o Registrar, ou envie "ia: <sua frase>" para a IA interpretar (gasta tokens).'].join('\n'), 'ajuda_lancamento');
  }

  if (PEDE_IA.test(t)) {
    if (!estrito) return null;
    return ok(['Senhor, essa pergunta pede pesquisa ou opinião, e isso só a IA faz (gasta tokens).',
      `Para acionar, envie: ia: ${texto.trim().slice(0, 120)}`,
      'Sem IA eu respondo: leitura do dia, próximos passos, onde aplicar R$ X, zona de ataque, Magic Number, marcos, renda e um ativo (ex.: "e o BTLG11?").'].join('\n'), 'requer_ia');
  }
  const s = await tk.state();
  const posicoes: any[] = s.posicoes || [];
  const fase = (s.fases || []).find((f: any) => f.id === s.missao?.fase?.id);
  const filaFase = () => {
    const total = s.totais.investido + s.totais.caixa;
    return Object.entries(fase?.pesos ?? {}).map(([tk2, w]: any) => {
      const p = posicoes.find(x => x.ticker === tk2);
      return { ticker: tk2, alvo: w, peso: p?.peso ?? 0, atraso: (w / 100) * total - (p?.valor ?? 0), zona: p?.zona ?? 'fora da carteira', var: p?.var_dia ?? null };
    }).sort((a, b) => b.atraso - a.atraso);
  };

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
    const compras = (sim.compras || []).map((c: any) => `${c.qtd} ${c.ticker}`).join(' + ');
    const fila = filaFase().slice(0, 3);
    return [
      cabecalho ?? '',
      `Senhor, renda hoje ${brl(ref)}/mês; alvo ${brl(alvo)}/mês${falta ? `: faltam ${brl(falta)}/mês.` : ': alvo já alcançado.'}`,
      `Próximo aporte (${brl(aporte)} + caixa ${brl(s.totais.caixa)}): ${compras || 'nenhuma cota inteira cabe'}${add ? ` → +${brl(add)}/mês` : ''}.`,
      falta && add ? (add >= falta ? 'Esse aporte sozinho fecha o alvo.' : `No ritmo atual, ~${Math.ceil(falta / add)} aporte(s) até o alvo (os proventos reinvestidos aceleram).`) : '',
      fila.length ? `Fila da ${fase?.nome ?? 'fase'}: ${fila.map((f, i) => `${i + 1}. ${f.ticker} (peso ${num(f.peso)}%/alvo ${num(f.alvo)}%, faltam ${brl(Math.max(0, f.atraso))}, ${f.zona})`).join(' · ')}.` : '',
      `${mi.em_ataque} pelotão(ões) em zona de ataque · Magic Number: próximo ${s.magic?.proximo ?? '—'}.`,
    ].filter(Boolean).join('\n');
  };
  if (/(proximos? passos?|analis|alcanc|chegar (a|em|nos?|aos?)|bater (a|o|os)|o que (fazer|faco|fazemos)|plano de acao|como (chego|chegar|acelero|acelerar))/.test(t))
    return ok(await passos(), 'proximos_passos');

  // 2. Onde aplicar um aporte
  const valor = /r\$|\d/.test(t) ? lerValor(t.replace(/\b[a-z]{4}\d{1,2}\b/g, '')) : null;
  const ehProjecao = /(marco|meta|projec|quanto tempo|quando (vou|chego|atinj|alcan|bato|chegarei))/.test(t);
  if (!ehProjecao && ((valor != null && /(aplic|invest|aport|coloc|compr|distribu|aloc|gastar|usar)/.test(t)) ||
      /(onde aplic|onde invist|plano de compra|o que compr|onde compr|onde coloc|caixa parado|soldado ocioso)/.test(t))) {
    const v = valor ?? 0;
    const r = await tk.simular(v);
    const linhas = (r.compras || []).map((c: any) => `- ${c.ticker}: ${c.qtd} cota${c.qtd > 1 ? 's' : ''} × ${brl(c.preco)} = ${brl(c.valor)}`);
    return ok([
      `Senhor, com ${brl(r.disponivel)} disponíveis (${v ? `aporte de ${brl(v)} + ` : ''}caixa de ${brl(r.caixa_atual)}), na fase ${r.fase ?? '—'}:`,
      linhas.length ? linhas.join('\n') : '- Nenhuma cota inteira cabe nesse valor agora.',
      `Sobra: ${brl(r.sobra)}. Renda adicional estimada: ${brl(r.renda_mensal_adicional_estimada)}/mês.`,
      'Regra: ativo mais atrasado contra o peso-alvo, cotas inteiras, sem vendas. Cotações com até ~15 min de atraso.',
    ].join('\n'), 'simular_aporte');
  }

  // 3. Oportunidades / mais atrasados
  if (/(oportunidad|varr|atrasad|prioridad|o que esta para tras|fila de compra)/.test(t)) {
    const fila = filaFase().slice(0, 6);
    if (!fila.length) return ok('Senhor, a fase atual não tem pesos-alvo cadastrados. Veja a aba Estratégia.', 'varrer_oportunidades');
    return ok([`Senhor, fila da fase ${fase?.nome ?? '—'} (mais atrasado primeiro):`,
      ...fila.map((f, i) => `${i + 1}. ${f.ticker}: peso ${num(f.peso)}% / alvo ${num(f.alvo)}% · faltam ${brl(Math.max(0, f.atraso))} · zona ${f.zona}${f.var != null ? ` · dia ${pct(f.var)}` : ''}`),
    ].join('\n'), 'varrer_oportunidades');
  }

  // 4. Zona de ataque
  if (/(zona|ataque|barat|desconto|abaixo do teto|teto bazin|preco teto)/.test(t)) {
    const at = posicoes.filter(p => p.zona === 'ataque');
    const neu = posicoes.filter(p => p.zona === 'neutra');
    const esp = posicoes.filter(p => p.zona === 'espera');
    const fmt = (p: any) => `${p.ticker} ${brl(p.preco)} (PM ${brl(p.preco_medio)}${p.teto_bazin ? `, teto ${brl(p.teto_bazin)}` : ''})`;
    return ok([
      at.length ? `Senhor, em zona de ataque: ${at.map(fmt).join('; ')}.` : 'Senhor, nenhum pelotão em zona de ataque agora.',
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
      `Senhor, Magic Number ativo em ${m.ativos?.length ? m.ativos.join(', ') : 'nenhum pelotão ainda'}. Próximo a ativar: ${m.proximo ?? '—'}.`,
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
      `Senhor, renda de referência ${brl(s.totais.renda_referencia)}/mês. Próximo marco: ${brl(mi.proximo_marco)}/mês (${num(mi.progresso_marco)}%, faltam ${brl(mi.falta_marco)}).`,
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
      `Senhor, renda estimada ${brl(s.totais.renda_mes_estimada)}/mês (DY da carteira ${num(s.totais.dy_carteira)}%). Recebido nos últimos 12 meses: ${brl(s.totais.renda_12m_recebida)}.`,
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
    if (!p && !q) return estrito ? ok(`Senhor, não encontrei ${tic} na carteira nem cotação. Para pesquisar, envie: ia: ${texto.trim().slice(0, 100)}`, 'focar_ativo') : null;
    if (!p) return ok(`Senhor, ${tic} não está na carteira. Cotação: ${brl(q.preco)} (${pct(q.variacao)} no dia, ${q.fonte}). Alvo na fase: ${num(alvo)}%.`, 'focar_ativo');
    return ok([
      `Senhor, ${tic}: ${num(p.qtd)} cotas · PM ${brl(p.preco_medio)}${p.pm_estimado ? ' (estimado)' : ''} · preço ${brl(q?.preco ?? p.preco)} (${pct(q?.variacao ?? p.var_dia)} no dia).`,
      `Valor ${brl(p.valor)} · resultado ${brl(p.resultado)} (${pct(p.resultado_pct)}) · peso ${num(p.peso)}% / alvo ${num(alvo)}% · zona ${p.zona}${p.teto_bazin ? ` · teto ${brl(p.teto_bazin)}` : ''}.`,
      `Renda ${brl(p.renda_mes_estimada)}/mês (YoC ${num(p.yoc)}%).${p.magic ? ` Magic Number ${p.qtd}/${p.magic.magic}${p.magic.ativo ? ' · ATIVO' : ` · faltam ${p.magic.faltam} (${brl(p.magic.custo_faltante)})`}.` : ''}`,
    ].join('\n'), 'focar_ativo');
  }

  // 9. Leitura do dia
  if (/(resumo|leitura|status|situac|panorama|briefing|relatorio|como (esta|anda|vai|ficou)|^(bom dia|boa tarde|boa noite|ola|oi)\b|carteira hoje|hoje)/.test(t)) {
    const tot = s.totais;
    const mov = posicoes.filter(p => p.var_dia != null).sort((a, b) => b.var_dia - a.var_dia);
    const alta = mov[0], baixa = mov[mov.length - 1];
    return ok([
      `Senhor, leitura ${s.em_pregao ? 'com o pregão aberto' : 'com o pregão fechado'}:`,
      `- Patrimônio ${brl(tot.patrimonio)} (ativos ${brl(tot.investido)}, caixa ${brl(tot.caixa)}). Dia: ${tot.resultado_dia >= 0 ? '+' : ''}${brl(tot.resultado_dia)}.`,
      `- Renda estimada ${brl(tot.renda_mes_estimada)}/mês · próximo marco ${brl(s.missao.proximo_marco)} (${num(s.missao.progresso_marco)}%).`,
      alta && baixa && alta !== baixa ? `- Destaques: ${alta.ticker} ${pct(alta.var_dia)}, ${baixa.ticker} ${pct(baixa.var_dia)}.` : '',
      `- ${s.missao.em_ataque} pelotão(ões) em zona de ataque. Magic Number: próximo ${s.magic?.proximo ?? '—'}.`,
      (s.alertas || []).length ? `- Alertas: ${(s.alertas || []).slice(0, 3).map((a: any) => a.texto).join(' ')}` : '',
    ].filter(Boolean).join('\n'), 'leitura');
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
  if (m && !/\b[a-z]{4}\d{1,2}\b/.test(t)) mov = { tipo: 'aporte', data, valor: lerValor(m[2]) };
  if (!mov || [mov.qtd, mov.preco, mov.valor].some(v => v === null || (v !== undefined && !(v > 0)))) return null;

  const p = await tk.propor(mov, original.slice(0, 280));
  const L = p.lancamento, e = p.efeito;
  const desc = L.tipo === 'aporte' ? `aporte de ${brl(L.valor)}`
    : L.tipo === 'provento' ? `provento (${L.subtipo}) de ${brl(L.valor)} de ${L.ticker}`
    : `${L.tipo} de ${L.qtd} ${L.ticker} a ${brl(L.preco)}${L.custos ? ` + custos ${brl(L.custos)}` : ''}`;
  return { id: p.id, texto: [
    `Senhor, preparei a proposta: ${desc}, em ${L.data.split('-').reverse().join('/')}.`,
    `Caixa: ${brl(e.caixa.antes)} → ${brl(e.caixa.depois)}.${e.posicao ? ` ${e.posicao.ticker}: ${num(e.posicao.qtd.antes)} → ${num(e.posicao.qtd.depois)} cotas, PM ${brl(e.posicao.preco_medio.antes)} → ${brl(e.posicao.preco_medio.depois)}.` : ''}`,
    ...(e.avisos || []).map((a: string) => `Aviso: ${a}`),
    'Nada foi gravado. Clique em "Confirmar" para lançar no razão.',
  ].join('\n') };
}
