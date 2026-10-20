// Caminho RELATIVO e com a extensão, e não o atalho `@/`.
//
// Este arquivo é importado por `scripts/puxar-agenda.mjs`, que roda no Node
// puro — e o Node não conhece o `@/`, que é coisa do bundler do Next. Em
// 01/10 a unificação da lista de DDD trouxe o primeiro import para cá e
// derrubou o script com ERR_MODULE_NOT_FOUND. Antes não havia import nenhum,
// então nada denunciava a diferença.
import { DDDS } from "./telefone.ts";

// A regra que transforma contato de agenda do WhatsApp em telefone usável.
//
// ── POR QUE ISTO MORA AQUI, E NÃO NO SCRIPT ─────────────────────────────────
//
// Nasceu dentro de `scripts/puxar-agenda.mjs`. Quando a tela de Base ganhou o
// mesmo recurso (28/09), copiar a função para lá criaria a SEGUNDA regra de
// telefone da plataforma — e o mesmo fato escrito em dois lugares sempre
// desencontra. O script passa a importar daqui.
//
// ── O NONO DÍGITO ───────────────────────────────────────────────────────────
//
// O WhatsApp guarda número brasileiro no formato ANTIGO, de 8 dígitos, para a
// maioria dos contatos: dos 21.301 da primeira medição, só 840 vinham
// completos. Acrescentar o 9 é conversão DETERMINÍSTICA — a Anatel o
// acrescentou a todo celular — e não chute. Mas só vale quando o primeiro
// dígito do número local é 6, 7, 8 ou 9: de 2 a 5 é telefone fixo, que não
// recebe WhatsApp e fica de fora.
//
// ── TODA RECUSA É CONTADA, NENHUMA É SILENCIOSA ─────────────────────────────
//
// A função devolve o motivo em vez de `null`. Descarte sem motivo vira número
// que some da conta sem ninguém saber por quê — e aí a diferença entre o que
// entrou e o que apareceu não tem explicação.

/**
 * DDDs que existem no Brasil. Fora desta lista é lixo de agenda.
 *
 * A lista mora em `telefone.ts`, que é quem valida o que a equipe digita.
 * Estava escrita aqui TAMBÉM, idêntica — e duas cópias da mesma lista sempre
 * desencontram: bastava a Anatel criar um DDD para a agenda aceitar o que o
 * cadastro recusa, ou o contrário. O nome daqui fica, porque este arquivo
 * inteiro fala dele.
 */
export const DDD_BR = DDDS;

/** DDDs da Bahia. */
export const DDD_BA = new Set(["71", "73", "74", "75", "77"]);

export type Normalizado =
  | { fone: string; convertido: boolean; erro?: undefined }
  | { erro: string; fone?: undefined; convertido?: undefined };

/**
 * `5571988887777@s.whatsapp.net` → `{ fone: "71988887777" }`
 *
 * Devolve DDD + número local com 11 dígitos, sem o 55 — o mesmo formato que
 * `base_externa_gravar` aceita e que `fone_canonico` produz.
 */
export function normalizarContato(jid: string): Normalizado {
  const d = String(jid).replace(/\D/g, "");
  if (!d.startsWith("55")) return { erro: "não é do Brasil" };
  const n = d.slice(2);

  if (n.length === 11) {
    return n[2] === "9"
      ? { fone: n, convertido: false }
      : { erro: "11 dígitos sem o 9" };
  }
  if (n.length === 10) {
    const ddd = Number(n.slice(0, 2));
    const local = n.slice(2);
    if (!DDD_BR.has(ddd)) return { erro: `DDD ${ddd} não existe` };
    if (!"6789".includes(local[0])) return { erro: "telefone fixo" };
    return { fone: n.slice(0, 2) + "9" + local, convertido: true };
  }
  return { erro: `${n.length} dígitos` };
}

/** O nome da instância temporária de um aparelho convidado.
 *
 *  O prefixo não é enfeite: é o que permite apagar instância de agenda sem
 *  nunca encostar num chip da campanha. Nenhuma rotina de limpeza daqui toca
 *  em nome que não comece com ele. */
export const PREFIXO_AGENDA = "agenda_";

export function nomeDeInstancia(apelido: string): string {
  const limpo = apelido
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
  return PREFIXO_AGENDA + (limpo || "sem_nome") + "_" + Date.now().toString(36).slice(-4);
}

export function ehInstanciaDeAgenda(nome: string): boolean {
  return nome.startsWith(PREFIXO_AGENDA);
}
