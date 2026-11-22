import Link from "next/link";
import { AtSign, BadgeCheck, CircleAlert, MapPinned } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { codificarId } from "@/lib/eleicao-arquivos";
import { Cabecalho, Cartao, Indicador } from "@/components/ui/pagina";

// Redes sociais dos políticos acompanhados (migração 0061).
//
// Primeiro passo visível do Dossiê do mandato (22/11/2026): os 77 deputados
// estaduais eleitos de MG e o Instagram de cada um. Os números (seguidores,
// posts) aparecem quando a coleta rodar — ela depende de META_ACCESS_TOKEN na
// Vercel (src/app/api/redes/instagram/route.ts).

export const dynamic = "force-dynamic";

type Perfil = {
  usuario: string;
  candidato: string | null;
  ano: number | null;
  uf: string | null;
  nome: string;
  partido: string | null;
  grupo: string | null;
  conferido: boolean;
  ultima_coleta: string | null;
  ultimo_erro: string | null;
};

type Foto = { usuario: string; dia: string; seguidores: number | null; posts: number | null };

const fmt = new Intl.NumberFormat("pt-BR");

export default async function RedesSociais() {
  const supabase = await createClient();
  const [{ data: perfis, error }, { data: fotos }] = await Promise.all([
    supabase.from("redes_perfis").select("*").order("nome"),
    supabase.from("redes_fotos").select("usuario,dia,seguidores,posts").order("dia", { ascending: false }),
  ]);

  // A foto mais recente de cada perfil.
  const ultima = new Map<string, Foto>();
  for (const f of (fotos ?? []) as Foto[]) if (!ultima.has(f.usuario)) ultima.set(f.usuario, f);

  // Um deputado pode ter dois @ (ALMG e TSE divergem): a linha é o deputado.
  const porDeputado = new Map<string, Perfil[]>();
  for (const p of (perfis ?? []) as Perfil[]) {
    const k = p.candidato ?? p.usuario;
    porDeputado.set(k, [...(porDeputado.get(k) ?? []), p]);
  }
  const linhas = [...porDeputado.values()];
  const deputados = linhas.length;
  const conferidos = linhas.filter((ps) => ps.some((p) => p.conferido)).length;
  const coletados = linhas.filter((ps) => ps.some((p) => ultima.has(p.usuario))).length;
  const contar = (g: string) => linhas.filter((ps) => ps[0].grupo?.startsWith(g)).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-3 py-4 sm:px-8 sm:py-8">
      <Cabecalho
        sobretitulo="Estratégia"
        titulo="Redes sociais"
        voltar="/estrategia"
        descricao="Deputados estaduais eleitos em MG em 2026 e o Instagram de cada um. Os números entram quando a coleta da Meta rodar."
      />

      {error && (
        <Cartao>
          <p className="px-5 py-4 text-[13px] text-red-600">Não foi possível ler os perfis: {error.message}</p>
        </Cartao>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Deputados" valor={fmt.format(deputados)} contexto={`${contar("reeleito")} reeleitos · ${contar("novato")} novos`} destaque />
        <Indicador rotulo="@ confirmados" valor={fmt.format(conferidos)} contexto="ALMG e TSE dão o mesmo @" />
        <Indicador rotulo="A conferir" valor={fmt.format(deputados - conferidos)} contexto="uma fonte só ou fontes divergentes" />
        <Indicador rotulo="Com números" valor={fmt.format(coletados)} contexto={coletados ? "coletados da Meta" : "aguardando o token da Meta"} />
      </div>

      <Cartao titulo="Deputados e perfis" descricao="Clique no @ para abrir o Instagram; em “votos” para abrir a Estratégia do deputado.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-b border-tinta-100 text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-tinta-500">
                <th className="px-5 py-2.5">Deputado</th>
                <th className="px-3 py-2.5">Situação</th>
                <th className="px-3 py-2.5">Instagram</th>
                <th className="px-3 py-2.5 text-right">Seguidores</th>
                <th className="px-3 py-2.5 text-right">Posts</th>
                <th className="px-5 py-2.5 text-right">Território</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((ps) => {
                const p = ps[0];
                const foto = ps.map((x) => ultima.get(x.usuario)).find(Boolean);
                const id = p.candidato && p.ano && p.uf ? codificarId(p.ano, p.uf, Number(p.candidato)) : null;
                return (
                  <tr key={p.candidato ?? p.usuario} className="border-b border-tinta-100 last:border-0 hover:bg-tinta-50/60">
                    <td className="px-5 py-2.5">
                      <span className="font-semibold text-tinta-900">{p.nome}</span>
                      {p.partido && <span className="ml-1.5 text-[11.5px] text-tinta-400">{p.partido}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-tinta-600">{p.grupo ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-0.5">
                        {ps.map((x) => (
                          <a
                            key={x.usuario}
                            href={`https://instagram.com/${x.usuario}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-tema hover:underline"
                            title={x.ultimo_erro ?? undefined}
                          >
                            <AtSign size={12} />
                            {x.usuario}
                            {x.conferido ? (
                              <BadgeCheck size={13} className="text-emerald-500" aria-label="confirmado" />
                            ) : (
                              <CircleAlert size={13} className="text-amber-500" aria-label="a conferir" />
                            )}
                          </a>
                        ))}
                      </div>
                    </td>
                    <td className="tabular px-3 py-2.5 text-right text-tinta-700">
                      {foto?.seguidores != null ? fmt.format(foto.seguidores) : "—"}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right text-tinta-700">
                      {foto?.posts != null ? fmt.format(foto.posts) : "—"}
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      {id ? (
                        <Link href={`/estrategia?c=${id}`} className="inline-flex items-center gap-1 text-tinta-500 hover:text-tema">
                          <MapPinned size={13} /> votos
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Cartao>
    </div>
  );
}
