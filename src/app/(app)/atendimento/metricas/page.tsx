import { createClient } from "@/lib/supabase/server";
import { Metricas, type Dados } from "@/components/metricas/metricas";
import type { Producao } from "@/components/metricas/producao-equipe";

// Os dois eixos, com filtro.
//
// A CONTA É FEITA NO BANCO. A tela pede quatro números grandes, a distribuição
// por status e a contagem por demanda — tudo recortado por período, atendente,
// município e origem. Trazer as linhas para contar significaria, a 600–1000
// leads por dia, até 30 mil conversas por carga, e a pessoa troca de filtro
// cinco vezes seguidas. O Postgres devolve algumas dezenas de bytes.
//
// OS FILTROS MORAM NA URL, e não em estado do navegador. Assim a supervisora
// manda o link "Feira de Santana, últimos 7 dias" para a coordenação e a outra
// pessoa vê exatamente a mesma tela — que é o uso real de um painel numa
// campanha, não navegar sozinha.

export const dynamic = "force-dynamic";

type Busca = {
  dias?: string;
  de?: string;
  ate?: string;
  atendente?: string;
  municipio?: string;
  origem?: string;
};

export default async function MetricasPage({
  searchParams,
}: {
  searchParams: Promise<Busca>;
}) {
  const supabase = await createClient();

  const { data: podeVer } = await supabase.rpc("perfil_supervisao");
  if (!podeVer) {
    return (
      <div className="mx-auto max-w-[560px] px-6 py-16 text-center">
        <h1 className="text-[19px] font-bold text-tinta-900">Sem permissão</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-tinta-500">
          As métricas do atendimento são da supervisão. Se você precisa
          acompanhar os números da equipe, fale com a coordenação.
        </p>
      </div>
    );
  }

  const q = await searchParams;

  // Lista fechada, e não `Number(q.dias)`: "hoje" é o período ZERO, e zero é
  // falso em JavaScript — `Number("0") || 30` devolveria 30 calado, e a tela
  // mostraria trinta dias com "Hoje" aceso no filtro. Número errado que parece
  // certo é pior do que erro na tela.
  const PERIODOS = new Set(["0", "ontem", "7", "15", "30", "90", "tudo"]);

  // ── ONTEM É UM DIA FECHADO, NÃO "24 HORAS ATRÁS" ──────────────────────────
  //
  // A pergunta "quantos leads o tráfego trouxe ontem" só tem resposta com
  // COMEÇO E FIM: das 0h às 23h59 de ontem na Bahia. "Últimas 24 horas" mistura
  // metade de hoje e responde outra coisa — e hoje ainda está acontecendo, o
  // que faz o número mudar a cada carregamento.
  const diaBahia = (recuo: number) => {
    const agora = new Date();
    const naBahia = new Date(
      agora.toLocaleString("en-US", { timeZone: "America/Bahia" }),
    );
    naBahia.setDate(naBahia.getDate() - recuo);
    return `${naBahia.getFullYear()}-${String(naBahia.getMonth() + 1).padStart(2, "0")}-${String(naBahia.getDate()).padStart(2, "0")}`;
  };

  // ── DIA DO CALENDÁRIO ─────────────────────────────────────────────────────
  //
  // `p_dias` só sabe contar para trás a partir de agora, e não responde "quantos
  // entraram no sábado do comício". Isso é um intervalo com começo E FIM.
  //
  // O formato é conferido aqui e não confiado à tela: a data entra pela URL, e
  // URL é digitada, colada e encurtada. Data torta viraria erro do Postgres no
  // meio da consulta, com a tela inteira em branco.
  const dataOk = (v?: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? "") ? v! : null);
  let de = dataOk(q.de);
  let ate = dataOk(q.ate);
  // Só uma ponta preenchida vira o dia inteiro, que é o que a pessoa quis dizer
  // ao escolher um dia só.
  if (de && !ate) ate = de;
  if (ate && !de) de = ate;
  // Invertidas: quem escolhe "de 10 até 3" quis 3 a 10. Trocar é mais útil que
  // devolver zero e deixar a pessoa achando que não houve lead nenhum.
  if (de && ate && de > ate) [de, ate] = [ate, de];

  let escolhido = personalizadoBruto()
    ? "personalizado"
    : PERIODOS.has(q.dias ?? "")
      ? (q.dias as string)
      : "30";
  function personalizadoBruto() {
    return !!(de && ate);
  }

  // "Ontem" é o dia fechado, então vira um intervalo de datas como qualquer
  // outro — o mesmo caminho do "Escolher dia", sem código próprio.
  if (escolhido === "ontem") {
    de = diaBahia(1);
    ate = de;
  }

  const personalizado = !!(de && ate);
  const dias =
    personalizado || escolhido === "tudo" ? null : Number(escolhido);
  const atendente = q.atendente || null;
  const municipio = q.municipio || null;
  const origem = q.origem || null;

  // ── AS JANELAS DE ATRIBUIÇÃO ──────────────────────────────────────────────
  //
  // Quem cuida de tráfego não pergunta "quantos leads em 30 dias". Pergunta
  // como o número se COMPORTA quando a janela abre: se 7 e 30 dias dão quase o
  // mesmo, o anúncio parou de entregar; se hoje já é metade dos 7 dias, hoje
  // está acontecendo alguma coisa.
  //
  // ── UMA CHAMADA, E NÃO SETE ───────────────────────────────────────────────
  //
  // A primeira versão chamava `metricas_atendimento` uma vez por janela. Cada
  // consulta era rápida — 150 a 280 ms — mas eram SETE IDAS ao banco, cada uma
  // pagando a latência inteira entre a Vercel e o Supabase. Somando com o
  // período escolhido, a série, as opções e os atendentes, davam onze viagens
  // por carregamento; e a tela é `force-dynamic`, então todo clique refazia
  // tudo. Travava.
  //
  // `metricas_janelas` faz as sete numa varredura só: 1.412 ms viraram 88 ms,
  // e seis viagens de rede deixaram de existir.
  const [numeros, janelasResp, serieResp, opcoes, producaoResp, { data: etiquetas }, { data: atendentes }] =
    await Promise.all([
      supabase.rpc(
        "metricas_atendimento",
        // As duas datas só são mandadas quando existem. Assim a tela continua
        // funcionando com a versão antiga da função no banco.
        personalizado
          ? {
              p_dias: null,
              p_atendente: atendente,
              p_municipio: municipio,
              p_origem: origem,
              p_de: de,
              p_ate: ate,
            }
          : {
              p_dias: dias,
              p_atendente: atendente,
              p_municipio: municipio,
              p_origem: origem,
            },
      ),
      supabase.rpc("metricas_janelas_completo", {
        p_atendente: atendente,
        p_municipio: municipio,
        p_origem: origem,
      }),
      // Trinta dias é o recorte que cabe legível na largura da tela — mais que
      // isso as barras viram fio.
      supabase.rpc("leads_por_dia", {
        p_dias: 30,
        p_atendente: atendente,
        p_municipio: municipio,
        p_origem: origem,
      }),
      supabase.rpc("opcoes_metricas"),
      // ── O TRABALHO DO DIA, CONTADO PELO DIA DO TRABALHO ────────────────
      //
      // Vai junto no mesmo `Promise.all` de propósito: é mais uma viagem, e
      // fazê-la depois somaria latência a uma tela que já foi refeita uma vez
      // para parar de dar onze idas por carregamento.
      //
      // Sem argumento = hoje. O bloco responde "quanto produzimos hoje", que
      // nenhuma outra conta da tela responde.
      // ── A PRODUÇÃO SEGUE A JANELA DO TOPO (25/09) ──────────────────────
      //
      // Antes era `producao_do_dia()` sem argumento: sempre HOJE. Clicar em
      // "Ontem" mudava os quatro cartões e deixava a produção parada, com o
      // filtro dizendo uma coisa e o bloco mostrando outra.
      //
      // `producao_janelas` traz as SETE de uma vez, na mesma carga, porque o
      // clique no período não vai ao servidor. Custa 728 ms — as sete chamadas
      // separadas somariam ~3,2 s.
      //
      // "Escolher dia" não é janela fixa: aí continua valendo `producao_do_dia`
      // com o intervalo, que é exatamente o que ela responde.
      personalizado
        ? supabase.rpc("producao_do_dia", { p_de: de, p_ate: ate })
        : supabase.rpc("producao_janelas"),
      // Nome e cor dos status criados pela equipe (src/lib/rotulo-status.ts).
      supabase.from("tags").select("id, nome, cor, descricao, eixo, valor").eq("eixo", "status"),
      supabase.from("atendentes").select("id, nome").order("nome"),
    ]);

  // As sete janelas INTEIRAS — com os dois eixos e o trabalho de classificar,
  // não só o total. É isso que deixa a tela trocar de período sem ir ao
  // servidor: o clique vira troca de variável no navegador.
  const janelas = (janelasResp.data ?? []) as (Dados & {
    id: string;
    rotulo: string;
  })[];

  const serie = (serieResp.data ?? []) as { dia: string; leads: number }[];

  // A tela não pode sumir porque o SQL ainda não rodou. Ela abre vazia com o
  // aviso — que é informação útil — em vez de estourar uma página de erro.
  const faltaSql =
    numeros.error?.code === "42883" || numeros.error?.code === "PGRST202";

  return (
    <Metricas
      dados={
        (numeros.data as Dados) ?? {
          leads: 0,
          disparos: 0,
          status: {},
          demandas: {},
          classificadas: 0,
        }
      }
      municipios={(opcoes.data?.municipios as string[]) ?? []}
      origens={(opcoes.data?.origens as string[]) ?? []}
      atendentes={atendentes ?? []}
      janelas={janelas}
      serie={serie}
      filtros={{ dias: escolhido, atendente, municipio, origem, de, ate }}
      faltaSql={faltaSql}
      erro={numeros.error && !faltaSql ? numeros.error.message : null}
      etiquetas={etiquetas ?? []}
      producao={personalizado ? ((producaoResp.data as Producao | null) ?? null) : null}
      producaoJanelas={
        personalizado
          ? null
          : ((producaoResp.data as Record<string, Producao> | null) ?? null)
      }
    />
  );
}
