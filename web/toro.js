// Toro de fios do núcleo: rodas dentro de rodas em 3D. Cada fio é uma parte do patrimônio de um ativo,
// na proporção do valor, colorido pela classe (dourado FIIs, branco ações, violeta ETF, ciano cripto).
// A mira percorre os ativos (compras do plano primeiro) e um rótulo mostra o candidato.
//
// 2.2 · "vivo": a geometria de cada fio é recalculada a cada quadro a partir de parâmetros fixos, então o toro
// respira, os fios ondulam e escorrem devagar pelo anel, pulsos de luz correm pelos fios e as pontas cintilam.
// Mistura aditiva com uma passada de brilho dá a sensação de holograma.
//
// Desempenho em camadas: aparelho forte (8+ núcleos, ex.: Galaxy S24 Ultra) desenha na resolução nativa da tela
// (até 3×), com ~1000 fios a 60 quadros/s; os demais ficam mais leves. Se o aparelho não acompanhar, o app
// desliga o brilho, depois reduz fios e resolução, sozinho. Tudo para com a tela escondida, fora da vista ou
// com "reduzir movimento".

const nf = (n, d = 2) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const brl = (n, d = 2) => 'R$ ' + nf(n, d);
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COR = { 'FII': '#ffb347', 'Ação': '#cfeeff', 'ETF': '#a78bfa', 'ETF cripto': '#48e5ff' };
const corDe = (p) => COR[p.tipo] ?? '#cfeeff';
const TAU = Math.PI * 2;

export function filaFoco(s) {
  // mesma ordem da fila de compra da matriz 5x20; alvo = alvo individual do ativo (FIIs 10% + 10%)
  const P = s.posicoes || [];
  const lugar = new Map((s.fila_compra || []).map(f => [f.ticker, f.posicao]));
  const oc = s.ordem_mensal?.compra;
  const ord = [...P].sort((a, b) => (lugar.get(a.ticker) ?? 99) - (lugar.get(b.ticker) ?? 99));
  return ord.map(p => ({ ticker: p.ticker, atraso: (p.alvo_individual ?? 0) - (p.peso_patrimonio ?? p.peso ?? 0), alvo: p.alvo_individual ?? 0,
    congelado: p.bloco_status === 'congelado', compra: oc && oc.ticker === p.ticker ? oc : null }));
}

/** Nível do aparelho: 2 = forte (resolução nativa, 60 q/s), 1 = médio, 0 = leve. */
export function nivelAparelho(nav = navigator, largura = innerWidth) {
  const nucleos = nav.hardwareConcurrency || 4, mem = nav.deviceMemory ?? 8;
  if (nucleos >= 8 && mem >= 6) return 2;
  if (nucleos >= 6 || largura >= 700) return 1;
  return 0;
}

const PERFIL = [
  // dprMax, fios no celular, fios no PC, pontos por fio, ms por quadro, brilho, pulsos
  { dpr: 1.25, cel: 320, pc: 600, pts: 12, ms: 33, brilho: false, pulsos: 14 },
  { dpr: 2, cel: 560, pc: 900, pts: 16, ms: 24, brilho: true, pulsos: 26 },
  { dpr: 3, cel: 1000, pc: 1400, pts: 22, ms: 16, brilho: true, pulsos: 44 },
];

/** Parâmetros fixos de cada fio; a forma em cada instante sai de `pontoFio`. Determinístico (mesma carteira, mesmo toro). */
export function criarFios(s, n) {
  const P = (s.posicoes || []).filter(p => p.valor > 0);
  const tot = P.reduce((a, p) => a + p.valor, 0) || 1;
  let u = 0; const faixas = P.map(p => { const w = p.valor / tot * TAU; const f = { p, u0: u, w }; u += w; return f; });
  const rnd = (() => { let a = 1234567; return () => {   // mulberry32
    a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  const fios = [];
  for (let i = 0; i < n; i++) {
    const q = rnd() * TAU;
    const f = faixas.find(ff => q >= ff.u0 && q < ff.u0 + ff.w) || faixas[faixas.length - 1];
    if (!f) break;
    const base = { cor: corDe(f.p), t: f.p.ticker, u0: q, v0: rnd() * TAU, ph: rnd() * TAU,
      sp: (rnd() - 0.5) * 0.035,              // escorre pelo anel, cada fio no seu ritmo
      w: 0.35 + rnd() * 0.9 };                // velocidade da ondulação
    if (rnd() < 0.14) {                        // espinhos para fora, com ponta que cintila
      fios.push({ ...base, ponta: true, len: 0.05 + rnd() * rnd() * 0.5 });
      continue;
    }
    const longo = rnd() < 0.75;                // 3 de 4 correm ao longo do anel; o resto dá a volta no tubo
    const du = (longo ? 1.2 + rnd() * 2.2 : 0.08 + rnd() * 0.35) * (rnd() < .5 ? -1 : 1);
    const k = longo ? (rnd() * 2 - 1) * 0.8 : (rnd() < .5 ? -1 : 1) * (Math.PI * (0.6 + rnd() * 0.8)) / Math.abs(du);
    fios.push({ ...base, du, k, amp: rnd() * (longo ? 0.35 : 0.1), fr: 1 + rnd() * 3, ex: (rnd() - 0.5) * 0.06 });
  }
  return fios;
}

/** Ponto do fio na posição q (0–1) no instante T: toro que respira + ondulação + deriva. */
export function pontoFio(f, q, T, out) {
  const r = 0.36 * (1 + 0.035 * Math.sin(T * 0.42)) + 0.012 * Math.sin(T * 0.9 + f.ph);
  let uu, vv, rr;
  if (f.ponta) {
    uu = f.u0 + T * f.sp; vv = f.v0;
    rr = r + q * f.len * (0.78 + 0.22 * Math.sin(T * f.w * 2.2 + f.ph));
  } else {
    uu = f.u0 + f.du * q + T * f.sp;
    vv = f.v0 + f.k * f.du * q + f.amp * Math.sin(q * f.fr * Math.PI + T * f.w + f.ph);
    rr = r + f.ex * Math.sin(T * 0.8 + f.ph + q * 3);
  }
  const cv = Math.cos(vv), anel = 1 + rr * cv;
  out[0] = anel * Math.cos(uu); out[1] = anel * Math.sin(uu); out[2] = rr * Math.sin(vv);
  return out;
}

// brilho redondo pré-desenhado por cor (drawImage é bem mais barato que shadowBlur)
const SPRITES = new Map();
function sprite(cor) {
  let c = SPRITES.get(cor); if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.18, cor); gr.addColorStop(0.45, cor + '55'); gr.addColorStop(1, cor + '00');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); SPRITES.set(cor, c); return c;
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
  const ctx = cv.getContext('2d', { alpha: true, desynchronized: true }); if (!ctx) return;
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const celular = innerWidth < 700;
  const nivel = nivelAparelho();
  const perfil = { ...PERFIL[nivel] };
  const fila = filaFoco(s);
  let densidade = celular ? perfil.cel : perfil.pc;
  let fios = criarFios(s, densidade);
  let W = 0, H = 0, dpr = 1, pendente = true;
  function pedir() { pendente = true; }
  const medir = () => {
    const b = cv.getBoundingClientRect();
    dpr = Math.min(perfil.dpr, devicePixelRatio || 1);
    W = b.width; H = b.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); pedir();
  };
  let visivel = true;

  // pulsos de luz correndo pelos fios
  const pulsos = [];
  const novoPulso = (p = {}) => {
    const corridos = fios.filter(f => !f.ponta); const f = corridos[Math.floor(Math.random() * corridos.length)];
    return Object.assign(p, { f, q: 0, vel: 0.12 + Math.random() * 0.3, dir: Math.random() < 0.5 ? 1 : -1 });
  };
  const semearPulsos = () => { pulsos.length = 0; for (let i = 0; i < perfil.pulsos; i++) { const p = novoPulso(); p.q = Math.random(); pulsos.push(p); } };
  semearPulsos();

  let ay = 0, ax = 0.62, vy = 0, vx = 0, segurando = false, brilho = 0, escala = 1, T = 0;
  let sel = null, hover = null, selAte = 0;
  const meios = [];

  let fi = 0, fioAlvo = null;
  const mostrar = (ticker, origem) => {
    const f = fila.find(x => x.ticker === ticker) ?? { ticker, alvo: 0 };
    const p = (s.posicoes || []).find(x => x.ticker === ticker);
    fioAlvo = fios.find(x => x.t === ticker && !x.ponta) ?? null;
    if (rotulo) rotulo.innerHTML = `<b>${origem === 'dono' ? 'SELECIONADO' : f.compra ? 'CANDIDATO' : 'OBSERVANDO'}</b> ${esc(ticker)} · ${p ? brl(p.preco) : '—'} · ${f.congelado ? 'bloco congelado' : `zona ${esc(p?.zona ?? '—')}`} · ${f.compra ? `plano ${f.compra.qtd} × ${brl(f.compra.preco)}` : `peso ${nf(p?.peso_patrimonio ?? p?.peso ?? 0, 1)}% / alvo ${nf(f.alvo, 1)}%`}`;
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

  let ini = null, ultX = 0, ultY = 0, ultT = 0, timerSegurar = 0;
  cv.addEventListener('pointerdown', (e) => {
    ini = { x: e.clientX, y: e.clientY, moveu: false }; ultX = e.clientX; ultY = e.clientY; ultT = performance.now();
    vy = vx = 0; hover = null;
    clearTimeout(timerSegurar); timerSegurar = setTimeout(() => { if (ini && !ini.moveu) { segurando = true; navigator.vibrate?.(12); pedir(); } }, 320);
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
      if (t) { sel = t; selAte = performance.now() + 10000; mostrar(t, 'dono'); aoSelecionar?.(t); navigator.vibrate?.(8); }
      else { sel = null; aoSelecionar?.(null); }
      pedir();
    }
    segurando = false; ini = null; pedir();
  };
  cv.addEventListener('pointerup', soltar); cv.addEventListener('pointercancel', soltar);
  cv.addEventListener('pointerleave', () => { if (hover) { hover = null; pedir(); } });
  cv.addEventListener('click', (e) => e.stopPropagation());
  cv.style.cursor = 'grab'; cv.style.touchAction = 'pan-y';

  const tmp = [0, 0, 0];
  const desenhar = () => {
    const sy = Math.sin(ay), cy = Math.cos(ay), sx = Math.sin(ax), cx = Math.cos(ax), sz = Math.sin(0.3), cz = Math.cos(0.3);
    const esc3 = Math.min(W, H) * 0.31 * escala, ox = W / 2, oy = H / 2, D = 3.4;
    const proj = (p, o) => {
      const x = p[0], y = p[1], z = p[2];
      const x1 = x * cy - y * sy, y1 = x * sy + y * cy;
      const y2 = y1 * cx - z * sx, z2 = y1 * sx + z * cx;
      const x3 = x1 * cz - y2 * sz, y3 = x1 * sz + y2 * cz;
      const k = D / (D + z2); o[0] = ox + x3 * esc3 * k; o[1] = oy + y3 * esc3 * k; o[2] = z2; return o;
    };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const foco = sel ?? hover;
    const N = perfil.pts;
    const baldes = new Map(), pontas = [], destaque = new Path2D();
    const xs = new Float32Array(N), ys = new Float32Array(N);
    meios.length = 0;
    for (const f of fios) {
      if (f.ponta) {
        proj(pontoFio(f, 0, T, tmp), tmp); const ax0 = tmp[0], ay0 = tmp[1];
        proj(pontoFio(f, 1, T, tmp), tmp);
        const nv = tmp[2] > 0.2 ? 0 : tmp[2] > -0.25 ? 1 : 2;
        const chave = f.cor + nv; let path = baldes.get(chave); if (!path) baldes.set(chave, path = new Path2D());
        path.moveTo(ax0, ay0); path.lineTo(tmp[0], tmp[1]);
        pontas.push([tmp[0], tmp[1], f.cor, nv, 0.6 + 0.4 * Math.sin(T * f.w * 4 + f.ph)]);
        continue;
      }
      let zs = 0;
      for (let j = 0; j < N; j++) { proj(pontoFio(f, j / (N - 1), T, tmp), tmp); xs[j] = tmp[0]; ys[j] = tmp[1]; zs += tmp[2]; }
      const m = N >> 1; meios.push([xs[m], ys[m], f.t]);
      let path;
      if (foco && f.t === foco) path = destaque;
      else {
        const z = zs / N, nv = z > 0.2 ? 0 : z > -0.25 ? 1 : 2;
        const chave = f.cor + nv; path = baldes.get(chave); if (!path) baldes.set(chave, path = new Path2D());
      }
      // curva suave pelos pontos médios (sem quinas)
      path.moveTo(xs[0], ys[0]);
      for (let j = 1; j < N - 1; j++) path.quadraticCurveTo(xs[j], ys[j], (xs[j] + xs[j + 1]) / 2, (ys[j] + ys[j + 1]) / 2);
      path.lineTo(xs[N - 1], ys[N - 1]);
    }
    const apaga = foco ? 0.5 : 1, acende = 1 + brilho * 1.2;
    const LARG = [0.35, 0.55, 0.85], ALFA = [0.08, 0.17, 0.32];
    ctx.globalCompositeOperation = 'lighter';
    // passada de brilho (halo largo e fraco) só nos fios do meio e da frente
    if (perfil.brilho) {
      for (const [chave, path] of baldes) {
        const nv = Number(chave.slice(7)); if (nv === 0) continue;
        ctx.strokeStyle = chave.slice(0, 7); ctx.lineWidth = nv === 2 ? 3.2 : 2.2;
        ctx.globalAlpha = Math.min(1, (nv === 2 ? 0.07 : 0.035) * apaga * acende); ctx.stroke(path);
      }
    }
    for (const [chave, path] of baldes) {
      const cor = chave.slice(0, 7), nv = Number(chave.slice(7));
      ctx.strokeStyle = cor; ctx.lineWidth = LARG[nv];
      ctx.globalAlpha = Math.min(1, ALFA[nv] * (cor === '#cfeeff' ? 0.85 : 1.25) * apaga * acende);
      ctx.stroke(path);
    }
    // pontas que cintilam
    for (const [x, y, cor, nv, pisca] of pontas) {
      const t = (nv === 2 ? 9 : nv === 1 ? 6 : 4) * (0.8 + brilho * 0.5);
      ctx.globalAlpha = Math.min(1, [0.25, 0.5, 0.9][nv] * pisca * acende);
      ctx.drawImage(sprite(cor), x - t / 2, y - t / 2, t, t);
    }
    // pulsos correndo pelos fios
    for (const p of pulsos) {
      if (!p.f) continue;
      proj(pontoFio(p.f, p.q, T, tmp), tmp);
      const nv = tmp[2] > 0.2 ? 0 : tmp[2] > -0.25 ? 1 : 2, t = [5, 8, 12][nv] * (foco && p.f.t === foco ? 1.6 : 1);
      ctx.globalAlpha = Math.min(1, [0.35, 0.6, 0.95][nv] * Math.sin(Math.PI * p.q) * (foco && p.f.t !== foco ? 0.4 : 1) * acende);
      ctx.drawImage(sprite(foco && p.f.t === foco ? '#ffd08a' : p.f.cor), tmp[0] - t / 2, tmp[1] - t / 2, t, t);
    }
    if (foco) {   // fios do ativo em foco acesos em dourado
      ctx.strokeStyle = '#ffd08a';
      ctx.globalAlpha = 0.22; ctx.lineWidth = 4; ctx.stroke(destaque);
      ctx.globalAlpha = 0.95; ctx.lineWidth = 1.1; ctx.stroke(destaque);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (fioAlvo && mira) { proj(pontoFio(fioAlvo, 0.5, T, tmp), tmp); mira.style.transform = `translate(${tmp[0].toFixed(1)}px, ${tmp[1].toFixed(1)}px)`; }
  };

  const id = ++LOOP;
  let ult = 0, intervalos = 0, nInt = 0, rebaixos = 0;
  const quadro = (agora) => {
    if (id !== LOOP || !document.body.contains(cv)) return;
    requestAnimationFrame(quadro);
    if (document.hidden || !visivel || agora - ult < perfil.ms - 2) return;
    const dt = ult ? Math.min(0.1, (agora - ult) / 1000) : 0;
    if (ult && agora - ult < 400) { intervalos += agora - ult; nInt++; }
    ult = agora;
    const base = quieto ? 0 : 0.14 * (segurando ? 6 : 1);
    if (!ini) { ay += (base + vy) * dt; ax = Math.max(0.15, Math.min(1.35, ax + vx * dt)); vy *= Math.pow(0.12, dt); vx *= Math.pow(0.12, dt); if (!quieto) ax += (0.62 + 0.05 * Math.sin(T * 0.21) - ax) * Math.min(1, dt * 0.6); }
    if (!quieto) {
      T += dt * (segurando ? 2.2 : 1);
      for (const p of pulsos) { p.q += p.vel * dt * (segurando ? 3 : 1); if (p.q >= 1) novoPulso(p); }
    }
    brilho += ((segurando ? 1 : 0) - brilho) * Math.min(1, dt * 6);
    escala += ((segurando ? 1.07 : 1) - escala) * Math.min(1, dt * 6);
    const animando = !quieto || Math.abs(vy) + Math.abs(vx) > 0.01 || segurando || Math.abs(brilho) > 0.01;
    if (!animando && !pendente) return;
    pendente = false;
    desenhar();
    if (nInt === 60) {   // não acompanha: tira o brilho, depois fios, depois resolução
      if (intervalos / nInt > perfil.ms * 1.6 && rebaixos < 4) {
        rebaixos++;
        if (perfil.brilho) perfil.brilho = false;
        else if (densidade > 260) { densidade = Math.round(densidade * 0.7); fios = criarFios(s, densidade); semearPulsos(); if (sel || fioAlvo) mostrar(sel ?? fioAlvo.t, sel ? 'dono' : undefined); }
        else if (perfil.dpr > 1) { perfil.dpr = Math.max(1, perfil.dpr - 0.75); medir(); }
      }
      intervalos = 0; nInt = 0;
    }
  };
  medir(); new ResizeObserver(medir).observe(cv);
  new IntersectionObserver(([e]) => { visivel = e.isIntersecting; }).observe(cv);
  requestAnimationFrame(quadro);
}
