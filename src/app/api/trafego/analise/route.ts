import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Recebe um resumo das métricas de tráfego e pede uma análise ao Claude,
// funcionando como uma gestora de tráfego auxiliar.
//
// Precisa da variável de ambiente na Vercel:
//   ANTHROPIC_API_KEY -> chave da API (console.anthropic.com)

const MODELO = "claude-sonnet-5";

const SISTEMA = `Você é uma gestora de tráfego sênior, especialista em campanhas de anúncios no Meta (Facebook e Instagram).
Analise APENAS os dados fornecidos (não invente números que não estejam ali) e escreva um diagnóstico prático e direto, em português do Brasil.

Estruture a resposta EXATAMENTE nestas seções, cada uma começando com o título em MAIÚSCULAS numa linha própria:
PANORAMA
O QUE ESTÁ FUNCIONANDO
PONTOS DE ATENÇÃO
RECOMENDAÇÕES

Regras:
- Seja objetiva; use frases curtas e, quando fizer sentido, listas com "- ".
- Cite os números relevantes (investimento, CTR, CPC, custo por resultado, resultados) para embasar cada ponto.
- Em RECOMENDAÇÕES, dê de 3 a 5 ações concretas e priorizadas (ex: realocar verba, pausar campanha X, testar criativo, ajustar público).
- Compare campanhas entre si quando houver mais de uma.
- Linguagem neutra e profissional. Não use emojis. Não use termos eleitorais.`;

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
        erro: "A análise por IA ainda não está configurada (falta a chave da API na Vercel).",
      },
      { status: 400 },
    );
  }

  let resumo: unknown;
  try {
    resumo = (await req.json())?.resumo;
  } catch {
    return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
  }
  if (!resumo)
    return NextResponse.json(
      { erro: "Sem dados para analisar." },
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
        max_tokens: 1600,
        system: SISTEMA,
        messages: [
          {
            role: "user",
            content:
              "Analise estas métricas de tráfego (valores em R$, período e campanhas indicados no JSON):\n\n" +
              JSON.stringify(resumo, null, 2),
          },
        ],
      }),
      cache: "no-store",
    });

    const json = await resp.json();
    if (!resp.ok) {
      const msg = json?.error?.message ?? "Erro ao chamar a IA.";
      return NextResponse.json({ erro: msg }, { status: 502 });
    }
    const texto = (json?.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n")
      .trim();

    return NextResponse.json({
      analise: texto || "A IA não retornou análise.",
    });
  } catch {
    return NextResponse.json(
      { erro: "Falha de rede ao chamar a IA." },
      { status: 502 },
    );
  }
}
