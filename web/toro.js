// Toro de fios do núcleo: rodas dentro de rodas em 3D. Cada fio é uma parte do patrimônio de um ativo,
// na proporção do valor, colorido pela classe (dourado FIIs, branco ações, violeta ETF, ciano cripto).
// A mira percorre os ativos (compras do plano primeiro) e um rótulo mostra o candidato.
//
// Desempenho: canvas a até 24 quadros/s (20 no celular), só com o núcleo visível, sem mistura aditiva,
// resolução reduzida no celular, menos fios se o aparelho não acompanhar e botão de pausa lembrado.

const nf = (n, d = 2) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const brl = (n, d = 2) => 'R$ ' + nf(n, d);
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COR = { 'FII': '#ffb347', 'Ação': '#cfeeff', 'ETF': '#a78bfa', 'ETF cripto': '#48e5ff' };
const corDe = (p) => COR[p.tipo] ?? '#cfeeff';

export function filaFoco(s) {
  const P = s.posicoes || [];
  const fase = (s.fases || []).find(f => f.id === s.missao?.fase?.id);
  const total = (s.totais.investido || 0) + (s.totais.caixa || 0);
  const atraso = (t) => ((fase?.pesos?.[t] ?? 0) / 100) * total - (P.find(p => p.ticker === t)?.valor ?? 0);
  const plano = (s.plano?.compras || []).map(c => c.ticker);
  const resto = P.map(p => p.ticker).filter(t => !plano.includes(t)).sort((a, b) => atraso(b) - atraso(a));
  return [...new Set([...plano, ...resto])].map(t => ({ ticker: t, atraso: atraso(t), alvo: fase?.pesos?.[t] ?? 0, compra: (s.plano?.compras || []).find(c => c.ticker === t) }));
}

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

let LOOP = 0;
/** Liga o toro num <canvas>. `mira` e `rotulo` são elementos posicionados sobre ele (opcionais). */
export function ligarToro(cv, s, { mira, rotulo, botao } = {}) {
  const ctx = cv.getContext('2d'); if (!ctx) return;
  const raiz = cv.parentElement;
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const celular = innerWidth < 700;
  const fila = filaFoco(s);
  let densidade = celular ? 300 : 650;
  let fios = criarFios(s, densidade);
  let W = 0, H = 0, dpr = 1;
  const medir = () => { const b = cv.getBoundingClientRect(); dpr = celular ? 0.8 : Math.min(1.5, devicePixelRatio || 1); W = b.width; H = b.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); };
  medir(); new ResizeObserver(medir).observe(cv);
  let visivel = true; new IntersectionObserver(([e]) => { visivel = e.isIntersecting; }).observe(cv);

  // mira e rótulo percorrem os ativos
  let fi = 0, alvo3 = null;
  const focar = () => {
    const f = fila[fi % Math.max(1, fila.length)]; fi++; if (!f) return;
    const p = (s.posicoes || []).find(x => x.ticker === f.ticker);
    const fio = fios.find(x => x.t === f.ticker && !x.ponta); alvo3 = fio ? fio.pts[Math.floor(fio.pts.length / 2)] : null;
    if (rotulo) rotulo.innerHTML = `<b>${f.compra ? 'CANDIDATO' : 'OBSERVANDO'}</b> ${esc(f.ticker)} · ${p ? brl(p.preco) : '—'} · zona ${esc(p?.zona ?? '—')} · ${f.compra ? `plano ${f.compra.qtd} × ${brl(f.compra.preco)}` : `peso ${nf(p?.peso ?? 0, 1)}% / alvo ${nf(f.alvo, 0)}%`}`;
  };
  focar();
  const idFoco = setInterval(() => { if (!document.body.contains(cv)) return clearInterval(idFoco); if (!document.hidden) focar(); }, 3500);

  const id = ++LOOP;
  let t0 = performance.now(), ult = 0;
  const desenhar = (agora) => {
    const t = (agora - t0) / 1000;
    // inclinação moderada: o furo do toro fica aberto atrás do patrimônio
    const ay = t * 0.16, ax = 0.62 + Math.sin(t * 0.21) * 0.14, az = 0.3 + Math.sin(t * 0.13) * 0.1;
    const [sy, cy, sx, cx, sz, cz] = [Math.sin(ay), Math.cos(ay), Math.sin(ax), Math.cos(ax), Math.sin(az), Math.cos(az)];
    const esc3 = Math.min(W, H) * 0.31, ox = W / 2, oy = H / 2, D = 3.4;
    const proj = (p) => {
      const [x, y, z] = p;
      const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
      const y2 = y1 * cx - z * sx, z2 = y1 * sx + z * cx;
      const x3 = x1 * cz - y2 * sz, y3 = x1 * sz + y2 * cz;
      const k = D / (D + z2); return [ox + x3 * esc3 * k, oy + y3 * esc3 * k, z2];
    };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 0.55;
    const baldes = new Map(), pontas = [];
    for (const f of fios) {
      const pr = f.pts.map(proj);
      let zs = 0; for (const q of pr) zs += q[2];
      const nivel = zs / pr.length > 0.2 ? 0 : zs / pr.length > -0.25 ? 1 : 2;   // fundo, meio, frente
      const chave = f.cor + nivel;
      let lista = baldes.get(chave); if (!lista) { lista = [[new Path2D(), 0]]; baldes.set(chave, lista); }
      let atual = lista[lista.length - 1]; if (atual[1] >= 60) { atual = [new Path2D(), 0]; lista.push(atual); }
      atual[1]++;
      atual[0].moveTo(pr[0][0], pr[0][1]); for (let j = 1; j < pr.length; j++) atual[0].lineTo(pr[j][0], pr[j][1]);
      if (f.ponta) pontas.push([pr[1][0], pr[1][1], f.cor, nivel]);
    }
    for (const [chave, lista] of baldes) {
      const cor = chave.slice(0, 7), nivel = Number(chave.slice(7));
      ctx.strokeStyle = cor; ctx.globalAlpha = [0.09, 0.2, 0.36][nivel] * (cor === '#cfeeff' ? 1 : 1.5);
      for (const [path] of lista) ctx.stroke(path);
    }
    for (const [x, y, cor, nivel] of pontas) { ctx.globalAlpha = [0.3, 0.55, 0.95][nivel]; ctx.fillStyle = cor; ctx.fillRect(x - 1, y - 1, 2.2, 2.2); }
    ctx.globalAlpha = 1;
    if (alvo3 && mira) { const [x, y] = proj(alvo3); mira.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; }
  };

  let pausado = false; try { pausado = localStorage.getItem('insa.toro.pausa') === '1'; } catch {}
  const marcar = () => { if (!botao) return; botao.textContent = pausado ? '▶' : '❚❚'; botao.setAttribute('aria-pressed', String(pausado)); botao.title = pausado ? 'Animar o núcleo' : 'Pausar o núcleo'; };
  marcar();
  botao?.addEventListener('click', (e) => { e.stopPropagation(); pausado = !pausado; try { localStorage.setItem('insa.toro.pausa', pausado ? '1' : '0'); } catch {} marcar(); });
  const alvoMs = celular ? 50 : 41;
  let intervalos = 0, nInt = 0;
  const quadro = (agora) => {
    if (id !== LOOP || !document.body.contains(cv)) return;            // saiu da tela: o laço morre
    requestAnimationFrame(quadro);
    if (pausado || document.hidden || !visivel || agora - ult < alvoMs) return;
    if (ult && agora - ult < 400) { intervalos += agora - ult; nInt++; }
    ult = agora;
    desenhar(agora);
    if (nInt === 40) {               // aparelho não acompanha: menos fios
      if (intervalos / nInt > alvoMs * 1.7 && densidade > 120) { densidade = Math.round(densidade * 0.6); fios = criarFios(s, densidade); }
      intervalos = 0; nInt = 0;
    }
  };
  requestAnimationFrame(() => desenhar(t0 + 4000));
  if (!quieto) requestAnimationFrame(quadro);
}
