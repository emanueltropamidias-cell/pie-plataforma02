import { createClient } from "@/lib/supabase/server";
import { DemandasClient } from "@/components/demandas/demandas-client";
import type { Demanda } from "@/components/demandas/constantes";
import { FaltaInstalar } from "@/components/falta-instalar";

export default async function DemandasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Se a tabela ainda não foi criada no Supabase, a página abre vazia com o
  // aviso, em vez de quebrar. O SQL está em supabase/historico/demandas.sql.
  const { data: dados, error } = await supabase
    .from("demandas")
    .select(
      "id, municipe_id, municipe_nome, municipio, bairro, titulo, descricao, categoria, prioridade, status, prazo, resposta, resolvida_em, created_at",
    )
    .order("created_at", { ascending: false });
  const demandas = (dados ?? []) as Demanda[];

  const { data: perfil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      {error && (
        <div className="mb-5">
          <FaltaInstalar oQue="A tabela de demandas" />
        </div>
      )}
      <DemandasClient
        demandas={demandas}
        meuId={user?.id ?? ""}
        isAdmin={perfil?.role === "admin"}
      />
    </div>
  );
}
