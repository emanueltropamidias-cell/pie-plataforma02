"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Moon, Palette, Sun } from "lucide-react";

// Escolha de aparência, guardada no próprio navegador.
//
// Não vai para o banco de propósito: é preferência de quem está na máquina, não
// dado da campanha. Assim cada pessoa da equipe ajusta a sua sem interferir na
// dos outros, e a escolha sobrevive ao logout.
//
// ── MODO ESCURO E CLARO (identidade ManuFlow, 20/10/2026) ────────────────────
//
// Escuro com vidro é o padrão; claro com menu preto é a alternativa. O modo
// substituiu a antiga opção "Fundo do menu" (grafite/preto/claro): cada modo
// já traz o menu que combina com ele, e menu claro em cima de conteúdo escuro
// não era uma combinação que alguém deveria precisar evitar sozinho.
//
// O atributo vai no <html> antes da primeira pintura (src/app/layout.tsx); as
// cores de cada modo estão em src/app/globals.css.

// A cor de destaque: o que se clica e o que está selecionado. Nada mais.
// A primeira é a da marca e é o padrão.
export const CORES = [
  { id: "marca", nome: "Azul ManuFlow", hex: "#3B6CFF" },
  { id: "violeta", nome: "Violeta", hex: "#7C5CFF" },
  { id: "esmeralda", nome: "Esmeralda", hex: "#0F9F5B" },
  { id: "rosa", nome: "Rosa", hex: "#DB2777" },
  { id: "ambar", nome: "Âmbar", hex: "#D97706" },
  { id: "ciano", nome: "Ciano", hex: "#0891B2" },
  { id: "laranja", nome: "Laranja", hex: "#EA580C" },
  { id: "grafite", nome: "Grafite", hex: "#52535C" },
] as const;

const CHAVE_COR = "pie_tema_cor";
const CHAVE_MODO = "pie_tema_modo";

export type Modo = "escuro" | "claro";

export function aplicarTema(hex: string, modo: Modo) {
  const raiz = document.documentElement;
  raiz.style.setProperty("--tema", hex);
  raiz.setAttribute("data-tema", modo);
}

export function SeletorTema({ recolhido = false }: { recolhido?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [cor, setCor] = useState<string>(CORES[0].hex);
  const [modo, setModo] = useState<Modo>("escuro");
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const c = localStorage.getItem(CHAVE_COR);
      if (c) setCor(c);
      setModo(localStorage.getItem(CHAVE_MODO) === "claro" ? "claro" : "escuro");
    } catch {
      /* navegador sem armazenamento: fica no padrão */
    }
  }, []);

  // Fecha ao clicar fora ou apertar Esc — comportamento esperado de menu.
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

  function escolherCor(hex: string) {
    setCor(hex);
    aplicarTema(hex, modo);
    try {
      localStorage.setItem(CHAVE_COR, hex);
    } catch {}
  }

  function escolherModo(m: Modo) {
    setModo(m);
    aplicarTema(cor, m);
    try {
      localStorage.setItem(CHAVE_MODO, m);
    } catch {}
  }

  const IconeModo = modo === "escuro" ? Moon : Sun;

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        title={recolhido ? "Aparência" : undefined}
        className={`flex w-full items-center gap-2.5 rounded-lg py-2 text-[13px] font-medium text-barra-suave transition-colors hover:bg-barra-hover hover:text-barra-texto ${
          recolhido ? "justify-center px-0" : "px-2.5"
        }`}
      >
        <Palette size={16} strokeWidth={1.9} className="shrink-0" />
        {!recolhido && (
          <>
            Aparência
            <IconeModo size={14} className="ml-auto opacity-70" aria-hidden />
            <span className="h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-black/15" style={{ background: cor }} />
          </>
        )}
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Aparência"
          className="absolute bottom-full left-0 z-50 mb-2 w-[244px] rounded-xl border border-tinta-200 bg-white p-4 shadow-[0_12px_32px_rgba(0,0,0,0.28)]"
        >
          <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-tinta-500">Modo</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {(
              [
                { id: "escuro", nome: "Escuro", Icone: Moon, amostra: "linear-gradient(135deg,#080b14,#1a2240)" },
                { id: "claro", nome: "Claro", Icone: Sun, amostra: "linear-gradient(90deg,#0b0d12 0 30%,#f6f4f0 30%)" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => escolherModo(m.id)}
                aria-pressed={modo === m.id}
                className={`flex flex-col items-center gap-1.5 rounded-lg border px-1.5 py-2 text-[11px] font-semibold transition-colors ${
                  modo === m.id ? "border-tema text-tinta-900" : "border-tinta-200 text-tinta-500 hover:border-tinta-300"
                }`}
              >
                <span className="h-7 w-full rounded ring-1 ring-inset ring-black/10" style={{ background: m.amostra }} />
                <span className="flex items-center gap-1">
                  <m.Icone size={12} aria-hidden />
                  {m.nome}
                </span>
              </button>
            ))}
          </div>

          <p className="mt-4 text-[10.5px] font-bold uppercase tracking-[0.12em] text-tinta-500">Cor de destaque</p>
          <div className="mt-3 grid grid-cols-4 gap-x-2 gap-y-3">
            {CORES.map((c) => {
              const ativa = c.hex.toLowerCase() === cor.toLowerCase();
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => escolherCor(c.hex)}
                  title={c.nome}
                  aria-pressed={ativa}
                  className="flex flex-col items-center gap-1"
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full transition-transform ${
                      ativa ? "ring-2 ring-tinta-300 ring-offset-2 ring-offset-transparent" : "hover:scale-110"
                    }`}
                    style={{ background: c.hex }}
                  >
                    {ativa && <Check size={16} strokeWidth={3} className="text-white" />}
                  </span>
                  <span className={`text-[9.5px] leading-tight ${ativa ? "font-bold text-tinta-900" : "text-tinta-500"}`}>
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
