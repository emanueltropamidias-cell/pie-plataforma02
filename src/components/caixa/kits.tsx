"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Package, Send, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PainelDaBarra } from "@/components/caixa/painel";

// Mandar um kit, de dentro da conversa.
//
// ── O PROBLEMA AQUI É ACHAR, NÃO MANDAR ─────────────────────────────────────
//
// Vão existir muitos kits: a chapa toda, Talita sozinha, cada combinação de
// palanque, cada demanda. Uma lista de vinte nomes parecidos, no meio de uma
// conversa, custa mais tempo do que escrever a resposta na mão — e aí a menina
// para de usar.
//
// Duas coisas resolvem isso, e as duas são baratas:
//
//   BUSCA. Digitar "neto" filtra na hora. É mais rápido que rolar.
//   USO. Os que mais saem sobem sozinhos para o topo. Depois de uma semana, os
//        três primeiros são os três que ela usa o dia inteiro.
//
// ── E MANDAR É IRREVERSÍVEL ─────────────────────────────────────────────────
//
// São três a cinco mensagens de uma vez, em nome da campanha. O "para quem é"
// aparece embaixo do nome justamente para o dedo parar antes: mandar o kit de
// um palanque para quem é de outro não se recolhe.

type Kit = {
  id: number;
  nome: string;
  quando: string | null;
  cor: string;
  itens: number;
  vezes: number;
  pronto: boolean;
};

function chave(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function KitsDaCampanha({
  conversaId,
  podeEnviar,
  aoEnviar,
}: {
  conversaId: number;
  podeEnviar: boolean;
  aoEnviar: () => void;
}) {
  const supabase = createClient();
  const caixa = useRef<HTMLDivElement>(null);

  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState<Kit[] | null>(null);
  const [busca, setBusca] = useState("");
  const [enviando, setEnviando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto || lista) return;
    let vivo = true;
    supabase
      .from("kits_prontos")
      .select("id, nome, quando, cor, itens, vezes, pronto")
      .eq("ativo", true)
      // Os que mais saem primeiro: depois de uma semana, os três do topo são os
      // três que ela usa o dia inteiro.
      .order("vezes", { ascending: false })
      .order("ordem")
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) {
          setErro(
            error.code === "42P01" || error.code === "PGRST205"
              ? "Os kits ainda não foram criados no banco."
              : error.message,
          );
          setLista([]);
          return;
        }
        // Kit vazio é um botão que não faz nada. Some daqui em vez de deixar a
        // menina descobrir no clique.
        setLista(((data ?? []) as Kit[]).filter((k) => k.pronto));
      });
    return () => {
      vivo = false;
    };
  }, [aberto, lista, supabase]);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node))
        setAberto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  const filtrados = useMemo(() => {
    if (!lista) return [];
    const q = chave(busca).trim();
    if (!q) return lista;
    return lista.filter(
      (k) => chave(k.nome).includes(q) || chave(k.quando ?? "").includes(q),
    );
  }, [lista, busca]);

  async function mandar(k: Kit) {
    setEnviando(k.id);
    setErro(null);
    try {
      const r = await fetch("/api/atendimento/kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversaId, kitId: k.id }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErro(j?.erro ?? "Não consegui mandar o kit.");
        return;
      }
      setAberto(false);
      setBusca("");
      aoEnviar();
    } catch {
      setErro("Falha de rede.");
    } finally {
      setEnviando(null);
    }
  }

  return (
    <div ref={caixa} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        disabled={!podeEnviar}
        aria-label="Kits políticos"
        title="Kits políticos"
        className={`flex h-[34px] items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold transition-colors disabled:opacity-40 ${
          aberto
            ? "border-tema/30 bg-tema/10 text-tema"
            : "border-tinta-200 text-tinta-600 hover:border-tinta-300 hover:bg-tinta-100 hover:text-tinta-900"
        }`}
      >
        <Package size={16} />
        {/* O NOME AO LADO DO ÍCONE.
            Fora da barra de digitar sobra largura, e "Kit" escrito é a
            diferença entre a menina achar o santinho e caçar num ícone que
            ela nunca clicou. */}
        Kit
      </button>

      {aberto && (
        <PainelDaBarra
          titulo="Kits políticos"
          ancora="esquerda"
          largura="23rem"
          aoFechar={() => setAberto(false)}
          rodape="As mensagens saem uma a uma, com alguns segundos entre elas — como alguém mandando, não como sistema despejando."
        >

          {/* A busca só aparece quando há o bastante para justificar. Campo
              vazio acima de três itens é ruído. */}
          {(lista?.length ?? 0) > 4 && (
            <div className="sticky top-0 z-10 border-b border-tinta-100 bg-white px-2.5 py-2">
              <div className="flex h-8 items-center gap-2 rounded-lg border border-tinta-200 px-2">
                <Search size={13} className="shrink-0 text-tinta-400" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar kit…"
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-tinta-400 sm:text-[12.5px]"
                />
              </div>
            </div>
          )}

          {erro && (
            <p className="mx-2 mt-2 rounded-md bg-[#fdf1f1] px-2.5 py-2 text-[11.5px] leading-relaxed text-[#c02020]">
              {erro}
            </p>
          )}

          <div className="p-1.5">
            {lista === null && (
              <p className="px-2 py-6 text-center text-[12px] text-tinta-400">
                carregando…
              </p>
            )}

            {lista?.length === 0 && !erro && (
              <p className="px-3 py-6 text-center text-[12px] leading-relaxed text-tinta-400">
                Nenhum kit montado ainda. A coordenação monta em{" "}
                <b>Atendimento → Kits políticos</b>.
              </p>
            )}

            {lista && lista.length > 0 && filtrados.length === 0 && (
              <p className="px-3 py-6 text-center text-[12px] text-tinta-400">
                Nenhum kit com “{busca}”.
              </p>
            )}

            {filtrados.map((k) => (
              <div
                key={k.id}
                className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-tinta-50"
              >
                <span
                  className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: k.cor }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold leading-snug text-tinta-900">
                    {k.nome}
                    <span className="ml-1.5 font-normal text-tinta-400">
                      {k.itens} {k.itens === 1 ? "item" : "itens"}
                    </span>
                  </p>
                  {/* O "para quem é" está aqui para o dedo parar antes: mandar
                      o kit de um palanque para quem é de outro não se recolhe. */}
                  {k.quando && (
                    <p className="mt-0.5 text-[11px] leading-snug text-tinta-500">
                      {k.quando}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => mandar(k)}
                  disabled={enviando !== null}
                  className="mt-px flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-tema px-2.5 text-[12px] font-semibold text-white disabled:opacity-40"
                >
                  {enviando === k.id ? (
                    "…"
                  ) : (
                    <>
                      <Send size={12} />
                      Mandar
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>

        </PainelDaBarra>
      )}
    </div>
  );
}
