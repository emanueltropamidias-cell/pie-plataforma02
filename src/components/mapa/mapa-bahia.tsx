"use client";

import { useEffect, useMemo, useState } from "react";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import type { Feature, Geometry } from "geojson";
import { X, Search, Users, Vote, MapPinned } from "lucide-react";
import { VOTOS_TALITA } from "@/lib/votos-talita";
import { REGION_COLORS, REGIONS_DATA } from "@/lib/regioes-ba";
import { CidadeBairros } from "./cidade-bairros";
import { GraficoRegioes } from "./grafico-regioes";

// Malha servida do próprio domínio e já simplificada (1,35 MB → 683 KB, com
// precisão abaixo de um pixel mesmo no zoom máximo). Vinha de um CDN externo,
// que custava DNS, TLS e ~2 s a cada abertura do mapa.
const GEOJSON_URL = "/bahia-municipios.json";

export type MunicipioBase = {
  municipio: string;
  qtd: number;
  bairros: { nome: string; qtd: number }[];
};

type MunFeature = Feature<Geometry, { name?: string }>;

function normaliza(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

const VOTOS_POR_NOME: Record<string, number> = {};
for (const [nome, v] of Object.entries(VOTOS_TALITA)) VOTOS_POR_NOME[normaliza(nome)] = v;

// Cada região tem sua cor; a intensidade dentro da cor é o calor. Duas
// informações no mesmo desenho: onde fica (matiz) e quanto tem (força). Uma
// rampa única deixava o mapa monocromático e perdia a leitura regional.

const REGIAO_DO_MUN: Record<string, string> = {};
for (const [regiao, muns] of Object.entries(REGIONS_DATA)) {
  for (const m of muns) REGIAO_DO_MUN[normaliza(m)] = regiao;
}

const CINZA = "#9AA3AF";

/** Clareia uma cor em direção ao branco. t=0 cor cheia, t=1 branco. */
function clarear(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const m = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}

// Quanto maior o número, mais cheia fica a cor da região.
const FORCA_PESSOAS = [
  { ate: 0, t: 0.9, rotulo: "nenhuma" },
  { ate: 9, t: 0.66, rotulo: "1 a 9" },
  { ate: 49, t: 0.44, rotulo: "10 a 49" },
  { ate: 199, t: 0.22, rotulo: "50 a 199" },
  { ate: Infinity, t: 0, rotulo: "200 ou mais" },
];
const FORCA_VOTOS = [
  { ate: 0, t: 0.9, rotulo: "nenhum" },
  { ate: 49, t: 0.66, rotulo: "1 a 49" },
  { ate: 199, t: 0.44, rotulo: "50 a 199" },
  { ate: 999, t: 0.22, rotulo: "200 a 999" },
  { ate: Infinity, t: 0, rotulo: "1.000 ou mais" },
];

function corDoMunicipio(nomeNormalizado: string, valor: number, escala: typeof FORCA_PESSOAS) {
  const regiao = REGIAO_DO_MUN[nomeNormalizado];
  const base = regiao ? REGION_COLORS[regiao] : CINZA;
  return clarear(base, faixa(valor, escala).t);
}

function faixa(valor: number, escala: { ate: number; t: number; rotulo: string }[]) {
  return escala.find((f) => valor <= f.ate) ?? escala[escala.length - 1];
}

type Tip = {
  x: number;
  y: number;
  nome: string;
  pessoas: number;
  citaram: number;
  estimados: number;
  votos: number;
  bairros: number;
  regiao: string;
};

/**
 * Quem não tem município, distribuído pelas cidades do seu DDD na proporção da
 * base confirmada — ver supabase/migrations/0025_mapa_estimativa_pelo_ddd.sql.
 * É ESTIMATIVA, e esta tela nunca mostra a soma sem dizer que parte é estimada.
 */
export type EstimativaDdd = {
  /**
   * Quem não tem município no cadastro mas CITOU a cidade na conversa — vai
   * para essa cidade, sem conta. Vem antes do DDD desde a 0026: é a palavra da
   * pessoa, e pega quem mora aqui com DDD de fora.
   */
  citaram?: { municipio: string; qtd: number }[];
  pessoasCitaram?: number;
  estimados: { municipio: string; qtd: number }[];
  distribuidas: number;
  /** DDD de fora da Bahia E nenhuma cidade citada: não há onde pôr. */
  foraDaBahia: number;
};

type Metrica = "pessoas" | "estimativa" | "votos";

const W = 800;
const H = 800;

// Guardada no módulo: alternar entre as abas não refaz o download nem o
// parse dos 417 polígonos. `emCurso` evita duas buscas quando a tela pede a
// malha enquanto o aquecimento ainda está a caminho.
let malhaEmMemoria: MunFeature[] | null = null;
let malhaEmCurso: Promise<MunFeature[]> | null = null;

export function carregarMalha(): Promise<MunFeature[]> {
  if (malhaEmMemoria) return Promise.resolve(malhaEmMemoria);
  if (malhaEmCurso) return malhaEmCurso;
  malhaEmCurso = fetch(GEOJSON_URL)
    .then((r) => r.json())
    .then((geo) => {
      malhaEmMemoria = (geo.features as MunFeature[]) || [];
      return malhaEmMemoria;
    })
    .finally(() => {
      malhaEmCurso = null;
    });
  return malhaEmCurso;
}

export function MapaBahia({ base, estimativa = null }: { base: MunicipioBase[]; estimativa?: EstimativaDdd | null }) {
  const [features, setFeatures] = useState<MunFeature[]>(malhaEmMemoria ?? []);
  const [carregando, setCarregando] = useState(!malhaEmMemoria);
  const [erro, setErro] = useState("");
  const [tip, setTip] = useState<Tip | null>(null);
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [metrica, setMetrica] = useState<Metrica>("pessoas");

  const estimadosPorNome = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of estimativa?.estimados ?? []) m.set(normaliza(e.municipio), (m.get(normaliza(e.municipio)) ?? 0) + e.qtd);
    return m;
  }, [estimativa]);
  const citaramPorNome = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of estimativa?.citaram ?? []) m.set(normaliza(e.municipio), (m.get(normaliza(e.municipio)) ?? 0) + e.qtd);
    return m;
  }, [estimativa]);
  const [regiaoFoco, setRegiaoFoco] = useState<string | null>(null);

  // Base indexada pelo nome normalizado, para casar com o nome do GeoJSON.
  //
  // ── SOMA, NÃO SOBRESCREVE ─────────────────────────────────────────────────
  //
  // Era `m.set(...)` direto, e `Map.set` substitui. A planilha importada trouxe
  // "SALVADOR" e as atendentes digitam "Salvador": duas cidades para o banco,
  // uma chave só aqui. A última ganhava.
  //
  // Salvador tinha 87 numa grafia e 7 na outra. O mapa mostrava 7 e jogava 87
  // fora — sem erro, sem aviso, com o desenho inteiro parecendo correto. Foi
  // assim que o mapa "quebrou" sem ninguém ter mexido nele.
  //
  // Somar aqui não dispensa arrumar a grafia no banco, que é o conserto de
  // verdade. Mas esta tela nunca mais some com gente porque alguém digitou
  // diferente — e digitar diferente vai acontecer sempre, com cinco atendentes
  // cadastrando à mão.
  const porNome = useMemo(() => {
    const m = new Map<string, MunicipioBase>();
    for (const b of base) {
      const chave = normaliza(b.municipio);
      const antes = m.get(chave);
      if (!antes) {
        m.set(chave, { ...b, bairros: [...(b.bairros ?? [])] });
        continue;
      }
      antes.qtd += b.qtd;
      // Os bairros também se repetem entre as grafias, e pela mesma razão.
      for (const nb of b.bairros ?? []) {
        const ja = antes.bairros?.find((x) => normaliza(x.nome) === normaliza(nb.nome));
        if (ja) ja.qtd += nb.qtd;
        else antes.bairros = [...(antes.bairros ?? []), { ...nb }];
      }
    }
    return m;
  }, [base]);

  useEffect(() => {
    if (malhaEmMemoria) return;
    let vivo = true;
    carregarMalha()
      .then((f) => {
        if (vivo) setFeatures(f);
      })
      .catch(() => {
        if (vivo) setErro("Não foi possível carregar o mapa agora.");
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const escala = metrica === "votos" ? FORCA_VOTOS : FORCA_PESSOAS;

  const { paths, path } = useMemo(() => {
    if (!features.length) return { paths: [], path: null as ReturnType<typeof geoPath> | null };
    const fc = { type: "FeatureCollection", features } as unknown as GeoPermissibleObjects;
    const projection = geoMercator().fitSize([W, H], fc);
    const p = geoPath(projection);
    const ps = features.map((f) => {
      const nome = f.properties?.name ?? "";
      const n = normaliza(nome);
      const dados = porNome.get(n);
      const pessoas = dados?.qtd ?? 0;
      const estimados = estimadosPorNome.get(n) ?? 0;
      const citaram = citaramPorNome.get(n) ?? 0;
      const votos = VOTOS_POR_NOME[n] ?? 0;
      const valor = metrica === "votos" ? votos : metrica === "estimativa" ? pessoas + citaram + estimados : pessoas;
      return {
        chave: n,
        d: p(f as unknown as GeoPermissibleObjects) || "",
        centro: p.centroid(f as unknown as GeoPermissibleObjects),
        nome,
        pessoas,
        citaram,
        estimados,
        votos,
        bairros: dados?.bairros.length ?? 0,
        cor: corDoMunicipio(n, valor, escala),
        regiao: REGIAO_DO_MUN[n] ?? "",
      };
    });
    return { paths: ps, path: p };
  }, [features, porNome, estimadosPorNome, citaramPorNome, metrica, escala]);

  const nomesOrdenados = useMemo(
    () => [...new Set(paths.map((p) => p.nome))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [paths],
  );

  const sel = useMemo(() => {
    if (!selecionado || !path) return null;
    const f = features.find((ff) => normaliza(ff.properties?.name ?? "") === selecionado);
    if (!f) return null;
    const [[x0, y0], [x1, y1]] = path.bounds(f as unknown as GeoPermissibleObjects);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const larg = Math.max(1, x1 - x0);
    const alt = Math.max(1, y1 - y0);
    const k = Math.min(8, Math.max(2, 0.45 * Math.min(W / larg, H / alt)));
    const nome = f.properties?.name ?? "";
    const n = normaliza(nome);
    const dados = porNome.get(n);
    const regiao = REGIAO_DO_MUN[n] ?? "";
    return {
      chave: n,
      nome,
      regiao,
      corRegiao: regiao ? REGION_COLORS[regiao] : CINZA,
      pessoas: dados?.qtd ?? 0,
      estimados: estimadosPorNome.get(n) ?? 0,
      citaram: citaramPorNome.get(n) ?? 0,
      bairros: dados?.bairros ?? [],
      votos: VOTOS_POR_NOME[n] ?? 0,
      d: path(f as unknown as GeoPermissibleObjects) || "",
      bounds: [[x0, y0], [x1, y1]] as [[number, number], [number, number]],
      k,
      transform: `translate(${W / 2} ${H / 2}) scale(${k}) translate(${-cx} ${-cy})`,
    };
  }, [selecionado, path, features, porNome, estimadosPorNome, citaramPorNome]);

  // O ranking acompanha a métrica: em "votos", ordena por voto.
  const topo = useMemo(() => {
    const lista = base.map((m) => ({
      municipio: m.municipio,
      valor:
        metrica === "votos"
          ? (VOTOS_POR_NOME[normaliza(m.municipio)] ?? 0)
          : m.qtd +
            (metrica === "estimativa"
              ? (estimadosPorNome.get(normaliza(m.municipio)) ?? 0) + (citaramPorNome.get(normaliza(m.municipio)) ?? 0)
              : 0),
    }));
    if (metrica === "votos") {
      const vistos = new Set(lista.map((m) => normaliza(m.municipio)));
      for (const [nome, v] of Object.entries(VOTOS_TALITA)) {
        if (!vistos.has(normaliza(nome))) lista.push({ municipio: nome, valor: v });
      }
    }
    return lista
      .map((m) => ({ ...m, valor: Math.round(m.valor) }))
      .filter((m) => m.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);
  }, [base, metrica, estimadosPorNome, citaramPorNome]);
  const maiorTopo = topo[0]?.valor ?? 0;

  function aoBuscar(valor: string) {
    setBusca(valor);
    const n = normaliza(valor);
    const achou = paths.find((p) => p.chave === n);
    setSelecionado(achou ? achou.chave : null);
  }
  function limpar() {
    setBusca("");
    setSelecionado(null);
  }

  const totalConfirmado = base.reduce((s, m) => s + m.qtd, 0);
  const fmt = (n: number) => Math.round(n).toLocaleString("pt-BR");

  const botao = (m: Metrica, Icone: typeof Users, texto: string) => (
    <button
      onClick={() => setMetrica(m)}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
        metrica === m ? "bg-tema text-white" : "text-tinta-600 hover:bg-tinta-100"
      }`}
    >
      <Icone size={14} /> {texto}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="relative rounded-xl border border-tinta-200 bg-white p-4 shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
        {!carregando && !erro && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-tinta-200 bg-white p-1">
              {botao("pessoas", Users, "Pessoas na base")}
              {estimativa && estimativa.distribuidas > 0 && botao("estimativa", MapPinned, "Com estimativa (DDD)")}
              {botao("votos", Vote, "Votos 2022")}
            </div>

            <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta-400" />
              <input
                value={busca}
                onChange={(e) => aoBuscar(e.target.value)}
                list="lista-municipios"
                placeholder="Buscar cidade..."
                className="h-10 w-full rounded-lg border border-tinta-200 bg-white pl-9 pr-9 text-sm outline-none focus:border-tinta-400"
              />
              {busca && (
                <button
                  onClick={limpar}
                  aria-label="Limpar busca"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-tinta-400 hover:bg-tinta-100 hover:text-tinta-700"
                >
                  <X size={15} />
                </button>
              )}
              <datalist id="lista-municipios">
                {nomesOrdenados.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
          </div>
        )}

        {/* ── A ESTIMATIVA SE ANUNCIA ─────────────────────────────────────
            Com a chave ligada, o mapa pinta gente que ninguém sabe onde mora.
            Esta faixa existe para que isso nunca seja lido como endereço: o
            confirmado e o estimado aparecem separados, e o que ficou de fora
            também. */}
        {metrica === "estimativa" && estimativa && (
          <div className="mb-3 rounded-lg border border-[#f0dcc0] bg-[#fdf6ea] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#7a4a00]">
            <b>
              {fmt(totalConfirmado)} confirmados
              {(estimativa.pessoasCitaram ?? 0) > 0 && <> + {fmt(estimativa.pessoasCitaram ?? 0)} citaram a cidade na conversa</>}
              {" "}+ ~{fmt(estimativa.distribuidas)} estimados pelo DDD.
            </b>{" "}
            Quem disse a cidade no atendimento vai para essa cidade. Quem não deu pista nenhuma foi
            distribuído pelas cidades do seu DDD, na proporção da base confirmada de cada uma — isso é
            estimativa, não endereço. Cada pessoa sai daqui e vai para a cidade certa quando for registrada.
            {estimativa.foraDaBahia > 0 && (
              <>
                {" "}
                <b>{fmt(estimativa.foraDaBahia)}</b> têm DDD de fora e não citaram cidade: ficaram fora do mapa — são
                as conversas em que é preciso perguntar de onde a pessoa é.
              </>
            )}
          </div>
        )}

        {carregando && <p className="p-10 text-center text-sm text-tinta-500">Carregando mapa…</p>}
        {erro && <p className="p-10 text-center text-sm text-red-600">{erro}</p>}

        {!carregando && !erro && (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" onMouseLeave={() => setTip(null)}>
              <g style={{ transition: "transform 0.5s ease" }} transform={sel?.transform ?? ""}>
                {paths.map((p, i) => {
                  const ativo = sel?.chave === p.chave;
                  return (
                    <path
                      key={i}
                      d={p.d}
                      fill={p.cor}
                      fillOpacity={
                        (sel && !ativo) || (regiaoFoco && p.regiao !== regiaoFoco) ? 0.35 : 1
                      }
                      stroke={ativo ? "#0C1F3A" : "#ffffff"}
                      strokeWidth={ativo ? 2.4 : 0.5}
                      vectorEffect="non-scaling-stroke"
                      onClick={() => {
                        setSelecionado(p.chave);
                        setBusca(p.nome);
                      }}
                      onMouseMove={(e) =>
                        setTip({
                          x: e.clientX,
                          y: e.clientY,
                          nome: p.nome,
                          pessoas: p.pessoas,
                          citaram: p.citaram,
                          estimados: p.estimados,
                          votos: p.votos,
                          bairros: p.bairros,
                          regiao: p.regiao,
                        })
                      }
                      className="cursor-pointer hover:[stroke:#0C1F3A] hover:[stroke-width:1.6]"
                    />
                  );
                })}

                {/* Com zoom, cada município ganha nome — como num mapa de região.
                    O texto encolhe junto com a escala para manter o tamanho na tela. */}
                {sel &&
                  paths
                    .filter((p) => p.centro && Number.isFinite(p.centro[0]))
                    .map((p, i) => (
                      <text
                        key={`n-${i}`}
                        x={p.centro[0]}
                        y={p.centro[1]}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        pointerEvents="none"
                        fill="#0A1430"
                        style={{
                          fontSize: 11 / sel.k,
                          fontWeight: 600,
                          paintOrder: "stroke",
                          stroke: "#ffffff",
                          strokeWidth: 3 / sel.k,
                        }}
                      >
                        {p.nome}
                      </text>
                    ))}
              </g>
            </svg>

            {/* Painel do município: pessoas, votos e os bairros */}
            {sel && (
              <div className="absolute right-6 top-24 z-10 max-h-[74%] w-[250px] overflow-y-auto rounded-xl border border-tinta-200 bg-white p-4 shadow-[0_8px_28px_rgba(22,32,46,0.12)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[15px] font-bold leading-tight text-tinta-900">{sel.nome}</div>
                  <button
                    onClick={limpar}
                    aria-label="Fechar"
                    className="shrink-0 rounded-md p-1 text-tinta-400 hover:bg-tinta-100"
                  >
                    <X size={14} />
                  </button>
                </div>

                {sel.regiao && (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-tinta-500">
                    <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: sel.corRegiao }} />
                    {sel.regiao}
                  </div>
                )}

                {/* O número em destaque é sempre o da métrica escolhida no topo:
                    quem foi ver votos quer ler votos, não a base. */}
                <div className="mt-3 flex flex-col gap-2">
                  <div className="rounded-lg p-3" style={{ background: clarear(sel.corRegiao, 0.86) }}>
                    <div className="text-[10px] font-medium text-tinta-500">
                      {metrica === "votos" ? "Votos em 2022" : metrica === "estimativa" ? "Com a estimativa" : "Pessoas na base"}
                    </div>
                    <div className="text-3xl font-extrabold leading-none" style={{ color: sel.corRegiao }}>
                      {metrica === "votos"
                        ? sel.votos.toLocaleString("pt-BR")
                        : metrica === "estimativa"
                          ? `~${fmt(sel.pessoas + sel.citaram + sel.estimados)}`
                          : sel.pessoas.toLocaleString("pt-BR")}
                    </div>
                  </div>
                  {metrica === "estimativa" && (
                    <div className="rounded-lg bg-[#fdf6ea] px-3 py-2 text-[11.5px] leading-snug text-[#7a4a00]">
                      <b>{sel.pessoas.toLocaleString("pt-BR")}</b> confirmadas
                      {sel.citaram > 0 && (
                        <>
                          {" "}· <b>{fmt(sel.citaram)}</b> citaram a cidade
                        </>
                      )}
                      {" "}· <b>~{fmt(sel.estimados)}</b> estimadas pelo DDD
                    </div>
                  )}
                  <div className="flex items-baseline justify-between rounded-lg bg-tinta-50 px-3 py-2">
                    <span className="text-[11px] text-tinta-500">
                      {metrica === "votos" ? "Pessoas na base" : "Votos em 2022"}
                    </span>
                    <span className="text-[15px] font-bold tabular-nums text-tinta-700">
                      {(metrica === "votos" ? sel.pessoas : sel.votos).toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-tinta-400">
                    Bairros
                  </div>
                  {sel.bairros.length === 0 ? (
                    <p className="mt-2 text-[12px] text-tinta-400">
                      Nenhum bairro preenchido nos cadastros deste município.
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-col gap-1.5">
                      {sel.bairros.map((b) => (
                        <div key={b.nome} className="flex items-center gap-2">
                          <span className="w-24 shrink-0 truncate text-[11.5px] text-tinta-600">{b.nome}</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-tinta-100">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.max(4, (b.qtd / sel.bairros[0].qtd) * 100)}%`,
                                background: sel.corRegiao,
                              }}
                            />
                          </div>
                          <span className="w-8 shrink-0 text-right text-[11px] font-semibold tabular-nums text-tinta-600">
                            {b.qtd}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Legenda: a cor diz a região, a força diz o tamanho */}
            <div className="mt-3 flex flex-col gap-2 border-t border-tinta-100 pt-3">
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11px] text-tinta-500">
                <span className="font-semibold text-tinta-600">Regiões:</span>
                {Object.entries(REGION_COLORS).map(([r, c]) => (
                  <button
                    key={r}
                    onClick={() => setRegiaoFoco(regiaoFoco === r ? null : r)}
                    className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors ${
                      regiaoFoco === r ? "bg-tinta-100 font-semibold text-tinta-800" : "hover:bg-tinta-50"
                    }`}
                  >
                    <i
                      className="inline-block h-3 w-3 rounded-sm ring-1 ring-inset ring-black/5"
                      style={{ background: c }}
                    />
                    {r}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11px] text-tinta-500">
                <span className="font-semibold text-tinta-600">
                  {metrica === "votos" ? "Votos em 2022" : metrica === "estimativa" ? "Pessoas, com estimativa" : "Pessoas na base"}:
                </span>
                {escala.map((f) => (
                  <span key={f.rotulo} className="flex items-center gap-1.5">
                    <i
                      className="inline-block h-3 w-3 rounded-sm ring-1 ring-inset ring-black/5"
                      style={{ background: clarear("#4B5563", f.t) }}
                    />
                    {f.rotulo}
                  </span>
                ))}
                <span className="text-tinta-400">— quanto mais cheia a cor, mais gente</span>
              </div>
            </div>

          </>
        )}

        {/* Tooltip que segue o cursor */}
        {tip && (
          <div
            className="pointer-events-none fixed z-50 min-w-[172px] rounded-xl border border-tinta-200 bg-white p-3 shadow-[0_8px_28px_rgba(22,32,46,0.12)]"
            style={{ left: tip.x + 14, top: tip.y + 14 }}
          >
            <div className="text-[14px] font-bold text-tinta-900">{tip.nome}</div>
            <div
              className="mt-1 text-2xl font-extrabold"
              style={{ color: tip.regiao ? REGION_COLORS[tip.regiao] : CINZA }}
            >
              {metrica === "votos"
                ? tip.votos.toLocaleString("pt-BR")
                : metrica === "estimativa"
                  ? `~${fmt(tip.pessoas + tip.citaram + tip.estimados)}`
                  : tip.pessoas.toLocaleString("pt-BR")}
              <span className="ml-1 text-sm font-semibold">
                {metrica === "votos" ? "votos" : "pessoas"}
              </span>
            </div>
            {metrica === "estimativa" && (
              <div className="text-[11.5px] text-[#7a4a00]">
                {tip.pessoas.toLocaleString("pt-BR")} confirmadas
                {tip.citaram > 0 ? ` · ${fmt(tip.citaram)} citaram` : ""} · ~{fmt(tip.estimados)} pelo DDD
              </div>
            )}
            <div className="text-[11.5px] text-tinta-500">
              {metrica === "votos"
                ? `${tip.pessoas.toLocaleString("pt-BR")} pessoas na base`
                : `${tip.votos.toLocaleString("pt-BR")} votos em 2022`}
            </div>
            {tip.regiao && <div className="text-[10.5px] uppercase tracking-wide text-tinta-400">{tip.regiao}</div>}
            {tip.bairros > 0 && (
              <div className="text-[11px] text-tinta-400">{tip.bairros} bairro(s) mapeado(s)</div>
            )}
          </div>
        )}
      </div>

      {/* Clique num município abre a cidade inteira, com os bairros */}
      {sel && (
        <div className="rounded-xl border border-tinta-200 bg-white p-5 shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: sel.corRegiao }}>
                {sel.regiao || "Cidade"}
              </p>
              <h2 className="text-2xl font-extrabold tracking-tight text-tinta-900">{sel.nome}</h2>
            </div>
            <button
              onClick={limpar}
              className="rounded-md px-2 py-1 text-[12.5px] text-tinta-400 hover:bg-tinta-100 hover:text-tinta-700"
            >
              voltar ao estado
            </button>
          </div>
          <CidadeBairros
            nome={sel.nome}
            d={sel.d}
            bounds={sel.bounds}
            bairros={sel.bairros}
            pessoas={sel.pessoas}
            cor={sel.corRegiao}
          />
        </div>
      )}

      <GraficoRegioes
        base={base}
        aoEscolher={(m) => {
          setSelecionado(normaliza(m));
          setBusca(m);
        }}
      />

      {/* Ranking: o mapa mostra onde; a lista mostra quanto */}
      {topo.length > 0 && (
        <div className="rounded-xl border border-tinta-200 bg-white p-5 shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
          <p className="text-sm font-semibold text-tinta-700">
            {metrica === "votos" ? "Municípios com mais votos em 2022" : metrica === "estimativa" ? "Municípios com mais gente, com a estimativa pelo DDD" : "Municípios com mais gente na base"}
          </p>
          <div className="mt-4 flex flex-col gap-2.5">
            {topo.map((m, i) => (
              <button
                key={m.municipio}
                onClick={() => {
                  setSelecionado(normaliza(m.municipio));
                  setBusca(m.municipio);
                }}
                className="flex items-center gap-3 text-left"
              >
                <span className="w-5 shrink-0 text-[12px] font-bold text-tinta-300">{i + 1}</span>
                <span className="w-40 shrink-0 truncate text-[13px] text-tinta-700 hover:text-tinta-950">
                  {m.municipio}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-tinta-100">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${maiorTopo ? Math.max(2, (m.valor / maiorTopo) * 100) : 0}%`,
                      background: REGION_COLORS[REGIAO_DO_MUN[normaliza(m.municipio)] ?? ""] ?? CINZA,
                    }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-tinta-600">
                  {m.valor.toLocaleString("pt-BR")}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] text-tinta-400">
            Clique num município — no mapa ou aqui — para ver os bairros.
          </p>
        </div>
      )}
    </div>
  );
}
