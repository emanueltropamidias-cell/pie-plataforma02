// Prova que o roteiro que ramifica faz o que promete — sem falar com ninguém.
//
// ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
//
// O motor do roteiro é a única parte do PIE que ESCREVE PARA O ELEITOR sozinha.
// Testar isso "ligando e vendo" custa caro de dois jeitos: uma frase errada sai
// para gente de verdade e não volta, e um laço queima o chip da campanha.
//
// Então a prova roda dentro de uma transação que VOLTA ATRÁS no fim. Cria um
// roteiro de mentira, uma conversa de mentira, manda mensagens de mentira, e
// confere caminho por caminho. Nada é gravado, nada é enviado.
//
// ── O QUE ELA CONFERE ────────────────────────────────────────────────────────
//
//   ramificação        a mesma pergunta leva a lugares diferentes conforme a
//                      resposta — que é a coisa toda que a fila não fazia
//   menu numerado      "1" e "quero apoiar" caem no mesmo lugar
//   emenda             passo que não espera resposta encadeia no seguinte, e
//                      as duas frases voltam na mesma chamada
//   ações              etiqueta marcada, status gravado, liderança criada
//   não entendi        repete uma vez e entrega para gente
//   fim de roteiro     quem terminou não é cumprimentado de novo amanhã
//   teto               mapa com ciclo não roda sozinho para sempre
//   trava 1            depois que gente fala, o robô não volta
//
// ── USO ──────────────────────────────────────────────────────────────────────
//
//   node scripts/provar-fluxo.mjs
//   node scripts/provar-fluxo.mjs --candidato=manasses

import pg from "pg";
import { escolherBanco } from "./banco.mjs";

const { conexao, env } = escolherBanco();
const cliente = new pg.Client({
  ...(conexao ?? { connectionString: env.SUPABASE_DB_URL }),
  ssl: { rejectUnauthorized: false },
});

let passou = 0;
let falhou = 0;

function conferir(nome, condicao, detalhe = "") {
  if (condicao) {
    passou++;
    console.log(`  ok    ${nome}`);
  } else {
    falhou++;
    console.log(`  FALHA ${nome}${detalhe ? `  — ${detalhe}` : ""}`);
  }
}

/** Manda uma mensagem e devolve o que o motor decidiu. */
async function mandar(conversa, texto) {
  const { rows } = await cliente.query(
    "select public.fluxo_responder($1, $2) as r",
    [conversa, texto],
  );
  return rows[0].r;
}

const textos = (r) => (r.mensagens ?? []).join(" | ");

try {
  await cliente.connect();
  // O mesmo teto do rodar-sql: prova não pode ficar na fila de trava segurando
  // o atendimento atrás dela.
  await cliente.query("set lock_timeout = '5s'");
  await cliente.query("begin");

  // ── O ROTEIRO DE MENTIRA ──────────────────────────────────────────────────
  //
  // Um mapa pequeno com a forma do que a campanha precisa: menu, três caminhos
  // diferentes, e um deles com duas frases emendadas.
  //
  //   1 pergunta ──┬── "1" ou "apoio"  → 2 agradece (marca) → 3 manda o link
  //                ├── "2" ou "ajuda"  → 4 encaminha
  //                └── senão           → 5 não entendi, chama gente
  const { rows: [f] } = await cliente.query(
    `insert into public.fluxos (nome, descricao, ativo, modo, teto_execucoes, teto_seguidas)
     values ('PROVA', 'roteiro de teste, some no rollback', true, 'no-ar', 8, 4)
     returning id`,
  );

  const passo = {};
  for (const [chave, dados] of Object.entries({
    menu:     { ordem: 1, msg: "Oi! Digite 1 para apoiar ou 2 se precisa de ajuda.", espera: true,  acoes: {} },
    agradece: { ordem: 2, msg: "Que alegria ter você com a gente!",                  espera: false, acoes: { etiqueta: "apoiador", status: "apoiador", vira_lideranca: true } },
    link:     { ordem: 3, msg: "Manda este link para quem você conhece: {{link}}",   espera: false, acoes: {} },
    ajuda:    { ordem: 4, msg: "Já estou passando para a nossa equipe.",             espera: false, acoes: { encerra: true } },
    perdido:  { ordem: 5, msg: "Já estou chamando alguém para falar com você.",      espera: false, acoes: {} },
  })) {
    const { rows: [p] } = await cliente.query(
      `insert into public.fluxo_passos
         (fluxo_id, ordem, estagio, titulo, mensagem, espera_resposta, automatico, acoes, tentativas_max)
       values ($1, $2, 'novo', $3, $4, $5, true, $6, 1) returning id`,
      [f.id, dados.ordem, chave, dados.msg, dados.espera, JSON.stringify(dados.acoes)],
    );
    passo[chave] = p.id;
  }

  const seta = (de, ordem, quando, para) =>
    cliente.query(
      "insert into public.fluxo_saidas (passo_id, ordem, quando, proximo_id) values ($1,$2,$3,$4)",
      [de, ordem, JSON.stringify(quando), para],
    );

  await seta(passo.menu, 1, { tipo: "numero", valor: "1" }, passo.agradece);
  await seta(passo.menu, 2, { tipo: "numero", valor: "2" }, passo.ajuda);
  await seta(passo.menu, 3, { tipo: "palavra", termos: ["apoio", "conte comigo", "meu voto"] }, passo.agradece);
  await seta(passo.menu, 4, { tipo: "palavra", termos: ["ajuda", "preciso", "remedio"] }, passo.ajuda);
  await seta(passo.menu, 5, { tipo: "senao" }, passo.perdido);
  // "agradece" não espera resposta: emenda no link.
  await seta(passo.agradece, 1, { tipo: "sempre" }, passo.link);

  // ── conversa de mentira ───────────────────────────────────────────────────
  async function novaConversa(telefone) {
    const { rows: [c] } = await cliente.query(
      `insert into public.conversas (telefone, nome, tipo, instancia)
       values ($1, 'Fulano de Teste', 'lead', 'prova') returning id`,
      [telefone],
    );
    return c.id;
  }

  console.log("\n── caminho do apoio, pelo número ──");
  {
    const c = await novaConversa("5571900000001");
    const r1 = await mandar(c, "oi");
    conferir("primeira mensagem cai no menu", r1.enviar && textos(r1).includes("Digite 1"), textos(r1));

    const r2 = await mandar(c, "1");
    conferir("o '1' leva ao agradecimento", textos(r2).includes("Que alegria"), textos(r2));
    conferir("emendou a segunda frase na mesma chamada", (r2.mensagens ?? []).length === 2, `${(r2.mensagens ?? []).length} msg`);
    conferir("o link vem com {{link}} para a rota trocar", textos(r2).includes("{{link}}"), textos(r2));
    conferir("marcou a etiqueta apoiador", (r2.acoes ?? []).some((a) => a.startsWith("etiqueta:apoiador")), JSON.stringify(r2.acoes));
    conferir("criou a liderança", (r2.acoes ?? []).some((a) => a.startsWith("lideranca:")), JSON.stringify(r2.acoes));
    conferir("devolveu o id da liderança para a rota gerar o código", !!r2.lideranca_id);

    const { rows: [conv] } = await cliente.query(
      "select status_lead, lideranca_id from public.conversas where id = $1", [c]);
    conferir("gravou status_lead = apoiador", conv.status_lead === "apoiador", String(conv.status_lead));
    conferir("ligou a conversa à liderança", !!conv.lideranca_id);

    const r3 = await mandar(c, "obrigado!");
    conferir("quem terminou NÃO é cumprimentado de novo", !r3.enviar, `${r3.motivo} / ${textos(r3)}`);
  }

  console.log("\n── caminho do apoio, por palavra ──");
  {
    const c = await novaConversa("5571900000002");
    await mandar(c, "oi");
    const r = await mandar(c, "Conte comigo, meu voto é seu!");
    conferir("palavra leva ao mesmo lugar que o número", textos(r).includes("Que alegria"), textos(r));
  }

  console.log("\n── caminho do pedido de ajuda ──");
  {
    const c = await novaConversa("5571900000003");
    await mandar(c, "oi");
    const r = await mandar(c, "preciso de ajuda com um remédio");
    conferir("pedido de ajuda vai para a equipe", textos(r).includes("passando para a nossa equipe"), textos(r));
    conferir("não marcou apoiador em quem pediu ajuda",
      !(r.acoes ?? []).some((a) => a.startsWith("etiqueta:apoiador")), JSON.stringify(r.acoes));

    const depois = await mandar(c, "e aí?");
    conferir("o passo com encerra:true calou o robô", !depois.enviar, depois.motivo);
  }

  console.log("\n── não entendi ──");
  {
    const c = await novaConversa("5571900000004");
    await mandar(c, "oi");
    const r = await mandar(c, "kkkkk");
    conferir("resposta fora do menu cai no 'senão'", textos(r).includes("chamando alguém"), textos(r));
  }

  console.log("\n── sem saída que case, e sem rede ──");
  {
    // Um menu sem 'senao': é aqui que o "não entendi" repete e depois desiste.
    await cliente.query("delete from public.fluxo_saidas where passo_id = $1 and (quando->>'tipo') = 'senao'", [passo.menu]);
    const c = await novaConversa("5571900000005");
    await mandar(c, "oi");
    const r1 = await mandar(c, "blablabla");
    conferir("repete a pergunta uma vez", r1.enviar && textos(r1).includes("Digite 1"), `${r1.motivo} / ${textos(r1)}`);
    const r2 = await mandar(c, "blablabla de novo");
    conferir("na segunda, cala e entrega para gente", !r2.enviar, `${r2.motivo}`);
    await seta(passo.menu, 5, { tipo: "senao" }, passo.perdido);
  }

  console.log("\n── trava 1: gente falou, o robô não volta ──");
  {
    const c = await novaConversa("5571900000006");
    await mandar(c, "oi");
    await cliente.query("update public.conversas set fluxo_passo = -1 where id = $1", [c]);
    const r = await mandar(c, "1");
    conferir("robô calado depois que a atendente assume", !r.enviar, r.motivo);
  }

  console.log("\n── teto de execuções: mapa com ciclo não roda sozinho ──");
  {
    // O pior desenho possível: um passo que não espera resposta e aponta para
    // si mesmo. Numa fila isso era impossível; num mapa, é um erro de arrastar
    // a seta errada na tela.
    const { rows: [laco] } = await cliente.query(
      `insert into public.fluxo_passos
         (fluxo_id, ordem, estagio, titulo, mensagem, espera_resposta, automatico)
       values ($1, 9, 'novo', 'laco', 'girando', false, true) returning id`, [f.id]);
    await seta(laco.id, 1, { tipo: "sempre" }, laco.id);
    await cliente.query("update public.fluxo_saidas set proximo_id = $1 where passo_id = $2 and ordem = 1", [laco.id, passo.menu]);

    const c = await novaConversa("5571900000007");
    await mandar(c, "oi");
    const r = await mandar(c, "1");
    const quantas = (r.mensagens ?? []).length;
    conferir("o teto de emendas segurou o laço", quantas <= 4, `${quantas} mensagens`);

    const { rows: [conv] } = await cliente.query(
      "select fluxo_execucoes from public.conversas where id = $1", [c]);
    conferir("execuções não passaram do teto do fluxo", conv.fluxo_execucoes <= 8, `${conv.fluxo_execucoes}`);
  }

  console.log("\n── janela de horário ──");
  {
    // Janela impossível: começa e termina na hora que já passou.
    await cliente.query("update public.fluxos set hora_inicio = 3, hora_fim = 4 where id = $1", [f.id]);
    const c = await novaConversa("5571900000008");
    const r = await mandar(c, "oi");
    const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", hour12: false });
    const dentro = Number(agora) >= 3 && Number(agora) < 4;
    conferir("fora da janela o robô fica calado", dentro || !r.enviar, `${r.motivo} (agora ${agora}h)`);
    await cliente.query("update public.fluxos set hora_inicio = null, hora_fim = null where id = $1", [f.id]);
  }

  console.log("\n── modo rascunho ──");
  {
    await cliente.query(
      "update public.fluxos set modo = 'rascunho', telefones_teste = '{5571988887777}' where id = $1", [f.id]);
    const fora = await novaConversa("5571900000009");
    const r1 = await mandar(fora, "oi");
    conferir("quem não está na lista de teste não recebe nada", !r1.enviar, r1.motivo);

    const dentro = await novaConversa("5571988887777");
    const r2 = await mandar(dentro, "oi");
    conferir("quem está na lista recebe", r2.enviar, `${r2.motivo} / ${textos(r2)}`);
  }

  console.log("\n── parar tudo ──");
  {
    await cliente.query("update public.fluxos set ativo = false where id = $1", [f.id]);
    const c = await novaConversa("5571900000010");
    const r = await mandar(c, "oi");
    conferir("com o fluxo desligado, ninguém recebe nada", !r.enviar, r.motivo);
  }
} catch (erro) {
  falhou++;
  console.error(`\nERRO: ${erro.message}`);
  if (erro.hint) console.error(`  dica: ${erro.hint}`);
} finally {
  // SEMPRE volta atrás. Nem o caminho de erro deixa roteiro de mentira ligado
  // num banco de campanha.
  await cliente.query("rollback").catch(() => {});
  await cliente.end().catch(() => {});
}

console.log(`\n${passou} ok, ${falhou} falha(s). Nada foi gravado — a transação voltou atrás.\n`);
process.exit(falhou ? 1 : 0);
