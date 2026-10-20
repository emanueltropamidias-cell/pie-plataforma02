"use client";

import type { ReactNode } from "react";

// O painel que abre a partir da barra de escrever.
//
// ── POR QUE ELE VINHA CORTADO NO CELULAR ────────────────────────────────────
//
// Era um `absolute` ancorado no botão, subindo a partir da barra. No computador
// funciona: sobra tela acima. No celular não sobra — a barra de escrever está no
// rodapé, a conversa ocupa o resto, e o `<main>` tem `h-dvh overflow-y-auto`.
// Um painel mais alto que o espaço livre é CORTADO por esse overflow, e a
// pessoa perde justamente os itens de baixo da lista.
//
// Piora com o teclado aberto: a área visível encolhe pela metade e o painel
// vira uma fresta.
//
// ── A CORREÇÃO É MUDAR DE FORMA, NÃO DE TAMANHO ─────────────────────────────
//
// No celular ele deixa de ser balão e vira GAVETA: `fixed` no rodapé, largura
// inteira, altura limitada a 75% da tela, com um véu atrás. `fixed` sai do
// fluxo do `<main>` e não tem como ser cortado por overflow nenhum.
//
// No computador continua sendo o balão de sempre — lá ele nunca teve problema,
// e gaveta numa tela de 27 polegadas seria um exagero.

export function PainelDaBarra({
  titulo,
  aoFechar,
  children,
  rodape,
  /** Largura do balão no computador. A gaveta ignora — ela é sempre inteira. */
  largura = "22rem",
  /**
   * De que lado do botão o balão abre, no computador.
   *
   * Era sempre pela direita, e funcionava enquanto todos os botões moravam no
   * canto direito da barra de digitar. Quando Kit e Áudio subiram para uma
   * linha própria, à ESQUERDA, `right-0` passou a jogar um balão de 23rem para
   * fora da tela — ele alinha a borda direita do balão com a do botão, e o
   * resto vai para o lado de fora.
   *
   * O padrão continua "direita" porque é onde o emoji ficou.
   */
  ancora = "direita",
}: {
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: string;
  ancora?: "esquerda" | "direita";
}) {
  return (
    <>
      {/* O véu só existe no celular. Ele fecha ao toque e, mais importante,
          impede o dedo de acertar a conversa por trás da gaveta. */}
      <button
        aria-label="Fechar"
        onClick={aoFechar}
        className="fixed inset-0 z-40 bg-tinta-900/30 sm:hidden"
      />

      <div
        style={{ ["--largura" as string]: largura }}
        className={[
          // ── celular: gaveta ──
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[75dvh] flex-col",
          "rounded-t-2xl border-t border-tinta-200 bg-white shadow-2xl",
          // O respiro do iPhone, senão o último item fica embaixo da barrinha.
          "pb-[max(0.5rem,env(safe-area-inset-bottom))]",
          // ── computador: o balão de sempre ──
          "sm:absolute sm:inset-x-auto sm:bottom-[42px]",
          ancora === "esquerda" ? "sm:left-0" : "sm:right-0",
          "sm:max-h-[320px] sm:w-[var(--largura)] sm:rounded-xl sm:border",
          "sm:pb-0 sm:shadow-xl",
        ].join(" ")}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-tinta-100 px-3 py-3 sm:py-2.5">
          <span className="text-[13.5px] font-bold text-tinta-900 sm:text-[12.5px]">
            {titulo}
          </span>
          <button
            onClick={aoFechar}
            aria-label="Fechar"
            // Alvo de 32px: no celular o X de 16px é difícil de acertar.
            className="-mr-1 flex h-8 w-8 items-center justify-center rounded-lg text-tinta-400 hover:bg-tinta-100 hover:text-tinta-700"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* `min-h-0` para a lista rolar por dentro em vez de esticar a gaveta. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>

        {rodape && (
          <div className="shrink-0 border-t border-tinta-100 px-3 py-2 text-[11px] leading-relaxed text-tinta-400 sm:text-[10.5px]">
            {rodape}
          </div>
        )}
      </div>
    </>
  );
}
