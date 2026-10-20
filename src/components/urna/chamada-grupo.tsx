"use client";

import { useEffect, useRef, useState } from "react";

import { evento } from "@/components/meta/pixel";
import { contarCliqueNoGrupo } from "@/components/urna/contar-clique";

// A chamada para o grupo, que acende depois do voto.
//
// ── O MOMENTO É O PONTO ─────────────────────────────────────────────────────
//
// 29/09, Emanuel: "depois que a pessoa votar na urna digital, ela já vai pra
// parte do grupo. Um botão pulsando."
//
// Ele está descrevendo o único instante da página em que a pessoa não tem o
// que fazer em seguida: acabou de digitar 1022, ouviu o FIM, e a tela parou.
// Antes disso um convite compete com a urna; depois dela, ele é a continuação
// natural do gesto.
//
// Por isso a barra não existe até o voto sair — e quando sai, ela sobe da base
// da tela e fica. Não é enfeite: é onde o polegar já está.
//
// ── O PULSO TEM LIMITE, E ISSO É DE PROPÓSITO ───────────────────────────────
//
// Pisca por alguns segundos e para. Elemento que pulsa para sempre vira ruído
// de fundo — o olho aprende a ignorar em dez segundos, e aí ele perdeu o
// trabalho de chamar atenção justamente quando mais precisava.
//
// E respeita `prefers-reduced-motion`: para quem marcou isso no aparelho, a
// animação é sintoma, não recurso.

export function ChamadaGrupo({ href, visivel }: { href: string; visivel: boolean }) {
  const [pulsando, setPulsando] = useState(false);
  const jaApareceu = useRef(false);

  useEffect(() => {
    if (!visivel || jaApareceu.current) return;
    jaApareceu.current = true;
    setPulsando(true);
    const t = setTimeout(() => setPulsando(false), 6000);
    return () => clearTimeout(t);
  }, [visivel]);

  if (!visivel) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t-4 border-[#009C3B] bg-[#FFDF00] px-4 py-3 shadow-[0_-8px_32px_rgba(0,0,0,0.45)] sm:px-6 sm:py-4">
      <a
        href={href}
        target="_blank"
        rel="noopener"
        // O MESMO `Lead` do botão do meio da página, de propósito. São dois
        // caminhos para o mesmo grupo, e separá-los em dois eventos partiria a
        // conversão em dois números pela metade — cada um deles fraco demais
        // para a Meta aprender com ele.
        onClick={() => {
          evento("Lead");
          // "barra", e não "botao": é a única forma de saber se esta barra
          // pulsante ganha o lugar que ocupa na tela, ou se a pessoa desceria
          // até o botão do meio de qualquer jeito.
          contarCliqueNoGrupo("barra");
        }}
        className={`mx-auto flex max-w-[620px] items-center gap-3 ${pulsando ? "animate-[pulsa_1.1s_ease-in-out_infinite]" : ""}`}
      >
        <svg viewBox="0 0 24 24" width="30" height="30" className="shrink-0 text-[#0a0d0b]" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 2a10 10 0 0 0-8.7 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-1.7-.1-.4-.1-1-.3-1.6-.6-2.9-1.2-4.7-4.1-4.9-4.3-.1-.2-1.1-1.5-1.1-2.8s.7-2 .9-2.2c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.5.1.3.7 1.1 1.5 1.8 1 .9 1.8 1.1 2 1.2.3.1.4.1.6-.1l.7-.8c.2-.2.3-.2.6-.1l1.8.9c.3.1.4.2.5.3.1.2.1.7-.1 1.2Z"
          />
        </svg>
        <span className="min-w-0 flex-1 text-[#0a0d0b]">
          <span className="block text-[12px] font-extrabold uppercase leading-tight tracking-[0.14em]">
            Eiii patriota, entre no grupo
          </span>
          <span className="cartaz block text-[19px] uppercase leading-[1.05] tracking-tight sm:text-[23px]">
            Patriotas da Bahia com Talita e Flávio
          </span>
        </span>
        <span className="cartaz shrink-0 bg-[#0a0d0b] px-3 py-2 text-[17px] leading-none text-[#FFDF00] sm:text-[20px]">
          1022 · 22
        </span>
      </a>
    </div>
  );
}
