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
  onSelecionarUf,
}: {
  ufAtiva?: string;
  votosPorUf?: Record<string, number>;
  onSelecionarUf: (uf: string) => void;
}) {
  const [features, setFeatures] = useState<EstadoFeature[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [hoverUf, setHoverUf] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; nome: string; uf: string; votos: number } | null>(null);

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

      let cor = "#e5e7eb"; // cinza claro padrão
      if (votos > 0 && maiorVoto > 0) {
        const proporcao = votos / maiorVoto;
        if (proporcao > 0.6) cor = "#1d4ed8"; // azul forte
        else if (proporcao > 0.2) cor = "#3b82f6"; // azul médio
        else cor = "#93c5fd"; // azul suave
      } else if (uf === ufAtiva) {
        cor = "#2563eb";
      }

      return { uf, nome, regiao, votos, d, corPadrao: cor };
    });

    return { paths: ps };
  }, [features, votosPorUf, maiorVoto, ufAtiva]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-tinta-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between border-b border-tinta-100 pb-3">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-tema">Camada 1 · Nacional</span>
          <h3 className="text-[16px] font-extrabold text-tinta-900">Mapa do Brasil</h3>
          <p className="text-[12px] text-tinta-500">
            Clique em qualquer estado para descer automaticamente à camada estadual.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-medium text-tinta-500">
          <span className="inline-block h-3 w-3 rounded-full bg-blue-600" /> Votos concentrados
          <span className="ml-2 inline-block h-3 w-3 rounded-full bg-tinta-200" /> Sem votação
        </div>
      </div>

      <div className="relative mt-3 flex justify-center">
        {carregando && (
          <div className="flex h-[360px] items-center justify-center text-[13px] text-tinta-400">
            Carregando malha do Brasil...
          </div>
        )}

        {!carregando && (
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-[620px]">
            {paths.map((p) => {
              const estaAtivo = p.uf === ufAtiva;
              const estaHover = p.uf === hoverUf;
              let fill = p.corPadrao;
              if (estaHover) fill = "#1e40af";
              if (estaAtivo) fill = "#1d4ed8";

              return (
                <path
                  key={p.uf}
                  d={p.d}
                  fill={fill}
                  stroke="#ffffff"
                  strokeWidth={estaAtivo ? 2.5 : estaHover ? 1.8 : 0.8}
                  className="cursor-pointer transition-all duration-150 hover:opacity-90"
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
            className="pointer-events-none absolute z-20 rounded-xl bg-tinta-950/95 px-3 py-2 text-[12px] text-white shadow-xl backdrop-blur-sm"
            style={{ left: tip.x + 12, top: tip.y + 12 }}
          >
            <div className="font-bold flex items-center gap-1.5">
              <span>{tip.nome}</span>
              <span className="rounded bg-white/20 px-1 py-0.2 text-[10px] uppercase font-mono">{tip.uf}</span>
            </div>
            <div className="mt-0.5 text-white/80">
              {tip.votos > 0 ? (
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
