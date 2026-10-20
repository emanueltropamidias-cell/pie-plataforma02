"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2, X, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ATALHOS_DISPONIVEIS, espiarAtalhos } from "@/lib/atalhos-do-texto";

// As mensagens prontas — o texto que a equipe manda com um toque.
//
// ── POR QUE UMA TELA SÓ DELAS ───────────────────────────────────────────────
//
// Elas moram na mesma tabela dos áudios e santinhos (`materiais`, tipo
// `texto`), e continuam aparecendo lá. Mas o GESTO de escrever é outro: áudio e
// santinho são arquivo que sobe, mensagem é texto que se escreve, revisa e
// reescreve. Escrever uma frase no meio de uma tela de upload é o que faz
// ninguém escrever frase nenhuma.
//
// ── O QUE ESTA TELA TEM QUE A OUTRA NÃO TEM ─────────────────────────────────
//
// EDITAR. Na biblioteca a frase só podia ser criada e apagada — para trocar uma
// palavra, era apagar e escrever de novo, e o histórico de quantas vezes ela
// foi usada ia junto. Aqui a frase se corrige no lugar.

export type Mensagem = {
  id: number;
  titulo: string;
  quando: string | null;
  texto: string | null;
  ativo: boolean;
  vezes: number;
  ordem: number;
};

export function MensagensProntas({ itens }: { itens: Mensagem[] }) {
  const router = useRouter();
  const supabase = createClient();

  const [editando, setEditando] = useState<number | "nova" | null>(null);
  const [titulo, setTitulo] = useState("");
  const [quando, setQuando] = useState("");
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const campo = useRef<HTMLTextAreaElement>(null);

  /**
   * Enfia o atalho onde o cursor está — e não no fim do texto.
   *
   * Quem escreveu "encaminha para seus amigos: " quer o link ALI. Colar no fim
   * obriga a recortar e colar na mão, e é aí que as chaves quebram.
   */
  function inserir(chave: string) {
    const el = campo.current;
    if (!el) return setTexto((t) => t + chave);
    const i = el.selectionStart ?? texto.length;
    const f = el.selectionEnd ?? i;
    setTexto(texto.slice(0, i) + chave + texto.slice(f));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(i + chave.length, i + chave.length);
    });
  }

  function abrirNova() {
    setEditando("nova");
    setTitulo("");
    setQuando("");
    setTexto("");
    setErro(null);
  }

  function abrirEdicao(m: Mensagem) {
    setEditando(m.id);
    setTitulo(m.titulo);
    setQuando(m.quando ?? "");
    setTexto(m.texto ?? "");
    setErro(null);
  }

  function fechar() {
    setEditando(null);
    setErro(null);
  }

  async function salvar() {
    if (!titulo.trim()) return setErro("Dê um nome à mensagem — é por ele que a equipe acha ela na conversa.");
    if (!texto.trim()) return setErro("Escreva a mensagem.");

    setSalvando(true);
    setErro(null);
    try {
      const dados = {
        titulo: titulo.trim(),
        quando: quando.trim() || null,
        texto: texto.trim(),
      };

      const { error } =
        editando === "nova"
          ? await supabase.from("materiais").insert({
              ...dados,
              tipo: "texto",
              ordem: (itens.at(-1)?.ordem ?? 0) + 10,
            })
          : await supabase.from("materiais").update(dados).eq("id", editando);

      if (error) return setErro(error.message);
      fechar();
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  async function alternar(m: Mensagem) {
    // Desligar em vez de apagar: a frase some da conversa e o histórico de
    // quantas vezes ela foi usada continua de pé.
    await supabase.from("materiais").update({ ativo: !m.ativo }).eq("id", m.id);
    router.refresh();
  }

  async function apagar(m: Mensagem) {
    if (!confirm(`Apagar "${m.titulo}"? Some da lista e o histórico de uso vai junto.`)) return;
    await supabase.from("materiais").delete().eq("id", m.id);
    router.refresh();
  }

  const formulario = (
    <div className="rounded-xl border border-tema bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-[12px] font-bold text-tinta-700">Nome</label>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            autoFocus
            placeholder="Agradecer apoio e pedir para encaminhar"
            className="mt-1 h-10 w-full rounded-lg border border-tinta-200 px-3 text-[16px] outline-none focus:border-tema sm:text-[13.5px]"
          />
        </div>
        <div>
          <label className="text-[12px] font-bold text-tinta-700">
            Quando usar <span className="font-normal text-tinta-400">(opcional)</span>
          </label>
          <input
            value={quando}
            onChange={(e) => setQuando(e.target.value)}
            placeholder="Quando a pessoa declara apoio"
            className="mt-1 h-10 w-full rounded-lg border border-tinta-200 px-3 text-[16px] outline-none focus:border-tema sm:text-[13.5px]"
          />
        </div>
      </div>

      <label className="mt-3 block text-[12px] font-bold text-tinta-700">
        A mensagem
      </label>
      <textarea
        ref={campo}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={5}
        placeholder="Obrigada, {{nome}}! Talita Oliveira é {{numero}}. Se puder, encaminha nosso WhatsApp para quem você conhece: {{whatsapp}} 💙"
        className="mt-1 w-full resize-y rounded-lg border border-tinta-200 px-3 py-2.5 text-[16px] leading-relaxed outline-none focus:border-tema sm:text-[13.5px]"
      />

      {/* Botão, e não instrução escrita. Pedir para digitar `{{whatsapp}}` com as
          quatro chaves certas é pedir erro — e o erro chega no eleitor. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11.5px] font-semibold text-tinta-500">Inserir:</span>
        {ATALHOS_DISPONIVEIS.map((a) => (
          <button
            key={a.chave}
            type="button"
            title={a.ajuda}
            onClick={() => inserir(a.chave)}
            className="rounded-md border border-tinta-200 bg-white px-2 py-1 text-[11.5px] font-semibold text-tinta-600 transition-colors hover:border-tema hover:text-tema"
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {/* O atalho só vira endereço no envio. Sem prévia, o primeiro a ver a
          mensagem montada seria o eleitor. */}
      {texto.trim() && (
        <div className="mt-3 rounded-lg border border-tinta-200 bg-tinta-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta-400">
            Como chega para Maria Silva
          </p>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-tinta-800">
            {espiarAtalhos(texto)}
          </p>
        </div>
      )}

      {erro && <p className="mt-2.5 text-[12.5px] font-medium text-red-600">{erro}</p>}

      <div className="mt-3.5 flex items-center gap-2">
        <button
          onClick={salvar}
          disabled={salvando}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-tema px-4 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          <Check size={14} />
          {salvando ? "Guardando…" : editando === "nova" ? "Guardar mensagem" : "Salvar alterações"}
        </button>
        <button
          onClick={fechar}
          className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] text-tinta-500 hover:text-tinta-900"
        >
          <X size={14} />
          Cancelar
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {editando === "nova" ? (
        formulario
      ) : (
        <button
          onClick={abrirNova}
          className="flex h-10 w-fit items-center gap-1.5 rounded-lg bg-tema px-4 text-[13px] font-semibold text-white"
        >
          <Plus size={15} />
          Nova mensagem
        </button>
      )}

      {itens.length === 0 && editando !== "nova" && (
        <div className="rounded-xl border border-dashed border-tinta-300 px-5 py-10 text-center">
          <p className="text-[14px] font-semibold text-tinta-700">
            Nenhuma mensagem pronta ainda
          </p>
          <p className="mx-auto mt-1.5 max-w-[42ch] text-[13px] leading-relaxed text-tinta-500">
            Mensagem pronta é o texto que a equipe manda com um toque, sem
            digitar. Ela pode carregar o link do nosso WhatsApp para a pessoa
            encaminhar aos amigos.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {itens.map((m) =>
          editando === m.id ? (
            <div key={m.id}>{formulario}</div>
          ) : (
            <div
              key={m.id}
              className={`rounded-xl border px-4 py-3.5 ${
                m.ativo ? "border-tinta-200 bg-white" : "border-tinta-200 bg-tinta-50"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className={`text-[14px] font-bold ${
                      m.ativo ? "text-tinta-900" : "text-tinta-400 line-through"
                    }`}
                  >
                    {m.titulo}
                  </p>
                  {m.quando && (
                    <p className="mt-0.5 text-[12px] text-tinta-500">{m.quando}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => alternar(m)}
                    title={m.ativo ? "Tirar da conversa" : "Devolver para a conversa"}
                    className="rounded-md p-1.5 text-tinta-400 hover:bg-tinta-100 hover:text-tinta-700"
                  >
                    {m.ativo ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                  <button
                    onClick={() => abrirEdicao(m)}
                    title="Editar"
                    className="rounded-md p-1.5 text-tinta-400 hover:bg-tinta-100 hover:text-tinta-700"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => apagar(m)}
                    title="Apagar"
                    className="rounded-md p-1.5 text-tinta-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-tinta-600">
                {m.texto}
              </p>

              <p className="mt-2 text-[11.5px] text-tinta-400">
                {m.vezes > 0
                  ? `Enviada ${m.vezes.toLocaleString("pt-BR")} ${m.vezes === 1 ? "vez" : "vezes"}`
                  : "Nunca enviada"}
                {!m.ativo && " · fora da conversa"}
              </p>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
