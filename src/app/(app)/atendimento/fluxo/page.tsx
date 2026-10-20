import { createClient } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/ui/pagina";
import {
  FluxoEditor,
  SemFluxo,
  type Fluxo,
  type Passo,
} from "@/components/fluxo/fluxo";

// O roteiro que responde sozinho.
//
// Só supervisão: o que se escreve aqui sai, em nome da campanha, para milhares
// de pessoas, no segundo em que elas escrevem. Não é tarefa de quem atende.

export const dynamic = "force-dynamic";

export default async function FluxoPage() {
  const supabase = await createClient();

  const { data: podeMexer } = await supabase.rpc("perfil_supervisao");
  if (!podeMexer) {
    return (
      <div className="mx-auto max-w-[560px] px-6 py-16 text-center">
        <h1 className="text-[19px] font-bold text-tinta-900">Sem permissão</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-tinta-500">
          O roteiro automático é da coordenação. Fale com um supervisor.
        </p>
      </div>
    );
  }

  const { data: fluxo, error } = await supabase
    .from("fluxos")
    .select("id, nome, descricao, ativo, modo, telefones_teste")
    .order("id")
    .limit(1)
    .maybeSingle();

  const tabelaFalta = error?.code === "42P01" || error?.code === "PGRST205";

  if (tabelaFalta || !fluxo) {
    return (
      <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-6 py-7 md:px-8">
        <Cabecalho
          sobretitulo="Atendimento"
          titulo="Fluxo de atendimento"
          descricao="O roteiro que responde o primeiro contato sozinho."
          voltar="/atendimento"
        />
        <SemFluxo />
      </div>
    );
  }

  // Meia-noite de Salvador, e não do servidor: o número tem de bater com o dia
  // de quem olha a tela.
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const [{ data: passos }, { count }] = await Promise.all([
    supabase
      .from("fluxo_passos")
      .select("id, ordem, titulo, mensagem, estagio, guarda_em")
      .eq("fluxo_id", fluxo.id)
      .order("ordem"),
    // Quantas conversas o robô moveu hoje. É a prova de que está vivo — e a
    // primeira coisa que se olha depois de ligar.
    supabase
      .from("conversas")
      .select("id", { count: "exact", head: true })
      .gt("fluxo_passo", 0)
      .gte("fluxo_em", hoje.toISOString()),
  ]);

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-6 py-7 md:px-8">
      <Cabecalho
        sobretitulo="Atendimento"
        titulo="Fluxo de atendimento"
        descricao="O roteiro que responde o primeiro contato sozinho, no segundo em que a pessoa escreve."
        voltar="/atendimento"
      />
      <FluxoEditor
        fluxo={fluxo as Fluxo}
        passos={(passos ?? []) as Passo[]}
        respondidasHoje={count ?? 0}
      />
    </div>
  );
}
