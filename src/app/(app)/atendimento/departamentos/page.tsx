import { createClient } from "@/lib/supabase/server";
import {
  Departamentos,
  type Setor,
} from "@/components/departamentos/departamentos";

// Os setores do gabinete.
//
// Departamento não é demanda. Demanda é o que a PESSOA pediu — saúde,
// jurídico, material — e uma pessoa pode ter várias. Departamento é qual SETOR
// está com a conversa agora, e é um só por vez.
//
// Alguém do Gabinete Salvador atende pedido de saúde e de material; alguém do
// Interior atende os mesmos pedidos, em outra região. Misturar os dois faria o
// relatório de demanda virar relatório de equipe.

export const dynamic = "force-dynamic";

export default async function DepartamentosPage() {
  const supabase = await createClient();

  const { data: podeMexer } = await supabase.rpc("perfil_supervisao");
  if (!podeMexer) {
    return (
      <div className="mx-auto max-w-[560px] px-6 py-16 text-center">
        <h1 className="text-[19px] font-bold text-tinta-900">Sem permissão</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-tinta-500">
          Criar setores e definir quem está em cada um é da coordenação. Fale
          com um supervisor.
        </p>
      </div>
    );
  }

  const [{ data: painel, error }, { data: atendentes }, { data: membros }] =
    await Promise.all([
      supabase
        .from("departamentos_painel")
        .select("*")
        .order("ordem")
        .order("nome"),
      supabase.from("atendentes").select("id, nome").order("nome"),
      supabase
        .from("departamento_membros")
        .select("departamento_id, atendente_id"),
    ]);

  const faltaSql = error?.code === "42P01" || error?.code === "PGRST205";

  const porSetor = new Map<number, string[]>();
  for (const m of membros ?? []) {
    const lista = porSetor.get(m.departamento_id) ?? [];
    lista.push(m.atendente_id);
    porSetor.set(m.departamento_id, lista);
  }

  const setores: Setor[] = (painel ?? []).map((d) => ({
    id: d.id,
    nome: d.nome,
    cor: d.cor,
    descricao: d.descricao,
    ativo: d.ativo,
    ordem: d.ordem,
    padrao: d.padrao ?? false,
    auto_atribuir: d.auto_atribuir ?? true,
    sla_resposta_min: d.sla_resposta_min ?? 60,
    palavras_chave: d.palavras_chave ?? [],
    fuso: d.fuso ?? "America/Bahia",
    aberto_agora: d.aberto_agora ?? true,
    membros: d.membros ?? 0,
    abertas: d.abertas ?? 0,
    aguardando: d.aguardando ?? 0,
    foraDoSla: d.fora_do_sla ?? 0,
    turnos: d.turnos ?? 0,
    membroIds: porSetor.get(d.id) ?? [],
  }));

  return (
    <Departamentos
      setores={setores}
      atendentes={atendentes ?? []}
      faltaSql={faltaSql}
    />
  );
}
