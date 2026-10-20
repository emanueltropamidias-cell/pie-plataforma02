"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type Metrica = {
  id: string;
  data: string;
  campanha: string | null;
  alcance: number;
  impressoes: number;
  cliques: number;
  gasto: number;
  resultados: number;
  tipo_resultado: string | null;
  objetivo?: string | null;
  status?: string | null;
  frequencia?: number | null;
  orcamento?: number | null;
  fonte?: string | null;
  criado_por: string | null;
  /** Conta de anúncio de onde veio. Nulo em lançamento manual. */
  conta_id?: string | null;
};

function hojeISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function MetricaDialog({
  metrica,
  meuId,
  aberto,
  onOpenChange,
}: {
  metrica?: Metrica | null;
  meuId: string;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        {aberto && (
          <FormMetrica
            key={metrica?.id ?? "novo"}
            metrica={metrica ?? null}
            meuId={meuId}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormMetrica({
  metrica,
  meuId,
  onDone,
}: {
  metrica: Metrica | null;
  meuId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const editando = !!metrica;

  const [data, setData] = useState(metrica?.data ?? hojeISO());
  const [campanha, setCampanha] = useState(metrica?.campanha ?? "");
  const [alcance, setAlcance] = useState(String(metrica?.alcance ?? ""));
  const [impressoes, setImpressoes] = useState(String(metrica?.impressoes ?? ""));
  const [cliques, setCliques] = useState(String(metrica?.cliques ?? ""));
  const [gasto, setGasto] = useState(String(metrica?.gasto ?? ""));
  const [resultados, setResultados] = useState(String(metrica?.resultados ?? ""));
  const [tipoResultado, setTipoResultado] = useState(metrica?.tipo_resultado ?? "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const num = (s: string) => Math.max(0, parseInt(s || "0", 10) || 0);
  const dec = (s: string) => Math.max(0, parseFloat((s || "0").replace(",", ".")) || 0);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!data) return setErro("Informe a data.");
    setSalvando(true);
    const supabase = createClient();
    const dados = {
      data,
      campanha: campanha.trim() || null,
      alcance: num(alcance),
      impressoes: num(impressoes),
      cliques: num(cliques),
      gasto: dec(gasto),
      resultados: num(resultados),
      tipo_resultado: tipoResultado.trim() || null,
    };
    let error;
    if (editando && metrica) {
      ({ error } = await supabase.from("metricas_trafego").update(dados).eq("id", metrica.id));
    } else {
      ({ error } = await supabase.from("metricas_trafego").insert({ ...dados, criado_por: meuId }));
    }
    setSalvando(false);
    if (error) return setErro(error.message);
    onDone();
    router.refresh();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editando ? "Editar métrica" : "Nova métrica de tráfego"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="mt-data">Data</Label>
            <Input id="mt-data" type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-11" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mt-camp">Campanha</Label>
            <Input id="mt-camp" value={campanha} onChange={(e) => setCampanha(e.target.value)} placeholder="Nome da campanha" className="h-11" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="mt-gasto">Investimento (R$)</Label>
            <Input id="mt-gasto" inputMode="decimal" value={gasto} onChange={(e) => setGasto(e.target.value)} placeholder="0,00" className="h-11" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mt-alc">Alcance</Label>
            <Input id="mt-alc" type="number" inputMode="numeric" min={0} value={alcance} onChange={(e) => setAlcance(e.target.value)} placeholder="0" className="h-11" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="mt-imp">Impressões</Label>
            <Input id="mt-imp" type="number" inputMode="numeric" min={0} value={impressoes} onChange={(e) => setImpressoes(e.target.value)} placeholder="0" className="h-11" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mt-cli">Cliques</Label>
            <Input id="mt-cli" type="number" inputMode="numeric" min={0} value={cliques} onChange={(e) => setCliques(e.target.value)} placeholder="0" className="h-11" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="mt-res">Resultados</Label>
            <Input id="mt-res" type="number" inputMode="numeric" min={0} value={resultados} onChange={(e) => setResultados(e.target.value)} placeholder="0" className="h-11" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="mt-tipo">Tipo de resultado</Label>
            <Input id="mt-tipo" value={tipoResultado} onChange={(e) => setTipoResultado(e.target.value)} placeholder="Ex: Mensagens" className="h-11" />
          </div>
        </div>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <DialogFooter>
          <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={salvando}>
            {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Salvar métrica"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
