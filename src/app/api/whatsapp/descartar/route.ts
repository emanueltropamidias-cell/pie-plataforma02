import { NextResponse } from "next/server";

// O ralo dos aparelhos convidados.
//
// A Evolution EXIGE um endereço de webhook ao criar uma instância. Deixar em
// branco não é neutro: ela cai no padrão do servidor, que é o webhook da
// campanha — e aí a conversa particular de quem emprestou o telefone entra na
// fila das atendentes, com nome, foto e mensagem.
//
// Esta rota existe para não deixar isso acontecer. Ela aceita e joga fora.
//
// Não lê o corpo de propósito: o conteúdo é conversa de terceiro, e o melhor
// destino para ele é não passar por lugar nenhum. Sem registro, sem log, sem
// banco.

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ ok: true });
}

// A Evolution testa o endereço com GET em algumas versões; devolver 404 aqui
// faria a criação da instância parecer quebrada.
export async function GET() {
  return NextResponse.json({ ok: true });
}
