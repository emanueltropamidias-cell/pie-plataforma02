"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

// O botão que puxa as conversas do GabiFlow.
//
// Existe porque a alternativa era pedir para alguém abrir uma URL de API no
// navegador — e a rota é POST, então nem abrindo funcionaria. Quem opera a
// campanha não deveria precisar saber o que é POST.
//
// Ele encadeia as duas fases sozinho: primeiro traz as conversas (rápido),
// depois lê as mensagens em lotes até acabar. A contagem aparece no botão para
// a espera ter um número em vez de uma ampulheta.

type Estado = { fase: string; feitas: number; faltam: number | null };

export function BotaoSincronizar({ primeiraVez }: { primeiraVez: boolean }) {
  const router = useRouter();
  const [rodando, setRodando] = useState(false);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Lê a resposta como TEXTO antes de tentar virar JSON.
  //
  // Quando a função na Vercel estoura o tempo ou morre, o corpo volta vazio ou
  // como página de erro, e um `.json()` direto rebenta com "Unexpected end of
  // JSON input" — mensagem que esconde justamente o que interessa, o código
  // HTTP. Aqui o código sempre aparece.
  async function chamar(fase: string, lote = 25) {
    const r = await fetch(`/api/atendimento/sync?fase=${fase}&lote=${lote}`, { method: "POST" });
    const corpo = await r.text();

    if (!corpo) {
      throw new Error(
        r.status === 504
          ? `A sincronização passou do tempo limite (HTTP 504) na fase "${fase}". Tente de novo: ela continua de onde parou.`
          : `O servidor respondeu HTTP ${r.status} sem conteúdo na fase "${fase}".`,
      );
    }

    let j: { erro?: string; [k: string]: unknown };
    try {
      j = JSON.parse(corpo);
    } catch {
      throw new Error(`HTTP ${r.status} — resposta inesperada: ${corpo.slice(0, 120)}`);
    }
    if (!r.ok) throw new Error(j.erro ?? `Falhou com HTTP ${r.status}`);
    return j as { conversas?: number; classificadas?: number; faltam?: number };
  }

  async function sincronizar() {
    setRodando(true);
    setErro(null);
    try {
      const c = await chamar("conversas");
      setEstado({ fase: "conversas", feitas: c.conversas ?? 0, faltam: null });

      // Lê as mensagens em rodadas. O teto de 40 rodadas é um freio contra
      // laço infinito — se a API parar de diminuir a fila, é melhor terminar e
      // deixar a pessoa clicar de novo do que rodar para sempre.
      for (let volta = 0; volta < 40; volta++) {
        const m = await chamar("mensagens");
        setEstado({
          fase: "mensagens",
          feitas: m.classificadas ?? 0,
          faltam: m.faltam ?? 0,
        });
        if (!m.classificadas || !m.faltam) break;
      }
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui sincronizar.");
    } finally {
      setRodando(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        onClick={sincronizar}
        disabled={rodando}
        className="inline-flex items-center gap-2 rounded-lg bg-tema px-4 py-2.5 text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <RefreshCw size={15} className={rodando ? "animate-spin" : undefined} />
        {rodando
          ? estado?.fase === "mensagens"
            ? `Lendo conversas… faltam ${estado.faltam ?? "?"}`
            : "Trazendo conversas…"
          : primeiraVez
            ? "Trazer as conversas do GabiFlow"
            : "Atualizar"}
      </button>

      {erro && (
        <p className="max-w-sm text-right text-[11.5px] leading-snug text-red-600">{erro}</p>
      )}
      {!erro && !rodando && estado && (
        <p className="text-[11.5px] text-tinta-400">
          Pronto. Recarregue se os números não mudarem sozinhos.
        </p>
      )}
    </div>
  );
}
