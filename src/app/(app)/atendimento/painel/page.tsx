import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  DEMANDAS,
  STATUS,
  PREVALENCIA,
  TIPOS,
  type Status,
  type Tipo,
} from "@/lib/atendimento";
import { BotaoSincronizar } from "@/components/atendimento/botao-sincronizar";
import { Cabecalho } from "@/components/ui/pagina";
import {
  BarrasNomeadas,
  BarrasPorDia,
  FaixasDeEspera,
  RAMPA_ESPERA,
} from "@/components/atendimento/graficos";

// Central de atendimento.
//
// DUAS REGRAS ORGANIZAM ESTA TELA.
//
// 1. Lead de tráfego e disparo para base NUNCA são somados. A pessoa escreveu
//    primeiro? É lead, e cabe SLA. A campanha escreveu primeiro? É disparo, e
//    a métrica é retorno. Somar os dois faz "não atendido" — que existe para
//    apontar falha da equipe — incluir gente que nunca pediu nada.
//
// 2. A tela abre pelo que exige ação hoje, não pelo que é bonito de mostrar.
//    Fila primeiro, explicação depois. Quem abre isto às sete da manhã precisa
//    saber em dez segundos quem está esperando há mais tempo.

export const dynamic = "force-dynamic";

// Fora do componente: a regra de pureza do compilador do React não distingue
// servidor de cliente, e aqui isto roda uma vez por requisição.
function agoraEmMs() {
  return Date.now();
}

type Contagem = Record<string, number>;

type Registro = {
  tipo: Tipo | null;
  status_lead: Status | null;
  demandas: string[] | null;
  municipio: string | null;
  assigned_to: string | null;
  respondida_por: string | null;
  criado_em: string | null;
  primeira_msg_at: string | null;
  primeira_resp_at: string | null;
  ultima_direcao: string | null;
  contact_name: string | null;
  phone: string | null;
};

/** O teto da leitura. Ele existe para a página não puxar a tabela inteira —
 *  mas TODO número desta tela sai de `linhas.length`, então um teto que corta
 *  vira métrica errada em silêncio. Por isso ele volta junto com o total de
 *  verdade, e a tela avisa quando cortou. */
const TETO = 5000;

async function ler() {
  const supabase = await createClient();
  // Lista de colunas numa STRING SÓ: o supabase-js lê esse texto em tempo de
  // tipo, e concatenação com "+" vira `string` genérica e quebra o build.
  //
  // `count: "exact"` conta a tabela TODA, sem se importar com o `limit` — é a
  // única forma de saber se o teto cortou. Sem isso, a tela mostraria 5.000
  // como se fosse o total e ninguém perceberia.
  const [{ data, error, count }, { data: ultima }] = await Promise.all([
    supabase
      .from("atendimentos")
      .select(
        "tipo, status_lead, demandas, municipio, assigned_to, respondida_por, criado_em, primeira_msg_at, primeira_resp_at, ultima_direcao, contact_name, phone",
        { count: "exact" },
      )
      .limit(TETO),
    // Quando esta tabela foi alimentada pela última vez. Ver o aviso de idade
    // na tela: ela vem de uma sincronização MANUAL, então pode estar parada há
    // semanas sem nada indicar.
    supabase
      .from("atendimentos")
      .select("sincronizado_em")
      .order("sincronizado_em", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (error || !data)
    return {
      ligado: false,
      linhas: [] as Registro[],
      total: 0,
      cortou: false,
      sincronizadoEm: null as string | null,
    };
  return {
    ligado: true,
    linhas: data as Registro[],
    total: count ?? data.length,
    cortou: (count ?? 0) > data.length,
    sincronizadoEm: ultima?.sincronizado_em ?? null,
  };
}

/** Quantos dias desde a última sincronização, ou `null` se nunca houve. */
function diasDesde(iso: string | null) {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 864e5;
}

const FAIXAS = [
  { rotulo: "até 1h", teto: 1 },
  { rotulo: "1 a 4h", teto: 4 },
  { rotulo: "4 a 24h", teto: 24 },
  { rotulo: "1 a 3 dias", teto: 72 },
  { rotulo: "mais de 3 dias", teto: Infinity },
];

const horas = (de: string, ate: string) =>
  (new Date(ate).getTime() - new Date(de).getTime()) / 36e5;

const faixaDe = (h: number) => FAIXAS.findIndex((f) => h <= f.teto);

const emTempo = (h: number) =>
  h < 1
    ? `${Math.round(h * 60)}min`
    : h < 48
      ? `${h.toFixed(0)}h`
      : `${(h / 24).toFixed(0)} dias`;

const diaCurto = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** Cartão de número. O rótulo vem antes do número porque a pessoa lê de cima
 *  para baixo e precisa saber do que é o número antes de vê-lo. */
function Numero({
  rotulo,
  valor,
  apoio,
  tom = "neutro",
}: {
  rotulo: string;
  valor: string | number;
  apoio?: string;
  tom?: "neutro" | "critico" | "bom";
}) {
  const cor =
    tom === "critico"
      ? "text-[#c2410c]"
      : tom === "bom"
        ? "text-[#0f7a3d]"
        : "text-tinta-900";
  return (
    <div className="rounded-xl border border-tinta-200 bg-white px-4 py-3.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-tinta-500">
        {rotulo}
      </p>
      <p
        className={`tabular mt-1.5 text-[27px] font-extrabold leading-none ${cor}`}
      >
        {valor}
      </p>
      {apoio && (
        <p className="mt-1.5 text-[11px] leading-snug text-tinta-500">
          {apoio}
        </p>
      )}
    </div>
  );
}

/** Cabeçalho de bloco. Título à esquerda, o que o bloco NÃO diz à direita —
 *  é onde mora a ressalva que evita leitura errada. */
function Titulo({ children, nota }: { children: ReactNode; nota?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="text-[14px] font-bold tracking-[-0.01em] text-tinta-900">
        {children}
      </h2>
      {nota && <p className="text-[11px] text-tinta-400">{nota}</p>}
    </div>
  );
}

function Cartao({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-tinta-200 bg-white p-5 ${className}`}
    >
      {children}
    </div>
  );
}

export default async function AtendimentoPage() {
  // O painel é de quem coordena, não de quem atende.
  //
  // Ele mostra o desempenho da equipe pessoa a pessoa — quem respondeu rápido,
  // quem deixou esperando. Isso é conversa de supervisão com a atendente, não
  // placar aberto entre colegas no meio do plantão.
  //
  // Esconder o cartão na central não é trava: a rota continua digitável. A
  // negativa mora aqui, no servidor, e o banco confere de novo pela RLS.
  const gate = await createClient();
  const { data: podeVer } = await gate.rpc("perfil_supervisao");
  if (!podeVer) {
    return (
      <div className="mx-auto max-w-[560px] px-6 py-16 text-center">
        <h1 className="text-[19px] font-bold text-tinta-900">Sem permissão</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-tinta-500">
          O painel de métricas é da supervisão. Se você precisa acompanhar os
          números da equipe, peça a um supervisor.
        </p>
      </div>
    );
  }

  const { ligado, linhas, total, cortou, sincronizadoEm } = await ler();
  const agora = agoraEmMs();
  const idade = diasDesde(sincronizadoEm);

  const leads = linhas.filter((l) => l.tipo === "lead");
  const disparos = linhas.filter((l) => l.tipo === "disparo");
  const semTipo = linhas.length - leads.length - disparos.length;
  const totalLeads = leads.length;

  const pct = (n: number, de: number) => (de > 0 ? (n / de) * 100 : 0);

  // ── a fila: leads que escreveram e ninguém respondeu ──────────────────────
  const fila = leads
    .filter((l) => !l.primeira_resp_at && l.primeira_msg_at)
    .map((l) => ({
      ...l,
      espera: (agora - new Date(l.primeira_msg_at as string).getTime()) / 36e5,
    }))
    .sort((a, b) => b.espera - a.espera);

  // ── tempo até a primeira resposta, entre os que FORAM respondidos ─────────
  const respondidos = leads.filter(
    (l) => l.primeira_resp_at && l.primeira_msg_at,
  );
  const porFaixa = FAIXAS.map((f) => ({ rotulo: f.rotulo, valor: 0 }));
  let somaEspera = 0;
  for (const l of respondidos) {
    const h = horas(l.primeira_msg_at as string, l.primeira_resp_at as string);
    somaEspera += h;
    const i = faixaDe(h);
    if (i >= 0) porFaixa[i].valor++;
  }
  const medianaish =
    respondidos.length > 0 ? somaEspera / respondidos.length : 0;

  // ── chegadas por dia (últimos 14) ─────────────────────────────────────────
  const porDia = new Map<string, number>();
  for (const l of leads) {
    const q = l.primeira_msg_at ?? l.criado_em;
    if (q) porDia.set(q.slice(0, 10), (porDia.get(q.slice(0, 10)) ?? 0) + 1);
  }
  const dias = [...porDia.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([iso, n]) => ({ rotulo: diaCurto(iso), valor: n }));

  // ── contagens ─────────────────────────────────────────────────────────────
  const porStatus: Contagem = {};
  const porDemanda: Contagem = {};
  const porMunicipio: Contagem = {};
  for (const l of leads) {
    if (l.status_lead)
      porStatus[l.status_lead] = (porStatus[l.status_lead] ?? 0) + 1;
    for (const d of l.demandas ?? []) porDemanda[d] = (porDemanda[d] ?? 0) + 1;
    if (l.municipio)
      porMunicipio[l.municipio] = (porMunicipio[l.municipio] ?? 0) + 1;
  }

  // Atendente conta sobre tudo: responder disparo também é trabalho. E conta
  // por QUEM RESPONDEU (sentBy), não por quem foi designado — 91% das conversas
  // não têm designado, e contar pelo designado zeraria o trabalho da equipe.
  const porAtendente: Contagem = {};
  for (const l of linhas) {
    const quem = (l.respondida_por ?? l.assigned_to)?.trim();
    if (quem) porAtendente[quem] = (porAtendente[quem] ?? 0) + 1;
  }
  const totalAtendidas = Object.values(porAtendente).reduce((a, b) => a + b, 0);

  const disparoVoltou = disparos.filter((l) => l.primeira_msg_at).length;
  const apoio = (porStatus.apoiador ?? 0) + (porStatus.multiplicador ?? 0);

  // ── a conversão ───────────────────────────────────────────────────────────
  //
  // Quantos, de quem já foi CLASSIFICADO, declararam apoio.
  //
  // O denominador é o classificado, e não o total de leads, de propósito: quem
  // ainda não foi marcado não é um "não apoiador", é um desconhecido. Dividindo
  // pelo total, a conversão afundaria toda vez que a equipe atrasasse a
  // classificação — e o número diria "o apoio caiu" quando o que caiu foi a
  // marcação. É o mesmo erro que já deu na tela de métricas.
  const classificados = Object.values(porStatus).reduce((a, b) => a + b, 0);
  const conversao = pct(apoio, classificados);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Chamava-se "Central de atendimento" — nome que agora é da central da
          área. Duas telas com o mesmo nome, uma dentro da outra, é a receita
          para ninguém saber onde está. */}
      <div className="mb-6">
        <Cabecalho
          voltar="/atendimento"
          sobretitulo="Atendimento"
          titulo="Painel de métricas"
          descricao="Os dois eixos, o tempo de resposta e o funil."
          acoes={<BotaoSincronizar primeiraVez={linhas.length === 0} />}
        />
      </div>

      {!ligado && (
        <Cartao className="mb-6 border-amber-200 bg-amber-50">
          <p className="text-[13px] font-bold text-amber-900">
            Aguardando a primeira sincronização
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-amber-800">
            Clique em trazer as conversas para preencher o painel.
          </p>
        </Cartao>
      )}

      {/* ── DE QUANDO SÃO ESTES NÚMEROS ─────────────────────────────────────
          Esta tela NÃO lê as conversas do PIE. Ela lê a tabela `atendimentos`,
          que vem do GabiFlow e só é preenchida quando alguém clica em trazer
          as conversas — não há tarefa automática fazendo isso.

          Enquanto ninguém clica, a tela continua desenhando cartões, gráficos
          e porcentagens com a mesma cara de sempre, e nada indica que são de
          semanas atrás. Número velho com cara de número de hoje é pior do que
          tela fora do ar: a tela fora do ar ninguém usa para decidir. */}
      {ligado && idade !== null && idade >= 1 && (
        <Cartao
          className={`mb-6 ${
            idade >= 7
              ? "border-rose-200 bg-rose-50"
              : "border-amber-200 bg-amber-50"
          }`}
        >
          <p
            className={`text-[13px] font-bold ${
              idade >= 7 ? "text-rose-900" : "text-amber-900"
            }`}
          >
            {idade >= 7
              ? `Estes números estão parados há ${Math.floor(idade)} dias`
              : "Estes números não são de hoje"}
          </p>
          <p
            className={`mt-1 text-[12.5px] leading-relaxed ${
              idade >= 7 ? "text-rose-800" : "text-amber-800"
            }`}
          >
            Última sincronização em{" "}
            <strong>
              {new Date(sincronizadoEm as string).toLocaleString("pt-BR", {
                timeZone: "America/Bahia",
                dateStyle: "short",
                timeStyle: "short",
              })}
            </strong>
            . Este painel vem do GabiFlow e só atualiza quando alguém clica em
            trazer as conversas. Tudo abaixo é a foto daquele momento, não do
            atendimento de agora — para o número de hoje, use Métricas ou
            Supervisão.
          </p>
        </Cartao>
      )}

      {/* O teto de leitura cortou: os números abaixo são de uma PARTE da
          tabela. Ver o comentário em `TETO`. */}
      {cortou && (
        <Cartao className="mb-6 border-rose-200 bg-rose-50">
          <p className="text-[13px] font-bold text-rose-900">
            A tela está mostrando só parte dos atendimentos
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-rose-800">
            São <strong>{total.toLocaleString("pt-BR")}</strong> atendimentos na
            base e esta página lê no máximo{" "}
            <strong>{TETO.toLocaleString("pt-BR")}</strong>. Todos os números,
            porcentagens e listas abaixo estão calculados sobre esse recorte, e
            não sobre o total.
          </p>
        </Cartao>
      )}

      {/* ── a linha de números que resolve os dez primeiros segundos ───────── */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Numero
          rotulo="Leads de tráfego"
          valor={ligado ? totalLeads : "—"}
          apoio={`${disparos.length} disparos contados à parte`}
        />
        <Numero
          rotulo="Esperando agora"
          valor={ligado ? fila.length : "—"}
          tom={fila.length > 0 ? "critico" : "neutro"}
          apoio={
            fila.length > 0
              ? `pior espera: ${emTempo(fila[0].espera)}`
              : "ninguém sem resposta"
          }
        />
        <Numero
          rotulo="Taxa de resposta"
          valor={
            ligado ? `${pct(respondidos.length, totalLeads).toFixed(0)}%` : "—"
          }
          tom={pct(respondidos.length, totalLeads) >= 80 ? "bom" : "critico"}
          apoio={`${respondidos.length} de ${totalLeads} leads`}
        />
        <Numero
          rotulo="Conversão em apoio"
          valor={
            ligado && classificados > 0 ? `${conversao.toFixed(1)}%` : "—"
          }
          tom={conversao >= 70 ? "bom" : "neutro"}
          apoio={
            classificados > 0
              ? `${apoio} de ${classificados} classificados · ${porStatus.multiplicador ?? 0} multiplicam`
              : "ninguém classificado ainda"
          }
        />
      </section>

      {ligado && classificados > 0 && classificados < totalLeads && (
        <p className="mb-6 rounded-lg border border-tinta-200 bg-tinta-50 px-4 py-2.5 text-[11.5px] leading-relaxed text-tinta-600">
          A conversão é sobre os{" "}
          <b className="tabular">{classificados}</b> já classificados — não
          sobre os {totalLeads} leads. Faltam{" "}
          <b className="tabular">{totalLeads - classificados}</b> sem eixo
          marcado; até serem marcados, eles não contam nem a favor nem contra.
        </p>
      )}

      {semTipo > 0 && (
        <p className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[11.5px] leading-relaxed text-amber-900">
          <b className="tabular">{semTipo}</b> conversas ainda sem origem
          classificada — a sincronização das mensagens não terminou. Ficam de
          fora dos números acima em vez de entrar no lado errado.
        </p>
      )}

      {/* ── a fila, que é a única parte acionável hoje ─────────────────────── */}
      {ligado && fila.length > 0 && (
        <section className="mb-6">
          <Titulo nota="ordenado pela espera mais longa">
            Quem está esperando resposta
          </Titulo>
          <Cartao className="!p-0">
            <ul className="divide-y divide-tinta-100">
              {fila.slice(0, 8).map((l) => {
                const i = faixaDe(l.espera);
                return (
                  <li
                    key={l.phone}
                    className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-2.5 sm:grid-cols-[1fr_8rem_auto]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-tinta-900">
                        {l.contact_name?.trim() || l.phone}
                      </span>
                      {l.contact_name?.trim() && (
                        <span className="tabular block truncate text-[11px] text-tinta-400">
                          {l.phone}
                        </span>
                      )}
                    </span>
                    <span className="hidden truncate text-[12px] text-tinta-500 sm:block">
                      {l.municipio ?? "—"}
                    </span>
                    <span className="flex items-center justify-end gap-2">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: RAMPA_ESPERA[Math.max(0, i)] }}
                      />
                      <span className="tabular w-[4.5rem] text-right text-[12.5px] font-bold text-tinta-900">
                        {emTempo(l.espera)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {fila.length > 8 && (
              <p className="border-t border-tinta-100 px-5 py-2.5 text-[11.5px] text-tinta-500">
                e mais {fila.length - 8} na mesma situação —{" "}
                {pct(fila.length, totalLeads).toFixed(0)}% de todos os leads. Se
                vieram de anúncio, é verba paga esperando.
              </p>
            )}
          </Cartao>
        </section>
      )}

      {/* ── volume e velocidade, lado a lado ───────────────────────────────── */}
      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <div>
          <Titulo nota="últimos 14 dias com movimento">
            Leads chegando por dia
          </Titulo>
          <Cartao>
            <BarrasPorDia dados={dias} />
          </Cartao>
        </div>
        <div>
          <Titulo nota={`média de ${emTempo(medianaish)}`}>
            Tempo até a primeira resposta
          </Titulo>
          <Cartao>
            <FaixasDeEspera dados={porFaixa} total={respondidos.length} />
          </Cartao>
        </div>
      </section>

      {/* ── status ─────────────────────────────────────────────────────────── */}
      <section className="mb-6">
        <Titulo nota="uma categoria por pessoa — a soma fecha os leads">
          Em que pé está cada lead
        </Titulo>
        <Cartao>
          <BarrasNomeadas
            total={totalLeads}
            destaque={STATUS.nao_atendido.rotulo}
            dados={PREVALENCIA.map((s) => ({
              rotulo: STATUS[s].rotulo,
              valor: porStatus[s] ?? 0,
              nota: STATUS[s].regra,
            }))}
          />
        </Cartao>
      </section>

      {/* ── demanda e território ───────────────────────────────────────────── */}
      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <div>
          <Titulo nota="uma pessoa pode ter várias">
            O que as pessoas pedem
          </Titulo>
          <Cartao>
            <BarrasNomeadas
              total={totalLeads}
              dados={(Object.keys(DEMANDAS) as (keyof typeof DEMANDAS)[])
                .map((d) => ({
                  rotulo: DEMANDAS[d].rotulo,
                  valor: porDemanda[d] ?? 0,
                }))
                .sort((a, b) => b.valor - a.valor)}
              vazio="Nenhuma demanda identificada ainda."
            />
          </Cartao>
        </div>
        <div>
          <Titulo nota="só quem citou a cidade na conversa">
            De onde estão falando
          </Titulo>
          <Cartao>
            <BarrasNomeadas
              total={totalLeads}
              dados={Object.entries(porMunicipio)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([m, n]) => ({ rotulo: m, valor: n }))}
              vazio="Nenhum município identificado ainda."
            />
          </Cartao>
        </div>
      </section>

      {/* ── equipe ─────────────────────────────────────────────────────────── */}
      <section className="mb-6">
        <Titulo nota="por quem respondeu, não por quem foi designado">
          Carga por atendente
        </Titulo>
        <Cartao>
          <BarrasNomeadas
            total={totalAtendidas}
            dados={Object.entries(porAtendente)
              .sort((a, b) => b[1] - a[1])
              .map(([nome, n]) => ({ rotulo: nome, valor: n }))}
            vazio="Aparece aqui quem de fato respondeu, lead ou disparo."
          />
        </Cartao>
      </section>

      {/* ── disparo, com a métrica que lhe cabe ────────────────────────────── */}
      <section className="mb-6">
        <Titulo nota="operação separada — aqui SLA não existe">
          {TIPOS.disparo.rotulo}
        </Titulo>
        <Cartao className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="flex gap-8">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-tinta-500">
                Enviados
              </p>
              <p className="tabular mt-1 text-[27px] font-extrabold leading-none text-tinta-900">
                {ligado ? disparos.length : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-tinta-500">
                Voltaram a falar
              </p>
              <p className="tabular mt-1 text-[27px] font-extrabold leading-none text-tinta-900">
                {ligado ? disparoVoltou : "—"}
                {ligado && disparos.length > 0 && (
                  <span className="ml-2 text-[13px] font-bold text-tinta-400">
                    {pct(disparoVoltou, disparos.length).toFixed(0)}%
                  </span>
                )}
              </p>
            </div>
          </div>
          <p className="text-[11.5px] leading-relaxed text-tinta-500">
            Ninguém aqui estava esperando — o número que vale é retorno, não
            tempo de resposta.
          </p>
        </Cartao>
      </section>
    </div>
  );
}
