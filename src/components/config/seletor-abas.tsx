"use client";

import { Check } from "lucide-react";
import { ABAS, moduloAtivo, type Modulo } from "@/lib/modulos";

// As abas que a conta pode usar, para marcar.
//
// Usado na criação da conta e na lista de usuários. Só aparecem as abas que
// esta instalação usa (NEXT_PUBLIC_MODULOS_OCULTOS): marcar uma aba desligada
// não daria acesso a nada e confundiria quem marca.

export function SeletorAbas({
  marcadas,
  onMudar,
  compacto = false,
}: {
  marcadas: Modulo[];
  onMudar: (m: Modulo[]) => void;
  compacto?: boolean;
}) {
  const abas = ABAS.filter((a) => moduloAtivo(a.modulo));
  const todas = abas.every((a) => marcadas.includes(a.modulo));

  function alternar(m: Modulo) {
    onMudar(marcadas.includes(m) ? marcadas.filter((x) => x !== m) : [...marcadas, m]);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[11.5px] font-semibold text-tinta-600">Abas que pode usar</span>
        <button
          type="button"
          onClick={() => onMudar(todas ? [] : abas.map((a) => a.modulo))}
          className="text-[11.5px] font-semibold text-tema hover:underline"
        >
          {todas ? "Desmarcar todas" : "Marcar todas"}
        </button>
      </div>
      <div className={`mt-1 grid gap-1.5 ${compacto ? "grid-cols-2 sm:grid-cols-4" : "sm:grid-cols-2"}`}>
        {abas.map((a) => {
          const on = marcadas.includes(a.modulo);
          return (
            <button
              type="button"
              key={a.modulo}
              onClick={() => alternar(a.modulo)}
              aria-pressed={on}
              className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors ${
                on ? "border-tema bg-tema/10" : "border-tinta-200 hover:border-tinta-300"
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  on ? "border-tema bg-tema text-white" : "border-tinta-300 bg-white"
                }`}
              >
                {on && <Check size={11} strokeWidth={3} />}
              </span>
              <span className="min-w-0">
                <span className={`block text-[12.5px] font-semibold ${on ? "text-tema" : "text-tinta-700"}`}>
                  {a.rotulo}
                </span>
                {!compacto && <span className="block truncate text-[11px] text-tinta-400">{a.nota}</span>}
              </span>
            </button>
          );
        })}
      </div>
      {marcadas.length === 0 && (
        <p className="mt-1.5 text-[11px] text-[#c02020]">Marque pelo menos uma aba.</p>
      )}
    </div>
  );
}
