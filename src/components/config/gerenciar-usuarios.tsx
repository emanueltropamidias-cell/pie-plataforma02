"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { CriarConta } from "@/components/config/criar-conta";

type Previa = {
  id: string;
  nome: string;
  papel: string;
  temRastro: boolean;
  rastro: {
    conversas: number;
    mensagens: number;
    demandas: number;
    atribuicoes: number;
    liderancas: number;
  };
};

export type Perfil = {
  id: string;
  nome: string | null;
  email: string | null;
  role: string;
  status: string;
};

// AS PALAVRAS AQUI SÃO AS MESMAS DO BANCO. Não são rótulo.
//
// Havia "atendimento" nesta lista, e toda a trava do banco foi escrita contra
// "atendente". As duas palavras são parecidas e o efeito era o oposto do
// pretendido: `atendimento` não constava da lista de papéis restritos, então
// perfil_equipe() devolvia verdadeiro e a atendente enxergava a plataforma
// inteira — as 29 mil da base, o gasto de tráfego, as demandas com nome.
//
// A ordem é do mais amplo para o mais restrito, e o alcance está escrito ao
// lado: quem escolhe precisa saber o que está entregando.
const ROLES = [
  { v: "admin", label: "Admin — plataforma toda" },
  { v: "usuario", label: "Usuário — plataforma toda" },
  { v: "supervisor", label: "Supervisor — só o atendimento" },
  { v: "atendente", label: "Atendente — só a caixa de entrada" },
  { v: "lideranca", label: "Liderança — só o portal dela" },
];

export function GerenciarUsuarios({
  usuarios,
  meuId,
}: {
  usuarios: Perfil[];
  meuId: string;
}) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  // A exclusão é em duas etapas: a primeira chamada devolve o RASTRO da pessoa,
  // a segunda executa. Apagar conta com histórico não apaga só a conta — as
  // conversas dela voltam para a fila sem dono e as mensagens perdem o autor.
  const [aExcluir, setAExcluir] = useState<Previa | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExcluir, setErroExcluir] = useState<string | null>(null);

  async function pedirPrevia(u: Perfil) {
    setErroExcluir(null);
    setOcupado(u.id);
    try {
      const r = await fetch("/api/equipe/excluir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErroExcluir(j?.erro ?? "Não consegui verificar.");
        return;
      }
      setAExcluir({ ...j, id: u.id });
    } catch {
      setErroExcluir("Falha de rede.");
    } finally {
      setOcupado(null);
    }
  }

  async function confirmarExclusao() {
    if (!aExcluir) return;
    setExcluindo(true);
    setErroExcluir(null);
    try {
      const r = await fetch("/api/equipe/excluir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: aExcluir.id, confirmado: true }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErroExcluir(j?.erro ?? "Não consegui excluir.");
        return;
      }
      setAExcluir(null);
      router.refresh();
    } catch {
      setErroExcluir("Falha de rede.");
    } finally {
      setExcluindo(false);
    }
  }

  async function atualizar(id: string, campos: Partial<Perfil>) {
    setOcupado(id);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update(campos)
      .eq("id", id);
    setOcupado(null);
    if (error) return alert("Erro: " + error.message);
    router.refresh();
  }

  const pendentes = usuarios.filter((u) => u.status === "pendente").length;

  return (
    <div className="rounded-xl border border-tinta-200 bg-white p-6 shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-semibold text-tinta-800">
            👥 Gerenciar usuários
          </h2>
          {pendentes > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
              {pendentes} pendente(s)
            </span>
          )}
        </div>
        {/* Criar conta fica AQUI, junto da lista, e não numa tela própria: quem
            vem trocar o papel de alguém é quem vem criar a próxima pessoa, e a
            lista logo abaixo é a conferência de que a conta nasceu certa. */}
        <CriarConta />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {usuarios.map((u) => {
          const souEu = u.id === meuId;
          return (
            <div
              key={u.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-tinta-100 bg-tinta-50/60 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-tinta-900">
                  {u.nome || u.email}{" "}
                  {souEu && (
                    <span className="text-[11px] font-normal text-tinta-400">
                      (você)
                    </span>
                  )}
                </p>
                <p className="truncate text-[12px] text-tinta-500">{u.email}</p>
              </div>

              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  u.status === "ativo"
                    ? "bg-emerald-100 text-emerald-700"
                    : u.status === "pendente"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-tinta-200 text-tinta-600"
                }`}
              >
                {u.status}
              </span>

              <select
                value={u.role}
                disabled={souEu || ocupado === u.id}
                onChange={(e) => atualizar(u.id, { role: e.target.value })}
                className="h-8 rounded-md border border-input bg-white px-2 text-[13px] outline-none disabled:opacity-50"
              >
                {ROLES.map((r) => (
                  <option key={r.v} value={r.v}>
                    {r.label}
                  </option>
                ))}
              </select>

              {u.status !== "ativo" ? (
                <Button
                  size="sm"
                  disabled={ocupado === u.id}
                  onClick={() => atualizar(u.id, { status: "ativo" })}
                >
                  Aprovar
                </Button>
              ) : (
                !souEu && (
                  <button
                    disabled={ocupado === u.id}
                    onClick={() => atualizar(u.id, { status: "inativo" })}
                    className="text-[12px] font-medium text-tinta-400 hover:text-red-600"
                  >
                    Inativar
                  </button>
                )
              )}

              {/* Excluir fica separado e discreto de propósito: inativar
                  resolve quase todo caso e é reversível. Apagar não é. */}
              {!souEu && (
                <button
                  disabled={ocupado === u.id}
                  onClick={() => pedirPrevia(u)}
                  aria-label={`Excluir a conta de ${u.nome ?? u.email}`}
                  title="Excluir a conta"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-tinta-300 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {erroExcluir && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          {erroExcluir}
        </p>
      )}

      {/* A confirmação mostra o TAMANHO do estrago antes do clique. Um "tem
          certeza?" genérico não informa nada — quem lê já decidiu que tem. */}
      {aExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setAExcluir(null)}
          />
          <div className="relative w-full max-w-[480px] rounded-xl border border-tinta-200 bg-white p-5 shadow-2xl">
            <h3 className="text-[16px] font-bold text-tinta-900">
              Excluir a conta de {aExcluir.nome}?
            </h3>

            {aExcluir.temRastro ? (
              <>
                <p className="mt-2 text-[13px] leading-relaxed text-tinta-600">
                  Esta pessoa <b>trabalhou na plataforma</b>. Excluir não apaga
                  só a conta:
                </p>
                <ul className="mt-2.5 space-y-1.5 rounded-lg border border-[#f0dcc0] bg-[#fdf6ea] px-3.5 py-3 text-[12.5px] text-[#8a4a10]">
                  {aExcluir.rastro.conversas > 0 && (
                    <li>
                      <b>{aExcluir.rastro.conversas}</b> conversa(s) que estavam
                      com ela <b>voltam para a fila sem dono</b>
                    </li>
                  )}
                  {aExcluir.rastro.mensagens > 0 && (
                    <li>
                      <b>{aExcluir.rastro.mensagens}</b> mensagem(ns) enviada(s)
                      por ela <b>perdem o autor</b> — o registro passa a dizer
                      que a campanha falou, sem dizer quem
                    </li>
                  )}
                  {aExcluir.rastro.demandas > 0 && (
                    <li>
                      <b>{aExcluir.rastro.demandas}</b> demanda(s) aberta(s) por
                      ela ficam sem responsável
                    </li>
                  )}
                  {aExcluir.rastro.atribuicoes > 0 && (
                    <li>
                      <b>{aExcluir.rastro.atribuicoes}</b> registro(s) de
                      distribuição perdem o nome dela
                    </li>
                  )}
                </ul>
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-tinta-500">
                  Se o objetivo é só tirar o acesso,{" "}
                  <b className="text-tinta-800">Inativar</b> resolve e mantém o
                  histórico inteiro. É reversível; isto não é.
                </p>
              </>
            ) : (
              <p className="mt-2 text-[13px] leading-relaxed text-tinta-600">
                Esta conta <b>nunca atendeu ninguém</b> e não deixou registro.
                Pode apagar sem perder histórico.
              </p>
            )}

            {aExcluir.rastro.liderancas > 0 && (
              <p className="mt-2.5 rounded-lg border border-[#f3d3d3] bg-[#fdf1f1] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#c02020]">
                <b>Atenção:</b> esta conta é o login de uma liderança na rede.
                Ela vai <b>perder o acesso ao portal</b> — o cadastro dela na
                rede continua, mas sem login.
              </p>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setAExcluir(null)}
                className="h-9 rounded-lg px-3.5 text-[13px] text-tinta-500 hover:text-tinta-900"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarExclusao}
                disabled={excluindo}
                className="h-9 rounded-lg bg-red-600 px-4 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {excluindo ? "Excluindo…" : "Excluir definitivamente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
