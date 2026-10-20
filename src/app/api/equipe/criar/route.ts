import { NextResponse } from "next/server";
import { createClient as criarServico } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Criar a conta da atendente, com senha, para o coordenador entregar na mão.
//
// ── POR QUE NÃO CONVITE POR E-MAIL ──────────────────────────────────────────
//
// O caminho normal do Supabase é mandar um link para o e-mail da pessoa. Numa
// campanha isso trava: a atendente informa um e-mail que ela quase não abre, o
// link cai em spam, expira, e alguém perde a manhã do primeiro dia resolvendo
// isso por telefone. Aqui o coordenador cria, copia e manda pelo WhatsApp — que
// é onde a equipe já está.
//
// ── ESTA É A ROTA MAIS PERIGOSA DA PLATAFORMA ───────────────────────────────
//
// Ela usa a chave de SERVIÇO, que ignora toda a RLS, e cria login. Quem chegar
// nela cria uma conta de admin para si mesmo e leva as 29 mil embora. Por isso:
//
//   · só ADMIN chama. Não é `perfil_equipe`, que inclui usuário comum, nem
//     `perfil_supervisao`. Criar login é administração de conta, não
//     coordenação de plantão;
//   · o PAPEL que se pode criar é lista fechada, e 'admin' não está nela. Quem
//     precisa de outro admin promove depois, na tela de usuários, num gesto
//     separado e visível;
//   · a chave nunca sai do servidor. Nada disto existe no navegador.

export const dynamic = "force-dynamic";

// Sem 'admin' de propósito. Ver acima.
const PAPEIS = ["atendente", "supervisor", "usuario"] as const;
type Papel = (typeof PAPEIS)[number];

// PALAVRAS, NÃO CÓDIGO.
//
// A senha vai ser ditada por telefone e digitada num celular. Código embaralhado
// obriga a soletrar letra por letra — "u de uva, c de casa, seis, x de xis" — e
// é aí que nasce o "não entra" que vira meia hora de suporte no dia mais cheio.
// Três palavras a pessoa escuta uma vez e repete.
//
// NENHUMA PALAVRA TEM ACENTO OU Ç. Não é preciosismo: teclado de celular troca
// de camada para acentuar, e quem digita "coração" com o corretor ligado recebe
// outra coisa. Também não há palavra que se confunda ao ouvido — nada de
// "conserto/concerto" nem "mau/mal".
const PALAVRAS = [
  // bichos
  "gato",
  "pato",
  "urso",
  "lobo",
  "sapo",
  "bode",
  "galo",
  "mula",
  "tatu",
  "arara",
  "tucano",
  "cavalo",
  "porco",
  "cabra",
  "ovelha",
  "coelho",
  "rato",
  "mosca",
  "abelha",
  "formiga",
  "aranha",
  "cobra",
  "lagarto",
  "golfinho",
  "baleia",
  "peixe",
  "bezerro",
  "burro",
  "pomba",
  "coruja",
  "veado",
  "macaco",
  "papagaio",
  "periquito",
  "marreco",
  "pardal",
  "andorinha",
  "grilo",
  "besouro",
  // frutas e plantas
  "manga",
  "banana",
  "caju",
  "goiaba",
  "melancia",
  "abacaxi",
  "uva",
  "pera",
  "morango",
  "amora",
  "jabuticaba",
  "coco",
  "figo",
  "ameixa",
  "abacate",
  "acerola",
  "graviola",
  "pitanga",
  "umbu",
  "tamarindo",
  "castanha",
  "amendoim",
  "milho",
  "arroz",
  "trigo",
  "cana",
  "raiz",
  "tronco",
  "galho",
  "semente",
  "folha",
  "flor",
  "capim",
  "bambu",
  "cacto",
  "musgo",
  "trevo",
  "girassol",
  // natureza
  "sol",
  "lua",
  "mar",
  "rio",
  "serra",
  "morro",
  "praia",
  "vento",
  "chuva",
  "nuvem",
  "pedra",
  "areia",
  "mato",
  "campo",
  "cerrado",
  "floresta",
  "orvalho",
  "neblina",
  "estrela",
  "terra",
  "fogo",
  "barro",
  "lama",
  "poeira",
  "duna",
  "ilha",
  "lago",
  "cachoeira",
  "gruta",
  "vale",
  "planalto",
  "riacho",
  // coisas de casa e trabalho
  "mesa",
  "porta",
  "janela",
  "telhado",
  "parede",
  "chave",
  "roda",
  "ponte",
  "barco",
  "canoa",
  "jangada",
  "rede",
  "corda",
  "prego",
  "martelo",
  "faca",
  "colher",
  "panela",
  "prato",
  "copo",
  "jarra",
  "balde",
  "cesta",
  "vassoura",
  "escada",
  "banco",
  "cadeira",
  "livro",
  "papel",
  "caneta",
  "tinta",
  "pincel",
  "tambor",
  "sino",
  "gaita",
  "sanfona",
  "viola",
  "flauta",
  "relogio",
  "espelho",
  "novelo",
  "agulha",
  "tesoura",
  "bolsa",
  "chapeu",
  "sandalia",
  "guarda",
  // comida
  "queijo",
  "bolo",
  "doce",
  "mel",
  "sal",
  "leite",
  "manteiga",
  "farinha",
  "tapioca",
  "cuscuz",
  "moqueca",
  "azeite",
  "vinagre",
  "pimenta",
  "cebola",
  "alho",
  "tomate",
  "batata",
  "cenoura",
  "couve",
  "alface",
  "quiabo",
  "chuchu",
  "pepino",
  "beterraba",
  "repolho",
  "mandioca",
  "inhame",
  "carne",
  "sopa",
  // cores e qualidades simples
  "verde",
  "azul",
  "roxo",
  "preto",
  "branco",
  "cinza",
  "bege",
  "vermelho",
  "amarelo",
  "rosa",
  "dourado",
  "prata",
  "claro",
  "escuro",
  "novo",
  "velho",
  "alto",
  "baixo",
  "largo",
  "curto",
  "quente",
  "frio",
  "firme",
  "forte",
  "leve",
  "macio",
  "liso",
  "duro",
  "redondo",
  "fundo",
  "raso",
  "limpo",
];

/**
 * Três palavras e dois números — "pedra-tucano-vento-47".
 *
 * O número vai de 22 a 99 e é dito INTEIRO — "quarenta e sete", não "quatro,
 * sete". É por isso que ele não sofre da confusão entre zero e a letra O: essa
 * confusão nasce de soletrar caractere a caractere, que é justamente o que as
 * palavras existem para evitar. Começa em 22 para nunca ter um dígito solto na
 * frente.
 *
 * São cerca de 30 bits de sorteio — 218 palavras elevado a três, vezes 78
 * números. O número está escrito aqui, e não arredondado para cima, porque a
 * diferença importa a quem revisar isto depois. É suficiente AQUI por duas
 * razões: o Supabase limita
 * tentativas de login, então não há como varrer o espaço, e esta senha é
 * temporária, entregue na mão e trocada no primeiro acesso. A senha que a
 * pessoa consegue digitar de primeira é melhor que a forte que ela anota num
 * papel colado no monitor.
 */
function gerarSenha() {
  const bytes = new Uint32Array(4);
  crypto.getRandomValues(bytes);
  const tres = Array.from(
    { length: 3 },
    (_, i) => PALAVRAS[bytes[i] % PALAVRAS.length],
  );
  const numero = 22 + (bytes[3] % 78); // 22..99, sem zero nem um à frente
  return [...tres, String(numero)].join("-");
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  // A trava lê o papel de QUEM CHAMA no banco, e não do corpo do pedido nem de
  // um cabeçalho: os dois vêm do navegador e são do atacante.
  const { data: eu } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .maybeSingle();

  if (eu?.role !== "admin" || eu?.status !== "ativo") {
    return NextResponse.json(
      { erro: "Só administrador cria conta de equipe." },
      { status: 403 },
    );
  }

  let corpo: { email?: string; nome?: string; papel?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
  }

  const email = (corpo.email ?? "").trim().toLowerCase();
  const nome = (corpo.nome ?? "").trim();
  const papel = corpo.papel as Papel;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ erro: "E-mail inválido." }, { status: 400 });
  }
  if (nome.length < 2) {
    return NextResponse.json({ erro: "Falta o nome." }, { status: 400 });
  }
  if (!PAPEIS.includes(papel)) {
    return NextResponse.json(
      { erro: "Papel não permitido aqui." },
      { status: 400 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    return NextResponse.json(
      { erro: "Falta SUPABASE_SERVICE_ROLE_KEY na Vercel." },
      { status: 500 },
    );
  }
  const admin = criarServico(url, chave, { auth: { persistSession: false } });

  const senha = gerarSenha();

  // `email_confirm: true` porque não há confirmação a fazer: quem criou a conta
  // foi o coordenador, na frente da pessoa ou para mandar a ela. Sem isto o
  // login recusa até alguém clicar num e-mail que ninguém vai abrir.
  const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });

  if (erroAuth || !criado?.user) {
    const jaExiste =
      erroAuth?.message?.toLowerCase().includes("already") ||
      erroAuth?.status === 422;
    return NextResponse.json(
      {
        erro: jaExiste
          ? "Já existe conta com este e-mail. Use a lista abaixo para mudar o papel dela."
          : (erroAuth?.message ?? "Não consegui criar a conta."),
      },
      { status: jaExiste ? 409 : 500 },
    );
  }

  // O perfil manda no acesso; a conta só prova quem é. Sem esta linha a pessoa
  // entra e cai em /pendente, porque o layout exige status ativo.
  const { error: erroPerfil } = await admin.from("profiles").upsert({
    id: criado.user.id,
    email,
    nome,
    role: papel,
    status: "ativo",
  });

  if (erroPerfil) {
    // Conta criada e perfil não: a pessoa entraria e ficaria presa em
    // /pendente sem ninguém entender por quê. Desfaz e devolve o erro.
    await admin.auth.admin.deleteUser(criado.user.id);
    return NextResponse.json(
      { erro: `Conta desfeita — o perfil falhou: ${erroPerfil.message}` },
      { status: 500 },
    );
  }

  // ── A CONTA JÁ NASCE PRONTA PARA TRABALHAR ────────────────────────────────
  //
  // São TRÊS linhas, e faltar qualquer uma dá um sintoma diferente e confuso:
  //
  //   profiles              sem ela a pessoa entra e cai em /pendente;
  //   atendentes            sem ela `assumir_conversa` recusa com
  //                         "nao_e_atendente" — ela vê a fila e não puxa;
  //   departamento_membros  sem ela o nome NÃO APARECE em "transferir para uma
  //                         pessoa", e a colega conclui que ela não tem conta.
  //
  // A terceira era a que faltava. O erro dela é o pior dos três porque não
  // acontece com quem criou a conta: aparece quando OUTRA pessoa tenta passar
  // um lead adiante, horas depois, e ninguém liga uma coisa à outra.
  //
  // `disponivel: true` porque o plantão saiu. A chave não distribui mais nada —
  // hoje a conversa espera na fila e quem puxa é quem atende. Deixar desligado
  // só faria a central acusar "ninguém no plantão" com a equipe toda na mesa.
  // A MESMA LISTA DO GATILHO `papel_arruma_o_resto`, no banco.
  //
  // Lá ela decide quem TEM linha em `atendentes`; aqui, quem GANHA a linha ao
  // ser criada. Se as duas divergirem, a conta nasce de um jeito e o primeiro
  // `update` de papel a arruma de outro — e ninguém liga uma coisa à outra.
  //
  // `admin` entrou nas duas em 29/08: admin coordena E atende, e sem linha em
  // `atendentes` é impossível pô-la num setor de encaminhamento — a chave
  // estrangeira de `departamento_membros` recusa.
  const ATENDE: string[] = ["atendente", "supervisor", "admin"];

  if (ATENDE.includes(papel)) {
    await admin
      .from("atendentes")
      .upsert(
        { id: criado.user.id, nome, disponivel: true },
        { onConflict: "id" },
      );

    // O setor padrão é o Geral. Se um dia houver outro padrão, ela entra nele —
    // o que não pode é a pessoa ficar fora de todos.
    const { data: setor } = await admin
      .from("departamentos")
      .select("id")
      .eq("padrao", true)
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();

    if (setor?.id) {
      await admin
        .from("departamento_membros")
        .upsert(
          { departamento_id: setor.id, atendente_id: criado.user.id },
          { onConflict: "departamento_id,atendente_id" },
        );
    }
  }

  // A senha volta UMA VEZ e não é guardada em lugar nenhum. Se o coordenador
  // fechar a tela sem copiar, o caminho é gerar outra — que é o certo: senha
  // recuperável em texto é senha que vaza no dia em que o banco vazar.
  return NextResponse.json({ ok: true, email, senha, nome, papel });
}
