import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Cabecalho, Cartao } from "@/components/ui/pagina";
import { ApagarBase } from "@/components/base/apagar-base";
import { CATEGORIA_BASE, type BaseExternaResumo } from "@/lib/bases-externas";

// Uma outra base, sozinha. Todo número aqui é só dela
// (`base_externa_resumo` filtra por id) — a mesma régua de tipos da Central da
// base, aplicada dentro desta gaveta.

export const dynamic = "force-dynamic";

const n = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR");

const TOM = {
  bom: "border-[#cbe3d4] bg-[#f1f8f3] text-[#12703c]",
  atencao: "border-[#f0dcc0] bg-[#fdf6ea] text-[#a35a00]",
  neutro: "border-tinta-200 bg-white text-tinta-900",
};

export default async function OutraBase({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data }, { data: admin }] = await Promise.all([
    supabase.rpc("base_externa_resumo", { p_base: id }),
    supabase.rpc("perfil_admin"),
  ]);
  if (data == null) notFound();
  const b = data as BaseExternaResumo;

  const exportar = `/api/base/externas/${b.id}/exportar`;
  // ── A AGENDA MOSTRA OUTROS NÚMEROS QUE A PLANILHA ───────────────────────
  //
  // 29/09: "deixe também uma opção mostrando quantas pessoas vieram no
  // arquivo".
  //
  // Base de planilha tem cidade, e aí "completos na Bahia" é a leitura certa.
  // Base vinda de agenda de celular não tem cidade NENHUMA — o vCard guarda
  // nome e telefone — então aqueles quatro quadros mostravam 0, 0, 0 e 0, e o
  // que interessa (quanto veio, quanto ficou, quantos são daqui) não aparecia
  // em lugar nenhum.
  //
  // `veioDeAgenda` decide qual conjunto mostrar. O critério é o que a base
  // tem, não o nome dela: nenhuma cidade reconhecida e telefone em todo mundo.
  const veioDeAgenda = b.completos === 0 && (b.ddd_bahia ?? 0) > 0;

  const numeros = veioDeAgenda
    ? [
        { rotulo: "Veio no arquivo", valor: b.linhas_arquivo, tom: "neutro" as const, tipo: "", nota: "Contatos lidos do celular" },
        { rotulo: "Entraram na base", valor: b.pessoas, tom: "bom" as const, tipo: "", nota: "Depois de limpar e tirar repetidos" },
        { rotulo: "DDD da Bahia", valor: b.ddd_bahia ?? 0, tom: "bom" as const, tipo: "ddd_bahia", nota: "Baixar só estes" },
        { rotulo: "DDD de fora", valor: b.ddd_fora ?? 0, tom: "neutro" as const, tipo: "ddd_fora", nota: "Baixar só estes" },
      ]
    : [
    { rotulo: "1 · Completos na Bahia", valor: b.completos, tom: "bom" as const, tipo: "completos", nota: "Nome, telefone e município daqui" },
    { rotulo: "2 · Sem município", valor: b.sem_municipio, tom: "atencao" as const, tipo: "sem_municipio", nota: "Com coluna do que está a corrigir" },
    { rotulo: "3 · Só o número", valor: b.so_numero, tom: "atencao" as const, tipo: "so_numero", nota: "Telefone sem nome" },
    { rotulo: "Outro estado", valor: b.outro_estado, tom: "neutro" as const, tipo: "outro_estado", nota: "Pela cidade escrita na base" },
  ];
  const maior = Math.max(1, ...b.municipios.map((m) => m.qtd));

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-6 py-7 md:px-8">
      <Cabecalho
        voltar="/base/externas"
        sobretitulo={`Outras bases · ${CATEGORIA_BASE[b.categoria] ?? b.categoria}`}
        titulo={b.nome}
        descricao={
          <>
            {n(b.pessoas)} pessoas com telefone, cada telefone contado uma vez — só nesta base.
            {b.descricao && <> {b.descricao}.</>}
            <span className="block text-[12px] text-tinta-400">
              {b.arquivo && <>{b.arquivo} · </>}
              {n(b.linhas_arquivo)} linhas no arquivo · subida em{" "}
              {new Date(b.criada_em).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" })}
              {b.criada_por && <> por {b.criada_por}</>}
            </span>
          </>
        }
        acoes={
          /* ── TRÊS BOTÕES, PORQUE A PERGUNTA NA HORA DE BAIXAR É OUTRA ─────
             29/09, Emanuel: "você deixa duas opções: baixar base completa,
             baixar base só Bahia."

             A separação não acontece mais na importação — a agenda de alguém
             é UMA coisa, e quebrá-la em duas gavetas inventaria uma divisão
             que não existe no celular de ninguém. Ela acontece aqui, que é
             onde ela importa: quem vai trabalhar a lista decide na hora.

             Por DDD, e não por cidade: agenda de celular não traz município. */
          <div className="flex flex-wrap items-center gap-2">
            {(b.ddd_bahia ?? 0) > 0 && (b.ddd_fora ?? 0) > 0 && (
              <>
                <a
                  href={`${exportar}?tipo=ddd_bahia`}
                  download
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-tinta-200 bg-white px-3.5 text-[13px] font-semibold text-tinta-700 hover:border-tema hover:text-tema"
                >
                  <Download size={15} /> Só Bahia · {n(b.ddd_bahia)}
                </a>
                <a
                  href={`${exportar}?tipo=ddd_fora`}
                  download
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-tinta-200 bg-white px-3.5 text-[13px] font-semibold text-tinta-700 hover:border-tema hover:text-tema"
                >
                  <Download size={15} /> Só de fora · {n(b.ddd_fora)}
                </a>
              </>
            )}
            <a
              href={exportar}
              download
              className="inline-flex h-9 items-center gap-2 rounded-md bg-tema px-4 text-[13px] font-semibold text-white"
            >
              <Download size={15} /> Base completa · {n(b.pessoas)}
            </a>
            {/* Só a contagem e o telefone com DDI, sem repetidos. Outro uso, e
                por isso outro botão: a planilha completa serve para FALAR com a
                pessoa; esta, para alimentar público da Meta ou disparador. */}
            <a
              href={`${exportar}?formato=numeros`}
              download
              title="Uma coluna com a contagem e outra com DDI + DDD + telefone, sem repetidos"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-tinta-200 bg-white px-3.5 text-[13px] font-semibold text-tinta-700 hover:border-tema hover:text-tema"
            >
              <Download size={15} /> Só os números
            </a>
          </div>
        }
      />

      {b.situacao !== "pronta" && (
        <div className="rounded-lg border border-[#f0dcc0] bg-[#fdf6ea] px-4 py-3 text-[13px] text-[#8a4a10]">
          <b>Esta base não terminou de subir.</b> Os números abaixo são parciais. Apague e suba o arquivo de novo.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {numeros.map((x) => (
          /* Quadro sem tipo é informação, não botão: "veio no arquivo" e
             "entraram na base" não filtram nada, e virar link de download
             baixaria a base inteira duas vezes com nomes diferentes. */
          <a
            key={x.rotulo}
            href={x.tipo ? `${exportar}?tipo=${x.tipo}` : undefined}
            download={x.tipo ? true : undefined}
            title={x.tipo ? `Exportar: ${x.nota}` : x.nota}
            className={`group rounded-lg border px-4 py-3.5 ${x.tipo ? "transition-colors hover:border-tema" : "cursor-default"} ${TOM[x.tom]}`}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-80">{x.rotulo}</span>
            <div className="tabular mt-1 text-[27px] font-extrabold leading-none tracking-[-0.02em]">{n(x.valor)}</div>
            <span className={`mt-1.5 flex items-center gap-1 text-[11.5px] text-tinta-500 ${x.tipo ? "group-hover:text-tema" : ""}`}>
              {x.tipo && <Download size={12} />} {x.nota}
            </span>
          </a>
        ))}
      </div>

      {(b.sem_telefone > 0 || b.a_corrigir > 0) && (
        <p className="text-[12.5px] leading-relaxed text-tinta-500">
          {b.a_corrigir > 0 && (
            <>
              <b className="text-tinta-800">{n(b.a_corrigir)}</b> das sem município têm algo escrito que não é cidade.{" "}
            </>
          )}
          {b.sem_telefone > 0 && (
            <>
              <b className="text-tinta-800">{n(b.sem_telefone)}</b> linhas não têm telefone e ficam fora do total —{" "}
              <a href={`${exportar}?tipo=sem_telefone`} download className="text-tema underline underline-offset-2">
                exportar essas
              </a>
              .
            </>
          )}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Cartao titulo="Onde esta base está" descricao={`${n(b.municipios.length)} de 417 municípios da Bahia`}>
          {b.municipios.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-tinta-500">Nenhum município da Bahia reconhecido nesta base.</p>
          ) : (
            <ol className="max-h-[440px] overflow-y-auto px-5 py-3">
              {b.municipios.map((m, i) => (
                <li key={m.nome} className="flex items-center gap-3 py-1.5 text-[13px]">
                  <span className="tabular w-7 shrink-0 text-right text-[11.5px] text-tinta-400">{i + 1}</span>
                  <span className="w-44 shrink-0 truncate text-tinta-800">{m.nome}</span>
                  <span className="h-2 min-w-0 flex-1 rounded-full bg-tinta-100">
                    <span className="block h-2 rounded-full bg-tema" style={{ width: `${(m.qtd / maior) * 100}%` }} />
                  </span>
                  <span className="tabular w-14 shrink-0 text-right font-semibold text-tinta-900">{n(m.qtd)}</span>
                </li>
              ))}
            </ol>
          )}
        </Cartao>

        <div className="flex flex-col gap-4">
          {b.a_corrigir_lista.length > 0 && (
            <Cartao titulo="Município a corrigir" descricao="O que veio escrito e não é cidade">
              <ul className="max-h-[260px] overflow-y-auto px-5 py-3">
                {b.a_corrigir_lista.map((m) => (
                  <li key={m.nome} className="flex justify-between gap-3 py-1 text-[12.5px]">
                    <span className="truncate text-tinta-700">{m.nome}</span>
                    <span className="tabular text-tinta-500">{n(m.qtd)}</span>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}
          {b.extras.length > 0 && (
            <Cartao titulo="Outras colunas guardadas" descricao="Voltam na exportação">
              <p className="px-5 py-3 text-[12.5px] leading-relaxed text-tinta-600">{b.extras.join(" · ")}</p>
            </Cartao>
          )}
          {admin && (
            <div className="flex">
              <ApagarBase id={b.id} nome={b.nome} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
