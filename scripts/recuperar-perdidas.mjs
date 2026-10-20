// Traz de volta as mensagens que o WhatsApp entregou e o PIE não registrou.
//
// ── QUANDO ISTO É PRECISO ────────────────────────────────────────────────────
//
// O webhook roda na Vercel. Quando a Vercel sai do ar — deploy desligado por
// cobrança, 504 por sobrecarga, deploy quebrado — a Evolution tenta entregar,
// falha e NÃO tenta de novo. A mensagem fica só no banco dela, e na caixa da
// atendente não aparece nada. A pessoa escreveu e ninguém vai responder.
//
// Em 15/09, entre 00:41 e 00:53, a Vercel devolveu 402 (DEPLOYMENT_DISABLED) e
// 11 mensagens de 5 pessoas se perderam assim. Uma delas dizia "eu te garanto
// 500 votos" — esse é o tamanho do que some numa janela de doze minutos.
//
// ── POR QUE É SEGURO RODAR, E RODAR DE NOVO ──────────────────────────────────
//
// `mensagens.wa_id` é ÚNICO. Reinjetar a mesma mensagem não cria uma segunda;
// o banco recusa. Então na dúvida sobre a janela, é melhor pedir demais: o que
// já entrou é simplesmente ignorado.
//
// A entrada usa `receber_mensagem`, a MESMA função que o webhook usa. Nada aqui
// é caminho paralelo — a mensagem entra pela porta de sempre, com o horário
// original, e cai na conversa certa.
//
// ── USO ──────────────────────────────────────────────────────────────────────
//
//   node scripts/recuperar-perdidas.mjs --de="2026-09-15 00:41" --ate="2026-09-15 00:53"
//   node scripts/recuperar-perdidas.mjs --de=... --ate=... --aplicar
//
// Sem `--aplicar` ele só MOSTRA o que faria. Olhe antes.

import { execFileSync } from "node:child_process";
import pg from "pg";
import { escolherBanco } from "./banco.mjs";

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const de = arg("de");
const ate = arg("ate");
const aplicar = process.argv.includes("--aplicar");

if (!de || !ate) {
  console.log(`
  Faltou a janela de tempo.

    node scripts/recuperar-perdidas.mjs --de="2026-09-15 00:41" --ate="2026-09-15 00:53"

  Horário da Bahia. Acrescente --aplicar para gravar de verdade.
`);
  process.exit(1);
}

const VPS = "root@evo.talitaoliveiraoficial.com";

// ── 1. O QUE A EVOLUTION TEM NAQUELA JANELA ──────────────────────────────────
//
// Só conversa individual (`@lid`): grupo não vira lead, e a caixa não trata.
const sql = `
with j as (select ('${de}'::timestamp at time zone 'America/Bahia') as ini,
                  ('${ate}'::timestamp at time zone 'America/Bahia') as fim)
select json_agg(x) from (
  select m."key"->>'id'                                     as wa_id,
         split_part(m."key"->>'remoteJidAlt','@',1)         as telefone,
         m."pushName"                                      as nome,
         i.name                                            as instancia,
         m."messageType"                                   as tipo,
         coalesce(m."message"->>'conversation',
                  m."message"->'extendedTextMessage'->>'text') as texto,
         to_char(to_timestamp((m."messageTimestamp")::bigint) at time zone 'UTC',
                 'YYYY-MM-DD"T"HH24:MI:SS"Z"')             as momento,
         to_char(to_timestamp((m."messageTimestamp")::bigint) at time zone 'America/Bahia',
                 'HH24:MI:SS')                             as hora_bahia
    from "Message" m join "Instance" i on i.id = m."instanceId", j
   where (m."key"->>'fromMe') = 'false'
     and (m."key"->>'remoteJid') like '%@lid'
     and to_timestamp((m."messageTimestamp")::bigint) >= j.ini
     and to_timestamp((m."messageTimestamp")::bigint) <  j.fim
   order by m."messageTimestamp"
) x;`;

console.log(`\nJanela: ${de} → ${ate} (horário da Bahia)\n`);

const saida = execFileSync(
  "ssh",
  ["-i", `${process.env.HOME}/.ssh/pie_vps`, "-o", "StrictHostKeyChecking=no", VPS,
   "docker exec -i evolution-postgres-1 psql -U evolution -d evolution -At"],
  { input: sql, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
).trim();

const achadas = saida && saida !== "" ? JSON.parse(saida) : null;
if (!achadas?.length) {
  console.log("  A Evolution não tem mensagem individual nessa janela. Nada a fazer.\n");
  process.exit(0);
}

// ── 2. QUAIS DELAS FALTAM NO PIE ─────────────────────────────────────────────
const { conexao, env } = escolherBanco();
const c = new pg.Client({
  ...(conexao ?? { connectionString: env.SUPABASE_DB_URL }),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20_000,
  query_timeout: 30_000,
});
await c.connect();

const ids = achadas.map((m) => m.wa_id);
const { rows: jaTem } = await c.query(
  "select wa_id from public.mensagens where wa_id = any($1::text[])", [ids],
);
const presentes = new Set(jaTem.map((r) => r.wa_id));
const faltando = achadas.filter((m) => !presentes.has(m.wa_id));

console.log(`  na Evolution: ${achadas.length}`);
console.log(`  já no PIE:    ${presentes.size}`);
console.log(`  FALTANDO:     ${faltando.length}\n`);

if (!faltando.length) {
  console.log("  Nada se perdeu nessa janela.\n");
  await c.end();
  process.exit(0);
}

// Sem telefone não há como colocar na conversa certa — e inventar é pior que
// deixar de fora. Elas são listadas para não sumirem em silêncio.
const semTelefone = faltando.filter((m) => !m.telefone);
const recuperaveis = faltando.filter((m) => m.telefone);

for (const m of faltando) {
  const marca = m.telefone ? " " : "✗";
  console.log(
    `  ${marca} ${m.hora_bahia}  ${(m.telefone || "sem telefone").padEnd(14)}` +
    ` ${m.instancia.padEnd(17)} ${(m.texto || `[${m.tipo}]`).slice(0, 42).replace(/\s+/g, " ")}`,
  );
}
if (semTelefone.length) {
  console.log(`\n  ✗ ${semTelefone.length} sem telefone — a Evolution guardou só o identificador`);
  console.log("    anônimo. Não dá para colocar na conversa certa.");
}

if (!aplicar) {
  console.log(`\n  Isto foi um ENSAIO. Para gravar as ${recuperaveis.length}:\n`);
  console.log(`    node scripts/recuperar-perdidas.mjs --de="${de}" --ate="${ate}" --aplicar\n`);
  await c.end();
  process.exit(0);
}

// ── 3. ENTRAR PELA PORTA DE SEMPRE ───────────────────────────────────────────
let ok = 0, erro = 0;
for (const m of recuperaveis) {
  try {
    await c.query(
      `select public.receber_mensagem(
         p_telefone => $1, p_nome => $2, p_instancia => $3, p_wa_id => $4,
         p_direcao => 'inbound', p_tipo => $5, p_texto => $6, p_resumo => null,
         p_midia_url => null, p_midia_mime => null, p_duracao => null,
         p_status => 'recebida', p_momento => $7::timestamptz, p_bruto => $8::jsonb)`,
      [m.telefone, m.nome ?? null, m.instancia, m.wa_id, m.tipo,
       m.texto ?? null, m.momento,
       JSON.stringify({ recuperada_em: new Date().toISOString(), origem: "evolution", janela: [de, ate] })],
    );
    ok++;
  } catch (e) {
    erro++;
    console.log(`  FALHOU ${m.wa_id}: ${e.message.slice(0, 70)}`);
  }
}
console.log(`\n  gravadas: ${ok}   falhas: ${erro}\n`);
await c.end();
