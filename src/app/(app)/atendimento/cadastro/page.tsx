import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CadastroRapido } from "@/components/cadastro/cadastro-rapido";

// Cadastro na mão, para quando a integração não está de pé.
//
// Os chips caem, e a Lutiane mostrou que pode ser o número inteiro — não só a
// sessão. A API oficial proíbe campanha política, então não há para onde
// migrar. Esta tela é o que garante que a campanha continua medindo mesmo com
// o WhatsApp fora: a menina atende pelo telefone e cadastra aqui.

export const dynamic = "force-dynamic";

export default async function CadastroPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: pode } = await supabase.rpc("perfil_atendimento");
  if (!pode) redirect("/atendimento");

  const [{ data: perfil }, { data: etiquetas }] = await Promise.all([
    supabase.from("profiles").select("nome").eq("id", user?.id ?? "").maybeSingle(),
    // As MESMAS etiquetas da caixa de entrada. Duas listas separadas viravam
    // duas verdades sobre a mesma equipe assim que alguém criasse uma nova.
    supabase
      .from("tags")
      .select("id, nome, cor, eixo")
      .eq("ativa", true)
      .order("ordem"),
  ]);

  return (
    <CadastroRapido
      etiquetas={etiquetas ?? []}
      euNome={
        perfil?.nome ??
        (user?.user_metadata as { nome?: string } | undefined)?.nome ??
        ""
      }
    />
  );
}
