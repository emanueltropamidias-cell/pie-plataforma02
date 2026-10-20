// A conversa com a Evolution API, num lugar só.
//
// Ela é o TRANSPORTE, e só. Não decide quem atende, não classifica, não
// cadastra. Trocar de fornecedor é reescrever este arquivo e o webhook — o
// resto do CRM não fica sabendo.
//
// ── OS DOIS SEGREDOS, QUE NÃO SÃO A MESMA COISA ─────────────────────────────
//
//   EVOLUTION_API_KEY   a chave GLOBAL do servidor, definida no docker-compose
//                       em AUTHENTICATION_API_KEY. Cria e apaga instância.
//   EVOLUTION_INSTANCIA o NOME da instância (não é o id): vai no fim da URL.
//
// A documentação chama as duas de "token" em páginas diferentes e avisa em
// caixa alta para não misturar. Misturadas, a API devolve 401 sem explicar.
//
//   EVOLUTION_URL       https://evo.seudominio.com.br  (sem barra no fim)

export type Ambiente = { url: string; chave: string; instancia: string };

function ambiente(): Ambiente | null {
  const url = process.env.EVOLUTION_URL?.trim().replace(/\/$/, "");
  const chave = process.env.EVOLUTION_API_KEY?.trim();
  const instancia = process.env.EVOLUTION_INSTANCIA?.trim();
  if (!url || !chave || !instancia) return null;
  return { url, chave, instancia };
}

export function configurada() {
  return ambiente() !== null;
}

/** DDI + DDD + número, só dígitos. */
export function normalizarTelefone(v: string): string {
  const d = (v || "").replace(/\D/g, "");
  if (!d) return "";
  // Número brasileiro colado de planilha vem sem o 55.
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
}

/** "5571992330000@s.whatsapp.net" -> "5571992330000" */
export function telefoneDoJid(jid: string): string {
  return normalizarTelefone((jid || "").split("@")[0].split(":")[0]);
}

/**
 * O endereço de uma conversa que chegou sem telefone.
 *
 * O PONTO NÃO É ENFEITE. É ele que faz `so_digitos` devolver vazio no banco, e
 * é isso que impede o identificador de ser confundido com telefone e amarrar a
 * conversa à pessoa errada da base. Ver `supabase/historico/conversa-por-lid.sql`.
 */
export function enderecoDeLid(jid: string): string | null {
  const id = (jid || "").split("@")[0].split(":")[0].replace(/\D/g, "");
  return id ? `lid.${id}` : null;
}

export function ehLid(endereco: string | null | undefined): boolean {
  return !!endereco && endereco.startsWith("lid.");
}

/**
 * O nome de quem está do outro lado, quando só temos o identificador.
 *
 * O history sync não manda telefone, mas o perfil responde: para o
 * `143417564733621@lid` a Evolution devolveu "Elenilda". Sem isto a fila
 * mostraria quinze dígitos, e ninguém atende um número.
 */
export async function perfilDoJid(jid: string, instancia?: string | null) {
  const r = await chamar<{ name?: string; numberExists?: boolean }>(
    "chat/fetchProfile",
    { number: jid },
    instancia,
  );
  if (!r.ok) return null;
  const nome = (r.dados?.name ?? "").trim();
  return nome && !/^\d+$/.test(nome) ? nome : null;
}

type Resposta<T> = { ok: true; dados: T } | { ok: false; erro: string };

/**
 * O erro do Evolution vira frase para quem está atendendo.
 *
 * ── POR QUE ISTO EXISTE ────────────────────────────────────────────────────
 *
 * Quando o chip cai, o Evolution devolve `["Error: Connection Closed"]` — uma
 * LISTA, que o `JSON.stringify` daqui de baixo entregava inteira na tela. A
 * atendente lia isso no meio da conversa, em inglês e entre colchetes, e não
 * tinha como saber três coisas que importam:
 *
 *   que a mensagem NÃO saiu — a pessoa do outro lado não recebeu nada;
 *   que o problema é o número dela, não o texto que escreveu;
 *   que tem conserto, e onde.
 *
 * Sem isso ela reescreve, tenta de novo, e no fim avisa que "o PIE bugou".
 *
 * ── POR QUE AQUI, E NÃO NA TELA ────────────────────────────────────────────
 *
 * Este é o funil por onde passa TODA chamada ao Evolution: texto, áudio,
 * mídia, kit, etiqueta, reinício. Traduzir na tela obrigaria a repetir em cada
 * uma, e a que faltasse voltaria a mostrar colchete — sem erro, sem aviso.
 */
/**
 * Este erro quer dizer "o socket do WhatsApp está fechado"?
 *
 * Casa tanto o texto CRU do Evolution quanto a frase já traduzida logo abaixo,
 * porque o erro cruza a fronteira das camadas como string e nada mais. Duas
 * listas seria pior: a que ficasse para trás faria a queda passar batida.
 */
export function ehQuedaDeConexao(msg: string): boolean {
  const t = (msg || "").toLowerCase();
  return (
    t.includes("connection closed") ||
    t.includes("connection lost") ||
    t.includes("connection is not open") ||
    t.includes("not connected") ||
    t.includes("com o whatsapp caiu") ||
    t.includes("está desconectado")
  );
}

function fraseDoErro(bruto: string, instancia?: string | null): string {
  const t = bruto.toLowerCase();
  const numero = (instancia ?? "").trim();
  const de = numero ? ` do número ${numero}` : "";

  // O socket do WhatsApp caiu. É o erro mais comum de todos, e o único cuja
  // solução a atendente consegue tocar sozinha.
  if (t.includes("connection closed") || t.includes("connection lost"))
    return `A mensagem não saiu: a conexão${de} com o WhatsApp caiu. Abra Atendimento › Conexão, reconecte e mande de novo — o que você escreveu não foi entregue.`;

  if (t.includes("connection is not open") || t.includes("not connected"))
    return `A mensagem não saiu: o WhatsApp${de} está desconectado. Reconecte em Atendimento › Conexão e mande de novo.`;

  // Instância apagada ou nome trocado. Não tem conserto pela tela dela.
  if (t.includes("does not exist") || t.includes("not found"))
    return `A mensagem não saiu: o PIE não achou o número${de} no servidor de WhatsApp. Avise a coordenação — não adianta tentar de novo.`;

  if (t.includes("timeout") || t.includes("timed out"))
    return `A mensagem demorou demais e não saiu. Espere alguns segundos e mande de novo — se repetir, o número${de} pode estar caindo.`;

  return bruto;
}

async function chamar<T>(
  caminho: string,
  corpo: unknown,
  /**
   * Por qual NÚMERO sair.
   *
   * A campanha passou a receber por vários. Sem este parâmetro, tudo sairia
   * pela instância do ambiente — e a resposta a quem escreveu para o número 3
   * chegaria pelo número 1. Para o eleitor isso é abordagem fria de um número
   * desconhecido, e é o que ele denuncia.
   *
   * Vazio cai na instância do ambiente, que é o comportamento antigo e continua
   * certo para quem só tem um número.
   */
  instancia?: string | null,
  /** Endereços do SERVIDOR, que não levam número nenhum no caminho. */
  semInstancia = false,
): Promise<Resposta<T>> {
  const env = ambiente();
  if (!env)
    return {
      ok: false,
      erro: "Evolution não configurada (faltam variáveis na Vercel).",
    };

  const sufixo = semInstancia ? "" : `/${instancia?.trim() || env.instancia}`;

  try {
    const r = await fetch(`${env.url}${caminho}${sufixo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: env.chave },
      body: JSON.stringify(corpo),
      cache: "no-store",
    });
    const texto = await r.text();
    let json: unknown = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      // Erro de rota volta como HTML. Sem este try viraria "Unexpected token <"
      // e esconderia a causa real.
      return {
        ok: false,
        erro: `Resposta não-JSON (${r.status}): ${texto.slice(0, 180)}`,
      };
    }
    if (!r.ok) {
      const j = json as {
        message?: unknown;
        error?: unknown;
        response?: { message?: unknown };
      };
      const msg =
        j?.response?.message ?? j?.message ?? j?.error ?? `HTTP ${r.status}`;
      const bruto = typeof msg === "string" ? msg : JSON.stringify(msg);
      return { ok: false, erro: fraseDoErro(bruto, instancia) };
    }
    return { ok: true, dados: json as T };
  } catch (e) {
    return {
      ok: false,
      erro: fraseDoErro(
        e instanceof Error ? e.message : "Falha de rede",
        instancia,
      ),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A INSTÂNCIA: estado, QR e reinício
// ─────────────────────────────────────────────────────────────────────────────
//
// Estes três existem para a tela de conexão dentro do PIE. A sessão do WhatsApp
// cai — queda de energia, atualização do aparelho, celular dias sem internet — e
// quando cair num sábado à noite ninguém vai abrir SSH no servidor. O
// atendimento fica parado até alguém abrir.
//
// A CHAVE NUNCA VAI PARA O NAVEGADOR. O PIE fala com a Evolution por baixo e
// devolve só o estado e a imagem do QR. Quem tem a chave manda mensagem pelo
// número da campanha; ela não tem o que fazer no lado do cliente.

// ── DESLIGAR PEDE DELETE, E ISSO ESTAVA ERRADO DESDE SEMPRE ─────────────────
//
// `/instance/logout` e `/instance/delete` da Evolution só existem no método
// DELETE. Chamados por GET a resposta é `Cannot GET /instance/logout/...` —
// 404 de rota inexistente, não de instância não encontrada. Provado em 28/09
// batendo nos quatro cruzamentos:
//
//   GET    /instance/logout  -> Cannot GET /instance/logout/...
//   DELETE /instance/logout  -> a instância "x" não existe   (rota existe)
//
// As duas usavam `chamarGet`. Ou seja: NENHUM desconectar da plataforma
// funcionou — nem o botão da tela de Números, nem a limpeza automática da
// agenda de aparelho convidado. O sintoma que trouxe isto à tona: dois
// telefones de terceiros continuaram conectados depois de a importação dizer
// "feito".
//
// Falhava calado porque o erro voltava como 404, que se lê como "já não está
// lá" — exatamente o que se espera de um desconectar bem-sucedido.
async function chamarDelete<T>(
  caminho: string,
  instancia?: string | null,
): Promise<Resposta<T>> {
  const env = ambiente();
  if (!env)
    return { ok: false, erro: "Evolution não configurada (faltam variáveis na Vercel)." };
  try {
    const r = await fetch(`${env.url}${caminho}/${instancia?.trim() || env.instancia}`, {
      method: "DELETE",
      headers: { apikey: env.chave },
      cache: "no-store",
    });
    const texto = await r.text();
    let json: unknown = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { /* resposta sem corpo */ }
    if (!r.ok) {
      const j = json as { message?: unknown; error?: unknown };
      const m = Array.isArray(j?.message) ? j.message.join(" ") : (j?.message ?? j?.error ?? texto);
      return { ok: false, erro: `${r.status}: ${String(m).slice(0, 200)}` };
    }
    return { ok: true, dados: json as T };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "falha de rede" };
  }
}

async function chamarGet<T>(
  caminho: string,
  /** Qual número consultar. Vazio = o do ambiente. */
  instancia?: string | null,
  /** Endereços do SERVIDOR, que não levam número nenhum no caminho. */
  semInstancia = false,
): Promise<Resposta<T>> {
  const env = ambiente();
  if (!env)
    return {
      ok: false,
      erro: "Evolution não configurada (faltam variáveis na Vercel).",
    };
  const sufixo = semInstancia ? "" : `/${instancia?.trim() || env.instancia}`;
  try {
    const r = await fetch(`${env.url}${caminho}${sufixo}`, {
      headers: { apikey: env.chave },
      cache: "no-store",
    });
    const texto = await r.text();
    let json: unknown = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      return {
        ok: false,
        erro: `Resposta não-JSON (${r.status}): ${texto.slice(0, 180)}`,
      };
    }
    if (!r.ok) {
      const j = json as { message?: unknown; error?: unknown };
      const msg = j?.message ?? j?.error ?? `HTTP ${r.status}`;
      const bruto = typeof msg === "string" ? msg : JSON.stringify(msg);
      return { ok: false, erro: fraseDoErro(bruto, instancia) };
    }
    return { ok: true, dados: json as T };
  } catch (e) {
    return {
      ok: false,
      erro: fraseDoErro(
        e instanceof Error ? e.message : "Falha de rede",
        instancia,
      ),
    };
  }
}

export type Estado = { instance?: { state?: string; instanceName?: string } };

/** `open` = conectado · `connecting` = lendo QR · `close` = fora do ar. */
export function estadoDaConexao(instancia?: string | null) {
  return chamarGet<Estado>("/instance/connectionState", instancia);
}

/**
 * TODAS as instâncias do servidor, de uma vez.
 *
 * Com sete números, perguntar o estado um a um seriam sete idas ao servidor a
 * cada abertura da tela — e a tela ficaria esperando a mais lenta. Este
 * endereço devolve tudo numa chamada.
 *
 * `disconnectionReasonCode` é o campo que importa quando algo dá errado: foi
 * ele que provou que o banimento de 26/08 foi um 401, e não queda de servidor.
 */
export type InstanciaViva = {
  name?: string;
  connectionStatus?: string;
  ownerJid?: string;
  profileName?: string;
  disconnectionReasonCode?: number;
  disconnectionAt?: string;
  /** O objeto do Baileys com a causa real. É onde mora `tag: conflict`. */
  disconnectionObject?: unknown;
  _count?: { Message?: number; Contact?: number; Chat?: number };
};

/**
 * POR QUE o número caiu, em uma frase que diz o que fazer.
 *
 * ── O QUE ESTAVA SE PERDENDO ───────────────────────────────────────────────
 *
 * A Evolution guarda a causa da queda, e o PIE lia só o `connectionStatus`. A
 * tela dizia "caiu" e pronto. Só que "caiu" tem causas com respostas OPOSTAS:
 *
 *   conflict/device_removed  alguém abriu o WhatsApp Web ou desconectou o PIE
 *                            em "Aparelhos conectados". Ler o QR resolve — e
 *                            vai cair de novo amanhã se ninguém for avisado.
 *
 *   401                      o WhatsApp cortou o número. Ler o QR NÃO resolve,
 *                            e insistir piora. Foi o que aconteceu em 26/08.
 *
 *   403                      número bloqueado.
 *
 * Sem a causa, a coordenação lê QR em número banido e não avisa a equipe no
 * número que caiu por conflito. As duas respostas erradas, pelo mesmo aviso.
 */
export function motivoDaQueda(i: InstanciaViva): string | null {
  if (i.connectionStatus === "open") return null;

  const o = i.disconnectionObject as
    | { error?: { data?: { tag?: string; attrs?: { type?: string }; reason?: string } } }
    | undefined;
  const tag = o?.error?.data?.tag ?? "";
  const tipo = o?.error?.data?.attrs?.type ?? "";
  const codigo = i.disconnectionReasonCode;

  if (tag === "conflict" || tipo === "device_removed")
    return "Outro aparelho assumiu a sessão — alguém abriu o WhatsApp Web com este número, ou removeu o PIE em Aparelhos conectados no celular. Leia o QR de novo e avise a equipe para não abrir o WhatsApp Web neste número, senão cai outra vez.";

  if (codigo === 401)
    return "O WhatsApp cortou este número (401). Ler o QR de novo NÃO resolve e insistir piora — este é o aviso de conta derrubada por comportamento automatizado. Fale com a coordenação antes de tentar reconectar.";

  if (codigo === 403)
    return "Número bloqueado pelo WhatsApp (403). Não adianta ler o QR.";

  if (codigo === 440)
    return "A sessão foi substituída por outra conexão do mesmo número. Leia o QR de novo.";

  return null;
}

export function todasAsInstancias() {
  // Sem instância no caminho: este endereço é do servidor, não de um número.
  return chamarGet<InstanciaViva[]>("/instance/fetchInstances", null, true);
}

/**
 * Pede o QR para parear.
 *
 * A Evolution devolve `base64` já com o prefixo `data:image/png` em algumas
 * versões e sem ele em outras — a tela normaliza, porque errar isso mostra uma
 * imagem quebrada sem dizer por quê.
 */
export type QR = {
  base64?: string;
  code?: string;
  pairingCode?: string;
  count?: number;
};
export function pedirQR(instancia?: string | null) {
  return chamarGet<QR>("/instance/connect", instancia);
}

/**
 * As etiquetas do WhatsApp Business daquele número.
 *
 * O evento de marcação só traz o ID; o nome mora aqui. São poucas e mudam uma
 * vez por mês, mas marcar etiqueta é raro perto do volume de mensagens — buscar
 * na hora custa menos do que manter uma cópia que envelhece em silêncio.
 */
export type EtiquetaWa = { id: string; name: string; color?: string };

export function etiquetasDaInstancia(instancia?: string | null) {
  return chamarGet<EtiquetaWa[]>("/label/findLabels", instancia);
}

/**
 * As conversas que a Evolution guarda daquele número.
 *
 * Ela recebe e armazena mesmo quando o webhook do PIE falha ou está desligado —
 * é por isso que ela pode ter mais conversa que a gente, e é daqui que a
 * importação puxa a diferença.
 *
 * A resposta é GRANDE: a instância da Boneca devolve ~8 MB, porque traz o
 * histórico inteiro do WhatsApp pessoal que veio no primeiro pareamento. Quem
 * chama precisa filtrar por data antes de fazer qualquer coisa com isso.
 */
export type ChatEvolution = {
  remoteJid?: string;
  remoteJidAlt?: string;
  pushName?: string | null;
  updatedAt?: string;
  lastMessage?: {
    key?: { id?: string; fromMe?: boolean; remoteJidAlt?: string };
    pushName?: string | null;
    messageTimestamp?: number | string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
    };
  };
};

export function conversasDaInstancia(instancia: string) {
  return chamar<ChatEvolution[]>("/chat/findChats", {}, instancia);
}

/**
 * A agenda daquele número — tudo que o aparelho conhece.
 *
 * São milhares: a instância da Boneca devolve 5.223, porque o histórico
 * pessoal veio junto no primeiro pareamento. Quase nada disso é lead da
 * campanha, e quem chamar precisa saber disso antes de fazer algo com a lista.
 */
export type ContatoWa = {
  remoteJid?: string;
  pushName?: string | null;
  isGroup?: boolean;
};

export function contatosDaInstancia(instancia: string) {
  return chamar<ContatoWa[]>("/chat/findContacts", {}, instancia);
}

/** Derruba a sessão. O próximo passo é ler o QR de novo. */
export function desconectar(instancia?: string | null) {
  return chamarDelete<{ status?: string }>("/instance/logout", instancia);
}

/**
 * Apaga a instância do servidor, com a sessão e os dados dela.
 *
 * Existe para o aparelho CONVIDADO: alguém empresta o telefone, a agenda é
 * lida, e depois não há motivo para a sessão continuar de pé. Deixá-la viva
 * seria manter um aparelho conectado ao WhatsApp de um terceiro por tempo
 * indeterminado — o que ninguém autorizou ao ler um QR.
 *
 * Quem chama é responsável por conferir o prefixo `agenda_`
 * (`ehInstanciaDeAgenda`). Esta função não sabe a diferença entre uma
 * instância de agenda e o chip da Maiana.
 */
export function apagarInstancia(instancia: string) {
  return chamarDelete<{ status?: string }>("/instance/delete", instancia);
}

/**
 * Cria a instância JÁ COM O WEBHOOK CONFIGURADO.
 *
 * ── POR QUE OS DOIS JUNTOS ─────────────────────────────────────────────────
 *
 * Na Evolution são dois gestos separados: criar a instância e depois apontar o
 * webhook dela. Cada instância tem o seu — não se herda nada.
 *
 * Fazer isso à mão sete vezes tem uma falha previsível: alguém cria, lê o QR,
 * vê "conectado" e para por aí. O número conecta, recebe mensagem, e NADA chega
 * no PIE. Não dá erro em lugar nenhum: a Evolution está feliz, o WhatsApp está
 * feliz, e os leads somem em silêncio. Só se descobre quando alguém estranha
 * que aquele número nunca aparece na fila.
 *
 * Aqui os dois vão na mesma chamada. Não há o segundo passo para esquecer.
 */
/**
 * OS EVENTOS QUE O PIE ESCUTA — escritos UMA vez.
 *
 * Estavam em duas listas iguais, e as duas desencontraram: `/webhook/set`
 * substitui o que a instância tinha, então a lista mais curta vencia. Fato que
 * mora em dois lugares sempre desencontra; por isso mora aqui.
 *
 * Cada um tem dono na rota do webhook:
 *   MESSAGES_UPSERT     -> a mensagem que entra e a que a atendente manda do celular
 *   MESSAGES_UPDATE     -> entregue/lido
 *   CONNECTION_UPDATE   -> o chip caiu; é o que faz a queda gritar
 *   LABELS_ASSOCIATION  -> a etiqueta marcada no aplicativo vira etiqueta do PIE
 */
const EVENTOS = [
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "CONNECTION_UPDATE",
  "LABELS_ASSOCIATION",
];

export function criarInstancia(nome: string, webhookUrl: string) {
  return chamar<{ instance?: { instanceName?: string } }>(
    "/instance/create",
    {
      instanceName: nome,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: false,
        // Só o que o PIE usa. Assinar tudo faria a Evolution disparar webhook a
        // cada presença e cada atualização de contato — a 4000 leads/dia isso é
        // uma enxurrada de chamadas para eventos que a rota descarta na
        // primeira linha.
        //
        // LABELS_ASSOCIATION é o que sustenta a operação de agora: com o chip
        // caído a equipe atende no aplicativo e marca a etiqueta lá. Faltava
        // desta lista, e por isso só funcionava na instância onde alguém tinha
        // marcado o evento à mão no painel — todo número novo nascia sem, e a
        // marcação da atendente ia para o vazio sem ninguém perceber.
        events: EVENTOS,
      },
    },
    // Sem instância no caminho: é o endereço que CRIA uma.
    null,
    true,
  );
}

/** Aponta (ou corrige) o webhook de uma instância que já existe. */
export function apontarWebhook(instancia: string, webhookUrl: string) {
  return chamar(
    "/webhook/set",
    {
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        // A MESMA LISTA da criação, e não uma cópia: `/webhook/set` SUBSTITUI
        // os eventos da instância. Uma lista mais curta aqui desligaria, em
        // silêncio, o que a criação tinha assinado — inclusive numa instância
        // que já estava funcionando.
        events: EVENTOS,
      },
    },
    instancia,
  );
}

export type EnvioOk = { key?: { id?: string }; status?: string };

/**
 * Manda texto.
 *
 * O CORPO MUDOU ENTRE AS VERSÕES, e é a pegadinha mais cara desta integração:
 * a v1 espera `{ number, textMessage: { text } }` e a v2 espera `{ number,
 * text }` no plano. A documentação online mostra as duas formas em páginas
 * diferentes, sem dizer qual é qual.
 *
 * Então manda no formato v2 e, se levar 400, repete no da v1. Custa uma
 * requisição extra só na primeira vez que a versão errada aparece — e evita o
 * dia inteiro de "a mensagem não sai e ninguém sabe por quê".
 *
 * `delay` mostra "digitando..." antes. Não é enfeite: resposta instantânea
 * depois de uma pergunta longa denuncia robô, e a operação inteira depende de a
 * conversa parecer conversa.
 */
// SEM ATRASO POR PADRÃO.
//
// Havia `delay = 1200` aqui: a Evolution esperava 1,2 segundo antes de mandar,
// para "simular digitação". Medido no servidor de verdade, isso é METADE do
// tempo de envio — 2,31 s com atraso contra 1,16 s sem.
//
// E não entrega o que promete: o atraso só adia a mensagem, sem mostrar
// "digitando..." para quem está do outro lado. Custava um segundo por mensagem
// e não comprava nada. A atendente que manda duzentas por dia perdia três
// minutos por dia esperando uma animação que não existe.
/**
 * A mensagem que está sendo CITADA.
 *
 * O WhatsApp precisa da chave da original para desenhar a tarja de citação no
 * aparelho de quem recebe. `texto` entra no corpo de referência — sem ele a
 * tarja aparece vazia em alguns clientes, que é pior que não citar.
 */
export type Citacao = {
  waId: string;
  texto: string;
  /** Verdadeiro quando a citada foi enviada pela campanha. */
  minha: boolean;
};

function comoQuoted(c: Citacao | null | undefined) {
  if (!c?.waId) return undefined;
  return {
    key: { id: c.waId, fromMe: c.minha },
    message: { conversation: c.texto.slice(0, 700) },
  };
}

export async function enviarTexto(
  telefone: string,
  mensagem: string,
  /** Por qual número da campanha sair. Vazio = o do ambiente. */
  instancia?: string | null,
  delay = 0,
  citar?: Citacao | null,
) {
  const number = normalizarTelefone(telefone);
  const quoted = comoQuoted(citar);
  const v2 = await chamar<EnvioOk>(
    "/message/sendText",
    { number, text: mensagem, delay, ...(quoted ? { quoted } : {}) },
    instancia,
  );
  if (v2.ok) return v2;

  const pareceFormato = /text|body|validation|400|bad request/i.test(v2.erro);
  if (!pareceFormato) return v2;

  return chamar<EnvioOk>(
    "/message/sendText",
    {
      number,
      textMessage: { text: mensagem },
      delay,
      ...(quoted ? { quoted } : {}),
    },
    instancia,
  );
}

/**
 * O arquivo DECIFRADO de uma mensagem de mídia.
 *
 * A URL que vem no webhook aponta para o servidor do WhatsApp e o conteúdo está
 * CIFRADO — baixar de lá devolve bytes embaralhados. A Evolution tem as chaves
 * da sessão e é ela quem sabe decifrar; este endereço é o único caminho.
 *
 * Devolve base64. Um áudio de um minuto dá uns 500 KB, o que em base64 vira
 * ~670 KB de texto — pesado, e mesmo assim melhor do que não ter o áudio.
 */
export type MidiaBaixada = {
  base64?: string;
  mimetype?: string;
  fileName?: string;
};
export function baixarMidia(waId: string, instancia?: string | null) {
  // A INSTÂNCIA IMPORTA AQUI, e esquecer disso custou um áudio.
  //
  // Cada instância tem o próprio armazenamento de mensagens. Pedir o arquivo à
  // instância errada devolve "Message not found" — que parece mídia corrompida
  // ou problema do WhatsApp, e não é: é a pergunta feita na gaveta errada.
  //
  // Aconteceu de verdade: eu passei a instância no ENVIO quando vieram os
  // vários números, e deixei o DOWNLOAD usando a do ambiente. A do ambiente era
  // a que tinha sido banida. Todo áudio novo chegava quebrado.
  return chamar<MidiaBaixada>(
    "/chat/getBase64FromMediaMessage",
    {
      message: { key: { id: waId } },
      convertToMp4: false,
    },
    instancia,
  );
}

/**
 * Áudio como MENSAGEM DE VOZ — aquela bolinha com a onda.
 *
 * ── ESTE ENDEREÇO É OUTRO, E ISSO IMPORTA ───────────────────────────────────
 *
 * `sendWhatsAppAudio` é diferente de `sendMedia` com tipo áudio. O primeiro
 * chega como voz, tocável com um toque; o segundo chega como ARQUIVO ANEXADO,
 * que a pessoa precisa baixar e abrir noutro aplicativo — e a maioria não abre.
 *
 * Para um áudio da candidata, a diferença entre os dois é a diferença entre
 * "ela falou comigo" e um anexo ignorado.
 *
 * O arquivo precisa ser OGG/Opus. Há um atalho que evita conversor: áudio
 * gravado no próprio WhatsApp JÁ É OGG/Opus. A Talita grava no WhatsApp dela,
 * encaminha, e o arquivo sobe como está.
 */
export function enviarAudio(
  telefone: string,
  url: string,
  instancia?: string | null,
) {
  return chamar<EnvioOk>(
    "/message/sendWhatsAppAudio",
    {
      number: normalizarTelefone(telefone),
      audio: url,
    },
    instancia,
  );
}

/**
 * EDITAR uma mensagem que já saiu.
 *
 * O WhatsApp aceita por 15 MINUTOS depois do envio, e não há como contornar —
 * nem pelo aplicativo. Passou disso ele recusa.
 *
 * A `key` é a mensagem ORIGINAL: `remoteJid` de quem recebeu, `fromMe` verdadeiro
 * e o `id` que a Evolution devolveu no envio. Sem os três o servidor não sabe o
 * que reescrever, e responde 500 com "cannot read properties".
 *
 * Do lado do eleitor a mensagem passa a mostrar "editada". Isso é do WhatsApp e
 * é bom que seja: correção silenciosa seria pior que a correção.
 */
export function editarMensagem(
  telefone: string,
  waId: string,
  texto: string,
  instancia?: string | null,
) {
  const numero = normalizarTelefone(telefone);
  return chamar<EnvioOk>(
    "/chat/updateMessage",
    {
      number: numero,
      text: texto,
      key: {
        remoteJid: `${numero}@s.whatsapp.net`,
        fromMe: true,
        id: waId,
      },
    },
    instancia,
  );
}

export function enviarImagem(telefone: string, url: string, legenda?: string) {
  return chamar<EnvioOk>("/message/sendMedia", {
    number: normalizarTelefone(telefone),
    mediatype: "image",
    media: url,
    caption: legenda,
  });
}

/**
 * Foto, vídeo ou documento — por ENDEREÇO, nunca por base64.
 *
 * ── POR QUE URL E NÃO O ARQUIVO ────────────────────────────────────────────
 *
 * A Evolution aceita os dois. Mandar base64 daqui obrigaria o arquivo a passar
 * pela função da Vercel, que recusa corpo acima de 4,5 MB — e vídeo de celular
 * começa em 10 MB. Passando o endereço, quem baixa é o servidor da Evolution,
 * direto do balde, e a função só carrega um texto de duzentos caracteres.
 *
 * O endereço é assinado e vence em minutos. A Evolution busca na hora do envio,
 * então a validade curta basta — e o arquivo não fica público em momento algum.
 */
export function enviarMidia(
  telefone: string,
  tipo: "image" | "video" | "document",
  url: string,
  opcoes?: {
    legenda?: string;
    mime?: string;
    nomeArquivo?: string;
    /** Por qual número da campanha sair. Vazio = o do ambiente. */
    instancia?: string | null;
  },
) {
  return chamar<EnvioOk>(
    "/message/sendMedia",
    {
      number: normalizarTelefone(telefone),
      mediatype: tipo,
      media: url,
      caption: opcoes?.legenda || undefined,
      mimetype: opcoes?.mime || undefined,
      // O WhatsApp mostra este nome quando a mídia vira anexo. Sem ele, chega
      // como o identificador aleatório do balde — a pessoa recebe "a3f9c2.jpg".
      fileName: opcoes?.nomeArquivo || undefined,
    },
    opcoes?.instancia,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// O QUE CHEGA NO WEBHOOK
// ─────────────────────────────────────────────────────────────────────────────
//
// A Evolution herda o formato do Baileys, a biblioteca que fala com o WhatsApp:
// a mensagem vem em `data.message`, e o TIPO é a própria chave presente ali
// dentro — `conversation` para texto simples, `audioMessage` para áudio, e
// assim por diante. Não há campo "tipo" para ler: descobre-se olhando qual
// chave existe.
//
//   data.key.remoteJid   quem, com @s.whatsapp.net ou @g.us
//   data.key.fromMe      true quando a própria campanha enviou
//   data.key.id          o id da mensagem — é a chave de idempotência
//   data.messageTimestamp  em SEGUNDOS, não milissegundos

export type PayloadEvolution = {
  event?: string;
  instance?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    pushName?: string;
    status?: string;
    messageTimestamp?: number | string;
    message?: Record<string, unknown> | null;
  };
};

export type MensagemLida = {
  waId: string | null;
  /**
   * Por onde a conversa é endereçada: o telefone quando o WhatsApp manda, o
   * `lid.<id>` quando não manda. Nunca vazio.
   */
  telefone: string;
  /**
   * O identificador anônimo, quando a mensagem veio por um. Guardado MESMO
   * quando o telefone veio junto — é a chave que costura esta conversa com a
   * que já existe aqui sem número.
   */
  lid: string | null;
  /** O `wa_id` da mensagem que esta cita, quando o WhatsApp mandou. */
  respondeWaId?: string | null;
  direcao: "inbound" | "outbound";
  tipo:
    | "texto"
    | "audio"
    | "imagem"
    | "video"
    | "documento"
    | "figurinha"
    | "local"
    | "contato"
    | "outro";
  texto: string | null;
  midiaUrl: string | null;
  /** A miniatura em base64, quando a mensagem traz. Foto e vídeo trazem. */
  previa: string | null;
  midiaMime: string | null;
  duracaoSeg: number | null;
  momento: string;
  status: string | null;
  nome: string | null;
};

type Media = {
  url?: string;
  mimetype?: string;
  seconds?: number;
  caption?: string;
  fileName?: string;
  /**
   * A MINIATURA QUE JÁ VEM DENTRO DA MENSAGEM.
   *
   * É por isso que o WhatsApp parece instantâneo: ele não espera a foto de 4 MB
   * baixar para mostrar alguma coisa. Junto com a mensagem viaja um JPEG
   * minúsculo — uns 10 a 20 KB — que aparece na hora, borrado, e é trocado pela
   * imagem cheia quando ela chega.
   *
   * Vem em base64, no próprio payload. Não custa uma requisição a mais: já
   * estava ali, sendo jogado fora.
   */
  jpegThumbnail?: string;
};

/**
 * A miniatura, se couber.
 *
 * O teto existe porque miniatura é para ser pequena: se vier grande, alguma
 * coisa mudou do outro lado, e guardar 300 KB de base64 por mensagem no banco
 * — a 4000 mensagens por dia — é o tipo de detalhe que ninguém nota até a
 * conta chegar.
 */
function miniatura(m: Media): string | null {
  const t = m.jpegThumbnail;
  if (typeof t !== "string" || t.length < 40 || t.length > 120_000) return null;
  return t;
}

/**
 * Traduz o payload da Evolution para o que o banco guarda.
 *
 * Devolve null quando não é atendimento: grupo, transmissão, evento que não é
 * mensagem. Descartar aqui e não na rota mantém a regra junto do contrato.
 *
 * Tipo desconhecido NÃO é descartado: vira "outro". Uma enquete que o parser
 * não conhece ainda é alguém falando com a campanha, e sumir com ela é pior do
 * que exibi-la sem formato.
 */
export function lerPayload(p: PayloadEvolution): MensagemLida | null {
  if (!p?.data?.key) return null;
  // A Evolution manda dezenas de eventos pelo mesmo endereço (conexão, presença,
  // contatos). Só mensagem interessa.
  if (p.event && !/messages\.(upsert|update)/i.test(p.event)) return null;

  let jid = p.data.key.remoteJid ?? "";
  // ── SÓ CONVERSA DE PESSOA, POR LISTA BRANCA ─────────────────────────────
  //
  // Antes a regra era "descarte grupo e transmissão" — lista negra. E entrou
  // coisa que ninguém previu: o WhatsApp hoje manda `@lid`, um identificador
  // ANÔNIMO usado em canais, comunidades e alguns contatos. O número antes do
  // `@lid` NÃO É TELEFONE: é código interno.
  //
  // O que aconteceu: virou conversa na fila com "telefone" 40923102740589, que
  // não existe. A atendente abriria, tentaria responder, e o envio falharia.
  //
  // Agora vale a mesma lição dos papéis de usuário: lista branca. `@s.whatsapp.net`
  // e `@c.us` são os dois que carregam telefone de verdade. O que o WhatsApp
  // inventar amanhã não entra em silêncio — e, se for legítimo, aparece nos
  // descartados e a gente decide.
  const dominio = jid.split("@")[1] ?? "";

  // O identificador anônimo, guardado mesmo quando o telefone vem junto: é ele
  // que costura esta conversa com a que foi importada sem número.
  let lid: string | null = null;

  if (dominio !== "s.whatsapp.net" && dominio !== "c.us") {
    if (dominio !== "lid") {
      // Grupo, transmissão e o que o WhatsApp inventar amanhã. Lista branca:
      // o desconhecido aparece no log e a gente decide, em vez de entrar calado.
      console.log(`evolution: descartado jid nao-telefone: ${jid}`);
      return null;
    }

    lid = enderecoDeLid(jid);

    // O telefone REAL às vezes viaja junto, noutro campo. Quando vem, é ele que
    // vale — endereço de lid não dá para responder nem cruzar com a base.
    const alt =
      (p.data.key as Record<string, unknown>)?.remoteJidAlt ??
      (p.data.key as Record<string, unknown>)?.senderPn;
    jid = typeof alt === "string" && alt.endsWith("@s.whatsapp.net") ? alt : "";
  }

  const telefone = jid ? telefoneDoJid(jid) : "";
  // Telefone tem entre 10 e 15 dígitos no padrão internacional. Fora disso é
  // código, não gente — e conversa com telefone impossível entope a fila e
  // ninguém consegue responder.
  const temTelefone =
    !!telefone && telefone.length >= 10 && telefone.length <= 15;

  if (!temTelefone && jid) {
    console.log(`evolution: telefone improvavel descartado: ${telefone}`);
    return null;
  }

  // ── SEM TELEFONE, MAS COM IDENTIFICADOR ────────────────────────────────────
  //
  // Antes isto era descartado. Custou 371 leads de tráfego pago da Maiana: a
  // sessão dela caiu, as conversas voltaram pelo history sync — que não manda
  // o telefone — e sumiram sem deixar linha de log que alguém fosse ler.
  //
  // Agora entra endereçada pelo identificador. Conta na métrica, aparece na
  // fila, recebe etiqueta. Quando a pessoa escrever de novo, o telefone chega e
  // `fundir_lid` junta as duas.
  if (!temTelefone && !lid) return null;
  const endereco = temTelefone ? telefone : (lid as string);

  // messageTimestamp vem em SEGUNDOS. Tratado como milissegundos, toda conversa
  // apareceria como se fosse de 1970 e a fila ordenaria ao contrário.
  const ts = Number(p.data.messageTimestamp ?? 0);
  const momento = new Date(ts > 0 ? ts * 1000 : Date.now()).toISOString();

  // ── A CITAÇÃO QUE VEM DE FORA ─────────────────────────────────────────────
  //
  // Quando o eleitor responde a uma mensagem específica, o WhatsApp manda o
  // `stanzaId` da citada dentro do `contextInfo`. Sem ler isso, a resposta dele
  // chega solta e a atendente não sabe a qual das três perguntas ele disse
  // "não" — que é exatamente o problema que a citação existe para resolver.
  //
  // O `contextInfo` fica pendurado em cada TIPO de mensagem (texto, imagem,
  // áudio…), e não num lugar só. Procurar em todos evita ler só o de texto e
  // perder a citação de quem respondeu com um áudio.
  const contexto = (() => {
    const m = (p.data.message ?? {}) as Record<string, unknown>;
    for (const v of Object.values(m)) {
      const ci = (v as { contextInfo?: { stanzaId?: string } } | null)
        ?.contextInfo;
      if (ci?.stanzaId) return ci.stanzaId;
    }
    const raiz = (p.data as { contextInfo?: { stanzaId?: string } }).contextInfo;
    return raiz?.stanzaId ?? null;
  })();

  const base = {
    previa: null as string | null,
    waId: p.data.key.id ?? null,
    telefone: endereco,
    lid,
    direcao: (p.data.key.fromMe ? "outbound" : "inbound") as
      "inbound" | "outbound",
    momento,
    status: p.data.status ?? null,
    // ── `pushName` É O NOME DE QUEM ENVIOU, E ISSO IMPORTA ────────────────
    //
    // Numa mensagem RECEBIDA, é o nome do eleitor — que é o que queremos.
    //
    // Numa mensagem ENVIADA (`fromMe`), é o nome do NOSSO perfil. Ele entrava
    // como nome da conversa e batizava o eleitor de "Talita Oliveira | 1022":
    // basta a primeira mensagem gravada daquela conversa ser nossa — history
    // sync de sessão caída, ou a menina escrevendo primeiro pelo celular — e
    // `receber_mensagem` grava esse nome, que depois nunca é sobrescrito
    // (`coalesce(conversas.nome, excluded.nome)` só preenche vazio).
    //
    // Fica nulo quando é nossa: melhor conversa sem nome, que a atendente
    // preenche, do que conversa com o nome errado, que ninguém desconfia.
    nome: p.data.key.fromMe ? null : (p.data.pushName ?? null),
    respondeWaId: contexto,
  };

  const m = (p.data.message ?? {}) as Record<string, unknown>;
  const pega = (k: string) => m[k] as Media | undefined;

  if (typeof m.conversation === "string" && m.conversation) {
    return {
      ...base,
      tipo: "texto",
      texto: m.conversation,
      midiaUrl: null,
      midiaMime: null,
      duracaoSeg: null,
    };
  }
  const estendida = m.extendedTextMessage as { text?: string } | undefined;
  if (estendida?.text) {
    return {
      ...base,
      tipo: "texto",
      texto: estendida.text,
      midiaUrl: null,
      midiaMime: null,
      duracaoSeg: null,
    };
  }

  const audio = pega("audioMessage");
  if (audio) {
    return {
      ...base,
      tipo: "audio",
      texto: null,
      midiaUrl: audio.url ?? null,
      midiaMime: audio.mimetype ?? null,
      duracaoSeg: audio.seconds ?? null,
    };
  }
  const imagem = pega("imageMessage");
  if (imagem) {
    return {
      ...base,
      tipo: "imagem",
      texto: imagem.caption ?? null,
      previa: miniatura(imagem),
      midiaUrl: imagem.url ?? null,
      midiaMime: imagem.mimetype ?? null,
      duracaoSeg: null,
    };
  }
  const video = pega("videoMessage");
  if (video) {
    return {
      ...base,
      tipo: "video",
      texto: video.caption ?? null,
      previa: miniatura(video),
      midiaUrl: video.url ?? null,
      midiaMime: video.mimetype ?? null,
      duracaoSeg: null,
    };
  }
  const doc = pega("documentMessage");
  if (doc) {
    return {
      ...base,
      tipo: "documento",
      texto: doc.fileName ?? doc.caption ?? null,
      midiaUrl: doc.url ?? null,
      midiaMime: doc.mimetype ?? null,
      duracaoSeg: null,
    };
  }
  const figurinha = pega("stickerMessage");
  if (figurinha) {
    return {
      ...base,
      tipo: "figurinha",
      texto: null,
      midiaUrl: figurinha.url ?? null,
      midiaMime: figurinha.mimetype ?? null,
      duracaoSeg: null,
    };
  }
  const local = m.locationMessage as
    | { degreesLatitude?: number; degreesLongitude?: number; name?: string }
    | undefined;
  if (local) {
    const coord =
      local.degreesLatitude != null
        ? `${local.degreesLatitude}, ${local.degreesLongitude}`
        : null;
    return {
      ...base,
      tipo: "local",
      texto: local.name ?? coord,
      midiaUrl: null,
      midiaMime: null,
      duracaoSeg: null,
    };
  }
  const contato = m.contactMessage as { displayName?: string } | undefined;
  if (contato) {
    return {
      ...base,
      tipo: "contato",
      texto: contato.displayName ?? null,
      midiaUrl: null,
      midiaMime: null,
      duracaoSeg: null,
    };
  }

  // Evento sem conteúdo nenhum (só recibo de leitura, por exemplo) não vira
  // linha: encheria a conversa de mensagem vazia.
  if (!Object.keys(m).length) return null;

  return {
    ...base,
    tipo: "outro",
    texto: null,
    midiaUrl: null,
    midiaMime: null,
    duracaoSeg: null,
  };
}
