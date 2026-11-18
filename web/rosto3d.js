// Rosto 3D do M.A.N.U.E.L. ("malha reativa"): cabeça em malha de fios e nós luminosos, olhos âmbar,
// busto em nuvem de pontos, anéis dourados com faíscas e poeira de dados. Carregado sob demanda
// (só quando o rosto abre) para não pesar na abertura do app.
//
// A cabeça é o modelo de exemplo "facecap" do three.js (52 expressões no padrão ARKit), sem texturas.
// Boca, olhos, sobrancelhas e piscadas vêm da mesma pose calculada em rosto.js (visemas + volume do áudio,
// humor do dia e olhar), traduzida aqui para as expressões do modelo.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const CIANO = new THREE.Color('#48e5ff'), CIANO_CLARO = new THREE.Color('#a8f4ff'), AMBAR = new THREE.Color('#ffb347'), OURO = new THREE.Color('#ffc46b');
const cl = (x) => Math.max(0, Math.min(1, x));

/** Divide cada triângulo em 4 (pontos médios das arestas), levando junto as expressões (morph targets). */
function subdividir(geo) {
  const idx = geo.index.array, pos = geo.attributes.position, morfs = geo.morphAttributes.position || [];
  const n0 = pos.count, meio = new Map(), extra = [];
  const chave = (a, b) => (a < b ? a * 1e6 + b : b * 1e6 + a);
  const medio = (a, b) => { const k = chave(a, b); let m = meio.get(k); if (m == null) { m = n0 + extra.length; meio.set(k, m); extra.push([a, b]); } return m; };
  const novoIdx = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2], ab = medio(a, b), bc = medio(b, c), ca = medio(c, a);
    novoIdx.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  const total = n0 + extra.length;
  const expandir = (attr) => {
    const out = new Float32Array(total * 3);
    for (let i = 0; i < n0; i++) { out[i * 3] = attr.getX(i); out[i * 3 + 1] = attr.getY(i); out[i * 3 + 2] = attr.getZ(i); }
    extra.forEach(([a, b], j) => { const i = n0 + j; out[i * 3] = (attr.getX(a) + attr.getX(b)) / 2; out[i * 3 + 1] = (attr.getY(a) + attr.getY(b)) / 2; out[i * 3 + 2] = (attr.getZ(a) + attr.getZ(b)) / 2; });
    return new THREE.BufferAttribute(out, 3);
  };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', expandir(pos));
  g.morphAttributes.position = morfs.map(expandir);
  g.morphTargetsRelative = geo.morphTargetsRelative;
  g.setIndex(novoIdx);
  return g;
}

/** Cor por vértice inversa à densidade local: regiões muito apertadas (pálpebras, lábios) não estouram em branco. */
function corPorDensidade(geo, cor) {
  const p = geo.attributes.position, n = p.count, v = new THREE.Vector3();
  const caixa = new THREE.Box3().setFromBufferAttribute(p), tam = caixa.getSize(new THREE.Vector3()), cel = Math.max(tam.x, tam.y, tam.z) / 60;
  const grade = new Map(), k = (x, y, z) => `${Math.floor(x / cel)},${Math.floor(y / cel)},${Math.floor(z / cel)}`;
  for (let i = 0; i < n; i++) { v.fromBufferAttribute(p, i); const c = k(v.x, v.y, v.z); grade.set(c, (grade.get(c) || 0) + 1); }
  const conta = []; for (let i = 0; i < n; i++) { v.fromBufferAttribute(p, i); conta.push(grade.get(k(v.x, v.y, v.z))); }
  const ord = [...conta].sort((a, b) => a - b), mediana = ord[ord.length >> 1] || 1;
  const cores = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const f = Math.min(1, Math.pow(mediana / conta[i], 0.9)); cores[i * 3] = cor.r * f; cores[i * 3 + 1] = cor.g * f; cores[i * 3 + 2] = cor.b * f; }
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
}

/**
 * Material holográfico com volume: luz de frente-cima (sombra natural nas laterais, sob o nariz e o queixo)
 * e brilho azul profundo na borda (silhueta). Segue as expressões (morph targets) da cabeça.
 */
function matHolo({ pontos = false, cor, borda, opacidade, tamanho = 2, mapa = null, cores = false }) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uCor: { value: cor.clone() }, uBorda: { value: borda.clone() }, uOpac: { value: opacidade }, uTam: { value: tamanho }, uMapa: { value: mapa }, uPonto: { value: pontos } },
    vertexColors: cores, wireframe: !pontos, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      #include <common>
      #include <morphtarget_pars_vertex>
      uniform float uTam;
      varying float vLuz; varying float vBorda; varying vec3 vCor;
      void main() {
        #include <beginnormal_vertex>
        #include <morphnormal_vertex>
        #include <begin_vertex>
        #include <morphtarget_vertex>
        vec3 n = normalize(normalMatrix * objectNormal);
        vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
        float nd = dot(n, normalize(-mv.xyz));
        vLuz = 0.08 + 0.92 * clamp(dot(n, normalize(vec3(-0.3, 0.5, 0.82))), 0.0, 1.0);
        vBorda = pow(1.0 - abs(nd), 2.4);
        vCor = vec3(1.0);
        #ifdef USE_COLOR
          vCor = color;
        #endif
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uTam;
      }`,
    fragmentShader: `
      uniform vec3 uCor; uniform vec3 uBorda; uniform float uOpac; uniform sampler2D uMapa; uniform bool uPonto;
      varying float vLuz; varying float vBorda; varying vec3 vCor;
      void main() {
        float a = 1.0;
        if (uPonto) { a = texture2D(uMapa, gl_PointCoord).a; if (a < 0.02) discard; }
        vec3 c = uCor * vCor * vLuz + uBorda * vBorda * 1.15;
        gl_FragColor = vec4(c, a * uOpac * (0.25 + 0.75 * vLuz + vBorda));
      }`,
  });
  Object.defineProperty(m, 'opacity', { get: () => m.uniforms.uOpac.value, set: (v) => { if (m.uniforms) m.uniforms.uOpac.value = v; }, configurable: true });
  return m;
}

function texturaIris() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(10,3,0,1)'); gr.addColorStop(0.2, 'rgba(25,8,0,1)');            // pupila
  gr.addColorStop(0.26, 'rgba(255,214,140,1)'); gr.addColorStop(0.45, 'rgba(255,150,40,1)'); // anel incandescente
  gr.addColorStop(0.7, 'rgba(200,80,10,0.9)'); gr.addColorStop(0.86, 'rgba(120,40,5,0.55)'); gr.addColorStop(1, 'rgba(60,20,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 64, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,190,90,0.35)'; g.lineWidth = 1.2;   // fibras da íris
  for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; g.beginPath(); g.moveTo(64 + Math.cos(a) * 16, 64 + Math.sin(a) * 16); g.lineTo(64 + Math.cos(a + 0.08) * 46, 64 + Math.sin(a + 0.08) * 46); g.stroke(); }
  g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(255,245,220,0.9)'; g.beginPath(); g.arc(54, 52, 5, 0, Math.PI * 2); g.fill();   // reflexo
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function texturaPonto() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/**
 * Cria o rosto 3D no canvas. `opcoes.forte` liga o brilho (bloom) e mais partículas.
 * Devolve { quadro(P, T, dt), medir(W, H, dpr), liberar() } ou lança erro (sem WebGL / sem modelo).
 */
export async function criar(canvas, { forte = true, modelo = '/modelos/manuel.glb', debug = null } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !forte, powerPreference: 'high-performance', premultipliedAlpha: false });
  renderer.setClearColor(0x000000, 0);
  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 1000);
  const ponto = texturaPonto();

  const gltf = await new GLTFLoader().loadAsync(modelo);
  const raiz = gltf.scene;
  let cabeca = null; const olhos = [];
  raiz.traverse((o) => {
    if (o.isMesh && o.morphTargetDictionary) cabeca = o;
    if (/^eye(Left|Right)$/.test(o.name)) olhos.push(o);
    if (o.name === 'teeth') o.visible = false;
  });
  if (!cabeca) throw new Error('Modelo do rosto sem expressões.');

  // centraliza e normaliza a altura da cabeça para 2 unidades
  const caixa = new THREE.Box3().setFromObject(raiz), tam = caixa.getSize(new THREE.Vector3()), centro = caixa.getCenter(new THREE.Vector3());
  const esc = 2 / tam.y;
  const grupoCabeca = new THREE.Group(); const pivo = new THREE.Group();
  raiz.position.sub(centro); pivo.add(raiz); pivo.scale.setScalar(esc); grupoCabeca.add(pivo); cena.add(grupoCabeca);

  // 1. oclusor escuro: esconde os fios de trás da cabeça (dá volume)
  cabeca.material = new THREE.MeshBasicMaterial({ color: 0x020c14, transparent: true, opacity: 0.94, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
  cabeca.renderOrder = 0;
  // 2. malha de fios
  const OP_FIOS = forte ? 0.32 : 0.4, OP_NOS = forte ? 0.6 : 0.9;
  if (!cabeca.geometry.attributes.normal) cabeca.geometry.computeVertexNormals();
  const AZUL_BORDA = new THREE.Color('#1f6bff');
  const fios = new THREE.Mesh(cabeca.geometry, matHolo({ cor: CIANO, borda: AZUL_BORDA, opacidade: OP_FIOS }));
  fios.morphTargetInfluences = cabeca.morphTargetInfluences; fios.morphTargetDictionary = cabeca.morphTargetDictionary; fios.renderOrder = 2;
  cabeca.parent.add(fios); fios.position.copy(cabeca.position); fios.quaternion.copy(cabeca.quaternion); fios.scale.copy(cabeca.scale);
  // 3. nós luminosos nos vértices
  const geoNos = forte ? subdividir(cabeca.geometry) : cabeca.geometry;   // ~4× mais nós no aparelho forte
  corPorDensidade(geoNos, CIANO_CLARO); if (!geoNos.attributes.normal) geoNos.computeVertexNormals();
  const nos = new THREE.Points(geoNos, matHolo({ pontos: true, cores: true, cor: new THREE.Color(1, 1, 1), borda: AZUL_BORDA, opacidade: OP_NOS, mapa: ponto, tamanho: (forte ? 2 : 2.6) }));
  nos.morphTargetInfluences = cabeca.morphTargetInfluences; nos.morphTargetDictionary = cabeca.morphTargetDictionary; nos.renderOrder = 3;
  cabeca.parent.add(nos); nos.position.copy(cabeca.position); nos.quaternion.copy(cabeca.quaternion); nos.scale.copy(cabeca.scale);
  // olhos âmbar: íris escura com brilho âmbar no centro real de cada olho
  const brilhosOlho = [];
  raiz.updateMatrixWorld(true); pivo.updateMatrixWorld(true);
  for (const o of olhos) {
    o.traverse((m) => { if (m.isMesh) { m.material = new THREE.MeshBasicMaterial({ color: new THREE.Color('#c25a08'), transparent: true, opacity: 0.95 }); m.renderOrder = 1; } });
    const bx = new THREE.Box3().setFromObject(o), c = bx.getCenter(new THREE.Vector3()), r = bx.getSize(new THREE.Vector3()).x / 2;
    const frente = grupoCabeca.worldToLocal(new THREE.Vector3(c.x, c.y, bx.max.z));
    const iris = texturaIris();
    for (const [tam, cor, op, mapa, normal] of [[r * 3, new THREE.Color('#ff7a10'), 0.38, ponto, false], [r * 1.25, new THREE.Color('#ffffff'), 1, iris, true]]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mapa, color: cor, transparent: true, opacity: op, blending: normal ? THREE.NormalBlending : THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
      sp.scale.setScalar(tam); sp.position.copy(frente); sp.position.z += r * 0.2; sp.renderOrder = 6; sp.userData.op = op; sp.userData.base = frente.clone();
      grupoCabeca.add(sp); brilhosOlho.push(sp);
    }
  }
  // busto (pescoço e ombros) em malha de plexo: superfície em grade com nós, fios e diagonais; some para baixo
  const busto = (() => {
    const NU = forte ? 64 : 40, NV = forte ? 30 : 20, pts = [], cores = [], fios = [];
    // superfície: v = 0 sob o queixo → 1 no peito; u = volta ao redor (só a frente e os lados)
    const sup = (u, v) => {
      const a = (u - 0.5) * Math.PI * 1.2;                         // frente e lados
      const k = Math.max(0, (v - 0.3) / 0.7);                      // 0 no pescoço → 1 no peito
      const larg = 0.29 + v * 0.1 + Math.pow(k, 0.75) * 1.4;      // pescoço fino, ombros largos
      const prof = 0.24 + k * 0.3;
      const y = -0.62 - v * 1.4 - k * Math.pow(Math.abs(Math.sin(a)), 1.4) * 0.45;
      return [Math.sin(a) * larg, y, Math.cos(a) * prof - 0.22];
    };
    const idx = (i2, j2) => j2 * (NU + 1) + i2;
    for (let j2 = 0; j2 <= NV; j2++) for (let i2 = 0; i2 <= NU; i2++) {
      const jit = () => (Math.random() - 0.5) * 0.012;
      const [x, y, z] = sup(i2 / NU, j2 / NV); pts.push(x + jit(), y + jit(), z + jit());
      const vv = j2 / NV, f = 0.4 * Math.min(1, vv / 0.15 + 0.2) * Math.pow(1 - vv, 1.5) * (1 - Math.pow(Math.abs(i2 / NU - 0.5) * 2, 3) * 0.7);
      cores.push(CIANO.r * f, CIANO.g * f, CIANO.b * f);
    }
    for (let j2 = 0; j2 <= NV; j2++) for (let i2 = 0; i2 <= NU; i2++) {
      if (i2 < NU) fios.push(idx(i2, j2), idx(i2 + 1, j2));
      if (j2 < NV) fios.push(idx(i2, j2), idx(i2, j2 + 1));
      if (i2 < NU && j2 < NV) fios.push((i2 + j2) % 2 ? idx(i2, j2) : idx(i2 + 1, j2), (i2 + j2) % 2 ? idx(i2 + 1, j2 + 1) : idx(i2, j2 + 1));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3)); g.setIndex(fios);
    const grupo = new THREE.Group();
    const linhas = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }));
    const nosB = new THREE.Points(g, new THREE.PointsMaterial({ vertexColors: true, size: forte ? 2.4 : 2.2, sizeAttenuation: false, map: ponto, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    grupo.add(linhas, nosB); grupo.material = { set opacity(v) { linhas.material.opacity = 0.32 * v / 0.75; nosB.material.opacity = 0.85 * v / 0.75; } };
    return grupo;
  })();
  cena.add(busto);

  // anéis: dois dourados e um ciano, feitos de pontos com faíscas
  const aneis = [];
  const criarAnel = (raio, ry, cor, n, inclX, inclZ, vel, tam, brilho = 1) => {
    const pos = new Float32Array(n * 3), cores = new Float32Array(n * 3), fase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, j = 1 + (Math.random() - 0.5) * 0.025;
      pos[i * 3] = Math.cos(a) * raio * j; pos[i * 3 + 1] = (Math.random() - 0.5) * 0.012; pos[i * 3 + 2] = Math.sin(a) * raio * ry * j;
      fase[i] = Math.random() * Math.PI * 2;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(cores, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: tam, sizeAttenuation: false, map: ponto, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const grupo = new THREE.Group(); grupo.add(pts); grupo.rotation.set(inclX, 0, inclZ); cena.add(grupo);
    const curva = []; for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; curva.push(new THREE.Vector3(Math.cos(a) * raio, 0, Math.sin(a) * raio * ry)); }
    const linha = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curva), new THREE.LineBasicMaterial({ color: cor, transparent: true, opacity: cor === CIANO ? 0.3 : 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    grupo.add(linha); grupo.userData.linha = linha;
    aneis.push({ grupo, pts, cores, fase, cor, vel, n, brilho, raio });
  };
  criarAnel(1.32, 1, OURO, forte ? 1300 : 700, 1.12, 0.38, 0.18, forte ? 2.8 : 2.4);
  criarAnel(1.25, 1, OURO, forte ? 900 : 500, 0.3, -0.22, -0.13, forte ? 2.6 : 2.2, 0.8);   // quase de lado: menos brilho por ponto
  criarAnel(1.6, 1, CIANO, forte ? 320 : 220, 1.05, -0.2, 0.08, forte ? 1.8 : 1.6);

  // poeira de dados flutuando
  const nPo = forte ? 900 : 400, posPo = new Float32Array(nPo * 3), velPo = new Float32Array(nPo);
  for (let i = 0; i < nPo; i++) { posPo[i * 3] = (Math.random() - 0.5) * 5; posPo[i * 3 + 1] = (Math.random() - 0.5) * 4.6; posPo[i * 3 + 2] = (Math.random() - 0.5) * 2.5 - 0.5; velPo[i] = 0.03 + Math.random() * 0.08; }
  const gPo = new THREE.BufferGeometry(); gPo.setAttribute('position', new THREE.BufferAttribute(posPo, 3));
  const poeira = new THREE.Points(gPo, new THREE.PointsMaterial({ color: CIANO_CLARO, size: forte ? 2.4 : 2.2, sizeAttenuation: false, map: ponto, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  cena.add(poeira);

  // ── efeitos de energia (mais intensos no aparelho forte) ──
  const pool = (n, tam, cor, op = 1) => {
    const pos = new Float32Array(n * 3), cores = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(cores, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: tam, sizeAttenuation: false, map: ponto, vertexColors: true, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.frustumCulled = false; return { pts, pos, cores, g, n, vida: new Float32Array(n), dur: new Float32Array(n), vel: new Float32Array(n * 3), cor };
  };
  // brasas subindo dos olhos
  const brasas = pool(forte ? 60 : 30, forte ? 2.4 : 2.2, AMBAR);
  const olhosPos = brilhosOlho.filter((_, i) => i % 2 === 0).map(b => b.userData.base);
  grupoCabeca.add(brasas.pts);
  // faíscas soltando do rosto (desintegração), mais pela lateral e por cima
  const faiscas = pool(forte ? 700 : 260, forte ? 2.2 : 2, CIANO_CLARO);
  grupoCabeca.add(faiscas.pts);
  const verts = cabeca.geometry.attributes.position, mw = new THREE.Matrix4();
  cabeca.updateMatrixWorld(true); mw.copy(grupoCabeca.matrixWorld).invert().multiply(cabeca.matrixWorld);
  const amostra = []; const v3 = new THREE.Vector3();
  for (let i = 0; i < verts.count; i += 2) { v3.fromBufferAttribute(verts, i).applyMatrix4(mw); if (v3.z > -0.4 && (Math.abs(v3.x) > 0.45 || v3.y > 0.55)) amostra.push(v3.clone()); }
  // rastros rápidos de luz (linhas curtas)
  const nTr = forte ? 40 : 0, trPos = new Float32Array(nTr * 6), trCor = new Float32Array(nTr * 6), trVel = new Float32Array(nTr * 3), trVida = new Float32Array(nTr), trDur = new Float32Array(nTr);
  const gTr = new THREE.BufferGeometry(); gTr.setAttribute('position', new THREE.BufferAttribute(trPos, 3)); gTr.setAttribute('color', new THREE.BufferAttribute(trCor, 3));
  const rastros = new THREE.LineSegments(gTr, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  rastros.frustumCulled = false; if (nTr) grupoCabeca.add(rastros);
  // cometas dourados percorrendo os anéis, com cauda
  const cometas = [];
  for (const a of aneis) if (a.cor !== CIANO) for (let c = 0; c < (forte ? 3 : 1); c++) {
    const n = forte ? 28 : 14, pc = pool(n, forte ? 3.6 : 3, OURO);
    a.grupo.add(pc.pts); cometas.push({ a, pc, ang: Math.random() * Math.PI * 2, vel: (0.5 + Math.random() * 0.5) * Math.sign(a.vel || 1), raio: a.raio });
  }
  // bokeh: discos grandes e desfocados ao fundo
  const bokeh = [];
  for (let i = 0; i < (forte ? 9 : 5); i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ponto, color: i % 3 === 0 ? OURO : CIANO, transparent: true, opacity: 0.05 + Math.random() * 0.06, blending: THREE.AdditiveBlending, depthWrite: false }));
    const t = 0.25 + Math.random() * 0.6; sp.scale.setScalar(t); sp.position.set((Math.random() - 0.5) * 4.5, (Math.random() - 0.5) * 4, -2.5 - Math.random() * 1.5);
    sp.userData = { vx: (Math.random() - 0.5) * 0.03, vy: (Math.random() - 0.5) * 0.02, op: sp.material.opacity }; sp.renderOrder = -2; cena.add(sp); bokeh.push(sp);
  }
  // brilho volumétrico atrás da cabeça
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: ponto, color: new THREE.Color('#0d4f66'), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.set(4.2, 4.6, 1); halo.position.set(0, -0.1, -1.2); halo.renderOrder = -1; cena.add(halo);

  if (debug) {   // diagnóstico: esconde partes da cena
    const esc_ = { aneis: () => aneis.forEach(a => (a.grupo.visible = false)), busto: () => (busto.visible = false), poeira: () => (poeira.visible = false),
      fios: () => (fios.visible = false), nos: () => (nos.visible = false), oclusor: () => (cabeca.visible = false), olhos: () => brilhosOlho.forEach(b => (b.visible = false)) };
    for (const k of debug) esc_[k]?.();
    const nomes = []; cena.traverse(o => nomes.push(o.type + ':' + (o.name || '-') + (o.visible ? '' : '(oculto)'))); window.CENA3D = nomes;
  }
  // pós-processamento: brilho (só nos aparelhos fortes)
  let composer = null, bloom = null;
  if (forte) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(cena, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.3, 0.72);
    composer.addPass(bloom); composer.addPass(new OutputPass());
  }

  const D = cabeca.morphTargetDictionary, I = cabeca.morphTargetInfluences;
  const m = (nome, v) => { const k = D[nome]; if (k != null) I[k] += (cl(v) - I[k]) * 0.6; };

  let W = 1, H = 1;
  const api = {
    medir(w, h, dpr) {
      nos.material.uniforms.uTam.value = (forte ? 2 : 2.6) * dpr;
      W = w; H = h; renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // enquadramento: cabeça no terço de cima, ombros entrando por baixo; no celular em pé, um pouco mais perto
      const retrato = h > w;
      camera.fov = retrato ? 34 : 26; camera.position.set(0, retrato ? -0.3 : -0.3, retrato ? 6.9 : 6.2); camera.lookAt(0, retrato ? -0.48 : -0.42, 0);
      camera.updateProjectionMatrix();
      composer?.setSize(w, h); composer?.setPixelRatio(dpr); bloom?.setSize(w * dpr, h * dpr);
    },
    /** P: pose de rosto.js; info: { T, dt, k (entrada 0–1), som, falando, ouvindo } */
    quadro(P, info) {
      const { T, dt, k, som = 0, falando = false, ouvindo = false } = info;
      // ── expressões ──
      const ab = P.aberto, red = P.redondo;
      m('jawOpen', ab * 0.72);
      m('mouthFunnel', red * ab * 1.1);
      m('mouthPucker', red * (1 - ab) * 0.9 + red * 0.25);
      m('mouthClose', ab < 0.06 && falando ? 0.25 : 0);
      const est = Math.max(0, P.largo - 0.55) * 1.3 * (1 - red);
      m('mouthStretch_L', est * 0.5); m('mouthStretch_R', est * 0.5);
      m('mouthLowerDown_L', ab * 0.35); m('mouthLowerDown_R', ab * 0.35);
      m('mouthUpperUp_L', ab * 0.15); m('mouthUpperUp_R', ab * 0.15);
      const sorri = Math.max(0, P.sorriso), fecha = Math.max(0, -P.sorriso);
      m('mouthSmile_L', sorri * 0.65); m('mouthSmile_R', sorri * 0.65);
      m('cheekSquint_L', sorri * 0.4); m('cheekSquint_R', sorri * 0.4);
      m('mouthFrown_L', fecha * 0.9); m('mouthFrown_R', fecha * 0.9);
      m('browInnerUp', Math.max(0, P.sobr) * 0.9 + P.sobrL * 0.4);
      m('browOuterUp_L', Math.max(0, P.sobr) * 0.5); m('browOuterUp_R', Math.max(0, P.sobr) * 0.5);
      m('browDown_L', P.franze * 0.9 + Math.max(0, -P.sobr) * 0.7); m('browDown_R', P.franze * 0.9 + Math.max(0, -P.sobr) * 0.7);
      m('eyeBlink_L', 1 - P.olhoL); m('eyeBlink_R', 1 - P.olhoR);
      m('eyeWide_L', (P.abertura - 1) * 3); m('eyeWide_R', (P.abertura - 1) * 3);
      m('eyeSquint_L', (1 - P.abertura) * 2.5 + sorri * 0.3); m('eyeSquint_R', (1 - P.abertura) * 2.5 + sorri * 0.3);
      const ox = P.olharX, oy = P.olharY;
      m('eyeLookOut_L', -ox * 0.8); m('eyeLookIn_L', ox * 0.8); m('eyeLookIn_R', -ox * 0.8); m('eyeLookOut_R', ox * 0.8);
      m('eyeLookUp_L', -oy * 0.7); m('eyeLookUp_R', -oy * 0.7); m('eyeLookDown_L', oy * 0.7); m('eyeLookDown_R', oy * 0.7);
      for (const o of olhos) { o.rotation.y = ox * 0.32; o.rotation.x = oy * 0.22; }
      for (const b of brilhosOlho) { b.material.opacity = b.userData.op * cl(Math.min(P.olhoL, P.olhoR) * 1.15 - 0.1) * k; b.position.x = b.userData.base.x + ox * 0.035; b.position.y = b.userData.base.y - oy * 0.02; }

      // ── cabeça e busto ──
      grupoCabeca.rotation.y = P.cabX * 0.1 + ox * 0.1; grupoCabeca.rotation.x = P.cabY * 0.045 - 0.04; grupoCabeca.rotation.z = P.incl * 0.8;
      grupoCabeca.position.y = Math.sin(T * 0.8) * 0.012;
      busto.rotation.y = grupoCabeca.rotation.y * 0.35;
      const fade = k * k * (3 - 2 * k);
      fios.material.opacity = OP_FIOS * fade * (1 + (falando ? som * 0.5 : 0)); nos.material.opacity = OP_NOS * fade;
      cabeca.material.opacity = 0.94 * fade; busto.material.opacity = 0.75 * fade;
      grupoCabeca.scale.setScalar(0.92 + 0.08 * fade);

      // ── anéis com faíscas: brilham mais quando ele fala; esverdeiam quando ouve ──
      const tom = ouvindo ? new THREE.Color('#34f5a4') : null;
      for (const a of aneis) {
        a.grupo.rotation.y += a.vel * dt * (falando ? 1.6 : 1);
        const base = (a.cor === CIANO ? 0.16 : 0.95) * (forte ? 1 : 1.6), extra = falando ? som * 0.8 : 0;
        for (let i = 0; i < a.n; i++) {
          const f = a.fase[i], fa = Math.sin(T * 2.4 + f * 3) * 0.5 + 0.5, faisca = Math.pow(Math.sin(T * 1.3 + f * 7) * 0.5 + 0.5, 18) * 1.6;
          const v = (base * (0.55 + fa * 0.45) + faisca + extra * fa) * fade * a.brilho;
          const c = tom && a.cor !== CIANO ? tom : a.cor;
          a.cores[i * 3] = c.r * v; a.cores[i * 3 + 1] = c.g * v; a.cores[i * 3 + 2] = c.b * v;
        }
        a.pts.geometry.attributes.color.needsUpdate = true;
      }
      // ── brasas dos olhos ──
      const vivo = (pl, i, nascer) => { pl.vida[i] -= dt; if (pl.vida[i] <= 0) nascer(i); return 1 - pl.vida[i] / pl.dur[i]; };
      if (olhosPos.length) for (let i = 0; i < brasas.n; i++) {
        const t = vivo(brasas, i, (j) => { const o = olhosPos[j % olhosPos.length]; brasas.pos[j * 3] = o.x + (Math.random() - 0.5) * 0.06; brasas.pos[j * 3 + 1] = o.y + (Math.random() - 0.5) * 0.03; brasas.pos[j * 3 + 2] = o.z + 0.02;
          brasas.vel[j * 3] = (Math.random() - 0.5) * 0.12; brasas.vel[j * 3 + 1] = 0.08 + Math.random() * 0.2; brasas.vel[j * 3 + 2] = Math.random() * 0.05; brasas.dur[j] = brasas.vida[j] = 0.6 + Math.random() * 1.1; });
        brasas.pos[i * 3] += brasas.vel[i * 3] * dt; brasas.pos[i * 3 + 1] += brasas.vel[i * 3 + 1] * dt; brasas.pos[i * 3 + 2] += brasas.vel[i * 3 + 2] * dt;
        const v = Math.sin(Math.PI * Math.min(1, t)) * fade * Math.min(P.olhoL, P.olhoR) * (falando ? 1 + som : 1);
        brasas.cores[i * 3] = AMBAR.r * v; brasas.cores[i * 3 + 1] = AMBAR.g * v * (1 - t * 0.5); brasas.cores[i * 3 + 2] = AMBAR.b * v * (1 - t);
      }
      brasas.g.attributes.position.needsUpdate = brasas.g.attributes.color.needsUpdate = true;
      // ── faíscas se soltando do rosto ──
      if (amostra.length) for (let i = 0; i < faiscas.n; i++) {
        const t = vivo(faiscas, i, (j) => { const o = amostra[(Math.random() * amostra.length) | 0]; faiscas.pos[j * 3] = o.x; faiscas.pos[j * 3 + 1] = o.y; faiscas.pos[j * 3 + 2] = o.z;
          const sx = Math.sign(o.x) || 1; faiscas.vel[j * 3] = sx * (0.06 + Math.random() * 0.25); faiscas.vel[j * 3 + 1] = (Math.random() - 0.3) * 0.18; faiscas.vel[j * 3 + 2] = (Math.random() - 0.5) * 0.12;
          faiscas.dur[j] = faiscas.vida[j] = 1.4 + Math.random() * 2.6; });
        faiscas.pos[i * 3] += faiscas.vel[i * 3] * dt; faiscas.pos[i * 3 + 1] += faiscas.vel[i * 3 + 1] * dt; faiscas.pos[i * 3 + 2] += faiscas.vel[i * 3 + 2] * dt;
        const v = Math.pow(1 - Math.min(1, t), 1.6) * 0.85 * fade * (falando ? 1 + som * 0.8 : 1), ouro = Math.random() < 0.004 ? 1 : 0;
        const c = ouro ? OURO : CIANO_CLARO; faiscas.cores[i * 3] = c.r * v; faiscas.cores[i * 3 + 1] = c.g * v; faiscas.cores[i * 3 + 2] = c.b * v;
      }
      faiscas.g.attributes.position.needsUpdate = faiscas.g.attributes.color.needsUpdate = true;
      // ── rastros rápidos de luz ──
      for (let i = 0; i < nTr; i++) {
        trVida[i] -= dt;
        if (trVida[i] <= 0) { const o = amostra[(Math.random() * amostra.length) | 0] || v3; const sx = Math.sign(o.x) || 1;
          trPos[i * 6] = o.x; trPos[i * 6 + 1] = o.y; trPos[i * 6 + 2] = o.z; trVel[i * 3] = sx * (0.8 + Math.random() * 1.6); trVel[i * 3 + 1] = (Math.random() - 0.4) * 0.6; trVel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
          trDur[i] = trVida[i] = 0.35 + Math.random() * 0.9; }
        const k2 = trVida[i] / trDur[i];
        trPos[i * 6] += trVel[i * 3] * dt; trPos[i * 6 + 1] += trVel[i * 3 + 1] * dt; trPos[i * 6 + 2] += trVel[i * 3 + 2] * dt;
        trPos[i * 6 + 3] = trPos[i * 6] - trVel[i * 3] * 0.09; trPos[i * 6 + 4] = trPos[i * 6 + 1] - trVel[i * 3 + 1] * 0.09; trPos[i * 6 + 5] = trPos[i * 6 + 2] - trVel[i * 3 + 2] * 0.09;
        const v = k2 * 0.9 * fade, c = i % 5 === 0 ? OURO : CIANO_CLARO;
        trCor[i * 6] = c.r * v; trCor[i * 6 + 1] = c.g * v; trCor[i * 6 + 2] = c.b * v; trCor[i * 6 + 3] = 0; trCor[i * 6 + 4] = 0; trCor[i * 6 + 5] = 0;
      }
      if (nTr) gTr.attributes.position.needsUpdate = gTr.attributes.color.needsUpdate = true;
      // ── cometas dourados nos anéis ──
      for (const cm of cometas) {
        cm.ang += cm.vel * dt * (falando ? 1.5 : 1);
        const { pc } = cm;
        for (let i = 0; i < pc.n; i++) {
          const a2 = cm.ang - i * 0.022 * Math.sign(cm.vel), r = cm.raio * (1 + Math.sin(i * 1.7 + T * 6) * 0.004);
          pc.pos[i * 3] = Math.cos(a2) * r; pc.pos[i * 3 + 1] = (Math.random() - 0.5) * 0.01 * i / pc.n; pc.pos[i * 3 + 2] = Math.sin(a2) * r;
          const v = Math.pow(1 - i / pc.n, 2.2) * 1.6 * fade * (i === 0 ? 1.6 : 1);
          pc.cores[i * 3] = OURO.r * v; pc.cores[i * 3 + 1] = OURO.g * v; pc.cores[i * 3 + 2] = OURO.b * v * 0.8;
        }
        pc.g.attributes.position.needsUpdate = pc.g.attributes.color.needsUpdate = true;
      }
      for (const a of aneis) { const l = a.grupo.userData.linha; if (l) l.material.opacity = (a.cor === CIANO ? 0.3 : 0.9) * fade * (falando ? 1 + som * 0.4 : 1); }
      for (const b of bokeh) { b.position.x += b.userData.vx * dt; b.position.y += b.userData.vy * dt; if (Math.abs(b.position.x) > 2.6) b.userData.vx *= -1; if (Math.abs(b.position.y) > 2.2) b.userData.vy *= -1; b.material.opacity = b.userData.op * fade; }
      halo.material.opacity = (0.45 + (falando ? som * 0.35 : 0) + (ouvindo ? 0.1 : 0)) * fade;
      // ── poeira subindo devagar ──
      const pp = gPo.attributes.position.array;
      for (let i = 0; i < nPo; i++) { pp[i * 3 + 1] += velPo[i] * dt; if (pp[i * 3 + 1] > 2.3) pp[i * 3 + 1] = -2.3; pp[i * 3] += Math.sin(T * 0.3 + i) * 0.0008; }
      gPo.attributes.position.needsUpdate = true;
      poeira.material.opacity = 0.6 * fade;
      if (bloom) bloom.strength = 0.42 + (falando ? som * 0.25 : 0);
      if (composer) composer.render(); else renderer.render(cena, camera);
    },
    liberar() {
      renderer.dispose(); composer?.dispose?.();
      cena.traverse((o) => { o.geometry?.dispose?.(); const mt = o.material; (Array.isArray(mt) ? mt : mt ? [mt] : []).forEach(x => { x.map?.dispose?.(); x.dispose?.(); }); });
    },
  };
  return api;
}
