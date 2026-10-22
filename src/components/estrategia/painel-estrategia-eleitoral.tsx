"use client";

import { useState, useEffect, useMemo, useTransition, type ReactNode } from "react";
import Link from "next/link";
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
  Sparkles,
  Map as IconeMapa,
  Scale,
  GitCompare,
  History,
  Wallet,
  Percent,
  ExternalLink,
} from "lucide-react";
import { MapaBrasil } from "@/components/estrategia/mapa-brasil";
import { MapaVotos, type BaseCidade, type MedidaMapa } from "@/components/estrategia/mapa-votos";
import { DetalheMunicipioEstrategia } from "@/components/estrategia/detalhe-municipio-estrategia";
import { AbaEleicao } from "@/components/estrategia/aba-eleicao";
import { AbaComparar } from "@/components/estrategia/aba-comparar";
import { AbaTrajetoria } from "@/components/estrategia/aba-trajetoria";
import { AbaGastos } from "@/components/estrategia/aba-gastos";
import { AbaPerguntar } from "@/components/estrategia/aba-perguntar";
import { SeloResultado, fmt, pct } from "@/components/estrategia/comum";
import { CARGOS_PROPORCIONAIS, chave, fotoDoCandidato, ondeDisputa } from "@/lib/eleicao";
import { municipiosDaUf } from "@/lib/estados";
import { CANDIDATO } from "@/lib/candidato";
import UFS from "@/lib/ufs.json";
import APELIDOS_MUNICIPIOS from "@/lib/municipios-apelidos.json";
import { FotoUrna, SeletorCandidatos } from "@/components/estrategia/seletor-candidatos";

// Central de Estratégia: os dados do TSE de 2022, 2024 e 2026, Brasil inteiro.
//
// ── DUAS CAMADAS (22/10/2026) ───────────────────────────────────────────────
//
// A tela nasceu para a campanha da Talita, e tudo nela pressupunha uma base
// de lideranças: "sem liderança", "voto sem rede", "cadastrar liderança". A
// plataforma passou a ser para qualquer pessoa, e quem chega sem campanha via
// esses números zerados como se fossem informação.
//
//   pública   os dados do TSE — votação, eleição, comparação, trajetória,
//             gastos, perguntas. Vale para qualquer conta.
//   campanha  o cruzamento com a base de quem está logado. Só aparece quando
//             a conta tem pessoas cadastradas em alguma cidade.

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
  /** Eleitores e válidos do cargo por município (null = ainda não importado). */
  base_por_municipio?: Record<string, BaseCidade> | null;
  totais_unidade?: BaseCidade | null;
}

export interface CoberturaEleicao {
  ano: number;
  uf: string;
  candidaturas: number;
  municipios: number;
}

const ESTADOS_BR = [{ uf: "BR", nome: "Brasil (Visão Nacional)" }, ...UFS];
const ANOS = [2026, 2024, 2022];
const MUNICIPAIS = new Set(["PREFEITO", "VEREADOR"]);

type Aba = "mapa" | "eleicao" | "comparar" | "trajetoria" | "gastos" | "perguntar";

const ABAS: { id: Aba; rotulo: string; icone: typeof IconeMapa }[] = [
  { id: "mapa", rotulo: "Mapa", icone: IconeMapa },
  { id: "eleicao", rotulo: "Eleição", icone: Scale },
  { id: "comparar", rotulo: "Comparar", icone: GitCompare },
  { id: "trajetoria", rotulo: "Trajetória", icone: History },
  { id: "gastos", rotulo: "Gastos", icone: Wallet },
  { id: "perguntar", rotulo: "Perguntar", icone: Sparkles },
];

const MEDIDAS: { id: MedidaMapa; rotulo: string }[] = [
  { id: "votos", rotulo: "Votos" },
  { id: "eleitorado", rotulo: "% eleitorado" },
  { id: "validos", rotulo: "% válidos" },
];

const SELECT =
  "h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 outline-none transition hover:border-slate-300 focus:border-blue-500 sm:h-9 sm:w-auto";

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

  // Cargos e partidos que EXISTEM no estado e eleição abertos, vindos do
  // seletor de candidatos. Antes eram 30 partidos escritos à mão.
  const [opcoes, setOpcoes] = useState<{ cargos: { valor: string; n: number }[]; partidos: { valor: string; n: number }[] }>({
    cargos: [],
    partidos: [],
  });

  // Camadas de navegação e abas
  const [camada, setCamada] = useState<"brasil" | "estado" | "municipio">(raioX.candidato.uf === "BR" ? "brasil" : "estado");
  const [municipioSelecionado, setMunicipioSelecionado] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("mapa");
  const [medida, setMedida] = useState<MedidaMapa>("votos");

  // Busca e autocomplete
  const [busca, setBusca] = useState("");
  const [sugestoesBrutas, setSugestoes] = useState<CandidatoBusca[]>([]);
  const [menuAberto, setMenuAberto] = useState(false);
  const [, startTransition] = useTransition();
  const sugestoes = busca.trim().length >= 2 ? sugestoesBrutas : [];

  const cSet = useMemo(() => new Set(cidadesComBase.map(chave)), [cidadesComBase]);
  const campanha = cSet.size > 0;

  // Cobertura do TSE
  const semCobertura = !cobertura;
  const ufsDeAno = (a: number) =>
    semCobertura ? UFS.map((u) => u.uf) : cobertura.filter((c) => c.ano === a).map((c) => c.uf);
  const ufsDoAno = ufsDeAno(anoFiltro);

  // Cargos: os que existem no estado/eleição (do seletor); enquanto ele não
  // responde, a lista padrão do tipo de eleição.
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
  const rotuloCargo = (c: string) => c.charAt(0) + c.slice(1).toLowerCase();
  const cargosDaTela = opcoes.cargos.length
    ? [
        { valor: "TODOS", rotulo: "Todos os cargos" },
        ...opcoes.cargos.map((c) => ({ valor: c.valor, rotulo: `${rotuloCargo(c.valor)} (${c.n})` })),
      ]
    : opcoesCargos;

  // Busca inteligente via API
  useEffect(() => {
    if (!busca || busca.trim().length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const urlParams = new URLSearchParams({ q: busca.trim(), ano: String(anoFiltro), uf: ufFiltro });
        if (cargoFiltro !== "TODOS") urlParams.set("cargo", cargoFiltro);
        const res = await fetch(`/api/eleicao?${urlParams.toString()}`);
        const data = await res.json();
        let list: CandidatoBusca[] = data.candidatos || [];
        if (partidoFiltro !== "TODOS") list = list.filter((c) => c.partido_sigla?.toUpperCase() === partidoFiltro);
        setSugestoes(list);
        setMenuAberto(true);
      } catch (err) {
        console.error("Erro ao buscar candidatos:", err);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [busca, anoFiltro, ufFiltro, cargoFiltro, partidoFiltro]);

  async function selecionarCandidato(cand: CandidatoBusca) {
    setMenuAberto(false);
    setBusca("");
    try {
      const p = new URLSearchParams({ candidatoId: String(cand.id) });
      // Presidente: o mapa segue no estado aberto.
      if (cand.uf === "BR" && ufFiltro !== "BR") p.set("uf", ufFiltro);
      const res = await fetch(`/api/eleicao?${p}`);
      abrirRaioX(await res.json(), undefined, cand.uf === "BR" ? ufFiltro : undefined);
    } catch (err) {
      console.error("Erro ao carregar raio-x do candidato:", err);
    }
  }

  function abrirRaioX(data: RaioXCandidato | null, camadaDestino?: "brasil" | "estado", ufMapa?: string) {
    if (!data?.candidato) return;
    startTransition(() => {
      setRaioX(data);
      setAnoFiltro(data.candidato.ano);
      // Presidente é do "BR", mas o mapa estadual precisa de um estado.
      setUfFiltro(ufMapa ?? data.candidato.uf);
      setCargoFiltro(data.candidato.cargo);
      setCamada(camadaDestino ?? (data.candidato.cargo === "PRESIDENTE" && !ufMapa ? "brasil" : "estado"));
      setMunicipioSelecionado(null);
    });
    // A URL guarda o candidato aberto: dá para mandar o link para alguém.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("c", String(data.candidato.id));
      window.history.replaceState(null, "", url);
    } catch {
      /* sem window (render no servidor) */
    }
  }

  // O mais votado do estado aberto, na eleição (e cargo/partido) do filtro.
  // Trocar de estado, ano, cargo ou partido abre quem ganhou ali — antes abria
  // um candidato sorteado, e quem chegava na tela caía num desconhecido.
  async function abrirDestaque(o: { ano: number; uf: string; cargo: string; partido?: string }) {
    const d = new URLSearchParams({ destaque: "1", ano: String(o.ano), uf: o.uf });
    if (o.cargo !== "TODOS") d.set("cargo", o.cargo);
    if (o.partido && o.partido !== "TODOS") d.set("partido", o.partido);
    try {
      const r = await (await fetch(`/api/eleicao?${d}`)).json();
      if (r?.candidato) return abrirRaioX(r, o.uf === "BR" ? "brasil" : "estado", o.uf === "BR" ? undefined : o.uf);
      // O cargo pedido não existe ali (ex.: governador em 2024): qualquer um.
      if (o.cargo !== "TODOS" || o.partido) return abrirDestaque({ ano: o.ano, uf: o.uf, cargo: "TODOS" });
    } catch (err) {
      console.error("Erro ao abrir o mais votado:", err);
    }
  }

  function trocarEleicao(novoAno: number, novoCargo: string) {
    setAnoFiltro(novoAno);
    setCargoFiltro(novoCargo);
    const uf = ufsDeAno(novoAno).includes(ufFiltro) || ufFiltro === "BR" ? ufFiltro : CANDIDATO.uf;
    // Presidente só existe no índice nacional.
    return abrirDestaque({ ano: novoAno, uf: novoCargo === "PRESIDENTE" ? "BR" : uf, cargo: novoCargo, partido: partidoFiltro });
  }

  function trocarPartido(partido: string) {
    setPartidoFiltro(partido);
    if (partido !== "TODOS" && raioX.candidato.partido_sigla !== partido)
      abrirDestaque({ ano: anoFiltro, uf: ufFiltro, cargo: cargoFiltro, partido });
  }

  function transitarParaEstado(uf: string) {
    setMunicipioSelecionado(null);
    setPartidoFiltro("TODOS");
    if (uf === "BR") {
      setCamada("brasil");
      return abrirDestaque({ ano: anoFiltro, uf: "BR", cargo: "TODOS" });
    }
    setUfFiltro(uf);
    setCamada("estado");
    // Presidente aberto: ver o mesmo presidente no estado clicado.
    if (raioX.candidato.uf === "BR") {
      return fetch(`/api/eleicao?candidatoId=${raioX.candidato.id}&uf=${uf}`)
        .then((r) => r.json())
        .then((r) => abrirRaioX(r, "estado", uf))
        .catch(() => undefined);
    }
    const cargo = cargoFiltro === "PRESIDENTE" ? "TODOS" : cargoFiltro;
    return abrirDestaque({ ano: anoFiltro, uf, cargo });
  }

  function transitarParaMunicipio(mun: string) {
    setMunicipioSelecionado(mun);
    setCamada("municipio");
    setAba("mapa");
  }

  // O estado que o mapa mostra: o do candidato, ou o escolhido para o presidente.
  const ufMapa = raioX.candidato.uf === "BR" ? (ufFiltro === "BR" ? CANDIDATO.uf : ufFiltro) : raioX.candidato.uf;

  const APELIDOS_UF = (APELIDOS_MUNICIPIOS as Record<string, Record<string, string>>)[ufMapa] ?? {};

  // O mapa manda o nome como está na malha ("Salvador"); os votos vêm com o
  // nome do TSE ("SALVADOR"). Comparar literal abria a cidade com zero votos.
  const municipioNoBanco = municipioSelecionado
    ? (Object.keys({ ...(raioX.base_por_municipio ?? {}), ...raioX.votos_por_municipio }).find((m) => {
        const k = chave(m);
        const alvo = chave(municipioSelecionado);
        return k === alvo || APELIDOS_UF[k] === alvo; // malha com nome antigo
      }) ?? municipioSelecionado.toUpperCase())
    : null;

  const posicaoNoRanking = municipioNoBanco
    ? Object.entries(raioX.votos_por_municipio)
        .sort((a, b) => b[1] - a[1])
        .findIndex(([m]) => m === municipioNoBanco) + 1 || undefined
    : undefined;

  // ── Cálculos do candidato ativo (no estado do mapa) ──────────────────────
  const c = raioX.candidato;
  const municipal = MUNICIPAIS.has(c.cargo);
  const votosNoMapa = Object.values(raioX.votos_por_municipio).reduce((s, v) => s + v, 0);
  const totalVotos = c.uf === "BR" ? votosNoMapa : c.total_votos || 0;
  const cidadesComVoto = Object.values(raioX.votos_por_municipio).filter((v) => v > 0).length;
  const top10 = raioX.top_municipios.slice(0, 10);
  const top5 = top10.slice(0, 5);
  const votosTop10 = top10.reduce((s, m) => s + m.votos, 0);
  const concentracao = votosNoMapa > 0 ? (votosTop10 / votosNoMapa) * 100 : 0;
  const maiorVotoTopo = top5[0]?.votos || 1;
  const municipiosDaUfMapa = municipiosDaUf(ufMapa);
  const presenca = municipiosDaUfMapa ? (cidadesComVoto / municipiosDaUfMapa) * 100 : null;
  const tot = raioX.totais_unidade ?? null;
  const pctValidos = tot?.validos ? (votosNoMapa / tot.validos) * 100 : null;
  const pctEleitorado = tot?.aptos ? (votosNoMapa / tot.aptos) * 100 : null;
  const base = raioX.base_por_municipio ?? null;

  const lacunas = campanha
    ? Object.entries(raioX.votos_por_municipio)
        .filter(([mun, v]) => v > 0 && !cSet.has(chave(mun)))
        .map(([municipio, votos]) => ({ municipio, votos }))
        .sort((a, b) => b.votos - a.votos)
    : [];
  const votosSemRede = lacunas.reduce((s, l) => s + l.votos, 0);

  return (
    <div className="space-y-5">
      {/* ── 1. CABEÇALHO: CANDIDATO + FILTROS ──────────────────────────── */}
      <header className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-[0_4px_20px_rgb(0,0,0,0.02)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3.5">
            <FotoUrna
              key={c.id}
              src={fotoDoCandidato(c)}
              nome={c.nome_urna}
              tamanho={88}
              className="border-2 shadow-sm"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="rounded-md border border-blue-200/60 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                  {c.partido_sigla} · {c.numero}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  {c.cargo} · {ondeDisputa(c)}
                </span>
                <SeloResultado situacao={c.situacao} />
              </div>
              <h1 className="mt-1 break-words text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">
                {c.nome_urna}
              </h1>
              <p className="text-[12px] text-slate-500">
                Eleição {c.ano}
                {c.turno === 2 ? " · 2º turno" : ""} ·{" "}
                <b className="font-semibold text-slate-800">{fmt(c.total_votos)}</b> votos válidos
                {c.uf === "BR" ? " no Brasil" : ""}
                {pctValidos !== null && c.uf !== "BR" && <> · <b className="font-semibold text-slate-800">{pct(pctValidos)}</b> dos válidos</>}
                {" · "}
                <Link href={`/candidato/${c.id}`} target="_blank" className="inline-flex items-center gap-0.5 font-semibold text-blue-700 hover:underline">
                  página pública <ExternalLink size={11} />
                </Link>
              </p>
            </div>
          </div>

          {/* Controles de navegação, filtros e busca.
              No celular cada controle ocupa a linha inteira: soltos em
              flex-wrap, cada um ficava do tamanho do próprio texto e a pilha
              parecia montada ao acaso; lado a lado, o 16px que o celular
              força nos campos cortava "Todos os cargos" no meio. */}
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
            <div className="flex min-w-0 items-center overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/80 p-1 text-[12px] sm:inline-flex">
              <button
                onClick={() => {
                  setCamada("brasil");
                  setMunicipioSelecionado(null);
                  setAba("mapa");
                }}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold transition sm:py-1 ${
                  camada === "brasil" && aba === "mapa" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Globe2 size={13} />
                Brasil
              </button>
              <ChevronRight size={13} className="shrink-0 text-slate-300" />
              <button
                onClick={() => {
                  setCamada("estado");
                  setMunicipioSelecionado(null);
                  setAba("mapa");
                }}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold transition sm:py-1 ${
                  camada === "estado" && aba === "mapa" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <MapPin size={13} />
                {ufMapa}
              </button>
              {municipioSelecionado && (
                <>
                  <ChevronRight size={13} className="shrink-0 text-slate-300" />
                  <button
                    onClick={() => {
                      setCamada("municipio");
                      setAba("mapa");
                    }}
                    className={`flex min-w-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold transition sm:py-1 ${
                      camada === "municipio" && aba === "mapa" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Building2 size={13} className="shrink-0" />
                    <span className="truncate">{municipioSelecionado}</span>
                  </button>
                </>
              )}
            </div>

            <div className="grid grid-cols-3 rounded-xl border border-slate-200 bg-slate-50/80 p-1 text-[12px] sm:inline-flex">
              {ANOS.map((ano) => (
                <button
                  key={ano}
                  onClick={() => trocarEleicao(ano, "TODOS")}
                  className={`flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 font-bold transition sm:py-1 ${
                    anoFiltro === ano
                      ? ano === 2026
                        ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm"
                        : "bg-blue-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {ano}
                </button>
              ))}
            </div>

            <select value={ufFiltro} onChange={(e) => transitarParaEstado(e.target.value)} className={SELECT}>
              {ESTADOS_BR.map((e) => (
                <option key={e.uf} value={e.uf}>
                  {e.nome} {e.uf !== "BR" ? `(${e.uf})` : ""}
                </option>
              ))}
            </select>

            <select
              value={cargosDaTela.some((o) => o.valor === cargoFiltro) ? cargoFiltro : "TODOS"}
              onChange={(e) => trocarEleicao(anoFiltro, e.target.value)}
              className={SELECT}
            >
              {cargosDaTela.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </select>

            <select value={partidoFiltro} onChange={(e) => trocarPartido(e.target.value)} className={SELECT}>
              <option value="TODOS">Todos os partidos ({opcoes.partidos.length})</option>
              {[...opcoes.partidos]
                .sort((a, b) => a.valor.localeCompare(b.valor, "pt-BR"))
                .map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.valor} ({p.n})
                  </option>
                ))}
            </select>

            <div className="relative w-full sm:w-64">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onFocus={() => sugestoes.length > 0 && setMenuAberto(true)}
                  placeholder="Pesquisar candidato..."
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-9 pr-3 text-[12.5px] outline-none transition focus:border-blue-500 focus:bg-white sm:h-9"
                />
              </div>
              {menuAberto && sugestoes.length > 0 && (
                <div className="absolute left-0 right-0 top-11 z-50 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  {sugestoes.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => selecionarCandidato(s)}
                      className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-slate-50"
                    >
                      <FotoUrna src={fotoDoCandidato(s)} nome={s.nome_urna} tamanho={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[12.5px] font-bold text-slate-900">{s.nome_urna}</span>
                          <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                            {s.partido_sigla} · {s.numero}
                          </span>
                        </div>
                        <span className="block truncate text-[11px] text-slate-500">
                          {s.cargo} · {ondeDisputa(s)} · {s.ano}
                        </span>
                      </div>
                      {s.id === c.id && <Check size={14} className="shrink-0 text-blue-600" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {partidoFiltro !== "TODOS" && (
          <div className="mt-3 flex items-center justify-end border-t border-slate-100 pt-2.5 text-[11.5px]">
            <button
              onClick={() => setPartidoFiltro("TODOS")}
              className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200"
            >
              Filtro partidário: {partidoFiltro} ✕
            </button>
          </div>
        )}
      </header>

      <SeletorCandidatos
        ano={anoFiltro}
        uf={ufFiltro}
        cargo={cargoFiltro}
        partido={partidoFiltro}
        idAtual={c.id}
        onEscolher={selecionarCandidato}
        onOpcoes={setOpcoes}
      />

      {/* ── 2. ABAS ────────────────────────────────────────────────────── */}
      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-[0_4px_20px_rgb(0,0,0,0.02)]" aria-label="Análises do candidato">
        {ABAS.map(({ id, rotulo, icone: Icone }) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            aria-current={aba === id ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12.5px] font-bold transition ${
              aba === id ? "bg-tema text-white shadow-sm" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Icone size={14} />
            {id === "eleicao" ? (CARGOS_PROPORCIONAIS.has(c.cargo) ? "Quociente" : "Disputa") : rotulo}
          </button>
        ))}
      </nav>

      {aba === "eleicao" && <AbaEleicao key={c.id} raioX={raioX} onEscolher={selecionarCandidato} />}
      {aba === "comparar" && <AbaComparar key={`${c.id}|${ufMapa}`} raioX={raioX} ufMapa={ufMapa} />}
      {aba === "trajetoria" && <AbaTrajetoria key={c.id} raioX={raioX} onEscolher={selecionarCandidato} />}
      {aba === "gastos" && <AbaGastos key={c.id} raioX={raioX} />}
      {aba === "perguntar" && <AbaPerguntar raioX={raioX} />}

      {/* ── 3. MAPA: BRASIL → ESTADO → MUNICÍPIO ──────────────────────── */}
      {aba === "mapa" &&
        (camada === "brasil" ? (
          <MapaBrasil
            ufAtiva={ufMapa}
            votosPorUf={raioX.votos_por_uf ?? { [c.uf]: c.total_votos }}
            ufsComDados={ufsDoAno}
            onSelecionarUf={transitarParaEstado}
          />
        ) : camada === "municipio" && municipioSelecionado ? (
          <DetalheMunicipioEstrategia
            municipio={municipioSelecionado}
            municipioNoBanco={municipioNoBanco}
            candidatoId={c.id}
            ano={c.ano}
            uf={ufMapa}
            votosMunicipio={municipioNoBanco ? raioX.votos_por_municipio[municipioNoBanco] || 0 : 0}
            posicaoRanking={posicaoNoRanking}
            totalVotosCandidato={votosNoMapa}
            nomeCandidato={c.nome_urna}
            temLiderancas={cSet.has(chave(municipioSelecionado))}
            campanha={campanha}
            cargo={c.cargo}
            turno={c.turno}
            onVoltarEstado={() => setCamada("estado")}
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
            {/* COLUNA ESQUERDA: MAPA */}
            <div className="min-w-0 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-[0_4px_20px_rgb(0,0,0,0.02)] xl:col-span-8 sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                    {municipal ? `${c.nm_ue} · ${c.ano}` : `${ufMapa} · ${c.ano}`}
                  </span>
                  <h2 className="text-[15px] font-extrabold text-slate-900 sm:text-base">
                    {medida === "votos" ? "Votos" : medida === "eleitorado" ? "Fatia do eleitorado" : "Fatia dos votos válidos"} por município
                  </h2>
                </div>
                <div className="grid grid-cols-3 rounded-xl border border-slate-200 bg-slate-50/80 p-1 text-[11.5px]" role="group" aria-label="Medida do mapa">
                  {MEDIDAS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setMedida(m.id)}
                      disabled={m.id !== "votos" && !base}
                      title={m.id !== "votos" && !base ? "Eleitorado desta eleição ainda não importado" : undefined}
                      className={`rounded-lg px-2.5 py-1 font-bold transition disabled:opacity-40 ${
                        medida === m.id ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {m.rotulo}
                    </button>
                  ))}
                </div>
              </div>
              <MapaVotos
                uf={ufMapa}
                votosPorMunicipio={raioX.votos_por_municipio}
                base={base}
                medida={medida}
                ano={c.ano}
                semRede={campanha ? lacunas.map((l) => l.municipio) : undefined}
                onAbrirMunicipio={transitarParaMunicipio}
              />
            </div>

            {/* COLUNA DIREITA: NÚMEROS E REDUTOS */}
            <div className="min-w-0 space-y-4 xl:col-span-4">
              <div className="grid grid-cols-2 gap-2.5">
                <Metrica rotulo="Votos" icone={<Award size={14} className="text-blue-600" />} valor={fmt(totalVotos)} nota={c.uf === "BR" ? `em ${ufMapa}` : `em ${cidadesComVoto} ${cidadesComVoto === 1 ? "cidade" : "cidades"}`} />
                <Metrica
                  rotulo="Dos válidos"
                  icone={<Percent size={14} className="text-emerald-600" />}
                  valor={pctValidos !== null ? pct(pctValidos) : "—"}
                  nota={pctValidos !== null ? (municipal ? `do cargo em ${c.nm_ue}` : `do cargo em ${ufMapa}`) : "eleitorado não importado"}
                />
                {municipal ? (
                  <Metrica
                    rotulo="Do eleitorado"
                    icone={<Users2 size={14} className="text-purple-600" />}
                    valor={pctEleitorado !== null ? pct(pctEleitorado, 2) : "—"}
                    nota={tot?.aptos ? `${fmt(tot.aptos)} eleitores aptos` : "eleitorado não importado"}
                  />
                ) : (
                  <Metrica rotulo="Concentração" icone={<TrendingUp size={14} className="text-emerald-600" />} valor={pct(concentracao, 0)} nota="nos 10 maiores municípios" />
                )}
                {municipal ? (
                  <Metrica
                    rotulo="Comparecimento"
                    icone={<Compass size={14} className="text-purple-600" />}
                    valor={tot?.aptos ? pct((tot.comparecimento / tot.aptos) * 100) : "—"}
                    nota="dos eleitores aptos votaram"
                  />
                ) : (
                  <Metrica
                    rotulo="Presença"
                    icone={<Compass size={14} className="text-purple-600" />}
                    valor={presenca !== null ? pct(presenca, 0) : "—"}
                    nota={`${cidadesComVoto} de ${municipiosDaUfMapa} municípios de ${ufMapa}`}
                  />
                )}
              </div>

              <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <h3 className="text-[13px] font-bold text-slate-900">{municipal ? "Zonas e cidade" : "Principais redutos"}</h3>
                  <span className="text-[11px] font-medium text-slate-400">Top 5</span>
                </div>
                <div className="space-y-2.5">
                  {top5.map((m, i) => {
                    const b = base?.[m.municipio];
                    return (
                      <button
                        key={m.municipio}
                        onClick={() => transitarParaMunicipio(m.municipio)}
                        className="group flex w-full flex-col gap-1 rounded-xl p-2 text-left transition hover:bg-slate-50"
                      >
                        <div className="flex min-w-0 items-center justify-between text-[12.5px]">
                          <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-800 group-hover:text-blue-600">
                            <span className="shrink-0 text-[11px] font-bold text-slate-400">#{i + 1}</span>
                            <span className="truncate">{m.municipio}</span>
                          </span>
                          <span className="shrink-0 pl-2 text-right">
                            <span className="block font-mono font-bold text-slate-700">{fmt(m.votos)}</span>
                            {b?.aptos ? <span className="block text-[10.5px] text-slate-500">{pct((m.votos / b.aptos) * 100, 2)} do eleitorado</span> : null}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-blue-600 transition-all duration-300 group-hover:bg-blue-700"
                            style={{ width: `${(m.votos / maiorVotoTopo) * 100}%` }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── SUA CAMPANHA: só com base cadastrada ─────────────────── */}
              {campanha && (
                <div className="rounded-2xl border border-amber-200/70 bg-amber-50 p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-[12.5px] font-bold text-amber-800">
                    <Users2 size={15} className="text-amber-600" />
                    Sua campanha · votos sem liderança
                  </div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-slate-600">
                    {c.nome_urna} teve <b>{fmt(votosSemRede)} votos</b> em {lacunas.length}{" "}
                    {lacunas.length === 1 ? "cidade" : "cidades"} onde sua base ainda não tem ninguém cadastrado. No mapa, elas
                    têm contorno âmbar.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {lacunas.slice(0, 4).map((l) => (
                      <button
                        key={l.municipio}
                        type="button"
                        onClick={() => transitarParaMunicipio(l.municipio)}
                        className="inline-flex items-center gap-1 rounded-lg border border-amber-300/60 bg-white px-2 py-1 text-[11px] font-semibold text-amber-900 transition hover:bg-amber-100"
                      >
                        {l.municipio}: {fmt(l.votos)} <ArrowUpRight size={10} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}

function Metrica({ rotulo, icone, valor, nota }: { rotulo: string; icone: ReactNode; valor: string; nota: string }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
      <div className="flex items-center justify-between text-slate-400">
        <span className="text-[10.5px] font-bold uppercase tracking-wider">{rotulo}</span>
        {icone}
      </div>
      <div className="mt-1 text-xl font-extrabold text-slate-900">{valor}</div>
      <p className="mt-0.5 text-[11px] text-slate-500">{nota}</p>
    </div>
  );
}
