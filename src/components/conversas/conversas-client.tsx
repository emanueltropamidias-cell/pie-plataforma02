"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, MessageSquareText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { FiltroPeriodo } from "@/components/ui/filtro-periodo";
import { RegistroDialog, type Registro } from "./registro-dialog";
import { DashboardConversas } from "./dashboard-conversas";
import { RelatorioConversas } from "./relatorio-conversas";
import { Cabecalho } from "@/components/ui/pagina";

function hojeISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function dataBR(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
const TURNO: Record<string, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  outro: "Outro",
};

export function ConversasClient({
  registros,
  meuId,
  isAdmin,
}: {
  registros: Registro[];
  meuId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [aba, setAba] = useState<"dashboard" | "registros">("dashboard");
  const [ini, setIni] = useState("");
  const [fim, setFim] = useState("");
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState<Registro | null>(null);
  const [relatorio, setRelatorio] = useState(false);
  const [obsAbertas, setObsAbertas] = useState<Set<string>>(new Set());

  function toggleObs(id: string) {
    setObsAbertas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const hoje = hojeISO();
  const filtrados = registros.filter(
    (r) => (!ini || r.data >= ini) && (!fim || r.data <= fim),
  );

  function exportarCSV() {
    const cols = [
      "Data",
      "Turno",
      "Enviados",
      "Retornos positivos",
      "Outras devolutivas",
      "Sem retorno",
      "Restricao",
      "Responsavel",
      "Observacoes",
    ];
    const linhas = filtrados.map((r) => {
      const semRetorno = Math.max(
        0,
        r.enviados - r.apoios - r.outras_devolutivas,
      );
      return [
        dataBR(r.data),
        TURNO[r.turno] ?? r.turno,
        r.enviados,
        r.apoios,
        r.outras_devolutivas,
        semRetorno,
        r.restricao ? "Sim" : "Nao",
        (r.criador_nome ?? "").replace(/[\r\n;]+/g, " "),
        (r.observacoes ?? "").replace(/[\r\n;]+/g, " "),
      ].join(";");
    });
    const csv = "﻿" + [cols.join(";"), ...linhas].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conversas_${hoje}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function novo() {
    setEditando(null);
    setAberto(true);
  }
  function editar(r: Registro) {
    setEditando(r);
    setAberto(true);
  }
  async function excluir(r: Registro) {
    if (
      !confirm(`Excluir o registro de ${dataBR(r.data)} (${TURNO[r.turno]})?`)
    )
      return;
    const supabase = createClient();
    const { error } = await supabase
      .from("registros_disparo")
      .delete()
      .eq("id", r.id);
    if (error) return alert("Erro: " + error.message);
    router.refresh();
  }

  const podeEditar = (r: Registro) =>
    isAdmin || (r.criado_por === meuId && r.data === hoje);

  return (
    <>
      <div className="print:hidden">
        <Cabecalho
          voltar="/gabinete"
          sobretitulo="Análise"
          titulo="Gestão de conversas"
          descricao="Registros diários de disparos e devolutivas."
          acoes={
            <Button onClick={novo} className="shrink-0">
              + Novo registro
            </Button>
          }
        />
      </div>

      {/* Filtro de período + abas */}
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="inline-flex rounded-lg border border-tinta-200 bg-white p-1">
          <button
            onClick={() => setAba("dashboard")}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${aba === "dashboard" ? "bg-tema text-white" : "text-tinta-600 hover:bg-tinta-50"}`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setAba("registros")}
            className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${aba === "registros" ? "bg-tema text-white" : "text-tinta-600 hover:bg-tinta-50"}`}
          >
            Registros
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FiltroPeriodo
            ini={ini}
            fim={fim}
            onChange={(i, f) => {
              setIni(i);
              setFim(f);
            }}
          />
          <Button variant="outline" className="h-9" onClick={exportarCSV}>
            CSV
          </Button>
          <Button
            variant="outline"
            className="h-9"
            onClick={() => setRelatorio(true)}
          >
            Relatório
          </Button>
        </div>
      </div>

      {aba === "dashboard" ? (
        <DashboardConversas registros={filtrados} />
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-tinta-200 bg-white shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-tinta-200 text-left text-[12px] uppercase tracking-wide text-tinta-500">
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Turno</th>
                <th className="px-4 py-3 text-right">Enviados</th>
                <th className="px-4 py-3 text-right">Positivos</th>
                <th className="px-4 py-3 text-right">Outras</th>
                <th className="px-4 py-3 text-right">Sem retorno</th>
                <th className="px-4 py-3">Restrição</th>
                <th className="px-4 py-3">Responsável</th>
                <th className="px-4 py-3 text-center">Obs</th>
                <th className="px-4 py-3 print:hidden"></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="px-4 py-10 text-center text-tinta-500"
                  >
                    Nenhum registro no período.
                  </td>
                </tr>
              ) : (
                filtrados.map((r) => {
                  const semRetorno = Math.max(
                    0,
                    r.enviados - r.apoios - r.outras_devolutivas,
                  );
                  const temObs = !!(r.observacoes && r.observacoes.trim());
                  const obsAberta = obsAbertas.has(r.id);
                  return (
                    <React.Fragment key={r.id}>
                      <tr
                        className={`border-b border-tinta-100 ${r.restricao ? "bg-[#EB388A]/[0.08]" : ""} ${obsAberta ? "!border-b-0" : ""}`}
                      >
                        <td className="px-4 py-3 font-medium text-tinta-900">
                          {dataBR(r.data)}
                        </td>
                        <td className="px-4 py-3 text-tinta-600">
                          {TURNO[r.turno] ?? r.turno}
                        </td>
                        <td className="px-4 py-3 text-right text-tinta-900">
                          {r.enviados.toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-[#059669]">
                          {r.apoios.toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 text-right text-tinta-600">
                          {r.outras_devolutivas.toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 text-right text-tinta-400">
                          {semRetorno.toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3">
                          {r.restricao && (
                            <span className="rounded-full bg-[#EB388A]/[0.15] px-2.5 py-0.5 text-[11px] font-semibold text-[#EB388A]">
                              restringida
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-tinta-600">
                          {r.criador_nome ?? (
                            <span className="text-tinta-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {temObs ? (
                            <button
                              onClick={() => toggleObs(r.id)}
                              aria-label="Ver observação"
                              title="Ver observação"
                              className={`inline-flex rounded-md p-1.5 transition-colors ${obsAberta ? "bg-tema/[0.07] text-tema" : "text-tema/70 hover:bg-tema/[0.07] hover:text-tema"}`}
                            >
                              <MessageSquareText size={16} />
                            </button>
                          ) : (
                            <span className="text-tinta-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 print:hidden">
                          {podeEditar(r) && (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => editar(r)}
                                className="rounded-md p-2 text-tinta-400 hover:bg-tinta-100 hover:text-tinta-700"
                                aria-label="Editar"
                              >
                                <Pencil size={15} />
                              </button>
                              {isAdmin && (
                                <button
                                  onClick={() => excluir(r)}
                                  className="rounded-md p-2 text-tinta-400 hover:bg-red-50 hover:text-red-600"
                                  aria-label="Excluir"
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                      {temObs && obsAberta && (
                        <tr
                          className={`border-b border-tinta-100 ${r.restricao ? "bg-[#EB388A]/[0.08]" : "bg-tinta-50/60"}`}
                        >
                          <td colSpan={10} className="px-4 pb-3 pt-0">
                            <div className="flex gap-2 rounded-lg border border-tinta-200 bg-white px-3 py-2 text-[13px] text-tinta-600">
                              <MessageSquareText
                                size={15}
                                className="mt-0.5 shrink-0 text-tema/70"
                              />
                              <span className="whitespace-pre-wrap">
                                {r.observacoes}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <RegistroDialog
        registro={editando}
        meuId={meuId}
        aberto={aberto}
        onOpenChange={setAberto}
      />

      {relatorio && (
        <RelatorioConversas
          registros={filtrados}
          ini={ini}
          fim={fim}
          onFechar={() => setRelatorio(false)}
        />
      )}
    </>
  );
}
