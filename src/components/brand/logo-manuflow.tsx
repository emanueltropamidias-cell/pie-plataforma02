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
      {/* Ambient neon backglow inspired by Apple Spatial / Liquid Glass */}
      {glow && (
        <div
          className="absolute -inset-1 rounded-2xl bg-gradient-to-tr from-cyan-500/30 via-blue-600/35 to-violet-600/30 blur-md opacity-80 pointer-events-none transition-all duration-300 group-hover:opacity-100 group-hover:blur-lg"
          aria-hidden="true"
        />
      )}

      {/* Glassy backdrop tile */}
      <div className="relative flex items-center justify-center w-full h-full rounded-xl bg-gradient-to-b from-white/[0.12] to-white/[0.03] border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_8px_20px_rgba(0,0,0,0.4)] backdrop-blur-md overflow-hidden">
        {/* Specular glass reflection diagonal */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.08] to-transparent pointer-events-none" />

        <svg
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-[72%] h-[72%] transition-transform duration-300 group-hover:scale-105"
        >
          <defs>
            {/* Primary flow gradient: Electric Cyan -> Royal Sapphire -> Deep Violet */}
            <linearGradient id="mf_flow_primary" x1="4" y1="8" x2="44" y2="42" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#00F0FF" />
              <stop offset="35%" stopColor="#38BDF8" />
              <stop offset="70%" stopColor="#2563EB" />
              <stop offset="100%" stopColor="#7C3AED" />
            </linearGradient>

            {/* Secondary ribbon gradient for depth and weave */}
            <linearGradient id="mf_flow_secondary" x1="40" y1="8" x2="8" y2="40" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#60A5FA" />
              <stop offset="50%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#1D4ED8" />
            </linearGradient>

            {/* Specular highlight on curve top */}
            <linearGradient id="mf_specular" x1="12" y1="6" x2="36" y2="24" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Fluid geometric "M" ribbon */}
          {/* Left sweeping ascending wave */}
          <path
            d="M 9 37 C 9 37, 7 21, 15 13 C 21 7, 23 17, 24 23 C 25 17, 27 7, 33 13 C 41 21, 39 37, 39 37"
            stroke="url(#mf_flow_primary)"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Lower interconnected infinity flow loop */}
          <path
            d="M 14 34 C 18 29, 21 31, 24 33 C 27 31, 30 29, 34 34"
            stroke="url(#mf_flow_secondary)"
            strokeWidth="3.5"
            strokeLinecap="round"
            opacity="0.9"
          />

          {/* Upper specular glossy crest */}
          <path
            d="M 12 16 C 16 10, 20 12, 24 19 C 28 12, 32 10, 36 16"
            stroke="url(#mf_specular)"
            strokeWidth="1.8"
            strokeLinecap="round"
            opacity="0.75"
          />

          {/* Central luminous energy node */}
          <circle cx="24" cy="23" r="2.2" fill="#00F0FF" />
          <circle cx="24" cy="23" r="4.5" fill="#38BDF8" opacity="0.4" />
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
    xl: 56,
  };

  const textSizes = {
    sm: "text-base",
    md: "text-lg",
    lg: "text-2xl",
    xl: "text-3xl",
  };

  const subSizes = {
    sm: "text-[9px] tracking-[0.14em]",
    md: "text-[10px] tracking-[0.18em]",
    lg: "text-[11px] tracking-[0.2em]",
    xl: "text-[12px] tracking-[0.22em]",
  };

  const px = pixelSizes[size];

  return (
    <div className={`group flex items-center gap-3 select-none ${className}`}>
      <LogoIcon size={px} glow={glow} />

      {!iconOnly && (
        <div className="flex flex-col min-w-0">
          <div className={`flex items-baseline font-bold tracking-tight text-white ${textSizes[size]}`}>
            <span className="font-extrabold tracking-[-0.03em] text-white group-hover:text-cyan-50 transition-colors">
              Manu
            </span>
            <span className="bg-gradient-to-r from-sky-400 via-blue-400 to-indigo-300 bg-clip-text text-transparent font-black tracking-[-0.02em]">
              Flow
            </span>
            <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] animate-pulse" />
          </div>
          <span className={`font-semibold uppercase text-zinc-400/80 -mt-0.5 ${subSizes[size]}`}>
            Intelligence & Flow
          </span>
        </div>
      )}
    </div>
  );
}
