import { createClient } from "@/lib/supabase/server";
import { CrmClient } from "@/components/crm/crm-client";
import type { Lideranca } from "@/components/crm/lideranca-dialog";

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ [chave: string]: string | string[] | undefined }>;
}) {
  // `?nova=1` abre o formulário de cadastro já de cara: é o atalho "Cadastrar
  // liderança" da central de Estratégia, e quem clica nele quer cadastrar, não
  // ver a lista primeiro.
  const abrirNova = (await searchParams).nova === "1";
  const supabase = await createClient();
  const { data } = await supabase
    .from("liderancas")
    .select(
      "id, nome, telefone, municipio, bairro, link_code, cod_acesso, votos_comprometidos, mensagem_qr",
    )
    .eq("tipo", "lideranca")
    .order("created_at", { ascending: false })
    // Mil é o teto silencioso do PostgREST. A rede de lideranças ainda não
    // chega perto, mas uma lista que some com gente sem avisar é o defeito que
    // ninguém descobre — some justamente quem entrou primeiro.
    .range(0, 4999);

  const lista = (data ?? []) as Lideranca[];

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <CrmClient liderancas={lista} abrirNova={abrirNova} />
    </div>
  );
}
