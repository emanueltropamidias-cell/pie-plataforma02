// Leitura dos arquivos abertos do TSE: zip baixado uma vez, CSV em latin1 e
// separado por ponto e vírgula. Compartilhado por importar-tse.mjs e
// importar-tse-locais.mjs.

import { existsSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, execSync } from "node:child_process";
import readline from "node:readline";

// Baixa para `.parte` e só renomeia quando o curl termina bem. Antes, um
// download interrompido ficava com o nome final e era aceito para sempre
// como se estivesse completo — foi o que aconteceu com os votos de 2026.
export function garantirArquivo(pasta, nomeArquivo, url) {
  const destino = resolve(pasta, nomeArquivo);
  if (!existsSync(destino)) {
    const parte = `${destino}.parte`;
    console.log(`\nBaixando ${nomeArquivo} do TSE CDN...`);
    execSync(`curl -fL -C - -o "${parte}" "${url}"`, { stdio: "inherit" });
    execSync(`unzip -tq "${parte}"`, { stdio: "inherit" });
    renameSync(parte, destino);
  }
  return destino;
}

export function streamCsvDoZip(caminhoZip, nomeArquivoCsv, aoReceberLinha) {
  return new Promise((resolvePromise, rejectPromise) => {
    const cmd = `unzip -p "${caminhoZip}" "${nomeArquivoCsv}" | iconv -f latin1 -t utf-8`;
    const filho = spawn("sh", ["-c", cmd]);
    const rl = readline.createInterface({ input: filho.stdout, crlfDelay: Infinity });

    let cabecalho = null;
    let totalLido = 0;

    rl.on("line", (linha) => {
      if (!linha.trim()) return;
      const partes = linha.split(";").map((p) => p.replace(/^"|"$/g, "").trim());
      if (!cabecalho) {
        cabecalho = partes;
        return;
      }
      totalLido++;
      aoReceberLinha(partes, cabecalho);
    });

    // Sem isto, arquivo que não existe dentro do zip vira "0 linhas" e a
    // importação termina com sucesso sem ter gravado nada.
    filho.on("close", () => {
      if (!cabecalho) rejectPromise(new Error(`${nomeArquivoCsv} vazio ou ausente em ${caminhoZip}`));
      else resolvePromise(totalLido);
    });
    filho.on("error", (err) => rejectPromise(err));
  });
}
