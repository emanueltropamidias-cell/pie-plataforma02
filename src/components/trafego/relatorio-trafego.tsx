"use client";

import Image from "next/image";
import type { Metrica } from "./metrica-dialog";
import { MARCA } from "@/lib/candidato";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}
function reais(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function pct(a: number, b: number) {
  if (!b) return "0%";
  return ((a / b) * 100).toFixed(2).replace(".", ",") + "%";
}
function dataBR(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

type Dia = { data: string; gasto: number; impressoes: number; cliques: number; resultados: number };
function agruparPorDia(registros: Metrica[]): Dia[] {
  const mapa = new Map<string, Dia>();
  for (const r of registros) {
    const a = mapa.get(r.data) ?? { data: r.data, gasto: 0, impressoes: 0, cliques: 0, resultados: 0 };
    a.gasto += r.gasto;
    a.impressoes += r.impressoes;
    a.cliques += r.cliques;
    a.resultados += r.resultados;
    mapa.set(r.data, a);
  }
  return [...mapa.values()].sort((a, b) => a.data.localeCompare(b.data));
}

export function RelatorioTrafego({
  registros,
  ini,
  fim,
  campanha,
  onFechar,
}: {
  registros: Metrica[];
  ini: string;
  fim: string;
  campanha: string;
  onFechar: () => void;
}) {
  const dias = agruparPorDia(registros);
  const gasto = registros.reduce((s, r) => s + r.gasto, 0);
  const alcance = registros.reduce((s, r) => s + r.alcance, 0);
  const impressoes = registros.reduce((s, r) => s + r.impressoes, 0);
  const cliques = registros.reduce((s, r) => s + r.cliques, 0);
  const resultados = registros.reduce((s, r) => s + r.resultados, 0);
  const cpc = cliques ? gasto / cliques : 0;
  const custoResultado = resultados ? gasto / resultados : 0;

  const datas = registros.map((r) => r.data).sort();
  const periodo =
    ini || fim
      ? `${ini ? dataBR(ini) : "início"} a ${fim ? dataBR(fim) : "hoje"}`
      : datas.length
        ? `${dataBR(datas[0])} a ${dataBR(datas[datas.length - 1])}`
        : "sem registros";

  const kpis = [
    { label: "Investimento", valor: reais(gasto) },
    { label: "Alcance", valor: fmt(alcance) },
    { label: "Impressões", valor: fmt(impressoes) },
    { label: "Cliques", valor: fmt(cliques) },
    { label: "CTR", valor: pct(cliques, impressoes) },
    { label: "CPC", valor: reais(cpc) },
    { label: "Resultados", valor: fmt(resultados) },
    { label: "Custo por resultado", valor: reais(custoResultado) },
  ];

  return (
    <div className="fixed inset-0 z-[70] overflow-auto bg-black/50 print:static print:bg-white">
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

      <div
        id="folha-relatorio"
        className="mx-auto my-6 w-full max-w-4xl bg-white p-8 shadow-lg print:my-0 print:max-w-none print:p-0 print:shadow-none sm:p-10"
      >
        <div className="flex items-start justify-between border-b-2 border-primary pb-5">
          <div>
            <Image src={MARCA.cor} alt="Talita Oliveira" width={150} height={40} className="h-9 w-auto" />
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-tinta-900">Relatório de Tráfego</h1>
            <p className="mt-0.5 text-sm text-tinta-500">Investimento e resultados das campanhas.</p>
          </div>
          <div className="text-right text-[12px] text-tinta-500">
            <p>
              <span className="font-semibold text-tinta-700">Período:</span> {periodo}
            </p>
            <p className="mt-0.5">Campanha: {campanha || "Todas"}</p>
            <p className="mt-0.5">{dias.length} dia(s) com dados</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-xl border border-tinta-200 p-3">
              <p className="text-[11px] font-medium text-tinta-500">{k.label}</p>
              <p className="mt-0.5 text-xl font-extrabold tracking-tight text-tinta-900">{k.valor}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-8 mb-2 text-sm font-bold uppercase tracking-wide text-tinta-500">Detalhamento por dia</h2>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b-2 border-tinta-300 text-left text-tinta-600">
              <th className="py-2 pr-2 font-semibold">Data</th>
              <th className="py-2 px-2 text-right font-semibold">Investimento</th>
              <th className="py-2 px-2 text-right font-semibold">Impressões</th>
              <th className="py-2 px-2 text-right font-semibold">Cliques</th>
              <th className="py-2 px-2 text-right font-semibold">CTR</th>
              <th className="py-2 pl-2 text-right font-semibold">Resultados</th>
            </tr>
          </thead>
          <tbody>
            {dias.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-tinta-400">
                  Nenhum dado no período.
                </td>
              </tr>
            ) : (
              dias.map((d) => (
                <tr key={d.data} className="border-b border-tinta-100">
                  <td className="py-2 pr-2 font-medium text-tinta-800">{dataBR(d.data)}</td>
                  <td className="py-2 px-2 text-right text-tinta-800">{reais(d.gasto)}</td>
                  <td className="py-2 px-2 text-right text-tinta-600">{fmt(d.impressoes)}</td>
                  <td className="py-2 px-2 text-right text-tinta-600">{fmt(d.cliques)}</td>
                  <td className="py-2 px-2 text-right text-tinta-600">{pct(d.cliques, d.impressoes)}</td>
                  <td className="py-2 pl-2 text-right font-semibold text-[#059669]">{fmt(d.resultados)}</td>
                </tr>
              ))
            )}
          </tbody>
          {dias.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-tinta-300 font-bold text-tinta-900">
                <td className="py-2 pr-2">Total</td>
                <td className="py-2 px-2 text-right">{reais(gasto)}</td>
                <td className="py-2 px-2 text-right">{fmt(impressoes)}</td>
                <td className="py-2 px-2 text-right">{fmt(cliques)}</td>
                <td className="py-2 px-2 text-right">{pct(cliques, impressoes)}</td>
                <td className="py-2 pl-2 text-right text-[#059669]">{fmt(resultados)}</td>
              </tr>
            </tfoot>
          )}
        </table>

        <p className="mt-8 border-t border-tinta-200 pt-3 text-[11px] text-tinta-400">
          Plataforma de Inteligência - Talita Oliveira. Dados das campanhas do Gerenciador de Anúncios.
        </p>
      </div>

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
