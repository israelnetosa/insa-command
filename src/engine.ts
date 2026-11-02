// INSA Command · motor da carteira
// Funções puras: recebem o livro-razão e devolvem o estado derivado.
// Nada aqui faz I/O, por isso é testável e roda igual no servidor e nos testes.

export type Tipo =
  | 'saldo_inicial' | 'compra' | 'venda' | 'provento' | 'aporte' | 'retirada'
  | 'desdobramento' | 'grupamento' | 'taxa' | 'ajuste_caixa';

export interface Movement {
  id?: number;
  data: string;            // AAAA-MM-DD
  tipo: Tipo;
  ticker?: string | null;
  qtd?: number | null;
  preco?: number | null;
  valor?: number | null;
  custos?: number | null;
  subtipo?: string | null;
  estimado?: number | boolean | null;
  nota?: string | null;
  anulado?: number | boolean | null;
}

export interface Asset {
  ticker: string; nome?: string; tipo?: string; setor?: string; camada?: string;
  dy_ref?: number; div_mes_cota?: number; mensal?: number | boolean;
  teto_bazin?: number; hi52?: number; lo52?: number;
}

export interface Quote {
  ticker: string; preco: number; fechamento_ant?: number | null;
  fonte: string; cotado_em: number; buscado_em: number; status?: string;
}

export interface Fase { id: string; nome: string; ate: number | null; dy: number; pesos: Record<string, number>; }
export interface Missao { meta_mensal: number; dy_missao: number; marcos: number[]; teto_concentracao: number; }

export class LedgerError extends Error {}

const r2 = (n: number) => Math.round(n * 100) / 100;
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

interface Lot { qtd: number; pm: number; pmEstimado: boolean; realizado: number; proventos: number; }

/** Aplica o livro-razão e devolve lotes por ativo, caixa e proventos. Lança LedgerError se o razão for inválido. */
export function replay(movs: Movement[]) {
  const ordem = movs
    .filter(m => !m.anulado)
    .slice()
    .sort((a, b) => a.data.localeCompare(b.data) || (a.id ?? 0) - (b.id ?? 0));

  const lots = new Map<string, Lot>();
  let caixa = 0;
  let aportes = 0;
  const proventos: { data: string; ticker: string; valor: number; subtipo?: string | null }[] = [];
  const lot = (t: string) => {
    let l = lots.get(t);
    if (!l) { l = { qtd: 0, pm: 0, pmEstimado: false, realizado: 0, proventos: 0 }; lots.set(t, l); }
    return l;
  };

  for (const m of ordem) {
    const t = m.ticker?.toUpperCase();
    const q = Number(m.qtd ?? 0);
    const p = Number(m.preco ?? 0);
    const v = Number(m.valor ?? 0);
    const c = Number(m.custos ?? 0);
    const need = (cond: boolean, msg: string) => { if (!cond) throw new LedgerError(`${m.data} ${m.tipo} ${t ?? ''}: ${msg}`); };

    switch (m.tipo) {
      case 'saldo_inicial': {
        need(!!t && q > 0 && p >= 0, 'saldo inicial exige ticker, qtd > 0 e preço');
        const l = lot(t!);
        const custo = l.qtd * l.pm + q * p;
        l.qtd += q; l.pm = custo / l.qtd; l.pmEstimado = l.pmEstimado || !!m.estimado;
        break;
      }
      case 'compra': {
        need(!!t && q > 0 && p > 0, 'compra exige ticker, qtd > 0 e preço > 0');
        const l = lot(t!);
        const custo = l.qtd * l.pm + q * p + c;     // custos entram no preço médio (regra da Receita)
        l.qtd += q; l.pm = custo / l.qtd;
        caixa -= q * p + c;
        break;
      }
      case 'venda': {
        need(!!t && q > 0 && p > 0, 'venda exige ticker, qtd > 0 e preço > 0');
        const l = lot(t!);
        need(l.qtd + 1e-9 >= q, `venda de ${q} acima da posição (${l.qtd})`);
        l.realizado += q * p - c - q * l.pm;        // preço médio não muda na venda
        l.qtd -= q; if (l.qtd < 1e-9) { l.qtd = 0; }
        caixa += q * p - c;
        break;
      }
      case 'provento': {
        need(!!t && v > 0, 'provento exige ticker e valor > 0');
        lot(t!).proventos += v;
        caixa += v;
        proventos.push({ data: m.data, ticker: t!, valor: v, subtipo: m.subtipo });
        break;
      }
      case 'desdobramento': case 'grupamento': {
        need(!!t && q > 0, 'evento exige ticker e fator > 0');
        const l = lot(t!);
        const f = m.tipo === 'desdobramento' ? q : 1 / q;
        l.qtd *= f; l.pm /= f;
        break;
      }
      case 'aporte': need(v > 0, 'aporte exige valor > 0'); caixa += v; aportes += v; break;
      case 'retirada': need(v > 0, 'retirada exige valor > 0'); caixa -= v; aportes -= v; break;
      case 'taxa': need(v > 0, 'taxa exige valor > 0'); caixa -= v; break;
      case 'ajuste_caixa': caixa += v; break;
      default: throw new LedgerError(`tipo desconhecido: ${(m as Movement).tipo}`);
    }
  }
  return { lots, caixa: r2(caixa), aportes: r2(aportes), proventos };
}

export type Zona = 'ataque' | 'neutra' | 'espera' | 'sem_dados';

/**
 * Zona de ataque, regra transparente (lente Buffett/Barsi + Simons):
 *  ataque  → preço ≤ teto Bazin E (preço ≤ preço médio +2% OU na metade inferior do range de 52 semanas)
 *  espera  → preço acima do teto Bazin, ou ativo sem teto (não pagador)
 *  neutra  → o resto
 */
export function zona(preco: number, pm: number, a?: Asset): Zona {
  if (!preco || !a) return 'sem_dados';
  const teto = a.teto_bazin ?? 0;
  if (teto <= 0 || preco > teto) return 'espera';
  const pos52 = a.hi52 && a.lo52 && a.hi52 > a.lo52 ? (preco - a.lo52) / (a.hi52 - a.lo52) : 1;
  if (preco <= pm * 1.02 || pos52 <= 0.5) return 'ataque';
  return 'neutra';
}

export function faseAtual(patrimonio: number, fases: Fase[]): Fase | undefined {
  return fases.find(f => f.ate == null || patrimonio < f.ate) ?? fases[fases.length - 1];
}

/** Sugestão de compra: aloca o caixa em cotas inteiras, sempre no ativo mais atrasado contra o peso-alvo. Nunca vende. */
export function planoCompras(
  posicoes: { ticker: string; valor: number; preco: number }[],
  caixa: number, fase: Fase | undefined, precos: Record<string, number>,
) {
  if (!fase || caixa <= 0) return { compras: [], sobra: r2(Math.max(caixa, 0)) };
  const valor: Record<string, number> = {};
  for (const p of posicoes) valor[p.ticker] = p.valor;
  const alvos = Object.entries(fase.pesos).filter(([t]) => precos[t] > 0);
  const somaPesos = alvos.reduce((s, [, w]) => s + w, 0) || 1;
  const compras: Record<string, number> = {};
  let sobra = caixa;
  for (let guard = 0; guard < 500; guard++) {
    const total = Object.values(valor).reduce((s, v) => s + v, 0) + sobra;
    const candidatos = alvos
      .map(([t, w]) => ({ t, gap: (w / somaPesos) * total - (valor[t] ?? 0), preco: precos[t] }))
      .filter(c => c.preco <= sobra && c.gap > 0)
      .sort((a, b) => b.gap - a.gap);
    const c = candidatos[0];
    if (!c) break;
    compras[c.t] = (compras[c.t] ?? 0) + 1;
    valor[c.t] = (valor[c.t] ?? 0) + c.preco;
    sobra -= c.preco;
  }
  return {
    compras: Object.entries(compras).map(([ticker, qtd]) => ({ ticker, qtd, preco: precos[ticker], valor: r2(qtd * precos[ticker]) })),
    sobra: r2(sobra),
  };
}

/** Meses até cada marco de renda mensal, com reinvestimento total. */
export function projecao(patrimonio: number, aporte: number, marcos: number[]) {
  const cenarios = {
    conservador: { dy: 6.0, valorizacao: 0 },
    base:        { dy: 7.1, valorizacao: 2 },
    otimista:    { dy: 8.0, valorizacao: 4 },
  };
  const out: Record<string, { renda: number; meses: number | null }[]> = {};
  for (const [nome, c] of Object.entries(cenarios)) {
    const yMes = c.dy / 100 / 12;
    const gMes = Math.pow(1 + c.valorizacao / 100, 1 / 12) - 1;
    let pat = patrimonio;
    const res: { renda: number; meses: number | null }[] = marcos.map(m => ({ renda: m, meses: null }));
    for (let mes = 1; mes <= 12 * 60; mes++) {
      pat = pat * (1 + gMes) + pat * yMes + aporte;
      const renda = pat * yMes;
      for (const r of res) if (r.meses == null && renda >= r.renda) r.meses = mes;
      if (res.every(r => r.meses != null)) break;
    }
    out[nome] = res;
  }
  return { cenarios, marcos: out };
}

/** Estado completo do cockpit. */
export function buildState(input: {
  movements: Movement[]; assets: Asset[]; quotes: Quote[];
  fases: Fase[]; missao: Missao; aporte_mensal: number;
  calendario_estimado?: Record<string, number[]>; agora?: Date;
}) {
  const agora = input.agora ?? new Date();
  const { lots, caixa, aportes, proventos } = replay(input.movements);
  const A = new Map(input.assets.map(a => [a.ticker, a]));
  const Q = new Map(input.quotes.map(q => [q.ticker, q]));

  const linhas = [...lots.entries()].filter(([, l]) => l.qtd > 0).map(([t, l]) => {
    const a = A.get(t); const q = Q.get(t);
    const preco = q?.preco ?? l.pm;
    const valor = l.qtd * preco;
    const custo = l.qtd * l.pm;
    const rendaEst = l.qtd * (a?.div_mes_cota ?? 0);
    return {
      ticker: t, nome: a?.nome ?? t, tipo: a?.tipo, setor: a?.setor ?? 'Outros', camada: a?.camada,
      qtd: r2(l.qtd), preco_medio: r2(l.pm), pm_estimado: l.pmEstimado,
      preco: r2(preco), cotacao_ok: !!q,
      var_dia: q?.fechamento_ant ? r2((q.preco / q.fechamento_ant - 1) * 100) : null,
      var_dia_valor: q?.fechamento_ant ? r2(l.qtd * (q.preco - q.fechamento_ant)) : 0,
      atraso_s: q ? Math.max(0, Math.round((agora.getTime() - q.cotado_em) / 1000)) : null,
      fonte: q?.fonte ?? 'sem cotação · usando preço médio',
      valor: r2(valor), custo: r2(custo),
      resultado: r2(valor - custo), resultado_pct: custo ? r2((valor / custo - 1) * 100) : 0,
      realizado: r2(l.realizado), proventos_total: r2(l.proventos),
      renda_mes_estimada: r2(rendaEst), yoc: custo ? r2(rendaEst * 12 / custo * 100) : 0,
      teto_bazin: a?.teto_bazin ?? null, mensal: !!a?.mensal,
      zona: zona(preco, l.pm, a), peso: 0,
    };
  });

  const investido = linhas.reduce((s, l) => s + l.valor, 0);
  const patrimonio = investido + caixa;
  for (const l of linhas) l.peso = investido ? r2(l.valor / investido * 100) : 0;
  linhas.sort((a, b) => b.valor - a.valor);

  // Renda: recebida (razão) vs estimada (referência)
  const ha12 = new Date(agora); ha12.setUTCMonth(ha12.getUTCMonth() - 12);
  const corte = ha12.toISOString().slice(0, 10);
  const recebida12 = proventos.filter(p => p.data > corte).reduce((s, p) => s + p.valor, 0);
  const rendaEstMes = linhas.reduce((s, l) => s + l.renda_mes_estimada, 0);

  const porMes = MESES.map((mes, i) => {
    const ano = agora.getUTCFullYear();
    const recebido = proventos
      .filter(p => { const d = new Date(p.data + 'T12:00:00Z'); return d.getUTCFullYear() === ano && d.getUTCMonth() === i; })
      .reduce((s, p) => s + p.valor, 0);
    const estimado = Object.entries(input.calendario_estimado ?? {})
      .reduce((s, [t, arr]) => s + (lots.get(t)?.qtd ? (arr[i] ?? 0) : 0), 0);
    return { mes, recebido: r2(recebido), estimado: r2(estimado) };
  });

  // Marco: usamos a renda estimada até haver 12 meses de recebimentos reais
  const rendaRef = recebida12 > 0 && proventos.some(p => p.data <= corte) ? recebida12 / 12 : rendaEstMes;
  const proxMarco = input.missao.marcos.find(m => m > rendaRef) ?? input.missao.meta_mensal;
  const maior = linhas[0];
  const fase = faseAtual(patrimonio, input.fases);
  const precos: Record<string, number> = {};
  for (const [t, q] of Q) precos[t] = q.preco;
  for (const l of linhas) precos[l.ticker] ??= l.preco;

  const alertas: { nivel: 'critico' | 'atencao' | 'info'; texto: string }[] = [];
  for (const l of linhas) {
    if (l.var_dia != null && Math.abs(l.var_dia) >= 3) alertas.push({ nivel: 'critico', texto: `${l.ticker} variou ${l.var_dia.toFixed(2)}% contra o fechamento anterior.` });
  }
  const semCot = linhas.filter(l => !l.cotacao_ok).map(l => l.ticker);
  if (semCot.length) alertas.push({ nivel: 'atencao', texto: semCot.length === linhas.length
    ? 'Nenhuma cotação disponível ainda: valores calculados pelo preço médio.'
    : `Sem cotação para ${semCot.join(', ')}: valor pelo preço médio.` });
  if (maior && maior.peso > input.missao.teto_concentracao) alertas.push({ nivel: 'atencao', texto: `${maior.ticker} pesa ${maior.peso}% — acima do teto de ${input.missao.teto_concentracao}%.` });
  if (caixa > 0 && caixa >= Math.min(...linhas.map(l => l.preco).filter(Boolean), Infinity)) alertas.push({ nivel: 'info', texto: `${brl(caixa)} em caixa: soldado ocioso. Veja o plano de compras.` });
  if (linhas.some(l => l.pm_estimado)) alertas.push({ nivel: 'info', texto: 'Há preços médios estimados (importação). Corrija com as notas de corretagem para precisão total.' });

  return {
    gerado_em: agora.toISOString(),
    totais: {
      patrimonio: r2(patrimonio), investido: r2(investido), caixa,
      aportes_liquidos: aportes,
      resultado: r2(linhas.reduce((s, l) => s + l.resultado, 0)),
      realizado: r2(linhas.reduce((s, l) => s + l.realizado, 0)),
      resultado_dia: r2(linhas.reduce((s, l) => s + l.var_dia_valor, 0)),
      n_ativos: linhas.length,
      renda_mes_estimada: r2(rendaEstMes),
      renda_12m_recebida: r2(recebida12),
      renda_referencia: r2(rendaRef),
      dy_carteira: investido ? r2(rendaEstMes * 12 / investido * 100) : 0,
    },
    missao: {
      meta_mensal: input.missao.meta_mensal,
      progresso_meta: r2(rendaRef / input.missao.meta_mensal * 100),
      proximo_marco: proxMarco,
      progresso_marco: r2(rendaRef / proxMarco * 100),
      falta_marco: r2(proxMarco - rendaRef),
      maior_posicao: maior ? { ticker: maior.ticker, peso: maior.peso, teto: input.missao.teto_concentracao } : null,
      em_ataque: linhas.filter(l => l.zona === 'ataque').length,
      fase: fase ? { id: fase.id, nome: fase.nome } : null,
    },
    posicoes: linhas,
    calendario: porMes,
    plano: planoCompras(linhas, caixa, fase, precos),
    projecao: projecao(patrimonio, input.aporte_mensal, input.missao.marcos),
    alertas,
  };
}
