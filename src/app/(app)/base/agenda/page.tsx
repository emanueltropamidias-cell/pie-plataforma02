import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/ui/pagina";
import { PuxarAgenda } from "@/components/base/puxar-agenda";

// Importar a agenda exportada de um celular e transformá-la numa base.
//
// Só coordenação: a agenda inteira de um terceiro passa por aqui. Não é tela
// de atendente.

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const supabase = await createClient();
  const { data: admin } = await supabase.rpc("perfil_admin");
  if (!admin) redirect("/base/externas");

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-6 py-7 md:px-8">
      <Cabecalho
        voltar="/base/externas"
        sobretitulo="Base"
        titulo="Importar agenda"
        descricao="A pessoa exporta a agenda no celular dela e te manda o arquivo. Ele é limpo aqui e vira uma base separada."
      />
      <PuxarAgenda />
    </div>
  );
}
