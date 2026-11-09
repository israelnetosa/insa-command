import { ligarToro } from './toro.js';
// Núcleo Ophanim do cockpit: rodas dentro de rodas, cheias de olhos (nós de dados que observam a carteira).
// O centro é o toro de fios (toro.js); as chamadas nos cantos e o patrimônio ficam fixos por cima.
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (n, d = 2) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: d, maximumFractionDigits: d });
const nf = (n, d = 2) => (n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n, d = 1) => `${nf(n, d)}%`;

// ───────── núcleo Ophanim: rodas dentro de rodas, cheias de olhos (nós de dados) ─────────
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
  // chamadas fixas (não giram): linha em cotovelo do anel até o canto, como num HUD
  const [g, m, c] = A;
  const lider = (de, quina, fim, cor) => `<polyline points="${P(de.x)},${P(de.y)} ${quina[0]},${quina[1]} ${fim[0]},${fim[1]}" fill="none" stroke="${cor}" stroke-width="1" stroke-opacity=".85"/>
    <circle cx="${P(de.x)}" cy="${P(de.y)}" r="2.6" fill="${cor}"/><circle cx="${quina[0]}" cy="${quina[1]}" r="1.6" fill="${cor}"/>`;
  const olhoIcone = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>`;
  return `<div class="oph" id="oph" role="img" aria-label="Núcleo (toro de fios, cada fio é parte do patrimônio de um ativo): patrimônio ${brl(t.patrimonio)}; ${A.map(a => `${a.desc} ${a.valor}`).join('; ')}">
    <svg class="oph-fixo" viewBox="0 0 400 400" aria-hidden="true">
      ${lider({ x: 84, y: 106 }, [54, 54], [6, 54], c.cor)}
      ${lider({ x: 316, y: 106 }, [346, 54], [394, 54], c.cor)}
      ${lider({ x: 112, y: 286 }, [62, 338], [6, 338], g.cor)}
      ${lider({ x: 296, y: 290 }, [340, 340], [394, 340], m.cor)}
    </svg>
    <canvas class="oph-toro" id="oph-toro" aria-hidden="true"></canvas><div class="oph-mira" id="oph-mira"></div>
    <button type="button" class="oph-pausa" id="oph-pausa" aria-pressed="false">❚❚</button>
    <div class="oph-nucleo"><div><div class="oph-lbl">Patrimônio</div><div class="oph-val">${brl(t.patrimonio)}</div>
      <div class="oph-sub">${brl(t.investido, 0)} em ativos<br>${brl(t.caixa)} em caixa</div></div></div>
    <div class="oph-tx tl" style="--cor:${c.cor}"><i></i>${esc(c.desc)}</div>
    <button class="oph-num tr" data-anel="2" style="--cor:${c.cor}" aria-label="${esc(c.desc)}: ${esc(c.valor)}">${esc(c.valor)}<span>${olhoIcone}</span></button>
    <div class="oph-tx bl"><div style="--cor:${g.cor}"><i></i>Pelotões em zona de ataque · <b>${esc(g.valor)}</b></div>
      <div style="--cor:${m.cor}"><i></i>${esc(m.desc)}${s.missao.maior_posicao ? `, contra o teto de ${s.missao.maior_posicao.teto}%` : ''}</div></div>
    <button class="oph-num br" data-anel="1" style="--cor:${m.cor}" aria-label="${esc(m.desc)}: ${esc(m.valor)}">${esc(m.valor)}<span>${olhoIcone}</span></button>
    <div class="oph-painel" id="ophp" hidden></div></div>
    <div class="oph-rotulo" id="oph-rot" aria-live="off"></div>`;
}

// Giro por animação CSS (roda no compositor, sem JavaScript por quadro): leve até em celular simples.
export function ligarOphanim(s) {
  const raiz = document.getElementById('oph'); if (!raiz) return;
  const A = dadosOphanim(s), painel = document.getElementById('ophp');
  ligarToro(document.getElementById('oph-toro'), s, { mira: document.getElementById('oph-mira'), rotulo: document.getElementById('oph-rot'), botao: document.getElementById('oph-pausa') });
  let ativo = null;
  const abrir = (i) => {
    const a = A[i], o = a.olhos[0] ?? { titulo: a.desc, linhas: [] };
    if (ativo === i) return fechar();
    ativo = i;
    painel.style.setProperty('--cor', a.cor);
    painel.className = 'oph-painel doca';
    painel.innerHTML = `<div class="oph-cab">${esc(a.desc)}</div><b>${esc(o.titulo)}</b><div>${o.linhas.map(esc).join(' · ')}</div>
      <div class="oph-barra"><em><i style="width:${Math.min(100, a.prog)}%"></i></em><span>${esc(a.valor)}</span></div>`;
    painel.hidden = false;
  };
  const fechar = () => { ativo = null; painel.hidden = true; };
  raiz.addEventListener('click', fechar);
  raiz.querySelectorAll('.oph-num').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); abrir(+b.dataset.anel); }));
}
