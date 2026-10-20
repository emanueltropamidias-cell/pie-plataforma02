"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import Image from "next/image";
import {
  Search,
  Check,
  MapPin,
  Building2,
  Globe2,
  ChevronRight,
  User,
  Target,
  Layers,
  TrendingUp,
  Award,
  Users2,
  Compass,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { MapaBrasil } from "@/components/estrategia/mapa-brasil";
import { MapaVotos } from "@/components/estrategia/mapa-votos";
import { DetalheMunicipioEstrategia } from "@/components/estrategia/detalhe-municipio-estrategia";
import { chave, ehDaCasa, fotoDoCandidato, ondeDisputa } from "@/lib/eleicao";
import { CANDIDATO } from "@/lib/candidato";
import UFS from "@/lib/ufs.json";

export interface CandidatoBusca {
  id: number;
  ano: number;
  turno: number;
  uf: string;
  cargo: string;
  numero: number;
  sq_candidato: string | null;
  nm_ue?: string | null;
  nome_urna: string;
  nome_completo: string;
  partido_sigla: string;
  situacao: string;
  foto_url: string | null;
}

export interface RaioXCandidato {
  candidato: CandidatoBusca & {
    total_votos: number;
    municipios_com_voto: number;
  };
  votos_por_municipio: Record<string, number>;
  /** Total por estado — o presidente tem voto em todos. */
  votos_por_uf?: Record<string, number>;
  top_municipios: Array<{
    municipio: string;
    votos: number;
    codigo_tse: string;
  }>;
}

export interface CoberturaEleicao {
  ano: number;
  uf: string;
  candidaturas: number;
  municipios: number;
}

// 30 Partidos Oficiais Registrados no TSE (Fonte Oficial)
export const TRINTA_PARTIDOS_OFICIAIS = [
  { sigla: "TODOS", nome: "Todos os Partidos (30)", cor: "#1d4ed8" },
  { sigla: "PL", nome: "Partido Liberal", cor: "#1d4ed8" },
  { sigla: "PT", nome: "Partido dos Trabalhadores", cor: "#dc2626" },
  { sigla: "UNIÃO", nome: "União Brasil", cor: "#0284c7" },
  { sigla: "PP", nome: "Progressistas", cor: "#0d9488" },
  { sigla: "PSD", nome: "Partido Social Democrático", cor: "#ea580c" },
  { sigla: "REPUBLICANOS", nome: "Republicanos", cor: "#2563eb" },
  { sigla: "MDB", nome: "Movimento Democrático Brasileiro", cor: "#ca8a04" },
  { sigla: "PODE", nome: "Podemos", cor: "#059669" },
  { sigla: "PSB", nome: "Partido Socialista Brasileiro", cor: "#f59e0b" },
  { sigla: "PDT", nome: "Partido Democrático Trabalhista", cor: "#e11d48" },
  { sigla: "PSDB", nome: "Partido da Social Democracia Brasileira", cor: "#3b82f6" },
  { sigla: "PSOL", nome: "Partido Socialismo e Liberdade", cor: "#b91c1c" },
  { sigla: "AVANTE", nome: "Avante", cor: "#0ea5e9" },
  { sigla: "SOLIDARIEDADE", nome: "Solidariedade", cor: "#f97316" },
  { sigla: "NOVO", nome: "Partido Novo", cor: "#ff6600" },
  { sigla: "PRD", nome: "Partido Renovação Democrática", cor: "#4f46e5" },
  { sigla: "PC do B", nome: "Partido Comunista do Brasil", cor: "#be123c" },
  { sigla: "PV", nome: "Partido Verde", cor: "#16a34a" },
  { sigla: "CIDADANIA", nome: "Cidadania", cor: "#ec4899" },
  { sigla: "REDE", nome: "Rede Sustentabilidade", cor: "#14b8a6" },
  { sigla: "PRTB", nome: "Partido Renovador Trabalhista Brasileiro", cor: "#15803d" },
  { sigla: "DC", nome: "Democracia Cristã", cor: "#1e40af" },
  { sigla: "AGIR", nome: "Agir", cor: "#6366f1" },
  { sigla: "PMB", nome: "Partido da Mulher Brasileira", cor: "#9333ea" },
  { sigla: "MOBILIZA", nome: "Mobilização Nacional", cor: "#84cc16" },
  { sigla: "PCB", nome: "Partido Comunista Brasileiro", cor: "#991b1b" },
  { sigla: "PSTU", nome: "Partido Socialista dos Trabalhadores Unificado", cor: "#b91c1c" },
  { sigla: "PCO", nome: "Partido da Causa Operária", cor: "#991b1b" },
  { sigla: "UP", nome: "Unidade Popular", cor: "#059669" },
  { sigla: "PMN", nome: "Partido da Mobilização Nacional", cor: "#c026d3" },
];

const ESTADOS_BR = [{ uf: "BR", nome: "Brasil (Visão Nacional)" }, ...UFS];
const ANOS = [2026, 2024, 2022];

export function PainelEstrategiaEleitoral({
  candidatoInicial,
  cidadesComBase,
  cobertura,
}: {
  candidatoInicial: RaioXCandidato;
  cidadesComBase: string[];
  cobertura?: CoberturaEleicao[] | null;
}) {
  const [raioX, setRaioX] = useState<RaioXCandidato>(candidatoInicial);

  // Filtros
  const [anoFiltro, setAnoFiltro] = useState<number>(raioX.candidato.ano || 2022);
  const [cargoFiltro, setCargoFiltro] = useState<string>("TODOS");
  const [ufFiltro, setUfFiltro] = useState<string>(raioX.candidato.uf || "BA");
  const [partidoFiltro, setPartidoFiltro] = useState<string>("TODOS");

  // Camadas de Navegação
  const [camada, setCamada] = useState<"brasil" | "estado" | "municipio">("estado");
  const [municipioSelecionado, setMunicipioSelecionado] = useState<string | null>(null);

  // Busca e Autocomplete
  const [busca, setBusca] = useState("");
  const [sugestoesBrutas, setSugestoes] = useState<CandidatoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const [fotoErro, setFotoErro] = useState(false);
  const [, startTransition] = useTransition();

  const sugestoes = busca.trim().length >= 2 ? sugestoesBrutas : [];
  const cSet = useMemo(() => new Set(cidadesComBase.map(chave)), [cidadesComBase]);

  // Cobertura do TSE
  const semCobertura = !cobertura;
  const ufsDeAno = (a: number) =>
    semCobertura ? UFS.map((u) => u.uf) : cobertura.filter((c) => c.ano === a).map((c) => c.uf);
  const ufsDoAno = ufsDeAno(anoFiltro);

  // Opções de cargos conforme ano
  const opcoesCargos =
    anoFiltro % 4 === 0
      ? [
          { valor: "TODOS", rotulo: "Todos os Cargos Municipais" },
          { valor: "PREFEITO", rotulo: "Prefeito" },
          { valor: "VEREADOR", rotulo: "Vereador" },
        ]
      : [
          { valor: "TODOS", rotulo: "Todos os Cargos Gerais" },
          { valor: "DEPUTADO ESTADUAL", rotulo: "Deputado Estadual" },
          { valor: "DEPUTADO FEDERAL", rotulo: "Deputado Federal" },
          { valor: "SENADOR", rotulo: "Senador" },
          { valor: "GOVERNADOR", rotulo: "Governador" },
          { valor: "PRESIDENTE", rotulo: "Presidente" },
        ];

  // Busca inteligente via API
  useEffect(() => {
    if (!busca || busca.trim().length < 2) return;

    const timer = setTimeout(async () => {
      setBuscando(true);
      try {
        const urlParams = new URLSearchParams({
          q: busca.trim(),
          ano: String(anoFiltro),
          uf: ufFiltro,
        });
        if (cargoFiltro !== "TODOS") urlParams.set("cargo", cargoFiltro);

        const res = await fetch(`/api/eleicao?${urlParams.toString()}`);
        const data = await res.json();
        let list: CandidatoBusca[] = data.candidatos || [];
        if (partidoFiltro !== "TODOS") {
          list = list.filter((c) => c.partido_sigla?.toUpperCase() === partidoFiltro);
        }
        setSugestoes(list);
        setMenuAberto(true);
      } catch (err) {
        console.error("Erro ao buscar candidatos:", err);
      } finally {
        setBuscando(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [busca, anoFiltro, ufFiltro, cargoFiltro, partidoFiltro]);

  async function selecionarCandidato(cand: CandidatoBusca) {
    setMenuAberto(false);
    setBusca("");
    setFotoErro(false);
    try {
      const res = await fetch(`/api/eleicao?candidatoId=${cand.id}`);
      abrirRaioX(await res.json());
    } catch (err) {
      console.error("Erro ao carregar raio-x do candidato:", err);
    }
  }

  function abrirRaioX(data: RaioXCandidato | null, camadaDestino?: "brasil" | "estado", ufMapa?: string) {
    if (!data?.candidato) return;
    setFotoErro(false);
    startTransition(() => {
      setRaioX(data);
      setAnoFiltro(data.candidato.ano);
      // Presidente é do "BR", mas o mapa estadual precisa de um estado.
      setUfFiltro(ufMapa ?? data.candidato.uf);
      setCargoFiltro(data.candidato.cargo);
      setCamada(camadaDestino ?? (data.candidato.cargo === "PRESIDENTE" ? "brasil" : "estado"));
      setMunicipioSelecionado(null);
    });
  }

  // Trocar de eleição ou de cargo sempre muda o card para alguém DAQUELA
  // eleição: a candidatura da casa, se ela concorreu (e ao cargo pedido), e
  // senão o mais votado. Sem isso o card ficava parado — em 2024 seguia
  // mostrando a Talita, que não foi candidata.
  async function trocarEleicao(novoAno: number, novoCargo: string) {
    setAnoFiltro(novoAno);
    setCargoFiltro(novoCargo);
    try {
      const q = new URLSearchParams({ ano: String(novoAno), uf: CANDIDATO.uf, q: CANDIDATO.numeroUrna, exato: "1" });
      const achados = (await (await fetch(`/api/eleicao?${q}`)).json()).candidatos as CandidatoBusca[] | undefined;
      const daCasa = achados?.find(
        (c) => c.ano === novoAno && ehDaCasa(c) && (novoCargo === "TODOS" || c.cargo === novoCargo),
      );
      if (daCasa && (ufFiltro === CANDIDATO.uf || ufFiltro === "BR")) return await selecionarCandidato(daCasa);

      const uf = ufFiltro !== "BR" && ufsDeAno(novoAno).includes(ufFiltro) ? ufFiltro : CANDIDATO.uf;
      const d = new URLSearchParams({ destaque: "1", ano: String(novoAno), uf });
      if (novoCargo !== "TODOS") d.set("cargo", novoCargo);
      abrirRaioX(await (await fetch(`/api/eleicao?${d}`)).json());
    } catch (err) {
      console.error("Erro ao trocar de eleição:", err);
    }
  }

  // Abrir um estado (clique no mapa do Brasil ou seletor) mostra aquele
  // estado de verdade: o presidente com os votos dele lá; os demais cargos,
  // o mais votado daquele estado no mesmo cargo. Antes só trocava a malha e
  // deixava os votos do candidato da Bahia — Minas aparecia vazia.
  async function transitarParaEstado(uf: string) {
    setMunicipioSelecionado(null);
    if (uf === "BR") {
      setCamada("brasil");
      return;
    }
    setUfFiltro(uf);
    setCamada("estado");
    try {
      const c = raioX.candidato;
      if (c.uf === "BR" || c.cargo === "PRESIDENTE") {
        const q = new URLSearchParams({ candidatoId: String(c.id), uf });
        return abrirRaioX(await (await fetch(`/api/eleicao?${q}`)).json(), "estado", uf);
      }
      if (c.uf === uf) return;
      const d = new URLSearchParams({ destaque: "1", ano: String(anoFiltro), uf });
      const cargo = cargoFiltro !== "TODOS" ? cargoFiltro : c.cargo;
      if (cargo) d.set("cargo", cargo);
      abrirRaioX(await (await fetch(`/api/eleicao?${d}`)).json(), "estado");
    } catch (err) {
      console.error("Erro ao abrir o estado:", err);
    }
  }

  function transitarParaMunicipio(mun: string) {
    setMunicipioSelecionado(mun);
    setCamada("municipio");
  }

  // O mapa manda o nome como está na malha ("Salvador"); os votos vêm com o
  // nome do TSE ("SALVADOR"). Comparar literal abria a cidade com zero votos.
  const municipioNoBanco = municipioSelecionado
    ? (Object.keys(raioX.votos_por_municipio).find((m) => chave(m) === chave(municipioSelecionado)) ??
      municipioSelecionado.toUpperCase())
    : null;
  const posicaoNoRanking = municipioNoBanco
    ? Object.entries(raioX.votos_por_municipio)
        .sort((a, b) => b[1] - a[1])
        .findIndex(([m]) => m === municipioNoBanco) + 1 || undefined
    : undefined;

  // Cálculos do candidato ativo
  const totalVotos = raioX.candidato.total_votos || 0;
  const top10 = raioX.top_municipios.slice(0, 10);
  const top5 = top10.slice(0, 5);
  const votosTop10 = top10.reduce((s, m) => s + m.votos, 0);
  const concentracao = totalVotos > 0 ? (votosTop10 / totalVotos) * 100 : 0;
  const maiorVotoTopo = top5[0]?.votos || 1;

  const lacunas = Object.entries(raioX.votos_por_municipio)
    .filter(([mun, v]) => v > 0 && !cSet.has(chave(mun)))
    .map(([municipio, votos]) => ({ municipio, votos }))
    .sort((a, b) => b.votos - a.votos);

  const votosSemRede = lacunas.reduce((s, l) => s + l.votos, 0);
  const fotoSrc = fotoErro ? null : fotoDoCandidato(raioX.candidato);

  return (
    <div className="space-y-5">
      {/* ── 1. HEADER DE COMANDO EXECUTIVO UNIFICADO (CLEAN) ─────────── */}
      <header className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_4px_20px_rgb(0,0,0,0.02)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          
          {/* Identidade Sóbria do Candidato */}
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
                  {raioX.candidato.cargo} · {ondeDisputa(raioX.candidato)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200/50">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {raioX.candidato.situacao || "REGISTRADO"}
                </span>
              </div>

              <h1 className="mt-1 text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">
                {raioX.candidato.nome_urna}
              </h1>
              <p className="text-[12px] text-slate-500">
                Disputa em {raioX.candidato.uf} · Eleição {raioX.candidato.ano} ·{" "}
                <b className="font-semibold text-slate-800">{totalVotos.toLocaleString("pt-BR")}</b> votos válidos apurados
              </p>
            </div>
          </div>

          {/* Controles de Navegação, Filtros e Busca Spotlight */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Pílula de Navegação de Camadas */}
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

            {/* Alternador de Ano: 2026, 2024, 2022 */}
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50/80 p-1 text-[12px]">
              {ANOS.map((ano) => (
                <button
                  key={ano}
                  onClick={() => trocarEleicao(ano, "TODOS")}
                  className={`rounded-lg px-2.5 py-1 font-bold transition flex items-center gap-1 ${
                    anoFiltro === ano
                      ? ano === 2026
                        ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm"
                        : "bg-blue-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {ano === 2026 && <Sparkles size={11} />}
                  {ano}
                </button>
              ))}
            </div>

            {/* Seletor de Estado */}
            <select
              value={ufFiltro}
              onChange={(e) => transitarParaEstado(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-500"
            >
              {ESTADOS_BR.map((e) => (
                <option key={e.uf} value={e.uf}>
                  {e.nome} {e.uf !== "BR" ? `(${e.uf})` : ""}
                </option>
              ))}
            </select>

            {/* Seletor de Cargo: trocar abre o mais votado do cargo */}
            <select
              value={opcoesCargos.some((o) => o.valor === cargoFiltro) ? cargoFiltro : "TODOS"}
              onChange={(e) => trocarEleicao(anoFiltro, e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-500"
            >
              {opcoesCargos.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </select>

            {/* Seletor Oficial dos 30 Partidos Registrados no TSE */}
            <select
              value={partidoFiltro}
              onChange={(e) => setPartidoFiltro(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-500"
            >
              <option value="TODOS">Todos os Partidos (30)</option>
              {TRINTA_PARTIDOS_OFICIAIS.filter((p) => p.sigla !== "TODOS").map((p) => (
                <option key={p.sigla} value={p.sigla}>
                  {p.sigla} — {p.nome}
                </option>
              ))}
            </select>

            {/* Campo de Busca Spotlight de Candidatos */}
            <div className="relative w-full sm:w-64">
              <div className="relative">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onFocus={() => sugestoes.length > 0 && setMenuAberto(true)}
                  placeholder="Pesquisar candidato..."
                  className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-9 pr-3 text-[12.5px] outline-none transition focus:border-blue-500 focus:bg-white"
                />
              </div>

              {menuAberto && sugestoes.length > 0 && (
                <div className="absolute left-0 right-0 top-11 z-50 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  {sugestoes.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => selecionarCandidato(c)}
                      className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-slate-50"
                    >
                      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                        {fotoDoCandidato(c) ? (
                          <Image
                            src={fotoDoCandidato(c)!}
                            alt={c.nome_urna}
                            fill
                            sizes="32px"
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-slate-400">
                            {c.nome_urna.slice(0, 2)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 text-[12.5px]">
                            {c.nome_urna}
                          </span>
                          <span className="rounded bg-blue-50 px-1.5 py-0.2 text-[10px] font-bold text-blue-700">
                            {c.partido_sigla} · {c.numero}
                          </span>
                        </div>
                        <span className="block truncate text-[11px] text-slate-500">
                          {c.cargo} · {ondeDisputa(c)}
                        </span>
                      </div>
                      {c.id === raioX.candidato.id && (
                        <Check size={14} className="text-blue-600 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Rodapé contextual discreto se 2026 estiver selecionado */}
        {anoFiltro === 2026 && (
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11.5px] text-slate-500">
            <span className="flex items-center gap-1.5 font-medium">
              <Target size={13} className="text-blue-600" />
              <span>Modo Planejamento: <b>Eleição Geral 2026</b> · Metas de Votação por Polo</span>
            </span>
            {partidoFiltro !== "TODOS" && (
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                Filtro partidário: {partidoFiltro}
              </span>
            )}
          </div>
        )}
      </header>

      {/* ── 2. VISÃO PRINCIPAL: SPLIT-SCREEN (MAPA + INTELIGÊNCIA) ──── */}
      {camada === "brasil" ? (
        <div className="space-y-4">
          <MapaBrasil
            ufAtiva={ufFiltro}
            votosPorUf={raioX.votos_por_uf ?? { [raioX.candidato.uf]: totalVotos }}
            ufsComDados={ufsDoAno}
            onSelecionarUf={transitarParaEstado}
          />
        </div>
      ) : camada === "municipio" && municipioSelecionado ? (
        <DetalheMunicipioEstrategia
          municipio={municipioSelecionado}
          municipioNoBanco={municipioNoBanco}
          candidatoId={raioX.candidato.id}
          ano={raioX.candidato.ano}
          uf={ufFiltro}
          votosMunicipio={municipioNoBanco ? raioX.votos_por_municipio[municipioNoBanco] || 0 : 0}
          posicaoRanking={posicaoNoRanking}
          totalVotosCandidato={totalVotos}
          nomeCandidato={raioX.candidato.nome_urna}
          temLiderancas={cSet.has(chave(municipioSelecionado))}
          onVoltarEstado={() => setCamada("estado")}
        />
      ) : (
        /* CAMADA ESTADUAL COM SPLIT-SCREEN EXECUTIVO */
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          
          {/* COLUNA ESQUERDA (65%): MAPA VETORIAL IMERSIVO */}
          <div className="xl:col-span-8 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_4px_20px_rgb(0,0,0,0.02)] sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                  Mapa Cartográfico Interativo · {ufFiltro}
                </span>
                <h2 className="text-base font-extrabold text-slate-900">
                  Calor da Votação por Município {partidoFiltro !== "TODOS" ? `· ${partidoFiltro}` : ""}
                </h2>
              </div>

              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                Clique na cidade para detalhar
              </span>
            </div>

            {/* O Mapa do Estado com todos os municípios e cores vivas */}
            <div className="relative">
              <MapaVotos
                uf={ufFiltro}
                semRede={lacunas.map((l) => l.municipio)}
                votosPorMunicipio={raioX.votos_por_municipio}
                corTema="#1d4ed8"
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
                  <Award size={14} className="text-blue-600" />
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

            {/* Ranking dos Maiores Redutos Eleitorais */}
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
                      
                      {/* Barra de progresso visual */}
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all duration-300 group-hover:bg-blue-700"
                          style={{ width: `${perc}%` }}
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
