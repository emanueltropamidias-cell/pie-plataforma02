"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { MunicipioBase } from "@/components/mapa/mapa-bahia";

// O mapa só existe depois que alguém pede por ele — mas o pedido começa antes
// do clique. Enquanto a pessoa olha a lista, o navegador vai buscando em
// segundo plano o código do mapa, a malha da Bahia e os números por município.
// Quando ela clica na aba, tudo já chegou.

const MapaBahia = dynamic(
  () => import("@/components/mapa/mapa-bahia").then((m) => m.MapaBahia),
  { ssr: false, loading: () => <Espera /> },
);

let territorioEmMemoria: MunicipioBase[] | null = null;
let territorioEmCurso: Promise<MunicipioBase[]> | null = null;

function carregarTerritorio(): Promise<MunicipioBase[]> {
  if (territorioEmMemoria) return Promise.resolve(territorioEmMemoria);
  if (territorioEmCurso) return territorioEmCurso;
  territorioEmCurso = fetch("/api/territorio")
    .then((r) => r.json())
    .then((j) => {
      territorioEmMemoria = (j.mapa ?? []) as MunicipioBase[];
      return territorioEmMemoria;
    })
    .finally(() => {
      territorioEmCurso = null;
    });
  return territorioEmCurso;
}

/** Começa a buscar tudo que o mapa precisa, sem travar a tela atual. */
export function aquecerMapa() {
  const ir = () => {
    carregarTerritorio().catch(() => {});
    import("@/components/mapa/mapa-bahia")
      .then((m) => m.carregarMalha())
      .catch(() => {});
  };
  // Só quando o navegador estiver ocioso: aquecer não pode atrapalhar quem
  // está rolando a lista agora.
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    (window as unknown as { requestIdleCallback: (f: () => void) => void }).requestIdleCallback(ir);
  } else {
    setTimeout(ir, 600);
  }
}

function Espera() {
  return (
    <div className="mt-6 animate-pulse rounded-xl border border-tinta-200 bg-white p-4">
      <div className="h-[420px] rounded-xl bg-tinta-100" />
    </div>
  );
}

export function MapaSobDemanda() {
  const [base, setBase] = useState<MunicipioBase[] | null>(territorioEmMemoria);

  useEffect(() => {
    if (territorioEmMemoria) return;
    let vivo = true;
    carregarTerritorio()
      .then((m) => vivo && setBase(m))
      .catch(() => vivo && setBase([]));
    return () => {
      vivo = false;
    };
  }, []);

  if (!base) return <Espera />;
  return (
    <div className="mt-6">
      <MapaBahia base={base} />
    </div>
  );
}
