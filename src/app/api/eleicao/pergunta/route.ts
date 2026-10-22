import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  apuracaoDaCidade,
  buscarCandidatos,
  candidatoPorId,
  contasDe,
  listarCandidatos,
  perfilDoEleitorado,
  quocienteDe,
  raioX,
  trajetoriaDe,
  zonasNaCidade,
} from "@/lib/eleicao-arquivos";
import { municipiosDaUf } from "@/lib/estados";

// Perguntas em português sobre os dados eleitorais (aba Estratégia).
//
// A regra que a tela prometia desde o começo: a IA responde APENAS com número
// calculado sobre os arquivos do TSE, e diz que não tem o dado quando não tem.
// Por isso ela não recebe os dados soltos no texto: recebe ferramentas, cada
// uma uma consulta determinística em src/lib/eleicao-arquivos.ts, e só pode
// citar o que uma delas devolveu.
//
// Precisa de ANTHROPIC_API_KEY na Vercel (a mesma da análise de tráfego).

export const maxDuration = 120;

const MODELO = "claude-opus-5-5";
const MAX_RODADAS = 10;

const SISTEMA = `Você é a analista de dados eleitorais do ManuFlow. Responde perguntas sobre as eleições brasileiras de 2022, 2024 e 2026 usando SOMENTE as ferramentas disponíveis, que leem os arquivos oficiais do TSE (votação por município e zona, eleitorado, quociente eleitoral, prestação de contas, trajetória dos candidatos).

Regras:
- Todo número da resposta tem que ter vindo de uma ferramenta nesta conversa. Não estime, não arredonde para "cerca de" sem dizer, não complete com conhecimento próprio.
- Se a ferramenta não tem o dado (volta null ou vazio), diga claramente que a plataforma ainda não tem esse dado. Nunca invente.
- Para achar um candidato pelo nome, use buscar_candidatos antes. Os ids são números grandes; use exatamente o id que a ferramenta devolveu.
- Seja neutra e factual sobre partidos e candidatos: descreva resultados e padrões, sem opinar sobre quem é melhor.
- Responda em português do Brasil, direto ao ponto, com frases curtas. Use listas com "- " quando ajudar. Não use tabelas em markdown nem emojis.
- Termine com uma linha "Fonte:" dizendo quais dados do TSE você usou (ex.: "votação por município, 2022").`;

const ferramentas: Anthropic.Beta.BetaTool[] = [
  {
    name: "buscar_candidatos",
    description: "Busca candidatos por nome, número, partido ou cidade numa eleição e estado. uf='BR' para presidente. Devolve id, nome, cargo, partido, votos e resultado.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Nome, número de urna, partido ou cidade" },
        ano: { type: "integer", enum: [2022, 2024, 2026] },
        uf: { type: "string", description: "Sigla do estado (BA, SP…) ou BR" },
        cargo: { type: "string", description: "Opcional, em maiúsculas: DEPUTADO FEDERAL, VEREADOR, PREFEITO…" },
      },
      required: ["q", "ano", "uf"],
      additionalProperties: false,
    },
  },
  {
    name: "ranking_da_disputa",
    description: "Os mais votados de um cargo num estado (ou numa cidade, para prefeito e vereador), com votos e resultado. 1º turno.",
    input_schema: {
      type: "object",
      properties: {
        ano: { type: "integer", enum: [2022, 2024, 2026] },
        uf: { type: "string" },
        cargo: { type: "string" },
        cidade: { type: "string", description: "Só para PREFEITO e VEREADOR: nome da cidade como o TSE grava (maiúsculas)" },
        quantos: { type: "integer", description: "Até 50" },
      },
      required: ["ano", "uf", "cargo"],
      additionalProperties: false,
    },
  },
  {
    name: "raio_x",
    description:
      "Votação de um candidato: total, municípios com voto, os 20 maiores municípios com votos, % do eleitorado e % dos válidos, e a presença no estado. Para presidente, uf escolhe o estado.",
    input_schema: {
      type: "object",
      properties: { candidato_id: { type: "integer" }, uf: { type: "string", description: "Opcional; estado do mapa para presidente" } },
      required: ["candidato_id"],
      additionalProperties: false,
    },
  },
  {
    name: "votos_na_cidade",
    description: "Votos de um candidato numa cidade, por zona eleitoral, mais eleitorado e comparecimento da cidade.",
    input_schema: {
      type: "object",
      properties: { candidato_id: { type: "integer" }, cidade: { type: "string", description: "Nome como o TSE grava (maiúsculas)" } },
      required: ["candidato_id", "cidade"],
      additionalProperties: false,
    },
  },
  {
    name: "quociente",
    description: "Para deputado e vereador: quociente eleitoral, votos e cadeiras de cada partido/federação, posição do candidato na chapa e o último eleito da chapa.",
    input_schema: { type: "object", properties: { candidato_id: { type: "integer" } }, required: ["candidato_id"], additionalProperties: false },
  },
  {
    name: "trajetoria",
    description: "Todas as candidaturas da mesma pessoa em 2022, 2024 e 2026 (ligadas pelo título de eleitor).",
    input_schema: { type: "object", properties: { candidato_id: { type: "integer" } }, required: ["candidato_id"], additionalProperties: false },
  },
  {
    name: "contas",
    description: "Receitas e despesas declaradas ao TSE, custo por voto e a mediana dos eleitos do mesmo cargo.",
    input_schema: { type: "object", properties: { candidato_id: { type: "integer" } }, required: ["candidato_id"], additionalProperties: false },
  },
  {
    name: "cidade",
    description: "Eleitorado de uma cidade: eleitores aptos, comparecimento por cargo e perfil (gênero, idade, escolaridade).",
    input_schema: {
      type: "object",
      properties: { ano: { type: "integer", enum: [2022, 2024, 2026] }, uf: { type: "string" }, cidade: { type: "string" } },
      required: ["ano", "uf", "cidade"],
      additionalProperties: false,
    },
  },
];

const resumo = (c: { id: number; ano: number; uf: string; cargo: string; numero: number; nome_urna: string; partido_sigla: string; nm_ue?: string | null; total_votos: number; situacao: string }) => ({
  id: c.id,
  ano: c.ano,
  uf: c.uf,
  cargo: c.cargo,
  numero: c.numero,
  nome: c.nome_urna,
  partido: c.partido_sigla,
  disputa: c.nm_ue,
  votos: c.total_votos,
  resultado: c.situacao,
});

type Entrada = Record<string, unknown>;
const num = (v: unknown) => Number(v);
const txt = (v: unknown) => String(v ?? "").trim();

async function executar(nome: string, e: Entrada): Promise<unknown> {
  switch (nome) {
    case "buscar_candidatos": {
      const achados = await buscarCandidatos({ q: txt(e.q), ano: num(e.ano), uf: txt(e.uf).toUpperCase(), cargo: e.cargo ? txt(e.cargo).toUpperCase() : null, limite: 15 });
      return achados.map(resumo);
    }
    case "ranking_da_disputa": {
      const cidade = e.cidade ? txt(e.cidade).toUpperCase() : null;
      const l = await listarCandidatos({ ano: num(e.ano), uf: txt(e.uf).toUpperCase(), cargo: txt(e.cargo).toUpperCase(), q: cidade, porPagina: 200 });
      const todos = l.candidatos.filter((c) => !cidade || c.nm_ue === cidade);
      return { total_candidatos: todos.length, candidatos: todos.slice(0, Math.min(50, num(e.quantos) || 15)).map(resumo) };
    }
    case "raio_x": {
      const r = await raioX(num(e.candidato_id), e.uf ? txt(e.uf).toUpperCase() : null);
      if (!r) return null;
      const base = r.base_por_municipio;
      const estado = r.candidato.uf === "BR" ? txt(e.uf).toUpperCase() || "BA" : r.candidato.uf;
      return {
        candidato: resumo(r.candidato),
        estado_do_mapa: estado,
        municipios_com_voto_no_estado: Object.keys(r.votos_por_municipio).length,
        municipios_do_estado: municipiosDaUf(estado),
        votos_por_estado: r.candidato.uf === "BR" ? r.votos_por_uf : undefined,
        totais_da_disputa: r.totais_unidade,
        maiores_municipios: r.top_municipios.map((m) => ({
          municipio: m.municipio,
          votos: m.votos,
          pct_do_eleitorado: base?.[m.municipio]?.aptos ? +((m.votos / base[m.municipio].aptos) * 100).toFixed(2) : null,
          pct_dos_validos: base?.[m.municipio]?.validos ? +((m.votos / base[m.municipio].validos) * 100).toFixed(2) : null,
        })),
      };
    }
    case "votos_na_cidade": {
      const id = num(e.candidato_id);
      const cidade = txt(e.cidade).toUpperCase();
      const c = await candidatoPorId(id);
      if (!c) return null;
      const zonas = await zonasNaCidade(id, cidade);
      const ap = c.uf === "BR" ? null : await apuracaoDaCidade(c.ano, c.uf, cidade);
      return { candidato: resumo(c), cidade, votos: zonas.reduce((s, z) => s + z.votos, 0), zonas, apuracao_da_cidade: ap };
    }
    case "quociente":
      return quocienteDe(num(e.candidato_id));
    case "trajetoria":
      return (await trajetoriaDe(num(e.candidato_id))).map(resumo);
    case "contas":
      return contasDe(num(e.candidato_id));
    case "cidade": {
      const [apuracao, perfil] = await Promise.all([
        apuracaoDaCidade(num(e.ano), txt(e.uf).toUpperCase(), txt(e.cidade).toUpperCase()),
        perfilDoEleitorado(num(e.ano), txt(e.uf).toUpperCase(), txt(e.cidade).toUpperCase()),
      ]);
      return { apuracao, perfil };
    }
  }
  throw new Error(`ferramenta desconhecida: ${nome}`);
}

const ROTULO: Record<string, string> = {
  buscar_candidatos: "busca de candidatos",
  ranking_da_disputa: "ranking da disputa",
  raio_x: "votação por município",
  votos_na_cidade: "votação por zona",
  quociente: "quociente eleitoral",
  trajetoria: "trajetória",
  contas: "prestação de contas",
  cidade: "eleitorado da cidade",
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ erro: "A análise por IA ainda não está configurada (falta a chave da API na Vercel)." }, { status: 400 });

  let corpo: { historico?: { papel: "usuario" | "ia"; texto: string }[]; contexto?: { id: number; nome: string; ano: number; uf: string; cargo: string } };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
  }
  const historico = (corpo.historico ?? []).filter((m) => m.texto?.trim()).slice(-12);
  if (!historico.length || historico[historico.length - 1].papel !== "usuario")
    return NextResponse.json({ erro: "Sem pergunta." }, { status: 400 });

  const ctx = corpo.contexto;
  const mensagens: Anthropic.Beta.BetaMessageParam[] = historico.map((m) => ({
    role: m.papel === "usuario" ? "user" : "assistant",
    content: m.texto.slice(0, 4000),
  }));
  // O candidato aberto na tela, para "ele", "essa candidata", "aqui".
  if (ctx)
    mensagens.push({
      role: "system",
      content: `Candidato aberto na tela agora: ${ctx.nome}, ${ctx.cargo.toLowerCase()}, ${ctx.uf}, ${ctx.ano} (id ${ctx.id}). Use este id quando a pergunta se referir a "ele", "ela" ou "este candidato".`,
    } as unknown as Anthropic.Beta.BetaMessageParam);

  const client = new Anthropic();
  const consultas = new Set<string>();
  try {
    for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
      const resp = await client.beta.messages.create({
        model: MODELO,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: SISTEMA,
        tools: ferramentas,
        messages: mensagens,
      });

      if (resp.stop_reason === "refusal")
        return NextResponse.json({ resposta: "Não consegui responder a essa pergunta. Tente reformular, perguntando sobre votos, cidades ou candidatos.", consultas: [...consultas] });

      if (resp.stop_reason === "pause_turn") {
        mensagens.push({ role: "assistant", content: resp.content });
        continue;
      }

      const usos = resp.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (resp.stop_reason !== "tool_use" || !usos.length) {
        const texto = resp.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return NextResponse.json({ resposta: texto || "Não obtive resposta.", consultas: [...consultas] });
      }

      mensagens.push({ role: "assistant", content: resp.content });
      const resultados = await Promise.all(
        usos.map(async (u): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          consultas.add(ROTULO[u.name] ?? u.name);
          try {
            const saida = await executar(u.name, (u.input ?? {}) as Entrada);
            return { type: "tool_result", tool_use_id: u.id, content: JSON.stringify(saida ?? null) };
          } catch (err) {
            return { type: "tool_result", tool_use_id: u.id, content: `Erro: ${(err as Error).message}`, is_error: true };
          }
        }),
      );
      mensagens.push({ role: "user", content: resultados });
    }
    return NextResponse.json({ resposta: "A pergunta pediu consultas demais. Tente dividir em perguntas menores.", consultas: [...consultas] });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return NextResponse.json({ erro: "Muitas perguntas ao mesmo tempo. Tente em instantes." }, { status: 429 });
    if (err instanceof Anthropic.AuthenticationError) return NextResponse.json({ erro: "A chave da IA na Vercel é inválida." }, { status: 502 });
    if (err instanceof Anthropic.APIError) return NextResponse.json({ erro: `Erro da IA (${err.status}).` }, { status: 502 });
    return NextResponse.json({ erro: "Falha de rede ao chamar a IA." }, { status: 502 });
  }
}
