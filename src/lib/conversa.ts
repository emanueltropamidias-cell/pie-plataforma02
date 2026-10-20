// As contas de uma conversa: quanto tempo faz, como isso se escreve na tela e
// se alguém está esperando.
//
// Moram fora dos componentes porque a caixa de entrada e a supervisão precisam
// responder IGUAL. Duas telas que discordam sobre o que é "não atendido"
// produzem duas verdades sobre a mesma equipe — e a supervisora acaba cobrando
// um número que a atendente não vê.

import type { Conversa } from "@/components/caixa/caixa-client";

// ── tempo ───────────────────────────────────────────────────────────────────

export function horasDesde(iso: string | null): number {
  if (!iso) return 0;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

/** "4 h 12", "18 min", "3 d" — curto, porque vai numa lista apertada. */
export function duracao(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 24) return `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
  return `${Math.floor(h / 24)} d`;
}

export function hora(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  if (mesmoDia) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const ontem = new Date(hoje.getTime() - 86_400_000);
  if (d.toDateString() === ontem.toDateString()) return "ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * O estado de espera de uma conversa.
 *
 * Separa os dois casos que o painel já distinguia e que a fila precisa mostrar
 * com peso diferente:
 *
 *   nao_atendido — ninguém da equipe respondeu ainda. Falha nossa, e o número
 *                  que manda contratar mais uma atendente. Vai para o topo.
 *   aguardando   — a bola está com a gente numa conversa já iniciada.
 *
 * Disparo nunca entra em nenhum dos dois: ninguém estava esperando resposta.
 */
export function espera(c: Conversa): { estado: "nao_atendido" | "aguardando" | "ok"; horas: number } {
  if (c.encerrada_em || c.tipo === "disparo") return { estado: "ok", horas: 0 };
  if (!c.primeira_resp_at && c.primeira_msg_at) {
    return { estado: "nao_atendido", horas: horasDesde(c.primeira_msg_at) };
  }
  if (c.ultima_direcao === "inbound") {
    return { estado: "aguardando", horas: horasDesde(c.ultima_msg_at) };
  }
  return { estado: "ok", horas: 0 };
}

/**
 * A conversa que chegou sem telefone.
 *
 * Acontece quando a sessão cai e as conversas voltam pelo history sync: o
 * WhatsApp entrega o identificador anônimo e guarda o número. O endereço fica
 * `lid.143417564733621`. Ver `supabase/historico/conversa-por-lid.sql`.
 */
export function semTelefone(t: string | null | undefined): boolean {
  return !!t && t.startsWith("lid.");
}

export function iniciais(nome: string | null, telefone: string): string {
  const n = (nome ?? "").trim();
  if (!n) return semTelefone(telefone) ? "?" : telefone.slice(-2);
  const p = n.split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

export function telefoneBonito(t: string): string {
  // Quinze dígitos formatados como "(14) 34175-64733621" seriam lidos como
  // telefone quebrado, e alguém ia tentar corrigir na mão um número que não
  // existe. Melhor dizer o que é.
  if (semTelefone(t)) return "sem telefone ainda";
  const d = t.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}
