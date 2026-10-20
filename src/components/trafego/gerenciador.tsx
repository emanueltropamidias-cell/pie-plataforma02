"use client";

import { useState } from "react";
import { Columns3, Check } from "lucide-react";
import type { Metrica } from "./metrica-dialog";
import type { Criativo } from "./criativos-grid";
import type { MetaCampanha } from "./dashboard-trafego";
import { rotuloObjetivo, statusAtivo } from "@/lib/trafego-labels";

export type CampanhaAgg = {
  id: string;
  campaign_id: string;
  campanha: string | null;
  objetivo: string | null;
  status: string | null;
  orcamento: number | null;
  gasto: number;
  alcance: number;
  frequencia: number | null;
  impressoes: number;
  cliques: number;
  resultados: number;
  tipo_resultado: string | null;
  conta_id?: string | null;
};

export type Conjunto = {
  id: string;
  adset_id: string;
  nome: string | null;
  campanha: string | null;
  status: string | null;
  otimizacao: string | null;
  orcamento: number | null;
  gasto: number;
  alcance: number;
  impressoes: number;
  cliques: number;
  resultados: number;
  tipo_resultado: string | null;
  conta_id?: string | null;
};

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
const vazio = <span className="text-tinta-300">-</span>;

type Row = {
  chave: string;
  nome: string;
  sub: string | null;
  status: string | null;
  objetivo: string | null;
  otimizacao: string | null;
  orcamento: number | null;
  gasto: number;
  resultados: number;
  tipo: string | null;
  alcance: number;
  impressoes: number;
  cliques: number;
  thumb: string | null;
};
type Tot = { gasto: number; resultados: number; alcance: number; impressoes: number; cliques: number };

// ---- Definição das colunas (cada uma sabe se renderizar e somar) ----
type ColDef = { id: string; label: string; right?: boolean; cell: (r: Row) => React.ReactNode; foot?: (t: Tot) => React.ReactNode };

const COLUNAS: ColDef[] = [
  {
    id: "veiculacao",
    label: "Veiculação",
    cell: (r) => {
      const ativo = statusAtivo(r.status);
      return (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span className={`h-2 w-2 rounded-full ${ativo ? "bg-emerald-500" : "bg-tinta-300"}`} />
          <span className={ativo ? "text-emerald-700" : "text-tinta-500"}>{ativo ? "Ativa" : "Desativada"}</span>
        </span>
      );
    },
  },
  { id: "objetivo", label: "Objetivo", cell: (r) => (r.objetivo ? rotuloObjetivo(r.objetivo) : vazio) },
  { id: "otimizacao", label: "Otimização", cell: (r) => (r.otimizacao ? r.otimizacao : vazio) },
  { id: "orcamento", label: "Orçamento", right: true, cell: (r) => (r.orcamento ? `${reais(r.orcamento)}/dia` : vazio) },
  {
    id: "gasto",
    label: "Valor gasto",
    right: true,
    cell: (r) => <span className="font-semibold text-tinta-900">{reais(r.gasto)}</span>,
    foot: (t) => reais(t.gasto),
  },
  {
    id: "resultados",
    label: "Resultados",
    right: true,
    cell: (r) => (
      <>
        <span className="font-semibold text-[#059669]">{fmt(r.resultados)}</span>
        <span className="block text-[10px] text-tinta-400">{r.tipo || "Resultados"}</span>
      </>
    ),
    foot: (t) => <span className="text-[#059669]">{fmt(t.resultados)}</span>,
  },
  {
    id: "custo",
    label: "Custo/result.",
    right: true,
    cell: (r) => reais(r.resultados ? r.gasto / r.resultados : 0),
    foot: (t) => reais(t.resultados ? t.gasto / t.resultados : 0),
  },
  { id: "alcance", label: "Alcance", right: true, cell: (r) => (r.alcance ? fmt(r.alcance) : vazio), foot: (t) => (t.alcance ? fmt(t.alcance) : "-") },
  { id: "impressoes", label: "Impressões", right: true, cell: (r) => fmt(r.impressoes), foot: (t) => fmt(t.impressoes) },
  {
    id: "frequencia",
    label: "Freq.",
    right: true,
    cell: (r) => (r.alcance ? (r.impressoes / r.alcance).toFixed(2).replace(".", ",") : vazio),
    foot: (t) => (t.alcance ? (t.impressoes / t.alcance).toFixed(2).replace(".", ",") : "-"),
  },
  { id: "cliques", label: "Cliques", right: true, cell: (r) => fmt(r.cliques), foot: (t) => fmt(t.cliques) },
  { id: "ctr", label: "CTR", right: true, cell: (r) => pct(r.cliques, r.impressoes), foot: (t) => pct(t.cliques, t.impressoes) },
  {
    id: "cpc",
    label: "CPC",
    right: true,
    cell: (r) => reais(r.cliques ? r.gasto / r.cliques : 0),
    foot: (t) => reais(t.cliques ? t.gasto / t.cliques : 0),
  },
  {
    id: "cpm",
    label: "CPM",
    right: true,
    cell: (r) => reais(r.impressoes ? (r.gasto / r.impressoes) * 1000 : 0),
    foot: (t) => reais(t.impressoes ? (t.gasto / t.impressoes) * 1000 : 0),
  },
];

// ---- Presets (espelhando o Gerenciador) ----
const PRESETS: { id: string; label: string; cols: string[] }[] = [
  {
    id: "desempenho_cliques",
    label: "Desempenho e cliques",
    cols: ["veiculacao", "orcamento", "gasto", "resultados", "custo", "alcance", "impressoes", "frequencia", "cliques", "ctr", "cpc", "cpm"],
  },
  { id: "desempenho", label: "Desempenho", cols: ["veiculacao", "orcamento", "gasto", "resultados", "custo", "alcance", "impressoes"] },
  { id: "engajamento", label: "Engajamento", cols: ["veiculacao", "gasto", "resultados", "custo", "impressoes", "cliques", "ctr"] },
  { id: "veiculacao_p", label: "Veiculação", cols: ["veiculacao", "orcamento", "alcance", "impressoes", "frequencia", "gasto"] },
  { id: "configuracao", label: "Configuração", cols: ["veiculacao", "objetivo", "otimizacao", "orcamento", "gasto"] },
];

function linhasCampanhas(registros: Metrica[]): Row[] {
  const mapa = new Map<string, Row>();
  for (const r of registros) {
    const nome = r.campanha?.trim() || "Sem nome";
    const a =
      mapa.get(nome) ??
      ({ chave: nome, nome, sub: null, status: null, objetivo: null, otimizacao: null, orcamento: null, gasto: 0, resultados: 0, tipo: null, alcance: 0, impressoes: 0, cliques: 0, thumb: null } as Row);
    a.gasto += r.gasto;
    a.resultados += r.resultados;
    a.alcance += r.alcance;
    a.impressoes += r.impressoes;
    a.cliques += r.cliques;
    a.status = a.status ?? r.status ?? null;
    a.objetivo = a.objetivo ?? r.objetivo ?? null;
    a.tipo = a.tipo ?? r.tipo_resultado ?? null;
    a.orcamento = a.orcamento ?? r.orcamento ?? null;
    mapa.set(nome, a);
  }
  return [...mapa.values()].sort((x, y) => y.gasto - x.gasto);
}

export function Gerenciador({
  registros,
  campanhasAgg = [],
  usarAgg = false,
  conjuntos,
  criativos,
  metas,
  isAdmin,
  onDefinirMeta,
}: {
  registros: Metrica[];
  campanhasAgg?: CampanhaAgg[];
  usarAgg?: boolean;
  conjuntos: Conjunto[];
  criativos: Criativo[];
  metas: MetaCampanha[];
  isAdmin: boolean;
  onDefinirMeta: (campanha: string, rotulo: string) => void;
}) {
  const [nivel, setNivel] = useState<"campanhas" | "conjuntos" | "anuncios">("campanhas");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [preset, setPreset] = useState("desempenho_cliques");
  const [cols, setCols] = useState<string[]>(PRESETS[0].cols);
  const [menu, setMenu] = useState(false);
  const [personalizar, setPersonalizar] = useState(false);

  // "Tudo" -> usa o agregado do Meta (alcance/frequência únicos, bate 1:1 com o Gerenciador).
  // Período filtrado -> soma os dias (alcance vira aproximado).
  const campanhas: Row[] =
    usarAgg && campanhasAgg.length
      ? campanhasAgg
          .map((c) => ({
            chave: c.campanha ?? c.campaign_id,
            nome: c.campanha ?? "Sem nome",
            sub: null,
            status: c.status,
            objetivo: c.objetivo,
            otimizacao: null,
            orcamento: c.orcamento,
            gasto: c.gasto,
            resultados: c.resultados,
            tipo: c.tipo_resultado,
            alcance: c.alcance,
            impressoes: c.impressoes,
            cliques: c.cliques,
            thumb: null,
          }))
          .sort((x, y) => y.gasto - x.gasto)
      : linhasCampanhas(registros);

  const linhasConj: Row[] = conjuntos.map((c) => ({
    chave: c.adset_id,
    nome: c.nome ?? "Sem nome",
    sub: c.campanha,
    status: c.status,
    objetivo: null,
    otimizacao: c.otimizacao,
    orcamento: c.orcamento,
    gasto: c.gasto,
    resultados: c.resultados,
    tipo: c.tipo_resultado,
    alcance: c.alcance,
    impressoes: c.impressoes,
    cliques: c.cliques,
    thumb: null,
  }));
  const linhasAds: Row[] = criativos.map((c) => ({
    chave: c.ad_id,
    nome: c.ad_name ?? "Sem nome",
    sub: c.campanha,
    status: c.status,
    objetivo: c.objetivo ?? null,
    otimizacao: null,
    orcamento: null,
    gasto: c.gasto,
    resultados: c.resultados,
    tipo: c.tipo_resultado,
    alcance: 0,
    impressoes: c.impressoes,
    cliques: c.cliques,
    thumb: c.thumbnail_url,
  }));

  const rows = nivel === "campanhas" ? campanhas : nivel === "conjuntos" ? linhasConj : linhasAds;
  const visiveis = sel.size ? rows.filter((r) => sel.has(r.chave)) : rows;
  const tot: Tot = visiveis.reduce(
    (a, r) => ({
      gasto: a.gasto + r.gasto,
      resultados: a.resultados + r.resultados,
      alcance: a.alcance + r.alcance,
      impressoes: a.impressoes + r.impressoes,
      cliques: a.cliques + r.cliques,
    }),
    { gasto: 0, resultados: 0, alcance: 0, impressoes: 0, cliques: 0 },
  );

  const colsAtivas = COLUNAS.filter((c) => cols.includes(c.id));
  const mostrarMeta = nivel === "campanhas";
  const nomeNivel = nivel === "campanhas" ? "campanha" : nivel === "conjuntos" ? "conjunto" : "anúncio";
  const metaDe = (c: string) => metas.find((m) => m.campanha === c);
  const rotuloPreset = PRESETS.find((p) => p.id === preset)?.label ?? "Personalizado";

  const abas = [
    { id: "campanhas" as const, label: "Campanhas", n: campanhas.length },
    { id: "conjuntos" as const, label: "Conjuntos de anúncios", n: linhasConj.length },
    { id: "anuncios" as const, label: "Anúncios", n: linhasAds.length },
  ];

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-tinta-200 bg-white shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
      {/* Abas de nível + seletor de colunas */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tinta-200 px-2 pt-2">
        <div className="flex items-center gap-1">
          {abas.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                setNivel(a.id);
                setSel(new Set());
              }}
              className={`rounded-t-lg px-4 py-2.5 text-[13px] font-semibold transition-colors ${
                nivel === a.id ? "border-b-2 border-tema text-tema" : "text-tinta-500 hover:bg-tinta-50"
              }`}
            >
              {a.label} <span className="text-tinta-400">({a.n})</span>
            </button>
          ))}
        </div>

        <div className="relative pb-2">
          <button
            onClick={() => setMenu((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-tinta-200 bg-white px-3 py-1.5 text-[13px] font-semibold text-tinta-700 hover:bg-tinta-50"
          >
            <Columns3 size={15} />
            Colunas: {rotuloPreset}
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 z-20 mt-1 w-72 rounded-xl border border-tinta-200 bg-white p-2 shadow-[0_8px_28px_rgba(22,32,46,0.12)]">
                <p className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-tinta-400">Predefinições</p>
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setPreset(p.id);
                      setCols(p.cols);
                      setPersonalizar(false);
                      setMenu(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] hover:bg-tinta-50 ${
                      preset === p.id ? "font-semibold text-tema" : "text-tinta-700"
                    }`}
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${preset === p.id ? "border-tema bg-tema" : "border-tinta-300"}`}>
                      {preset === p.id && <Check size={11} className="text-white" />}
                    </span>
                    {p.label}
                  </button>
                ))}
                <div className="my-1 border-t border-tinta-100" />
                <button
                  onClick={() => setPersonalizar((v) => !v)}
                  className="w-full rounded-lg px-2 py-2 text-left text-[13px] font-semibold text-tinta-700 hover:bg-tinta-50"
                >
                  Personalizar colunas
                </button>
                {personalizar && (
                  <div className="mt-1 max-h-60 overflow-y-auto rounded-lg bg-tinta-50 p-2">
                    {COLUNAS.map((c) => (
                      <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[13px] text-tinta-700 hover:bg-white">
                        <input
                          type="checkbox"
                          checked={cols.includes(c.id)}
                          onChange={() => {
                            setPreset("custom");
                            setCols((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]));
                          }}
                          className="h-4 w-4 accent-[#0525F7]"
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="p-10 text-center text-sm text-tinta-500">
          Nada aqui ainda. Clique em &quot;Sincronizar com o Meta&quot;.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 420 + colsAtivas.length * 92 }}>
            <thead>
              <tr className="border-b border-tinta-200 bg-tinta-50/60 text-left text-[11px] uppercase tracking-wide text-tinta-500">
                <th className="w-9 px-3 py-2.5"></th>
                <th className="px-2 py-2.5">
                  {nivel === "campanhas" ? "Campanha" : nivel === "conjuntos" ? "Conjunto" : "Anúncio"}
                </th>
                {colsAtivas.map((c) => (
                  <th key={c.id} className={`px-3 py-2.5 ${c.right ? "text-right" : ""}`}>
                    {c.label}
                  </th>
                ))}
                {mostrarMeta && <th className="w-[150px] px-3 py-2.5">Meta</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const m = mostrarMeta ? metaDe(r.nome) : undefined;
                const pMeta = m && m.meta ? Math.min(100, (r.resultados / m.meta) * 100) : 0;
                const rot = r.tipo || "Resultados";
                return (
                  <tr key={r.chave} className="border-b border-tinta-100 last:border-0 hover:bg-tinta-50/60">
                    <td className="px-3 py-2.5 align-top">
                      <input
                        type="checkbox"
                        checked={sel.has(r.chave)}
                        onChange={() =>
                          setSel((p) => {
                            const n = new Set(p);
                            if (n.has(r.chave)) n.delete(r.chave);
                            else n.add(r.chave);
                            return n;
                          })
                        }
                        className="mt-1 h-4 w-4 accent-[#0525F7]"
                      />
                    </td>
                    <td className="px-2 py-2.5 align-top">
                      <div className="flex items-start gap-2">
                        {r.thumb && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.thumb} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium text-tinta-900">{r.nome}</p>
                          {r.sub && <p className="truncate text-[11px] text-tinta-400">{r.sub}</p>}
                        </div>
                      </div>
                    </td>
                    {colsAtivas.map((c) => (
                      <td key={c.id} className={`px-3 py-2.5 align-top text-tinta-600 ${c.right ? "text-right" : ""}`}>
                        {c.cell(r)}
                      </td>
                    ))}
                    {mostrarMeta && (
                      <td className="px-3 py-2.5 align-top">
                        {m && m.meta ? (
                          <div>
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-tinta-500">
                                {fmt(r.resultados)}/{fmt(m.meta)}
                              </span>
                              <span className="font-semibold text-tema">{pMeta.toFixed(0)}%</span>
                            </div>
                            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-tinta-100">
                              <div className="h-full rounded-full bg-tema" style={{ width: `${pMeta}%` }} />
                            </div>
                            {isAdmin && (
                              <button onClick={() => onDefinirMeta(r.nome, rot)} className="mt-0.5 text-[10px] text-tinta-400 hover:text-tema">
                                editar
                              </button>
                            )}
                          </div>
                        ) : isAdmin ? (
                          <button
                            onClick={() => onDefinirMeta(r.nome, rot)}
                            className="rounded-md border border-dashed border-tinta-300 px-2 py-0.5 text-[10px] font-medium text-tinta-500 hover:border-primary hover:text-tema"
                          >
                            + meta
                          </button>
                        ) : (
                          <span className="text-[10px] text-tinta-300">-</span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-tinta-200 bg-tinta-50/80 font-semibold text-tinta-900">
                <td className="px-3 py-3"></td>
                <td className="px-2 py-3 text-[12px]">
                  {sel.size
                    ? `Resultados de ${sel.size} ${nomeNivel}(s) selecionada(s)`
                    : `Resultados de ${rows.length} ${nomeNivel}(s)`}
                </td>
                {colsAtivas.map((c) => (
                  <td key={c.id} className={`px-3 py-3 ${c.right ? "text-right" : ""}`}>
                    {c.foot ? c.foot(tot) : ""}
                  </td>
                ))}
                {mostrarMeta && <td className="px-3 py-3"></td>}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
