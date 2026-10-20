"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquareText as Icone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PainelDaBarra } from "@/components/caixa/painel";

// As mensagens prontas, na barra da conversa.
//
// ── POR QUE UM BOTÃO SEPARADO DO SANTINHO ───────────────────────────────────
//
// As frases apareciam junto com santinho e vídeo, no mesmo menu, porque o
// filtro de lá é "tudo que não é voz". Funciona e esconde: quem quer mandar uma
// frase abre um menu chamado Santinho e procura no meio das imagens.
//
// A frase é o material mais usado numa campanha de WhatsApp — é o "obrigada
// pelo apoio" e o "nosso número é 1022" que saem o dia inteiro. Material que se
// manda o dia inteiro merece o próprio botão.
//
// Mesma rota do áudio e do santinho (`/api/atendimento/material`), que despacha
// pelo tipo — então o teto do chip e a trava de primeiro contato valem igual,
// sem uma segunda cópia da regra para alguém esquecer de atualizar.

type Frase = {
  id: number;
  titulo: string;
  quando: string | null;
  texto: string | null;
  vezes: number;
};

export function MensagensProntasNaBarra({
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
  const [lista, setLista] = useState<Frase[] | null>(null);
  const [enviando, setEnviando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // A lista só é buscada quando o menu abre, e uma vez só: ela muda uma vez por
  // semana e a caixa abre dezenas de vezes por hora.
  useEffect(() => {
    if (!aberto || lista) return;
    let vivo = true;
    supabase
      .from("materiais")
      .select("id, titulo, quando, texto, vezes")
      .eq("ativo", true)
      .eq("tipo", "texto")
      .order("ordem")
      .order("titulo")
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) {
          setErro(error.message);
          setLista([]);
          return;
        }
        setLista((data ?? []) as Frase[]);
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

  async function mandar(m: Frase) {
    setEnviando(m.id);
    setErro(null);
    try {
      const r = await fetch("/api/atendimento/material", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversaId, materialId: m.id }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErro(j?.erro ?? "Não consegui mandar.");
        return;
      }
      setAberto(false);
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
        aria-label="Mensagens prontas"
        title="Mensagens prontas"
        className={`flex h-[34px] items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold transition-colors disabled:opacity-40 ${
          aberto
            ? "border-tema/30 bg-tema/10 text-tema"
            : "border-tinta-200 text-tinta-600 hover:border-tinta-300 hover:bg-tinta-100 hover:text-tinta-900"
        }`}
      >
        <Icone size={16} />
        Mensagens
      </button>

      {aberto && (
        <PainelDaBarra
          titulo="Mensagens prontas"
          largura="24rem"
          ancora="esquerda"
          aoFechar={() => setAberto(false)}
          rodape="O nome e o link certos entram sozinhos na hora do envio."
        >
          <div className="p-2">
            {erro && (
              <p className="mb-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[11.5px] leading-snug text-red-700">
                {erro}
              </p>
            )}

            {lista === null && (
              <p className="px-2 py-3 text-[12px] text-tinta-400">carregando…</p>
            )}

            {lista?.length === 0 && (
              <p className="px-2 py-3 text-[12px] leading-relaxed text-tinta-500">
                Nenhuma mensagem pronta ainda. A coordenação escreve em{" "}
                <b>Mensagens prontas</b>.
              </p>
            )}

            {lista?.map((m) => (
              <button
                key={m.id}
                onClick={() => mandar(m)}
                disabled={enviando !== null}
                className="flex w-full flex-col gap-1 rounded-lg px-2.5 py-2 text-left hover:bg-tinta-100 disabled:opacity-40"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12.5px] font-semibold text-tinta-800">
                    {m.titulo}
                  </span>
                  {enviando === m.id ? (
                    <span className="shrink-0 text-[11px] text-tema">enviando…</span>
                  ) : (
                    m.quando && (
                      <span className="shrink-0 text-[11px] text-tinta-400">
                        {m.quando}
                      </span>
                    )
                  )}
                </span>
                {/* O TEXTO APARECE, e não só o título. Mandar mensagem em nome da
                    campanha sem ver o que vai é o jeito de descobrir a frase
                    errada depois que ela chegou. Duas linhas bastam para
                    reconhecer qual é. */}
                <span className="line-clamp-2 text-[11.5px] leading-snug text-tinta-500">
                  {m.texto}
                </span>
              </button>
            ))}
          </div>
        </PainelDaBarra>
      )}
    </div>
  );
}
