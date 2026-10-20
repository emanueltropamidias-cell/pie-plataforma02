import { createClient } from "@/lib/supabase/server";
import { RaizContinuaPlacar } from "@/components/metas/raiz-continua-placar";

export default async function MetasPage() {
  const supabase = await createClient();
  // ── A CONTA É FEITA NO BANCO ──────────────────────────────────────────────
  //
  // Antes isto puxava as 6.531 lideranças INTEIRAS — sete viagens e mais de um
  // megabyte na rede — para montar um `{cidade: quantos}`. Um `group by`.
  //
  // O `paginar` que estava aqui existia por um motivo certo: o PostgREST
  // devolve mil linhas e NÃO AVISA, então a meta de cada cidade sairia
  // calculada sobre uma base cortada e pareceria plausível na tela. Só que a
  // defesa custava uma viagem por mil linhas, e ficava mais lenta a cada
  // cadastro novo. Contando no banco, o custo para de crescer com a base.
  //
  // A chave vem sem acento e em minúscula do próprio banco — a mesma regra do
  // `normCidade`, que é como esta tela cruza com a lista de metas.
  const { data } = await supabase.rpc("cadastros_por_cidade");
  const cadastros = (data ?? {}) as Record<string, number>;

  return <RaizContinuaPlacar cadastros={cadastros} />;
}
