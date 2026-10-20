"use client";

import { useState } from "react";
import { CompartilharLideranca } from "@/components/crm/compartilhar-lideranca";

export function PortalShare({
  linkCode,
  nome,
  mensagemQr,
}: {
  linkCode: string;
  nome: string;
  mensagemQr?: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-tema shadow-[0_1px_2px_rgba(22,32,46,0.04)] transition-colors hover:bg-white/90"
      >
        📤 Compartilhar meu link / QR
      </button>
      <CompartilharLideranca
        linkCode={linkCode}
        nome={nome}
        mensagemQr={mensagemQr}
        aberto={aberto}
        onOpenChange={setAberto}
      />
    </>
  );
}
