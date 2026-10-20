"use client";

import { useEffect, useMemo, useState } from "react";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import type { Feature, Geometry } from "geojson";
import { carregarMalha } from "@/components/mapa/mapa-bahia";
import { chave } from "@/lib/eleicao";
import {
  faixasDe,
  valorDoModo,
  type LinhaComparada,
  type Modo,
} from "@/lib/dobradinha";

// O mapa da dobradinha.
//
// Quatro leituras do mesmo desenho, porque a pergunta muda conforme a conversa
// com a parceira avança:
//
//   dela / Talita   onde cada uma tem voto, separadas.
//   soma            o tamanho da dupla junta — é o número que se leva para a
//                   mesa da negociação.
//   contraste       ONDE DOBRAR. É a leitura que decide: cidade onde as duas já
//                   são fortes ganha pouco com dobradinha, e cidade onde só uma
//                   é forte é exatamente onde a outra pega carona.
//
// ── A COR ────────────────────────────────────────────────────────────────────
//
// Uma cor por candidata, e TODAS SAÍDAS DA PALETA DO PIE — o azul do tema e as
// cores das regiões da Bahia, que já pintam os outros três mapas do sistema.
//
// Antes a parceira era rosa e a soma âmbar. Aquilo NÃO era cor solta: âmbar é
// `--marca-ambar` e o rosa é quase o `--marca-rosa`, os dois da identidade em
// `globals.css`.
//
// E a tentativa seguinte, pintar cada uma com uma cor da paleta de REGIÕES, saiu
// pior: aquela paleta é pastel de propósito, feita para ser fundo debaixo do
// dado. Ao lado de um azul saturado ela fica encardida — cor de mapa velho.
//
// O padrão dos mapas de VOLUME no PIE é outro, e é este: uma cor só, e a
// intensidade dizendo o tamanho. Quem é o dono do mapa quem diz é a ABA, que
// está a dois centímetros dali — não precisa ser a cor. Três azuis diferentes
// para três abas seria decorar três escalas para responder a mesma pergunta.
//
// A ÚNICA que precisa de duas cores é "Onde dobrar", porque ali a pergunta é
// "para que lado pende". Rampa divergente exige dois opostos de verdade, e o
// par é azul contra âmbar: os dois vivos, os dois da marca, e ninguém confunde
// para que lado está indo.//
// Município NÃO DIGITADO não é cinza claro: é hachurado. Cinza claro seria lido
// como "pouco voto", e a diferença entre "ela teve zero" e "eu ainda não digitei"
// é a diferença entre desistir da cidade e ainda não ter olhado para ela.

type MunFeature = Feature<Geometry, { name?: string }>;

const W = 800;
const H = 800;

/** `--marca-azul` de `globals.css` — o mesmo dos botões desta tela. */
const AZUL = "#0525f7";

/** `--marca-ambar`. Só no contraste, como o polo oposto ao azul. */
const AMBAR = "#ffb700";

// Os três mapas de volume usam a mesma cor. A aba diz de quem é o mapa.
const COR_MODO: Record<Exclude<Modo, "contraste">, string> = {
  talita: AZUL,
  parceira: AZUL,
  soma: AZUL,
};

const ROTULO_MODO: Record<Modo, string> = {
  parceira: "Só ela",
  talita: "Só Talita",
  soma: "As duas somadas",
  contraste: "Onde dobrar",
};

function clarear(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const m = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${m((n >> 16) & 255)}, ${m((n >> 8) & 255)}, ${m(n & 255)})`;
}

/** Os quatro tons de uma rampa sequencial, do mais claro ao cheio. */
const TONS = [0.82, 0.58, 0.3, 0];

export function MapaDobradinha({
  linhas,
  nomeParceira,
  selecionado,
  onSelecionar,
}: {
  linhas: LinhaComparada[];
  nomeParceira: string;
  selecionado: string | null;
  onSelecionar: (municipio: string) => void;
}) {
  const [features, setFeatures] = useState<MunFeature[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modo, setModo] = useState<Modo>("parceira");
  const [tip, setTip] = useState<{
    x: number;
    y: number;
    linha: LinhaComparada;
  } | null>(null);

  useEffect(() => {
    let vivo = true;
    carregarMalha()
      .then((f) => vivo && setFeatures(f))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, []);

  const porChave = useMemo(
    () => new Map(linhas.map((l) => [l.chave, l])),
    [linhas],
  );

  // Os cortes saem dos dados do modo atual — ver `faixasDe`.
  const cortes = useMemo(() => {
    if (modo === "contraste") return [];
    const vals = linhas
      .map((l) => valorDoModo(l, modo))
      .filter((v): v is number => v !== null);
    return faixasDe(vals);
  }, [linhas, modo]);

  /** A cor de um município no modo atual. `null` = sem dado, vira hachura. */
  function corDe(l: LinhaComparada | undefined): string | null {
    if (!l) return null;
    const v = valorDoModo(l, modo);
    if (v === null) return null;

    if (modo === "contraste") {
      // Diverge em torno do zero. O limite é fixo em 1 ponto percentual: acima
      // disso a concentração já é gritante, e deixar a escala solta faria a
      // cor mudar de significado a cada município novo digitado.
      const t = Math.max(-1, Math.min(1, v));
      const forca = Math.min(1, Math.abs(t));
      if (forca < 0.08) return "#e9e9ee";
      return clarear(t > 0 ? AZUL : AMBAR, 1 - forca * 0.95);
    }

    if (v <= 0) return "#f2f2f3";
    const i = cortes.findIndex((c) => v <= c);
    const tom = TONS[i === -1 ? cortes.length : i] ?? 0;
    return clarear(COR_MODO[modo], tom);
  }

  const paths = useMemo(() => {
    if (!features.length) return [];
    const fc = {
      type: "FeatureCollection",
      features,
    } as unknown as GeoPermissibleObjects;
    const p = geoPath(geoMercator().fitSize([W, H], fc));
    return features.map((f) => {
      const nome = f.properties?.name ?? "";
      const k = chave(nome);
      const linha = porChave.get(k);
      return {
        k,
        nome,
        linha,
        d: p(f as unknown as GeoPermissibleObjects) || "",
        cor: corDe(linha),
      };
    });
    // `corDe` depende de modo e cortes, que estão nas dependências.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features, porChave, modo, cortes]);

  const semDado = paths.filter((p) => p.cor === null).length;

  return (
    <div className="flex flex-col gap-3">
      {/* ── a chave de leitura ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.keys(ROTULO_MODO) as Modo[]).map((m) => {
          const ativo = modo === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              className={`rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                ativo
                  ? "border-tema bg-tema text-white"
                  : "border-tinta-200 bg-white text-tinta-600 hover:border-tinta-300 hover:text-tinta-900"
              }`}
            >
              {m === "parceira" ? nomeParceira || "Só ela" : ROTULO_MODO[m]}
            </button>
          );
        })}
      </div>

      {/* ── legenda ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10.5px] text-tinta-500">
        {modo === "contraste" ? (
          <>
            <Amostra
              cor={clarear(AMBAR, 0.05)}
              texto={`pesa mais para ${nomeParceira || "ela"}`}
            />
            <Amostra cor="#e9e9ee" texto="pesam igual" />
            <Amostra cor={clarear(AZUL, 0.05)} texto="pesa mais para Talita" />
          </>
        ) : (
          <>
            <Amostra cor="#f2f2f3" texto="nenhum voto" />
            {cortes.map((c, i) => (
              <Amostra
                key={c}
                cor={clarear(COR_MODO[modo as Exclude<Modo, "contraste">], TONS[i])}
                texto={
                  i === 0
                    ? `até ${c.toLocaleString("pt-BR")}`
                    : `${(cortes[i - 1] + 1).toLocaleString("pt-BR")} a ${c.toLocaleString("pt-BR")}`
                }
              />
            ))}
            <Amostra
              cor={clarear(COR_MODO[modo as Exclude<Modo, "contraste">], 0)}
              texto={`${((cortes[cortes.length - 1] ?? 0) + 1).toLocaleString("pt-BR")}+`}
            />
          </>
        )}
        {semDado > 0 && (
          <span className="inline-flex items-center gap-1">
            <span
              className="h-3 w-3 rounded-sm ring-1 ring-inset ring-black/10"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, #d2d2d7 0 2px, #ffffff 2px 4px)",
              }}
            />
            {semDado} sem digitar
          </span>
        )}
      </div>

      {/* ── o mapa ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-lg bg-tinta-50">
        {carregando && (
          <div className="flex h-[380px] items-center justify-center text-[13px] text-tinta-400">
            Carregando o mapa…
          </div>
        )}
        {!carregando && (
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
            <defs>
              <pattern
                id="sem-digitar"
                width="6"
                height="6"
                patternTransform="rotate(45)"
                patternUnits="userSpaceOnUse"
              >
                <rect width="6" height="6" fill="#ffffff" />
                <rect width="2.5" height="6" fill="#d8d8dd" />
              </pattern>
            </defs>
            {paths.map((p) => {
              const ativo = selecionado === p.k;
              return (
                <path
                  key={p.k}
                  d={p.d}
                  fill={p.cor ?? "url(#sem-digitar)"}
                  stroke={ativo ? "#101114" : "#ffffff"}
                  strokeWidth={ativo ? 1.6 : 0.4}
                  className="cursor-pointer outline-none"
                  tabIndex={-1}
                  onMouseMove={(e) => {
                    const r = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                    if (!r || !p.linha) return;
                    setTip({
                      x: e.clientX - r.left,
                      y: e.clientY - r.top,
                      linha: p.linha,
                    });
                  }}
                  onMouseLeave={() => setTip(null)}
                  onClick={() => onSelecionar(p.nome)}
                />
              );
            })}
          </svg>
        )}

        {tip && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-tinta-200 bg-white px-3 py-2 text-[12px] shadow-lg"
            style={{
              left: Math.min(tip.x + 12, 620),
              top: Math.max(tip.y - 10, 4),
            }}
          >
            <div className="font-semibold text-tinta-900">{tip.linha.municipio}</div>
            <div className="tabular mt-0.5 text-tinta-600">
              Talita: {tip.linha.talita.toLocaleString("pt-BR")}
            </div>
            <div className="tabular text-tinta-600">
              {nomeParceira || "Ela"}:{" "}
              {tip.linha.dela === null ? (
                <span className="text-tinta-400">não digitado</span>
              ) : (
                tip.linha.dela.toLocaleString("pt-BR")
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Amostra({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="h-3 w-3 rounded-sm ring-1 ring-inset ring-black/10"
        style={{ background: cor }}
      />
      {texto}
    </span>
  );
}
