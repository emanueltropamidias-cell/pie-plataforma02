import { NextResponse } from "next/server";
import { createClient as criarServico } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Excluir uma conta de verdade.
//
// ── DUAS ETAPAS, SEMPRE ─────────────────────────────────────────────────────
//
// A primeira chamada não apaga nada: devolve o RASTRO da pessoa — quantas
// conversas ela atendeu, quantas mensagens mandou, quantas demandas abriu. A
// segunda, com `confirmado`, executa.
//
// Não é cerimônia. Apagar uma conta com histórico não apaga só a conta: as
// conversas que ela atendia voltam para a fila sem dono, e as mensagens que ela
// enviou perdem o autor — o registro passa a dizer que a campanha falou, sem
// dizer quem. Isso é irreversível, e quem clica precisa ver o tamanho antes.
//
// ── TRÊS COISAS QUEBRAM SE NÃO FOREM TRATADAS ANTES ────────────────────────
//
//   · `demandas.criado_por` aponta para auth.users SEM `on delete`. O banco
//     RECUSA a exclusão de quem abriu demanda, com erro de chave estrangeira
//     que não explica nada a quem está na tela;
//   · `liderancas.auth_uid` não tem chave estrangeira nenhuma. Apagar a conta
//     deixaria o campo apontando para um usuário que não existe, e a liderança
//     perderia o portal sem ninguém entender por quê;
//   · o perfil pode não cair junto com o usuário, dependendo de como a tabela
//     foi criada. Aí a pessoa some do login e continua na lista.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  const { data: eu } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (eu?.role !== "admin" || eu?.status !== "ativo") {
    return NextResponse.json(
      { erro: "Só administrador exclui conta." },
      { status: 403 },
    );
  }

  let corpo: { id?: string; confirmado?: boolean };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
  }

  const alvo = corpo.id ?? "";
  if (!alvo) return NextResponse.json({ erro: "Falta o id." }, { status: 400 });

  // Apagar a própria conta derruba quem está apagando no meio do gesto, e
  // deixa a plataforma possivelmente sem administrador.
  if (alvo === user.id) {
    return NextResponse.json(
      { erro: "Você não pode excluir a própria conta." },
      { status: 400 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    return NextResponse.json(
      { erro: "Falta SUPABASE_SERVICE_ROLE_KEY na Vercel." },
      { status: 500 },
    );
  }
  const admin = criarServico(url, chave, { auth: { persistSession: false } });

  const { data: perfil } = await admin
    .from("profiles")
    .select("id, nome, email, role, status")
    .eq("id", alvo)
    .maybeSingle();

  if (!perfil)
    return NextResponse.json(
      { erro: "Conta não encontrada." },
      { status: 404 },
    );

  // O ÚLTIMO ADMIN NÃO SAI. Sem administrador, ninguém cria conta, ninguém muda
  // papel, ninguém religa o WhatsApp — e não há tela para consertar isso.
  if (perfil.role === "admin") {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("status", "ativo");
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        {
          erro: "Esta é a última conta de administrador ativa. Promova outra antes.",
        },
        { status: 400 },
      );
    }
  }

  // ── o rastro ──────────────────────────────────────────────────────────────
  const [conversas, mensagens, demandas, atribuicoes, liderancas] =
    await Promise.all([
      admin
        .from("conversas")
        .select("id", { count: "exact", head: true })
        .eq("atendente_id", alvo),
      admin
        .from("mensagens")
        .select("id", { count: "exact", head: true })
        .eq("enviada_por", alvo),
      admin
        .from("demandas")
        .select("id", { count: "exact", head: true })
        .eq("criado_por", alvo),
      admin
        .from("atribuicoes")
        .select("id", { count: "exact", head: true })
        .eq("para_atendente", alvo),
      admin
        .from("liderancas")
        .select("id", { count: "exact", head: true })
        .eq("auth_uid", alvo),
    ]);

  const rastro = {
    conversas: conversas.count ?? 0,
    mensagens: mensagens.count ?? 0,
    // `demandas` pode não existir no banco ainda; erro de tabela vira zero em
    // vez de derrubar a prévia inteira.
    demandas: demandas.error ? 0 : (demandas.count ?? 0),
    atribuicoes: atribuicoes.count ?? 0,
    liderancas: liderancas.count ?? 0,
  };

  if (!corpo.confirmado) {
    return NextResponse.json({
      previa: true,
      nome: perfil.nome ?? perfil.email,
      papel: perfil.role,
      rastro,
      temRastro:
        rastro.conversas +
          rastro.mensagens +
          rastro.demandas +
          rastro.atribuicoes >
        0,
    });
  }

  // ── executa ───────────────────────────────────────────────────────────────
  //
  // A ordem importa. Soltar as amarras ANTES de apagar: o banco recusa a
  // exclusão enquanto `demandas.criado_por` apontar para o usuário, e
  // `liderancas.auth_uid` ficaria apontando para o vazio depois.
  if (rastro.demandas > 0) {
    await admin
      .from("demandas")
      .update({ criado_por: null })
      .eq("criado_por", alvo);
  }
  if (rastro.liderancas > 0) {
    await admin
      .from("liderancas")
      .update({ auth_uid: null })
      .eq("auth_uid", alvo);
  }

  const { error: erroAuth } = await admin.auth.admin.deleteUser(alvo);
  if (erroAuth) {
    return NextResponse.json(
      { erro: `Não consegui excluir o login: ${erroAuth.message}` },
      { status: 500 },
    );
  }

  // Explícito, porque não dá para contar com o efeito em cascata: se a tabela
  // `profiles` não foi criada com `on delete cascade`, a pessoa sumiria do
  // login e continuaria na lista, o que é pior que não ter apagado.
  await admin.from("profiles").delete().eq("id", alvo);

  return NextResponse.json({
    ok: true,
    nome: perfil.nome ?? perfil.email,
    rastro,
  });
}
