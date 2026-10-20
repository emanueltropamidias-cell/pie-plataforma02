// Monta, dentro de Base → Outras bases, uma gaveta só com os apoiadores.
//
// ── POR QUE ISTO NÃO É DUPLICAR DADO ────────────────────────────────────────
//
// O apoiador já existe em `conversas`, com etiqueta. Mas conversa é a
// ferramenta de QUEM ATENDE: ela vive na caixa, some quando encerra, e não dá
// para trabalhar como lista.
//
// Uma base externa é o contrário — é lista. Dá para filtrar por município,
// exportar, dividir entre pessoas e cruzar com outra base. É o formato certo
// para a campanha dos 12, que é trabalhar a lista inteira de fora para dentro.
//
// A gravação passa por `base_externa_gravar` (0036), a MESMA função da tela.
// Regra de telefone, de município e de repetido é uma só — escrever direto na
// tabela aqui criaria a segunda.
//
// ── IDEMPOTENTE ─────────────────────────────────────────────────────────────
//
// `on conflict (base_id, telefone) do update` dentro da função. Rodar de novo
// ATUALIZA quem já está lá e acrescenta quem virou apoiador desde a última vez.
// Não duplica, e é assim que a base fica viva em vez de virar retrato velho.
//
// ── USO ─────────────────────────────────────────────────────────────────────
//
//   node scripts/base-de-apoiadores.mjs --seco      (só mostra o que faria)
//   node scripts/base-de-apoiadores.mjs
//   node scripts/base-de-apoiadores.mjs --base="Apoiadores"  --so-bahia

import pg from "pg";
import { escolherBanco } from "./banco.mjs";

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3).trim();
const seco = process.argv.includes("--seco");
const soBahia = process.argv.includes("--so-bahia");
const NOME = arg("base") ?? "Apoiadores";
const CATEGORIA = arg("categoria") ?? "mandato";
const LOTE = 2000;

const banco = escolherBanco();
if (!banco.conexao) {
  console.error("\nFalta SUPABASE_DB_PASSWORD no arquivo desta instalação.\n");
  process.exit(1);
}
const c = new pg.Client({ ...banco.conexao, ssl: { rejectUnauthorized: false } });
await c.connect();

try {
  // Uma pessoa, uma linha. `distinct on (fone_canonico)` ficando com a conversa
  // mais recente: é nela que está o nome mais novo e o chip vivo.
  //
  // O telefone sai por `fone_canonico`, que devolve 10 ou 11 dígitos sem o 55 —
  // exatamente o formato que `base_externa_gravar` aceita. Mandar a coluna crua
  // faria a função descartar metade em silêncio: `conversas` guarda em quatro
  // formatos diferentes.
  const { rows } = await c.query(`
    select distinct on (public.fone_canonico(cv.telefone))
           public.fone_canonico(cv.telefone)            as telefone,
           nullif(btrim(coalesce(cv.nome, l.nome)), '') as nome,
           coalesce(cv.municipio, l.municipio)          as municipio,
           coalesce(cv.bairro, l.bairro)                as bairro,
           n.apelido                                    as chip,
           p.nome                                       as atendente,
           (cv.ultima_msg_at at time zone 'America/Bahia')::date as ultima_conversa,
           exists (select 1 from public.conversa_tags c2
                     join public.tags t2 on t2.id = c2.tag_id
                    where c2.conversa_id = cv.id and t2.valor = 'multiplicador') as multiplicador,
           (l.id is not null)                           as cadastrado
      from public.conversa_tags ct
      join public.tags t       on t.id = ct.tag_id
      join public.conversas cv on cv.id = ct.conversa_id
      left join public.numeros  n on n.id = cv.numero_id
      left join public.profiles p on p.id = cv.atendente_id
      left join public.liderancas l
             on public.fone_canonico(l.telefone) = public.fone_canonico(cv.telefone)
     where t.valor like 'apoiador%'
       and length(public.fone_canonico(cv.telefone)) between 10 and 11
     order by public.fone_canonico(cv.telefone), cv.ultima_msg_at desc nulls last
  `);

  const chave = (t) =>
    (t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

  // O filtro da Bahia é opcional e mora AQUI, não na consulta: a função já
  // calcula `local` sozinha, e deixar os de fora entrarem marcados é mais útil
  // que escondê-los — a tela sabe separar.
  // O NOME, e não a coluna `chave`. A chave do banco é feita por
  // `chave_municipio()`, e a normalização daqui é outra função — comparar as
  // duas deu 4.266 baianos onde o banco conta 6.189. Aplicar a MESMA função
  // dos dois lados é a única forma de isso não desencontrar de novo.
  const chavesBA = new Set(
    (await c.query("select nome from public.municipios_ba")).rows.map((m) => chave(m.nome)),
  );
  // Sem cidade escrita, o DDD e o que sobra. Nao e prova -- gente muda de
  // estado com o numero -- mas erra para o lado certo: deixar um baiano de
  // fora da lista custa um voto; incluir um de fora custa uma ligacao.
  const DDD_BA = new Set(["71", "73", "74", "75", "77"]);
  const daBahia = (r) =>
    r.municipio ? chavesBA.has(chave(r.municipio)) : DDD_BA.has(r.telefone.slice(0, 2));

  const todas = soBahia ? rows.filter(daBahia) : rows;
  const fora = rows.length - todas.length;

  const linhas = todas.map((r, i) => ({
    linha: i + 1,
    nome: r.nome ?? "",
    telefone: r.telefone,
    municipio: r.municipio ?? "",
    bairro: r.bairro ?? "",
    // `extras` é o que a lista crua não carrega e a equipe precisa na hora de
    // ligar: de qual número a pessoa já fala, com quem falou, e quando.
    extras: {
      origem: "apoiador marcado no atendimento",
      chip: r.chip ?? null,
      atendente: r.atendente ?? null,
      ultima_conversa: r.ultima_conversa,
      multiplicador: r.multiplicador,
      cadastrado: r.cadastrado,
      da_bahia: daBahia(r),
    },
  }));

  const n = (v) => v.toLocaleString("pt-BR");
  console.log(`\n  base:        "${NOME}"  (${CATEGORIA})`);
  console.log(`  apoiadores:  ${n(rows.length)} pessoas únicas com telefone válido`);
  if (soBahia) console.log(`  --so-bahia:  ${n(fora)} de fora ficaram de fora`);
  console.log(`  vão subir:   ${n(linhas.length)}`);
  console.log(`  com nome:    ${n(linhas.filter((l) => l.nome).length)}`);
  console.log(`  com cidade:  ${n(linhas.filter((l) => l.municipio).length)}`);
  console.log(`  na Bahia:    ${n(todas.filter(daBahia).length)}`);
  console.log(`  multiplic.:  ${n(linhas.filter((l) => l.extras.multiplicador).length)}`);

  if (seco) {
    console.log(`\n  exemplo: ${JSON.stringify(linhas[0], null, 0).slice(0, 220)}`);
    console.log("\n  SECO — nada foi gravado.\n");
    process.exit(0);
  }

  const { rows: [{ id }] } = await c.query(
    "select public.base_externa_servico_abrir($1, $2, $3, $4, $5) as id",
    [NOME, CATEGORIA,
     "Apoiadores marcados no atendimento. Atualizada por script — rodar de novo acrescenta quem virou apoiador desde a última vez.",
     "atendimento", linhas.length],
  );

  let novas = 0;
  for (let i = 0; i < linhas.length; i += LOTE) {
    const { rows: [r] } = await c.query(
      "select public.base_externa_gravar($1, $2::jsonb) as r",
      [id, JSON.stringify(linhas.slice(i, i + LOTE))],
    );
    novas += r.r.novas;
    process.stdout.write(`\r  gravando… ${n(Math.min(i + LOTE, linhas.length))}/${n(linhas.length)}`);
  }

  await c.query("select public.base_externa_servico_concluir($1)", [id]);
  const { rows: [{ cc }] } = await c.query("select public.base_externa_contar($1) as cc", [id]);
  console.log(`\r  entraram ${n(novas)} novas (o resto já estava lá)            `);
  console.log(`\n  Base "${NOME}": ${n(Number(cc.pessoas))} pessoas com telefone.\n`);
} finally {
  await c.end();
}
