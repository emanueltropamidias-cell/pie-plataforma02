import { createClient } from "@/lib/supabase/server";
import { paginar } from "@/lib/paginar";
import { contatosDaInstancia, telefoneDoJid } from "@/lib/evolution";

// A agenda do WhatsApp, em planilha.
//
// ── O QUE É ISTO, E O QUE NÃO É ─────────────────────────────────────────────
//
// São os contatos que o aparelho conhece — 5.223 no número da Boneca. A maior
// parte NÃO é lead da campanha: é a agenda pessoal de anos que veio junto
// quando o número foi pareado.
//
// Por isso este endereço EXPORTA e não importa. Ver a lista numa planilha é
// útil; jogar 5 mil pessoas na caixa das meninas destruiria a fila, que é a
// ferramenta de trabalho delas.
//
// Só supervisão: é a agenda inteira de um número da campanha, com nome e
// telefone de todo mundo que já falou com ele.
//
// ── O QUE FAZ ABRIR CERTO NO EXCEL EM PORTUGUÊS ─────────────────────────────
//
// BOM no começo, senão "João" vira "JoÃ£o". Ponto e vírgula, senão tudo cai
// numa coluna só. E ="digitos" no telefone, senão treze dígitos viram notação
// científica e o número se perde.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function csv(v: string | null | undefined) {
  return `"${(v ?? "").replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: podeMexer } = await supabase.rpc("perfil_supervisao");
  if (!podeMexer)
    return new Response("Só a coordenação exporta a agenda.", { status: 403 });

  const p = new URL(req.url).searchParams;
  const instancia = (p.get("i") ?? "").trim();
  // `so=lead` devolve apenas quem já apareceu no PIE — quem de fato falou com a
  // campanha. Sem isso vêm os 4.500 contatos antigos junto.
  const soLead = p.get("so") === "lead";

  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(instancia))
    return new Response("Número inválido.", { status: 400 });

  const r = await contatosDaInstancia(instancia);
  if (!r.ok) return new Response(`A Evolution não respondeu: ${r.erro}`, { status: 502 });

  // Quem já é conversa no PIE. Uma consulta paginada, e não uma por contato.
  //
  // Era `select("telefone")` sem mais nada, e o PostgREST corta em mil sem
  // avisar. Com 890 conversas isso ainda não tinha aparecido — a partir de mil,
  // toda conversa acima do corte seria exportada como "não está no PIE".
  //
  // O estrago seria de operação, não de tela: alguém olharia a planilha,
  // concluiria que aquela gente nunca foi atendida, e mandaria abordagem fria
  // para quem já é apoiador.
  const conhecidas = await paginar<{ telefone: string | null }>((de, ate) =>
    supabase.from("conversas").select("telefone").order("id").range(de, ate),
  );
  const noPie = new Set(
    conhecidas.map((c) => (c.telefone ?? "").replace(/\D/g, "").slice(-11)),
  );

  const vistos = new Set<string>();
  const linhas: string[] = [];

  for (const c of r.dados ?? []) {
    const jid = String(c.remoteJid ?? "");
    const dom = jid.split("@")[1] ?? "";
    // Grupo, transmissão e o contato de sistema do WhatsApp não são pessoa.
    if (dom !== "s.whatsapp.net" && dom !== "lid") continue;
    if (c.isGroup) continue;

    const tel = telefoneDoJid(jid);
    if (!tel || tel.length < 12 || tel.length > 15) continue;

    const chave = tel.slice(-11);
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    const jaNoPie = noPie.has(chave);
    if (soLead && !jaNoPie) continue;

    linhas.push(
      [
        csv((c.pushName ?? "").trim()),
        `="${tel}"`,
        csv(jaNoPie ? "sim" : "não"),
      ].join(";"),
    );
  }

  // ── O TOTAL, EM DOIS LUGARES ──────────────────────────────────────────────
  //
  // No NOME DO ARQUIVO, porque quem baixa três recortes na mesma pasta precisa
  // distinguir sem abrir nenhum.
  //
  // E no FIM DA PLANILHA, depois de uma linha em branco: é lá que a pessoa
  // rola para procurar o total. A linha em branco não é enfeite — sem ela o
  // Excel trata o resumo como mais um contato ao ordenar, e o "TOTAL" vai
  // parar no meio da lista em ordem alfabética.
  const noPieQtd = linhas.filter((l) => l.endsWith(';"sim"')).length;

  const resumo = [
    ';;',
    [csv("TOTAL DE CONTATOS"), csv(String(linhas.length)), '""'].join(";"),
    [csv("Já estão no PIE"), csv(String(noPieQtd)), '""'].join(";"),
    [csv("Só na agenda do aparelho"), csv(String(linhas.length - noPieQtd)), '""'].join(";"),
  ];

  const texto =
    "﻿" +
    [
      ["Nome", "Telefone", "Já está no PIE"].map(csv).join(";"),
      ...linhas,
      ...resumo,
    ].join("\r\n");

  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Bahia" });
  const nome = `contatos-${instancia}${soLead ? "-do-pie" : ""}-${linhas.length}-${hoje.replace(/\//g, "-")}.csv`;

  return new Response(texto, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
