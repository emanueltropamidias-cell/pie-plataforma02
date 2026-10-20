"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function MetaCampanhaDialog({
  campanha,
  rotuloSugerido,
  metaAtual,
  meuId,
  aberto,
  onOpenChange,
}: {
  campanha: string | null;
  rotuloSugerido: string;
  metaAtual: number;
  meuId: string;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        {aberto && campanha && (
          <Form
            key={campanha}
            campanha={campanha}
            rotuloSugerido={rotuloSugerido}
            metaAtual={metaAtual}
            meuId={meuId}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Form({
  campanha,
  rotuloSugerido,
  metaAtual,
  meuId,
  onDone,
}: {
  campanha: string;
  rotuloSugerido: string;
  metaAtual: number;
  meuId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [rotulo, setRotulo] = useState(rotuloSugerido || "Resultados");
  const [meta, setMeta] = useState(String(metaAtual || ""));
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    const nMeta = Math.max(0, parseInt(meta || "0", 10) || 0);
    setSalvando(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("metas_campanha")
      .upsert({ campanha, rotulo: rotulo.trim() || null, meta: nMeta, criado_por: meuId }, { onConflict: "campanha" });
    setSalvando(false);
    if (error) return setErro(error.message);
    onDone();
    router.refresh();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Meta da campanha</DialogTitle>
      </DialogHeader>
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <div className="rounded-lg bg-tinta-50 px-3 py-2 text-[13px] text-tinta-600">
          Campanha: <b className="text-tinta-900">{campanha}</b>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="mc-rot">O que você quer medir</Label>
          <Input id="mc-rot" value={rotulo} onChange={(e) => setRotulo(e.target.value)} placeholder="Ex: Seguidores, Conversas, Cadastros" className="h-11" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="mc-meta">Meta (número)</Label>
          <Input id="mc-meta" type="number" inputMode="numeric" min={0} value={meta} onChange={(e) => setMeta(e.target.value)} placeholder="Ex: 10000" className="h-11 text-lg" />
        </div>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <DialogFooter>
          <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar meta"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
