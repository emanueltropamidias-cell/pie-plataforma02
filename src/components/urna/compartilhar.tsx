"use client";

import { useState } from "react";

// Passar a página adiante.
//
// ── POR QUE ISTO É PARTE DA ESTRATÉGIA, E NÃO ENFEITE ───────────────────────
//
// Uma landing de campanha sem botão de passar adiante depende inteiramente de
// quem paga o anúncio: cada pessoa que chega custou dinheiro, e a próxima
// também.
//
// Este botão é o que transforma apoiador em distribuidor, e o momento é
// escolhido: ele aparece DEPOIS da urna e depois do convite, quando a pessoa
// acabou de digitar 1022 e está com o número na cabeça. É ali que ela manda
// para o grupo da família.
//
// O texto vai pronto de propósito. Pedir para alguém escrever a própria
// mensagem é pedir uma decisão, e decisão é onde a maioria desiste.

const TEXTO =
  "Treinei meu voto pra deputada federal e ficou fácil de lembrar: *1022*, Talita Oliveira.\n\n" +
  "Tem uma urna igualzinha à de verdade pra você treinar também — leva 10 segundos:\n" +
  "https://talitaoliveiraoficial.com/1022";

export function Compartilhar() {
  const [copiou, setCopiou] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(TEXTO);
      setCopiou(true);
      setTimeout(() => setCopiou(false), 2500);
    } catch {
      /* navegador sem permissão: o botão do WhatsApp ao lado continua valendo */
    }
  }

  return (
    <section className="bg-[#0a0d0b] px-5 py-11 sm:px-8">
      <div>
        <p className="text-[15.5px] font-bold text-white/90 sm:text-[17px]">
          Manda pra quem também vai votar
        </p>
        <p className="mt-1.5 max-w-[420px] text-[13.5px] leading-relaxed text-white/50">
          Cada pessoa que treina o voto é um voto que não se perde na urna.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {/* `wa.me/?text=` sem número abre o seletor de conversa do WhatsApp:
              a pessoa escolhe o grupo, e não precisamos saber para quem. */}
          <a
            href={`https://wa.me/?text=${encodeURIComponent(TEXTO)}`}
            target="_blank"
            rel="noopener"
            className="inline-flex h-12 items-center justify-center gap-2 border border-white/25 px-6 text-[14.5px] font-bold uppercase tracking-wide text-white transition-colors hover:border-[#FFDF00] hover:text-[#FFDF00]"
          >
            Enviar no WhatsApp
          </a>
          <button
            onClick={copiar}
            className="inline-flex h-12 items-center justify-center gap-2 border border-white/25 px-6 text-[14.5px] font-bold uppercase tracking-wide text-white transition-colors hover:border-[#FFDF00] hover:text-[#FFDF00]"
          >
            {copiou ? "Copiado ✓" : "Copiar a mensagem"}
          </button>
        </div>
      </div>
    </section>
  );
}
