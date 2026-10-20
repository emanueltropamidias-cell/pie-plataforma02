// Vigia da plataforma: avisa quando cai, quando volta, e quando o pool aperta.
//
// ── POR QUE ESTE ARQUIVO SUBSTITUIU O ANTERIOR ───────────────────────────────
//
// O vigia velho era um shell com `curl`, e tinha três defeitos que só
// apareceram quando ele gritou pela primeira vez, em 12/09 às 17:01:
//
//   1. vigiava `/entrar`, que NÃO EXISTE — a rota de login é `/login`. Ele
//      recebia 404 e considerava no ar. Nunca teria detectado login quebrado,
//      que é exatamente o defeito que derrubou a plataforma naquele dia.
//
//   2. usava `curl`, que neste ambiente às vezes não resolve nome nenhum —
//      nem o do Google. Quando isso acontece ele anuncia "CAIU" com a
//      plataforma respondendo em 112 ms.
//
//   3. a folga de conexões saía sempre como `?`.
//
// O primeiro é o pior: um vigia que não sabe detectar o que ele existe para
// detectar é pior que vigia nenhum, porque o silêncio dele passa por
// tranquilidade.
//
// ── A REGRA QUE EVITA O ALARME FALSO ─────────────────────────────────────────
//
// Antes de dizer que a plataforma caiu, ele confere se a REDE DAQUI está de pé.
// Se o ponto de controle também não responde, o problema é a minha conexão, e
// isso ele diz com todas as letras em vez de acusar a plataforma.
//
// ── SÓ FALA QUANDO MUDA ──────────────────────────────────────────────────────
//
// Cada linha impressa vira uma notificação. Um vigia que fala a cada minuto
// para dizer que está tudo bem vira ruído, e ruído é o que faz a notificação
// que importa passar despercebida. Então ele só abre a boca na TRANSIÇÃO.
//
// ── USO ──────────────────────────────────────────────────────────────────────
//
//   node scripts/vigia.mjs                      # Talita
//   node scripts/vigia.mjs --candidato=manasses

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { escolherBanco } from "./banco.mjs";

const { candidato, env } = escolherBanco();

// A chave de serviço NÃO fica no `.env.local` — ela mora fora do repositório,
// com permissão 600, de propósito. Sem lê-la de lá, a checagem de pool sairia
// calada, que é o mesmo defeito do vigia anterior: parecer que está vigiando.
function chaveDeServico() {
  const arquivo = candidato === "manasses" ? ".pie-manasses.env" : ".pie-supabase.env";
  try {
    const texto = readFileSync(`${homedir()}/${arquivo}`, "utf8");
    const achou = texto.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m);
    return achou?.[1].trim().replace(/^["']|["']$/g, "") ?? null;
  } catch {
    return null;
  }
}

const SITE = process.env.PIE_SITE || "https://talitaoliveiraoficial.com";
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = env.SUPABASE_SERVICE_ROLE_KEY || chaveDeServico();
const CONTROLE = "https://www.google.com";

const INTERVALO = 60_000;
const FOLGA_BAIXA = 8; // conexões livres. Abaixo disto o login começa a falhar.

const hora = () => new Date().toLocaleTimeString("pt-BR");

async function bate(url, opcoes = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000), ...opcoes });
    return { ok: true, status: r.status, ms: Date.now() - t0, r };
  } catch (e) {
    return { ok: false, erro: e.cause?.code ?? e.name ?? e.message, ms: Date.now() - t0 };
  }
}

// A plataforma está no ar quando a tela de login SERVE — não quando o domínio
// responde qualquer coisa. 404 e 500 também são respostas.
async function olharPlataforma() {
  const login = await bate(`${SITE}/login`);
  if (!login.ok) return { no_ar: false, motivo: `login não respondeu (${login.erro})` };
  if (login.status !== 200) return { no_ar: false, motivo: `login devolveu ${login.status}` };
  return { no_ar: true, ms: login.ms };
}

// `folga_do_banco()` (migração 0017) por HTTP, de propósito: checar não pode
// tirar conexão do bolo que as atendentes dividem.
async function olharBanco() {
  if (!SUPA || !CHAVE) return null;
  const r = await bate(`${SUPA}/rest/v1/rpc/folga_do_banco`, {
    method: "POST",
    headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!r.ok || r.status !== 200) return null;
  try { return await r.r.json(); } catch { return null; }
}

// ── A TESTEMUNHA INDEPENDENTE ───────────────────────────────────────────────
//
// 24 e 25/09 o vigia anunciou duas quedas com `UND_ERR_CONNECT_TIMEOUT`. A de
// 25/09 foi provada falsa na mão: no minuto exato do "CAIU", o banco tinha
// gravado NOVE mensagens. A plataforma estava recebendo webhook da Evolution o
// tempo todo — quem não alcançava o domínio era esta máquina.
//
// O host de controle não pegou isso porque o problema era de rota para AQUELE
// domínio, não falta de internet. Daí esta terceira prova, que não depende da
// rede daqui chegar na Vercel: se a mensagem ESTÁ SENDO GRAVADA agora, o
// caminho Evolution → Vercel → Supabase está inteiro, e portanto a plataforma
// está de pé.
//
// A assimetria é de propósito e é o ponto todo:
//
//   mensagem recente  → PROVA que está no ar, e o "caiu" é vetado
//   nenhuma mensagem  → não prova NADA (de madrugada o normal são 2 ou 3 em
//                       vinte minutos), e o vigia segue com o julgamento dele
//
// Nunca o contrário. Silêncio de madrugada não pode virar acusação.
const VIDA_MAXIMA_S = 180; // mensagem dos últimos 3 min já serve de prova

async function mensagemRecente() {
  if (!SUPA || !CHAVE) return null;
  const desde = new Date(Date.now() - VIDA_MAXIMA_S * 1000).toISOString();
  const r = await bate(
    `${SUPA}/rest/v1/mensagens?select=id&criado_em=gte.${desde}&limit=1`,
    { headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` } },
  );
  if (!r.ok || r.status !== 200) return null;
  try {
    const linhas = await r.r.json();
    return Array.isArray(linhas) && linhas.length > 0;
  } catch {
    return null;
  }
}

let estado = null;      // 'no_ar' | 'caiu' | 'rede_daqui'
let apertado = false;
let ultimaVolta = null; // quando a rodada anterior terminou, para flagrar sono
let jaFaleiDaMinhaRede = false; // a queda da MINHA rede se anuncia uma vez só

console.log(`${hora()} vigia no ar — ${SITE}, a cada ${INTERVALO / 1000}s`);

// Dizer o que NÃO está sendo vigiado. Vigia que perdeu metade do trabalho em
// silêncio é pior que vigia desligado: o silêncio dele passa por tranquilidade.
if (!SUPA || !CHAVE) {
  console.log(`${hora()} ATENÇÃO: sem chave de serviço — o pool NÃO está sendo vigiado, só a plataforma.`);
}

for (;;) {
  const p = await olharPlataforma();
  let novo;

  if (p.no_ar) {
    novo = "no_ar";
  } else {
    // ── ESTA MÁQUINA DORMIU? ──────────────────────────────────────────────
    //
    // Na noite de 12/09 este vigia anunciou três quedas, uma delas de 14
    // minutos. NENHUMA existiu: o banco registrou 17 mensagens recebidas e 3
    // enviadas dentro da janela em que ele dizia que estava tudo fora.
    //
    // O que houve foi o Mac dormindo. A prova apareceu num número absurdo: uma
    // requisição minha com teto de 25 segundos levou 492 e ainda respondeu.
    // Cronômetro não atrasa oito minutos — a máquina inteira parou e voltou.
    //
    // Quando ela volta, a requisição em voo morre. A do Google costuma passar
    // (mais perto, em cache), a da plataforma não — e o vigia lê isso como
    // queda. O relógio entrega: se passou muito mais tempo do que o intervalo
    // pedido, quem esteve fora fui eu.
    const dormiu = ultimaVolta && Date.now() - ultimaVolta > INTERVALO * 2.5;
    if (dormiu) {
      novo = "rede_daqui";
    } else {
      const c = await bate(CONTROLE);
      if (!c.ok) {
        novo = "rede_daqui";
      } else {
        // ── CONFIRMAR ANTES DE GRITAR ──────────────────────────────────────
        //
        // Uma falha só pode ser soluço de rede. Aviso de queda que se
        // desmente sozinho em dois minutos ensina a ignorar o próximo — e o
        // próximo pode ser o de verdade.
        await new Promise((r) => setTimeout(r, 15_000));
        const segunda = await olharPlataforma();
        if (segunda.no_ar) {
          novo = "no_ar";
          p.ms = segunda.ms;
        } else {
          // Duas tentativas falharam e o host de controle responde. Antes de
          // gritar, perguntar à testemunha que não depende desta rede alcançar
          // a Vercel: o banco está recebendo mensagem agora?
          const viva = await mensagemRecente();
          if (viva === true) {
            novo = "rede_daqui";
          } else {
            novo = "caiu";
            p.motivo = segunda.motivo;
          }
        }
      }
    }
  }

  if (novo !== estado) {
    if (novo === "no_ar" && estado === null) {
      console.log(`${hora()} plataforma no ar — login em ${p.ms}ms`);
    } else if (novo === "no_ar" && estado === "rede_daqui") {
      // Silêncio de propósito. A plataforma não saiu do ar, então não há o que
      // anunciar — e a rede desta máquina pisca de vinte em vinte minutos.
      // Quatro avisos por hora sobre um fato que não é acionável é o ruído que
      // faz o aviso importante passar despercebido. A queda de VERDADE continua
      // gritando.
    } else if (novo === "no_ar") {
      console.log(`${hora()} VOLTOU — login em ${p.ms}ms`);
    } else if (novo === "caiu") {
      console.log(`${hora()} CAIU — ${p.motivo}`);
    } else if (!jaFaleiDaMinhaRede) {
      // Uma vez por sessão, e é informação séria: enquanto a rede daqui está
      // fora, o vigia fica CEGO — ele não conseguiria ver a plataforma cair.
      console.log(`${hora()} não estou alcançando o site daqui — a plataforma está de pé (o banco continua recebendo mensagem). É a rede desta máquina, e enquanto durar eu fico cego. Só aviso desta vez; as próximas vão em silêncio.`);
      jaFaleiDaMinhaRede = true;
    }
    estado = novo;
  }

  // O pool é o que derruba a plataforma antes de ela cair: quando a folga
  // encosta no chão, o login para de responder e o resto vem atrás.
  const b = await olharBanco();
  if (b && typeof b.folga === "number") {
    const agora = b.folga < FOLGA_BAIXA;
    if (agora !== apertado) {
      console.log(
        agora
          ? `${hora()} POOL APERTADO — só ${b.folga} conexões livres de ${b.teto} (${b.presas} presas)`
          : `${hora()} pool respirou — ${b.folga} conexões livres de ${b.teto}`,
      );
      apertado = agora;
    }
  }

  ultimaVolta = Date.now();
  await new Promise((r) => setTimeout(r, INTERVALO));
}
