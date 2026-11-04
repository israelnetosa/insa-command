/**
 * OphanimCore · núcleo do M.A.N.U.E.L.
 *
 * Rodas dentro de rodas (Ophanim), cheias de "olhos": cada olho é um nó de dados que observa uma métrica.
 * React 18+, Tailwind CSS 3+ e framer-motion 11+.
 *
 *   npm i framer-motion
 *   import OphanimCore from './OphanimCore';
 *   <OphanimCore />                      // valores de exemplo
 *   <OphanimCore data={meusDados} />     // valores reais
 *
 * Desempenho: cada anel é uma camada própria (div) girada por transform, então o navegador rasteriza o brilho
 * (drop-shadow) uma vez e só gira a imagem na GPU. Respeita "reduzir movimento" do sistema e para quando a aba
 * fica escondida.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AnimatePresence, motion, useAnimationFrame, useMotionTemplate, useMotionValue, useReducedMotion, type MotionValue,
} from 'framer-motion';

// ───────── tipos ─────────
export interface Olho {
  id: string;
  /** posição no anel, em graus (0 = topo, sentido horário) */
  angulo: number;
  titulo: string;
  linhas: string[];
  /** olho apagado (ex.: pelotão fora da zona de ataque) */
  apagado?: boolean;
}
export interface Anel {
  id: 'interno' | 'medio' | 'externo';
  nome: string;
  descricao: string;
  /** 0–100 */
  progresso: number;
  valor: string;
  cor: string;
  /** segundos por volta; negativo gira ao contrário */
  volta: number;
  /** arco dividido em N segmentos (ex.: 11 pelotões) */
  segmentos?: number;
  /** marca extra no anel, em % (ex.: teto de concentração) */
  marca?: { pct: number; rotulo: string; cor?: string };
  olhos: Olho[];
}
export interface OphanimData {
  patrimonio: string;
  rodape: string;
  aneis: Anel[];
}

// ───────── dados de exemplo ─────────
const CIANO = '#48e5ff', AMBAR = '#ffb347', VERDE = '#34f5a4', VERMELHO = '#ff4d5e';
const espalhar = (n: number, inicio = 0) => Array.from({ length: n }, (_, i) => inicio + (360 / n) * i);

export const EXEMPLO: OphanimData = {
  patrimonio: 'R$ 3.286,87',
  rodape: 'R$ 3.287 em ativos | R$ 0,00 em caixa',
  aneis: [
    {
      id: 'interno', nome: 'Interno', descricao: 'Pelotões em zona de ataque', progresso: (6 / 11) * 100, valor: '6 de 11',
      cor: VERDE, volta: 30, segmentos: 11,
      olhos: ['BTLG11', 'ITUB4', 'CMIG4', 'TAEE11', 'NDIV11', 'MXRF11', 'WEGE3', 'BBAS3', 'RADL3', 'BITC11', 'EQTL3'].map((t, i) => ({
        id: t, angulo: espalhar(11, 360 / 22)[i], titulo: t,
        linhas: [i < 6 ? 'Zona de ataque' : 'Em espera (acima do teto)'], apagado: i >= 6,
      })),
    },
    {
      id: 'medio', nome: 'Médio', descricao: 'Maior pelotão, BTLG11', progresso: 23.6, valor: '23,6%',
      cor: AMBAR, volta: -40, marca: { pct: 25, rotulo: 'teto 25%', cor: VERMELHO },
      olhos: [
        { id: 'btlg', angulo: 23.6 * 3.6, titulo: 'BTLG11', linhas: ['Peso 23,6% da carteira', 'Teto de concentração: 25%'] },
        { id: 'itub', angulo: 150, titulo: 'ITUB4', linhas: ['Peso 17,3%'] },
        { id: 'cmig', angulo: 230, titulo: 'CMIG4', linhas: ['Peso 12,7%'] },
        { id: 'taee', angulo: 310, titulo: 'TAEE11', linhas: ['Peso 12,7%'] },
      ],
    },
    {
      id: 'externo', nome: 'Externo', descricao: 'Rumo ao marco de R$ 25/mês', progresso: 91.0, valor: '91,0%',
      cor: CIANO, volta: 55,
      olhos: [
        { id: 'marco', angulo: 91 * 3.6, titulo: 'Marco R$ 25/mês', linhas: ['Progresso 91,0%', 'Faltam R$ 2,26/mês'] },
        { id: 'renda', angulo: 60, titulo: 'Renda estimada', linhas: ['R$ 22,74/mês'] },
        { id: 'meta', angulo: 180, titulo: 'Meta final', linhas: ['R$ 20.000/mês'] },
        { id: 'aporte', angulo: 250, titulo: 'Próximo aporte', linhas: ['R$ 500 no mais atrasado'] },
      ],
    },
  ],
};

// ───────── geometria (viewBox 400 × 400) ─────────
const C = 200;
const RAIO: Record<Anel['id'], number> = { interno: 112, medio: 140, externo: 168 };
const ESPESSURA: Record<Anel['id'], number> = { interno: 7, medio: 9, externo: 11 };
const polar = (r: number, graus: number) => {
  const a = ((graus - 90) * Math.PI) / 180;
  return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
};

// ───────── um anel (camada própria, girada pelo pai) ─────────
function CamadaAnel({ anel, angulo, ativo, onOlho, quieto }: {
  anel: Anel; angulo: MotionValue<number>; ativo: string | null; quieto: boolean; onOlho: (o: Olho | null, fixar?: boolean) => void;
}) {
  const r = RAIO[anel.id], w = ESPESSURA[anel.id];
  const circ = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, anel.progresso)) / 100;

  // arco segmentado: N peças com folga; acende as que cabem no progresso
  const segs = anel.segmentos ?? 48;
  const passo = circ / segs, folga = anel.segmentos ? 6 : 2.2;
  const acesos = Math.round(segs * v);

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 will-change-transform"
      style={{ rotate: angulo, filter: `drop-shadow(0 0 6px ${anel.cor}99)` }}
    >
      <svg viewBox="0 0 400 400" className="h-full w-full overflow-visible">
        {/* trilho e marcações finas */}
        <circle cx={C} cy={C} r={r} fill="none" stroke={anel.cor} strokeOpacity={0.12} strokeWidth={w} />
        <circle cx={C} cy={C} r={r + w / 2 + 4} fill="none" stroke={anel.cor} strokeOpacity={0.35} strokeWidth={0.8} strokeDasharray="1 7" />
        {/* segmentos apagados + acesos */}
        <circle cx={C} cy={C} r={r} fill="none" stroke={anel.cor} strokeOpacity={0.18} strokeWidth={w}
          strokeDasharray={`${passo - folga} ${folga}`} transform={`rotate(-90 ${C} ${C})`} />
        <circle cx={C} cy={C} r={r} fill="none" stroke={anel.cor} strokeWidth={w}
          strokeDasharray={Array.from({ length: segs }, (_, i) => (i < acesos ? `${passo - folga} ${folga}` : `0 ${passo}`)).join(' ')}
          transform={`rotate(-90 ${C} ${C})`} />
        {/* cabeça do progresso */}
        {(() => { const p = polar(r, v * 360); return <circle cx={p.x} cy={p.y} r={w / 2 + 1.5} fill="#fff" stroke={anel.cor} strokeWidth={2} />; })()}
        {/* marca (teto) */}
        {anel.marca && (() => {
          const a = polar(r - w, (anel.marca.pct / 100) * 360), b = polar(r + w, (anel.marca.pct / 100) * 360);
          return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={anel.marca.cor ?? '#fff'} strokeWidth={2.5} />;
        })()}

        {/* olhos */}
        {anel.olhos.map((o, i) => {
          const p = polar(r, o.angulo);
          const ligado = ativo === `${anel.id}:${o.id}`;
          return (
            <g key={o.id} transform={`translate(${p.x} ${p.y})`}
              className="pointer-events-auto cursor-pointer outline-none"
              tabIndex={0} role="button" aria-label={`${o.titulo}: ${o.linhas.join(', ')}`}
              onPointerEnter={(e) => e.pointerType === 'mouse' && onOlho(o)}
              onPointerLeave={(e) => e.pointerType === 'mouse' && onOlho(null)}
              onClick={(e) => { e.stopPropagation(); onOlho(o, true); }}
              onFocus={() => onOlho(o)} onBlur={() => onOlho(null)}
              onKeyDown={(e) => { if (e.key === 'Escape') onOlho(null); }}>
              {/* área de toque generosa (mobile) */}
              <circle r={16} fill="transparent" />
              <motion.g
                animate={{ scale: ligado ? 1.45 : quieto ? 1 : [1, 1.18, 1], opacity: o.apagado ? 0.45 : quieto ? 1 : [0.85, 1, 0.85] }}
                transition={ligado ? { type: 'spring', stiffness: 300, damping: 18 }
                  : { duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: (i * 0.37) % 2.6 }}>
                {/* losango (pálpebra) + íris + pupila */}
                <path d="M0 -9 L9 0 L0 9 L-9 0 Z" fill="#020617" stroke={anel.cor} strokeWidth={1.6} />
                <circle r={4} fill={o.apagado ? 'transparent' : anel.cor} stroke={anel.cor} strokeWidth={1} />
                <circle r={1.6} fill="#020617" />
                {ligado && <circle r={13} fill="none" stroke={anel.cor} strokeWidth={1} strokeDasharray="2 3" />}
              </motion.g>
            </g>
          );
        })}
      </svg>
    </motion.div>
  );
}

// ───────── componente ─────────
export default function OphanimCore({ data = EXEMPLO, className = '' }: { data?: OphanimData; className?: string }) {
  const reduzir = useReducedMotion();
  const caixa = useRef<HTMLDivElement>(null);
  const [ativo, setAtivo] = useState<{ anel: Anel; olho: Olho; fixo: boolean } | null>(null);

  // ângulo e velocidade de cada anel: no hover a velocidade cai suavemente até parar
  const a0 = useMotionValue(0), a1 = useMotionValue(0), a2 = useMotionValue(0);
  const angulos = useMemo(() => [a0, a1, a2], [a0, a1, a2]);
  const vel = useRef([1, 1, 1]);
  const tipX = useMotionValue(50), tipY = useMotionValue(50);
  const tipLeft = useMotionTemplate`${tipX}%`, tipTop = useMotionTemplate`${tipY}%`;
  const [lado, setLado] = useState<'esq' | 'dir'>('dir');
  const [visivel, setVisivel] = useState(true);
  // em telas estreitas o painel fica ancorado embaixo do núcleo, inteiro na tela
  const [estreito, setEstreito] = useState(false);
  useEffect(() => {
    if (!caixa.current) return;
    const ro = new ResizeObserver(([e]) => setEstreito(e.contentRect.width < 520));
    ro.observe(caixa.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const f = () => setVisivel(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);

  useAnimationFrame((_, dt) => {
    if (reduzir || !visivel) return;
    const s = Math.min(dt, 64) / 1000;
    data.aneis.forEach((anel, i) => {
      const alvo = ativo ? (ativo.anel.id === anel.id ? 0 : 0.25) : 1;      // o anel focado para, os outros abrandam
      vel.current[i] += (alvo - vel.current[i]) * Math.min(1, s * 4);
      angulos[i].set((angulos[i].get() + (360 / anel.volta) * vel.current[i] * s) % 360);
    });
    // o painel acompanha o olho enquanto o anel desacelera
    if (ativo) {
      const i = data.aneis.findIndex((x) => x.id === ativo.anel.id);
      const p = polar(RAIO[ativo.anel.id], ativo.olho.angulo + angulos[i].get());
      tipX.set((p.x / 400) * 100); tipY.set((p.y / 400) * 100);
    }
  });

  const abrir = (anel: Anel) => (o: Olho | null, fixar = false) => {
    if (!o) { setAtivo((cur) => (cur?.fixo ? cur : null)); return; }
    setAtivo((cur) => (fixar && cur?.fixo && cur.olho.id === o.id && cur.anel.id === anel.id ? null : { anel, olho: o, fixo: fixar }));
    const i = data.aneis.findIndex((x) => x.id === anel.id);
    const p = polar(RAIO[anel.id], o.angulo + angulos[i].get());
    tipX.set((p.x / 400) * 100); tipY.set((p.y / 400) * 100);
    setLado(p.x < 200 ? 'esq' : 'dir');   // o painel abre para fora, sem cobrir o núcleo
  };

  // toque fora fecha o painel fixado
  useEffect(() => {
    const fora = (e: PointerEvent) => { if (!caixa.current?.contains(e.target as Node)) setAtivo(null); };
    document.addEventListener('pointerdown', fora);
    return () => document.removeEventListener('pointerdown', fora);
  }, []);

  return (
    <section className={`relative isolate w-full overflow-hidden rounded-2xl bg-slate-950 p-4 sm:p-8 ${className}`} aria-label="Núcleo M.A.N.U.E.L.">
      {/* grelha cibernética */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-40
        [background-image:linear-gradient(rgba(72,229,255,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(72,229,255,.07)_1px,transparent_1px)]
        [background-size:32px_32px] [mask-image:radial-gradient(circle_at_center,black_35%,transparent_75%)]" />

      <div ref={caixa} onClick={() => setAtivo(null)}
        className="relative mx-auto aspect-square w-full max-w-[min(92vw,620px)] [container-type:inline-size]">
        {/* anéis (o interno por último fica por cima) */}
        {[...data.aneis].reverse().map((anel) => (
          <CamadaAnel key={anel.id} anel={anel} angulo={angulos[data.aneis.indexOf(anel)]}
            ativo={ativo ? `${ativo.anel.id}:${ativo.olho.id}` : null} onOlho={abrir(anel)} quieto={!!reduzir} />
        ))}

        {/* núcleo estático */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 grid aspect-square w-[44%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full
          border border-cyan-300/30 bg-slate-950/90 text-center shadow-[0_0_40px_rgba(72,229,255,.18),inset_0_0_30px_rgba(72,229,255,.08)]">
          <div aria-hidden className="absolute inset-[12%] -z-10 rounded-full bg-[radial-gradient(circle,rgba(72,229,255,.28),transparent_70%)] blur-md" />
          <div className="px-[6%]">
            <div className="font-mono text-[max(8px,2.3cqw)] uppercase tracking-[0.4em] text-cyan-200/70">Patrimônio</div>
            <div className="mt-[1.4cqw] whitespace-nowrap font-mono text-[max(18px,5.6cqw)] font-bold leading-none text-white [text-shadow:0_0_18px_rgba(72,229,255,.55)]">
              {data.patrimonio}
            </div>
            <div className="mt-[1.6cqw] font-mono text-[max(8px,1.85cqw)] leading-snug text-slate-400">{data.rodape}</div>
          </div>
        </div>

        {/* painel holográfico do olho */}
        <AnimatePresence>
          {ativo && (
            <motion.div key={`${ativo.anel.id}:${ativo.olho.id}`}
              role="status" aria-live="polite"
              className={`pointer-events-none absolute z-20 ${estreito ? 'inset-x-[6%] bottom-[1%]' : ''}`}
              style={estreito ? undefined : { left: tipLeft, top: tipTop }}
              initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}>
              <div className={`${estreito ? 'relative w-full' : `absolute top-0 w-[min(250px,60cqw)] -translate-y-1/2 ${lado === 'dir' ? 'left-5 origin-left' : 'right-5 origin-right'}`}
                  border bg-slate-950/90 p-3 font-mono text-[11px] leading-relaxed text-slate-200 backdrop-blur-sm
                  [clip-path:polygon(0_0,calc(100%-10px)_0,100%_10px,100%_100%,10px_100%,0_calc(100%-10px))]`}
                style={{ borderColor: ativo.anel.cor, boxShadow: `0 0 18px ${ativo.anel.cor}40` }}>
                <div className="text-[9px] uppercase tracking-[0.3em]" style={{ color: ativo.anel.cor }}>
                  {ativo.anel.nome} · {ativo.anel.descricao}
                </div>
                <div className="mt-1 text-sm font-bold text-white">{ativo.olho.titulo}</div>
                {ativo.olho.linhas.map((l) => <div key={l}>{l}</div>)}
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1 flex-1 bg-white/10">
                    <div className="h-full" style={{ width: `${Math.min(100, ativo.anel.progresso)}%`, background: ativo.anel.cor }} />
                  </div>
                  <span style={{ color: ativo.anel.cor }}>{ativo.anel.valor}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* legenda (também é o acesso por leitor de tela) */}
      <ul className="mx-auto mt-4 grid max-w-[620px] gap-2 font-mono text-xs text-slate-300 sm:grid-cols-3">
        {data.aneis.map((a) => (
          <li key={a.id} className="flex items-center gap-2 border border-white/5 bg-white/[0.02] px-3 py-2">
            <i className="h-[3px] w-5 flex-none" style={{ background: a.cor, boxShadow: `0 0 8px ${a.cor}` }} />
            <span className="leading-tight">{a.descricao}</span>
            <b className="ml-auto whitespace-nowrap text-sm text-white">{a.valor}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}
