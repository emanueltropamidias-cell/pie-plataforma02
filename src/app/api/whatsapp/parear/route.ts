import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  configurada,
  estadoDaConexao,
  pedirQR,
  desconectar,
  criarInstancia,
  apontarWebhook,
} from "@/lib/evolution";

// Parear um número, de dentro do PIE.
//
// ── POR QUE NÃO MANDAR A PESSOA NO PAINEL DA EVOLUTION ──────────────────────
//
// Porque o painel dela pede a chave da API, e essa chave manda mensagem pelo
// WhatsApp da campanha. Dar acesso a ele para quem vai só ler um QR é entregar
// a chave inteira para um gesto de dez segundos.
//
// E porque lá o webhook é um segundo passo separado, fácil de esquecer — e
// esquecer não dá erro nenhum: o número conecta, recebe, e os leads somem em
// silêncio.
//
// Aqui a criação já sai com o webhook apontado, e a chave nunca sai do
// servidor.
//
// Só supervisão. A atendente não parea o número da campanha.

export const dynamic = "force-dynamic";

/** O endereço que a Evolution vai chamar. Precisa carregar o segredo. */
function enderecoDoWebhook(req: Request) {
  const segredo = process.env.EVOLUTION_WEBHOOK_SEGREDO;
  if (!segredo) return null;
  // A origem sai do próprio pedido: em produção é o domínio da campanha, em
  // pré-visualização é o da Vercel. Fixar no código faria o webhook de um
  // ambiente apontar para o outro.
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(req.url).origin;
  return `${base.replace(/\/$/, "")}/api/whatsapp/evolution?k=${encodeURIComponent(segredo)}`;
}

async function podeMexer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.rpc("perfil_supervisao");
  return data === true;
}

/** O nome da instância tem de estar CADASTRADO. Sem isto, qualquer supervisor
 *  criaria instância solta no servidor, fora do controle do painel. */
async function instanciaCadastrada(nome: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("numeros")
    .select("instancia")
    .eq("instancia", nome)
    .maybeSingle();
  return !!data;
}

function normalizarQR(cru: string | undefined) {
  if (!cru) return null;
  // A Evolution devolve com o prefixo `data:` em algumas versões e sem ele em
  // outras. Errar isso mostra uma imagem quebrada que não explica o motivo.
  return cru.startsWith("data:") ? cru : `data:image/png;base64,${cru}`;
}

export async function GET(req: Request) {
  if (!(await podeMexer()))
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  if (!configurada())
    return NextResponse.json({ erro: "Evolution não configurada." }, { status: 400 });

  const inst = new URL(req.url).searchParams.get("i")?.trim();
  if (!inst) return NextResponse.json({ erro: "Falta o número." }, { status: 400 });

  const r = await estadoDaConexao(inst);
  return NextResponse.json({
    estado: r.ok ? (r.dados.instance?.state ?? "desconhecido") : "erro",
    erro: r.ok ? null : r.erro,
  });
}

export async function POST(req: Request) {
  if (!(await podeMexer()))
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  if (!configurada())
    return NextResponse.json({ erro: "Evolution não configurada." }, { status: 400 });

  let corpo: { acao?: string; instancia?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
  }

  const inst = (corpo.instancia ?? "").trim();
  const acao = corpo.acao ?? "";

  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(inst))
    return NextResponse.json({ erro: "Nome de número inválido." }, { status: 400 });

  if (!(await instanciaCadastrada(inst)))
    return NextResponse.json(
      { erro: "Esse número não está cadastrado no PIE." },
      { status: 404 },
    );

  const webhook = enderecoDoWebhook(req);
  if (!webhook)
    return NextResponse.json(
      { erro: "Falta EVOLUTION_WEBHOOK_SEGREDO na Vercel." },
      { status: 500 },
    );

  // ── conectar: cria se precisar, e devolve o QR ───────────────────────────
  if (acao === "qr") {
    // Primeiro tenta conectar direto: se a instância já existe, este é o
    // caminho curto e não se toca em nada.
    let r = await pedirQR(inst);

    if (!r.ok) {
      // Não existe ainda. Cria — já com o webhook, que é o passo que ninguém
      // lembra de fazer separado.
      const criada = await criarInstancia(inst, webhook);
      if (!criada.ok)
        return NextResponse.json(
          { erro: `Não consegui criar o número: ${criada.erro}` },
          { status: 502 },
        );
      r = await pedirQR(inst);
      if (!r.ok)
        return NextResponse.json({ erro: r.erro }, { status: 502 });
    } else {
      // Já existia: garante que o webhook está apontando para cá. Instância
      // criada à mão no painel costuma estar sem, e é exatamente o caso em que
      // tudo parece certo e nada chega.
      await apontarWebhook(inst, webhook);
    }

    return NextResponse.json({
      imagem: normalizarQR(r.dados.base64),
      pareamento: r.dados.pairingCode ?? null,
    });
  }

  // ── corrigir só o webhook ────────────────────────────────────────────────
  if (acao === "webhook") {
    const r = await apontarWebhook(inst, webhook);
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  if (acao === "desconectar") {
    const r = await desconectar(inst);
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });
}
