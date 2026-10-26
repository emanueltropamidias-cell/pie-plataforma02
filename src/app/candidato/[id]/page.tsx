import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin } from "lucide-react";
import { candidatoPorId, contasDe, fichaDe, raioX, trajetoriaDe } from "@/lib/eleicao-arquivos";
import { municipiosDaUf } from "@/lib/estados";
import { ondeDisputa } from "@/lib/eleicao";
import { FotoUrna } from "@/components/estrategia/seletor-candidatos";
import { SeloResultado } from "@/components/estrategia/comum";
import { fmt, pct, reais } from "@/lib/formato";
import { MapaVotos } from "@/components/estrategia/mapa-votos";

// Página pública de um candidato: o resultado oficial do TSE, para qualquer
// pessoa, sem login.
//
// É a porta de entrada da plataforma aberta: quem procura "votos de Fulano
// em 2022" no Google chega aqui, e a análise completa (comparar, quociente,
// cruzamento com a própria base) fica um clique adiante, no login.
//
// Só dados públicos do TSE. Nada da base de nenhuma campanha passa por aqui.

export const revalidate = 3600;

type Params = { params: Promise<{ id: string }> };

async function ler(idTexto: string) {
  const id = Number(idTexto);
  if (!Number.isFinite(id)) return null;
  return candidatoPorId(id);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const c = await ler((await params).id);
  if (!c) return { title: "Candidato não encontrado" };
  const titulo = `${c.nome_urna} (${c.partido_sigla}) · ${c.cargo.toLowerCase()} ${c.ano} · ${ondeDisputa(c)}`;
  const descricao = `${c.nome_urna} teve ${fmt(c.total_votos)} votos para ${c.cargo.toLowerCase()} em ${c.ano} (${ondeDisputa(c)}). Resultado: ${c.situacao.toLowerCase()}. Votação por município, dados oficiais do TSE.`;
  return {
    title: titulo,
    description: descricao,
    openGraph: { title: titulo, description: descricao, type: "profile", images: c.foto_url ? [c.foto_url] : undefined },
  };
}

function idade(nascimento: string, ano: number) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(nascimento);
  return m ? ano - Number(m[3]) : null;
}

export default async function PaginaCandidato({ params }: Params) {
  const id = Number((await params).id);
  const c = await ler(String(id));
  if (!c) notFound();

  const [r, ficha, trajetoria, contas] = await Promise.all([raioX(id), fichaDe(id), trajetoriaDe(id), contasDe(id)]);
  if (!r) notFound();

  const ufMapa = c.uf === "BR" ? "BA" : c.uf;
  const votosNoMapa = Object.values(r.votos_por_municipio).reduce((s, v) => s + v, 0);
  const tot = r.totais_unidade;
  const pctValidos = tot?.validos && c.uf !== "BR" ? (votosNoMapa / tot.validos) * 100 : null;
  const municipal = c.cargo === "VEREADOR" || c.cargo === "PREFEITO";
  const cidades = Object.keys(r.votos_por_municipio).length;
  const anos = ficha ? idade(ficha.nascimento, c.ano) : null;

  return (
    <main className="min-h-screen bg-tinta-50 text-tinta-900">
      <header className="border-b border-tinta-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-1.5 text-[14px] font-extrabold tracking-tight text-tinta-900">
            <MapPin size={16} className="text-tema" /> ManuFlow
          </Link>
          <Link href="/login" className="rounded-lg bg-tema px-3 py-1.5 text-[12.5px] font-bold text-white">
            Entrar
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6 sm:py-10">
        <section className="flex flex-col gap-4 rounded-2xl border border-tinta-200 bg-white p-5 sm:flex-row sm:items-center sm:p-6">
          <FotoUrna src={c.foto_url} nome={c.nome_urna} tamanho={104} className="border-2" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-tema">
              Eleições {c.ano} · {c.cargo.toLowerCase()} · {ondeDisputa(c)}
            </p>
            <h1 className="mt-1 break-words text-[26px] font-extrabold leading-tight tracking-tight sm:text-[32px]">{c.nome_urna}</h1>
            <p className="mt-0.5 text-[13px] text-tinta-500">
              {c.nome_completo} · {c.partido_sigla} {c.numero}
              {ficha?.chapa && ficha.chapa !== c.partido_sigla ? ` · ${ficha.chapa}` : ""}
            </p>
            <div className="mt-2">
              <SeloResultado situacao={c.situacao} segundo={c.segundo_turno} />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Numero rotulo="Votos" valor={fmt(c.total_votos)} nota={c.uf === "BR" ? "no Brasil" : `em ${cidades} ${cidades === 1 ? "cidade" : "cidades"}`} />
          <Numero rotulo="Dos válidos" valor={pctValidos !== null ? pct(pctValidos) : "—"} nota={municipal ? `em ${c.nm_ue}` : `em ${c.uf === "BR" ? ufMapa : c.uf}`} />
          {municipal ? (
            <Numero rotulo="Eleitores aptos" valor={tot?.aptos ? fmt(tot.aptos) : "—"} nota={`em ${c.nm_ue}`} />
          ) : (
            <Numero rotulo="Presença" valor={municipiosDaUf(ufMapa) ? pct((cidades / municipiosDaUf(ufMapa)) * 100, 0) : "—"} nota={`dos municípios de ${ufMapa}`} />
          )}
          <Numero
            rotulo="Custo por voto"
            valor={contas?.custoPorVoto ? reais(contas.custoPorVoto) : "—"}
            nota={contas?.declarou ? `${reais(contas.despesas)} declarados` : "contas não importadas"}
          />
        </section>

        <section className="grid gap-5 lg:grid-cols-12">
          <div className="min-w-0 rounded-2xl border border-tinta-200 bg-white p-4 sm:p-5 lg:col-span-7">
            <h2 className="mb-3 text-[15px] font-extrabold">Votos por município{c.uf === "BR" ? ` em ${ufMapa}` : ""}</h2>
            <MapaVotos uf={ufMapa} votosPorMunicipio={r.votos_por_municipio} base={r.base_por_municipio} ano={c.ano} />
          </div>
          <div className="min-w-0 rounded-2xl border border-tinta-200 bg-white p-4 sm:p-5 lg:col-span-5">
            <h2 className="mb-3 text-[15px] font-extrabold">Onde teve mais votos</h2>
            <ol className="space-y-2">
              {r.top_municipios.slice(0, 12).map((m, i) => {
                const b = r.base_por_municipio?.[m.municipio];
                return (
                  <li key={m.municipio} className="flex min-w-0 items-center gap-3 text-[13px]">
                    <span className="tabular w-5 shrink-0 text-[11px] font-bold text-tinta-400">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{m.municipio}</span>
                    <span className="shrink-0 text-right">
                      <span className="tabular block font-bold">{fmt(m.votos)}</span>
                      {b?.aptos ? <span className="tabular block text-[11px] text-tinta-500">{pct((m.votos / b.aptos) * 100, 2)} do eleitorado</span> : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-tinta-200 bg-white p-4 sm:p-5">
            <h2 className="mb-3 text-[15px] font-extrabold">Trajetória</h2>
            {trajetoria.length > 1 ? (
              <ul className="space-y-1.5">
                {trajetoria
                  .filter((t) => t.turno === 1)
                  .map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/candidato/${t.id}`}
                        className={`flex min-w-0 items-center gap-3 rounded-xl border p-2.5 text-[12.5px] transition hover:bg-tinta-50 ${t.id === c.id ? "border-blue-300 bg-blue-50" : "border-tinta-200"}`}
                      >
                        <span className="tabular w-10 shrink-0 font-bold">{t.ano}</span>
                        <span className="min-w-0 flex-1 truncate">
                          {t.cargo.toLowerCase()} · {ondeDisputa(t)} · {t.partido_sigla}
                        </span>
                        <span className="tabular shrink-0 font-bold">{fmt(t.total_votos)}</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-[13px] text-tinta-500">Única candidatura desta pessoa entre 2022, 2024 e 2026.</p>
            )}
          </div>
          <div className="rounded-2xl border border-tinta-200 bg-white p-4 sm:p-5">
            <h2 className="mb-3 text-[15px] font-extrabold">Ficha da candidatura</h2>
            {ficha ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
                <Item rotulo="Idade na eleição" valor={anos ? `${anos} anos` : "—"} />
                <Item rotulo="Gênero" valor={ficha.genero.toLowerCase()} />
                <Item rotulo="Instrução" valor={ficha.instrucao.toLowerCase()} />
                <Item rotulo="Ocupação" valor={ficha.ocupacao.toLowerCase()} />
              </dl>
            ) : (
              <p className="text-[13px] text-tinta-500">Ficha ainda não importada.</p>
            )}
          </div>
        </section>

        <section className="flex flex-col items-start justify-between gap-4 rounded-2xl bg-tinta-900 p-5 text-tinta-50 sm:flex-row sm:items-center sm:p-6">
          <div>
            <p className="text-[16px] font-extrabold">Compare, veja o quociente e cruze com a sua base</p>
            <p className="mt-1 text-[13px] text-tinta-300">
              Na plataforma: quantos votos faltaram, onde cresceu desde a última eleição, mapa contra adversários e perguntas
              em português sobre os dados.
            </p>
          </div>
          <Link href={`/login?proximo=${encodeURIComponent(`/estrategia?c=${c.id}`)}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-tema px-4 py-2.5 text-[13px] font-bold text-white">
            Abrir análise completa <ArrowRight size={15} />
          </Link>
        </section>

        <p className="text-[11.5px] leading-relaxed text-tinta-500">
          Fonte: Tribunal Superior Eleitoral, dados abertos (votação por município e zona, eleitorado, candidaturas e
          prestação de contas). Votos nominais válidos do {c.turno}º turno.{c.ano === 2026 ? " Prestação de contas de 2026 ainda no prazo legal." : ""}
        </p>
      </div>
    </main>
  );
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div className="rounded-xl border border-tinta-200 bg-white px-4 py-3.5">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-tinta-500">{rotulo}</p>
      <p className="tabular mt-1 text-[22px] font-extrabold">{valor}</p>
      <p className="text-[11.5px] text-tinta-500">{nota}</p>
    </div>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-[10.5px] font-bold uppercase tracking-wider text-tinta-500">{rotulo}</dt>
      <dd className="mt-0.5 font-semibold first-letter:uppercase">{valor}</dd>
    </div>
  );
}
