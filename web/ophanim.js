// Núcleo Ophanim do cockpit: rodas dentro de rodas, cheias de olhos (nós de dados que observam a carteira).
// Sem dependências: SVG + CSS, cada anel numa camada girada pela GPU.
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (n, d = 2) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: d, maximumFractionDigits: d });
const nf = (n, d = 2) => (n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n, d = 1) => `${nf(n, d)}%`;

// ───────── núcleo Ophanim: rodas dentro de rodas, cheias de olhos (nós de dados) ─────────
const OPH_R = [112, 140, 168], OPH_W = [7, 9, 11];
const ophPolar = (r, g) => { const a = (g - 90) * Math.PI / 180; return { x: 200 + r * Math.cos(a), y: 200 + r * Math.sin(a) }; };
export function dadosOphanim(s) {
  const t = s.totais, m = s.missao, P = s.posicoes || [];
  const n = Math.max(1, P.length), mp = m.maior_posicao;
  const zonaTx = { ataque: 'Zona de ataque', neutra: 'Neutra (abaixo do teto)', espera: 'Em espera (acima do teto)', sem_dados: 'Sem dados de teto' };
  const pesos = [...P].sort((a, b) => b.peso - a.peso).slice(0, 4);
  const acima = mp && mp.peso > mp.teto;
  return [
    { nome: 'Interno', desc: 'Pelotões em zona de ataque', prog: m.em_ataque / n * 100, valor: `${m.em_ataque} de ${P.length}`, cor: '#34f5a4', volta: 30, segs: P.length || 1,
      olhos: P.map((p, i) => ({ ang: 360 / n * i + 180 / n, titulo: p.ticker, apagado: p.zona !== 'ataque',
        linhas: [zonaTx[p.zona] || p.zona, `Preço ${brl(p.preco)} · PM ${brl(p.preco_medio)}`, p.teto_bazin ? `Teto Bazin ${brl(p.teto_bazin)}` : '', p.var_dia != null ? `Dia ${p.var_dia > 0 ? '+' : ''}${nf(p.var_dia)}%` : ''].filter(Boolean) })) },
    { nome: 'Médio', desc: mp ? `Maior pelotão, ${mp.ticker}` : 'Maior pelotão', prog: mp?.peso ?? 0, valor: pct(mp?.peso ?? 0), cor: acima ? '#ff4d5e' : '#ffb347', volta: -40,
      marca: mp ? mp.teto : null,
      olhos: pesos.map((p, i) => ({ ang: i === 0 ? p.peso * 3.6 : 120 + i * 75, titulo: p.ticker,
        linhas: [`Peso ${pct(p.peso)} da carteira`, i === 0 && mp ? `Teto de concentração: ${mp.teto}%` : `Valor ${brl(p.valor)}`, `Renda ${brl(p.renda_mes_estimada)}/mês`] })) },
    { nome: 'Externo', desc: `Rumo ao marco de ${brl(m.proximo_marco, 0)}/mês`, prog: m.progresso_marco, valor: pct(m.progresso_marco), cor: '#48e5ff', volta: 55,
      olhos: [
        { ang: Math.min(100, m.progresso_marco) * 3.6, titulo: `Marco ${brl(m.proximo_marco, 0)}/mês`, linhas: [`Progresso ${pct(m.progresso_marco)}`, `Faltam ${brl(m.falta_marco)}/mês`] },
        { ang: 60, titulo: 'Renda estimada', linhas: [`${brl(t.renda_mes_estimada)}/mês`, `DY da carteira ${pct(t.dy_carteira, 2)}`] },
        { ang: 180, titulo: 'Meta final', linhas: [`${brl(m.meta_mensal, 0)}/mês`, `${pct(m.progresso_meta)} percorrido`] },
        { ang: 250, titulo: 'Próximo aporte', linhas: s.plano?.compras?.length ? s.plano.compras.map(c => `${c.qtd} ${c.ticker} × ${brl(c.preco)}`) : [`${brl(s.aporte_mensal ?? 0, 0)} no mais atrasado`] },
        { ang: 320, titulo: 'Magic Number', linhas: [`Ativos: ${s.magic?.ativos?.join(', ') || 'nenhum ainda'}`, `Próximo: ${s.magic?.proximo ?? '—'}`] },
      ] },
  ];
}
export function ophanim(s) {
  const t = s.totais, A = dadosOphanim(s);
  const camada = (a, i) => {
    const r = OPH_R[i], w = OPH_W[i], c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, a.prog)) / 100;
    const segs = a.segs ?? 48, passo = c / segs, folga = a.segs ? 6 : 2.2, acesos = Math.round(segs * v);
    const dashOn = Array.from({ length: segs }, (_, k) => k < acesos ? `${(passo - folga).toFixed(2)} ${folga}` : `0 ${passo.toFixed(2)}`).join(' ');
    const cab = ophPolar(r, v * 360);
    const mk = a.marca != null ? [ophPolar(r - w, a.marca * 3.6), ophPolar(r + w, a.marca * 3.6)] : null;
    return `<div class="oph-anel" data-i="${i}" style="--cor:${a.cor}">
      <svg class="oph-arcos" viewBox="0 0 400 400" aria-hidden="true">
        <circle cx="200" cy="200" r="${r}" fill="none" stroke="${a.cor}" stroke-opacity=".12" stroke-width="${w}"/>
        <circle cx="200" cy="200" r="${r + w / 2 + 4}" fill="none" stroke="${a.cor}" stroke-opacity=".35" stroke-width=".8" stroke-dasharray="1 7"/>
        <circle cx="200" cy="200" r="${r}" fill="none" stroke="${a.cor}" stroke-opacity=".18" stroke-width="${w}" stroke-dasharray="${(passo - folga).toFixed(2)} ${folga}" transform="rotate(-90 200 200)"/>
        <circle cx="200" cy="200" r="${r}" fill="none" stroke="${a.cor}" stroke-width="${w}" stroke-dasharray="${dashOn}" transform="rotate(-90 200 200)"/>
        <circle cx="${cab.x.toFixed(1)}" cy="${cab.y.toFixed(1)}" r="${w / 2 + 1.5}" fill="#fff" stroke="${a.cor}" stroke-width="2"/>
        ${mk ? `<line x1="${mk[0].x.toFixed(1)}" y1="${mk[0].y.toFixed(1)}" x2="${mk[1].x.toFixed(1)}" y2="${mk[1].y.toFixed(1)}" stroke="#ff4d5e" stroke-width="2.5"/>` : ''}
      </svg>
      <svg class="oph-olhos" viewBox="0 0 400 400">${a.olhos.map((o, j) => { const p = ophPolar(r, o.ang);
        return `<g class="olho${o.apagado ? ' apagado' : ''}" data-i="${i}" data-j="${j}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})" tabindex="0" role="button" aria-label="${esc(o.titulo + ': ' + o.linhas.join(', '))}">
          <circle r="16" fill="transparent"/><g class="olho-c" style="animation-delay:-${((i * 7 + j) * 0.37 % 2.6).toFixed(2)}s">
          <circle r="11" fill="${a.cor}" opacity=".14"/><path d="M0 -9 L9 0 L0 9 L-9 0 Z" fill="#020617" stroke="${a.cor}" stroke-width="1.6"/>
          <circle r="4" fill="${o.apagado ? 'transparent' : a.cor}" stroke="${a.cor}"/><circle r="1.6" fill="#020617"/>
          <circle class="mira" r="13" fill="none" stroke="${a.cor}" stroke-dasharray="2 3"/></g></g>`; }).join('')}</svg></div>`;
  };
  return `<div class="oph" id="oph" role="img" aria-label="Núcleo: patrimônio ${brl(t.patrimonio)}; ${A.map(a => `${a.desc} ${a.valor}`).join('; ')}">
    ${A.map(camada).reverse().join('')}
    <div class="oph-nucleo"><div><div class="oph-lbl">Patrimônio</div><div class="oph-val">${brl(t.patrimonio)}</div>
      <div class="oph-sub">${brl(t.investido, 0)} em ativos | ${brl(t.caixa)} em caixa</div></div></div>
    <div class="oph-painel" id="ophp" hidden></div></div>`;
}
let OPH_LOOP = 0;
export function ligarOphanim(s) {
  const raiz = document.getElementById('oph'); if (!raiz) return;
  const A = dadosOphanim(s), aneis = [...raiz.querySelectorAll('.oph-anel')].sort((a, b) => a.dataset.i - b.dataset.i);
  const ang = [0, 0, 0], vel = [1, 1, 1], painel = document.getElementById('ophp');
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ativo = null, ultimo = performance.now();
  const posicionar = () => {
    if (!ativo) return;
    const p = ophPolar(OPH_R[ativo.i], A[ativo.i].olhos[ativo.j].ang + ang[ativo.i]);
    if (raiz.clientWidth < 520) { painel.className = 'oph-painel doca'; painel.style.left = painel.style.top = ''; return; }
    painel.className = 'oph-painel ' + (p.x < 200 ? 'esq' : 'dir');
    painel.style.left = (p.x / 4) + '%'; painel.style.top = (p.y / 4) + '%';
  };
  const abrir = (i, j, fixo) => {
    const a = A[i], o = a.olhos[j];
    if (fixo && ativo?.fixo && ativo.i === i && ativo.j === j) return fechar(true);
    raiz.querySelectorAll('.olho.on').forEach(e => e.classList.remove('on'));
    raiz.querySelector(`.olho[data-i="${i}"][data-j="${j}"]`)?.classList.add('on');
    ativo = { i, j, fixo };
    painel.style.setProperty('--cor', a.cor);
    painel.innerHTML = `<div class="oph-cab">${esc(a.nome)} · ${esc(a.desc)}</div><b>${esc(o.titulo)}</b>${raiz.clientWidth < 520 ? `<div>${o.linhas.map(esc).join(' · ')}</div>` : o.linhas.map(l => `<div>${esc(l)}</div>`).join('')}
      <div class="oph-barra"><em><i style="width:${Math.min(100, a.prog)}%"></i></em><span>${esc(a.valor)}</span></div>`;
    painel.hidden = false; posicionar();
  };
  const fechar = (forca) => { if (!ativo || (ativo.fixo && !forca)) return; ativo = null; painel.hidden = true; raiz.querySelectorAll('.olho.on').forEach(e => e.classList.remove('on')); };
  raiz.querySelectorAll('.olho').forEach(g => {
    const i = +g.dataset.i, j = +g.dataset.j;
    g.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && !ativo?.fixo) abrir(i, j, false); });
    g.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') fechar(false); });
    g.addEventListener('click', e => { e.stopPropagation(); abrir(i, j, true); });
    g.addEventListener('focus', () => abrir(i, j, false)); g.addEventListener('blur', () => fechar(false));
    g.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(true); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(i, j, true); } });
  });
  raiz.addEventListener('click', () => fechar(true));
  const id = ++OPH_LOOP;
  const quadro = (agora) => {
    if (id !== OPH_LOOP || !document.body.contains(raiz)) return;     // saiu do cockpit: o laço morre
    const dt = Math.min(64, agora - ultimo) / 1000; ultimo = agora;
    if (!document.hidden && !document.documentElement.classList.contains('pausado')) {
      A.forEach((a, i) => {
        const alvo = ativo ? (ativo.i === i ? 0 : 0.25) : 1;               // o anel focado para; os outros abrandam
        vel[i] += (alvo - vel[i]) * Math.min(1, dt * 4);
        ang[i] = (ang[i] + 360 / a.volta * vel[i] * dt) % 360;
        aneis[i].style.transform = `rotate(${ang[i].toFixed(2)}deg)`;
      });
      posicionar();
    }
    requestAnimationFrame(quadro);
  };
  if (!quieto) requestAnimationFrame(quadro);
}

