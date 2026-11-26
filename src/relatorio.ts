// Relatório obrigatório do M.A.N.U.E.L. (diário ou de aporte):
// 1 STATUS DO NÚCLEO · 2 ALERTAS DE RISCO · 3 ORDEM DE EXECUÇÃO · 4 RADAR DE ESCALA

const brl = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ');
const num = (n: number, d = 2) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: d });
const sinal = (n: number) => (n > 0 ? '+' : '') + brl(n);

/** s = estado (/api/state); ordem = ordemAporte(...) do aporte em análise; aporte = R$ do aporte (0 = só o caixa). */
export function relatorioNucleo(s: any, ordem: any, aporte: number, opts: { rendaExtra?: number } = {}): string {
  const tot = s.totais ?? {}, mz = s.matriz ?? {}, blocos: any[] = mz.blocos ?? [], pos: any[] = s.posicoes ?? [];
  const caixaPct = Number(tot.caixa_rf_pct ?? mz.caixa_pct ?? 0);
  const verde = caixaPct >= 15;

  const status = [
    `- Patrimônio total: ${brl(tot.patrimonio)} (ativos ${brl(tot.investido)} · caixa ${brl(tot.caixa)} · renda fixa ${brl(tot.renda_fixa ?? 0)}).`,
    `- Caixa/RF: ${num(caixaPct)}% — ${verde ? 'VERDE (≥ 15%)' : 'VERMELHO (< 15%)'}.`,
    `- Resultado do dia: ${sinal(tot.resultado_dia)}.`,
    `- Renda passiva mensal: ${brl(tot.renda_passiva_total ?? tot.renda_mes_estimada)} (RV ${brl(tot.renda_mes_estimada)} · RF líq. ${brl(tot.renda_mes_rf ?? 0)}) · DY consolidado ${num(tot.dy_consolidado ?? tot.dy_carteira)}%.`,
    `- Matriz: ${blocos.map(b => `${b.nome.split(' ')[0]} ${num(b.peso, 1)}%`).join(' · ')}.`,
  ];

  const alertas: string[] = [];
  for (const b of blocos) if (b.status === 'congelado') alertas.push(`- ${b.nome} em ${num(b.peso, 1)}% (teto ${b.teto}%): CONGELADO PARA APORTES. Proventos dele vão para blocos abaixo do alvo.`);
  if (!verde) alertas.push(`- Liquidez: Caixa/RF em ${num(caixaPct)}%, abaixo do mínimo de 15%. Trava de caixa ativa: 50% de todo aporte em RF de liquidez diária.`);
  const quedas = pos.filter(p => p.var_dia != null && p.var_dia <= -2).sort((a, b) => a.var_dia - b.var_dia);
  for (const p of quedas) {
    const b = blocos.find(x => (x.tickers ?? []).includes(p.ticker));
    const congel = (mz.regras?.congelados ?? []).includes(p.ticker);
    alertas.push(`- ${p.ticker} ${num(p.var_dia)}% no dia${b?.status === 'congelado' ? ' — bloco congelado, sem compra' : congel ? ' — ativo congelado, sem compra' : ' — oportunidade se o bloco estiver na fila'}.`);
  }
  const altas = pos.filter(p => p.var_dia != null && p.var_dia > 2);
  if (altas.length) alertas.push(`- Anti-FOMO: ${altas.map(p => `${p.ticker} +${num(p.var_dia)}%`).join(', ')} — fora da frente da fila hoje.`);
  if (!alertas.length) alertas.push('- Nenhum bloco acima do teto, liquidez dentro do mínimo e nenhuma queda acima de 2%.');

  const o = ordem ?? {};
  const exec: string[] = [];
  if (aporte > 0) exec.push(`Aporte de ${brl(aporte)}${o.destinos ? ` em ${o.destinos} destino${o.destinos > 1 ? 's' : ''}` : ''}:`);
  if (o.renda_fixa > 0) exec.push(`1. ${brl(o.renda_fixa)} → Renda Fixa liquidez diária (Tesouro Selic / CDB 100% CDI)${o.trava_caixa ? ' — trava de caixa' : ''}${o.sobra_para_rf > 0 ? ` (inclui ${brl(o.sobra_para_rf)} de troco)` : ''}.`);
  if (o.compra) exec.push(`${o.renda_fixa > 0 ? '2' : '1'}. ${brl(o.compra.valor)} → ${o.compra.qtd} × ${o.compra.ticker} a ${brl(o.compra.preco)}, ordem limitada. Motivo: ${o.compra.motivo}.${opts.rendaExtra ? ` Renda +${brl(opts.rendaExtra)}/mês.` : ''}`);
  if (!aporte && !o.compra && !(o.renda_fixa > 0)) exec.push(`Sem aporte informado. Caixa atual de ${brl(tot.caixa)} ${verde ? 'pode ir para o 1º da fila quando completar uma cota' : 'fica parado: com a trava de caixa ele não compra renda variável'}.`);
  const fila: any[] = o.fila ?? [];
  if (fila.length) exec.push(`Fila de blocos: ${fila.map((f: any) => `${(blocos.find(b => b.id === f.bloco)?.nome ?? f.bloco).split(' ')[0]} ${num(f.distancia_pp, 1)} pp abaixo (${(f.candidatos ?? []).slice(0, 2).map((c: any) => c.ticker).join(', ') || 'sem ativo elegível'})`).join(' · ')}.`);
  for (const b of (o.bloqueios ?? []).filter((x: string) => !/^Trava de caixa|CONGELADO|congelado para aportes/.test(x))) exec.push(`- ${b}`);
  exec.push('Sem vendas: rebalanceamento só com aporte novo e proventos.');

  const radar: any[] = s.radar ?? [];
  const ref = Number(tot.renda_referencia ?? tot.renda_mes_estimada) || 0;
  const prox = radar.find(r => !r.atingido);
  const escala = [
    `- Renda de referência (RV + RF líquida): ${brl(ref)}/mês.`,
    ...radar.map(r => `- ${brl(r.marco)}/mês: ${r.atingido ? 'ATINGIDO' : `${num(r.progresso, 1)}% · faltam ${brl(r.falta)}/mês${r.capital_extra ? ` (~${brl(r.capital_extra)} a mais de patrimônio ao DY atual)` : ''}`}`),
    s.missao?.patrimonio_alvo ? `- Patrimônio alvo ${brl(s.missao.patrimonio_alvo)} (DY ${num(s.missao.dy_alvo)}%): ${num(tot.patrimonio / s.missao.patrimonio_alvo * 100, 2)}% percorrido.` : '',
    prox && opts.rendaExtra ? `- Este aporte encurta o próximo marco em ${brl(opts.rendaExtra)}/mês.` : '',
  ].filter(Boolean);

  return ['## 1. Status do Núcleo', ...status, '## 2. Alertas de Risco', ...alertas, '## 3. Ordem de Execução', ...exec, '## 4. Radar de Escala', ...escala].join('\n');
}
