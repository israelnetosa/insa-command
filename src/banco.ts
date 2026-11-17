// Banco via Open Finance (Pluggy → Meu Pluggy → Nubank). SÓ LEITURA: nada aqui grava no razão.
// A chave de API da Pluggy vale 2 h; é gerada na hora a partir do Client ID/Secret (segredos do Worker)
// e guardada só em memória enquanto o Worker estiver quente.

export type Fetch = typeof fetch;
const API = 'https://api.pluggy.ai';

export interface PluggyEnv { PLUGGY_CLIENT_ID?: string; PLUGGY_CLIENT_SECRET?: string; PLUGGY_ITEM_ID?: string; }

let chave: { valor: string; ate: number } | null = null;

export const configurado = (env: PluggyEnv) => !!(env.PLUGGY_CLIENT_ID && env.PLUGGY_CLIENT_SECRET && env.PLUGGY_ITEM_ID);

async function apiKey(env: PluggyEnv, f: Fetch) {
  if (chave && chave.ate > Date.now()) return chave.valor;
  const r = await f(`${API}/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: env.PLUGGY_CLIENT_ID, clientSecret: env.PLUGGY_CLIENT_SECRET }), signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Pluggy recusou o login (${r.status}). Confira PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.`);
  const j: any = await r.json();
  if (!j?.apiKey) throw new Error('Pluggy não devolveu a chave de API.');
  chave = { valor: j.apiKey, ate: Date.now() + 100 * 60_000 };   // vale 2 h; renova antes
  return chave.valor;
}

async function get(env: PluggyEnv, f: Fetch, caminho: string) {
  const r = await f(`${API}${caminho}`, { headers: { 'X-API-KEY': await apiKey(env, f) }, signal: AbortSignal.timeout(20000) });
  if (r.status === 401 || r.status === 403) { chave = null; throw new Error(`Pluggy negou acesso a ${caminho.split('?')[0]} (${r.status}).`); }
  if (!r.ok) throw new Error(`Pluggy respondeu ${r.status} em ${caminho.split('?')[0]}.`);
  return r.json() as Promise<any>;
}

/** Todas as páginas de uma listagem paginada da Pluggy (até 20 páginas). */
async function todas(env: PluggyEnv, f: Fetch, caminho: string) {
  const sep = caminho.includes('?') ? '&' : '?';
  const out: any[] = [];
  for (let p = 1; p <= 20; p++) {
    const j = await get(env, f, `${caminho}${sep}page=${p}&pageSize=500`);
    out.push(...(j?.results ?? []));
    if (!j?.totalPages || p >= j.totalPages) break;
  }
  return out;
}

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const dia = (x: unknown) => (typeof x === 'string' ? x.slice(0, 10) : null);
const ticker = (inv: any) => {
  const c = String(inv?.code ?? '').toUpperCase().trim();
  if (/^[A-Z]{4}\d{1,2}$/.test(c)) return c;
  const m = String(inv?.name ?? '').toUpperCase().match(/\b([A-Z]{4}\d{1,2})\b/);
  return m ? m[1] : null;
};

/** Lê o que o banco mostra: conexão, contas, investimentos e as movimentações de cada investimento. */
export async function lerBanco(env: PluggyEnv, f: Fetch = fetch) {
  if (!configurado(env)) throw new Error('Faltam os segredos PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET e PLUGGY_ITEM_ID.');
  const id = encodeURIComponent(env.PLUGGY_ITEM_ID!);
  const item = await get(env, f, `/items/${id}`);
  const [contas, invs] = await Promise.all([
    get(env, f, `/accounts?itemId=${id}`).then(j => j?.results ?? []),
    todas(env, f, `/investments?itemId=${id}`),
  ]);
  const investimentos = await Promise.all(invs.map(async (inv: any) => {
    const movs = await todas(env, f, `/investments/${encodeURIComponent(inv.id)}/transactions`).catch(() => []);
    return {
      id: inv.id, ticker: ticker(inv), codigo: inv.code ?? null, nome: inv.name ?? null, tipo: inv.type ?? null, subtipo: inv.subtype ?? null,
      quantidade: num(inv.quantity), cotacao: num(inv.value), saldo: num(inv.balance), bruto: num(inv.amount),
      investido: num(inv.amountOriginal), lucro: num(inv.amountProfit), data: dia(inv.date),
      movimentos: movs.map((m: any) => ({ tipo: m.type ?? null, sentido: m.movementType ?? null, data: dia(m.tradeDate ?? m.date),
        quantidade: num(m.quantity), preco: num(m.value), valor: num(m.amount), descricao: m.description ?? null, taxas: m.expenses ?? null })),
    };
  }));
  return {
    conexao: { status: item?.status ?? null, atualizado_em: item?.lastUpdatedAt ?? item?.updatedAt ?? null, instituicao: item?.connector?.name ?? null },
    contas: contas.map((c: any) => ({ id: c.id, tipo: c.type ?? null, subtipo: c.subtype ?? null, nome: c.name ?? null, saldo: num(c.balance) })),
    investimentos,
  };
}

/** Compara as posições do app com as do banco, por ticker. Tolerância de 1 centavo no preço médio. */
export function conferir(posicoes: { ticker: string; qtd: number; preco_medio: number; custo: number }[], banco: Awaited<ReturnType<typeof lerBanco>>) {
  const B = new Map<string, any>();
  for (const i of banco.investimentos) if (i.ticker) {
    const a = B.get(i.ticker);
    B.set(i.ticker, a ? { ...a, quantidade: (a.quantidade ?? 0) + (i.quantidade ?? 0), investido: (a.investido ?? 0) + (i.investido ?? 0) } : i);
  }
  const tickers = [...new Set([...posicoes.map(p => p.ticker), ...B.keys()])].sort();
  const linhas = tickers.map(t => {
    const p = posicoes.find(x => x.ticker === t), b = B.get(t);
    const pmBanco = b?.investido && b?.quantidade ? Math.round(b.investido / b.quantidade * 100) / 100 : null;
    const difQtd = (b?.quantidade ?? 0) - (p?.qtd ?? 0);
    const difPm = pmBanco != null && p ? Math.round((pmBanco - p.preco_medio) * 100) / 100 : null;
    const status = !p ? 'so_no_banco' : !b ? 'so_no_app' : Math.abs(difQtd) > 1e-6 ? 'quantidade' : difPm != null && Math.abs(difPm) > 0.01 ? 'preco_medio' : 'ok';
    return { ticker: t, app: p ? { qtd: p.qtd, pm: p.preco_medio } : null, banco: b ? { qtd: b.quantidade, pm: pmBanco, cotacao: b.cotacao, saldo: b.saldo } : null, dif_qtd: difQtd, dif_pm: difPm, status };
  });
  return { linhas, divergencias: linhas.filter(l => l.status !== 'ok').length, sem_ticker: banco.investimentos.filter(i => !i.ticker).map(i => ({ nome: i.nome, tipo: i.tipo, saldo: i.saldo })) };
}
