"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Trash2, Plus } from "lucide-react";

// ── OS TRÊS EIXOS, E POR QUE A TELA PERGUNTA ────────────────────────────────
//
// STATUS   uma por pessoa. A soma fecha 100% dos leads no painel.
// DEMANDA  zero ou várias. Nunca fecha, e somar com status é o erro clássico.
// TRABALHO nenhuma das duas. "Ligar depois", "número errado" — organiza a
//          equipe e NÃO entra em relatório.
//
// Antes isto não era perguntado em lugar nenhum: a etiqueta nascia de dentro da
// conversa só com nome e cor, e o eixo ficava nulo. Etiqueta sem eixo o gatilho
// ignora de propósito — então ela marca na tela e some da métrica, sem avisar.
//
// Foi assim que nasceu uma segunda "APOIADOR", em maiúscula e sem eixo, com
// treze pessoas marcadas que nunca contaram.

export type Linha = {
  id: number;
  nome: string;
  descricao: string | null;
  cor: string;
  eixo: string | null;
  valor: string | null;
  ativa: boolean;
  ordem: number;
  marcacoes: number;
};

const CORES = [
  "#0525f7", "#12703c", "#8a6009", "#5b34c9",
  "#c2185b", "#0e7490", "#c02020", "#52535c",
];

/** `valor` é a chave que vai para `status_lead` e `demandas` — sem acento,
 *  sem espaço, minúscula. A tela deriva do nome para ninguém digitar errado. */
function chave(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function Etiquetario({ inicial }: { inicial: Linha[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [aApagar, setAApagar] = useState<Linha | null>(null);

  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [eixo, setEixo] = useState<"status" | "demanda" | "trabalho">("status");
  const [cor, setCor] = useState(CORES[0]);

  async function criar() {
    const n = nome.trim();
    if (!n) return;
    setErro(null);
    const { error } = await supabase.from("tags").insert({
      nome: n,
      cor,
      // TRABALHO grava eixo NULO de propósito: é o que o gatilho lê para saber
      // que esta etiqueta não alimenta métrica. Não é campo esquecido.
      eixo: eixo === "trabalho" ? null : eixo,
      valor: eixo === "trabalho" ? null : chave(n),
    });
    if (error) {
      setErro(
        error.code === "23505"
          ? "Já existe uma etiqueta com esse nome."
          : error.code === "42501"
            ? "Sua conta não tem permissão para criar etiqueta."
            : error.message,
      );
      return;
    }
    setNome("");
    setCriando(false);
    router.refresh();
  }

  async function alternarAtiva(t: Linha) {
    setOcupado(t.id);
    setErro(null);
    const { error } = await supabase
      .from("tags")
      .update({ ativa: !t.ativa })
      .eq("id", t.id);
    setOcupado(null);
    if (error) return setErro(error.message);
    router.refresh();
  }

  async function apagar() {
    if (!aApagar) return;
    setOcupado(aApagar.id);
    setErro(null);
    const { error } = await supabase.from("tags").delete().eq("id", aApagar.id);
    setOcupado(null);
    if (error) {
      setErro(
        error.code === "42501"
          ? "Sua conta não tem permissão para apagar. Rode etiquetas-mandam-em-si.sql."
          : error.message,
      );
      return;
    }
    setAApagar(null);
    router.refresh();
  }

  const porEixo = [
    { id: "status", titulo: "Status", ajuda: "Uma por pessoa. Fecha 100% dos leads no painel." },
    { id: "demanda", titulo: "Demanda", ajuda: "Zero ou várias por pessoa. Nunca fecha 100%." },
    { id: null, titulo: "Trabalho", ajuda: "Organiza a equipe. NÃO entra na métrica." },
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      {erro && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          {erro}
        </p>
      )}

      {porEixo.map((g) => {
        const linhas = inicial.filter((t) => (t.eixo ?? null) === g.id);
        return (
          <div key={g.titulo}>
            <div className="flex items-baseline gap-2">
              <h2 className="text-[13px] font-bold text-tinta-900">{g.titulo}</h2>
              <span className="text-[11.5px] text-tinta-500">{g.ajuda}</span>
            </div>

            <div className="mt-2 overflow-hidden rounded-xl border border-tinta-200">
              {linhas.length === 0 && (
                <p className="px-3.5 py-3 text-[12.5px] text-tinta-400">
                  Nenhuma etiqueta aqui.
                </p>
              )}
              {linhas.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 border-b border-tinta-100 px-3.5 py-2.5 last:border-b-0"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: t.cor }}
                  />
                  <span
                    className={`min-w-0 flex-1 truncate text-[13px] font-semibold ${
                      t.ativa ? "text-tinta-900" : "text-tinta-400 line-through"
                    }`}
                  >
                    {t.nome}
                    {g.id && !t.valor && (
                      <span className="ml-2 text-[11px] font-bold text-amber-700">
                        ⚠ sem valor — não conta na métrica
                      </span>
                    )}
                  </span>

                  {/* O NÚMERO FICA AO LADO DO BOTÃO DE APAGAR, e não escondido
                      numa aba: é ele que muda a decisão. Apagar leva as
                      marcações junto, e `245` avisa isso melhor que qualquer
                      texto. */}
                  <span className="shrink-0 text-[11.5px] text-tinta-500">
                    {t.marcacoes === 1 ? "1 pessoa" : `${t.marcacoes} pessoas`}
                  </span>

                  <button
                    onClick={() => alternarAtiva(t)}
                    disabled={ocupado === t.id}
                    className="shrink-0 rounded-md border border-tinta-300 px-2 py-0.5 text-[11px] font-semibold text-tinta-600 hover:bg-tinta-100 disabled:opacity-40"
                  >
                    {t.ativa ? "desativar" : "ativar"}
                  </button>

                  <button
                    onClick={() => setAApagar(t)}
                    disabled={ocupado === t.id}
                    aria-label={`Apagar ${t.nome}`}
                    title="Apagar"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-tinta-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* ── CRIAR ────────────────────────────────────────────────────────── */}
      {!criando ? (
        <button
          onClick={() => setCriando(true)}
          className="flex h-[38px] w-full items-center justify-center gap-2 rounded-[10px] border border-tema/25 bg-tema/5 text-[12.5px] font-bold text-tema hover:bg-tema/10"
        >
          <Plus size={15} strokeWidth={2.4} />
          Criar etiqueta
        </button>
      ) : (
        <div className="rounded-xl border border-tinta-200 bg-tinta-50 p-3.5">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome da etiqueta"
            className="h-[36px] w-full rounded-lg border border-tinta-300 px-3 text-[16px] outline-none focus:border-tema sm:text-[13px]"
          />

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {(["status", "demanda", "trabalho"] as const).map((e) => (
              <button
                key={e}
                onClick={() => setEixo(e)}
                className={`rounded-full px-3 py-1 text-[11.5px] font-semibold ${
                  eixo === e
                    ? "bg-tinta-900 text-white"
                    : "bg-tinta-200 text-tinta-600"
                }`}
              >
                {e === "trabalho" ? "Trabalho (fora da métrica)" : e}
              </button>
            ))}
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {CORES.map((c) => (
              <button
                key={c}
                onClick={() => setCor(c)}
                aria-label={`Cor ${c}`}
                className={`h-6 w-6 rounded-full ${cor === c ? "ring-2 ring-tinta-900 ring-offset-1" : ""}`}
                style={{ background: c }}
              />
            ))}
          </div>

          {eixo !== "trabalho" && nome.trim() && (
            <p className="mt-2 text-[11px] text-tinta-500">
              Vai contar na métrica como{" "}
              <code className="font-mono">{chave(nome)}</code>.
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <button
              onClick={criar}
              disabled={!nome.trim()}
              className="h-9 flex-1 rounded-[10px] bg-tema text-[12.5px] font-semibold text-white disabled:opacity-40"
            >
              Criar
            </button>
            <button
              onClick={() => {
                setCriando(false);
                setNome("");
                setErro(null);
              }}
              className="h-9 rounded-[10px] border border-tinta-300 px-4 text-[12.5px] font-semibold text-tinta-600"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── APAGAR MOSTRA O ESTRAGO ANTES ────────────────────────────────── */}
      {aApagar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-tinta-900/30 p-4">
          <div className="w-full max-w-[420px] rounded-xl border border-tinta-200 bg-white p-5">
            <h3 className="text-[15px] font-bold text-tinta-900">
              Apagar “{aApagar.nome}”?
            </h3>
            {aApagar.marcacoes > 0 ? (
              <p className="mt-2 text-[13px] leading-relaxed text-tinta-700">
                <b className="text-red-700">
                  {aApagar.marcacoes}{" "}
                  {aApagar.marcacoes === 1 ? "pessoa perde" : "pessoas perdem"}{" "}
                  esta classificação
                </b>{" "}
                — a marcação vai junto com a etiqueta, e não tem como voltar. Se
                a ideia é só tirar da lista, <b>desativar</b> resolve e não
                encosta em ninguém.
              </p>
            ) : (
              <p className="mt-2 text-[13px] leading-relaxed text-tinta-700">
                Ninguém está marcado com ela. Apagar não afeta nenhuma conversa.
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setAApagar(null)}
                className="h-9 rounded-[10px] border border-tinta-300 px-4 text-[12.5px] font-semibold text-tinta-600"
              >
                Cancelar
              </button>
              <button
                onClick={apagar}
                disabled={ocupado === aApagar.id}
                className="h-9 rounded-[10px] bg-red-600 px-4 text-[12.5px] font-semibold text-white disabled:opacity-40"
              >
                {ocupado === aApagar.id ? "Apagando…" : "Apagar mesmo assim"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
