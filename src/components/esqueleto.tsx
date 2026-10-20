// Esqueleto de carregamento.
//
// Sem ele, clicar numa aba deixa a tela anterior parada até o servidor
// responder — e parado é lido como travado. Com ele, o clique responde na
// hora e o conteúdo entra em cima do desenho.

export function Esqueleto({ blocos = 6 }: { blocos?: number }) {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-5 py-8 sm:px-8 sm:py-10">
      <div className="h-3 w-24 rounded bg-tinta-200" />
      <div className="mt-3 h-8 w-64 rounded bg-tinta-200" />
      <div className="mt-2 h-4 w-80 rounded bg-tinta-100" />

      <div className="mt-8 grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-tinta-200 bg-tinta-50" />
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-2.5 rounded-xl border border-tinta-200 bg-white p-5">
        {Array.from({ length: blocos }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-4 w-40 rounded bg-tinta-100" />
            <div className="h-2.5 flex-1 rounded-full bg-tinta-100" />
            <div className="h-4 w-12 rounded bg-tinta-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
