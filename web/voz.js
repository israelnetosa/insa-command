// Ouvir o Comandante e entender comandos de voz.
// Caminhos para transcrever, do melhor ao reserva:
//   1. Android (app instalado): reconhecedor nativo do telemóvel, grátis e em português.
//   2. Navegador Chrome (fora do Electron): reconhecimento de voz do próprio navegador.
//   3. Windows (Electron) e reserva geral: grava até 30 s e o Gemini transcreve (conta no uso de IA).
// Nada é gravado no razão por voz sem a confirmação: comandos de lançamento viram proposta,
// o Manuel repete o valor e só "confirmo" (ou o botão) grava.

const nativo = () => window.Capacitor?.Plugins?.SpeechRecognition ?? null;
const ehElectron = /electron/i.test(navigator.userAgent);
const webSR = () => (!ehElectron && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;

export function podeOuvir() {
  return !!(nativo() || webSR() || (navigator.mediaDevices?.getUserMedia && window.MediaRecorder));
}

/**
 * Começa a ouvir. Devolve um controle: `parar()` encerra (soltar o botão) e `texto` é uma Promise
 * com a transcrição. `aoParcial(t)` recebe o texto parcial quando o motor oferece.
 */
export function ouvir({ aoParcial, api } = {}) {
  const sr = nativo();
  if (sr) return ouvirNativo(sr, aoParcial);
  const W = webSR();
  if (W) return ouvirWeb(W, aoParcial);
  return ouvirGravando(api);
}

function ouvirNativo(sr, aoParcial) {
  let resolver, rejeitar, ultimo = '';
  const texto = new Promise((ok, erro) => { resolver = ok; rejeitar = erro; });
  let ouvinte = null;
  (async () => {
    try {
      const perm = await sr.checkPermissions().catch(() => ({ speechRecognition: 'prompt' }));
      if (perm.speechRecognition !== 'granted') {
        const p = await sr.requestPermissions();
        if (p.speechRecognition !== 'granted') throw new Error('Sem permissão de microfone. Libere em Configurações → Apps → INSA Command → Permissões.');
      }
      ouvinte = await sr.addListener?.('partialResults', (d) => { ultimo = d.matches?.[0] ?? ultimo; aoParcial?.(ultimo); });
      const r = await sr.start({ language: 'pt-BR', maxResults: 1, partialResults: true, popup: false });
      if (r?.matches?.length) ultimo = r.matches[0];
    } catch (e) { rejeitar(e); }
  })();
  return {
    texto,
    async parar() {
      try { await sr.stop(); } catch {}
      setTimeout(() => { try { ouvinte?.remove?.(); } catch {} resolver(ultimo.trim()); }, 350);
    },
  };
}

function ouvirWeb(W, aoParcial) {
  const rec = new W(); rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = true; rec.maxAlternatives = 1;
  let final = '', parcial = '', resolver, rejeitar, acabou = false;
  const texto = new Promise((ok, erro) => { resolver = ok; rejeitar = erro; });
  rec.onresult = (e) => {
    parcial = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript + ' '; else parcial += e.results[i][0].transcript;
    }
    aoParcial?.((final + parcial).trim());
  };
  rec.onerror = (e) => { if (!acabou && e.error !== 'no-speech' && e.error !== 'aborted') { acabou = true; rejeitar(new Error(e.error === 'not-allowed' ? 'Sem permissão de microfone.' : 'Falha ao ouvir (' + e.error + ').')); } };
  rec.onend = () => { if (!acabou) { acabou = true; resolver((final + parcial).trim()); } };
  try { rec.start(); } catch (e) { rejeitar(e); }
  return { texto, parar() { try { rec.stop(); } catch {} } };
}

function ouvirGravando(api) {
  let resolver, rejeitar, rec = null, stream = null, timer = 0;
  const texto = new Promise((ok, erro) => { resolver = ok; rejeitar = erro; });
  const pedacos = [];
  const pronto = (async () => {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find(m => MediaRecorder.isTypeSupported?.(m)) || '';
    rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    rec.ondataavailable = (e) => { if (e.data?.size) pedacos.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      try {
        const blob = new Blob(pedacos, { type: rec.mimeType || 'audio/webm' });
        if (blob.size < 2500) return resolver('');
        const b64 = await new Promise((ok, erro) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = erro; fr.readAsDataURL(blob); });
        const r = await api('/api/manuel/ouvir', { method: 'POST', body: { audio: b64, mime: blob.type } });
        resolver(String(r.texto || '').trim());
      } catch (e) { rejeitar(e); }
    };
    rec.start();
    timer = setTimeout(() => { if (rec?.state === 'recording') rec.stop(); }, 30000);
  })().catch((e) => rejeitar(e?.name === 'NotAllowedError' ? new Error('Sem permissão de microfone.') : e));
  return { texto, async parar() { await pronto.catch(() => {}); clearTimeout(timer); if (rec?.state === 'recording') rec.stop(); } };
}

// ───────── entender a fala ─────────
const sem = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** Tira a chamada ("hey Manuel", "bom dia Manuel", "Manuel,") do começo da frase. */
export function tirarChamada(t) {
  const s = String(t || '').trim();
  const m = s.match(/^\s*(?:(?:hey|ei|oi|ola|olá|alo|alô|bom dia|boa tarde|boa noite|e ai|e aí|fala)[\s,!.]+)?(?:manuel|manoel)\b[\s,!.:-]*/i);
  return { texto: m ? s.slice(m[0].length).trim() : s, chamou: !!m, saudacao: !!(m && /^\s*(hey|ei|oi|ol|al|bom|boa|e a|fala)/i.test(m[0])) };
}

const UN = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900 };

/** "mil e quinhentos reais e trinta centavos" → "1500,30". Trechos sem número por extenso ficam como estão. */
export function numerosPorExtenso(frase) {
  const palavras = sem(frase).split(' ');
  const out = []; let i = 0;
  const lerInteiro = (j) => {
    let total = 0, atual = 0, achou = false;
    while (j < palavras.length) {
      const w = palavras[j];
      if (w in UN) { atual += UN[w]; achou = true; j++; }
      else if (w === 'mil') { total += (atual || 1) * 1000; atual = 0; achou = true; j++; }
      else if (w === 'e' && achou && (palavras[j + 1] in UN)) {
        // "cento e vinte", "noventa e sete", "mil e quinhentos" juntam; "noventa e sete e oitenta" para no 97 (o 80 vira centavos)
        const v = total + atual, casa = v % 10 ? 1 : v % 100 ? 10 : v % 1000 ? 100 : 1000;
        if (UN[palavras[j + 1]] < casa) j++; else break;
      }
      else break;
    }
    return achou ? { n: total + atual, j } : null;
  };
  while (i < palavras.length) {
    if (palavras[i] === 'mil' && /\d$/.test(out[out.length - 1] || '')) { out.push('mil'); i++; continue; }   // "1,5 mil" fica para o motor
    const a = lerInteiro(i);
    if (!a || (a.n === 1 && a.j === i + 1 && !/^(mil|reais?|cotas?|centavos?|e)$/.test(palavras[i + 1] || ''))) { out.push(palavras[i]); i++; continue; }   // "um aporte" não é número
    let j = a.j, txt = String(a.n);
    if (palavras[j] === 'reais' || palavras[j] === 'real') j++;
    if (palavras[j] === 'e' || palavras[j] === 'com') {
      const c = lerInteiro(j + 1);
      if (c && c.n < 100) { txt += ',' + String(c.n).padStart(2, '0'); j = /^centavos?$/.test(palavras[c.j] || '') ? c.j + 1 : c.j; }
    }
    if (/^centavos?$/.test(palavras[j] || '') && txt === String(a.n)) { txt = '0,' + String(a.n).padStart(2, '0'); j++; }
    out.push(txt); i = j;
  }
  return out.join(' ').replace(/(\d) (virgula|ponto) (\d)/g, '$1,$3').replace(/\b([a-z]{4}\d{1,2})\b/g, (m) => m.toUpperCase());
}

const temNumero = (t) => /\d/.test(t);

/**
 * Decide o que fazer com uma fala. Devolve uma ação para o app executar:
 * - { tipo: 'confirmar' | 'recusar' }      (há proposta pendente)
 * - { tipo: 'perguntar', fala, aguardar }   (falta dado: o Manuel pergunta e espera a próxima fala)
 * - { tipo: 'parar' | 'limpar' }
 * - { tipo: 'enviar', texto }               (vai para o motor do Manuel, como se fosse digitado)
 * `ctx`: { pendente: boolean, aguardando: null | 'aporte' | 'compra' | 'venda' | 'provento' | 'retirada' }
 */
export function interpretar(falado, ctx = {}) {
  const { texto, chamou } = tirarChamada(falado);
  const t = sem(texto);
  if (!t) return chamou ? { tipo: 'perguntar', fala: 'Às suas ordens, Comandante.', aguardar: null } : { tipo: 'nada' };
  if (/^(para|pare|silencio|chega|cala|basta)\b/.test(t)) return { tipo: 'parar' };
  if (ctx.pendente) {
    if (/^(confirmo|confirma|confirmar|pode gravar|grava|gravar|sim,? confirmo|positivo|afirmativo)\b/.test(t)) return { tipo: 'confirmar' };
    if (/^(cancela|cancelar|recusa|recusar|nao|negativo|descarta|esquece)\b/.test(t)) return { tipo: 'recusar' };
  }
  const comNum = numerosPorExtenso(texto);
  if (ctx.aguardando) {
    if (/^(cancela|esquece|deixa|nada)\b/.test(t)) return { tipo: 'perguntar', fala: 'Cancelado, Comandante.', aguardar: null };
    if (temNumero(comNum)) {
      const verbo = { aporte: 'aportei', retirada: 'retirei', compra: 'comprei', venda: 'vendi', provento: 'recebi' }[ctx.aguardando];
      return { tipo: 'enviar', texto: `${verbo} ${comNum}` };
    }
  }
  const quer = /(registr|lanc|anot|vamos|quero|fazer|fiz|faca|marca)/.test(t);
  if (quer && !temNumero(comNum)) {
    if (/aport|deposit/.test(t)) return { tipo: 'perguntar', fala: 'Certo, Comandante. De quanto foi o aporte?', aguardar: 'aporte' };
    if (/retirad|saque|saquei|retirei/.test(t)) return { tipo: 'perguntar', fala: 'Entendido. De quanto foi a retirada?', aguardar: 'retirada' };
    if (/compr/.test(t)) return { tipo: 'perguntar', fala: 'Qual ativo, quantas cotas e a que preço, Comandante?', aguardar: 'compra' };
    if (/vend/.test(t)) return { tipo: 'perguntar', fala: 'Qual ativo, quantas cotas e a que preço?', aguardar: 'venda' };
    if (/provent|dividend|rendiment|jcp/.test(t)) return { tipo: 'perguntar', fala: 'De qual ativo e qual o valor recebido?', aguardar: 'provento' };
  }
  if (quer && temNumero(comNum)) {
    if (/aport|deposit/.test(t)) return { tipo: 'enviar', texto: 'aportei ' + comNum.replace(/^.*?(\d)/, '$1') };
  }
  if (/^limpa(r)? (a )?conversa/.test(t)) return { tipo: 'limpar' };
  return { tipo: 'enviar', texto: comNum !== sem(texto) ? comNum : texto };
}

/** Frase curta que o Manuel fala ao criar uma proposta (o valor sempre lido de volta). */
export function lerProposta(p, brl) {
  const l = p?.lancamento || {};
  const v = (n) => brl(Number(n) || 0);
  const desc = {
    aporte: `aporte de ${v(l.valor)}`, retirada: `retirada de ${v(l.valor)}`, taxa: `taxa de ${v(l.valor)}`,
    provento: `provento de ${v(l.valor)} de ${l.ticker}`,
    compra: `compra de ${l.qtd} ${l.ticker} a ${v(l.preco)}`, venda: `venda de ${l.qtd} ${l.ticker} a ${v(l.preco)}`,
  }[l.tipo] ?? `lançamento de ${l.tipo}`;
  return `Proposta pronta: ${desc}${l.data ? ', com data de ' + l.data.split('-').reverse().slice(0, 2).join('/') : ''}. Diga "confirmo" para gravar ou "cancela".`;
}
