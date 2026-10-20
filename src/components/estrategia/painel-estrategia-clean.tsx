"use client";

import { useState, useTransition, useMemo } from "react";
import Image from "next/image";
import {
  Search,
  Check,
  MapPin,
  Building2,
  Globe2,
  ChevronRight,
  TrendingUp,
  Award,
  Users2,
  Compass,
  ArrowUpRight,
  User,
  Sparkles,
  Target,
  Layers,
} from "lucide-react";
import { MapaBrasil } from "@/components/estrategia/mapa-brasil";
import { MapaVotos } from "@/components/estrategia/mapa-votos";
import { DetalheMunicipioEstrategia } from "@/components/estrategia/detalhe-municipio-estrategia";
import type { RaioXCandidato, CandidatoBusca } from "./painel-estrategia-eleitoral";
import { chave, fotoDoCandidato } from "@/lib/eleicao";

const ESTADOS_BR = [
  { uf: "BR", nome: "Brasil (Visão Nacional)" },
  { uf: "BA", nome: "Bahia" },
  { uf: "SP", nome: "São Paulo" },
  { uf: "RJ", nome: "Rio de Janeiro" },
  { uf: "MG", nome: "Minas Gerais" },
  { uf: "PE", nome: "Pernambuco" },
  { uf: "CE", nome: "Ceará" },
  { uf: "PR", nome: "Paraná" },
  { uf: "RS", nome: "Rio Grande do Sul" },
  { uf: "SC", nome: "Santa Catarina" },
  { uf: "GO", nome: "Goiás" },
  { uf: "DF", nome: "Distrito Federal" },
  { uf: "ES", nome: "Espírito Santo" },
  { uf: "MA", nome: "Maranhão" },
  { uf: "PB", nome: "Paraíba" },
  { uf: "PA", nome: "Pará" },
  { uf: "RN", nome: "Rio Grande do Norte" },
  { uf: "AL", nome: "Alagoas" },
  { uf: "PI", nome: "Piauí" },
  { uf: "MT", nome: "Mato Grosso" },
  { uf: "MS", nome: "Mato Grosso do Sul" },
  { uf: "SE", nome: "Sergipe" },
  { uf: "RO", nome: "Rondônia" },
  { uf: "TO", nome: "Tocantins" },
  { uf: "AC", nome: "Acre" },
  { uf: "AP", nome: "Amapá" },
  { uf: "RR", nome: "Roraima" },
  { uf: "AM", nome: "Amazonas" },
];

export const TODOS_PARTIDOS = [
  { sigla: "TODOS", nome: "Todos os Partidos (30)", cor: "#1d4ed8" },
  { sigla: "PL", nome: "Partido Liberal", cor: "#1d4ed8" },
  { sigla: "UNIÃO", nome: "União Brasil", cor: "#0284c7" },
  { sigla: "PT", nome: "Partido dos Trabalhadores", cor: "#dc2626" },
  { sigla: "PP", nome: "Progressistas", cor: "#0d9488" },
  { sigla: "PSD", nome: "Partido Social Democrático", cor: "#ea580c" },
  { sigla: "REPUBLICANOS", nome: "Republicanos", cor: "#2563eb" },
  { sigla: "MDB", nome: "Movimento Democrático Brasileiro", cor: "#ca8a04" },
  { sigla: "AVANTE", nome: "Avante", cor: "#0ea5e9" },
  { sigla: "PODE", nome: "Podemos", cor: "#059669" },
  { sigla: "PSB", nome: "Partido Socialista Brasileiro", cor: "#f59e0b" },
  { sigla: "PDT", nome: "Partido Democrático Trabalhista", cor: "#e11d48" },
  { sigla: "PSDB", nome: "Partido da Social Democracia Brasileira", cor: "#3b82f6" },
  { sigla: "SOLIDARIEDADE", nome: "Solidariedade", cor: "#f97316" },
  { sigla: "PSOL", nome: "Partido Socialismo e Liberdade", cor: "#b91c1c" },
  { sigla: "PC do B", nome: "Partido Comunista do Brasil", cor: "#be123c" },
  { sigla: "PV", nome: "Partido Verde", cor: "#16a34a" },
  { sigla: "CIDADANIA", nome: "Cidadania", cor: "#ec4899" },
  { sigla: "NOVO", nome: "Partido Novo", cor: "#ff6600" },
  { sigla: "REDE", nome: "Rede Sustentabilidade", cor: "#14b8a6" },
  { sigla: "PRD", nome: "Partido Renovação Democrática", cor: "#4f46e5" },
  { sigla: "PRTB", nome: "Partido Renovador Trabalhista Brasileiro", cor: "#15803d" },
  { sigla: "DC", nome: "Democracia Cristã", cor: "#1e40af" },
  { sigla: "AGIR", nome: "Agir", cor: "#6366f1" },
  { sigla: "PMB", nome: "Partido da Mulher Brasileira", cor: "#9333ea" },
  { sigla: "MOBILIZA", nome: "Mobilização Nacional", cor: "#84cc16" },
  { sigla: "PMN", nome: "Partido da Mobilização Nacional", cor: "#c026d3" },
  { sigla: "PCO", nome: "Partido da Causa Operária", cor: "#991b1b" },
  { sigla: "PSC", nome: "Partido Social Cristão", cor: "#2563eb" },
  { sigla: "PTB", nome: "Partido Trabalhista Brasileiro", cor: "#0284c7" },
  { sigla: "PATRIOTA", nome: "Patriota", cor: "#166534" },
  { sigla: "PROS", nome: "Partido Republicano da Ordem Social", cor: "#f59e0b" },
];

const PARTIDOS_PILULAS = [
  "TODOS", "PL", "UNIÃO", "PT", "PP", "PSD", "REPUBLICANOS", "MDB", "AVANTE", "PODE", "PSDB", "PDT", "PSB", "NOVO", "PSOL"
];

export function PainelEstrategiaClean({
  candidatoInicial,
  cidadesComBase = [],
}: {
  candidatoInicial: RaioXCandidato;
  cidadesComBase?: string[];
}) {
  const [raioX, setRaioX] = useState<RaioXCandidato>(candidatoInicial);
  const [anoFiltro, setAnoFiltro] = useState<number>(2026); // Default 2026 ou 2022
  const [ufFiltro, setUfFiltro] = useState<string>(raioX.candidato.uf || "BA");
  const [camada, setCamada] = useState<"brasil" | "estado" | "municipio">("estado");
  const [municipioSelecionado, setMunicipioSelecionado] = useState<string | null>(null);

  // Filtro de Partido
  const [partidoFiltro, setPartidoFiltro] = useState<string>("TODOS");

  // Busca e Autocomplete
  const [busca, setBusca] = useState("");
  const [sugestoes, setSugestoes] = useState<CandidatoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const [fotoErro, setFotoErro] = useState(false);
  const [, startTransition] = useTransition();

  const cSet = useMemo(() => new Set(cidadesComBase.map(chave)), [cidadesComBase]);

  // Cor ativa do tema
  const corTemaAtiva = useMemo(() => {
    const achou = TODOS_PARTIDOS.find((p) => p.sigla === partidoFiltro);
    return achou ? achou.cor : "#1d4ed8";
  }, [partidoFiltro]);

  // Cálculos do candidato atual
  const totalVotos = raioX.candidato.total_votos || 0;
  const top10 = raioX.top_municipios.slice(0, 10);
  const top5 = top10.slice(0, 5);
  const votosTop10 = top10.reduce((s, m) => s + m.votos, 0);
  const concentracao = totalVotos > 0 ? (votosTop10 / totalVotos) * 100 : 0;
  const maiorVotoTopo = top5[0]?.votos || 1;

  // Lacunas (cidades com votos onde não há liderança formal)
  const lacunas = Object.entries(raioX.votos_por_municipio)
    .filter(([mun, v]) => v > 0 && !cSet.has(chave(mun)))
    .map(([municipio, votos]) => ({ municipio, votos }))
    .sort((a, b) => b.votos - a.votos);

  const votosSemRede = lacunas.reduce((s, l) => s + l.votos, 0);
  const fotoSrc = fotoErro ? null : fotoDoCandidato(raioX.candidato);

  // Transições de nível
  function transitarParaEstado(uf: string) {
    setUfFiltro(uf);
    setCamada("estado");
    setMunicipioSelecionado(null);
  }

  function transitarParaMunicipio(mun: string) {
    setMunicipioSelecionado(mun);
    setCamada("municipio");
  }

  return (
    <div className="space-y-5">
      {/* ── 1. HEADER DE COMANDO EXECUTIVO UNIFICADO ─────────────────── */}
      <header className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_4px_20px_rgb(0,0,0,0.02)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          
          {/* Identidade do Candidato Ativo */}
          <div className="flex items-center gap-3.5">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-slate-200 bg-slate-100 shadow-sm">
              {fotoSrc ? (
                <Image
                  src={fotoSrc}
                  alt={raioX.candidato.nome_urna}
                  fill
                  sizes="56px"
                  className="object-cover"
                  unoptimized
                  onError={() => setFotoErro(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-bold text-slate-400">
                  <User size={22} />
                </div>
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-200/60">
                  {raioX.candidato.partido_sigla} · {raioX.candidato.numero}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  {raioX.candidato.cargo}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200/50">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {raioX.candidato.situacao || "ELEITO"}
                </span>
              </div>

              <h1 className="mt-1 text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">
                {raioX.candidato.nome_urna}
              </h1>
              <p className="text-[12px] text-slate-500">
                Disputa em {raioX.candidato.uf} · Eleição {raioX.candidato.ano} ·{" "}
                <b className="font-semibold text-slate-800">{totalVotos.toLocaleString("pt-BR")}</b> votos válidos
              </p>
            </div>
          </div>

          {/* Controles de Topo: Camadas, Anos e Seletor de UF */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Pílula de Navegação de Níveis */}
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50/80 p-1 text-[12px]">
              <button
                onClick={() => {
                  setCamada("brasil");
                  setMunicipioSelecionado(null);
                }}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition ${
                  camada === "brasil"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Globe2 size={13} />
                Brasil
              </button>

              <ChevronRight size={13} className="text-slate-300" />

              <button
                onClick={() => {
                  setCamada("estado");
                  setMunicipioSelecionado(null);
                }}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition ${
                  camada === "estado"
                    ? "bg-white text-blue-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <MapPin size={13} />
                {ufFiltro === "BR" ? "Bahia" : ufFiltro}
              </button>

              {municipioSelecionado && (
                <>
                  <ChevronRight size={13} className="text-slate-300" />
                  <button
                    onClick={() => setCamada("municipio")}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold transition ${
                      camada === "municipio"
                        ? "bg-white text-blue-700 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Building2 size={13} />
                    {municipioSelecionado}
                  </button>
                </>
              )}
            </div>

            {/* Alternador de Ano: 2026 (Meta/Projeção), 2024, 2022 */}
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50/80 p-1 text-[12px]">
              {[
                { ano: 2026, rotulo: "2026 Meta" },
                { ano: 2024, rotulo: "2024" },
                { ano: 2022, rotulo: "2022" },
              ].map(({ ano, rotulo }) => (
                <button
                  key={ano}
                  onClick={() => setAnoFiltro(ano)}
                  className={`rounded-lg px-2.5 py-1 font-bold transition flex items-center gap-1 ${
                    anoFiltro === ano
                      ? ano === 2026
                        ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm"
                        : "bg-blue-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {ano === 2026 && <Sparkles size={11} />}
                  {rotulo}
                </button>
              ))}
            </div>

            {/* Seletor rápido de Estado */}
            {/* Seletor rápido de Estado */}
            <select
              value={ufFiltro}
              onChange={(e) => {
                const uf = e.target.value;
                setUfFiltro(uf);
                if (uf === "BR") setCamada("brasil");
                else setCamada("estado");
                setMunicipioSelecionado(null);
              }}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-500"
            >
              {ESTADOS_BR.map((e) => (
                <option key={e.uf} value={e.uf}>
                  {e.nome} {e.uf !== "BR" ? `(${e.uf})` : ""}
                </option>
              ))}
            </select>

            {/* Seletor de Partido Clean e Executivo (31 Partidos) */}
            <select
              value={partidoFiltro}
              onChange={(e) => setPartidoFiltro(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-500"
            >
              <option value="TODOS">Todos os Partidos (31)</option>
              {TODOS_PARTIDOS.filter((p) => p.sigla !== "TODOS").map((p) => (
                <option key={p.sigla} value={p.sigla}>
                  {p.sigla} — {p.nome}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Rodapé discreto se 2026 estiver ativo */}
        {anoFiltro === 2026 && (
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11.5px] text-slate-500">
            <span className="flex items-center gap-1.5 font-medium">
              <Target size={13} className="text-blue-600" />
              <span>Modo Planejamento: <b>Eleição Geral 2026</b> · Metas de Votação por Município</span>
            </span>
            {partidoFiltro !== "TODOS" && (
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                Filtro ativo: {partidoFiltro}
              </span>
            )}
          </div>
        )}
      </header>

      {/* ── 2. VISÃO PRINCIPAL: SPLIT SCREEN (MAPA + INTELIGÊNCIA) ─── */}
      {camada === "brasil" ? (
        <div className="space-y-4">
          <MapaBrasil
            ufAtiva={ufFiltro}
            votosPorUf={{ [raioX.candidato.uf]: totalVotos }}
            ufsComDados={["BA", "SP", "RJ", "MG"]}
            onSelecionarUf={transitarParaEstado}
          />
        </div>
      ) : camada === "municipio" && municipioSelecionado ? (
        <DetalheMunicipioEstrategia
          municipio={municipioSelecionado}
          municipioNoBanco={municipioSelecionado}
          candidatoId={raioX.candidato.id}
          ano={anoFiltro}
          uf={ufFiltro}
          votosMunicipio={raioX.votos_por_municipio[municipioSelecionado] || 0}
          totalVotosCandidato={totalVotos}
          nomeCandidato={raioX.candidato.nome_urna}
          temLiderancas={cSet.has(chave(municipioSelecionado))}
          onVoltarEstado={() => setCamada("estado")}
        />
      ) : (
        /* CAMADA ESTADUAL COM SPLIT-SCREEN EXECUTIVO E CORES VIVAS */
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          
          {/* COLUNA ESQUERDA (65%): MAPA VETORIAL IMERSIVO COM CORES VIVAS */}
          <div className="xl:col-span-8 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_4px_20px_rgb(0,0,0,0.02)] sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <span
                  className="text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: corTemaAtiva }}
                >
                  Mapa Cartográfico Interativo · {ufFiltro}
                </span>
                <h2 className="text-base font-extrabold text-slate-900">
                  Calor da Votação por Município {partidoFiltro !== "TODOS" ? `· ${partidoFiltro}` : ""}
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                  Clique na cidade para detalhar
                </span>
              </div>
            </div>

            {/* O Mapa do Estado com todos os municípios e cores vivas */}
            <div className="relative">
              <MapaVotos
                uf={ufFiltro}
                semRede={lacunas.map((l) => l.municipio)}
                votosPorMunicipio={raioX.votos_por_municipio}
                corTema={corTemaAtiva}
                onAbrirMunicipio={transitarParaMunicipio}
              />
            </div>
          </div>

          {/* COLUNA DIREITA (35%): PAINEL DE INTELIGÊNCIA E REDUTOS */}
          <div className="xl:col-span-4 space-y-4">
            
            {/* 4 Métricas Executivas em Grid Compacto */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider">Votos Totais</span>
                  <Award size={14} style={{ color: corTemaAtiva }} />
                </div>
                <div className="mt-1 text-xl font-extrabold text-slate-900">
                  {totalVotos.toLocaleString("pt-BR")}
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  em {raioX.candidato.municipios_com_voto} cidades
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider">Concentração</span>
                  <TrendingUp size={14} className="text-emerald-600" />
                </div>
                <div className="mt-1 text-xl font-extrabold text-slate-900">
                  {concentracao.toFixed(0)}%
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  nos 10 maiores polos
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider">Sem Liderança</span>
                  <Users2 size={14} className="text-amber-500" />
                </div>
                <div className="mt-1 text-xl font-extrabold text-slate-900">
                  {votosSemRede.toLocaleString("pt-BR")}
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  em {lacunas.length} municípios
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider">Presença</span>
                  <Compass size={14} className="text-purple-600" />
                </div>
                <div className="mt-1 text-xl font-extrabold text-slate-900">
                  {Math.round((raioX.candidato.municipios_com_voto / (raioX.candidato.uf === "BA" ? 417 : 100)) * 100)}%
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  de cobertura na UF
                </p>
              </div>
            </div>

            {/* Ranking dos Maiores Redutos Eleitorais com a cor ativa */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="text-[13px] font-bold text-slate-900">
                  Principais Redutos Eleitorais
                </h3>
                <span className="text-[11px] font-medium text-slate-400">Top 5</span>
              </div>

              <div className="space-y-2.5">
                {top5.map((m, i) => {
                  const perc = (m.votos / maiorVotoTopo) * 100;
                  return (
                    <button
                      key={m.municipio}
                      onClick={() => transitarParaMunicipio(m.municipio)}
                      className="group flex w-full flex-col gap-1 rounded-xl p-2 text-left transition hover:bg-slate-50"
                    >
                      <div className="flex items-center justify-between text-[12.5px]">
                        <span className="font-semibold text-slate-800 group-hover:text-blue-600 flex items-center gap-1.5">
                          <span className="text-[11px] font-bold text-slate-400">#{i + 1}</span>
                          {m.municipio}
                        </span>
                        <span className="font-mono font-bold text-slate-700">
                          {m.votos.toLocaleString("pt-BR")}
                        </span>
                      </div>
                      
                      {/* Barra de progresso com a cor viva */}
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${perc}%`,
                            backgroundColor: corTemaAtiva,
                          }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Card de Oportunidades (Voto Sem Rede) */}
            <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/50 to-orange-50/30 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-amber-800 font-bold text-[12.5px]">
                <Sparkles size={15} className="text-amber-600" />
                Votos sem Liderança Cadastrada
              </div>
              <p className="mt-1 text-[11.5px] text-slate-600 leading-relaxed">
                Você teve <b>{votosSemRede.toLocaleString("pt-BR")} votos</b> em {lacunas.length} cidades onde ainda não possui bases formalizadas no CRM.
              </p>
              
              <div className="mt-3 flex flex-wrap gap-1.5">
                {lacunas.slice(0, 3).map((l) => (
                  <span
                    key={l.municipio}
                    onClick={() => transitarParaMunicipio(l.municipio)}
                    className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-amber-300/60 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-900 transition hover:bg-amber-100"
                  >
                    {l.municipio}: {l.votos.toLocaleString("pt-BR")} <ArrowUpRight size={10} />
                  </span>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
