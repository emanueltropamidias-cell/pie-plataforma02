/**
 * Como a pessoa entrou na base — o rótulo de `liderancas.created_via`.
 *
 * ── POR QUE ISTO É UM ARQUIVO ───────────────────────────────────────────────
 *
 * Esta lista existia DUAS vezes, com conteúdos diferentes: uma no painel de
 * leads e outra na rota que exporta a planilha. Nenhuma das duas conhecia
 * `trafego`, `encaminhamento` e `ficha`, então a maior parte da base saía com
 * o nome cru do banco — na tela e no arquivo que a coordenação manda por fora.
 *
 * Origem nova vai nascer de novo: a campanha inventa canal toda semana. Com a
 * lista em dois lugares, quem acrescenta num esquece do outro, e o defeito
 * volta pela porta mais silenciosa que existe — a planilha que ninguém confere.
 */
export const ORIGEM_CADASTRO: Record<string, string> = {
  // Tráfego pago. Os leads chegam pelo anúncio e são capturados no Gabiflow,
  // que é a ferramenta por onde a operação trabalhou até entrar no PIE.
  trafego: "Tráfego pago (Gabiflow)",
  whatsapp: "WhatsApp",
  manual: "Cadastro manual",
  encaminhamento: "Encaminhamento",
  ficha: "Ficha transcrita",
  foto_ia: "Ficha lida por IA",
  planilha: "Controle de Encaminhamentos",
  importacao: "Planilha importada",
  qr: "QR code / link",

  // ── OS DOIS LOTES DE QUEM FALOU E NÃO TINHA FICHA ─────────────────────────
  //
  // Não estavam aqui, e as 1.157 fichas do primeiro lote apareciam na tela e na
  // planilha com o nome cru do banco — exatamente a porta silenciosa que o
  // comentário no topo descreve.
  //
  // São dois porque foram duas decisões diferentes, e separá-los é o que
  // permite desfazer um sem tocar no outro:
  conversa: "Conversou e disse a cidade",
  conversa_sem_ficha: "Conversou e não tinha ficha",
};

/** O rótulo, ou o valor cru quando a origem for nova e ainda não tiver nome. */
export function rotuloOrigem(via: string | null | undefined): string {
  const chave = (via ?? "").trim();
  return ORIGEM_CADASTRO[chave] ?? chave;
}
