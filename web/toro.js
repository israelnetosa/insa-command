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
/**
 * Liga o toro num <canvas>. Interações:
 * - arrastar gira o toro (com inércia); no mouse, arrastar na vertical inclina;
 * - tocar/clicar seleciona o ativo do fio mais próximo: os fios dele acendem e `aoSelecionar(ticker)` é chamado;
 * - segurar acelera o giro e acende tudo ("varredura"); soltar volta ao normal;
 * - no PC, passar o mouse realça o ativo sob o cursor.
 */
export function ligarToro(cv, s, { mira, rotulo, aoSelecionar } = {}) {
  const ctx = cv.getContext('2d'); if (!ctx) return;
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const celular = innerWidth < 700;
  const fila = filaFoco(s);
  let densidade = celular ? 300 : 650;
  let fios = criarFios(s, densidade);
  let W = 0, H = 0, dpr = 1, pendente = true;
  function pedir() { pendente = true; }
  const medir = () => { const b = cv.getBoundingClientRect(); dpr = celular ? 0.8 : Math.min(1.5, devicePixelRatio || 1); W = b.width; H = b.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); pedir(); };
  let visivel = true;

  // estado da rotação: giro contínuo + o que o dedo/mouse acrescenta
  let ay = 0, ax = 0.62, vy = 0, vx = 0, segurando = false, brilho = 0, escala = 1;
  let sel = null, hover = null, selAte = 0;
  const meios = [];   // [x, y, ticker] do meio de cada fio no último quadro (para achar o mais próximo)

  // mira e rótulo: percorrem os ativos sozinhos; uma seleção do dono tem prioridade por 10 s
  let fi = 0, alvo3 = null;
  const mostrar = (ticker, origem) => {
    const f = fila.find(x => x.ticker === ticker) ?? { ticker, alvo: 0 };
    const p = (s.posicoes || []).find(x => x.ticker === ticker);
    const fio = fios.find(x => x.t === ticker && !x.ponta); alvo3 = fio ? fio.pts[Math.floor(fio.pts.length / 2)] : null;
    if (rotulo) rotulo.innerHTML = `<b>${origem === 'dono' ? 'SELECIONADO' : f.compra ? 'CANDIDATO' : 'OBSERVANDO'}</b> ${esc(ticker)} · ${p ? brl(p.preco) : '—'} · zona ${esc(p?.zona ?? '—')} · ${f.compra ? `plano ${f.compra.qtd} × ${brl(f.compra.preco)}` : `peso ${nf(p?.peso ?? 0, 1)}% / alvo ${nf(f.alvo, 0)}%`}`;
  };
  const focar = () => { if (sel && performance.now() < selAte) return; sel = null; const f = fila[fi++ % Math.max(1, fila.length)]; if (f) mostrar(f.ticker); pedir(); };
  focar();
  const idFoco = setInterval(() => { if (!document.body.contains(cv)) return clearInterval(idFoco); if (!document.hidden) focar(); }, 3500);

  const proximo = (cx, cy, raio) => {
    let melhor = null, d2 = raio * raio;
    for (const [x, y, t] of meios) { const d = (x - cx) ** 2 + (y - cy) ** 2; if (d < d2) { d2 = d; melhor = t; } }
    return melhor;
  };
  const pos = (e) => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };

  // ponteiro: arrastar gira, tocar seleciona, segurar faz a varredura
  let ini = null, ultX = 0, ultY = 0, ultT = 0, timerSegurar = 0;
  cv.addEventListener('pointerdown', (e) => {
    ini = { x: e.clientX, y: e.clientY, moveu: false }; ultX = e.clientX; ultY = e.clientY; ultT = performance.now();
    vy = vx = 0; hover = null;
    clearTimeout(timerSegurar); timerSegurar = setTimeout(() => { if (ini && !ini.moveu) { segurando = true; pedir(); } }, 320);
    try { cv.setPointerCapture(e.pointerId); } catch {}
  });
  cv.addEventListener('pointermove', (e) => {
    if (ini) {
      const dx = e.clientX - ultX, dy = e.clientY - ultY, dt = Math.max(8, performance.now() - ultT);
      if (Math.abs(e.clientX - ini.x) + Math.abs(e.clientY - ini.y) > 6) ini.moveu = true;
      if (ini.moveu) {
        ay += dx * 0.012; vy = dx * 0.012 / dt * 1000;
        if (e.pointerType === 'mouse') { ax = Math.max(0.15, Math.min(1.35, ax + dy * 0.008)); vx = dy * 0.008 / dt * 1000; }
        pedir();
      }
      ultX = e.clientX; ultY = e.clientY; ultT = performance.now();
    } else if (e.pointerType === 'mouse') {
      const [x, y] = pos(e); const t = proximo(x, y, 26);
      if (t !== hover) { hover = t; cv.style.cursor = t ? 'pointer' : 'grab'; pedir(); }
    }
  });
  const soltar = (e) => {
    clearTimeout(timerSegurar);
    if (ini && !ini.moveu && !segurando && e.type === 'pointerup') {
      const [x, y] = pos(e); const t = proximo(x, y, celular ? 38 : 30);
      if (t) { sel = t; selAte = performance.now() + 10000; mostrar(t, 'dono'); aoSelecionar?.(t); }
      else { sel = null; aoSelecionar?.(null); }
      pedir();
    }
    segurando = false; ini = null; pedir();
  };
  cv.addEventListener('pointerup', soltar); cv.addEventListener('pointercancel', soltar);
  cv.addEventListener('pointerleave', () => { if (hover) { hover = null; pedir(); } });
  cv.addEventListener('click', (e) => e.stopPropagation());
  cv.style.cursor = 'grab'; cv.style.touchAction = 'pan-y';

  const desenhar = () => {
    const sy = Math.sin(ay), cy = Math.cos(ay), sx = Math.sin(ax), cx = Math.cos(ax), az = 0.3, sz = Math.sin(az), cz = Math.cos(az);
    const esc3 = Math.min(W, H) * 0.31 * escala, ox = W / 2, oy = H / 2, D = 3.4;
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
    const foco = sel ?? hover;
    const baldes = new Map(), pontas = [], destaque = new Path2D();
    meios.length = 0;
    for (const f of fios) {
      const pr = f.pts.map(proj);
      if (!f.ponta) { const m = pr[Math.floor(pr.length / 2)]; meios.push([m[0], m[1], f.t]); }
      if (foco && f.t === foco) {
        destaque.moveTo(pr[0][0], pr[0][1]); for (let j = 1; j < pr.length; j++) destaque.lineTo(pr[j][0], pr[j][1]);
        continue;
      }
      let zs = 0; for (const q of pr) zs += q[2];
      const nivel = zs / pr.length > 0.2 ? 0 : zs / pr.length > -0.25 ? 1 : 2;
      const chave = f.cor + nivel;
      let lista = baldes.get(chave); if (!lista) { lista = [[new Path2D(), 0]]; baldes.set(chave, lista); }
      let atual = lista[lista.length - 1]; if (atual[1] >= 60) { atual = [new Path2D(), 0]; lista.push(atual); }
      atual[1]++;
      atual[0].moveTo(pr[0][0], pr[0][1]); for (let j = 1; j < pr.length; j++) atual[0].lineTo(pr[j][0], pr[j][1]);
      if (f.ponta) pontas.push([pr[1][0], pr[1][1], f.cor, nivel]);
    }
    const apaga = foco ? 0.55 : 1, acende = 1 + brilho * 1.4;
    for (const [chave, lista] of baldes) {
      const cor = chave.slice(0, 7), nivel = Number(chave.slice(7));
      ctx.strokeStyle = cor; ctx.globalAlpha = Math.min(1, [0.09, 0.2, 0.36][nivel] * (cor === '#cfeeff' ? 1 : 1.5) * apaga * acende);
      for (const [path] of lista) ctx.stroke(path);
    }
    for (const [x, y, cor, nivel] of pontas) { ctx.globalAlpha = Math.min(1, [0.3, 0.55, 0.95][nivel] * acende); ctx.fillStyle = cor; ctx.fillRect(x - 1, y - 1, 2.2, 2.2); }
    if (foco) {   // fios do ativo em foco acesos em dourado
      ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ffd08a'; ctx.lineWidth = 1.1; ctx.stroke(destaque);
      ctx.globalAlpha = 0.25; ctx.lineWidth = 3.2; ctx.stroke(destaque);
    }
    ctx.globalAlpha = 1;
    if (alvo3 && mira) { const [x, y] = proj(alvo3); mira.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; }
  };

  const id = ++LOOP, alvoMs = celular ? 50 : 41;
  let ult = 0, intervalos = 0, nInt = 0;
  const quadro = (agora) => {
    if (id !== LOOP || !document.body.contains(cv)) return;            // saiu da tela: o laço morre
    requestAnimationFrame(quadro);
    if (document.hidden || !visivel || agora - ult < alvoMs) return;
    const dt = ult ? Math.min(0.1, (agora - ult) / 1000) : 0;
    if (ult && agora - ult < 400) { intervalos += agora - ult; nInt++; }
    ult = agora;
    // giro: base lento + inércia do arraste; segurar acelera e acende; parado com "reduzir movimento"
    const base = quieto ? 0 : 0.16 * (segurando ? 6 : 1);
    if (!ini) { ay += (base + vy) * dt; ax = Math.max(0.15, Math.min(1.35, ax + vx * dt)); vy *= Math.pow(0.12, dt); vx *= Math.pow(0.12, dt); if (!quieto) ax += (0.62 - ax) * Math.min(1, dt * 0.6); }
    brilho += ((segurando ? 1 : 0) - brilho) * Math.min(1, dt * 6);
    escala += ((segurando ? 1.07 : 1) - escala) * Math.min(1, dt * 6);
    const animando = !quieto || Math.abs(vy) + Math.abs(vx) > 0.01 || segurando || Math.abs(brilho) > 0.01;
    if (!animando && !pendente) return;
    pendente = false;
    desenhar();
    if (nInt === 40) {               // aparelho não acompanha: menos fios
      if (intervalos / nInt > alvoMs * 1.7 && densidade > 120) { densidade = Math.round(densidade * 0.6); fios = criarFios(s, densidade); }
      intervalos = 0; nInt = 0;
    }
  };
  medir(); new ResizeObserver(medir).observe(cv);
  new IntersectionObserver(([e]) => { visivel = e.isIntersecting; }).observe(cv);
  requestAnimationFrame(quadro);
}
