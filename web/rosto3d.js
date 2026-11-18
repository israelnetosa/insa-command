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
  const OP_FIOS = forte ? 0.24 : 0.34, OP_NOS = forte ? 0.6 : 0.9;
  const fios = new THREE.Mesh(cabeca.geometry, new THREE.MeshBasicMaterial({ color: CIANO, wireframe: true, transparent: true, opacity: OP_FIOS, blending: THREE.AdditiveBlending, depthWrite: false }));
  fios.morphTargetInfluences = cabeca.morphTargetInfluences; fios.morphTargetDictionary = cabeca.morphTargetDictionary; fios.renderOrder = 2;
  cabeca.parent.add(fios); fios.position.copy(cabeca.position); fios.quaternion.copy(cabeca.quaternion); fios.scale.copy(cabeca.scale);
  // 3. nós luminosos nos vértices
  const nos = new THREE.Points(cabeca.geometry, new THREE.PointsMaterial({ color: CIANO_CLARO, size: forte ? 2.6 : 2.6, sizeAttenuation: false, map: ponto, transparent: true, opacity: OP_NOS, blending: THREE.AdditiveBlending, depthWrite: false }));
  nos.morphTargetInfluences = cabeca.morphTargetInfluences; nos.morphTargetDictionary = cabeca.morphTargetDictionary; nos.renderOrder = 3;
  cabeca.parent.add(nos); nos.position.copy(cabeca.position); nos.quaternion.copy(cabeca.quaternion); nos.scale.copy(cabeca.scale);
  // olhos âmbar: íris escura com brilho âmbar no centro real de cada olho
  const brilhosOlho = [];
  raiz.updateMatrixWorld(true); pivo.updateMatrixWorld(true);
  for (const o of olhos) {
    o.traverse((m) => { if (m.isMesh) { m.material = new THREE.MeshBasicMaterial({ color: new THREE.Color('#3a1c02'), transparent: true, opacity: 0.95 }); m.renderOrder = 1; } });
    const bx = new THREE.Box3().setFromObject(o), c = bx.getCenter(new THREE.Vector3()), r = bx.getSize(new THREE.Vector3()).x / 2;
    const frente = grupoCabeca.worldToLocal(new THREE.Vector3(c.x, c.y, bx.max.z));
    for (const [tam, cor, op] of [[r * 3.4, AMBAR, 0.75], [r * 1.5, new THREE.Color('#ffd27a'), 1], [r * 0.45, new THREE.Color('#ffffff'), 1]]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ponto, color: cor, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
      sp.scale.setScalar(tam); sp.position.copy(frente); sp.position.z += r * 0.2; sp.renderOrder = 6; sp.userData.op = op; sp.userData.base = frente.clone();
      grupoCabeca.add(sp); brilhosOlho.push(sp);
    }
  }
  // busto (pescoço e ombros) em nuvem de pontos
  const busto = (() => {
    const n = forte ? 4200 : 2200, pos = new Float32Array(n * 3), cor = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const t = Math.random();
      let x, y, z;
      if (t < 0.2) {   // pescoço: sai de baixo do queixo e alarga um pouco
        const a = Math.random() * Math.PI * 2, h = Math.random() ** 0.8, r = 0.3 + h * 0.1;
        x = Math.cos(a) * r; z = Math.sin(a) * r * 0.8 - 0.18; y = -0.78 - h * 0.62;
      } else {          // ombros (trapézio caído) e peito, mais denso na borda de cima
        const lado = Math.random() < 0.5 ? -1 : 1, u = Math.random(), ax = Math.pow(Math.random(), 0.7) * 1.75;
        const topo = -1.32 - 0.42 * Math.pow(ax / 1.75, 1.6) + (ax < 0.4 ? (0.4 - ax) * 0.25 : 0);
        x = lado * ax; y = topo - Math.pow(u, 1.8) * 1.3; z = (Math.random() - 0.5) * 0.5 * (1 - ax / 2.2) - 0.15;
      }
      pos[i * 3] = x + (Math.random() - 0.5) * 0.02; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const v = Math.max(0.05, Math.min(1, 1.15 - (-y - 0.9) * 0.55)) * (0.6 + Math.random() * 0.4) * (1 - Math.min(0.7, Math.abs(x) / 2.6));
      cor[i * 3] = CIANO.r * v; cor[i * 3 + 1] = CIANO.g * v; cor[i * 3 + 2] = CIANO.b * v;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(cor, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ vertexColors: true, size: forte ? 2.2 : 2.2, sizeAttenuation: false, map: ponto, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
    return p;
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
    aneis.push({ grupo, pts, cores, fase, cor, vel, n, brilho });
  };
  criarAnel(1.32, 1, OURO, forte ? 1300 : 700, 1.12, 0.38, 0.18, forte ? 2.8 : 2.4);
  criarAnel(1.22, 1, OURO, forte ? 900 : 500, 0.22, -0.16, -0.13, forte ? 2.6 : 2.2, 0.8);   // quase de lado: menos brilho por ponto
  criarAnel(1.6, 1, CIANO, forte ? 320 : 220, 1.05, -0.2, 0.08, forte ? 1.8 : 1.6);

  // poeira de dados flutuando
  const nPo = forte ? 900 : 400, posPo = new Float32Array(nPo * 3), velPo = new Float32Array(nPo);
  for (let i = 0; i < nPo; i++) { posPo[i * 3] = (Math.random() - 0.5) * 5; posPo[i * 3 + 1] = (Math.random() - 0.5) * 4.6; posPo[i * 3 + 2] = (Math.random() - 0.5) * 2.5 - 0.5; velPo[i] = 0.03 + Math.random() * 0.08; }
  const gPo = new THREE.BufferGeometry(); gPo.setAttribute('position', new THREE.BufferAttribute(posPo, 3));
  const poeira = new THREE.Points(gPo, new THREE.PointsMaterial({ color: CIANO_CLARO, size: forte ? 2.4 : 2.2, sizeAttenuation: false, map: ponto, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
  cena.add(poeira);

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
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.35, 0.62);
    composer.addPass(bloom); composer.addPass(new OutputPass());
  }

  const D = cabeca.morphTargetDictionary, I = cabeca.morphTargetInfluences;
  const m = (nome, v) => { const k = D[nome]; if (k != null) I[k] += (cl(v) - I[k]) * 0.6; };

  let W = 1, H = 1;
  const api = {
    medir(w, h, dpr) {
      W = w; H = h; renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // enquadramento: cabeça no terço de cima, ombros entrando por baixo; no celular em pé, um pouco mais perto
      const retrato = h > w;
      camera.fov = retrato ? 34 : 26; camera.position.set(0, retrato ? -0.3 : -0.3, retrato ? 6.5 : 6.2); camera.lookAt(0, retrato ? -0.42 : -0.4, 0);
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
      // ── poeira subindo devagar ──
      const pp = gPo.attributes.position.array;
      for (let i = 0; i < nPo; i++) { pp[i * 3 + 1] += velPo[i] * dt; if (pp[i * 3 + 1] > 2.3) pp[i * 3 + 1] = -2.3; pp[i * 3] += Math.sin(T * 0.3 + i) * 0.0008; }
      gPo.attributes.position.needsUpdate = true;
      poeira.material.opacity = 0.6 * fade;
      if (bloom) bloom.strength = 0.55 + (falando ? som * 0.3 : 0);
      if (composer) composer.render(); else renderer.render(cena, camera);
    },
    liberar() {
      renderer.dispose(); composer?.dispose?.();
      cena.traverse((o) => { o.geometry?.dispose?.(); const mt = o.material; (Array.isArray(mt) ? mt : mt ? [mt] : []).forEach(x => { x.map?.dispose?.(); x.dispose?.(); }); });
    },
  };
  return api;
}
