// Qual banco este script vai tocar — e dizer isso em voz alta antes de tocar.
//
// ── O RISCO QUE ISTO FECHA ──────────────────────────────────────────────────
//
// Com mais de um candidato, existem vários bancos e um só repositório. Todos os
// scripts liam `.env.local` direto, então apontar para a base ERRADA era o
// caminho padrão: bastava rodar o comando de sempre na pasta de sempre.
//
// E o erro seria silencioso do jeito pior. Rodar uma migração na base do
// candidato errado não dá erro nenhum — o SQL é o mesmo, as tabelas são as
// mesmas. Um `update` de correção escrito para a base de um, rodado na do
// outro, corrige o que não estava quebrado e estraga o que estava certo. Só se
// descobre pelo número que mudou sem motivo, dias depois.
//
// ── COMO FECHA ──────────────────────────────────────────────────────────────
//
// Cada instalação tem o seu arquivo, e cada arquivo se identifica:
//
//     .env.local            PIE_CANDIDATO=talita
//     .env.manasses.local   PIE_CANDIDATO=manasses
//
// Sem `--candidato`, é a instalação principal. Com `--candidato=manasses`, é a
// dele — e o arquivo TEM de concordar com o nome pedido, senão o script para.
// Tocar a base do outro passa a exigir digitar o nome dele.
//
// E antes de qualquer coisa sai o aviso com o candidato e o código do projeto.
// O código não é segredo (aparece na URL pública da API) e é o que distingue um
// banco do outro sem ambiguidade — nome de arquivo a gente troca, código não.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function lerArquivo(caminho) {
  const env = {};
  for (const linha of readFileSync(caminho, "utf8").split(/\r?\n/)) {
    const corte = linha.indexOf("=");
    if (corte < 1 || linha.trimStart().startsWith("#")) continue;
    // Aspas em volta do valor são do formato, não da senha. Sem tirar aqui, a
    // senha viaja com aspas dentro e o banco recusa dizendo "senha errada".
    env[linha.slice(0, corte).trim()] = linha
      .slice(corte + 1)
      .trim()
      .replace(/^(["'])([\s\S]*)\1$/, "$2");
  }
  return env;
}

function parar(linhas) {
  console.error(`\n${linhas.join("\n")}\n`);
  process.exit(1);
}

/**
 * Escolhe a instalação, confere que ela é a pedida, e anuncia.
 *
 * Devolve `{ candidato, ref, env, conexao }`. `conexao` já vem pronta para o
 * driver `pg`; a senha nunca é impressa, nem em erro.
 */
export function escolherBanco({ raiz = process.cwd(), silencioso = false, candidato: escolhido } = {}) {
  // `candidato` explícito é para script que toca DUAS instalações de uma vez
  // (scripts/transferir-link.mjs): um `--candidato` na linha de comando não
  // diria qual das duas. Vazio ("") = a principal, `.env.local`.
  const pedido = (
    escolhido !== undefined
      ? escolhido
      : process.argv.find((a) => a.startsWith("--candidato="))?.slice("--candidato=".length)
  )?.trim();

  const arquivo = pedido ? `.env.${pedido}.local` : ".env.local";
  const caminho = resolve(raiz, arquivo);

  let env;
  try {
    env = lerArquivo(caminho);
  } catch {
    parar([
      `Não achei ${arquivo}.`,
      "",
      pedido
        ? `  Para a instalação "${pedido}", crie ${arquivo} com as credenciais dela.`
        : "  Crie .env.local com as credenciais da instalação principal.",
      "",
      "  O .gitignore já bloqueia .env* — nada disso vai para o repositório.",
    ]);
  }

  const candidato = env.PIE_CANDIDATO?.trim();
  if (!candidato)
    parar([
      `${arquivo} não diz de quem é.`,
      "",
      "  Acrescente a primeira linha:",
      "",
      `    PIE_CANDIDATO=${pedido || "talita"}`,
      "",
      "  Sem isso não dá para garantir que o script está tocando o banco certo,",
      "  e migração rodada na base errada não dá erro nenhum — o SQL é o mesmo.",
    ]);

  // O arquivo pode ter sido copiado de outra instalação e esquecido pela
  // metade. Se ele se identifica como outro, é isso que vale — não o nome que
  // alguém digitou.
  if (pedido && candidato !== pedido)
    parar([
      `${arquivo} diz que é de "${candidato}", e você pediu "${pedido}".`,
      "",
      "  Um dos dois está errado, e eu não vou adivinhar qual.",
      "  Provavelmente o arquivo foi copiado de outra instalação e o",
      "  PIE_CANDIDATO ficou para trás.",
    ]);

  const ref = (env.NEXT_PUBLIC_SUPABASE_URL || "").match(
    /https:\/\/([a-z0-9]+)\.supabase\.co/i,
  )?.[1];
  if (!ref)
    parar([
      `${arquivo} não tem NEXT_PUBLIC_SUPABASE_URL válida.`,
      "",
      "  É dela que sai o usuário do banco e o código do projeto.",
    ]);

  if (!silencioso)
    console.log(
      [
        "",
        `  ┌${"─".repeat(52)}`,
        `  │  instalação: ${candidato.toUpperCase()}`,
        `  │  projeto:    ${ref}`,
        `  └${"─".repeat(52)}`,
        "",
      ].join("\n"),
    );

  const senha = process.env.SUPABASE_DB_PASSWORD || env.SUPABASE_DB_PASSWORD;

  // ── O LOGIN TEM DE PARECER UM LOGIN ────────────────────────────────────────
  //
  // Em 14/09 a senha foi colada na linha do SUPABASE_DB_USER em vez da do
  // SUPABASE_DB_PASSWORD — duas linhas vizinhas, num arquivo aberto às pressas.
  //
  // O estrago não foi a conexão falhar: foi que o usuário É IMPRESSO na abertura
  // de todo script, de propósito, para se saber por onde a alteração entrou. A
  // senha foi para a tela e para o registro da conversa, e teve de ser trocada.
  //
  // Nome de role no Postgres não tem `:`, `@`, `/` nem espaço. Recusar aqui
  // custa uma linha e impede que qualquer coisa que não seja um login seja
  // impressa como se fosse.
  const login = env.SUPABASE_DB_USER?.trim();
  if (login && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(login))
    parar([
      `SUPABASE_DB_USER de ${arquivo} não parece um login de banco.`,
      "",
      "  Nome de role só tem letra, número e _ — nunca `:`, `@`, `/` ou espaço.",
      "  O valor NÃO vai ser mostrado aqui: se você colou a senha nessa linha",
      "  por engano, mostrá-la seria repetir o vazamento que esta trava existe",
      "  para impedir.",
      "",
      "  A senha vai em SUPABASE_DB_PASSWORD, a linha de baixo.",
      "",
      "  E o mais provável: esta linha nem precisa existir. Apague-a e o",
      "  login volta a ser `postgres`, que é o do projeto.",
    ]);

  return {
    candidato,
    ref,
    env,
    arquivo,
    conexao: senha
      ? {
          // Senha solta, e não dentro da URL: `@`, `#`, `%` e `?` na senha
          // quebram o endereço e devolvem o mesmo "senha errada" de uma senha
          // de fato errada, sem como distinguir sem abrir a senha e olhar.
          host: env.SUPABASE_DB_HOST || "aws-1-sa-east-1.pooler.supabase.com",
          port: 5432,
          // ── UM LOGIN SÓ, E É O DO PROJETO ───────────────────────────────
          //
          // Houve a ideia de dar um login por máquina (`pie_mac`,
          // `pie_windows`), para resetar a senha de uma não derrubar a outra.
          // Ela foi abandonada no mesmo dia, e a causa exata importa para não
          // ser tentada de novo pelo mesmo caminho:
          //
          //   ERROR 42501: permission denied to grant role "postgres"
          //
          // Criar o role FUNCIONA, e conectar por ele pelo pooler também. O que
          // não funciona é `grant postgres to <role>`: no Supabase hospedado o
          // `postgres` não é superusuário e não tem ADMIN OPTION sobre si mesmo.
          // Sem esse grant o login novo não é dono das tabelas, e `alter table`,
          // RLS e política exigem ser dono — ou seja, ele não roda migração, que
          // era a única razão de existir.
          //
          // O arquivo existiu: supabase/login-por-maquina.sql, apagado em
          // e50f1fd, onde está o relato inteiro.
          //
          // Fica o que é verdade: a senha do `postgres` é UMA para o projeto
          // inteiro, e o Supabase a mostra uma vez só. Resetar para consertar
          // uma máquina quebra a outra no mesmo segundo — foi o que deixou as
          // duas sem conexão em 14/09. Ao trocar, trocar nas duas.
          //
          // Ausente, continua sendo `postgres` — nada muda para quem já roda.
          // O pooler quer sempre `<login>.<projeto>`: o ponto não é enfeite, é
          // o que diz ao Supavisor de qual projeto é a conexão.
          user: `${login || "postgres"}.${ref}`,
          password: senha,
          database: "postgres",
        }
      : null,
  };
}
