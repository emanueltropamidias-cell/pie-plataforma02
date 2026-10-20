// O número que atende a campanha, num lugar só.
//
// Ele estava escrito na mão em dois arquivos — a página /c/[code] e o card do
// QR. Trocar o número em um e esquecer o outro mandaria metade das pessoas para
// um telefone que ninguém atende, e isso não aparece em teste nenhum: os dois
// links continuam válidos, só levam para lugares diferentes.
//
// Hoje o valor mora em `candidato.ts`, junto com o resto da identidade da
// campanha, e vem de `NEXT_PUBLIC_WA_NUMERO` — que NÃO tem valor padrão. O
// porquê está lá.

import { CANDIDATO, mensagemDeEntrada } from "@/lib/candidato";

export const WA_NUMERO = CANDIDATO.whatsapp;

export { mensagemDeEntrada };

/**
 * Link direto da API do WhatsApp, sem passar pelo wa.me.
 *
 * O wa.me é só um encurtador que redireciona para cá, e cada salto a mais no
 * caminho é um motivo a mais para o WhatsApp desconfiar da origem.
 */
/**
 * O link da campanha SEM frase escrita — para compartilhar.
 *
 * `linkWhatsApp()` sempre leva um texto pronto, e o padrão dele é "Vim pelo QR
 * code". Isso está certo no QR e está errado no encaminhamento: quem recebe o
 * link de um amigo não veio de QR nenhum, e chega dizendo que veio.
 *
 * Sem texto o link também fica CURTO, o que importa numa mensagem que vai ser
 * encaminhada: endereço de três linhas com `%3F` e `%2C` no meio parece golpe,
 * e a pessoa não clica.
 */
export function linkParaCompartilhar() {
  return `https://api.whatsapp.com/send?phone=${WA_NUMERO}`;
}

export function linkWhatsApp(nome?: string | null, textoPronto?: string) {
  const p = new URLSearchParams({
    phone: WA_NUMERO,
    // Texto pronto vence o padrão: quando a liderança tem frase própria, ela é
    // a frase — não um prefixo com o crédito de indicação colado atrás.
    text: textoPronto?.trim() || mensagemDeEntrada(nome),
    type: "phone_number",
    app_absent: "0",
  });
  return `https://api.whatsapp.com/send?${p.toString()}`;
}
