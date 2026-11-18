// INSA Command · interface (PWA). Sem frameworks, sem rastreadores.
import { ophanim, ligarOphanim } from './ophanim.js';
import { paraFala, VOZES_MASCULINAS } from '../src/fala.ts';
import { ouvir, podeOuvir, interpretar, lerProposta, tirarChamada, garantirMicrofone, abrirAjustesApp } from './voz.js';
import { abrirRosto, rostoAberto, avatarConsole } from './rosto.js';
import { ligarEscuta } from './escuta.js';

const $app = document.getElementById('app');
const CACHE_KEY = 'insa_state_v1';
let S = null;              // estado atual vindo do servidor
let offline = false;
let SAUDOU = false;          // cumprimento diário: tentado uma vez por abertura
const DESK = window.insaDesktop || null;   // presente só no app de Windows em modo local
const SHELL = window.insaShell || null;    // presente no app de Windows em modo nuvem (só atualizações)
let UPD = null;                            // último estado de atualização

// ───────── utilidades ─────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (n, d = 2) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: d, maximumFractionDigits: d });
const nf = (n, d = 2) => (n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n, d = 1) => `${nf(n, d)}%`;
const sign = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const cacheGet = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; } };
const cacheSet = (v) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch {} };
const pref = (k, padrao = true) => { try { const v = localStorage.getItem('insa.pref.' + k); return v == null ? padrao : v === '1'; } catch { return padrao; } };
const setPref = (k, v) => { try { localStorage.setItem('insa.pref.' + k, v ? '1' : '0'); } catch {} };
const cacheClear = () => { try { localStorage.removeItem(CACHE_KEY); } catch {} };

async function api(path, opts = {}) {
  const r = await fetch(path, {
    credentials: 'same-origin', ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !path.startsWith('/api/auth')) { cacheClear(); route('gate'); throw new Error('Sessão expirada.'); }
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
  return j;
}

function toast(msg, ms = 3200) {
  const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), ms);
}

const EMBLEM = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="eg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#48e5ff"/><stop offset="1" stop-color="#ffb347"/></linearGradient></defs>
<path d="M32 3 57 17v30L32 61 7 47V17z" fill="#0e1e27" stroke="url(#eg)" stroke-width="2.5"/>
<path d="M16 33c5-8 11-12 16-12s11 4 16 12c-5 8-11 12-16 12s-11-4-16-12z" fill="none" stroke="#48e5ff" stroke-width="2"/>
<circle cx="32" cy="33" r="6" fill="#ffb347"/><circle cx="32" cy="33" r="2.4" fill="#071016"/></svg>`;

// ───────── portão (login / configuração) ─────────
async function gate() {
  let sess;
  try { sess = await api('/api/session'); } catch { sess = { autenticado: false, configurado: true }; }
  if (sess.autenticado) return route(location.hash.slice(2) || 'cockpit');
  if (sess.desktop) return pinGate(sess);
  const novo = !sess.configurado;
  const rotuloPadrao = /android/i.test(navigator.userAgent) ? 'Celular Android' : /windows/i.test(navigator.userAgent) ? 'PC Windows' : 'Aparelho';
  $app.innerHTML = `<div class="gate"><div class="card"><div class="mira">${EMBLEM.replace('<svg', '<svg class="emb"')}</div>
    <div class="eyebrow" style="justify-content:center">INSA / Centro de comando</div>
    <h1 style="margin-bottom:6px">${novo ? 'Primeira conexão' : 'Conectar este aparelho'}</h1>
    <p class="muted">${novo ? 'Digite o código de configuração da sua nuvem (o INSA_SETUP_TOKEN que você criou no GitHub).' : 'Num aparelho já conectado, abra Ajustes → Aparelhos → Gerar código, e digite os 8 dígitos aqui.'}</p>
    <form id="parf">
      ${novo ? '<label>Código de configuração<input name="cod" type="password" autocomplete="off" required></label>'
        : '<label>Código de pareamento<input name="cod" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{8,10}" maxlength="10" required placeholder="00000000"></label>'}
      <label style="margin-top:10px">Nome deste aparelho<input name="rotulo" value="${esc(rotuloPadrao)}" maxlength="60"></label>
      <div class="actions"><button class="btn" style="width:100%">${novo ? 'Configurar e entrar' : 'Conectar'}</button></div></form>
    <p class="faint" id="msg" role="alert" style="margin-top:14px"></p></div></div>`;
  const f = document.getElementById('parf'); f.cod.focus();
  f.onsubmit = async (e) => {
    e.preventDefault(); const b = f.querySelector('button'); const msg = document.getElementById('msg'); msg.textContent = ''; b.disabled = true;
    try {
      await api(novo ? '/api/auth/dispositivo/configurar' : '/api/auth/dispositivo/parear', { method: 'POST', body: novo ? { setupToken: f.cod.value, rotulo: f.rotulo.value } : { codigo: f.cod.value, rotulo: f.rotulo.value } });
      S = null; await boot(); route('cockpit');
    } catch (err) { msg.textContent = err.message; f.cod.value = ''; f.cod.focus(); b.disabled = false; }
  };
}

// Portão do app de Windows: PIN local
function pinGate(sess) {
  const novo = !sess.configurado;
  $app.innerHTML = `<div class="gate"><div class="card"><div class="mira">${EMBLEM.replace('<svg', '<svg class="emb"')}</div>
    <div class="eyebrow" style="justify-content:center;--sem-linha:1">INSA / Centro de comando</div>
    <h1 style="margin-bottom:6px">${novo ? 'Bem-vindo, Senhor.' : 'Identifique-se, Senhor.'}</h1>
    <p class="muted">${novo ? 'Crie um PIN de 6 a 12 dígitos. Ele protege o app neste computador e não pode ser recuperado.' : 'Digite o seu PIN.'}</p>
    <form id="pinf"><label>PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{6,12}" minlength="6" maxlength="12" autocomplete="off" required autofocus></label>
      ${novo ? '<label style="margin-top:10px">Repita o PIN<input name="pin2" type="password" inputmode="numeric" minlength="6" maxlength="12" autocomplete="off" required></label>' : ''}
      <div class="actions"><button class="btn" style="width:100%">${novo ? 'Criar PIN e entrar' : 'Desbloquear'}</button></div></form>
    <p class="faint" id="msg" role="alert" style="margin-top:14px"></p></div></div>`;
  const f = document.getElementById('pinf'); f.pin.focus();
  f.onsubmit = async (e) => {
    e.preventDefault(); const b = f.querySelector('button'); const msg = document.getElementById('msg'); msg.textContent = '';
    if (novo && f.pin.value !== f.pin2.value) { msg.textContent = 'Os PINs não coincidem.'; return; }
    b.disabled = true;
    try { await api(novo ? '/api/auth/pin/setup' : '/api/auth/pin/unlock', { method: 'POST', body: { pin: f.pin.value } }); S = null; await boot(); route('cockpit'); }
    catch (err) { msg.textContent = err.message; f.pin.value = ''; f.pin.focus(); b.disabled = false; }
  };
}

// Sequência de inicialização: o único momento orquestrado do app (some com "reduzir movimento")
async function boot() {
  const carga = load().catch(() => {});
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { await carga; return; }
  const el = document.createElement('div'); el.className = 'boot'; el.innerHTML = '<pre aria-live="polite"></pre>'; document.body.appendChild(el);
  const pre = el.firstChild, linhas = ['Identidade do dono confirmada', 'Livro-razão carregado e conferido', 'Canal de mercado B3 conectado', 'M.A.N.U.E.L. em prontidão'];
  pre.textContent = '> INSA COMMAND · inicializando sistemas\n';
  for (const l of linhas) { await new Promise(r => setTimeout(r, 260)); pre.insertAdjacentHTML('beforeend', `> ${esc(l)} … <span class="ok">OK</span>\n`); }
  await carga; await new Promise(r => setTimeout(r, 280));
  el.classList.add('sai'); setTimeout(() => el.remove(), 500);
}

function updBanner() {
  if (!UPD || UPD.estado !== 'pronta' || !(DESK || SHELL)) return '';
  return `<div class="banner" style="display:flex;gap:12px;align-items:center;justify-content:space-between;color:var(--cyan);border-color:var(--line2);background:var(--panel)">
    <span>Nova versão ${esc(UPD.versao)} pronta para instalar.</span><button class="btn" id="updnow" style="min-height:34px;padding:4px 14px">Reiniciar e atualizar</button></div>`;
}

// ───────── moldura ─────────
const PRINCIPAIS = ['cockpit', 'manuel', 'radar', 'posicoes'];
const NAV = [
  ['cockpit', '01', 'Cockpit', '◎'], ['manuel', '02', 'M.A.N.U.E.L.', '◈'], ['radar', '03', 'Radar', '◉'], ['posicoes', '04', 'Pelotões', '▤'],
  ['registrar', '05', 'Registrar', '＋'], ['estrategia', '06', 'Estratégia', '◆'], ['plano', '07', 'Fases e regras', '◇'], ['razao', '08', 'Livro-razão', '≣'], ['ajustes', '09', 'Ajustes', '⚙'],
];
function frame(view, inner) {
  const feed = feedStatus();
  $app.innerHTML = `
  <div class="hudtop" id="hudtop"><header class="top"><a class="brand" href="#/cockpit" aria-label="INSA Command, início">${EMBLEM}<span><b>INSA</b><small>Command</small></span></a>
    <span class="sys"><i class="dot on"></i>Sistemas online</span>
    <span class="feed" id="pgst" title="${esc(feed.title)}"><i class="dot ${feed.cls}"></i><span>${esc(feed.label)}</span></span>
    <button type="button" class="escuta-ind" id="escuta-ind" ${ESCUTA ? '' : 'hidden'} data-estado="${ESCUTA?.estado || 'pausada'}"><i></i><span>escuta</span></button>
    <div class="clock"><b id="clk">--:--:--</b><small id="clkd"></small></div></header>${fita()}</div>
  <div class="shell">
    <nav class="side" aria-label="Seções">${NAV.map(([id, n, t, i]) => `<a href="#/${id}" class="${view === id ? 'on' : ''}" ${view === id ? 'aria-current="page"' : ''}><span>${n}</span><i aria-hidden="true">${i}</i><b>${t}</b></a>`).join('')}</nav>
    <main id="conteudo">${updBanner()}${offline ? `<div class="banner">Sem conexão. Mostrando os dados de ${esc(new Date(S?.gerado_em).toLocaleString('pt-BR'))}.</div>` : ''}${inner}
      <p class="footer">Conteúdo informativo, não é recomendação de investimento. Confirme preços e datas-com antes de enviar ordens. Nenhuma ordem é enviada à corretora por este app.</p></main>
  </div>
  <nav class="tabs" aria-label="Seções">${NAV.filter(n => PRINCIPAIS.includes(n[0])).map(([id, , t, i]) => `<a href="#/${id}" class="${view === id ? 'on' : ''}" ${view === id ? 'aria-current="page"' : ''}><i aria-hidden="true">${i}</i>${id === 'manuel' ? 'Manuel' : t}</a>`).join('')}
    <button type="button" class="${PRINCIPAIS.includes(view) ? '' : 'on'}" id="mais" aria-haspopup="dialog" aria-expanded="false"><i aria-hidden="true">☰</i>Mais</button></nav>
  <div class="folha" id="folha" hidden><div class="folha-fundo" data-fecha></div><div class="folha-painel" role="dialog" aria-label="Mais seções">
    <div class="folha-alca" aria-hidden="true"></div>
    ${NAV.filter(n => !PRINCIPAIS.includes(n[0])).map(([id, , t, i]) => `<a href="#/${id}" class="${view === id ? 'on' : ''}"><i aria-hidden="true">${i}</i>${t}</a>`).join('')}
  </div></div>`;
  const folha = document.getElementById('folha'), mais = document.getElementById('mais');
  const abreFolha = (abrir) => { folha.hidden = !abrir; mais.setAttribute('aria-expanded', String(abrir)); };
  if (ESCUTA) indicadorEscuta(ESCUTA.estado);
  document.getElementById('escuta-ind')?.addEventListener('click', () => { setPref('escuta', false); desligarEscuta(); toast('Escuta "Hey Manuel" desligada. Religue em Ajustes → M.A.N.U.E.L.'); });
  mais.onclick = () => abreFolha(folha.hidden);
  folha.addEventListener('click', (e) => { if (e.target.closest('[data-fecha], a')) abreFolha(false); });
  tick();
  const ht = document.getElementById('hudtop'); if (ht) document.documentElement.style.setProperty('--topo', ht.offsetHeight + 'px');
  document.getElementById('updnow')?.addEventListener('click', () => (DESK || SHELL).installUpdate());
}
// Faixa de cotações: posições + referências do radar (quando já carregadas). Lista duplicada para o laço contínuo.
function fita() {
  const itens = [...(LIVE?.indices || []).filter(r => r.preco != null).map(r => ({ t: r.nome, v: fmtIdx(r), d: r.var })),
    ...(S?.posicoes || []).map(p => ({ t: p.ticker, v: brl(p.preco), d: p.var_dia }))];
  if (!itens.length) return '';
  const html = itens.map(i => `<span><b>${esc(i.t)}</b>${esc(i.v)} <em class="${sign(i.d)}" style="font-style:normal">${i.d == null ? '' : (i.d > 0 ? '▲ +' : i.d < 0 ? '▼ ' : '') + pct(i.d, 2)}</em></span>`).join('');
  return `<div class="tape" aria-label="Cotações"><div class="tape-trilho">${html}${html.replace(/<span>/g, '<span aria-hidden="true">')}</div></div>`;
}
// Pregão da B3 (10h–17h de Brasília, dias úteis; feriados não considerados): estado e próximo evento
function pregaoAgora(d = new Date()) {
  const brt = new Date(d.getTime() - 3 * 3600_000), dia = brt.getUTCDay(), min = brt.getUTCHours() * 60 + brt.getUTCMinutes();
  const util = dia >= 1 && dia <= 5, aberto = util && min >= 600 && min < 1020;
  const alvo = new Date(brt);
  if (aberto) alvo.setUTCHours(17, 0, 0, 0);
  else if (util && min < 600) alvo.setUTCHours(10, 0, 0, 0);
  else { do { alvo.setUTCDate(alvo.getUTCDate() + 1); } while ([0, 6].includes(alvo.getUTCDay())); alvo.setUTCHours(10, 0, 0, 0); }
  return { aberto, evento: aberto ? 'fechamento' : 'abertura', falta: alvo.getTime() + 3 * 3600_000 - d.getTime() };
}
function feedStatus() {
  const pg = pregaoAgora();
  const ps = S?.posicoes || [], comCot = ps.filter(p => p.cotacao_ok);
  const atraso = comCot.length ? Math.min(...comCot.map(p => p.atraso_s ?? 1e9)) : null;
  const title = atraso == null ? 'Nenhuma cotação ainda' : `Cotação mais recente há ${Math.round(atraso / 60)} min (B3 gratuita: até ~15 min de atraso)`;
  if (!pg.aberto) return { cls: 'late', label: 'pregão fechado', title };
  return { cls: atraso != null && atraso < 25 * 60 ? 'on' : 'late', label: 'pregão aberto', title: (atraso != null && atraso >= 25 * 60 ? 'Cotações atrasadas. ' : '') + title };
}
const relogio = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); return [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map(n => String(n).padStart(2, '0')).join(':'); };
function tick() {
  const el = document.getElementById('clk'); if (!el) return;
  const d = new Date(), pg = pregaoAgora(d);
  el.textContent = relogio(pg.falta);
  el.title = `Tempo até a ${pg.evento} do pregão`;
  document.getElementById('clkd').textContent = `até a ${pg.evento} · B3 ${d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })} · Lisboa ${d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
  const st = document.getElementById('pgst');
  if (st && st.dataset.aberto !== String(pg.aberto)) { const f = feedStatus(); st.dataset.aberto = String(pg.aberto); st.lastElementChild.textContent = f.label; st.firstElementChild.className = 'dot ' + f.cls; }
}
setInterval(tick, 1000);

function ring(pctVal, color, label, sub) {
  const r = 40, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pctVal));
  return `<div class="card gauge"><svg viewBox="0 0 96 96" role="img" aria-label="${esc(label)}: ${nf(pctVal, 1)}%">
    <circle cx="48" cy="48" r="${r}" fill="none" stroke="rgba(72,229,255,.12)" stroke-width="9"/>
    <circle cx="48" cy="48" r="${r}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c * v / 100} ${c}" transform="rotate(-90 48 48)"/></svg>
    <div><b>${label}</b><span>${sub}</span></div></div>`;
}

// ───────── cockpit ─────────
function leituraPonte(s) {
  const ps = s.posicoes;
  const ataque = ps.filter(p => p.zona === 'ataque').length;
  const quedas = ps.filter(p => p.var_dia != null).sort((a, b) => a.var_dia - b.var_dia);
  const q = quedas[0];
  const partes = [`Senhor, ${ataque} de ${ps.length} pelotões estão na zona de ataque.`];
  if (q && q.var_dia < 0) partes.push(`A maior queda medida é ${q.ticker}, em ${nf(q.var_dia)}% contra o fechamento anterior.`);
  if (s.plano.compras.length) partes.push(`Com o caixa de ${brl(s.totais.caixa)}, o plano recruta ${s.plano.compras.map(c => `${c.qtd} ${c.ticker}`).join(' e ')}.`);
  else if (s.totais.caixa > 0) partes.push(`Caixa de ${brl(s.totais.caixa)} aguardando o próximo aporte.`);
  return partes.join(' ');
}

function calendarChart(cal) {
  const max = Math.max(1, ...cal.map(m => Math.max(m.estimado, m.recebido)));
  const W = 720, H = 180, pad = 24, bw = (W - pad * 2) / 12;
  const mesAtual = new Date().getMonth();
  const bars = cal.map((m, i) => {
    const x = pad + i * bw, he = (m.estimado / max) * (H - 50), hr = (m.recebido / max) * (H - 50);
    return `<g><title>${m.mes}: estimado ${brl(m.estimado)} · recebido ${brl(m.recebido)}</title>
      <rect x="${x + 6}" y="${H - 28 - he}" width="${bw - 12}" height="${he}" rx="4" fill="none" stroke="rgba(72,229,255,.35)" stroke-dasharray="3 3"/>
      <rect x="${x + 10}" y="${H - 28 - hr}" width="${bw - 20}" height="${hr}" rx="3" fill="#5cffb0"/>
      <text x="${x + bw / 2}" y="${H - 10}" text-anchor="middle" font-size="11" fill="${i === mesAtual ? '#48e5ff' : '#5a8494'}">${m.mes}</text></g>`;
  }).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Proventos por mês: estimado e recebido">${bars}</svg></div>
    <div class="legend"><span><i style="border:1px dashed rgba(72,229,255,.35)"></i>estimado</span><span><i style="background:#5cffb0"></i>recebido (razão)</span></div>`;
}

function cockpit() {
  const s = S, t = s.totais, m = s.missao;
  if (s.vazio) {
    frame('cockpit', `<div class="eyebrow">INSA / Centro de comando</div><h1>Posições ainda não registradas.</h1>
      <div class="card empty" id="vazio"><p>Procurando o arquivo de migração do INSA Wallet na pasta Downloads…</p></div>`);
    (DESK?.procurarMigracao?.() ?? Promise.resolve(null)).then(r => {
      const el = document.getElementById('vazio'); if (!el) return;
      if (r?.conteudo?.posicoes?.length && !sessionStorageGet('mig_ignorada')) { MIG = r.conteudo; MIG._arquivo = r.nome; route('migracao'); return; }
      el.innerHTML = `<p>Nenhum lançamento ainda. Importe o arquivo <b>insa-migracao-….json</b> com as suas cotas, ou registre o primeiro aporte.</p>
        <div class="actions" style="justify-content:center"><label class="btn" style="cursor:pointer">Escolher arquivo<input type="file" id="migfile0" accept=".json,application/json" class="sr"></label><a class="btn ghost" href="#/registrar">Registrar</a></div>`;
      document.getElementById('migfile0').addEventListener('change', async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        try { const j = JSON.parse(await f.text()); if (!Array.isArray(j.posicoes)) throw new Error('arquivo sem posições'); MIG = j; route('migracao'); }
        catch (err) { toast('Arquivo inválido: ' + err.message); }
      });
    });
    return;
  }
  frame('cockpit', `
    <div class="eyebrow">INSA / Centro de comando</div>
    <h1>A missão em perspectiva, Senhor.</h1>
    <div class="nucleo">
      <div class="card reator"><h2>Anéis do núcleo</h2>${ophanim(s)}</div>
      <div class="leituras">
        <div class="card kpi leitura"><div class="label">Resultado do dia</div><div class="val num ${sign(t.resultado_dia)}">${t.resultado_dia > 0 ? '+' : ''}${brl(t.resultado_dia)}</div>
          <div class="faint"><a href="#/radar">Abrir radar ao vivo</a></div></div>
        <div class="card kpi leitura"><div class="label">Não realizado</div><div class="val num ${sign(t.resultado)}">${brl(t.resultado)}</div>
          <div class="faint">contra o preço médio${t.realizado ? ` · realizado ${brl(t.realizado)}` : ''}</div></div>
        <div class="card kpi leitura"><div class="label">Renda mensal</div><div class="val num pos">${brl(t.renda_mes_estimada)}</div>
          <div class="faint">estimada · DY ${pct(t.dy_carteira, 2)} · recebido em 12 meses ${brl(t.renda_12m_recebida)}</div></div>
        <div class="card kpi leitura"><div class="label">Próximo marco</div><div class="val num">${brl(m.falta_marco)}<small>/mês</small></div>
          <div class="bar"><i style="width:${Math.min(100, m.progresso_marco)}%"></i></div>
          <div class="faint">faltam para ${brl(m.proximo_marco, 0)}/mês · meta ${brl(m.meta_mensal, 0)}</div></div>
      </div>
    </div>
    <section class="grid g2">
      <div class="card ponte"><div class="eyebrow">M.A.N.U.E.L. / Leitura da ponte</div><p>${esc(leituraPonte(s))}</p>
        <p class="faint">Calculada no aparelho a partir da carteira e das cotações. Sem IA, instantânea. <a href="#/manuel">Abrir console M.A.N.U.E.L.</a></p></div>
      <div class="card"><div class="eyebrow">Próximo passo / Plano de compras · ${esc(m.fase?.nome ?? '')}</div>
        ${s.plano.compras.length ? `<table style="margin-top:8px"><tbody>${s.plano.compras.map(c => `<tr><td><span class="tk">${esc(c.ticker)}</span></td><td>${c.qtd} × ${brl(c.preco)}</td><td>${brl(c.valor)}</td></tr>`).join('')}
          <tr><td class="faint">sobra</td><td></td><td class="faint">${brl(s.plano.sobra)}</td></tr></tbody></table>
          <p class="faint">Ativo mais atrasado contra o peso-alvo, só com caixa. Nunca vende.</p>
          <div class="actions"><a class="btn ghost" href="#/registrar?tipo=compra&ticker=${encodeURIComponent(s.plano.compras[0].ticker)}&qtd=${s.plano.compras[0].qtd}&preco=${s.plano.compras[0].preco}">Registrar compra executada</a></div>`
          : `<p class="muted">Caixa insuficiente para uma cota do ativo mais atrasado.</p>`}
      </div>
    </section>
    ${s.alertas.length ? `<section><h2>Condições</h2>${s.alertas.map(a => `<div class="alert ${a.nivel}"><span>${a.nivel === 'critico' ? '▲' : a.nivel === 'atencao' ? '●' : 'ℹ'}</span><span>${esc(a.texto)}</span></div>`).join('')}</section>` : ''}
    <section class="card"><h2>Fluxo de proventos · ${new Date().getFullYear()}</h2>${calendarChart(s.calendario)}</section>`);
  ligarOphanim(s);
}

// ───────── posições ─────────
// Sensor Magic Number: 20 segmentos acendem conforme as cotas se aproximam do Magic Number
function sensorMagic(m, compacto) {
  if (!m) return `<span class="faint">sem provento</span>`;
  const acesos = Math.round(m.progresso / 5);
  const segs = Array.from({ length: 20 }, (_, i) => `<i class="${i < acesos ? (m.ativo ? 'on ok' : 'on') : ''}"></i>`).join('');
  return `<div class="magic ${m.ativo ? 'ativo' : ''}" title="Magic Number ${m.magic}: com ${m.magic} cotas o provento de um mês compra 1 cota nova">
    <div class="magic-segs" role="img" aria-label="${pct(m.progresso, 0)} do Magic Number">${segs}</div>
    <div class="magic-txt">${m.ativo ? '<b class="pos">Auto-reprodução ativa</b>' : `<b>${pct(m.progresso, 0)}</b> de ${nf(m.magic, 0)}`}${compacto ? '' : m.ativo ? '' : ` · faltam ${nf(m.faltam, 0)} (${brl(m.custo_faltante, 0)})`}</div></div>`;
}

function posicoes() {
  const ps = S.posicoes;
  const row = (p) => `<tr>
    <td><span class="tk">${esc(p.ticker)}</span><span class="nm">${esc(p.nome)}</span></td>
    <td class="num">${nf(p.qtd, 0)}</td>
    <td class="num">${brl(p.preco_medio)} ${p.pm_estimado ? '<span class="tag est" title="Preço médio estimado na importação">est.</span>' : ''}</td>
    <td class="num">${brl(p.preco)}<span class="nm">${p.atraso_s != null ? Math.round(p.atraso_s / 60) + ' min · ' : ''}${esc(p.fonte)}</span></td>
    <td class="num ${sign(p.var_dia)}">${p.var_dia == null ? '—' : pct(p.var_dia, 2)}</td>
    <td class="num">${brl(p.valor)}</td><td class="num">${pct(p.peso)}</td>
    <td class="num ${sign(p.resultado)}">${brl(p.resultado)}<span class="nm">${pct(p.resultado_pct)}</span></td>
    <td class="num">${brl(p.renda_mes_estimada)}<span class="nm">YoC ${pct(p.yoc, 2)}</span></td>
    <td>${sensorMagic(p.magic)}</td>
    <td class="num">${p.teto_bazin ? brl(p.teto_bazin) : '—'}</td>
    <td><span class="tag ${p.zona}">${p.zona.replace('_', ' ')}</span></td></tr>`;
  const card = (p) => `<div class="card tight pc">
    <div><span class="tk" style="font:700 17px var(--head)">${esc(p.ticker)}</span> <span class="tag ${p.zona}">${p.zona}</span><span class="nm faint" style="display:block">${esc(p.nome)}</span></div>
    <div class="r"><b class="num">${brl(p.valor)}</b><div class="faint">${pct(p.peso)} da carteira</div></div>
    <div class="faint">${nf(p.qtd, 0)} × ${brl(p.preco)} <span class="${sign(p.var_dia)}">${p.var_dia == null ? '' : pct(p.var_dia, 2)}</span></div>
    <div class="r faint">PM ${brl(p.preco_medio)}${p.pm_estimado ? ' (est.)' : ''}</div>
    <div class="faint">renda ${brl(p.renda_mes_estimada)}/mês</div><div class="r ${sign(p.resultado)}">${brl(p.resultado)}</div>
    <div style="grid-column:1/-1">${sensorMagic(p.magic)}</div></div>`;
  if (!ps.length) return frame('posicoes', `<div class="eyebrow">Batalhões</div><h1>Pelotões em campo</h1>
    <div class="card empty"><p>Nenhuma posição registrada ainda. Importe a migração do INSA Wallet para trazer as suas cotas.</p>
    <div class="actions" style="justify-content:center"><a class="btn" href="#/cockpit">Importar posições</a></div></div>`);
  const bats = Object.values(ps.reduce((acc, p) => { const k = p.setor || 'Outros'; (acc[k] ??= { nome: k, itens: [] }).itens.push(p); return acc; }, {}))
    .map(b => ({ ...b, valor: b.itens.reduce((s, p) => s + p.valor, 0), peso: b.itens.reduce((s, p) => s + p.peso, 0), renda: b.itens.reduce((s, p) => s + p.renda_mes_estimada, 0), resultado: b.itens.reduce((s, p) => s + p.resultado, 0) }))
    .sort((a, b) => b.valor - a.valor);
  frame('posicoes', `<div class="eyebrow">Batalhões</div><h1>Pelotões em campo</h1>
    <p class="muted" style="margin-top:-8px">${bats.length} batalhões · ${ps.length} pelotões · ${nf(ps.reduce((s, p) => s + p.qtd, 0), 0)} cotas · ${brl(S.totais.investido)} em ativos</p>
    <div class="batalhoes">${bats.map(b => `<div class="card batalhao">
      <div class="bat-topo"><h2>${esc(b.nome)}</h2><b class="num">${pct(b.peso)}</b></div>
      <div class="bar"><i style="width:${Math.min(100, b.peso * 2.5)}%"></i></div>
      <div class="bat-num"><span>${brl(b.valor)}</span><span class="pos">${brl(b.renda)}/mês</span><span class="${sign(b.resultado)}">${b.resultado > 0 ? '+' : ''}${brl(b.resultado)}</span></div>
      <div class="bat-itens">${b.itens.map(p => `<span class="tag ${p.zona}" title="${esc(p.nome)}">${esc(p.ticker)} · ${nf(p.qtd, 0)}</span>`).join('')}</div>
    </div>`).join('')}</div>
    ${(() => { const mg = S.magic; if (!mg) return '';
      const ord = ps.filter(p => p.magic).sort((a, b) => b.magic.progresso - a.magic.progresso);
      const prox = ps.find(p => p.ticker === mg.proximo);
      return `<section class="card sensor"><div class="sensor-topo"><h2>Sensor Magic Number</h2>
        <span class="faint">Cotas para o provento de um mês comprar uma cota nova do mesmo ativo</span></div>
        <div class="sensor-kpis">
          <div><span class="faint">Em auto-reprodução</span><b class="${mg.ativos.length ? 'pos' : ''}">${mg.ativos.length} de ${ord.length}</b><span class="faint">${mg.ativos.length ? esc(mg.ativos.join(', ')) : 'nenhum pelotão ainda'}</span></div>
          <div><span class="faint">Mais perto de se reproduzir</span><b>${prox ? esc(prox.ticker) : '—'}</b><span class="faint">${prox ? `faltam ${nf(prox.magic.faltam, 0)} cotas · ${brl(prox.magic.custo_faltante)}` : ''}</span></div>
          <div><span class="faint">Cotas geradas por mês pelos proventos</span><b>${nf(mg.cotas_por_mes, 2)}</b><span class="faint">somando todos os pelotões</span></div>
          <div><span class="faint">Para todos atingirem</span><b>${brl(mg.custo_total, 0)}</b><span class="faint">${mg.sem_provento.length ? 'sem provento: ' + esc(mg.sem_provento.join(', ')) : 'a preços de hoje'}</span></div>
        </div>
        <div class="sensor-lista">${ord.map(p => `<div class="sensor-linha"><span class="tk">${esc(p.ticker)}</span>${sensorMagic(p.magic)}</div>`).join('')}</div>
      </section>`; })()}
    <section><h2>Todos os pelotões</h2>
    <div class="table-wrap pos-table"><table><thead><tr><th>Ativo</th><th>Cotas</th><th>Preço médio</th><th>Cotação</th><th>Dia</th><th>Valor</th><th>Peso</th><th>Resultado</th><th>Renda/mês</th><th style="text-align:left">Magic Number</th><th>Teto Bazin</th><th>Zona</th></tr></thead>
    <tbody>${ps.map(row).join('')}</tbody></table></div>
    <div class="poscards">${ps.map(card).join('')}</div></section>
    <p class="faint" style="margin-top:12px">Zona de ataque: preço ≤ teto Bazin (6%) e (preço ≤ preço médio + 2% ou metade inferior do range de 52 semanas). Espera: acima do teto ou não pagador.</p>`);
}

// ───────── registrar ─────────
const TIPOS = {
  compra: ['Compra', ['ticker', 'qtd', 'preco', 'custos']], venda: ['Venda', ['ticker', 'qtd', 'preco', 'custos']],
  provento: ['Provento', ['ticker', 'valor', 'subtipo']], aporte: ['Aporte', ['valor']], retirada: ['Retirada', ['valor']],
  taxa: ['Taxa', ['valor']], desdobramento: ['Desdobramento', ['ticker', 'qtd']], grupamento: ['Grupamento', ['ticker', 'qtd']],
  ajuste_caixa: ['Ajuste de caixa', ['valor']],
};
const CAMPOS = {
  ticker: (v) => `<label>Ativo<input name="ticker" required maxlength="7" value="${esc(v)}" autocapitalize="characters" list="tks" placeholder="ex.: BTLG11"></label>`,
  qtd: (v, tipo) => `<label>${tipo === 'desdobramento' || tipo === 'grupamento' ? 'Fator (ex.: 2 = 1→2)' : 'Cotas'}<input name="qtd" type="number" inputmode="decimal" step="any" min="0" required value="${esc(v)}"></label>`,
  preco: (v) => `<label>Preço unitário (R$)<input name="preco" type="number" inputmode="decimal" step="0.01" min="0" required value="${esc(v)}"></label>`,
  custos: (v) => `<label>Custos (corretagem + emolumentos)<input name="custos" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(v || '')}"></label>`,
  valor: (v, tipo) => `<label>Valor (R$)${tipo === 'ajuste_caixa' ? ' · negativo para reduzir' : ''}<input name="valor" type="number" inputmode="decimal" step="0.01" required value="${esc(v)}"></label>`,
  subtipo: (v) => `<label>Tipo<select name="subtipo">${['rendimento', 'dividendo', 'jcp', 'outro'].map(o => `<option ${v === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`,
};
function registrar(params) {
  const tipo = TIPOS[params.get('tipo')] ? params.get('tipo') : 'compra';
  const [titulo, campos] = TIPOS[tipo];
  frame('registrar', `<div class="eyebrow">Registrar</div><h1>Novo lançamento</h1>
    <div class="seg" role="group" aria-label="Tipo de lançamento">${Object.entries(TIPOS).map(([k, [t]]) => `<button type="button" data-t="${k}" aria-pressed="${k === tipo}">${t}</button>`).join('')}</div>
    <form class="card" id="f"><div class="row">
      <label>Data<input name="data" type="date" required value="${esc(params.get('data') || hoje())}" max="${hoje()}"></label>
      ${campos.map(c => CAMPOS[c](params.get(c) ?? '', tipo)).join('')}</div>
      <label>Nota (opcional)<input name="nota" maxlength="280" placeholder="ex.: nota de corretagem nº…"></label>
      <datalist id="tks">${(S?.posicoes || []).map(p => `<option value="${esc(p.ticker)}">`).join('')}</datalist>
      <div class="actions"><button class="btn">Revisar efeito</button></div></form>
    <div id="prev"></div>`);
  document.querySelectorAll('.seg button').forEach(b => b.onclick = () => { location.hash = `#/registrar?tipo=${b.dataset.t}`; });
  const f = document.getElementById('f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(f)); body.tipo = tipo;
    const btn = f.querySelector('button'); btn.disabled = true;
    try {
      const p = await api('/api/movements/preview', { method: 'POST', body });
      const ef = p.efeito, po = ef.posicao;
      document.getElementById('prev').innerHTML = `<section class="card" style="border-color:var(--cyan)"><h2>Confira antes de gravar</h2>
        <p class="muted">${esc(titulo)} · ${esc(body.data)}${po ? ' · ' + esc(po.ticker) : ''}</p>
        <div class="diff"><b></b><b>antes</b><b>depois</b>
          <span>Caixa</span><span class="num">${brl(ef.caixa.antes)}</span><span class="num ${ef.caixa.depois < 0 ? 'neg' : ''}">${brl(ef.caixa.depois)}</span>
          ${po ? `<span>Cotas</span><span class="num">${nf(po.qtd.antes, 2)}</span><span class="num">${nf(po.qtd.depois, 2)}</span>
          <span>Preço médio</span><span class="num">${brl(po.preco_medio.antes)}</span><span class="num">${brl(po.preco_medio.depois)}</span>` : ''}
          ${po?.realizado ? `<span>Realizado</span><span></span><span class="num ${sign(po.realizado)}">${brl(po.realizado)}</span>` : ''}
        </div>${ef.avisos.map(a => `<div class="alert atencao">${esc(a)}</div>`).join('')}
        <div class="actions"><button class="btn" id="ok">Confirmar e gravar</button><button class="btn ghost" id="cancel">Corrigir</button></div></section>`;
      document.getElementById('cancel').onclick = () => { document.getElementById('prev').innerHTML = ''; };
      document.getElementById('ok').onclick = async (ev) => {
        ev.target.disabled = true;
        try { await api('/api/movements', { method: 'POST', body: { ...body, confirmado: true } }); toast('Lançamento gravado no razão.'); await load(); route('cockpit'); }
        catch (err) { toast(err.message); ev.target.disabled = false; }
      };
    } catch (err) { toast(err.message); }
    btn.disabled = false;
  };
}

// ───────── razão ─────────
async function razao() {
  frame('razao', `<div class="eyebrow">Livro-razão</div><h1>Toda movimentação, auditável</h1><div id="lst" class="muted">Carregando…</div>`);
  const movs = await api('/api/movements?limit=500');
  const desc = (m) => {
    if (m.tipo === 'compra' || m.tipo === 'venda' || m.tipo === 'saldo_inicial') return `${nf(m.qtd, 0)} × ${brl(m.preco)}${m.custos ? ` + ${brl(m.custos)}` : ''}`;
    if (m.tipo === 'desdobramento' || m.tipo === 'grupamento') return `fator ${nf(m.qtd, 0)}`;
    return brl(m.valor);
  };
  document.getElementById('lst').innerHTML = movs.length ? `<div class="table-wrap tabela-razao"><table><thead><tr><th>Data</th><th>Tipo</th><th>Ativo</th><th>Detalhe</th><th>Origem</th><th></th></tr></thead><tbody>
    ${movs.map(m => `<tr style="${m.anulado ? 'opacity:.45;text-decoration:line-through' : ''}"><td>${esc(m.data.split('-').reverse().join('/'))}</td><td>${esc(m.tipo.replace('_', ' '))}${m.subtipo ? ` · ${esc(m.subtipo)}` : ''}</td>
      <td>${esc(m.ticker || '—')}</td><td class="num">${desc(m)}${m.estimado ? ' <span class="tag est">est.</span>' : ''}${m.nota ? `<span class="nm" title="${esc(m.nota)}">${esc(m.nota.slice(0, 40))}</span>` : ''}</td>
      <td class="faint">${esc(m.origem)}</td><td>${m.anulado ? 'anulado' : `<button class="btn danger" style="min-height:32px;padding:4px 10px" data-anular="${m.id}">Anular</button>`}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="cartoes-razao">${movs.map(m => `<div class="card tight rz ${m.anulado ? 'anulado' : ''}">
      <div><b>${esc(m.tipo.replace('_', ' '))}${m.ticker ? ' · ' + esc(m.ticker) : ''}</b><span class="faint">${esc(m.data.split('-').reverse().join('/'))} · ${esc(m.origem)}</span></div>
      <div class="r num">${desc(m)}${m.estimado ? ' <span class="tag est">est.</span>' : ''}</div>
      ${m.nota ? `<div class="faint rz-nota">${esc(m.nota)}</div>` : ''}
      <div class="r">${m.anulado ? '<span class="faint">anulado</span>' : `<button class="btn danger sm" data-anular="${m.id}">Anular</button>`}</div>
    </div>`).join('')}</div><p class="faint" style="margin-top:10px">Nada é apagado: lançamentos errados são anulados e ficam na trilha.</p>` : '<div class="card empty">Sem lançamentos.</div>';
  document.querySelectorAll('[data-anular]').forEach(b => b.onclick = async () => {
    if (!confirm('Anular este lançamento? Posições e caixa serão recalculados.')) return;
    try { await api(`/api/movements/${b.dataset.anular}/anular`, { method: 'POST', body: {} }); toast('Lançamento anulado.'); await load(); razao(); }
    catch (e) { toast(e.message); }
  });
}

// ───────── plano ─────────
function plano() {
  const s = S, fase = s.fases.find(f => f.id === s.missao.fase?.id);
  const pesoAtual = Object.fromEntries(s.posicoes.map(p => [p.ticker, p.peso]));
  const anos = (m) => (m == null ? '> 60 anos' : m < 24 ? `${m} meses` : `${nf(m / 12, 1)} anos`);
  const proj = s.projecao;
  frame('plano', `<div class="eyebrow">Plano</div><h1>${esc(fase?.nome ?? 'Plano')} · alvo vs. campo</h1>
    ${fase ? `<div class="table-wrap"><table><thead><tr><th>Ativo</th><th>Alvo</th><th>Atual</th><th>Desvio</th><th style="width:40%">Distância</th></tr></thead><tbody>
      ${Object.entries(fase.pesos).sort((a, b) => b[1] - a[1]).map(([t, w]) => { const a = pesoAtual[t] ?? 0, d = a - w; return `<tr><td><span class="tk">${esc(t)}</span></td><td class="num">${w}%</td><td class="num">${pct(a)}</td><td class="num ${d < 0 ? 'warn' : 'pos'}">${d > 0 ? '+' : ''}${pct(d)}</td>
      <td><div class="bar" style="margin:0"><i style="width:${Math.min(100, a / w * 100)}%;background:${a >= w ? 'var(--green)' : 'var(--amber)'}"></i></div></td></tr>`; }).join('')}
    </tbody></table></div>` : ''}
    <section class="grid g2">
      <div class="card"><h2>Regras de engajamento</h2><ol style="padding-left:18px;margin:0">${s.regras.map(r => `<li style="margin-bottom:8px">${esc(r)}</li>`).join('')}</ol></div>
      <div class="card"><h2>Conselho · 5 lentes</h2>${s.lentes.map(l => `<p style="margin:0 0 10px"><b>${esc(l.nome)}</b> <span class="tag">${l.peso}%</span><br><span class="faint">${esc(l.papel)} — ${esc(l.regra)}</span></p>`).join('')}</div>
    </section>
    <section class="card"><h2>Projeção dos marcos</h2><p class="faint">Aporte mensal de ${brl(s.aporte_mensal ?? 0)} e reinvestimento de 100% dos proventos, a partir do patrimônio atual.</p>
      <div class="table-wrap"><table><thead><tr><th>Renda/mês</th>${Object.entries(proj.cenarios).map(([n, c]) => `<th>${n}<span class="nm">DY ${c.dy}% · +${c.valorizacao}% a.a.</span></th>`).join('')}</tr></thead><tbody>
      ${proj.marcos.base.map((m, i) => `<tr><td>${brl(m.renda, 0)}</td>${Object.keys(proj.cenarios).map(n => `<td>${anos(proj.marcos[n][i].meses)}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div></section>`);
}

// ───────── ajustes ─────────
function ajustes() {
  frame('ajustes', `<div class="eyebrow">Ajustes</div><h1>Sala de máquinas</h1>
    <div class="grid g2">
      <div class="card"><h2>Migração do INSA Wallet</h2><p class="muted">Importe o arquivo <b>insa-migracao-….json</b>: cotas reais, preços médios, plano e estratégia. Você confere tudo antes de gravar.</p>
        <div class="actions"><label class="btn" style="cursor:pointer">Escolher arquivo<input type="file" id="migfile" accept=".json,application/json" class="sr"></label></div></div>
      <div class="card"><h2>Cotações</h2><p class="muted">Atualização automática a cada 5 min no pregão (brapi.dev, reserva Yahoo).</p><div class="actions"><button class="btn ghost" id="cot">Atualizar agora</button></div></div>
      ${DESK ? `<div class="card"><h2>Atualizações</h2><p class="muted" id="ver">Versão …</p><p class="faint" id="updtx">${esc(UPD?.texto || '')}</p>
        <div class="actions"><button class="btn ghost" id="updchk">Verificar agora</button>${UPD?.estado === 'pronta' ? '<button class="btn" id="updins">Reiniciar e atualizar</button>' : ''}</div>
        <details style="margin-top:12px"><summary class="faint">Canal de atualização</summary>
          <form id="feedf" class="row" style="margin-top:10px"><label>Usuário GitHub<input name="owner" placeholder="ex.: israelneto"></label><label>Repositório<input name="repo" placeholder="ex.: insa-command"></label></form>
          <div class="actions"><button class="btn ghost" id="feedsave">Salvar canal</button></div></details></div>`
      : `<div class="card"><h2>Aparelhos</h2><p class="muted">Para conectar o celular ou outro PC, gere um código e digite-o no aparelho novo. Vale 10 minutos e uma única vez.</p>
          <div class="actions"><button class="btn" id="gerarcod">Gerar código</button></div><div id="codout" style="margin-top:10px"></div>
          <div id="aparelhos" class="faint" style="margin-top:12px">Carregando…</div>
          ${SHELL ? '<div class="actions"><button class="btn ghost" id="sairnuvem">Voltar este PC ao modo local</button></div>' : ''}</div>`}
      <div class="card"><h2>Inteligência</h2><p class="muted">${DESK ? 'Chaves guardadas cifradas pelo Windows, só neste computador. Deixe em branco para manter a atual.' : 'Verifica se as chaves do Claude e do Gemini estão configuradas e respondendo. As chaves nunca saem do servidor.'}</p>
        ${DESK ? `<form id="keysf"><label>Google AI (Gemini) <span class="faint" id="k_GEMINI_API_KEY"></span><input name="GEMINI_API_KEY" type="password" autocomplete="off" placeholder="cole a chave"></label>
          <label style="margin-top:8px">Anthropic (Claude) <span class="faint" id="k_ANTHROPIC_API_KEY"></span><input name="ANTHROPIC_API_KEY" type="password" autocomplete="off" placeholder="sk-ant-…"></label>
          <label style="margin-top:8px">brapi.dev (opcional) <span class="faint" id="k_BRAPI_TOKEN"></span><input name="BRAPI_TOKEN" type="password" autocomplete="off" placeholder="token gratuito"></label></form>
          <div class="actions"><button class="btn ghost" id="keysave">Salvar chaves</button><button class="btn ghost" id="ia">Diagnóstico de IA</button></div>`
          : '<div class="actions"><button class="btn ghost" id="ia">Diagnóstico de IA</button></div>'}
        <div id="iaout" class="faint" style="margin-top:8px"></div>
        <details style="margin-top:12px" id="iacfg"><summary class="faint">Configuração do M.A.N.U.E.L.</summary>
          <form id="cfgf" class="row" style="margin-top:10px">
            <label>Cérebro principal<select name="provedor"><option value="claude">Claude (reserva: Gemini)</option><option value="gemini">Gemini (reserva: Claude)</option></select></label>
            <label>Modelo Claude<input name="modeloClaude" placeholder="claude-haiku-5-5 (barato) ou claude-sonnet-5-5"></label>
            <label>Modelo Gemini<input name="modeloGemini" placeholder="auto"></label>
            <label>Consultas à IA por dia<input name="limite_diario" type="number" min="1" max="1000"></label>
            <label>Teto de tokens por dia<input name="limite_tokens" type="number" min="5000" max="5000000" step="5000"></label>
            <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="economico" style="width:auto;min-height:0"> Modo econômico (respostas locais, cache e modelos mais baratos)</label>
            <label>Voz<select name="voz_motor"><option value="gemini">Natural J.A.R.V.I.S. (Gemini, recomendada)</option><option value="windows">Voz do aparelho (grátis, offline)</option><option value="desligada">Desligada</option></select></label>
            <label>Timbre (natural)<select name="voz_nome">${VOZES_MASCULINAS.map(([v, d]) => `<option value="${v}">${v} · ${d}</option>`).join('')}</select></label>
            <label>Voz do aparelho (só neste aparelho)<select id="vozap"><option value="">automática (masculina, se houver)</option></select></label>
            <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="fala_auto" style="width:auto;min-height:0"> Falar as respostas automaticamente</label>
          </form>
          <div class="kv" style="margin-top:10px"><b>Neste aparelho</b></div>
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="pf-rosto" style="width:auto;min-height:0" ${pref('rosto') ? 'checked' : ''}> Rosto do Manuel em tela cheia quando ele fala</label>
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="pf-saudacao" style="width:auto;min-height:0" ${pref('saudacao') ? 'checked' : ''}> Cumprimento com o relatório do dia (1 vez por dia, ao abrir)</label>
          <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="pf-escuta" style="width:auto;min-height:0" ${pref('escuta', false) ? 'checked' : ''}> Atender ao "Hey Manuel" com o app aberto (escuta no próprio aparelho; baixa ~31 MB na primeira vez)</label>
          <div class="actions"><button class="btn ghost" id="cfgsave">Salvar configuração</button><button class="btn ghost" id="voztest">Testar voz</button><button class="btn ghost" id="saudtest">Cumprimento agora</button></div></details></div>
      <div class="card"><h2>Backup</h2><p class="muted">${DESK ? 'Seus dados ficam só neste computador. Faça cópias regulares.' : 'Exporta todo o razão, ativos e configuração em JSON.'}</p><div class="actions"><button class="btn ghost" id="exp">Exportar JSON</button>${DESK ? '<button class="btn ghost" id="dbbak">Copiar banco completo</button><button class="btn ghost" id="dbdir">Abrir pasta de dados</button>' : ''}</div></div>
      ${DESK ? `<div class="card"><h2>Nuvem e celular</h2><p class="muted">Envia a sua carteira para a sua nuvem (Cloudflare) e passa a usar os mesmos dados no PC e no celular. Os dados locais ficam guardados como cópia.</p>
          <form id="nuvemf"><label>Endereço da nuvem<input name="url" type="url" placeholder="https://insa-command.SEU-NOME.workers.dev" required></label>
            <label style="margin-top:8px">Código de configuração (1ª vez) ou código de pareamento<input name="cod" type="password" autocomplete="off" required></label></form>
          <div class="actions"><button class="btn" id="nuvemok">Conectar e enviar meus dados</button></div><div id="nuvemtx" class="faint" style="margin-top:8px"></div></div>` : ''}
      ${DESK ? `<div class="card"><h2>Segurança</h2><p class="muted">O app se bloqueia sozinho após 30 minutos sem uso.</p>
          <form id="pinch" class="row"><label>PIN atual<input name="atual" type="password" inputmode="numeric" maxlength="12"></label><label>Novo PIN<input name="novo" type="password" inputmode="numeric" maxlength="12"></label></form>
          <div class="actions"><button class="btn ghost" id="pinsave">Trocar PIN</button><button class="btn" id="out">Bloquear agora</button></div></div>`
      : `<div class="card"><h2>Sessão</h2><div class="actions"><button class="btn ghost" id="out">Sair</button><button class="btn danger" id="outall">Sair de todos os dispositivos</button></div></div>`}
    </div>
    <section class="card"><h2>Trilha de auditoria</h2><div id="aud" class="faint">Carregando…</div></section>`);
  const busy = (id, fn) => { const b = document.getElementById(id); if (!b) return; b.onclick = async () => { b.disabled = true; try { await fn(); } catch (e) { toast(e.message); } b.disabled = false; }; };
  document.getElementById('migfile')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { const j = JSON.parse(await f.text()); if (!Array.isArray(j.posicoes)) throw new Error('Arquivo sem posições.'); MIG = j; route('migracao'); }
    catch (err) { toast('Arquivo inválido: ' + err.message); }
  });
  busy('cot', async () => { const r = await api('/api/market/refresh', { method: 'POST', body: {} }); toast(`${r.atualizadas} cotações atualizadas${r.falharam.length ? `, falharam: ${r.falharam.join(', ')}` : ''}.`); await load(); });
  const listarAparelhos = () => api('/api/auth/dispositivos').then(l => {
    const el = document.getElementById('aparelhos'); if (!el) return;
    el.innerHTML = l.map(a => `<div style="display:flex;gap:10px;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)">
      <span><b style="color:var(--tx)">${esc(a.rotulo || 'Aparelho')}</b>${a.atual ? ' <span class="tag ataque">este</span>' : ''}<br>último uso ${a.ultimo_uso ? new Date(a.ultimo_uso).toLocaleString('pt-BR') : '—'}</span>
      ${a.atual ? '' : `<button class="btn danger sm" data-rev="${esc(a.id)}">Desconectar</button>`}</div>`).join('') || 'Nenhum aparelho.';
    el.querySelectorAll('[data-rev]').forEach(b => b.onclick = async () => { if (!confirm('Desconectar este aparelho? Ele precisará de um novo código para voltar.')) return; await api(`/api/auth/dispositivos/${b.dataset.rev}/revogar`, { method: 'POST', body: {} }); listarAparelhos(); });
  }).catch(() => {});
  if (!DESK) listarAparelhos();
  busy('gerarcod', async () => {
    const r = await api('/api/auth/dispositivo/codigo', { method: 'POST', body: {} });
    const el = document.getElementById('codout');
    const fim = r.expira; const pinta = () => { const s = Math.max(0, Math.round((fim - Date.now()) / 1000));
      el.innerHTML = s ? `<div class="codigo-par">${esc(r.codigo.slice(0, 4))} ${esc(r.codigo.slice(4))}</div><div class="faint">expira em ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} · use no aparelho novo, em "Conectar este aparelho"</div>` : '<span class="faint">Código expirado. Gere outro.</span>';
      if (s && document.body.contains(el)) setTimeout(pinta, 1000); };
    pinta();
  });
  busy('sairnuvem', async () => { if (confirm('Este PC volta a usar os dados locais (os da nuvem continuam lá). Continuar?')) await SHELL.sairDaNuvem(); });
  busy('ia', async () => {
    const r = await api('/api/ia/status');
    document.getElementById('iaout').innerHTML = Object.entries(r).map(([k, v]) => `${esc(k)}: <b class="${v.ok ? 'pos' : 'neg'}">${esc(v.ok ? 'ok' : v.erro)}</b>${v.ms ? ` · ${v.ms} ms` : ''}`).join('<br>');
  });
  busy('exp', async () => {
    const r = await fetch('/api/export', { credentials: 'same-origin' }); if (!r.ok) throw new Error('Falha no backup.');
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = `insa-backup-${hoje()}.json`; a.click();
  });
  busy('out', async () => { await api('/api/auth/logout', { method: 'POST', body: {} }); if (!DESK) cacheClear(); S = null; route('gate'); });
  busy('outall', async () => { if (!confirm('Encerrar todas as sessões?')) return; await api('/api/auth/logout-all', { method: 'POST', body: {} }); cacheClear(); S = null; route('gate'); });
  if (DESK) {
    DESK.info().then(i => { document.getElementById('ver').textContent = `Versão ${i.versao} · dados em ${i.dados}`; });
    DESK.getFeed().then(f => { const ff = document.getElementById('feedf'); if (f?.provider === 'github') { ff.owner.value = f.owner; ff.repo.value = f.repo; } }).catch(() => {});
    DESK.keysStatus().then(k => { for (const [n, ok] of Object.entries(k)) { const el = document.getElementById('k_' + n); if (el) el.textContent = ok ? '· configurada' : '· não configurada'; } }).catch(() => {});
    busy('updchk', async () => { const s = await DESK.checkUpdates(); document.getElementById('updtx').textContent = s?.texto || ''; });
    busy('updins', async () => { await DESK.installUpdate(); });
    busy('feedsave', async () => { const ff = document.getElementById('feedf'); const o = ff.owner.value.trim(), r = ff.repo.value.trim();
      await DESK.setFeed(o && r ? { provider: 'github', owner: o, repo: r } : null); toast(o && r ? 'Canal salvo. Verificando…' : 'Canal removido.'); if (o && r) { const s = await DESK.checkUpdates(); document.getElementById('updtx').textContent = s?.texto || ''; } });
    busy('keysave', async () => { const kf = document.getElementById('keysf'); let n = 0;
      for (const el of kf.querySelectorAll('input')) if (el.value.trim()) { await DESK.setKey(el.name, el.value.trim()); el.value = ''; n++; }
      toast(n ? `${n} chave(s) salva(s).` : 'Nada para salvar.'); ajustes(); });
    busy('nuvemok', async () => {
      const nf = document.getElementById('nuvemf'); if (!nf.reportValidity()) return;
      const tx = document.getElementById('nuvemtx'); tx.textContent = 'Conectando à nuvem…';
      try { const r = await DESK.conectarNuvem(nf.url.value.trim(), nf.cod.value.trim()); tx.textContent = r.mensagem; }
      catch (e) { tx.textContent = e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
    });
    busy('dbbak', async () => { if (await DESK.backup()) toast('Cópia do banco salva.'); });
    busy('dbdir', () => DESK.openData());
    busy('pinsave', async () => { const pf = document.getElementById('pinch'); await api('/api/auth/pin/change', { method: 'POST', body: { atual: pf.atual.value, novo: pf.novo.value } }); pf.reset(); toast('PIN alterado.'); });
  }
  api('/api/manuel/conversa').then(c => {
    const cf = document.getElementById('cfgf'); if (!cf) return;
    for (const [k, v] of Object.entries(c.config)) { const el = cf.elements[k]; if (!el) continue; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; }
  }).catch(() => {});
  busy('cfgsave', async () => {
    const cf = document.getElementById('cfgf');
    const body = { provedor: cf.provedor.value, modeloClaude: cf.modeloClaude.value.trim(), modeloGemini: cf.modeloGemini.value.trim() || 'auto',
      limite_diario: Number(cf.limite_diario.value), limite_tokens: Number(cf.limite_tokens.value), economico: cf.economico.checked, voz_motor: cf.voz_motor.value, voz_nome: cf.voz_nome.value, fala_auto: cf.fala_auto.checked };
    await api('/api/manuel/config', { method: 'POST', body }); toast('Configuração do M.A.N.U.E.L. salva.');
    if (CONV) CONV.config = { ...CONV.config, ...body };
  });
  for (const k of ['rosto', 'saudacao']) document.getElementById('pf-' + k)?.addEventListener('change', (e) => { setPref(k, e.target.checked); toast('Preferência salva neste aparelho.'); });
  document.getElementById('pf-escuta')?.addEventListener('change', (e) => {
    setPref('escuta', e.target.checked);
    if (e.target.checked) { ligarEscutaSePreciso(); toast('Escuta ligada. Na primeira vez baixa a voz (~31 MB); depois fica no aparelho.', 6000); }
    else { desligarEscuta(); toast('Escuta desligada.'); }
  });
  document.getElementById('saudtest')?.addEventListener('click', () => saudacaoDiaria(true));
  // vozes instaladas no aparelho (pt-BR); a escolha fica guardada só neste aparelho
  const vozap = document.getElementById('vozap');
  const listarVozes = () => { if (!vozap || !('speechSynthesis' in window)) return;
    const vs = speechSynthesis.getVoices().filter(v => /^pt(-|_)BR/i.test(v.lang));
    let sel = ''; try { sel = localStorage.getItem('insa.voz.aparelho') || ''; } catch {}
    vozap.innerHTML = '<option value="">automática (masculina, se houver)</option>' + vs.map(v => `<option value="${esc(v.name)}" ${v.name === sel ? 'selected' : ''}>${esc(v.name)}</option>`).join(''); };
  listarVozes(); if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = listarVozes;
  vozap?.addEventListener('change', () => { try { localStorage.setItem('insa.voz.aparelho', vozap.value); } catch {} });
  document.getElementById('voztest')?.addEventListener('click', async () => {
    const cf = document.getElementById('cfgf');
    if (!CONV) { try { CONV = await api('/api/manuel/conversa'); } catch {} }
    if (CONV) CONV.config = { ...CONV.config, voz_motor: cf.voz_motor.value, voz_nome: cf.voz_nome.value };
    falar(`Às suas ordens, Senhor. Patrimônio em ${brl(S?.totais?.patrimonio ?? 0)}, renda estimada de ${brl(S?.totais?.renda_mes_estimada ?? 0)}/mês. Os dividendos seguem trabalhando, mesmo quando o Senhor dorme.`);
  });
  api('/api/audit').then(rows => { document.getElementById('aud').innerHTML = rows.slice(0, 30).map(r => `${esc(r.em)} · ${esc(r.acao)}`).join('<br>') || 'vazia'; }).catch(() => {});
}

// ───────── radar ao vivo ─────────
let LIVE = null, liveTimer = null, liveAuto = true;
const curView = () => (location.hash.slice(2) || 'cockpit').split('?')[0];
function spark(serie, ref, w = 120, h = 32) {
  if (!serie || serie.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`;
  const vals = ref ? [...serie, ref] : serie;
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = serie.map((v, i) => `${(i / (serie.length - 1) * w).toFixed(1)},${(h - 2 - (v - min) / span * (h - 4)).toFixed(1)}`).join(' ');
  const up = serie[serie.length - 1] >= (ref ?? serie[0]);
  const yRef = ref ? (h - 2 - (ref - min) / span * (h - 4)).toFixed(1) : null;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true">${yRef ? `<line x1="0" x2="${w}" y1="${yRef}" y2="${yRef}" stroke="rgba(72,229,255,.35)" stroke-dasharray="2 3"/>` : ''}
    <polyline points="${pts}" fill="none" stroke="${up ? '#5cffb0' : '#ff4d5e'}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}
function dur(ms) { const m = Math.max(0, Math.round(ms / 60000)); const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60; return d ? `${d}d ${h}h` : h ? `${h}h ${mi}min` : `${mi} min`; }
function atrasoTxt(r) {
  if (r.atraso_s == null) return 'sem dado';
  if (r.atraso_s < 90) return 'agora';
  if (r.atraso_s < 6 * 3600) return `${Math.round(r.atraso_s / 60)} min`;
  return 'último: ' + new Date(Date.now() - r.atraso_s * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function fmtIdx(r) {
  if (r.preco == null) return '—';
  if (r.ticker === 'USDBRL') return 'R$ ' + nf(r.preco, 4);
  if (r.ticker === 'BTCBRL') return brl(r.preco, 0);
  if (r.ticker === 'SP500') return nf(r.preco, 2) + ' pts';
  return nf(r.preco, 0) + ' pts';
}
async function radar() {
  await load().catch(() => {});
  frame('radar', `<div class="eyebrow">Radar de mercado</div><h1>Mercado ao vivo</h1><div id="live" class="muted">Conectando ao mercado…</div>`);
  await liveTick(false);
  clearInterval(liveTimer);
  liveTimer = setInterval(() => {
    if (curView() !== 'radar') { clearInterval(liveTimer); return; }
    if (document.visibilityState === 'visible' && liveAuto) liveTick(false);
  }, 30000);
}
async function liveTick(forcar) {
  const el = document.getElementById('live'); if (!el) return;
  const prev = new Map((LIVE?.ativos || []).concat(LIVE?.indices || []).map(r => [r.ticker, r.preco]));
  try { LIVE = await api('/api/market/live' + (forcar ? '?forcar=1' : '')); vigiar(LIVE); }
  catch (e) { el.innerHTML = `<div class="alert atencao">Mercado indisponível agora: ${esc(e.message)}</div>`; return; }
  const L = LIVE, t = L.totais, pg = L.pregao;
  const flash = (r) => { const p = prev.get(r.ticker); return p == null || r.preco == null || p === r.preco ? '' : r.preco > p ? 'flash-up' : 'flash-down'; };
  el.innerHTML = `
    <div class="livebar">
      <span class="chip ${pg.aberto ? 'open' : ''}"><i class="dot ${pg.aberto ? 'on' : 'late'}"></i>${pg.aberto ? 'Pregão aberto' : 'Pregão fechado'}</span>
      <span class="faint">${pg.evento === 'fechamento' ? 'fecha' : 'abre'} em ${dur(pg.em - L.agora)} · ${new Date(pg.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit' })} (Brasília)</span>
      <span class="faint" style="margin-left:auto">atualizado ${new Date(L.agora).toLocaleTimeString('pt-BR')}</span>
      <label class="faint auto"><input type="checkbox" id="auto" ${liveAuto ? 'checked' : ''}> automático (30 s)</label>
      <button class="btn ghost sm" id="liveref">Atualizar</button>
    </div>
    <div class="grid g4" style="margin-top:12px">
      <div class="card kpi"><div class="label">Resultado do dia</div><div class="val num ${sign(t.resultado_dia)}">${t.resultado_dia > 0 ? '+' : ''}${brl(t.resultado_dia)}</div><div class="faint ${sign(t.resultado_dia)}">${t.resultado_dia_pct > 0 ? '+' : ''}${pct(t.resultado_dia_pct, 2)} contra o fechamento anterior</div></div>
      <div class="card kpi"><div class="label">Patrimônio a mercado</div><div class="val num">${brl(t.patrimonio)}</div><div class="faint">${brl(t.investido)} em ativos</div></div>
      <div class="card kpi"><div class="label">Em alta / em queda</div><div class="val num"><span class="pos">${L.ativos.filter(a => a.var > 0).length}</span> <small>/</small> <span class="neg">${L.ativos.filter(a => a.var < 0).length}</span></div><div class="faint">de ${L.ativos.length} pelotões</div></div>
      <div class="card kpi"><div class="label">Maior movimento</div>${(() => { const m = [...L.ativos].filter(a => a.var != null).sort((a, b) => Math.abs(b.var) - Math.abs(a.var))[0]; return m ? `<div class="val num ${sign(m.var)}">${esc(m.ticker)}</div><div class="faint ${sign(m.var)}">${m.var > 0 ? '+' : ''}${pct(m.var, 2)} · ${brl(m.var_dia_valor)}</div>` : '<div class="val">—</div>'; })()}</div>
    </div>
    <section><h2>Referências</h2><div class="idx">${L.indices.map(r => `<div class="card tight">
      <div class="label faint">${esc(r.nome)}</div>
      <div class="ival num ${flash(r)}">${fmtIdx(r)}</div>
      <div class="num ${sign(r.var)}">${r.var == null ? '—' : (r.var > 0 ? '+' : '') + pct(r.var, 2)}</div>
      ${spark(r.serie, r.fechamento_ant)}<div class="faint">${esc(atrasoTxt(r))}</div></div>`).join('')}</div></section>
    <section><h2>Pelotões</h2><div class="table-wrap tabela-radar"><table><thead><tr><th>Ativo</th><th>Preço</th><th>Dia</th><th>R$ no dia</th><th>Intradiário</th><th>Peso</th><th>Zona</th><th>Atraso</th></tr></thead><tbody>
      ${L.ativos.map(r => `<tr><td><span class="tk">${esc(r.ticker)}</span><span class="nm">${esc(r.nome)}</span></td>
        <td class="num ${flash(r)}">${r.preco == null ? '—' : brl(r.preco)}</td>
        <td class="num ${sign(r.var)}">${r.var == null ? '—' : (r.var > 0 ? '+' : '') + pct(r.var, 2)}</td>
        <td class="num ${sign(r.var_dia_valor)}">${r.var_dia_valor ? (r.var_dia_valor > 0 ? '+' : '') + brl(r.var_dia_valor) : '—'}</td>
        <td>${spark(r.serie, r.fechamento_ant, 110, 28)}</td><td class="num">${pct(r.peso)}</td>
        <td><span class="tag ${r.zona}">${esc(r.zona)}</span></td><td class="faint">${esc(atrasoTxt(r))}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="cartoes-radar">${L.ativos.map(r => `<div class="card tight cr">
      <div><span class="tk">${esc(r.ticker)}</span> <span class="tag ${r.zona}">${esc(r.zona)}</span><span class="nm faint">${esc(r.nome)}</span></div>
      <div class="r"><b class="num ${flash(r)}">${r.preco == null ? '—' : brl(r.preco)}</b><span class="num ${sign(r.var)}">${r.var == null ? '—' : (r.var > 0 ? '+' : '') + pct(r.var, 2)}</span></div>
      <div class="cr-spark">${spark(r.serie, r.fechamento_ant, 220, 30)}</div>
      <div class="r"><span class="num ${sign(r.var_dia_valor)}">${r.var_dia_valor ? (r.var_dia_valor > 0 ? '+' : '') + brl(r.var_dia_valor) : '—'}</span><span class="faint">${pct(r.peso)} · ${esc(atrasoTxt(r))}</span></div>
    </div>`).join('')}</div></section>
    <p class="faint">${esc(L.aviso)} Fontes: ${esc([...new Set(L.ativos.concat(L.indices).map(r => r.fonte).filter(Boolean))].join(', ') || '—')}. ${esc(pg.nota)}</p>`;
  document.getElementById('auto').onchange = (e) => { liveAuto = e.target.checked; };
  document.getElementById('liveref').onclick = (e) => { e.target.disabled = true; liveTick(true); };
}

// ───────── estratégia ─────────
async function estrategia() {
  const e = S.estrategia;
  if (!e) return frame('estrategia', `<div class="eyebrow">Estratégia</div><h1>Plano de guerra</h1>
    <div class="card empty"><p>A estratégia completa chega com o arquivo de migração do INSA Wallet.</p><div class="actions" style="justify-content:center"><a class="btn" href="#/ajustes">Importar migração</a><a class="btn ghost" href="#/plano">Ver fases e regras</a></div></div>`);
  const t = S.totais;
  const rot = e.roteiro_12_meses || [];
  const idx = rot.findIndex(r => r.meta_patrimonio > t.patrimonio);
  const posRot = idx === -1 ? 'Roteiro de 12 meses concluído em patrimônio — hora de abrir a Fase 2.' : idx === 0 ? 'Antes do mês 1 do roteiro.' : `Entre o mês ${idx} e o mês ${idx + 1} do roteiro (meta do mês ${idx + 1}: ${brl(rot[idx].meta_patrimonio)} e ${brl(rot[idx].meta_renda)}/mês).`;
  const tbl = (cab, linhas) => `<div class="table-wrap"><table><thead><tr>${cab.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>`;
  frame('estrategia', `<div class="eyebrow">Estratégia</div><h1>Plano de guerra</h1>
    <div class="card ponte"><div class="eyebrow">Objetivo</div><p>${esc(e.objetivo)}</p>
      <p class="faint">Patrimônio hoje ${brl(t.patrimonio)} · renda ${brl(t.renda_mes_estimada)}/mês. ${esc(posRot)}</p></div>
    <section class="grid g2">
      <div class="card"><h2>Decisões em vigor</h2>${(e.decisoes || []).map(d => `<p style="margin:0 0 10px"><span class="tag">${esc(d.data.split('-').reverse().join('/'))}</span> ${esc(d.texto)}</p>`).join('')}</div>
      <div class="card"><h2>Caixa de proventos</h2><ol style="padding-left:18px;margin:0">${(e.caixa_de_proventos || []).map(r => `<li style="margin-bottom:8px">${esc(r)}</li>`).join('')}</ol></div>
    </section>
    <section class="card"><h2>Roteiro dos 12 meses</h2>${tbl(['Mês', 'Compras sugeridas', 'Meta de patrimônio', 'Meta de renda'], rot.map((r, i) => `<tr class="${i === idx ? 'atual' : ''}"><td>${r.mes}${i === idx ? ' ◀' : ''}</td><td>${esc(r.compras)}</td><td class="num">${brl(r.meta_patrimonio)}</td><td class="num">${brl(r.meta_renda)}</td></tr>`))}
      <p class="faint">${esc(e.roteiro_nota || '')}</p></section>
    <section class="grid g2">
      <div class="card"><h2>Calendário de proventos</h2><p class="muted">${esc(e.calendario?.leitura || '')}</p>
        ${tbl(['Ativo', 'Frequência', 'Meses'], (e.calendario?.pagadores || []).map(p => `<tr><td><span class="tk">${esc(p.ticker)}</span></td><td>${esc(p.frequencia)}</td><td style="white-space:normal;text-align:left">${esc(p.meses)}</td></tr>`))}
        <p class="faint">Meses fracos: ${esc((e.calendario?.meses_fracos || []).join(', '))}. ${esc(e.calendario?.pesos_sugeridos_fase1_ajustada || '')}</p></div>
      <div class="card"><h2>Candidatos da Fase 2</h2><p class="faint">FIIs de tijolo mensais (dados de ${esc((e.candidatos_fase2?.dados_de || '').split('-').reverse().join('/'))})</p>
        ${tbl(['FII', 'Segmento', 'DY 12m'], (e.candidatos_fase2?.fii_tijolo_mensal || []).map(c => `<tr><td><span class="tk">${esc(c.ticker)}</span></td><td>${esc(c.segmento)}</td><td class="num">${pct(c.dy, 2)}</td></tr>`))}
        <p class="faint" style="margin-top:10px">Ações mensais: ${(e.candidatos_fase2?.acoes_mensais || []).map(a => `${esc(a.ticker)} (${pct(a.dy, 2)}, ${esc(a.nota)})`).join(' · ')}</p>
        <div class="alert atencao" style="margin-top:8px">${esc(e.candidatos_fase2?.aviso_papel || '')}</div></div>
    </section>
    <section class="grid g2">
      <div class="card"><h2>Tributação (2026)</h2>${tbl(['Tipo', 'Regra'], (e.tributacao_2026 || []).map(r => `<tr><td>${esc(r.tipo)}</td><td style="white-space:normal;text-align:left">${esc(r.regra)}</td></tr>`))}</div>
      <div class="card"><h2>Riscos e proteções</h2>${tbl(['Risco', 'Como o plano se protege'], (e.riscos || []).map(r => `<tr><td>${esc(r.risco)}</td><td style="white-space:normal;text-align:left">${esc(r.protecao)}</td></tr>`))}</div>
    </section>
    <section class="grid g2">
      <div class="card"><h2>Metas de renda (plano)</h2>${tbl(['Renda/mês', 'Patrimônio', 'Tempo', 'Marco'], (e.metas_renda || []).map(m => `<tr><td>${brl(m.renda, 0)}</td><td class="num">${brl(m.patrimonio, 0)}</td><td>${nf(m.anos, 1)} anos</td><td style="white-space:normal;text-align:left" class="faint">${esc(m.marco)}</td></tr>`))}
        ${tbl(['Cenário', 'Retorno', '10 anos', '20 anos', 'Renda em 20a'], (e.cenarios_plano || []).map(c => `<tr><td>${esc(c.nome)}</td><td style="white-space:normal;text-align:left" class="faint">${esc(c.retorno)}</td><td class="num">${brl(c.anos10, 0)}</td><td class="num">${brl(c.anos20, 0)}</td><td class="num">${brl(c.renda20, 0)}</td></tr>`))}</div>
      <div class="card"><h2>Indicadores do mês (10 min)</h2><ol style="padding-left:18px;margin:0">${(e.indicadores_mensais || []).map(r => `<li style="margin-bottom:8px">${esc(r)}</li>`).join('')}</ol>
        <p class="muted">${esc(e.checklist_anual || '')}</p></div>
    </section>
    <section class="card"><details id="leg"><summary><b>Histórico importado do INSA Wallet</b> <span class="faint">· arquivo de referência, fora do razão</span></summary><div id="legtx" class="faint" style="margin-top:10px">Carregando…</div></details></section>
    <p class="faint">Fontes: ${esc((e.fontes || []).join(' · '))}. Atualizado em ${esc((e.atualizado_em || '').split('-').reverse().join('/'))}.</p>`);
  document.getElementById('leg').addEventListener('toggle', async (ev) => {
    if (!ev.target.open || ev.target.dataset.ok) return; ev.target.dataset.ok = 1;
    const h = await api('/api/historico-legado').catch(() => null);
    const tx = h?.transacoes || [];
    document.getElementById('legtx').innerHTML = tx.length ? `<p>${esc(h.aportes?.nota || '')}</p>` + tbl(['Data', 'Tipo', 'Ativo', 'Qtd', 'Preço', 'Nota'], tx.map(x => `<tr><td>${esc((x.date || '').split('-').reverse().join('/'))}</td><td>${esc({ buy: 'compra', deposit: 'aporte', position_adjustment: 'ajuste' }[x.type] || x.type)}</td><td>${esc(x.ticker || '—')}</td><td class="num">${x.quantity ?? '—'}</td><td class="num">${x.price ? brl(x.price) : x.averagePrice ? 'PM ' + brl(x.averagePrice) : x.amount ? brl(x.amount) : '—'}</td><td style="white-space:normal;text-align:left;min-width:320px">${esc(x.note || '')}</td></tr>`)) : 'Sem histórico.';
  });
}

// ───────── migração (conferência antes de importar) ─────────
let MIG = null;
const sessionStorageGet = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const sessionStorageSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch {} };
function migracao() {
  if (!MIG) return route('ajustes');
  const n = S && !S.vazio;
  frame('ajustes', `<div class="eyebrow">Ajustes / Migração</div><h1>Confira antes de importar</h1>
    <p class="muted">${MIG._arquivo ? `Arquivo encontrado nos Downloads: <b>${esc(MIG._arquivo)}</b>. ` : ''}${esc(MIG.fonte || '')}. Corrija o que não bater com o extrato da corretora. Quantidade 0 remove a posição.</p>
    <form id="mf">
      <div class="table-wrap"><table><thead><tr><th>Ativo</th><th>Cotas</th><th>Preço médio (R$)</th><th>Custo</th><th style="text-align:left">Conferir</th></tr></thead><tbody>
      ${MIG.posicoes.map((p, i) => `<tr class="${p.alerta ? 'atual' : ''}"><td><span class="tk">${esc(p.ticker)}</span><span class="nm">${esc(p.nome || '')}</span></td>
        <td><input name="q${i}" type="number" step="any" min="0" value="${p.qtd}" style="max-width:100px;min-height:36px"></td>
        <td><input name="pm${i}" type="number" step="0.01" min="0" value="${p.preco_medio}" style="max-width:120px;min-height:36px"></td>
        <td class="num" id="c${i}">${brl(p.qtd * p.preco_medio)}</td>
        <td style="white-space:normal;text-align:left;max-width:360px" class="${p.alerta ? 'warn' : 'faint'}">${esc(p.alerta || 'ok')}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="row" style="margin-top:14px">
        <label>Data-base<input name="data_base" type="date" value="${esc(MIG.data_base || hoje())}" required></label>
        <label>Caixa disponível na corretora (R$)<input name="caixa" type="number" step="0.01" min="0" placeholder="0,00" value="${MIG.caixa ?? ''}"></label>
      </div>
      <p class="faint">${esc(MIG.caixa_nota || '')}</p>
      ${n ? `<label class="alert atencao" style="display:flex;gap:10px;align-items:flex-start;color:var(--tx)"><input type="checkbox" name="subst" style="width:auto;min-height:0;margin-top:3px">
        <span>Substituir o razão atual. Os lançamentos existentes serão <b>anulados, não apagados</b>${DESK ? ', e uma cópia completa do banco é salva antes' : ''}.</span></label>` : ''}
      <p class="muted" id="mtot"></p>
      <div class="actions"><button class="btn">Importar posições</button><a class="btn ghost" href="#/ajustes" id="mcancel">Cancelar</a></div>
    </form>`);
  const f = document.getElementById('mf');
  const linhas = () => MIG.posicoes.map((p, i) => ({ ticker: p.ticker, qtd: Number(f['q' + i].value || 0), preco_medio: Number(f['pm' + i].value || 0) }));
  const tot = () => { const l = linhas(); l.forEach((p, i) => { document.getElementById('c' + i).textContent = brl(p.qtd * p.preco_medio); });
    document.getElementById('mtot').textContent = `${l.filter(p => p.qtd > 0).length} posições · custo total ${brl(l.reduce((s, p) => s + p.qtd * p.preco_medio, 0))}`; };
  f.addEventListener('input', tot); tot();
  document.getElementById('mcancel').onclick = () => { MIG = null; sessionStorageSet('mig_ignorada', '1'); };
  f.onsubmit = async (ev) => {
    ev.preventDefault(); const b = f.querySelector('button');
    if (n && !f.subst.checked) { toast('Marque "Substituir o razão atual" para continuar.'); return; }
    b.disabled = true;
    try {
      const r = await api('/api/admin/import-migration', { method: 'POST', body: { migracao: MIG, posicoes: linhas(), caixa: f.caixa.value || 0, data_base: f.data_base.value, substituir: !!f.subst?.checked, confirmado: true } });
      MIG = null; toast(`Migração concluída: ${r.ativos} ativos${r.anulados ? `, ${r.anulados} lançamentos antigos anulados` : ''}.${r.backup ? ' Backup salvo.' : ''}`, 6000);
      await load(); route('cockpit');
    } catch (e) { toast(e.message, 6000); b.disabled = false; }
  };
}

// ───────── M.A.N.U.E.L. · console ─────────
let CONV = null, AUDIO = null, FALA_GERACAO = 0;
function md(t) {
  const linhas = esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').split('\n');
  let out = '', lista = false;
  for (const l of linhas) {
    const m = l.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (m) { if (!lista) { out += '<ul>'; lista = true; } out += `<li>${m[1]}</li>`; continue; }
    if (lista) { out += '</ul>'; lista = false; }
    out += l.trim() ? `<p>${l}</p>` : '';
  }
  return out + (lista ? '</ul>' : '');
}
function descLanc(l) {
  const tipos = { compra: 'Compra', venda: 'Venda', provento: 'Provento', aporte: 'Aporte', retirada: 'Retirada', taxa: 'Taxa', desdobramento: 'Desdobramento', grupamento: 'Grupamento', ajuste_caixa: 'Ajuste de caixa' };
  const qtdp = l.qtd != null && l.preco != null ? `${nf(l.qtd, 0)} × ${brl(l.preco)}${l.custos ? ` + ${brl(l.custos)}` : ''}` : l.qtd != null ? `fator ${nf(l.qtd, 0)}` : brl(l.valor);
  return `${tipos[l.tipo] || l.tipo}${l.ticker ? ' · ' + esc(l.ticker) : ''} · ${qtdp} · ${esc(String(l.data).split('-').reverse().join('/'))}${l.subtipo ? ' · ' + esc(l.subtipo) : ''}`;
}
function cartaoProposta(p) {
  const ef = p.efeito || {}, po = ef.posicao;
  const st = { pendente: '<span class="tag espera">aguardando confirmação</span>', confirmada: '<span class="tag ataque">gravada no razão</span>', recusada: '<span class="tag">recusada</span>' }[p.status];
  return `<div class="proposta ${p.status}" data-prop="${p.id}">
    <div class="faint">Proposta de lançamento #${p.id} ${st}</div>
    <div><b>${descLanc(p.lancamento)}</b></div>
    ${p.status === 'pendente' ? `<div class="diff"><b></b><b>antes</b><b>depois</b>
      <span>Caixa</span><span class="num">${brl(ef.caixa?.antes)}</span><span class="num ${ef.caixa?.depois < 0 ? 'neg' : ''}">${brl(ef.caixa?.depois)}</span>
      ${po ? `<span>Cotas</span><span class="num">${nf(po.qtd.antes, 2)}</span><span class="num">${nf(po.qtd.depois, 2)}</span>
      <span>Preço médio</span><span class="num">${brl(po.preco_medio.antes)}</span><span class="num">${brl(po.preco_medio.depois)}</span>` : ''}</div>
      ${(ef.avisos || []).map(a => `<div class="alert atencao">${esc(a)}</div>`).join('')}
      <div class="actions"><button class="btn sm" data-conf="${p.id}">Confirmar e gravar</button><button class="btn ghost sm" data-rec="${p.id}">Recusar</button></div>` : ''}
  </div>`;
}
function bolha(m) {
  if (m.papel === 'usuario') return `<div class="msg eu"><div class="balao">${md(m.texto)}</div></div>`;
  const meta = m.meta || {};
  const props = (meta.propostas || []).map(id => (CONV?.propostas || []).find(p => p.id === id)).filter(Boolean);
  const n = meta.uso ? meta.uso.entrada + meta.uso.saida : null;
  const tok = meta.local ? '0 tokens' : meta.cache ? 'resposta reaproveitada · 0 tokens' : n == null ? '' : n < 1000 ? n + ' tokens' : (n / 1000).toFixed(1) + 'k tokens';
  return `<div class="msg ele"><div class="avatar" aria-hidden="true">${EMBLEM}</div><div class="balao">
    ${(meta.ferramentas || []).length ? `<div class="ferr">${meta.ferramentas.map(e => `<span class="tag ${e.ok ? '' : 'espera'}">${esc(e.ferramenta.replace(/_/g, ' '))}${e.resumo ? ' · ' + esc(e.resumo) : ''}</span>`).join('')}</div>` : ''}
    ${md(m.texto)}
    ${props.map(cartaoProposta).join('')}
    ${(meta.fontes || []).length ? `<div class="fontes"><span class="faint">Fontes:</span> ${meta.fontes.map(f => `<a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.titulo)}</a>`).join(' · ')}</div>` : ''}
    <div class="rodape faint">${meta.local ? '<span class="tag ataque">motor local</span> ' : ''}${esc(meta.local ? '' : meta.provedor || '')}${meta.local ? '' : meta.modelo ? ' · ' + esc(meta.modelo) : ''}${tok ? ' · ' + tok : ''}
      <button class="linkbtn" data-falar="${m.id ?? ''}" title="Ouvir">🔊 ouvir</button></div>
  </div></div>`;
}
const HOLO = `<svg class="holo" id="holo" viewBox="0 0 200 200" aria-hidden="true">
  <g class="g1"><circle cx="100" cy="100" r="92" fill="none" stroke="rgba(72,229,255,.55)" stroke-width="1.2" stroke-dasharray="3 7"/>
    <path d="M100 4 l4 8 h-8z M100 196 l4 -8 h-8z M4 100 l8 4 v-8z M196 100 l-8 4 v-8z" fill="#ffb347"/></g>
  <g class="g2"><circle cx="100" cy="100" r="76" fill="none" stroke="rgba(72,229,255,.8)" stroke-width="2" stroke-dasharray="40 14 6 14"/>
    <circle cx="100" cy="100" r="66" fill="none" stroke="rgba(255,179,71,.6)" stroke-width="1" stroke-dasharray="1 9"/></g>
  <circle cx="100" cy="100" r="56" fill="rgba(4,18,28,.9)" stroke="rgba(72,229,255,.5)"/>
  <g class="olho"><path d="M62 92c11-16 24-24 38-24s27 8 38 24c-11 16-24 24-38 24s-27-8-38-24z" fill="none" stroke="#48e5ff" stroke-width="2.4"/>
    <circle cx="100" cy="92" r="11" fill="#ffb347"/><circle cx="100" cy="92" r="4.5" fill="#02070c"/></g>
  <g class="onda" fill="#48e5ff">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => `<rect x="${73 + i * 6}" y="118" width="3" height="16" rx="1"/>`).join('')}</g>
</svg>`;
function holoEstado(e) {
  const h = document.getElementById('holo'); if (!h) return;
  h.classList.remove('pensando', 'falando'); if (e) h.classList.add(e);
  const t = document.getElementById('estado'); if (t) t.textContent = { pensando: 'Analisando', falando: 'Transmitindo' }[e] || 'Em prontidão';
}
const AUDIO_CACHE = new Map();   // mesma fala tocada de novo não gasta outra chamada
// Cada chamada tem uma "geração"; se outra falar()/pararFala() acontecer antes do áudio
// carregar (ex.: o Senhor clicou "ouvir" de novo por estar demorando), a geração antiga
// é descartada ao chegar — nunca toca por cima da mais nova (evita a voz dobrada).
function falar(texto, botao, { tela = false } = {}) {
  pararFala();
  const minhaGeracao = FALA_GERACAO;
  const cfg = CONV?.config || {};
  const limpo = paraFala(texto);
  if (!limpo) return;
  VOZ.ultimaFala = String(texto);
  setTimeout(() => rostoAberto()?.dados?.(dadosDaFala(texto)), 0);
  const rosto = tela && pref('rosto') ? abrirRostoManuel() : rostoAberto();
  if (cfg.voz_motor === 'desligada') { rosto?.legenda(texto); return; }
  if (botao) { botao.disabled = true; botao.dataset.rotuloOriginal ??= botao.textContent; botao.textContent = '⏳ carregando…'; }
  const restaurarBotao = () => { if (botao) { botao.disabled = false; botao.textContent = botao.dataset.rotuloOriginal; } };
  if (cfg.voz_motor === 'gemini' && CONV?.chaves?.gemini) {
    const chave = (cfg.voz_nome || '') + '|' + limpo;
    holoEstado('pensando');
    const pronto = AUDIO_CACHE.get(chave) ?? fetch('/api/manuel/voz', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: limpo, voz: cfg.voz_nome }) })
      .then(r => r.ok ? r.blob() : r.json().then(j => Promise.reject(new Error(j.erro))))
      .then(b => { const u = URL.createObjectURL(b); if (AUDIO_CACHE.size > 20) AUDIO_CACHE.delete(AUDIO_CACHE.keys().next().value); AUDIO_CACHE.set(chave, Promise.resolve(u)); return u; });
    pronto.then(u => {
      restaurarBotao();
      if (minhaGeracao !== FALA_GERACAO) return;   // já foi cancelada por um novo pedido: não toca
      AUDIO = new Audio(u); AUDIO.onplay = () => holoEstado('falando'); AUDIO.onended = AUDIO.onpause = () => { holoEstado(null); rostoAberto()?.calar(); };
      rostoAberto()?.falar(limpo, { audio: AUDIO });
      const audio = AUDIO;
      return AUDIO.play().catch((e) => {   // som automático bloqueado: mostra a legenda e toca no primeiro toque
        const r = rostoAberto(); if (!r || e?.name !== 'NotAllowedError') throw e;
        r.calar(); r.aguardarToque(() => { r.falar(limpo, { audio }); audio.play().catch(() => {}); });
      });
    }).catch(e => {
      restaurarBotao(); AUDIO_CACHE.delete(chave);
      if (minhaGeracao !== FALA_GERACAO) return;
      toast('Voz natural indisponível agora (' + e.message + '). Usando a voz do aparelho.'); falarAparelho(limpo);
    });
    return;
  }
  restaurarBotao();
  rostoAberto()?.falar(limpo, { porPalavra: true });
  falarAparelho(limpo);
}
// Voz do aparelho: uma fala só (sem picotar por linha), voz masculina pt-BR quando existir, ritmo natural
function falarAparelho(texto) {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices().filter(v => /^pt(-|_)BR/i.test(v.lang));
  let escolhida = ''; try { escolhida = localStorage.getItem('insa.voz.aparelho') || ''; } catch {}
  const voz = vs.find(v => v.name === escolhida)
    || vs.find(v => /antonio|daniel|ptd|male|masculin|homem/i.test(v.name) && !/female|feminin/i.test(v.name))
    || vs.find(v => /natural|online|neural/i.test(v.name)) || vs[0] || null;
  // o Chrome corta falas longas: divide só em frases completas e encadeia sem pausas extras
  const frases = texto.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [texto];
  const blocos = []; let atual = '';
  for (const f of frases) { if ((atual + f).length > 220 && atual) { blocos.push(atual); atual = f; } else atual += f; }
  if (atual.trim()) blocos.push(atual);
  let base = 0;
  blocos.forEach((b, k) => {
    const u = new SpeechSynthesisUtterance(b.trim());
    const ini = base; base += b.length;
    u.onboundary = (e) => rostoAberto()?.posicao(ini + (e.charIndex || 0));
    u.voice = voz; u.lang = 'pt-BR'; u.rate = 1; u.pitch = voz && /antonio|daniel|ptd|male|masculin/i.test(voz.name) ? 1 : 0.85;
    if (k === 0) u.onstart = () => holoEstado('falando');
    if (k === blocos.length - 1) u.onend = u.onerror = () => { holoEstado(null); rostoAberto()?.calar(); };
    speechSynthesis.speak(u);
  });
}
function pararFala() { FALA_GERACAO++; try { speechSynthesis.cancel(); } catch {} if (AUDIO) { AUDIO.pause(); AUDIO = null; } holoEstado(null); rostoAberto()?.calar(); }

// ───────── voz: ouvir o Comandante, o rosto em tela cheia e o cumprimento diário ─────────
const VOZ = { aguardando: null, prop: null, ouvindo: null };
function estadoHumor() {
  const t = S?.totais || {}, base = (t.patrimonio || 0) - (t.resultado_dia || 0);
  return { variacao_pct: base ? (t.resultado_dia || 0) / base * 100 : 0, alertas: (S?.alertas || []).length };
}
function abrirRostoManuel() {
  const av = avatarConsole(); if (av?.ativo) { ESCUTA?.pausar(); av.humor(estadoHumor()); return av; }
  ESCUTA?.pausar();
  const t = S?.totais || {}, agora = new Date().toLocaleTimeString('pt-BR');
  const telemetria = [`T ${agora} :: SYS.MANUEL ONLINE`, `PATRIMONIO ${brl(t.patrimonio)}`, `CAIXA ${brl(t.caixa)} :: RENDA/MES ${brl(t.renda_mes_estimada)}`, `RESULTADO.DIA ${brl(t.resultado_dia)}`,
    ...(S?.posicoes || []).map(p => `${p.ticker} ${nf(p.preco)} ${p.var_dia >= 0 ? '+' : ''}${nf(p.var_dia ?? 0)}% :: ${String(p.zona || '').toUpperCase()} :: Q${p.qtd}`)];
  return abrirRosto({ estado: estadoHumor(), telemetria, aoFechar: () => { pararFala(); VOZ.ouvindo?.parar(); VOZ.ouvindo = null; clearTimeout(VOZ.ocioso); setTimeout(retomarEscuta, 600); }, aoMicrofone: podeOuvir() ? (b) => ligarMic(b) : null, aoToque: tocarAvatar });
}
const ehLongo = (t) => String(t || '').length > 420;
async function processarFala(falado) {
  const r = rostoAberto() ?? abrirRostoManuel();
  if (!falado) { r.ouvindo(false); r.legenda('Não ouvi nada, Comandante. Segure o botão e fale.'); return; }
  r.ouvindo(false); r.legenda('“' + falado + '”');
  const a = interpretar(falado, { pendente: !!VOZ.prop, aguardando: VOZ.aguardando });
  if (a.tipo === 'nada') return;
  if (a.tipo === 'parar') { pararFala(); r.fechar(); return; }
  if (a.tipo === 'limpar') { limparConversa(); falar('Conversa limpa, Comandante.', null, { tela: true }); return; }
  if (a.tipo === 'perguntar') { VOZ.aguardando = a.aguardar; falar(a.fala, null, { tela: true }); if (ESCUTA && (a.aguardar || a.fala.startsWith('Às suas ordens'))) ouvirDepoisDeFalar(); return; }
  if (a.tipo === 'confirmar' || a.tipo === 'recusar') {
    const p = VOZ.prop; VOZ.prop = null;
    try {
      const res = await api(`/api/manuel/propostas/${p.id}/${a.tipo === 'confirmar' ? 'confirmar' : 'recusar'}`, { method: 'POST', body: {} });
      rostoAberto()?.gesto?.(res.status === 'confirmada' ? 'sim' : 'nao');
      falar(res.status === 'confirmada' ? 'Gravado no razão, Comandante.' : 'Proposta descartada.', null, { tela: true });
      if (res.status === 'confirmada') { await load().catch(() => {}); }
      atualizarConsole();
    } catch (e) { falar('Não consegui concluir: ' + e.message, null, { tela: true }); }
    return;
  }
  VOZ.aguardando = null; r.pensar(); holoEstado('pensando');
  try {
    const res = await api('/api/manuel/mensagem', { method: 'POST', body: { texto: a.texto } });
    const pend = (res.propostas || []).find(p => p.status === 'pendente');
    if (pend) { VOZ.prop = pend; falar(lerProposta(pend, brl), null, { tela: true }); r.legenda(lerProposta(pend, brl)); if (ESCUTA) ouvirDepoisDeFalar(); }
    else { falar(ehLongo(res.texto) ? res.texto.slice(0, 900) : res.texto, null, { tela: true }); r.legenda(res.texto); }
    atualizarConsole();
  } catch (e) { holoEstado(null); falar('Falha: ' + e.message, null, { tela: true }); }
}
/** Conversa por voz sem tocar: quando o Manuel termina a pergunta, abre o microfone de novo uma vez. */
function ouvirDepoisDeFalar() {
  const esperar = () => {
    const falando = (AUDIO && !AUDIO.paused) || (('speechSynthesis' in window) && speechSynthesis.speaking);
    if (falando) return setTimeout(esperar, 250);
    if (!rostoAberto() || VOZ.ouvindo) return;
    setTimeout(async () => {
      const r = rostoAberto(); if (!r) return;
      r.ouvindo(true, '');
      const s = ouvir({ api, auto: true, aoParcial: (t) => rostoAberto()?.ouvindo(true, t) }); VOZ.ouvindo = s;
      try { const t = await s.texto; VOZ.ouvindo = null; if (t) await processarFala(t); else rostoAberto()?.ouvindo(false); }
      catch { VOZ.ouvindo = null; rostoAberto()?.ouvindo(false); }
      fecharSeOcioso();
    }, 350);
  };
  setTimeout(esperar, 600);
}
function atualizarConsole() { if ((location.hash.slice(2) || '').split('?')[0] === 'manuel') manuel().catch(() => {}); }

/** Liga um botão de "segure para falar" (toque curto: ouve até 8 s ou até tocar de novo). */
function ligarMic(btn) {
  if (!btn || btn._insaMic) return; btn._insaMic = true;
  let inicio = 0, sessao = null, curto = false, tempo = 0;
  const comecar = async () => {
    if (sessao) return;
    pararFala();
    await ESCUTA?.pausar();
    const r = rostoAberto() ?? abrirRostoManuel();
    r.ouvindo(true, '');
    btn.classList.add('ativo'); navigator.vibrate?.(10);
    sessao = ouvir({ api, aoParcial: (t) => rostoAberto()?.ouvindo(true, t) });
    VOZ.ouvindo = sessao;
    const s = sessao;
    s.texto.then((t) => { if (s === sessao) terminar(); processarFala(t); })
      .catch((e) => { if (s === sessao) terminar(); erroOuvir(e); });
  };
  const terminar = () => { clearTimeout(tempo); btn.classList.remove('ativo'); sessao = null; VOZ.ouvindo = null; };
  const parar = () => { const s = sessao; if (s) s.parar(); };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (sessao && curto) { curto = false; parar(); return; }
    inicio = performance.now(); comecar();
    try { btn.setPointerCapture(e.pointerId); } catch {}
  });
  const soltar = (e) => {
    e?.stopPropagation?.();
    if (!sessao) return;
    if (performance.now() - inicio < 300) { curto = true; clearTimeout(tempo); tempo = setTimeout(() => { curto = false; parar(); }, 8000); return; }
    parar();
  };
  btn.addEventListener('pointerup', soltar); btn.addEventListener('pointercancel', soltar);
  btn.addEventListener('click', (e) => e.stopPropagation());
}

// ───────── "Hey Manuel": escuta contínua no aparelho (opcional) ─────────
let ESCUTA = null;
function indicadorEscuta(estado, extra) {
  const el = document.getElementById('escuta-ind'); if (!el) return;
  el.hidden = !ESCUTA;
  el.dataset.estado = estado;
  el.querySelector('span').textContent = { ouvindo: 'ouvindo "Manuel"', pausada: 'escuta pausada', baixando: 'baixando voz…', carregando: 'iniciando escuta…', erro: 'escuta com erro' }[estado] || estado;
  el.title = estado === 'erro' ? String(extra || '') : 'Toque para desligar a escuta';
}
function ligarEscutaSePreciso() {
  if (ESCUTA || !pref('escuta', false) || !(navigator.mediaDevices?.getUserMedia)) return;
  garantirMicrofone().catch(() => avisoMicrofone());   // Android: pede o microfone antes de a escuta abrir o áudio
  ESCUTA = ligarEscuta({
    aoEstado: (e, x) => { indicadorEscuta(e, x); if (e === 'erro') { if (/permiss/i.test(x)) avisoMicrofone(); else toast('Escuta "Hey Manuel": ' + x, 6000); } },
    aoChamar: () => atenderChamada(),
  });
}
function desligarEscuta() { ESCUTA?.desligar(); ESCUTA = null; indicadorEscuta('pausada'); }
function retomarEscuta() { const r = rostoAberto(); if (ESCUTA && (!r || r.embutido) && !VOZ.ouvindo && document.visibilityState === 'visible') ESCUTA.retomar(); }
function bip() {
  try { const c = new (window.AudioContext || window.webkitAudioContext)(); const o = c.createOscillator(), g = c.createGain();
    o.frequency.value = 880; o.frequency.setValueAtTime(1320, c.currentTime + 0.08); g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, c.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.22);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.25); setTimeout(() => c.close(), 400); } catch {}
}
/* Microfone bloqueado: explica e oferece o atalho para a tela de permissões do Android */
function erroOuvir(e) {
  const msg = e?.message || 'Falha ao ouvir.';
  rostoAberto()?.ouvindo(false); rostoAberto()?.legenda(msg);
  if (e?.codigo === 'mic-bloqueado' || /permiss/i.test(msg)) avisoMicrofone();
}
function avisoMicrofone() {
  if (document.getElementById('aviso-mic')) return;
  const d = document.createElement('div');
  d.id = 'aviso-mic'; d.className = 'aviso-mic'; d.setAttribute('role', 'alertdialog');
  d.innerHTML = `<b>Microfone sem permissão</b><span>O Manuel precisa do microfone para ouvir. ${window.Capacitor?.Plugins?.Permissoes ? 'Abra as permissões do app e ligue <b>Microfone</b>; depois volte e toque de novo.' : 'Permita o microfone nas configurações do navegador ou do Windows.'}</span>
    <div>${window.Capacitor?.Plugins?.Permissoes ? '<button type="button" class="btn" id="am-abrir">Abrir permissões</button>' : ''}<button type="button" class="btn ghost" id="am-x">Agora não</button></div>`;
  document.body.appendChild(d);
  d.querySelector('#am-abrir')?.addEventListener('click', () => { abrirAjustesApp(); d.remove(); });
  d.querySelector('#am-x').addEventListener('click', () => d.remove());
}
async function atenderChamada() {
  await ESCUTA?.pausar();
  pararFala(); bip(); navigator.vibrate?.(15);
  const r = rostoAberto() ?? abrirRostoManuel();
  r.ouvindo(true, 'Às ordens, Comandante.');
  const s = ouvir({ api, auto: true, aoParcial: (t) => rostoAberto()?.ouvindo(true, t) });
  VOZ.ouvindo = s;
  try { const t = await s.texto; VOZ.ouvindo = null; await processarFala(t); }
  catch (e) { VOZ.ouvindo = null; erroOuvir(e); }
  fecharSeOcioso();
}
/** Aberto pela escuta: fecha sozinho 15 s depois de terminar de falar, se ninguém mexer. */
function fecharSeOcioso() {
  clearTimeout(VOZ.ocioso);
  const checar = () => {
    const r = rostoAberto(); if (!r) return;
    if (r.embutido) { const ocupado = (AUDIO && !AUDIO.paused) || (('speechSynthesis' in window) && speechSynthesis.speaking) || VOZ.ouvindo || VOZ.aguardando || VOZ.prop; if (ocupado) VOZ.ocioso = setTimeout(checar, 3000); else retomarEscuta(); return; }
    const falando = (AUDIO && !AUDIO.paused) || (('speechSynthesis' in window) && speechSynthesis.speaking) || VOZ.ouvindo;
    if (falando || VOZ.aguardando || VOZ.prop) { VOZ.ocioso = setTimeout(checar, 3000); return; }
    r.fechar();
  };
  VOZ.ocioso = setTimeout(checar, 15000);
}
document.addEventListener('visibilitychange', () => { if (!ESCUTA) return; if (document.hidden) ESCUTA.pausar(); else retomarEscuta(); });

const MOTIVACAO = [
  'Cada cota comprada hoje é um soldado que trabalha para o Senhor todos os meses.',
  'Disciplina vence o humor do mercado. O plano segue firme.',
  'Os juros compostos são lentos no início e implacáveis no fim. Continue alimentando a máquina.',
  'Dia de queda é dia de preço melhor para quem pensa em décadas.',
  'A renda passiva se constrói em silêncio, aporte após aporte.',
  'Quem reinveste os proventos não espera o futuro: fabrica o futuro.',
  'Constância é a vantagem que nenhum mercado tira do Senhor.',
  'O exército cresce um pelotão de cada vez. Hoje é mais um passo.',
  'Paciência não é esperar. É manter o plano enquanto o tempo trabalha.',
  'Pequenos aportes, repetidos sem falhar, viram grandes rendas.',
  'O mercado oscila; a estratégia, não. Seguimos na rota.',
  'Cada provento reinvestido é uma bola de neve ganhando massa.',
];
/* Terminal deslizante: um ponto âmbar no topo de toda tela; toque ou puxe para baixo e o Manuel desce em tela cheia */
let PUXA = null;
function puxaManuel(rotaAtual) {
  if (!PUXA) {
    PUXA = document.createElement('button');
    PUXA.type = 'button'; PUXA.className = 'puxa-manuel'; PUXA.setAttribute('aria-label', 'Abrir o M.A.N.U.E.L.');
    PUXA.innerHTML = '<span class="puxa-ponto" aria-hidden="true"></span><span class="puxa-nome">M.A.N.U.E.L.</span>';
    document.body.appendChild(PUXA);
    addEventListener('resize', () => { PUXA.style.top = (document.getElementById('hudtop')?.offsetHeight || 0) + 'px'; });
    PUXA.addEventListener('click', abrirTerminal);
    // puxar para baixo: na aba ou na barra do topo
    let y0 = null;
    const ini = (e) => { y0 = e.touches[0].clientY; };
    const mov = (e) => { if (y0 != null && e.touches[0].clientY - y0 > 45) { y0 = null; abrirTerminal(); } };
    const fim = () => { y0 = null; };
    for (const alvo of [PUXA, document.getElementById('hudtop')]) {
      alvo?.addEventListener('touchstart', ini, { passive: true }); alvo?.addEventListener('touchmove', mov, { passive: true }); alvo?.addEventListener('touchend', fim);
    }
  }
  PUXA.style.top = (document.getElementById('hudtop')?.offsetHeight || 0) + 'px';   // pendurada logo abaixo da barra do topo
  PUXA.hidden = rotaAtual === 'manuel' || !pref('rosto');   // no console o Manuel já está na tela
}
async function abrirTerminal() {
  if (rostoAberto() && !avatarConsole()?.ativo) return;
  const r = abrirRostoManuel();
  navigator.vibrate?.(12);
  if (mostrarAvisos(r)) return;
  if (VOZ.ultimaFala) { r.legenda(VOZ.ultimaFala); return; }
  r.legenda('Às suas ordens, Comandante.');
  try {   // sem fala recente: mostra a leitura do dia (sem falar; o Comandante segura o botão se quiser)
    const sd = await api('/api/manuel/saudacao');
    const leitura = String(sd.texto || '').replace(/^Senhor,?\s*/i, '').split('\n').filter(Boolean).slice(0, 3).join(' ');
    r.humor({ variacao_pct: sd.variacao_pct, alertas: sd.alertas });
    if (leitura && rostoAberto() === r) r.legenda(leitura[0].toUpperCase() + leitura.slice(1));
  } catch { /* fica a saudação curta */ }
}

/* ───── 6 · toques no avatar ───── */
function tocarAvatar(tipo) {
  if (tipo === 'duplo') { pararFala(); saudacaoDiaria(true); return; }
  const r = rostoAberto(); if (!r) return;
  if (FALA_ATIVA()) { pararFala(); r.legenda('Às ordens, Comandante.'); return; }   // tocar enquanto ele fala = calar
  if (AVISOS.length) { mostrarAvisos(r); return; }
  if (podeOuvir()) { atenderChamada(); return; }
  r.legenda('Às ordens, Comandante. Escreva abaixo ou toque duas vezes para a leitura do dia.');
}
const FALA_ATIVA = () => !!AUDIO || (('speechSynthesis' in window) && speechSynthesis.speaking);

/* ───── 7 · dados holográficos: o que ele cita aparece ao redor do rosto ───── */
function dadosDaFala(texto) {
  const t = String(texto || ''), out = [], tot = S?.totais || {};
  for (const p of S?.posicoes || []) {
    if (!new RegExp('\\b' + p.ticker + '\\b', 'i').test(t)) continue;
    const v = p.var_dia ?? 0;
    out.push({ rotulo: p.ticker, valor: brl(p.preco), extra: `${v > 0 ? '+' : ''}${nf(v)}% · ${p.qtd} cotas`, sinal: Math.sign(v) });
  }
  if (/patrim[oô]nio/i.test(t) && tot.patrimonio != null) out.unshift({ rotulo: 'Patrimônio', valor: brl(tot.patrimonio), extra: `dia ${tot.resultado_dia > 0 ? '+' : ''}${brl(tot.resultado_dia)}`, sinal: Math.sign(tot.resultado_dia || 0) });
  if (/\bcaixa\b/i.test(t) && tot.caixa != null) out.push({ rotulo: 'Caixa', valor: brl(tot.caixa) });
  if (/\brenda\b|provent/i.test(t) && tot.renda_mes_estimada != null) out.push({ rotulo: 'Renda/mês', valor: brl(tot.renda_mes_estimada), sinal: 1 });
  return out.slice(0, 4);
}

/* ───── 8 · avisos proativos: o Manuel nota sozinho e acende a aba (sem falar sem ser chamado) ───── */
let AVISOS = [];
const chaveAvisos = () => 'insa.avisos.' + hoje();
function vigiar(live = null) {
  if (!S || offline) return;
  let vistos = []; try { vistos = JSON.parse(localStorage.getItem(chaveAvisos()) || '[]'); } catch {}
  const novos = [];
  for (const a of S.alertas || []) if (a.nivel === 'critico') novos.push({ id: 'al:' + a.texto, texto: a.texto, sinal: -1 });
  const vars = new Map((live?.ativos || []).map(a => [a.ticker, a.var]));
  for (const p of S.posicoes || []) {
    const v = vars.get(p.ticker) ?? p.var_dia; if (v == null || Math.abs(v) < 3) continue;
    const forte = Math.abs(v) >= 5 ? 5 : 3;
    novos.push({ id: `mv:${p.ticker}:${Math.sign(v)}${forte}`, ticker: p.ticker, sinal: Math.sign(v),
      texto: `${p.ticker} ${v > 0 ? 'sobe' : 'cai'} ${nf(Math.abs(v))}% hoje, a ${brl(p.preco)}.${v < 0 && p.zona === 'ataque' ? ' Está em zona de ataque.' : ''}` });
  }
  const antes = AVISOS.length;
  AVISOS = novos.filter(n => !vistos.includes(n.id));
  PUXA?.classList.toggle('aviso', AVISOS.length > 0);
  if (PUXA) PUXA.dataset.n = AVISOS.length || '';
  if (AVISOS.length > antes) {
    const av = avatarConsole();
    if (av?.ativo) { av.humor({ ...estadoHumor(), alertas: AVISOS.length }); av.gesto('duvida'); }
    toast(`M.A.N.U.E.L.: ${AVISOS.length === 1 ? 'um aviso' : AVISOS.length + ' avisos'}. ${av?.ativo ? 'Toque no rosto dele.' : 'Toque no ponto do topo.'}`, 5000);
  }
}
function mostrarAvisos(r) {
  if (!AVISOS.length) return false;
  const txt = 'Comandante, ' + (AVISOS.length === 1 ? 'um aviso: ' : AVISOS.length + ' avisos. ') + AVISOS.map(a => a.texto).join(' ');
  r.humor({ ...estadoHumor(), alertas: AVISOS.length }); r.gesto?.('duvida');
  const tks = new Set(AVISOS.map(a => a.ticker).filter(Boolean));
  try { const vistos = JSON.parse(localStorage.getItem(chaveAvisos()) || '[]'); localStorage.setItem(chaveAvisos(), JSON.stringify([...vistos, ...AVISOS.map(a => a.id)])); } catch {}
  AVISOS = []; PUXA?.classList.remove('aviso'); if (PUXA) PUXA.dataset.n = '';
  falar(txt, null, { tela: true }); r.legenda(txt);
  setTimeout(() => r.dados?.((S?.posicoes || []).filter(p => tks.has(p.ticker)).map(p => ({ rotulo: p.ticker, valor: brl(p.preco), extra: `${p.var_dia > 0 ? '+' : ''}${nf(p.var_dia ?? 0)}%`, sinal: Math.sign(p.var_dia || 0) }))), 50);
  return true;
}
// vigia leve: a cada 10 min com o app visível, olha o mercado (o servidor já guarda as cotações em cache)
setInterval(async () => {
  if (document.visibilityState !== 'visible' || !S || offline || curView() === 'radar') return;
  try { vigiar(await api('/api/market/live')); } catch { /* sem mercado agora */ }
}, 600000);
async function saudacaoDiaria(forcar = false) {
  if (!forcar && (!pref('saudacao') || localStorage.getItem('insa.saudacao.dia') === hoje())) return;
  try { localStorage.setItem('insa.saudacao.dia', hoje()); } catch {}
  try {
    if (!CONV) CONV = await api('/api/manuel/conversa').catch(() => null);
    const sd = await api('/api/manuel/saudacao');
    const h = new Date().getHours();
    const oi = h < 12 ? 'Bom dia' : h < 19 ? 'Boa tarde' : 'Boa noite';
    const leitura = String(sd.texto || '').replace(/^Senhor,?\s*/i, '').split('\n').filter(Boolean).slice(0, 3).join(' ');
    const dia = Math.floor(Date.now() / 86400000);
    const msg = `${oi}, Comandante. ${leitura} ${MOTIVACAO[dia % MOTIVACAO.length]}`;
    if (!pref('rosto')) { falar(msg); return; }
    const r = abrirRostoManuel(); r.humor({ variacao_pct: sd.variacao_pct, alertas: sd.alertas });
    falar(msg, null, { tela: true }); r.legenda(msg);
  } catch { /* sem saudação hoje: não atrapalha o app */ }
}
function limparConversa() {
  const th = document.getElementById('thread');
  const antes = th?.innerHTML;
  if (th) th.innerHTML = '<div class="empty"><p>Conversa limpa.</p></div>';
  document.querySelector('.desfazer')?.remove();
  const bar = document.createElement('div'); bar.className = 'desfazer';
  bar.innerHTML = '<span>Conversa limpa</span><button type="button">Desfazer</button>';
  document.body.appendChild(bar);
  let desfeito = false;
  bar.querySelector('button').onclick = () => { desfeito = true; bar.remove(); if (th && document.body.contains(th)) th.innerHTML = antes; };
  setTimeout(async () => {
    bar.remove(); if (desfeito) return;
    try { await api('/api/manuel/limpar', { method: 'POST', body: {} }); if (CONV) CONV.mensagens = []; } catch (e) { toast(e.message); if (th && document.body.contains(th)) th.innerHTML = antes; }
  }, 5000);
}

async function manuel() {
  CONV = await api('/api/manuel/conversa');
  const c = CONV, semChave = !c.chaves.claude && !c.chaves.gemini;
  const ativo = c.config.provedor === 'gemini' ? (c.chaves.gemini ? 'Gemini' : 'Claude') : (c.chaves.claude ? 'Claude' : 'Gemini');
  frame('manuel', `<div class="eyebrow">M.A.N.U.E.L. / Console</div>
    ${pref('rosto') ? `<h1 class="sr">M.A.N.U.E.L., às ordens</h1><div class="avatar-console" id="avatar-host"></div>`
      : `<div class="presenca"><div>${HOLO}</div><div><h1 style="margin-bottom:4px">Às ordens, Senhor.</h1>
      <div class="estado-ia" id="estado">Em prontidão</div>
      <p class="faint" style="margin:6px 0 0">Oficial de inteligência da carteira. Analisa, simula e pesquisa; lançamentos só com a sua confirmação.</p></div></div>`}
    ${semChave ? `<div class="banner">Nenhuma chave de IA configurada: só as respostas locais funcionam. <a href="#/ajustes">Cadastre a do Claude e/ou a do Gemini em Ajustes → Inteligência.</a></div>` : ''}
    <div class="livebar">
      <span class="chip ${semChave ? '' : 'open'}"><i class="dot ${semChave ? '' : 'on'}"></i>${semChave ? 'sem IA' : ativo + (c.chaves.claude && c.chaves.gemini ? ' + reserva' : '')}</span>
      <span class="faint">pesquisa: ${c.chaves.gemini ? 'Gemini + Google Search' : 'indisponível (sem chave Gemini)'}</span>
      <span class="faint">hoje: ${c.uso.locais || 0} locais (0 tokens) · IA ${c.uso.chamadas}/${c.config.limite_diario} · ${((c.uso.entrada + c.uso.saida) / 1000).toFixed(1)}k/${Math.round((c.config.limite_tokens || 150000) / 1000)}k tokens</span>
      <span class="faint" style="margin-left:auto">voz: ${esc({ windows: 'do aparelho', gemini: 'J.A.R.V.I.S. · ' + (c.config.voz_nome || 'Charon'), desligada: 'desligada' }[c.config.voz_motor])}</span>
      <button class="btn ghost sm" id="parar">Parar voz</button><button class="btn ghost sm" id="limpar">Limpar conversa</button>
    </div>
    <div class="console">
      <div id="thread" class="thread" aria-live="polite">${c.mensagens.length ? c.mensagens.map(bolha).join('') : `<div class="empty"><p>Pergunte sobre a carteira, peça uma simulação ou informe uma operação. Tudo o que for gravado passa pela sua confirmação.</p></div>`}</div>
      <div class="atalhos">${['Leitura do dia', 'Onde aplico R$ 500?', 'Zona de ataque', 'Magic Number', 'Quando chego no próximo marco?', 'Renda do mês', 'ia: notícias e proventos anunciados do BTLG11'].map(a => `<button class="chipbtn" data-atalho="${esc(a)}">${esc(a)}</button>`).join('')}</div>
      <form id="cf" class="composer"><label class="sr" for="ct">Mensagem</label>
        <textarea id="ct" name="t" rows="2" maxlength="4000" placeholder="Ex.: comprei 3 BTLG11 a 97,80 · onde aplico R$ 500? · ia: pergunta aberta"></textarea>
        ${podeOuvir() ? '<button type="button" class="mic" id="micc" aria-label="Segure para falar com o Manuel" title="Segure para falar">🎙</button>' : ''}<button class="btn">Enviar</button></form>
      <p class="faint">Perguntas de dado puro (leitura, zona, Magic Number, marcos, renda, um ativo) o próprio app responde na hora, 0 tokens. O resto — opinião, sugestão, cenário, bate-papo — já vai para a IA sozinho; o prefixo <b>ia:</b> só força a IA mesmo quando a pergunta parece simples.</p>
      <p class="faint">M.A.N.U.E.L. analisa e organiza; não envia ordens nem é recomendação de investimento. Lançamentos só entram no razão com o seu clique.</p>
    </div>`);
  const th = document.getElementById('thread');
  const f = document.getElementById('cf'), ta = f.t;
  // a conversa ocupa o espaço que sobrar, para a caixa de mensagem ficar sempre visível
  const ajustar = () => { if (!document.body.contains(th)) return removeEventListener('resize', ajustar);
    const tabs = document.querySelector('nav.tabs'); const reserva = 12 + (tabs && getComputedStyle(tabs).display !== 'none' ? tabs.offsetHeight : 0);
    const sobra = innerHeight - f.getBoundingClientRect().bottom - reserva + th.clientHeight;
    const min = innerHeight < 500 ? 140 : 220;
    th.style.maxHeight = Math.max(min, sobra) + 'px'; th.style.minHeight = Math.min(300, Math.max(min, sobra)) + 'px'; };
  // avatar vivo no topo do console
  const hostAv = document.getElementById('avatar-host');
  const av = hostAv ? abrirRosto({ host: hostAv, estado: estadoHumor(), aoToque: tocarAvatar }) : null;
  av?.enquadrar('busto');
  if (hostAv) hostAv.style.setProperty('--topo', (document.getElementById('hudtop')?.offsetHeight || 0) + 'px');
  const compactar = (sim) => { if (!av || hostAv.classList.contains('compacto') === sim) return; hostAv.classList.toggle('compacto', sim); av.enquadrar(sim ? 'rosto' : 'busto'); setTimeout(ajustar, 380); };
  th.addEventListener('scroll', () => compactar(document.activeElement === ta || th.scrollHeight - th.scrollTop - th.clientHeight > 60));
  ta.addEventListener('focus', () => { compactar(true); av?.olharPara(ta, 2500); });
  ta.addEventListener('blur', () => setTimeout(() => compactar(th.scrollHeight - th.scrollTop - th.clientHeight > 60), 150));
  ta.addEventListener('input', () => av?.olharPara(ta, 1800));
  ajustar(); addEventListener('resize', ajustar);
  th.scrollTop = th.scrollHeight;
  const enviar = async (texto) => {
    texto = texto.trim(); if (!texto) return;
    const b = f.querySelector('button'); b.disabled = true; ta.value = '';
    th.querySelector('.empty')?.remove();
    th.insertAdjacentHTML('beforeend', bolha({ papel: 'usuario', texto }) + `<div class="msg ele pensando" id="pens"><div class="avatar">${EMBLEM}</div><div class="balao"><span class="dots"><i></i><i></i><i></i></span> analisando a carteira…</div></div>`);
    th.scrollTop = th.scrollHeight; holoEstado('pensando'); av?.pensar(true);
    try {
      const r = await api('/api/manuel/mensagem', { method: 'POST', body: { texto } });
      av?.pensar(false);
      const ferr = r.meta?.ferramentas?.[0]?.ferramenta;
      if (['ajuda_lancamento', 'requer_ia'].includes(ferr)) av?.gesto('duvida');
      CONV.propostas = (CONV.propostas || []).concat(r.propostas || []);
      CONV.mensagens.push({ papel: 'usuario', texto }, { papel: 'manuel', texto: r.texto, meta: r.meta });
      CONV.uso.chamadas++;
      document.getElementById('pens')?.remove();
      th.insertAdjacentHTML('beforeend', bolha({ papel: 'manuel', texto: r.texto, meta: r.meta }));
      th.scrollTop = th.scrollHeight; holoEstado(null);
      if (CONV.config.fala_auto) falar(r.texto); else av?.olharPara(th.lastElementChild, 1800);
    } catch (e) {
      document.getElementById('pens')?.remove(); holoEstado(null); av?.pensar(false); av?.gesto('nao');
      th.insertAdjacentHTML('beforeend', `<div class="alert atencao"><div>${md(e.message)}</div></div>`);
      th.scrollTop = th.scrollHeight;
      ta.value = texto;
    }
    b.disabled = false; ta.focus();
  };
  f.onsubmit = (e) => { e.preventDefault(); enviar(ta.value); };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(ta.value); } });
  document.querySelectorAll('[data-atalho]').forEach(b => b.onclick = () => enviar(b.dataset.atalho));
  document.getElementById('parar').onclick = pararFala;
  document.getElementById('limpar').onclick = () => limparConversa();
  ligarMic(document.getElementById('micc'));
  th.addEventListener('click', async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.falar !== undefined) { const balao = t.closest('.balao'); falar(balao.innerText.replace(/🔊 ouvir[\s\S]*$/, ''), t, { tela: true }); return; }
    const id = t.dataset.conf || t.dataset.rec; if (!id) return;
    t.disabled = true;
    try {
      const r = await api(`/api/manuel/propostas/${id}/${t.dataset.conf ? 'confirmar' : 'recusar'}`, { method: 'POST', body: {} });
      const p = CONV.propostas.find(x => String(x.id) === id); if (p) p.status = r.status;
      t.closest('.proposta').outerHTML = cartaoProposta(p);
      toast(r.status === 'confirmada' ? 'Lançamento gravado no razão.' : 'Proposta recusada.');
      avatarConsole()?.gesto(r.status === 'confirmada' ? 'sim' : 'nao');
      if (r.status === 'confirmada') load().catch(() => {});
    } catch (err) { toast(err.message, 6000); t.disabled = false; }
  });
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  if (!av && matchMedia('(pointer: fine)').matches) ta.focus();   // com o avatar, o teclado só abre quando o Comandante tocar
}

// ───────── dados e rotas ─────────
async function load() {
  try { S = await api('/api/state'); offline = false; cacheSet(S); setTimeout(() => { rostoAberto()?.humor(estadoHumor()); vigiar(); }, 0); }
  catch (e) {
    if (e.message === 'Sessão expirada.') throw e;
    const c = cacheGet(); if (!c) throw e; S = c; offline = true;
  }
}
async function route(view) {
  if (view === 'gate') { history.replaceState(null, '', '#/'); return gate(); }
  // rota pedida explicitamente vence a do endereço (ex.: voltar ao cockpit depois de gravar)
  const alvo = (typeof view === 'string' && view) || location.hash.slice(2) || 'cockpit';
  const [name, q] = alvo.split('?');
  const v = ['cockpit', 'manuel', 'radar', 'posicoes', 'registrar', 'estrategia', 'razao', 'plano', 'ajustes', 'migracao'].includes(name) ? name : 'cockpit';
  const hash = `#/${v}${q && v === name ? '?' + q : ''}`;
  if (hash !== location.hash) history.replaceState(null, '', hash);
  try {
    if (!S) await load();
    await ({ cockpit, manuel, radar, posicoes, registrar: () => registrar(new URLSearchParams(q || '')), estrategia, razao, plano, ajustes, migracao })[v]();
    window.scrollTo(0, 0);
    if (!SAUDOU && !offline) { SAUDOU = true; setTimeout(() => saudacaoDiaria(), 700); }
    ligarEscutaSePreciso();
    puxaManuel(v);
  } catch (e) { if (e.message !== 'Sessão expirada.') $app.innerHTML = `<div class="gate"><div class="card"><h2>Falha ao carregar</h2><p class="muted">${esc(e.message)}</p><div class="actions" style="justify-content:center"><button class="btn" id="retry">Tentar de novo</button></div></div></div>`; document.getElementById('retry')?.addEventListener('click', () => location.reload()); }
}
window.addEventListener('hashchange', () => { if (S || offline) route(); });
// Atualiza o estado a cada 2 min com o app aberto e visível (cotações chegam pelo cron)
setInterval(async () => { if (S && document.visibilityState === 'visible') { const v = (location.hash.slice(2) || 'cockpit').split('?')[0]; if (['registrar', 'radar', 'migracao', 'manuel'].includes(v)) return; try { await load(); if (['cockpit', 'posicoes'].includes(v)) route(); } catch {} } }, 120000);
if (!DESK && !SHELL && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
if (SHELL) {
  SHELL.updateStatus().then(s => { UPD = s; });
  SHELL.onUpdate((s) => { const antes = UPD?.estado; UPD = s; if (s.estado === 'pronta' && antes !== 'pronta' && S) { toast(s.texto, 6000); route(); } });
  SHELL.onVisivel?.((v) => document.documentElement.classList.toggle('pausado', !v));
}
if (DESK) {
  DESK.onVisivel?.((v) => document.documentElement.classList.toggle('pausado', !v));
  DESK.updateStatus().then(s => { UPD = s; });
  DESK.onUpdate((s) => {
    const antes = UPD?.estado; UPD = s;
    const tx = document.getElementById('updtx'); if (tx) tx.textContent = s.texto || '';
    if (s.estado === 'pronta' && antes !== 'pronta' && S) { toast(s.texto, 6000); route(); }
  });
}
gate();
