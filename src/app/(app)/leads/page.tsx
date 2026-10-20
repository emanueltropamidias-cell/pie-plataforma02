import { createClient } from "@/lib/supabase/server";
import { paginar } from "@/lib/paginar";
import { lerTerritorio } from "@/lib/painel-territorio";
import { LeadsClient, type Lead, type LiderOpcao } from "@/components/leads/leads-client";
import type { ResumoLeads } from "@/components/leads/painel-leads";

// A base muda a cada lead que entra e a cada importação. Sem isto o Next
// serve a página de um render anterior, e o número na tela é o de ontem —
// que numa campanha que decide pelo painel é pior que não ter número.
export const dynamic = "force-dynamic";

const POR_PAGINA = 50;

// Busca e paginação acontecem NO BANCO. Trazer a base inteira para filtrar no
// navegador não funciona a partir de mil linhas — e a base já passou de 17 mil.
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; municipio?: string; vinculo?: string; p?: string }>;
}) {
  const sp = await searchParams;
  // Vírgula e parênteses quebram a sintaxe de filtro do PostgREST
  const q = (sp.q ?? "").trim().replace(/[(),]/g, " ").slice(0, 60);
  const municipio = (sp.municipio ?? "").trim();
  const vinculo = sp.vinculo ?? "";
  const pagina = Math.max(1, Number.parseInt(sp.p ?? "1", 10) || 1);

  const supabase = await createClient();

  // ── A LISTA MOSTRA O MESMO QUE O PAINEL CONTA ─────────────────────────────
  //
  // Era `.eq("tipo", "lead")`. O cabeçalho dizia 290 e a lista dizia 83 — dois
  // números para a mesma pergunta, na mesma tela. Quem confere um pelo outro
  // conclui que o sistema está errado, e conclui certo.
  //
  // Liderança é munícipe. `contato` continua fora: são as 1.702 linhas da base
  // antiga sem telefone nenhum.
  let consulta = supabase
    .from("liderancas")
    .select("id, nome, telefone, municipio, bairro, parent_id", { count: "exact" })
    .in("tipo", ["lead", "lideranca"]);

  if (q) consulta = consulta.or(`nome.ilike.%${q}%,telefone.ilike.%${q}%,bairro.ilike.%${q}%`);
  if (municipio) consulta = consulta.eq("municipio", municipio);
  if (vinculo === "sem") consulta = consulta.is("parent_id", null);
  if (vinculo === "com") consulta = consulta.not("parent_id", "is", null);

  // Duas leituras em paralelo: a página da lista (50 linhas) e o agregado do
  // território, que o Postgres devolve pronto numa chamada só.
  const [{ data, count }, lideres, territorio, contatosResp] = await Promise.all([
    consulta
      .order("created_at", { ascending: false })
      .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1),
    // Lideranças são poucas e cabem inteiras: servem para o rótulo de vínculo
    paginar<LiderOpcao>((de, ate) =>
      supabase
        .from("liderancas")
        .select("id, nome")
        .or("tipo.eq.lideranca,tipo.is.null")
        .order("nome")
        .range(de, ate),
    ),
    lerTerritorio(supabase),
    supabase.from("liderancas").select("*", { count: "exact", head: true }).eq("tipo", "contato"),
  ]);

  const municipios = territorio.porMunicipio
    .map((m) => m.nome)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  const resumo: ResumoLeads = {
    total: territorio.total,
    contatos: contatosResp.count ?? 0,
    comTelefone: territorio.comTelefone,
    vinculados: territorio.vinculados,
    novosSemana: territorio.novosSemana,
    porMunicipio: territorio.porMunicipio,
    porOrigem: territorio.porOrigem,
    semMunicipio: territorio.semMunicipio,
    municipiosAlcancados: territorio.municipiosAlcancados,
    municipiosDaBahia: territorio.municipiosDaBahia,
    aRevisar: territorio.aRevisar,
  };

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <LeadsClient
        leads={(data ?? []) as Lead[]}
        lideres={lideres}
        municipios={municipios}
        total={count ?? 0}
        totalGeral={territorio.total}
        leituraFalhou={territorio.falhou === true}
        pagina={pagina}
        porPagina={POR_PAGINA}
        filtros={{ q, municipio, vinculo }}
        resumo={resumo}
      />
    </div>
  );
}
