// Os atalhos que a frase pronta entende: {{nome}}, {{whatsapp}}, {{link}}…
//
// ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
//
// A frase pronta é escrita UMA vez e enviada para milhares de pessoas. Sem
// atalho ela é igual para todo mundo, e mensagem igual para todo mundo é o que
// a pessoa lê como propaganda. Com atalho, a mesma frase chega com o primeiro
// nome de quem está lendo e com o link certo daquela conversa.
//
// ── A DUPLICATA QUE ISTO FECHA ──────────────────────────────────────────────
//
// A troca de `{{nome}}` estava escrita em TRÊS lugares: uma vez na rota de
// material e duas na de kit. Três cópias da mesma regra é o defeito que esta
// base já teve várias vezes — a hora em que alguém acrescenta um atalho novo em
// duas delas e esquece a terceira é a hora em que o kit passa a mandar
// `{{whatsapp}}` escrito assim mesmo para o eleitor.
//
// ── POR QUE O LINK NÃO PODE SER COLADO NA MÃO ───────────────────────────────
//
// Escrever o endereço do WhatsApp dentro da frase funciona até o dia em que o
// número muda, e aí são dezenas de frases prontas apontando para um telefone
// que ninguém atende — sem erro em lugar nenhum. O atalho resolve na hora do
// envio, a partir de `candidato.ts`, que é o único lugar onde o número mora.

import { CANDIDATO } from "@/lib/candidato";
import { linkParaCompartilhar } from "@/lib/whatsapp";

export type DadosDoAtalho = {
  /** Nome de quem vai receber. Só o primeiro é usado. */
  nome?: string | null;
  /**
   * O código pessoal da liderança desta conversa, quando existe.
   *
   * É o que faz `{{link}}` creditar a indicação a ela. Sem código, `{{link}}`
   * cai no link geral do WhatsApp — a frase continua funcionando, só não conta
   * a indicação para ninguém.
   */
  linkCode?: string | null;
};

/** O que aparece na tela de quem escreve a frase. */
export const ATALHOS = [
  {
    chave: "{{nome}}",
    rotulo: "Primeiro nome",
    ajuda: "O primeiro nome de quem vai receber. Some quando a pessoa não tem nome na ficha.",
  },
  {
    chave: "{{whatsapp}}",
    rotulo: "Nosso WhatsApp",
    ajuda: "Link que abre a conversa com a campanha. É o que a pessoa encaminha para os amigos.",
  },
  {
    chave: "{{link}}",
    rotulo: "Link de indicação",
    ajuda: "O link pessoal de quem recebe: quem chegar por ele entra como indicação dela.",
  },
  { chave: "{{site}}", rotulo: "Site", ajuda: "O site oficial da campanha." },
  {
    chave: "{{formulario}}",
    rotulo: "Formulário do material",
    ajuda: "O formulário onde a pessoa pede adesivo, camisa e santinho.",
  },
  {
    chave: "{{instagram}}",
    rotulo: "Instagram",
    ajuda: "O perfil oficial. Convida a pessoa a seguir e a compartilhar as postagens.",
  },
  {
    chave: "{{numero}}",
    rotulo: "Número na urna",
    ajuda: `O número da candidata (${CANDIDATO.numeroUrna}).`,
  },
] as const;

/**
 * Os atalhos que esta instalação tem de verdade.
 *
 * A tela usa esta lista, e não a de cima: oferecer um botão "Formulário do
 * material" numa instalação que não tem formulário produz uma mensagem com um
 * buraco no meio — e quem escreveu só descobre quando o eleitor responde
 * perguntando qual link.
 */
export const ATALHOS_DISPONIVEIS = ATALHOS.filter((a) => {
  if (a.chave === "{{formulario}}") return !!CANDIDATO.formulario;
  if (a.chave === "{{instagram}}") return !!CANDIDATO.instagram;
  return true;
});

/**
 * Troca os atalhos pelo conteúdo de verdade.
 *
 * Atalho que não existe fica ESCRITO como está, de propósito: some é pior. Uma
 * frase que perde um pedaço em silêncio chega torta e ninguém descobre; uma
 * frase com `{{lkin}}` escrito no meio a atendente vê no histórico e conserta.
 */
export function aplicarAtalhos(texto: string, dados: DadosDoAtalho): string {
  const primeiro = (dados.nome ?? "").trim().split(" ")[0] ?? "";

  // SEM frase pronta dentro: ver `linkParaCompartilhar`. O link do QR traz
  // "Vim pelo QR code" escrito, o que é mentira em quem recebeu de um amigo.
  const linkGeral = linkParaCompartilhar();
  const linkPessoal = dados.linkCode
    ? `${CANDIDATO.site}/c/${dados.linkCode}`
    : linkGeral;

  let saida = texto
    .replace(/\{\{\s*nome\s*\}\}/gi, primeiro)
    .replace(/\{\{\s*whatsapp\s*\}\}/gi, linkGeral)
    .replace(/\{\{\s*link\s*\}\}/gi, linkPessoal)
    .replace(/\{\{\s*site\s*\}\}/gi, CANDIDATO.site)
    .replace(/\{\{\s*formulario\s*\}\}/gi, CANDIDATO.formulario)
    .replace(/\{\{\s*instagram\s*\}\}/gi, CANDIDATO.instagram)
    .replace(/\{\{\s*numero\s*\}\}/gi, CANDIDATO.numeroUrna);

  // ── LIMPAR O BURACO QUE O NOME VAZIO DEIXA ───────────────────────────────
  //
  // "Oi {{nome}}, tudo bem?" para quem não tem nome na ficha virava
  // "Oi , tudo bem?" — com o espaço antes da vírgula. É pequeno e é exatamente
  // o tipo de coisa que faz a mensagem parecer robô.
  if (!primeiro) {
    saida = saida
      .replace(/[ \t]+([,.!?;])/g, "$1")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/^[ \t]+/gm, "");
  }

  return saida;
}

/** Uma frase de exemplo para a tela, sem precisar mandar nada. */
export function espiarAtalhos(texto: string): string {
  return aplicarAtalhos(texto, { nome: "Maria Silva", linkCode: "a7k2m9" });
}
