"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, MessageSquare, Search, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Arvore, type No } from "./arvore";

// A aba abre com a rede de todo mundo: uma liderança por cartão, ordenadas por
// tamanho. Clicar num cartão entra na rede daquela liderança.
//
// A árvore é vertical de propósito. Organograma que abre os filhos lado a lado
// é bonito no computador e inutilizável no celular — e é no celular que a
// equipe olha isso, no meio da rua.

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

export function RedeClient({ nos }: { nos: No[] }) {
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const { raizes, tamanho, contatosDe, porId, filhosPor } = useMemo(() => {
    const filhosPor = new Map<string, No[]>();
    const porId = new Map<string, No>();
    for (const n of nos) {
      porId.set(n.id, n);
      if (!n.parent_id) continue;
      const arr = filhosPor.get(n.parent_id) ?? [];
      arr.push(n);
      filhosPor.set(n.parent_id, arr);
    }

    const tamanho = new Map<string, number>();
    const contatosDe = new Map<string, number>();
    function medir(id: string): number {
      const guardado = tamanho.get(id);
      if (guardado !== undefined) return guardado;
      const filhos = filhosPor.get(id) ?? [];
      let total = filhos.length;
      let viaQr = 0;
      for (const f of filhos) {
        total += medir(f.id);
        // `contato` é cadastro sem telefone, quase todo vindo de ficha de
        // campo. Já se chamou "veio pelo QR" aqui — e nunca foi: o QR de
        // verdade mora em `link_leituras`, com cinco leituras e nenhum
        // cadastro gerado. O que este número conta é indicação.
        if (f.tipo === "contato") viaQr++;
        viaQr += contatosDe.get(f.id) ?? 0;
      }
      tamanho.set(id, total);
      contatosDe.set(id, viaQr);
      return total;
    }
    for (const n of nos) medir(n.id);

    const raizes = nos
      .filter((n) => (n.tipo ?? "lideranca") === "lideranca" && !n.parent_id)
      .sort(
        (a, b) =>
          (tamanho.get(b.id) ?? 0) - (tamanho.get(a.id) ?? 0) ||
          a.nome.localeCompare(b.nome, "pt-BR"),
      );

    return { raizes, tamanho, contatosDe, porId, filhosPor };
  }, [nos]);

  const maior = tamanho.get(raizes[0]?.id ?? "") ?? 0;

  const q = busca.trim().toLowerCase();
  const lista = q
    ? raizes.filter(
        (r) => r.nome.toLowerCase().includes(q) || (r.municipio ?? "").toLowerCase().includes(q),
      )
    : raizes;

  // --- Rede de uma liderança -------------------------------------------------
  if (selecionado) {
    const raiz = porId.get(selecionado);
    if (!raiz) {
      setSelecionado(null);
      return null;
    }
    // Só o galho dessa liderança: a árvore não precisa das outras redes.
    const dentro: No[] = [];
    const fila = [raiz];
    while (fila.length) {
      const atual = fila.shift()!;
      dentro.push(atual);
      fila.push(...(filhosPor.get(atual.id) ?? []));
    }

    const total = tamanho.get(raiz.id) ?? 0;
    const viaQr = contatosDe.get(raiz.id) ?? 0;

    return (
      <div>
        <button
          type="button"
          onClick={() => setSelecionado(null)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold text-tinta-600 transition-colors hover:bg-tinta-100 hover:text-tinta-900"
        >
          <ArrowLeft size={14} /> Todas as lideranças
        </button>

        <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl border border-tinta-200 bg-white px-5 py-4 shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-tema text-[15px] font-extrabold text-white">
            {iniciais(raiz.nome)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-bold text-tinta-900">{raiz.nome}</p>
            <p className="truncate text-[12.5px] text-tinta-500">
              {raiz.municipio || "Sem município"}
            </p>
          </div>
          <div className="flex gap-5">
            <div>
              <p className="tabular text-[22px] font-extrabold leading-none text-tinta-900">
                {total.toLocaleString("pt-BR")}
              </p>
              <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-wide text-tinta-500">
                na rede
              </p>
            </div>
            <div>
              <p className="tabular text-[22px] font-extrabold leading-none text-emerald-600">
                {viaQr.toLocaleString("pt-BR")}
              </p>
              <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-wide text-tinta-500">
                indicadas
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <Arvore nos={dentro} abrirPrimeiro />
        </div>
      </div>
    );
  }

  // --- Rede de todo mundo ----------------------------------------------------
  return (
    <div>
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-400" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar liderança ou município…"
          className="h-10 pl-9"
        />
      </div>

      {lista.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-tinta-300 bg-white px-5 py-10 text-center text-[13px] text-tinta-500">
          Nenhuma liderança neste filtro.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((r) => {
            const total = tamanho.get(r.id) ?? 0;
            const viaQr = contatosDe.get(r.id) ?? 0;
            const diretos = (filhosPor.get(r.id) ?? []).length;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelecionado(r.id)}
                className="rounded-xl border border-tinta-200 bg-white p-4 text-left transition-colors hover:border-tema/40 hover:bg-tinta-50"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-tema/10 text-[12.5px] font-bold text-tema">
                    {iniciais(r.nome)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold text-tinta-900">{r.nome}</p>
                    <p className="truncate text-[11.5px] text-tinta-500">
                      {r.municipio || "Sem município"}
                    </p>
                  </div>
                  <span className="tabular shrink-0 text-[20px] font-extrabold text-tinta-900">
                    {total.toLocaleString("pt-BR")}
                  </span>
                </div>

                {/* Barra proporcional à maior rede: dá para comparar sem fazer conta */}
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-tinta-100">
                  <div
                    className="h-full rounded-full bg-tema"
                    style={{ width: `${maior ? Math.max(2, (total / maior) * 100) : 0}%` }}
                  />
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-tinta-500">
                  <span className="inline-flex items-center gap-1">
                    <Users size={11} className="text-tinta-400" />
                    <b className="tabular text-tinta-700">{diretos}</b> direto(s)
                  </span>
                  {viaQr > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare size={11} className="text-emerald-500" />
                      <b className="tabular text-tinta-700">{viaQr}</b> indicadas
                    </span>
                  )}
                  {total === 0 && <span className="text-tinta-400">rede ainda vazia</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
