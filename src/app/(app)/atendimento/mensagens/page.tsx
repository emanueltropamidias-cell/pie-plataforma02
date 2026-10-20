import { createClient } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/ui/pagina";
import {
  MensagensProntas,
  type Mensagem,
} from "@/components/mensagens/mensagens-prontas";
import { FaltaInstalar } from "@/components/falta-instalar";

// As mensagens prontas da campanha.
//
// Moram na mesma tabela dos áudios e santinhos (`materiais`, tipo `texto`), e
// continuam aparecendo lá. Tela própria porque o gesto é outro: arquivo se
// sobe, texto se escreve e se reescreve — e escrever uma frase no meio de uma
// tela de upload é o que faz ninguém escrever frase nenhuma.
//
// Só supervisão mexe, mesma regra dos áudios: o que sai daqui vai assinado como
// a campanha, para milhares de pessoas.

export const dynamic = "force-dynamic";

export default async function MensagensPage() {
  const supabase = await createClient();

  const { data: podeMexer } = await supabase.rpc("perfil_supervisao");
  if (!podeMexer) {
    return (
      <div className="mx-auto max-w-[560px] px-6 py-16 text-center">
        <h1 className="text-[19px] font-bold text-tinta-900">Sem permissão</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-tinta-500">
          As mensagens prontas são da coordenação. Você manda elas de dentro da
          conversa, no botão Mensagens.
        </p>
      </div>
    );
  }

  const { data, error } = await supabase
    .from("materiais")
    .select("id, titulo, quando, texto, ativo, vezes, ordem")
    .eq("tipo", "texto")
    .order("ordem")
    .order("titulo");

  const tabelaFalta = error?.code === "42P01" || error?.code === "PGRST205";

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-6 py-7 md:px-8">
      <Cabecalho
        sobretitulo="Atendimento"
        titulo="Mensagens prontas"
        descricao="O texto que a equipe manda com um toque. Pode carregar o link do nosso WhatsApp para a pessoa encaminhar."
        voltar="/atendimento"
      />

      {tabelaFalta ? (
        <FaltaInstalar oQue="A biblioteca de materiais" />
      ) : (
        <MensagensProntas itens={(data ?? []) as Mensagem[]} />
      )}
    </div>
  );
}
