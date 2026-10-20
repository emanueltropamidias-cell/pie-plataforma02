import {
  configurada as configuradaEvolution,
  enviarTexto as enviarTextoEvolution,
  enviarMidia as enviarMidiaEvolution,
  enviarAudio as enviarAudioEvolution,
  editarMensagem,
  type Citacao,
} from "@/lib/evolution";
import { marcarQuedaPeloEnvio } from "@/lib/conexao";
import {
  configuradaMeta,
  enviarTextoMeta,
  enviarMidiaMeta,
  enviarAudioMeta,
} from "@/lib/meta-wa";

// Quem fala com o WhatsApp.
//
// ── POR QUE UMA CAMADA NO MEIO ──────────────────────────────────────────────
//
// Existem dois caminhos para o mesmo WhatsApp:
//
//   META        a Cloud API oficial. Não bane por volume, cobra por conversa
//               iniciada pela campanha, e é para onde o atendimento vai.
//   EVOLUTION   o não-oficial, que fala fingindo ser um celular. Foi o que
//               levou o banimento de 26/08 — e continua útil como contingência,
//               porque sobe em uma tarde enquanto a Meta verifica o CNPJ.
//
// Sem esta camada, trocar de provedor seria caçar `enviarTexto` em seis rotas e
// torcer para não esquecer nenhuma. Com ela, a troca é UMA VARIÁVEL DE
// AMBIENTE, e os dois podem coexistir durante a migração.
//
// A escolha é explícita em `WA_PROVEDOR`. Quando não está escrita, ganha a Meta
// se estiver configurada — porque o padrão certo, depois do que aconteceu, é o
// oficial.

export type Provedor = "meta" | "evolution";

export function provedor(): Provedor | null {
  const escolhido = process.env.WA_PROVEDOR?.trim().toLowerCase();
  if (escolhido === "meta") return configuradaMeta() ? "meta" : null;
  if (escolhido === "evolution") return configuradaEvolution() ? "evolution" : null;
  if (configuradaMeta()) return "meta";
  if (configuradaEvolution()) return "evolution";
  return null;
}

export function configurado() {
  return provedor() !== null;
}

type Envio =
  | { ok: true; dados: unknown }
  | { ok: false; erro: string; status?: number };

/** O identificador da mensagem no WhatsApp, seja qual for o provedor. Ele é a
 *  chave de idempotência do banco — sem ele, o eco do webhook duplica. */
export function idDaResposta(dados: unknown): string | null {
  const d = dados as {
    key?: { id?: string };
    messages?: { id?: string }[];
  };
  return d?.key?.id ?? d?.messages?.[0]?.id ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// POR QUAL NÚMERO A RESPOSTA SAI
// ─────────────────────────────────────────────────────────────────────────────
//
// A campanha recebe por vários números. A resposta TEM de sair pelo mesmo por
// onde a pessoa escreveu — senão ela recebe mensagem de um número que nunca
// contatou, o que para ela é abordagem fria de desconhecido. É o gesto que ela
// denuncia, e denúncia é o que mais bane número.
//
// `instancia` é a chave técnica gravada em `numeros`: o nome da instância na
// Evolution. Vazio cai no número do ambiente, que continua certo para quem só
// tem um.

// ─────────────────────────────────────────────────────────────────────────────
// NÃO DÁ PARA RESPONDER QUEM NÃO TEM TELEFONE
// ─────────────────────────────────────────────────────────────────────────────
//
// Conversa que voltou pelo history sync é endereçada por `lid.179087888879695`:
// identificador anônimo, NÃO telefone. Mandar isso adiante fazia o PIE pedir à
// Evolution que escrevesse para um número de quinze dígitos, e a resposta que
// chegava na cara da atendente era esta:
//
//   [{"jid":"179087888879695@s.whatsapp.net","exists":false,...}]
//
// JSON cru, no lugar de uma frase. Ela lê "exists: false", olha o WhatsApp Web
// aberto e conclui que o chip caiu — quando o chip está ótimo e o problema é
// que aquela pessoa nunca teve número gravado.
//
// A TRAVA MORA AQUI, e não nas rotas: são quatro caminhos de envio (texto,
// áudio, mídia e kit) e o quinto que alguém escrever amanhã. Regra na camada de
// envio nenhum deles esquece.
function semTelefoneParaEnviar(telefone: string): Envio | null {
  if (!telefone.startsWith("lid.")) return null;
  return {
    ok: false,
    erro:
      "Essa pessoa escreveu sem número — o WhatsApp mandou só um identificador interno. " +
      "Não dá para responder por aqui enquanto ela não escrever de novo: aí o número real chega e o PIE junta as duas conversas. " +
      "Se for urgente, procure a pessoa pelo aparelho.",
  };
}

/**
 * Todo envio pela Evolution passa por aqui.
 *
 * São três caminhos hoje — texto, áudio e mídia — e o quarto que alguém
 * escrever amanhã. Marcar a queda em cada rota obrigaria a lembrar toda vez, e
 * a esquecida deixaria a atendente escrevendo para um número morto sem faixa
 * nenhuma na tela. Regra na camada de envio nenhum caminho esquece.
 */
// ─────────────────────────────────────────────────────────────────────────────
// O ERRO DA EVOLUTION NÃO PODE CHEGAR CRU NA ATENDENTE
// ─────────────────────────────────────────────────────────────────────────────
//
// 23/09: as meninas viam isto na caixa, em vermelho, no lugar do botão de
// enviar:
//
//   ["TypeError: Cannot read properties of undefined (reading 'id')"]
//
// Isso é um erro de PROGRAMA DO SERVIDOR EVOLUTION, repassado palavra por
// palavra. Quem lê não tem como saber o que fazer — e o que estava acontecendo
// era simples de explicar: o chip daquela conversa tinha sido desconectado do
// aparelho (`device_removed`), e a Evolution tenta usar um socket que não
// existe mais.
//
// Eram 2.532 conversas abertas num chip só, 1.228 delas esperando resposta. A
// atendente tentava, lia o TypeError, e não tinha o que fazer com aquilo.
//
// A tradução mora AQUI, no ponto por onde passam os quatro caminhos de envio —
// texto, áudio, mídia e kit — e o quinto que alguém escrever amanhã.
function traduzirErro(bruto: string): string {
  const b = bruto.toLowerCase();

  // O socket morreu: a Evolution tem a instância, mas não tem conexão viva.
  if (
    b.includes("cannot read properties of undefined") ||
    b.includes("cannot read property") ||
    b.includes("connection closed") ||
    b.includes("connection lost") ||
    b.includes("socket") ||
    b.includes("not connected")
  ) {
    return (
      "O número desta conversa está desconectado do WhatsApp — por isso a mensagem não saiu. " +
      "Avise a coordenação para reconectar o aparelho em Configurações → Números. " +
      "Enquanto isso, nada que você escrever aqui vai chegar."
    );
  }

  // A instância nem existe mais no servidor.
  if (b.includes("does not exist") || b.includes("instance not found") || b.includes("404")) {
    return (
      "O número desta conversa não está mais cadastrado no servidor de WhatsApp. " +
      "Fale com a coordenação — nenhuma mensagem sai por aqui até resolver."
    );
  }

  // Sessão derrubada pelo WhatsApp (banimento ou aparelho removido).
  if (b.includes("401") || b.includes("unauthorized") || b.includes("device_removed")) {
    return (
      "O WhatsApp derrubou a sessão deste número. Ele precisa ser reconectado pela coordenação " +
      "antes de qualquer mensagem sair."
    );
  }

  return bruto;
}

async function pelaEvolution(
  instancia: string | null | undefined,
  enviar: () => Promise<Envio>,
): Promise<Envio> {
  const r = await enviar();
  if (r.ok) return r;
  // A queda é marcada com o erro CRU: quem lê `numeros.motivo_queda` é a
  // coordenação, e ali o texto técnico é o que permite diagnosticar.
  await marcarQuedaPeloEnvio(instancia, r.erro);
  return { ...r, erro: traduzirErro(r.erro) };
}

export async function enviarTexto(
  telefone: string,
  texto: string,
  instancia?: string | null,
  /**
   * A mensagem citada. Só a Evolution sabe citar — a Cloud API da Meta tem
   * `context`, mas o caminho dela aqui ainda não passa por isso, e mandar sem
   * citar é melhor que não mandar.
   */
  citar?: Citacao | null,
): Promise<Envio> {
  const semNumero = semTelefoneParaEnviar(telefone);
  if (semNumero) return semNumero;
  const p = provedor();
  if (!p)
    return {
      ok: false,
      erro: "Nenhum WhatsApp configurado — falta a Cloud API da Meta ou a Evolution.",
    };
  return p === "meta"
    ? enviarTextoMeta(telefone, texto)
    : pelaEvolution(instancia, () =>
        enviarTextoEvolution(telefone, texto, instancia, 0, citar),
      );
}

/**
 * Áudio como MENSAGEM DE VOZ.
 *
 * Nos dois provedores é um caminho SEPARADO do de foto e vídeo, e isso não é
 * detalhe de API: `sendMedia` com tipo áudio entrega um ARQUIVO ANEXADO, que a
 * pessoa precisa baixar e abrir noutro aplicativo. A maioria não abre.
 *
 * Para a voz da candidata, a diferença entre os dois caminhos é a diferença
 * entre "ela falou comigo" e um anexo ignorado.
 *
 * Os dois exigem OGG/Opus. Áudio gravado no próprio WhatsApp já é — é por isso
 * que a tela da biblioteca ensina a gravar lá em vez de aceitar qualquer coisa.
 */
export async function enviarAudio(
  telefone: string,
  url: string,
  instancia?: string | null,
): Promise<Envio> {
  const p = provedor();
  if (!p)
    return {
      ok: false,
      erro: "Nenhum WhatsApp configurado — falta a Cloud API da Meta ou a Evolution.",
    };
  return p === "meta"
    ? enviarAudioMeta(telefone, url)
    : pelaEvolution(instancia, () =>
        enviarAudioEvolution(telefone, url, instancia),
      );
}

export async function enviarMidia(
  telefone: string,
  tipo: "image" | "video" | "document",
  url: string,
  opcoes?: {
    legenda?: string;
    mime?: string;
    nomeArquivo?: string;
    instancia?: string | null;
  },
): Promise<Envio> {
  const p = provedor();
  if (!p)
    return {
      ok: false,
      erro: "Nenhum WhatsApp configurado — falta a Cloud API da Meta ou a Evolution.",
    };
  return p === "meta"
    ? enviarMidiaMeta(telefone, tipo, url, opcoes)
    : pelaEvolution(opcoes?.instancia, () =>
        enviarMidiaEvolution(telefone, tipo, url, opcoes),
      );
}

// ─────────────────────────────────────────────────────────────────────────────
// A JANELA DE 24 HORAS
// ─────────────────────────────────────────────────────────────────────────────
//
// ISTO NÃO EXISTIA NO NÃO-OFICIAL, e é a mudança de regra que mais vai aparecer
// no dia a dia das meninas.
//
// Na Cloud API, a campanha só escreve à vontade DENTRO DE 24 HORAS a contar da
// última mensagem que a PESSOA mandou. Passou disso, a Meta recusa qualquer
// texto livre: o único jeito de retomar é um TEMPLATE aprovado antes, e cada um
// custa.
//
// Por que a regra existe: é ela que impede que a plataforma vire canal de
// disparo. E é ela que torna a resposta ao lead do anúncio GRATUITA e sem teto
// de volume — as duas coisas são o mesmo acordo.
//
// A tela precisa avisar ANTES de a menina escrever. Descobrir pelo erro da Meta
// depois de digitar três parágrafos é o pior lugar para descobrir.

export const JANELA_MS = 24 * 60 * 60 * 1000;

/**
 * Ainda dá para responder de graça?
 *
 * `ultimaEntrada` é o momento da última mensagem RECEBIDA — a que a pessoa
 * mandou. Resposta da campanha não reabre a janela; só a pessoa reabre.
 */
/**
 * Editar mensagem já enviada.
 *
 * Só a Evolution: a Cloud API da Meta NÃO tem edição de mensagem. Por isso o
 * caminho da Meta devolve recusa explicada em vez de erro genérico — quem ler
 * "não suportado" procura outra saída; quem lê "falhou" tenta de novo.
 */
export async function editarTexto(
  telefone: string,
  waId: string,
  texto: string,
  instancia?: string | null,
): Promise<Envio> {
  const p = provedor();
  if (!p)
    return {
      ok: false,
      erro: "Nenhum WhatsApp configurado.",
    };
  if (p === "meta")
    return {
      ok: false,
      erro: "A Cloud API da Meta não permite editar mensagem enviada.",
    };
  return editarMensagem(telefone, waId, texto, instancia);
}

export function dentroDaJanela(ultimaEntrada: string | null | undefined) {
  if (provedor() !== "meta") return true; // no não-oficial não há janela
  if (!ultimaEntrada) return false;
  const t = Date.parse(ultimaEntrada);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < JANELA_MS;
}

/** Quanto falta para a janela fechar, em minutos. Negativo quando já fechou. */
export function minutosDeJanela(ultimaEntrada: string | null | undefined) {
  if (!ultimaEntrada) return -1;
  const t = Date.parse(ultimaEntrada);
  if (!Number.isFinite(t)) return -1;
  return Math.floor((t + JANELA_MS - Date.now()) / 60000);
}
