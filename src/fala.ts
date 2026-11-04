// Texto para voz: transforma a resposta escrita (markdown, símbolos, siglas) em frases que soam naturais.
// Usado pelo servidor (voz natural do Gemini) e pelo app (voz do aparelho), para os dois lerem igual.

/** Vozes masculinas do Gemini TTS, da mais "J.A.R.V.I.S." para a mais informal. */
export const VOZES_MASCULINAS: [string, string][] = [
  ['Charon', 'grave e informativa (padrão)'],
  ['Algieba', 'suave'],
  ['Sadaltager', 'experiente'],
  ['Iapetus', 'clara'],
  ['Orus', 'firme'],
  ['Rasalgethi', 'de locutor'],
  ['Schedar', 'equilibrada'],
  ['Umbriel', 'descontraída'],
];

/** Como o Gemini deve interpretar a fala (vai junto do texto; não é lido em voz alta). */
export const ESTILO_VOZ = 'Fale em português do Brasil, com sotaque neutro, como J.A.R.V.I.S., o mordomo digital do Tony Stark: voz masculina, grave e elegante, calma e confiante, com humor seco e uma ponta de ironia britânica. Ritmo natural e fluido, frases ligadas, sem pausas artificiais nem pressa; números ditos com clareza. Leia exatamente o texto a seguir, sem acrescentar nada:';

const SIGLAS: [RegExp, string][] = [
  [/\bPM\b/g, 'preço médio'],
  [/\bDY\b/g, 'dividend yield'],
  [/\bYoC\b/gi, 'yield on cost'],
  [/\bFIIs\b/g, 'fundos imobiliários'],
  [/\bFII\b/g, 'fundo imobiliário'],
  [/\bJCP\b/g, 'juros sobre capital próprio'],
  [/\bIA\b/g, 'I.A.'],
  [/\bM\.A\.N\.U\.E\.L\./g, 'Manuel'],
  [/\bvs\.?\b/gi, 'contra'],
  [/\best\.\b/g, 'estimado'],
];

const centavos = (int: string, dec?: string) => {
  const inteiro = int.replace(/\./g, '');
  const reais = Number(inteiro) === 1 ? '1 real' : `${int} reais`;
  if (!dec || /^0+$/.test(dec)) return reais;
  const c = Number(dec.padEnd(2, '0').slice(0, 2));
  return `${reais} e ${c} ${c === 1 ? 'centavo' : 'centavos'}`;
};

export function paraFala(texto: string, max = 1500): string {
  let t = String(texto ?? '');
  t = t.replace(/```[\s\S]*?```/g, ' ')                       // blocos de código
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1')                     // links
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>~]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')   // emojis
    .replace(/^\s*(?:[-•]|\d+\.)\s+/gm, '');                  // marcadores de lista
  // dinheiro: "+R$ 1.234,56" → "mais 1.234 reais e 56 centavos"
  t = t.replace(/([+\-−])\s?R\$\s?(\d[\d.]*)(?:,(\d{1,2}))?/g, (_, s, i, d) => `${s === '+' ? 'mais' : 'menos'} ${centavos(i, d)}`)
    .replace(/R\$\s?(\d[\d.]*)(?:,(\d{1,2}))?/g, (_, i, d) => centavos(i, d));
  t = t.replace(/\/m[eê]s\b/g, ' por mês').replace(/\/ano\b/g, ' por ano')
    .replace(/([+])(\d)/g, 'mais $2').replace(/(^|[\s(])[-−](\d)/g, '$1menos $2')
    .replace(/(\d)\s?%/g, '$1 por cento')
    .replace(/▲/g, 'alta de').replace(/▼/g, 'queda de')
    .replace(/\s?→\s?/g, ' para ').replace(/\s?×\s?/g, ' vezes ')
    .replace(/(\d+)\s*\/\s*(\d+)\s+cotas/g, '$1 de $2 cotas')
    .replace(/\b([A-Z]{4})(\d{1,2})\b/g, '$1 $2');            // BTLG11 → "BTLG 11"
  for (const [re, s] of SIGLAS) t = t.replace(re, s);
  // separadores visuais viram pausas curtas; quebras de linha viram fim de frase
  t = t.replace(/\s*[·|]\s*/g, ', ').replace(/\s*;\s*/g, '; ')
    .split(/\n+/).map(l => l.trim()).filter(Boolean)
    .map(l => /[.!?:;,]$/.test(l) ? l.replace(/[:;,]$/, '.') : l + '.').join(' ')
    .replace(/\s{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').replace(/([.,!?]){2,}/g, '$1').trim();
  if (t.length > max) { const corte = t.lastIndexOf('. ', max); t = t.slice(0, corte > max * 0.5 ? corte + 1 : max); }
  return t;
}
