import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";

export default async function PendentePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Se já foi aprovado, manda pro dashboard.
  const { data: perfil } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();
  if (perfil?.status === "ativo") redirect("/dashboard");

  // Sem linha em profiles, a pessoa fica num limbo: ela vê "aguardando
  // aprovação" e o administrador não vê ninguém para aprovar. Cria a linha aqui
  // para que ela apareça na lista de Configurações. Conflito é esperado (duas
  // abas, prefetch) e por isso é ignorado — a chave primária resolve o empate.
  if (!perfil) {
    await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email ?? null,
        nome:
          (user.user_metadata?.nome as string | undefined) ||
          (user.user_metadata?.full_name as string | undefined) ||
          (user.email ?? "").split("@")[0] ||
          null,
        status: "pendente",
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-6 text-center">
      <div className="max-w-md">
        <span className="inline-block rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-amber-700">
          Aguardando aprovação
        </span>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-zinc-900">
          Conta em análise ⏳
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-500">
          Sua conta foi criada com sucesso e está <b>aguardando a aprovação</b> de um
          administrador da Talita Oliveira. Assim que for liberada, você entra normalmente.
        </p>
        <div className="mt-6">
          <LogoutButton className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900" />
        </div>
      </div>
    </main>
  );
}
