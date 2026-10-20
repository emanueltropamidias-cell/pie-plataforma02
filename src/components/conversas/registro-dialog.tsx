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

export type Registro = {
  id: string;
  data: string;
  turno: string;
  enviados: number;
  apoios: number;
  outras_devolutivas: number;
  restricao: boolean;
  observacoes: string | null;
  criado_por: string | null;
  criador_nome?: string | null;
};

function hojeISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function RegistroDialog({
  registro,
  meuId,
  aberto,
  onOpenChange,
}: {
  registro?: Registro | null;
  meuId: string;
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        {aberto && (
          <FormRegistro
            key={registro?.id ?? "novo"}
            registro={registro ?? null}
            meuId={meuId}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FormRegistro({
  registro,
  meuId,
  onDone,
}: {
  registro: Registro | null;
  meuId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const editando = !!registro;

  const [data, setData] = useState(registro?.data ?? hojeISO());
  const [turno, setTurno] = useState(registro?.turno ?? "manha");
  const [enviados, setEnviados] = useState(String(registro?.enviados ?? ""));
  const [apoios, setApoios] = useState(String(registro?.apoios ?? ""));
  const [outras, setOutras] = useState(String(registro?.outras_devolutivas ?? ""));
  const [restricao, setRestricao] = useState(registro?.restricao ?? false);
  const [obs, setObs] = useState(registro?.observacoes ?? "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const nEnv = Math.max(0, parseInt(enviados || "0", 10) || 0);
  const nApo = Math.max(0, parseInt(apoios || "0", 10) || 0);
  const nOut = Math.max(0, parseInt(outras || "0", 10) || 0);
  const semRetorno = Math.max(0, nEnv - nApo - nOut);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!data) return setErro("Informe a data.");
    if (nApo + nOut > nEnv)
      return setErro("Retornos positivos + outras devolutivas não pode passar de enviados.");
    setSalvando(true);
    const supabase = createClient();
    const dados = {
      data,
      turno,
      enviados: nEnv,
      apoios: nApo,
      outras_devolutivas: nOut,
      restricao,
      observacoes: obs.trim() || null,
    };
    let error;
    if (editando && registro) {
      ({ error } = await supabase.from("registros_disparo").update(dados).eq("id", registro.id));
    } else {
      ({ error } = await supabase.from("registros_disparo").insert({ ...dados, criado_por: meuId }));
    }
    setSalvando(false);
    if (error) return setErro(error.message);
    onDone();
    router.refresh();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editando ? "Editar registro" : "Novo registro do dia"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="rg-data">Data</Label>
            <Input id="rg-data" type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-12" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rg-turno">Turno</Label>
            <select
              id="rg-turno"
              value={turno}
              onChange={(e) => setTurno(e.target.value)}
              className="h-12 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
            >
              <option value="manha">Manhã</option>
              <option value="tarde">Tarde</option>
              <option value="outro">Outro</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="rg-env">Enviados</Label>
          <Input id="rg-env" type="number" inputMode="numeric" min={0} value={enviados} onChange={(e) => setEnviados(e.target.value)} placeholder="0" className="h-12 text-lg" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="rg-apo">Retornos positivos</Label>
            <Input id="rg-apo" type="number" inputMode="numeric" min={0} value={apoios} onChange={(e) => setApoios(e.target.value)} placeholder="0" className="h-12 text-lg" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rg-out">Outras devolutivas</Label>
            <Input id="rg-out" type="number" inputMode="numeric" min={0} value={outras} onChange={(e) => setOutras(e.target.value)} placeholder="0" className="h-12 text-lg" />
          </div>
        </div>

        <div className="rounded-lg bg-tinta-50 px-4 py-2.5 text-sm text-tinta-600">
          Sem retorno (calculado): <b className="text-tinta-900">{semRetorno.toLocaleString("pt-BR")}</b>
        </div>

        <label className="flex items-center gap-3 rounded-lg border border-tinta-200 px-4 py-3">
          <input type="checkbox" checked={restricao} onChange={(e) => setRestricao(e.target.checked)} className="h-5 w-5 accent-[#EB388A]" />
          <span className="text-sm font-medium text-tinta-700">Fui restringida neste turno</span>
        </label>

        <div className="flex flex-col gap-2">
          <Label htmlFor="rg-obs">Observações</Label>
          <textarea id="rg-obs" value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Opcional" className="rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring" />
        </div>

        {erro && <p className="text-sm text-red-600">{erro}</p>}

        <DialogFooter>
          <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={salvando}>
            {salvando ? "Salvando..." : editando ? "Salvar alterações" : "Salvar registro"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
