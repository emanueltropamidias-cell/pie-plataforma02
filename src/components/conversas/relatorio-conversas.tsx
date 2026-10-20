"use client";

import Image from "next/image";
import type { Registro } from "./registro-dialog";
import { MARCA } from "@/lib/candidato";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}
function pct(a: number, b: number) {
  if (!b) return "0%";
  return ((a / b) * 100).toFixed(1).replace(".", ",") + "%";
}
function dataBR(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

// Agrega tudo por dia (um dia pode ter vários turnos)
type Dia = {
  data: string;
  enviados: number;
  apoios: number;
  outras: number;
  restricao: boolean;
};
function agruparPorDia(registros: Registro[]): Dia[] {
  const mapa = new Map<string, Dia>();
  for (const r of registros) {
    const atual = mapa.get(r.data) ?? {
      data: r.data,
      enviados: 0,
      apoios: 0,
      outras: 0,
      restricao: false,
    };
    atual.enviados += r.enviados;
    atual.apoios += r.apoios;
    atual.outras += r.outras_devolutivas;
    atual.restricao = atual.restricao || r.restricao;
    mapa.set(r.data, atual);
  }
  return [...mapa.values()].sort((a, b) => a.data.localeCompare(b.data));
}

export function RelatorioConversas({
  registros,
  ini,
  fim,
  onFechar,
}: {
  registros: Registro[];
  ini: string;
  fim: string;
  onFechar: () => void;
}) {
  const dias = agruparPorDia(registros);
  const enviados = registros.reduce((s, r) => s + r.enviados, 0);
  const apoios = registros.reduce((s, r) => s + r.apoios, 0);
  const outras = registros.reduce((s, r) => s + r.outras_devolutivas, 0);
  const devolutivas = apoios + outras;
  const semRetornoTot = Math.max(0, enviados - devolutivas);
  const restr = registros.filter((r) => r.restricao).length;

  const datas = registros.map((r) => r.data).sort();
  const periodo =
    ini || fim
      ? `${ini ? dataBR(ini) : "início"} a ${fim ? dataBR(fim) : "hoje"}`
      : datas.length
        ? `${dataBR(datas[0])} a ${dataBR(datas[datas.length - 1])}`
        : "sem registros";

  const kpis = [
    { label: "Mensagens enviadas", valor: fmt(enviados) },
    { label: "Devolutivas", valor: fmt(devolutivas) },
    { label: "Retornos positivos", valor: fmt(apoios) },
    { label: "Outras devolutivas", valor: fmt(outras) },
    { label: "Sem retorno", valor: fmt(semRetornoTot) },
    { label: "Taxa de resposta", valor: pct(devolutivas, enviados) },
    { label: "Taxa de retorno positivo", valor: pct(apoios, enviados) },
    { label: "Turnos com restrição", valor: fmt(restr) },
  ];

  return (
    <div className="fixed inset-0 z-[70] overflow-auto bg-black/50 print:static print:bg-white">
      {/* Barra de ações (não sai na impressão) */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-white px-5 py-3 shadow-[0_1px_2px_rgba(22,32,46,0.04)] print:hidden">
        <span className="text-sm font-semibold text-tinta-700">Pré-visualização do relatório</span>
        <div className="flex items-center gap-2">
          <button
            onClick={onFechar}
            className="rounded-lg border border-tinta-200 px-4 py-2 text-sm font-medium text-tinta-600 hover:bg-tinta-50"
          >
            Fechar
          </button>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      {/* Folha do relatório */}
      <div
        id="folha-relatorio"
        className="mx-auto my-6 w-full max-w-4xl bg-white p-8 shadow-lg print:my-0 print:max-w-none print:p-0 print:shadow-none sm:p-10"
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between border-b-2 border-primary pb-5">
          <div>
            <Image
              src={MARCA.cor}
              alt="Talita Oliveira"
              width={150}
              height={40}
              className="h-9 w-auto"
            />
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-tinta-900">
              Relatório de Conversas
            </h1>
            <p className="mt-0.5 text-sm text-tinta-500">Disparos e devolutivas do atendimento.</p>
          </div>
          <div className="text-right text-[12px] text-tinta-500">
            <p>
              <span className="font-semibold text-tinta-700">Período:</span> {periodo}
            </p>
            <p className="mt-0.5">{dias.length} dia(s) com registro</p>
            <p className="mt-0.5">{registros.length} lançamento(s)</p>
          </div>
        </div>

        {/* Indicadores */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-xl border border-tinta-200 p-3">
              <p className="text-[11px] font-medium text-tinta-500">{k.label}</p>
              <p className="mt-0.5 text-xl font-extrabold tracking-tight text-tinta-900">{k.valor}</p>
            </div>
          ))}
        </div>

        {/* Tabela dia a dia */}
        <h2 className="mt-8 mb-2 text-sm font-bold uppercase tracking-wide text-tinta-500">
          Detalhamento por dia
        </h2>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b-2 border-tinta-300 text-left text-tinta-600">
              <th className="py-2 pr-2 font-semibold">Data</th>
              <th className="py-2 px-2 text-right font-semibold">Enviados</th>
              <th className="py-2 px-2 text-right font-semibold">Positivos</th>
              <th className="py-2 px-2 text-right font-semibold">Outras</th>
              <th className="py-2 px-2 text-right font-semibold">Sem retorno</th>
              <th className="py-2 pl-2 text-right font-semibold">Restrição</th>
            </tr>
          </thead>
          <tbody>
            {dias.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-tinta-400">
                  Nenhum registro no período.
                </td>
              </tr>
            ) : (
              dias.map((d) => {
                const semRet = Math.max(0, d.enviados - d.apoios - d.outras);
                return (
                  <tr key={d.data} className="border-b border-tinta-100">
                    <td className="py-2 pr-2 font-medium text-tinta-800">{dataBR(d.data)}</td>
                    <td className="py-2 px-2 text-right text-tinta-800">{fmt(d.enviados)}</td>
                    <td className="py-2 px-2 text-right font-semibold text-[#059669]">{fmt(d.apoios)}</td>
                    <td className="py-2 px-2 text-right text-tinta-600">{fmt(d.outras)}</td>
                    <td className="py-2 px-2 text-right text-tinta-400">{fmt(semRet)}</td>
                    <td className="py-2 pl-2 text-right text-tinta-600">{d.restricao ? "Sim" : "-"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          {dias.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-tinta-300 font-bold text-tinta-900">
                <td className="py-2 pr-2">Total</td>
                <td className="py-2 px-2 text-right">{fmt(enviados)}</td>
                <td className="py-2 px-2 text-right text-[#059669]">{fmt(apoios)}</td>
                <td className="py-2 px-2 text-right">{fmt(outras)}</td>
                <td className="py-2 px-2 text-right">{fmt(semRetornoTot)}</td>
                <td className="py-2 pl-2 text-right">{restr}</td>
              </tr>
            </tfoot>
          )}
        </table>

        {/* Rodapé */}
        <p className="mt-8 border-t border-tinta-200 pt-3 text-[11px] text-tinta-400">
          Plataforma de Inteligência - Talita Oliveira. Documento gerado a partir dos registros do atendimento.
        </p>
      </div>

      {/* Regras de impressão: só a folha aparece no papel */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #folha-relatorio, #folha-relatorio * { visibility: visible !important; }
          #folha-relatorio { position: absolute; left: 0; top: 0; width: 100%; }
          @page { margin: 14mm; }
        }
      `}</style>
    </div>
  );
}
