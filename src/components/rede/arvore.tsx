"use client";

import { useMemo, useState } from "react";
import { ChevronRight, MessageSquare, Users } from "lucide-react";

// Árvore da rede: quem trouxe quem.
//
// Cada liderança é uma raiz; abaixo dela ficam as pessoas que ela indicou
// ou pelo link dela, e abaixo delas quem elas trouxeram. Só o galho aberto é
// desenhado — uma liderança sozinha tem quase trezentos filhos, e montar todos
// de uma vez travaria a tela sem que ninguém tivesse pedido para ver.

export type No = {
  id: string;
  nome: string;
  municipio: string | null;
  parent_id: string | null;
  tipo: string | null;
};

const LOTE = 40;
// Recuo por nível. No celular a largura é o recurso escasso: 18 px por nível
// empurrava o nome para fora já no terceiro galho.
const RECUO = 14;

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

function ehLideranca(n: No) {
  return (n.tipo ?? "lideranca") === "lideranca";
}

export function Arvore({ nos, abrirPrimeiro = false }: { nos: No[]; abrirPrimeiro?: boolean }) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const { filhosPor, raizes, tamanho } = useMemo(() => {
    const filhosPor = new Map<string, No[]>();
    for (const n of nos) {
      if (!n.parent_id) continue;
      const arr = filhosPor.get(n.parent_id) ?? [];
      arr.push(n);
      filhosPor.set(n.parent_id, arr);
    }

    // Quantas pessoas há embaixo de cada nó, contando netos. Calculado uma vez
    // e guardado: a mesma conta apareceria em toda linha desenhada.
    const tamanho = new Map<string, number>();
    function medir(id: string): number {
      const guardado = tamanho.get(id);
      if (guardado !== undefined) return guardado;
      const filhos = filhosPor.get(id) ?? [];
      let total = filhos.length;
      for (const f of filhos) total += medir(f.id);
      tamanho.set(id, total);
      return total;
    }
    for (const n of nos) medir(n.id);

    for (const [, arr] of filhosPor) {
      arr.sort(
        (a, b) => (tamanho.get(b.id) ?? 0) - (tamanho.get(a.id) ?? 0) || a.nome.localeCompare(b.nome, "pt-BR"),
      );
    }

    const raizes = nos
      .filter((n) => ehLideranca(n) && !n.parent_id)
      .sort(
        (a, b) => (tamanho.get(b.id) ?? 0) - (tamanho.get(a.id) ?? 0) || a.nome.localeCompare(b.nome, "pt-BR"),
      );

    return { filhosPor, raizes, tamanho };
  }, [nos]);

  // Abre a raiz sozinha: quem entrou na rede de alguém quer ver a rede, não
  // um item fechado esperando mais um clique.
  const raizAberta = abrirPrimeiro && raizes.length === 1;
  const visiveis = raizes;

  function alternar(id: string) {
    setAbertos((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-tinta-200 bg-white shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
        <div className="flex items-center justify-between border-b border-tinta-100 px-5 py-2.5">
          <p className="text-[11.5px] text-tinta-500">Quem trouxe quem</p>
          <p className="text-[11.5px] text-tinta-400">Clique para abrir o galho</p>
        </div>

        {visiveis.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-tinta-500">
            Nenhuma liderança neste filtro.
          </p>
        ) : (
          <div className="px-2 py-2">
            {visiveis.map((r) => (
              <Galho
                key={r.id}
                no={r}
                nivel={0}
                filhosPor={filhosPor}
                tamanho={tamanho}
                abertos={abertos}
                alternar={alternar}
                comecarAberto={raizAberta}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Galho({
  no,
  nivel,
  filhosPor,
  tamanho,
  abertos,
  alternar,
  comecarAberto = false,
}: {
  no: No;
  nivel: number;
  filhosPor: Map<string, No[]>;
  tamanho: Map<string, number>;
  abertos: Set<string>;
  alternar: (id: string) => void;
  comecarAberto?: boolean;
}) {
  const [mostrar, setMostrar] = useState(LOTE);
  const filhos = filhosPor.get(no.id) ?? [];
  const total = tamanho.get(no.id) ?? 0;
  // Uma vez que a pessoa clica, a escolha dela manda — inclusive para fechar.
  const aberto = abertos.has(no.id) !== comecarAberto;
  const raiz = nivel === 0;
  const contato = no.tipo === "contato";

  return (
    <div>
      <button
        type="button"
        onClick={() => filhos.length && alternar(no.id)}
        className={`flex w-full items-center gap-2.5 rounded-lg py-2 pr-3 text-left transition-colors ${
          filhos.length ? "hover:bg-tinta-50" : "cursor-default"
        }`}
        style={{ paddingLeft: 6 + nivel * RECUO }}
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-tinta-400">
          {filhos.length > 0 ? (
            <ChevronRight
              size={14}
              className={`transition-transform ${aberto ? "rotate-90" : ""}`}
            />
          ) : (
            // Sem filhos, a folha ganha um ponto: o alinhamento continua e o
            // olho entende que ali o galho termina.
            <span className="h-1.5 w-1.5 rounded-full bg-tinta-300" />
          )}
        </span>

        <span
          className={`flex shrink-0 items-center justify-center rounded-full font-bold ${
            raiz
              ? "h-8 w-8 bg-tema/10 text-[11.5px] text-tema"
              : "h-6 w-6 bg-tinta-100 text-[10px] text-tinta-500"
          }`}
        >
          {iniciais(no.nome)}
        </span>

        <span className="min-w-0 flex-1">
          <span
            className={`block truncate ${
              raiz ? "text-[13.5px] font-bold text-tinta-900" : "text-[13px] text-tinta-700"
            }`}
          >
            {no.nome}
          </span>
          {no.municipio && (
            <span className="block truncate text-[11px] text-tinta-400">{no.municipio}</span>
          )}
        </span>

        {contato && (
          <span
            title="Cadastro amarrado a esta liderança"
            className="hidden shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 sm:inline-flex"
          >
            <MessageSquare size={10} /> QR
          </span>
        )}

        {total > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-tinta-100 px-2 py-0.5 text-[10.5px] font-bold text-tinta-600">
            <Users size={10} />
            <span className="tabular">{total.toLocaleString("pt-BR")}</span>
          </span>
        )}
      </button>

      {aberto && filhos.length > 0 && (
        // A linha à esquerda é o tronco: sem ela, quatro níveis de recuo viram
        // uma lista indentada e some a noção de quem veio de quem.
        <div className="border-l border-tinta-200" style={{ marginLeft: 13 + nivel * RECUO }}>
          <div style={{ marginLeft: -(13 + nivel * RECUO) }}>
            {filhos.slice(0, mostrar).map((f) => (
              <Galho
                key={f.id}
                no={f}
                nivel={nivel + 1}
                filhosPor={filhosPor}
                tamanho={tamanho}
                abertos={abertos}
                alternar={alternar}
              />
            ))}
            {filhos.length > mostrar && (
              <button
                type="button"
                onClick={() => setMostrar((v) => v + LOTE * 4)}
                className="ml-1 mt-1 rounded-md px-2 py-1 text-[12px] font-semibold text-tema hover:bg-tinta-50"
                style={{ marginLeft: 6 + (nivel + 1) * RECUO }}
              >
                Ver mais {Math.min(LOTE * 4, filhos.length - mostrar)} de{" "}
                {(filhos.length - mostrar).toLocaleString("pt-BR")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
