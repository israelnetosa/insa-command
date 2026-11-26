/**
 * Matriz de alocação 5x20 do M.A.N.U.E.L. e as 6 regras invioláveis.
 *
 * Blocos: Caixa/RF · Bancos · Energia · FIIs (10% tijolo + 10% papel) · Crescimento/ETFs/Outros — alvo 20%, teto 25%.
 * Tudo é medido sobre o patrimônio total (ativos + caixa da corretora + renda fixa).
 * Nada aqui vende ativo: rebalanceamento só com aporte novo e proventos.
 */

export type BlocoId = 'caixa' | 'bancos' | 'energia' | 'fiis' | 'crescimento';

export interface Matriz {
  blocos: { id: BlocoId; nome: string; alvo: number; teto: number; minimo?: number; tickers: string[] }[];
  fii_tijolo: string[]; fii_papel: string[];   // sub-alvo 10% + 10% dentro dos FIIs
  trava_caixa_aporte: number;                   // % do aporte que vai para RF quando o caixa está abaixo do mínimo
  anti_fomo_var: number;                        // alta do dia (%) que tira o ativo da frente da fila
  pulverizacao_ate: number;                     // R$: abaixo disto, nenhum ticker novo e no máximo 2 destinos
  congelados: string[];                         // ativos individuais sem aporte (sem venda)
  marcos: number[]; meta_mensal: number; dy_alvo: number;
  taxa_rf_anual: number;   // CDI/Selic bruta (% a.a.) para estimar o rendimento da renda fixa
  ir_rf: number;           // IR sobre o rendimento (%)
}

export const MATRIZ_PADRAO: Matriz = {
  blocos: [
    { id: 'caixa', nome: 'Caixa / Renda Fixa', alvo: 20, teto: 25, minimo: 15, tickers: [] },
    { id: 'bancos', nome: 'Bancos', alvo: 20, teto: 25, tickers: ['ITUB4', 'BBAS3'] },
    { id: 'energia', nome: 'Energia Elétrica', alvo: 20, teto: 25, tickers: ['CMIG4', 'TAEE11', 'EQTL3'] },
    { id: 'fiis', nome: 'FIIs', alvo: 20, teto: 25, tickers: ['BTLG11', 'MXRF11'] },
    { id: 'crescimento', nome: 'Crescimento / ETFs', alvo: 20, teto: 25, tickers: ['WEGE3', 'NDIV11', 'RADL3', 'BITC11'] },
  ],
  fii_tijolo: ['BTLG11'], fii_papel: ['MXRF11'],
  trava_caixa_aporte: 50, anti_fomo_var: 2, pulverizacao_ate: 25000,
  congelados: [],   // descongelados em 26/11/2026: BBAS3 e BITC11 voltam à fila dos seus blocos
  marcos: [100, 500, 1000, 5000, 20000], meta_mensal: 20000, dy_alvo: 10,
  taxa_rf_anual: 13.75, ir_rf: 15,
};

/** Magic Number só vale para FIIs e pagadores maduros (bancos, energia). Nunca para crescimento. */
export const BLOCOS_DIVIDENDO: BlocoId[] = ['fiis', 'bancos', 'energia'];

const r2 = (n: number) => Math.round(n * 100) / 100;

export function matrizDe(parcial?: Partial<Matriz> | null): Matriz {
  return { ...MATRIZ_PADRAO, ...(parcial ?? {}), blocos: parcial?.blocos ?? MATRIZ_PADRAO.blocos };
}

/** Em que bloco o ticker mora: lista da matriz; se não estiver lá, deduz pelo tipo/setor do ativo. */
export function blocoDe(ticker: string, m: Matriz, info?: { tipo?: string | null; setor?: string | null }): BlocoId {
  const b = m.blocos.find(x => x.tickers.includes(ticker));
  if (b) return b.id;
  const tipo = String(info?.tipo ?? '').toLowerCase(), setor = String(info?.setor ?? '').toLowerCase();
  if (tipo.includes('fii') || /11$/.test(ticker) && /imob|log[ií]st|receb|papel|tijolo/.test(setor)) return 'fiis';
  if (/banc|financ/.test(setor)) return 'bancos';
  if (/energ|el[eé]tric|transmiss|saneam/.test(setor)) return 'energia';
  return 'crescimento';
}

export interface PosicaoM { ticker: string; valor: number; preco: number; preco_medio: number; var_dia: number | null; tipo?: string | null; setor?: string | null; qtd: number }

export interface BlocoStatus {
  id: BlocoId; nome: string; valor: number; peso: number; alvo: number; teto: number; minimo?: number;
  distancia_pp: number;                       // alvo − peso (positivo = abaixo do alvo)
  status: 'congelado' | 'abaixo' | 'no_alvo' | 'vermelho' | 'verde';
  tickers: string[];
}

/** Retrato dos 5 blocos. Caixa = caixa da corretora + renda fixa. */
export function retratoMatriz(pos: PosicaoM[], caixa: number, rf: number, m: Matriz) {
  const pat = pos.reduce((s, p) => s + p.valor, 0) + caixa + rf;
  const blocos: BlocoStatus[] = m.blocos.map(b => {
    const membros = b.id === 'caixa' ? [] : pos.filter(p => blocoDe(p.ticker, m, p) === b.id);
    const valor = b.id === 'caixa' ? caixa + rf : membros.reduce((s, p) => s + p.valor, 0);
    const peso = pat ? (valor / pat) * 100 : 0;
    const status: BlocoStatus['status'] = b.id === 'caixa'
      ? (peso >= (b.minimo ?? 15) ? 'verde' : 'vermelho')
      : peso > b.teto ? 'congelado' : peso < b.alvo - 0.5 ? 'abaixo' : 'no_alvo';
    return { id: b.id, nome: b.nome, valor: r2(valor), peso: r2(peso), alvo: b.alvo, teto: b.teto, minimo: b.minimo, distancia_pp: r2(b.alvo - peso), status, tickers: membros.map(p => p.ticker) };
  });
  const fii = blocos.find(b => b.id === 'fiis');
  const sub = {
    tijolo: r2(pat ? pos.filter(p => m.fii_tijolo.includes(p.ticker)).reduce((s, p) => s + p.valor, 0) / pat * 100 : 0),
    papel: r2(pat ? pos.filter(p => m.fii_papel.includes(p.ticker)).reduce((s, p) => s + p.valor, 0) / pat * 100 : 0),
  };
  const caixaB = blocos.find(b => b.id === 'caixa')!;
  return { patrimonio: r2(pat), blocos, fii_sub: fii ? sub : null, caixa_ok: caixaB.status === 'verde', caixa_pct: caixaB.peso };
}

export interface Ordem {
  aporte: number; patrimonio_antes: number; patrimonio_depois: number;
  trava_caixa: boolean;
  renda_fixa: number;                                          // R$ para RF de liquidez diária
  compra: null | { ticker: string; bloco: BlocoId; qtd: number; preco: number; valor: number; motivo: string };
  bloco_alvo: BlocoId | null;
  sobra_para_rf: number;                                       // troco que não compra cota inteira vai para RF
  destinos: number;
  fila: { bloco: BlocoId; distancia_pp: number; candidatos: { ticker: string; desconto_pm: number; var_dia: number | null; preco: number; fomo: boolean }[] }[];
  bloqueios: string[];                                         // o que as travas impediram e por quê
}

/**
 * Ordem de execução de um aporte, respeitando as 6 regras:
 * 1 trava de caixa (<15% → 50% do aporte em RF, sem usar o caixa existente),
 * 2 blocos acima do teto congelados, 3 anti-FOMO (abaixo do PM / em correção primeiro, evita >+2% no dia),
 * 4 magic number fora (aqui não entra), 5 anti-pulverização (sem ticker novo, no máximo Caixa + 1 ativo),
 * 6 nunca vende.
 */
export function ordemAporte(pos: PosicaoM[], caixa: number, rf: number, aporte: number, m: Matriz, precos: Record<string, number> = {}): Ordem {
  const antes = retratoMatriz(pos, caixa, rf, m);
  const patDepois = antes.patrimonio + aporte;
  const bloqueios: string[] = [];
  const trava = !antes.caixa_ok;
  let rfParte = trava ? r2(Math.ceil(aporte * m.trava_caixa_aporte) / 100) : 0;
  if (trava) bloqueios.push(`Trava de caixa: Caixa/RF em ${antes.caixa_pct.toLocaleString('pt-BR')}% (< ${m.blocos[0].minimo ?? 15}%). ${m.trava_caixa_aporte}% do aporte vai para RF e o caixa existente não é usado em renda variável.`);
  // sem trava, só o caixa da corretora que excede o mínimo pode reforçar a compra
  const caixaLivre = trava ? 0 : Math.max(0, Math.min(caixa, caixa + rf - ((m.blocos[0].minimo ?? 15) / 100) * patDepois));
  let orcamento = r2(aporte - rfParte + caixaLivre);

  const pulverizacao = antes.patrimonio < m.pulverizacao_ate;
  const naCarteira = new Set(pos.filter(p => p.qtd > 0).map(p => p.ticker));
  const pesoDepois = (b: BlocoStatus) => (b.valor / patDepois) * 100;
  const filaBlocos = antes.blocos
    .filter(b => b.id !== 'caixa')
    .filter(b => { if (b.status === 'congelado') { bloqueios.push(`${b.nome} em ${b.peso.toLocaleString('pt-BR')}% (> teto ${b.teto}%): congelado para aportes.`); return false; } return true; })
    .map(b => ({ b, dist: r2(b.alvo - pesoDepois(b)) }))
    .filter(x => x.dist > 0)
    .sort((a, z) => z.dist - a.dist);

  const fila: Ordem['fila'] = filaBlocos.map(({ b, dist }) => {
    const def = m.blocos.find(x => x.id === b.id)!;
    let tks = [...new Set([...b.tickers, ...(pulverizacao ? [] : def.tickers)])].filter(t => !m.congelados.includes(t));
    if (pulverizacao) tks = tks.filter(t => naCarteira.has(t));
    if (b.id === 'fiis') {   // 10% tijolo + 10% papel: o sub-bloco mais atrasado na frente
      const pt = antes.fii_sub?.tijolo ?? 0, pp = antes.fii_sub?.papel ?? 0;
      const frente = (10 - pt) >= (10 - pp) ? m.fii_tijolo : m.fii_papel;
      tks.sort((a, z) => Number(frente.includes(z)) - Number(frente.includes(a)));
    }
    const candidatos = tks.map(t => {
      const p = pos.find(x => x.ticker === t);
      const preco = precos[t] ?? p?.preco ?? 0;
      const desconto = p?.preco_medio ? r2((preco / p.preco_medio - 1) * 100) : 0;
      return { ticker: t, desconto_pm: desconto, var_dia: p?.var_dia ?? null, preco, fomo: (p?.var_dia ?? 0) > m.anti_fomo_var };
    }).filter(c => c.preco > 0);
    // anti-FOMO: sem alta >2% no dia na frente; depois abaixo do PM (mais descontado primeiro); depois em correção no dia
    const fiiOrdem = b.id === 'fiis' ? new Map(tks.map((t, i) => [t, i])) : null;
    candidatos.sort((a, z) =>
      Number(a.fomo) - Number(z.fomo)
      || (fiiOrdem ? (fiiOrdem.get(a.ticker)! - fiiOrdem.get(z.ticker)!) : 0)
      || Number(z.desconto_pm < 0) - Number(a.desconto_pm < 0)
      || a.desconto_pm - z.desconto_pm
      || (a.var_dia ?? 0) - (z.var_dia ?? 0));
    return { bloco: b.id, distancia_pp: dist, candidatos };
  });
  for (const f of fila) for (const c of f.candidatos) if (c.fomo && f.candidatos.some(o => !o.fomo)) bloqueios.push(`${c.ticker} subiu ${c.var_dia?.toLocaleString('pt-BR')}% hoje: fora da frente (anti-FOMO).`);
  const congeladosNaFila = antes.blocos.flatMap(b => b.tickers).filter(t => m.congelados.includes(t));
  if (congeladosNaFila.length) bloqueios.push(`${congeladosNaFila.join(' e ')}: congelado${congeladosNaFila.length > 1 ? 's' : ''} individualmente (sem aporte, sem venda).`);

  // escolhe UM ativo (Caixa + 1 RV): o primeiro candidato que cabe no orçamento, bloco a bloco
  let compra: Ordem['compra'] = null, blocoAlvo: BlocoId | null = null;
  for (const f of fila) {
    for (const c of f.candidatos) {
      const qtd = Math.floor((orcamento + 1e-9) / c.preco);
      if (qtd < 1) continue;
      const motivo = [`${m.blocos.find(x => x.id === f.bloco)!.nome} ${f.distancia_pp.toLocaleString('pt-BR')} pp abaixo do alvo`,
        c.desconto_pm < 0 ? `${c.desconto_pm.toLocaleString('pt-BR')}% abaixo do PM` : c.var_dia != null && c.var_dia < 0 ? `em correção (${c.var_dia.toLocaleString('pt-BR')}% no dia)` : 'sem desconto relevante']
        .join(' · ');
      compra = { ticker: c.ticker, bloco: f.bloco, qtd, preco: c.preco, valor: r2(qtd * c.preco), motivo };
      blocoAlvo = f.bloco; break;
    }
    if (compra) break;
  }
  if (!fila.length) bloqueios.push('Nenhum bloco de renda variável abaixo do alvo e fora do teto: o aporte inteiro vai para RF.');
  const gasto = compra?.valor ?? 0;
  const troco = r2(orcamento - gasto);
  // troco do aporte vai para RF; o caixa livre que não foi usado continua onde estava
  const sobraParaRf = r2(Math.max(0, Math.min(troco, aporte - rfParte)));
  rfParte = r2(rfParte + sobraParaRf);
  return {
    aporte: r2(aporte), patrimonio_antes: antes.patrimonio, patrimonio_depois: r2(patDepois), trava_caixa: trava,
    renda_fixa: rfParte, compra, bloco_alvo: blocoAlvo, sobra_para_rf: sobraParaRf,
    destinos: (rfParte > 0 ? 1 : 0) + (compra ? 1 : 0), fila, bloqueios: [...new Set(bloqueios)],
  };
}

/** Radar de escala: distância para cada marco de renda mensal. */
export function radarEscala(rendaMes: number, m: Matriz, aporteMensal = 0, dy = 0) {
  return m.marcos.map(marco => {
    const falta = Math.max(0, marco - rendaMes);
    const capital = dy > 0 ? (falta * 12) / (dy / 100) : null;   // patrimônio extra necessário ao DY atual
    return { marco, atingido: rendaMes >= marco, progresso: r2(Math.min(100, (rendaMes / marco) * 100)), falta: r2(falta), capital_extra: capital != null ? r2(capital) : null };
  });
}

export interface LugarFila {
  ticker: string; posicao: number; bloco: BlocoId;
  grupo: 'proxima' | 'fila' | 'no_alvo' | 'bloco_congelado' | 'ativo_congelado';
  motivo: string;
}

/**
 * Fila completa de compra teórica de TODAS as posições, na ordem em que receberiam dinheiro:
 * 1º o destino da ordem do aporte; depois os blocos abaixo do alvo (mais distante primeiro; dentro deles, anti-FOMO);
 * depois os blocos no alvo; por último os congelados (bloco acima do teto ou ativo congelado), que não recebem aporte.
 */
export function filaCompleta(pos: PosicaoM[], caixa: number, rf: number, m: Matriz, ordem: Ordem | null, precos: Record<string, number> = {}): LugarFila[] {
  const ret = retratoMatriz(pos, caixa, rf, m);
  const nome = (b: BlocoId) => m.blocos.find(x => x.id === b)?.nome ?? b;
  const intra = (b: BlocoStatus) => {
    const lista = pos.filter(p => p.qtd > 0 && blocoDe(p.ticker, m, p) === b.id).map(p => {
      const preco = precos[p.ticker] ?? p.preco;
      return { p, desconto: p.preco_medio ? (preco / p.preco_medio - 1) * 100 : 0, fomo: (p.var_dia ?? 0) > m.anti_fomo_var };
    });
    const frente = b.id === 'fiis' ? (((10 - (ret.fii_sub?.tijolo ?? 0)) >= (10 - (ret.fii_sub?.papel ?? 0))) ? m.fii_tijolo : m.fii_papel) : [];
    return lista.sort((a, z) => Number(a.fomo) - Number(z.fomo) || Number(frente.includes(z.p.ticker)) - Number(frente.includes(a.p.ticker))
      || Number(z.desconto < 0) - Number(a.desconto < 0) || a.desconto - z.desconto || (a.p.var_dia ?? 0) - (z.p.var_dia ?? 0));
  };
  const rv = ret.blocos.filter(b => b.id !== 'caixa');
  const ordemBlocos = [
    ...rv.filter(b => b.status === 'abaixo').sort((a, z) => z.distancia_pp - a.distancia_pp),
    ...rv.filter(b => b.status === 'no_alvo').sort((a, z) => z.distancia_pp - a.distancia_pp),
    ...rv.filter(b => b.status === 'congelado').sort((a, z) => a.peso - z.peso),
  ];
  const out: Omit<LugarFila, 'posicao'>[] = [];
  const congelados: Omit<LugarFila, 'posicao'>[] = [];
  for (const b of ordemBlocos) for (const { p, desconto, fomo } of intra(b)) {
    const pp = b.distancia_pp.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    const dTxt = `${desconto < 0 ? '' : '+'}${desconto.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% vs PM${fomo ? ` · alta de ${p.var_dia?.toLocaleString('pt-BR')}% hoje (anti-FOMO)` : ''}`;
    if (m.congelados.includes(p.ticker)) { congelados.push({ ticker: p.ticker, bloco: b.id, grupo: 'ativo_congelado', motivo: 'ativo congelado: sem aporte, sem venda' }); continue; }
    if (b.status === 'congelado') { congelados.push({ ticker: p.ticker, bloco: b.id, grupo: 'bloco_congelado', motivo: `${nome(b.id)} em ${b.peso.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% (teto ${b.teto}%): sem aporte; proventos vão para a fila` }); continue; }
    out.push({ ticker: p.ticker, bloco: b.id, grupo: b.status === 'no_alvo' ? 'no_alvo' : 'fila',
      motivo: `${nome(b.id)} ${b.status === 'no_alvo' ? (b.peso > b.alvo ? `acima do alvo (${b.peso.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%), abaixo do teto` : 'no alvo') : `${pp} pp abaixo do alvo`} · ${dTxt}` });
  }
  // o destino real da ordem (primeiro que cabe no orçamento) vai na frente
  const alvo = ordem?.compra?.ticker;
  if (alvo) {
    const i = out.findIndex(x => x.ticker === alvo);
    if (i >= 0) { const [x] = out.splice(i, 1); out.unshift({ ...x, grupo: 'proxima', motivo: `próxima compra: ${ordem!.compra!.qtd} cotas (${ordem!.compra!.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) · ${ordem!.compra!.motivo}` }); }
  }
  return [...out, ...congelados].map((x, i) => ({ ...x, posicao: i + 1 }));
}

/** Rendimento mensal líquido da renda fixa: saldo × ((1 + taxa bruta × (1 − IR))^(1/12) − 1). Caixa parado rende 0. */
export function rendaMensalRF(saldoRf: number, m: Matriz): number {
  const liq = (m.taxa_rf_anual / 100) * (1 - m.ir_rf / 100);
  return saldoRf > 0 ? r2(saldoRf * (Math.pow(1 + liq, 1 / 12) - 1)) : 0;
}

/** Alvo individual (% do patrimônio): FIIs 10% tijolo + 10% papel, divididos entre os ativos de cada lado;
 *  nos outros blocos, o alvo do bloco dividido igualmente entre os ativos que estão na carteira. */
export function alvosIndividuais(pos: PosicaoM[], m: Matriz): Record<string, { alvo: number; bloco: BlocoId }> {
  const out: Record<string, { alvo: number; bloco: BlocoId }> = {};
  const vivos = pos.filter(p => p.qtd > 0);
  for (const b of m.blocos) {
    if (b.id === 'caixa') continue;
    const membros = vivos.filter(p => blocoDe(p.ticker, m, p) === b.id).map(p => p.ticker);
    if (!membros.length) continue;
    if (b.id === 'fiis') {
      const tij = membros.filter(t => m.fii_tijolo.includes(t)), pap = membros.filter(t => m.fii_papel.includes(t));
      const outros = membros.filter(t => !tij.includes(t) && !pap.includes(t));
      const lados = [[tij, b.alvo / 2], [pap, b.alvo / 2]] as [string[], number][];
      // FII sem lado definido divide com o lado vazio (ou com o tijolo, se os dois existirem)
      if (outros.length) { if (!pap.length) lados[1][0] = outros; else if (!tij.length) lados[0][0] = outros; else tij.push(...outros); }
      for (const [ts, a] of lados) for (const t of ts) out[t] = { alvo: r2(a / ts.length), bloco: b.id };
      continue;
    }
    for (const t of membros) out[t] = { alvo: r2(b.alvo / membros.length), bloco: b.id };
  }
  return out;
}
