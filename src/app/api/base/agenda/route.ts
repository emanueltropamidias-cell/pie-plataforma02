import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  configurada,
  todasAsInstancias,
  criarInstancia,
  pedirQR,
  estadoDaConexao,
  contatosDaInstancia,
  conversasDaInstancia,
  desconectar,
  apagarInstancia,
} from "@/lib/evolution";
import {
  normalizarContato,
  nomeDeInstancia,
  ehInstanciaDeAgenda,
  DDD_BA,
} from "@/lib/agenda-wa";

// Puxar a agenda de um aparelho convidado, e transformá-la numa base.
//
// ── POR QUE EXISTE O PASSO DO QR, QUE NINGUÉM QUERIA ────────────────────────
//
// O pedido era "digito o telefone, clico em importar, e a agenda vem". Isso
// não existe: o WhatsApp entrega a lista de contatos SÓ para um aparelho
// conectado, e SÓ no momento em que ele conecta.
//
// Isso foi medido, não deduzido. Em 26/09 o Emanuel importou contatos em
// todos os 19 aparelhos e nada chegou ao servidor: a criação de contatos
// seguiu na mesma curva de sempre, 400 por hora, sem nenhum pico. Os 32 mil
// que já estavam lá vieram do pareamento de cada chip, meses antes.
//
// Então o dono do telefone precisa ler um QR. É o preço, e não há desvio.
//
// ── E POR QUE A SESSÃO É APAGADA NO FIM ─────────────────────────────────────
//
// Quem lê o QR está conectando o WhatsApp DELE a um servidor nosso. Isso é
// aceitável para ler a agenda uma vez; não é para ficar de pé indefinidamente.
// A sessão é derrubada e a instância apagada assim que a importação termina.
//
// O prefixo `agenda_` é a trava: nenhuma ação daqui toca em instância que não
// comece com ele. Sem isso, um nome digitado errado poderia derrubar o chip de
// uma atendente no meio do plantão.

export const dynamic = "force-dynamic";

async function coordenacao() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.rpc("perfil_admin");
  return data === true ? supabase : null;
}

function enderecoDoWebhook(req: Request) {
  // A instância de agenda NÃO recebe mensagem para a caixa — ela existe por
  // minutos e só para ler contato. Mas a Evolution exige um endereço, e deixar
  // em branco faria ela cair no padrão do servidor, que é o webhook da
  // campanha: mensagem de um terceiro entrando na fila das atendentes.
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(req.url).origin;
  return `${base.replace(/\/$/, "")}/api/whatsapp/descartar`;
}

function normalizarQR(cru: string | undefined) {
  if (!cru) return null;
  return cru.startsWith("data:") ? cru : `data:image/png;base64,${cru}`;
}

// ── DE ONDE SAI UM TELEFONE, E POR QUE SAO DUAS FONTES ──────────────────────
//
// 28/09: o Emanuel puxou a agenda do Walter. O telefone dele tem 2.273
// contatos, a Evolution entregou 2.071, e NENHUM virou base. Medido na
// resposta crua:
//
//   27299030286568@lid    WellingtonJr
//   180131045884010@lid   Nery*
//
// Todos os 2.000 vieram como `@lid` — o identificador interno do WhatsApp — e
// o telefone não está em campo nenhum da resposta. É a migração do WhatsApp
// para endereçamento por LID, que já pegou a conta dele e ainda não pegou a do
// Pedro (cuja agenda veio com 704 telefones de verdade, dias antes).
//
// Não é defeito nosso e não tem conserto pelo lado de cá: quem não manda o
// número não manda o número.
//
// MAS a mesma instância guarda 774 conversas, e 314 delas TÊM telefone real —
// gente com quem ele já trocou mensagem antes da migração. 314 é muito menos
// que 2.071, e é infinitamente mais que zero.
//
// Então a extração tenta as duas fontes e fica com a que der mais gente.
type Pessoa = { nome: string; telefone: string };

function extrair(itens: { remoteJid?: string; pushName?: string | null }[]) {
  const vistos = new Set<string>();
  const pessoas: Pessoa[] = [];
  const recusas: Record<string, number> = {};
  let lid = 0;

  for (const it of itens) {
    const jid = it.remoteJid ?? "";
    if (!jid || jid.includes("@g.us")) continue;
    // `@lid` ganha contagem própria: é o motivo de recusa que explica uma
    // agenda inteira sumindo, e misturá-lo com "não é do Brasil" esconderia
    // justamente o que a pessoa precisa saber.
    if (jid.includes("@lid")) { lid++; continue; }
    const r = normalizarContato(jid);
    if (!r.fone) {
      const motivo = r.erro ?? "motivo desconhecido";
      recusas[motivo] = (recusas[motivo] ?? 0) + 1;
      continue;
    }
    if (vistos.has(r.fone)) continue;
    vistos.add(r.fone);
    pessoas.push({ nome: (it.pushName ?? "").trim(), telefone: r.fone });
  }
  return { pessoas, recusas, lid };
}

/** A melhor colheita possível desta instância: agenda, e conversas se a
 *  agenda vier só com LID. */
async function colher(inst: string) {
  const c = await contatosDaInstancia(inst);
  const daAgenda = c.ok ? extrair(c.dados ?? []) : { pessoas: [], recusas: {}, lid: 0 };

  // Só vai às conversas quando a agenda não rendeu — elas custam uma resposta
  // grande (a instância da Boneca devolve ~8 MB) e não há motivo para pagar
  // isso quando a agenda já veio boa.
  if (daAgenda.pessoas.length > 0) return { ...daAgenda, fonte: "agenda" as const };

  const ch = await conversasDaInstancia(inst);
  const dasConversas = ch.ok ? extrair(ch.dados ?? []) : { pessoas: [], recusas: {}, lid: 0 };
  return dasConversas.pessoas.length > 0
    ? { ...dasConversas, fonte: "conversas" as const, lid: daAgenda.lid }
    : { ...daAgenda, fonte: "agenda" as const };
}

export async function POST(req: Request) {
  const supabase = await coordenacao();
  if (!supabase)
    return NextResponse.json({ erro: "Só a coordenação." }, { status: 403 });
  if (!configurada())
    return NextResponse.json({ erro: "Evolution não configurada." }, { status: 400 });

  let corpo: {
    acao?: string;
    instancia?: string;
    nome?: string;
    contatos?: { nome?: string; telefone?: string }[];
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
  }

  const acao = corpo.acao ?? "";
  const inst = (corpo.instancia ?? "").trim();

  // A trava, antes de qualquer coisa: só instância de agenda.
  if (inst && !ehInstanciaDeAgenda(inst))
    return NextResponse.json({ erro: "Essa não é uma sessão de agenda." }, { status: 400 });

  // As ações de QR (comecar, estado, qr, importar) saíram em 29/09 junto com o
  // botão: o WhatsApp deixou de entregar o telefone dos contatos, e um caminho
  // que às vezes traz zero é pior que caminho nenhum. Sobraram `arquivo`, que
  // é o que funciona, e `listar`/`encerrar`, que existem para desfazer sessão
  // que ficou aberta antes da remoção.

  // ── arquivo: a agenda exportada do proprio celular (.vcf) ────────────────
  //
  // 29/09, Emanuel: "a propria agenda do celular da essa opcao de exportar
  // todos os contatos, ela envia em um documento vcf. Eu quero subir o
  // documento, colocar o nome, e voce limpa ele."
  //
  // E o caminho melhor que o QR, e nao so uma alternativa:
  //
  //   · traz TODOS os contatos, inclusive quem nao tem WhatsApp
  //   · nao pareia aparelho nenhum, entao nao ha risco de banimento
  //   · e imune ao LID -- o telefone esta no proprio celular, nao no WhatsApp.
  //     Na agenda do Walter, 2.000 de 2.010 contatos vieram sem numero pelo QR
  //
  // O navegador ja leu o arquivo e mandou nome + telefone. A limpeza acontece
  // AQUI, e nao la: confiar no que o navegador manda e confiar em quem pode
  // editar o pedido.
  if (acao === "arquivo") {
    const nome = (corpo.nome ?? "").trim();
    if (nome.length < 2)
      return NextResponse.json({ erro: "Dê um nome à base." }, { status: 400 });

    const entrada = Array.isArray(corpo.contatos) ? corpo.contatos : [];
    if (entrada.length === 0)
      return NextResponse.json({ erro: "Não achei contato nenhum no arquivo." }, { status: 400 });

    // ── 1. LIMPAR ─────────────────────────────────────────────────────────
    //
    // A mesma regra de telefone do resto da plataforma: sem ela, a agenda
    // entra com fixo, número estrangeiro e o mesmo celular escrito de dois
    // jeitos. Toda recusa é contada — descarte sem motivo vira número que
    // some da conta sem ninguém saber por quê.
    const vistos = new Set<string>();
    const recusas: Record<string, number> = {};
    let repetidos = 0;
    const limpos: { nome: string; telefone: string; bahia: boolean }[] = [];

    for (const c of entrada) {
      const cru = String(c.telefone ?? "").replace(/\D/g, "");
      const r = normalizarContato(cru.startsWith("55") ? cru : "55" + cru);
      if (!r.fone) {
        const motivo = r.erro ?? "motivo desconhecido";
        recusas[motivo] = (recusas[motivo] ?? 0) + 1;
        continue;
      }
      if (vistos.has(r.fone)) { repetidos++; continue; }
      vistos.add(r.fone);
      limpos.push({
        nome: String(c.nome ?? "").trim().slice(0, 80),
        telefone: r.fone,
        bahia: DDD_BA.has(r.fone.slice(0, 2)),
      });
    }
    if (limpos.length === 0)
      return NextResponse.json(
        { erro: "Nenhum número de celular válido nesse arquivo." },
        { status: 400 },
      );

    // ── 2. O QUE JÁ EXISTE EM OUTRO LUGAR ─────────────────────────────────
    //
    // "Essas bases não podem duplicar." O contato repetido NÃO é recusado — a
    // agenda do Walter é a agenda do Walter, e tirar dela quem também está na
    // do Pedro a tornaria uma lista que não corresponde a celular nenhum.
    //
    // O que não pode é o TOTAL contar a mesma pessoa duas vezes, e isso já
    // está resolvido: a somatória de Outras bases conta por pessoa distinta
    // (bases_venn, 0042), não somando gaveta com gaveta.
    //
    // Então aqui a repetição é MEDIDA e mostrada, para ele saber quanto a
    // agenda nova acrescenta de gente de verdade.
    const fones = limpos.map((l) => l.telefone);
    const { data: cruz } = await supabase.rpc("base_externa_cruzar", { p_telefones: fones });
    const jaNaCampanha: string[] = cruz?.campanha ?? [];
    const jaEmOutraBase: string[] = cruz?.bases ?? [];
    const conhecidos = new Set([...jaNaCampanha, ...jaEmOutraBase]);
    const novos = limpos.filter((l) => !conhecidos.has(l.telefone)).length;

    // ── 3. A BAHIA É CONTADA, NÃO SEPARADA ────────────────────────────────
    //
    // A primeira versão criava duas gavetas. O Emanuel corrigiu em 29/09:
    // "esses contatos de outros estados você não vai separar eles da base,
    // você vai deixar eles junto, mas vai deixar a descrição".
    //
    // Ele está certo, e o motivo aparece quando se pensa em vinte agendas:
    // quarenta gavetas, metade delas com trinta pessoas. A agenda de alguém é
    // UMA coisa — quebrá-la em duas é inventar uma divisão que não existe no
    // celular de ninguém.
    //
    // A separação vira escolha na HORA DE BAIXAR, que é onde ela importa:
    // base completa, ou só os da Bahia. Ver `base_externa_exportar` (0046).
    const daBahia = limpos.filter((l) => l.bahia).length;
    const deFora = limpos.length - daBahia;

    // O estreitamento de `supabase` se perde dentro da função aninhada; o
    // const carrega a garantia para dentro dela.
    const db = supabase;
    async function gravar(nomeBase: string, pessoas: typeof limpos) {
      const { data: id, error } = await db.rpc("base_externa_criar", {
        p_nome: nomeBase,
        p_categoria: "outra",
        // A descrição carrega a contagem: é o que aparece no cartão e o que
        // responde "quanto dessa agenda é daqui" sem abrir a base.
        p_descricao:
          `Agenda exportada do celular (.vcf). ${daBahia.toLocaleString("pt-BR")} com DDD da Bahia` +
          (deFora > 0 ? `, ${deFora.toLocaleString("pt-BR")} de fora` : "") +
          ". NÃO é lista de apoiadores.",
        p_arquivo: "celular:vcf",
        // `entrada.length`, e NÃO `pessoas.length`. Esta coluna vira "veio no
        // arquivo" na tela, e gravar a contagem DEPOIS da limpeza fazia os dois
        // quadros mostrarem o mesmo número — escondendo justamente o que a
        // limpeza tirou. O Walter apareceu com 1.797 num arquivo de 2.272.
        p_linhas: entrada.length,
      });
      if (error) throw new Error(error.message);
      for (let i = 0; i < pessoas.length; i += 1000) {
        const { error: e } = await db.rpc("base_externa_adicionar", {
          p_base: id,
          p_linhas: pessoas.slice(i, i + 1000).map((p, k) => ({
            linha: i + k + 1,
            nome: p.nome,
            telefone: p.telefone,
            extras: { origem: "agenda exportada do celular", aparelho: nome },
          })),
        });
        if (e) throw new Error(e.message);
      }
      await db.rpc("base_externa_concluir", { p_base: id });
      return id as string;
    }

    try {
      await gravar(nome, limpos);
    } catch (e) {
      return NextResponse.json(
        { erro: e instanceof Error ? e.message : "Não consegui gravar." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      lidos: entrada.length,
      validos: limpos.length,
      repetidos,
      recusas,
      bahia: daBahia,
      fora: deFora,
      novos,
      jaNaCampanha: jaNaCampanha.length,
      jaEmOutraBase: jaEmOutraBase.length,
    });
  }

  // ── listar: que aparelhos convidados ficaram conectados ──────────────────
  //
  // Existe porque a limpeza automática pode falhar: a importação grava a base
  // e só DEPOIS derruba a sessão. Se o servidor não responder nesse instante,
  // a base fica pronta e o WhatsApp de um terceiro continua conectado ao nosso
  // servidor — e ninguém descobre, porque a tela dizia "feito".
  //
  // Só instâncias com o prefixo `agenda_`. Os chips da campanha não aparecem
  // aqui, e não podem: esta tela tem um botão que desconecta.
  if (acao === "listar") {
    const r = await todasAsInstancias();
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 502 });
    const sessoes = (r.dados ?? [])
      .filter((i) => i.name && ehInstanciaDeAgenda(i.name))
      .map((i) => ({
        instancia: i.name,
        estado: i.connectionStatus ?? "?",
        numero: (i.ownerJid ?? "").split("@")[0] || null,
        perfil: i.profileName ?? null,
      }));
    return NextResponse.json({ sessoes });
  }

  // ── encerrar: desistir no meio, ou limpar o que ficou para trás ──────────
  if (acao === "encerrar") {
    await desconectar(inst);
    await apagarInstancia(inst);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });
}
