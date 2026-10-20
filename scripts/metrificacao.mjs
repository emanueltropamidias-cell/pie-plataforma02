// Metrificação do PIE — o retrato inteiro da operação numa chamada só.
//
// ── POR QUE ESTE SCRIPT EXISTE ───────────────────────────────────────────────
//
// As telas de Métricas respondem perguntas de quem está operando: como foi hoje,
// como foi a semana, quem produziu o quê. Nenhuma responde "qual é o tamanho da
// operação" — que é a pergunta de quem apresenta a campanha para fora.
//
// Este script junta os números que estão espalhados por cinco telas e três
// funções do banco, e imprime tudo de uma vez. Só LÊ. Não altera nada.
//
// ── A ARMADILHA DO TELEFONE (regra 01-varrer-as-camadas) ─────────────────────
//
// `liderancas` e `conversas` guardam telefone em formatos misturados: 10, 11, 12
// e 13 dígitos, com e sem o 55, com e sem o nono dígito. Somar as duas tabelas
// cruas erra por ordens de grandeza — já errou: um levantamento disse "4 não
// cadastrados" quando eram 7.171.
//
// Por isso TODO cruzamento aqui passa por `fone_canonico()`, que é a mesma
// função que o resto da plataforma usa. Contagem de gente é sempre sobre o
// telefone canônico, nunca sobre a coluna bruta.
//
// ── USO ──────────────────────────────────────────────────────────────────────
//
//   node scripts/metrificacao.mjs
//   node scripts/metrificacao.mjs --candidato=manasses
//   node scripts/metrificacao.mjs --json     (para alimentar outra coisa)

import pg from "pg";
import { escolherBanco } from "./banco.mjs";

const { conexao, env } = escolherBanco();
const cliente = new pg.Client({
  ...(conexao ?? { connectionString: env.SUPABASE_DB_URL }),
  ssl: { rejectUnauthorized: false },
});

const soJson = process.argv.includes("--json");
const n = (v) => Number(v ?? 0).toLocaleString("pt-BR");
const brl = (v) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

async function um(sql, params = []) {
  const { rows } = await cliente.query(sql, params);
  return rows[0];
}
async function varios(sql, params = []) {
  const { rows } = await cliente.query(sql, params);
  return rows;
}

try {
  await cliente.connect();
  // O planejador escolhe plano pelo retrato de estatísticas, e esse retrato não
  // sobrevive a restart do banco. Sem isto, consulta que deveria usar índice
  // varre a tabela inteira — e algumas daqui varrem `mensagens`.
  await cliente.query("analyze");

  // ── BASE: quanta gente a campanha alcança ────────────────────────────────
  const base = await um(`
    with cad as (
      select distinct public.fone_canonico(telefone) as f
        from public.liderancas where telefone is not null
    ),
    conv as (
      select distinct public.fone_canonico(telefone) as f
        from public.conversas where telefone is not null
    )
    select (select count(*) from public.liderancas)                        as cadastrados,
           (select count(*) from cad where f <> '')                        as cadastrados_unicos,
           (select count(*) from conv where f <> '')                       as conversaram,
           (select count(*) from (select f from cad union select f from conv) u
             where f <> '')                                                as unicos,
           (select count(*) from conv where f <> ''
              and f not in (select f from cad where f <> ''))              as falou_sem_cadastro,
           (select count(*) from public.bases_externas_pessoas)            as base_externa,
           (select count(*) from public.bases_externas)                    as bases
  `);

  // ── CONVERSAS: o estado da caixa ──────────────────────────────────────────
  const conversas = await um(`
    select count(*)                                                          as total,
           count(*) filter (where tipo is distinct from 'disparo')            as leads,
           count(*) filter (where tipo = 'disparo')                           as disparos,
           count(*) filter (where encerrada_em is null)                       as abertas,
           count(*) filter (where primeira_resp_at is null
                              and tipo is distinct from 'disparo')            as sem_resposta,
           count(*) filter (where status_lead is not null)                    as com_status,
           count(*) filter (where atendente_id is null
                              and encerrada_em is null)                       as sem_dono
      from public.conversas
  `);

  // Etiquetas: contadas pela tabela de marcação, que é a fonte. `status_lead`
  // é cache do gatilho e pode desencontrar — a soma aqui é a real.
  const etiquetas = await varios(`
    select t.eixo, t.valor, t.nome, count(distinct ct.conversa_id) as quantas
      from public.conversa_tags ct
      join public.tags t on t.id = ct.tag_id
     group by 1,2,3
     order by t.eixo, quantas desc
  `);
  const classificadas = await um(`
    select count(distinct ct.conversa_id) as quantas
      from public.conversa_tags ct
      join public.tags t on t.id = ct.tag_id
     where t.eixo in ('status','perfil')
  `);

  // ── SLA: quanto a pessoa espera para ser respondida ───────────────────────
  // Só lead de tráfego. Disparo não tem SLA (regra 04-dominio-pie): a campanha
  // é que escreveu primeiro, ninguém está esperando.
  const sla = await um(`
    select count(*)                                                         as respondidas,
           percentile_cont(0.5) within group (
             order by extract(epoch from (primeira_resp_at - primeira_msg_at))/60) as mediana_min,
           count(*) filter (where primeira_resp_at - primeira_msg_at <= interval '5 min')  as ate_5min,
           count(*) filter (where primeira_resp_at - primeira_msg_at <= interval '1 hour') as ate_1h
      from public.conversas
     where tipo is distinct from 'disparo'
       and primeira_msg_at is not null and primeira_resp_at is not null
       and primeira_resp_at >= primeira_msg_at
       and primeira_msg_at >= now() - interval '30 days'
  `);

  // ── PRODUÇÃO DO DIA ───────────────────────────────────────────────────────
  const hoje = (await um(`select public.producao_do_dia() as j`)).j;
  const ontem = (
    await um(`select public.producao_do_dia(
                  ((now() at time zone 'America/Bahia')::date - 1),
                  ((now() at time zone 'America/Bahia')::date - 1)) as j`)
  ).j;

  // ── SÉRIE DE 14 DIAS: chegada × resposta × dinheiro ───────────────────────
  // Chegada e resposta contam pelo dia em que o LEAD CHEGOU (é a pergunta "o
  // tráfego de terça rendeu?"). Gasto vem do Meta, pelo dia do anúncio.
  const serie = await varios(`
    with dias as (
      select generate_series(
               (now() at time zone 'America/Bahia')::date - 13,
               (now() at time zone 'America/Bahia')::date, '1 day')::date as dia
    ),
    chegadas as (
      select (primeira_msg_at at time zone 'America/Bahia')::date as dia,
             count(*) as chegaram,
             count(*) filter (where primeira_resp_at is not null) as respondidas
        from public.conversas
       where tipo is distinct from 'disparo'
         and primeira_msg_at >= (now() at time zone 'America/Bahia')::date - 13
       group by 1
    ),
    dinheiro as (
      select data as dia, sum(gasto) as gasto,
             sum(resultados) filter (where tipo_resultado ilike '%conversa%'
                                        or tipo_resultado ilike '%messaging%') as conversas_meta
        from public.metricas_trafego
       where data >= (now() at time zone 'America/Bahia')::date - 13
       group by 1
    ),
    cadastro as (
      select (created_at at time zone 'America/Bahia')::date as dia, count(*) as cadastrou
        from public.liderancas
       where created_at >= (now() at time zone 'America/Bahia')::date - 13
       group by 1
    )
    select d.dia,
           coalesce(c.chegaram,0) as chegaram,
           coalesce(c.respondidas,0) as respondidas,
           coalesce(cd.cadastrou,0) as cadastrou,
           coalesce(m.gasto,0) as gasto,
           coalesce(m.conversas_meta,0) as conversas_meta
      from dias d
      left join chegadas c on c.dia = d.dia
      left join dinheiro m on m.dia = d.dia
      left join cadastro cd on cd.dia = d.dia
     order by d.dia
  `);

  // ── COBERTURA: municípios da Bahia alcançados ─────────────────────────────
  // 417 é o total do estado. Conta só grafia que BATE com município real —
  // "1351 municípios" seria impossível, e era exatamente o que a consulta crua
  // devolvia antes: ela estava contando grafia solta, não município.
  const cobertura = await um(`
    with ditos as (
      select public.chave_municipio(municipio) as chave, count(*) as gente
        from (
          select municipio from public.liderancas where municipio is not null and municipio <> ''
          union all
          select municipio from public.conversas  where municipio is not null and municipio <> ''
        ) x group by 1
    )
    select (select count(*) from public.municipios_ba)                          as total_ba,
           (select count(*) from ditos d
              join public.municipios_ba m on m.chave = d.chave)                 as alcancados,
           (select count(*) from ditos d
             where not exists (select 1 from public.municipios_ba m where m.chave = d.chave)) as grafias_soltas,
           (select coalesce(sum(d.gente),0) from ditos d
             where not exists (select 1 from public.municipios_ba m where m.chave = d.chave)) as gente_solta,
           (select count(*) from public.conversas where municipio is null or municipio = '')  as conversa_sem_municipio
  `);
  const topMunicipios = await varios(`
    select m.nome, count(*) as gente
      from public.liderancas l
      join public.municipios_ba m on m.chave = public.chave_municipio(l.municipio)
     group by 1 order by 2 desc limit 10
  `);

  // ── CHIPS ─────────────────────────────────────────────────────────────────
  const chips = await varios(`
    select apelido, ativo, conexao, caiu_em, motivo_queda,
           (select count(*) from public.conversas c where c.numero_id = numeros.id) as conversas
      from public.numeros order by ordem, apelido
  `);

  // ── ACUMULADO POR ATENDENTE ───────────────────────────────────────────────
  const equipe = await varios(`
    select p.nome,
           count(distinct m.conversa_id) filter (where c.tipo is distinct from 'disparo') as respondeu,
           count(*) as mensagens,
           (select count(*) from public.liderancas l where l.cadastrado_por = p.id) as cadastrou,
           (select count(distinct ct.conversa_id) from public.conversa_tags ct where ct.marcada_por = p.id) as classificou
      from public.profiles p
      left join public.mensagens m on m.enviada_por = p.id and m.direcao = 'outbound'
      left join public.conversas c on c.id = m.conversa_id
     group by p.id, p.nome
    having count(*) > 0
     order by 2 desc nulls last
  `);

  const retrato = { base, conversas, etiquetas, classificadas, sla, hoje, ontem, serie, cobertura, topMunicipios, chips, equipe };

  if (soJson) {
    console.log(JSON.stringify(retrato, null, 2));
  } else {
    const linha = (r, v) => console.log(`  ${r.padEnd(30)} ${String(v).padStart(12)}`);
    const titulo = (t) => console.log(`\n\x1b[1m${t}\x1b[0m\n${"─".repeat(46)}`);

    titulo("BASE");
    linha("pessoas únicas", n(base.unicos));
    // ── PESSOAS, E NÃO FICHAS ────────────────────────────────────────────
    //
    // Mostrava `cadastrados`, que é a contagem de LINHAS de `liderancas`.
    // Enquanto a rede era menor que o total isso passava despercebido; em
    // 01/10, depois de entrarem 9.340 fichas, "cadastradas" (28.640) ficou
    // MAIOR que "pessoas únicas" (27.097) — que é impossível, e foi o que
    // denunciou o erro.
    //
    // A diferença são 1.855 fichas sem telefone nenhum e os telefones
    // repetidos entre fichas. `cadastrados_unicos` já era calculado na
    // consulta e simplesmente não era impresso.
    linha("cadastradas (pessoas)", n(base.cadastrados_unicos));
    linha("  fichas, com repetida", n(base.cadastrados));
    linha("conversaram", n(base.conversaram));
    // O que sobra aqui é LID: o identificador opaco que o WhatsApp usa no
    // lugar do número. Não é telefone de ninguém e não vira ficha.
    linha("falou e não foi cadastrada", n(base.falou_sem_cadastro));
    linha(`bases externas (${base.bases})`, n(base.base_externa));

    titulo("CONVERSAS");
    linha("total", n(conversas.total));
    linha("leads de tráfego", n(conversas.leads));
    linha("disparos", n(conversas.disparos));
    linha("abertas", n(conversas.abertas));
    linha("sem resposta", n(conversas.sem_resposta));
    linha("classificadas", `${n(classificadas.quantas)} (${pct(classificadas.quantas, conversas.total)})`);
    for (const e of etiquetas.filter((e) => ["status", "perfil"].includes(e.eixo)))
      linha(`  ${e.eixo}: ${e.nome}`, n(e.quantas));

    titulo("TEMPO DE RESPOSTA (30 dias, só lead)");
    linha("mediana", `${Math.round(sla.mediana_min ?? 0)} min`);
    linha("até 5 min", `${n(sla.ate_5min)} (${pct(sla.ate_5min, sla.respondidas)})`);
    linha("até 1 hora", `${n(sla.ate_1h)} (${pct(sla.ate_1h, sla.respondidas)})`);

    for (const [rot, p] of [["HOJE", hoje], ["ONTEM", ontem]]) {
      titulo(`${rot} — trabalho da equipe (${p.de})`);
      linha("pessoas respondidas", n(p.total.pessoas_respondidas));
      linha("mensagens", n(p.total.mensagens));
      linha("cadastrou", n(p.total.cadastrou));
      linha("classificou", n(p.total.classificou));
      linha("apoiadores", n(p.total.apoiadores));
      linha("multiplicadores", n(p.total.multiplicadores));
    }

    titulo("14 DIAS — chegada × resposta × dinheiro");
    console.log("  dia     chegou  respond  cadast     gasto  conv.Meta   R$/conversa");
    for (const d of serie) {
      const dia = new Date(d.dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
      const custo = Number(d.chegaram) > 0 ? brl(Number(d.gasto) / Number(d.chegaram)) : "—";
      console.log(
        `  ${dia}  ${n(d.chegaram).padStart(6)}  ${n(d.respondidas).padStart(7)}  ${n(d.cadastrou).padStart(6)}  ${brl(d.gasto).padStart(9)}  ${n(d.conversas_meta).padStart(9)}  ${custo.padStart(11)}`,
      );
    }

    titulo("COBERTURA NA BAHIA");
    linha("municípios alcançados", `${n(cobertura.alcancados)} de ${n(cobertura.total_ba)}`);
    linha("grafias que não são município", n(cobertura.grafias_soltas));
    linha("pessoas presas nessas grafias", n(cobertura.gente_solta));
    linha("conversas sem município", n(cobertura.conversa_sem_municipio));
    console.log("\n  maiores:");
    for (const m of topMunicipios) console.log(`    ${m.nome.padEnd(28)} ${n(m.gente).padStart(6)}`);

    titulo("CHIPS");
    const noAr = chips.filter((c) => c.conexao === "open").length;
    linha("no ar", `${noAr} de ${chips.length}`);
    for (const c of chips.filter((c) => c.conexao !== "open"))
      console.log(`    ⚠ ${c.apelido} — ${c.conexao}${c.motivo_queda ? ` (${c.motivo_queda})` : ""}`);

    titulo("ACUMULADO POR ATENDENTE");
    console.log("  atendente                  respondeu  cadastrou  classificou");
    for (const a of equipe)
      console.log(
        `  ${(a.nome ?? "—").slice(0, 24).padEnd(24)} ${n(a.respondeu).padStart(9)}  ${n(a.cadastrou).padStart(9)}  ${n(a.classificou).padStart(11)}`,
      );
    console.log();
  }
} finally {
  await cliente.end();
}
