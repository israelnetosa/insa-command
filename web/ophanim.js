// Núcleo Ophanim do cockpit: rodas dentro de rodas, cheias de olhos (nós de dados que observam a carteira).
// Sem dependências: SVG + CSS, cada anel numa camada girada pela GPU.
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (n, d = 2) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: d, maximumFractionDigits: d });
const nf = (n, d = 2) => (n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n, d = 1) => `${nf(n, d)}%`;

// ───────── núcleo Ophanim: rodas dentro de rodas, cheias de olhos (nós de dados) ─────────
const OPH_R = [100, 128, 160], OPH_W = [9, 8, 11];
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
  const P = (x) => x.toFixed(1);
  // trilho + arco neon (cor + núcleo claro, efeito tubo)
  const arco = (r, w, v, cor) => {
    const c = 2 * Math.PI * r, d = `${(c * v).toFixed(1)} ${c.toFixed(1)}`;
    return `<circle cx="200" cy="200" r="${r}" fill="none" stroke="${cor}" stroke-opacity=".1" stroke-width="${w}"/>
      <circle cx="200" cy="200" r="${r}" fill="none" stroke="${cor}" stroke-width="${w}" stroke-dasharray="${d}" transform="rotate(-90 200 200)"/>
      <circle cx="200" cy="200" r="${r}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="${Math.max(1, w / 5)}" stroke-dasharray="${d}" transform="rotate(-90 200 200)"/>`;
  };
  const camada = (a, i) => {
    const r = OPH_R[i], w = OPH_W[i], v = Math.max(0, Math.min(100, a.prog)) / 100, c = 2 * Math.PI * r;
    const cab = ophPolar(r, v * 360);
    const mk = a.marca != null ? [ophPolar(r - w - 3, a.marca * 3.6), ophPolar(r + w + 3, a.marca * 3.6)] : null;
    const extra = i === 2
      ? `<circle cx="200" cy="200" r="${r - 13}" fill="none" stroke="${a.cor}" stroke-opacity=".55" stroke-width="1.2"/>
         <circle cx="200" cy="200" r="${r + 15}" fill="none" stroke="${a.cor}" stroke-opacity=".4" stroke-width="3" stroke-dasharray="1 6"/>`
      : i === 1
      ? `<circle cx="200" cy="200" r="${r + 10}" fill="none" stroke="${a.cor}" stroke-opacity=".7" stroke-width="1.4"/>
         <circle cx="200" cy="200" r="${r - 9}" fill="none" stroke="${a.cor}" stroke-opacity=".35" stroke-width="1" stroke-dasharray="6 5"/>`
      : `<circle cx="200" cy="200" r="${r - 11}" fill="none" stroke="${a.cor}" stroke-opacity=".4" stroke-width="1" stroke-dasharray="3 4"/>`;
    // âmbar: arco tracejado grosso (segmentos), como no painel de referência
    const prog = i === 1
      ? `<circle cx="200" cy="200" r="${r}" fill="none" stroke="${a.cor}" stroke-opacity=".12" stroke-width="${w}"/>
         <circle cx="200" cy="200" r="${r}" fill="none" stroke="${a.cor}" stroke-width="${w}" stroke-dasharray="${Array.from({ length: 40 }, (_, k) => (k + 1) / 40 <= v + 1e-9 ? `${(c / 40 - 5).toFixed(2)} 5` : `0 ${(c / 40).toFixed(2)}`).join(' ')}" transform="rotate(-90 200 200)"/>`
      : arco(r, w, v, a.cor);
    return `<div class="oph-anel" data-i="${i}" style="--cor:${a.cor}">
      <svg class="oph-arcos" viewBox="0 0 400 400" aria-hidden="true">${extra}${prog}
        <circle cx="${P(cab.x)}" cy="${P(cab.y)}" r="${w / 2 + 1}" fill="#fff"/>
        ${mk ? `<line x1="${P(mk[0].x)}" y1="${P(mk[0].y)}" x2="${P(mk[1].x)}" y2="${P(mk[1].y)}" stroke="#ff4d5e" stroke-width="2.5"/>` : ''}
      </svg>
      <svg class="oph-olhos" viewBox="0 0 400 400">${a.olhos.map((o, j) => { const p = ophPolar(r, o.ang), rr = i === 0 ? 6.5 : 9;
        return `<g class="olho${o.apagado ? ' apagado' : ''}" data-i="${i}" data-j="${j}" transform="translate(${P(p.x)} ${P(p.y)})" tabindex="0" role="button" aria-label="${esc(o.titulo + ': ' + o.linhas.join(', '))}">
          <circle r="16" fill="transparent"/><g class="olho-c">
          <circle r="${rr + 5}" fill="${a.cor}" opacity=".16"/>
          <circle r="${rr + 1.8}" fill="none" stroke="${a.cor}" stroke-width="1.6"/>
          <circle r="${rr}" fill="url(#oph-esfera${o.apagado ? 'x' : i})"/>
          <circle r="${(rr * .38).toFixed(1)}" fill="#03121c" opacity=".85"/>
          <circle class="mira" r="${rr + 7}" fill="none" stroke="${a.cor}" stroke-dasharray="2 3"/></g></g>`; }).join('')}</svg></div>`;
  };
  // chamadas fixas (não giram): linha em cotovelo do anel até o canto, como num HUD
  const [g, m, c] = A;
  const ponto = (r, ang) => ophPolar(r, ang);
  const lider = (de, quina, fim, cor) => `<polyline points="${P(de.x)},${P(de.y)} ${quina[0]},${quina[1]} ${fim[0]},${fim[1]}" fill="none" stroke="${cor}" stroke-width="1" stroke-opacity=".85"/>
    <circle cx="${P(de.x)}" cy="${P(de.y)}" r="2.6" fill="${cor}"/><circle cx="${quina[0]}" cy="${quina[1]}" r="1.6" fill="${cor}"/>`;
  const olhoIcone = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>`;
  const esfera = (id, cor) => `<radialGradient id="oph-esfera${id}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".28" stop-color="${cor}"/><stop offset=".75" stop-color="${cor}" stop-opacity=".55"/><stop offset="1" stop-color="#02070c"/></radialGradient>`;
  return `<div class="oph" id="oph" role="img" aria-label="Núcleo: patrimônio ${brl(t.patrimonio)}; ${A.map(a => `${a.desc} ${a.valor}`).join('; ')}">
    <svg class="oph-fixo" viewBox="0 0 400 400" aria-hidden="true"><defs>${esfera(0, '#34f5a4')}${esfera(1, m.cor)}${esfera(2, '#48e5ff')}${esfera('x', '#5b6b78')}</defs>
      ${lider(ponto(160, 315), [54, 54], [6, 54], c.cor)}
      ${lider(ponto(160, 45), [346, 54], [394, 54], c.cor)}
      ${lider(ponto(100, 225), [62, 338], [6, 338], g.cor)}
      ${lider(ponto(128, 135), [340, 340], [394, 340], m.cor)}
    </svg>
    ${A.map(camada).reverse().join('')}
    <div class="oph-nucleo"><div><div class="oph-lbl">Patrimônio</div><div class="oph-val">${brl(t.patrimonio)}</div>
      <div class="oph-sub">${brl(t.investido, 0)} em ativos<br>${brl(t.caixa)} em caixa</div></div></div>
    <div class="oph-tx tl" style="--cor:${c.cor}"><i></i>Externo: ${esc(c.desc.replace(/^Rumo/, 'rumo'))}</div>
    <button class="oph-num tr" data-anel="2" style="--cor:${c.cor}" aria-label="${esc(c.desc)}: ${esc(c.valor)}">${esc(c.valor)}<span>${olhoIcone}</span></button>
    <div class="oph-tx bl"><div style="--cor:${g.cor}"><i></i>Interno: pelotões em zona de ataque · <b>${esc(g.valor)}</b></div>
      <div style="--cor:${m.cor}"><i></i>Médio: ${esc(m.desc.replace(/^Maior/, 'maior'))}${s.missao.maior_posicao ? `, contra o teto de ${s.missao.maior_posicao.teto}%` : ''}</div></div>
    <button class="oph-num br" data-anel="1" style="--cor:${m.cor}" aria-label="${esc(m.desc)}: ${esc(m.valor)}">${esc(m.valor)}<span>${olhoIcone}</span></button>
    <div class="oph-painel" id="ophp" hidden></div></div>`;
}

// Giro por animação CSS (roda no compositor, sem JavaScript por quadro): leve até em celular simples.
export function ligarOphanim(s) {
  const raiz = document.getElementById('oph'); if (!raiz) return;
  const A = dadosOphanim(s), aneis = [...raiz.querySelectorAll('.oph-anel')].sort((a, b) => a.dataset.i - b.dataset.i);
  const painel = document.getElementById('ophp');
  aneis.forEach((el, i) => { el.style.animationDuration = Math.abs(A[i].volta) + 's'; el.style.animationDirection = A[i].volta < 0 ? 'reverse' : 'normal'; });
  let ativo = null;
  const abrir = (i, j, fixo) => {
    const a = A[i], o = a.olhos[j];
    if (fixo && ativo?.fixo && ativo.i === i && ativo.j === j) return fechar(true);
    raiz.querySelectorAll('.olho.on').forEach(e => e.classList.remove('on'));
    raiz.querySelector(`.olho[data-i="${i}"][data-j="${j}"]`)?.classList.add('on');
    aneis.forEach((el, k) => el.classList.toggle('parado', k === i));   // o anel observado para
    ativo = { i, j, fixo };
    painel.style.setProperty('--cor', a.cor);
    painel.className = 'oph-painel doca';
    painel.innerHTML = `<div class="oph-cab">${esc(a.nome)} · ${esc(a.desc)}</div><b>${esc(o.titulo)}</b><div>${o.linhas.map(esc).join(' · ')}</div>
      <div class="oph-barra"><em><i style="width:${Math.min(100, a.prog)}%"></i></em><span>${esc(a.valor)}</span></div>`;
    painel.hidden = false;
  };
  const fechar = (forca) => { if (!ativo || (ativo.fixo && !forca)) return; ativo = null; painel.hidden = true;
    raiz.querySelectorAll('.olho.on').forEach(e => e.classList.remove('on')); aneis.forEach(el => el.classList.remove('parado')); };
  raiz.querySelectorAll('.olho').forEach(g => {
    const i = +g.dataset.i, j = +g.dataset.j;
    g.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && !ativo?.fixo) abrir(i, j, false); });
    g.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') fechar(false); });
    g.addEventListener('click', e => { e.stopPropagation(); abrir(i, j, true); });
    g.addEventListener('focus', () => abrir(i, j, false)); g.addEventListener('blur', () => fechar(false));
    g.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(true); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(i, j, true); } });
  });
  raiz.addEventListener('click', () => fechar(true));
  raiz.querySelectorAll('.oph-num').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); abrir(+b.dataset.anel, 0, true); }));
}
