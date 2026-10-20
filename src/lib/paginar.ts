// O PostgREST (Supabase) devolve no máximo 1000 linhas por consulta, em silêncio:
// não há erro nem aviso, a resposta simplesmente vem cortada. Em tabela que cresce
// todo dia — métricas de tráfego, por exemplo — isso vira total errado na tela.
//
// `paginar` repete a consulta em blocos até acabar. Uso:
//
//   const registros = await paginar<Metrica>((de, ate) =>
//     supabase.from("metricas_trafego").select("...").order("data").range(de, ate),
//   );

const TAMANHO = 1000;
const MAX_BLOCOS = 200; // trava de segurança: 200 mil linhas

export async function paginar<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<T[]> {
  const linhas: T[] = [];
  for (let bloco = 0; bloco < MAX_BLOCOS; bloco++) {
    const de = bloco * TAMANHO;
    const { data, error } = await consulta(de, de + TAMANHO - 1);
    if (error) break; // devolve o que já veio em vez de derrubar a página
    const lote = (data ?? []) as T[];
    linhas.push(...lote);
    if (lote.length < TAMANHO) break;
  }
  return linhas;
}
