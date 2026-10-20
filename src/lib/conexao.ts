import { createClient as criarServico } from "@supabase/supabase-js";
import {
  todasAsInstancias,
  ehQuedaDeConexao,
  motivoDaQueda,
} from "@/lib/evolution";

// Manter o estado guardado em dia com a realidade.
//
// ── POR QUE O WEBHOOK NÃO BASTA ─────────────────────────────────────────────
//
// `CONNECTION_UPDATE` avisa a cada MUDANÇA, e é o sinal certo: chega em
// segundos, sem ninguém perguntar. Mas ele só fala quando algo muda, e isso
// deixa dois buracos:
//
//   O PRIMEIRO DIA. As colunas nasceram com 'desconhecido'. Os três números
//   estavam de pé, nenhum mudou de estado, e por isso nenhum evento chegou —
//   o banco continuaria dizendo 'desconhecido' até a próxima queda. A faixa
//   de alarme acusaria três números caídos com dois funcionando.
//
//   O EVENTO PERDIDO. Deploy no meio, timeout, instabilidade da Evolution. Um
//   `close` que não chega deixa o sistema achando que está tudo bem — que é
//   exatamente o modo de falha que esta vigilância existe para acabar.
//
// Uma pergunta direta à Evolution fecha os dois. É UMA chamada que devolve o
// estado de todas as instâncias, então o custo não cresce com o número de
// chips.
//
// ── FALSO ALARME É PIOR QUE ALARME NENHUM ───────────────────────────────────
//
// Faixa vermelha que aparece sem motivo ensina a equipe a ignorar faixa
// vermelha. Por isso 'desconhecido' NUNCA alarma: é ausência de informação, e
// não notícia ruim. Só `close` e `connecting` — que são afirmações — acendem a
// luz.

/**
 * Reconexão que dura menos que isto é rotina, não queda.
 *
 * O Baileys pisca `connecting` sozinho várias vezes por dia — troca de rede,
 * renovação de sessão, o servidor respirando. Some em segundos e ninguém do
 * outro lado percebe nada.
 */
const RECONEXAO_NORMAL_MS = 5 * 60 * 1000;

/**
 * Estados que fazem a tela gritar.
 *
 * ── DOIS DEFEITOS MORAVAM AQUI, EM DIREÇÕES OPOSTAS ────────────────────────
 *
 * ALARME FALSO. `connecting` acendia a faixa vermelha na hora. Só que a
 * varredura roda quando alguém carrega a tela: se ela cair no meio de uma
 * piscada, o PIE congela naquele `connecting` até o próximo carregamento — e
 * a menina lê "Seu WhatsApp caiu" com o número funcionando perfeitamente.
 * Aconteceu com o do Thiago em 03/09: o PIE dizia caído, a Evolution dizia
 * `open` firme, e o número estava atendendo.
 *
 * Faixa vermelha que aparece sem motivo ensina a equipe a ignorar faixa
 * vermelha — e aí a queda de verdade passa batida.
 *
 * SILÊNCIO FALSO. `refused` não estava na lista, e é o estado de quem foi
 * RECUSADO pelo WhatsApp. O número não manda nada e a tela dizia que estava
 * tudo bem. O da Patrícia Sacramento está assim desde as 17h02.
 *
 * ── A REGRA ────────────────────────────────────────────────────────────────
 *
 * `close` e `refused` são afirmações de que não dá para enviar: alarmam na
 * hora. `connecting` só alarma se PERSISTIR — e `caiu_em` é o relógio, porque
 * `marcar_conexao` o zera assim que o número volta para `open`.
 *
 * `desconhecido` continua fora: é ausência de informação, não notícia ruim.
 */
export function estaCaido(
  conexao: string | null | undefined,
  caiuEm?: string | null,
): boolean {
  if (conexao === "close" || conexao === "refused") return true;
  if (conexao !== "connecting") return false;

  // Sem relógio não dá para saber se é piscada ou queda. Na dúvida, não grita:
  // o próximo carregamento resolve, e ele acontece a cada 45 segundos.
  if (!caiuEm) return false;

  const desde = Date.parse(caiuEm);
  if (!Number.isFinite(desde)) return false;
  return Date.now() - desde > RECONEXAO_NORMAL_MS;
}

/**
 * Pergunta o estado real de cada instância e grava.
 *
 * Feita para rodar em `after()`: a tela não espera por ela. A página atual
 * desenha com o que estava guardado, e a próxima já vem certa. Prender o
 * carregamento da caixa numa ida à Evolution seria trocar um defeito de
 * informação por um de lentidão, no dia mais movimentado.
 */
export async function sincronizarConexoes(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return;

  const r = await todasAsInstancias();
  if (!r.ok) {
    console.log(`conexao: Evolution nao respondeu — ${r.erro}`);
    return;
  }

  const db = criarServico(url, chave, { auth: { persistSession: false } });

  await Promise.all(
    (r.dados ?? []).map(async (i) => {
      if (!i.name) return;
      await db.rpc("marcar_conexao", {
        p_instancia: i.name,
        p_estado: i.connectionStatus ?? "desconhecido",
        p_motivo: motivoDaQueda(i),
      });
    }),
  );
}

/**
 * O envio que falhou É a prova de que o número caiu.
 *
 * ── POR QUE NÃO BASTA A VARREDURA ──────────────────────────────────────────
 *
 * `sincronizarConexoes` pergunta à Evolution a cada carregamento de tela. Entre
 * duas perguntas o socket pode cair, e é justamente aí que a atendente escreve
 * e leva o erro na cara — com o PIE achando que está tudo bem e, por isso, sem
 * mostrar faixa nenhuma.
 *
 * Foi o que aconteceu com a Boneca às 12h30: a instância dela constava `open`,
 * `caiu_em` nulo, e a mensagem não saiu. A varredura não tinha como saber; o
 * envio sabia.
 *
 * ── FALSO POSITIVO AQUI É BARATO ───────────────────────────────────────────
 *
 * Se a queda foi de um segundo e o socket já voltou, a próxima varredura
 * devolve `open` e a faixa some sozinha. Avisar de uma queda que passou custa
 * um susto; não avisar de uma queda que ficou custa a conversa inteira.
 */
export async function marcarQuedaPeloEnvio(
  instancia: string | null | undefined,
  erro: string,
): Promise<void> {
  const nome = (instancia ?? "").trim();
  if (!nome || !ehQuedaDeConexao(erro)) return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return;

  const db = criarServico(url, chave, { auth: { persistSession: false } });
  await db.rpc("marcar_conexao", { p_instancia: nome, p_estado: "close" });
}
