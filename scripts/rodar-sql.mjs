// Roda um arquivo .sql do repositório direto no banco.
//
// ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
//
// Até aqui todo SQL deste repositório era colado à mão no editor do Supabase, e
// isso cobrou caro mais de uma vez:
//
//   "o editor engole o resto"        ele mostra só o ÚLTIMO select do arquivo.
//                                    As conferências do meio somem, e a gente
//                                    passou a escrever arquivo torto por causa
//                                    da ferramenta — juntando prova em UMA
//                                    consulta só para caber.
//
//   "corrigido no banco e não no      rodar daqui obriga o arquivo a ser a
//    arquivo"                         verdade, porque é o arquivo que roda.
//
// Aqui todo select do arquivo aparece, na ordem, com nome e número de linhas.
//
// ── UMA TRANSAÇÃO SÓ ─────────────────────────────────────────────────────────
//
// O arquivo inteiro vai numa chamada só, e o Postgres embrulha isso numa
// transação implícita: se a linha 200 falhar, as 199 anteriores voltam atrás.
// Não existe migração pela metade, que é o pior estado possível de um banco.
//
// Também é por isso que o arquivo NÃO é quebrado em pedaços aqui: quebrar
// obrigaria a entender `$$ ... $$` de função, e o ponto-e-vírgula dentro do
// corpo dela partiria o comando no meio. Quem sabe separar comando é o servidor.
//
// ── USO ──────────────────────────────────────────────────────────────────────
//
//   node scripts/rodar-sql.mjs supabase/arquivo.sql
//   node scripts/rodar-sql.mjs supabase/arquivo.sql --confirmo   (destrutivo)

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { escolherBanco } from "./banco.mjs";

// ── a credencial e QUAL BANCO ────────────────────────────────────────────────
//
// Quem escolhe a instalação é `banco.mjs`, num lugar só para todos os scripts.
// Sem `--candidato`, é a principal; com `--candidato=manasses`, é a dele — e o
// arquivo de ambiente tem de concordar com o nome pedido.
//
// A senha nunca é impressa, nem em erro.


/** O endereço sem a senha — o que pode aparecer na tela. */
function semSenha(url) {
  try {
    const u = new URL(url);
    return `${u.username}@${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return "(endereço ilegível)";
  }
}

// ── a trava do destrutivo ────────────────────────────────────────────────────
//
// `drop policy`, `drop trigger`, `drop function` e `drop index` NÃO entram na
// lista de propósito: todo arquivo deste repositório derruba e recria política
// na mesma respiração, e trava que dispara sempre vira flag digitada no
// automático — que é o mesmo que não ter trava.
//
// O que está aqui apaga DADO ou ESTRUTURA e não recria.

const DESTRUTIVO = [
  /\bdrop\s+table\b/i,
  /\bdrop\s+schema\b/i,
  /\bdrop\s+database\b/i,
  /\bdrop\s+column\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
];

function acharDestrutivo(sql) {
  // Tira comentário antes de procurar: quase todo arquivo daqui EXPLICA o que
  // não faz ("não apaga nada"), e explicação não é comando.
  const limpo = sql
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  return DESTRUTIVO.filter((r) => r.test(limpo)).map((r) => String(r));
}

// ── rodar ────────────────────────────────────────────────────────────────────

// O primeiro argumento que NÃO é flag. Antes era `argv[2]` fixo, e bastava
// `--candidato=` vir antes do caminho para o script tentar abrir a flag como
// se fosse arquivo.
const arquivo = process.argv.slice(2).find((a) => !a.startsWith("--"));
// `--confirmo` sozinho não basta quando existe mais de uma instalação: a flag
// digitada no automático é a mesma nas duas, e apagar dado na base errada não
// avisa. Por isso ela pede o NOME: `--confirmo=talita`.
const confirmo = process.argv.find((a) => a.startsWith("--confirmo"));

if (!arquivo) {
  console.error("Uso: node scripts/rodar-sql.mjs supabase/arquivo.sql");
  process.exit(1);
}

// ── O HISTÓRICO NÃO SE RODA ──────────────────────────────────────────────────
//
// Os 75 arquivos de `supabase/historico/` foram escritos incrementalmente,
// cada um contra o banco do dia. Quatro definem `receber_mensagem`, quatro
// definem `so_digitos`, três definem `atribuir_conversa` — e rodar o errado
// instala a versão VELHA por cima da nova SEM DAR ERRO. Alguns são piores:
// `ingestao.sql` desfaz o multinúmero, `metricas.sql` recria uma assinatura
// que deixa a chamada ambígua, `papel-atendente.sql` devolve os papéis de
// lista branca para lista negra.
//
// Nada disso aparece na tela. O número só para de bater.
//
// Eles ficam no repositório porque o RACIOCÍNIO nos comentários é patrimônio —
// é lá que está escrito por que cada decisão foi tomada. O que não pode é
// rodar. Daqui para frente, mudança é migração nova em `supabase/migrations/`.
if (/(^|[\\/])historico[\\/]/.test(arquivo)) {
  console.error(
    [
      "",
      "  Este arquivo é HISTÓRICO e não deve ser rodado.",
      "",
      `    ${arquivo}`,
      "",
      "  Ele foi escrito contra o banco de um dia específico. Vários arquivos",
      "  dessa pasta redefinem a mesma função, e rodar o errado instala a versão",
      "  antiga por cima da nova sem dar erro nenhum — o defeito só aparece",
      "  depois, num número que parou de bater.",
      "",
      "  Para mudar o banco, crie uma migração nova em supabase/migrations/.",
      "  Para ler o raciocínio, abra o arquivo — é para isso que ele está aí.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const { env, candidato, ref, conexao: porPartes } = escolherBanco();
const url = process.env.SUPABASE_DB_URL || env.SUPABASE_DB_URL;

// ── A SENHA SOLTA É O CAMINHO PREFERIDO ──────────────────────────────────────
//
// Senha dentro de URL precisa de escape: `@` corta o host, `#` corta o resto,
// `%` inicia código de dois dígitos, `?` vira query. Errar qualquer um deles
// devolve exatamente o mesmo erro de senha errada — "password authentication
// failed" — e não há como distinguir "digitei errado" de "o caractere quebrou o
// endereço" sem abrir a senha e olhar, que é o que ninguém deve fazer.
//
// Numa variável só dela, a senha vai crua para o driver. Nada a escapar, nada a
// inspecionar. O que sobra na URL — usuário, host, porta — não é segredo.


if (!url && !porPartes) {
  console.error(
    [
      "Falta a senha do banco no .env.local.",
      "",
      "O jeito mais simples, sem escape para errar — a senha crua, sozinha:",
      "",
      "  SUPABASE_DB_PASSWORD=asenhadobanco",
      "",
      "O resto (usuário e host) sai da NEXT_PUBLIC_SUPABASE_URL que já está aí.",
      "Se o projeto não for na região sa-east-1, acrescente também:",
      "",
      "  SUPABASE_DB_HOST=aws-1-REGIAO.pooler.supabase.com",
      "",
      "A senha vem de: Database -> Settings -> Database password -> Reset.",
      "",
      "O .gitignore já bloqueia .env* — a senha não vai para o repositório.",
    ].join("\n"),
  );
  process.exit(1);
}

const caminho = resolve(process.cwd(), arquivo);
const sql = readFileSync(caminho, "utf8");

// ── BEGIN/COMMIT/ROLLBACK SOLTOS NO ARQUIVO ─────────────────────────────────
//
// Este script manda o arquivo inteiro numa transação só — é o que garante que
// migração não fica pela metade. Um `rollback` escrito no arquivo desfaz ESSA
// transação desde a primeira linha. Em 15/09 a 0022_base_por_tipo.sql terminava
// com uma conferência dentro de `begin ... rollback`: o `create function` foi
// desfeito junto, e o script imprimiu os números certos e "OK" — calculados
// antes do desfazer. A central da Base foi ao ar chamando uma função que nunca
// existiu, e mostrou zero em tudo.
//
// `commit` no meio é o defeito oposto: grava a metade de cima mesmo que a de
// baixo falhe. Os dois são recusados. Um arquivo de TESTE, que existe para não
// gravar nada, roda com `--teste` e é anunciado como tal.
//
// Corpos de função (`$$ ... $$`) e comentários saem antes da busca: `begin` é
// palavra de plpgsql, e "não usar rollback" é o que um comentário diria.
const teste = process.argv.includes("--teste");
const semCorpos = sql
  .replace(/--[^\n]*/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "");
const controle = semCorpos.match(/(^|;)\s*(begin|start\s+transaction|commit|end|rollback)\s*(;|$)/gim);
if (controle && !teste) {
  console.error(
    [
      "",
      `PAROU. ${arquivo} tem controle de transação solto:`,
      ...[...new Set(controle.map((c) => `  ${c.replace(/[;\s]+/g, " ").trim()}`))],
      "",
      "  Este script já roda o arquivo inteiro numa transação. Um ROLLBACK aqui",
      "  desfaz TUDO desde a primeira linha — e o script ainda diria OK. Um COMMIT",
      "  no meio grava a metade de cima mesmo se a de baixo falhar.",
      "",
      "  Se é migração: tire o begin/commit/rollback.",
      "  Se é um teste que não deve gravar nada: rode com --teste.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
if (teste) console.log("modo:    TESTE — o arquivo controla a própria transação; confira se termina em rollback");

const achados = acharDestrutivo(sql);
if (achados.length && confirmo !== `--confirmo=${candidato}`) {
  console.error(
    [
      `PAROU. ${arquivo} tem comando que APAGA e não recria:`,
      ...achados.map((a) => `  ${a}`),
      "",
      `  O alvo é a instalação "${candidato}" (projeto ${ref}).`,
      "",
      confirmo === "--confirmo"
        ? "  Agora o --confirmo pede o nome da instalação, para não ser a mesma"
        : "  Leia o arquivo antes. Se for isso mesmo:",
      confirmo === "--confirmo"
        ? "  tecla nas duas bases:"
        : "",
      "",
      `      node ${process.argv[1].split("/").slice(-2).join("/")} ${arquivo} --confirmo=${candidato}`,
    ]
      .filter((l) => l !== "")
      .join("\n") + "\n",
  );
  process.exit(2);
}

const cliente = new pg.Client({
  ...(porPartes ? porPartes : { connectionString: url }),
  // O Supabase exige TLS. O certificado é de uma CA que o Node não carrega por
  // padrão, e o alvo é um host fixo do painel — não uma URL que chegou de fora.
  ssl: { rejectUnauthorized: false },
});

console.log(
  `banco:   ${
    porPartes
      ? `${porPartes.user}@${porPartes.host}:${porPartes.port}/postgres`
      : semSenha(url)
  }`,
);
console.log(`arquivo: ${arquivo} (${sql.length.toLocaleString("pt-BR")} caracteres)`);
if (achados.length) console.log("modo:    DESTRUTIVO confirmado");
console.log("");

try {
  await cliente.connect();

  // ── ESPERAR POR TRAVA É O QUE DERRUBA A OPERAÇÃO ───────────────────────────
  //
  // Isto já aconteceu, e o estrago não foi no script: um ensaio pegou trava em
  // `auth.users` e as consultas de login da equipe inteira ficaram na fila
  // atrás dele. Ninguém entrava no PIE, e nada na tela dizia por quê.
  //
  // `alter table` numa tabela quente — `conversas`, `mensagens` — pede trava
  // EXCLUSIVA. Se qualquer transação estiver segurando aquela tabela, o alter
  // fica esperando; e enquanto ele espera, TODO MUNDO que chegar depois espera
  // atrás dele. Uma migração de dois segundos vira atendimento parado.
  //
  // Com o teto, o pior caso é a migração falhar dizendo "lock timeout" e voltar
  // atrás inteira. Falhar e tentar de novo daqui a um minuto é barato; segurar
  // a fila de 16 atendentes no meio da campanha não é.
  await cliente.query("set lock_timeout = '5s'");

  // O mesmo raciocínio para consulta que trava sozinha: dois minutos é mais que
  // qualquer migração honesta deste repositório precisa.
  await cliente.query("set statement_timeout = '120s'");

  // ── ARQUIVO COM `concurrently` VAI COMANDO A COMANDO ───────────────────────
  //
  // `create index concurrently`, `drop index concurrently` e `reindex
  // concurrently` NÃO rodam dentro de transação — e o caminho normal daqui
  // manda o arquivo inteiro numa chamada só, que o Postgres embrulha numa
  // transação implícita. Rodar assim devolve "cannot run inside a transaction
  // block" e o arquivo inteiro falha.
  //
  // `concurrently` existe justamente para a tabela continuar sendo lida e
  // escrita enquanto o índice muda. Numa plataforma com 16 atendentes
  // trabalhando, a alternativa — travar `mensagens` para trocar um índice — é
  // a caixa de atendimento parada.
  //
  // O preço é perder o tudo-ou-nada: aqui um comando pode passar e o seguinte
  // falhar. Por isso o corte só é permitido em arquivo SEM corpo de função
  // (`$$`), onde o ponto-e-vírgula é sempre fim de comando e nunca parte do
  // código — e por isso cada comando é anunciado enquanto roda.
  //
  // A busca ignora o que está DENTRO de corpo de função. Um `refresh
  // materialized view concurrently` escrito numa função não é comando do
  // arquivo — só roda quando alguém chama a função, e aí roda normal. Sem tirar
  // os corpos, a 0027 (base pré-calculada) era recusada por uma palavra que não
  // é comando nenhum: o mesmo cuidado que a trava de begin/rollback já tem.
  const concorrente = /\bconcurrently\b/i.test(
    sql
      .replace(/--[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, ""),
  );

  if (concorrente && sql.includes("$$")) {
    console.error(
      "PAROU. Arquivo tem `concurrently` E corpo de função ($$).\n" +
        "  Separe em dois arquivos: um com as funções, outro com os índices.\n" +
        "  `concurrently` não roda em transação, e cortar SQL com $$ no meio\n" +
        "  parte o corpo da função no ponto-e-vírgula errado.",
    );
    process.exit(2);
  }

  let resultados;
  if (concorrente) {
    console.log("modo:    comando a comando (o arquivo usa `concurrently`)\n");
    resultados = [];
    const comandos = sql
      .replace(/--[^\n]*/g, "")
      .split(";")
      .map((c) => c.trim())
      .filter(Boolean);

    for (const [i, comando] of comandos.entries()) {
      const resumo = comando.replace(/\s+/g, " ").slice(0, 70);
      try {
        resultados.push(await cliente.query(comando));
        console.log(`  ok    ${i + 1}/${comandos.length}  ${resumo}`);
      } catch (e) {
        // Segue em frente: o que já passou está aplicado, e parar aqui deixaria
        // o resto por fazer sem ninguém saber quais faltaram.
        console.error(`  FALHA ${i + 1}/${comandos.length}  ${resumo}`);
        console.error(`        ${e.message}`);
        process.exitCode = 1;
      }
    }
    console.log("");
  } else {
    resultados = await cliente.query(sql);
  }
  const lista = Array.isArray(resultados) ? resultados : [resultados];

  let selects = 0;
  for (const r of lista) {
    if (!r) continue;
    if (r.command === "SELECT" || (r.rows && r.rows.length)) {
      selects++;
      console.log(`── consulta ${selects} — ${r.rows.length} linha(s) ──`);
      if (r.rows.length) console.table(r.rows);
      console.log("");
    }
  }

  console.log(`OK. ${lista.length} comando(s), ${selects} consulta(s) com resposta.`);
} catch (erro) {
  // Só a mensagem do Postgres. O objeto de erro do pg carrega a configuração de
  // conexão inteira, senha inclusive.
  console.error(`FALHOU — nada foi aplicado (a transação voltou atrás).`);
  console.error(`  ${erro.message}`);
  // "lock timeout" parece erro de banco e é erro de HORÁRIO. Sem esta linha, a
  // reação natural é mexer no SQL — que está certo.
  if (erro.code === "55P03") {
    console.error("");
    console.error("  Isso é fila de trava, não erro no arquivo: alguma transação");
    console.error("  estava segurando a tabela. Tente de novo daqui a pouco, ou");
    console.error("  fora do horário de atendimento. O SQL não foi o problema.");
  }
  if (erro.position) console.error(`  posição ${erro.position} do arquivo`);
  if (erro.hint) console.error(`  dica do Postgres: ${erro.hint}`);
  process.exitCode = 1;
} finally {
  await cliente.end().catch(() => {});
}
