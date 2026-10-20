"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { Metrica } from "./metrica-dialog";

const TITULOS = ["PANORAMA", "O QUE ESTÁ FUNCIONANDO", "PONTOS DE ATENÇÃO", "RECOMENDAÇÕES"];

function round(n: number, casas = 2) {
  const p = 10 ** casas;
  return Math.round(n * p) / p;
}

function montarResumo(registros: Metrica[], ini: string, fim: string, campanha: string) {
  const soma = (arr: Metrica[], c: "gasto" | "alcance" | "impressoes" | "cliques" | "resultados") =>
    arr.reduce((s, r) => s + r[c], 0);

  const total = (arr: Metrica[]) => {
    const gasto = soma(arr, "gasto");
    const impressoes = soma(arr, "impressoes");
    const cliques = soma(arr, "cliques");
    const resultados = soma(arr, "resultados");
    return {
      investimento: round(gasto),
      alcance: soma(arr, "alcance"),
      impressoes,
      cliques,
      resultados,
      ctr_pct: impressoes ? round((cliques / impressoes) * 100) : 0,
      cpc: cliques ? round(gasto / cliques) : 0,
      cpm: impressoes ? round((gasto / impressoes) * 1000) : 0,
      custo_por_resultado: resultados ? round(gasto / resultados) : 0,
    };
  };

  const campanhas = [...new Set(registros.map((r) => r.campanha ?? "Sem nome"))];
  const porCampanha = campanhas.map((c) => ({
    campanha: c,
    ...total(registros.filter((r) => (r.campanha ?? "Sem nome") === c)),
  }));

  const dias = new Map<string, { data: string; investimento: number; cliques: number; resultados: number }>();
  for (const r of registros) {
    const a = dias.get(r.data) ?? { data: r.data, investimento: 0, cliques: 0, resultados: 0 };
    a.investimento = round(a.investimento + r.gasto);
    a.cliques += r.cliques;
    a.resultados += r.resultados;
    dias.set(r.data, a);
  }

  return {
    periodo: { inicio: ini || "todos", fim: fim || "todos", campanha: campanha || "todas" },
    totais: total(registros),
    por_campanha: porCampanha,
    por_dia: [...dias.values()].sort((a, b) => a.data.localeCompare(b.data)),
  };
}

export function AnaliseIA({
  registros,
  ini,
  fim,
  campanha,
}: {
  registros: Metrica[];
  ini: string;
  fim: string;
  campanha: string;
}) {
  const [carregando, setCarregando] = useState(false);
  const [analise, setAnalise] = useState("");
  const [erro, setErro] = useState("");

  async function analisar() {
    setCarregando(true);
    setErro("");
    setAnalise("");
    try {
      const resumo = montarResumo(registros, ini, fim, campanha);
      const resp = await fetch("/api/trafego/analise", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resumo }),
      });
      const json = await resp.json();
      if (!resp.ok) setErro(json?.erro ?? "Erro ao analisar.");
      else setAnalise(json.analise ?? "");
    } catch {
      setErro("Falha de rede ao analisar.");
    }
    setCarregando(false);
  }

  const semDados = registros.length === 0;

  return (
    <div className="rounded-xl border border-tema/15 bg-tema/[0.03] p-5 shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-tema/[0.07] text-tema">
            <Sparkles size={17} />
          </span>
          <div>
            <p className="text-sm font-bold text-tinta-900">Análise da IA</p>
            <p className="text-[12px] text-tinta-500">Diagnóstico e recomendações do período filtrado.</p>
          </div>
        </div>
        <button
          onClick={analisar}
          disabled={carregando || semDados}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Sparkles size={15} className={carregando ? "animate-pulse" : ""} />
          {carregando ? "Analisando..." : semDados ? "Sem dados" : "Analisar com IA"}
        </button>
      </div>

      {erro && <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{erro}</p>}

      {analise && (
        <div className="mt-5 flex flex-col gap-3 border-t border-primary/15 pt-5">
          {analise.split("\n").map((linha, i) => {
            const t = linha.trim();
            if (!t) return null;
            if (TITULOS.includes(t.toUpperCase()))
              return (
                <p key={i} className="mt-2 text-[11px] font-bold uppercase tracking-widest text-tema">
                  {t}
                </p>
              );
            if (t.startsWith("- ") || t.startsWith("• "))
              return (
                <p key={i} className="flex gap-2 pl-1 text-[13.5px] text-tinta-700">
                  <span className="text-tema">•</span>
                  <span>{t.replace(/^[-•]\s*/, "")}</span>
                </p>
              );
            return (
              <p key={i} className="text-[13.5px] leading-relaxed text-tinta-700">
                {t}
              </p>
            );
          })}
          <p className="mt-2 text-[11px] text-tinta-400">
            Análise gerada por IA a partir dos dados do período. Confira antes de decidir.
          </p>
        </div>
      )}
    </div>
  );
}
