import { NextResponse, after } from "next/server";
import { importarConversas } from "@/lib/importar-conversas";
import { createClient } from "@supabase/supabase-js";
import {
  lerPayload,
  telefoneDoJid,
  etiquetasDaInstancia as buscarEtiquetas,
  todasAsInstancias,
  type PayloadEvolution,
} from "@/lib/evolution";
import { lerSugestoes } from "@/lib/cadastro-automatico";
import { guardarMidia } from "@/lib/midia";
import { enviarTexto, idDaResposta } from "@/lib/wa";
import { CANDIDATO } from "@/lib/candidato";
import { gerarLinkCode } from "@/lib/link-code";

// Onde a conversa entra no PIE.
//
// A Evolution chama aqui a cada mensagem — recebida OU enviada, inclusive a que
// a atendente mandou do celular na mão. Cada chamada grava a mensagem, mantém a
// conversa em dia e, quando é lead novo sem dono, escolhe quem atende.
//
// ── SEGURANÇA ───────────────────────────────────────────────────────────────
//
// A Evolution não assina o corpo. Não há HMAC como na Meta, então não há como
// provar pelo conteúdo que a chamada veio dela.
//
// O que resta é a própria URL ser o segredo: `EVOLUTION_WEBHOOK_SEGREDO` vai no
// endereço cadastrado no painel dela, e sem ele nada é gravado. Some-se a
// conferência do nome da instância — quem adivinhasse o segredo ainda precisaria
// saber o nome.
//
// Vale registrar por escrito: trocar o segredo exige trocar nos DOIS lugares no
// mesmo minuto, senão a captação para. E para em silêncio, porque a Evolution
// não avisa que o webhook está recusando.
//
// Variáveis na Vercel:
//   EVOLUTION_WEBHOOK_SEGREDO  -> invente um valor longo; vai na URL
//   EVOLUTION_INSTANCIA        -> confere com o nome que chega no payload
//   SUPABASE_SERVICE_ROLE_KEY  -> não há sessão numa chamada de máquina
//   NEXT_PUBLIC_SUPABASE_URL   -> já existe

export const dynamic = "force-dynamic";

// O download da mídia acontece DEPOIS da resposta, mas dentro da mesma
// invocação — e o relógio da função continua correndo. Um áudio de vários
// minutos numa rede ruim precisa de mais que os 10 segundos padrão.
//
// Isto exige o plano Pro: no Hobby o teto é 10 s e este número é ignorado.
//
// E passou de 60 para 300 quando o webhook ganhou a importação automática:
// quando um número volta a conectar, ele traz sozinho o que aconteceu na
// ausência, e isso pode ser seiscentas conversas numa invocação só.
export const maxDuration = 300;

/** O que a atendente vê na lista, sem carregar áudio inteiro na prévia. */
function resumo(m: { tipo: string; texto: string | null }): string {
  if (m.texto) return m.texto.slice(0, 240);
  const rotulos: Record<string, string> = {
    audio: "🎤 Áudio",
    imagem: "📷 Imagem",
    video: "🎬 Vídeo",
    documento: "📎 Documento",
    figurinha: "Figurinha",
    local: "📍 Localização",
    contato: "👤 Contato",
  };
  return rotulos[m.tipo] ?? "Mensagem";
}

export async function POST(req: Request) {
  // CRONÔMETRO. Cada etapa medida, para "está lento" virar "está lento AQUI".
  // Aparece no log da Vercel como uma linha só, legível de relance.
  const t0 = Date.now();
  const marcos: string[] = [];
  const marca = (o: string) => marcos.push(`${o}=${Date.now() - t0}ms`);

  const segredo = process.env.EVOLUTION_WEBHOOK_SEGREDO;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servico = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // 200 mesmo em erro nosso: webhook que devolve erro é desligado do outro lado,
  // e aí perde-se a captação inteira em vez de uma mensagem.
  const ok = (extra: Record<string, unknown> = {}) =>
    NextResponse.json({ ok: true, ...extra });

  if (!segredo || !url || !servico) {
    console.error(
      "evolution: faltam EVOLUTION_WEBHOOK_SEGREDO, NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY",
    );
    return ok();
  }

  if (new URL(req.url).searchParams.get("k") !== segredo) {
    console.error("evolution: chamada sem o segredo na URL, descartada");
    return ok();
  }

  let corpo: PayloadEvolution;
  try {
    corpo = (await req.json()) as PayloadEvolution;
  } catch {
    return ok();
  }

  // ── VÁRIOS NÚMEROS ────────────────────────────────────────────────────────
  //
  // Antes aqui havia uma comparação com EVOLUTION_INSTANCIA: só a instância do
  // ambiente passava, o resto era descartado. Com sete números isso significa
  // que SEIS deles seriam jogados fora — em silêncio, devolvendo 200, sem nada
  // no painel indicando que a captação parou.
  //
  // Agora a conferência é de FORMATO, e o cadastro fica no banco: a função
  // `receber_mensagem` cria a linha do número se ela ainda não existe. Perder
  // lead pago porque alguém esqueceu de cadastrar o número no painel é pior do
  // que ter uma linha a mais para nomear depois.
  //
  // O segredo na URL continua sendo a trava de quem pode chamar — e ele já foi
  // conferido acima.
  const instancia = corpo.instance?.trim();
  if (instancia && !/^[a-zA-Z0-9_-]{1,64}$/.test(instancia)) {
    console.error(`evolution: nome de instância estranho, descartada: ${instancia}`);
    return ok();
  }

  const supabase = createClient(url, servico, {
    auth: { persistSession: false },
  });

  // ── A QUEDA DO NÚMERO ─────────────────────────────────────────────────────
  //
  // Este evento SEMPRE chegou aqui: a instância é criada assinando
  // CONNECTION_UPDATE desde o primeiro dia. O webhook é que recebia e jogava
  // fora.
  //
  // Custou sete horas de cegueira no número da Maiana — 420 pessoas atendidas
  // pelo aparelho, 371 leads pagos entrando sem telefone, e o SLA contando todo
  // mundo como abandonado. O aviso estava na porta o tempo todo.
  if (/connection\.update/i.test(corpo.event ?? "")) {
    const estado =
      (corpo as unknown as { data?: { state?: string; statusReason?: number } })
        .data?.state ?? "";
    const inst = corpo.instance ?? "";
    if (!inst) return ok({ ignorada: true });

    after(async () => {
      // ── EVENTO NÃO É VERDADE, É NOTÍCIA ───────────────────────────────
      //
      // O Baileys emite `connection.update` com `connecting` a cada tentativa
      // interna de reconexão — e ele tenta sozinho, várias vezes por dia, com
      // a sessão perfeitamente de pé. Gravar o evento cru fazia a tela dizer
      // que o número caiu enquanto ele atendia.
      //
      // Pior: a varredura gravava `open` e o evento seguinte gravava
      // `connecting` por cima. As duas fontes brigando, e a menina via o
      // resultado da última a escrever.
      //
      // Então evento RUIM passa a ser CONFIRMADO antes de virar alarme:
      // `fetchInstances` é o estado agregado da instância, e é ele que decide.
      // Evento `open` não precisa de conferência — notícia boa não gera falso
      // alarme, e confirmar custaria uma ida à Evolution a cada mensagem.
      let confirmado = estado;
      if (estado && estado !== "open") {
        const r = await todasAsInstancias();
        if (r.ok) {
          const viva = (r.dados ?? []).find((i) => i.name === inst);
          // Instância que sumiu da lista: o evento é a melhor informação que
          // existe, então ele vale.
          if (viva?.connectionStatus) confirmado = viva.connectionStatus;
        }
        // Evolution muda não responde: fica o evento. Deixar de avisar uma
        // queda de verdade é pior que um alarme a mais.
      }

      const { data } = await supabase.rpc("marcar_conexao", {
        p_instancia: inst,
        p_estado: confirmado,
      });
      const r = data as { mudou?: boolean; de?: string; para?: string } | null;
      // Só o que MUDA vira log. A Evolution repete 'close' durante a tentativa
      // de reconexão, e registrar cada repetição afogaria o log justamente no
      // momento em que alguém vai lê-lo.
      if (!r?.mudou) return;
      console.log(`conexao ${inst}: ${r.de} -> ${r.para}`);

      // ── VOLTOU: TRAZ O QUE ACONTECEU NA AUSÊNCIA ────────────────────────
      //
      // O que a equipe atendeu com a sessão fora não gerou webhook. Volta pelo
      // history sync, que a Evolution guarda e o PIE nunca lia — e era preciso
      // alguém lembrar de clicar em "Importar", uma vez por número, depois de
      // cada queda.
      //
      // Com sete números isso não se sustenta. Esquecer um clique é perder os
      // leads pagos daquela janela, e ninguém descobre: a fila daquele número
      // só parece vazia.
      //
      // Reimportar é seguro. A conversa tem chave única por (telefone, número)
      // e a mensagem por `wa_id` — o que já entrou não entra de novo.
      if (r.para !== "open" || r.de === "open") return;

      // ── DESLIGADO ENQUANTO É SUSPEITO ───────────────────────────────────
      //
      // A Lutiane foi o primeiro número a conectar com esta importação
      // automática ligada, e levou 401 em minutos. Os outros três duraram
      // horas antes de cair.
      //
      // A importação faz consultas de perfil contra o WhatsApp, oito em
      // paralelo, segundos depois de a sessão abrir. Numa sessão recém-nascida
      // isso é rajada automatizada — plausível como gatilho da revogação do
      // vínculo. Não está provado, e pode ser coincidência.
      //
      // Mas há quatro números para parear hoje e tráfego pago rodando. A ordem
      // certa é isolar a variável que EU introduzi hoje antes de pagar para
      // descobrir. O botão "Importar" continua na tela e faz a mesma coisa,
      // quando alguém decide.
      //
      // Para religar: apagar este `return` e o comentário. Só depois de um
      // número sobreviver a algumas horas sem isto.
      if (process.env.IMPORTAR_AO_CONECTAR !== "sim") {
        console.log(`importar automatico ${inst}: desligado (suspeito de 401)`);
        return;
      }

      const imp = await importarConversas(inst, 2);
      if (!imp.ok) {
        console.log(`importar automatico ${inst}: ${imp.erro}`);
        return;
      }
      console.log(`importar automatico ${inst}: ${imp.achadas} achadas`);
      if (imp.gravar) await imp.gravar();
    });

    return ok({ conexao: estado });
  }

  // ── A ETIQUETA MARCADA NO PRÓPRIO WHATSAPP ────────────────────────────────
  //
  // A sessão cai, o WhatsApp bloqueia a reconexão, e a operação não pode
  // parar: a equipe atende direto no aplicativo e marca com as etiquetas dele.
  // Sem isto, esse trabalho fica preso no celular — o PIE não sabe quem é
  // apoiador e a métrica não conta.
  //
  // A Evolution avisa a cada marcação. Aqui a gente encontra a conversa e
  // aplica a etiqueta equivalente: "Apoiadores" do WhatsApp vira "Apoiador" do
  // PIE, pela comparação frouxa em `tag_do_whatsapp`.
  //
  // O EVENTO SÓ TRAZ O ID DA ETIQUETA, não o nome. Por isso a lista é buscada
  // na hora — é uma chamada pequena, e marcar etiqueta é raro perto do volume
  // de mensagens.
  if (/labels\.association/i.test(corpo.event ?? "")) {
    const d = corpo as unknown as {
      data?: {
        association?: { chatId?: string; labelId?: string };
        type?: string;
      };
    };
    const chatId = d.data?.association?.chatId ?? "";
    const labelId = d.data?.association?.labelId ?? "";
    const removeu = (d.data?.type ?? "").toLowerCase() === "remove";
    const inst = corpo.instance ?? null;

    if (!chatId || !labelId) return ok({ ignorada: true });

    after(async () => {
      const r = await buscarEtiquetas(inst);
      const lista = r.ok ? (r.dados ?? []) : [];
      const nome = lista.find((l) => String(l.id) === String(labelId))?.name;
      if (!nome) {
        // O id da etiqueta é INTERNO DE CADA APARELHO — o mesmo "Apoiador" é 4
        // num chip e 7 noutro. Sem o nome não há o que guardar nem o que casar,
        // e este é o único caso em que a marcação se perde de verdade.
        console.log(`etiqueta: id ${labelId} sem nome na instância ${inst}`);
        return;
      }
      const { data } = await supabase.rpc("etiqueta_do_whatsapp", {
        p_telefone: telefoneDoJid(chatId),
        p_instancia: inst,
        p_label: nome,
        p_remover: removeu,
      });
      // `etiqueta_do_whatsapp` não descarta mais quando a conversa ainda não
      // existe: ela GUARDA, e o gatilho aplica quando a conversa nascer. É o
      // que faz a classificação sobreviver a uma queda de chip — na volta as
      // etiquetas e as conversas chegam juntas, sem ordem garantida.
      console.log(
        `etiqueta "${nome}" ${removeu ? "tirada de" : "posta em"} ${chatId}: ${JSON.stringify(data)}`,
      );
    });

    return ok({ etiqueta: true });
  }

  const msg = lerPayload(corpo);
  if (!msg) return ok({ ignorada: true });

  // ── COSTURAR ANTES DE INGERIR ─────────────────────────────────────────────
  //
  // Esta pessoa pode já ter uma conversa aqui endereçada pelo identificador —
  // importada de uma reconexão, quando o WhatsApp não manda telefone. Agora ele
  // veio junto.
  //
  // A ordem importa: costurando ANTES, `receber_mensagem` acha a conversa
  // antiga pelo telefone e continua nela. Costurando depois, ela já teria criado
  // uma segunda, e a mesma pessoa contaria duas vezes na métrica.
  if (msg.lid && !msg.telefone.startsWith("lid.")) {
    const { data } = await supabase.rpc("fundir_lid", {
      p_lid: msg.lid,
      p_telefone: msg.telefone,
      p_instancia: corpo.instance ?? null,
    });
    const r = data as { nada?: boolean } | null;
    if (r && !r.nada) console.log(`fundir_lid: ${JSON.stringify(r)}`);
  }

  try {
    // ── UMA IDA AO BANCO ────────────────────────────────────────────────────
    //
    // Antes eram de 6 a 10 por mensagem: achava a conversa, gravava, relia,
    // consultava a carga, consultava a última atribuição, atualizava, registrava
    // e o cadastro fazia mais duas. A 30 mil chamadas de webhook por dia, isso é
    // ~240 mil consultas diárias só para ingerir — e cada uma paga a latência
    // entre a Vercel e o banco.
    //
    // A função faz tudo numa transação: acha ou cria, grava, atualiza o SLA e
    // devolve se precisa distribuir. As sugestões de cadastro viajam junto
    // porque são lidas do texto, sem consulta.
    const sug =
      msg.direcao === "inbound" && msg.texto
        ? lerSugestoes(msg.texto)
        : { municipio: null, bairro: null, indicou: null };

    marca("leu");

    const { data: r, error } = await supabase.rpc("receber_mensagem", {
      p_telefone: msg.telefone,
      p_nome: msg.nome,
      p_instancia: corpo.instance ?? null,
      p_wa_id: msg.waId,
      p_direcao: msg.direcao,
      p_tipo: msg.tipo,
      p_texto: msg.texto,
      p_resumo: resumo(msg),
      p_midia_url: msg.midiaUrl,
      p_midia_mime: msg.midiaMime,
      p_duracao: msg.duracaoSeg,
      p_status: msg.status,
      p_momento: msg.momento,
      p_bruto: corpo as unknown as Record<string, unknown>,
      p_municipio_sug: sug.municipio,
      p_bairro_sug: sug.bairro,
      p_indicou: sug.indicou,
    });

    marca("gravou");

    // ── A CITAÇÃO DA MENSAGEM RECEBIDA ────────────────────────────────────
    //
    // Fica FORA de `receber_mensagem` de propósito: aquela função está definida
    // em quatro arquivos do repositório, e mexer no corpo dela obrigaria a
    // acertar as quatro — a que ficasse para trás traria o defeito de volta no
    // dia em que alguém rodasse o script antigo.
    //
    // Um update depois da ingestão custa uma ida a mais só quando existe
    // citação, que é a minoria das mensagens.
    if (msg.respondeWaId && msg.waId) {
      after(async () => {
        await supabase
          .from("mensagens")
          .update({ responde_wa_id: msg.respondeWaId })
          .eq("wa_id", msg.waId);
      });
    }

    if (error) {
      console.error("evolution: falha na ingestão:", error.message);
      return ok();
    }

    const res = r as {
      conversa_id: number;
      repetida: boolean;
      atribuir: boolean;
      demandas?: string[];
    } | null;
    if (!res) return ok();

    // Reenvio da Evolution. Já está tudo gravado — seguir em frente contaria a
    // mesma mensagem duas vezes.
    if (res.repetida) return ok({ conversa: res.conversa_id, repetida: true });

    // ── A MINIATURA, ANTES DE TUDO ──────────────────────────────────────────
    //
    // Ela já veio dentro do payload, de graça. Gravar agora é o que faz a foto
    // APARECER NA HORA, borrada, em vez de um retângulo cinza esperando 4 MB
    // atravessarem a rede duas vezes — do WhatsApp para a Evolution, da
    // Evolution para o nosso armazenamento.
    //
    // É o mesmo truque que faz o WhatsApp parecer instantâneo.
    if (msg.previa) {
      await supabase
        .from("mensagens")
        .update({ midia_previa: msg.previa })
        .eq("wa_id", msg.waId);
      marca("previa");
    }

    // ── A MÍDIA, DEPOIS DA RESPOSTA ─────────────────────────────────────────
    //
    // `after` roda o trecho DEPOIS que a resposta já saiu. A Evolution recebe o
    // "ok" na mesma velocidade de uma mensagem de texto e vai cuidar da
    // próxima; o download acontece em seguida, sem ninguém esperando.
    //
    // POR QUE ISSO IMPORTA A 4000 POR DIA. Antes, a Evolution ficava com a
    // conexão aberta durante os três passos — decifrar, receber o base64,
    // subir para o armazenamento. Um áudio de um minuto segurava o webhook por
    // segundos, e ela entrega em fila: um áudio lento atrasava as mensagens de
    // texto que vinham atrás. Com volume, isso vira represa.
    //
    // A MENSAGEM JÁ ESTÁ GRAVADA quando chegamos aqui. Ela aparece na tela na
    // hora, com a bolha dizendo "ainda baixando"; quando o arquivo chega, o
    // Realtime troca pela bolha com o player. Se o download falhar, a bolha
    // passa a dizer o motivo — em vez de um vazio que parece defeito da tela.
    //
    // Ainda é a MESMA invocação da função: `after` não é fila nem serviço
    // separado, é o mesmo processo terminando o trabalho depois de responder.
    // O limite de duração da rota continua valendo.
    if (
      msg.direcao === "inbound" &&
      ["audio", "imagem", "documento", "video"].includes(msg.tipo)
    ) {
      const waId = msg.waId;
      const conversaId = res.conversa_id;
      const tipo = msg.tipo;
      // A INSTÂNCIA QUE RECEBEU é onde o arquivo está. Sem passar isto, o
      // download vai à instância do ambiente — que com vários números quase
      // nunca é a certa, e devolve "Message not found".
      const deQuem = corpo.instance ?? null;
      after(async () => {
        const tm = Date.now();
        const g = await guardarMidia(waId, conversaId, tipo, deQuem);
        const baixou = Date.now() - tm;
        await supabase
          .from("mensagens")
          .update({ midia_arquivo: g.arquivo, midia_erro: g.erro })
          .eq("wa_id", waId);
        console.log(
          `midia ${tipo} ${g.arquivo ? "ok" : "FALHOU"} baixou=${baixou}ms guardou=${Date.now() - tm}ms bytes=${g.bytes}${g.erro ? ` erro=${g.erro}` : ""}`,
        );
      });
    }

    // ── O ROTEIRO QUE RESPONDE SOZINHO ──────────────────────────────────────
    //
    // Roda DEPOIS da resposta, pelo mesmo motivo da mídia: a Evolution entrega
    // em fila, e segurar a conexão dela enquanto se decide e se envia uma
    // resposta atrasaria as mensagens que vêm atrás.
    //
    // Quem decide é o banco. `fluxo_responder` confere as seis travas, avança o
    // contador e devolve o texto — ou nada. Decidir e avançar na mesma
    // transação é o que impede duas mensagens simultâneas de virarem duas
    // respostas.
    //
    // SÓ MENSAGEM RECEBIDA. Não existe caminho por onde o robô inicie conversa
    // — o que também é o que a lei eleitoral exige.
    if (msg.direcao === "inbound") {
      const conversaId = res.conversa_id;
      const texto = msg.texto;
      const telefone = msg.telefone;
      const instancia = corpo.instance ?? null;

      after(async () => {
        const { data, error } = await supabase.rpc("fluxo_responder", {
          p_conversa: conversaId,
          p_texto: texto,
        });

        if (error) {
          console.error("fluxo: falhou ao decidir:", error.message);
          return;
        }

        const r = data as {
          enviar?: boolean;
          mensagens?: string[];
          link_code?: string | null;
          lideranca_id?: string | null;
          acoes?: string[];
          passo?: number;
          motivo?: string;
        } | null;

        if (!r?.enviar || !r.mensagens?.length) {
          // O motivo vai para o log porque "por que o robô não respondeu?" é a
          // primeira pergunta de quem testa — e sem isto a resposta seria
          // adivinhação. As ações também: passo pode marcar etiqueta e criar a
          // liderança sem falar nada, e isso precisa aparecer em algum lugar.
          console.log(
            `fluxo: calado (${r?.motivo ?? "sem motivo"})` +
              (r?.acoes?.length ? ` acoes=[${r.acoes.join(", ")}]` : ""),
          );
          return;
        }

        // ── O LINK PESSOAL DE QUEM DECLAROU APOIO ─────────────────────────
        //
        // O banco cria a liderança e devolve o id; o CÓDIGO é gerado aqui. São
        // dois motivos, e os dois já custaram caro nesta base:
        //
        //   o gerador é um só — `gerarLinkCode`, alfabeto sem vogal e sem
        //   0/1/l/o, porque o código é ditado por telefone. A versão que existe
        //   no banco usa 6 caracteres de md5, que colide;
        //
        //   o domínio mora em `candidato.ts`. Banco que soubesse o endereço
        //   mandaria o eleitor do outro candidato para o site da Talita — e isso
        //   não falharia em teste nenhum.
        let code = r.link_code ?? null;
        const precisaDeLink = r.mensagens.some((m) => m.includes("{{link}}"));

        if (precisaDeLink && !code && r.lideranca_id) {
          code = gerarLinkCode();
          const { error: e } = await supabase
            .from("liderancas")
            .update({ link_code: code })
            .eq("id", r.lideranca_id)
            .is("link_code", null);
          if (e) {
            console.error(`fluxo: nao gravou o link_code: ${e.message}`);
            code = null;
          }
        }

        // Sem código, a mensagem com {{link}} não sai: mandar "manda este link
        // para quem você conhece: " sem link nenhum é pior que não mandar nada.
        const prontas = r.mensagens
          .map((m) => (code ? m.replaceAll("{{link}}", `${CANDIDATO.site}/c/${code}`) : m))
          .filter((m) => {
            if (m.includes("{{link}}")) {
              console.error("fluxo: mensagem com {{link}} sem codigo — nao enviada");
              return false;
            }
            return true;
          });

        // ── UMA DE CADA VEZ, EM ORDEM ─────────────────────────────────────
        //
        // Em sequência e não em paralelo: o WhatsApp entrega na ordem em que
        // recebe, e disparar juntas faz o link chegar antes do "obrigado". A
        // pausa curta é o que separa duas mensagens de atendimento de um disparo
        // em rajada — que é o que derruba chip.
        const agora = new Date().toISOString();
        let ultima = "";

        for (const [i, texto] of prontas.entries()) {
          if (i > 0) await new Promise((ok) => setTimeout(ok, 1200));

          const envio = await enviarTexto(telefone, texto, instancia);
          if (!envio.ok) {
            console.error(`fluxo: envio falhou: ${envio.erro}`);
            break;
          }

          // Gravada com `enviada_por` NULO — é o que a marca como do robô, e é o
          // que o gatilho lê para saber que não foi gente falando. Gravar com um
          // id de pessoa aqui faria o robô se calar sozinho no primeiro passo.
          await supabase.from("mensagens").upsert(
            {
              conversa_id: conversaId,
              wa_id: idDaResposta(envio.dados),
              telefone,
              direcao: "outbound",
              tipo: "texto",
              texto,
              enviada_por: null,
              status: "SENT",
              momento: new Date().toISOString(),
            },
            { onConflict: "wa_id", ignoreDuplicates: true },
          );
          ultima = texto;
        }

        if (ultima) {
          await supabase
            .from("conversas")
            .update({
              ultima_msg: ultima.slice(0, 240),
              ultima_msg_at: agora,
              ultima_direcao: "outbound",
              atualizado_em: agora,
            })
            .eq("id", conversaId);
        }

        console.log(
          `fluxo: passo ${r.passo} respondeu ${prontas.length} msg` +
            (r.acoes?.length ? ` acoes=[${r.acoes.join(", ")}]` : ""),
        );
      });
    }

    // ── SEM DISTRIBUIÇÃO AUTOMÁTICA ─────────────────────────────────────────
    //
    // A conversa entra SEM DONO e fica em "Aguardando" até alguém puxar.
    //
    // Antes o sistema escolhia uma atendente disponível pela proporção da
    // carga. Funcionava, e exigia que a chave de plantão estivesse sempre em
    // dia — chave esquecida ligada manda lead para quem saiu, chave esquecida
    // desligada faz o sistema não achar ninguém. Era um estado a mais para
    // manter, num lugar onde ninguém ia lembrar de manter.
    //
    // Quem puxa é quem vai atender. Não há estado a sincronizar.
    //
    // O setor vem do gatilho `conversa_cai_no_padrao`, no banco: toda conversa
    // nova cai no setor marcado como padrão.

    marca("respondeu");
    console.log(`webhook ${msg.tipo} ${msg.direcao} ${marcos.join(" ")}`);
    return ok({ conversa: res.conversa_id, aguardando: true });
  } catch (e) {
    console.error("evolution:", e);
    return ok();
  }
}

/** Para testar do navegador que o endereço está no ar e o segredo confere. */
export async function GET(req: Request) {
  const segredo = process.env.EVOLUTION_WEBHOOK_SEGREDO;
  if (!segredo || new URL(req.url).searchParams.get("k") !== segredo) {
    return new Response("forbidden", { status: 403 });
  }
  return NextResponse.json({
    ok: true,
    pronto: true,
    instancia: process.env.EVOLUTION_INSTANCIA ?? null,
  });
}
