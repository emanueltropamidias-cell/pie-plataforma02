"use client";

import type { LugarVotado } from "@/lib/votos-zonas";
import { corDoVoto, FAIXAS } from "@/lib/rampa-votos";

// Os locais de votação, do maior para o menor.
//
// Eram bolhas soltas dentro do contorno da cidade, e aquilo tinha dois defeitos.
// O de cara: os nomes de escola se atropelavam e não dava para ler nenhum. O
// mais grave: a posição fingia geografia que não existe — o TSE não publica
// coordenada de local de votação, então cada bolha estava num lugar inventado.
// Num desenho usado para decidir onde botar gente, posição inventada é pior do
// que posição nenhuma.
//
// Vinte e seis nomes com um número cada é barra ordenada, não mapa. Nome à
// esquerda, barra à direita, todos legíveis, nada inventado.
//
// A cor é a mesma rampa do mapa de bairros: 40 votos pintam igual aqui e lá. Ela
// é redundante com o comprimento da barra de propósito — é o que costura as duas
// telas, e faz a zona 12 aparecer no mapa como o que ela é, um pedaço pequeno.
//
// Sobre a coluna de porcentagem: ela é a fatia do local nos votos VÁLIDOS DA
// ZONA, não a fatia da Talita dentro daquele local. Dá para provar pela própria
// tabela — votos ÷ porcentagem dá o mesmo ~121 nos 26 locais, e isso só acontece
// com divisor único para a zona inteira. Então ela ordena igual ao voto e não
// acrescenta ranking nenhum; fica como referência de tamanho, em cinza, sem a
// promessa de "força" que ela não cumpre.

export function LocaisVotacao({ locais }: { locais: LugarVotado[] }) {
  if (!locais.length) return null;

  const ordenados = [...locais].sort((a, b) => b.votos - a.votos || a.nome.localeCompare(b.nome, "pt-BR"));
  const maior = ordenados[0].votos || 1;
  const total = ordenados.reduce((s, l) => s + l.votos, 0);

  return (
    <div>
      {/* A cor é a mesma escala do mapa de bairros. Repetir a legenda aqui é o
          que deixa a comparação entre as duas telas ser feita a olho. */}
      <div className="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-tinta-500">
        <span className="font-semibold text-tinta-600">Mesma escala do mapa:</span>
        {FAIXAS.map((f) => (
          <span key={f.rotulo} className="inline-flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-sm ring-1 ring-inset ring-black/10"
              style={{ background: f.cor }}
            />
            {f.rotulo}
          </span>
        ))}
      </div>

      <div className="rounded-xl bg-tinta-50 px-3 py-3 sm:px-4">
        <div className="max-h-[440px] space-y-[3px] overflow-y-auto pr-1">
          {ordenados.map((l, i) => (
            <div key={l.nome} className="flex items-center gap-2.5">
              <span className="tabular w-5 shrink-0 text-right text-[10.5px] text-tinta-300">
                {i + 1}
              </span>
              <span
                className="w-[38%] shrink-0 truncate text-[11.5px] leading-tight text-tinta-700"
                title={l.nome}
              >
                {l.nome}
              </span>
              <span className="h-[13px] min-w-0 flex-1 rounded-[3px] bg-tinta-200/60">
                <span
                  className="block h-full rounded-[3px]"
                  style={{
                    width: `${Math.max(2, (l.votos / maior) * 100)}%`,
                    background: corDoVoto(l.votos),
                  }}
                />
              </span>
              <span className="tabular w-8 shrink-0 text-right text-[12px] font-bold text-tinta-900">
                {l.votos}
              </span>
              <span className="tabular hidden w-12 shrink-0 text-right text-[11px] text-tinta-400 sm:block">
                {l.share.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-tinta-400">
        {ordenados.length} locais somando {total.toLocaleString("pt-BR")} votos. Não há mapa aqui
        porque o TSE não publica coordenada de local de votação, e ponto no lugar errado seria pior
        do que ponto nenhum. A porcentagem é a fatia do local nos votos válidos da zona — ordena
        igual ao voto, então serve de tamanho, não de ranking.
      </p>
    </div>
  );
}
