"use client";

import { useState, useEffect, useTransition } from "react";
import Image from "next/image";
import {
  Search,
  Check,
  MapPin,
  Building2,
  Globe2,
  ChevronRight,
  Filter,
  Layers,
  ArrowLeft,
  User,
} from "lucide-react";
import { Indicador, Cartao } from "@/components/ui/pagina";
import { MapaBrasil } from "@/components/estrategia/mapa-brasil";
import { MapaVotos } from "@/components/estrategia/mapa-votos";
import { DetalheMunicipioEstrategia } from "@/components/estrategia/detalhe-municipio-estrategia";
import { chave } from "@/lib/eleicao";

export interface CandidatoBusca {
  id: number;
  ano: number;
  turno: number;
  uf: string;
  cargo: string;
  numero: number;
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
  top_municipios: Array<{
    municipio: string;
    votos: number;
    codigo_tse: string;
  }>;
}

const ESTADOS_BR = [
  { uf: "BR", nome: "Brasil (Nacional)" },
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

export function PainelEstrategiaEleitoral({
  candidatoInicial,
  cidadesComBase,
}: {
  candidatoInicial: RaioXCandidato;
  cidadesComBase: string[];
}) {
  const [raioX, setRaioX] = useState<RaioXCandidato>(candidatoInicial);

  // ── ESTADOS DE FILTRO ─────────────────────────────────────────────
  const [anoFiltro, setAnoFiltro] = useState<number>(raioX.candidato.ano || 2022);
  const [cargoFiltro, setCargoFiltro] = useState<string>("TODOS");
  const [ufFiltro, setUfFiltro] = useState<string>(raioX.candidato.uf || "BA");

  // ── CONTROLE DE CAMADAS (DRILL-DOWN) ──────────────────────────────
  // "brasil" -> "estado" -> "municipio"
  const [camada, setCamada] = useState<"brasil" | "estado" | "municipio">("estado");
  const [municipioSelecionado, setMunicipioSelecionado] = useState<string | null>(null);

  // ── BUSCA AUTOCOMPLETE DE CANDIDATOS ──────────────────────────────
  const [busca, setBusca] = useState("");
  const [sugestoes, setSugestoes] = useState<CandidatoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const [fotoErro, setFotoErro] = useState(false);
  const [, startTransition] = useTransition();

  const cSet = new Set(cidadesComBase.map(chave));

  // Opções de cargos conforme o ano selecionado
  const opcoesCargos =
    anoFiltro === 2024
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

  // Busca na API
  useEffect(() => {
    if (!busca || busca.trim().length < 2) {
      setSugestoes([]);
      return;
    }

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
        setSugestoes(data.candidatos || []);
        setMenuAberto(true);
      } catch (err) {
        console.error("Erro ao buscar candidatos:", err);
      } finally {
        setBuscando(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [busca, anoFiltro, ufFiltro, cargoFiltro]);

  // Ao selecionar um candidato da busca
  async function selecionarCandidato(cand: CandidatoBusca) {
    setMenuAberto(false);
    setBusca("");
    setFotoErro(false);
    try {
      const res = await fetch(`/api/eleicao?candidatoId=${cand.id}`);
      const data: RaioXCandidato = await res.json();
      if (data && data.candidato) {
        startTransition(() => {
          setRaioX(data);
          setAnoFiltro(data.candidato.ano);
          setUfFiltro(data.candidato.uf);
          setCargoFiltro(data.candidato.cargo);
          // Se for cargo estadual, abre na camada de estado; se nacional, brasil
          if (data.candidato.cargo === "PRESIDENTE") {
            setCamada("brasil");
          } else {
            setCamada("estado");
          }
          setMunicipioSelecionado(null);
        });
      }
    } catch (err) {
      console.error("Erro ao carregar raio-x do candidato:", err);
    }
  }

  // Interação: Clicou em um Estado no Mapa do Brasil -> Muda automaticamente para o mapa daquele Estado!
  function transitarParaEstado(uf: string) {
    setUfFiltro(uf);
    setCamada("estado");
    setMunicipioSelecionado(null);
  }

  // Interação: Clicou em um Município no Mapa do Estado -> Muda automaticamente para a camada municipal!
  function transitarParaMunicipio(mun: string) {
    setMunicipioSelecionado(mun);
    setCamada("municipio");
  }

  const totalVotos = raioX.candidato.total_votos || 0;
  const top10 = raioX.top_municipios.slice(0, 10);
  const votosTop10 = top10.reduce((s, m) => s + m.votos, 0);
  const concentracao = totalVotos > 0 ? (votosTop10 / totalVotos) * 100 : 0;
  const maiorVotoTopo = top10[0]?.votos || 1;

  // Cidades com voto e sem liderança
  const lacunas = Object.entries(raioX.votos_por_municipio)
    .filter(([mun, v]) => v > 0 && !cSet.has(chave(mun)))
    .map(([municipio, votos]) => ({ municipio, votos }))
    .sort((a, b) => b.votos - a.votos);

  const votosSemRede = lacunas.reduce((s, l) => s + l.votos, 0);

  // Votação por UF para o mapa do Brasil
  const votosPorUf = {
    [raioX.candidato.uf]: totalVotos,
  };

  // URL da foto via nosso proxy com cache para evitar 403 / CORS do TSE
  const fotoSrc =
    raioX.candidato.foto_url && !fotoErro
      ? `/api/eleicao/foto?url=${encodeURIComponent(raioX.candidato.foto_url)}`
      : null;

  return (
    <div className="space-y-6">
      {/* ── 1. FILTROS GLOBAIS DE ELEIÇÃO, CARGO E ESTADO ───────────── */}
      <div className="rounded-2xl border border-tinta-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-tinta-400">
              <Filter size={13} /> Eleição:
            </span>
            <div className="inline-flex rounded-xl border border-tinta-200 bg-tinta-50/70 p-1">
              {[2022, 2024, 2026].map((ano) => (
                <button
                  key={ano}
                  onClick={() => {
                    setAnoFiltro(ano);
                    setCargoFiltro("TODOS");
                  }}
                  className={`rounded-lg px-3 py-1 text-[12px] font-bold transition ${
                    anoFiltro === ano
                      ? "bg-tema text-white shadow-sm"
                      : "text-tinta-600 hover:text-tinta-900"
                  }`}
                >
                  {ano} {ano === 2026 ? "(1º Turno)" : ""}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Seletor de Cargo */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-tinta-400">
                Cargo:
              </span>
              <select
                value={cargoFiltro}
                onChange={(e) => setCargoFiltro(e.target.value)}
                className="h-8.5 rounded-xl border border-tinta-200 bg-white px-3 text-[12.5px] font-medium text-tinta-800 outline-none transition focus:border-tema"
              >
                {opcoesCargos.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.rotulo}
                  </option>
                ))}
              </select>
            </div>

            {/* Seletor de Estado */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-tinta-400">
                Estado:
              </span>
              <select
                value={ufFiltro}
                onChange={(e) => {
                  const novaUf = e.target.value;
                  setUfFiltro(novaUf);
                  if (novaUf === "BR") {
                    setCamada("brasil");
                  } else {
                    setCamada("estado");
                  }
                  setMunicipioSelecionado(null);
                }}
                className="h-8.5 rounded-xl border border-tinta-200 bg-white px-3 text-[12.5px] font-medium text-tinta-800 outline-none transition focus:border-tema"
              >
                {ESTADOS_BR.map((e) => (
                  <option key={e.uf} value={e.uf}>
                    {e.uf === "BR" ? "🇧🇷 " : "📍 "} {e.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Faixa explicativa do ano selecionado */}
        <div className="mt-3 flex items-center justify-between border-t border-tinta-100 pt-2.5 text-[11.5px]">
          <span className="text-tinta-500">
            {anoFiltro === 2022 && (
              <>
                <b className="text-emerald-700">Eleição Geral 2022:</b> Base oficial completa do TSE apurada com fotos e mapa de calor município a município.
              </>
            )}
            {anoFiltro === 2024 && (
              <>
                <b className="text-blue-700">Eleição Municipal 2024:</b> Cargos de Prefeito e Vereador. Digite o nome de qualquer candidato na busca ao lado.
              </>
            )}
            {anoFiltro === 2026 && (
              <>
                <b className="text-purple-700">Eleição Geral 2026 (1º Turno):</b> Planejamento e metas eleitorais. A busca ao lado pesquisa qualquer candidato histórico do TSE.
              </>
            )}
          </span>
          <span className="text-tinta-400">
            {totalVotos > 0 ? `${totalVotos.toLocaleString("pt-BR")} votos válidos apurados` : "Pronto para análise"}
          </span>
        </div>
      </div>

      {/* ── 2. CARD DO CANDIDATO ATIVO & BUSCA INTELIGENTE ──────────── */}
      <div className="rounded-2xl border border-tinta-200 bg-white p-5 shadow-[0_2px_8px_rgba(22,32,46,0.04)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-tema bg-tinta-100 shadow-sm">
              {fotoSrc ? (
                <Image
                  src={fotoSrc}
                  alt={raioX.candidato.nome_urna}
                  fill
                  sizes="64px"
                  className="object-cover"
                  unoptimized
                  onError={() => setFotoErro(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-bold text-tinta-400">
                  <User size={24} />
                </div>
              )}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-tema/10 px-2 py-0.5 text-[11px] font-bold text-tema">
                  {raioX.candidato.partido_sigla} · {raioX.candidato.numero}
                </span>
                <span className="rounded bg-tinta-100 px-2 py-0.5 text-[11px] font-medium text-tinta-600">
                  {raioX.candidato.cargo}
                </span>
                <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                  {raioX.candidato.situacao || "REGISTRADO"}
                </span>
              </div>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-tinta-900">
                {raioX.candidato.nome_urna}
              </h2>
              <p className="text-[12px] text-tinta-500">
                Eleição {raioX.candidato.ano} ({raioX.candidato.uf}) ·{" "}
                <b className="text-tinta-800">{totalVotos.toLocaleString("pt-BR")}</b> votos válidos apurados
              </p>
            </div>
          </div>

          {/* Autocomplete de Pesquisa */}
          <div className="relative w-full md:w-80">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-tinta-400"
              />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onFocus={() => sugestoes.length > 0 && setMenuAberto(true)}
                placeholder="Pesquisar qualquer candidato (nome ou nº)..."
                className="h-10 w-full rounded-xl border border-tinta-200 bg-tinta-50/50 pl-10 pr-3 text-[13px] outline-none transition focus:border-tema focus:bg-white"
              />
            </div>

            {menuAberto && sugestoes.length > 0 && (
              <div className="absolute left-0 right-0 top-12 z-50 max-h-72 overflow-y-auto rounded-xl border border-tinta-200 bg-white p-1.5 shadow-xl">
                {sugestoes.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => selecionarCandidato(c)}
                    className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-tinta-50"
                  >
                    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-tinta-200 bg-tinta-100">
                      {c.foto_url ? (
                        <Image
                          src={`/api/eleicao/foto?url=${encodeURIComponent(c.foto_url)}`}
                          alt={c.nome_urna}
                          fill
                          sizes="36px"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-tinta-400">
                          {c.nome_urna.slice(0, 2)}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-tinta-900 text-[13px]">
                          {c.nome_urna}
                        </span>
                        <span className="rounded bg-tema/10 px-1.5 py-0.2 text-[10.5px] font-bold text-tema">
                          {c.partido_sigla} · {c.numero}
                        </span>
                        {c.ano !== anoFiltro && (
                          <span className="rounded bg-amber-50 px-1.5 py-0.2 text-[10px] font-bold text-amber-700">
                            {c.ano}
                          </span>
                        )}
                      </div>
                      <span className="block truncate text-[11px] text-tinta-500">
                        {c.cargo} · {c.uf}
                      </span>
                    </div>
                    {c.id === raioX.candidato.id && (
                      <Check size={16} className="text-tema shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
            {buscando && (
              <span className="absolute right-3 top-2.5 text-[11px] text-tinta-400">
                Buscando...
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── 3. NAVEGAÇÃO DE CAMADAS (BREADCRUMB DRILL-DOWN) ─────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-tema/20 bg-tema/[0.03] px-4 py-3">
        <div className="flex items-center gap-2 text-[12.5px]">
          <span className="flex items-center gap-1 font-bold text-tema">
            <Layers size={15} /> Camadas:
          </span>

          {/* Botão Camada 1: Brasil */}
          <button
            onClick={() => {
              setCamada("brasil");
              setMunicipioSelecionado(null);
            }}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-bold transition ${
              camada === "brasil"
                ? "bg-tema text-white shadow-sm"
                : "bg-white text-tinta-700 hover:bg-tinta-100"
            }`}
          >
            <Globe2 size={13} />
            Brasil
          </button>

          <ChevronRight size={14} className="text-tinta-400" />

          {/* Botão Camada 2: Estado */}
          <button
            onClick={() => {
              setCamada("estado");
              setMunicipioSelecionado(null);
            }}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-bold transition ${
              camada === "estado"
                ? "bg-tema text-white shadow-sm"
                : "bg-white text-tinta-700 hover:bg-tinta-100"
            }`}
          >
            <MapPin size={13} />
            {ufFiltro === "BR" ? "Bahia (BA)" : ufFiltro}
          </button>

          {/* Botão Camada 3: Município (se houver cidade selecionada) */}
          {municipioSelecionado && (
            <>
              <ChevronRight size={14} className="text-tinta-400" />
              <button
                onClick={() => setCamada("municipio")}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-bold transition ${
                  camada === "municipio"
                    ? "bg-tema text-white shadow-sm"
                    : "bg-white text-tinta-700 hover:bg-tinta-100"
                }`}
              >
                <Building2 size={13} />
                {municipioSelecionado}
              </button>
            </>
          )}
        </div>

        {camada !== "brasil" && (
          <button
            onClick={() => {
              if (camada === "municipio") setCamada("estado");
              else setCamada("brasil");
            }}
            className="flex items-center gap-1 text-[11.5px] font-bold text-tinta-500 hover:text-tema transition"
          >
            <ArrowLeft size={13} />
            Subir um nível
          </button>
        )}
      </div>

      {/* ── 4. RENDERIZAÇÃO DA CAMADA ATIVA ─────────────────────────── */}

      {/* CAMADA 1: MAPA DO BRASIL */}
      {camada === "brasil" && (
        <div className="space-y-4">
          <MapaBrasil
            ufAtiva={ufFiltro}
            votosPorUf={votosPorUf}
            onSelecionarUf={transitarParaEstado}
          />
        </div>
      )}

      {/* CAMADA 2: MAPA DO ESTADO */}
      {camada === "estado" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador
              rotulo={`Votos em ${raioX.candidato.ano}`}
              valor={totalVotos.toLocaleString("pt-BR")}
              contexto={`em ${raioX.candidato.municipios_com_voto} cidades de ${raioX.candidato.uf}`}
              destaque
            />
            <Indicador
              rotulo="Nos 10 maiores redutos"
              valor={`${concentracao.toFixed(0)}%`}
              contexto={`${votosTop10.toLocaleString("pt-BR")} votos nos principais polos`}
            />
            <Indicador
              rotulo="Voto sem rede"
              valor={votosSemRede.toLocaleString("pt-BR")}
              contexto={`${lacunas.length} municípios com voto sem liderança`}
            />
            <Indicador
              rotulo="Presença Eleitoral"
              valor={`${((raioX.candidato.municipios_com_voto / 417) * 100).toFixed(0)}%`}
              contexto="cobertura do território estadual"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-tema">
                  Camada 2 · Estadual ({ufFiltro})
                </span>
                <h3 className="text-base font-extrabold text-tinta-900">
                  Mapa de Calor por Município
                </h3>
                <p className="text-[12px] text-tinta-500">
                  Clique em qualquer município (como Salvador) para descer automaticamente à{" "}
                  <b>Camada 3 (Municipal)</b>.
                </p>
              </div>
            </div>

            <MapaVotos
              semRede={lacunas.map((l) => l.municipio)}
              votosPorMunicipio={raioX.votos_por_municipio}
              onAbrirMunicipio={transitarParaMunicipio}
            />
          </div>

          {/* Cards de Maiores Votações e Oportunidades */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Cartao
              titulo="Maiores Redutos Eleitorais"
              descricao="Clique em qualquer polo para abrir a Camada 3"
            >
              <div className="space-y-2 px-5 py-4">
                {top10.map((m, i) => (
                  <button
                    key={m.municipio}
                    onClick={() => transitarParaMunicipio(m.municipio)}
                    className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition hover:bg-tinta-50"
                  >
                    <span className="tabular w-5 shrink-0 text-[11px] font-bold text-tinta-300">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-bold text-tinta-800">
                        {m.municipio}
                      </span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-tinta-100">
                        <span
                          className="block h-full rounded-full bg-tema"
                          style={{
                            width: `${Math.max(4, (m.votos / maiorVotoTopo) * 100)}%`,
                          }}
                        />
                      </span>
                    </span>
                    <span className="tabular w-16 shrink-0 text-right text-[12.5px] font-bold text-tinta-900">
                      {m.votos.toLocaleString("pt-BR")}
                    </span>
                  </button>
                ))}
              </div>
            </Cartao>

            <Cartao
              titulo="Oportunidades: Votos Sem Rede"
              descricao="Municípios com votação expressiva onde a campanha ainda não tem liderança"
            >
              <div className="space-y-2 px-5 py-4">
                {lacunas.slice(0, 10).map((l, i) => (
                  <button
                    key={l.municipio}
                    onClick={() => transitarParaMunicipio(l.municipio)}
                    className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left transition hover:bg-amber-50/50"
                  >
                    <span className="tabular w-5 shrink-0 text-[11px] font-bold text-amber-500">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-tinta-800">
                      {l.municipio}
                    </span>
                    <span className="tabular shrink-0 text-[12.5px] font-bold text-amber-600">
                      {l.votos.toLocaleString("pt-BR")}
                    </span>
                    <span className="shrink-0 text-[11px] text-tinta-400">votos</span>
                  </button>
                ))}
              </div>
            </Cartao>
          </div>
        </div>
      )}

      {/* CAMADA 3: MUNICIPAL */}
      {camada === "municipio" && municipioSelecionado && (
        <DetalheMunicipioEstrategia
          municipio={municipioSelecionado}
          uf={ufFiltro}
          votosMunicipio={raioX.votos_por_municipio[municipioSelecionado] || 0}
          totalVotosCandidato={totalVotos}
          nomeCandidato={raioX.candidato.nome_urna}
          posicaoRanking={
            top10.findIndex((m) => m.municipio.toLowerCase() === municipioSelecionado.toLowerCase()) + 1 || undefined
          }
          temLiderancas={cSet.has(chave(municipioSelecionado))}
          onVoltarEstado={() => setCamada("estado")}
        />
      )}

      {/* Rodapé Oficial de Dados */}
      <div className="rounded-xl border border-tinta-200 bg-tinta-50/50 p-4 text-[11.5px] text-tinta-500">
        <p className="font-semibold text-tinta-700">Fonte Oficial do TSE:</p>
        <p className="mt-0.5">
          Tribunal Superior Eleitoral (dadosabertos.tse.jus.br). Ingestão consolidada por município e camada. Fotos oficiais sob licença pública do TSE.
        </p>
      </div>
    </div>
  );
}
