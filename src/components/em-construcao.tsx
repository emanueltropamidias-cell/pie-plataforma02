export function EmConstrucao({
  titulo,
  descricao,
}: {
  titulo: string;
  descricao: string;
}) {
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-tema">
        Em construção
      </span>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-tinta-900">
        {titulo}
      </h1>
      <p className="mt-1 text-sm text-tinta-500">{descricao}</p>

      <div className="mt-8 flex min-h-[320px] items-center justify-center rounded-xl border border-dashed border-tinta-300 bg-white/60 text-center">
        <div>
          <p className="text-4xl">🚧</p>
          <p className="mt-3 text-sm font-semibold text-tinta-700">
            Essa tela vai ser reconstruída fiel ao PIE.
          </p>
          <p className="mt-1 text-[13px] text-tinta-500">
            Faz parte do porte que está em andamento.
          </p>
        </div>
      </div>
    </div>
  );
}
