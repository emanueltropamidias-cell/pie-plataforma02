import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Diz qual commit está realmente no ar. Serve para responder em 10 segundos
// a pergunta "o deploy chegou?".
//
// Exige login. Já esteve aberta, e entregava a mensagem inteira do commit e o
// host do banco para qualquer um — ver a nota dentro do GET.
// Abrir em: /api/versao, com sessão

export const dynamic = "force-dynamic";

/**
 * Cronometra uma chamada ao banco e diz se a função de agregado já existe.
 * Sem valor nenhum de dado — só o tempo e se está instalada.
 */
async function medir(fn: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) return { existe: false, ms: 0, nota: "sem configuração" };
  const inicio = Date.now();
  try {
    const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: chave,
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      cache: "no-store",
    });
    const ms = Date.now() - inicio;
    // 404 com PGRST202 é o Postgres dizendo "essa função não existe aqui".
    if (r.status === 404)
      return { existe: false, ms, nota: "faltam as migrações de supabase/migrations/" };
    return { existe: true, ms, http: r.status };
  } catch {
    return { existe: false, ms: Date.now() - inicio, nota: "falha de rede" };
  }
}

/** Ida e volta mais barata possível até o banco: mede só a distância. */
async function pingBanco() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) return null;
  const tempos: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = Date.now();
    try {
      await fetch(`${url}/rest/v1/`, {
        headers: { apikey: chave },
        cache: "no-store",
      });
      tempos.push(Date.now() - t);
    } catch {
      /* ignora a tentativa que falhar */
    }
  }
  return tempos.length ? Math.min(...tempos) : null;
}

export async function GET() {
  // ROTA DE DIAGNÓSTICO, NÃO DE VITRINE. Ela estava aberta a qualquer um na
  // internet e entregava, sem pedir nada: a mensagem inteira do último commit
  // (nota interna da equipe), o host do projeto no Supabase, a região do
  // servidor e quais integrações existem.
  //
  // O host do banco é o que mais pesa. A chave anônima do Supabase é pública
  // por natureza — vive no navegador de quem abre a plataforma —, então quem
  // junta as duas fala direto com a API do banco. A partir daí a ÚNICA defesa
  // que resta é a RLS de cada tabela. Publicar o endereço do cofre não abre o
  // cofre, mas tira do atacante o trabalho de procurá-lo.
  //
  // Agora responde só para quem está logado. Ninguém no código a chamava: é
  // ferramenta de conferência manual, e conferência manual se faz logado.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { erro: "Faça login para ver o diagnóstico." },
      { status: 401 },
    );
  }

  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const [territorio, geral, pingMs] = await Promise.all([
    medir("painel_territorio"),
    medir("resumo_geral"),
    pingBanco(),
  ]);
  return NextResponse.json({
    commit: sha ? sha.slice(0, 7) : "local",
    mensagem: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    ambiente: process.env.VERCEL_ENV ?? "local",
    agora: new Date().toISOString(),
    // Só diz se a variável EXISTE — nunca o valor. Serve para confirmar
    // configuração sem precisar entrar no painel nem expor segredo.
    configurado: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      meta_token: !!process.env.META_ACCESS_TOKEN,
      // Sem ele o cron do tráfego é recusado de propósito, e a aba para no
      // último sync manual. Substitui `meta_conta`: o PIE deixou de ler uma
      // conta fixa e lê todas as que o token enxerga.
      cron_secret: !!process.env.CRON_SECRET,
      supabase_service: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      import_token: !!process.env.IMPORT_TOKEN,

      // Evolution API, no VPS. Sem as quatro o CRM de atendimento não recebe
      // mensagem nenhuma — e não avisa, porque o webhook responde 200 para não
      // ser desligado do outro lado.
      evolution_url: !!process.env.EVOLUTION_URL,
      evolution_api_key: !!process.env.EVOLUTION_API_KEY,
      evolution_instancia: !!process.env.EVOLUTION_INSTANCIA,
      evolution_webhook_segredo: !!process.env.EVOLUTION_WEBHOOK_SEGREDO,
    },
    // Se `existe` for falso, as telas ainda estão no caminho lento.
    banco: { painel_territorio: territorio, resumo_geral: geral },
    // Onde roda o servidor e quanto custa cada ida ao banco. Se o ping for
    // alto, o problema é distância — nenhuma consulta melhora isso.
    rede: {
      regiao_vercel: process.env.VERCEL_REGION ?? null,
      banco_host:
        (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace("https://", "") ||
        null,
      ping_ms: pingMs,
    },
  });
}
