// O aviso de "esta parte do banco não existe", num lugar só.
//
// ── POR QUE VIROU COMPONENTE ────────────────────────────────────────────────
//
// Onze telas tinham cada uma a sua versão do mesmo recado, e cada uma mandava
// rodar um arquivo diferente: `supabase/kits.sql`, `supabase/etiquetas.sql`,
// `supabase/fluxo.sql`. Quando os 75 arquivos viraram histórico, as onze
// passaram a ensinar um caminho que não existe mais — e a ensinar o gesto que
// justamente causava o problema que o histórico documenta: rodar arquivo solto
// por cima do banco.
//
// O mesmo fato escrito em onze lugares sempre desencontra. Agora é um.
//
// ── E POR QUE O RECADO MUDOU ────────────────────────────────────────────────
//
// Antes, tabela faltando era normal: o banco crescia arquivo a arquivo, e cada
// tela pedia o seu. Hoje o banco inteiro sai de `supabase/migrations/`, então
// tabela faltando quer dizer outra coisa — a instalação não terminou. O recado
// tem de apontar para isso, e não para um remendo.

export function FaltaInstalar({ oQue }: { oQue: string }) {
  return (
    <p className="rounded-xl border border-dashed border-tinta-300 bg-white/60 p-8 text-center text-[12.5px] leading-relaxed text-tinta-500">
      <b className="text-tinta-700">{oQue} ainda não existe no banco.</b>
      <br />
      Esta instalação do PIE está incompleta — falta aplicar as migrações de{" "}
      <code className="rounded bg-tinta-100 px-1">supabase/migrations/</code>.
    </p>
  );
}
