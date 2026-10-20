import Link from "next/link";
import { redirect } from "next/navigation";
import { Upload, Smartphone, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Cabecalho } from "@/components/ui/pagina";
import { Button } from "@/components/ui/button";
import { SomatoriaBases, type Somatoria, type Venn } from "@/components/base/somatoria";
import { CATEGORIA_BASE, type BaseExterna } from "@/lib/bases-externas";

// Outras bases: a antiga de Talita, a de Manassés, as das dobradinhas.
//
// Cada uma é uma gaveta. Os números de cada cartão são só daquela base; a
// somatória no topo (0030) apenas conta todas juntas, sem mover ninguém. É o pedido: "sem se misturarem em hipótese alguma"
// (supabase/migrations/0029_bases_externas.sql explica como isso é garantido).

export const dynamic = "force-dynamic";

const n = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR");

export default async function OutrasBases() {
  const supabase = await createClient();
  const [{ data }, { data: admin }, { data: soma }, venn] = await Promise.all([
    supabase.rpc("bases_externas_lista"),
    supabase.rpc("perfil_admin"),
    supabase.rpc("bases_somatoria"),
    // As regiões do diagrama, para a escolha de bases ser instantânea. Vem na
    // mesma carga; um erro aqui só tira as caixinhas, sem derrubar a tela.
    supabase.rpc("bases_venn"),
  ]);
  // Nulo = não é da equipe.
  if (data == null) redirect("/base");
  const bases = data as BaseExterna[];

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-6 py-7 md:px-8">
      <Cabecalho
        voltar="/base"
        sobretitulo="Base"
        titulo="Outras bases"
        descricao="Bases de fora da campanha, cada uma separada. A somatória só conta — não junta ninguém."
        acoes={
          admin ? (
            <div className="flex flex-wrap gap-2">
              {/* ── AS OUTRAS BASES NUM ARQUIVO SÓ ───────────────────────
                  29/09: "tem que ter a opção de baixar todas as bases
                  completas". Baixar as gavetas e juntar no Excel repete
                  gente — 58.017 linhas para 53.326 pessoas. Aqui cada uma
                  aparece uma vez, com a coluna dizendo de onde veio.

                  DIZIA "Baixar todas", e não trazia todas: a base da
                  campanha ficava de fora. 02/10, Emanuel: "de 81 mil está
                  vindo somente 63k". O arquivo com TUDO mora na tela de
                  Base, que é onde a base da campanha está. */}
              {bases.length > 1 && (
                <a
                  href="/api/base/externas/exportar-tudo"
                  download
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-tinta-200 bg-white px-3.5 text-[13px] font-semibold text-tinta-700 transition-colors hover:border-tema hover:text-tema"
                >
                  <Download size={15} /> Baixar as outras bases
                </a>
              )}
              {/* Aqui a desduplicação pesa mais que em qualquer outro botão: o
                  arquivo junta TODAS as bases, e a mesma pessoa está em mais de
                  uma por definição. */}
              {bases.length > 1 && (
                <a
                  href="/api/base/externas/exportar-tudo?formato=numeros"
                  download
                  title="Uma coluna com a contagem e outra com DDI + DDD + telefone, sem repetidos"
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-tinta-200 bg-white px-3.5 text-[13px] font-semibold text-tinta-700 transition-colors hover:border-tema hover:text-tema"
                >
                  <Download size={15} /> Só os números
                </a>
              )}
              {/* Dois caminhos para a mesma gaveta: planilha de base, e agenda
                  exportada de um celular — que é limpa e separada na entrada. */}
              <Link href="/base/agenda">
                <Button variant="outline">
                  <Smartphone size={15} /> Importar agenda
                </Button>
              </Link>
              <Link href="/base/externas/subir">
                <Button>
                  <Upload size={15} /> Subir base
                </Button>
              </Link>
            </div>
          ) : null
        }
      />

      {soma && bases.length > 0 && (
        <SomatoriaBases s={soma as Somatoria} venn={(venn.data as Venn | null) ?? null} />
      )}

      {bases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-tinta-300 bg-white px-6 py-10 text-center">
          <p className="text-sm font-semibold text-tinta-800">Nenhuma base subida ainda</p>
          <p className="mt-1 text-[12.5px] text-tinta-500">
            {admin
              ? "Suba a planilha da base antiga, de um parceiro ou de uma dobradinha. Ela fica numa gaveta própria."
              : "Quando a coordenação subir uma base, ela aparece aqui."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {bases.map((b) => (
            <Link
              key={b.id}
              href={`/base/externas/${b.id}`}
              className="min-w-0 rounded-xl border border-tinta-200 bg-white px-5 py-4 transition-colors hover:border-tema"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-tinta-400">
                    {CATEGORIA_BASE[b.categoria] ?? b.categoria}
                  </span>
                  <h2 className="truncate text-[15px] font-bold text-tinta-900">{b.nome}</h2>
                </div>
                {b.situacao !== "pronta" && (
                  <span className="shrink-0 rounded-full border border-[#f0dcc0] bg-[#fdf6ea] px-2 py-0.5 text-[10.5px] font-bold text-[#a35a00]">
                    Incompleta
                  </span>
                )}
              </div>
              <p className="tabular mt-2 text-[26px] font-extrabold leading-none tracking-[-0.02em] text-tinta-900">
                {n(b.pessoas)} <span className="text-[13px] font-semibold text-tinta-500">pessoas com telefone</span>
              </p>
              {/* ── DUAS FRASES, PORQUE SÃO DOIS TIPOS DE BASE ──────────────
                  Base de planilha traz cidade, e aí "completos na Bahia" é a
                  informação certa. Base vinda de agenda de WhatsApp NÃO traz
                  cidade nenhuma — o WhatsApp guarda nome e número — e a frase
                  de cima virava "0 completos · 704 sem município", que
                  descreve a base inteira pelo que ela não tem. O Emanuel
                  perguntou duas vezes se estava quebrada.

                  Quando ninguém declarou cidade, o cartão mostra o que se
                  sabe: o DDD. Ele não é prova de residência, e o texto diz
                  isso — mas é melhor que zero. */}
              {b.completos === 0 && (b.ddd_bahia ?? 0) > 0 ? (
                <p className="mt-2 text-[12px] leading-relaxed text-tinta-500">
                  {n(b.ddd_bahia)} com DDD da Bahia
                  {(b.ddd_fora ?? 0) > 0 && <> · {n(b.ddd_fora)} de fora</>}
                  <span className="block text-[11.5px] text-tinta-400">
                    Sem cidade: agenda de WhatsApp guarda nome e número, não endereço.
                  </span>
                </p>
              ) : (
                <p className="mt-2 text-[12px] leading-relaxed text-tinta-500">
                  {n(b.completos)} completos na Bahia · {n(b.sem_municipio)} sem município · {n(b.so_numero)} só o número
                  {b.outro_estado > 0 && <> · {n(b.outro_estado)} outro estado</>}
                  {b.sem_telefone > 0 && <> · {n(b.sem_telefone)} sem telefone</>}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
