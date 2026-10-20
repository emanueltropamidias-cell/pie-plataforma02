import crypto from "node:crypto";

// Quem abriu o link do QR — o suficiente para contar gente, e nada além.
//
// ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
//
// A contagem de leitura do QR era uma linha por abertura. "57 leituras" parecia
// 57 pessoas e não era: o robô de prévia do WhatsApp abre o link quando alguém
// compartilha, a pessoa toca duas vezes achando que não pegou, e a mesma
// pessoa escaneia de novo no dia seguinte.
//
// Nos dados de hoje há dez casos de DUAS aberturas no mesmo minuto. Num número
// pequeno como 57, isso é a diferença entre um material que funcionou e um que
// pareceu funcionar — e é esse número que vai para a reunião com o parceiro.

/**
 * Robôs que abrem o link para montar a prévia.
 *
 * Eles não são gente e chegam ANTES de qualquer humano: basta alguém colar o
 * endereço num grupo para o WhatsApp, o Facebook e o Telegram abrirem cada um
 * o seu. Três aberturas, zero pessoas.
 */
const ROBOS =
  /bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|twitter|linkedin|embedly|curl|wget|python|node-fetch|headless/i;

export function ehRobo(agente: string | null | undefined): boolean {
  return ROBOS.test(agente ?? "");
}

/**
 * A impressão de quem abriu: um hash de rede + navegador.
 *
 * ── O IP NÃO É GUARDADO, E ISSO É DE PROPÓSITO ────────────────────────────
 *
 * Para contar gente repetida basta saber que duas aberturas BATEM entre si —
 * não é preciso saber de onde vieram. Guardar o endereço de quem escaneia um
 * santinho é dado que a campanha não precisa ter, e que, tendo, passa a
 * precisar proteger.
 *
 * O sal fixo impede que o hash seja revertido por tentativa: sem ele, quem
 * tivesse a tabela poderia testar todos os IPs possíveis e descobrir os
 * originais, porque o espaço é pequeno.
 *
 * ── É APROXIMAÇÃO, E A TELA DIZ ISSO ──────────────────────────────────────
 *
 * Quem escaneia no wifi de casa e depois no 4G aparece como duas pessoas. Duas
 * pessoas na mesma rede aparecem como uma. Para material impresso, erra bem
 * menos que contar abertura — mas não é censo, e o número na tela vem escrito
 * como aproximado.
 */
export function impressaoDe(req: Request): string {
  const h = req.headers;
  // `x-forwarded-for` traz a cadeia inteira quando há proxy; o primeiro é o
  // cliente. Na Vercel o `x-real-ip` já vem resolvido.
  const rede =
    (h.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    h.get("x-real-ip") ||
    "";
  const agente = h.get("user-agent") ?? "";
  const sal = process.env.EVOLUTION_WEBHOOK_SEGREDO ?? "pie";

  return crypto
    .createHash("sha256")
    .update(`${sal}|${rede}|${agente}`)
    .digest("hex")
    .slice(0, 32);
}
