"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

function hojeISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function isoMenos(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function dataBR(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

// ── DOIS FORMATOS DE ATALHO, E A DIFERENCA IMPORTA ──────────────────────────
//
// "7 dias" e uma JANELA QUE TERMINA HOJE: de sete dias atras ate agora.
// "Ontem" e um DIA FECHADO: comeca e termina no mesmo dia.
//
// Misturar os dois no mesmo formato foi o que faltava aqui — por isso nao
// existia "Ontem": a lista so sabia contar para tras a partir de hoje, e
// "1 dia" teria devolvido de ontem ATE hoje, somando os dois dias.
//
// Ontem fechado e o numero que se leva para reuniao: o dia inteiro, ja
// terminado, sem a parte de hoje que ainda esta acontecendo e so cresce.
const PRESETS = [
  { id: "hoje", label: "Hoje", de: 0, ate: 0 },
  { id: "ontem", label: "Ontem", de: 1, ate: 1 },
  { id: "7", label: "7 dias", de: 7, ate: 0 },
  { id: "30", label: "30 dias", de: 30, ate: 0 },
  { id: "90", label: "90 dias", de: 90, ate: 0 },
];

export function FiltroPeriodo({
  ini,
  fim,
  onChange,
  inicial = "tudo",
}: {
  ini: string;
  fim: string;
  onChange: (ini: string, fim: string) => void;
  inicial?: string;
}) {
  const [ativo, setAtivo] = useState<string>(inicial);

  function preset(id: string, de: number, ate: number) {
    setAtivo(id);
    onChange(isoMenos(de), isoMenos(ate));
  }

  const btn = (a: boolean) =>
    `rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
      a ? "bg-tema text-white" : "text-tinta-600 hover:bg-tinta-100"
    }`;

  const label = ativo === "tudo" ? "todo o período" : ini && fim ? `${dataBR(ini)} a ${dataBR(fim)}` : "";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-tinta-200 bg-white p-1">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" onClick={() => preset(p.id, p.de, p.ate)} className={btn(ativo === p.id)}>
            {p.label}
          </button>
        ))}
        <button type="button" onClick={() => { setAtivo("tudo"); onChange("", ""); }} className={btn(ativo === "tudo")}>
          Tudo
        </button>
        <button type="button" onClick={() => setAtivo("custom")} className={btn(ativo === "custom")}>
          Personalizado
        </button>
        {ativo === "custom" && (
          <div className="flex items-center gap-1 pl-1">
            <Input type="date" value={ini} onChange={(e) => onChange(e.target.value, fim)} className="h-8 w-auto" />
            <span className="text-[12px] text-tinta-400">até</span>
            <Input type="date" value={fim} onChange={(e) => onChange(ini, e.target.value)} className="h-8 w-auto" />
          </div>
        )}
      </div>
      {label && <span className="pl-1 text-[11px] text-tinta-400">Mostrando: {label}</span>}
    </div>
  );
}
