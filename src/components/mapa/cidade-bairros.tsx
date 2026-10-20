"use client";

import { useEffect, useMemo, useState } from "react";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import type { Feature, Geometry } from "geojson";

export type Bairro = { nome: string; qtd: number };

// Vista da cidade: o contorno real do município com os bairros como bolhas
// proporcionais dentro dele.
//
// Por que bolha e não polígono: não existe malha de bairros publicada para os
// municípios brasileiros — o IBGE divulga setor censitário, e base de bairro só
// existe para algumas capitais, em formatos que não batem entre si. Desenhar
// fronteira inventada seria pior do que não desenhar: viraria dado falso num
// mapa que a equipe usa para decidir onde trabalhar.

type Circulo = { nome: string; qtd: number; x: number; y: number; r: number };

/** Empacota círculos dentro da caixa do município, sem sobreposição. */
function empacotar(
  bairros: Bairro[],
  cx: number,
  cy: number,
  larg: number,
  alt: number,
): Circulo[] {
  if (!bairros.length) return [];
  const maior = bairros[0].qtd;
  const base = Math.min(larg, alt);
  const rMax = base * 0.19;
  const rMin = base * 0.055;

  const postos: Circulo[] = [];
  for (const b of bairros) {
    // Área proporcional à quantidade: o olho compara área, não raio.
    const prop = maior > 0 ? Math.sqrt(b.qtd / maior) : 0;
    const r = Math.max(rMin, rMax * prop);

    // Espiral a partir do centro até achar lugar livre
    let colocado = false;
    for (let passo = 0; passo < 900 && !colocado; passo++) {
      const ang = passo * 0.6;
      const raio = passo * (base * 0.006);
      const x = cx + Math.cos(ang) * raio;
      const y = cy + Math.sin(ang) * raio;

      // não escapa da caixa do município
      if (x - r < cx - larg / 2 || x + r > cx + larg / 2) continue;
      if (y - r < cy - alt / 2 || y + r > cy + alt / 2) continue;

      const bate = postos.some((p) => {
        const dx = p.x - x;
        const dy = p.y - y;
        return Math.hypot(dx, dy) < p.r + r + base * 0.012;
      });
      if (bate) continue;

      postos.push({ nome: b.nome, qtd: b.qtd, x, y, r });
      colocado = true;
    }
  }
  return postos;
}

function slug(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

type BairroFeature = Feature<Geometry, { nome?: string; name?: string; NOME?: string; bairro?: string }>;

function nomeDoBairro(f: BairroFeature) {
  const p = f.properties ?? {};
  return (p.nome ?? p.name ?? p.NOME ?? p.bairro ?? "").toString();
}

function chave(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function CidadeBairros({
  nome,
  d,
  bounds,
  bairros,
  pessoas,
  cor = "#0C1F3A",
}: {
  nome: string;
  d: string;
  bounds: [[number, number], [number, number]];
  bairros: Bairro[];
  pessoas: number;
  /** Cor da região do município, para a cidade não destoar do mapa. */
  cor?: string;
}) {
  // Se existir malha de bairros para esta cidade em /public/bairros/<cidade>.json,
  // ela é usada e o mapa vira polígono de verdade. Sem o arquivo, cai nas bolhas.
  const [malha, setMalha] = useState<BairroFeature[] | null>(null);
  useEffect(() => {
    let vivo = true;
    setMalha(null);
    (async () => {
      try {
        const r = await fetch(`/bairros/${slug(nome)}.json`);
        if (!r.ok) return;
        const geo = await r.json();
        if (vivo && Array.isArray(geo?.features)) setMalha(geo.features as BairroFeature[]);
      } catch {
        /* sem malha, segue com as bolhas */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [nome]);
  const [[x0, y0], [x1, y1]] = bounds;
  const larg = Math.max(1, x1 - x0);
  const alt = Math.max(1, y1 - y0);
  const folga = Math.max(larg, alt) * 0.08;
  const vb = `${x0 - folga} ${y0 - folga} ${larg + folga * 2} ${alt + folga * 2}`;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;

  const circulos = useMemo(
    () => empacotar(bairros.slice(0, 12), cx, cy, larg * 0.92, alt * 0.92),
    [bairros, cx, cy, larg, alt],
  );

  const semBairro = pessoas - bairros.reduce((s, b) => s + b.qtd, 0);
  const idRecorte = `recorte-${nome.replace(/\W/g, "")}`;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <div className="relative overflow-hidden rounded-xl bg-tinta-50">
        {malha && malha.length > 0 ? (
          <MalhaBairros features={malha} bairros={bairros} cor={cor} />
        ) : (
        <svg viewBox={vb} className="h-auto w-full">
          <defs>
            <clipPath id={idRecorte}>
              <path d={d} />
            </clipPath>
          </defs>

          {/* Contorno da cidade */}
          <path d={d} fill="#E7ECF6" stroke="#0C1F3A" strokeWidth={Math.max(larg, alt) * 0.004} />

          {/* Bolhas recortadas pelo contorno: nada vaza para fora da cidade */}
          <g clipPath={`url(#${idRecorte})`}>
            {circulos.map((c) => (
              <circle
                key={c.nome}
                cx={c.x}
                cy={c.y}
                r={c.r}
                fill={cor}
                fillOpacity={0.55}
                stroke={cor}
                strokeWidth={Math.max(larg, alt) * 0.002}
              />
            ))}
          </g>

          {/* Nome e número por cima, como num mapa de bairros de verdade */}
          {circulos.map((c) => {
            const base = Math.max(larg, alt);
            return (
              <g key={`t-${c.nome}`} pointerEvents="none">
                <text
                  x={c.x}
                  y={c.y - base * 0.012}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#0A1430"
                  style={{
                    fontSize: base * 0.024,
                    fontWeight: 700,
                    paintOrder: "stroke",
                    stroke: "#ffffff",
                    strokeWidth: base * 0.008,
                  }}
                >
                  {c.nome}
                </text>
                <text
                  x={c.x}
                  y={c.y + base * 0.026}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={cor}
                  style={{
                    fontSize: base * 0.03,
                    fontWeight: 800,
                    paintOrder: "stroke",
                    stroke: "#ffffff",
                    strokeWidth: base * 0.008,
                  }}
                >
                  {c.qtd}
                </text>
              </g>
            );
          })}
        </svg>
        )}
      </div>

      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-extrabold" style={{ color: cor }}>
            {pessoas.toLocaleString("pt-BR")}
          </span>
          <span className="text-[13px] text-tinta-500">pessoas em {nome}</span>
        </div>

        <p className="mt-1 text-[12px] text-tinta-400">
          {bairros.length > 0
            ? `${bairros.length} bairro(s) com cadastro${semBairro > 0 ? ` · ${semBairro.toLocaleString("pt-BR")} sem bairro informado` : ""}`
            : "Nenhum bairro informado nos cadastros desta cidade"}
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {bairros.slice(0, 12).map((b) => (
            <div key={b.nome} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-[13px] text-tinta-700">{b.nome}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-tinta-100">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(3, (b.qtd / bairros[0].qtd) * 100)}%`, background: cor }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-tinta-600">
                {b.qtd}
              </span>
            </div>
          ))}
        </div>

        {bairros.length === 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
            Os cadastros desta cidade vieram sem bairro. Preencher o bairro nas próximas
            importações faz esta tela ganhar conteúdo sozinha.
          </p>
        )}
      </div>
    </div>
  );
}


/** Desenha a malha real de bairros, quando a cidade tem o arquivo publicado. */
function MalhaBairros({
  features,
  bairros,
  cor,
}: {
  features: BairroFeature[];
  bairros: Bairro[];
  cor: string;
}) {
  const rgb = ((n) => `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`)(parseInt(cor.slice(1), 16));
  const porNome = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bairros) m.set(chave(b.nome), b.qtd);
    return m;
  }, [bairros]);

  const maior = bairros[0]?.qtd ?? 0;

  const { paths, W, H } = useMemo(() => {
    const L = 800;
    const A = 640;
    const fc = { type: "FeatureCollection", features } as unknown as GeoPermissibleObjects;
    const proj = geoMercator().fitSize([L, A], fc);
    const p = geoPath(proj);
    return {
      W: L,
      H: A,
      paths: features.map((f) => {
        const n = nomeDoBairro(f);
        const qtd = porNome.get(chave(n)) ?? 0;
        const forca = maior > 0 ? qtd / maior : 0;
        return {
          nome: n,
          qtd,
          d: p(f as unknown as GeoPermissibleObjects) || "",
          // Mesma rampa de calor do mapa do estado, variando a força
          cor: qtd === 0 ? "#EDEFF4" : `rgba(${rgb}, ${0.15 + forca * 0.8})`,
          centro: p.centroid(f as unknown as GeoPermissibleObjects),
        };
      }),
    };
  }, [features, porNome, maior, rgb]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      {paths.map((b, i) => (
        <path key={i} d={b.d} fill={b.cor} stroke="#ffffff" strokeWidth={0.8}>
          <title>{`${b.nome}: ${b.qtd} pessoa(s)`}</title>
        </path>
      ))}
      {paths
        .filter((b) => b.qtd > 0)
        .map((b, i) => (
          <text
            key={`r-${i}`}
            x={b.centro[0]}
            y={b.centro[1]}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#0A1430"
            style={{ fontSize: 11, fontWeight: 700, paintOrder: "stroke", stroke: "#fff", strokeWidth: 3 }}
          >
            <tspan x={b.centro[0]} dy="-0.4em">{b.nome}</tspan>
            <tspan x={b.centro[0]} dy="1.25em" style={{ fontSize: 13, fill: cor }}>{b.qtd}</tspan>
          </text>
        ))}
    </svg>
  );
}
