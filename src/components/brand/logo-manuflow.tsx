import React from "react";

interface LogoManuFlowProps {
  className?: string;
  iconOnly?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  glow?: boolean;
}

export function LogoIcon({
  size = 36,
  glow = true,
  className = "",
}: {
  size?: number;
  glow?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Glow suave e dinâmico */}
      {glow && (
        <div
          className="absolute -inset-0.5 rounded-lg bg-cyan-500/25 blur-sm pointer-events-none transition-opacity duration-200"
          aria-hidden="true"
        />
      )}

      {/* Container mais quadrado (rounded-lg) */}
      <div
        className="relative flex items-center justify-center w-full h-full rounded-lg border border-white/20 shadow-md backdrop-blur-md overflow-hidden"
        style={{
          background: "linear-gradient(145deg, #0e1526 0%, #070a12 100%)",
        }}
      >
        <svg
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-[78%] h-[78%]"
        >
          {/* Asa Esquerda do M - Ciano vibrante */}
          <path
            d="M 6 27 L 6 12 L 14 20 L 14 27 Z"
            fill="#00F0FF"
          />
          {/* Asa Direita do M - Azul safira */}
          <path
            d="M 30 27 L 30 12 L 22 20 L 22 27 Z"
            fill="#3B82F6"
          />
          {/* Vértice Central / Seta de Fluxo Superior */}
          <polygon
            points="18,7 23.5,14.5 18,20 12.5,14.5"
            fill="#60A5FA"
          />
          {/* Destaque Specular Neon no centro */}
          <circle cx="18" cy="14.5" r="2.2" fill="#FFFFFF" />
          <circle cx="18" cy="24" r="1.8" fill="#00F0FF" />
        </svg>
      </div>
    </div>
  );
}

export function LogoManuFlow({
  className = "",
  iconOnly = false,
  size = "md",
  glow = true,
}: LogoManuFlowProps) {
  const pixelSizes = {
    sm: 28,
    md: 36,
    lg: 44,
    xl: 52,
  };

  const textSizes = {
    sm: "text-[15px]",
    md: "text-[17px]",
    lg: "text-[22px]",
    xl: "text-[28px]",
  };

  const px = pixelSizes[size];

  return (
    <div className={`group flex items-center gap-2.5 select-none ${className}`}>
      <LogoIcon size={px} glow={glow} />

      {!iconOnly && (
        <div className="flex flex-col min-w-0">
          <div className={`flex items-baseline font-bold tracking-tight text-white leading-none ${textSizes[size]}`}>
            <span className="font-extrabold tracking-[-0.03em] text-white">
              Manu
            </span>
            <span className="text-cyan-400 font-black tracking-[-0.02em]">
              Flow
            </span>
            <span className="ml-1 inline-block h-1.5 w-1.5 rounded-sm bg-cyan-400 shadow-[0_0_6px_#00F0FF]" />
          </div>
          <span className="font-semibold uppercase text-zinc-400 text-[9px] tracking-[0.16em] mt-1">
            Intelligence &amp; Flow
          </span>
        </div>
      )}
    </div>
  );
}
