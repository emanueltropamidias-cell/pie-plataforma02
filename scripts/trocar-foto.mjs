// Troca a foto de abertura do Mulheres que Governam.
//
// ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
//
// Escolher foto é comparar, e comparar exige ver as duas no lugar — não lado a
// lado numa pasta. A diferença entre uma foto boa e uma foto certa aparece
// quando ela está atrás do degradê rosa, cortada pelo card, com a logo em cima.
//
// Trocar na mão é copiar arquivo por cima de arquivo, e um deslize sobrescreve
// a original. As opções ficam em `fotos/`, que o `.assetsignore` impede de ir
// para o ar — ninguém baixa o acervo de retratos digitando o endereço.
//
// ── O ENQUADRAMENTO ANDA JUNTO ───────────────────────────────────────────────
//
// Foto deitada e foto em pé não podem usar o mesmo recorte: o card é alto, e
// com o enquadramento da deitada a foto em pé mostra o teto do estúdio e joga
// o rosto para fora. Por isso a troca mexe no CSS também.
//
// ── USO ──────────────────────────────────────────────────────────────────────
//
//   node scripts/trocar-foto.mjs           lista as opções
//   node scripts/trocar-foto.mjs azul      usa fotos/azul.jpg

import { readdirSync, copyFileSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";

const PASTA = resolve(process.cwd(), "mulheres-que-governam");
const FOTOS = join(PASTA, "fotos");
const CSS = join(PASTA, "styles.css");

/** Deitada ou em pé — é isso que decide o recorte. */
function formato(caminho) {
  const saida = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", caminho], {
    encoding: "utf8",
  });
  const w = Number(saida.match(/pixelWidth:\s*(\d+)/)?.[1] ?? 0);
  const h = Number(saida.match(/pixelHeight:\s*(\d+)/)?.[1] ?? 0);
  return { w, h, emPe: h > w };
}

const opcoes = readdirSync(FOTOS).filter((f) => /\.(jpg|jpeg|png)$/i.test(f));
const pedida = process.argv[2];

if (!pedida) {
  console.log(`\nOpções em ${FOTOS}:\n`);
  for (const f of opcoes) {
    const { w, h, emPe } = formato(join(FOTOS, f));
    const kb = (statSync(join(FOTOS, f)).size / 1024).toFixed(0);
    console.log(`  ${f.replace(/\.[^.]+$/, "").padEnd(12)} ${w}x${h}  ${emPe ? "em pé " : "deitada"}  ${kb} KB`);
  }
  console.log("\n  node scripts/trocar-foto.mjs <nome>\n");
  process.exit(0);
}

const arquivo = opcoes.find((f) => f.replace(/\.[^.]+$/, "") === pedida);
if (!arquivo) {
  console.error(`\nNão achei "${pedida}" em fotos/. Rode sem argumento para ver a lista.\n`);
  process.exit(1);
}

const origem = join(FOTOS, arquivo);
const { w, h, emPe } = formato(origem);
copyFileSync(origem, join(PASTA, "abertura.jpg"));

// Em pé: o rosto fica alto no quadro, então quase não se desce.
// Deitada: o quadro tem muito ar em cima, e é preciso descer mais para o rosto
// não ser cortado pela borda do card.
const recorte = emPe ? "50% 12%" : "50% 18%";
const css = readFileSync(CSS, "utf8").replace(
  /background-position:[^,]+,center,center;/,
  `background-position:${recorte},center,center;`,
);
writeFileSync(CSS, css);

console.log(`\nabertura.jpg agora é ${arquivo} (${w}x${h}, ${emPe ? "em pé" : "deitada"})`);
console.log(`enquadramento: ${recorte}\n`);
console.log("Para ver no ar:\n\n    node scripts/subir-site.mjs --publicar\n");
