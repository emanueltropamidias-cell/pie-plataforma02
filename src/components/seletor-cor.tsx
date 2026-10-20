"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";
import { CORES } from "./seletor-tema";

// Escolha de cor, versão enxuta — para telas sem menu lateral.
//
// O seletor da equipe também oferece o fundo da barra; aqui não existe barra,
// então oferecer a opção seria dar um botão que não muda nada visível.
//
// Guarda na mesma chave do outro (`pie_tema_cor`) de propósito: quem é liderança
// e também é da equipe escolhe a cor uma vez e vê a mesma nos dois lugares.

const CHAVE = "pie_tema_cor";

export function SeletorCor() {
  const [aberto, setAberto] = useState(false);
  const [cor, setCor] = useState<string>(CORES[0].hex);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const c = localStorage.getItem(CHAVE);
      if (c) setCor(c);
    } catch {
      /* navegador sem armazenamento: fica no padrão */
    }
  }, []);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  function escolher(hex: string) {
    setCor(hex);
    document.documentElement.style.setProperty("--tema", hex);
    try {
      localStorage.setItem(CHAVE, hex);
    } catch {}
  }

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label="Cor do painel"
        className="flex h-9 items-center gap-2 rounded-full border border-tinta-200 px-3 text-[12px] font-semibold text-tinta-500 transition-colors hover:border-tinta-300 hover:text-tinta-800"
      >
        <Palette size={15} strokeWidth={1.9} />
        <span className="hidden sm:inline">Cor</span>
        <span
          className="h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-black/15"
          style={{ background: cor }}
        />
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Cor do painel"
          className="absolute right-0 top-full z-50 mt-2 w-[224px] rounded-xl border border-tinta-200 bg-white p-4 shadow-[0_8px_28px_rgba(22,32,46,0.18)]"
        >
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-tinta-500">
            Cor do painel
          </p>
          <div className="mt-3 grid grid-cols-4 gap-x-2 gap-y-3">
            {CORES.map((c) => {
              const ativa = c.hex === cor;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => escolher(c.hex)}
                  title={c.nome}
                  className="flex flex-col items-center gap-1"
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full transition-transform ${
                      ativa ? "ring-2 ring-tinta-900 ring-offset-2" : "hover:scale-110"
                    }`}
                    style={{ background: c.hex }}
                  >
                    {ativa && <Check size={16} strokeWidth={3} className="text-white" />}
                  </span>
                  <span
                    className={`text-[9.5px] leading-tight ${
                      ativa ? "font-bold text-tinta-900" : "text-tinta-500"
                    }`}
                  >
                    {c.nome}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
