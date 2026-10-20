import { createClient } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/ui/pagina";
import { MUNICIPIOS_BA } from "@/lib/municipios-ba";
import { PainelDobradinha } from "@/components/dobradinha/painel";
import type { CandidatoDobradinha, VotoDigitado } from "@/lib/dobradinha";

// A dobradinha.
//
// A campanha vai dobrar com uma candidata a deputada estadual, e a pergunta que
// decide isso é geográfica: onde ela tem voto que a Talita não tem, e o
// contrário. Esta tela existe para responder essa pergunta com o mapa na frente
// — e para que os números dela entrem sem passar por mim: são digitados aqui,
// município a município, e gravados na hora.
//
// Os votos da Talita continuam vindo do arquivo fixo, porque dado de 2022 dela
// não muda mais. Ver `supabase/historico/dobradinha-votos.sql` para por que os da parceira
// precisam de tabela.

export const dynamic = "force-dynamic";

export default async function DobradinhaPage() {
  const supabase = await createClient();

  // A mesma porta da RLS — ver o comentário em supabase/historico/dobradinha-votos.sql.
  // Se a tela usasse `perfil_supervisao` e o banco `perfil_equipe`, o campo
  // apareceria editável para quem o banco recusa, e o erro só apareceria depois
  // de a pessoa digitar.
  const { data: podeEditar } = await supabase.rpc("perfil_equipe");

  const { data: candidatos } = await supabase
    .from("candidatos_dobradinha")
    .select("id, nome, cargo, numero, partido, eleicao, ativo, observacoes")
    .order("criado_em", { ascending: true });

  const ativo =
    (candidatos ?? []).find((c) => c.ativo) ?? (candidatos ?? [])[0] ?? null;

  // Só a votação da candidata que abre na tela. As outras carregam quando a
  // pessoa troca — não há motivo para trazer a base inteira de todas.
  const { data: votos } = ativo
    ? await supabase
        .from("candidato_votos")
        .select("municipio, votos")
        .eq("candidato_id", ativo.id)
    : { data: [] };

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-6 py-7 md:px-8">
      <Cabecalho
        sobretitulo="Estratégia"
        titulo="Dobradinha"
        descricao="A votação de 2022 da candidata a estadual, ao lado da votação da Talita. Onde cada uma é forte, e onde a dupla soma de verdade."
      />

      <PainelDobradinha
        candidatos={(candidatos ?? []) as CandidatoDobradinha[]}
        votosIniciais={(votos ?? []) as VotoDigitado[]}
        municipios={MUNICIPIOS_BA}
        podeEditar={!!podeEditar}
      />
    </div>
  );
}
