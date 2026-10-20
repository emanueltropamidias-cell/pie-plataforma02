"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

// Apagar é para sempre, então pede o nome da base digitado. Apaga só esta
// gaveta: `base_externa_apagar` recebe o id e não alcança a base da campanha.
export function ApagarBase({ id, nome }: { id: string; nome: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [digitado, setDigitado] = useState("");
  const [apagando, setApagando] = useState(false);
  const [erro, setErro] = useState("");

  async function apagar() {
    setApagando(true);
    setErro("");
    const { error } = await createClient().rpc("base_externa_apagar", { p_base: id });
    if (error) {
      setApagando(false);
      return setErro(error.message);
    }
    router.push("/base/externas");
    router.refresh();
  }

  if (!aberto)
    return (
      <Button variant="outline" onClick={() => setAberto(true)}>
        <Trash2 size={15} /> Apagar base
      </Button>
    );

  const confere = digitado.trim().toLowerCase() === nome.trim().toLowerCase();
  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-[#f3d3d3] bg-[#fdf1f1] p-4">
      <p className="text-[13px] text-[#8a1c1c]">
        Isto apaga <b>{nome}</b> inteira, para sempre. A base da campanha e as outras bases não são tocadas. Para
        confirmar, digite o nome da base:
      </p>
      <input
        value={digitado}
        onChange={(e) => setDigitado(e.target.value)}
        className="h-10 rounded-md border border-input bg-white px-3 text-[13px] outline-none"
        autoFocus
      />
      <div className="flex gap-2">
        <Button variant="destructive" disabled={!confere || apagando} onClick={apagar}>
          {apagando ? "Apagando…" : "Apagar para sempre"}
        </Button>
        <Button variant="outline" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
      {erro && <p className="text-[12.5px] text-red-700">{erro}</p>}
    </div>
  );
}
