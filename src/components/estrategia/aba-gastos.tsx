"use client";

import { Wallet } from "lucide-react";
import { ondeDisputa } from "@/lib/eleicao";
import type { RaioXCandidato } from "@/components/estrategia/painel-estrategia-eleitoral";
import { CAIXA, Carregando, SemDado, Titulo, fmt, reais, useExtra } from "./comum";

// Quanto a campanha declarou ao TSE e quanto custou cada voto.
//
// Fonte: prestação de contas eleitorais dos candidatos (receitas e despesas
// contratadas). É o que o candidato DECLAROU — inclui doação estimável (bem ou
// serviço cedido, sem dinheiro) e não inclui o que não foi declarado. Para
// 2026 a prestação final ainda está no prazo: o número pode subir.

type Contas = {
  receitas: number;
  despesas: number;
  declarou: boolean;
  custoPorVoto: number | null;
  eleitosComparados: number;
  medianaDespesaEleitos: number | null;
  medianaCustoEleitos: number | null;
};

export function AbaGastos({ raioX }: { raioX: RaioXCandidato }) {
  const c = raioX.candidato;
  const d = useExtra<Contas>(c.id, "contas");
  if (d === undefined) return <div className={CAIXA}><Carregando linhas={3} /></div>;
  if (!d)
    return (
      <div className={CAIXA}>
        <SemDado>A prestação de contas de {c.ano} em {c.uf} ainda não foi importada.</SemDado>
      </div>
    );

  const parcial = c.ano === 2026;
  const vsMediana = d.medianaDespesaEleitos && d.despesas ? d.despesas / d.medianaDespesaEleitos : null;

  return (
    <div className={CAIXA}>
      <Titulo
        icone={<Wallet size={13} />}
        sobre={`Prestação de contas · ${c.ano} · ${ondeDisputa(c)}`}
        titulo={d.declarou ? `${reais(d.despesas)} em despesas contratadas` : "Nenhuma prestação de contas encontrada"}
        nota={
          parcial
            ? "2026: a prestação final das contas ainda está no prazo do TSE. Os valores podem crescer."
            : "Valores declarados pelo candidato ao TSE."
        }
      />
      {d.declarou ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Caixa rotulo="Receitas" valor={reais(d.receitas)} />
            <Caixa rotulo="Despesas" valor={reais(d.despesas)} />
            <Caixa
              rotulo="Custo por voto"
              valor={d.custoPorVoto ? reais(d.custoPorVoto) : "—"}
              nota={`${fmt(c.total_votos)} votos`}
            />
            <Caixa
              rotulo="Eleitos (mediana)"
              valor={d.medianaCustoEleitos ? reais(d.medianaCustoEleitos) : "—"}
              nota={d.eleitosComparados ? `por voto, entre ${d.eleitosComparados} eleitos do cargo` : "sem eleitos para comparar"}
            />
          </div>
          {vsMediana && (
            <p className="mt-4 rounded-xl bg-tinta-50 p-3.5 text-[12.5px] leading-relaxed text-tinta-700">
              {c.nome_urna} gastou <b>{vsMediana >= 1 ? `${vsMediana.toFixed(1).replace(".", ",")}×` : `${Math.round(vsMediana * 100)}%`}</b>{" "}
              {vsMediana >= 1 ? "o" : "do"} gasto mediano dos eleitos para {c.cargo.toLowerCase()} em {ondeDisputa(c)} (
              {reais(d.medianaDespesaEleitos!)}).
              {d.custoPorVoto && d.medianaCustoEleitos
                ? ` Cada voto saiu por ${reais(d.custoPorVoto)}, contra ${reais(d.medianaCustoEleitos)} na mediana dos eleitos.`
                : ""}
            </p>
          )}
        </>
      ) : (
        <SemDado>
          O TSE não tem receita nem despesa declarada para esta candidatura — comum em candidatura indeferida ou que
          desistiu antes da eleição.
        </SemDado>
      )}
    </div>
  );
}

function Caixa({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-xl border border-tinta-200 bg-white p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-tinta-500">{rotulo}</p>
      <p className="tabular mt-0.5 text-lg font-extrabold text-tinta-900">{valor}</p>
      {nota && <p className="text-[10.5px] leading-snug text-tinta-500">{nota}</p>}
    </div>
  );
}
