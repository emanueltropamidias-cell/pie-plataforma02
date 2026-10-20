"use client";

import { useEffect, useRef, useState } from "react";
import { Image as Icone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PainelDaBarra } from "@/components/caixa/painel";

// Os santinhos e o resto do material que não é voz.
//
// ── POR QUE UM BOTÃO SEPARADO ───────────────────────────────────────────────
//
// Santinho e áudio estavam na mesma lista, porque a tabela `audios` virou
// `materiais` e o botão continuou pedindo tudo. Clicar num santinho ali tentava
// mandar a imagem COMO MENSAGEM DE VOZ — o WhatsApp exige OGG/Opus, e o que
// saía era falha ou um áudio quebrado na conversa do eleitor.
//
// Filtrar a lista de áudio resolveu aquilo e abriu outro buraco: santinho
// avulso deixou de ter caminho. Só saía dentro de kit, ou subindo do aparelho
// pelo Anexo — que ignora o que já está cadastrado na biblioteca.
//
// Este botão é esse caminho. Mesma rota do áudio (`/api/atendimento/material`),
// que despacha pelo tipo — então teto do chip e trava de primeiro contato valem
// igual, sem uma segunda cópia da regra para alguém esquecer de atualizar.

type Material = {
  id: number;
  titulo: string;
  quando: string | null;
  tipo: string;
  vezes: number;
};

const ROTULO: Record<string, string> = {
  imagem: "Santinho",
  video: "Vídeo",
  documento: "Documento",
  texto: "Frase",
};

export function Santinhos({
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
  const [lista, setLista] = useState<Material[] | null>(null);
  const [enviando, setEnviando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // A lista só é buscada quando o menu abre, e uma vez só: ela muda uma vez por
  // semana e a caixa abre dezenas de vezes por hora.
  useEffect(() => {
    if (!aberto || lista) return;
    let vivo = true;
    supabase
      .from("materiais")
      .select("id, titulo, quando, tipo, vezes")
      .eq("ativo", true)
      // TUDO QUE NÃO É VOZ. O espelho exato do filtro da lista de áudio: as
      // duas juntas cobrem a biblioteca inteira, sem material sumir entre elas.
      .neq("tipo", "audio")
      .order("ordem")
      .order("titulo")
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) {
          setErro(error.message);
          setLista([]);
          return;
        }
        setLista((data ?? []) as Material[]);
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

  async function mandar(m: Material) {
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
        aria-label="Santinhos e materiais"
        title="Santinhos e materiais"
        className={`flex h-[34px] items-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-semibold transition-colors disabled:opacity-40 ${
          aberto
            ? "border-tema/30 bg-tema/10 text-tema"
            : "border-tinta-200 text-tinta-600 hover:border-tinta-300 hover:bg-tinta-100 hover:text-tinta-900"
        }`}
      >
        <Icone size={16} />
        Santinho
      </button>

      {aberto && (
        <PainelDaBarra
          titulo="Santinhos e materiais"
          largura="22rem"
          ancora="esquerda"
          aoFechar={() => setAberto(false)}
          rodape="Sai um por vez. Para mandar a sequência inteira, use Kit."
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
                Nenhum santinho cadastrado. A coordenação sobe em{" "}
                <b>Materiais da campanha</b>.
              </p>
            )}

            {lista?.map((m) => (
              <button
                key={m.id}
                onClick={() => mandar(m)}
                disabled={enviando !== null}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-tinta-100 disabled:opacity-40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-tinta-900">
                    {m.titulo}
                  </span>
                  <span className="block truncate text-[11px] text-tinta-500">
                    {ROTULO[m.tipo] ?? m.tipo}
                    {m.quando ? ` · ${m.quando}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] font-semibold text-tema">
                  {enviando === m.id ? "…" : "mandar"}
                </span>
              </button>
            ))}
          </div>
        </PainelDaBarra>
      )}
    </div>
  );
}
