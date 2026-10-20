import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lerTerritorio } from "@/lib/painel-territorio";

// Os municípios com seus bairros, para o mapa.
//
// Vinha junto com a primeira carga da tela de Munícipes, mesmo para quem só
// queria ver a lista: eram centenas de linhas viajando à toa em toda abertura.
// Agora só sai daqui quando alguém abre a aba do mapa.

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ mapa: [] }, { status: 401 });

  const territorio = await lerTerritorio(supabase);
  return NextResponse.json({ mapa: territorio.mapa });
}
