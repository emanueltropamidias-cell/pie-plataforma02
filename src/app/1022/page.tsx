import { createClient } from "@supabase/supabase-js";
import { Pagina1022 } from "./pagina";

// O endereço do grupo vem do banco, da linha `grupo-1022` em `links`.
//
// ── POR QUE NÃO FICA ESCRITO NA PÁGINA ──────────────────────────────────────
//
// Grupo de WhatsApp trava em 1.024 pessoas. Cheio, o link para de aceitar
// entrada SEM avisar quem clicou: a pessoa toca no botão, o WhatsApp abre, e
// ela vê um aviso em vez do grupo. A campanha continuaria pagando anúncio para
// mandar gente numa porta fechada, e nada na plataforma acusaria.
//
// Lendo do banco, trocar o grupo é editar um campo na tela de Links. Escrito
// aqui, era um deploy — e alguém precisaria lembrar de pedir.
//
// É a MESMA linha que conta os cliques (migração 0051). Um fato, um lugar: o
// endereço que a página usa e o endereço que a contagem representa não têm
// como discordar.
//
// ── E SE O BANCO NÃO RESPONDER ──────────────────────────────────────────────
//
// Cai no endereço de reserva, que é o grupo de hoje. A página nunca fica sem
// botão: melhor um link possivelmente velho que um convite morto no meio do
// cartaz.

const RESERVA = "https://chat.whatsapp.com/FWGmkA7uEgL7gj16QSmshK";

// Revalida de hora em hora. A página é estática e é ela que recebe o anúncio:
// buscar no banco a cada visita colocaria o Supabase no caminho de todo mundo
// que clica no Facebook, para ler um campo que muda uma vez por mês.
export const revalidate = 3600;

async function endereçoDoGrupo(): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return RESERVA;

  try {
    const db = createClient(url, chave, { auth: { persistSession: false } });
    const { data } = await db
      .from("links")
      .select("destino, ativo")
      .eq("slug", "grupo-1022")
      .maybeSingle();

    if (data?.ativo && data.destino?.trim()) return data.destino.trim();
  } catch {
    // segue com a reserva
  }
  return RESERVA;
}

export default async function Page() {
  return <Pagina1022 grupo={await endereçoDoGrupo()} />;
}
