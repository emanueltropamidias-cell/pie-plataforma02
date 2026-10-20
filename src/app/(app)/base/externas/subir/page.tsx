import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/ui/pagina";
import { SubirBase } from "@/components/base/subir-base";
import type { BaseExterna } from "@/lib/bases-externas";

export const dynamic = "force-dynamic";

// Só a coordenação sobe base. O banco recusa de qualquer jeito
// (`base_externa_criar` exige perfil_admin); aqui é para ninguém preencher a
// tela inteira e só descobrir no botão.
export default async function SubirBasePagina() {
  const supabase = await createClient();
  const [{ data: admin }, { data: lista }] = await Promise.all([
    supabase.rpc("perfil_admin"),
    supabase.rpc("bases_externas_lista"),
  ]);
  if (!admin) redirect("/base/externas");

  // Para acrescentar num que já existe — base de candidato chega em pedaços.
  const bases = ((lista ?? []) as BaseExterna[]).map((b) => ({
    id: b.id,
    nome: b.nome,
    pessoas: b.pessoas,
  }));

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-6 py-7 md:px-8">
      <Cabecalho
        voltar="/base/externas"
        sobretitulo="Outras bases"
        titulo="Subir base"
        descricao="A base entra numa gaveta própria. Não vira cadastro da campanha, não entra no mapa, na fila nem no disparo."
      />
      <SubirBase bases={bases} />
    </div>
  );
}
