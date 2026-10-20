"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";

// Escolha de tema, guardada no próprio navegador.
//
// Não vai para o banco de propósito: é preferência de quem está na máquina, não
// dado da campanha. Assim cada pessoa da equipe ajusta a sua sem interferir na
// dos outros, e a escolha sobrevive ao logout.

// A cor de destaque: o que se clica e o que está selecionado. Nada mais.
//
// A primeira é a da marca e é o padrão. As outras existem porque a escolha é de
// quem passa o dia na tela — mas nenhuma delas pinta a barra lateral, e é essa
// separação que faz a plataforma continuar parecendo a mesma coisa depois que
// alguém mexe aqui.
export const CORES = [
  { id: "marca", nome: "Azul da marca", hex: "#0525F7" },
  { id: "esmeralda", nome: "Esmeralda", hex: "#0F7A3D" },
  { id: "violeta", nome: "Violeta", hex: "#5B34C9" },
  { id: "rosa", nome: "Rosa", hex: "#C2185B" },
  { id: "ambar", nome: "Âmbar", hex: "#8A6009" },
  { id: "ciano", nome: "Ciano", hex: "#0E7490" },
  { id: "laranja", nome: "Laranja", hex: "#C2410C" },
  { id: "grafite", nome: "Grafite", hex: "#3C3D45" },
] as const;

const CHAVE_COR = "pie_tema_cor";
const CHAVE_BARRA = "pie_tema_barra";

// O FUNDO DO MENU NÃO É MAIS A COR DO TEMA.
//
// Havia uma opção "Cor do tema" que pintava a barra lateral com o destaque
// escolhido — uma placa colorida de 260px encostada em toda tela, o dia
// inteiro. Ela competia com o conteúdo e ainda obrigava o resto da paleta a
// combinar com ela. Grafite é o padrão agora; preto e claro continuam para
// quem prefere.
export type Fundo = "grafite" | "escuro" | "claro";

/** "cor" era a opção antiga, e ainda está no navegador de quem já usou. */
function migrar(v: string | null): Fundo {
  return v === "escuro" || v === "claro" ? v : "grafite";
}

export function aplicarTema(hex: string, barra: Fundo) {
  const raiz = document.documentElement;
  raiz.style.setProperty("--tema", hex);
  raiz.setAttribute("data-barra", barra);
}

export function SeletorTema({ recolhido = false }: { recolhido?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [cor, setCor] = useState<string>(CORES[0].hex);
  const [barra, setBarra] = useState<Fundo>("grafite");
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const c = localStorage.getItem(CHAVE_COR) || CORES[0].hex;
      const b = migrar(localStorage.getItem(CHAVE_BARRA));
      setCor(c);
      setBarra(b);
      aplicarTema(c, b);
    } catch {
      aplicarTema(CORES[0].hex, "grafite");
    }
  }, []);

  // Fecha ao clicar fora ou apertar Esc — comportamento esperado de menu.
  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node))
        setAberto(false);
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
    aplicarTema(hex, barra);
    try {
      localStorage.setItem(CHAVE_COR, hex);
    } catch {}
  }

  function escolherBarra(v: Fundo) {
    setBarra(v);
    aplicarTema(cor, v);
    try {
      localStorage.setItem(CHAVE_BARRA, v);
    } catch {}
  }

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
            <span
              className="ml-auto h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-black/15 shadow-sm"
              style={{ background: cor }}
            />
          </>
        )}
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Aparência"
          className="absolute bottom-full left-0 z-50 mb-2 w-[240px] rounded-lg border border-white/10 bg-[#0c101c]/95 backdrop-blur-2xl p-4 shadow-[0_16px_40px_rgba(0,0,0,0.6)] text-white"
        >
          <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-cyan-400">
            Cor do tema
          </p>
          <div className="mt-3 grid grid-cols-4 gap-x-2 gap-y-3">
            {CORES.map((c) => {
              const ativa = c.hex === cor;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => escolherCor(c.hex)}
                  title={c.nome}
                  className="flex flex-col items-center gap-1"
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition-transform ${
                      ativa ? "ring-2 ring-white ring-offset-2 ring-offset-[#0c101c] scale-105" : "hover:scale-110"
                    }`}
                    style={{
                      background: c.hex,
                    }}
                  >
                    {ativa && (
                      <Check size={14} strokeWidth={3} className="text-white" />
                    )}
                  </span>
                  <span
                    className={`text-[9.5px] leading-tight ${
                      ativa ? "font-bold text-white" : "text-zinc-400"
                    }`}
                  >
                    {c.nome}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-4 text-[10.5px] font-bold uppercase tracking-[0.14em] text-cyan-400">
            Fundo do menu
          </p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {(
              [
                { id: "grafite", nome: "Grafite", fundo: "#121622" },
                { id: "escuro", nome: "Preto", fundo: "#05070c" },
                { id: "claro", nome: "Claro", fundo: "#ffffff" },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => escolherBarra(f.id)}
                className={`flex flex-col items-center gap-1.5 rounded-md border px-1.5 py-2 text-[10px] font-semibold transition-all ${
                  barra === f.id
                    ? "border-cyan-400 bg-white/10 text-white shadow-sm"
                    : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-white"
                }`}
              >
                <span
                  className="h-4 w-full rounded ring-1 ring-inset ring-white/10"
                  style={{ background: f.fundo }}
                />
                {f.nome}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
