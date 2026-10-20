// Publica o site Mulheres que Governam no Cloudflare Pages.
//
// ── NÃO É PAGES, É WORKER ────────────────────────────────────────────────────
//
// O site parece Cloudflare Pages e não é. Ele é um WORKER que só serve
// arquivos estáticos, criado pelo botão de upload do painel. Descobrir isso
// custou tempo: a conta tem zero projetos no Pages e o site respondia normal.
//
// Fica escrito aqui para ninguém procurar no lugar errado de novo.
//
// ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
//
// O site estava sendo publicado arrastando uma pasta no painel do Cloudflare.
// Funciona e cobra caro de dois jeitos.
//
// O primeiro já aconteceu: a versão rosa e branca ficou PRONTA em 06/09, na
// Área de Trabalho e no repositório, e nunca subiu. O que está no ar continua
// dourado. Ninguém errou nada — só faltou alguém arrastar a pasta, e nada na
// tela dizia que faltava.
//
// O segundo é pior e ainda não aconteceu: arrastar a pasta errada publica o
// site errado, e o site é público.
//
// ── O QUE ELE FAZ ────────────────────────────────────────────────────────────
//
// Publica a pasta do REPOSITÓRIO, que é a fonte da verdade. Antes de publicar,
// mostra o que está no ar e o que vai subir — e pede confirmação quando os dois
// são diferentes.
//
// ── USO ──────────────────────────────────────────────────────────────────────
//
//   node scripts/subir-site.mjs            confere o que mudaria, sem publicar
//   node scripts/subir-site.mjs --publicar  publica de verdade

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";

const PASTA = resolve(process.cwd(), "mulheres-que-governam");
const SITE = "https://mulheresquegovernam.site";
const ARQUIVO_ENV = join(process.env.HOME ?? "", ".pie-cloudflare.env");

function lerEnv() {
  let cru;
  try {
    cru = readFileSync(ARQUIVO_ENV, "utf8");
  } catch {
    parar([
      `Não achei ${ARQUIVO_ENV}.`,
      "",
      "  Esse arquivo guarda o token do Cloudflare. Ele fica FORA do",
      "  repositório de propósito: token em pasta de projeto é token que um dia",
      "  vai junto num commit.",
    ]);
  }
  const env = {};
  for (const linha of cru.split(/\r?\n/)) {
    const corte = linha.indexOf("=");
    if (corte < 1 || linha.trimStart().startsWith("#")) continue;
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

/** Os arquivos que vão subir, com tamanho — para dar para conferir a olho. */
function listar(dir, prefixo = "") {
  const saida = [];
  for (const nome of readdirSync(dir).sort()) {
    // `.antes` são cópias de segurança das artes trocadas. Elas existem para
    // desfazer e NÃO podem ir para o ar junto.
    if (nome.startsWith(".") || nome.endsWith(".antes")) continue;
    if (nome === "wrangler.jsonc" || nome === "logos-novas") continue;
    const caminho = join(dir, nome);
    const info = statSync(caminho);
    if (info.isDirectory()) saida.push(...listar(caminho, `${prefixo}${nome}/`));
    else saida.push({ nome: `${prefixo}${nome}`, bytes: info.size });
  }
  return saida;
}

const env = lerEnv();
// `CLOUDFLARE_PROJETO` não entra na lista: o nome do Worker mora no
// `wrangler.jsonc`, junto com o resto da configuração dele. Ter o nome em dois
// lugares seria a mesma verdade escrita duas vezes.
const faltando = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]
  .filter((k) => !env[k] || env[k].startsWith("cole_"));

if (faltando.length) {
  parar([
    "Falta preencher no ~/.pie-cloudflare.env:",
    ...faltando.map((f) => `  ${f}`),
    "",
    "  As instruções de onde achar cada um estão dentro do próprio arquivo.",
  ]);
}

const arquivos = listar(PASTA);
const total = arquivos.reduce((s, a) => s + a.bytes, 0);

console.log(`\npasta:   ${PASTA}`);
console.log(`site:    ${SITE}`);
console.log("worker:  green-feather-b5ea (Worker com arquivos, não Pages)\n");
console.log(`${arquivos.length} arquivos, ${(total / 1024).toFixed(0)} KB:`);
for (const a of arquivos)
  console.log(`  ${a.nome.padEnd(30)} ${(a.bytes / 1024).toFixed(1).padStart(7)} KB`);

// ── O QUE ESTÁ NO AR É IGUAL? ────────────────────────────────────────────────
//
// Comparar ANTES de publicar é o que transforma "acho que subi" em "subi".
// Sem espaço nem quebra de linha: formatação diferente não é conteúdo
// diferente, e acusar mudança onde não há faz a conferência virar ruído.
async function confereNoAr(nome) {
  try {
    const r = await fetch(`${SITE}/${nome === "index.html" ? "" : nome}`, {
      cache: "no-store",
    });
    if (!r.ok) return "não está no ar";
    const doAr = (await r.text()).replace(/\s+/g, "");
    const daqui = readFileSync(join(PASTA, nome), "utf8").replace(/\s+/g, "");
    return doAr === daqui ? "igual" : "DIFERENTE";
  } catch {
    return "não consegui conferir";
  }
}

console.log("\ncomparando com o que está no ar:");
let mudou = false;
for (const nome of ["index.html", "styles.css", "movimento.html", "script.js"]) {
  const estado = await confereNoAr(nome);
  if (estado === "DIFERENTE") mudou = true;
  console.log(`  ${nome.padEnd(20)} ${estado}`);
}

if (!process.argv.includes("--publicar")) {
  console.log(
    mudou
      ? "\nHá diferença. Para publicar:\n\n    node scripts/subir-site.mjs --publicar\n"
      : "\nO que está no ar já é isto. Nada a publicar.\n",
  );
  process.exit(0);
}

console.log("\npublicando…\n");
try {
  // O token vai por AMBIENTE e não por argumento: argumento de comando aparece
  // na lista de processos e no histórico do terminal.
  execFileSync(
    "npx",
    ["wrangler", "deploy"],
    {
      // Roda DENTRO da pasta do site: é lá que está o `wrangler.jsonc` com o
      // nome do Worker e a lista do que não sobe.
      cwd: PASTA,
      stdio: "inherit",
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
        CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
      },
    },
  );
} catch {
  // A mensagem do wrangler já foi para a tela pelo `stdio: inherit`. Repetir o
  // objeto de erro aqui só arriscaria imprimir o ambiente, token incluído.
  parar(["O wrangler recusou. A mensagem dele está acima."]);
}

console.log(`\nPublicado. Confira em ${SITE}\n`);
console.log("O Cloudflare guarda cache: se abrir e vier o antigo, force a");
console.log("recarga (Cmd+Shift+R) ou espere alguns minutos.\n");
