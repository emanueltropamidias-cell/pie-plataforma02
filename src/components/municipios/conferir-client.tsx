"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MapPin, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { MUNICIPIOS_BA } from "@/lib/municipios-ba";
import type { Divergencia } from "@/lib/conferir-municipios";
import { Cabecalho } from "@/components/ui/pagina";

// Cada linha é uma grafia que não bate com a lista oficial, com a correção
// sugerida ao lado. Nada muda sem alguém mandar: a sugestão sai de semelhança
// de texto, e semelhança erra — "Barra" e "Barra do Choça" são cidades
// diferentes, e trocar uma pela outra estraga o dado em vez de arrumar.

/**
 * O que sobra do texto quando se tira o nome do município.
 *
 * "SÁO TOMÉ CAMPO FORMOSO" menos "Campo Formoso" é "SÁO TOMÉ" — o povoado.
 * Devolve nulo quando não sobra nada, porque aí a linha era só o município
 * escrito torto e não há povoado nenhum a guardar.
 */
function nomeDoPovoado(bruto: string, municipio: string): string | null {
  const sem = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const alvo = sem(municipio);
  const palavras = bruto.trim().split(/\s+/);
  const restantes: string[] = [];

  // Tira as palavras do município de onde elas estiverem — o nome da cidade
  // tanto vem no fim ("São Tomé Campo Formoso") quanto no começo.
  const doMunicipio = new Set(alvo.split(" "));
  for (const p of palavras) {
    if (doMunicipio.has(sem(p))) continue;
    restantes.push(p);
  }

  if (restantes.length === 0) return null;

  // Caixa de nome próprio, preservando acento: "SÁO TOMÉ" -> "Sáo Tomé".
  // Erro de digitação do original NÃO é corrigido aqui — adivinhar grafia é
  // como se inventa dado.
  const MENORES = new Set(["de", "da", "do", "das", "dos", "e"]);
  return restantes
    .map((p, i) => {
      const b = p.toLowerCase();
      if (i > 0 && MENORES.has(sem(b))) return b;
      return b.charAt(0).toUpperCase() + b.slice(1);
    })
    .join(" ");
}

export function ConferirClient({
  divergencias,
  reconhecidos,
}: {
  divergencias: Divergencia[];
  reconhecidos: number;
}) {
  const router = useRouter();
  const [escolhas, setEscolhas] = useState<Record<string, string>>(
    Object.fromEntries(
      divergencias.filter((d) => d.sugestao).map((d) => [d.valor, d.sugestao!]),
    ),
  );
  // ── POVOADO NÃO É MUNICÍPIO, E NÃO PODE SER JOGADO FORA ────────────────────
  //
  // "SÁO TOMÉ CAMPO FORMOSO" não estava na lista, e não estava certo: São Tomé
  // é povoado de Campo Formoso. As duas opções que existiam — virar outro
  // município ou ficar como está — perdiam informação: a primeira apaga o
  // povoado, a segunda deixa a pessoa fora do mapa.
  //
  // Na Bahia isso é regra, não exceção: a pessoa se identifica pelo povoado.
  // Aqui a linha vira município + bairro, que é o que ela sempre foi.
  const [comoPovoado, setComoPovoado] = useState<Record<string, boolean>>({});
  const [feitos, setFeitos] = useState<Record<string, boolean>>({});
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  async function corrigir(valor: string) {
    const destino = escolhas[valor];
    if (!destino) return;
    setSalvando(valor);
    setErro("");
    const supabase = createClient();

    if (comoPovoado[valor]) {
      const povoado = nomeDoPovoado(valor, destino);
      // O bairro só é escrito onde está VAZIO. Quem já tem bairro preenchido
      // teve alguém digitando com cuidado, e sobrescrever isso com um pedaço
      // de texto adivinhado é estragar dado bom para arrumar dado ruim.
      if (povoado) {
        const r1 = await supabase
          .from("liderancas")
          .update({ municipio: destino, bairro: povoado })
          .eq("municipio", valor)
          .is("bairro", null);
        if (r1.error) {
          setSalvando(null);
          setErro(`Não consegui corrigir "${valor}": ${r1.error.message}`);
          return;
        }
      }
    }

    const { error } = await supabase
      .from("liderancas")
      .update({ municipio: destino })
      .eq("municipio", valor);
    setSalvando(null);
    if (error) {
      setErro(`Não consegui corrigir "${valor}": ${error.message}`);
      return;
    }
    setFeitos((f) => ({ ...f, [valor]: true }));
  }

  async function corrigirTodos() {
    for (const d of divergencias) {
      if (feitos[d.valor] || !escolhas[d.valor]) continue;
      await corrigir(d.valor);
    }
    router.refresh();
  }

  const pendentes = divergencias.filter((d) => !feitos[d.valor]);
  const comSugestao = pendentes.filter((d) => escolhas[d.valor]).length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Cabecalho
          voltar="/base"
          sobretitulo="Qualidade da base"
          titulo="Municípios a conferir"
          descricao={
            <>
              <b className="text-tinta-700">{reconhecidos}</b> de{" "}
              <b className="text-tinta-700">{MUNICIPIOS_BA.length}</b>{" "}
              municípios reconhecidos ·{" "}
              <b className="text-tinta-700">{pendentes.length}</b> grafia(s)
              fora da lista oficial
            </>
          }
        />
        {comSugestao > 0 && (
          <Button onClick={corrigirTodos} disabled={!!salvando}>
            <Check size={16} /> Corrigir as {comSugestao} com sugestão
          </Button>
        )}
      </div>

      {erro && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] text-red-700">
          {erro}
        </p>
      )}

      {divergencias.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-tinta-300 bg-white/60 p-10 text-center">
          <MapPin className="mx-auto text-tinta-300" size={28} />
          <p className="mt-3 text-sm font-semibold text-tinta-700">
            Nenhuma grafia fora da lista.
          </p>
          <p className="mx-auto mt-1 max-w-md text-[13px] text-tinta-500">
            Todos os municípios da base batem com os {MUNICIPIOS_BA.length} da
            Bahia.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-tinta-200 bg-white shadow-[0_1px_2px_rgba(22,32,46,0.04)]">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-tinta-200 bg-tinta-50 text-[11px] uppercase tracking-wide text-tinta-500">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Como está na base</th>
                <th className="px-4 py-2.5 font-semibold">Pessoas</th>
                <th className="px-4 py-2.5 font-semibold">Corrigir para</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {divergencias.map((d) => {
                const pronto = !!feitos[d.valor];
                return (
                  <tr
                    key={d.valor}
                    className="border-b border-tinta-100 last:border-0"
                  >
                    <td className="px-4 py-2.5 font-medium text-tinta-900">
                      {d.valor}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-tinta-600">
                      {d.pessoas.toLocaleString("pt-BR")}
                    </td>
                    <td className="px-4 py-2.5">
                      {pronto ? (
                        <span className="text-tinta-500">
                          {escolhas[d.valor]}
                        </span>
                      ) : (
                        <>
                          <select
                            value={escolhas[d.valor] ?? ""}
                            onChange={(e) =>
                              setEscolhas((v) => ({
                                ...v,
                                [d.valor]: e.target.value,
                              }))
                            }
                            className="h-9 w-full max-w-[260px] rounded-md border border-input bg-white px-2 text-[13px] outline-none"
                          >
                            <option value="">— deixar como está —</option>
                            {MUNICIPIOS_BA.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                          {d.sugestao && d.confianca < 0.9 && (
                            <p className="mt-1 text-[11px] text-amber-600">
                              Sugestão por semelhança — confira antes.
                            </p>
                          )}
                          {escolhas[d.valor] && (
                            <label className="mt-1.5 flex items-start gap-1.5 text-[11.5px] leading-snug text-tinta-600">
                              <input
                                type="checkbox"
                                checked={!!comoPovoado[d.valor]}
                                onChange={(e) =>
                                  setComoPovoado((v) => ({
                                    ...v,
                                    [d.valor]: e.target.checked,
                                  }))
                                }
                                className="mt-0.5 shrink-0"
                              />
                              <span>
                                É povoado de {escolhas[d.valor]} — guardar
                                {(() => {
                                  const p = nomeDoPovoado(d.valor, escolhas[d.valor]);
                                  return p ? ` "${p}" ` : " o nome ";
                                })()}
                                como bairro
                              </span>
                            </label>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {pronto ? (
                        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-600">
                          <Check size={14} /> corrigido
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!escolhas[d.valor] || salvando === d.valor}
                          onClick={() => corrigir(d.valor)}
                        >
                          {salvando === d.valor ? (
                            <RefreshCw size={14} className="animate-spin" />
                          ) : (
                            "Corrigir"
                          )}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
