import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { contaVe, type Modulo } from "@/lib/modulos";

// A conta logada, lida UMA vez por requisição (o layout e a página pedem a
// mesma coisa; `cache` evita a segunda ida ao banco).
//
// Existe para as páginas esconderem atalhos de abas que a conta não tem: a
// trava de verdade está no layout, mas um atalho que leva a uma tela proibida
// e devolve a pessoa para outro lugar parece defeito.
export const contaAtual = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { role: null, modulos: null };
  const { data } = await supabase.from("profiles").select("role, modulos").eq("id", user.id).maybeSingle();
  return { role: (data?.role as string | null) ?? null, modulos: (data?.modulos as string[] | null) ?? null };
});

/** A conta logada alcança esta aba? (instalação + papel + abas marcadas) */
export async function contaLogadaVe(m: Modulo) {
  return contaVe(m, await contaAtual());
}
