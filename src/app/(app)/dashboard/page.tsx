import Link from "next/link";
import {
  ArrowUpRight,
  ClipboardList,
  MapPin,
  TrendingUp,
  Trophy,
  Users,
  UsersRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { paginar } from "@/lib/paginar";
import { lerTerritorio } from "@/lib/painel-territorio";
import { conferir, chave } from "@/lib/conferir-municipios";
import { MUNICIPIOS_BA } from "@/lib/municipios-ba";
import { VOTOS_TALITA } from "@/lib/votos-talita";
import { ordenarPlacar } from "@/lib/ranking";
import { humanizar, type Demanda } from "@/components/demandas/constantes";
import { Cabecalho, Cartao, Indicador } from "@/components/ui/pagina";
import { moduloAtivo } from "@/lib/modulos";

// Painel geral.
//
// A versão anterior mostrava "votos comprometidos" e "progresso da meta" — dois
// campos que ninguém preenche. Painel que exibe zero em destaque ensina a
// equipe a não olhar para ele. Aqui só entra número que existe de verdade, e
// cada bloco leva para a tela onde se age sobre ele.

function dataBR(iso: string | null) {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const nome = ((user?.email || "").split("@")[0] || "").split(".")[0];

  const seteDias = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const trintaDias = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [territorio, placarResp, demandasResp, novos30, contatos7, totalContatosResp] =
    await Promise.all([
    lerTerritorio(supabase),
    // ── O PLACAR VEM CONTADO DO BANCO ─────────────────────────────────────
    //
    // Eram duas leituras paginadas aqui — as 208 lideranças e os 1.784
    // contatos — para somar no navegador o mesmo placar que a tela de Ranking
    // já somava do seu lado. Duas telas, o mesmo trabalho, três viagens cada.
    supabase.rpc("placar_liderancas"),
    supabase
      .from("demandas")
      .select(
        "id, titulo, categoria, status, prioridade, prazo, municipe_nome, municipio, created_at",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("liderancas")
      .select("*", { count: "exact", head: true })
      .eq("tipo", "lead")
      .gte("created_at", trintaDias),
    supabase
      .from("liderancas")
      .select("*", { count: "exact", head: true })
      .eq("tipo", "contato")
      .gte("created_at", seteDias),
    // Só a contagem, com `head: true`: o número de cadastros sem telefone não
    // precisa das linhas, e trazê-las eram 1.784 registros por carregamento.
    supabase
      .from("liderancas")
      .select("*", { count: "exact", head: true })
      .eq("tipo", "contato"),
  ]);

  // --- Território ------------------------------------------------------------
  const oficiais = new Set(MUNICIPIOS_BA.map((n) => chave(n)));
  const comBase = new Set(
    territorio.mapa.map((m) => chave(m.municipio)).filter((k) => oficiais.has(k)),
  );
  const grafiasSoltas = conferir(
    territorio.mapa.map((m) => ({ municipio: m.municipio, qtd: m.qtd })),
  ).length;

  // Onde houve voto em 2022 e não há ninguém cadastrado. É a lista que responde
  // "para onde ir agora" — e vem ordenada pelo tamanho da oportunidade.
  const lacunas = Object.entries(VOTOS_TALITA)
    .filter(([municipio]) => !comBase.has(chave(municipio)))
    .map(([municipio, votos]) => ({ municipio, votos }))
    .sort((a, b) => b.votos - a.votos);
  const votosSemBase = lacunas.reduce((s, l) => s + l.votos, 0);

  // --- Placar ----------------------------------------------------------------
  const ranking = ordenarPlacar(
    (placarResp.data ?? []) as {
      id: string;
      nome: string;
      municipio: string | null;
      pessoas: number;
      semana: number;
    }[],
  );
  const placar = ranking.slice(0, 5);
  const liderancasAtivas = ranking.filter((e) => e.pessoas > 0).length;

  // --- Demandas --------------------------------------------------------------
  const demandas = (demandasResp.data ?? []) as Demanda[];
  const hoje = new Date().toISOString().slice(0, 10);
  const emAberto = demandas.filter((d) => d.status === "aberta" || d.status === "andamento");
  const atrasadas = emAberto.filter((d) => d.prazo && d.prazo < hoje);
  const ultimas = demandas.slice(0, 5);

  const novosMes = novos30.count ?? 0;
  const contatosSemana = contatos7.count ?? 0;
  // Cadastros com `tipo = 'contato'`: hoje 1.780, TODOS sem telefone. Ficam
  // fora de `territorio.total` porque sem telefone não há como trabalhar a
  // pessoa — o indicador existe para eles não sumirem sem explicação.
  //
  // Isto se chamava "contatos pelo QR". Era falso: `contato` nunca teve relação
  // com QR, e `link_leituras` — o QR de verdade — tem cinco leituras, nenhuma
  // virou cadastro. O painel dizia que a maior parte da rede chegou por um
  // canal que nunca trouxe ninguém.
  const totalContatos = totalContatosResp.count ?? 0;
  const semLideranca = territorio.total - territorio.vinculados;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <Cabecalho
        sobretitulo="Painel geral"
        titulo={`Olá, ${nome} 👋`}
        descricao="O estado da rede da Talita Oliveira · Bahia, agora."
      />

      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Indicador
          rotulo="Sem telefone"
          valor={totalContatos.toLocaleString("pt-BR")}
          contexto={
            contatosSemana > 0
              ? `+${contatosSemana.toLocaleString("pt-BR")} nos últimos 7 dias`
              : "base antiga — fora dos números ao lado"
          }
        />
        <Indicador
          rotulo="Munícipes na base"
          destaque
          valor={territorio.total.toLocaleString("pt-BR")}
          contexto={
            novosMes > 0 && novosMes < territorio.total
              ? `+${novosMes.toLocaleString("pt-BR")} nos últimos 30 dias`
              : "com nome e telefone"
          }
        />
        <Indicador
          rotulo="Lideranças"
          valor={ranking.length.toLocaleString("pt-BR")}
          contexto={
            liderancasAtivas > 0
              ? `${liderancasAtivas} já trouxeram gente`
              : "nenhuma trouxe gente ainda"
          }
        />
        <Indicador
          rotulo="Demandas em aberto"
          valor={emAberto.length.toLocaleString("pt-BR")}
          contexto={
            atrasadas.length > 0
              ? `${atrasadas.length} com prazo vencido`
              : "nenhuma com prazo vencido"
          }
        />
        <Indicador
          rotulo="Municípios"
          valor={`${comBase.size} / ${MUNICIPIOS_BA.length}`}
          contexto={
            grafiasSoltas > 0
              ? `com atuação · ${grafiasSoltas} grafia(s) a conferir`
              : "com pelo menos uma pessoa na base"
          }
        />
      </div>

      {grafiasSoltas > 0 && (
        <Link
          href="/municipios"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ambar/40 bg-ambar/10 px-5 py-3.5 transition-colors hover:bg-ambar/20"
        >
          <div>
            <p className="text-[13px] font-bold text-tinta-900">
              {grafiasSoltas} grafia(s) de município fora da lista oficial
            </p>
            <p className="mt-0.5 text-[12px] text-tinta-600">
              Nome escrito de formas diferentes conta como cidade diferente no mapa e nos filtros.
            </p>
          </div>
          <span className="shrink-0 rounded-lg bg-tema px-3 py-1.5 text-[12px] font-semibold text-white">
            Conferir e corrigir
          </span>
        </Link>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Onde há voto e não há ninguém: a decisão de território da semana */}
        <Cartao
          titulo="Onde tivemos voto e não temos ninguém"
          descricao={`${lacunas.length} municípios · ${votosSemBase.toLocaleString("pt-BR")} votos em 2022`}
          acoes={
            <Link
              href="/mapa"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-tema hover:underline"
            >
              Ver no mapa <ArrowUpRight size={13} />
            </Link>
          }
        >
          <div className="px-5 py-3.5">
            {lacunas.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-tinta-500">
                A base cobre todos os municípios onde houve voto.
              </p>
            ) : (
              <ol className="flex flex-col gap-2.5">
                {lacunas.slice(0, 6).map((l, i) => (
                  <li key={l.municipio} className="flex items-center gap-3">
                    <span className="tabular w-4 shrink-0 text-[11.5px] font-bold text-tinta-300">
                      {i + 1}
                    </span>
                    <MapPin size={13} className="shrink-0 text-tinta-400" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-tinta-800">
                      {l.municipio}
                    </span>
                    <span className="tabular shrink-0 text-[12.5px] font-bold text-tinta-900">
                      {l.votos.toLocaleString("pt-BR")}
                    </span>
                    <span className="shrink-0 text-[11px] text-tinta-400">votos</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Cartao>

        {/* O que o gabinete tem para responder — só onde o Gabinete existe (src/lib/modulos.ts). */}
        {moduloAtivo("gabinete") && (
        <Cartao
          titulo="Últimas demandas"
          descricao={
            emAberto.length > 0
              ? `${emAberto.length} em aberto${atrasadas.length ? ` · ${atrasadas.length} atrasada(s)` : ""}`
              : "nada em aberto"
          }
          acoes={
            <Link
              href="/demandas"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-tema hover:underline"
            >
              Abrir <ArrowUpRight size={13} />
            </Link>
          }
        >
          <div className="px-5 py-3.5">
            {ultimas.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-tinta-500">
                Nenhuma demanda registrada ainda.
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {ultimas.map((d) => {
                  const atrasada =
                    d.prazo &&
                    d.prazo < hoje &&
                    d.status !== "resolvida" &&
                    d.status !== "sem_solucao";
                  return (
                    <li key={d.id} className="flex items-start gap-2.5">
                      <ClipboardList size={13} className="mt-1 shrink-0 text-tinta-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-tinta-800">
                          {humanizar(d.titulo)}
                        </p>
                        <p className="truncate text-[11.5px] text-tinta-500">
                          {d.municipe_nome ?? "Sem nome"}
                          {d.municipio ? ` · ${d.municipio}` : ""}
                          {d.prazo ? ` · prazo ${dataBR(d.prazo)}` : ""}
                        </p>
                      </div>
                      {atrasada && (
                        <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[9.5px] font-bold text-white">
                          atrasada
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Cartao>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Quem está trazendo gente */}
        <Cartao
          titulo="Placar das lideranças"
          descricao="Pessoas indicadas por cada liderança"
          acoes={
            <Link
              href="/ranking"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-tema hover:underline"
            >
              Placar completo <ArrowUpRight size={13} />
            </Link>
          }
        >
          <div className="px-5 py-3.5">
            {placar.length === 0 || placar[0].pessoas === 0 ? (
              <p className="py-6 text-center text-[13px] text-tinta-500">
                Ninguém foi indicado ainda. Compartilhe os links em <b>Lideranças</b>.
              </p>
            ) : (
              <ol className="flex flex-col gap-2.5">
                {placar.map((e, i) => (
                  <li key={e.id} className="flex items-center gap-3">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold ${
                        i === 0 ? "bg-ambar/20 text-ambar" : "bg-tinta-100 text-tinta-500"
                      }`}
                    >
                      {i === 0 ? <Trophy size={11} /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-tinta-800">
                      {e.nome}
                    </span>
                    <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-tinta-100 sm:block">
                      <div
                        className="h-full rounded-full bg-tema"
                        style={{ width: `${Math.max(4, e.proporcao)}%` }}
                      />
                    </div>
                    <span className="tabular w-8 shrink-0 text-right text-[12.5px] font-bold text-tinta-900">
                      {e.pessoas}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Cartao>

        {/* O que aconteceu desde a última vez que se olhou */}
        <Cartao titulo="Movimento" descricao="O que entrou recentemente">
          <div className="grid grid-cols-2 gap-3 px-5 py-4">
            <div className="rounded-lg border border-tinta-200 px-3.5 py-3">
              <div className="flex items-center gap-1.5 text-tinta-500">
                <UsersRound size={13} />
                <p className="text-[10px] font-bold uppercase tracking-[0.1em]">Últimos 30 dias</p>
              </div>
              <p className="tabular mt-2 text-2xl font-extrabold text-tinta-900">
                {novosMes.toLocaleString("pt-BR")}
              </p>
              <p className="mt-1 text-[11px] text-tinta-400">munícipes cadastrados</p>
            </div>
            <div className="rounded-lg border border-tinta-200 px-3.5 py-3">
              <div className="flex items-center gap-1.5 text-tinta-500">
                <TrendingUp size={13} />
                <p className="text-[10px] font-bold uppercase tracking-[0.1em]">Rede toda</p>
              </div>
              <p className="tabular mt-2 text-2xl font-extrabold text-tinta-900">
                {(totalContatos + territorio.total).toLocaleString("pt-BR")}
              </p>
              <p className="mt-1 text-[11px] text-tinta-400">pessoas alcançadas até aqui</p>
            </div>
            <div className="col-span-2 rounded-lg border border-tinta-200 px-3.5 py-3">
              <div className="flex items-center gap-1.5 text-tinta-500">
                <Users size={13} />
                <p className="text-[10px] font-bold uppercase tracking-[0.1em]">
                  Vínculo com liderança
                </p>
              </div>
              <p className="tabular mt-2 text-2xl font-extrabold text-tinta-900">
                {territorio.total ? Math.round((territorio.vinculados / territorio.total) * 100) : 0}%
              </p>
              <p className="mt-1 text-[11px] text-tinta-400">
                {semLideranca.toLocaleString("pt-BR")} munícipes ainda sem liderança responsável
              </p>
            </div>
          </div>
        </Cartao>
      </div>
    </div>
  );
}
