// Converte um arquivo de migração (ou o snapshot antigo, mesmo formato de posições) em lançamentos do razão.

const TICKER = /^[A-Z0-9]{4,7}$/;

/** Valida o arquivo e aplica as correções feitas na tela de conferência (qtd, PM, caixa). */
export function validarMigracao(arquivo: any, posEditadas?: any[], caixa?: unknown, dataBase?: unknown) {
  if (!arquivo || typeof arquivo !== 'object' || !Array.isArray(arquivo.posicoes)) throw new Error('Arquivo de migração inválido.');
  if (arquivo.formato && arquivo.formato !== 'insa-migracao') throw new Error('Formato desconhecido.');
  const mig = structuredClone(arquivo);
  const db = String(dataBase ?? mig.data_base ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(db)) throw new Error('Data-base inválida.');
  mig.data_base = db;
  if (Array.isArray(posEditadas)) {
    const ed = new Map(posEditadas.map((p: any) => [String(p.ticker), p]));
    mig.posicoes = mig.posicoes
      .map((p: any) => { const e = ed.get(p.ticker); return e ? { ...p, qtd: Number(e.qtd), preco_medio: Number(e.preco_medio) } : p; })
      .filter((p: any) => p.qtd > 0);
  }
  for (const p of mig.posicoes) {
    if (!TICKER.test(String(p.ticker))) throw new Error(`Ticker inválido: ${p.ticker}`);
    if (!(Number(p.qtd) > 0 && Number(p.qtd) < 1e7)) throw new Error(`Quantidade inválida em ${p.ticker}.`);
    if (!(Number(p.preco_medio) > 0 && Number(p.preco_medio) < 1e6)) throw new Error(`Preço médio inválido em ${p.ticker}.`);
  }
  const c = caixa === undefined ? mig.caixa : caixa;
  mig.caixa = c === null || c === '' ? 0 : Number(c);
  if (!Number.isFinite(mig.caixa) || mig.caixa < 0 || mig.caixa > 1e8) throw new Error('Caixa inválido.');
  return mig;
}

export function seedMovements(snap: any) {
  const data = snap.data_base as string;
  const origem = snap.fonte ? String(snap.fonte).slice(0, 120) : 'snapshot';
  const movs: any[] = snap.posicoes.map((p: any) => ({
    data, tipo: 'saldo_inicial', ticker: p.ticker, qtd: Number(p.qtd), preco: Number(p.preco_medio),
    estimado: p.pm_estimado ? 1 : 0, origem: 'importacao',
    nota: `Saldo inicial · ${p.pm_fonte ?? origem}`,
  }));
  if (snap.caixa) movs.push({ data, tipo: 'ajuste_caixa', valor: Number(snap.caixa), origem: 'importacao', nota: 'Caixa disponível na data-base da migração' });
  return movs;
}

export function seedAssets(snap: any) {
  return snap.posicoes.map((p: any) => ({
    ticker: p.ticker, nome: p.nome, tipo: p.tipo, setor: p.setor, camada: p.camada,
    dy_ref: p.dy, div_mes_cota: p.div_mes_cota, mensal: p.mensal ? 1 : 0,
    teto_bazin: p.teto_bazin, hi52: p.hi52, lo52: p.lo52,
  }));
}

export function seedSettings(snap: any) {
  const s: Record<string, unknown> = {
    fases: snap.fases, regras: snap.regras, lentes: snap.lentes, missao: snap.missao,
    aporte_mensal: snap.aporte_mensal, calendario_estimado: snap.calendario_estimado,
  };
  if (snap.estrategia) s.estrategia = snap.estrategia;
  if (snap.historico_legado) s.historico_legado = { fonte: snap.fonte, aportes: snap.aportes_legado, transacoes: snap.historico_legado };
  for (const k of Object.keys(s)) if (s[k] === undefined) delete s[k];
  return s;
}
