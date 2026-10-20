import { createClient } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/ui/pagina";
import { Biblioteca, type Item } from "@/components/audios/biblioteca";
import { FaltaInstalar } from "@/components/falta-instalar";

// Os áudios da Talita.
//
// Só supervisão sobe: áudio em nome da candidata não é upload de quem atende.
// Mas toda a equipe OUVE e MANDA, de dentro da conversa — é lá que ele serve.

export const dynamic = "force-dynamic";

export default async function AudiosPage() {
  const supabase = await createClient();

  const { data: podeMexer } = await supabase.rpc("perfil_supervisao");
  if (!podeMexer) {
    return (
      <div className="mx-auto max-w-[560px] px-6 py-16 text-center">
        <h1 className="text-[19px] font-bold text-tinta-900">Sem permissão</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-tinta-500">
          A biblioteca de áudios é da coordenação. Você manda os áudios de
          dentro da conversa, no botão do microfone.
        </p>
      </div>
    );
  }

  const { data, error } = await supabase
    .from("materiais")
    .select(
      "id, titulo, quando, tipo, arquivo, texto, mime, duracao_seg, bytes, ordem, ativo, vezes, ultimo_uso",
    )
    .order("ordem")
    .order("titulo");

  const tabelaFalta = error?.code === "42P01" || error?.code === "PGRST205";

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-6 py-7 md:px-8">
      <Cabecalho
        sobretitulo="Atendimento"
        titulo="Materiais da campanha"
        descricao="Santinhos, áudios da Talita e frases prontas. É daqui que os kits são montados."
        voltar="/atendimento"
      />

      {tabelaFalta ? (
        <FaltaInstalar oQue="A biblioteca de materiais" />
      ) : (
        <Biblioteca itens={(data ?? []) as Item[]} />
      )}
    </div>
  );
}
