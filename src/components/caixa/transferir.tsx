"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRightLeft,
  AlertTriangle,
  ChevronLeft,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Passar a conversa adiante.
//
// TRANSFERIR TIRA DA FILA DE QUEM TRANSFERIU. É a decisão que evita a conversa
// com dois donos — aquela que as duas acham que a outra está respondendo, e
// ninguém responde.
//
// ── DOIS PASSOS, PORQUE SÃO DUAS PERGUNTAS ──────────────────────────────────
//
// Primeiro o SETOR: para onde vai. Depois QUEM: alguém específico, ou a fila.
//
// Os dois caminhos existem porque as duas situações existem. "Qualquer uma do
// jurídico pode pegar" é fila. "A Thami já falou com essa senhora ontem" é
// pessoa — e sem essa opção a atendente transferia e ia pedir no grupo do
// WhatsApp para fulana pegar, que é exatamente onde a conversa se perde.

export type Setor = {
  id: number;
  nome: string;
  cor: string;
  descricao: string | null;
  membros: number;
  aguardando: number;
};

type Pessoa = { atendente_id: string; nome: string; abertas: number };

export function Transferir({
  conversaId,
  setorAtual,
  aoTransferir,
  respondida = false,
}: {
  conversaId: number;
  setorAtual: number | null;
  /** A conversa saiu da fila de quem transferiu — a lista precisa saber. */
  aoTransferir: (info: { setor: string; pessoa: string | null; para: string | null }) => void;
  /**
   * A conversa já teve resposta. Aí "deixar na fila" some: sem dona e já
   * respondida, ela não cai em aba nenhuma de caixa nenhuma — "Aguardando" é
   * só do que ninguém respondeu. Ficaria visível apenas na Supervisão.
   */
  respondida?: boolean;
}) {
  const supabase = createClient();
  const [aberto, setAberto] = useState(false);
  const [setores, setSetores] = useState<Setor[] | null>(null);
  const [escolhido, setEscolhido] = useState<Setor | null>(null);
  const [pessoas, setPessoas] = useState<{
    de: number;
    lista: Pessoa[];
  } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  // A lista só é buscada quando o menu abre. A caixa carrega dezenas de vezes
  // por hora e os setores mudam uma vez por mês — buscar junto seria uma
  // consulta por abertura de tela para um dado parado.
  useEffect(() => {
    if (!aberto || setores) return;
    let vivo = true;
    supabase
      .from("departamentos_painel")
      .select("id, nome, cor, descricao, membros, aguardando, ativo, ordem")
      .eq("ativo", true)
      .order("ordem")
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) {
          setErro(
            error.code === "42P01" || error.code === "PGRST205"
              ? "Os departamentos ainda não foram criados no banco."
              : error.message,
          );
          setSetores([]);
          return;
        }
        setSetores((data ?? []) as Setor[]);
      });
    return () => {
      vivo = false;
    };
  }, [aberto, setores, supabase]);

  // As pessoas do setor, só depois de o setor ser escolhido.
  useEffect(() => {
    if (!escolhido) return;
    let vivo = true;
    supabase
      .from("membros_por_setor")
      .select("atendente_id, nome, abertas")
      .eq("departamento_id", escolhido.id)
      .order("nome")
      .then(({ data }) => {
        if (vivo)
          setPessoas({ de: escolhido.id, lista: (data ?? []) as Pessoa[] });
      });
    return () => {
      vivo = false;
    };
  }, [escolhido, supabase]);

  useEffect(() => {
    if (!aberto) return;
    function sair() {
      setAberto(false);
      setEscolhido(null);
      setErro(null);
    }
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) sair();
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") sair();
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  async function transferir(setor: Setor, para: string | null) {
    setEnviando(true);
    setErro(null);
    const { data, error } = await supabase.rpc("transferir_conversa", {
      p_conversa: conversaId,
      p_departamento: setor.id,
      p_para_atendente: para,
    });
    setEnviando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    const r = data as { setor?: string; pessoa?: string | null };
    setAberto(false);
    setEscolhido(null);
    aoTransferir({ setor: r?.setor ?? setor.nome, pessoa: r?.pessoa ?? null, para });
  }

  const carregandoPessoas = !!escolhido && pessoas?.de !== escolhido.id;

  return (
    <div ref={caixa} className="relative shrink-0">
      <button
        onClick={() => {
          setAberto((v) => !v);
          setEscolhido(null);
        }}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-tinta-200 px-2.5 text-[12.5px] font-semibold text-tinta-600 transition-colors hover:border-tinta-300 hover:text-tinta-900"
      >
        <ArrowRightLeft size={13} strokeWidth={2.2} />
        <span className="hidden sm:inline">Transferir</span>
      </button>

      {aberto && (
        <div className="absolute right-0 top-9 z-30 w-[300px] rounded-lg border border-tinta-200 bg-white p-1.5 shadow-lg">
          {erro && (
            <p className="mx-1 mb-1 rounded-md bg-[#fdf1f1] px-2 py-1.5 text-[11.5px] text-[#c02020]">
              {erro}
            </p>
          )}

          {/* ── passo 1: o setor ─────────────────────────────────────────── */}
          {!escolhido ? (
            <>
              <p className="px-2 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-tinta-400">
                Para qual setor
              </p>

              {setores === null && (
                <p className="px-2 py-3 text-center text-[12px] text-tinta-400">
                  carregando…
                </p>
              )}

              {setores?.length === 0 && !erro && (
                <p className="px-2 py-3 text-center text-[12px] leading-relaxed text-tinta-400">
                  Nenhum setor ativo. Crie em Atendimento → Departamentos.
                </p>
              )}

              {setores?.map((s) => {
                const vazio = s.membros === 0;
                return (
                  <button
                    key={s.id}
                    disabled={enviando}
                    onClick={() => setEscolhido(s)}
                    className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-tinta-50 disabled:opacity-40"
                  >
                    <span
                      className="mt-[5px] h-2 w-2 shrink-0 rounded-full"
                      style={{ background: s.cor }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-tinta-900">
                          {s.nome}
                        </span>
                        {s.id === setorAtual && (
                          <span className="shrink-0 text-[10.5px] text-tinta-400">
                            já está aqui
                          </span>
                        )}
                      </span>

                      {/* O aviso vem ANTES do clique. Depois só serve para a
                          pessoa se arrepender. */}
                      {vazio ? (
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-[#a35a00]">
                          <AlertTriangle size={10} strokeWidth={2.6} />
                          ninguém neste setor — não há quem puxe
                        </span>
                      ) : (
                        <span className="mt-0.5 block text-[11px] text-tinta-400">
                          {s.membros} atendente(s)
                          {s.aguardando > 0 && (
                            <span className="text-[#a35a00]">
                              {" "}
                              · {s.aguardando} já esperando
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}

              <p className="mt-1 border-t border-tinta-100 px-2 pb-0.5 pt-2 text-[10.5px] leading-relaxed text-tinta-400">
                A conversa sai da sua fila e o histórico vai junto.
              </p>
            </>
          ) : (
            /* ── passo 2: quem ──────────────────────────────────────────── */
            <>
              <button
                onClick={() => setEscolhido(null)}
                className="flex w-full items-center gap-1 px-2 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-tinta-400 hover:text-tinta-700"
              >
                <ChevronLeft size={12} strokeWidth={3} />
                {escolhido.nome}
              </button>

              {/* A FILA VEM PRIMEIRO, de propósito: escolher pessoa é a
                  exceção, para quando se sabe quem deve pegar. */}
              {respondida ? (
                <p className="px-2 py-2 text-[11px] leading-snug text-tinta-500">
                  Esta conversa já foi respondida: escolha uma pessoa. Sem dona, ela não
                  aparece na caixa de ninguém.
                </p>
              ) : (
              <button
                disabled={enviando}
                onClick={() => transferir(escolhido, null)}
                className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-tinta-50 disabled:opacity-40"
              >
                <Users size={13} className="mt-[3px] shrink-0 text-tinta-400" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-tinta-900">
                    Deixar na fila do setor
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-tinta-400">
                    Fica em Aguardando e a primeira que estiver livre puxa.
                  </span>
                </span>
              </button>
              )}

              <p className="mt-1 border-t border-tinta-100 px-2 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-tinta-400">
                ou entregar direto a
              </p>

              {carregandoPessoas && (
                <p className="px-2 py-2 text-center text-[12px] text-tinta-400">
                  carregando…
                </p>
              )}

              {!carregandoPessoas && pessoas?.lista.length === 0 && (
                <p className="px-2 py-2 text-[11.5px] leading-relaxed text-tinta-400">
                  Ninguém está neste setor ainda. Marque em Atendimento →
                  Departamentos.
                </p>
              )}

              {!carregandoPessoas &&
                pessoas?.lista.map((p) => (
                  <button
                    key={p.atendente_id}
                    disabled={enviando}
                    onClick={() => transferir(escolhido, p.atendente_id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-tinta-50 disabled:opacity-40"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-tinta-100 text-[10px] font-bold text-tinta-600">
                      {p.nome.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-tinta-800">
                      {p.nome}
                    </span>
                    {/* Quantas ela já tem. Entregar para quem está com trinta
                        abertas é o mesmo que deixar na fila, só que com o nome
                        de alguém em cima. */}
                    <span className="tabular shrink-0 text-[11px] text-tinta-400">
                      {p.abertas} abertas
                    </span>
                  </button>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
