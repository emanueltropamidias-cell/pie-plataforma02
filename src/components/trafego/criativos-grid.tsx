"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { rotuloObjetivo } from "@/lib/trafego-labels";

export type Criativo = {
  id: string;
  ad_id: string;
  ad_name: string | null;
  campanha: string | null;
  thumbnail_url: string | null;
  status: string | null;
  objetivo?: string | null;
  gasto: number;
  impressoes: number;
  cliques: number;
  resultados: number;
  tipo_resultado: string | null;
  conta_id?: string | null;
};

function reais(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}
function pct(a: number, b: number) {
  if (!b) return "0%";
  return ((a / b) * 100).toFixed(2).replace(".", ",") + "%";
}

// O CDN da Meta corta a imagem pelo parâmetro `stp` (ex.: stp=dst-emg0_p64x64).
// Sem ele, o fbcdn devolve o arquivo no tamanho original — é o que deixa o card nítido.
function semRedimensionamento(url: string) {
  try {
    const u = new URL(url);
    if (!u.searchParams.has("stp")) return url;
    u.searchParams.delete("stp");
    return u.toString();
  } catch {
    return url;
  }
}

// ── POR QUE UNS SAEM BORRADOS E OUTROS NÃO ──────────────────────────────────
//
// Não é a tela: é o que foi gravado. Dos 42 criativos da base, 12 estão salvos
// como `p64x64` — a miniatura que a Meta devolve quando o sync não conseguiu a
// arte cheia (vídeo e anúncio feito a partir de publicação são os casos). Os
// outros 25 vieram inteiros.
//
// Esticar 64 pixels num quadrado de 350 é o borrado que o Emanuel vê. E `object-
// cover` ainda cortava o criativo: story é 9:16, feed é 1:1, e o quadrado comia
// as pontas — a chamada some justamente do criativo vertical.
//
// Três decisões aqui:
//
//   `contain`      o criativo aparece inteiro, na proporção em que foi feito. O
//                  cartão continua quadrado, então a grade não desalinha.
//   fundo escuro   criativo tem fundo branco na maioria das vezes; sobre cinza
//                  claro ele sangrava e não dava para ver onde acabava a arte.
//   NÃO ESTICAR    imagem pequena fica no tamanho dela, nítida, com um aviso.
//                  Melhor um selo dizendo "miniatura" do que uma arte borrada
//                  que a coordenação lê como criativo de má qualidade.
function ImagemCriativo({ url, alt }: { url: string; alt: string }) {
  const [src, setSrc] = useState(() => semRedimensionamento(url));
  // `null` enquanto não carregou. Depois, a largura real do arquivo.
  const [largura, setLargura] = useState<number | null>(null);
  // Sem efeito para "resetar quando a URL muda": quem chama passa `key={url}`,
  // e o React monta um componente novo com o estado zerado. Zerar estado dentro
  // de `useEffect` pinta a tela duas vezes — e o lint recusa.

  // 200px é o corte: abaixo disso é miniatura de catálogo, não arte de anúncio.
  const miniatura = largura !== null && largura < 200;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={(e) => setLargura(e.currentTarget.naturalWidth)}
        onError={() => setSrc((atual) => (atual === url ? atual : url))}
        className={
          miniatura
            ? "absolute left-1/2 top-1/2 max-h-[64px] max-w-[64px] -translate-x-1/2 -translate-y-1/2"
            : "h-full w-full object-contain"
        }
      />
      {miniatura && (
        <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-white">
          só miniatura
        </span>
      )}
    </>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const ativo = (status ?? "").toUpperCase() === "ACTIVE";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        ativo ? "bg-emerald-100 text-emerald-700" : "bg-tinta-200 text-tinta-500"
      }`}
    >
      {ativo ? "Ativo" : "Pausado"}
    </span>
  );
}

// ── A ORDEM É O QUE RENDEU, NÃO O QUE GASTOU ────────────────────────────────
//
// A grade abria pelo criativo que mais gastou — que não é o que mais rendeu, e
// é justamente o que a coordenação quer achar para escalar. Agora: primeiro os
// que iniciaram conversa, do mais barato para o mais caro; depois o resto, por
// gasto. Menos de 20 conversas não entra no ranking — um criativo com 3
// conversas a R$ 0,90 é sorte, não resultado.
const MINIMO_RANKING = 20;
const custoConversa = (c: Criativo) =>
  c.tipo_resultado === "Conversas iniciadas" && c.resultados >= MINIMO_RANKING ? c.gasto / c.resultados : null;

export function CriativosGrid({ criativos }: { criativos: Criativo[] }) {
  const ordenados = [...criativos].sort((a, b) => {
    const ca = custoConversa(a), cb = custoConversa(b);
    if (ca != null && cb != null) return ca - cb;
    if (ca != null) return -1;
    if (cb != null) return 1;
    return b.gasto - a.gasto;
  });
  const melhores = new Set(ordenados.filter((c) => custoConversa(c) != null).slice(0, 3).map((c) => c.id));

  if (ordenados.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-tinta-300 bg-white p-10 text-center">
        <p className="text-sm text-tinta-500">
          Nenhum criativo nesta conta. Os anúncios chegam sozinhos na sincronização diária.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {ordenados.map((c) => {
        const cpc = c.cliques ? c.gasto / c.cliques : 0;
        const custoResultado = c.resultados ? c.gasto / c.resultados : 0;
        return (
          <div key={c.id} className="flex flex-col overflow-hidden rounded-xl border border-tinta-200 bg-white shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
            {/* Fundo escuro porque criativo quase sempre tem fundo branco:
                sobre cinza claro ele sangrava e não se via onde a arte acaba. */}
            <div className="relative aspect-square w-full bg-tinta-800">
              {c.thumbnail_url ? (
                <ImagemCriativo key={c.thumbnail_url} url={c.thumbnail_url} alt={c.ad_name ?? "Criativo"} />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-tinta-400">
                  <ImageOff size={36} />
                  <span className="text-[10.5px] font-semibold uppercase tracking-wide">
                    arte não veio no sync
                  </span>
                </div>
              )}
              <div className="absolute right-2 top-2">
                <StatusBadge status={c.status} />
              </div>
              {melhores.has(c.id) && (
                <span className="absolute left-2 top-2 rounded-full bg-[#eef7f1] px-2 py-0.5 text-[10px] font-bold text-[#12703c]">
                  Entre os 3 mais baratos
                </span>
              )}
            </div>

            <div className="flex flex-1 flex-col gap-3 p-4">
              <div>
                <p className="line-clamp-2 text-sm font-semibold text-tinta-900">{c.ad_name ?? "Sem nome"}</p>
                {c.campanha && <p className="mt-0.5 line-clamp-1 text-[12px] text-tinta-500">{c.campanha}</p>}
                {c.objetivo && (
                  <span className="mt-1 inline-block rounded-full bg-tema/[0.07] px-2 py-0.5 text-[10px] font-semibold text-tema">
                    {rotuloObjetivo(c.objetivo)}
                  </span>
                )}
              </div>

              <div className="mt-auto grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
                <div>
                  <p className="text-[11px] text-tinta-400">Investimento</p>
                  <p className="font-semibold text-tinta-900">{reais(c.gasto)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-tinta-400">CTR</p>
                  <p className="font-medium text-tinta-700">{pct(c.cliques, c.impressoes)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-tinta-400">Cliques</p>
                  <p className="font-medium text-tinta-700">{fmt(c.cliques)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-tinta-400">CPC</p>
                  <p className="font-medium text-tinta-700">{reais(cpc)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-tinta-400">{c.tipo_resultado || "Resultados"}</p>
                  <p className="font-semibold text-[#059669]">{fmt(c.resultados)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-tinta-400">Custo/result.</p>
                  <p className="font-medium text-tinta-700">{reais(custoResultado)}</p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
