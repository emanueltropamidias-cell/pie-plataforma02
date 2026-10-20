import { createClient } from "@/lib/supabase/server";
import { ConversasClient } from "@/components/conversas/conversas-client";
import type { Registro } from "@/components/conversas/registro-dialog";

export default async function ConversasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("registros_disparo")
    .select("id, data, turno, enviados, apoios, outras_devolutivas, restricao, observacoes, criado_por")
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });
  const registros = (data ?? []) as Registro[];

  const { data: perfil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const isAdmin = perfil?.role === "admin";

  // Nome de quem lançou cada registro (respeita o RLS: admin vê todos, demais veem o próprio)
  const idsCriadores = [...new Set(registros.map((r) => r.criado_por).filter(Boolean))] as string[];
  const nomes: Record<string, string> = {};
  if (idsCriadores.length) {
    const { data: perfis } = await supabase
      .from("profiles")
      .select("id, nome, email")
      .in("id", idsCriadores);
    for (const p of perfis ?? []) nomes[p.id] = p.nome || p.email || "Usuário";
  }
  const registrosComNome = registros.map((r) => ({
    ...r,
    criador_nome: r.criado_por ? (nomes[r.criado_por] ?? null) : null,
  }));

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <ConversasClient registros={registrosComNome} meuId={user?.id ?? ""} isAdmin={isAdmin} />
    </div>
  );
}
