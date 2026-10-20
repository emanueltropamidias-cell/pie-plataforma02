import { createClient } from "@/lib/supabase/server";
import { ordenarPlacar } from "@/lib/ranking";
import { RankingClient } from "@/components/ranking/ranking-client";
import { Cabecalho } from "@/components/ui/pagina";

export default async function RankingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── O PLACAR VEM PRONTO DO BANCO ──────────────────────────────────────────
  //
  // Antes eram duas leituras paginadas — as 208 lideranças e os 1.784 contatos
  // — para somar em JavaScript quantos cada uma trouxe. Três viagens ao banco
  // e o resultado montado aqui.
  //
  // Um `group by parent_id` responde isso sem trazer linha nenhuma, e a conta
  // para de ficar mais lenta a cada contato novo.
  //
  // `montarRanking` continua sendo quem ordena e calcula a proporção da barra:
  // a REGRA do placar não mudou de lugar, só a contagem.
  const { data: placar } = await supabase.rpc("placar_liderancas");
  const bruto = (placar ?? []) as {
    id: string;
    nome: string;
    municipio: string | null;
    pessoas: number;
    semana: number;
  }[];

  const entradas = ordenarPlacar(bruto);

  // Se quem abriu for uma liderança, destaca a linha dela no placar.
  const { data: eu } = await supabase
    .from("liderancas")
    .select("id")
    .eq("auth_uid", user?.id ?? "")
    .maybeSingle();

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <Cabecalho
        voltar="/liderancas"
        sobretitulo="Rede"
        titulo="Placar das lideranças"
        descricao="Quantas pessoas cada liderança indicou. Atualiza sozinho."
      />

      <RankingClient entradas={entradas} meuId={eu?.id ?? null} />
    </div>
  );
}
