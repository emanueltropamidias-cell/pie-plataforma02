// A marca do produto: o pino de mapa com o "M" (símbolo B, escolhido em
// 20/10/2026) e o nome ManuFlow.
//
// Desenhada em código, e não PNG: nítida em qualquer tamanho, e o nome herda
// a cor do texto (`currentColor`), então a mesma peça serve no menu escuro e no
// claro sem duas versões de arquivo.
//
// É a marca da PLATAFORMA. A da campanha (src/lib/candidato.ts, MARCA) continua
// existindo para o que é dela: capa do login e páginas públicas.

export function SimboloManuFlow({ tamanho = 32, className }: { tamanho?: number; className?: string }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="manuflow-pino" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5B86FF" />
          <stop offset="1" stopColor="#2440C8" />
        </linearGradient>
      </defs>
      <path
        d="M32 4 C19 4 10 13.5 10 25.5 C10 41 32 60 32 60 C32 60 54 41 54 25.5 C54 13.5 45 4 32 4 Z"
        fill="url(#manuflow-pino)"
      />
      <path
        d="M22 33 V19 L32 28 L42 19 V33"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LogoManuFlow({
  tamanho = 30,
  className = "",
  semNome = false,
}: {
  tamanho?: number;
  className?: string;
  semNome?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} aria-label="ManuFlow" role="img">
      <SimboloManuFlow tamanho={tamanho} />
      {!semNome && (
        <span
          className="font-titulo font-extrabold tracking-[-0.03em]"
          style={{ fontSize: Math.round(tamanho * 0.62) }}
        >
          Manu<span className="font-normal opacity-70">Flow</span>
        </span>
      )}
    </span>
  );
}
