"use client";

import { DADOS_ESTADOS } from "@/lib/estados";
import { useEffect, useMemo, useState } from "react";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import type { Feature, Geometry } from "geojson";
import {
  Globe2,
  Users,
  Building2,
  TrendingUp,
  MapPin,
  ChevronRight,
  ArrowRight,
  Sparkles,
  Layers,
} from "lucide-react";

type EstadoFeature = Feature<
  Geometry,
  {
    codarea: string;
    uf: string;
    nome: string;
    regiao: string;
  }
>;

const W = 680;
const H = 640;


// Paleta de gradientes moderna por macrorregião
const CORES_REGIOES: Record<string, { fill: string; stroke: string; label: string }> = {
  Norte: { fill: "#059669", stroke: "#047857", label: "Norte" },
  Nordeste: { fill: "#d97706", stroke: "#b45309", label: "Nordeste" },
  "Centro-Oeste": { fill: "#7c3aed", stroke: "#6d28d9", label: "Centro-Oeste" },
  Sudeste: { fill: "#2563eb", stroke: "#1d4ed8", label: "Sudeste" },
  Sul: { fill: "#db2777", stroke: "#be185d", label: "Sul" },
};

// Ajuste manual fino para estados pequenos onde a sigla fica melhor posicionada
const AJUSTE_SIGLA: Record<string, { dx: number; dy: number }> = {
  DF: { dx: 18, dy: -2 },
  RN: { dx: 6, dy: -4 },
  PB: { dx: 8, dy: 0 },
  PE: { dx: 10, dy: 2 },
  AL: { dx: 14, dy: 0 },
  SE: { dx: 12, dy: 4 },
  ES: { dx: 8, dy: 0 },
  RJ: { dx: 10, dy: 4 },
  SC: { dx: 0, dy: 0 },
};

export function MapaBrasil({
  ufAtiva,
  votosPorUf,
  ufsComDados,
  onSelecionarUf,
}: {
  ufAtiva?: string;
  votosPorUf?: Record<string, number>;
  ufsComDados?: string[];
  onSelecionarUf: (uf: string) => void;
}) {
  const [features, setFeatures] = useState<EstadoFeature[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [hoverUf, setHoverUf] = useState<string | null>(null);
  const [modoVisao, setModoVisao] = useState<"regioes" | "bancadas" | "votos">("regioes");
  const [tip, setTip] = useState<{
    x: number;
    y: number;
    nome: string;
    uf: string;
    votos: number;
    regiao: string;
    bancada: number;
    eleitorado: string;
    municipios: number;
  } | null>(null);

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

  // Projeção com centróides exatos para as siglas
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
      const [cx, cy] = pathGenerator.centroid(f as unknown as GeoPermissibleObjects);

      const dadosGeo = DADOS_ESTADOS[uf] || {
        bancada: 8,
        eleitorado: "—",
        municipios: 100,
        capital: "—",
      };

      // Cor conforme o modo de visão
      let cor = CORES_REGIOES[regiao]?.fill || "#3b82f6";
      let stroke = "#ffffff";

      if (modoVisao === "bancadas") {
        // Rampa pela força da bancada federal na Câmara dos Deputados
        if (dadosGeo.bancada >= 40) cor = "#1e3a8a"; // Super bancadas (SP, MG, RJ)
        else if (dadosGeo.bancada >= 25) cor = "#2563eb"; // Grandes (BA, RS, PR, PE)
        else if (dadosGeo.bancada >= 15) cor = "#60a5fa"; // Médias
        else cor = "#93c5fd"; // Bancadas padrão (8 a 12)
      } else if (modoVisao === "votos") {
        if (votos > 0 && maiorVoto > 0) {
          const p = votos / maiorVoto;
          if (p > 0.6) cor = "#1d4ed8";
          else if (p > 0.2) cor = "#2563eb";
          else cor = "#60a5fa";
        } else {
          cor = "#e2e8f0"; // Neutro elegante
        }
      }

      if (uf === ufAtiva) {
        cor = "#0f172a"; // Destaque executivo escuro
      }

      const ajuste = AJUSTE_SIGLA[uf] || { dx: 0, dy: 0 };

      return {
        uf,
        nome,
        regiao,
        votos,
        d,
        cx: cx + ajuste.dx,
        cy: cy + ajuste.dy,
        cor,
        stroke,
        ...dadosGeo,
      };
    });

    return { paths: ps };
  }, [features, votosPorUf, maiorVoto, ufAtiva, modoVisao]);

  // Ranking dos 6 maiores colégios eleitorais do Brasil
  const topEstadosBrasil = useMemo(() => {
    return [
      { uf: "SP", nome: "São Paulo", bancada: 70, eleitores: "34,6M" },
      { uf: "MG", nome: "Minas Gerais", bancada: 53, eleitores: "16,3M" },
      { uf: "RJ", nome: "Rio de Janeiro", bancada: 46, eleitores: "12,8M" },
      { uf: "BA", nome: "Bahia", bancada: 39, eleitores: "11,2M" },
      { uf: "RS", nome: "Rio Grande do Sul", bancada: 31, eleitores: "8,6M" },
      { uf: "PR", nome: "Paraná", bancada: 30, eleitores: "8,4M" },
    ];
  }, []);

  return (
    <div className="space-y-4">
      {/* ── BARRA SUPERIOR DE INTELIGÊNCIA NACIONAL ─────────────────── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_4px_20px_rgb(0,0,0,0.02)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-200/60 flex items-center gap-1">
                <Globe2 size={12} /> Camada Nacional · 27 UFs
              </span>
              <span className="text-[11px] font-medium text-slate-400">
                513 Deputados Federais · 81 Senadores
              </span>
            </div>
            <h2 className="mt-1 text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">
              Mapa Político e Eleitoral do Brasil
            </h2>
            <p className="text-[12px] text-slate-500">
              <span className="sm:hidden">Toque em qualquer estado para descer à malha municipal.</span>
              <span className="hidden sm:inline">Clique em qualquer estado para descer à malha municipal. Passe o cursor para ver os dados geopolíticos.</span>
            </p>
          </div>

          {/* Seletor de Modo de Visualização do Mapa */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 hidden items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 sm:flex">
              <Layers size={12} /> Visão:
            </span>
            <div className="grid w-full grid-cols-3 rounded-xl border border-slate-200 bg-slate-50/80 p-1 text-[11.5px] sm:inline-flex sm:w-auto sm:text-[12px]">
              <button
                onClick={() => setModoVisao("regioes")}
                className={`rounded-lg px-2 py-1.5 font-semibold leading-tight transition sm:px-2.5 sm:py-1 ${
                  modoVisao === "regioes"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Macrorregiões
              </button>
              <button
                onClick={() => setModoVisao("bancadas")}
                className={`rounded-lg px-2 py-1.5 font-semibold leading-tight transition sm:px-2.5 sm:py-1 ${
                  modoVisao === "bancadas"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Bancadas Federais
              </button>
              <button
                onClick={() => setModoVisao("votos")}
                className={`rounded-lg px-2 py-1.5 font-semibold leading-tight transition sm:px-2.5 sm:py-1 ${
                  modoVisao === "votos"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Calor de Votos
              </button>
            </div>
          </div>
        </div>

        {/* Legenda visual elegante */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-[11px]">
          {modoVisao === "regioes" ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-slate-600 font-medium">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#059669]" /> Norte (7 estados)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#d97706]" /> Nordeste (9 estados)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#7c3aed]" /> Centro-Oeste (3 + DF)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" /> Sudeste (4 estados)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#db2777]" /> Sul (3 estados)
              </span>
            </div>
          ) : modoVisao === "bancadas" ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-slate-600 font-medium">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#1e3a8a]" /> Bancadas Máximas (40+ dep)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" /> Bancadas Grandes (25 a 39)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#60a5fa]" /> Bancadas Médias (15 a 24)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#93c5fd]" /> Bancadas Base (8 a 12)
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-slate-600 font-medium">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#1d4ed8]" /> Alta Votação
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#60a5fa]" /> Votação Moderada
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#e2e8f0]" /> Sem Votos
              </span>
            </div>
          )}

          <span className="text-slate-400 font-medium">
            27 UFs · 5.570 Municípios
          </span>
        </div>
      </div>

      {/* ── CORPO PRINCIPAL: MAPA CARTOGRÁFICO + PAINEL LATERAL ─────── */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        
        {/* COLUNA ESQUERDA (65%): O MAPA CARTOGRÁFICO COM AS SIGLAS */}
        <div className="xl:col-span-8 rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-[0_4px_20px_rgb(0,0,0,0.02)] relative min-w-0 overflow-hidden flex flex-col items-center justify-center p-3 sm:min-h-[580px]">
          
          {carregando && (
            <div className="flex h-[300px] items-center justify-center text-[13px] text-slate-400 sm:h-[420px]">
              Carregando mapa cartográfico nacional...
            </div>
          )}

          {!carregando && (
            <div className="relative w-full max-w-[620px]">
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="block h-auto w-full filter drop-shadow-[0_8px_24px_rgba(15,23,42,0.06)]"
              >
                {/* Definições de Gradientes e Filtros */}
                <defs>
                  <filter id="map-shadow" x="-5%" y="-5%" width="115%" height="115%">
                    <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.12" />
                  </filter>
                </defs>

                {/* Polígonos dos 27 Estados com Contorno Nítido */}
                <g filter="url(#map-shadow)">
                  {paths.map((p) => {
                    const estaAtivo = p.uf === ufAtiva;
                    const estaHover = p.uf === hoverUf;
                    let fill = p.cor;
                    if (estaHover) fill = "#0f172a"; // Destaque nobre no hover
                    if (estaAtivo) fill = "#1d4ed8";

                    return (
                      <path
                        key={p.uf}
                        d={p.d}
                        fill={fill}
                        stroke="#ffffff"
                        strokeWidth={estaAtivo ? 2.5 : estaHover ? 2 : 1}
                        className="cursor-pointer transition-all duration-200 hover:brightness-105"
                        onClick={() => onSelecionarUf(p.uf)}
                        onMouseEnter={() => setHoverUf(p.uf)}
                        onMouseMove={(e) => {
                          const r = (
                            e.currentTarget.ownerSVGElement as SVGSVGElement
                          ).getBoundingClientRect();
                          setTip({
                            x: e.clientX - r.left,
                            y: e.clientY - r.top,
                            nome: p.nome,
                            uf: p.uf,
                            votos: p.votos,
                            regiao: p.regiao,
                            bancada: p.bancada,
                            eleitorado: p.eleitorado,
                            municipios: p.municipios,
                          });
                        }}
                        onMouseLeave={() => {
                          setHoverUf(null);
                          setTip(null);
                        }}
                      />
                    );
                  })}
                </g>

                {/* Siglas dos Estados gravadas no Centroide de cada Polígono */}
                <g className="pointer-events-none select-none">
                  {paths.map((p) => (
                    <text
                      key={`sigla-${p.uf}`}
                      x={p.cx}
                      y={p.cy}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="font-black text-[10px] sm:text-[11px] fill-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)] tracking-wider"
                    >
                      {p.uf}
                    </text>
                  ))}
                </g>
              </svg>

              {/* Tooltip Executivo Flutuante (Glassmorphism Escuro) */}
              {tip && (
                <div
                  className="pointer-events-none absolute z-30 min-w-[210px] [@media(hover:none)]:hidden rounded-xl bg-slate-900/95 p-3 text-[12px] text-white shadow-2xl backdrop-blur-md border border-slate-700/60"
                  style={{ left: tip.x + 14, top: tip.y - 10 }}
                >
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div>
                      <div className="font-extrabold text-[13.5px] leading-tight">
                        {tip.nome}
                      </div>
                      <span className="text-[10.5px] text-slate-400">
                        Região {tip.regiao}
                      </span>
                    </div>
                    <span className="rounded bg-blue-600 px-1.5 py-0.5 font-mono text-[11px] font-black uppercase text-white shadow-xs">
                      {tip.uf}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1 text-[11.5px]">
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Bancada Federal:</span>
                      <b className="text-white">{tip.bancada} Deputados</b>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Eleitorado:</span>
                      <b className="text-white">{tip.eleitorado} eleitores</b>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Municípios:</span>
                      <b className="text-white">{tip.municipios} cidades</b>
                    </div>
                    {tip.votos > 0 && (
                      <div className="flex items-center justify-between text-emerald-400 pt-1 border-t border-slate-800/80">
                        <span>Votos computados:</span>
                        <b>{tip.votos.toLocaleString("pt-BR")}</b>
                      </div>
                    )}
                  </div>

                  <div className="mt-2.5 flex items-center justify-center gap-1 rounded-lg bg-blue-600/30 py-1 text-[10.5px] font-bold text-blue-300 border border-blue-500/30">
                    <span>Clique para abrir o estado</span>
                    <ArrowRight size={11} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* COLUNA DIREITA (35%): PAINEL DE INTELIGÊNCIA GEOPOLÍTICA */}
        <div className="min-w-0 xl:col-span-4 space-y-4">
          
          {/* Card Resumo do Congresso Nacional */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-[13px] font-bold text-slate-900 flex items-center gap-1.5">
                <Building2 size={15} className="text-blue-600" />
                Poder Legislativo Nacional
              </h3>
              <span className="text-[11px] font-bold text-slate-400 font-mono">513 · 81</span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Câmara Federal
                </span>
                <span className="text-lg font-black text-slate-900">513</span>
                <span className="text-[10.5px] text-slate-500 block">Deputados</span>
              </div>

              <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Senado Federal
                </span>
                <span className="text-lg font-black text-slate-900">81</span>
                <span className="text-[10.5px] text-slate-500 block">3 por Estado</span>
              </div>
            </div>
          </div>

          {/* Ranking dos Maiores Colégios Eleitorais com Botão Clicável */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div>
                <h3 className="text-[13px] font-bold text-slate-900">
                  Maiores Forças Eleitorais
                </h3>
                <p className="text-[11px] text-slate-400">
                  Os 6 maiores colégios eleitorais do país
                </p>
              </div>
              <span className="text-[11px] font-medium text-blue-600 font-bold">Top 6</span>
            </div>

            <div className="space-y-2">
              {topEstadosBrasil.map((item, i) => (
                <button
                  key={item.uf}
                  onClick={() => onSelecionarUf(item.uf)}
                  className="group flex w-full items-center justify-between rounded-xl border border-slate-100 p-2.5 text-left transition hover:border-blue-200 hover:bg-blue-50/40"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 font-mono text-[11px] font-bold text-slate-700 group-hover:bg-blue-600 group-hover:text-white transition">
                      {item.uf}
                    </span>
                    <div>
                      <span className="block font-semibold text-[12.5px] text-slate-900 group-hover:text-blue-700">
                        {item.nome}
                      </span>
                      <span className="block text-[11px] text-slate-400">
                        {item.eleitores} eleitores
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 group-hover:bg-blue-100 group-hover:text-blue-800">
                      {item.bancada} dep.
                    </span>
                    <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-600 transition" />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Dica de Ação Rápida */}
          <div className="rounded-xl border border-blue-200/60 bg-blue-50/50 p-3.5 text-[11.5px] text-blue-900 flex items-start gap-2.5">
            <Sparkles size={16} className="text-blue-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <b>Navegação Instantânea:</b> Tocando ou clicando em qualquer estado do mapa ou da lista, o painel abre na hora a malha completa com todos os municípios e o raio-x daquele estado.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
