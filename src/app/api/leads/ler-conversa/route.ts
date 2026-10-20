import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MUNICIPIOS_BA } from "@/lib/municipios-ba";
import { CANDIDATO } from "@/lib/candidato";

// Recebe o texto colado de uma ou várias conversas do WhatsApp e devolve os
// cadastros já separados. Existe porque o atendimento é feito pelo aplicativo
// comum, que não emite webhook: o dado chega escrito na conversa e sair de lá
// na mão custa caro.

export const maxDuration = 60;

const MODELO = "claude-opus-5";

const FORMATO = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    properties: {
      pessoas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            nome: {
              type: "string",
              description: "Nome da pessoa. Vazio se não aparecer.",
            },
            telefone: {
              type: "string",
              description: "Só dígitos, com DDD. Vazio se não aparecer.",
            },
            municipio: {
              type: "string",
              description: "Município da Bahia. Vazio se não aparecer.",
            },
            bairro: {
              type: "string",
              description: "Bairro ou localidade. Vazio se não aparecer.",
            },
            indicou: {
              type: "string",
              description:
                "Quem indicou, quando a mensagem disser 'vim pela indicação de X'.",
            },
            observacao: {
              type: "string",
              description: "O que ficou ambíguo. Vazio se estiver claro.",
            },
          },
          required: [
            "nome",
            "telefone",
            "municipio",
            "bairro",
            "indicou",
            "observacao",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["pessoas"],
    additionalProperties: false,
  },
};

const SISTEMA = `Você lê conversas de WhatsApp coladas por uma atendente e extrai o cadastro de cada pessoa.

Regras:
- Extraia APENAS o que está escrito. Nunca invente nome, telefone, município ou bairro.
- O texto pode conter VÁRIAS conversas, de pessoas diferentes. Devolva uma entrada por pessoa.
- Ignore as mensagens do atendimento (${CANDIDATO.primeiroNome} ou a equipe). Interessa quem escreve de fora.
- Nome: use o que a pessoa disser; se só houver o nome do contato no cabeçalho da conversa, use esse.
- Telefone: só dígitos com DDD. Número no formato +55 71 99999-9999 vira 71999999999.
- Município: precisa ser da Bahia. Se a pessoa escrever errado ou abreviado, corrija para a grafia oficial. Se não der para reconhecer, deixe vazio.
- Bairro: como a pessoa escreveu, com as maiúsculas arrumadas.
- "indicou": preencha quando a mensagem trouxer "vim pela indicação de FULANA".
- Campo que não aparecer no texto: string vazia. Nunca preencha por dedução.

Municípios válidos da Bahia (use exatamente esta grafia):
${MUNICIPIOS_BA.join(", ")}`;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { erro: "A leitura por IA não está configurada." },
      { status: 400 },
    );
  }

  let texto = "";
  try {
    texto = String((await req.json())?.texto ?? "").slice(0, 40_000);
  } catch {
    return NextResponse.json({ erro: "Texto inválido." }, { status: 400 });
  }
  if (!texto.trim())
    return NextResponse.json(
      { erro: "Cole a conversa antes." },
      { status: 400 },
    );

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 8000,
        // A lista de municípios é fixa e pesada: fica no system com cache,
        // cobrada uma vez e lida do cache nas colagens seguintes.
        system: [
          { type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } },
        ],
        output_config: { effort: "low", format: FORMATO },
        messages: [
          {
            role: "user",
            content: `Extraia os cadastros desta(s) conversa(s):\n\n${texto}`,
          },
        ],
      }),
      cache: "no-store",
    });

    const json = await resp.json();
    if (!resp.ok) {
      return NextResponse.json(
        { erro: json?.error?.message ?? "Erro ao ler a conversa." },
        { status: 502 },
      );
    }
    if (json?.stop_reason === "refusal") {
      return NextResponse.json(
        { erro: "A IA não conseguiu processar este texto." },
        { status: 422 },
      );
    }

    const saida = (json?.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("")
      .trim();

    let dados: { pessoas?: Record<string, string>[] };
    try {
      dados = JSON.parse(saida);
    } catch {
      return NextResponse.json(
        { erro: "A IA devolveu um formato inesperado." },
        { status: 502 },
      );
    }

    const pessoas = (dados.pessoas ?? []).map((p) => {
      const d = (p.telefone ?? "")
        .replace(/\D/g, "")
        .replace(/^55(?=\d{10,11}$)/, "");
      const telefone =
        d.length === 11
          ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
          : d.length === 10
            ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
            : "";
      return {
        nome: p.nome ?? "",
        telefone,
        municipio: p.municipio ?? "",
        bairro: p.bairro ?? "",
        indicou: p.indicou ?? "",
        observacao: p.observacao ?? "",
      };
    });

    return NextResponse.json({ pessoas });
  } catch {
    return NextResponse.json(
      { erro: "Falha de rede ao ler a conversa." },
      { status: 502 },
    );
  }
}
