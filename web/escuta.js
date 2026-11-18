// "Hey Manuel": escuta contínua, gratuita e 100% no aparelho (Vosk, modelo pequeno de português).
// Só funciona com o app aberto e visível; pausa sozinha quando a tela some, quando o Manuel fala
// ou quando o microfone é usado para um comando. Nenhum áudio sai do aparelho nesta etapa.
//
// O reconhecedor roda com uma gramática fechada (só as frases de chamada + "[unk]" para o resto),
// e a chamada só vale com confiança alta na palavra "manuel": isso corta a maior parte dos falsos alarmes.

export const GRAMATICA = ['manuel', 'ei manuel', 'oi manuel', 'olá manuel', 'ola manuel', 'alô manuel',
  'bom dia manuel', 'boa tarde manuel', 'boa noite manuel', 'fala manuel', 'e aí manuel',
  // palavras parecidas que NÃO chamam: entram na gramática para "roubar" o som delas
  'manual', 'manuais', 'manuela', 'mano', 'animal', '[unk]'];
const CONF_MIN = 0.82;

let script = null;
function carregarVosk(src) {
  if (window.Vosk) return Promise.resolve(window.Vosk);
  script ??= new Promise((ok, erro) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = () => (window.Vosk ? ok(window.Vosk) : erro(new Error('Motor de escuta não carregou.')));
    s.onerror = () => { script = null; erro(new Error('Falha ao baixar o motor de escuta.')); };
    document.head.appendChild(s);
  });
  return script;
}

/** Diz se a frase reconhecida é uma chamada válida (com a confiança de cada palavra, quando houver). */
export function ehChamada(resultado) {
  const texto = String(resultado?.text || '').trim();
  if (!/\bman(u|o)el\b/.test(texto)) return false;
  const palavras = resultado?.result;
  if (Array.isArray(palavras) && palavras.length) {
    const m = palavras.find(p => /^man(u|o)el$/.test(p.word));
    if (!m || (typeof m.conf === 'number' && m.conf < CONF_MIN)) return false;
  }
  return true;
}

/**
 * Liga a escuta. `aoChamar(texto)` dispara quando ouvir a chamada. `aoEstado(estado)` recebe:
 * 'baixando', 'carregando', 'ouvindo', 'pausada', 'erro'.
 * Devolve { pausar(), retomar(), desligar(), estado }.
 */
export function ligarEscuta({ aoChamar, aoEstado, voskJs = '/vendor/vosk.js', modelo = '/vosk/pt.tar.gz' } = {}) {
  let model = null, rec = null, stream = null, actx = null, no = null, fonte = null;
  let ativo = true, pausada = false, estado = 'carregando', ultimoDisparo = 0;
  const muda = (e, extra) => { estado = e; aoEstado?.(e, extra); };

  const abrirMic = async () => {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state !== 'running') await actx.resume().catch(() => {});
    fonte = actx.createMediaStreamSource(stream);
    no = actx.createScriptProcessor(4096, 1, 1);
    no.onaudioprocess = (ev) => { if (!pausada && rec) { try { rec.acceptWaveform(ev.inputBuffer); } catch {} } };
    fonte.connect(no); no.connect(actx.destination);
  };
  const fecharMic = async () => {
    try { no && (no.onaudioprocess = null); fonte?.disconnect(); no?.disconnect(); } catch {}
    stream?.getTracks().forEach(t => t.stop()); stream = null;
    try { await actx?.close(); } catch {} actx = null; no = null; fonte = null;
  };

  const pronto = (async () => {
    muda('carregando');
    const Vosk = await carregarVosk(voskJs);
    muda('baixando');
    model = await Vosk.createModel(new URL(modelo, location.href).href);
    if (!ativo) { model.terminate(); return; }
    rec = new model.KaldiRecognizer(16000, JSON.stringify(GRAMATICA));
    rec.setWords(true);
    rec.on('result', (m) => {
      const r = m?.result;
      if (!ehChamada(r) || pausada) return;
      const agora = Date.now(); if (agora - ultimoDisparo < 2500) return;
      ultimoDisparo = agora;
      aoChamar?.(r.text);
    });
    await abrirMic();
    muda(pausada ? 'pausada' : 'ouvindo');
  })().catch((e) => { muda('erro', e?.name === 'NotAllowedError' ? 'Sem permissão de microfone.' : (e?.message || String(e))); });

  const ctrl = {
    get estado() { return estado; },
    pronto,
    /** solta o microfone (para o comando usar, ou quando a tela some) */
    async pausar() { pausada = true; await pronto; await fecharMic(); if (estado !== 'erro') muda('pausada'); },
    async retomar() {
      if (!ativo) return; await pronto; if (estado === 'erro' || !rec) return;
      pausada = false; if (!stream) await abrirMic().catch((e) => muda('erro', e.message)); if (estado !== 'erro') muda('ouvindo');
    },
    async desligar() { ativo = false; pausada = true; await pronto.catch(() => {}); await fecharMic(); try { rec?.remove(); model?.terminate(); } catch {} muda('pausada'); },
  };
  return ctrl;
}
