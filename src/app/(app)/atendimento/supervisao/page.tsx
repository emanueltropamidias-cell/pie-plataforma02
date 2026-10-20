import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
// Aqui o "está caído" é a própria consulta (`in ['close','connecting']`), e não
// a função — o filtro precisa acontecer no banco, não depois.
import { sincronizarConexoes } from "@/lib/conexao";
import { Supervisao } from "@/components/supervisao/supervisao";
import type { MembroEquipe } from "@/components/supervisao/equipe-agora";
import type { Conversa } from "@/components/caixa/caixa-client";

// A mesa de comando.
//
// A caixa de entrada responde "o que eu faço agora". Esta tela responde outra
// pergunta: "a equipe está dando conta?" — e por isso ela é sobre TODAS as
// conversas, não sobre as minhas.
//
// O que ela precisa mostrar antes de qualquer filtro é quem está esperando há
// mais tempo. Numa operação de 600 a 1000 leads por dia, o lead esquecido não
// aparece sozinho: ele afunda na lista ordenada por última mensagem, porque
// justamente ninguém mexeu nele.

export const dynamic = "force-dynamic";

export default async function SupervisaoPage({
  searchParams,
}: {
  searchParams: Promise<{ janela?: string }>;
}) {
  const supabase = await createClient();
  const q = await searchParams;

  // ── A JANELA RECORTA A LISTA, E NÃO SÓ OS CONTADORES ──────────────────────
  //
  // Os números por janela já vinham certos, mas a lista embaixo era sempre as
  // 500 conversas mais recentes — e a contagem por atendente sai dela. Escolher
  // "7 dias" mudava o topo da tela e não mudava o que estava sendo olhado.
  //
  // Recortar a lista OBRIGA a ir ao banco: ela tem teto de 500, então filtrar
  // no navegador devolveria "as 500 mais recentes que por acaso caem na
  // janela", que é um recorte de um recorte — e ninguém teria como saber.
  //
  // Lista fechada de janelas, e não `Number()`: "0" é hoje, e zero é falso em
  // JavaScript. Ver a mesma nota nas Métricas.
  const JANELAS = new Set(["0", "ontem", "7", "15", "30", "90", "tudo"]);
  const janela = JANELAS.has(q.janela ?? "") ? (q.janela as string) : "tudo";

  const agora = new Date();
  const naBahia = new Date(
    agora.toLocaleString("en-US", { timeZone: "America/Bahia" }),
  );
  const meiaNoite = new Date(naBahia);
  meiaNoite.setHours(0, 0, 0, 0);
  const desloca = (dias: number) =>
    new Date(meiaNoite.getTime() - dias * 86_400_000).toISOString();

  // `fim` só existe em "Ontem", que é dia FECHADO — sem ele viraria "os
  // últimos dois dias".
  const corte: { de: string | null; ate: string | null } =
    janela === "tudo"
      ? { de: null, ate: null }
      : janela === "0"
        ? { de: meiaNoite.toISOString(), ate: null }
        : janela === "ontem"
          ? { de: desloca(1), ate: meiaNoite.toISOString() }
          : {
              de: new Date(
                agora.getTime() - Number(janela) * 86_400_000,
              ).toISOString(),
              ate: null,
            };

  const { data: podeVer } = await supabase.rpc("perfil_supervisao");
  if (!podeVer) {
    return (
      <div className="mx-auto max-w-[560px] px-6 py-16 text-center">
        <h1 className="text-[19px] font-bold text-tinta-900">Sem permissão</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-tinta-500">
          A supervisão acompanha o trabalho de toda a equipe. Se você precisa
          desse acompanhamento, fale com a coordenação.
        </p>
      </div>
    );
  }

  // Confere o estado real com a Evolution DEPOIS de responder. Esta tela
  // desenha com o que está guardado; a próxima abertura já vem corrigida.
  // Prender o carregamento numa ida ao servidor da Evolution trocaria um
  // defeito de informação por um de lentidão.
  after(sincronizarConexoes);

  // 500 e não a base inteira: a tela é de acompanhamento do agora, e quem
  // procura conversa antiga usa a busca. Trazer dez mil linhas para o navegador
  // filtrar deixaria a tela lenta justamente no dia mais movimentado.
  const [
    { data: conversas },
    totalJanela,
    { data: atendentes },
    janelasResp,
    totalAbertas,
    totalSemDono,
    totalNaoAtendidas,
    { data: numerosCaidos },
    { data: equipe },
  ] = await Promise.all([
    // ── QUEM TEVE MENSAGEM NO PERÍODO ───────────────────────────────────────
    //
    // Antes o corte era por `ultima_msg_at`, e parecia a mesma coisa. Não é:
    //
    //   a menina responde ONTEM às 18h
    //   a pessoa responde de volta HOJE às 9h
    //   -> a conversa some da janela "Ontem"
    //
    // O trabalho de ontem sumia justamente porque deu certo — porque a pessoa
    // voltou a falar. Eram 93 conversas invisíveis só em ontem: 462 apareciam,
    // 555 tiveram mensagem.
    //
    // "Teve mensagem no período" é um `exists` sobre `mensagens`, e o PostgREST
    // não faz subconsulta — por isso vai por função. A tela filtrava com o que
    // dava para filtrar de fora, e o que dava não era o certo.
    supabase.rpc("supervisao_lista", {
      p_de: corte.de,
      p_ate: corte.ate,
      p_limite: 500,
    }),

    // ── QUANTAS A JANELA TEM DE VERDADE ────────────────────────────────────
    //
    // A lista vem cortada em 500 e ordenada pela mensagem mais recente, então
    // quem falou há mais tempo cai fora primeiro — some justamente o que a
    // supervisão existe para achar. Hoje são 2.317 na janela do dia.
    //
    // Contado no banco, com o mesmo filtro da lista. Contar na tela em cima do
    // que foi carregado é como o teto da consulta vira a métrica.
    supabase.rpc("supervisao_total", { p_de: corte.de, p_ate: corte.ate }),

    supabase
      .from("atendentes")
      .select("id, nome, disponivel, capacidade, demandas"),
    // ── AS SETE JANELAS, DE UMA VEZ ─────────────────────────────────────────
    //
    // A supervisão responde "a equipe está dando conta?" e só sabia responder
    // HOJE: as mensagens contadas desde a meia-noite, as encerradas também.
    // Não havia como perguntar como foi a semana passada, nem o sábado do
    // comício.
    //
    // As sete janelas vêm inteiras numa chamada e cabem em poucos kilobytes,
    // então trocar de período não vai ao servidor. Procurar o dia em que a
    // fila estourou tem de ser instantâneo, senão ninguém procura.
    supabase.rpc("supervisao_janelas"),

    // ── OS QUATRO CARTÕES, CONTADOS NO BANCO ────────────────────────────────
    //
    // Eram somados percorrendo as 500 conversas carregadas — ou seja, o teto da
    // consulta virava o número que a supervisão lia. Com a base passando de
    // 500, "abertas" pararia em 500 para sempre e ninguém veria a diferença
    // entre uma fila crescendo e uma fila parada.
    //
    // `nao_atendidas` repete a regra de `espera()` em SQL: sem resposta nossa,
    // com mensagem da pessoa, aberta, e disparo não conta — ninguém estava
    // esperando. Se essa regra mudar em `src/lib/conversa.ts`, muda aqui junto.
    supabase
      .from("conversas")
      .select("id", { count: "exact", head: true })
      .is("encerrada_em", null),
    supabase
      .from("conversas")
      .select("id", { count: "exact", head: true })
      .is("encerrada_em", null)
      .is("atendente_id", null),
    supabase
      .from("conversas")
      .select("id", { count: "exact", head: true })
      .is("encerrada_em", null)
      .neq("tipo", "disparo")
      .is("primeira_resp_at", null)
      .not("primeira_msg_at", "is", null),
    // Os números que NÃO estão de pé. Com sete chips novos entrando, saber
    // qual caiu e há quanto tempo é a primeira pergunta do dia.
    supabase
      .from("numeros")
      .select("apelido, instancia, conexao, caiu_em")
      .eq("ativo", true)
      .in("conexao", ["close", "connecting"])
      .order("ordem"),
    // A equipe, uma linha por atendente, contada no banco (0032).
    supabase.rpc("supervisao_equipe"),
  ]);

  return (
    <Supervisao
      conversas={(conversas ?? []) as unknown as Conversa[]}
      totalDaJanela={(totalJanela.data as number | null) ?? 0}
      corte={corte}
      atendentes={atendentes ?? []}
      janelas={
        (janelasResp.data ?? []) as {
          id: string;
          rotulo: string;
          recebidas: number;
          enviadas: number;
          chegaram: number;
          respondidas: number;
          encerradas: number;
        }[]
      }
      // O ESTADO DE AGORA fica fora da janela, de propósito. "Quantas estão
      // abertas nos últimos 7 dias" não quer dizer nada: ou está aberta agora,
      // ou não está. Misturar as duas é o jeito de o painel mentir.
      totais={{
        abertas: totalAbertas.count ?? 0,
        semDono: totalSemDono.count ?? 0,
        naoAtendidas: totalNaoAtendidas.count ?? 0,
      }}
      janela={janela}
      caidos={numerosCaidos ?? []}
      equipe={(equipe ?? []) as MembroEquipe[]}
    />
  );
}
