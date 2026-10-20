"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Minus, Plus, Maximize2, X } from "lucide-react";
import {
  carregarMalhaSalvador,
  cruzarBairros,
  type MalhaSalvador,
} from "@/lib/bairros-salvador";
import { corDoVoto, FAIXAS, SEM_VOTO } from "@/lib/rampa-votos";
import { usarZoom } from "./usar-zoom";

// Salvador por dentro, com fronteira de verdade.
//
// Até aqui a cidade era um monte de bolhas: o tamanho dizia a verdade e a
// posição não dizia nada, porque não havia malha de bairro para desenhar. Com o
// contorno dos 163 bairros em mãos, a posição passa a valer — e o mapa começa a
// responder a pergunta que a bolha não respondia, que é onde na cidade o voto
// está.
//
// O cinza NÃO quer dizer zero. Quer dizer que aquele bairro não aparece em linha
// nenhuma da apuração — são 146 nomes para 163 bairros. A diferença importa: o
// Caminho das Árvores é cinza e faz divisa com cinco bairros de média 185 votos,
// entre eles a Pituba, que é o maior de Salvador. Ler aquilo como "zero" seria a
// plataforma afirmando o que o dado não sustenta.
//
// COMO O BAIRRO SE IDENTIFICA: o nome fica no mapa, não só no hover — mas nunca
// um por cima do outro. De longe entram os nomes que cabem limpos; aproximar
// afasta os centros e revela os demais, sem teto, até chegar em qualquer bairro.
// A letra acompanha o tamanho do bairro e tem halo branco para se ler sobre o
// creme e sobre o azul. O toque fixa o bairro numa faixa embaixo do mapa, que no
// celular é a forma de ler com calma sem depender do mouse.

// votos null = o bairro não consta da apuração. Diferente de zero, e a tela
// precisa saber a diferença para não mentir no rodapé.
type Alvo = { nome: string; votos: number | null; nomes: string[]; vizinhanca?: number };

// Um nome posto no mapa. `fonte` é o corpo da letra em unidades do desenho,
// calculado pela área do bairro. `votos` null é bairro que não consta.
type Rotulo = { nome: string; cx: number; cy: number; area: number; votos: number | null; fonte: number };

export function BairrosSalvador() {
  const [malha, setMalha] = useState<MalhaSalvador | null>(null);
  const [erro, setErro] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; alvo: Alvo } | null>(null);
  const [fixo, setFixo] = useState<Alvo | null>(null);

  useEffect(() => {
    let vivo = true;
    carregarMalhaSalvador()
      .then((m) => vivo && setMalha(m))
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, []);

  const dados = useMemo(() => (malha ? cruzarBairros(malha) : null), [malha]);
  const zoom = usarZoom(malha?.w ?? 900, malha?.h ?? 699);
  const { k, x: vx, y: vy } = zoom.vista;
  const larguraMapa = malha?.w ?? 900;
  const alturaMapa = malha?.h ?? 699;

  // O nome fica no mapa, mas NUNCA um por cima do outro. Todo bairro (inclusive
  // os "não consta", sem número) entra na disputa por um lugar; o maior vai
  // primeiro, porque é o que mais aguenta o texto dentro. Sem teto: o que não
  // coube de longe aparece ao aproximar, quando os centros se afastam e abrem
  // espaço. A letra acompanha o tamanho do bairro, para o pequeno caber sem
  // sumir e o grande não gritar.
  const rotulos = useMemo<Rotulo[]>(() => {
    if (!dados) return [];
    const crus = [
      ...dados.pintados.map((b) => ({
        nome: b.nome,
        cx: b.cx,
        cy: b.cy,
        area: b.area,
        votos: b.votos as number | null,
      })),
      ...dados.naoConsta.map((b) => ({
        nome: b.nome,
        cx: b.cx,
        cy: b.cy,
        area: b.area,
        votos: null as number | null,
      })),
    ];
    const areaMax = crus.reduce((m, t) => Math.max(m, t.area), 1);
    const candidatos = crus
      .map((t) => ({ ...t, fonte: 5 + 6 * Math.sqrt(t.area / areaMax) }))
      .sort((a, b) => b.area - a.area);

    // Colisão em coordenadas de tela (já com zoom): aproximar afasta os centros
    // e a mesma caixa passa a caber onde antes esbarrava.
    const caixas: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const postos: Rotulo[] = [];
    for (const b of candidatos) {
      const sx = k * b.cx + vx;
      const sy = k * b.cy + vy;
      if (sx < 16 || sx > larguraMapa - 16 || sy < 16 || sy > alturaMapa - 16) continue;
      const larg = Math.min(b.nome.length, 22) * b.fonte * 0.5;
      const alt = b.fonte * (b.votos !== null ? 2.2 : 1.2);
      const caixa = { x0: sx - larg / 2, x1: sx + larg / 2, y0: sy - alt / 2, y1: sy + alt / 2 };
      const bate = caixas.some(
        (o) => caixa.x0 < o.x1 && caixa.x1 > o.x0 && caixa.y0 < o.y1 && caixa.y1 > o.y0,
      );
      if (bate) continue;
      caixas.push(caixa);
      postos.push(b);
    }
    return postos;
  }, [dados, k, vx, vy, larguraMapa, alturaMapa]);

  if (erro) {
    return (
      <p className="rounded-xl bg-tinta-50 px-4 py-8 text-center text-[12.5px] text-tinta-500">
        Não deu para carregar o desenho dos bairros. A lista abaixo continua valendo.
      </p>
    );
  }

  if (!dados || !malha) {
    return (
      <div className="flex h-[320px] items-center justify-center rounded-xl bg-tinta-50 text-[13px] text-tinta-400">
        Carregando os bairros…
      </div>
    );
  }

  const { pintados, naoConsta, votosNoMapa } = dados;
  const aceso = tip?.alvo.nome ?? fixo?.nome;

  function tocar(alvo: Alvo) {
    if (zoom.arrastou()) return; // foi arrasto do mapa, não clique no bairro
    setFixo((f) => (f?.nome === alvo.nome ? null : alvo));
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl bg-tinta-50">
        {/* A baía deixa o canto superior esquerdo vazio no desenho — é lá que a
            legenda mora, em vez de comer altura acima do mapa. */}
        <div className="left-4 top-4 z-[1] px-3 pt-3 sm:absolute sm:rounded-lg sm:bg-white/85 sm:p-2.5 sm:shadow-sm sm:ring-1 sm:ring-black/5 sm:backdrop-blur">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-tinta-500">
            Votos em 2022
          </p>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-tinta-500 sm:max-w-[132px] sm:flex-col sm:items-start sm:gap-1">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-3 w-3 rounded-sm ring-1 ring-inset ring-black/10"
                style={{ background: SEM_VOTO }}
              />
              não consta
            </span>
            {FAIXAS.map((f) => (
              <span key={f.rotulo} className="inline-flex items-center gap-1.5">
                <span
                  className="h-3 w-3 rounded-sm ring-1 ring-inset ring-black/10"
                  style={{ background: f.cor }}
                />
                {f.rotulo}
              </span>
            ))}
          </div>
        </div>

        <ControlesZoom zoom={zoom} />

        <svg
          ref={zoom.ref}
          viewBox={`0 0 ${malha.w} ${malha.h}`}
          className={`block h-auto w-full touch-none select-none ${
            zoom.arrastando ? "cursor-grabbing" : "cursor-grab"
          }`}
          {...zoom.arrastar}
        >
          <g transform={zoom.transform}>
            {/* Traço por vector-effect, não por conta em JS: assim a espessura
                do contorno não depende da escala, e os 163 bairros ficam com
                props constantes durante a animação do zoom — quem se mexe a cada
                quadro é só o transform deste <g>, não mil atributos. */}
            {/* Bairro é uma peça só, mesmo quando o desenho vem em vários
                polígonos — ilha com duas partes acende junto e responde junto. */}
            {naoConsta.map((b) => {
              const alvo: Alvo = { nome: b.nome, votos: null, nomes: [], vizinhanca: b.vizinhanca };
              return (
                <g
                  key={b.nome}
                  fill={SEM_VOTO}
                  stroke={aceso === b.nome ? "#16202e" : "#ffffff"}
                  strokeWidth={aceso === b.nome ? 2.4 : 0.9}
                  vectorEffect="non-scaling-stroke"
                  className="cursor-pointer"
                  onMouseMove={(e) => mover(e, alvo, setTip)}
                  onMouseLeave={() => setTip(null)}
                  onClick={() => tocar(alvo)}
                >
                  {b.partes.map((pts, i) => (
                    <polygon key={i} points={pts} vectorEffect="non-scaling-stroke" />
                  ))}
                </g>
              );
            })}

            {pintados.map((b) => {
              const alvo: Alvo = { nome: b.nome, votos: b.votos, nomes: b.nomeApuracao };
              return (
                <g
                  key={b.nome}
                  fill={corDoVoto(b.votos)}
                  stroke={aceso === b.nome ? "#16202e" : "#ffffff"}
                  strokeWidth={aceso === b.nome ? 2.4 : 0.9}
                  vectorEffect="non-scaling-stroke"
                  className="cursor-pointer"
                  onMouseMove={(e) => mover(e, alvo, setTip)}
                  onMouseLeave={() => setTip(null)}
                  onClick={() => tocar(alvo)}
                >
                  {b.partes.map((pts, i) => (
                    <polygon key={i} points={pts} vectorEffect="non-scaling-stroke" />
                  ))}
                </g>
              );
            })}

            {/* Todo bairro com nome, sempre. Texto em cor de tinta com halo
                branco — lê sobre o creme e sobre o azul. O corpo da letra vem
                por bairro e é dividido pela escala para o nome não engordar
                junto com o zoom. Quem não consta vem em tom mais suave e sem
                número. */}
            {rotulos.map((b) => {
              const semVoto = b.votos === null;
              const halo = zoom.escala(b.fonte * 0.32);
              return (
                <g key={`r-${b.nome}`} pointerEvents="none">
                  <text
                    x={b.cx}
                    y={semVoto ? b.cy : b.cy - zoom.escala(b.fonte * 0.42)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={semVoto ? "#67707e" : "#16202e"}
                    style={{
                      fontSize: zoom.escala(b.fonte),
                      fontWeight: 700,
                      paintOrder: "stroke",
                      stroke: "#ffffff",
                      strokeWidth: halo,
                    }}
                  >
                    {b.nome}
                  </text>
                  {!semVoto && (
                    <text
                      x={b.cx}
                      y={b.cy + zoom.escala(b.fonte * 0.72)}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#16202e"
                      style={{
                        fontSize: zoom.escala(b.fonte * 1.02),
                        fontWeight: 800,
                        paintOrder: "stroke",
                        stroke: "#ffffff",
                        strokeWidth: halo,
                      }}
                    >
                      {b.votos!.toLocaleString("pt-BR")}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {tip && !zoom.arrastando && (
          <div
            className="pointer-events-none absolute z-10 hidden max-w-[220px] rounded-lg bg-tinta-900 px-2.5 py-1.5 text-[11.5px] text-white shadow-lg sm:block"
            style={{ left: tip.x + 12, top: tip.y + 12 }}
          >
            <div className="font-bold">{tip.alvo.nome}</div>
            <div className="tabular text-white/70">
              {tip.alvo.votos === null
                ? "não consta na apuração"
                : `${tip.alvo.votos.toLocaleString("pt-BR")} votos em 2022`}
            </div>
            {tip.alvo.nomes.length > 1 && (
              <div className="mt-1 text-[10.5px] leading-snug text-white/50">
                soma de {tip.alvo.nomes.join(", ").toLowerCase()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Passar o mouse não existe no celular. O toque fixa aqui, e fica. */}
      {fixo && (
        <div className="mt-2 flex items-start gap-3 rounded-lg bg-tinta-900 px-3 py-2 text-white">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold leading-tight">{fixo.nome}</p>
            <p className="tabular mt-0.5 text-[11.5px] text-white/70">
              {fixo.votos === null
                ? "não consta na apuração"
                : `${fixo.votos.toLocaleString("pt-BR")} votos em 2022`}
            </p>
            {fixo.votos === null && (
              <p className="mt-1 text-[11px] leading-snug text-white/50">
                Nenhuma linha cita este bairro — não é o mesmo que zero voto.
                {fixo.vizinhanca !== undefined && fixo.vizinhanca >= 20 && (
                  <>
                    {" "}
                    Os bairros que fazem divisa com ele têm média de{" "}
                    <b className="text-amber-300">{Math.round(fixo.vizinhanca)} votos</b>.
                  </>
                )}
              </p>
            )}
            {fixo.nomes.length > 1 && (
              <p className="mt-1 text-[11px] leading-snug text-white/50">
                soma de {fixo.nomes.join(", ").toLowerCase()}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFixo(null)}
            className="shrink-0 rounded p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-tinta-400">
        {pintados.length} bairros pintados, somando{" "}
        <b className="text-tinta-600">{votosNoMapa.toLocaleString("pt-BR")}</b> votos.
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-tinta-400">
        Todo bairro tem nome: de longe aparecem os que cabem sem se atropelar, e aproximar revela os
        demais. Toque num bairro para fixar os detalhes embaixo. Duplo clique ou dois dedos aproximam;
        com o mapa já aproximado a roda também aproxima, e de longe ela rola a página, para o mapa não
        prender quem só passava.
      </p>

    </div>
  );
}

/** Botões de zoom, para quem não tem roda de mouse. */
export function ControlesZoom({ zoom }: { zoom: ReturnType<typeof usarZoom> }) {
  const botao =
    "flex h-7 w-7 items-center justify-center rounded-md bg-white/90 text-tinta-600 shadow-sm ring-1 ring-tinta-200 transition-colors hover:bg-white hover:text-tinta-900 disabled:opacity-40";
  return (
    <div className="absolute right-3 top-3 z-[1] flex flex-col gap-1">
      <button
        type="button"
        onClick={() => zoom.aproximar(1.8, undefined, undefined, true)}
        className={botao}
        aria-label="Aproximar"
      >
        <Plus size={14} />
      </button>
      <button
        type="button"
        onClick={() => zoom.aproximar(1 / 1.8, undefined, undefined, true)}
        disabled={zoom.afastado}
        className={botao}
        aria-label="Afastar"
      >
        <Minus size={14} />
      </button>
      <button
        type="button"
        onClick={zoom.voltar}
        disabled={zoom.afastado}
        className={botao}
        aria-label="Ver tudo"
      >
        <Maximize2 size={13} />
      </button>
    </div>
  );
}

function mover(
  e: MouseEvent<SVGGElement>,
  alvo: Alvo,
  setTip: (v: { x: number; y: number; alvo: Alvo }) => void,
) {
  const svg = e.currentTarget.ownerSVGElement;
  if (!svg) return;
  const r = svg.getBoundingClientRect();
  setTip({ x: e.clientX - r.left, y: e.clientY - r.top, alvo });
}
