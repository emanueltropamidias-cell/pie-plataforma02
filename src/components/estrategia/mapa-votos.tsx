"use client";

import { useEffect, useMemo, useState } from "react";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import type { Feature, Geometry } from "geojson";
import APELIDOS_MUNICIPIOS from "@/lib/municipios-apelidos.json";
import { Search, X } from "lucide-react";
import { carregarMalha } from "@/components/mapa/mapa-bahia";
import { REGION_COLORS, REGIONS_DATA } from "@/lib/regioes-ba";
import { bairrosDe, chave, conferirBairros, votosDe, zonasDe, VOTOS_ZONA } from "@/lib/eleicao";
import { CidadeVotos } from "./cidade-votos";

// Mapa de calor da votação de 2022.
//
// Difere do mapa de Território, que pinta a base de cadastrados: aqui a cor é
// voto, e o clique desce para dentro da cidade — bairro, zona e local de
// votação, na medida em que esses dados forem importados.
//
// Matiz é a região, intensidade é o voto. Duas informações no mesmo desenho:
// onde fica e quanto teve. Uma rampa única deixaria o mapa monocromático e
// apagaria a leitura regional, que é como a campanha pensa o estado.

type MunFeature = Feature<Geometry, { name?: string }>;

const W = 800;
const H = 800;
const CINZA = "#9AA3AF";

const REGIAO_DO_MUN: Record<string, string> = {};
for (const [regiao, muns] of Object.entries(REGIONS_DATA)) {
  for (const m of muns) REGIAO_DO_MUN[chave(m)] = regiao;
}

function clarear(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const m = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${m((n >> 16) & 255)}, ${m((n >> 8) & 255)}, ${m(n & 255)})`;
}

const FORCA = [
  { ate: 0, t: 0.88, rotulo: "nenhum" },
  { ate: 49, t: 0.45, rotulo: "1 a 49" },
  { ate: 199, t: 0.25, rotulo: "50 a 199" },
  { ate: 999, t: 0.10, rotulo: "200 a 999" },
  { ate: Infinity, t: 0, rotulo: "1.000+" },
];

function faixa(v: number) {
  return FORCA.find((f) => v <= f.ate) ?? FORCA[FORCA.length - 1];
}

export function MapaVotos({
  uf = "BA",
  semRede,
  votosPorMunicipio,
  corTema = "#1d4ed8",
  onAbrirMunicipio,
}: {
  uf?: string;
  semRede: string[];
  votosPorMunicipio?: Record<string, number>;
  corTema?: string;
  onAbrirMunicipio?: (municipio: string) => void;
}) {
  const [features, setFeatures] = useState<MunFeature[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; nome: string; votos: number } | null>(null);

  const semRedeSet = useMemo(() => new Set(semRede.map(chave)), [semRede]);

  const mapaChave = useMemo(() => {
    if (!votosPorMunicipio) return null;
    const m = new Map<string, number>();
    // O TSE usa o nome de hoje; a malha, às vezes, o antigo ("Mogi Mirim" x
    // "Moji Mirim", "Assu" x "Açu"). Sem o apelido a cidade ficava cinza
    // mesmo com voto. Lista conferida contra as 27 malhas em 20/10/2026.
    const apelidos = (APELIDOS_MUNICIPIOS as Record<string, Record<string, string>>)[(uf || "BA").toUpperCase()] ?? {};
    for (const [cidade, v] of Object.entries(votosPorMunicipio)) {
      const k = chave(cidade);
      m.set(apelidos[k] ?? k, v);
    }
    return m;
  }, [votosPorMunicipio, uf]);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setFeatures([]);
    setSel(null);

    const ufUpper = (uf || "BA").toUpperCase();
    const url =
      ufUpper === "BA"
        ? "/bahia-municipios.json"
        : `/malhas/${ufUpper.toLowerCase()}-municipios.json`;

    fetch(url)
      .then((r) => r.json())
      .then((geo) => {
        if (vivo && geo?.features) {
          setFeatures(geo.features as MunFeature[]);
        }
      })
      .catch((err) => {
        console.warn(`Erro ao carregar malha de ${ufUpper}:`, err);
        if (vivo) carregarMalha().then((f) => vivo && setFeatures(f));
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });

    return () => {
      vivo = false;
    };
  }, [uf]);

  const { paths, path } = useMemo(() => {
    if (!features.length) return { paths: [], path: null as ReturnType<typeof geoPath> | null };
    const fc = { type: "FeatureCollection", features } as unknown as GeoPermissibleObjects;
    const p = geoPath(geoMercator().fitSize([W, H], fc));
    const ps = features.map((f) => {
      const nome = f.properties?.name || (f.properties as { nome?: string })?.nome || "";
      const k = chave(nome);
      const votos = mapaChave ? (mapaChave.get(k) ?? 0) : votosDe(nome);
      const regiao = REGIAO_DO_MUN[k] ?? "";
      const corBase =
        uf.toUpperCase() === "BA" && regiao && REGION_COLORS[regiao]
          ? REGION_COLORS[regiao]
          : corTema;
      return {
        k,
        nome,
        votos,
        regiao,
        d: p(f as unknown as GeoPermissibleObjects) || "",
        cor: votos > 0 ? clarear(corBase, faixa(votos).t) : "#f1f5f9",
      };
    });
    return { paths: ps, path: p };
  }, [features, mapaChave, corTema, uf]);

  const detalhe = useMemo(() => {
    if (!sel || !path) return null;
    const p = paths.find((x) => x.k === sel);
    const f = features.find((ff) => chave(ff.properties?.name ?? "") === sel);
    if (!p || !f) return null;
    const [[bx0, by0], [bx1, by1]] = path.bounds(f as unknown as GeoPermissibleObjects);
    // Todos os locais das zonas já importadas, num monte só — a cidade não
    // precisa saber de qual zona veio para desenhar.
    const zonas = zonasDe(p.nome);
    const locais = zonas.flatMap((z) => VOTOS_ZONA[p.nome][z].locais);
    return {
      ...p,
      bairros: bairrosDe(p.nome),
      conf: conferirBairros(p.nome),
      zonas,
      locais,
      bounds: [
        [bx0, by0],
        [bx1, by1],
      ] as [[number, number], [number, number]],
    };
  }, [sel, paths, path, features]);

  // Com bairros importados, o próprio mapa vira a cidade. Sem eles, não há o
  // que desenhar por dentro e o estado continua na tela.
  const dentroDaCidade = !!detalhe && detalhe.bairros.length > 0;

  function buscar(v: string) {
    setBusca(v);
    const achou = paths.find((p) => p.k === chave(v));
    setSel(achou ? achou.k : null);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-tinta-200 bg-white p-4 shadow-[0_1px_2px_rgba(22,32,46,0.04)] sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-400" />
            <input
              value={busca}
              onChange={(e) => buscar(e.target.value)}
              list="mun-estrategia"
              placeholder="Buscar município…"
              className="h-10 w-full rounded-lg border border-tinta-200 bg-white pl-9 pr-3 text-[13px] outline-none focus:border-tema sm:h-9"
            />
            <datalist id="mun-estrategia">
              {paths.map((p) => (
                <option key={p.k} value={p.nome} />
              ))}
            </datalist>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-[10.5px] text-tinta-500">
            {FORCA.map((f) => (
              <span key={f.rotulo} className="inline-flex items-center gap-1">
                <span
                  className="h-3 w-3 rounded-sm ring-1 ring-inset ring-black/10"
                  style={{ background: clarear("#0525f7", f.t) }}
                />
                {f.rotulo}
              </span>
            ))}
          </div>
        </div>

        {dentroDaCidade && detalhe && (
          <div className="mt-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12.5px] text-tinta-500">
                <b className="text-tinta-900">{detalhe.nome}</b> ·{" "}
                <span className="tabular">{detalhe.votos.toLocaleString("pt-BR")}</span> votos
              </p>
              <button
                type="button"
                onClick={() => {
                  setSel(null);
                  setBusca("");
                }}
                className="rounded-lg px-2.5 py-1 text-[12px] font-semibold text-tinta-500 transition-colors hover:bg-tinta-100 hover:text-tinta-900"
              >
                ← voltar ao estado
              </button>
            </div>
            <CidadeVotos
              nome={detalhe.nome}
              d={detalhe.d}
              bounds={detalhe.bounds}
              bairros={detalhe.bairros}
              locais={detalhe.locais}
            />
          </div>
        )}

        <div
          className={`relative mt-3 overflow-hidden rounded-lg bg-tinta-50 ${
            dentroDaCidade ? "hidden" : ""
          }`}
        >
          {carregando && (
            <div className="flex h-[280px] items-center justify-center text-[13px] text-tinta-400 sm:h-[380px]">
              Carregando o mapa…
            </div>
          )}
          {!carregando && (
            <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
              {paths.map((p) => {
                const ativo = sel === p.k;
                return (
                  <path
                    key={p.k}
                    d={p.d}
                    fill={p.cor}
                    stroke={ativo ? "#0f172a" : p.votos > 0 ? "#ffffff" : "#cbd5e1"}
                    strokeWidth={ativo ? 2.5 : p.votos > 0 ? 0.7 : 0.4}
                    className="cursor-pointer transition-[stroke-width]"
                    onClick={() => {
                      setSel(p.k);
                      setBusca(p.nome);
                      if (onAbrirMunicipio) {
                        onAbrirMunicipio(p.nome);
                      }
                    }}
                    onMouseMove={(e) => {
                      const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                      setTip({
                        x: e.clientX - r.left,
                        y: e.clientY - r.top,
                        nome: p.nome,
                        votos: p.votos,
                      });
                    }}
                    onMouseLeave={() => setTip(null)}
                  />
                );
              })}
            </svg>
          )}

          {tip && (
            <div
              className="pointer-events-none absolute z-10 rounded-lg bg-tinta-900 px-2.5 py-1.5 [@media(hover:none)]:hidden text-[11.5px] text-white shadow-lg"
              style={{ left: tip.x + 12, top: tip.y + 12 }}
            >
              <div className="font-bold">{tip.nome}</div>
              <div className="tabular text-white/70">
                {tip.votos.toLocaleString("pt-BR")} votos em 2022
              </div>
            </div>
          )}
        </div>
      </div>

      {detalhe && (
        <div className="rounded-xl border border-tinta-200 bg-white shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-tinta-100 px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <p
                className="text-[10.5px] font-bold uppercase tracking-[0.12em]"
                style={{ color: detalhe.regiao ? REGION_COLORS[detalhe.regiao] : CINZA }}
              >
                {detalhe.regiao || "Bahia"}
              </p>
              <h2 className="mt-1 break-words text-[20px] font-extrabold tracking-[-0.02em] text-tinta-900 sm:text-[22px]">
                {detalhe.nome}
              </h2>
              <p className="mt-0.5 text-[12.5px] text-tinta-500">
                <b className="tabular text-tinta-800">{detalhe.votos.toLocaleString("pt-BR")}</b>{" "}
                votos em 2022
                {semRedeSet.has(detalhe.k) && detalhe.votos > 0 && (
                  <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    sem ninguém na rede
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {onAbrirMunicipio && (
                <button
                  onClick={() => onAbrirMunicipio(detalhe.nome)}
                  className="rounded-lg bg-tema px-3 py-1.5 text-[11.5px] font-bold text-white transition hover:opacity-95 shadow-sm"
                >
                  Ver Camada Municipal →
                </button>
              )}
              <button
                onClick={() => {
                  setSel(null);
                  setBusca("");
                }}
                className="rounded-md p-1.5 text-tinta-400 transition-colors hover:bg-tinta-100 hover:text-tinta-700"
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {detalhe.bairros.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-[13px] font-bold text-tinta-700">
                Bairros ainda não importados para {detalhe.nome}.
              </p>
              <p className="mx-auto mt-1.5 max-w-sm text-[12px] leading-relaxed text-tinta-500">
                A plataforma sabe o total do município, mas não sabe onde dentro dele. Enquanto o
                dado não entra, ela diz isso em vez de repartir o número por conta própria.
              </p>
            </div>
          ) : (
            <div className="px-4 py-4 sm:px-5">
              {!detalhe.conf.bate && (
                <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
                  Os {detalhe.conf.quantos} bairros somam{" "}
                  <b>{detalhe.conf.soma.toLocaleString("pt-BR")}</b>, e o município tem{" "}
                  <b>{detalhe.conf.total.toLocaleString("pt-BR")}</b>. Faltam{" "}
                  {detalhe.conf.diferenca.toLocaleString("pt-BR")} votos para fechar.
                </p>
              )}

              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-tinta-500">
                {detalhe.conf.quantos} bairros na apuração
                {detalhe.conf.bate && (
                  <span className="ml-2 font-medium normal-case tracking-normal text-emerald-600">
                    somam o total do município ✓
                  </span>
                )}
              </p>
              {/* O ✓ diz que voto nenhum sumiu. Não diz que a cidade toda está
                  aqui — e não está: Salvador tem 163 bairros e a apuração cita
                  146 nomes. Dizer só o ✓ fazia a lista parecer o retrato
                  completo, e é dela que vem a pergunta "cadê a Amaralina". */}
              <p className="mt-1 text-[11px] leading-relaxed text-tinta-400">
                São os nomes que a apuração cita. Salvador tem 163 bairros, e os que não aparecem em
                linha nenhuma estão listados abaixo do mapa — ausência ali não é zero voto.
              </p>

              <div className="mt-3 max-h-[380px] space-y-1.5 overflow-y-auto pr-1">
                {detalhe.bairros.map((b, i) => (
                  <div key={b.nome} className="flex items-center gap-3">
                    <span className="tabular w-6 shrink-0 text-right text-[11px] text-tinta-300">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] text-tinta-800">{b.nome}</span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-tinta-100">
                        <span
                          className="block h-full rounded-full bg-tema"
                          style={{
                            width: `${Math.max(3, (b.votos / detalhe.bairros[0].votos) * 100)}%`,
                          }}
                        />
                      </span>
                    </span>
                    <span className="tabular w-12 shrink-0 text-right text-[12.5px] font-bold text-tinta-900">
                      {b.votos.toLocaleString("pt-BR")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {detalhe.zonas.length > 0 && (
            <div className="border-t border-tinta-100 px-4 py-4 sm:px-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-tinta-500">
                Zonas importadas
              </p>
              <div className="mt-3 space-y-4">
                {/* Os locais em si estão no desenho acima, ordenados e com nome
                    inteiro. Aqui fica só o tamanho da zona — repetir a lista era
                    dizer a mesma coisa duas vezes, e a versão daqui dizia por
                    força, que é ranking que esta coluna não sustenta. */}
                {detalhe.zonas.map((z) => {
                  const dados = VOTOS_ZONA[detalhe.nome][z];
                  const total = dados.secoes.reduce((s, x) => s + x.votos, 0);
                  return (
                    <p key={z} className="text-[12.5px] font-bold text-tinta-800">
                      Zona {z}{" "}
                      <span className="tabular font-medium text-tinta-500">
                        · {total.toLocaleString("pt-BR")} votos · {dados.secoes.length} seções ·{" "}
                        {dados.locais.length} locais
                      </span>
                    </p>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
