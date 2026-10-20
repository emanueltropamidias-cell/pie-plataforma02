// Classificação das conversas por IA.
//
// POR QUE TROCAR A PALAVRA-CHAVE. A lista de frases em `atendimento.ts` só
// acerta quem escreve do jeito previsto. "Pode deixar que eu tô contigo viu
// linda" é apoio declarado e não bate com nenhum termo da lista — cai em
// indeciso. O erro tem direção: subestima apoiador, infla indeciso. Um painel
// que erra sempre para o mesmo lado leva a operação a decidir errado.
//
// O QUE A IA **NÃO** DECIDE. O nível estrutural continua fora daqui, em
// `lerConversa`: quem escreveu e não foi respondido é "não atendido", e isso
// sai da direção das mensagens, não de interpretação. É o número que manda
// reforçar a equipe — nunca pode depender de palpite de modelo.
//
// Então a divisão é:
//   estrutural (exato, local)  -> respondida ou não, quando, por quem
//   semântico  (IA)            -> apoiador · multiplicador · hater · demanda
//
// Se a IA falhar por qualquer motivo, quem responde é a palavra-chave. Sync que
// para porque a API de fora caiu é pior que sync com classificação mais grossa.

import type { Demanda, Status } from "@/lib/atendimento";
import { CANDIDATO } from "@/lib/candidato";

const MODELO = "claude-haiku-4-5-20251001";

// Quantas conversas vão numa chamada só. Uma por chamada seriam ~400 chamadas
// por sincronização; agrupadas, ficam ~50. O teto é baixo de propósito: lote
// grande demais faz o modelo perder o alinhamento entre índice e resposta.
const POR_CHAMADA = 8;

// Cortes por conversa. As primeiras e as últimas mensagens carregam quase toda
// a informação — o meio costuma ser combinação de horário e agradecimento.
const MAX_MSGS = 24;
const MAX_CHARS = 400;

const CATEGORIAS = [
  "hater",
  "multiplicador",
  "apoiador",
  "tem_candidato",
  "indeciso",
  "nao_respondeu",
] as const;

const DEMANDAS_IA = ["saude", "emprego", "juridico", "material"] as const;

const INSTRUCAO = `Você classifica conversas de WhatsApp de uma campanha eleitoral brasileira (${CANDIDATO.nome}, candidata a ${CANDIDATO.cargo} pela Bahia, número ${CANDIDATO.numeroUrna}).

Para CADA conversa, devolva uma categoria e as demandas.

CATEGORIAS (escolha exatamente uma, na ordem de prevalência abaixo — a primeira que se aplicar vence):
- hater: hostil, xinga, ataca a candidata ou o grupo político dela. Crítica educada NÃO é hater.
- multiplicador: aceitou levar a campanha adiante — divulgar, mandar para grupo, falar com outras pessoas, a "meta dos 12".
- apoiador: declarou voto ou apoio, ou pediu material de campanha. Inclui apoio informal ("tô contigo", "já é sua", "conta comigo", "vou votar sim").
- tem_candidato: disse que já tem candidato a deputado federal.
- indeciso: conversou, não recusou, mas não declarou apoio. Inclui quem só pediu ajuda com um problema pessoal.
- nao_respondeu: a pessoa parou de responder e a última palavra ficou com a campanha.

DEMANDAS (zero, uma ou várias — é independente da categoria):
- saude, emprego, juridico, material

REGRAS
- Julgue apenas o que a PESSOA escreveu. As mensagens da campanha são contexto.
- Português informal da Bahia, com erro de digitação, áudio transcrito e gíria. Interprete a intenção, não a forma.
- Ironia e sarcasmo contam pela intenção real.
- Na dúvida entre apoiador e indeciso, escolha indeciso. Inflar apoio faz a campanha decidir errado.
- Responda para TODAS as conversas recebidas, na mesma ordem, usando o id de cada uma.`;

const FERRAMENTA = {
  name: "classificar",
  description: "Devolve a classificação de cada conversa recebida.",
  input_schema: {
    type: "object",
    properties: {
      conversas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "integer", description: "O id da conversa, como veio." },
            categoria: { type: "string", enum: CATEGORIAS },
            demandas: { type: "array", items: { type: "string", enum: DEMANDAS_IA } },
          },
          required: ["id", "categoria", "demandas"],
        },
      },
    },
    required: ["conversas"],
  },
} as const;

export type ParaClassificar = {
  id: number;
  msgs: { direction: "inbound" | "outbound"; text: string | null }[];
};

export type Classificacao = { status: Status; demandas: Demanda[] };

/** A conversa em texto puro, do jeito que o modelo lê melhor. */
function transcrever(c: ParaClassificar) {
  const msgs = c.msgs.filter((m) => m.text?.trim());
  // Mantém começo e fim quando é longa: o miolo é o que menos informa.
  const usadas =
    msgs.length <= MAX_MSGS
      ? msgs
      : [...msgs.slice(0, 8), ...msgs.slice(-(MAX_MSGS - 8))];

  const linhas = usadas.map((m) => {
    const quem = m.direction === "inbound" ? "PESSOA" : "CAMPANHA";
    return `${quem}: ${(m.text ?? "").replace(/\s+/g, " ").slice(0, MAX_CHARS)}`;
  });
  if (msgs.length > MAX_MSGS) linhas.splice(8, 0, "[…]");
  return `<conversa id="${c.id}">\n${linhas.join("\n")}\n</conversa>`;
}

async function umaChamada(
  chave: string,
  lote: ParaClassificar[],
): Promise<Map<number, Classificacao>> {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": chave,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 1024,
      system: INSTRUCAO,
      tools: [FERRAMENTA],
      tool_choice: { type: "tool", name: "classificar" },
      messages: [{ role: "user", content: lote.map(transcrever).join("\n\n") }],
    }),
  });

  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    throw new Error(`Anthropic HTTP ${r.status}: ${corpo.slice(0, 200)}`);
  }

  const j = await r.json();
  const uso = (j.content ?? []).find(
    (b: { type: string; name?: string }) => b.type === "tool_use" && b.name === "classificar",
  );
  const itens: { id: number; categoria: string; demandas: string[] }[] =
    uso?.input?.conversas ?? [];

  const saida = new Map<number, Classificacao>();
  const validos = new Set<string>(CATEGORIAS);
  const validas = new Set<string>(DEMANDAS_IA);
  const pedidos = new Set(lote.map((c) => c.id));

  for (const item of itens) {
    // Ignora id que não foi pedido: o modelo pode inventar ou repetir, e uma
    // linha inventada gravaria classificação em cima da conversa errada.
    if (!pedidos.has(item.id) || !validos.has(item.categoria)) continue;
    saida.set(item.id, {
      status: item.categoria as Status,
      demandas: (item.demandas ?? []).filter((d) => validas.has(d)) as Demanda[],
    });
  }
  return saida;
}

/**
 * Classifica um conjunto de conversas.
 *
 * Devolve só o que a IA conseguiu classificar. O que faltar — chave ausente,
 * API fora, lote que falhou — sai de fora do mapa, e quem chamou usa a
 * palavra-chave para esses. Nunca lança.
 */
export async function classificarComIA(
  conversas: ParaClassificar[],
): Promise<Map<number, Classificacao>> {
  const chave = process.env.ANTHROPIC_API_KEY;
  const tudo = new Map<number, Classificacao>();
  if (!chave || conversas.length === 0) return tudo;

  const lotes: ParaClassificar[][] = [];
  for (let i = 0; i < conversas.length; i += POR_CHAMADA) {
    lotes.push(conversas.slice(i, i + POR_CHAMADA));
  }

  // Em paralelo, mas de 3 em 3: a API tem limite por minuto, e estourá-lo
  // devolveria 429 para o lote inteiro — mais lento que ir com calma.
  for (let i = 0; i < lotes.length; i += 3) {
    const resultados = await Promise.allSettled(
      lotes.slice(i, i + 3).map((l) => umaChamada(chave, l)),
    );
    for (const r of resultados) {
      if (r.status === "fulfilled") for (const [k, v] of r.value) tudo.set(k, v);
    }
  }
  return tudo;
}
