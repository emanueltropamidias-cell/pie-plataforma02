import { createClient } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/ui/pagina";
import { Etiquetario, type Linha } from "@/components/etiquetas/etiquetario";
import { FaltaInstalar } from "@/components/falta-instalar";

// O vocabulário da campanha.
//
// ── POR QUE UMA TELA SÓ PARA ISTO ───────────────────────────────────────────
//
// Etiqueta parecia coisa pequena — criar de dentro da conversa e pronto. Só que
// ela É o relatório: `status_lead` e `demandas` saem daqui, e o painel inteiro
// se apoia neles.
//
// Sem uma tela, três coisas ficaram impossíveis: ver quantas pessoas cada
// etiqueta classificou, corrigir uma que nasceu sem eixo, e apagar a que foi
// criada por engano. Foi assim que nasceram DUAS "Apoiador" — uma delas sem
// eixo, com treze pessoas marcadas que nunca contaram na métrica.

export const dynamic = "force-dynamic";

export default async function EtiquetasPage() {
  const supabase = await createClient();

  const { data: podeMexer } = await supabase.rpc("perfil_supervisao");
  if (!podeMexer) {
    return (
      <div className="mx-auto max-w-[560px] px-6 py-16 text-center">
        <h1 className="text-[19px] font-bold text-tinta-900">Sem permissão</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-tinta-500">
          As etiquetas são o vocabulário do relatório da campanha, e quem manda
          nelas é a coordenação. Você marca as que existem de dentro da conversa.
        </p>
      </div>
    );
  }

  const [{ data: tags, error }, { data: marcacoes }] = await Promise.all([
    supabase
      .from("tags")
      .select("id, nome, descricao, cor, eixo, valor, ativa, ordem")
      .order("ordem")
      .order("nome"),
    // QUANTAS PESSOAS CADA ETIQUETA CLASSIFICOU.
    //
    // É o número que muda a decisão de apagar: `conversa_tags` é
    // `on delete cascade`, então apagar a etiqueta apaga as marcações junto.
    // "245 pessoas perdem esta marcação" e "tem certeza?" levam a cliques
    // diferentes.
    supabase.from("conversa_tags").select("tag_id"),
  ]);

  const usos = new Map<number, number>();
  for (const m of marcacoes ?? [])
    usos.set(m.tag_id, (usos.get(m.tag_id) ?? 0) + 1);

  const linhas: Linha[] = (tags ?? []).map((t) => ({
    ...t,
    marcacoes: usos.get(t.id) ?? 0,
  }));

  const tabelaFalta = error?.code === "42P01" || error?.code === "PGRST205";

  return (
    <div className="mx-auto flex max-w-[820px] flex-col gap-6 px-6 py-7 md:px-8">
      <Cabecalho
        sobretitulo="Atendimento"
        titulo="Etiquetas"
        descricao="O vocabulário do relatório. Status fecha 100% dos leads; demanda pode ser várias; etiqueta de trabalho não entra na métrica."
        voltar="/atendimento"
      />
      {tabelaFalta ? (
        <FaltaInstalar oQue="A tabela de etiquetas" />
      ) : (
        <Etiquetario inicial={linhas} />
      )}
    </div>
  );
}
