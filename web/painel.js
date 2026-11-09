// INSA Command · Painel de comando
// Visual de "arquitetura de descoberta": um toro 3D de fios (cada fio é parte do patrimônio de um ativo),
// cercado de telemetria densa. Tudo vem da carteira real; o movimento é só apresentação.
//
// Desempenho: o toro é desenhado em <canvas> a no máximo 24 quadros/s (20 no celular), agrupando os fios em poucos
// traçados por cor e profundidade. Para sozinho quando a aba some ou o painel sai da tela, reduz a densidade
// se o aparelho não acompanhar e fica parado com "reduzir movimento".

const esc = (x) => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (n, d = 2) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const brl = (n, d = 2) => 'R$ ' + nf(n, d);
const pc = (n, d = 1) => `${nf(n, d)}%`;
const sinal = (n, d = 1) => `${n > 0 ? '+' : ''}${nf(n, d)}`;

const COR = { 'FII': '#ffb347', 'Ação': '#cfeeff', 'ETF': '#a78bfa', 'ETF cripto': '#48e5ff' };
const corDe = (p) => COR[p.tipo] ?? '#cfeeff';
const CLASSE = { 'FII': 'FIIs', 'Ação': 'Ações', 'ETF': 'ETF', 'ETF cripto': 'Cripto' };
const ZONA = { ataque: '#34f5a4', neutra: '#48e5ff', espera: '#ffb347', sem_dados: '#5b6b78' };

/** Ordem de foco: compras do plano primeiro, depois os mais atrasados contra o alvo da fase. */
function filaFoco(s) {
  const P = s.posicoes || [];
  const fase = (s.fases || []).find(f => f.id === s.missao?.fase?.id);
  const total = (s.totais.investido || 0) + (s.totais.caixa || 0);
  const atraso = (t) => ((fase?.pesos?.[t] ?? 0) / 100) * total - (P.find(p => p.ticker === t)?.valor ?? 0);
  const plano = (s.plano?.compras || []).map(c => c.ticker);
  const resto = P.map(p => p.ticker).filter(t => !plano.includes(t)).sort((a, b) => atraso(b) - atraso(a));
  return [...new Set([...plano, ...resto])].map(t => ({ ticker: t, atraso: atraso(t), alvo: fase?.pesos?.[t] ?? 0, compra: (s.plano?.compras || []).find(c => c.ticker === t) }));
}

// ───────── pequenos gráficos em SVG ─────────
function linhaSvg(vals, w, h, cor, preencher = false) {
  const v = vals.filter(x => x != null && isFinite(x));
  if (v.length < 2) return `<svg viewBox="0 0 ${w} ${h}" class="pn-spark"><line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="${cor}" stroke-opacity=".4" stroke-dasharray="2 3"/></svg>`;
  const mn = Math.min(...v), mx = Math.max(...v), sp = mx - mn || 1;
  const pts = v.map((x, i) => `${(i / (v.length - 1) * w).toFixed(1)},${(h - 2 - (x - mn) / sp * (h - 4)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" class="pn-spark" preserveAspectRatio="none">${preencher ? `<polygon points="0,${h} ${pts} ${w},${h}" fill="${cor}" fill-opacity=".12"/>` : ''}<polyline points="${pts}" fill="none" stroke="${cor}" stroke-width="1.3" vector-effect="non-scaling-stroke"/></svg>`;
}

function rosa(s, foco) {
  const P = [...(s.posicoes || [])].sort((a, b) => b.valor - a.valor);
  const n = P.length || 1, mx = Math.max(...P.map(p => p.valor), 1), R = 78, r0 = 22;
  const seg = (p, i) => {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2 + 0.02, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2 - 0.02;
    const r = r0 + (R - r0) * Math.sqrt(p.valor / mx);
    const pt = (rr, a) => `${(100 + rr * Math.cos(a)).toFixed(1)},${(100 + rr * Math.sin(a)).toFixed(1)}`;
    return `<path data-t="${esc(p.ticker)}" class="pn-seg${p.ticker === foco ? ' on' : ''}" d="M${pt(r0, a0)} L${pt(r, a0)} A${r.toFixed(1)},${r.toFixed(1)} 0 0 1 ${pt(r, a1)} L${pt(r0, a1)} A${r0},${r0} 0 0 0 ${pt(r0, a0)}Z" style="--c:${corDe(p)}"><title>${esc(p.ticker)} · ${brl(p.valor)}</title></path>`;
  };
  const cls = {}; for (const p of P) cls[CLASSE[p.tipo] ?? 'Outros'] = (cls[CLASSE[p.tipo] ?? 'Outros'] ?? 0) + p.valor;
  const tot = Object.values(cls).reduce((a, b) => a + b, 0) || 1;
  const lbl = Object.entries(cls).sort((a, b) => b[1] - a[1]);
  const pos = [['50%', '2%', 'translateX(-50%)'], ['98%', '50%', 'translate(-100%,-50%)'], ['50%', '98%', 'translate(-50%,-100%)'], ['2%', '50%', 'translateY(-50%)']];
  return `<div class="pn-rosa"><svg viewBox="0 0 200 200">${P.map(seg).join('')}
    <circle cx="100" cy="100" r="${r0 - 3}" fill="#050a14" stroke="#ffb347" stroke-width="1.4"/>
    <text x="100" y="104" text-anchor="middle" class="pn-rosa-n">${nf(s.totais.patrimonio, 0)}</text></svg>
    ${lbl.slice(0, 4).map(([k, v], i) => `<span style="left:${pos[i][0]};top:${pos[i][1]};transform:${pos[i][2]}">${esc(k.toUpperCase())} ${pc(v / tot * 100, 0)}</span>`).join('')}</div>`;
}

function metas(s, fila) {
  const P = s.posicoes || [];
  const mp = s.missao?.maior_posicao;
  const linhas = fila.filter(f => f.alvo > 0).map(f => ({ ...f, peso: P.find(p => p.ticker === f.ticker)?.peso ?? 0 }))
    .sort((a, b) => Math.abs(b.alvo - b.peso) - Math.abs(a.alvo - a.peso)).slice(0, 6);
  const mx = Math.max(30, ...linhas.map(l => Math.max(l.peso, l.alvo))) * 1.08;
  const x = (v) => `${(v / mx * 100).toFixed(1)}%`;
  return `<div class="pn-metas">${linhas.map(l => {
    const d = l.peso - l.alvo, alerta = mp && l.ticker === mp.ticker && mp.peso > mp.teto;
    return `<div class="pn-meta" data-t="${esc(l.ticker)}"><b>${esc(l.ticker.toLowerCase())}</b>
      <span class="pn-trilho"><i class="pn-liga" style="left:${x(Math.min(l.peso, l.alvo))};width:${x(Math.abs(d))}"></i>
        <i class="pn-pt atual${alerta ? ' alerta' : ''}" style="left:${x(l.peso)}"></i><i class="pn-pt alvo" style="left:${x(l.alvo)}"></i></span>
      <em class="${d > 0 ? 'acima' : ''}">${sinal(d)} pp</em></div>`;
  }).join('')}<div class="pn-eixo"><span>0</span><span>${nf(mx / 2, 0)}%</span><span>${nf(mx, 0)}%</span></div></div>`;
}

function pareto(s, foco) {
  const P = [...(s.posicoes || [])].filter(p => p.renda_mes_estimada > 0).sort((a, b) => b.renda_mes_estimada - a.renda_mes_estimada);
  const tot = P.reduce((a, p) => a + p.renda_mes_estimada, 0) || 1, mx = P[0]?.renda_mes_estimada || 1;
  let ac = 0;
  const W = 300, H = 150, bw = W / Math.max(1, P.length);
  const pts = P.map((p, i) => { ac += p.renda_mes_estimada; return [(i + .5) * bw, H - 8 - ac / tot * (H - 22)]; });
  return `<svg viewBox="-14 0 ${W + 14} ${H + 26}" class="pn-pareto">
    <line x1="0" x2="${W}" y1="${H - 8 - (H - 22)}" y2="${H - 8 - (H - 22)}" class="pn-grade"/><text x="${W - 2}" y="${H - 8 - (H - 22) - 3}" text-anchor="end" class="pn-mini">100%</text>
    <line x1="0" x2="${W}" y1="${H - 8 - (H - 22) / 2}" y2="${H - 8 - (H - 22) / 2}" class="pn-grade"/><text x="${W - 2}" y="${H - 8 - (H - 22) / 2 - 3}" text-anchor="end" class="pn-mini">50%</text>
    ${P.map((p, i) => { const h = p.renda_mes_estimada / mx * (H * .62);
      return `<rect data-t="${esc(p.ticker)}" class="pn-bar${p.ticker === foco ? ' on' : ''}" x="${(i * bw + bw * .14).toFixed(1)}" y="${(H - 8 - h).toFixed(1)}" width="${(bw * .72).toFixed(1)}" height="${h.toFixed(1)}"><title>${esc(p.ticker)} · ${brl(p.renda_mes_estimada)}/mês</title></rect>
        <text x="${((i + .5) * bw).toFixed(1)}" y="${H + 4}" class="pn-mini pn-rot" transform="rotate(-45 ${((i + .5) * bw).toFixed(1)} ${H + 4})" text-anchor="end">${esc(p.ticker)}</text>`; }).join('')}
    <polyline points="${pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" class="pn-curva"/>
    ${pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${P[i].ticker === foco ? 5 : 2.6}" class="pn-no${P[i].ticker === foco ? ' on' : ''}" data-t="${esc(P[i].ticker)}"/>`).join('')}</svg>`;
}

// ───────── tela ─────────
export function painel(s) {
  const t = s.totais, m = s.missao, P = s.posicoes || [];
  const fila = filaFoco(s), foco = fila[0]?.ticker;
  const ataque = P.filter(p => p.zona === 'ataque').length, espera = P.filter(p => p.zona === 'espera').length;
  const rendaCls = {}; for (const p of P) rendaCls[CLASSE[p.tipo] ?? 'Outros'] = (rendaCls[CLASSE[p.tipo] ?? 'Outros'] ?? 0) + p.renda_mes_estimada;
  const rt = Object.values(rendaCls).reduce((a, b) => a + b, 0) || 1;
  const cal = s.calendario || [], mesAtual = new Date().getMonth();
  const calMx = Math.max(1, ...cal.map(c => Math.max(c.recebido, c.estimado)));
  const pesos = [...P].sort((a, b) => b.peso - a.peso);
  const fase = (s.fases || []).find(f => f.id === m.fase?.id);
  const aporte = Number(s.aporte_mensal) || 0;
  const usoPlano = (s.plano?.compras || []).reduce((a, c) => a + c.valor, 0);
  const tele = [
    ['PATRIMÔNIO', brl(t.patrimonio)], ['INVESTIDO', brl(t.investido)], ['CAIXA', brl(t.caixa)],
    ['RESULTADO', `<span class="${t.resultado >= 0 ? 'up' : 'dn'}">${brl(t.resultado)}</span>`],
    ['DIA', `<span class="${t.resultado_dia >= 0 ? 'up' : 'dn'}">${t.resultado_dia >= 0 ? '+' : ''}${brl(t.resultado_dia)}</span>`],
    ['RENDA EST. / MÊS', brl(t.renda_mes_estimada)], ['RECEBIDO 12M', brl(t.renda_12m_recebida)], ['DY CARTEIRA', pc(t.dy_carteira, 2)],
    ['MAGIC ATIVOS', `${s.magic?.ativos?.length ?? 0} / ${P.length}`], ['FASE', esc(fase?.nome ?? '—')],
  ];
  const ciclo = [
    ['01 COTAÇÕES', P.some(p => p.cotacao_ok) ? 1 : 0.1, s.em_pregao ? 'AO VIVO' : 'FECHADO'],
    ['02 ZONA DE ATAQUE', ataque / Math.max(1, P.length), `${ataque}/${P.length}`],
    ['03 PLANO DE COMPRA', aporte ? Math.min(1, usoPlano / (aporte + t.caixa || 1)) : 0, s.plano?.compras?.length ? 'PRONTO' : 'AGUARDA'],
    ['04 PRÓXIMO MARCO', Math.min(1, m.progresso_marco / 100), pc(m.progresso_marco, 0)],
  ];
  return `<section class="pn" id="pn" aria-label="Painel de comando">
  <header class="pn-cab">
    <div class="pn-l1"><span>| INSA DIVIDEND ARMY / CENTRO DE COMANDO</span><span class="pn-dir">B3 | ATIVOS ${P.length} | LANÇAMENTOS <b id="pn-nlanc">—</b> | ${s.em_pregao ? 'PREGÃO ABERTO' : 'PREGÃO FECHADO'}</span></div>
    <div class="pn-l2"><b class="pn-ouro">M.A.N.U.E.L.</b> <span>+</span> <b class="pn-roxo">MOTOR LOCAL</b> <small>PILHA COGNITIVA DA CARTEIRA | ${P.length} PELOTÕES</small><span class="pn-dir pn-ciano">marco/meta ${pc(m.progresso_marco)}</span></div>
  </header>
  <div class="pn-chips" id="pn-chips">${P.map(p => `<span data-t="${esc(p.ticker)}" style="--c:${corDe(p)}" class="${p.ticker === foco ? 'on' : ''}">${esc(p.ticker.toLowerCase())}.${p.zona === 'ataque' ? 'atacar' : p.zona === 'espera' ? 'esperar' : 'manter'}</span>`).join('')}</div>
  <div class="pn-faixa"><span>CARTEIRA | PATRIMÔNIO ${brl(t.patrimonio, 0)} | RENDA ${brl(t.renda_mes_estimada)}/MÊS | DY ${pc(t.dy_carteira)} | ALERTAS ${(s.alertas || []).length}</span>
    <span class="pn-dir">ZONA DE ATAQUE ${ataque}/${P.length} | ESPERA ${espera} | CAIXA ${brl(t.caixa)}</span></div>
  <div class="pn-meio">
    <div class="pn-toro">
      <canvas id="pn-canvas" aria-hidden="true"></canvas>
      <div class="pn-graus">${['0 DEG', '85 DEG', '170 DEG', '254 DEG', '339 DEG'].map(g => `<span>— ${g}</span>`).join('')}</div>
      <div class="pn-spin">SPIN <b id="pn-spin">000.0°</b> · EIXO TRAVADO <button type="button" id="pn-pausa" class="pn-pausa" aria-pressed="false">❚❚ pausar</button></div>
      <div class="pn-alvo" id="pn-alvo"></div>
      <div class="pn-rotulo" id="pn-rotulo"></div>
      <p class="sr-only">Toro animado: cada fio representa uma parte do patrimônio, colorido por classe (dourado FIIs, branco ações, violeta ETF, ciano cripto).</p>
    </div>
    <aside class="pn-lado">
      <div class="pn-box"><h3>PREGÃO · B3 <b class="pn-dir pn-ouro">${s.em_pregao ? 'ABERTO' : 'FECHADO'}</b></h3>
        <div class="pn-onda${s.em_pregao ? '' : ' parada'}"><div class="pn-onda-t"><svg viewBox="0 0 400 22" preserveAspectRatio="none"><path d="${Array.from({ length: 20 }, (_, i) => `M${i * 20} 18 V4 H${i * 20 + 10} V18 H${i * 20 + 20}`).join(' ')}"/></svg></div></div>
        <div class="pn-ind" id="pn-ind"><div><span>IBOV</span><i></i><b>—</b></div><div><span>IFIX</span><i></i><b>—</b></div></div></div>
      <div class="pn-box"><h3>PESO POR ATIVO | ${P.length} BARRAS</h3>
        <div class="pn-pesos">${pesos.map(p => `<div data-t="${esc(p.ticker)}" class="${p.ticker === foco ? 'on' : ''}"><i style="width:${Math.min(100, p.peso / Math.max(1, pesos[0].peso) * 100).toFixed(1)}%;--c:${corDe(p)}"></i></div>`).join('')}</div></div>
      <div class="pn-box"><h3>RENDA 12 MESES | HISTOGRAMA</h3>
        <div class="pn-split">${Object.entries(rendaCls).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v], i) => `<span class="${i ? 'pn-roxo' : 'pn-ouro'}">${esc(k.toUpperCase().replace('FIIS', 'FIIs'))}: ${pc(v / rt * 100, 0)}</span>`).join('')}</div>
        <div class="pn-hist">${cal.map((c, i) => { const v = c.recebido > 0 ? c.recebido : c.estimado;
          return `<i class="${i === mesAtual ? 'agora' : c.recebido > 0 ? 'ouro' : 'roxo'}" style="height:${Math.max(4, v / calMx * 100).toFixed(0)}%" title="${esc(c.mes)}: ${c.recebido > 0 ? 'recebido' : 'estimado'} ${brl(v)}"></i>`; }).join('')}</div>
        <div class="pn-leg"><span class="pn-ouro">■ recebido</span><span class="pn-roxo">■ estimado</span></div></div>
      <div class="pn-box"><h3>CICLO DO APORTE | SINCRONIZADOR</h3>
        <div class="pn-ciclo">${ciclo.map(([n, v, e]) => `<div><span>${n}</span><i><b style="width:${(v * 100).toFixed(0)}%"></b></i><em>${e}</em></div>`).join('')}</div></div>
      <div class="pn-box"><h3>TELEMETRIA</h3><dl class="pn-tele">${tele.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></div>
      <div class="pn-box"><h3>PELOTÕES | ${P.length} POSIÇÕES</h3>
        <div class="pn-pods-l">ATAQUE ${ataque}/${P.length} · ESPERA ${espera} · PM ESTIMADO ${P.filter(p => p.pm_estimado).length}</div>
        <div class="pn-pods">${P.map(p => `<i data-t="${esc(p.ticker)}" style="--c:${ZONA[p.zona] ?? '#5b6b78'}" title="${esc(p.ticker)} · ${esc(p.zona)}"></i>`).join('')}</div></div>
      <div class="pn-box"><h3>FILA DE COMANDO | ÚLTIMOS LANÇAMENTOS</h3><div class="pn-fila" id="pn-fila"><div class="faint">carregando…</div></div>
        <div class="pn-rodape"><span>RAZÃO</span><b class="up">ÍNTEGRO</b></div></div>
    </aside>
  </div>
  <div class="pn-fluxo">
    <div class="pn-fluxo-c"><span>FLUXO DE RENDA | 12 MESES | STREAM</span><b>${brl(t.renda_mes_estimada)} / MÊS</b></div>
    <div class="pn-fluxo-o">${linhaSvg(cal.map(c => Math.max(c.recebido, c.estimado)), 600, 34, '#cfeeff')}</div>
    <div class="pn-fluxo-r">${['recebido', 'estimado', 'reinvestido', 'meta'].map((k, i) => `<span class="${i === 1 ? 'pn-ouro' : ''}">${k}</span>`).join('')}</div>
  </div>
  <div class="pn-base">
    <div class="pn-box"><h3>PATRIMÔNIO POR CLASSE</h3>${rosa(s, foco)}</div>
    <div class="pn-box"><h3>METAS | PESO ATUAL → ALVO</h3>${metas(s, fila)}</div>
    <div class="pn-box"><h3>RENDA POR ATIVO | PARETO</h3>${pareto(s, foco)}</div>
  </div>
</section>`;
}

// ───────── toro de fios (canvas) ─────────
function criarFios(s, n) {
  const P = (s.posicoes || []).filter(p => p.valor > 0);
  const tot = P.reduce((a, p) => a + p.valor, 0) || 1;
  // cada ativo ganha uma faixa do toro proporcional ao valor; os fios saem dessa faixa
  let u = 0; const faixas = P.map(p => { const w = p.valor / tot * Math.PI * 2; const f = { p, u0: u, w }; u += w; return f; });
  const rnd = (() => { let a = 1234567; return () => {   // mulberry32: determinístico e sem repetição
    a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  const R = 1, r = 0.36, PTS = 14, fios = [];
  const ponto = (uu, vv, ex = 0) => { const rr = r + ex; return [(R + rr * Math.cos(vv)) * Math.cos(uu), (R + rr * Math.cos(vv)) * Math.sin(uu), rr * Math.sin(vv)]; };
  for (let i = 0; i < n; i++) {
    const q = rnd() * Math.PI * 2;   // posição ao redor do toro: cada ativo recebe fios na proporção do seu valor
    const f = faixas.find(ff => q >= ff.u0 && q < ff.u0 + ff.w) || faixas[faixas.length - 1];
    if (!f) break;
    const u0 = q, v0 = rnd() * Math.PI * 2;
    if (rnd() < 0.16) {           // espinhos para fora, com ponta brilhante (como na referência)
      const a = ponto(u0, v0), b = ponto(u0, v0, 0.05 + rnd() * rnd() * 0.5);
      fios.push({ cor: corDe(f.p), t: f.p.ticker, pts: [a, b], ponta: true });
      continue;
    }
    // 3 de cada 4 fios correm ao longo do anel; o resto dá a volta no tubo (trama cruzada)
    const longo = rnd() < 0.75;
    const du = (longo ? 1.2 + rnd() * 2.2 : 0.08 + rnd() * 0.35) * (rnd() < .5 ? -1 : 1);
    const k = longo ? (rnd() * 2 - 1) * 0.8 : (rnd() < .5 ? -1 : 1) * (Math.PI * (0.6 + rnd() * 0.8)) / Math.abs(du);
    const amp = rnd() * (longo ? 0.35 : 0.1), fr = 1 + rnd() * 3;
    const pts = [];
    for (let j = 0; j < PTS; j++) { const q = j / (PTS - 1); pts.push(ponto(u0 + du * q, v0 + k * du * q + amp * Math.sin(q * fr * Math.PI), (rnd() - .5) * 0.03)); }
    fios.push({ cor: corDe(f.p), t: f.p.ticker, pts });
  }
  return fios;
}

let PN_LOOP = 0;
export function ligarPainel(s, api) {
  const raiz = document.getElementById('pn'); if (!raiz) return;
  const cv = document.getElementById('pn-canvas'), ctx = cv.getContext('2d');
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fila = filaFoco(s);
  const celular = innerWidth < 700;
  let densidade = celular ? 280 : 950;
  let fios = criarFios(s, densidade);
  let W = 0, H = 0, dpr = 1;
  // no celular o toro é desenhado em resolução reduzida: fios finos e brilhantes não perdem nada
  const medir = () => { const b = cv.getBoundingClientRect(); dpr = celular ? 0.75 : Math.min(1.5, devicePixelRatio || 1); W = b.width; H = b.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); };
  medir(); new ResizeObserver(medir).observe(cv);
  let visivel = true; new IntersectionObserver(([e]) => { visivel = e.isIntersecting; }).observe(cv);

  // foco sincronizado: chip, barras, rosa, pareto, mira e rótulo
  let fi = 0, alvo3 = null;
  const focar = () => {
    const f = fila[fi % Math.max(1, fila.length)]; if (!f) return;
    raiz.querySelectorAll('[data-t].on').forEach(e => e.classList.remove('on'));
    raiz.querySelectorAll(`[data-t="${CSS.escape(f.ticker)}"]`).forEach(e => e.classList.add('on'));
    const p = (s.posicoes || []).find(x => x.ticker === f.ticker);
    const fio = fios.find(x => x.t === f.ticker && !x.ponta); alvo3 = fio ? fio.pts[Math.floor(fio.pts.length / 2)] : null;
    document.getElementById('pn-rotulo').innerHTML = `<div><b>${f.compra ? 'CANDIDATO' : 'OBSERVANDO'}</b> ${esc(f.ticker)} | ${p ? brl(p.preco) : '—'} | ZONA ${esc((p?.zona ?? '—').toUpperCase())}</div>
      <div>${f.compra ? `PLANO: ${f.compra.qtd} × ${brl(f.compra.preco)} = ${brl(f.compra.valor)}` : `PESO ${pc(p?.peso ?? 0)} / ALVO ${pc(f.alvo, 0)}`} | ATRASO ${brl(Math.max(0, f.atraso), 0)}</div>`;
    fi++;
  };
  focar();
  const idFoco = setInterval(() => { if (!document.body.contains(raiz)) return clearInterval(idFoco); if (!document.hidden) focar(); }, 3500);

  // dados extras: últimos lançamentos e índices (sem travar a tela)
  api('/api/movements?limit=6').then(ms => {
    const el = document.getElementById('pn-fila'); if (!el) return;
    document.getElementById('pn-nlanc').textContent = ms.length >= 6 ? '6+' : String(ms.length);
    el.innerHTML = ms.slice(0, 5).map(mv => `<div><span>&gt; ${esc(mv.tipo)}${mv.ticker ? '.' + esc(mv.ticker.toLowerCase()) : ''} → ${mv.qtd ? nf(mv.qtd, 0) + ' × ' : ''}${brl(mv.preco ?? mv.valor ?? 0)}</span><b class="${mv.anulado ? 'dn' : 'up'}">${mv.anulado ? 'ANULADO' : esc(mv.data.slice(5).split('-').reverse().join('/'))}</b></div>`).join('') || '<div class="faint">Nenhum lançamento.</div>';
  }).catch(() => null);
  api('/api/market/live').then(L => {
    const el = document.getElementById('pn-ind'); if (!el) return;
    const ind = (L.indices || []);
    el.innerHTML = ['IBOV', 'IFIX'].map(k => { const x = ind.find(i => i.ticker === k || i.chave === k || i.nome === k) ?? {};
      return `<div><span>${k}</span>${linhaSvg((x.serie || []).map(p => Array.isArray(p) ? p[1] : p), 160, 18, (x.var ?? 0) >= 0 ? '#34f5a4' : '#ff4d5e', true)}<b class="${(x.var ?? 0) >= 0 ? 'up' : 'dn'}">${x.var != null ? sinal(x.var, 2) + '%' : '—'}</b></div>`; }).join('');
  }).catch(() => null);

  // desenho
  const id = ++PN_LOOP, spin = document.getElementById('pn-spin'), mira = document.getElementById('pn-alvo');
  let t0 = performance.now(), ult = 0;
  const desenhar = (agora) => {
    const t = (agora - t0) / 1000;
    const ay = t * 0.16, ax = 0.98 + Math.sin(t * 0.21) * 0.2, az = 0.4 + Math.sin(t * 0.13) * 0.12;
    const [sy, cy, sx, cx, sz, cz] = [Math.sin(ay), Math.cos(ay), Math.sin(ax), Math.cos(ax), Math.sin(az), Math.cos(az)];
    const esc3 = Math.min(W, H * 0.92) * (celular ? 0.36 : 0.31), ox = W * 0.5, oy = celular ? H * 0.43 : Math.min(H * 0.5, W * 0.55), D = 3.4;
    const proj = (p) => {
      let [x, y, z] = p;
      let x1 = x * cy - y * sy, y1 = x * sy + y * cy;            // giro
      let y2 = y1 * cx - z * sx, z2 = y1 * sx + z * cx;           // inclinação
      let x3 = x1 * cz - y2 * sz, y3 = x1 * sz + y2 * cz;         // rolagem
      const k = D / (D + z2); return [ox + x3 * esc3 * k, oy + y3 * esc3 * k, z2];
    };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over'; ctx.lineWidth = 0.55;
    const baldes = new Map();   // um traçado por cor × profundidade
    const pontas = [];
    for (const f of fios) {
      let zs = 0, d = '';
      const pr = f.pts.map(proj);
      for (const q of pr) zs += q[2];
      const nivel = zs / pr.length > 0.2 ? 0 : zs / pr.length > -0.25 ? 1 : 2;   // fundo, meio, frente
      const chave = f.cor + nivel;
      // traçados de até 60 fios: caminhos enormes fazem o Chrome trocar de rasterizador e serrilhar
      let lista = baldes.get(chave); if (!lista) { lista = [[new Path2D(), 0]]; baldes.set(chave, lista); }
      let atual = lista[lista.length - 1]; if (atual[1] >= 60) { atual = [new Path2D(), 0]; lista.push(atual); }
      const path = atual[0]; atual[1]++;
      path.moveTo(pr[0][0], pr[0][1]); for (let j = 1; j < pr.length; j++) path.lineTo(pr[j][0], pr[j][1]);
      if (f.ponta) pontas.push([pr[1][0], pr[1][1], f.cor, nivel]);
    }
    for (const [chave, lista] of baldes) {
      const cor = chave.slice(0, 7), nivel = Number(chave.slice(7));
      ctx.strokeStyle = cor; ctx.globalAlpha = [0.09, 0.2, 0.36][nivel] * (cor === '#cfeeff' ? 1 : 1.5);
      for (const [path] of lista) ctx.stroke(path);
    }
    for (const [x, y, cor, nivel] of pontas) { ctx.globalAlpha = [0.3, 0.55, 0.95][nivel]; ctx.fillStyle = cor; ctx.fillRect(x - 1, y - 1, 2.2, 2.2); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // mira no ativo em foco
    if (alvo3) { const [x, y] = proj(alvo3); mira.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; }
    spin.textContent = String(((ay * 180 / Math.PI) % 360).toFixed(1)).padStart(5, '0') + '°';
  };
  // botão de pausa (lembrado neste aparelho) e ajuste automático: se o aparelho não acompanha, menos fios
  let pausado = false; try { pausado = localStorage.getItem('insa.painel.pausa') === '1'; } catch {}
  const bt = document.getElementById('pn-pausa');
  const marcar = () => { bt.textContent = pausado ? '▶ animar' : '❚❚ pausar'; bt.setAttribute('aria-pressed', String(pausado)); };
  marcar();
  bt.addEventListener('click', () => { pausado = !pausado; try { localStorage.setItem('insa.painel.pausa', pausado ? '1' : '0'); } catch {} marcar(); });
  const alvoMs = celular ? 50 : 41;
  let intervalos = 0, nInt = 0;
  const quadro = (agora) => {
    if (id !== PN_LOOP || !document.body.contains(raiz)) return;     // saiu do painel: o laço morre
    requestAnimationFrame(quadro);
    if (pausado || document.hidden || !visivel || agora - ult < alvoMs) return;   // só quando visível, até 20–24 quadros/s
    if (ult && agora - ult < 400) { intervalos += agora - ult; nInt++; }
    ult = agora;
    desenhar(agora);
    if (nInt === 40) {
      if (intervalos / nInt > alvoMs * 1.7 && densidade > 140) { densidade = Math.round(densidade * 0.6); fios = criarFios(s, densidade); }
      intervalos = 0; nInt = 0;
    }
  };
  desenhar(t0 + 4000);
  if (!quieto) requestAnimationFrame(quadro);
}
