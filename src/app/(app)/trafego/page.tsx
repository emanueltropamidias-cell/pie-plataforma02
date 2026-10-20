import { createClient } from "@/lib/supabase/server";
import { paginar } from "@/lib/paginar";
import { TrafegoClient, type ContaTrafego } from "@/components/trafego/trafego-client";
import type { Funil } from "@/lib/trafego/painel";
import type { Metrica } from "@/components/trafego/metrica-dialog";
import type { Criativo } from "@/components/trafego/criativos-grid";
import type { Conjunto, CampanhaAgg } from "@/components/trafego/gerenciador";

export default async function TrafegoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Todas as leituras são paginadas: o Supabase corta em 1000 linhas sem avisar,
  // e aí os totais do dashboard sairiam menores que a realidade.
  //
  // E o `.order("id")` depois da ordem principal NÃO é enfeite. Paginar por
  // `data` ou `gasto` tem empate — várias campanhas no mesmo dia, dezenas de
  // criativos com gasto zero —, e o Postgres não promete a mesma ordem para
  // linhas empatadas entre duas consultas. Na virada da página de 1000, uma
  // linha pode sair duas vezes ou nenhuma. Com as cinco contas a tabela diária
  // chegou a 991 linhas em 15/09: o sync seguinte já passaria do teto.
  const registros = await paginar<Metrica>((de, ate) =>
    supabase
      .from("metricas_trafego")
      .select(
        "id, data, campanha, alcance, impressoes, cliques, gasto, resultados, tipo_resultado, objetivo, status, frequencia, orcamento, fonte, criado_por, conta_id",
      )
      .order("data", { ascending: false })
      .order("id", { ascending: true })
      .range(de, ate),
  );

  const conjuntos = await paginar<Conjunto>((de, ate) =>
    supabase
      .from("conjuntos_trafego")
      .select(
        "id, adset_id, nome, campanha, status, otimizacao, orcamento, gasto, alcance, impressoes, cliques, resultados, tipo_resultado, conta_id",
      )
      .order("gasto", { ascending: false })
      .order("id", { ascending: true })
      .range(de, ate),
  );

  const campanhasAgg = await paginar<CampanhaAgg>((de, ate) =>
    supabase
      .from("campanhas_trafego")
      .select(
        "id, campaign_id, campanha, objetivo, status, orcamento, gasto, alcance, frequencia, impressoes, cliques, resultados, tipo_resultado, conta_id",
      )
      .order("gasto", { ascending: false })
      .order("id", { ascending: true })
      .range(de, ate),
  );

  const criativos = await paginar<Criativo>((de, ate) =>
    supabase
      .from("criativos_trafego")
      .select(
        "id, ad_id, ad_name, campanha, thumbnail_url, status, objetivo, gasto, impressoes, cliques, resultados, tipo_resultado, conta_id",
      )
      .order("gasto", { ascending: false })
      .order("id", { ascending: true })
      .range(de, ate),
  );

  // ── CAMPANHA COM O MESMO NOME EM DUAS CONTAS ────────────────────────────────
  //
  // Em 15/09, "Wpp | Talita" e "[[ 01 Engajamento Aquecimento ]]" existiam em
  // duas contas cada. O banco casa por ID e está certo; mas o painel, o
  // Gerenciador e o filtro agrupam pelo NOME — e com "Todas as contas" as duas
  // "Wpp | Talita" virariam uma só, somando gasto e resultado de campanhas
  // diferentes.
  //
  // Então só as repetidas ganham a conta no rótulo ("Wpp | Talita · CA 02"). As
  // outras ficam como a coordenação conhece. Nenhuma das repetidas tinha meta em
  // `metas_campanha` (casada por nome), conferido antes desta mudança.
  const { data: contasNome } = await supabase.from("trafego_contas").select("conta_id, conta_nome");
  const curto = new Map(
    (contasNome ?? []).map((c) => [c.conta_id as string, String(c.conta_nome ?? c.conta_id).split("|")[0].trim()]),
  );
  const contasPorNome = new Map<string, Set<string>>();
  for (const c of [...campanhasAgg, ...registros]) {
    if (!c.campanha || !c.conta_id) continue;
    contasPorNome.set(c.campanha, (contasPorNome.get(c.campanha) ?? new Set()).add(c.conta_id));
  }
  const rotular = <T extends { campanha: string | null; conta_id?: string | null }>(xs: T[]) =>
    xs.map((x) =>
      x.campanha && x.conta_id && (contasPorNome.get(x.campanha)?.size ?? 0) > 1
        ? { ...x, campanha: `${x.campanha} · ${curto.get(x.conta_id) ?? x.conta_id}` }
        : x,
    );

  // O que acontece DEPOIS do anúncio — chegou, foi respondida, virou cadastro —
  // e o ritmo de chegada por hora, para a projeção do dia. Contado no banco:
  // a tela recebe 30 dias em números, não 12 mil conversas.
  const { data: funil } = await supabase.rpc("trafego_funil", { p_dias: 30 });

  const { data: dataMetas } = await supabase.from("metas_campanha").select("campanha, rotulo, meta");
  const metas = (dataMetas ?? []) as { campanha: string; rotulo: string | null; meta: number }[];

  // Uma linha por conta de anúncio: status, saldo, alcance único e a hora do
  // último sync DE CADA UMA. Substitui o `trafego_sync` de linha única, que só
  // conseguia descrever uma conta.
  const { data: contas } = await supabase
    .from("trafego_contas")
    .select("conta_id, conta_nome, status, saldo, alcance, frequencia, pixel_nome, pixel_ultimo, ultima_sync, erro, erro_em")
    .order("conta_nome");

  const { data: perfil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const isAdmin = perfil?.role === "admin";

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <TrafegoClient
        registros={rotular(registros)}
        campanhasAgg={rotular(campanhasAgg)}
        conjuntos={rotular(conjuntos)}
        criativos={rotular(criativos)}
        metas={metas}
        contas={(contas ?? []) as ContaTrafego[]}
        funil={(funil ?? null) as Funil}
        meuId={user?.id ?? ""}
        isAdmin={isAdmin}
      />
    </div>
  );
}
