import { NextResponse } from "next/server";
import { createClient as criarServico, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { acharConsultora, lerPerfil, type Consultora } from "@/lib/redes/instagram";

// Coleta o Instagram dos perfis de `redes_perfis` (migração 0061).
//
//   GET   o cron diário da Vercel (vercel.json), pelo CRON_SECRET. Coleta os
//         perfis há mais tempo sem coleta, um lote por execução.
//   POST  a equipe, pela sessão. Corpo:
//           { "acao": "diagnostico" }                 o token acha a consultora?
//           { "acao": "coletar", "usuarios": [...] }  esses perfis agora
//           { "acao": "coletar" }                     um lote, como o cron
//
// O token só existe no servidor (segredo na Vercel): é por isso que a coleta
// mora aqui e não num script local.

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// 5 em paralelo, até 40 por execução: cabe nos 60 s e longe do limite por hora
// da conta consultora (a Meta conta por conta, ~200 chamadas/hora).
const LOTE = 40;
const PARALELO = 5;

function servico(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && chave ? criarServico(url, chave, { auth: { persistSession: false } }) : null;
}

function hojeBR() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

async function coletarUm(db: SupabaseClient, c: Consultora, usuario: string) {
  try {
    const p = await lerPerfil(c, usuario);
    const posts = (p.media?.data ?? []).map((m) => ({
      id: m.id,
      usuario,
      publicado_em: m.timestamp,
      tipo: m.media_type ?? null,
      produto: m.media_product_type ?? null,
      legenda: m.caption ?? null,
      curtidas: m.like_count ?? null,
      comentarios: m.comments_count ?? null,
      link: m.permalink ?? null,
      atualizado_em: new Date().toISOString(),
    }));
    const r1 = await db.from("redes_fotos").upsert({
      usuario,
      dia: hojeBR(),
      seguidores: p.followers_count ?? null,
      seguindo: p.follows_count ?? null,
      posts: p.media_count ?? null,
    });
    if (r1.error) throw new Error(r1.error.message);
    // upsert sem `temas`/`cidades`: a leitura da IA já feita não é apagada.
    if (posts.length) {
      const r2 = await db.from("redes_posts").upsert(posts);
      if (r2.error) throw new Error(r2.error.message);
    }
    await db
      .from("redes_perfis")
      .update({ ig_id: p.id, ultima_coleta: new Date().toISOString(), ultimo_erro: null })
      .eq("usuario", usuario);
    return { usuario, ok: true, seguidores: p.followers_count ?? null, posts: posts.length };
  } catch (e) {
    const erro = (e as Error).message;
    await db
      .from("redes_perfis")
      .update({ ultima_coleta: new Date().toISOString(), ultimo_erro: erro })
      .eq("usuario", usuario);
    return { usuario, ok: false, erro };
  }
}

async function coletar(db: SupabaseClient, usuarios?: string[]) {
  const { consultora, visto } = await acharConsultora(process.env.META_ACCESS_TOKEN);
  if (!consultora)
    return { status: 400, corpo: { erro: "Nenhuma conta profissional do Instagram ligada ao token.", visto } };

  let lista = (usuarios ?? []).map((u) => u.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
  if (!lista.length) {
    const { data, error } = await db
      .from("redes_perfis")
      .select("usuario")
      .order("ultima_coleta", { ascending: true, nullsFirst: true })
      .limit(LOTE);
    if (error) return { status: 500, corpo: { erro: error.message } };
    lista = (data ?? []).map((r) => r.usuario as string);
  }
  lista = lista.slice(0, LOTE);

  const resultados = [];
  for (let i = 0; i < lista.length; i += PARALELO)
    resultados.push(...(await Promise.all(lista.slice(i, i + PARALELO).map((u) => coletarUm(db, consultora, u)))));

  const falhas = resultados.filter((r) => !r.ok).length;
  return {
    status: 200,
    corpo: { ok: falhas === 0, consultora: consultora.pagina, coletados: resultados.length, falhas, resultados },
  };
}

// ── O cron ──────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`)
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const db = servico();
  if (!db) return NextResponse.json({ erro: "Falta SUPABASE_SERVICE_ROLE_KEY na Vercel." }, { status: 500 });
  const r = await coletar(db);
  return NextResponse.json(r.corpo, { status: r.status });
}

// ── A equipe ────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  const { data: equipe } = await supabase.rpc("perfil_equipe");
  if (!equipe) return NextResponse.json({ erro: "Só a equipe coleta redes sociais." }, { status: 403 });

  let body: { acao?: string; usuarios?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    /* sem corpo: um lote */
  }

  if (body.acao === "diagnostico") {
    const { consultora, visto } = await acharConsultora(process.env.META_ACCESS_TOKEN);
    return NextResponse.json({
      ok: !!consultora,
      consultora: consultora ? { pagina: consultora.pagina, igId: consultora.igId } : null,
      visto,
    });
  }

  const db = servico();
  if (!db) return NextResponse.json({ erro: "Falta SUPABASE_SERVICE_ROLE_KEY na Vercel." }, { status: 500 });
  const r = await coletar(db, body.usuarios);
  return NextResponse.json(r.corpo, { status: r.status });
}
