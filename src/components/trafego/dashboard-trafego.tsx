import type { Metrica } from "./metrica-dialog";
import { rotuloObjetivo, statusAtivo } from "@/lib/trafego-labels";

export type MetaCampanha = { campanha: string; rotulo: string | null; meta: number };

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
function diaBR(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function porDia(registros: Metrica[], campo: "gasto" | "resultados" | "cliques") {
  const mapa = new Map<string, number>();
  for (const r of registros) mapa.set(r.data, (mapa.get(r.data) ?? 0) + r[campo]);
  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([data, valor]) => ({ data, valor }));
}

const CORES_CAMPANHA = ["#0525F7", "#EB388A", "#C0EB02", "#FFB700", "#7c3aed", "#059669", "#f97316", "#0ea5e9"];

type ResumoCampanha = {
  campanha: string;
  gasto: number;
  impressoes: number;
  cliques: number;
  resultados: number;
  objetivo: string | null;
  status: string | null;
  tipo: string | null;
  cor: string;
};
function porCampanha(registros: Metrica[]): ResumoCampanha[] {
  const mapa = new Map<string, ResumoCampanha>();
  for (const r of registros) {
    const nome = r.campanha?.trim() || "Sem nome";
    const a =
      mapa.get(nome) ??
      ({ campanha: nome, gasto: 0, impressoes: 0, cliques: 0, resultados: 0, objetivo: null, status: null, tipo: null, cor: "" } as ResumoCampanha);
    a.gasto += r.gasto;
    a.impressoes += r.impressoes;
    a.cliques += r.cliques;
    a.resultados += r.resultados;
    a.objetivo = a.objetivo ?? r.objetivo ?? null;
    a.status = a.status ?? r.status ?? null;
    a.tipo = a.tipo ?? r.tipo_resultado ?? null;
    mapa.set(nome, a);
  }
  return [...mapa.values()].sort((a, b) => b.gasto - a.gasto).map((c, i) => ({ ...c, cor: CORES_CAMPANHA[i % CORES_CAMPANHA.length] }));
}

function LineChart({ pontos, cor }: { pontos: { data: string; valor: number }[]; cor: string }) {
  const W = 600, H = 180, pad = 28;
  const max = Math.max(1, ...pontos.map((p) => p.valor));
  const n = pontos.length;
  const x = (i: number) => (n <= 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1));
  const y = (v: number) => H - pad - (v / max) * (H - 2 * pad);
  const d = pontos.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.valor)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full">
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#e5e7eb" />
      <path d={d} fill="none" stroke={cor} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      {pontos.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.valor)} r={3.5} fill={cor} />
      ))}
      {pontos.map((p, i) =>
        i % Math.ceil(n / 8 || 1) === 0 ? (
          <text key={"t" + i} x={x(i)} y={H - 8} fontSize={10} fill="#94a3b8" textAnchor="middle">
            {diaBR(p.data)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function BarChart({ pontos, cor }: { pontos: { data: string; valor: number }[]; cor: string }) {
  const W = 600, H = 180, pad = 28;
  const max = Math.max(1, ...pontos.map((p) => p.valor));
  const n = pontos.length || 1;
  const bw = ((W - 2 * pad) / n) * 0.6;
  const step = (W - 2 * pad) / n;
  const y = (v: number) => H - pad - (v / max) * (H - 2 * pad);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full">
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#e5e7eb" />
      {pontos.map((p, i) => {
        const cx = pad + i * step + step / 2;
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={y(p.valor)} width={bw} height={H - pad - y(p.valor)} rx={3} fill={cor} />
            {i % Math.ceil(n / 8 || 1) === 0 && (
              <text x={cx} y={H - 8} fontSize={10} fill="#94a3b8" textAnchor="middle">
                {diaBR(p.data)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const ativo = statusAtivo(status);
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${ativo ? "bg-emerald-100 text-emerald-700" : "bg-tinta-200 text-tinta-500"}`}>
      {ativo ? "Ativa" : "Pausada"}
    </span>
  );
}

export function DashboardTrafego({
  registros,
  metas = [],
  isAdmin = false,
  onDefinirMeta,
  alcanceReal,
  frequenciaReal,
}: {
  registros: Metrica[];
  metas?: MetaCampanha[];
  isAdmin?: boolean;
  onDefinirMeta?: (campanha: string, rotulo: string) => void;
  alcanceReal?: number;
  frequenciaReal?: number;
}) {
  const gasto = registros.reduce((s, r) => s + r.gasto, 0);
  const alcanceSoma = registros.reduce((s, r) => s + r.alcance, 0);
  const impressoes = registros.reduce((s, r) => s + r.impressoes, 0);
  const cliques = registros.reduce((s, r) => s + r.cliques, 0);

  // Alcance/Frequência: usa o agregado ÚNICO do Meta quando disponível (bate com o Gerenciador)
  const usaReal = typeof alcanceReal === "number" && alcanceReal > 0;
  const alcance = usaReal ? alcanceReal! : alcanceSoma;
  const frequencia = usaReal && frequenciaReal ? frequenciaReal : alcance ? impressoes / alcance : 0;

  const cpc = cliques ? gasto / cliques : 0;
  const cpm = impressoes ? (gasto / impressoes) * 1000 : 0;

  const cards = [
    { label: "Investimento", valor: reais(gasto), hint: "total no período" },
    { label: "Alcance", valor: fmt(alcance), hint: usaReal ? "pessoas únicas (Meta)" : "soma diária" },
    { label: "Impressões", valor: fmt(impressoes), hint: "soma diária" },
    { label: "Cliques", valor: fmt(cliques), hint: "soma diária" },
    { label: "CTR", valor: pct(cliques, impressoes), hint: "cliques / impressões" },
    { label: "CPC", valor: reais(cpc), hint: "custo por clique" },
    { label: "CPM", valor: reais(cpm), hint: "custo por mil impressões" },
    { label: "Frequência", valor: frequencia.toFixed(2).replace(".", ","), hint: "vezes que cada pessoa viu" },
  ];

  // Resultados quebrados por tipo (não faz sentido somar engajamento + conversa + cadastro)
  const tiposMap = new Map<string, { tipo: string; resultados: number; gasto: number }>();
  for (const r of registros) {
    const t = r.tipo_resultado || "Resultados";
    const a = tiposMap.get(t) ?? { tipo: t, resultados: 0, gasto: 0 };
    a.resultados += r.resultados;
    a.gasto += r.gasto;
    tiposMap.set(t, a);
  }
  const tipos = [...tiposMap.values()].filter((t) => t.resultados > 0).sort((a, b) => b.resultados - a.resultados);

  const campanhas = porCampanha(registros);
  const metaDe = (c: string) => metas.find((m) => m.campanha === c);

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-tinta-200 bg-white p-5 shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
            <p className="text-[12px] font-medium text-tinta-500">{c.label}</p>
            <p className="mt-1 text-2xl font-extrabold tracking-tight text-tinta-900">{c.valor}</p>
            <p className="mt-1 text-[11px] text-tinta-400">{c.hint}</p>
          </div>
        ))}
      </div>

      {tipos.length > 0 && (
        <div className="rounded-xl border border-tinta-200 bg-white p-5 shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
          <p className="mb-3 text-sm font-semibold text-tinta-700">Resultados por tipo</p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {tipos.map((t) => (
              <div key={t.tipo} className="rounded-xl border border-tinta-200 p-4">
                <p className="text-[12px] font-medium text-tinta-500">{t.tipo}</p>
                <p className="mt-1 text-2xl font-extrabold tracking-tight text-[#059669]">{fmt(t.resultados)}</p>
                <p className="mt-1 text-[11px] text-tinta-400">
                  {reais(t.resultados ? t.gasto / t.resultados : 0)} por resultado · {reais(t.gasto)} investido
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {registros.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-tinta-200 bg-white p-5 shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
            <p className="mb-2 text-sm font-semibold text-tinta-700">Investimento por dia</p>
            <LineChart pontos={porDia(registros, "gasto")} cor="#0525F7" />
          </div>
          <div className="rounded-xl border border-tinta-200 bg-white p-5 shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
            <p className="mb-2 text-sm font-semibold text-tinta-700">Resultados por dia</p>
            <BarChart pontos={porDia(registros, "resultados")} cor="#C0EB02" />
          </div>
        </div>
      )}

      {campanhas.length > 0 && (
        <div className="rounded-xl border border-tinta-200 bg-white p-5 shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-tinta-700">Desempenho por campanha</p>
            <span className="text-[12px] text-tinta-400">{campanhas.length} campanha(s)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-tinta-200 text-left text-[11px] uppercase tracking-wide text-tinta-500">
                  <th className="py-2 pr-2">Campanha</th>
                  <th className="py-2 px-2 text-right">Investimento</th>
                  <th className="py-2 px-2 text-right">CTR</th>
                  <th className="py-2 px-2 text-right">Resultado</th>
                  <th className="py-2 px-2 text-right">Custo</th>
                  <th className="py-2 pl-2 w-[190px]">Meta</th>
                </tr>
              </thead>
              <tbody>
                {campanhas.map((c) => {
                  const custo = c.resultados ? c.gasto / c.resultados : 0;
                  const m = metaDe(c.campanha);
                  const pMeta = m && m.meta ? Math.min(100, (c.resultados / m.meta) * 100) : 0;
                  const rot = c.tipo || "Resultados";
                  return (
                    <tr key={c.campanha} className="border-b border-tinta-100 last:border-0 align-top">
                      <td className="py-2.5 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.cor }} />
                          <span className="font-medium text-tinta-800">{c.campanha}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 pl-[18px]">
                          <StatusBadge status={c.status} />
                          <span className="rounded-full bg-tema/[0.07] px-2 py-0.5 text-[10px] font-semibold text-tema">
                            {rotuloObjetivo(c.objetivo)}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold text-tinta-900">{reais(c.gasto)}</td>
                      <td className="py-2.5 px-2 text-right text-tinta-600">{pct(c.cliques, c.impressoes)}</td>
                      <td className="py-2.5 px-2 text-right">
                        <span className="font-semibold text-[#059669]">{fmt(c.resultados)}</span>
                        <span className="block text-[10px] text-tinta-400">{rot}</span>
                      </td>
                      <td className="py-2.5 px-2 text-right text-tinta-700">{reais(custo)}</td>
                      <td className="py-2.5 pl-2">
                        {m && m.meta ? (
                          <div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-tinta-500">
                                {fmt(c.resultados)} / {fmt(m.meta)}
                              </span>
                              <span className="font-semibold text-tema">{pMeta.toFixed(0)}%</span>
                            </div>
                            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-tinta-100">
                              <div className="h-full rounded-full bg-tema" style={{ width: `${pMeta}%` }} />
                            </div>
                            {isAdmin && onDefinirMeta && (
                              <button onClick={() => onDefinirMeta(c.campanha, rot)} className="mt-1 text-[10px] text-tinta-400 hover:text-tema">
                                editar meta
                              </button>
                            )}
                          </div>
                        ) : isAdmin && onDefinirMeta ? (
                          <button
                            onClick={() => onDefinirMeta(c.campanha, rot)}
                            className="rounded-md border border-dashed border-tinta-300 px-2.5 py-1 text-[11px] font-medium text-tinta-500 hover:border-primary hover:text-tema"
                          >
                            + definir meta
                          </button>
                        ) : (
                          <span className="text-[11px] text-tinta-300">sem meta</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
