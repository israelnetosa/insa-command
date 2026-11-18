// Rosto do M.A.N.U.E.L.: quando ele entra em ação, os fios do núcleo tomam a tela e formam um rosto.
// O desenho é original: contorno, sobrancelhas, olhos, nariz e boca feitos dos mesmos fios do toro,
// com rodas girando em volta da cabeça (as "rodas dentro de rodas" do núcleo).
//
// Boca: cada letra vira uma posição de lábios (visema) e o tempo vem do próprio áudio:
//  - voz natural (Gemini): posição no texto = tempo tocado ÷ duração, e a abertura acompanha o volume real;
//  - voz do aparelho: os avisos de início de cada palavra marcam a posição exata no texto.
// Olhar: passeia, segue o dedo ou o mouse, pisca. Emoção: vem do dia da carteira (confiante, neutro,
// atento, sério) e muda o arco das sobrancelhas, o sorriso e a abertura dos olhos.

import { nivelAparelho } from './toro.js';

const TAU = Math.PI * 2;
const CIANO = '#48e5ff', AMBAR = '#ffb347', BRANCO = '#e6fbff', VIOLETA = '#a78bfa';

// ───────── visemas (pt-BR) ─────────
const V = {
  a: [1, 0.62, 0], e: [0.55, 0.85, 0], i: [0.28, 1, 0], o: [0.62, 0.2, 0.75], u: [0.3, 0, 1],
  m: [0, 0.45, 0], f: [0.12, 0.55, 0], c: [0.24, 0.55, 0], s: [0.18, 0.75, 0], r: [0.3, 0.5, 0.1], _: [0.04, 0.5, 0],
};
export function visema(ch) {
  const c = String(ch || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if ('a'.includes(c)) return V.a;
  if (c === 'e') return V.e; if (c === 'i' || c === 'y') return V.i;
  if (c === 'o') return V.o; if (c === 'u' || c === 'w') return V.u;
  if ('mbp'.includes(c) && c) return V.m;
  if ('fv'.includes(c) && c) return V.f;
  if ('szxjç'.includes(c) && c) return V.s;
  if (c === 'r' || c === 'l') return V.r;
  if (/[a-z0-9]/.test(c)) return V.c;
  return V._;
}

// ───────── geometria do rosto (espaço do rosto: x de -1 a 1, y para baixo) ─────────
const lerp = (a, b, k) => a + (b - a) * k;
/** Meia largura do rosto na altura y: testa arredondada, maçãs largas, mandíbula afinando até o queixo. */
export function largura(y) {
  if (y < -0.15) return 0.6 * Math.sqrt(Math.max(0, 1 - ((y + 0.15) / 0.73) ** 2));
  if (y < 0.2) return 0.6 - (y + 0.15) * 0.06;
  const k = Math.min(1, (y - 0.2) / 0.66);
  return lerp(0.58, 0.13, k ** 1.15) * Math.sqrt(Math.max(0, 1 - Math.max(0, (k - 0.85) / 0.15) ** 2 * 0.6));
}
function contorno(s, P) {
  const th = s * TAU, y = -Math.cos(th) * 0.87;
  return [Math.sign(Math.sin(th)) * largura(y) * Math.min(1, Math.abs(Math.sin(th)) * 6), y + 0.02 + P.aberto * 0.03 * Math.max(0, y)];
}
// malha que dá volume: paralelos e meridianos sobre a superfície do rosto
function paralelo(yy, s, P) {
  const w = largura(yy) * 0.97, x = lerp(-w, w, s), u = x / (w || 1);
  return [x, yy + (1 - u * u) * 0.035 + (yy > 0.25 ? P.aberto * 0.03 : 0)];
}
function meridiano(xx, s, P) {
  const y = lerp(-0.8, 0.84, s), w = largura(y);
  return [xx * w * 1.02, y + (1 - xx * xx) * 0.01 + (y > 0.25 ? P.aberto * 0.03 : 0)];
}
function sobrancelha(lado, s, P) {
  const x = lado * lerp(0.1, 0.43, s);
  const arco = Math.sin(s * Math.PI) * 0.055;
  const ergue = P.sobr + (lado < 0 ? P.sobrL : 0);
  const dentro = P.franze * (1 - s) * 0.05;   // franzir puxa a ponta de dentro para baixo
  return [x, -0.3 - arco - ergue * 0.07 + dentro];
}
function palpebra(lado, cima, s, P) {
  const x0 = lado * 0.11, x1 = lado * 0.41, x = lerp(x0, x1, s);
  const ab = (lado < 0 ? P.olhoL : P.olhoR) * P.abertura;
  const curva = Math.sin(s * Math.PI) * (cima ? 0.085 : 0.05) * ab;
  return [x, -0.12 + (cima ? -curva : curva) + (s - 0.5) * 0.01 * lado];
}
function iris(lado, s, raio, P) {
  const cx = lado * 0.26 + P.olharX * 0.07, cy = -0.12 + P.olharY * 0.035;
  const ab = Math.max(0.15, (lado < 0 ? P.olhoL : P.olhoR) * P.abertura);
  return [cx + Math.cos(s * TAU) * raio, cy + Math.sin(s * TAU) * raio * Math.min(1, ab * 1.25)];
}
function nariz(s, P) {
  if (s < 0.7) { const k = s / 0.7; return [0.015 + k * 0.035, -0.14 + k * 0.29]; }
  const k = (s - 0.7) / 0.3; return [0.05 - k * 0.1, 0.15 + Math.sin(k * Math.PI) * 0.025];
}
function boca(cima, s, P) {
  const larg = 0.2 * (0.72 + P.largo * 0.38) * (1 - P.redondo * 0.42);
  const x = lerp(-larg, larg, s), u = 2 * s - 1;
  const canto = -P.sorriso * 0.05 * (u * u);       // sorriso sobe os cantos
  const yb = 0.37 + canto;
  const ab = P.aberto;
  if (cima) {
    const arco = (1 - u * u) * (0.018 + ab * 0.03) + Math.max(0, 0.012 - Math.abs(u) * 0.06);   // arco do cupido
    return [x, yb - arco - ab * 0.015];
  }
  return [x, yb + (1 - u * u) * (0.02 + ab * 0.13 + P.redondo * ab * 0.03)];
}
function queixo(s, P) { return [lerp(-0.14, 0.14, s), 0.64 + Math.sin(s * Math.PI) * 0.03 + P.aberto * 0.03]; }
function maca(lado, s, P) { return [lado * lerp(0.47, 0.3, s), lerp(-0.02, 0.24, s) - P.sorriso * 0.02 * s]; }

const FEICOES = [
  // nome, função, fios (forte), cor, brilho, fechada, largura do trecho
  ['contorno', (s, P) => contorno(s, P), 110, CIANO, 0.3, true, [0.15, 0.5]],
  ...[-0.62, -0.48, -0.36, -0.02, 0.1, 0.22, 0.5, 0.62, 0.74].map((yy) => ['malha', (s, P) => paralelo(yy, s, P), 4, CIANO, 0.07, false]),
  ...[-0.82, -0.62, -0.4, -0.18, 0, 0.18, 0.4, 0.62, 0.82].map((xx) => ['malha', (s, P) => meridiano(xx, s, P), 3, xx === 0 ? VIOLETA : CIANO, 0.06, false]),
  ['sobrE', (s, P) => sobrancelha(-1, s, P), 12, BRANCO, 0.7, false],
  ['sobrD', (s, P) => sobrancelha(1, s, P), 12, BRANCO, 0.7, false],
  ['palpEC', (s, P) => palpebra(-1, true, s, P), 12, CIANO, 0.9, false],
  ['palpEB', (s, P) => palpebra(-1, false, s, P), 8, CIANO, 0.6, false],
  ['palpDC', (s, P) => palpebra(1, true, s, P), 12, CIANO, 0.9, false],
  ['palpDB', (s, P) => palpebra(1, false, s, P), 8, CIANO, 0.6, false],
  ['irisE', null, 14, AMBAR, 0.95, true, null, -1],
  ['irisD', null, 14, AMBAR, 0.95, true, null, 1],
  ['nariz', (s, P) => nariz(s, P), 9, CIANO, 0.45, false],
  ['bocaC', (s, P) => boca(true, s, P), 16, BRANCO, 0.85, false],
  ['bocaB', (s, P) => boca(false, s, P), 16, BRANCO, 0.75, false],
  ['queixo', (s, P) => queixo(s, P), 8, CIANO, 0.35, false],
  ['macaE', (s, P) => maca(-1, s, P), 6, VIOLETA, 0.35, false],
  ['macaD', (s, P) => maca(1, s, P), 6, VIOLETA, 0.35, false],
];

function criarFios(fator) {
  let a = 987654321;
  const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const fios = [];
  for (const [nome, fn, n, cor, alfa, fechada, trecho, lado] of FEICOES) {
    const qtd = Math.max(3, Math.round(n * fator));
    for (let i = 0; i < qtd; i++) {
      const f = { nome, fn, fechada, cor, alfa: alfa * (0.55 + rnd() * 0.45), ph: rnd() * TAU, w: 0.6 + rnd() * 1.4,
        amp: (nome === 'malha' ? 0.012 : nome === 'contorno' ? 0.008 : 0.004) + rnd() * rnd() * (nome === 'malha' ? 0.04 : nome === 'contorno' ? 0.035 : 0.022), fr: 1 + rnd() * 4, ini: rnd() * TAU, atraso: rnd() * 0.45 };
      if (nome.startsWith('iris')) { f.lado = lado; f.raio = 0.018 + (i / qtd) * 0.05 + rnd() * 0.006; f.s0 = rnd(); f.s1 = f.s0 + 0.55 + rnd() * 0.45; }
      else if (fechada && trecho) { f.s0 = rnd(); f.s1 = f.s0 + trecho[0] + rnd() * (trecho[1] - trecho[0]); }
      else { const ext = 0.06 * rnd(); f.s0 = -ext; f.s1 = 1 + ext * rnd(); }
      fios.push(f);
    }
  }
  // rodas em volta da cabeça
  for (let i = 0; i < Math.round(60 * fator); i++) {
    fios.push({ nome: 'roda', roda: i % 3, cor: [CIANO, AMBAR, VIOLETA][i % 3], alfa: 0.12 + rnd() * 0.16, ph: rnd() * TAU, w: 0.5 + rnd(),
      amp: 0.01 + rnd() * 0.03, fr: 2 + rnd() * 3, s0: rnd(), s1: 0, ini: rnd() * TAU, atraso: rnd() * 0.45, raio: 0.98 + rnd() * 0.16 });
    fios[fios.length - 1].s1 = fios[fios.length - 1].s0 + 0.1 + rnd() * 0.35;
  }
  return fios;
}

/** Humor do dia → parâmetros de expressão. */
export function humor(estado = {}) {
  const pct = Number(estado.variacao_pct) || 0;
  if (estado.ouvindo) return { nome: 'atento', sobr: 0.55, franze: 0, sorriso: 0.1, abertura: 1.12 };
  if (pct <= -1.2) return { nome: 'sério', sobr: -0.15, franze: 0.6, sorriso: -0.25, abertura: 0.92 };
  if ((estado.alertas || 0) > 0 && pct < 0.3) return { nome: 'atento', sobr: 0.3, franze: 0.15, sorriso: 0, abertura: 1.05 };
  if (pct >= 0.5) return { nome: 'confiante', sobr: 0.15, franze: 0, sorriso: 0.55, abertura: 1 };
  return { nome: 'neutro', sobr: 0.05, franze: 0, sorriso: 0.15, abertura: 1 };
}

let ATUAL = null;
const pref3d = () => { try { return localStorage.getItem('insa.pref.rosto3d') !== '0'; } catch { return true; } };
/**
 * Abre o rosto em tela cheia. Devolve um controle:
 *  falar(texto, { audio, fala })  · posicao(charIndex) · ouvindo(bool, parcial) · legenda(t) · humor(estado) · fechar()
 */
export function abrirRosto({ estado = {}, aoFechar, aoMicrofone, telemetria = [] } = {}) {
  if (ATUAL) { ATUAL.humor(estado); return ATUAL; }
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nivel = nivelAparelho();
  const fator = [0.45, 0.75, 1.15][nivel], dprMax = [1.25, 2, 3][nivel], msAlvo = [33, 22, 16][nivel];

  const el = document.createElement('div');
  el.className = 'rosto'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'M.A.N.U.E.L.');
  const linhas = (telemetria.length ? telemetria : ['SYS.MANUEL :: ONLINE', 'NUCLEO :: MALHA REATIVA', 'FEED B3 :: AGUARDANDO']).map(t => String(t).replace(/[<>&]/g, ''));
  const coluna = (k) => Array.from({ length: 3 }, () => linhas).flat().map((t, i) => `<div>${String((i * 7919 + k) % 9973).padStart(4, '0')} ${t}</div>`).join('');
  el.innerHTML = `<div class="rosto-telemetria" aria-hidden="true"><div class="tl-col">${coluna(1)}</div><div class="tl-col tl-dir">${coluna(5)}</div></div><canvas class="rosto-cv rosto-cv3d" hidden></canvas><canvas class="rosto-cv"></canvas>
    <div class="rosto-topo"><span class="rosto-nome">M.A.N.U.E.L.</span><span class="rosto-estado" id="rosto-estado">em linha</span>
      <button type="button" class="rosto-x" aria-label="Fechar">✕</button></div>
    <div class="rosto-baixo"><p class="rosto-legenda" id="rosto-leg" aria-live="polite"></p>
      ${aoMicrofone ? '<button type="button" class="rosto-mic" id="rosto-mic" aria-label="Segure para falar">🎙 segure para falar</button>' : ''}</div>`;
  document.body.appendChild(el);
  document.documentElement.classList.add('com-rosto');
  const cv = el.querySelector('canvas.rosto-cv:not(.rosto-cv3d)'), ctx = cv.getContext('2d', { alpha: true, desynchronized: true });
  const cv3 = el.querySelector('.rosto-cv3d');
  // rosto 3D ("malha reativa"): carregado sob demanda nos aparelhos médios e fortes; até chegar, os fios 2D aparecem
  let r3 = null;
  const dpr3 = () => Math.min(devicePixelRatio || 1, nivel === 2 ? 2.25 : 1.5);
  if (nivel >= 1 && !quieto && window.WebGLRenderingContext && pref3d()) {
    const url = '/rosto3d.js';
    import(url).then((mod) => mod.criar(cv3, { forte: nivel === 2 })).then((api) => {
      if (saindo || !document.body.contains(el)) { api.liberar(); return; }
      r3 = api; cv3.hidden = false; r3.medir(innerWidth, innerHeight, dpr3());
      cv3.classList.add('pronto'); cv.classList.add('some'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    }).catch(() => { /* fica no rosto 2D */ });
  }
  const leg = el.querySelector('#rosto-leg'), est = el.querySelector('#rosto-estado');
  let W = 0, H = 0, dpr = 1;
  const medir = () => { dpr = Math.min(dprMax, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); r3?.medir(W, H, dpr3()); };
  medir(); addEventListener('resize', medir);

  const fios = criarFios(fator);
  // pose atual (P) e alvo (A)
  const h0 = humor(estado);
  const P = { aberto: 0, largo: 0.5, redondo: 0, sorriso: h0.sorriso, sobr: h0.sobr, sobrL: 0, franze: h0.franze, abertura: h0.abertura, olhoL: 1, olhoR: 1, olharX: 0, olharY: 0, cabX: 0, cabY: 0, incl: 0 };
  let H_ = h0;
  let T = 0, entrada = 0, saindo = false, fala = null, ouvindoAgora = false, nivelSom = 0;
  let proxPiscar = 1.5 + Math.random() * 2.5, piscando = 0, proxOlhar = 0.8, alvoOlhar = [0, 0], ponteiro = null, proxSacada = 0.2;

  // som: analisador de volume (só quando o contexto de áudio já está liberado)
  let actx = null, analis = null, buf = null;
  const ligarAnalisador = (audio) => {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state !== 'running') return false;
      if (audio._insaFonte) return true;
      const src = actx.createMediaElementSource(audio); audio._insaFonte = src;
      analis = actx.createAnalyser(); analis.fftSize = 512; buf = new Uint8Array(analis.fftSize);
      src.connect(analis); analis.connect(actx.destination);
      return true;
    } catch { return false; }
  };
  const volume = () => {
    if (!analis || !buf) return null;
    analis.getByteTimeDomainData(buf); let s = 0;
    for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; }
    return Math.min(1, Math.sqrt(s / buf.length) * 4.5);
  };

  const fechar = () => {
    if (saindo) return; saindo = true;
    setTimeout(() => { try { r3?.liberar(); } catch {} el.remove(); document.documentElement.classList.remove('com-rosto'); removeEventListener('resize', medir); ATUAL = null; aoFechar?.(); }, 520);
    el.classList.add('saindo');
  };
  el.querySelector('.rosto-x').onclick = (e) => { e.stopPropagation(); fechar(); };
  el.addEventListener('pointermove', (e) => { ponteiro = [(e.clientX / W - 0.5) * 2, (e.clientY / H - 0.45) * 2]; });
  el.addEventListener('pointerleave', () => { ponteiro = null; });
  const mic = el.querySelector('#rosto-mic');
  if (mic && aoMicrofone) aoMicrofone(mic);
  el.addEventListener('click', (e) => { if ((e.target === cv || e.target === cv3) && !ouvindoAgora) fechar(); });

  const ctrl = {
    falar(texto, { audio = null, porPalavra = false } = {}) {
      fala = { texto: String(texto || ''), audio, porPalavra, pos: 0, inicio: performance.now(), dur: Math.max(1.2, String(texto || '').length / 13.5), ultimoLimite: 0, ultimoLimiteEm: 0, ativo: true };
      if (audio) { const ok = ligarAnalisador(audio); fala.analisa = ok; audio.addEventListener('loadedmetadata', () => { if (isFinite(audio.duration)) fala.dur = audio.duration; }, { once: true }); }
      ctrl.legenda(texto); est.textContent = 'falando';
    },
    /** voz do aparelho: início de cada palavra */
    posicao(charIndex) { if (fala) { fala.ultimoLimite = charIndex; fala.ultimoLimiteEm = performance.now(); } },
    calar() { if (fala) fala.ativo = false; est.textContent = ouvindoAgora ? 'ouvindo' : 'em linha'; },
    ouvindo(on, parcial) {
      ouvindoAgora = !!on; el.classList.toggle('ouvindo', ouvindoAgora);
      est.textContent = on ? 'ouvindo' : (fala?.ativo ? 'falando' : 'em linha');
      H_ = humor({ ...estado, ouvindo: on });
      if (parcial != null) leg.textContent = parcial ? '“' + parcial + '”' : 'Ouvindo, Comandante…';
    },
    legenda(t) { leg.textContent = String(t || '').replace(/\s+/g, ' ').slice(0, 400); },
    humor(e) { estado = { ...estado, ...e }; H_ = humor(estado); },
    pensar() { est.textContent = 'analisando'; },
    /** som bloqueado pelo aparelho: o próximo toque na tela toca a fala */
    aguardarToque(fn) {
      est.textContent = 'toque para ouvir';
      const h = (e) => { if (e.target.closest('button')) return; e.stopPropagation(); el.removeEventListener('click', h, true); est.textContent = 'falando'; fn(); };
      el.addEventListener('click', h, true);
    },
    fechar, el,
  };
  ATUAL = ctrl;

  // ───────── animação ─────────
  const tmp = [0, 0];
  const desenhar = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, W, H);
    const esc = Math.min(W * 0.92, H * 0.62) * 0.55, ox = W / 2 + P.cabX * esc * 0.04, oy = H * 0.43 + P.cabY * esc * 0.03;
    const ci = Math.cos(P.incl), si = Math.sin(P.incl);
    const tela = (x, y, o) => { o[0] = ox + (x * ci - y * si) * esc; o[1] = oy + (x * si + y * ci) * esc; return o; };
    const k = entrada;   // 0 = espalhado no anel, 1 = rosto formado
    // interior da boca (escuro) quando aberta
    if (P.aberto > 0.08) {
      ctx.beginPath();
      for (let j = 0; j <= 16; j++) { const [x, y] = boca(true, j / 16, P); tela(x, y + 0.008, tmp); j ? ctx.lineTo(tmp[0], tmp[1]) : ctx.moveTo(tmp[0], tmp[1]); }
      for (let j = 16; j >= 0; j--) { const [x, y] = boca(false, j / 16, P); tela(x, y - 0.008, tmp); ctx.lineTo(tmp[0], tmp[1]); }
      ctx.fillStyle = 'rgba(1,6,12,0.85)'; ctx.globalAlpha = k; ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const N = 16;
    const baldes = new Map();
    for (const f of fios) {
      const kk = Math.max(0, Math.min(1, (k - f.atraso * (saindo ? 0 : 1)) / (1 - f.atraso * 0.9)));
      const ease = kk * kk * (3 - 2 * kk);
      const chave = f.cor + '|' + Math.round(f.alfa * 6); let path = baldes.get(chave); if (!path) baldes.set(chave, path = { p: new Path2D(), a: 0, n: 0, cor: f.cor });
      path.a += f.alfa; path.n++;
      for (let j = 0; j < N; j++) {
        const s = f.s0 + (f.s1 - f.s0) * (j / (N - 1));
        let x, y;
        if (f.nome === 'roda') {
          const ang = s * TAU + T * (0.12 + f.roda * 0.05) * (f.roda === 1 ? -1 : 1);
          const ry = [0.32, 0.22, 0.42][f.roda], rot = [0.25, -0.5, 1.2][f.roda] + T * 0.03 * (f.roda - 1);
          const ex = Math.cos(ang) * f.raio, ey = Math.sin(ang) * f.raio * ry;
          x = ex * Math.cos(rot) - ey * Math.sin(rot); y = ex * Math.sin(rot) + ey * Math.cos(rot) - 0.05;
        } else if (f.nome.startsWith('iris')) { [x, y] = iris(f.lado, s, f.raio, P); }
        else { [x, y] = f.fn(f.fechada ? ((s % 1) + 1) % 1 : Math.max(0, Math.min(1, s)), P); }
        // fios vivos: ondulam em volta da linha
        const n = Math.sin(s * f.fr * TAU + T * f.w + f.ph) * f.amp;
        x += n; y += Math.cos(s * f.fr * 5 + T * f.w * 0.8 + f.ph) * f.amp * 0.7;
        if (ease < 1) {   // vindo do anel do núcleo
          const a0 = f.ini + s * 1.6 + T * 0.4;
          const rx = Math.cos(a0) * 0.95, ry = Math.sin(a0) * 0.33;
          x = lerp(rx, x, ease); y = lerp(ry, y, ease);
        }
        tela(x, y, tmp);
        j ? path.p.lineTo(tmp[0], tmp[1]) : path.p.moveTo(tmp[0], tmp[1]);
      }
    }
    const brilhoFala = fala?.ativo ? 0.25 + nivelSom * 0.6 : 0;
    for (const b of baldes.values()) {
      const cor = b.cor, media = b.a / b.n;
      if (nivel > 0) { ctx.strokeStyle = cor; ctx.lineWidth = 3.2; ctx.globalAlpha = Math.min(1, media * 0.09 * (1 + brilhoFala) * k); ctx.stroke(b.p); }
      ctx.strokeStyle = cor; ctx.lineWidth = cor === AMBAR ? 1.1 : 0.85; ctx.globalAlpha = Math.min(1, media * 0.55 * (1 + brilhoFala * 0.6) * (0.25 + 0.75 * k)); ctx.stroke(b.p);
    }
    // pupilas e brilho dos olhos
    for (const lado of [-1, 1]) {
      const ab = (lado < 0 ? P.olhoL : P.olhoR) * P.abertura; if (ab < 0.25) continue;
      const [x, y] = iris(lado, 0, 0, P); tela(x, y, tmp);
      const r = esc * 0.022;
      const g = ctx.createRadialGradient(tmp[0], tmp[1], 0, tmp[0], tmp[1], r * 3.2);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.25, 'rgba(255,179,71,0.6)'); g.addColorStop(1, 'rgba(255,179,71,0)');
      ctx.globalAlpha = k * Math.min(1, ab); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(tmp[0], tmp[1], r * 3.2, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  };

  let ult = 0;
  const quadro = (agora) => {
    if (!document.body.contains(el)) return;
    requestAnimationFrame(quadro);
    if (document.hidden || agora - ult < msAlvo - 2) return;
    const dt = ult ? Math.min(0.1, (agora - ult) / 1000) : 0.016; ult = agora;
    if (!quieto) T += dt;
    entrada = saindo ? Math.max(0, entrada - dt * 2.4) : Math.min(1, entrada + dt * (quieto ? 10 : 1.25));

    // ── boca: visema do caractere atual × volume real ──
    let alvoBoca = V._;
    nivelSom += ((volume() ?? 0) - nivelSom) * Math.min(1, dt * 20);
    if (fala?.ativo) {
      const L = fala.texto.length;
      let pos;
      if (fala.porPalavra && fala.ultimoLimiteEm) pos = fala.ultimoLimite + (agora - fala.ultimoLimiteEm) / 1000 * 13.5;
      else if (fala.audio && isFinite(fala.audio.duration) && fala.audio.duration > 0) pos = fala.audio.currentTime / fala.audio.duration * L;
      else pos = (agora - fala.inicio) / 1000 / fala.dur * L;
      pos = Math.max(0, Math.min(L - 1, pos));
      const i = Math.floor(pos), fr = pos - i;
      const v0 = visema(fala.texto[i]), v1 = visema(fala.texto[i + 1]);
      alvoBoca = [lerp(v0[0], v1[0], fr), lerp(v0[1], v1[1], fr), lerp(v0[2], v1[2], fr)];
      if (fala.analisa) {   // o som manda: silêncio fecha a boca, sílaba forte abre mais
        const vol = nivelSom;
        alvoBoca = [alvoBoca[0] * Math.min(1.25, 0.15 + vol * 1.9), alvoBoca[1], alvoBoca[2]];
      }
      if (fala.audio && (fala.audio.ended || fala.audio.paused && fala.audio.currentTime > 0)) ctrl.calar();
    }
    const kb = Math.min(1, dt * 22);
    P.aberto = lerp(P.aberto, alvoBoca[0], kb); P.largo = lerp(P.largo, alvoBoca[1], kb); P.redondo = lerp(P.redondo, alvoBoca[2], kb);

    // ── expressão ──
    const ke = Math.min(1, dt * 3);
    const falando = !!fala?.ativo;
    P.sorriso = lerp(P.sorriso, H_.sorriso * (falando ? 0.6 : 1), ke);
    P.sobr = lerp(P.sobr, H_.sobr + (falando ? nivelSom * 0.35 + Math.sin(T * 2.3) * 0.05 : 0), ke);
    P.franze = lerp(P.franze, H_.franze, ke);
    P.abertura = lerp(P.abertura, H_.abertura, ke);
    P.sobrL = lerp(P.sobrL, H_.nome === 'atento' ? 0.12 : 0, ke);

    // ── piscar ──
    proxPiscar -= dt;
    if (proxPiscar <= 0 && !piscando) { piscando = 0.16; proxPiscar = 2.2 + Math.random() * 3.5 + (Math.random() < 0.15 ? -1.8 : 0); }
    if (piscando > 0) { piscando = Math.max(0, piscando - dt); const f = Math.sin((1 - piscando / 0.16) * Math.PI); P.olhoL = P.olhoR = 1 - f * 0.95; }
    else { P.olhoL = lerp(P.olhoL, 1, dt * 10); P.olhoR = lerp(P.olhoR, 1, dt * 10); }

    // ── olhar: segue o dedo/mouse; senão passeia, e fala olhando para o Comandante com pequenas sacadas ──
    proxOlhar -= dt; proxSacada -= dt;
    if (ponteiro) alvoOlhar = [Math.max(-1, Math.min(1, ponteiro[0] * 1.3)), Math.max(-1, Math.min(1, ponteiro[1] * 1.3))];
    else if (proxOlhar <= 0) { proxOlhar = 1.2 + Math.random() * 2.6; alvoOlhar = falando || ouvindoAgora ? [(Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.25] : [(Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 0.9]; }
    let sx = 0, sy = 0; if (proxSacada <= 0) { proxSacada = 0.25 + Math.random() * 0.6; sx = (Math.random() - 0.5) * 0.08; sy = (Math.random() - 0.5) * 0.05; }
    const ko = Math.min(1, dt * 9);
    P.olharX = lerp(P.olharX, alvoOlhar[0] + sx, ko); P.olharY = lerp(P.olharY, alvoOlhar[1] + sy, ko);

    // ── cabeça: respira, balança de leve e acompanha a fala ──
    if (!quieto) {
      P.cabX = Math.sin(T * 0.37) * 0.6 + P.olharX * 0.4;
      P.cabY = Math.sin(T * 0.5) * 0.4 + (falando ? nivelSom * 0.8 : 0);
      P.incl = Math.sin(T * 0.23) * 0.025 + (ouvindoAgora ? 0.05 : 0) + P.olharX * 0.015;
    }
    if (r3) r3.quadro(P, { T, dt, k: entrada, som: nivelSom, falando, ouvindo: ouvindoAgora });
    else desenhar();
  };
  requestAnimationFrame(quadro);
  return ctrl;
}

export const rostoAberto = () => ATUAL;
