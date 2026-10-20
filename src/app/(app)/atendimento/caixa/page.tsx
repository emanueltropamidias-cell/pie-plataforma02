import { createClient } from "@/lib/supabase/server";
import { after } from "next/server";
import { sincronizarConexoes, estaCaido } from "@/lib/conexao";
import { provedor } from "@/lib/wa";
import { CaixaClient, type Conversa } from "@/components/caixa/caixa-client";

// A caixa de entrada — onde a atendente passa o dia.
//
// O servidor entrega a fila e a lista de gente; a partir daí é o navegador que
// manda, porque trocar de conversa não pode custar uma ida ao servidor: a
// atendente pula entre conversas dezenas de vezes por hora.
//
// A fila vem ordenada pela última mensagem, e não pela criação. Conversa que
// acabou de receber resposta é a que precisa de atenção agora.

export const dynamic = "force-dynamic";

// prettier-ignore
const COLUNAS = "id, telefone, nome, tipo, status_lead, demandas, municipio, bairro, origem, primeira_msg_at, primeira_resp_at, ultima_direcao, atendente_id, atribuido_em, encerrada_em, fluxo_estagio, departamento_id, ultima_msg, ultima_msg_at, ultima_entrada_at, total_mensagens, nome_sugerido, municipio_sugerido, bairro_sugerido, indicado_por, cadastrado_em";

export default async function CaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  const abrir = Number(c);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── TRÊS CONSULTAS, CADA UMA LIMITADA PELO QUE A ABA PRECISA ──────────────
  //
  // Antes era uma só: as 200 conversas mais recentes, de todo mundo, abertas e
  // encerradas misturadas. A 4000 leads por dia isso quebra de dois jeitos ao
  // mesmo tempo:
  //
  //   · o que está fora das 200 mais recentes SOME — e o que sai primeiro é
  //     justamente o lead esquecido, que é o que mais importa;
  //   · e mesmo assim carrega conversa encerrada de outra pessoa, que ninguém
  //     vai olhar.
  //
  // Separando por finalidade, cada consulta tem um teto que faz sentido e o
  // navegador recebe só o que a tela usa.
  //
  // `COLUNAS` numa constante e numa STRING SÓ: o supabase-js lê esse texto em
  // tempo de tipo, e concatenação com "+" vira `string` genérica e quebra o
  // build.
  // Sem sessão, um uuid que não é de ninguém — e não string vazia. O `or(...)`
  // da Aguardando monta o filtro por concatenação: `atendente_id.eq.` sem valor
  // é sintaxe inválida para o PostgREST e derrubaria a tela inteira, em vez de
  // devolver lista vazia. Zeros são um uuid válido que não casa com nada.
  const eu = user?.id ?? "00000000-0000-0000-0000-000000000000";

  // Confere o estado dos números com a Evolution DEPOIS de responder — a
  // atendente não espera por isso. Cobre o evento perdido e o primeiro dia,
  // quando nada mudou e por isso nada foi avisado.
  after(sincronizarConexoes);

  const { data: podeTudo } = await supabase.rpc("perfil_supervisao");

  // ── AGUARDANDO É DO MEU NÚMERO, NÃO DE TODO MUNDO ─────────────────────────
  //
  // Era global — desenho de quando havia um número só, e todo lead sem dono
  // era de todos. Com um número por atendente virou vazamento: o lead que
  // escreveu para a Maiana aparecia na fila da Deise.
  //
  // Isso é pior que confusão de tela. A campanha separou os números de
  // propósito, para a Meta não ligar um ao outro; duas atendentes respondendo
  // a mesma pessoa por chips diferentes é exatamente o cruzamento que se quis
  // evitar. E do lado do eleitor é uma desconhecida escrevendo de um número
  // que ele nunca contatou.
  //
  // ── NÃO EXISTE MONTE, E NINGUÉM PUXA NADA ─────────────────────────────────
  //
  // Aqui havia `|| n.atendente_id === null`: número sem dona caía na fila de
  // TODAS. Era herança de quando existia um número só e a fila era um monte
  // comum de onde qualquer uma pescava.
  //
  // Com um chip por atendente esse monte não existe. O lead que chega no chip
  // dela é DELA — não há gesto de puxar, não há fila compartilhada, e mostrar
  // o lead de uma na tela da outra não é rede de segurança: é a bagunça que
  // fez esta tela ficar ilegível.
  //
  // Número sem dona é CONFIGURAÇÃO FALTANDO, não conversa de ninguém. Quem
  // resolve isso é a coordenação, na tela de Números — e ela enxerga tudo por
  // `podeTudo`. Espalhar para as atendentes não conserta; só espalha.
  const { data: numerosVisiveis } = await supabase
    .from("numeros")
    .select("id, atendente_id")
    .eq("ativo", true);

  const meusNumeros = (numerosVisiveis ?? [])
    .filter((n) => n.atendente_id === eu)
    .map((n) => n.id);

  // ── A LISTA TEM TETO; A CONTAGEM NÃO PODE TER ─────────────────────────────
  //
  // Trazer dez mil conversas para o navegador deixaria a tela lenta no dia mais
  // movimentado — o teto da LISTA é proposital e fica.
  //
  // O erro era outro: os números nas abas eram `conversas.filter(...).length`,
  // ou seja, contagem do que coube no teto. "Meu histórico · 402" não era 402
  // conversas, era o teto de 400 batendo. E a campanha lia isso como métrica.
  //
  // Contar no banco custa uma consulta de cabeçalho, sem trazer linha nenhuma.
  // A lista continua limitada, o número passa a ser verdade, e quando os dois
  // divergem a tela DIZ que está mostrando uma parte.
  const [
    minhas,
    aguardando,
    encerradas,
    totalMinhas,
    totalAguardando,
    totalEncerradas,
    totalMeuHistorico,
    { data: atendentes },
    { data: tags },
    { data: perfil },
    { data: meuNumero },
  ] = await Promise.all([
      // ── AS DUAS ABAS SE DIVIDEM POR ONDE ESTÁ A BOLA ────────────────────
      //
      // Regra do Emanuel, e é a de qualquer caixa de entrada:
      //
      //   AGUARDANDO        = a pessoa falou por último. A dívida é nossa.
      //   MEUS ATENDIMENTOS = eu falei por último. A bola está com ela.
      //
      // Uma coluna decide as duas: `ultima_direcao`. Nada de somar condição.
      //
      // Tentei antes com `primeira_resp_at` — "já teve resposta alguma vez". Era
      // sutilmente errado: a conversa respondida ontem, em que a pessoa escreveu
      // de novo hoje, ficava em Meus atendimentos como se estivesse resolvida.
      // É a linha "Esperando você" da tela, e ela É dívida: alguém escreveu e
      // ninguém voltou. Ver `espera()` em `lib/conversa.ts`, que já contava
      // assim — a aba é que discordava dele.
      //
      // MEUS ATENDIMENTOS: minhas conversas abertas onde eu respondi por último.
      supabase
        .from("conversas")
        .select(COLUNAS)
        .eq("atendente_id", eu)
        .is("encerrada_em", null)
        .not("primeira_resp_at", "is", null)
        .order("ultima_msg_at", { ascending: false, nullsFirst: false })
        .limit(400),

      // ── AGUARDANDO = A PESSOA FALOU POR ÚLTIMO ──────────────────────────
      //
      // `ultima_direcao = 'inbound'`, e mais nada. Cobre os DOIS estados que a
      // linha já mostrava e que a aba separava sem motivo:
      //
      //   "Ninguém respondeu" — nunca foi respondida
      //   "Esperando você"    — foi respondida antes, e a pessoa voltou a falar
      //
      // Os dois são a mesma dívida para quem atende: alguém escreveu e ninguém
      // voltou. Separá-los escondia metade do trabalho em outra aba.
      //
      // ── ORDENADA PELA ÚLTIMA MENSAGEM, IGUAL À OUTRA ABA ────────────────
      //
      // Era `primeira_msg_at` crescente — quem chegou primeiro no topo. E o
      // teto de 400 vinha junto: com 500 em Aguardando, as 100 MAIS RECENTES
      // não eram sequer carregadas. O lead que acabou de escrever não aparecia
      // de jeito nenhum ao abrir a tela.
      //
      // Regra dele, e é a do WhatsApp: quem manda mensagem sobe. Vale nas duas
      // abas, e o servidor precisa entregar na mesma ordem que a tela mostra —
      // senão o corte de 400 desmente a ordenação do cliente.
      //
      // O lead antigo abandonado não fica invisível: a contagem da aba vem do
      // banco (não do teto), o aviso amarelo conta quem espera há mais de 4h, e
      // a tela de supervisão continua ordenada por tempo de espera. A caixa
      // responde "o que chegou agora?"; a supervisão responde "o que apodreceu?".
      //
      // O índice `(numero_id, ultima_msg_at desc)` já existe — `varios-numeros.sql`.
      //
      // ── PELO CHIP DELA **OU** COM O NOME DELA ───────────────────────────
      //
      // O recorte era só `numero_id in (meus números)`. Isso abria um vão, e
      // conversa caía nele: a que É dela (`atendente_id = eu`) mas está com
      // `numero_id` nulo ou de outro número não entrava em Aguardando por não
      // ser do chip, e não entrava em Meus atendimentos por não ter resposta.
      // Sobrava só em "Meu histórico" — que é onde o Diego apareceu.
      //
      // `numero_id` nulo acontece de verdade: cadastro manual feito por
      // atendente que ainda não tinha número tem 42 casos na base, e toda
      // conversa anterior ao `varios-numeros.sql` também.
      //
      // As duas portas, então: chegou pelo chip dela OU está com o nome dela.
      // Continua sendo só o que é dela — não é monte, não é fila de ninguém.
      (() => {
        let q = supabase
          .from("conversas")
          .select(COLUNAS)
          .is("primeira_resp_at", null)
          .is("encerrada_em", null);
        // Quem coordena continua vendo tudo: é o papel dela pescar o que ficou
        // parado em qualquer número, e é quem conserta número sem dona.
        if (!podeTudo)
          q = q.or(
            `numero_id.in.(${meusNumeros.length ? meusNumeros.join(",") : -1}),atendente_id.eq.${eu}`,
          );
        return q
          .order("ultima_msg_at", { ascending: false, nullsFirst: false })
          .limit(400);
      })(),

      // Meu histórico do que já encerrei. Consulta é passado: teto menor.
      supabase
        .from("conversas")
        .select(COLUNAS)
        .eq("atendente_id", eu)
        .not("encerrada_em", "is", null)
        // PELA ÚLTIMA MENSAGEM, e não pela hora do encerramento.
        //
        // A conversa encerrada não reabre mais quando a pessoa escreve — é
        // decisão da atendente, e a mensagem seguinte não a desfaz. Mas o que
        // ela mandar tem de aparecer em algum lugar, e o lugar é aqui.
        //
        // Ordenar por `encerrada_em` enterraria a novidade no meio da lista, na
        // posição da data em que aquela conversa foi fechada. Some da fila de
        // trabalho é o combinado; some da vista, não.
        .order("ultima_msg_at", { ascending: false, nullsFirst: false })
        .limit(200),

      // As mesmas três perguntas, agora contadas no banco. `head: true` não
      // traz linha alguma — é só o cabeçalho com o total.
      // AS MESMAS CONDIÇÕES das duas consultas acima, palavra por palavra.
      // Contagem que não repete o filtro da lista é o defeito do "painel 290 e
      // lista 83": os dois números saem da mesma pergunta ou vão desencontrar.
      supabase
        .from("conversas")
        .select("id", { count: "exact", head: true })
        .eq("atendente_id", eu)
        .is("encerrada_em", null)
        .not("primeira_resp_at", "is", null),
      (() => {
        let q = supabase
          .from("conversas")
          .select("id", { count: "exact", head: true })
          .is("primeira_resp_at", null)
          .is("encerrada_em", null);
        if (!podeTudo)
          q = q.or(
            `numero_id.in.(${meusNumeros.length ? meusNumeros.join(",") : -1}),atendente_id.eq.${eu}`,
          );
        return q;
      })(),
      supabase
        .from("conversas")
        .select("id", { count: "exact", head: true })
        .eq("atendente_id", eu)
        .not("encerrada_em", "is", null),

      // MEU HISTÓRICO conta separado, e não como soma das outras.
      //
      // Era `minhas + encerradas`. Funcionava enquanto "minhas" queria dizer
      // "tudo que tem meu nome". Agora que ela exige resposta, a soma deixaria
      // de fora exatamente os leads meus que ninguém respondeu — e a aba
      // "Meu histórico" (que mostra TUDO desta conta) anunciaria menos do que
      // lista. Pergunta diferente, consulta própria.
      supabase
        .from("conversas")
        .select("id", { count: "exact", head: true })
        .eq("atendente_id", eu),

      supabase.from("atendentes").select("id, nome"),
      supabase
        .from("tags")
        // `eixo` e `valor` junto: sem eles a caixa não sabe o nome do status
        // que a própria equipe criou (src/lib/rotulo-status.ts).
        .select("id, nome, cor, descricao, eixo, valor")
        .eq("ativa", true)
        .order("ordem"),

      // Só para escrever o nome no menu de conta. Entra no mesmo `Promise.all`
      // porque uma consulta em sequência aqui atrasa a tela inteira.
      supabase.from("profiles").select("nome").eq("id", eu).maybeSingle(),

      // O NÚMERO DESTA ATENDENTE, E SE ELE ESTÁ DE PÉ.
      //
      // É a informação que faltou ontem. Enquanto a sessão está fora, tudo que
      // ela atender pelo celular fica invisível para o sistema — e ela não tem
      // como desconfiar, porque o WhatsApp no aparelho dela continua normal.
      supabase
        .from("numeros")
        // `*` de propósito, e não a lista de colunas: `motivo_queda` nasce em
        // supabase/historico/conexao-tem-historico.sql, que roda no editor. Pedir uma
        // coluna que ainda não existe faz o PostgREST recusar a consulta
        // INTEIRA — e a caixa das meninas ficaria fora do ar entre o deploy e
        // o SQL. Com `*`, a coluna aparece sozinha no dia em que existir.
        .select("*")
        .eq("atendente_id", eu)
        .eq("ativo", true)
        .maybeSingle(),
    ]);

  // Sem repetida: a mesma conversa não pode cair em duas consultas, mas juntar
  // por id custa quase nada e protege de um filtro que eu erre depois.
  const porId = new Map<number, unknown>();
  for (const lista of [minhas.data, aguardando.data, encerradas.data]) {
    for (const c of lista ?? []) porId.set((c as { id: number }).id, c);
  }
  // ── A CONVERSA QUE A SUPERVISÃO MANDOU ABRIR ────────────────────────────
  //
  // `?c=` vem da Supervisão, e quase sempre aponta conversa de OUTRA atendente
  // — é o papel da coordenação. Nenhuma das três listas acima traz conversa
  // alheia já respondida, então a caixa abria vazia. Busca a apontada à parte;
  // a RLS decide se quem abriu pode vê-la.
  if (Number.isFinite(abrir) && abrir > 0 && !porId.has(abrir)) {
    const { data: apontada } = await supabase.from("conversas").select(COLUNAS).eq("id", abrir).maybeSingle();
    if (apontada) porId.set(abrir, apontada);
  }
  const conversas = [...porId.values()];

  return (
    <CaixaClient
      // `as unknown` no meio de propósito: o cliente do Supabase tipa a seleção
      // como possivelmente-erro quando a lista de colunas é montada por
      // concatenação, e o TypeScript recusa a conversão direta.
      inicial={(conversas ?? []) as unknown as Conversa[]}
      // Os totais de verdade. A lista pode estar cortada; estes números não.
      totais={{
        minhas: totalMinhas.count ?? 0,
        semDono: totalAguardando.count ?? 0,
        encerradas: totalEncerradas.count ?? 0,
        meuHistorico: totalMeuHistorico.count ?? 0,
      }}
      // Só quando NÃO está de pé. A tela não precisa dizer que está tudo bem;
      // precisa gritar quando não está.
      conexaoCaida={
        meuNumero && estaCaido(meuNumero.conexao, meuNumero.caiu_em)
          ? {
              apelido: meuNumero.apelido,
              instancia: meuNumero.instancia,
              estado: meuNumero.conexao,
              desde: meuNumero.caiu_em,
              motivo:
                (meuNumero as { motivo_queda?: string | null }).motivo_queda ??
                null,
            }
          : null
      }
      atendentes={atendentes ?? []}
      tags={tags ?? []}
      euId={user?.id ?? ""}
      // O nome vem do perfil, e o `user_metadata` é a rede de segurança: quem
      // foi criado pela rota de equipe tem os dois, contas antigas só o segundo.
      euNome={
        perfil?.nome ??
        (user?.user_metadata as { nome?: string } | undefined)?.nome ??
        ""
      }
      euEmail={user?.email ?? ""}
      // A janela de 24h só existe no WhatsApp oficial. Quem sabe qual provedor
      // está ligado é o servidor — o navegador não pode nem deve saber.
      janelaVale={provedor() === "meta"}
      abrir={Number.isFinite(abrir) && abrir > 0 ? abrir : undefined}
    />
  );
}
