import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MUNICIPIOS_BA } from "@/lib/municipios-ba";

// Lê a foto de uma ficha/lista de cadastro e devolve os campos já separados,
// para a pessoa só conferir em vez de digitar tudo.
//
// Precisa da variável de ambiente na Vercel:
//   ANTHROPIC_API_KEY -> chave da API (console.anthropic.com)

export const maxDuration = 60;

const MODELO = "claude-opus-5";

// A resposta é obrigada a seguir este formato — sem texto solto pra interpretar.
const FORMATO = {
  type: "json_schema" as const,
  schema: {
    type: "object",
    properties: {
      nome: {
        type: "string",
        description: "Nome completo da pessoa. Vazio se não houver.",
      },
      telefone: {
        type: "string",
        description: "Só os dígitos, com DDD. Vazio se não houver.",
      },
      municipio: {
        type: "string",
        description: "Município da Bahia. Vazio se não houver.",
      },
      bairro: {
        type: "string",
        description: "Bairro ou localidade. Vazio se não houver.",
      },
      confianca: {
        type: "string",
        enum: ["alta", "media", "baixa"],
        description: "Quão legível estava a foto.",
      },
      observacao: {
        type: "string",
        description:
          "O que ficou ilegível ou duvidoso. Vazio se estiver tudo claro.",
      },
    },
    required: [
      "nome",
      "telefone",
      "municipio",
      "bairro",
      "confianca",
      "observacao",
    ],
    additionalProperties: false,
  },
};

const SISTEMA = `Você lê fotos de fichas de cadastro escritas à mão ou impressas e extrai os dados da pessoa.

Regras:
- Transcreva APENAS o que está escrito na imagem. Nunca invente, complete ou adivinhe dado que não esteja lá.
- Campo ausente ou ilegível: devolva string vazia e explique em "observacao".
- Nome: use a grafia da ficha, corrigindo só as maiúsculas (MARIA DA SILVA vira Maria da Silva).
- Telefone: devolva apenas dígitos, com DDD. Número de 8 dígitos sem DDD fica como está, sem completar.
- Município: precisa ser um município da Bahia. Se o que está escrito não for reconhecível, deixe vazio.
- Se a foto tiver VÁRIAS pessoas, extraia só a primeira e registre isso em "observacao".
- "confianca" reflete a legibilidade: alta (nítida), media (parte duvidosa), baixa (chute).

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
      {
        erro: "A leitura por foto ainda não está configurada (falta a chave da API na Vercel).",
      },
      { status: 400 },
    );
  }

  let imagem = "";
  let tipo = "";
  try {
    const body = await req.json();
    imagem = String(body?.imagem ?? "");
    tipo = String(body?.tipo ?? "image/jpeg");
  } catch {
    return NextResponse.json({ erro: "Imagem inválida." }, { status: 400 });
  }
  if (!imagem)
    return NextResponse.json(
      { erro: "Nenhuma foto recebida." },
      { status: 400 },
    );
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(tipo)) {
    return NextResponse.json(
      { erro: "Formato de imagem não suportado." },
      { status: 400 },
    );
  }

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
        // Espaço de sobra: no Opus 5 o raciocínio também consome max_tokens.
        max_tokens: 4000,
        // A lista dos 395 municípios é fixa e pesa ~2.500 tokens. Mantendo ela
        // no system com cache_control, ela é cobrada uma vez e depois lida do
        // cache (~10% do preço) em toda ficha seguinte. O que muda — a foto —
        // vem depois, senão o cache é invalidado a cada requisição.
        system: [
          { type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } },
        ],
        output_config: { effort: "low", format: FORMATO },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: tipo, data: imagem },
              },
              {
                type: "text",
                text: "Extraia os dados desta ficha de cadastro.",
              },
            ],
          },
        ],
      }),
      cache: "no-store",
    });

    const json = await resp.json();
    if (!resp.ok) {
      return NextResponse.json(
        { erro: json?.error?.message ?? "Erro ao ler a foto." },
        { status: 502 },
      );
    }
    // A IA pode recusar a leitura; nesse caso não há conteúdo pra ler.
    if (json?.stop_reason === "refusal") {
      return NextResponse.json(
        { erro: "A IA não conseguiu processar esta imagem." },
        { status: 422 },
      );
    }

    const texto = (json?.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("")
      .trim();

    let dados: Record<string, string>;
    try {
      dados = JSON.parse(texto);
    } catch {
      return NextResponse.json(
        { erro: "A IA devolveu um formato inesperado." },
        { status: 502 },
      );
    }

    // Telefone volta só com dígitos; formata pra ficar igual ao resto da base.
    const so = (dados.telefone ?? "").replace(/\D/g, "");
    const telefone =
      so.length === 11
        ? `(${so.slice(0, 2)}) ${so.slice(2, 7)}-${so.slice(7)}`
        : so.length === 10
          ? `(${so.slice(0, 2)}) ${so.slice(2, 6)}-${so.slice(6)}`
          : so;

    return NextResponse.json({
      nome: dados.nome ?? "",
      telefone,
      municipio: dados.municipio ?? "",
      bairro: dados.bairro ?? "",
      confianca: dados.confianca ?? "baixa",
      observacao: dados.observacao ?? "",
    });
  } catch {
    return NextResponse.json(
      { erro: "Falha de rede ao ler a foto." },
      { status: 502 },
    );
  }
}
