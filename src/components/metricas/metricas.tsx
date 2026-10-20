"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  STATUS,
  PREVALENCIA,
  DEMANDAS,
  type Status,
  type Demanda,
} from "@/lib/atendimento";
import { rotuloStatus, type EtiquetaCatalogo } from "@/lib/rotulo-status";
import { Download } from "lucide-react";
import { Cabecalho, Cartao } from "@/components/ui/pagina";
import { BarrasPorDia } from "@/components/atendimento/graficos";
import { FaltaInstalar } from "@/components/falta-instalar";
import { ProducaoEquipe, type Producao } from "@/components/metricas/producao-equipe";

// Os dois eixos.
//
// EIXO 1 — STATUS. Uma categoria por pessoa, e a soma FECHA o total de leads.
// EIXO 2 — DEMANDAS. Independente do primeiro: zero, uma ou várias por pessoa,
//          e por isso a soma passa do total.
//
// Eles ficam em blocos separados, com formatos de leitura diferentes de
// propósito — barra de um lado, lista com número do outro. O erro clássico é
// alguém somar "apoiador + saúde + material" e passar de 100%, contando a mesma
// pessoa três vezes. Dois desenhos diferentes é o que impede a soma.

export type Dados = {
  leads: number;
  disparos: number;
  status: Partial<Record<Status, number>>;
  demandas: Partial<Record<Demanda, number>>;
  /**
   * Quantas pessoas a equipe CLASSIFICOU no período.
   *
   * Não entra nas barras de propósito. Os eixos contam quem CHEGOU no período —
   * é isso que faz a soma fechar 100% dos leads. Este conta quem foi MARCADO no
   * período, inclusive gente que chegou antes.
   *
   * São perguntas diferentes: um mede o tráfego, o outro mede o trabalho.
   * Juntar os dois na mesma barra faria o eixo passar de 100%.
   */
  classificadas?: number;
};

/** Hoje na Bahia, e não no fuso do computador de quem abriu. */
function hojeNaBahia() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bahia",
  }).format(new Date());
}

const PERIODOS = [
  { id: "0", rotulo: "Hoje" },
  { id: "ontem", rotulo: "Ontem" },
  { id: "7", rotulo: "7 dias" },
  { id: "15", rotulo: "15 dias" },
  { id: "30", rotulo: "30 dias" },
  { id: "90", rotulo: "90 dias" },
  { id: "tudo", rotulo: "Tudo" },
  { id: "personalizado", rotulo: "Escolher dia" },
];

export function Metricas({
  dados,
  janelas,
  serie,
  municipios,
  origens,
  atendentes,
  filtros,
  faltaSql,
  erro,
  etiquetas = [],
  producao,
  producaoJanelas,
}: {
  dados: Dados;
  /** O mesmo recorte da tela, contado em cada janela de atribuição. */
  /**
   * As sete janelas INTEIRAS, e não só os totais.
   *
   * É o que permite trocar de período sem ir ao servidor. Ver `trocarPeriodo`.
   */
  janelas: (Dados & { id: string; rotulo: string })[];
  /** Um ponto por dia da Bahia, com os dias vazios já preenchidos com zero. */
  serie: { dia: string; leads: number }[];
  municipios: string[];
  origens: string[];
  atendentes: { id: string; nome: string }[];
  filtros: {
    dias: string;
    atendente: string | null;
    municipio: string | null;
    origem: string | null;
    /** Dia do calendário, quando o período é "personalizado". */
    de: string | null;
    ate: string | null;
  };
  faltaSql: boolean;
  erro: string | null;
  /** O catálogo de etiquetas: dá nome e cor aos status que a equipe criou. */
  etiquetas?: EtiquetaCatalogo[];
  /** O trabalho do período, contado pelo dia da ação. Só vem preenchida no
   *  "Escolher dia", que não é janela fixa. */
  producao: Producao | null;
  /** As sete janelas do filtro, cada uma com a produção da equipe. Null no
   *  "Escolher dia" e quando o banco ainda não tem `producao_janelas`. */
  producaoJanelas?: Record<string, Producao> | null;
}) {
  const router = useRouter();
  const params = useSearchParams();

  // ── O CLIQUE NO PERÍODO NÃO VAI AO SERVIDOR ────────────────────────────────
  //
  // A tela é `force-dynamic`: cada navegação refaz o render inteiro no servidor
  // mais as consultas. Mesmo com o banco em 88 ms isso nunca vira "na hora" —
  // o custo é a viagem, e ela existe mesmo quando o dado já está aqui.
  //
  // Os números das sete janelas JÁ VIERAM na primeira carga, todos, em menos de
  // dois kilobytes. Então trocar de período é trocar de índice num array.
  //
  // A URL continua certa, atualizada por `replaceState`: sem navegação, mas o
  // link colado no grupo abre no mesmo recorte, que é o uso real disto aqui.
  const [periodo, setPeriodo] = useState(filtros.dias);

  // O servidor manda o período da URL; se ele mudar por fora (voltar do
  // navegador, link novo), o estado local acompanha.
  useEffect(() => setPeriodo(filtros.dias), [filtros.dias]);

  function trocarPeriodo(id: string) {
    setPeriodo(id);
    const p = new URLSearchParams(params.toString());
    if (id === "30") p.delete("dias");
    else p.set("dias", id);
    // Datas de um "Escolher dia" anterior saem, senão elas continuariam
    // mandando quando a página fosse recarregada.
    p.delete("de");
    p.delete("ate");
    window.history.replaceState(
      null,
      "",
      `/atendimento/metricas${p.toString() ? `?${p}` : ""}`,
    );
  }

  // O que a tela mostra: a janela escolhida, que já está na memória. No
  // personalizado não há janela pronta — aí vale o que o servidor calculou.
  const janelaAtual = janelas.find((j) => j.id === periodo);
  const d = periodo === "personalizado" ? dados : (janelaAtual ?? dados);

  // Trocar filtro é trocar a URL. Assim o botão "voltar" do navegador desfaz a
  // escolha, e o link colado no grupo abre o mesmo recorte para todo mundo.
  function mudar(chave: string, valor: string | null) {
    mudarVarios({ [chave]: valor });
  }

  // Trocar duas coisas de uma vez. Duas chamadas seguidas a `mudar` fariam duas
  // navegações, e a segunda partiria da URL ANTIGA — a primeira mudança se
  // perderia. Aparece quando se troca período e datas juntos.
  function mudarVarios(mudancas: Record<string, string | null>) {
    const p = new URLSearchParams(params.toString());
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (!valor) p.delete(chave);
      else p.set(chave, valor);
    }
    router.push(`/atendimento/metricas?${p.toString()}`);
  }

  const n = (s: Status) => d.status[s] ?? 0;

  // ── STATUS QUE O CÓDIGO NÃO CONHECE ─────────────────────────────────────
  //
  // `PREVALENCIA` é uma lista FIXA de sete. Mas o status sai da etiqueta, e a
  // coordenação cria etiqueta na tela — qualquer status novo nasce fora desta
  // lista e era simplesmente descartado aqui: a pessoa contava em `leads` e não
  // aparecia em barra nenhuma.
  //
  // A soma parava de fechar, e o "fecha 100%" escrito ao lado virava mentira —
  // sem nada na tela dizendo. Silêncio é o pior jeito de errar número.
  //
  // Agora o desconhecido aparece no fim, com o nome cru que veio do banco. Feio
  // é melhor que ausente: assim alguém vê e decide se acrescenta ao código ou
  // corrige a etiqueta.
  const desconhecidos = Object.keys(d.status).filter(
    (s) => !(PREVALENCIA as string[]).includes(s),
  );
  const nCru = (s: string) =>
    (d.status as Record<string, number | undefined>)[s] ?? 0;

  const totalStatus =
    PREVALENCIA.reduce((soma, s) => soma + n(s), 0) +
    desconhecidos.reduce((soma, s) => soma + nCru(s), 0);
  const maior = Math.max(
    1,
    ...PREVALENCIA.map(n),
    ...desconhecidos.map(nCru),
  );

  const demandas = (Object.keys(DEMANDAS) as Demanda[])
    .map((dem) => ({
      id: dem,
      rotulo: DEMANDAS[dem].rotulo,
      n: d.demandas[dem] ?? 0,
    }))
    .sort((a, b) => b.n - a.n);
  const maiorDemanda = Math.max(1, ...demandas.map((d) => d.n));

  // No personalizado o rótulo tem de dizer QUAL dia. "Escolher dia" no meio de
  // uma frase de resultado não informa nada — e é justamente onde alguém lê o
  // número e manda print para o grupo.
  const diaCurto = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
  // `periodo`, e NÃO `filtros.dias`. Trocar de janela é `replaceState`: o
  // navegador não volta ao servidor, então `filtros.dias` continua valendo o
  // que a página carregou. O dado e o botão aceso seguem `periodo`; o rótulo
  // seguia a prop velha e ficava para trás — a tela mostrava o número de HOJE
  // com "· 30 dias" escrito do lado, que é o pior jeito de errar: o número
  // está certo e ninguém acredita nele.
  const rotuloPeriodo =
    periodo === "personalizado" && filtros.de && filtros.ate
      ? filtros.de === filtros.ate
        ? diaCurto(filtros.de)
        : `${diaCurto(filtros.de)} a ${diaCurto(filtros.ate)}`
      : (PERIODOS.find((p) => p.id === periodo)?.rotulo ?? "30 dias");

  const producaoDoPeriodo =
    periodo === "personalizado" ? producao : (producaoJanelas?.[periodo] ?? null);

  // Uma frase so, usada nos tres cartoes de status: eles contam DENTRO do
  // universo dos quatro de cima, e esse universo muda com o filtro.
  const universo = filtros.atendente
    ? "entre as conversas que ela trabalhou"
    : `entre os leads que chegaram ${rotuloPeriodo.toLowerCase()}`;

  // ── O RECORTE DA TELA, NUM LUGAR SÓ ──────────────────────────────────────
  //
  // Os dois botões de exportar levam o MESMO recorte. Escrito duas vezes, um
  // dia alguém acrescenta um filtro num e esquece no outro — e o segundo
  // arquivo passa a entregar a base inteira calado, que é exatamente o que o
  // comentário do primeiro botão existe para impedir.
  const recorteDaTela = Object.entries({
    // `periodo`, e não `filtros.dias`: trocar a janela é `replaceState`,
    // então a prop do servidor fica na que a página CARREGOU. Quem clicasse
    // em "Hoje" e exportasse levava trinta dias.
    //
    // "ontem" e "personalizado" não cabem em `dias`, que só conta para trás a
    // partir de agora; esses vão como intervalo, e a rota entende os dois.
    ...(periodo === "ontem" || periodo === "personalizado"
      ? { de: filtros.de ?? "", ate: filtros.ate ?? "" }
      : { dias: periodo }),
    atendente: filtros.atendente ?? "",
    municipio: filtros.municipio ?? "",
    origem: filtros.origem ?? "",
  }).filter(([, v]) => v) as [string, string][];

  const linkExportar = (formato?: "numeros") =>
    `/api/atendimento/exportar?${new URLSearchParams(
      formato ? [...recorteDaTela, ["formato", formato]] : recorteDaTela,
    ).toString()}`;

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-6 py-7 md:px-8">
      <Cabecalho
        voltar="/atendimento"
        sobretitulo="Atendimento"
        titulo="Métricas"
        // "Creditado a" e não "Atendente": são perguntas diferentes, e a tela
        // tem de dizer qual está respondendo. Quem atende pelo WhatsApp no
        // aparelho não fica com a conversa atribuída — quem cadastra, sim.
        descricao={
          // A frase antiga dizia "credita a QUEM CADASTROU". Virou mentira em
          // 11/09: o crédito passou a ser de quem TRABALHOU — cadastrou,
          // respondeu ou etiquetou — e a data passou a ser a do trabalho.
          // Legenda velha em cima de número novo é pior que legenda nenhuma.
          filtros.atendente
            ? "Sem pessoa escolhida, o número é quem CHEGOU no período. Com pessoa, é o que ELA TRABALHOU no período — cadastrou, respondeu ou etiquetou."
            : "Os dois eixos da pauta: em que pé está cada pessoa, e o que ela pediu. Escolha uma pessoa para ver o que ela trabalhou."
        }
        acoes={
          // O MESMO RECORTE QUE ESTÁ NA TELA. Um botão de exportar que ignora
          // os filtros entrega a base inteira quando a pessoa pediu Juazeiro —
          // e ela só descobre depois de abrir o arquivo.
          <div className="flex flex-wrap gap-2">
            <a
              href={linkExportar()}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-tinta-200 bg-white px-3.5 text-[13px] font-semibold text-tinta-700 transition-colors hover:border-tinta-300 hover:text-tinta-900"
            >
              <Download size={14} strokeWidth={2.2} />
              Exportar planilha
            </a>
            {/* Só a contagem e o telefone com DDI, sem repetidos. Mesmo
                recorte, outro uso: a planilha serve para LER, esta para
                alimentar público da Meta ou disparador. */}
            <a
              href={linkExportar("numeros")}
              title="Uma coluna com a contagem e outra com DDI + DDD + telefone, sem repetidos"
              className="flex h-9 items-center gap-1.5 rounded-lg border border-tinta-200 bg-white px-3.5 text-[13px] font-semibold text-tinta-700 transition-colors hover:border-tinta-300 hover:text-tinta-900"
            >
              <Download size={14} strokeWidth={2.2} />
              Só os números
            </a>
          </div>
        }
      />

      {faltaSql && (
        <FaltaInstalar oQue="A função de métricas" />
      )}
      {erro && (
        <p className="rounded-lg border border-[#f3d3d3] bg-[#fdf1f1] px-4 py-3 text-[13px] text-[#c02020]">
          {erro}
        </p>
      )}

      {/* ── filtros ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-tinta-200 bg-tinta-50 px-4 py-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-tinta-400">
          Filtros
        </span>

        <div className="flex gap-1">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                // Sair do personalizado tem de LIMPAR as datas, senão elas
                // continuam na URL mandando na consulta e o botão aceso mente.
                if (p.id === "personalizado") {
                  const dia = hojeNaBahia();
                  mudarVarios({ dias: null, de: filtros.de ?? dia, ate: filtros.ate ?? dia });
                } else {
                  trocarPeriodo(p.id);
                }
              }}
              className={`rounded-md px-2.5 py-1 text-[12px] transition-colors ${
                periodo === p.id
                  ? "bg-tema font-semibold text-white"
                  : "text-tinta-600 hover:bg-white"
              }`}
            >
              {p.rotulo}
            </button>
          ))}
        </div>

        {periodo === "personalizado" && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={filtros.de ?? ""}
              max={hojeNaBahia()}
              onChange={(e) => mudar("de", e.target.value || null)}
              className="h-8 rounded-md border border-tinta-200 bg-white px-2 text-[12px] text-tinta-700"
            />
            <span className="text-[12px] text-tinta-400">até</span>
            <input
              type="date"
              value={filtros.ate ?? ""}
              max={hojeNaBahia()}
              onChange={(e) => mudar("ate", e.target.value || null)}
              className="h-8 rounded-md border border-tinta-200 bg-white px-2 text-[12px] text-tinta-700"
            />
          </div>
        )}

        <Escolha
          rotulo="Creditado a"
          valor={filtros.atendente}
          opcoes={atendentes.map((a) => ({ valor: a.id, rotulo: a.nome }))}
          onMuda={(v) => mudar("atendente", v)}
        />
        <Escolha
          rotulo="Município"
          valor={filtros.municipio}
          opcoes={municipios.map((m) => ({ valor: m, rotulo: m }))}
          onMuda={(v) => mudar("municipio", v)}
        />
        <Escolha
          rotulo="Origem da campanha"
          valor={filtros.origem}
          opcoes={origens.map((o) => ({ valor: o, rotulo: o }))}
          onMuda={(v) => mudar("origem", v)}
        />
      </div>

      {/* ── os quatro números ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* O RÓTULO MUDA COM O FILTRO, porque a pergunta muda.
            Sem atendente: "quantos leads CHEGARAM no período".
            Com atendente: "em quantas conversas ELA trabalhou no período" — que
            é a correção de 11/09. Chamar as duas de "Leads" fazia a Maiana
            aparecer com 6 num dia de 1.153 conversas abertas, porque ela passa
            o dia respondendo a fila de ontem e a fila de ontem não chegou hoje. */}
        <Grande
          rotulo={`${filtros.atendente ? "Conversas trabalhadas" : "Leads"} · ${rotuloPeriodo}`}
          valor={d.leads}
        />
        {/* ── O UNIVERSO, ESCRITO NO CARTAO ──────────────────────────────
            25/09, Emanuel: "se eu pegar 5 atendentes ja bate +200 apoiadores
            so hoje, mas a metrica de hoje marca 200 e poucos".

            Estava certo, e os dois numeros tambem. Medido no dia:

              219  leads que CHEGARAM hoje e estao marcados apoiador  <- este
              188  marcados hoje em gente que chegou em dia anterior
              ---
              407  etiquetas de apoiador postas hoje  <- Producao da equipe

            219 + 188 = 407. Nao faltava nada: eram duas perguntas, e so uma
            estava escrita na tela. Quase METADE do trabalho do dia cai fora
            deste cartao, porque a equipe passa o dia classificando a fila de
            ontem.

            A nota nao resolve a duplicidade -- ela nomeia. O numero que ele
            procura ja esta logo abaixo, em "Apoiadores marcados". */}
        <Grande
          rotulo="Apoiadores"
          valor={n("apoiador")}
          parte={d.leads}
          cor={STATUS.apoiador.cor}
          nota={universo}
        />
        <Grande
          rotulo="Multiplicadores"
          valor={n("multiplicador")}
          parte={d.leads}
          cor={STATUS.multiplicador.cor}
          nota={universo}
        />
        <Grande
          rotulo="Haters"
          valor={n("hater")}
          parte={d.leads}
          cor={STATUS.hater.cor}
          nota={universo}
        />
      </div>

      {/* A porcentagem daqui NÃO é a conversão do painel, e sem dizer isso
          alguém abre as duas telas e acha que uma está quebrada. Aqui é fatia
          de TODOS os leads do período — inclusive os que ninguém classificou,
          que por isso puxam as três para baixo. No painel o denominador é só o
          que já foi classificado. Perguntas diferentes, números diferentes. */}
      <div className="mt-2 px-1 text-[11px] leading-relaxed text-tinta-400">
        As porcentagens são fatias das {d.leads.toLocaleString("pt-BR")}{" "}
        {filtros.atendente
          ? "conversas que ela trabalhou no período"
          : "leads que chegaram no período"}
        , incluindo as ainda sem classificação — são elas que puxam os três
        números para baixo. A conversão em apoio, calculada só sobre as já
        classificadas, fica no painel de métricas.
      </div>

      {/* ── O TRABALHO DO DIA ────────────────────────────────────────────
          Entra AQUI, logo depois dos quatro números grandes e antes do
          tráfego: os de cima contam pela chegada do lead, este conta pelo dia
          do trabalho, e vê-los juntos é o que impede confundir um com o outro.

          `producao` vem nulo quando o banco ainda não tem `producao_do_dia` —
          instalação que não rodou a 0040. Some em silêncio em vez de quebrar a
          tela inteira. */}
      {/* A produção do MESMO período escolhido no topo. Fora do "Escolher
          dia" ela sai das sete janelas que já vieram na carga — trocar de
          período aqui é trocar de chave num objeto, sem ir ao servidor. */}
      {producaoDoPeriodo && (
        <div className="mt-6">
          <ProducaoEquipe producao={producaoDoPeriodo} rotulo={rotuloPeriodo} />
        </div>
      )}

      {/* ── LEADS GERADOS COM TRÁFEGO, JANELA POR JANELA ─────────────────
          Lead aqui é quem ESCREVEU PRIMEIRO — a pessoa viu o anúncio, clicou e
          falou. Disparo é o contrário: a campanha falou primeiro, e por isso
          fica de fora desta conta, senão o número do anúncio incluiria gente
          que o anúncio não trouxe.

          As seis janelas juntas porque a pergunta de quem cuida de tráfego não
          é "quantos em 30 dias", é como o número SE COMPORTA quando a janela
          abre. Se 7 e 30 dias dão quase o mesmo, o anúncio parou de entregar.
          Se hoje já é metade dos 7 dias, hoje está acontecendo alguma coisa.

          O passo entre as janelas é o que dá a leitura, então ele vem escrito:
          sem o "+N", comparar 90 com 30 vira conta de cabeça. */}
      <Cartao
        titulo="Leads gerados com tráfego"
        descricao="Quem escreveu primeiro, por janela de atribuição. Disparo não entra."
      >
        {/* SETE colunas, e não seis: são sete janelas, e a que sobrasse cairia
            sozinha numa segunda linha com um bloco cinza vazio do lado — foi
            exatamente o que aconteceu quando "Ontem" entrou.

            O passo virou etiqueta curta. "nada a mais que a janela anterior"
            repetido três vezes ocupava mais espaço que os números e dizia
            menos: o que importa ali é que a janela NÃO cresceu, e "=" diz isso
            de relance. */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-b-[11px] bg-tinta-200 sm:grid-cols-4 lg:grid-cols-7">
          {janelas.map((j, i) => {
            const anterior = i > 0 ? janelas[i - 1].leads : null;
            const passo = anterior === null ? null : j.leads - anterior;
            return (
              <button
                key={j.id}
                onClick={() => trocarPeriodo(j.id)}
                title={`Ver a tela inteira em ${j.rotulo.toLowerCase()}`}
                className={`px-3 py-3 text-left transition-colors ${
                  periodo === j.id
                    ? "bg-[#eceafe]"
                    : "bg-white hover:bg-tinta-50"
                }`}
              >
                <p className="truncate text-[9.5px] font-bold uppercase tracking-[0.1em] text-tinta-400">
                  {j.rotulo}
                </p>
                <p className="tabular mt-1 text-[21px] font-extrabold leading-none tracking-[-0.03em] text-tinta-900">
                  {j.leads.toLocaleString("pt-BR")}
                </p>
                {passo === null ? (
                  <p className="mt-1 text-[10.5px] leading-none text-tinta-300">
                    &nbsp;
                  </p>
                ) : passo > 0 ? (
                  <p className="tabular mt-1 text-[10.5px] font-semibold leading-none text-[#12703c]">
                    +{passo.toLocaleString("pt-BR")}
                  </p>
                ) : (
                  <p
                    className="mt-1 text-[10.5px] leading-none text-tinta-300"
                    title="Nada a mais que a janela anterior"
                  >
                    =
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </Cartao>

      {/* ── O RITMO, DIA A DIA ───────────────────────────────────────────
          "2.030 em 7 dias" não diz se foram 290 por dia ou 1.800 num sábado e
          migalha no resto — e essas duas realidades pedem decisões opostas de
          quem põe verba.

          O DIA VAZIO APARECE. A série vem do banco com os dias sem lead já
          preenchidos com zero; agrupando só o que existe, o dia em que o
          anúncio parou some do desenho e as barras se encostam como se o fluxo
          tivesse sido contínuo. O buraco é a informação. */}
      <Cartao
        titulo="Ritmo do tráfego"
        descricao="Leads por dia, últimos 30 dias. Dia sem lead aparece como zero."
      >
        <div className="px-5 py-4">
          <BarrasPorDia
            dados={serie.map((p) => ({
              rotulo: p.dia.slice(8, 10) + "/" + p.dia.slice(5, 7),
              valor: p.leads,
            }))}
          />
          {serie.length > 0 && (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[11.5px] text-tinta-500">
              <span>
                média{" "}
                <b className="tabular text-tinta-800">
                  {Math.round(
                    serie.reduce((s, p) => s + p.leads, 0) / serie.length,
                  ).toLocaleString("pt-BR")}
                </b>{" "}
                por dia
              </span>
              <span>
                melhor dia{" "}
                <b className="tabular text-tinta-800">
                  {Math.max(...serie.map((p) => p.leads)).toLocaleString("pt-BR")}
                </b>
              </span>
              <span>
                {/* Dias em zero é o número que ninguém pede e todo mundo
                    precisa: é anúncio parado, ou chip caído. */}
                <b className="tabular text-tinta-800">
                  {serie.filter((p) => p.leads === 0).length}
                </b>{" "}
                dia(s) sem nenhum lead
              </span>
            </div>
          )}
        </div>
      </Cartao>

      {/* ── O TRABALHO, SEPARADO DO TRÁFEGO ──────────────────────────────
          Fora da grade dos quatro de propósito: aqueles são fatias dos leads
          que CHEGARAM no período e somam 100%. Este conta quem a equipe MARCOU
          no período, inclusive gente que chegou antes — no dia 28/08 eram 41
          contra 49, e as duas classificadas às 22h só existiam neste número.
          Posto ao lado dos outros, alguém somaria. */}
      {typeof d.classificadas === "number" && (
        <div className="mt-3 rounded-[12px] border border-tinta-200 bg-white px-4 py-3">
          <p className="text-[12.5px] leading-relaxed text-tinta-600">
            <b className="text-[15px] text-tinta-900">
              {d.classificadas.toLocaleString("pt-BR")}
            </b>{" "}
            {d.classificadas === 1 ? "pessoa classificada" : "pessoas classificadas"}{" "}
            {filtros.atendente ? "por esta atendente " : "pela equipe "}
            {rotuloPeriodo.toLowerCase()}
            .
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-tinta-400">
            Conta quantas etiquetas foram postas no período, e não quantas
            pessoas entraram — por isso inclui quem chegou antes e foi
            classificado agora. É outro número, e não soma com as barras acima.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── EIXO 1 ───────────────────────────────────────────────────── */}
        <Cartao
          titulo="Status do lead"
          descricao={`Uma categoria por pessoa — a soma fecha ${totalStatus.toLocaleString("pt-BR")}.`}
        >
          <div className="flex flex-col gap-2 px-5 py-4">
            {[
              ...PREVALENCIA.map((s) => ({
                chave: s as string,
                rotulo: STATUS[s].rotulo,
                cor: STATUS[s].cor,
                v: n(s),
              })),
              // Os que o código não conhece, no fim, com a cor neutra: eles
              // ENTRAM na soma, e é isso que mantém o "fecha 100%" verdadeiro.
              // O nome e a cor vêm da etiqueta que a equipe criou; antes saía o
              // valor cru ("aguardando_retorno_do_lead").
              ...desconhecidos.map((s) => {
                const r = rotuloStatus(s, etiquetas);
                return { chave: s, rotulo: r?.rotulo ?? s, cor: r?.cor ?? "#52535c", v: nCru(s) };
              }),
            ].map(({ chave: s, rotulo, cor, v }) => {
              return (
                <div key={s} className="flex items-center gap-3">
                  <span className="w-[104px] shrink-0 truncate text-[12px] text-tinta-600">
                    {rotulo}
                  </span>
                  <span className="h-[18px] flex-1 rounded-sm bg-tinta-100">
                    <span
                      className="block h-full rounded-sm"
                      style={{
                        width: `${(v / maior) * 100}%`,
                        background: cor,
                        minWidth: v > 0 ? 3 : 0,
                      }}
                    />
                  </span>
                  <span className="tabular w-[62px] shrink-0 text-right text-[12.5px] font-semibold text-tinta-900">
                    {v.toLocaleString("pt-BR")}
                    <span className="ml-1 font-normal text-tinta-400">
                      {totalStatus > 0
                        ? `${Math.round((v / totalStatus) * 100)}%`
                        : "—"}
                    </span>
                  </span>
                </div>
              );
            })}

            {/* A distinção que a pauta original não tinha, escrita onde ela
                importa: uma é falha de aquisição, a outra é falha nossa. */}
            <p className="mt-2 border-t border-tinta-100 pt-2.5 text-[11.5px] leading-relaxed text-tinta-500">
              <b className="text-tinta-700">Não respondeu</b> é a pessoa que não
              voltou — lead frio. <b className="text-tinta-700">Não atendido</b>{" "}
              é ninguém da equipe ter respondido, e aí é verba paga esperando.
            </p>
          </div>
        </Cartao>

        {/* ── EIXO 2 ───────────────────────────────────────────────────── */}
        <Cartao
          titulo="Demandas por tag"
          descricao="Independente do status. Uma pessoa pode ter várias ou nenhuma."
        >
          <div className="px-5 py-4">
            {demandas.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 border-b border-tinta-100 py-2 last:border-0"
              >
                <span className="flex-1 text-[13px] text-tinta-700">
                  {d.rotulo}
                </span>
                <span className="h-1.5 w-[110px] shrink-0 rounded-full bg-tinta-100">
                  <span
                    className="block h-full rounded-full bg-tema"
                    style={{ width: `${(d.n / maiorDemanda) * 100}%` }}
                  />
                </span>
                <span className="tabular w-[46px] shrink-0 text-right text-[13px] font-bold text-tinta-900">
                  {d.n.toLocaleString("pt-BR")}
                </span>
              </div>
            ))}

            <p className="mt-3 border-t border-tinta-100 pt-2.5 text-[11.5px] leading-relaxed text-tinta-500">
              Estes números{" "}
              <b className="text-tinta-700">não somam com os de cima</b>. Quem
              pediu material e saúde aparece nas duas linhas — e continua sendo
              uma pessoa só no eixo do status.
            </p>
          </div>
        </Cartao>
      </div>

      <p className="text-[11.5px] leading-relaxed text-tinta-400">
        A planilha traz <b>uma linha por pessoa</b>, com o mesmo recorte dos
        filtros acima: telefone, nome, município, status, demandas, quem atendeu
        e os horários. Abre no Excel e no Google Planilhas sem ajuste. Cada
        exportação fica registrada — quem, quando e quantas linhas —, porque
        arquivo que sai da plataforma não volta.
      </p>

      {d.disparos > 0 && (
        <p className="text-[11.5px] text-tinta-400">
          Fora desta conta: {d.disparos.toLocaleString("pt-BR")} conversas
          de disparo, em que a campanha escreveu primeiro. Elas não são lead e
          não cabem no mesmo funil.
        </p>
      )}
    </div>
  );
}

// ── peças ───────────────────────────────────────────────────────────────────

function Grande({
  rotulo,
  valor,
  parte,
  cor,
  nota,
}: {
  rotulo: string;
  valor: number;
  /** Total sobre o qual calcular a fatia. Sem ele, o número vai sozinho. */
  parte?: number;
  cor?: string;
  /** Uma linha dizendo QUE UNIVERSO este número conta. Ver 25/09. */
  nota?: string;
}) {
  return (
    <div className="rounded-lg border border-tinta-200 bg-white px-4 py-3.5">
      <div className="flex items-center gap-2">
        {cor && (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: cor }}
          />
        )}
        <span className="truncate text-[10px] font-bold uppercase tracking-[0.11em] text-tinta-400">
          {rotulo}
        </span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="tabular text-[28px] font-extrabold leading-none tracking-[-0.025em] text-tinta-900">
          {valor.toLocaleString("pt-BR")}
        </span>
        {parte !== undefined && parte > 0 && (
          <span className="tabular text-[12px] font-semibold text-tinta-400">
            {Math.round((valor / parte) * 100)}%
          </span>
        )}
      </div>
      {nota && (
        <p className="mt-1.5 text-[10.5px] leading-snug text-tinta-400">{nota}</p>
      )}
    </div>
  );
}

function Escolha({
  rotulo,
  valor,
  opcoes,
  onMuda,
}: {
  rotulo: string;
  valor: string | null;
  opcoes: { valor: string; rotulo: string }[];
  onMuda: (v: string | null) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[12px] text-tinta-500">{rotulo}</span>
      <select
        value={valor ?? ""}
        onChange={(e) => onMuda(e.target.value || null)}
        className={`h-8 max-w-[190px] rounded-md border bg-white px-2 text-[12.5px] outline-none focus:border-tema ${
          valor
            ? "border-tema font-semibold text-tinta-900"
            : "border-tinta-200 text-tinta-600"
        }`}
      >
        <option value="">Todos</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </label>
  );
}
