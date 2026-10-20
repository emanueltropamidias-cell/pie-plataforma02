import { createClient } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/ui/pagina";
import { Kits, type Kit, type Material } from "@/components/kits/kits";
import { FaltaInstalar } from "@/components/falta-instalar";

// Os kits políticos.
//
// Só a coordenação monta: material político em nome da candidata não pode
// depender de quem está no plantão. Todas as meninas USAM, de dentro da
// conversa.

export const dynamic = "force-dynamic";

export default async function KitsPage() {
  const supabase = await createClient();

  const { data: podeMexer } = await supabase.rpc("perfil_supervisao");
  if (!podeMexer) {
    return (
      <div className="mx-auto max-w-[560px] px-6 py-16 text-center">
        <h1 className="text-[19px] font-bold text-tinta-900">Sem permissão</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-tinta-500">
          Montar kit é da coordenação. Você manda os kits de dentro da conversa,
          no botão do pacote.
        </p>
      </div>
    );
  }

  const [{ data: kits, error }, { data: materiais }] = await Promise.all([
    supabase
      .from("kits")
      .select("id, nome, quando, cor, ordem, ativo, vezes, kit_itens(id, material_id, ordem)")
      .order("ordem"),
    supabase
      .from("materiais")
      .select("id, titulo, tipo, quando, ativo")
      .order("ordem")
      .order("titulo"),
  ]);

  const tabelaFalta = error?.code === "42P01" || error?.code === "PGRST205";

  const lista: Kit[] = (kits ?? []).map((k) => ({
    id: k.id,
    nome: k.nome,
    quando: k.quando,
    cor: k.cor,
    ordem: k.ordem,
    ativo: k.ativo,
    vezes: k.vezes,
    itens: (k.kit_itens ?? []) as Kit["itens"],
  }));

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-6 py-7 md:px-8">
      <Cabecalho
        sobretitulo="Atendimento"
        titulo="Kits políticos"
        descricao="Santinho, áudio e frase numa sequência só. A menina escolhe o kit e sai tudo, na ordem."
        voltar="/atendimento"
      />

      {tabelaFalta ? (
        <FaltaInstalar oQue="A tabela de kits" />
      ) : (
        <Kits kits={lista} materiais={(materiais ?? []) as Material[]} />
      )}
    </div>
  );
}
