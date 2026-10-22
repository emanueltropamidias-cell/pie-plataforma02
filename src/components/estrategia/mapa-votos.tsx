"use client";

import { useEffect, useMemo, useState } from "react";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import type { Feature, Geometry } from "geojson";
import APELIDOS_MUNICIPIOS from "@/lib/municipios-apelidos.json";
import { Search } from "lucide-react";
import { carregarMalha } from "@/components/mapa/mapa-bahia";
import { chave } from "@/lib/eleicao";

// Mapa de calor da votação de um candidato, município a município.
//
// ── O QUE MUDOU EM 22/10/2026 ───────────────────────────────────────────────
//
// 1. A cor dizia "votos absolutos" em faixas fixas (1–49, 50–199…). Para o
//    presidente em São Paulo tudo caía em "1.000+"; para um vereador, quase
//    tudo em "1–49". Agora as faixas saem do próprio candidato (quintis das
//    cidades em que teve voto), e a legenda mostra os números de verdade.
// 2. Votos absolutos pintam onde mora mais gente. As medidas "% do
//    eleitorado" e "% dos válidos" dividem pelos eleitores aptos e pelos votos
//    válidos do cargo naquela cidade — é aí que aparece onde o candidato é
//    forte de fato.
// 3. A busca de município abria um cartão com os bairros da Talita em 2022
//    para qualquer candidato, e a dica dizia "votos em 2022" em todo ano. Os
//    dois saíram: o detalhe da cidade é a camada municipal do painel.
//
// `pintura` troca a regra de cor inteira — é o que a aba Comparar usa para
// pintar quem venceu em cada cidade.

type MunFeature = Feature<Geometry, { name?: string }>;

export type MedidaMapa = "votos" | "eleitorado" | "validos";
export type BaseCidade = { aptos: number; comparecimento: number; validos: number };

export type PinturaMapa = {
  cor: (k: string) => string | null;
  dica: (k: string, nome: string) => string;
  legenda: { cor: string; rotulo: string }[];
};

const W = 800;
const H = 800;

// Rampa sequencial de um matiz só, do claro ao escuro (5 classes). Em modo
// escuro ela continua legível porque o fundo do mapa é o cinza do tema e a
// classe mais clara ainda se distingue do "sem voto".
const RAMPA = ["#c7d7fe", "#93b4fd", "#5b8cf7", "#2f5fe0", "#1b3a9c"];
const SEM_VOTO = "var(--tinta-100)";

const fmt = (n: number) => n.toLocaleString("pt-BR");
const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: n < 1 ? 2 : 1 })}%`;

/**
 * Cortes das classes pelos quintis dos valores positivos, sem repetir: com
 * poucas cidades (ou uma só) a legenda dizia "até 36.065" cinco vezes.
 */
function cortes(valores: number[]) {
  const v = valores.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return [];
  const q = (p: number) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return [...new Set([q(0.2), q(0.4), q(0.6), q(0.8)])].filter((x) => x < v[v.length - 1]);
}

function classe(valor: number, c: number[]) {
  let i = 0;
  while (i < c.length && valor > c[i]) i++;
  return i;
}

export function MapaVotos({
  uf = "BA",
  votosPorMunicipio,
  base,
  medida = "votos",
  ano,
  semRede,
  pintura,
  onAbrirMunicipio,
}: {
  uf?: string;
  votosPorMunicipio: Record<string, number>;
  /** Eleitores e válidos do cargo por município — habilita as medidas em %. */
  base?: Record<string, BaseCidade> | null;
  medida?: MedidaMapa;
  ano?: number;
  /** Municípios com voto e sem ninguém na base da campanha (contorno âmbar). */
  semRede?: string[];
  pintura?: PinturaMapa;
  onAbrirMunicipio?: (municipio: string) => void;
}) {
  // A malha guardada junto com o estado a que pertence: trocar de estado
  // mostra "carregando" sem zerar nada dentro do efeito.
  const [malha, setMalha] = useState<{ uf: string; features: MunFeature[] } | null>(null);
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; k: string; nome: string } | null>(null);

  const ufUpper = (uf || "BA").toUpperCase();
  const carregando = malha?.uf !== ufUpper;
  const features = useMemo(() => (malha?.uf === ufUpper ? malha.features : []), [malha, ufUpper]);
  const semRedeSet = useMemo(() => new Set((semRede ?? []).map(chave)), [semRede]);

  // O TSE usa o nome de hoje; a malha, às vezes, o antigo ("Mogi Mirim" x
  // "Moji Mirim", "Assu" x "Açu"). Sem o apelido a cidade ficava cinza
  // mesmo com voto. Lista conferida contra as 27 malhas em 20/10/2026.
  const porChave = useMemo(() => {
    const apelidos = (APELIDOS_MUNICIPIOS as Record<string, Record<string, string>>)[ufUpper] ?? {};
    const m = new Map<string, { votos: number; base: BaseCidade | null }>();
    const nomes = new Set([...Object.keys(votosPorMunicipio), ...Object.keys(base ?? {})]);
    for (const cidade of nomes) {
      const k = chave(cidade);
      m.set(apelidos[k] ?? k, { votos: votosPorMunicipio[cidade] ?? 0, base: base?.[cidade] ?? null });
    }
    return m;
  }, [votosPorMunicipio, base, ufUpper]);

  // Valor que a cor representa, na medida escolhida. Sem a base, cai em votos.
  const medidaReal: MedidaMapa = base ? medida : "votos";
  const valorDe = useMemo(
    () => (k: string) => {
      const d = porChave.get(k);
      if (!d || !d.votos) return 0;
      if (medidaReal === "eleitorado") return d.base?.aptos ? (d.votos / d.base.aptos) * 100 : 0;
      if (medidaReal === "validos") return d.base?.validos ? (d.votos / d.base.validos) * 100 : 0;
      return d.votos;
    },
    [porChave, medidaReal],
  );

  useEffect(() => {
    let vivo = true;
    const url = ufUpper === "BA" ? "/bahia-municipios.json" : `/malhas/${ufUpper.toLowerCase()}-municipios.json`;
    fetch(url)
      .then((r) => r.json())
      .then((geo) => {
        if (vivo) setMalha({ uf: ufUpper, features: (geo?.features ?? []) as MunFeature[] });
      })
      .catch((err) => {
        console.warn(`Erro ao carregar malha de ${ufUpper}:`, err);
        if (!vivo) return;
        if (ufUpper === "BA") carregarMalha().then((f) => vivo && setMalha({ uf: ufUpper, features: f }));
        else setMalha({ uf: ufUpper, features: [] });
      });
    return () => {
      vivo = false;
    };
  }, [ufUpper]);

  const desenho = useMemo(() => {
    if (!features.length) return null;
    const fc = { type: "FeatureCollection", features } as unknown as GeoPermissibleObjects;
    const p = geoPath(geoMercator().fitSize([W, H], fc));
    return features.map((f) => {
      const nome = f.properties?.name || (f.properties as { nome?: string })?.nome || "";
      return { k: chave(nome), nome, d: p(f as unknown as GeoPermissibleObjects) || "" };
    });
  }, [features]);

  const c = useMemo(() => (desenho ? cortes(desenho.map((x) => valorDe(x.k))) : []), [desenho, valorDe]);

  const legenda = useMemo(() => {
    if (pintura) return pintura.legenda;
    const f = medidaReal === "votos" ? (n: number) => fmt(Math.round(n)) : pct;
    if (!c.length) return desenho?.some((x) => valorDe(x.k) > 0) ? [{ cor: RAMPA[RAMPA.length - 1], rotulo: "com voto" }] : [];
    // As classes usadas são as últimas da rampa: poucas classes ficam escuras.
    const cores = RAMPA.slice(RAMPA.length - c.length - 1);
    return cores.map((cor, i) => ({ cor, rotulo: i === c.length ? `acima de ${f(c[i - 1])}` : `até ${f(c[i])}` }));
  }, [c, medidaReal, pintura, desenho, valorDe]);

  function corDe(k: string) {
    if (pintura) return pintura.cor(k) ?? SEM_VOTO;
    const v = valorDe(k);
    return v > 0 ? RAMPA[RAMPA.length - c.length - 1 + classe(v, c)] : SEM_VOTO;
  }

  function dicaDe(k: string, nome: string) {
    if (pintura) return pintura.dica(k, nome);
    const d = porChave.get(k);
    const votos = d?.votos ?? 0;
    const partes = [`${fmt(votos)} votos${ano ? ` em ${ano}` : ""}`];
    if (d?.base?.aptos && votos) partes.push(`${pct((votos / d.base.aptos) * 100)} do eleitorado`);
    if (d?.base?.validos && votos) partes.push(`${pct((votos / d.base.validos) * 100)} dos válidos`);
    return partes.join(" · ");
  }

  function abrir(k: string, nome: string) {
    setSel(k);
    setBusca(nome);
    onAbrirMunicipio?.(nome);
  }

  function buscar(v: string) {
    setBusca(v);
    const achou = desenho?.find((p) => p.k === chave(v));
    if (achou) abrir(achou.k, achou.nome);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-400" />
          <input
            value={busca}
            onChange={(e) => buscar(e.target.value)}
            list={`mun-estrategia-${ufUpper}`}
            placeholder="Abrir município…"
            className="h-10 w-full rounded-lg border border-tinta-200 bg-white pl-9 pr-3 text-[13px] outline-none focus:border-tema sm:h-9"
          />
          <datalist id={`mun-estrategia-${ufUpper}`}>
            {desenho?.map((p) => <option key={p.k} value={p.nome} />)}
          </datalist>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-[10.5px] text-tinta-500">
          {legenda.map((f) => (
            <span key={f.rotulo} className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm ring-1 ring-inset ring-black/10" style={{ background: f.cor }} />
              {f.rotulo}
            </span>
          ))}
          {!!semRedeSet.size && !pintura && (
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded-sm border-2 border-amber-600" />
              sem rede
            </span>
          )}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-lg bg-tinta-50">
        {(carregando || !desenho) && (
          <div className="flex h-[280px] items-center justify-center text-[13px] text-tinta-400 sm:h-[380px]">
            {carregando ? "Carregando o mapa…" : "Malha do estado indisponível."}
          </div>
        )}
        {!carregando && desenho && (
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Mapa de votos em ${ufUpper}`}>
            {desenho.map((p) => {
              const ativo = sel === p.k;
              const temVoto = (porChave.get(p.k)?.votos ?? 0) > 0;
              const semRedeAqui = !pintura && temVoto && semRedeSet.has(p.k);
              return (
                <path
                  key={p.k}
                  d={p.d}
                  fill={corDe(p.k)}
                  stroke={ativo ? "var(--tinta-900)" : semRedeAqui ? "#d97706" : "var(--tinta-200)"}
                  strokeWidth={ativo ? 2.5 : semRedeAqui ? 1.6 : 0.5}
                  className="cursor-pointer transition-[stroke-width]"
                  onClick={() => abrir(p.k, p.nome)}
                  onMouseMove={(e) => {
                    const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, k: p.k, nome: p.nome });
                  }}
                  onMouseLeave={() => setTip(null)}
                />
              );
            })}
          </svg>
        )}

        {tip && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg bg-tinta-900 px-2.5 py-1.5 text-[11.5px] text-tinta-50 shadow-lg [@media(hover:none)]:hidden"
            style={{ left: Math.min(tip.x + 12, 520), top: tip.y + 12 }}
          >
            <div className="font-bold">{tip.nome}</div>
            <div className="tabular text-tinta-300">{dicaDe(tip.k, tip.nome)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
