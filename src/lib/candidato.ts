// Quem é o candidato desta instalação.
//
// ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
//
// O PIE foi escrito para uma campanha só, então a identidade dela ficou
// espalhada pelo código: o número de WhatsApp em `whatsapp.ts`, o endereço do
// site em sete arquivos diferentes, o 1022 na detecção de apoio, o nome dentro
// do prompt da IA. Cada um desses é um lugar para esquecer.
//
// A coligação vai colocar mais candidatos na plataforma, cada um na sua
// instalação. O que muda entre elas passa a estar aqui.
//
// ── O NÚMERO DE WHATSAPP NÃO TEM PADRÃO, E ISSO É O PONTO ───────────────────
//
// Ele estava assim:
//
//     process.env.NEXT_PUBLIC_WA_NUMERO || "5571992330000"
//
// O número da Talita como valor de reserva. A variável não está no README nem
// configurada na Vercel — ou seja, a instalação de hoje já roda no padrão.
//
// Numa instalação nova que esquecesse a variável, o QR e os links seriam
// gerados, abririam o WhatsApp, e mandariam TODOS os eleitores do outro
// candidato para o telefone da Talita. Nenhum teste reprova: os links são
// válidos, a tela é a mesma, o QR lê. O erro só apareceria no volume de
// mensagens dela, semanas depois.
//
// Por isso ele quebra o build. Falta de configuração tem de doer na hora de
// instalar, não no meio da campanha.

function obrigatoria(nome: string, valor: string | undefined): string {
  const v = valor?.trim();
  if (!v)
    throw new Error(
      `${nome} não está configurada.\n\n` +
        `  Esta variável não tem valor padrão de propósito: sem ela, o PIE\n` +
        `  geraria links e QR que funcionam e mandam o eleitor para o número\n` +
        `  de outro candidato — sem erro em lugar nenhum.\n\n` +
        `  Formato: DDI + DDD + número, só dígitos.\n` +
        `  Ex.: (71) 99233-0000 -> 5571992330000\n`,
    );
  return v;
}

/**
 * Valor com padrão que a instalação pode DESLIGAR, e não só trocar.
 *
 * ── POR QUE NÃO SERVE O `||` ────────────────────────────────────────────────
 *
 * Três campos aqui — o formulário, o Instagram e o Pixel — dizem no comentário
 * que "vazio é um valor válido: outro candidato não herda o da Talita". Estavam
 * escritos assim:
 *
 *     (process.env.NEXT_PUBLIC_INSTAGRAM ?? "").trim() || "https://…talita…"
 *
 * E `||` trata string vazia como falsa. Medido: variável AUSENTE chega como
 * `undefined`, variável posta como VAZIA chega como `""` — e as duas caem no
 * padrão. Ou seja: não havia como desligar. Quem pusesse a variável em branco
 * na Vercel, justamente para dizer "este candidato não tem isso", receberia o
 * valor da Talita de volta, sem erro em lugar nenhum.
 *
 * O que isso faria na instalação do Manassés: os eleitores dele preenchendo a
 * ficha dela, seguindo o Instagram dela, e — depois do Pixel — treinando os
 * anúncios dela com o tráfego pago dele.
 *
 * Aqui a distinção é respeitada: SÓ `undefined` vira padrão. Variável em branco
 * é uma decisão, e decisão em branco é obedecida.
 */
function podeDesligar(valor: string | undefined, padrao: string): string {
  return valor === undefined ? padrao : valor.trim();
}

const NOME = process.env.NEXT_PUBLIC_CANDIDATO_NOME?.trim() || "Talita Oliveira";

export const CANDIDATO = {
  /** Como o candidato assina. Ex.: "Talita Oliveira". */
  nome: NOME,

  /** Só o primeiro nome, que é como o eleitor chama. Ex.: "Talita". */
  primeiroNome:
    process.env.NEXT_PUBLIC_CANDIDATO_PRIMEIRO_NOME?.trim() || NOME.split(" ")[0],

  /** O cargo disputado, como aparece no material. */
  cargo: process.env.NEXT_PUBLIC_CANDIDATO_CARGO?.trim() || "Deputada Federal",

  /** Estado. Todos os candidatos da coligação são da Bahia. */
  uf: process.env.NEXT_PUBLIC_CANDIDATO_UF?.trim() || "BA",

  /**
   * O número de urna.
   *
   * Não é enfeite: `atendimento.ts` procura por ele no texto da conversa para
   * decidir se a pessoa já foi apresentada ao candidato. Com o número errado,
   * a detecção automática de apoio simplesmente não acontece — e a tela não
   * acusa nada, só mostra menos apoio do que houve.
   */
  numeroUrna: process.env.NEXT_PUBLIC_CANDIDATO_URNA?.trim() || "1022",

  /**
   * O número que atende a campanha. Sem padrão — ver a nota no topo.
   *
   * Formato: DDI + DDD + número, só dígitos.
   */
  whatsapp: obrigatoria(
    "NEXT_PUBLIC_WA_NUMERO",
    process.env.NEXT_PUBLIC_WA_NUMERO,
  ).replace(/\D/g, ""),

  /**
   * A pasta da marca em `public/marca/`.
   *
   * As duas instalações rodam do MESMO repositório, então imagem de marca não
   * pode ficar solta em `public/`: trocar a logo de um candidato mudaria a do
   * outro no mesmo commit. Cada um tem a sua pasta, e o candidato diz qual é.
   *
   * Dentro, sempre os mesmos três nomes — `logo-cor.png`, `logo-branca.png` e
   * `capa.jpg`. Nome de arquivo com o nome da pessoa obriga a editar código
   * para trocar a arte; nome genérico faz trocar virar substituir o arquivo.
   */
  marca: process.env.NEXT_PUBLIC_CANDIDATO_MARCA?.trim() || "talita",

  /** O site público, sem barra no fim. É a base dos links de QR. */
  site: (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://www.talitaoliveiraoficial.com"
  ).replace(/\/+$/, ""),

  /**
   * O formulário onde a pessoa pede o material de campanha.
   *
   * Mora aqui, e não colado dentro de cada mensagem pronta, pelo mesmo motivo
   * do número de WhatsApp: no dia em que o formulário mudar de endereço, seria
   * preciso caçar todas as frases que o citam — e a que escapasse continuaria
   * mandando gente para um link morto, sem erro em lugar nenhum.
   *
   * VAZIO É UM VALOR VÁLIDO. A instalação de outro candidato não tem este
   * formulário, e herdar o da Talita mandaria os eleitores dele preencherem a
   * ficha dela. Quando está vazio, o atalho {{formulario}} nem aparece na tela
   * de quem escreve a mensagem.
   */
  formulario: podeDesligar(
    process.env.NEXT_PUBLIC_FORMULARIO_MATERIAL,
    // O `?usp=dialog` que o Google cola no fim é só o registro de como o link
    // foi copiado. Sai daqui: link de campanha vai ser lido no celular, e cada
    // pedaço a mais é uma chance a mais de parecer golpe.
    "https://docs.google.com/forms/d/e/1FAIpQLSfP2RE6g70_tA9kf0NH8tI-zpDMtNBqbLHAIgmhfJyWBulhUw/viewform",
  ),

  /**
   * O Instagram da campanha.
   *
   * Hoje ele estava escrito à mão dentro de UMA mensagem pronta, das sete. As
   * outras seis não convidavam a seguir ninguém — e uma conversa que termina
   * sem "me segue lá" perde a única coisa gratuita que a campanha tem.
   *
   * Aqui, vira atalho `{{instagram}}`: entra em qualquer mensagem, e no dia em
   * que o perfil mudar de nome, muda num lugar só. Escrito à mão, mudar o
   * perfil obrigaria a caçar todas as frases que o citam, e a que escapasse
   * mandaria a pessoa para um perfil que não existe mais.
   *
   * VAZIO É VÁLIDO: instalação de outro candidato não herda o perfil da
   * Talita. Quando está vazio, o atalho não aparece para quem escreve.
   */
  instagram: podeDesligar(
    process.env.NEXT_PUBLIC_INSTAGRAM,
    "https://www.instagram.com/talitaoliveiraoficial/",
  ),

  /**
   * O Pixel da Meta — o ID de 15 ou 16 dígitos do Gerenciador de Eventos.
   *
   * ── NÃO É SEGREDO, E PRECISA NÃO SER ────────────────────────────────────
   *
   * Ele vai no código da página, visível para qualquer visitante: é assim que
   * o pixel funciona. Por isso pode morar aqui e pode ir para variável comum.
   * Guardá-lo como Sensitive na Vercel só o esconderia de quem precisa lê-lo.
   *
   * ── POR QUE TEM PADRÃO, DIFERENTE DO WHATSAPP ───────────────────────────
   *
   * O número de WhatsApp quebra o build porque errá-lo manda o eleitor de um
   * candidato para o telefone de outro — dano de fora para dentro, e calado.
   * Pixel errado suja um relatório. Ruim, mas reversível, e ninguém fica sem
   * atendimento por causa dele.
   *
   * Ainda assim o padrão é DESLIGÁVEL: posto em branco, fica em branco, e a
   * instalação do outro candidato não treina os anúncios da Talita com o
   * tráfego pago dele. Ver `podeDesligar` no topo — era exatamente isso que o
   * `||` impedia.
   */
  pixelMeta: podeDesligar(process.env.NEXT_PUBLIC_META_PIXEL, "2913972855615390"),

  /**
   * O endereço da plataforma (ManuFlow) — por onde a equipe e as lideranças
   * entram.
   *
   * Vai escrito nos recados de acesso de conta nova e de liderança. Errar aqui
   * manda a pessoa para um endereço que não abre, e ela vai achar que a senha
   * está errada.
   *
   * Era o subdomínio `atendimento.…`, que só abre a caixa de entrada: a conta
   * de coordenação ou com abas escolhidas entrava e ficava presa na fila. O
   * endereço principal serve todo mundo, porque quem segura a atendente na
   * caixa é o PAPEL (`src/app/(app)/layout.tsx`), não o domínio.
   */
  app: (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "https://manuflow-app.vercel.app"
  ).replace(/\/+$/, ""),
} as const;

/**
 * As cores da marca desta instalação.
 *
 * O `globals.css` guarda as da Talita como padrão. Aqui elas viram variáveis de
 * ambiente para que a instalação de outro candidato troque a paleta SEM tocar
 * no CSS — que é compartilhado pelas duas e, editado, mudaria as duas.
 *
 * Vazio = fica a cor do CSS. Assim quem não configurar nada continua com a
 * aparência de hoje, e não com uma tela sem cor nenhuma.
 */
export const CORES: Record<string, string | undefined> = {
  "--marca-azul": process.env.NEXT_PUBLIC_COR_PRIMARIA?.trim(),
  "--marca-grafite": process.env.NEXT_PUBLIC_COR_BARRA?.trim(),
  "--marca-limao": process.env.NEXT_PUBLIC_COR_ACENTO?.trim(),
  "--marca-rosa": process.env.NEXT_PUBLIC_COR_ROSA?.trim(),
  "--marca-ambar": process.env.NEXT_PUBLIC_COR_AMBAR?.trim(),
};

/** As cores configuradas, prontas para ir no `style` da página. */
export function estiloDaMarca(): Record<string, string> {
  const fora: Record<string, string> = {};
  for (const [k, v] of Object.entries(CORES)) if (v) fora[k] = v;
  return fora;
}

/** Os três arquivos da marca desta instalação. */
export const MARCA = {
  /** Sobre fundo claro. */
  cor: `/marca/${CANDIDATO.marca}/logo-cor.png`,
  /** Sobre fundo escuro ou colorido. */
  branca: `/marca/${CANDIDATO.marca}/logo-branca.png`,
  /**
   * A foto de capa: fundo do login e imagem da prévia quando o link é
   * compartilhado.
   *
   * Tem variável PRÓPRIA, separada da marca, e não é preciosismo. A instalação
   * do Manassés já tem a arte da dobradinha para a prévia, mas ainda não tem a
   * logo dele. Com uma variável só para os três, ligar a capa certa apagaria a
   * logo da barra lateral — e a plataforma dele abriria sem marca nenhuma.
   *
   * Assim cada peça entra quando existe, em vez de esperar todas.
   */
  capa: `/marca/${process.env.NEXT_PUBLIC_CANDIDATO_CAPA?.trim() || CANDIDATO.marca}/capa.jpg`,
} as const;

/** Mensagem que já chega escrita na conversa, com o crédito de quem indicou. */
export function mensagemDeEntrada(nome?: string | null) {
  return nome
    ? `Oii ${CANDIDATO.primeiroNome}! Vim pela indicação de ${nome}. 💙`
    : `Oii ${CANDIDATO.primeiroNome}, tudo bem? Vim pelo QR code.`;
}
