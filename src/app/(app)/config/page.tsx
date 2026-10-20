import { createClient } from "@/lib/supabase/server";
import { ContaConfig } from "@/components/config/conta-config";
import { GerenciarUsuarios, type Perfil } from "@/components/config/gerenciar-usuarios";

export default async function ConfigPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email ?? "";

  const { data: meuPerfil } = await supabase
    .from("profiles")
    .select("nome, role")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const nomeInicial =
    meuPerfil?.nome ||
    (user?.user_metadata?.nome as string | undefined) ||
    email.split("@")[0] ||
    "";
  const admin = meuPerfil?.role === "admin";

  let usuarios: Perfil[] = [];
  if (admin) {
    const { data } = await supabase
      .from("profiles")
      .select("id, nome, email, role, status")
      .order("created_at", { ascending: true });
    usuarios = (data ?? []) as Perfil[];
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-tema">Sistema</span>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-tinta-900">Configurações</h1>
      <p className="mt-1 text-sm text-tinta-500">Sua conta e ajustes da plataforma.</p>

      <div className="mt-8 grid max-w-2xl gap-6">
        {admin && <GerenciarUsuarios usuarios={usuarios} meuId={user?.id ?? ""} />}
      </div>

      <ContaConfig email={email} nomeInicial={nomeInicial} />
    </div>
  );
}
