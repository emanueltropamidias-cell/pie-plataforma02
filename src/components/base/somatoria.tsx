"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

// A somatória das bases, com escolha de quais entram.
//
// ── O NÚMERO GRANDE NUNCA É UMA SOMA ────────────────────────────────────────
//
// Somar as gavetas conta duas vezes quem está em duas. Medido em 28/09: a
// "Agenda dos aparelhos" tem 3.237 pessoas que também estão no Mandato 2023, e
// a base "Apoiadores" inteira já está na campanha, porque foi montada a partir
// das conversas. Somando dá 71.651; pessoas diferentes são 63.425.
//
// O número inflado é justamente o que alguém repete numa reunião. Por isso o
// grande é o de pessoas distintas, e a soma simples aparece do lado, explicada.
//
// ── POR QUE A ESCOLHA É INSTANTÂNEA ─────────────────────────────────────────
//
// `bases_venn` (0042) devolve as REGIÕES do diagrama: quantas pessoas existem
// em cada combinação exata de bases. São nove linhas. O total de qualquer
// seleção é a soma das regiões que tocam a seleção — conta que roda aqui, em
// memória, sem ida ao banco a cada clique.
//
// ── O QUE "A CAMPANHA" SIGNIFICA AQUI ───────────────────────────────────────
//
// Duas coisas, e só elas: os cadastros (fichas de liderança) e quem já
// conversou com algum número.
//
// A agenda dos 19 aparelhos NÃO entra nessa definição — ela virou base externa
// separada em 28/09, e aparece como uma gaveta própria. Alguém do mandato de
// 2023 salvo num telefone, que nunca escreveu para a campanha, conta como
// "fora dos cadastros e das conversas". Pela definição do número ele está;
// pela leitura apressada, não.

export type Somatoria = {
  campanha: number;
  externas: { id: string; nome: string; situacao: string; pessoas: number; novas: number }[];
  soma: number;
  unicas: number;
  em_mais_de_uma: number;
  fora_da_campanha: number;
};

export type Venn = {
  bases: { id: string; nome: string; nota: string }[];
  regioes: { bases: string[]; pessoas: number }[];
};

const n = (v: unknown) => Number(v ?? 0).toLocaleString("pt-BR");

export function SomatoriaBases({ s, venn }: { s: Somatoria; venn?: Venn | null }) {
  const linhas = [
    { chave: "campanha", nome: "Base da campanha", pessoas: s.campanha, nota: "Cadastros e quem conversou", href: "/base" },
    ...s.externas.map((b) => ({
      chave: b.id,
      nome: b.nome,
      pessoas: b.pessoas,
      nota: `${n(b.novas)} fora dos cadastros e das conversas${b.situacao !== "pronta" ? " · incompleta" : ""}`,
      href: `/base/externas/${b.id}`,
    })),
  ];
  const maior = Math.max(1, ...linhas.map((l) => l.pessoas));

  // Começa com tudo marcado: assim a primeira olhada mostra o mesmo número de
  // sempre, e a escolha é uma ferramenta de quem quiser usá-la — não uma tela
  // que nasce pedindo configuração.
  const [marcadas, setMarcadas] = useState<Set<string>>(
    () => new Set(linhas.map((l) => l.chave)),
  );

  const conta = useMemo(() => {
    if (!venn) return null;
    let unicas = 0;
    let soma = 0;
    let emMaisDeUma = 0;
    for (const r of venn.regioes) {
      // Quais das bases desta região estão marcadas.
      const dentro = r.bases.filter((b) => marcadas.has(b));
      if (dentro.length === 0) continue;
      // A pessoa conta UMA vez se pelo menos uma das bases dela está marcada.
      unicas += Number(r.pessoas);
      // A soma simples conta uma vez por base marcada em que ela está — é
      // exatamente o número inflado, e é ele que precisa aparecer ao lado
      // para a diferença ficar visível.
      soma += Number(r.pessoas) * dentro.length;
      if (dentro.length > 1) emMaisDeUma += Number(r.pessoas);
    }
    return { unicas, soma, emMaisDeUma };
  }, [venn, marcadas]);

  // Sem `bases_venn` no banco (instalação desatualizada), a tela continua
  // mostrando os números de sempre e esconde as caixinhas — em vez de quebrar.
  const podeEscolher = conta !== null;
  const unicas = conta?.unicas ?? s.unicas;
  const soma = conta?.soma ?? s.soma;
  const emMaisDeUma = conta?.emMaisDeUma ?? s.em_mais_de_uma;
  const todas = marcadas.size === linhas.length;

  function alternar(chave: string) {
    setMarcadas((antes) => {
      const novo = new Set(antes);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

  return (
    <section className="min-w-0 rounded-xl border border-tinta-200 bg-white shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-tinta-100 px-5 py-4">
        <div>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-tema">
            {todas ? "Todas as bases" : `${marcadas.size} de ${linhas.length} bases`}
          </span>
          <p className="tabular mt-1 text-[32px] font-extrabold leading-none tracking-[-0.03em] text-tinta-900">
            {n(unicas)} <span className="text-[14px] font-semibold text-tinta-500">pessoas diferentes</span>
          </p>
        </div>
        <p className="max-w-[420px] text-[12.5px] leading-relaxed text-tinta-500">
          {marcadas.size === 0 ? (
            <>Nenhuma base marcada. Marque as que quiser somar.</>
          ) : (
            <>
              Somando base por base dá <b className="text-tinta-800">{n(soma)}</b>.{" "}
              {emMaisDeUma > 0 ? (
                <>
                  A diferença é porque <b className="text-tinta-800">{n(emMaisDeUma)}</b> pessoas estão em
                  mais de uma das bases marcadas — aqui cada telefone conta uma vez.
                </>
              ) : (
                <>Ninguém está em mais de uma das bases marcadas.</>
              )}
            </>
          )}
        </p>
      </div>

      {s.externas.length > 0 && (
        <p className="border-b border-tinta-100 px-5 pb-3 pt-3 text-[11.5px] leading-relaxed text-tinta-500">
          &quot;Fora dos cadastros e das conversas&quot; compara com as fichas e
          com quem já escreveu para algum número da campanha.
          {podeEscolher && (
            <>
              {" "}
              <b className="text-tinta-700">Desmarque uma base</b> para tirá-la da
              conta de cima — quem está em duas continua contando uma vez só.
            </>
          )}
        </p>
      )}

      <ul className="px-5 py-3">
        {linhas.map((l) => {
          const marcada = marcadas.has(l.chave);
          return (
            <li key={l.chave} className="flex items-center gap-3 rounded-md py-2 hover:bg-tinta-50">
              {podeEscolher && (
                /* Fora do <Link>: clicar na caixinha muda a conta, não navega.
                   Dentro dele, cada marcação levaria a pessoa para outra tela. */
                <input
                  type="checkbox"
                  checked={marcada}
                  onChange={() => alternar(l.chave)}
                  aria-label={`Contar ${l.nome}`}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--tema)]"
                />
              )}
              <Link
                href={l.href}
                className={`flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 ${
                  marcada ? "" : "opacity-45"
                }`}
              >
                <span className="w-full min-w-0 sm:w-56">
                  <span className="block truncate text-[13px] font-semibold text-tinta-900">{l.nome}</span>
                  <span className="block truncate text-[11.5px] text-tinta-500">{l.nota}</span>
                </span>
                <span className="h-2 min-w-0 flex-1 rounded-full bg-tinta-100">
                  <span className="block h-2 rounded-full bg-tema" style={{ width: `${(l.pessoas / maior) * 100}%` }} />
                </span>
                <span className="tabular w-16 shrink-0 text-right text-[13px] font-bold text-tinta-900">
                  {n(l.pessoas)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {podeEscolher && !todas && (
        <div className="border-t border-tinta-100 px-5 py-2.5">
          <button
            onClick={() => setMarcadas(new Set(linhas.map((l) => l.chave)))}
            className="text-[12.5px] font-semibold text-tema hover:underline"
          >
            Marcar todas de novo
          </button>
        </div>
      )}
    </section>
  );
}
