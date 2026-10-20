import { BarChart3, Building2, Eye, Inbox, Megaphone, MessageSquareText, Mic, Package, QrCode, Smartphone, Tag, UserPlus, Workflow } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  configurada,
  estadoDaConexao,
  todasAsInstancias,
} from "@/lib/evolution";
import { Central, Faixa, Atalho } from "@/components/ui/central";
import { contaLogadaVe } from "@/lib/conta";
import { MinhaConta } from "@/components/conta/minha-conta";

// A casa do atendimento.
//
// Os números do topo não são enfeite: quem abre esta tela precisa saber se tem
// gente esperando ANTES de decidir onde clicar. Sem eles, a única forma de
// descobrir que sete pessoas estão sem dono é abrir a caixa e olhar a fila.

export const dynamic = "force-dynamic";

// Fora do componente de propósito. A regra de pureza do compilador do React
// reclama de `Date.now()` no corpo de um componente — aqui é servidor e roda
// uma vez por requisição, mas a regra não distingue, e silenciar caso a caso
// esconderia o dia em que ela estiver certa.
function recortes() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return {
    quatroHoras: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    inicioDoDia: hoje.toISOString(),
  };
}

export default async function CentralAtendimento() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Contagens em paralelo, e `head: true` para o Postgres devolver só o total —
  // trazer as linhas para contá-las no Node seria pagar a rede à toa.
  const { quatroHoras, inicioDoDia } = recortes();

  const [
    abertas,
    semDono,
    esperando,
    hojeMsgs,
    conexao,
    supervisao,
    cadastradas,
    meuPerfil,
    instancias,
    numerosAtivos,
  ] =
    await Promise.all([
      supabase
        .from("conversas")
        .select("id", { count: "exact", head: true })
        .is("encerrada_em", null),
      supabase
        .from("conversas")
        .select("id", { count: "exact", head: true })
        .is("atendente_id", null)
        .is("encerrada_em", null),
      supabase
        .from("conversas")
        .select("id", { count: "exact", head: true })
        .is("primeira_resp_at", null)
        .lt("primeira_msg_at", quatroHoras),
      supabase
        .from("mensagens")
        .select("id", { count: "exact", head: true })
        .gte("momento", inicioDoDia),
      // Se a Evolution não responder, a central não pode cair junto: o estado da
      // conexão é informação, não requisito para a página existir. Sem as
      // variáveis nem se chama — chamada que já se sabe que falha é só espera.
      configurada() ? estadoDaConexao().catch(() => null) : null,
      supabase.rpc("perfil_supervisao"),
      // Sem NINGUÉM CADASTRADA como atendente é a falha silenciosa do primeiro
      // dia: o lead entra normalmente, aparece em Aguardando, e `assumir_conversa`
      // recusa todo mundo com "nao_e_atendente". A fila enche e ninguém entende.
      //
      // Não é mais `disponivel = true`: aquilo era a chave do plantão, que saiu.
      // Ter a linha é o que hoje decide se a pessoa consegue puxar.
      supabase
        .from("atendentes")
        .select("id", { count: "exact", head: true }),

      // Só o nome, para o menu de conta do canto do cabeçalho.
      supabase
        .from("profiles")
        .select("nome")
        .eq("id", user?.id ?? "")
        .maybeSingle(),

      // ── OS NÚMEROS, TODOS ────────────────────────────────────────────────
      //
      // O aviso do topo olhava UMA instância — a do ambiente. Com sete, isso
      // mente das duas formas: diz que está tudo bem quando seis caíram, e diz
      // que está tudo fora quando só o primeiro caiu.
      //
      // Quem sabe quantos estão de pé é a Evolution, numa chamada só. Se ela
      // não responder, a central não cai junto — o aviso some, os números
      // continuam.
      configurada() ? todasAsInstancias().catch(() => null) : null,
      supabase
        .from("numeros")
        .select("instancia")
        .eq("ativo", true),
    ]);

  const nSemDono = semDono.count ?? 0;
  const nEsperando = esperando.count ?? 0;
  const temConfig = configurada();

  // ── QUANTOS NÚMEROS ESTÃO DE PÉ ───────────────────────────────────────────
  //
  // Cruzar o que está CADASTRADO com o que a Evolution diz estar conectado.
  // Um número no servidor que ninguém cadastrou não conta — e um cadastrado que
  // o servidor não conhece conta como fora, que é a verdade.
  const vivas = new Set(
    (instancias?.ok ? (instancias.dados ?? []) : [])
      .filter((i) => i.connectionStatus === "open")
      .map((i) => i.name),
  );
  const cadastrados = (numerosAtivos.data ?? []).map((n) => n.instancia);
  const nNoAr = cadastrados.filter((i) => vivas.has(i)).length;
  const nTotal = cadastrados.length;
  const nCaidos = nTotal - nNoAr;

  // Quando não há número cadastrado ainda, cai no estado antigo: a instância do
  // ambiente. É o caso de quem acabou de instalar e ainda não rodou o SQL.
  const noAr =
    nTotal > 0
      ? nNoAr > 0
      : conexao?.ok === true && conexao.dados.instance?.state === "open";
  // Métricas, fluxo, etiquetas e conexão são de quem coordena. A central não
  // oferece o que a tela do outro lado vai negar.
  const coordena = supervisao.data === true;
  // Tráfego é da equipe (admin e usuário). Supervisor e atendente são mandados
  // de volta pelo layout se abrirem /trafego — mostrar o atalho seria a porta
  // trancada que esta central evita.
  const { data: equipe } = await supabase.rpc("perfil_equipe");
  const temAtendente = (cadastradas.count ?? 0) > 0;
  const nomeDePerfil =
    meuPerfil.data?.nome ??
    (user?.user_metadata as { nome?: string } | undefined)?.nome ??
    "";

  return (
    <Central
      sobretitulo="Comunicação"
      titulo="Central de atendimento"
      descricao="Tudo o que passa pelo WhatsApp da campanha, num lugar só."
      acoes={<MinhaConta nome={nomeDePerfil} email={user?.email ?? ""} />}
      numeros={[
        { rotulo: "Conversas abertas", valor: abertas.count ?? 0, tom: "bom" },
        {
          rotulo: "Sem dono",
          valor: nSemDono,
          tom: nSemDono > 0 ? "atencao" : "neutro",
        },
        {
          rotulo: "Esperando +4h",
          valor: nEsperando,
          tom: nEsperando > 0 ? "ruim" : "neutro",
        },
        { rotulo: "Mensagens hoje", valor: hojeMsgs.count ?? 0 },
      ]}
      aviso={
        !noAr
          ? {
              urgente: true,
              texto: (
                <>
                  {nTotal > 1
                    ? "Nenhum número está no ar"
                    : "O WhatsApp está desconectado"}{" "}
                  — nada entra nem sai. Abra <b>Números da campanha</b> e leia o
                  QR de cada um.
                </>
              ),
            }
          : // ALGUNS CAÍRAM, e isso é pior do que todos caírem: o tráfego
            // continua entrando pelos anúncios daquele número, e as mensagens
            // simplesmente não chegam. Ninguém estranha, porque a fila dos
            // outros continua andando.
            nCaidos > 0
            ? {
                urgente: true,
                texto: (
                  <>
                    {nCaidos === 1
                      ? "Um número caiu"
                      : `${nCaidos} números caíram`}{" "}
                    e {nCaidos === 1 ? "continua" : "continuam"} recebendo
                    tráfego. Veja quais em <b>Números da campanha</b>.
                  </>
                ),
              }
            : nEsperando > 0
            ? {
                urgente: true,
                texto: (
                  <>
                    {nEsperando === 1
                      ? "Uma pessoa está"
                      : `${nEsperando} pessoas estão`}{" "}
                    há mais de quatro horas sem resposta. É verba paga
                    esperando.
                  </>
                ),
              }
            : undefined
      }
    >
      {/* ── CAPTAR ─────────────────────────────────────────────────────────
          O tráfego pago morava em "Análise", ao lado das demandas de saúde. Na
          divisão por setor de 15/09 ele vem para cá, e antes de "Atender": é
          de onde nascem os leads que a caixa recebe. Quem olha custo por
          conversa precisa ver, no mesmo lugar, se a fila está dando conta. */}
      {equipe === true && (await contaLogadaVe("trafego")) && (
        <Faixa titulo="Captar" nota="De onde vêm as conversas.">
          <Atalho
            href="/trafego"
            icone={Megaphone}
            tom="rosa"
            titulo="Tráfego pago"
            nota="As contas de anúncio, a meta do dia e o custo por conversa"
          />
        </Faixa>
      )}

      <Faixa titulo="Atender" nota="O dia a dia de quem responde os leads.">
        {/* Cadastro na mão fica ao lado da caixa, e não escondido embaixo:
            com chip caindo, é por aqui que a operação continua. */}
        <Atalho
          href="/atendimento/cadastro"
          icone={UserPlus}
          tom="verde"
          titulo="Cadastrar pessoa"
          nota="Para quem foi atendido pelo telefone"
        />

        <Atalho
          destaque
          href="/atendimento/caixa"
          icone={Inbox}
          tom="azul"
          titulo="Caixa de entrada"
          nota="Fila, conversa e ficha da pessoa"
          selo={
            nSemDono > 0
              ? { texto: `${nSemDono} sem dono`, tom: "atencao" }
              : undefined
          }
        />
      </Faixa>

      {/* ── ACOMPANHAR ────────────────────────────────────────────────────
          Separado de "Atender" de propósito. Eram a mesma faixa, e misturavam
          duas rotinas diferentes: a menina responde lead o dia inteiro e nunca
          abre Métricas; a coordenação abre Métricas e nunca responde lead.
          Numa faixa só, cada uma passava os olhos por cinco cartões para achar
          o seu. */}
      {coordena && (
        <Faixa
          titulo="Acompanhar"
          nota="Onde a coordenação lê o que a equipe fez."
        >
          <Atalho
            href="/atendimento/supervisao"
            icone={Eye}
            tom="verde"
            titulo="Supervisão"
            nota="Todas as conversas da equipe, com filtro por atendente"
            selo={
              nEsperando > 0
                ? { texto: `${nEsperando} sem resposta`, tom: "ruim" }
                : undefined
            }
          />
          <Atalho
            href="/atendimento/metricas"
            icone={BarChart3}
            tom="roxo"
            titulo="Métricas"
            nota="Os dois eixos, com filtro por período e atendente"
          />
          {/* O "Painel da base antiga" foi para o Arquivo do Gabinete: é
              consulta do que veio antes do CRM próprio, não rotina de quem
              acompanha a equipe hoje. */}
        </Faixa>
      )}

      {/* ── O QUE VAI PARA A MÃO DO ELEITOR ───────────────────────────────
          Isto estava dentro de "Automatizar", e não era automação nenhuma:
          santinho, áudio, kit e QR são CONTEÚDO — o que a campanha entrega.
          O nome errado fazia a coordenação procurar material em "Configurar" e
          não achar.

          O QR entra aqui porque é o mesmo assunto pelo outro lado: o material
          impresso que leva a pessoa até a conversa. */}
      {coordena && (
        <Faixa
          titulo="Material da campanha"
          nota="O que a equipe manda, e o que leva o eleitor até ela."
        >
          <Atalho
            href="/atendimento/audios"
            icone={Mic}
            tom="roxo"
            titulo="Materiais da campanha"
            nota="Santinhos, áudios da Talita e frases prontas"
          />
          <Atalho
            href="/atendimento/mensagens"
            icone={MessageSquareText}
            tom="roxo"
            titulo="Mensagens prontas"
            nota="O texto que a equipe manda com um toque, com link para encaminhar"
          />
          <Atalho
            href="/atendimento/kits"
            icone={Package}
            tom="roxo"
            titulo="Kits políticos"
            nota="Santinho, áudio e frase numa sequência só"
          />
          <Atalho
            href="/atendimento/links"
            icone={QrCode}
            tom="roxo"
            titulo="Links e QR"
            nota="QR do impresso, card para status, e quem espalhou cada um"
          />
        </Faixa>
      )}

      {/* ── AS REGRAS DA CASA ─────────────────────────────────────────────
          Fluxo e Etiquetas vieram para cá. Não são material nem rotina: são
          REGRA — o roteiro que responde sozinho e o vocabulário do relatório.
          Mexer neles muda o comportamento do sistema inteiro, que é
          exatamente o que "Configurar" quer dizer. */}
      {coordena && (
        <Faixa
          titulo="Configurar"
          nota="As regras da casa. Só a coordenação enxerga esta parte."
        >
          <Atalho
            href="/atendimento/etiquetas"
            icone={Tag}
            tom="roxo"
            titulo="Etiquetas"
            nota="O vocabulário do relatório: status, demanda e as de trabalho"
          />
          <Atalho
            href="/atendimento/fluxo"
            icone={Workflow}
            tom="ambar"
            titulo="Fluxo de atendimento"
            nota="O roteiro que responde o primeiro contato sozinho"
          />
          {/* "Conexão do WhatsApp" saiu daqui.
              Ela era a tela de UM número: estado, QR, desconectar. "Números da
              campanha" faz tudo isso para cada um, e mais — dona, contagem de
              leads e o alerta de risco. Duas portas para a mesma coisa é como
              nasce o "eu conectei lá e não funcionou aqui". */}
          <Atalho
            href="/atendimento/numeros"
            icone={Smartphone}
            tom={noAr ? "verde" : "vermelho"}
            titulo="Números da campanha"
            nota="Quem atende cada um, quantos leads entraram, e qual caiu"
            selo={
              !temConfig
                ? { texto: "sem configuração", tom: "ruim" }
                : nTotal === 0
                  ? { texto: "nenhum cadastrado", tom: "ruim" }
                  : nCaidos > 0
                    ? {
                        texto:
                          nNoAr === 0
                            ? "todos fora do ar"
                            : `${nCaidos} fora do ar`,
                        tom: "ruim",
                      }
                    : {
                        texto: nTotal === 1 ? "no ar" : `${nNoAr} no ar`,
                        tom: "bom",
                      }
            }
          />
          <Atalho
            href="/atendimento/atendentes"
            icone={UserPlus}
            tom={temAtendente ? "cinza" : "vermelho"}
            selo={
              temAtendente
                ? undefined
                : { texto: "nenhuma cadastrada", tom: "ruim" }
            }
            titulo="Atendentes"
            nota="Quem tem acesso para atender"
          />
          <Atalho
            href="/atendimento/departamentos"
            icone={Building2}
            tom="cinza"
            titulo="Departamentos"
            nota="Os setores do gabinete e quem responde por cada um"
          />
        </Faixa>
      )}
    </Central>
  );
}
