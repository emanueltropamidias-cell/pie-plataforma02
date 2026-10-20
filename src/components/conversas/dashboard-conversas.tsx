import type { Registro } from "./registro-dialog";

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}
function pct(a: number, b: number) {
  if (!b) return "0%";
  return ((a / b) * 100).toFixed(1).replace(".", ",") + "%";
}
function diaBR(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

// Agrega por dia (ordenado por data)
function porDia(registros: Registro[], campo: "enviados" | "apoios") {
  const mapa = new Map<string, number>();
  for (const r of registros) mapa.set(r.data, (mapa.get(r.data) ?? 0) + r[campo]);
  return [...mapa.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([data, valor]) => ({ data, valor }));
}

function LineChart({ pontos, cor }: { pontos: { data: string; valor: number }[]; cor: string }) {
  const W = 600;
  const H = 180;
  const pad = 28;
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
  const W = 600;
  const H = 180;
  const pad = 28;
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

export function DashboardConversas({ registros }: { registros: Registro[] }) {
  const enviados = registros.reduce((s, r) => s + r.enviados, 0);
  const apoios = registros.reduce((s, r) => s + r.apoios, 0);
  const outras = registros.reduce((s, r) => s + r.outras_devolutivas, 0);
  const devolutivas = apoios + outras;
  const restr = registros.filter((r) => r.restricao).length;

  const cards = [
    { label: "Enviados", valor: fmt(enviados), hint: "no período" },
    { label: "Devolutivas", valor: fmt(devolutivas), hint: "positivos + outras" },
    { label: "Retornos positivos", valor: fmt(apoios), hint: pct(apoios, enviados) + " dos enviados" },
    { label: "Taxa de resposta", valor: pct(devolutivas, enviados), hint: "devolutivas / enviados" },
    { label: "Taxa de retorno positivo", valor: pct(apoios, enviados), hint: "positivos / enviados" },
    { label: "Restrições", valor: fmt(restr), hint: pct(restr, registros.length) + " dos turnos" },
  ];

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

      {registros.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-tinta-200 bg-white p-5 shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
            <p className="mb-2 text-sm font-semibold text-tinta-700">Enviados por dia</p>
            <LineChart pontos={porDia(registros, "enviados")} cor="#0525F7" />
          </div>
          <div className="rounded-xl border border-tinta-200 bg-white p-5 shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
            <p className="mb-2 text-sm font-semibold text-tinta-700">Retornos positivos por dia</p>
            <BarChart pontos={porDia(registros, "apoios")} cor="#C0EB02" />
          </div>
        </div>
      )}
    </div>
  );
}
