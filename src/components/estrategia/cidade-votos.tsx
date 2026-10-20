"use client";

import { useMemo, useState } from "react";
import { chave, type BairroVoto } from "@/lib/eleicao";
import type { LugarVotado } from "@/lib/votos-zonas";
import { corDoVoto } from "@/lib/rampa-votos";
import { BairrosSalvador } from "./bairros-salvador";
import { LocaisVotacao } from "./locais-votacao";

// A cidade por dentro. Duas leituras, e cada uma ganha o desenho que o dado
// suporta — nem uma a mais:
//
//   BAIRRO com malha  → mapa de verdade, fronteira e tudo (BairrosSalvador).
//   BAIRRO sem malha  → bolha empacotada dentro do contorno do município. A
//                       posição não é geográfica e o rodapé avisa: não existe
//                       malha de bairros publicada para os municípios
//                       brasileiros — o IBGE divulga setor censitário, e base de
//                       bairro só existe para algumas capitais, em formatos que
//                       não batem entre si. A bolha afirma só o tamanho, que é
//                       verdadeiro, e a pertinência à cidade, que também é.
//   LOCAL DE VOTAÇÃO  → nunca mapa, em cidade nenhuma. O TSE não publica
//                       coordenada de local, então o voto vira barra ordenada
//                       (LocaisVotacao) em vez de virar posição inventada.
//
// Só Salvador tem malha hoje. Quando chegar a das outras, cada uma sai do ramo
// da bolha pelo mesmo caminho.

const COM_MALHA = new Set(["salvador"]);

type Circulo = { nome: string; valor: number; x: number; y: number; r: number };

/**
 * Empacota círculos dentro da caixa da cidade, sem sobreposição.
 *
 * Área proporcional ao valor, não raio: o olho compara área. Raio proporcional
 * faria um bairro com o dobro dos votos parecer quatro vezes maior.
 */
function empacotar(
  itens: { nome: string; valor: number }[],
  cx: number,
  cy: number,
  larg: number,
  alt: number,
): Circulo[] {
  if (!itens.length) return [];
  const maior = itens[0].valor || 1;
  const base = Math.min(larg, alt);
  const rMax = base * 0.17;
  const rMin = base * 0.035;

  const postos: Circulo[] = [];
  for (const it of itens) {
    const r = Math.max(rMin, rMax * Math.sqrt(it.valor / maior));
    for (let passo = 0; passo < 1400; passo++) {
      const ang = passo * 0.6;
      const raio = passo * (base * 0.005);
      const x = cx + Math.cos(ang) * raio;
      const y = cy + Math.sin(ang) * raio;
      if (x - r < cx - larg / 2 || x + r > cx + larg / 2) continue;
      if (y - r < cy - alt / 2 || y + r > cy + alt / 2) continue;
      if (postos.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r + base * 0.01)) continue;
      postos.push({ nome: it.nome, valor: it.valor, x, y, r });
      break;
    }
  }
  return postos;
}

const QUANTAS = 26;

export function CidadeVotos({
  nome,
  d,
  bounds,
  bairros,
  locais,
}: {
  nome: string;
  d: string;
  bounds: [[number, number], [number, number]];
  bairros: BairroVoto[];
  locais: LugarVotado[];
}) {
  const [aba, setAba] = useState<"bairros" | "locais">("bairros");
  const temLocais = locais.length > 0;
  const vendo = aba === "locais" && temLocais ? "locais" : "bairros";
  const temMalha = COM_MALHA.has(chave(nome));

  const [[x0, y0], [x1, y1]] = bounds;
  const larg = Math.max(1, x1 - x0);
  const alt = Math.max(1, y1 - y0);
  const folga = Math.max(larg, alt) * 0.06;
  const vb = `${x0 - folga} ${y0 - folga} ${larg + folga * 2} ${alt + folga * 2}`;
  const base = Math.max(larg, alt);

  const circulos = useMemo(
    () =>
      empacotar(
        bairros.slice(0, QUANTAS).map((b) => ({ nome: b.nome, valor: b.votos })),
        (x0 + x1) / 2,
        (y0 + y1) / 2,
        larg * 0.9,
        alt * 0.9,
      ),
    [bairros, x0, x1, y0, y1, larg, alt],
  );

  const idRecorte = `rec-${nome.replace(/\W/g, "")}`;

  return (
    <div>
      {temLocais && (
        <div className="mb-3 inline-flex rounded-lg bg-tinta-100 p-0.5">
          {(
            [
              ["bairros", `Bairros (${bairros.length})`],
              ["locais", `Locais de votação (${locais.length})`],
            ] as const
          ).map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              onClick={() => setAba(id)}
              className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                vendo === id ? "bg-white text-tinta-900 shadow-sm" : "text-tinta-500 hover:text-tinta-800"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      )}

      {vendo === "locais" ? (
        <LocaisVotacao locais={locais} />
      ) : temMalha ? (
        <BairrosSalvador />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl bg-tinta-50">
            <svg viewBox={vb} className="block h-auto w-full">
              <defs>
                <clipPath id={idRecorte}>
                  <path d={d} />
                </clipPath>
              </defs>

              <path d={d} fill="#E7ECF6" stroke="#0C1F3A" strokeWidth={base * 0.003} />

              {/* Recortadas pelo contorno: nada vaza para fora da cidade */}
              <g clipPath={`url(#${idRecorte})`}>
                {circulos.map((c) => (
                  <circle
                    key={c.nome}
                    cx={c.x}
                    cy={c.y}
                    r={c.r}
                    fill={corDoVoto(c.valor)}
                    fillOpacity={0.85}
                    stroke="#ffffff"
                    strokeWidth={base * 0.0018}
                  />
                ))}
              </g>

              {circulos.map((c) => (
                <g key={`t-${c.nome}`} pointerEvents="none" fill="#16202e">
                  <text
                    x={c.x}
                    y={c.y - base * 0.011}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{
                      fontSize: base * 0.019,
                      fontWeight: 700,
                      paintOrder: "stroke",
                      stroke: "#ffffff",
                      strokeWidth: base * 0.007,
                    }}
                  >
                    {c.nome.length > 22 ? `${c.nome.slice(0, 21)}…` : c.nome}
                  </text>
                  <text
                    x={c.x}
                    y={c.y + base * 0.022}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{
                      fontSize: base * 0.024,
                      fontWeight: 800,
                      paintOrder: "stroke",
                      stroke: "#ffffff",
                      strokeWidth: base * 0.007,
                    }}
                  >
                    {c.valor.toLocaleString("pt-BR")}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-tinta-400">
            {circulos.length < bairros.length && (
              <>
                Mostrando {circulos.length} de {bairros.length} — os maiores.{" "}
              </>
            )}
            A posição das bolhas não é geográfica: não existe malha de bairros publicada para este
            município, e desenhar fronteira inventada viraria dado falso. O tamanho é o que a bolha
            afirma.
          </p>
        </>
      )}
    </div>
  );
}
