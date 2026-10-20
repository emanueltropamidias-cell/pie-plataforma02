"use client";

import { useEffect, useMemo, useState } from "react";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import type { Feature, Geometry } from "geojson";

type EstadoFeature = Feature<Geometry, {
  codarea: string;
  uf: string;
  nome: string;
  regiao: string;
}>;

const W = 680;
const H = 640;

const CORES_REGIAO: Record<string, string> = {
  Norte: "#10b981",
  Nordeste: "#f59e0b",
  "Centro-Oeste": "#8b5cf6",
  Sudeste: "#3b82f6",
  Sul: "#ec4899",
};

export function MapaBrasil({
  ufAtiva,
  votosPorUf,
  ufsComDados,
  onSelecionarUf,
}: {
  ufAtiva?: string;
  votosPorUf?: Record<string, number>;
  /**
   * Estados com dados do TSE no banco. Os outros NÃO são "sem votação": são
   * "não importado", e o mapa precisa dizer isso — senão o vazio do banco
   * parece fraqueza do candidato.
   */
  ufsComDados: string[];
  onSelecionarUf: (uf: string) => void;
}) {
  const [features, setFeatures] = useState<EstadoFeature[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [hoverUf, setHoverUf] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; nome: string; uf: string; votos: number; importado: boolean } | null>(null);

  useEffect(() => {
    let ativo = true;
    fetch("/brasil-estados.json")
      .then((r) => r.json())
      .then((data) => {
        if (ativo && data?.features) {
          setFeatures(data.features);
        }
      })
      .catch((err) => console.error("Erro ao carregar mapa do Brasil:", err))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, []);

  const maiorVoto = useMemo(() => {
    if (!votosPorUf) return 0;
    const vals = Object.values(votosPorUf);
    return vals.length ? Math.max(...vals) : 0;
  }, [votosPorUf]);

  const { paths } = useMemo(() => {
    if (!features.length) return { paths: [] };
    const fc = { type: "FeatureCollection", features } as unknown as GeoPermissibleObjects;
    const pathGenerator = geoPath(geoMercator().fitSize([W, H], fc));

    const ps = features.map((f) => {
      const uf = f.properties.uf;
      const nome = f.properties.nome;
      const regiao = f.properties.regiao;
      const votos = votosPorUf?.[uf] ?? 0;
      const d = pathGenerator(f as unknown as GeoPermissibleObjects) || "";

      let cor = CORES_REGIAO[regiao] || "#94a3b8"; // Cores vivas por região
      if (votos > 0 && maiorVoto > 0) {
        const proporcao = votos / maiorVoto;
        if (proporcao > 0.6) cor = "#1d4ed8"; // azul royal intenso
        else if (proporcao > 0.2) cor = "#2563eb"; // azul vivo
        else cor = "#3b82f6"; // azul médio
      } else if (uf === ufAtiva) {
        cor = "#1e40af";
      }

      return { uf, nome, regiao, votos, d, corPadrao: cor };
    });

    return { paths: ps };
  }, [features, votosPorUf, maiorVoto, ufAtiva]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
            Camada 1 · Visão Nacional
          </span>
          <h3 className="text-base font-extrabold text-slate-900">
            Mapa do Brasil por Estados
          </h3>
          <p className="text-[12px] text-slate-500">
            Clique em qualquer estado para abrir imediatamente o mapa municipal daquele estado.
          </p>
        </div>
        
        {/* Legenda visual viva */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" /> Norte
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" /> Nordeste
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#8b5cf6]" /> Centro-Oeste
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#3b82f6]" /> Sudeste
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ec4899]" /> Sul
          </span>
        </div>
      </div>

      <div className="relative mt-4 flex justify-center">
        {carregando && (
          <div className="flex h-[380px] items-center justify-center text-[13px] text-slate-400">
            Carregando malha do Brasil...
          </div>
        )}

        {!carregando && (
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-[640px] drop-shadow-sm">
            {paths.map((p) => {
              const estaAtivo = p.uf === ufAtiva;
              const estaHover = p.uf === hoverUf;
              let fill = p.corPadrao;
              if (estaHover) fill = "#1e3a8a";
              if (estaAtivo) fill = "#1d4ed8";

              return (
                <path
                  key={p.uf}
                  d={p.d}
                  fill={fill}
                  stroke="#ffffff"
                  strokeWidth={estaAtivo ? 2.5 : estaHover ? 2 : 1}
                  className="cursor-pointer transition-all duration-150 hover:opacity-95"
                  onClick={() => onSelecionarUf(p.uf)}
                  onMouseEnter={() => setHoverUf(p.uf)}
                  onMouseMove={(e) => {
                    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                    setTip({
                      x: e.clientX - r.left,
                      y: e.clientY - r.top,
                      nome: p.nome,
                      uf: p.uf,
                      votos: p.votos,
                      importado: true,
                    });
                  }}
                  onMouseLeave={() => {
                    setHoverUf(null);
                    setTip(null);
                  }}
                />
              );
            })}
          </svg>
        )}

        {tip && (
          <div
            className="pointer-events-none absolute z-20 rounded-xl bg-slate-900/95 px-3 py-2 text-[12px] text-white shadow-xl backdrop-blur-sm"
            style={{ left: tip.x + 12, top: tip.y + 12 }}
          >
            <div className="font-bold flex items-center gap-1.5">
              <span>{tip.nome}</span>
              <span className="rounded bg-white/20 px-1 py-0.2 text-[10px] uppercase font-mono">{tip.uf}</span>
            </div>
            <div className="mt-0.5 text-white/80">
              {!tip.importado ? (
                <span className="text-white/60">Dados do TSE ainda não importados</span>
              ) : tip.votos > 0 ? (
                <span>
                  <b className="text-emerald-400">{tip.votos.toLocaleString("pt-BR")}</b> votos computados
                </span>
              ) : (
                <span className="text-white/60">Clique para abrir o estado</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
