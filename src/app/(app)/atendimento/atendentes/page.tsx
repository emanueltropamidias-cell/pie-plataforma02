import { createClient } from "@/lib/supabase/server";
import { Atendentes, type Linha } from "@/components/atendentes/atendentes";

// Quem está no plantão.
//
// SEM ESTA TELA, A DISTRIBUIÇÃO AUTOMÁTICA NÃO TEM PARA QUEM DISTRIBUIR.
//
// O webhook lê `carga_atendentes` e chama `escolherAtendente`. Com a tabela
// vazia a escolha é `null` — legitimamente, e a conversa fica sem dono. Isso é
// certo para uma ou outra; a 600–1000 leads por dia com ninguém cadastrado, é
// a fila inteira num monte só, e as cinco atendentes olhando para a mesma pilha
// sem saber de quem é o quê.
//
// A conta de login e a linha de plantão são coisas separadas de propósito: uma
// diz quem PODE entrar, a outra diz quem está recebendo AGORA. Tirar alguém do
// plantão numa tarde não pode significar apagar a conta dela.

export const dynamic = "force-dynamic";

export default async function AtendentesPage() {
  const supabase = await createClient();

  const { data: podeMexer } = await supabase.rpc("perfil_supervisao");
  if (!podeMexer) {
    return (
      <div className="mx-auto max-w-[560px] px-6 py-16 text-center">
        <h1 className="text-[19px] font-bold text-tinta-900">Sem permissão</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-tinta-500">
          Definir quem está no plantão é da coordenação. Fale com um supervisor.
        </p>
      </div>
    );
  }

  // Todas as contas que PODEM atender, e a linha de plantão de cada uma quando
  // existe. É o cruzamento que responde "quem falta cadastrar?" — sem ele a
  // supervisora precisaria comparar duas listas na cabeça.
  const [{ data: contas }, { data: emPlantao }, { data: cargas }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, nome, role")
        .in("role", ["atendente", "supervisor", "admin", "usuario"])
        .eq("status", "ativo")
        .order("email"),
      supabase
        .from("atendentes")
        .select("id, nome, disponivel, capacidade, demandas"),
      supabase.from("carga_atendentes").select("id, abertas, esperando"),
    ]);

  const porId = new Map((emPlantao ?? []).map((a) => [a.id, a]));
  const cargaPorId = new Map((cargas ?? []).map((c) => [c.id, c]));

  const linhas: Linha[] = (contas ?? []).map((c) => {
    const a = porId.get(c.id);
    const carga = cargaPorId.get(c.id);
    return {
      id: c.id,
      email: c.email ?? "",
      papel: c.role ?? "usuario",
      cadastrado: !!a,
      nome: a?.nome ?? (c.nome || (c.email ?? "").split("@")[0]),
      abertas: carga?.abertas ?? 0,
      esperando: carga?.esperando ?? 0,
    };
  });

  return <Atendentes linhas={linhas} />;
}
