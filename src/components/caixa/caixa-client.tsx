"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { rotuloStatus, rotuloDemanda, type EtiquetaCatalogo } from "@/lib/rotulo-status";

// A caixa de entrada.
//
// Três colunas, e cada uma responde a uma pergunta: a FILA diz quem está
// esperando, a CONVERSA é o WhatsApp de sempre, e a FICHA mostra o que o
// sistema já sabe — para ninguém perguntar o município duas vezes.

export type Conversa = {
  id: number;
  telefone: string;
  nome: string | null;
  tipo: "lead" | "disparo";
  status_lead: string | null;
  demandas: string[] | null;
  municipio: string | null;
  bairro: string | null;
  origem: string | null;
  primeira_msg_at: string | null;
  primeira_resp_at: string | null;
  ultima_direcao: string | null;
  atendente_id: string | null;
  atribuido_em: string | null;
  encerrada_em: string | null;
  fluxo_estagio: string | null;
  /** Em qual setor do gabinete a conversa está. Null = ainda em nenhum. */
  departamento_id: number | null;
  ultima_msg: string | null;
  ultima_msg_at: string | null;
  /** Última mensagem RECEBIDA. É ela que abre a janela de 24h da Cloud API. */
  ultima_entrada_at: string | null;
  total_mensagens: number;
  // Cadastro semiautomático: o que o webhook leu da conversa, esperando o
  // clique da atendente.
  nome_sugerido: string | null;
  municipio_sugerido: string | null;
  bairro_sugerido: string | null;
  indicado_por: string | null;
  cadastrado_em: string | null;
};

type Mensagem = {
  id: number;
  conversa_id: number;
  direcao: "inbound" | "outbound";
  tipo: string;
  texto: string | null;
  midia_url: string | null;
  midia_arquivo: string | null;
  midia_previa: string | null;
  midia_mime: string | null;
  midia_erro: string | null;
  duracao_seg: number | null;
  enviada_por: string | null;
  momento: string;
  /** O `wa_id` da mensagem citada, quando esta responde a alguma. */
  responde_wa_id?: string | null;
  wa_id?: string | null;
};

import {
  duracao,
  espera,
  hora,
  horasDesde,
  iniciais,
  telefoneBonito,
} from "@/lib/conversa";
import { Lock, CheckCheck, RotateCcw, UserPlus } from "lucide-react";
import { Transferir } from "@/components/caixa/transferir";
import { Etiquetas } from "@/components/caixa/etiquetas";
import { useAviso, BotaoSom } from "@/components/caixa/aviso";
import { MinhaConta } from "@/components/conta/minha-conta";
import { Emojis } from "@/components/caixa/emoji";
import { Anexo } from "@/components/caixa/anexo";
import { Gravar } from "@/components/caixa/gravar";
import { JaConhecida } from "@/components/caixa/ja-conhecida";
import { AudiosDaTalita } from "@/components/caixa/audios";
import { KitsDaCampanha } from "@/components/caixa/kits";
import { Santinhos } from "@/components/caixa/santinhos";
import { MensagensProntasNaBarra } from "@/components/caixa/mensagens";
import { Audio, Imagem, Video, Documento } from "@/components/caixa/midia";

// Sem `disponivel`: o plantão saiu. A lista serve para escrever o NOME de quem
// está com a conversa, nada mais.
type Atendente = { id: string; nome: string };
// Com `eixo` e `valor`: é deles que sai o nome e a cor do status (src/lib/rotulo-status.ts).
type Tag = EtiquetaCatalogo;

// ── componente ──────────────────────────────────────────────────────────────

type Filtro = "minhas" | "sem-dono" | "encerradas" | "todas";

export function CaixaClient({
  inicial,
  totais,
  conexaoCaida,
  atendentes,
  tags,
  euId,
  euNome,
  euEmail,
  janelaVale,
  abrir,
}: {
  inicial: Conversa[];
  /**
   * Os totais contados NO BANCO — o que existe, e não o que coube na consulta.
   * É o que os números das abas mostram. Ver o comentário em `contas`.
   */
  totais: {
    minhas: number;
    semDono: number;
    encerradas: number;
    meuHistorico: number;
  };
  /**
   * O número desta atendente quando ele NÃO está conectado. `null` é o caso bom.
   *
   * Ela não tem como desconfiar sozinha: o WhatsApp no celular dela continua
   * funcionando normalmente enquanto a sessão do sistema está fora. Foi assim
   * que a Maiana atendeu 420 pessoas que o PIE nunca viu.
   */
  conexaoCaida: {
    apelido: string;
    instancia: string;
    estado: string;
    /** A causa, quando a Evolution disse qual. Nula enquanto o SQL não rodar. */
    motivo?: string | null;
    desde: string | null;
  } | null;
  atendentes: Atendente[];
  tags: Tag[];
  euId: string;
  /** Para o menu de conta: quem está logada, e a saída dela. */
  euNome: string;
  euEmail: string;
  /**
   * A regra das 24h vale? Só no WhatsApp OFICIAL.
   *
   * Vem do servidor porque quem sabe o provedor é ele — e no não-oficial não há
   * janela nenhuma. Avisar de um limite que não existe é pior do que não avisar.
   */
  janelaVale: boolean;
  /** Conversa a abrir de saída — a supervisão manda para cá com ?c=<id>. */
  abrir?: number;
}) {
  const [conversas, setConversas] = useState<Conversa[]>(inicial);
  // `true` enquanto o canal de tempo real está de pé. Só serve para avisar
  // quando NÃO está — a tela não precisa dizer que tudo vai bem.
  const [aoVivo, setAoVivo] = useState(true);
  // Qual mensagem está sendo corrigida, e o texto em edição. Uma por vez: duas
  // caixas abertas ao mesmo tempo é convite para salvar na errada.
  const [editando, setEditando] = useState<number | null>(null);
  const [textoEditado, setTextoEditado] = useState("");
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);
  const router = useRouter();
  // Vindo da supervisão, o filtro tem de ser "todas": a conversa apontada
  // costuma ser justamente a que não é minha — é a esquecida.
  //
  // Mas agora TODA recarga traz `?c=`, porque o endereço guarda a conversa
  // aberta para ela sobreviver ao navegador descartar a aba. Manter o "todas"
  // cego trocaria a aba da atendente a cada volta do WhatsApp — conserto de um
  // incômodo criando outro.
  //
  // Então a pergunta certa não é "veio apontada?", e sim "é minha?". Sendo
  // minha, ela continua em "Meus atendimentos", que é onde ela trabalha.
  const [filtro, setFiltro] = useState<Filtro>(() => {
    if (!abrir) return "minhas";
    const apontada = inicial.find((c) => c.id === abrir);
    return apontada && apontada.atendente_id === euId ? "minhas" : "todas";
  });
  const [busca, setBusca] = useState("");
  // O que acabou de ser transferido. Fica um instante na tela porque a conversa
  // some da fila no mesmo gesto — sem o aviso, a atendente vê o item sumir e
  // não sabe se deu certo nem para quem foi.
  const [transferida, setTransferida] = useState<{
    setor: string;
    pessoa: string | null;
  } | null>(null);
  // O "assumir": conversa sem dono só aceita resposta depois que alguém a puxa
  // para si. Sem isso ela responde, a conversa continua sem dono, e a fila de
  // espera passa a mentir para a supervisão.
  // O catálogo vira estado: etiqueta criada no meio de uma conversa precisa
  // aparecer nas outras sem recarregar a página.
  const [catalogo, setCatalogo] = useState<Tag[]>(tags);
  // FILTRAR A FILA POR ETIQUETA.
  //
  // "Quero ver todos os meus apoiadores" é a pergunta que a atendente faz
  // depois de marcar trinta conversas — e sem isto a única resposta era rolar a
  // lista inteira relendo etiqueta por etiqueta.
  //
  // O mapa vem numa consulta só, de todas as marcações da fila carregada:
  // perguntar as etiquetas de cada conversa seria uma ida ao banco por linha.
  const [porEtiqueta, setPorEtiqueta] = useState<Map<number, number[]>>(
    new Map(),
  );
  const [etiquetaFiltro, setEtiquetaFiltro] = useState<number | null>(null);
  const [assumindo, setAssumindo] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const { ligado: somLigado, alternar: alternarSom, avisar } = useAviso();
  const [avisoDono, setAvisoDono] = useState<string | null>(null);
  // NASCE SEM NADA SELECIONADO, a menos que a supervisão tenha apontado uma.
  //
  // Antes escolhia `inicial[0]` — a primeira da lista BRUTA, sem olhar de quem
  // é. A atendente abria a caixa e via aberta a conversa de outra pessoa, com
  // a fila dela vazia ao lado. Parecia que o lead era dela.
  const [selecionadaId, setSelecionadaId] = useState<number | null>(
    abrir ?? null,
  );
  // As mensagens carregam JUNTO com a conversa de que vieram. Guardar as duas
  // coisas separadas deixava um instante em que a lista já era da conversa nova
  // e o conteúdo ainda era da antiga — e a atendente lia a conversa errada.
  // Com o par, "carregando" se deduz em vez de virar mais um estado a sincronizar.
  const [mensagens, setMensagens] = useState<{
    de: number | null;
    itens: Mensagem[];
  }>({
    de: null,
    itens: [],
  });
  // NO CELULAR NÃO CABEM TRÊS COLUNAS. `vista` diz qual das duas está na tela;
  // no computador as duas aparecem juntas e ele não é consultado.
  // Nasce em "conversa" quando a caixa foi aberta apontando uma: no celular só
  // uma coluna cabe, e cair na fila depois de clicar num link que diz QUAL
  // conversa abrir é desobedecer o clique.
  const [vista, setVista] = useState<"fila" | "conversa">(abrir ? "conversa" : "fila");
  const [fichaAberta, setFichaAberta] = useState(false);
  // ── O RASCUNHO É DA CONVERSA, NÃO DA TELA ───────────────────────────────
  //
  // Era um texto só para a caixa inteira: escrever para a Maria, clicar no
  // João e apertar Enter mandava o texto da Maria para o João. Agora cada
  // conversa guarda o seu, e trocar de conversa também não apaga o que ficou
  // pela metade.
  const [rascunhos, setRascunhos] = useState<Record<number, string>>({});
  const rascunho = selecionadaId !== null ? (rascunhos[selecionadaId] ?? "") : "";
  const setRascunho = (v: string | ((t: string) => string), id: number | null = selecionadaId) => {
    if (id === null) return;
    setRascunhos((r) => ({ ...r, [id]: typeof v === "function" ? v(r[id] ?? "") : v }));
  };
  // ── A MENSAGEM QUE ESTÁ SENDO CITADA ────────────────────────────────────
  //
  // O eleitor manda três coisas seguidas — nome, cidade e um pedido — e a
  // menina responde uma. Sem citar, a resposta chega solta e ele não sabe a
  // qual delas ela se refere.
  // Guardada com a conversa de onde veio, pelo mesmo motivo do rascunho.
  const [citandoPar, setCitandoPar] = useState<{ de: number; msg: Mensagem } | null>(null);
  const citando = citandoPar && citandoPar.de === selecionadaId ? citandoPar.msg : null;
  const setCitando = (m: Mensagem | null) =>
    setCitandoPar(m && selecionadaId !== null ? { de: selecionadaId, msg: m } : null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const fim = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);
  const nomePorId = useMemo(
    () => new Map(atendentes.map((a) => [a.id, a.nome])),
    [atendentes],
  );

  const selecionada = conversas.find((c) => c.id === selecionadaId) ?? null;
  const statusSel = rotuloStatus(selecionada?.status_lead, catalogo);

  // ── A JANELA DE 24 HORAS ──────────────────────────────────────────────────
  //
  // No WhatsApp oficial a campanha só escreve texto livre dentro de 24 horas a
  // contar da última mensagem que a PESSOA mandou. Resposta da campanha não
  // reabre o relógio; só a pessoa reabre.
  //
  // O aviso tem de vir ANTES de a menina digitar. Descobrir pelo erro da Meta
  // depois de escrever três parágrafos é o pior lugar para descobrir — e o erro
  // dela vem em inglês, falando de "template", que não quer dizer nada para
  // quem está atendendo.
  const janela = useMemo(() => {
    if (!janelaVale || !selecionada) return null;
    const t = selecionada.ultima_entrada_at
      ? Date.parse(selecionada.ultima_entrada_at)
      : NaN;
    if (!Number.isFinite(t)) return { aberta: false, horas: 0 };
    const restaMs = t + 24 * 60 * 60 * 1000 - Date.now();
    return { aberta: restaMs > 0, horas: Math.floor(restaMs / 3_600_000) };
  }, [janelaVale, selecionada]);

  const janelaFechada = janela !== null && !janela.aberta;

  // ── as mensagens da conversa aberta ───────────────────────────────────────
  const carregarMensagens = useCallback(
    async (id: number) => {
      const { data } = await supabase
        .from("mensagens")
        .select(
          "id, conversa_id, wa_id, responde_wa_id, direcao, tipo, texto, midia_url, midia_arquivo, midia_previa, midia_mime, midia_erro, duracao_seg, enviada_por, momento",
        )
        .eq("conversa_id", id)
        // AS ÚLTIMAS, E NÃO AS PRIMEIRAS.
        //
        // Estava `ascending: true` com limite: isso traz as 300 mensagens MAIS
        // ANTIGAS. Numa conversa longa, a atendente veria o "boa tarde" de três
        // dias atrás e NÃO veria a mensagem que acabou de chegar. Ninguém tinha
        // percebido porque nenhuma conversa passou de 300 ainda — e passaria
        // hoje.
        .order("momento", { ascending: false })
        // 120 e não 300: cada mensagem de foto carrega a miniatura em base64
        // junto. Trezentas delas são dezenas de megabytes de texto no
        // navegador, e é isso que estoura a aba no celular.
        .limit(120);
      return ((data ?? []) as unknown as Mensagem[]).reverse();
    },
    [supabase],
  );

  useEffect(() => {
    if (!selecionadaId) return;
    // `vivo` corta a resposta que chega depois de a atendente já ter trocado de
    // conversa: sem ele, a busca lenta sobrescreve a rápida e a tela mostra o
    // histórico de outra pessoa.
    let vivo = true;
    carregarMensagens(selecionadaId).then((itens) => {
      if (vivo) setMensagens({ de: selecionadaId, itens });
    });
    return () => {
      vivo = false;
    };
  }, [selecionadaId, carregarMensagens]);

  const carregando = selecionadaId !== null && mensagens.de !== selecionadaId;
  // As mensagens na tela SÓ se forem da conversa aberta. Enquanto a nova carrega,
  // a lista antiga continuava desenhada embaixo do nome da pessoa nova — no
  // celular lento, a atendente lia o histórico do João achando que era a Maria.
  const itensNaTela = carregando ? [] : mensagens.itens;

  // Qual conversa está aberta AGORA, para uma resposta que chega depois não
  // escrever na conversa errada (envio lento + troca de conversa no meio).
  const selecionadaRef = useRef(selecionadaId);
  useEffect(() => {
    selecionadaRef.current = selecionadaId;
  }, [selecionadaId]);

  // Recarrega E MOSTRA. O `aoEnviar` dos materiais chamava só
  // `carregarMensagens`, que busca e devolve — e ninguém usava a devolução: o
  // santinho, o áudio, o kit e o anexo saíam e não apareciam na conversa.
  const recarregarMensagens = useCallback(
    async (id: number) => {
      const itens = await carregarMensagens(id);
      if (selecionadaRef.current === id) {
        setMensagens({ de: id, itens });
        // Depois de ELA agir (texto, áudio, santinho, kit, anexo), ir para o
        // fim é o certo: ela quer ver o que acabou de sair.
        irParaOFim();
      }
    },
    [carregarMensagens],
  );

  // ── A ROLAGEM AUTOMÁTICA SÓ ACONTECE QUANDO ELA PEDE ──────────────────────
  //
  // 28/09, Emanuel: "tire a rolagem automática da área de atendimento".
  //
  // O efeito antigo dependia de `mensagens.itens` — ou seja, disparava a CADA
  // mudança na lista. E a lista muda sozinha: a mensagem que chega ao vivo
  // entra pelo canal do Supabase e reescreve o estado.
  //
  // O resultado era o pior momento possível. A atendente sobe para reler o que
  // a pessoa pediu, a pessoa manda mais uma linha, e a tela pula para baixo no
  // meio da leitura. Quanto mais movimentada a conversa, mais impossível ler o
  // histórico dela.
  //
  // Agora o salto tem duas causas, as duas dela:
  //
  //   1. ABRIR uma conversa   → `mensagens.de` muda, e cair no fim é o esperado
  //   2. ENVIAR alguma coisa  → `recarregarMensagens` leva ao fim
  //
  // Mensagem que chega sozinha NÃO move mais a tela. Ela aparece embaixo e
  // espera — se a atendente já estiver no fim, ela a vê; se estiver lendo em
  // cima, continua lendo.
  const irParaOFim = useCallback(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, []);

  useEffect(() => {
    irParaOFim();
  }, [mensagens.de, irParaOFim]);

  // ── ao vivo ───────────────────────────────────────────────────────────────
  //
  // Sem isto a atendente teria de recarregar para ver mensagem nova, e numa
  // operação de plantão ninguém recarrega — some o lead.
  //
  // ── A ASSINATURA NASCE UMA VEZ E FICA ─────────────────────────────────────
  //
  // A lista de dependências era `[supabase, selecionadaId, avisar]`, e nenhum
  // dos dois últimos é usado DENTRO do efeito: o tratador de mensagens compara
  // com `antes.de`, que vem do próprio estado.
  //
  // O estrago era grande: `selecionadaId` muda a cada clique numa conversa.
  // Cada clique derrubava o canal e abria outro — dezenas por hora num plantão.
  // O Supabase limita a taxa de entrada em canal; passando disso ele recusa, o
  // canal morre CALADO, e a partir dali a fila só atualiza recarregando a
  // página. É o defeito relatado.
  //
  // `avisar` entra por referência para poder mudar (ligar/desligar o som) sem
  // derrubar a conexão junto.
  const avisarRef = useRef(avisar);
  useEffect(() => {
    avisarRef.current = avisar;
  }, [avisar]);

  // ── DOIS CANAIS, CADA UM COM NOME PRÓPRIO ─────────────────────────────────
  //
  // Era um canal só, chamado "caixa", refeito a cada clique (o filtro das
  // mensagens depende da conversa aberta). O `removeChannel` é ASSÍNCRONO: o
  // canal velho continua registrado por um instante, e `supabase.channel("caixa")`
  // devolve esse canal que está morrendo em vez de criar outro — o
  // RealtimeClient reaproveita canal de mesmo nome. Os ouvintes novos iam para
  // o canal que fechava logo em seguida.
  //
  // Resultado (15/09, revisão da caixa): depois do PRIMEIRO clique numa
  // conversa, nada mais chegava ao vivo — nem lead novo, nem mensagem, nem som.
  // A fila só andava pela recarga de 45 segundos.
  //
  // Agora: o canal das conversas nasce uma vez e fica; o das mensagens é
  // refeito por conversa, e os dois levam um sufixo único, então nunca pegam
  // um canal velho emprestado.
  useEffect(() => {
    const canal = supabase
      .channel(`caixa-conversas-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversas" },
        (payload) => {
          const nova = payload.new as Conversa | null;
          if (!nova?.id) return;
          // Lead novo entrando na fila: avisa mesmo com a conversa fechada,
          // porque é justamente o que ninguém está olhando.
          if (payload.eventType === "INSERT" && !nova.atendente_id)
            avisarRef.current();
          setConversas((antes) => {
            const i = antes.findIndex((c) => c.id === nova.id);
            if (i === -1) return [nova, ...antes];
            // ── O AVISO DE MENSAGEM NOVA MORA AQUI AGORA ────────────────────
            //
            // Ele estava na assinatura de `mensagens`, que agora só traz a
            // conversa aberta. Aqui funciona igual e sem custo: `ultima_msg_at`
            // muda toda vez que uma mensagem entra, em qualquer conversa.
            //
            // As duas condições são o que separa "chegou mensagem" de "a
            // conversa mudou por outro motivo": a última direção tem de ser
            // RECEBIDA — senão a tela apita a cada resposta que a própria
            // atendente manda — e o horário tem de ser diferente do que já
            // estava.
            const antesDela = antes[i];
            if (
              nova.ultima_direcao === "inbound" &&
              nova.ultima_msg_at &&
              nova.ultima_msg_at !== antesDela.ultima_msg_at
            )
              avisarRef.current();
            const copia = [...antes];
            copia[i] = { ...copia[i], ...nova };
            return copia;
          });
        },
      )
      // ── A CONEXÃO PRECISA DIZER SE CAIU ───────────────────────────────
      //
      // `.subscribe()` sem callback é a falha silenciosa: se o canal não
      // conectar — RLS, rede, limite de taxa — nada chega e a tela parece
      // apenas "parada". A atendente conclui que não entrou lead nenhum.
      //
      // Agora o estado vira aviso na tela, e a recarga periódica abaixo cobre
      // o buraco enquanto ele durar.
      .subscribe((estado) => {
        setAoVivo(estado === "SUBSCRIBED");
        if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT") {
          console.error(`caixa: tempo real caiu (${estado})`);
        }
      });
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase]);

  useEffect(() => {
    if (!selecionadaId) return;
    const canal = supabase
      .channel(`caixa-mensagens-${selecionadaId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        // ── SÓ A CONVERSA ABERTA ────────────────────────────────────────────
        //
        // Antes era `*` sem filtro: cada uma das 18 caixas recebia TODA
        // mensagem de TODA conversa e jogava fora as que não eram da conversa
        // aberta — o descarte estava logo abaixo, em JavaScript.
        //
        // São 70 mil mensagens e ~600 por hora chegando. Cada uma virava 18
        // entregas pela rede para ser usada por, no máximo, uma pessoa. O
        // Realtime é hoje o maior consumidor do banco: 11.290 segundos, o dobro
        // do segundo colocado.
        //
        // Filtrando na origem, chega só o que vai ser usado. O aviso sonoro das
        // outras conversas não se perde: ele passou para a assinatura de
        // `conversas`, que já recebe a atualização de `ultima_msg` quando
        // qualquer mensagem entra.
        //
        // `*` e não `INSERT` continua valendo: a mídia chega em DUAS etapas. A
        // mensagem entra primeiro com "ainda baixando", e o arquivo chega por
        // UPDATE segundos depois.
        {
          event: "*",
          schema: "public",
          table: "mensagens",
          filter: `conversa_id=eq.${selecionadaId}`,
        },
        (payload) => {
          const m = payload.new as Mensagem | null;
          if (!m?.id) return;
          setMensagens((antes) => {
            if (m.conversa_id !== antes.de) return antes;
            const i = antes.itens.findIndex((x) => x.id === m.id);
            if (i === -1) return { ...antes, itens: [...antes.itens, m] };
            const copia = [...antes.itens];
            copia[i] = m;
            return { ...antes, itens: copia };
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [supabase, selecionadaId]);

  // ── O QUE O SERVIDOR MANDA ENTRA NA LISTA ─────────────────────────────────
  //
  // `useState(inicial)` só usa o valor no primeiro render. Sem isto, recarregar
  // os dados do servidor (a rede de segurança abaixo) traria a lista nova e a
  // tela continuaria mostrando a antiga — recarga que não recarrega nada.
  //
  // MESCLA por id em vez de substituir: o que chegou pelo tempo real e ainda
  // não está na consulta do servidor continua na tela. Trocar a lista inteira
  // faria o lead recém-chegado piscar e sumir até a próxima ida ao banco.
  useEffect(() => {
    setConversas((antes) => {
      const porId = new Map(antes.map((c) => [c.id, c]));
      for (const c of inicial) porId.set(c.id, { ...porId.get(c.id), ...c });
      return [...porId.values()];
    });
  }, [inicial]);

  // ── A CONVERSA ABERTA TEM DE SOBREVIVER A UMA RECARGA ─────────────────────
  //
  // Relato das meninas: "do nada sai e volta para a tela da fila", no meio do
  // atendimento.
  //
  // Não é a tela mandando voltar — não existe caminho no código que faça isso
  // sozinho. É a PÁGINA RENASCENDO: no celular, quando ela troca para o
  // WhatsApp e volta, o navegador já descartou a aba para poupar memória. Tudo
  // renasce do zero, e `vista` nasce em "fila".
  //
  // O hábito está documentado duas telas acima, na rede de segurança: "a menina
  // passa o dia alternando entre o PIE e o WhatsApp do aparelho".
  //
  // O conserto não é impedir a recarga — isso não está na nossa mão. É fazer a
  // recarga voltar para o mesmo lugar. O endereço passa a carregar qual
  // conversa está aberta, e a página já sabe abrir por ele (`?c=`), que é como
  // a supervisão manda alguém para uma conversa.
  //
  // `replaceState` e não `router.push`: trocar o endereço de verdade recarrega
  // a página e recria o problema. Aqui só o texto da barra muda — nada
  // re-renderiza, e o histórico não enche de entradas a cada clique numa
  // conversa.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const atual = url.searchParams.get("c");
    const desejado = selecionadaId === null ? null : String(selecionadaId);
    if (atual === desejado) return;
    if (desejado === null) url.searchParams.delete("c");
    else url.searchParams.set("c", desejado);
    window.history.replaceState(null, "", url.toString());
  }, [selecionadaId]);

  // ── A REDE DE SEGURANÇA ───────────────────────────────────────────────────
  //
  // O tempo real é o caminho rápido, e caminho rápido cai: rede da menina,
  // limite do Supabase, aba dormindo no celular. Quando cai, hoje, a fila
  // congela sem avisar — e lead parado é lead perdido.
  //
  // Então o servidor é consultado de novo a cada 45 segundos, e SEMPRE que ela
  // volta para a aba. Essa segunda parte é a que mais rende: a menina passa o
  // dia alternando entre o PIE e o WhatsApp do aparelho, e volta querendo ver o
  // que chegou.
  //
  // Só com a aba à vista. Recarregar a cada 45s numa aba esquecida aberta seria
  // consulta de graça, vezes sete atendentes, o dia inteiro.
  useEffect(() => {
    function atualizar() {
      if (!document.hidden) router.refresh();
    }
    const relogio = setInterval(atualizar, 45_000);
    document.addEventListener("visibilitychange", atualizar);
    return () => {
      clearInterval(relogio);
      document.removeEventListener("visibilitychange", atualizar);
    };
  }, [router]);

  // Quantas conversas ENCERRADAS tiveram mensagem da pessoa depois do
  // encerramento. Sem isto o verde só aparece DENTRO da aba Encerradas — e
  // ninguém entra ali de propósito. O ponto na aba é o que faz ela entrar.
  //
  // Sai da lista carregada, e não do banco: é aviso, não medida. A aba de
  // encerradas traz as 200 mais recentes, que é onde retorno acontece.
  const encerradasComRetorno = useMemo(
    () =>
      conversas.filter(
        (c) =>
          c.encerrada_em &&
          c.ultima_direcao === "inbound" &&
          c.ultima_msg_at &&
          Date.parse(c.ultima_msg_at) > Date.parse(c.encerrada_em),
      ).length,
    [conversas],
  );

  // ── CLASSIFICAR É OBRIGATÓRIO PARA ENCERRAR ───────────────────────────────
  //
  // A trava de verdade está no banco (`classificar-e-obrigatorio.sql`), porque
  // encerrar é um `update` que o navegador faz direto na tabela — botão
  // desabilitado é conforto, não trava.
  //
  // Isto aqui existe para a atendente saber ANTES do clique. Descobrir pela
  // exceção do Postgres, depois de clicar, é o pior lugar para descobrir.
  //
  // A exceção do `lid.` é a mesma do banco: sem telefone não dá para atender
  // nem para classificar, e travar ali só prende a fila. As duas listas têm de
  // dizer a mesma coisa, senão o botão libera e o banco recusa.
  const precisaClassificar =
    !!selecionada &&
    !selecionada.status_lead &&
    !selecionada.telefone.startsWith("lid.") &&
    selecionada.tipo !== "disparo";

  // ── CORRIGIR UMA MENSAGEM JÁ ENVIADA ──────────────────────────────────────
  //
  // O WhatsApp aceita por 15 minutos. Passou disso ele recusa, e não há como
  // contornar — nem pelo aplicativo. Por isso o botão SOME em vez de tentar e
  // falhar: botão que existe e não funciona ensina que o sistema é quebrado.
  const PODE_EDITAR_MS = 15 * 60 * 1000;
  const podeEditar = (m: Mensagem) =>
    m.direcao === "outbound" &&
    m.tipo === "texto" &&
    !!m.texto &&
    Date.now() - Date.parse(m.momento) < PODE_EDITAR_MS;

  async function salvarEdicao(m: Mensagem) {
    const novo = textoEditado.trim();
    if (!novo || novo === m.texto) {
      setEditando(null);
      return;
    }
    setErroEdicao(null);
    const r = await fetch("/api/atendimento/editar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensagemId: m.id, texto: novo }),
    });
    const j = await r.json();
    if (!r.ok) {
      setErroEdicao(j?.erro ?? "Não consegui editar.");
      return;
    }
    // A bolha muda na hora. O eco do webhook não traz edição, então esperar por
    // ele deixaria o texto velho na tela até a atendente trocar de conversa.
    setMensagens((antes) => ({
      ...antes,
      itens: antes.itens.map((x) => (x.id === m.id ? { ...x, texto: novo } : x)),
    }));
    setEditando(null);
  }

  // ── a fila ────────────────────────────────────────────────────────────────
  // Quantas conversas DA ABA ATUAL têm cada etiqueta. O número ao lado do nome
  // é o que evita o clique que não devolve nada.
  const contarEtiqueta = (tagId: number) => {
    let n = 0;
    for (const c of conversas) {
      if (
        filtro === "minhas" &&
        (c.atendente_id !== euId || c.encerrada_em || !c.primeira_resp_at)
      )
        continue;
      if (filtro === "sem-dono" && (c.primeira_resp_at || c.encerrada_em))
        continue;
      if (
        filtro === "encerradas" &&
        (c.atendente_id !== euId || !c.encerrada_em)
      )
        continue;
      if (filtro === "todas" && c.atendente_id !== euId) continue;
      if ((porEtiqueta.get(c.id) ?? []).includes(tagId)) n++;
    }
    return n;
  };

  const fila = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return conversas
      .filter((c) => {
        // ── A CAIXA É PESSOAL ────────────────────────────────────────────
        //
        // "Meus atendimentos" e "Meu histórico" mostram só o que é DESTA conta.
        // Antes o terceiro mostrava as conversas da equipe inteira — a
        // atendente via o trabalho das colegas, que não é dela, e os leads dela
        // ficavam empurrados para baixo no meio.
        //
        // Quem precisa ver o time todo é a supervisão, e essa tela existe
        // separada, com filtro por atendente. Aqui cada uma cuida da sua.
        //
        // "Aguardando" também é dela: são os leads DO CHIP DELA que ninguém
        // respondeu. Não é monte comum, e não existe gesto de puxar — o lead
        // que chega no chip dela já é dela. O recorte por número está no
        // servidor, em `caixa/page.tsx`.
        //
        // AS MESMAS CONDIÇÕES do servidor. Se divergirem, a aba anuncia um
        // número e mostra outra lista.
        // A BOLA DECIDE A ABA — as mesmas condições do servidor.
        //   Aguardando        = a pessoa falou por último (`inbound`)
        //   Meus atendimentos = eu falei por último
        if (
          filtro === "minhas" &&
          (c.atendente_id !== euId || c.encerrada_em || !c.primeira_resp_at)
        )
          return false;
        if (filtro === "sem-dono" && (c.primeira_resp_at || c.encerrada_em))
          return false;
        // ENCERRADAS separada do histórico: são perguntas diferentes.
        // "O que eu já resolvi hoje?" é a aba de encerradas. "Onde está aquela
        // pessoa de ontem?" é o histórico, que traz tudo. Juntas, a lista do
        // fim do dia ficava cheia de conversa ainda aberta.
        if (
          filtro === "encerradas" &&
          (c.atendente_id !== euId || !c.encerrada_em)
        )
          return false;
        // O histórico é tudo que está com esta conta — aberto e encerrado. É
        // onde ela reencontra o hater que atendeu ontem.
        // A exceção é a conversa que a Supervisão mandou abrir: ela é de outra
        // pessoa por definição, e sumir do filtro "todas" era a caixa vazia.
        if (filtro === "todas" && c.atendente_id !== euId && c.id !== abrir) return false;
        // A etiqueta filtra DENTRO da aba escolhida, não por cima dela: em
        // "Meus atendimentos" com "Apoiador" marcado, o resultado são os
        // apoiadores DELA — que é a pergunta que ela está fazendo.
        if (
          etiquetaFiltro !== null &&
          !(porEtiqueta.get(c.id) ?? []).includes(etiquetaFiltro)
        )
          return false;
        if (!termo) return true;
        // ── BUSCAR "emanuel" DEVOLVIA A FILA INTEIRA ─────────────────────
        //
        // Era `c.telefone.includes(termo.replace(/\D/g, ""))`. Num termo sem
        // dígito o `replace` devolve STRING VAZIA — e `"qualquer".includes("")`
        // é `true` em JavaScript, para todo mundo. Ou seja: procurar por nome
        // casava com TODAS as conversas pelo telefone, e a busca parecia
        // ignorada.
        //
        // Só compara telefone quando há dígito de verdade para comparar.
        const digitos = termo.replace(/\D/g, "");
        return (
          (c.nome ?? "").toLowerCase().includes(termo) ||
          (digitos.length >= 3 && c.telefone.includes(digitos)) ||
          (c.municipio ?? "").toLowerCase().includes(termo)
        );
      })
      .sort((a, b) => {
        // ── QUEM FALOU POR ÚLTIMO VEM EM CIMA, COMO NO WHATSAPP ──────────
        //
        // Antes o peso do SLA mandava: "ninguém respondeu" ia para o topo e
        // dentro do grupo ordenava por horas de espera. O efeito era que
        // mensagem nova NÃO subia — a conversa ficava presa no lugar que a
        // espera dela determinava, e a atendente não via quem tinha acabado
        // de escrever.
        //
        // A urgência não sumiu: ela virou a etiqueta laranja na linha e o
        // aviso do topo. Ordem é para achar; cor é para priorizar.
        //
        // VALE PARA TODAS AS ABAS, Aguardando inclusive.
        //
        // Aguardando era a exceção: ordenava do que espera há mais tempo para o
        // mais recente. Parecia certo — é a pergunta do SLA — mas na mão de
        // quem atende era o contrário do útil: o lead que ACABOU de escrever
        // nascia no fim de uma lista de centenas, e a menina não via chegar.
        //
        // Regra dele, e é a do WhatsApp: quem manda mensagem sobe. Nas duas
        // abas, sem exceção.
        //
        // A urgência não sumiu — ela é a etiqueta laranja na linha, o aviso do
        // topo e a tela de supervisão, que continua ordenada por espera.
        // Ordem é para achar; cor é para priorizar.
        //
        // COMPARAÇÃO DE INSTANTE, e não de texto.
        //
        // Era `localeCompare` entre dois carimbos. Funciona quando os dois têm
        // exatamente o mesmo formato — e o Postgres não garante isso: uns vêm
        // com fração de segundo (`...41.487042+00:00`), outros sem
        // (`...01:15:01+00:00`), dependendo de quem escreveu a linha. Ainda por
        // cima `localeCompare` é colação de idioma, que dá peso menor à
        // pontuação; é a ferramenta errada para ordenar tempo.
        //
        // Número não tem esse problema, e é mais rápido numa lista de 400.
        // Sem carimbo vai para o fim, nunca para o topo.
        const ta = a.ultima_msg_at ? Date.parse(a.ultima_msg_at) : 0;
        const tb = b.ultima_msg_at ? Date.parse(b.ultima_msg_at) : 0;
        return tb - ta;
      });
  }, [conversas, filtro, busca, euId, etiquetaFiltro, porEtiqueta, abrir]);

  // ── OS NÚMEROS DAS ABAS VÊM DO BANCO, NÃO DA LISTA ────────────────────────
  //
  // Eram `conversas.filter(...).length` — contagem do que coube no teto da
  // consulta. Enquanto a fila era pequena os dois números coincidiam e ninguém
  // percebeu. Depois da importação a caixa da Maiana bateu no teto de 400 e a
  // aba passou a anunciar "402" para uma realidade maior — e a campanha lia
  // aquilo como métrica.
  //
  // `atrasadas` continua vindo da lista de propósito: ela depende de comparar
  // horas conversa a conversa, que é coisa de tela. Ela é AVISO, não medida.
  const contas = useMemo(
    () => ({
      minhas: totais.minhas,
      semDono: totais.semDono,
      // Tudo que está com esta conta, aberto e encerrado — contado no banco.
      // Era `minhas + encerradas`, e a soma passou a mentir quando "minhas"
      // deixou de significar "tudo que tem meu nome".
      meuHistorico: totais.meuHistorico,
      encerradas: totais.encerradas,
      atrasadas: conversas.filter(
        (c) => espera(c).estado === "nao_atendido" && espera(c).horas >= 4,
      ).length,
    }),
    [conversas, totais],
  );

  // Quantas conversas desta aba realmente vieram, contra quantas existem. Só
  // aparece quando os dois divergem — corte silencioso é o defeito, não o corte.
  const cortadas = useMemo(() => {
    const naTela = conversas.filter((c) => {
      if (filtro === "minhas")
        return (
          c.atendente_id === euId && !c.encerrada_em && !!c.primeira_resp_at
        );
      if (filtro === "sem-dono")
        return !c.primeira_resp_at && !c.encerrada_em;
      if (filtro === "encerradas")
        return c.atendente_id === euId && !!c.encerrada_em;
      return c.atendente_id === euId;
    }).length;
    const total =
      filtro === "minhas"
        ? contas.minhas
        : filtro === "sem-dono"
          ? contas.semDono
          : filtro === "encerradas"
            ? contas.encerradas
            : contas.meuHistorico;
    return total > naTela ? { naTela, total } : null;
  }, [conversas, filtro, euId, contas]);

  // As marcações de todas as conversas em tela, de uma vez.
  useEffect(() => {
    let vivo = true;
    // SÓ DAS CONVERSAS QUE ESTÃO NA TELA — MAS DE TODAS ELAS.
    //
    // Pedir a tabela inteira, sem filtro, era o defeito antigo: toda marcação
    // já feita na história da campanha, a cada carga da caixa.
    //
    // O conserto de então foi `slice(0, 200)`, e ele criou o defeito seguinte.
    // A caixa carrega até 400 conversas por aba; com a fila em 128 o teto nunca
    // era alcançado e ninguém viu. Depois da importação a Maiana ficou com 402,
    // e as etiquetas das que passaram de 200 simplesmente não eram lidas: as
    // métricas contavam 6 apoiadores, a fila dela mostrava 1.
    //
    // Errado nos dois casos era o TETO ARBITRÁRIO. O certo é o que já era a
    // intenção: exatamente as conversas em tela, quantas forem. Em blocos,
    // porque quinhentos identificadores numa URL passam do que o servidor
    // aceita — e isso falharia calado, do mesmo jeito.
    const ids = conversas.map((c) => c.id);
    if (ids.length === 0) return;

    const BLOCO = 200;
    const blocos: number[][] = [];
    for (let i = 0; i < ids.length; i += BLOCO)
      blocos.push(ids.slice(i, i + BLOCO));

    Promise.all(
      blocos.map((b) =>
        supabase.from("conversa_tags").select("conversa_id, tag_id").in("conversa_id", b),
      ),
    ).then((partes) => {
      if (!vivo) return;
      const m = new Map<number, number[]>();
      for (const { data } of partes)
        for (const r of data ?? [])
          m.set(r.conversa_id, [...(m.get(r.conversa_id) ?? []), r.tag_id]);
      setPorEtiqueta(m);
    });
    return () => {
      vivo = false;
    };
    // `conversas` muda de identidade a cada mensagem que chega; recarregar as
    // marcações a cada uma seria uma consulta por mensagem. O tamanho da lista
    // basta como sinal de que a fila mudou.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, conversas.length]);

  // ── assumir ───────────────────────────────────────────────────────────────
  //
  // Quem decide é o BANCO, não esta tela: cinco pessoas na mesma fila clicam no
  // mesmo lead ao mesmo tempo, e só uma pode levar. A função tranca a linha,
  // confere se ainda está sem dono e devolve o nome de quem chegou primeiro
  // quando não está — para o aviso dizer QUEM, e não "não foi possível".
  async function assumir(conversaId: number) {
    setAssumindo(true);
    setAvisoDono(null);
    const { data, error } = await supabase.rpc("assumir_conversa", {
      p_conversa: conversaId,
    });
    setAssumindo(false);

    if (error) {
      setAvisoDono(error.message);
      return;
    }
    const r = data as { ok: boolean; motivo: string; dono?: string };
    if (r.ok) {
      // Atualiza aqui na hora: ela já vai começar a escrever, e esperar o
      // Realtime seria um segundo de caixa travada sem explicação.
      setConversas((atuais) =>
        atuais.map((c) =>
          c.id === conversaId ? { ...c, atendente_id: euId } : c,
        ),
      );
      // Sem trocar de aba: "Meus atendimentos" só mostra conversa já
      // RESPONDIDA, e a que ela acabou de assumir ainda não foi — sumia da lista
      // no mesmo clique. Ela fica onde está, aberta; a primeira resposta a leva.
      return;
    }
    setAvisoDono(
      r.motivo === "ja_tem_dono"
        ? `${r.dono} assumiu esta conversa primeiro.`
        : r.motivo === "nao_e_atendente"
          ? "Sua conta ainda não está na escala de atendimento. Peça à coordenação."
          : "Não consegui assumir esta conversa.",
    );
  }

  // ── emoji ─────────────────────────────────────────────────────────────────
  //
  // Entra ONDE O CURSOR ESTÁ, não no fim. Quem escreveu "Oi Maria, tudo bem?" e
  // quer o coração depois do "Oi" não deveria ter que apagar e reescrever.
  //
  // E o foco volta para o campo com o cursor DEPOIS do emoji: sem isso, a
  // próxima letra digitada iria para o começo do texto.
  function inserirEmoji(e: string) {
    const campo = campoRef.current;
    if (!campo) {
      setRascunho((t) => t + e);
      return;
    }
    const ini = campo.selectionStart ?? rascunho.length;
    const fim = campo.selectionEnd ?? rascunho.length;
    const novo = rascunho.slice(0, ini) + e + rascunho.slice(fim);
    setRascunho(novo);
    requestAnimationFrame(() => {
      campo.focus();
      const p = ini + e.length;
      campo.setSelectionRange(p, p);
    });
  }

  // ── encerrar ──────────────────────────────────────────────────────────────
  //
  // Encerrar TIRA DA FILA, não apaga. O histórico continua inteiro em "Todas as
  // conversas", e a pessoa continua na base.
  //
  // E se ela escrever de novo, a conversa REABRE SOZINHA — isso já está no
  // banco, em `receber_mensagem`: mensagem recebida zera o encerramento. É o
  // que evita o pior caso, que seria a atendente encerrar, a pessoa responder,
  // e ninguém ver.
  async function encerrar(conversaId: number, reabrir = false) {
    setEncerrando(true);
    const quando = reabrir ? null : new Date().toISOString();
    const { data: mudou, error } = await supabase
      .from("conversas")
      .update({ encerrada_em: quando, atualizado_em: new Date().toISOString() })
      .eq("id", conversaId)
      // Devolve a linha: se a conversa já não é dela (a coordenação passou para
      // outra), a RLS faz o update mudar ZERO linhas sem erro, e a tela marcava
      // encerrada algo que continuava aberto.
      .select("id");
    setEncerrando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    if (!mudou?.length) {
      setErro("Esta conversa não está mais com você — a coordenação ou outra atendente mexeu nela. Recarregue a caixa.");
      return;
    }
    setConversas((atuais) =>
      atuais.map((c) =>
        c.id === conversaId ? { ...c, encerrada_em: quando } : c,
      ),
    );
    if (reabrir) {
      // REABRIR DEVOLVE PARA "MEUS ATENDIMENTOS".
      //
      // Quem reabre está na aba de encerradas, e a conversa acabou de deixar de
      // ser encerrada — ou seja, ela sumia da lista no mesmo instante em que a
      // pessoa a queria de volta. Ficava sem aba nenhuma, e parecia perdida.
      setFiltro("minhas");
      setEtiquetaFiltro(null);
    } else {
      setSelecionadaId(null);
      setVista("fila");
    }
  }

  // ── enviar ────────────────────────────────────────────────────────────────
  async function enviar() {
    const texto = rascunho.trim();
    if (!texto || !selecionada || enviando) return;
    const id = selecionada.id;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/atendimento/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversaId: id,
          texto,
          respondeA: citando?.wa_id ?? null,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErro(j?.erro ?? "Não consegui enviar.");
        return;
      }
      setRascunho("", id);
      setCitandoPar(null);
      // ── A CONVERSA MUDA DE ABA NA HORA ──────────────────────────────────
      //
      // O servidor marca a primeira resposta, a direção e — se não tinha dona —
      // a dona. A tela esperava o tempo real para saber, e a conversa ficava em
      // "Aguardando / Ninguém respondeu" depois de respondida.
      const agora = new Date().toISOString();
      setConversas((cs) =>
        cs.map((c) =>
          c.id === id
            ? {
                ...c,
                primeira_resp_at: c.primeira_resp_at ?? agora,
                ultima_direcao: "outbound",
                ultima_msg: texto,
                ultima_msg_at: agora,
                atendente_id: c.atendente_id ?? euId,
              }
            : c,
        ),
      );
      await recarregarMensagens(id);
    } catch {
      setErro("Falha de rede. A mensagem não saiu.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    // `h-full` e não `h-dvh`: a altura é dada pelo <main>, que já desconta a
    // barra superior do celular. Pedir a tela inteira aqui somava 56px ao que
    // já existia e fazia a página inteira rolar.
    <div className="flex h-full overflow-hidden overscroll-none">
      {/* ── fila ── */}
      <section
        // `min-h-0` não é enfeite: sem ele, um filho que rola ESTICA a coluna
        // em vez de rolar por dentro. É a regra do flexbox que mais engana —
        // o padrão é o item se recusar a ficar menor que o conteúdo.
        className={`h-full w-full min-h-0 flex-col border-r border-tinta-200 bg-white md:flex md:w-[344px] md:shrink-0 ${
          vista === "conversa" ? "hidden" : "flex"
        }`}
      >
        {/* ── O NÚMERO CAIU ──────────────────────────────────────────────
            Acima de tudo, e vermelho, porque é a única coisa na tela que
            invalida todo o resto. Enquanto está assim, o WhatsApp no celular
            dela funciona normalmente — ela não tem como desconfiar sozinha, e
            foi exatamente assim que 420 atendimentos ficaram fora do sistema. */}
        {conexaoCaida && (
          <div className="border-b border-red-200 bg-red-50 px-[18px] py-3">
            <p className="text-[12.5px] font-bold text-red-700">
              {conexaoCaida.estado === "connecting"
                ? "Seu WhatsApp está tentando conectar"
                : "Seu WhatsApp caiu"}
              {conexaoCaida.desde && (
                <> · há {duracao(horasDesde(conexaoCaida.desde))}</>
              )}
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-red-700/90">
              O que você responder pelo celular agora <b>não entra aqui</b> — não
              conta na métrica e o telefone da pessoa se perde. Avise a
              coordenação para ler o QR do número{" "}
              <b>{conexaoCaida.apelido}</b>.
            </p>
            {/* A CAUSA, quando a Evolution disse qual. "Caiu" tem causas com
                respostas opostas: conflito se resolve lendo o QR e volta a
                acontecer se ninguém avisar a equipe; 401 é conta cortada, e
                ler o QR piora. Sem isto, o mesmo aviso levava às duas
                respostas erradas. */}
            {conexaoCaida.motivo && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-red-700/80">
                {conexaoCaida.motivo}
              </p>
            )}
          </div>
        )}

        <div className="px-[18px] pt-[18px] pb-3">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-tema">
            Fila
          </span>
          <h1 className="mt-1.5 text-[22px] font-extrabold tracking-[-0.02em] text-tinta-900">
            Atendimento
          </h1>

          <div className="mt-3.5 flex items-center gap-1.5">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, telefone ou cidade"
              // Mesma razão do campo de escrever: abaixo de 16px o iPhone dá
              // zoom ao tocar, e a tela inteira sai do lugar.
              className="h-[38px] min-w-0 flex-1 rounded-[10px] border border-tinta-300 px-3 text-[16px] text-tinta-800 outline-none placeholder:text-tinta-400 focus:border-tema sm:h-[34px] sm:text-[12.5px]"
            />
            <BotaoSom ligado={somLigado} alternar={alternarSom} />
            <MinhaConta nome={euNome} email={euEmail} />
          </div>

          {/* ── CADASTRAR, DE DENTRO DA CAIXA ──────────────────────────────
              A tela de cadastro mora em /atendimento/cadastro, e o atalho
              estava só na tela inicial. Mas a atendente passa o dia AQUI —
              pedir que ela volte para o começo a cada pessoa é como uma
              função existe e ninguém usa.

              Com os chips caindo, o atendimento é pelo aparelho e o cadastro
              é aqui: este botão é o caminho principal do dia, não um extra. */}
          <Link
            href="/atendimento/cadastro"
            className="mt-2 flex h-[40px] w-full items-center justify-center gap-2 rounded-[10px] border border-tema/25 bg-tema/5 text-[12.5px] font-bold text-tema transition-colors hover:bg-tema/10"
          >
            <UserPlus size={15} strokeWidth={2.4} />
            Cadastrar pessoa atendida
          </Link>

          {/* UMA LINHA SÓ, QUE ROLA PARA O LADO.
              As três abas de trabalho e as etiquetas moram juntas porque são a
              mesma pergunta: "o que eu olho agora?". Separadas em duas fileiras,
              a etiqueta virava filtro escondido embaixo — e o gesto de rolar
              para achar "Apoiador" é o mesmo de trocar de aba.
              `scrollbar-none` some com a barra: no celular ela cobre os botões. */}
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {(
              [
                // "Minhas", "Sem dono" e "Todas" eram apelidos, não nomes. A
                // atendente mostra essa tela para a supervisora e para o
                // coordenador; o rótulo tem de ser o que a operação chama a
                // coisa, e "Aguardando" é o mesmo termo do painel e do relatório.
                ["minhas", `Meus atendimentos · ${contas.minhas}`],
                ["sem-dono", `Aguardando · ${contas.semDono}`],
                ["encerradas", `Encerradas · ${contas.encerradas}`],
                ["todas", `Meu histórico · ${contas.meuHistorico}`],
              ] as [Filtro, string][]
            ).map(([id, rotulo]) => (
              <button
                key={id}
                onClick={() => {
                  setFiltro(id);
                  // Trocar de aba limpa a etiqueta: senão a pessoa clica em
                  // "Aguardando" e vê uma lista vazia sem entender por quê.
                  setEtiquetaFiltro(null);
                }}
                className={`shrink-0 whitespace-nowrap rounded-full px-[11px] py-[5px] text-[11.5px] font-semibold transition-colors ${
                  filtro === id && etiquetaFiltro === null
                    ? "bg-tinta-900 text-white"
                    : id === "sem-dono" && contas.semDono > 0
                      ? "border border-amber-200 bg-amber-50 text-amber-700"
                      : "bg-tinta-100 text-tinta-600 hover:bg-tinta-200"
                }`}
              >
                {rotulo}
                {/* O PONTO NA ABA DE ENCERRADAS.
                    Encerrada não reabre mais quando a pessoa escreve — foi
                    decisão do Emanuel, e está certa. Mas então a mensagem dela
                    fica numa aba que ninguém abre por hábito. Este ponto é o
                    que avisa que tem gente falando lá dentro. */}
                {id === "encerradas" && encerradasComRetorno > 0 && (
                  <span
                    title={`${encerradasComRetorno} ${
                      encerradasComRetorno === 1
                        ? "pessoa voltou a escrever"
                        : "pessoas voltaram a escrever"
                    } depois de encerrada`}
                    className="ml-1.5 inline-block h-[7px] w-[7px] rounded-full bg-[#12703c] align-middle"
                  />
                )}
              </button>
            ))}

            {/* As etiquetas seguem na mesma fileira. Só as que ALGUÉM usou na
                aba atual — botão que devolve lista vazia é pior que botão
                nenhum, e o número ao lado é o que evita o clique à toa. */}
            {catalogo
              .map((t) => ({ t, n: contarEtiqueta(t.id) }))
              .filter(({ n }) => n > 0)
              .sort((a, b) => b.n - a.n)
              .map(({ t, n }) => {
                const aceso = etiquetaFiltro === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setEtiquetaFiltro(aceso ? null : t.id)}
                    title={t.descricao ?? undefined}
                    className="shrink-0 whitespace-nowrap rounded-full px-[11px] py-[5px] text-[11.5px] font-semibold transition-colors"
                    style={
                      aceso
                        ? { background: t.cor, color: "#fff" }
                        : { background: `${t.cor}1a`, color: t.cor }
                    }
                  >
                    {t.nome} <span className="tabular opacity-70">{n}</span>
                  </button>
                );
              })}
          </div>
        </div>

        {transferida && (
          <div className="flex items-start gap-2 border-t border-tinta-100 bg-[#f1f8f3] px-[18px] py-2.5 text-[11.5px] leading-relaxed text-[#12703c]">
            <span className="flex-1">
              Transferida para <b>{transferida.setor}</b>
              {transferida.pessoa ? (
                <>
                  {" "}
                  — ficou com <b>{transferida.pessoa}</b>.
                </>
              ) : (
                // Foi para a fila do setor, sem dono. Dizer isso evita a
                // dúvida de "será que chegou em alguém?".
                <> — está na fila daquele setor, esperando alguém puxar.</>
              )}
            </span>
            <button
              onClick={() => setTransferida(null)}
              aria-label="Fechar o aviso"
              className="shrink-0 font-bold opacity-50 hover:opacity-100"
            >
              ×
            </button>
          </div>
        )}

        {/* ── O TEMPO REAL CAIU ────────────────────────────────────────────
            Antes isto não existia: o canal morria e a fila simplesmente
            parava, sem nada na tela. A atendente concluía que não tinha
            entrado lead — e às vezes tinha entrado dezenas.
            A recarga de 45s cobre o buraco, então o aviso diz o que ela pode
            esperar em vez de só alarmar. */}
        {!aoVivo && (
          <div className="border-t border-tinta-100 bg-tinta-100 px-[18px] py-2 text-[11.5px] font-semibold text-tinta-600">
            Sem atualização instantânea agora — a lista se atualiza sozinha a
            cada 45 s.
          </div>
        )}

        {contas.atrasadas > 0 && (
          <div className="border-t border-tinta-100 bg-amber-50 px-[18px] py-2 text-[11.5px] font-semibold text-amber-700">
            {contas.atrasadas === 1
              ? "1 pessoa espera há mais de 4 h sem ninguém"
              : `${contas.atrasadas} pessoas esperam há mais de 4 h sem ninguém`}
          </div>
        )}

        {/* A lista tem teto e isso é proposital; esconder que ela tem é que
            não. Enquanto a fila era pequena o corte nunca acontecia, e quando
            passou a acontecer não havia nada na tela dizendo. */}
        {cortadas && (
          <div className="border-t border-tinta-100 bg-tinta-50 px-[18px] py-2 text-[11.5px] text-tinta-500">
            Mostrando as {cortadas.naTela} mais recentes de{" "}
            <b>{cortadas.total}</b>. Use a busca para achar as outras.
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {fila.length === 0 && (
            <p className="px-[18px] py-8 text-center text-[12.5px] leading-relaxed text-tinta-400">
              {filtro === "minhas"
                ? "Nenhuma conversa com você agora."
                : filtro === "sem-dono"
                  ? "Ninguém esperando. A fila está limpa."
                  : filtro === "encerradas"
                    ? "Você ainda não encerrou nenhuma conversa."
                    : "Você ainda não atendeu ninguém."}
            </p>
          )}

          {fila.map((c) => {
            const e = espera(c);
            const st = rotuloStatus(c.status_lead, catalogo);
            const aberta = c.id === selecionadaId;
            // A BOLA ESTÁ COM A GENTE.
            //
            // A linha só destacava "ninguém respondeu". Depois da primeira
            // resposta, mensagem nova da pessoa mudava o estado e a linha
            // continuava igual às outras — não dava para saber quem escreveu
            // sem abrir uma por uma.
            //
            // Verde e negrito é o mesmo código do WhatsApp: tem coisa
            // esperando você.
            // ── ENCERRADA EM QUE A PESSOA VOLTOU A ESCREVER ──────────────
            //
            // `espera()` devolve "ok" para toda conversa encerrada, e tem de
            // devolver: encerrar é decisão da atendente, e o SLA não pode
            // voltar a cobrar dela por uma conversa que ela fechou.
            //
            // Só que desde que encerrada parou de reabrir sozinha, a mensagem
            // nova do eleitor fica NA aba Encerradas — e não acendia nada. A
            // pessoa escrevia e ninguém via.
            //
            // Aqui o sinal é da TELA, não do SLA: acende o mesmo verde, sem
            // entrar na conta de quem está esperando há mais de 4h.
            //
            // `ultima_msg_at > encerrada_em` e não só `inbound`: fechar a
            // conversa logo depois de a pessoa falar é normal, e nesse caso
            // não há nada de novo para ver.
            const voltouDepoisDeEncerrar =
              !!c.encerrada_em &&
              c.ultima_direcao === "inbound" &&
              !!c.ultima_msg_at &&
              Date.parse(c.ultima_msg_at) > Date.parse(c.encerrada_em);

            const esperandoVoce =
              e.estado === "aguardando" || voltouDepoisDeEncerrar;
            return (
              <button
                key={c.id}
                onClick={() => {
                  setSelecionadaId(c.id);
                  setVista("conversa");
                  setFichaAberta(false);
                }}
                className={`flex w-full gap-[11px] border-b border-tinta-100 px-[18px] py-[13px] text-left transition-colors ${
                  aberta
                    ? "border-l-[3px] border-l-tema bg-[#f2f7ff]"
                    : "hover:bg-tinta-50"
                } ${c.encerrada_em && !voltouDepoisDeEncerrar ? "opacity-60" : ""}`}
              >
                <span className="relative shrink-0">
                  <span
                    className={`flex h-[38px] w-[38px] items-center justify-center rounded-[11px] text-[12.5px] font-bold ${
                      e.estado === "nao_atendido"
                        ? "bg-amber-50 text-amber-700"
                        : esperandoVoce
                          ? "bg-[#e6f4ec] text-[#12703c]"
                          : "bg-tinta-100 text-tinta-600"
                    }`}
                  >
                    {iniciais(c.nome, c.telefone)}
                  </span>
                  {/* O ponto no canto é o que se enxerga rolando rápido: o
                      resto da linha exige leitura, este não. */}
                  {esperandoVoce && (
                    <span className="absolute -right-0.5 -top-0.5 h-[11px] w-[11px] rounded-full border-2 border-white bg-[#12703c]" />
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-bold text-tinta-900">
                      {c.nome ?? telefoneBonito(c.telefone)}
                    </span>
                    <span
                      className={`shrink-0 text-[10.5px] ${
                        e.estado === "nao_atendido"
                          ? "font-bold text-orange-600"
                          : esperandoVoce
                            ? "font-bold text-[#12703c]"
                            : "text-tinta-400"
                      }`}
                    >
                      {/* Esperando: mostra HÁ QUANTO TEMPO, não a hora. "há 12
                          min" cobra; "14:32" só informa. */}
                      {e.estado === "nao_atendido" || esperandoVoce
                        ? duracao(e.horas)
                        : hora(c.ultima_msg_at)}
                    </span>
                  </div>

                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background:
                          e.estado === "nao_atendido"
                            ? "#e2620a"
                            : esperandoVoce
                              ? "#12703c"
                              : st
                                ? st.cor
                                : "#93a0b6",
                      }}
                    />
                    <span
                      className={`truncate text-[11px] ${
                        e.estado === "nao_atendido"
                          ? "font-semibold text-orange-600"
                          : esperandoVoce
                            ? "font-semibold text-[#12703c]"
                            : "text-tinta-500"
                      }`}
                    >
                      {e.estado === "nao_atendido"
                        ? "Ninguém respondeu"
                        : esperandoVoce
                          ? "Esperando você"
                          : st
                            ? st.rotulo
                            : c.tipo === "disparo"
                              ? "Disparo"
                              : "Sem classificação"}
                      {c.municipio ? ` · ${c.municipio}` : ""}
                    </span>
                  </div>

                  {/* QUEM ESCREVEU POR ÚLTIMO, na prévia. Sem isso, "Pode
                      mandar o material?" tanto podia ser a pergunta da pessoa
                      quanto a resposta da atendente. */}
                  {c.ultima_msg && (
                    <p
                      className={`mt-1 truncate text-[12px] leading-snug ${
                        esperandoVoce
                          ? "font-medium text-tinta-800"
                          : "text-tinta-500"
                      }`}
                    >
                      {c.ultima_direcao === "outbound" && (
                        <span className="text-tinta-400">Você: </span>
                      )}
                      {c.ultima_msg}
                    </p>
                  )}

                  {(c.demandas?.length ?? 0) > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {c.demandas!.slice(0, 3).map((d) => (
                        <span
                          key={d}
                          className="rounded-[5px] bg-tinta-100 px-[7px] py-0.5 text-[10px] font-semibold text-tinta-600"
                        >
                          {rotuloDemanda(d, catalogo)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── conversa ── */}
      <section
        className={`h-full min-h-0 min-w-0 flex-1 flex-col bg-tinta-50 md:flex ${
          vista === "fila" ? "hidden" : "flex"
        }`}
      >
        {!selecionada ? (
          <div className="flex flex-1 items-center justify-center px-8 text-center text-[13px] text-tinta-400">
            Escolha uma conversa na fila.
          </div>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-tinta-200 bg-white px-4 py-[13px] md:px-5">
              <button
                onClick={() => setVista("fila")}
                aria-label="Voltar para a fila"
                className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-tinta-500 hover:bg-tinta-100 md:hidden"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m14 6-6 6 6 6" />
                </svg>
              </button>
              <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-tinta-100 text-[12.5px] font-bold text-tinta-600">
                {iniciais(selecionada.nome, selecionada.telefone)}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-bold text-tinta-900">
                    {selecionada.nome ?? telefoneBonito(selecionada.telefone)}
                  </span>
                  {statusSel && (
                      <span
                        className="shrink-0 rounded-[5px] px-[7px] py-0.5 text-[10px] font-bold uppercase text-white"
                        style={{
                          background: statusSel.cor,
                        }}
                      >
                        {statusSel.rotulo}
                      </span>
                    )}
                </div>
                <span className="text-[11.5px] text-tinta-500">
                  {telefoneBonito(selecionada.telefone)}
                  {selecionada.municipio ? ` · ${selecionada.municipio}` : ""}
                </span>
              </div>
              <span className="ml-auto mr-1 hidden shrink-0 text-[11px] text-tinta-400 sm:block">
                {selecionada.atendente_id
                  ? selecionada.atendente_id === euId
                    ? "com você"
                    : `com ${nomePorId.get(selecionada.atendente_id) ?? "outra pessoa"}`
                  : "sem dono"}
              </span>
              {/* ENCERRAR fica ao lado de TRANSFERIR porque são as duas saídas
                  da conversa: passo adiante, ou terminei. */}
              {selecionada.encerrada_em ? (
                <button
                  onClick={() => encerrar(selecionada.id, true)}
                  disabled={encerrando}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-tinta-200 px-2.5 text-[12.5px] font-semibold text-tinta-600 transition-colors hover:border-tinta-300 hover:text-tinta-900 disabled:opacity-40"
                >
                  <RotateCcw size={13} strokeWidth={2.2} />
                  <span className="hidden sm:inline">Reabrir</span>
                </button>
              ) : (
                <button
                  onClick={() => encerrar(selecionada.id)}
                  disabled={encerrando || precisaClassificar}
                  title={
                    precisaClassificar
                      ? "Marque uma etiqueta de status antes de encerrar — Apoiador, Indeciso, Hater..."
                      : "Tira da fila. O histórico fica."
                  }
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-tinta-200 px-2.5 text-[12.5px] font-semibold text-tinta-600 transition-colors hover:border-[#cbe3d4] hover:bg-[#f1f8f3] hover:text-[#12703c] disabled:opacity-40"
                >
                  <CheckCheck size={13} strokeWidth={2.2} />
                  <span className="hidden sm:inline">
                    {encerrando ? "…" : "Encerrar"}
                  </span>
                </button>
              )}
              <Transferir
                conversaId={selecionada.id}
                setorAtual={selecionada.departamento_id ?? null}
                respondida={!!selecionada.primeira_resp_at}
                aoTransferir={(info) => {
                  setTransferida(info);
                  // A conversa saiu da minha fila: muda na lista local na hora,
                  // sem esperar o Realtime. A atendente já clicou e seguiu.
                  //
                  // Com a pessoa que RECEBEU, e não nulo. Nulo deixava a conversa
                  // entregue à Fulana na Aguardando de quem transferiu, com o botão
                  // "Assumir" — que respondia "Fulana assumiu primeiro".
                  setConversas((atuais) =>
                    atuais.map((c) =>
                      c.id === selecionada.id
                        ? { ...c, atendente_id: info.para }
                        : c,
                    ),
                  );
                  setSelecionadaId(null);
                  setVista("fila");
                }}
              />
              <button
                onClick={() => setFichaAberta(true)}
                aria-label="Abrir a ficha da pessoa"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-tinta-500 hover:bg-tinta-100 xl:hidden"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="8" r="3.2" />
                  <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
                </svg>
              </button>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5">
              {carregando && (
                <p className="self-center text-[11.5px] text-tinta-400">
                  carregando…
                </p>
              )}
              {!carregando && itensNaTela.length === 0 && (
                <p className="self-center text-[11.5px] text-tinta-400">
                  Nenhuma mensagem gravada nesta conversa ainda.
                </p>
              )}

              {itensNaTela.map((m) => {
                const meu = m.direcao === "outbound";
                // A citada é procurada DENTRO da conversa aberta. Se não estiver
                // carregada — mensagem antiga, acima do que a tela trouxe — a
                // tarja simplesmente não aparece, em vez de mostrar vazia.
                const citada = m.responde_wa_id
                  ? itensNaTela.find((x) => x.wa_id === m.responde_wa_id)
                  : null;
                return (
                  <div
                    key={m.id}
                    className={`group max-w-[86%] sm:max-w-[460px] ${meu ? "self-end" : "self-start"}`}
                  >
                    <div
                      className={`px-[13px] py-2.5 text-[13px] leading-relaxed ${
                        meu
                          ? "rounded-[14px_14px_4px_14px] bg-tema text-white"
                          : "rounded-[14px_14px_14px_4px] border border-tinta-200 bg-white text-tinta-800"
                      }`}
                    >
                      {/* ── A TARJA DA CITAÇÃO ────────────────────────────
                          Dentro da bolha e com barra à esquerda, que é o
                          desenho que todo mundo já reconhece do WhatsApp —
                          inventar outro aqui obrigaria a aprender de novo. */}
                      {citada && (
                        <div
                          className={`mb-1.5 rounded-md border-l-[3px] px-2 py-1 text-[11.5px] leading-snug ${
                            meu
                              ? "border-white/70 bg-white/15 text-white/85"
                              : "border-tema/60 bg-tinta-50 text-tinta-600"
                          }`}
                        >
                          <span className="block font-semibold">
                            {citada.direcao === "outbound"
                              ? "Você"
                              : (selecionada?.nome ?? "Ela")}
                          </span>
                          <span className="line-clamp-2">
                            {citada.texto?.trim() ||
                              (citada.tipo === "audio"
                                ? "🎤 áudio"
                                : citada.tipo === "imagem"
                                  ? "📷 imagem"
                                  : "anexo")}
                          </span>
                        </div>
                      )}
                      {/* MÍDIA PRIMEIRO, texto depois.
                          Antes a bolha mostrava "🎤 Áudio" e um link "abrir"
                          que apontava para o servidor do WhatsApp — endereço
                          cifrado e vencido, ou seja, um link que nunca abria
                          nada. Agora o arquivo é nosso e toca aqui dentro. */}
                      {m.tipo === "audio" &&
                      (m.midia_arquivo || m.midia_erro) ? (
                        <Audio
                          id={m.id}
                          mime={m.midia_mime}
                          erro={m.midia_arquivo ? null : m.midia_erro}
                          segundos={m.duracao_seg}
                          minha={meu}
                        />
                      ) : m.tipo === "imagem" &&
                        (m.midia_arquivo || m.midia_previa || m.midia_erro) ? (
                        <Imagem
                          id={m.id}
                          mime={m.midia_mime}
                          erro={m.midia_arquivo ? null : m.midia_erro}
                          previa={m.midia_previa}
                          pronta={!!m.midia_arquivo}
                          legenda={m.texto}
                        />
                      ) : m.tipo === "video" &&
                        (m.midia_arquivo || m.midia_previa || m.midia_erro) ? (
                        <Video
                          id={m.id}
                          mime={m.midia_mime}
                          erro={m.midia_arquivo ? null : m.midia_erro}
                          previa={m.midia_previa}
                          pronto={!!m.midia_arquivo}
                          legenda={m.texto}
                        />
                      ) : m.tipo === "documento" &&
                        (m.midia_arquivo || m.midia_erro) ? (
                        <Documento
                          id={m.id}
                          mime={m.midia_mime}
                          erro={m.midia_arquivo ? null : m.midia_erro}
                          nome={m.texto}
                        />
                      ) : (
                        (m.texto ?? (
                          <span className="italic opacity-80">
                            {m.tipo === "audio"
                              ? "🎤 Áudio — ainda baixando"
                              : m.tipo === "imagem"
                                ? "📷 Imagem — ainda baixando"
                                : m.tipo === "documento"
                                  ? "📎 Documento"
                                  : m.tipo === "figurinha"
                                    ? "Figurinha"
                                    : m.tipo === "local"
                                      ? "📍 Localização"
                                      : "Mensagem"}
                          </span>
                        ))
                      )}
                    </div>
                    {/* ── CORRIGIR, DENTRO DA PRÓPRIA BOLHA ─────────────
                        A caixa de edição nasce onde a mensagem está, e não num
                        modal: a atendente precisa ver o texto errado enquanto
                        digita o certo. */}
                    {editando === m.id ? (
                      <div className="mt-1.5">
                        <textarea
                          value={textoEditado}
                          onChange={(e) => setTextoEditado(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              salvarEdicao(m);
                            }
                            if (e.key === "Escape") setEditando(null);
                          }}
                          rows={2}
                          autoFocus
                          className="w-full resize-none rounded-lg border border-tema px-2.5 py-1.5 text-[16px] leading-snug text-tinta-800 outline-none sm:text-[13px]"
                        />
                        {erroEdicao && (
                          <p className="mt-1 text-[11px] leading-snug text-red-700">
                            {erroEdicao}
                          </p>
                        )}
                        <div className="mt-1 flex justify-end gap-2">
                          <button
                            onClick={() => setEditando(null)}
                            className="text-[11px] font-semibold text-tinta-500 hover:text-tinta-800"
                          >
                            cancelar
                          </button>
                          <button
                            onClick={() => salvarEdicao(m)}
                            className="text-[11px] font-semibold text-tema"
                          >
                            salvar
                          </button>
                        </div>
                      </div>
                    ) : null}

                    <span
                      className={`mt-0.5 flex items-center gap-1.5 text-[10px] text-tinta-400 ${meu ? "justify-end" : ""}`}
                    >
                      {meu && m.enviada_por
                        ? `${nomePorId.get(m.enviada_por) ?? "equipe"} · `
                        : ""}
                      {hora(m.momento)}
                      {/* Só aparece enquanto o WhatsApp aceita. Depois de 15
                          minutos some sozinho — e some porque a regra é dele,
                          não nossa. */}
                      {editando !== m.id && podeEditar(m) && (
                        <button
                          onClick={() => {
                            setTextoEditado(m.texto ?? "");
                            setErroEdicao(null);
                            setEditando(m.id);
                          }}
                          className="font-semibold text-tinta-400 underline underline-offset-2 hover:text-tema"
                        >
                          editar
                        </button>
                      )}
                      {/* RESPONDER vale para qualquer mensagem que o WhatsApp
                          saiba endereçar — dela ou nossa. Sem `wa_id` não há o
                          que citar: é mensagem que nunca chegou a existir do
                          lado de lá. */}
                      {m.wa_id && (
                        <button
                          onClick={() => setCitando(m)}
                          className="font-semibold text-tinta-400 underline underline-offset-2 hover:text-tema"
                        >
                          responder
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
              <div ref={fim} />
            </div>

            {/* SEM DONO: cadeado no lugar da caixa de resposta.
                Desabilitar o campo e deixá-lo à vista seria pior — a atendente
                escreveria e só descobriria no clique. Aqui a troca é explícita:
                para falar com esta pessoa, assuma o atendimento. */}
            {!selecionada.atendente_id ? (
              <div className="border-t border-tinta-200 bg-tinta-50 px-5 pt-4 pb-5">
                {avisoDono && (
                  <p className="mb-3 rounded-lg border border-[#f0dcc0] bg-[#fdf6ea] px-3 py-2 text-[12.5px] text-[#8a4a10]">
                    {avisoDono}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tinta-200 text-tinta-600">
                    <Lock size={15} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-[20ch] flex-1">
                    <p className="text-[13px] font-bold text-tinta-900">
                      Esta conversa está aguardando atendente
                    </p>
                    {/* O TEXTO SEGUE O SENTIDO NOVO DAS ABAS.
                        Dizia que assumir tirava a conversa de Aguardando. Não
                        tira mais: Aguardando agora é "ninguém respondeu", e o
                        que move a conversa de aba é a PRIMEIRA RESPOSTA, não o
                        clique de assumir. Texto que descreve a tela antiga
                        ensina errado. */}
                    <p className="mt-0.5 text-[12px] leading-relaxed text-tinta-500">
                      Ao assumir, ela passa a ser sua e a supervisão vê que
                      alguém pegou. Ela sai de <b>Aguardando</b> e entra em{" "}
                      <b>Meus atendimentos</b> quando você <b>responder</b>.
                    </p>
                  </div>
                  <button
                    onClick={() => assumir(selecionada.id)}
                    disabled={assumindo}
                    className="flex h-9 shrink-0 items-center gap-2 rounded-[10px] bg-tema px-4 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
                  >
                    <Lock size={13} strokeWidth={2.6} />
                    {assumindo ? "Assumindo…" : "Assumir atendimento"}
                  </button>
                </div>
              </div>
            ) : (
              // `relative` por causa da prévia do anexo: ela é ancorada acima
              // da barra de escrever e precisa de um pai posicionado.
              <div className="relative border-t border-tinta-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
                {erro && (
                  <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">
                    {erro}
                  </p>
                )}

                {/* ── RESPONDENDO A QUÊ ─────────────────────────────────
                    Acima do campo e sempre visível enquanto ela digita: se a
                    citação ficasse escondida, ela mandaria a resposta amarrada
                    na mensagem errada sem perceber, e do outro lado isso lê
                    como resposta trocada. O X é grande de propósito — desistir
                    de citar tem de ser tão fácil quanto citar. */}
                {citando && (
                  <div className="mb-2 flex items-start gap-2 rounded-lg border-l-[3px] border-tema bg-tinta-50 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-tema">
                        Respondendo a{" "}
                        {citando.direcao === "outbound"
                          ? "você"
                          : (selecionada?.nome ?? "ela")}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-tinta-600">
                        {citando.texto?.trim() ||
                          (citando.tipo === "audio"
                            ? "🎤 áudio"
                            : citando.tipo === "imagem"
                              ? "📷 imagem"
                              : "anexo")}
                      </p>
                    </div>
                    <button
                      onClick={() => setCitando(null)}
                      aria-label="Não responder a essa mensagem"
                      className="shrink-0 rounded-md px-2 py-1 text-[15px] leading-none text-tinta-400 hover:bg-tinta-100 hover:text-tinta-700"
                    >
                      ×
                    </button>
                  </div>
                )}

                {/* ── O NÚMERO CAIU, DE NOVO E AQUI ──────────────────────
                    O aviso vermelho já existe no topo da coluna da fila. Só
                    que aquela coluna é `hidden` quando ela entra na conversa —
                    então ele some EXATAMENTE na hora de escrever, e no celular
                    ela nunca o vê enquanto digita.

                    Foi assim que a mensagem das 12h30 virou
                    `["Error: Connection Closed"]` no meio do papo: ela
                    escreveu, mandou, e só então descobriu — em inglês e entre
                    colchetes — que nada tinha saído.

                    Repetido aqui de propósito. Aviso que aparece onde a pessoa
                    não está não é aviso. */}
                {conexaoCaida && (
                  <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] leading-relaxed text-red-700">
                    <b>
                      {conexaoCaida.estado === "connecting"
                        ? "Seu WhatsApp está tentando conectar."
                        : "Seu WhatsApp caiu."}
                    </b>{" "}
                    O que você mandar daqui <b>não vai sair</b>. Avise a
                    coordenação para ler o QR do número{" "}
                    <b>{conexaoCaida.apelido}</b> — enquanto isso, responda pelo
                    celular para não deixar a pessoa esperando.
                    {conexaoCaida.motivo && (
                      <>
                        <br />
                        <span className="text-red-700/80">
                          {conexaoCaida.motivo}
                        </span>
                      </>
                    )}
                  </p>
                )}

                {/* Fechada: explica o que aconteceu e o que fazer. Não adianta
                    dizer "janela expirada" — ninguém aqui sabe o que é isso. */}
                {janelaFechada && (
                  <p className="mb-2 rounded-lg border border-[#f0dcc0] bg-[#fdf6ea] px-3 py-2 text-[12px] leading-relaxed text-[#a35a00]">
                    <b>Faz mais de 24h que essa pessoa não escreve.</b> O
                    WhatsApp não deixa mandar mensagem livre agora — só um
                    modelo aprovado, e ele é pago. Espere ela responder, ou fale
                    com a coordenação.
                  </p>
                )}

                {/* Perto de fechar: só quando é útil agir. Um contador o dia
                    inteiro vira enfeite que ninguém lê. */}
                {janela?.aberta && janela.horas <= 3 && (
                  <p className="mb-2 rounded-lg border border-[#f0dcc0] bg-[#fdf6ea] px-3 py-2 text-[12px] leading-relaxed text-[#a35a00]">
                    Falta{janela.horas === 1 ? "" : "m"}{" "}
                    <b>
                      {janela.horas < 1
                        ? "menos de 1 hora"
                        : `${janela.horas} horas`}
                    </b>{" "}
                    para essa conversa fechar. Depois disso, responder passa a
                    ser pago.
                  </p>
                )}

                {/* ── ESTA CONVERSA É DE OUTRA PESSOA ───────────────────────
                    A resposta sai pelo CHIP de quem é dona da conversa, nunca
                    pelo de quem digita — é assim de propósito, senão o eleitor
                    receberia mensagem de um número que nunca contatou.
                    Mas isso significa que responder daqui faz DUAS pessoas
                    escreverem pelo mesmo chip: a coordenação por dentro e a
                    atendente pelo aparelho. O eleitor recebe em duplicidade, e
                    conversa duplicada é o que faz a pessoa denunciar o número.
                    A tela não avisava nada — dava para digitar em qualquer
                    conversa sem saber por onde ia sair. */}
                {selecionada.atendente_id &&
                  selecionada.atendente_id !== euId && (
                    <p className="mb-2 rounded-lg border border-[#f0dcc0] bg-[#fdf6ea] px-3 py-2 text-[11.5px] leading-relaxed text-[#8a4a10]">
                      Esta conversa é d
                      {nomePorId.get(selecionada.atendente_id)
                        ? `a ${nomePorId.get(selecionada.atendente_id)}`
                        : "e outra atendente"}
                      . Responder daqui sai <b>pelo chip dela</b> — se ela
                      responder pelo aparelho ao mesmo tempo, a pessoa recebe
                      duas vezes, e é isso que faz número ser denunciado.
                    </p>
                  )}

                {/* ── OS MATERIAIS EM LINHA PRÓPRIA, ACIMA DO CAMPO ────────
                    Estavam espremidos dentro da barra de digitar, entre o
                    textarea e o botão Enviar: quatro ícones de 34px disputando
                    espaço com o campo, que encolhia conforme a tela.
                    Kit e áudio são o gesto mais repetido do dia depois de
                    escrever — mandar o santinho, mandar a voz da Talita. Ícone
                    escondido no canto de uma barra apertada é função que existe
                    e ninguém usa.
                    Fora do campo eles ganham rótulo e alvo de toque de verdade,
                    e o campo de escrever fica com a largura inteira. */}
                {/* ── OS SEIS BOTÕES QUEBRAM DE LINHA, E NÃO DESLIZAM ──────
                    São SEIS — Kit, Áudio, Mensagens, Santinho, Anexo e Gravar
                    — e num iPhone cabem quatro e meio. O Gravar ficava fora da
                    tela e SEM caminho até ele.

                    A primeira tentativa foi `overflow-x-auto`, e ela quebrou o
                    Santinho e as Mensagens: esses menus abrem PARA CIMA, a
                    partir do botão, e `overflow-x` recorta também na VERTICAL
                    — o CSS não deixa um eixo rolar e o outro transbordar. Os
                    balões nasciam cortados.

                    `flex-wrap` resolve as duas coisas de uma vez: o que não
                    cabe desce para a segunda linha, continua inteiro, continua
                    clicável, e nenhum menu é recortado porque não existe mais
                    área de recorte. Também não depende de a atendente adivinhar
                    que ali se arrasta.

                    No computador os seis cabem numa linha só e nada muda. */}
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <KitsDaCampanha
                    conversaId={selecionada.id}
                    podeEnviar={!janelaFechada}
                    aoEnviar={() => recarregarMensagens(selecionada.id)}
                  />
                  <AudiosDaTalita
                    conversaId={selecionada.id}
                    podeEnviar={!janelaFechada}
                    aoEnviar={() => recarregarMensagens(selecionada.id)}
                  />
                  {/* MENSAGENS logo depois do Áudio: é o material mais mandado
                      do dia, e ficava escondido dentro do menu do Santinho —
                      cujo filtro é "tudo que não é voz". Quem queria mandar uma
                      frase abria um menu chamado Santinho e procurava entre as
                      imagens. */}
                  <MensagensProntasNaBarra
                    conversaId={selecionada.id}
                    podeEnviar={!janelaFechada}
                    aoEnviar={() => recarregarMensagens(selecionada.id)}
                  />
                  {/* SANTINHO entre Mensagens e Anexo, e não no fim: Anexo é
                      subir do aparelho, os primeiros são o que a campanha já
                      cadastrou. Junto o que é da mesma natureza. */}
                  <Santinhos
                    conversaId={selecionada.id}
                    podeEnviar={!janelaFechada}
                    aoEnviar={() => recarregarMensagens(selecionada.id)}
                  />
                  <Anexo
                    // `key` pela conversa: a foto escolhida para uma pessoa não
                    // pode continuar na prévia quando a atendente abre outra.
                    key={selecionada.id}
                    conversaId={selecionada.id}
                    podeEnviar={!janelaFechada}
                    aoEnviar={() => recarregarMensagens(selecionada.id)}
                  />
                  {/* GRAVAR por último, depois do Anexo: os quatro primeiros
                      mandam o que a campanha já tem pronto; este é a menina
                      falando com aquela pessoa. É outra natureza — e é o que
                      ela usa quando o eleitor mandou áudio, que é metade do
                      que chega na caixa. */}
                  <Gravar
                    conversaId={selecionada.id}
                    podeEnviar={!janelaFechada}
                    aoEnviar={() => recarregarMensagens(selecionada.id)}
                  />
                </div>

                <div className="flex items-end gap-2.5 rounded-xl border border-tinta-300 px-3 py-2 focus-within:border-tema">
                  <textarea
                    ref={campoRef}
                    value={rascunho}
                    onChange={(e) => setRascunho(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter envia, Shift+Enter quebra linha — é o hábito de quem
                      // vem do WhatsApp, e contrariá-lo faz a atendente mandar
                      // mensagem pela metade o dia inteiro.
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        enviar();
                      }
                    }}
                    rows={2}
                    placeholder={`Escreva para ${selecionada.nome?.split(" ")[0] ?? "a pessoa"}…`}
                    // 16px NO CELULAR NÃO É ESTÉTICA, É FUNCIONAMENTO.
                    //
                    // O iPhone dá zoom sozinho quando o campo tem fonte menor
                    // que 16px. A tela pula, sai do lugar, e a pessoa precisa
                    // fechar o teclado para arrumar. É a causa do "fica
                    // mexendo" — e some com uma linha de CSS.
                    //
                    // Duas linhas de altura mínima: quem responde lead escreve
                    // frase, não palavra, e uma linha só obriga a rolar dentro
                    // de um campo de 24px.
                    className="max-h-40 min-h-[46px] flex-1 resize-none bg-transparent text-[16px] leading-snug text-tinta-800 outline-none placeholder:text-tinta-400 sm:text-[13.5px]"
                  />
                  <Emojis aoEscolher={inserirEmoji} />
                  <button
                    onClick={enviar}
                    disabled={enviando || !rascunho.trim() || janelaFechada}
                    className="flex h-[38px] shrink-0 items-center self-end rounded-[10px] bg-tema px-5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
                  >
                    {enviando ? "…" : "Enviar"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── ficha ── */}
      {selecionada && fichaAberta && (
        // A cortina só existe no celular: no computador a ficha é coluna fixa e
        // não há nada para fechar.
        <button
          aria-label="Fechar a ficha"
          onClick={() => setFichaAberta(false)}
          className="fixed inset-0 z-20 bg-tinta-900/30 xl:hidden"
        />
      )}

      {selecionada && (
        <aside
          // No celular a ficha é uma gaveta que cobre a tela: `inset-y-0` com
          // `fixed` ignora a barra do navegador, então ela vazava por baixo e a
          // última informação ficava inalcançável. `h-dvh` prende na altura de
          // verdade do aparelho.
          className={`z-30 w-[312px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-tinta-200 bg-white p-[18px] xl:static xl:flex xl:h-full xl:shadow-none ${
            fichaAberta
              ? "fixed inset-y-0 right-0 flex h-dvh max-w-[86vw] pb-[max(1.125rem,env(safe-area-inset-bottom))] shadow-2xl"
              : "hidden"
          }`}
        >
          <button
            onClick={() => setFichaAberta(false)}
            className="self-end text-[12px] font-semibold text-tinta-500 xl:hidden"
          >
            fechar
          </button>
          {selecionada.atribuido_em && (
            <div className="rounded-[10px] border border-[#d9e6fb] bg-[#f2f7ff] px-[11px] py-2.5 text-[11.5px] leading-snug text-[#2f6fd0]">
              {selecionada.atendente_id === euId ? "Com você" : "Atribuída"}{" "}
              desde {hora(selecionada.atribuido_em)}
            </div>
          )}

          {/* ANTES do cartão de cadastro, de propósito: ele é a resposta à
              pergunta "preciso cadastrar essa pessoa?", e a resposta tem de vir
              antes do formulário — não depois de a menina já ter perguntado
              nome e cidade. */}
          <JaConhecida
            conversaId={selecionada.id}
            aoAbrirOutra={(id) => {
              setFiltro("todas");
              setSelecionadaId(id);
              setVista("conversa");
              setFichaAberta(false);
            }}
          />

          <CartaoCadastro
            conversa={selecionada}
            aoCadastrar={(campos) =>
              setConversas((antes) =>
                antes.map((c) =>
                  c.id === selecionada.id ? { ...c, ...campos } : c,
                ),
              )
            }
          />

          <Bloco titulo="Pessoa">
            <Linha rotulo="Nome" valor={selecionada.nome ?? "—"} />
            <Linha
              rotulo="Telefone"
              valor={telefoneBonito(selecionada.telefone)}
            />
            <Linha rotulo="Município" valor={selecionada.municipio ?? "—"} />
            <Linha rotulo="Bairro" valor={selecionada.bairro ?? "—"} />
            {selecionada.origem && (
              <Linha rotulo="Origem" valor={selecionada.origem} />
            )}
            <Linha
              rotulo="Entrada"
              valor={
                selecionada.tipo === "disparo"
                  ? "Disparo para base"
                  : "Lead de tráfego"
              }
            />
          </Bloco>

          {/* STATUS E DEMANDAS SÃO ESPELHO DAS ETIQUETAS, não um segundo lugar
              para marcar.
              Antes os dois blocos mostravam a lista fixa inteira, sempre igual,
              com um aceso — vitrine, não informação. E a coluna que eles liam
              não era preenchida por tela nenhuma, então ficavam sempre apagados.
              Agora a etiqueta com eixo escreve na coluna, e aqui só se lê o
              resultado. Um gesto, um lugar. */}
          <Bloco titulo="Classificação" nota="vem das etiquetas">
            <div className="flex flex-wrap items-center gap-1.5">
              {statusSel ? (
                <span
                  className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold text-white"
                  style={{
                    background: statusSel.cor,
                  }}
                  title={statusSel.regra ?? undefined}
                >
                  {statusSel.rotulo}
                </span>
              ) : (
                <span className="text-[12px] italic text-tinta-400">
                  Sem classificação — marque uma etiqueta de status abaixo.
                </span>
              )}

              {(selecionada.demandas ?? []).map((d) => (
                <span
                  key={d}
                  className="rounded-lg bg-tinta-100 px-2.5 py-1 text-[11.5px] font-semibold text-tinta-700"
                >
                  {rotuloDemanda(d, catalogo)}
                </span>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-tinta-400">
              Status é <b>um só</b> e fecha 100% no painel. Demanda pode ser{" "}
              <b>quantas precisar</b>. As duas coisas vêm das etiquetas — marcar
              lá conta aqui.
            </p>
          </Bloco>

          <Bloco titulo="Etiquetas">
            <Etiquetas
              conversaId={selecionada.id}
              euId={euId}
              catalogo={catalogo}
              aoMudarCatalogo={(t) => setCatalogo((c) => [...c, t])}
              // Muda quando o banco muda o status/demandas desta conversa: é o
              // aviso para o painel reler as marcações (etiqueta do celular,
              // outra pessoa, ou o status anterior que o banco tirou).
              sinal={`${selecionada.status_lead ?? ""}|${(selecionada.demandas ?? []).join(",")}`}
              aoMarcar={(conversaId, tagId, marcada) => {
                setPorEtiqueta((antes) => {
                  const m = new Map(antes);
                  const atuais = m.get(conversaId) ?? [];
                  m.set(
                    conversaId,
                    marcada
                      ? [...new Set([...atuais, tagId])]
                      : atuais.filter((x) => x !== tagId),
                  );
                  return m;
                });
                // ── O STATUS DA CONVERSA MUDA NA HORA, NÃO SÓ A ETIQUETA ─────
                //
                // O cabeçalho, a linha da fila e a trava do "Encerrar" leem
                // `status_lead`, que o banco preenche pelo gatilho e só chegava
                // pelo tempo real. Com o canal lento ou caído, a atendente
                // marcava o status e o botão continuava pedindo classificação.
                const t = catalogo.find((x) => x.id === tagId);
                if (!t?.eixo || !t.valor) return;
                setConversas((cs) =>
                  cs.map((c) => {
                    if (c.id !== conversaId) return c;
                    if (t.eixo === "status")
                      return marcada
                        ? { ...c, status_lead: t.valor! }
                        : c.status_lead === t.valor
                          ? { ...c, status_lead: null }
                          : c;
                    const ds = c.demandas ?? [];
                    return {
                      ...c,
                      demandas: marcada ? [...new Set([...ds, t.valor!])] : ds.filter((d) => d !== t.valor),
                    };
                  }),
                );
              }}
            />
          </Bloco>
        </aside>
      )}
    </div>
  );
}

/**
 * O cartão de confirmação do cadastro.
 *
 * ── POR QUE ELE EXISTE ──────────────────────────────────────────────────────
 *
 * O webhook LÊ a conversa e propõe nome, município e bairro. Ele não escreve na
 * base — com mil leads por dia, escrever direto encheria `liderancas` de linha
 * meia-boca: nome que era apelido do WhatsApp, município adivinhado de uma frase
 * solta.
 *
 * Então quem escreve é a atendente. Os campos chegam preenchidos, ela lê,
 * corrige o que estiver torto e clica. O telefone não é editável: ele veio do
 * próprio WhatsApp e é a única coisa aqui que não é palpite.
 */
function CartaoCadastro({
  conversa,
  aoCadastrar,
}: {
  conversa: Conversa;
  aoCadastrar: (campos: Partial<Conversa>) => void;
}) {
  const [nome, setNome] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [bairro, setBairro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Fechado por padrão: a ficha cadastrada é para CONFERIR de relance, e um
  // formulário sempre aberto convida a mexer sem querer no meio da conversa.
  const [editando, setEditando] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  // Os campos recarregam quando a conversa muda. Sem a chave no `key` do
  // componente pai isto seria um efeito; com ela, o React remonta e o estado
  // nasce do zero — que é o que queremos ao trocar de pessoa.
  //
  // Começa em nulo, e não na chave: nascendo igual à chave, o primeiro render
  // nunca entrava no bloco abaixo, e o cartão abria VAZIO na primeira conversa
  // (e de novo depois de cada Encerrar, que desmonta o painel) — com o
  // pontinho de "lido da conversa" ao lado de um campo em branco.
  const chave = conversa.id;
  const [de, setDe] = useState<number | null>(null);
  if (de !== chave) {
    setDe(chave);
    setNome(conversa.nome ?? conversa.nome_sugerido ?? "");
    setMunicipio(conversa.municipio ?? conversa.municipio_sugerido ?? "");
    setBairro(conversa.bairro ?? conversa.bairro_sugerido ?? "");
    setErro(null);
    // Fecha a edição ao trocar de pessoa. Sem isto, abrir a edição de uma e
    // clicar na próxima deixaria o formulário aberto já preenchido com os dados
    // dela — e um Enter distraído salvaria na pessoa errada.
    setEditando(false);
  }

  async function salvarEdicao() {
    if (!nome.trim() || !municipio.trim() || salvando) return;
    setSalvando(true);
    setErro(null);
    // `editar_cadastro` e NÃO `confirmar_cadastro`: aquele grava a liderança com
    // `coalesce`, que só preenche vazio e nunca corrige, e ainda reescreveria
    // `cadastrado_por` e `cadastrado_em` — quem editasse roubaria o crédito de
    // quem cadastrou, e a pessoa saltaria para o relatório de hoje.
    const { data, error } = await supabase.rpc("editar_cadastro", {
      p_conversa: conversa.id,
      p_nome: nome.trim(),
      p_municipio: municipio.trim(),
      p_bairro: bairro.trim() || null,
    });
    setSalvando(false);
    const r = data as { ok?: boolean; erro?: string } | null;
    if (error || !r?.ok) {
      setErro(error?.message ?? r?.erro ?? "Não consegui salvar.");
      return;
    }
    aoCadastrar({
      nome: nome.trim(),
      municipio: municipio.trim(),
      bairro: bairro.trim() || null,
    });
    setEditando(false);
  }

  if (conversa.cadastrado_em && !editando) {
    return (
      <div className="flex items-center gap-2 rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2.5">
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 shrink-0 text-emerald-700"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span className="flex-1 text-[11.5px] leading-snug text-emerald-800">
          Cadastrada na base às {hora(conversa.cadastrado_em)}
        </span>
        {/* EDITAR DEPOIS DE CADASTRAR.
            A conversa não chega pronta: a pessoa manda o nome, some, e volta
            dois dias depois dizendo de onde é. Sem este botão a ficha virava
            pedra e o município que chegou depois não tinha onde entrar — o
            contorno seria cadastrar de novo, criando pessoa duplicada. */}
        <button
          onClick={() => {
            setNome(conversa.nome ?? "");
            setMunicipio(conversa.municipio ?? "");
            setBairro(conversa.bairro ?? "");
            setErro(null);
            setEditando(true);
          }}
          className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800 underline decoration-emerald-300 underline-offset-2 hover:decoration-emerald-700"
        >
          editar
        </button>
      </div>
    );
  }

  async function confirmar() {
    if (!nome.trim() || !municipio.trim() || salvando) return;
    setSalvando(true);
    setErro(null);
    const { data, error } = await supabase.rpc("confirmar_cadastro", {
      p_conversa: conversa.id,
      p_nome: nome.trim(),
      p_municipio: municipio.trim(),
      p_bairro: bairro.trim() || null,
    });
    setSalvando(false);
    const r = data as { ok?: boolean; erro?: string } | null;
    if (error || !r?.ok) {
      setErro(error?.message ?? r?.erro ?? "Não consegui cadastrar.");
      return;
    }
    aoCadastrar({
      nome: nome.trim(),
      municipio: municipio.trim(),
      bairro: bairro.trim() || null,
      cadastrado_em: new Date().toISOString(),
    });
  }

  // A trava de cadastrar é a mesma de encerrar, e mora no banco. Aqui o botão
  // só antecipa: `confirmar_cadastro` devolve o mesmo texto se alguém passar
  // por cima.
  const semClassificacao =
    !conversa.status_lead && !conversa.telefone.startsWith("lid.");

  const falta = !nome.trim() || !municipio.trim() || semClassificacao;

  return (
    <div className="rounded-xl border border-tinta-200 bg-tinta-50 p-3.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-tinta-500">
          {editando ? "Corrigir esta pessoa" : "Cadastrar esta pessoa"}
        </span>
        {editando ? (
          <button
            onClick={() => {
              setEditando(false);
              setErro(null);
            }}
            className="text-[10px] text-tinta-400 underline underline-offset-2 hover:text-tinta-700"
          >
            cancelar
          </button>
        ) : (
          <span className="text-[10px] text-tinta-400">confira antes</span>
        )}
      </div>

      <div className="mt-2.5 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-tinta-200 bg-white px-2.5 py-1.5">
          <span className="text-[11px] text-tinta-500">Telefone</span>
          <span className="text-[12px] font-semibold text-tinta-900">
            {telefoneBonito(conversa.telefone)}
          </span>
        </div>

        <Campo
          rotulo="Nome"
          valor={nome}
          aoMudar={setNome}
          sugerido={!!conversa.nome_sugerido}
        />
        <Campo
          rotulo="Município"
          valor={municipio}
          aoMudar={setMunicipio}
          sugerido={!!conversa.municipio_sugerido}
        />
        <Campo
          rotulo="Bairro"
          valor={bairro}
          aoMudar={setBairro}
          sugerido={!!conversa.bairro_sugerido}
        />
      </div>

      {conversa.indicado_por && (
        <p className="mt-2 text-[11px] text-tinta-500">
          Indicada por{" "}
          <b className="font-semibold text-tema">{conversa.indicado_por}</b>
        </p>
      )}

      {erro && (
        <p className="mt-2 text-[11px] leading-snug text-red-700">{erro}</p>
      )}

      <button
        onClick={editando ? salvarEdicao : confirmar}
        disabled={falta || salvando}
        className="mt-3 h-9 w-full rounded-[10px] bg-tema text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-40"
      >
        {salvando
          ? editando
            ? "Salvando…"
            : "Cadastrando…"
          : editando
            ? "Salvar correção"
            : "Confirmar e cadastrar"}
      </button>
      {/* O QUE A CORREÇÃO ALCANÇA, dito na tela.
          A menina precisa saber que corrigir aqui arruma também a lista de
          Leads — senão ela corrige, abre a outra tela, vê o nome velho e
          conclui que o PIE não salvou. */}
      {editando && (
        <p className="mt-1.5 text-center text-[10.5px] leading-snug text-tinta-400">
          Corrige aqui e na lista de Leads. Não muda a data nem quem cadastrou.
        </p>
      )}
      {falta && !editando && (
        <p
          className={`mt-1.5 text-center text-[10.5px] leading-relaxed ${
            semClassificacao ? "font-semibold text-[#a35a00]" : "text-tinta-400"
          }`}
        >
          {semClassificacao
            ? "Marque uma etiqueta de status abaixo — Apoiador, Indeciso, Hater... Sem ela o cadastro não entra no relatório."
            : "Nome e município são obrigatórios"}
        </p>
      )}
    </div>
  );
}

function Campo({
  rotulo,
  valor,
  aoMudar,
  sugerido,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  sugerido: boolean;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-tinta-200 bg-white px-2.5 py-1.5 focus-within:border-tema">
      <span className="shrink-0 text-[11px] text-tinta-500">{rotulo}</span>
      <input
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder="—"
        className="min-w-0 flex-1 bg-transparent py-1 text-right text-[12px] font-semibold text-tinta-900 outline-none placeholder:font-normal placeholder:text-tinta-300"
      />
      {/* O ponto diz que aquele campo veio da conversa, não do dedo de alguém. */}
      {sugerido && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-tema"
          title="lido da conversa"
        />
      )}
    </label>
  );
}

function Bloco({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-tinta-400">
          {titulo}
        </span>
        {nota && <span className="text-[10px] text-tinta-300">{nota}</span>}
      </div>
      <div className="mt-2.5 flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-2.5">
      <span className="shrink-0 text-[12px] text-tinta-500">{rotulo}</span>
      <span className="truncate text-right text-[12.5px] font-semibold text-tinta-900">
        {valor}
      </span>
    </div>
  );
}
