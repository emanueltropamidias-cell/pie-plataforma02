import { CANDIDATO } from "@/lib/candidato";
// As regras de classificação do atendimento, num lugar só.
//
// Vêm da pauta técnica da campanha (reunião de métricas). Ficam aqui, e não
// espalhadas pelas telas, porque são REGRA DE NEGÓCIO: quando alguém decidir
// que "indeciso" virou outra coisa, muda aqui e muda em todo lugar.
//
// SÃO DOIS EIXOS, SEPARADOS DE PROPÓSITO
//
//   STATUS  — uma categoria por pessoa. A soma fecha 100% dos leads do dia.
//   DEMANDA — independente do status. Uma pessoa pode ter várias ou nenhuma.
//
// Misturar os dois é o erro clássico: alguém soma "apoiador + saúde + material"
// e o total passa de 100%, porque a mesma pessoa foi contada três vezes.

// ─────────────────────────────────────────────────────────────────────────────
// O EIXO ZERO: quem começou a conversa
// ─────────────────────────────────────────────────────────────────────────────
//
// São duas operações diferentes dentro do mesmo WhatsApp, e misturá-las estraga
// todo número que vem depois:
//
//   LEAD    — a PESSOA escreveu primeiro. Veio de anúncio ou indicação. Aqui
//             cabe SLA: ela esperou, alguém tinha que responder.
//   DISPARO — a CAMPANHA escreveu primeiro, para uma base que já existia. Aqui
//             SLA não existe: ninguém estava esperando resposta.
//
// Medido em 45 conversas reais: das que estão em `template_pending`, 13 de 13
// começaram com a campanha falando. Das outras (waiting/active/closed), 30 de
// 31 começaram com a pessoa. A separação está nos dados, não é teoria.
//
// Sem este eixo, quem não respondeu a um disparo entra na mesma conta de quem
// veio do tráfego e esfriou — e "não atendido", que deveria ser falha nossa,
// passa a incluir gente que nunca pediu nada.
export type Tipo = "lead" | "disparo";

export const TIPOS: Record<Tipo, { rotulo: string; nota: string }> = {
  lead: {
    rotulo: "Leads de tráfego",
    nota: "A pessoa escreveu primeiro. Veio de anúncio ou indicação.",
  },
  disparo: {
    rotulo: "Disparo para base",
    nota: "A campanha escreveu primeiro, para quem já estava na lista.",
  },
};

export type Status =
  | "hater"
  | "multiplicador"
  | "apoiador"
  | "tem_candidato"
  | "indeciso"
  | "nao_respondeu"
  | "nao_atendido";

/**
 * Ordem de prevalência. A primeira que casar vence.
 *
 * Uma pessoa pode se encaixar em mais de uma descrição ao longo da conversa —
 * declarou apoio e depois xingou, ou aceitou multiplicar depois de já ser
 * apoiadora. Sem uma ordem, a mesma conversa vira número diferente conforme
 * quem classifica, e o painel deixa de fechar.
 */
export const PREVALENCIA: Status[] = [
  "hater",
  "multiplicador",
  "apoiador",
  "tem_candidato",
  "indeciso",
  "nao_respondeu",
  "nao_atendido",
];

// As cores passaram pelo validador de daltonismo (Machado-Oliveira-Fernandes,
// severidade 1.0) em pares vizinhos. A paleta anterior reprovava feio: apoiador
// e "tem candidato" ficavam a ΔE 2.2 sob protan, onde o mínimo é 8 — as duas
// categorias que decidem se a pessoa é voto eram a mesma cor para quem não
// enxerga vermelho. Três outras liam como cinza por falta de croma.
//
// Sete matizes NÃO se separam todas entre si — é limite conhecido, e por isso
// nenhum gráfico aqui pede para comparar status por cor. Nos cartões a cor é só
// um marcador ao lado do nome escrito, e aí ela cumpre o papel.
export const STATUS: Record<Status, { rotulo: string; regra: string; cor: string }> = {
  hater: {
    rotulo: "Hater",
    regra: "Recebeu a tag de hater em qualquer momento. Prevalece sobre todas.",
    cor: "#c02020",
  },
  multiplicador: {
    rotulo: "Multiplicador",
    regra: "Aceitou levar o projeto para 12 pessoas. Prevalece sobre apoiador.",
    cor: "#5b2fc9",
  },
  apoiador: {
    rotulo: "Apoiador",
    regra: "Declarou apoio ou pediu material, mas não confirmou a Meta dos 12.",
    cor: "#12703c",
  },
  tem_candidato: {
    rotulo: "Tem candidato",
    regra: "Disse que já tem candidato a deputado federal.",
    cor: "#b8880a",
  },
  indeciso: {
    rotulo: "Indeciso",
    regra: "Conversou, não recusou, mas não declarou apoio.",
    cor: "#1f6a9e",
  },

  // ── O DESDOBRAMENTO QUE A PAUTA ORIGINAL NÃO TINHA ────────────────────────
  //
  // Na versão de origem havia um único "sem resposta", descrito como "não
  // respondeu a primeira mensagem OU parou no meio". Isso junta duas coisas
  // opostas e esconde a pior delas:
  //
  //   nao_respondeu  — a pessoa não voltou. É lead frio: problema de aquisição.
  //   nao_atendido   — NINGUÉM DA EQUIPE RESPONDEU. É verba paga e desperdiçada.
  //
  // O segundo é o número que manda contratar mais uma atendente amanhã. Somado
  // ao primeiro, ele vira "lead ruim" e ninguém age. No sistema atual havia
  // gente esperando 252 horas contada como lead frio.
  nao_respondeu: {
    rotulo: "Não respondeu",
    regra: "A equipe respondeu, a pessoa não voltou.",
    cor: "#7f9ae0",
  },
  nao_atendido: {
    rotulo: "Não atendido",
    regra: "A pessoa escreveu e ninguém respondeu. Falha nossa, não dela.",
    cor: "#e2620a",
  },
};

export type Demanda = "saude" | "emprego" | "juridico" | "material" | "geral";

export const DEMANDAS: Record<Demanda, { rotulo: string; tag: string }> = {
  saude: { rotulo: "Saúde", tag: "[TRANSFERIR_HUMANO:saude]" },
  emprego: { rotulo: "Emprego", tag: "[TRANSFERIR_HUMANO:emprego]" },
  juridico: { rotulo: "Jurídico", tag: "[TRANSFERIR_HUMANO:juridico]" },
  material: { rotulo: "Material", tag: "[TRANSFERIR_HUMANO:material]" },
  geral: { rotulo: "Geral", tag: "[TRANSFERIR_HUMANO:geral]" },
};

/** Os seis estágios do funil, na ordem em que a conversa acontece. */
export const FUNIL = [
  { id: "chegada", rotulo: "Chegada", nota: "Veio do tráfego ou de indicação" },
  { id: "recepcao", rotulo: "Recepção", nota: "Alguém respondeu" },
  { id: "qualificacao", rotulo: "Qualificação", nota: "Nome e município coletados" },
  { id: "reciprocidade", rotulo: "Reciprocidade", nota: "Entregou algo antes de pedir" },
  { id: "apoio", rotulo: "Pedido de apoio", nota: "1022 apresentado" },
  { id: "multiplicacao", rotulo: "Multiplicação", nota: "Convite para a Meta dos 12" },
] as const;

/**
 * O status vencedor de uma lista de sinais coletados na conversa.
 *
 * Recebe tudo que aconteceu e devolve UMA categoria, seguindo a prevalência.
 * Assim a classificação não depende de quem olha nem da ordem dos eventos.
 */
export function classificar(sinais: Iterable<Status>): Status {
  const vistos = new Set(sinais);
  return PREVALENCIA.find((s) => vistos.has(s)) ?? "nao_atendido";
}

/**
 * Multiplicador DECLARADO é quem disse sim. Multiplicador EFETIVO é quem
 * entregou — e são números muito diferentes.
 *
 * A plataforma consegue medir o segundo porque o link de indicação credita o
 * lead novo a quem indicou (`parent_id` em liderancas). Aceitar é barato;
 * trazer doze pessoas não é. Sem esta separação, a operação comemora um número
 * que não vira voto.
 */
export function efetividade(declarados: number, comFilhos: number) {
  return declarados > 0 ? (comFilhos / declarados) * 100 : 0;
}


// ─────────────────────────────────────────────────────────────────────────────
// Classificação a partir das mensagens
// ─────────────────────────────────────────────────────────────────────────────
//
// O GabiFlow não grava status de lead nem tag de demanda — conferido em 381
// mensagens reais: zero ocorrências de [TRANSFERIR_HUMANO:x] e 99% das
// conversas em "Geral". Então quem classifica é o PIE.
//
// São dois níveis, e a ordem importa:
//
//   ESTRUTURAL  — sai da direção das mensagens, não do que está escrito.
//                 É exato: ou a pessoa foi respondida, ou não foi.
//   SEMÂNTICO   — sai do texto. É palpite educado, e por isso vem depois e
//                 nunca sobrescreve o estrutural.
//
// Palavra-chave em vez de IA de propósito, ao menos por ora: a regra fica
// auditável e ajustável por quem entende da campanha, roda em milissegundos e
// não custa por conversa. O gancho para IA fica marcado no fim.

export type Mensagem = {
  direction: "inbound" | "outbound";
  text: string | null;
  sentBy: string | null;
  createdAt: string;
};

function limpar(t: string) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Cada lista é "qualquer uma destas". Escritas como a pessoa escreve no
// WhatsApp, com e sem acento, com abreviação — não como se escreve em formulário.
const SINAIS = {
  multiplicador: [
    "os 12", "meta dos 12", "12 pessoas", "vou levar", "vou divulgar",
    "compartilhei", "vou compartilhar", "mandei pro grupo", "coloquei no grupo",
    "vou passar pros meus", "conto com voce", "ja mandei pra",
  ],
  apoiador: [
    "conte comigo", "pode contar comigo", "to com voce", "tamo junto",
    "voto certo", "meu voto", "vou votar", "ja e sua", "e sua", CANDIDATO.numeroUrna,
    "quero material", "quero adesivo", "quero camisa", "manda o material",
    "sou seu eleitor", "sou sua eleitora", "apoio", "deus abencoe sua campanha",
  ],
  tem_candidato: [
    "ja tenho candidato", "ja tenho candidata", "ja escolhi",
    "ja to com outro", "ja to com outra", "meu candidato e", "ja tenho o meu",
    "obrigado mas ja", "obrigada mas ja",
  ],
  hater: [
    "vagabunda", "ladra", "ladrao", "corrupta", "corrupto", "safada",
    "lixo", "nojo", "vai se f", "otaria", "palhaca", "mentirosa",
    "golpista", "fascista", "genocida",
  ],
} as const;

const DEMANDA_SINAIS: Record<Demanda, string[]> = {
  saude: ["remedio", "medicamento", "exame", "consulta", "cirurgia", "sus",
          "hospital", "medico", "tratamento", "internacao", "fila do sus"],
  emprego: ["emprego", "vaga", "trabalho", "curriculo", "curriculum",
            "desempregad", "oportunidade de trabalho", "contratacao"],
  juridico: ["processo", "advogad", "inss", "aposentadoria", "beneficio",
             "intimacao", "justica", "pensao", "bpc", "loas"],
  material: ["adesivo", "camisa", "camiseta", "santinho", "bandeira",
             "material de campanha", "panfleto", "kit"],
  geral: [],
};

function bateAlgum(texto: string, termos: readonly string[]) {
  return termos.some((t) => texto.includes(t));
}

/** As demandas citadas na conversa. Zero, uma ou várias — é o eixo 2. */
export function demandasDa(msgs: Mensagem[]): Demanda[] {
  const dela = limpar(msgs.filter((m) => m.direction === "inbound")
                          .map((m) => m.text ?? "").join(" "));
  const achadas = (Object.keys(DEMANDA_SINAIS) as Demanda[])
    .filter((d) => DEMANDA_SINAIS[d].length > 0 && bateAlgum(dela, DEMANDA_SINAIS[d]));
  return achadas;
}

export type Leitura = {
  tipo: Tipo;
  status: Status;
  demandas: Demanda[];
  primeiraMsg: string | null;
  primeiraResposta: string | null;
  ultimaDirecao: "inbound" | "outbound" | null;
  respondidaPor: string | null;
};

/**
 * Lê a conversa inteira e devolve o que o painel precisa.
 *
 * A parte estrutural manda: se a pessoa escreveu e ninguém respondeu, ela é
 * "não atendido" e ponto — por mais simpática que a mensagem dela tenha sido.
 * Esse é o número que some quando se junta tudo em "sem resposta", e é o que
 * manda reforçar a equipe.
 */
export function lerConversa(msgs: Mensagem[]): Leitura {
  const ordenadas = [...msgs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const dela = ordenadas.filter((m) => m.direction === "inbound");
  const nossas = ordenadas.filter((m) => m.direction === "outbound");

  // Quem abriu a conversa decide de qual operação ela é. Conversa sem mensagem
  // nenhuma conta como disparo: se a pessoa nunca escreveu, não há lead.
  const tipo: Tipo = ordenadas[0]?.direction === "inbound" ? "lead" : "disparo";

  const primeiraMsg = dela[0]?.createdAt ?? null;
  // A primeira resposta só conta se veio DEPOIS da primeira mensagem dela.
  // Sem isso, uma mensagem automática de boas-vindas disparada antes contaria
  // como atendimento e a fila apareceria zerada — que é o erro do painel atual.
  const primeiraResposta =
    nossas.find((m) => !primeiraMsg || m.createdAt > primeiraMsg)?.createdAt ?? null;
  const ultima = ordenadas[ordenadas.length - 1] ?? null;
  const respondidaPor = [...nossas].reverse().find((m) => m.sentBy)?.sentBy ?? null;

  const demandas = demandasDa(ordenadas);
  const texto = limpar(dela.map((m) => m.text ?? "").join(" "));

  // ── nível 1: estrutural, exato ────────────────────────────────────────────
  let status: Status | null = null;
  if (dela.length === 0) {
    status = "nao_respondeu";                 // nunca escreveu nada
  } else if (!primeiraResposta) {
    status = "nao_atendido";                  // escreveu e ninguém voltou
  }

  // ── nível 2: semântico, só se o estrutural não decidiu ────────────────────
  if (!status) {
    const sinais: Status[] = [];
    if (bateAlgum(texto, SINAIS.hater)) sinais.push("hater");
    if (bateAlgum(texto, SINAIS.multiplicador)) sinais.push("multiplicador");
    if (bateAlgum(texto, SINAIS.apoiador)) sinais.push("apoiador");
    if (bateAlgum(texto, SINAIS.tem_candidato)) sinais.push("tem_candidato");
    if (sinais.length === 0) {
      // Conversou e não deu sinal: indeciso. Mas se a bola parou com ela e
      // nunca voltou, é lead que esfriou — outro número, outra ação.
      status = ultima?.direction === "outbound" ? "nao_respondeu" : "indeciso";
    } else {
      status = classificar(sinais);
    }
  }

  return {
    tipo,
    status,
    demandas,
    primeiraMsg,
    primeiraResposta,
    ultimaDirecao: (ultima?.direction as "inbound" | "outbound") ?? null,
    respondidaPor,
  };
}

// GANCHO PARA IA. A chave da Anthropic já está configurada na Vercel. Quando a
// palavra-chave começar a errar demais — e ela vai, porque gente escreve de
// jeito que nenhuma lista prevê —, o caminho é mandar as mensagens da pessoa
// para o modelo e pedir UMA das categorias, mantendo o nível estrutural acima
// intacto: "não atendido" nunca deve depender de interpretação.
