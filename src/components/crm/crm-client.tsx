"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Search, KeyRound, Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { gerarLinkCode } from "@/lib/link-code";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LiderancaDialog, type Lideranca } from "./lideranca-dialog";
import { CompartilharLideranca } from "./compartilhar-lideranca";
import { Cabecalho } from "@/components/ui/pagina";
import { CANDIDATO } from "@/lib/candidato";

function waNum(tel: string | null) {
  const d = (tel || "").replace(/\D/g, "");
  if (!d) return "";
  return d.startsWith("55") ? d : "55" + d;
}
// `cod_acesso` não é um identificador, é uma senha: quem digitar o código cria
// uma conta amarrada àquela liderança. Os seis caracteres de Math.random que
// estavam aqui eram curtos e previsíveis para esse papel.
const gerarCod = gerarLinkCode;
function mensagemAcesso(nome: string, code: string) {
  const prim = (nome || "").split(" ")[0] || "";
  return `Olá${prim ? ", " + prim : ""}! Aqui está o seu acesso ao *ManuFlow*, o painel da campanha.\n\nPasso a passo:\n1) Acesse: ${CANDIDATO.app}\n2) Toque em "🔑 Sou liderança — acessar meu painel"\n3) Toque em "Primeiro acesso? Criar com código de vínculo"\n4) Crie o seu e-mail e senha\n5) Cole este código: *${code}*\n\nPronto! Você vai ver a sua rede e poderá cadastrar pessoas. 💙💚`;
}

export function CrmClient({ liderancas, abrirNova = false }: { liderancas: Lideranca[]; abrirNova?: boolean }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(abrirNova);
  const [editando, setEditando] = useState<Lideranca | null>(null);
  const [compartilhando, setCompartilhando] = useState<Lideranca | null>(null);

  const q = busca.toLowerCase().trim();
  const filtradas = q
    ? liderancas.filter(
        (l) =>
          (l.nome || "").toLowerCase().includes(q) ||
          (l.municipio || "").toLowerCase().includes(q),
      )
    : liderancas;

  function novo() {
    setEditando(null);
    setAberto(true);
  }
  function editar(l: Lideranca) {
    setEditando(l);
    setAberto(true);
  }
  async function excluir(l: Lideranca) {
    if (
      !confirm(
        `Excluir a liderança "${l.nome}"? Essa ação não pode ser desfeita.`,
      )
    )
      return;
    const supabase = createClient();
    const { error } = await supabase.from("liderancas").delete().eq("id", l.id);
    if (error) return alert("Erro ao excluir: " + error.message);
    router.refresh();
  }
  async function enviarAcesso(l: Lideranca) {
    const num = waNum(l.telefone);
    if (num.length < 12) {
      return alert(
        "Essa liderança não tem um WhatsApp válido. Clique no lápis ✏️ e adicione o telefone (com DDD) primeiro.",
      );
    }
    let code = l.cod_acesso;
    if (!code) {
      code = gerarCod();
      const supabase = createClient();
      const { error } = await supabase
        .from("liderancas")
        .update({ cod_acesso: code })
        .eq("id", l.id);
      if (error) return alert("Erro ao gerar o código: " + error.message);
      router.refresh();
    }
    window.open(
      `https://wa.me/${num}?text=${encodeURIComponent(mensagemAcesso(l.nome, code))}`,
      "_blank",
    );
  }

  return (
    <>
      <Cabecalho
        voltar="/liderancas"
        sobretitulo="Rede"
        titulo="Lideranças"
        descricao={`${liderancas.length} ${liderancas.length === 1 ? "liderança cadastrada" : "lideranças cadastradas"}`}
        acoes={
          <Button onClick={novo} className="shrink-0">
            + Nova liderança
          </Button>
        }
      />

      {liderancas.length > 0 && (
        <div className="relative mt-6">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-tinta-400"
          />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou município…"
            className="h-11 pl-9"
          />
        </div>
      )}

      {liderancas.length === 0 ? (
        <div className="mt-8 flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-tinta-300 bg-white/60 text-center">
          <p className="text-4xl">👥</p>
          <p className="mt-3 text-sm font-semibold text-tinta-700">
            Nenhuma liderança ainda.
          </p>
          <p className="mt-1 text-[13px] text-tinta-500">
            Clique em <b>+ Nova liderança</b> pra cadastrar a primeira.
          </p>
        </div>
      ) : filtradas.length === 0 ? (
        <p className="mt-8 text-center text-sm text-tinta-500">
          Nenhum resultado para “{busca}”.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {filtradas.map((l) => (
            <div
              key={l.id}
              className="flex flex-wrap items-center gap-4 rounded-xl border border-tinta-200 bg-white p-4 shadow-[0_1px_2px_rgba(22,32,46,0.04)]"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tema/[0.07] text-base font-bold text-tema">
                {(l.nome || "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-tinta-900">
                  {l.nome}
                </p>
                <p className="truncate text-[13px] text-tinta-500">
                  {[l.municipio, l.bairro].filter(Boolean).join(" · ") || "—"}
                  {l.telefone ? ` · ${l.telefone}` : ""}
                </p>
              </div>
              {!!l.votos_comprometidos && (
                <span className="hidden rounded-md bg-amber-50 px-2.5 py-1 text-[12px] font-semibold text-amber-700 sm:inline">
                  {l.votos_comprometidos.toLocaleString("pt-BR")} votos
                </span>
              )}
              {l.link_code && (
                <span className="hidden rounded-md bg-tinta-100 px-2.5 py-1 font-mono text-[12px] text-tinta-600 sm:inline">
                  {l.link_code}
                </span>
              )}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCompartilhando(l)}
                  className="rounded-md p-2 text-tinta-400 transition-colors hover:bg-tema/[0.07] hover:text-tema"
                  title="Compartilhar link de indicação"
                  aria-label="Compartilhar"
                >
                  <Share2 size={16} />
                </button>
                <button
                  onClick={() => enviarAcesso(l)}
                  className="rounded-md p-2 text-tinta-400 transition-colors hover:bg-green-50 hover:text-green-600"
                  title="Enviar acesso ao painel (WhatsApp)"
                  aria-label="Enviar acesso"
                >
                  <KeyRound size={16} />
                </button>
                <button
                  onClick={() => editar(l)}
                  className="rounded-md p-2 text-tinta-400 transition-colors hover:bg-tinta-100 hover:text-tinta-700"
                  title="Editar"
                  aria-label="Editar"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => excluir(l)}
                  className="rounded-md p-2 text-tinta-400 transition-colors hover:bg-red-50 hover:text-red-600"
                  title="Excluir"
                  aria-label="Excluir"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <LiderancaDialog
        lideranca={editando}
        aberto={aberto}
        onOpenChange={setAberto}
      />
      <CompartilharLideranca
        linkCode={compartilhando?.link_code ?? ""}
        nome={compartilhando?.nome ?? ""}
        mensagemQr={compartilhando?.mensagem_qr}
        aberto={!!compartilhando}
        onOpenChange={(v) => !v && setCompartilhando(null)}
      />
    </>
  );
}
