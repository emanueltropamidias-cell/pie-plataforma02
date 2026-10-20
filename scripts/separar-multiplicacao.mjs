// Separa os apoiadores em blocos sem repetição, para a campanha dos 12.
//
// ── O PEDIDO ─────────────────────────────────────────────────────────────────
//
// 22/09, Emanuel: cinco atendentes vão ligar para os apoiadores pedindo que
// cada um traga 12. Cada apoiador tem de aparecer para UMA pessoa só — duas
// ligações para o mesmo eleitor queimam a lista e queimam a campanha.
//
// ── POR QUE NÃO BASTA DIVIDIR A CONSULTA EM CINCO ────────────────────────────
//
// `conversa_tags` tem 7.534 conversas marcadas como apoiador, mas são 7.092
// PESSOAS: 442 aparecem em mais de uma conversa, porque falaram com mais de um
// chip. Dividir as linhas entrega essas 442 para duas atendentes diferentes —
// exatamente o que o pedido proíbe, e sem ninguém perceber.
//
// A deduplicação é por `fone_canonico`, e não pela coluna crua: `conversas`
// guarda telefone em quatro formatos, e a mesma pessoa aparece como
// 5571988887777 e 71988887777.
//
// ── A ORDEM DENTRO DO BLOCO NÃO É ALEATÓRIA ──────────────────────────────────
//
// Nenhum chip manda 1.418 mensagens num dia — o teto é 200. Então ninguém vai
// terminar o bloco: vai terminar o COMEÇO dele. Por isso o mais quente vem
// primeiro (quem falou mais recentemente), e as primeiras 200 linhas de cada
// arquivo são o trabalho de amanhã.
//
// ── USO ──────────────────────────────────────────────────────────────────────
//
//   node scripts/separar-multiplicacao.mjs                  (5 blocos)
//   node scripts/separar-multiplicacao.mjs --blocos=8
//   node scripts/separar-multiplicacao.mjs --por-chip       (agrupa por chip atual)

import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { escolherBanco } from "./banco.mjs";

const arg = (n, padrao) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split("=")[1] : padrao;
};
const BLOCOS = Number(arg("blocos", 5));
const POR_CHIP = process.argv.includes("--por-chip");
// Quem não vota na Bahia sai dos blocos e vai para um arquivo próprio. Ele não
// é descarte: é outro roteiro ("indica alguém da Bahia"), e misturar os dois na
// mesma lista faz a atendente ler o roteiro errado para um quarto da fila.
const SEPARAR_FORA = !process.argv.includes("--juntar-fora");

const { conexao, env } = escolherBanco();
const cliente = new pg.Client({
  ...(conexao ?? { connectionString: env.SUPABASE_DB_URL }),
  ssl: { rejectUnauthorized: false },
});

// Excel brasileiro: ponto-e-vírgula, e BOM senão "São Gonçalo" vira "SÃ£o".
// Telefone com ="..." para não virar notação científica nem perder o zero.
const csv = (linhas) =>
  "﻿" +
  linhas
    .map((l) => l.map((v) => (v == null ? "" : `"${String(v).replace(/"/g, '""')}"`)).join(";"))
    .join("\r\n");

try {
  await cliente.connect();
  await cliente.query("analyze public.conversa_tags, public.conversas");

  // Uma pessoa, uma linha. `distinct on (telefone canônico)` ficando com a
  // conversa mais recente — é nela que está o chip vivo e o nome mais novo.
  // A mesma normalização do banco, trazida para cá: sem acento, sem hífen,
  // minúscula. Comparar município por texto cru erra em "Dias d'Ávila".
  const chave = (t) =>
    t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const chavesBA = new Set(
    (await cliente.query("select nome from public.municipios_ba")).rows.map((m) => chave(m.nome)),
  );

  const { rows } = await cliente.query(`
    with apoiador as (
      select distinct on (public.fone_canonico(cv.telefone))
             public.fone_canonico(cv.telefone)              as fone,
             cv.id                                          as conversa_id,
             coalesce(nullif(trim(cv.nome), ''), l.nome)    as nome,
             coalesce(cv.municipio, l.municipio)            as municipio,
             coalesce(cv.bairro, l.bairro)                  as bairro,
             n.apelido                                      as chip,
             p.nome                                         as atendente,
             cv.ultima_msg_at,
             (l.id is not null)                             as cadastrado,
             exists (select 1 from public.conversa_tags c2
                       join public.tags t2 on t2.id = c2.tag_id
                      where c2.conversa_id = cv.id and t2.valor = 'multiplicador')
                                                            as ja_multiplicador
        from public.conversa_tags ct
        join public.tags t       on t.id = ct.tag_id
        join public.conversas cv on cv.id = ct.conversa_id
        left join public.numeros n   on n.id = cv.numero_id
        left join public.profiles p  on p.id = cv.atendente_id
        left join public.liderancas l
               on public.fone_canonico(l.telefone) = public.fone_canonico(cv.telefone)
       where t.valor like 'apoiador%'
         and public.fone_canonico(cv.telefone) <> ''
         and length(public.fone_canonico(cv.telefone)) between 10 and 11
       order by public.fone_canonico(cv.telefone), cv.ultima_msg_at desc nulls last
    )
    select * from apoiador
     order by ultima_msg_at desc nulls last, nome nulls last
  `);

  console.log(`\napoiadores únicos, telefone válido: ${rows.length.toLocaleString("pt-BR")}`);

  // ── QUEM VOTA NELA E QUEM NÃO VOTA ────────────────────────────────────────
  //
  // Dois sinais, e o da cidade manda: DDD viaja com a pessoa quando ela muda de
  // estado, cidade escrita na conversa é o que ela DISSE. Sem cidade, o DDD é o
  // que sobra. Quem não tem nenhum dos dois fica na Bahia — é o lado seguro do
  // erro: ligar para um baiano de fora custa uma ligação, tirar um baiano da
  // lista custa um voto.
  const DDD_BA = new Set(["71", "73", "74", "75", "77"]);
  const daBahia = (r) => {
    if (r.municipio) return chavesBA.has(chave(r.municipio));
    return DDD_BA.has(r.fone.slice(0, 2));
  };
  const bahia = SEPARAR_FORA ? rows.filter(daBahia) : rows;
  const fora = SEPARAR_FORA ? rows.filter((r) => !daBahia(r)) : [];
  console.log(`  na Bahia: ${bahia.length.toLocaleString("pt-BR")}  ·  fora: ${fora.length.toLocaleString("pt-BR")}`);

  // ── O CORTE ───────────────────────────────────────────────────────────────
  //
  // Round-robin, e não fatias contíguas. Fatia contígua daria à primeira
  // atendente os 1.418 mais quentes e à última os 1.418 mais frios — o
  // resultado dela seria pior por causa do corte, não do trabalho. Intercalando,
  // as cinco recebem a mesma mistura, e comparar o desempenho passa a significar
  // alguma coisa.
  const blocos = Array.from({ length: BLOCOS }, () => []);
  if (POR_CHIP) {
    const porChip = new Map();
    for (const r of bahia) {
      const k = r.chip ?? "(sem chip)";
      if (!porChip.has(k)) porChip.set(k, []);
      porChip.get(k).push(r);
    }
    // Chips inteiros para o mesmo bloco, do maior para o menor, sempre no bloco
    // que está mais vazio: mantém a conversa no número que a pessoa já conhece.
    for (const [, lista] of [...porChip.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const menor = blocos.reduce((a, b) => (a.length <= b.length ? a : b));
      menor.push(...lista);
    }
  } else {
    bahia.forEach((r, i) => blocos[i % BLOCOS].push(r));
  }

  // ── CONFERÊNCIA ANTES DE ESCREVER ─────────────────────────────────────────
  //
  // O arquivo é o entregável, e ninguém vai conferir sobreposição abrindo cinco
  // planilhas. Confere aqui, e se houver repetição não escreve nada.
  const vistos = new Set();
  let repetido = 0;
  for (const b of blocos) for (const r of b) (vistos.has(r.fone) ? repetido++ : vistos.add(r.fone));
  if (repetido > 0) throw new Error(`${repetido} telefones em mais de um bloco — nada foi gravado`);
  if (vistos.size !== bahia.length) throw new Error(`soma dos blocos (${vistos.size}) != total da Bahia (${bahia.length})`);

  const pasta = path.join(os.homedir(), "Desktop", "Multiplicacao dos 12");
  fs.rmSync(pasta, { recursive: true, force: true });
  fs.mkdirSync(pasta, { recursive: true });

  const CAB = ["Ordem", "Nome", "Telefone", "WhatsApp", "Município", "Bairro",
               "Chip onde ela já fala", "Atendente atual", "Última conversa",
               "Já é multiplicador", "Cadastrada"];

  const dia = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" }) : "");
  const linha = (r, i) => [
    i + 1, r.nome ?? "", `="55${r.fone}"`, `https://wa.me/55${r.fone}`,
    r.municipio ?? "", r.bairro ?? "", r.chip ?? "(sem chip)", r.atendente ?? "",
    dia(r.ultima_msg_at), r.ja_multiplicador ? "SIM" : "", r.cadastrado ? "sim" : "não",
  ];

  blocos.forEach((b, i) => {
    const nome = `Bloco ${i + 1} — ${b.length} apoiadores.csv`;
    fs.writeFileSync(path.join(pasta, nome), csv([CAB, ...b.map(linha)]));
  });

  if (fora.length) {
    fs.writeFileSync(
      path.join(pasta, `FORA DA BAHIA — ${fora.length} pessoas (outro roteiro).csv`),
      csv([CAB, ...fora.map(linha)]),
    );
  }

  // Um arquivo com tudo, para conferência e para remontar se alguém faltar.
  fs.writeFileSync(
    path.join(pasta, "TODOS — conferência.csv"),
    csv([
      ["Bloco", ...CAB],
      ...blocos.flatMap((b, i) => b.map((r, j) => [i + 1, ...linha(r, j)])),
      ...fora.map((r, j) => ["fora da Bahia", ...linha(r, j)]),
    ]),
  );

  console.log(`\nblocos (sem um telefone repetido entre eles):`);
  blocos.forEach((b, i) =>
    console.log(`  Bloco ${i + 1}: ${b.length} pessoas · ${b.filter((r) => r.ja_multiplicador).length} já multiplicadores`),
  );
  if (fora.length) console.log(`  Fora da Bahia: ${fora.length} pessoas (arquivo à parte)`);
  console.log(`\npasta: ${pasta}`);
} finally {
  await cliente.end();
}
