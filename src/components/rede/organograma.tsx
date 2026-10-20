"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Users } from "lucide-react";
import type { No } from "./arvore";

// Organograma da rede: a árvore desenhada, de cima para baixo.
//
// A lista recuada anterior é mais eficiente para varrer nomes, mas não parece
// uma árvore — e é a imagem que a liderança quer ver e mostrar para os outros.
//
// A tentativa anterior desenhava da esquerda para a direita e não cabia em
// celular nenhum. De cima para baixo o problema vira largura, e largura se
// resolve com rolagem lateral: o eixo vertical, que é o caro no celular, fica
// proporcional à profundidade da rede, não ao número de pessoas.
//
// Só o galho aberto é montado. Uma liderança com trezentos filhos desenharia
// trezentos cartões de uma vez sem ninguém ter pedido para ver.

const LOTE = 20;

function iniciais(nome: string) {
  return (
    (nome || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function Organograma({ nos }: { nos: No[] }) {
  const { filhosPor, raiz, tamanho } = useMemo(() => {
    const filhosPor = new Map<string, No[]>();
    for (const n of nos) {
      if (!n.parent_id) continue;
      const arr = filhosPor.get(n.parent_id) ?? [];
      arr.push(n);
      filhosPor.set(n.parent_id, arr);
    }

    // Quantas pessoas há embaixo de cada nó. Calculado uma vez: a mesma conta
    // apareceria em cada cartão desenhado.
    const tamanho = new Map<string, number>();
    function medir(id: string): number {
      const guardado = tamanho.get(id);
      if (guardado !== undefined) return guardado;
      let total = 0;
      for (const f of filhosPor.get(id) ?? []) total += 1 + medir(f.id);
      tamanho.set(id, total);
      return total;
    }
    for (const n of nos) medir(n.id);

    for (const [, arr] of filhosPor) {
      arr.sort(
        (a, b) =>
          (tamanho.get(b.id) ?? 0) - (tamanho.get(a.id) ?? 0) ||
          a.nome.localeCompare(b.nome, "pt-BR"),
      );
    }

    const raiz = nos.find((n) => !n.parent_id) ?? nos[0] ?? null;
    return { filhosPor, raiz, tamanho };
  }, [nos]);

  // Começa com o primeiro nível aberto: uma raiz sozinha e fechada não é uma
  // árvore, é uma caixa esperando mais um clique.
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(raiz ? [raiz.id] : []));

  if (!raiz) return null;

  function alternar(id: string) {
    setAbertos((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  const totalGeral = tamanho.get(raiz.id) ?? 0;

  return (
    <div className="overflow-hidden rounded-xl border border-tinta-200 bg-white shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
      <div className="flex items-center justify-between gap-3 border-b border-tinta-100 px-5 py-2.5">
        <p className="text-[11.5px] text-tinta-500">Quem trouxe quem</p>
        <p className="text-[11.5px] text-tinta-400">
          {totalGeral > 3 ? "Arraste para o lado · toque para abrir" : "Toque para abrir"}
        </p>
      </div>

      {/* A rolagem é lateral e fica presa a esta caixa: o corpo da página nunca
          anda de lado, que é o defeito clássico de organograma em celular. */}
      <div className="overflow-x-auto overscroll-x-contain px-5 py-6">
        <div className="mx-auto flex w-max justify-center">
          <Galho
            no={raiz}
            raiz
            filhosPor={filhosPor}
            tamanho={tamanho}
            abertos={abertos}
            alternar={alternar}
          />
        </div>
      </div>
    </div>
  );
}

function Galho({
  no,
  raiz = false,
  filhosPor,
  tamanho,
  abertos,
  alternar,
}: {
  no: No;
  raiz?: boolean;
  filhosPor: Map<string, No[]>;
  tamanho: Map<string, number>;
  abertos: Set<string>;
  alternar: (id: string) => void;
}) {
  const [mostrar, setMostrar] = useState(LOTE);
  const filhos = filhosPor.get(no.id) ?? [];
  const aberto = abertos.has(no.id);
  const abaixo = tamanho.get(no.id) ?? 0;
  const contato = no.tipo === "contato";
  const visiveis = filhos.slice(0, mostrar);
  const restam = filhos.length - visiveis.length;

  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => filhos.length && alternar(no.id)}
        aria-expanded={filhos.length ? aberto : undefined}
        className={`relative flex w-[124px] flex-col items-center rounded-xl border px-2.5 pb-2.5 pt-3 text-center transition-colors ${
          raiz
            ? "border-tema/30 bg-tema/[0.06]"
            : "border-tinta-200 bg-white hover:border-tinta-300"
        } ${filhos.length ? "cursor-pointer" : "cursor-default"}`}
      >
        <span
          className={`flex items-center justify-center rounded-full font-bold ${
            raiz
              ? "h-11 w-11 bg-tema text-[13px] text-white"
              : contato
                ? "h-9 w-9 bg-emerald-50 text-[11px] text-emerald-700"
                : "h-9 w-9 bg-tinta-100 text-[11px] text-tinta-500"
          }`}
        >
          {iniciais(no.nome)}
        </span>

        <span
          className={`mt-2 line-clamp-2 w-full text-[11.5px] leading-tight ${
            raiz ? "font-extrabold text-tinta-900" : "font-semibold text-tinta-800"
          }`}
        >
          {no.nome}
        </span>
        {no.municipio && (
          <span className="mt-0.5 line-clamp-1 w-full text-[10px] text-tinta-400">
            {no.municipio}
          </span>
        )}

        {filhos.length > 0 && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-tinta-100 px-2 py-0.5 text-[10px] font-bold text-tinta-600">
            <Users size={9} />
            <span className="tabular">{abaixo.toLocaleString("pt-BR")}</span>
            <ChevronDown
              size={11}
              className={`transition-transform ${aberto ? "rotate-180" : ""}`}
            />
          </span>
        )}
      </button>

      {aberto && filhos.length > 0 && (
        <>
          {/* Tronco: desce do cartão até a barra que liga os filhos */}
          <span className="h-5 w-px bg-tinta-200" />

          <div className="flex items-start">
            {visiveis.map((f) => (
              // A barra horizontal é montada por pedaços: cada filho desenha
              // metade para a esquerda e metade para a direita, e o primeiro e o
              // último apagam a metade que sobraria para fora da árvore.
              <div
                key={f.id}
                className="relative px-1.5 pt-5 before:absolute before:left-0 before:right-0 before:top-0 before:h-px before:bg-tinta-200 first:before:left-1/2 last:before:right-1/2 after:absolute after:left-1/2 after:top-0 after:h-5 after:w-px after:bg-tinta-200"
              >
                <Galho
                  no={f}
                  filhosPor={filhosPor}
                  tamanho={tamanho}
                  abertos={abertos}
                  alternar={alternar}
                />
              </div>
            ))}

            {restam > 0 && (
              <div className="relative px-1.5 pt-5 before:absolute before:left-0 before:right-1/2 before:top-0 before:h-px before:bg-tinta-200 after:absolute after:left-1/2 after:top-0 after:h-5 after:w-px after:bg-tinta-200">
                <button
                  type="button"
                  onClick={() => setMostrar((v) => v + LOTE * 3)}
                  className="flex h-[104px] w-[124px] flex-col items-center justify-center rounded-xl border border-dashed border-tinta-300 px-2 text-center text-[11px] font-bold text-tema transition-colors hover:border-tema/40 hover:bg-tema/[0.04]"
                >
                  +{restam.toLocaleString("pt-BR")}
                  <span className="mt-0.5 text-[10px] font-medium text-tinta-400">
                    ver mais
                  </span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
