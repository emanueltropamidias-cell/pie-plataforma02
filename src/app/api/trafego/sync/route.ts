import { moduloAtivo } from "@/lib/modulos";
import { NextResponse } from "next/server";
import { createClient as criarServico } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { lerConta, listarContasDeTodos, type Modo } from "@/lib/trafego/meta";

// Sincroniza o tráfego de TODAS as contas de anúncio que o token enxerga.
//
// ── QUEM CHAMA ──────────────────────────────────────────────────────────────
//
//   GET   o cron da Vercel. `?modo=hoje` de 5 em 5 minutos, `?modo=recente`
//         uma vez por dia (ver vercel.json). Autentica pelo CRON_SECRET.
//   POST  o botão "Atualizar agora" da tela. Autentica pela sessão, e só a
//         equipe (a mesma trava de `trafego_gravar`).
//
// ── O QUE MUDOU EM RELAÇÃO À ROTA ANTIGA ────────────────────────────────────
//
// A antiga lia UMA conta (META_AD_ACCOUNT_ID), casava métrica com campanha pelo
// NOME, puxava três anos a cada clique e apagava `where fonte = 'meta'` — com
// cinco contas, um clique apagaria as outras quatro. Ficou parada de 06/09 a
// 15/09 porque dependia de alguém clicar.
//
// Agora a leitura é `src/lib/trafego/meta.ts` e a gravação é `trafego_gravar()`
// no banco, as mesmas que o `scripts/sync-trafego.mjs` usa. Esta rota só escolhe
// o modo, autentica e percorre as contas.
//
// ── POR QUE NÃO HÁ MODO "COMPLETO" AQUI ─────────────────────────────────────
//
// Três anos das cinco contas levam uns dois minutos — a CA 02 sozinha, 34
// segundos. Numa função cobrada por execução, na mesma Vercel que já pausou o
// projeto por uso, isso fica no script, rodado quando precisar.

export const maxDuration = 60;
export const dynamic = "force-dynamic";

type Resultado = {
  conta: string;
  ok: boolean;
  segundos: number;
  erro?: string;
  gravado?: Record<string, number>;
  arte?: Record<string, number>;
  avisos?: string[];
};

async function sincronizar(
  modo: Modo,
  db: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> },
) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return { status: 400, corpo: { erro: "META_ACCESS_TOKEN não está configurado na Vercel." } };

  let contas;
  try {
    // Vários tokens (um por BM): conta de outra BM não aparece no token desta.
    contas = await listarContasDeTodos(token);
  } catch (e) {
    return { status: 502, corpo: { erro: `A Meta não listou as contas: ${(e as Error).message}` } };
  }

  // As contas em paralelo: o limite de chamadas da Meta é POR CONTA, então
  // cinco ao mesmo tempo não disputam o mesmo teto. Em série, o modo "recente"
  // das cinco passaria dos 60 segundos da função.
  const resultados: Resultado[] = await Promise.all(
    contas.map(async (conta): Promise<Resultado> => {
      const t0 = Date.now();
      try {
        const { doc, diagnostico } = await lerConta(conta, conta.token ?? token, modo);
        const { data, error } = await db.rpc("trafego_gravar", { p: doc });
        if (error) throw new Error(error.message);
        return {
          conta: conta.nome,
          ok: true,
          segundos: (Date.now() - t0) / 1000,
          gravado: data as Record<string, number>,
          arte: diagnostico.arte,
          avisos: diagnostico.avisos.length ? diagnostico.avisos : undefined,
        };
      } catch (e) {
        const erro = (e as Error).message;
        // O erro fica NA CONTA, e o que ela já tinha no banco não é tocado. É a
        // diferença entre "CA 03 travou às 14h" na tela e uma semana de número
        // velho sem ninguém saber, que foi o que aconteceu até 15/09.
        await db.rpc("trafego_registrar_erro", { p_conta: conta.id, p_nome: conta.nome, p_erro: erro });
        return { conta: conta.nome, ok: false, segundos: (Date.now() - t0) / 1000, erro };
      }
    }),
  );

  const falhas = resultados.filter((r) => !r.ok).length;
  return {
    status: falhas === resultados.length ? 502 : 200,
    corpo: { ok: falhas === 0, modo, contas: resultados.length, falhas, resultados },
  };
}

// ── O cron ──────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  // Instalação sem tráfego pago (src/lib/modulos.ts): o cron da Vercel é do
  // repositório e roda em todos os deploys, mas aqui não há conta para ler.
  if (!moduloAtivo("trafego")) return NextResponse.json({ ignorado: "tráfego desligado nesta instalação" });

  // Sem CRON_SECRET configurado, a rota RECUSA — e não libera. Aberta, qualquer
  // um que achasse o endereço dispararia sync em laço, na conta da Vercel que já
  // foi pausada uma vez por uso.
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`)
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave)
    return NextResponse.json({ erro: "Falta SUPABASE_SERVICE_ROLE_KEY na Vercel." }, { status: 500 });

  const modo = new URL(req.url).searchParams.get("modo") === "recente" ? "recente" : "hoje";
  const db = criarServico(url, chave, { auth: { persistSession: false } });
  const r = await sincronizar(modo, db);
  return NextResponse.json(r.corpo, { status: r.status });
}

// ── O botão ─────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  const { data: equipe } = await supabase.rpc("perfil_equipe");
  if (!equipe) return NextResponse.json({ erro: "Só a equipe sincroniza o tráfego." }, { status: 403 });

  // `since`/`until` que a tela antiga mandava são ignorados de propósito: o
  // período escolhido na tela é um RECORTE do que já está no banco (três anos),
  // não um pedido de sync. Foi mandar o recorte para a Meta que obrigava a rota
  // antiga a ter a regra frágil de "não reescrever agregado quando há filtro".
  let modo: Modo = "hoje";
  try {
    const body = await req.json();
    if (body?.modo === "recente") modo = "recente";
  } catch {
    /* sem corpo: hoje */
  }

  const r = await sincronizar(modo, supabase);
  return NextResponse.json(r.corpo, { status: r.status });
}
