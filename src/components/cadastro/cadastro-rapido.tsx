"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { MUNICIPIOS_BA } from "@/lib/municipios-ba";
import Link from "next/link";
import { ArrowLeft, Check, TriangleAlert, UserPlus } from "lucide-react";
import {
  formatarTelefone,
  problemaNoTelefone,
  soDigitos,
  EXEMPLO_TELEFONE,
} from "@/lib/telefone";

// Cadastrar quem ligou, na mão.
//
// ── PARA QUEM ESTA TELA É ───────────────────────────────────────────────────
//
// Uma atendente com o celular na orelha e a outra mão no teclado. Não é uma
// tela de cadastro bonita: é um formulário que precisa ser preenchido em vinte
// segundos, várias vezes por hora, sem tirar a atenção da conversa.
//
// Daí as escolhas que parecem estranhas fora desse contexto:
//
//   O TELEFONE VEM PRIMEIRO, e não o nome. É ele que diz se a pessoa já está
//   na base — descobrir isso DEPOIS de preencher tudo é perder o tempo que ela
//   não tem.
//
//   NÃO LIMPA TUDO ao salvar. Município e bairro ficam: quem atende costuma
//   pegar várias pessoas da mesma cidade em sequência, e redigitar "Feira de
//   Santana" trinta vezes é como se abandona um processo manual.
//
//   O FOCO VOLTA PARA O TELEFONE. A próxima pessoa começa sem ela precisar
//   clicar em nada.

type Confere =
  | { estado: "nada" }
  | { estado: "conferindo" }
  | { estado: "novo" }
  | {
      estado: "existe";
      nome: string;
      municipio: string | null;
      quem: string | null;
    };

export type Etiqueta = {
  id: number;
  nome: string;
  cor: string | null;
  eixo: string | null;
};

export function CadastroRapido({
  euNome,
  etiquetas,
}: {
  euNome: string;
  etiquetas: Etiqueta[];
}) {
  const supabase = useState(() => createClient())[0];

  const [telefone, setTelefone] = useState("");
  const [nome, setNome] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [bairro, setBairro] = useState("");

  // ── AS DUAS NATUREZAS DE ETIQUETA ─────────────────────────────────────────
  //
  // Eixo 'status' é UMA por pessoa e a soma fecha 100% — apoiador, hater,
  // indeciso. Deixar marcar duas faria o painel passar de 100% e ninguém
  // entenderia por quê, então aqui a escolha é excludente na própria tela.
  //
  // Eixo 'demanda' é o que a pessoa pediu: zero ou várias. Saúde e material
  // juntos é caso comum, não erro.
  const status = etiquetas.filter((t) => t.eixo === "status");
  const demandas = etiquetas.filter((t) => t.eixo === "demanda");

  const [meuStatus, setMeuStatus] = useState<number | null>(null);
  const [minhasDemandas, setMinhasDemandas] = useState<number[]>([]);

  const [confere, setConfere] = useState<Confere>({ estado: "nada" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const [hoje, setHoje] = useState<number>(0);

  const campoTelefone = useRef<HTMLInputElement>(null);

  // ── A CONFERÊNCIA DE DUPLICATA ────────────────────────────────────────────
  //
  // Espera meio segundo depois da última tecla. Sem essa espera seria uma ida
  // ao banco por dígito — onze consultas para um telefone, com a atendente
  // digitando rápido e a rede do celular sendo o que é.
  useEffect(() => {
    const digitos = soDigitos(telefone);
    // A conferência de duplicata continua a partir de dez dígitos, e não de
    // onze: ela é AVISO, não trava. Quem digitou dez já merece saber que a
    // pessoa existe, mesmo que ainda falte um dígito para poder salvar.
    if (digitos.length < 10) {
      setConfere({ estado: "nada" });
      return;
    }
    setConfere({ estado: "conferindo" });
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("conferir_telefone", {
        p_telefone: digitos,
      });
      const r = data as {
        existe?: boolean;
        nome?: string;
        municipio?: string | null;
        quem?: string | null;
      } | null;
      if (!r) return setConfere({ estado: "nada" });
      setConfere(
        r.existe
          ? {
              estado: "existe",
              nome: r.nome ?? "",
              municipio: r.municipio ?? null,
              quem: r.quem ?? null,
            }
          : { estado: "novo" },
      );
    }, 500);
    return () => clearTimeout(t);
  }, [telefone, supabase]);

  useEffect(() => {
    supabase.rpc("cadastros_de_hoje").then(({ data }) => {
      const r = data as { meus?: number } | null;
      if (r?.meus != null) setHoje(r.meus);
    });
  }, [supabase]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setErro(null);
    setFeito(null);

    // ── O QUE FALTA, ESCRITO ────────────────────────────────────────────────
    //
    // O botão era desabilitado quando o formulário não estava completo. Parecia
    // cuidado e era armadilha: a Maiana preencheu tudo, o botão não clicou, e
    // não havia nada na tela dizendo por quê. Ela ficou parada com a pessoa na
    // linha.
    //
    // Botão travado não ensina. Botão que clica e responde "falta o DDD"
    // ensina, e leva o mesmo tempo.
    if (!nome.trim()) {
      setErro("Falta o nome.");
      return;
    }
    // A regra do telefone mora em `lib/telefone.ts`, junto com a da ficha da
    // liderança e a da tela de leads — as três escrevem na mesma base, e três
    // regras separadas sempre viram três regras diferentes.
    const problema = problemaNoTelefone(telefone);
    if (problema) {
      setErro(problema);
      return;
    }
    // ── A ETIQUETA DE STATUS É OBRIGATÓRIA ──────────────────────────────────
    //
    // Regra de negócio: nenhuma pessoa entra na base sem classificação, senão o
    // relatório da diretoria fica com buraco que ninguém consegue explicar
    // depois.
    //
    // NO MESMO ESTILO DAS OUTRAS: diz o que falta em vez de travar o botão. O
    // comentário acima conta por quê — travar sem explicar deixou a Maiana
    // parada com a pessoa na linha. A trava de verdade está no banco.
    if (!meuStatus) {
      setErro(
        "Falta a etiqueta de status — Apoiador, Indeciso, Hater... Sem ela a pessoa não entra no relatório.",
      );
      return;
    }

    setSalvando(true);

    const { data, error } = await supabase.rpc("cadastrar_manual", {
      p_nome: nome,
      p_telefone: telefone,
      p_municipio: municipio,
      p_bairro: bairro,
      p_tipo: "lead",
      p_tags: [...(meuStatus ? [meuStatus] : []), ...minhasDemandas],
    });
    setSalvando(false);

    if (error) return setErro(error.message);
    const r = data as { ok?: boolean; erro?: string; ja_existia?: boolean } | null;
    if (!r?.ok) return setErro(r?.erro ?? "Não deu para cadastrar.");

    setFeito(
      r.ja_existia
        ? `${nome.trim()} já estava na base — completei o que faltava.`
        : `${nome.trim()} cadastrado.`,
    );
    setHoje((n) => n + (r.ja_existia ? 0 : 1));

    // Só o que muda de pessoa para pessoa. Cidade e bairro ficam.
    setTelefone("");
    setNome("");
    setMeuStatus(null);
    setMinhasDemandas([]);
    setConfere({ estado: "nada" });
    campoTelefone.current?.focus();
  }

  const jaExiste = confere.estado === "existe";

  return (
    <div className="mx-auto w-full max-w-[520px] px-4 pb-16 pt-4 sm:pt-6">
      {/* A volta é obrigatória: sem menu lateral, uma tela sem saída deixa a
          atendente presa e ela fecha a aba — perdendo o que estava digitando. */}
      <Link
        href="/atendimento/caixa"
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-tinta-500 hover:text-tinta-800"
      >
        <ArrowLeft size={14} strokeWidth={2.4} />
        Voltar para a fila
      </Link>

      <div className="mt-3 flex items-baseline justify-between">
        <h1 className="text-[21px] font-extrabold tracking-[-0.02em] text-tinta-900">
          Cadastrar pessoa
        </h1>
        <span className="text-[12px] font-semibold text-tinta-500">
          {hoje} hoje
        </span>
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-tinta-500">
        Para quem você atendeu pelo telefone. {euNome ? `Vai no seu nome, ${euNome.split(" ")[0]}.` : ""}
      </p>

      <form onSubmit={salvar} className="mt-5 space-y-3.5">
        {/* O telefone primeiro: é ele que diz se a pessoa já está na base. */}
        <div>
          <label htmlFor="tel" className="text-[12px] font-bold text-tinta-700">
            Telefone com DDD
          </label>
          <input
            id="tel"
            ref={campoTelefone}
            value={telefone}
            // A máscara formata ENQUANTO ela digita. Assim o formato certo não é
            // uma regra que ela precisa lembrar — é o que aparece sozinho na
            // tela, e o erro fica visível antes de clicar em salvar.
            onChange={(e) => setTelefone(formatarTelefone(e.target.value))}
            inputMode="tel"
            autoFocus
            placeholder={EXEMPLO_TELEFONE}
            // 16px: abaixo disso o iPhone dá zoom ao tocar e a tela sai do lugar.
            className="mt-1 h-[46px] w-full rounded-[10px] border border-tinta-300 px-3 text-[16px] text-tinta-900 outline-none focus:border-tema"
          />

          {confere.estado === "conferindo" && (
            <p className="mt-1.5 text-[11.5px] text-tinta-400">conferindo…</p>
          )}
          {confere.estado === "novo" && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-green-700">
              <Check size={13} strokeWidth={2.6} />
              Pessoa nova
            </p>
          )}
          {jaExiste && (
            <div className="mt-1.5 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="flex items-center gap-1.5 text-[11.5px] font-bold text-amber-800">
                <TriangleAlert size={13} strokeWidth={2.6} />
                Já está na base
              </p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-amber-800/90">
                <b>{confere.nome}</b>
                {confere.municipio ? ` · ${confere.municipio}` : ""}
                {confere.quem ? ` · cadastrada por ${confere.quem}` : ""}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-700/80">
                Pode salvar mesmo assim — eu completo o que estiver faltando e
                não sobrescrevo o que já tem.
              </p>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="nome" className="text-[12px] font-bold text-tinta-700">
            Nome
          </label>
          <input
            id="nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome completo"
            className="mt-1 h-[46px] w-full rounded-[10px] border border-tinta-300 px-3 text-[16px] text-tinta-900 outline-none focus:border-tema"
          />
        </div>

        <div>
          <label htmlFor="mun" className="text-[12px] font-bold text-tinta-700">
            Município
          </label>
          <input
            id="mun"
            list="municipios-ba-cad"
            value={municipio}
            onChange={(e) => setMunicipio(e.target.value)}
            placeholder="Comece a digitar…"
            autoComplete="off"
            className="mt-1 h-[46px] w-full rounded-[10px] border border-tinta-300 px-3 text-[16px] text-tinta-900 outline-none focus:border-tema"
          />
          {/* A lista dos 417 municípios da Bahia. Sem ela, "Feira de Santana"
              vira "feira", "Feira de Sant.", "FSA" — e o mapa não fecha. */}
          <datalist id="municipios-ba-cad">
            {MUNICIPIOS_BA.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>

        <div>
          <label htmlFor="bai" className="text-[12px] font-bold text-tinta-700">
            Bairro <span className="font-normal text-tinta-400">(opcional)</span>
          </label>
          <input
            id="bai"
            value={bairro}
            onChange={(e) => setBairro(e.target.value)}
            placeholder="Bairro ou povoado"
            className="mt-1 h-[46px] w-full rounded-[10px] border border-tinta-300 px-3 text-[16px] text-tinta-900 outline-none focus:border-tema"
          />
        </div>

        {/* ── ETIQUETAS ────────────────────────────────────────────────
            Botão, e não lista suspensa. A menina está com o telefone na
            orelha: um toque decide, contra abrir-rolar-escolher-fechar. E
            todas as opções ficam à vista, o que faz ela lembrar de perguntar. */}
        {status.length > 0 && (
          <div>
            <span className="text-[12px] font-bold text-tinta-700">
              Como ficou <span className="font-normal text-tinta-400">(escolha uma)</span>
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {status.map((t) => {
                const aceso = meuStatus === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    // Tocar de novo desmarca: errou o botão e não tem como
                    // voltar é o jeito de a etiqueta errada virar permanente.
                    onClick={() => setMeuStatus(aceso ? null : t.id)}
                    className="rounded-full border px-3 py-2 text-[12.5px] font-semibold transition-colors"
                    style={
                      aceso
                        ? { background: t.cor ?? "#0525f7", borderColor: t.cor ?? "#0525f7", color: "#fff" }
                        : { borderColor: "#d6d9e0", color: "#4a5163" }
                    }
                  >
                    {t.nome}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {demandas.length > 0 && (
          <div>
            <span className="text-[12px] font-bold text-tinta-700">
              O que pediu{" "}
              <span className="font-normal text-tinta-400">(quantas precisar)</span>
            </span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {demandas.map((t) => {
                const aceso = minhasDemandas.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      setMinhasDemandas((atuais) =>
                        aceso ? atuais.filter((x) => x !== t.id) : [...atuais, t.id],
                      )
                    }
                    className="rounded-full border px-3 py-2 text-[12.5px] font-semibold transition-colors"
                    style={
                      aceso
                        ? { background: t.cor ?? "#0525f7", borderColor: t.cor ?? "#0525f7", color: "#fff" }
                        : { borderColor: "#d6d9e0", color: "#4a5163" }
                    }
                  >
                    {t.nome}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {erro && (
          <p className="rounded-[10px] bg-red-50 px-3 py-2 text-[12px] font-semibold text-red-700">
            {erro}
          </p>
        )}
        {feito && (
          <p className="rounded-[10px] bg-green-50 px-3 py-2 text-[12px] font-semibold text-green-700">
            {feito}
          </p>
        )}

        <button
          type="submit"
          // Só o envio em curso trava, para não cadastrar duas vezes no
          // toque duplo. Faltar campo NÃO trava: quem diz o que falta é a
          // mensagem, não o botão apagado.
          disabled={salvando}
          className="flex h-[48px] w-full items-center justify-center gap-2 rounded-[10px] bg-tema text-[14px] font-bold text-white transition-opacity disabled:opacity-40"
        >
          <UserPlus size={16} strokeWidth={2.4} />
          {salvando ? "Salvando…" : "Cadastrar e ir para a próxima"}
        </button>

        <p className="text-center text-[11px] leading-relaxed text-tinta-400">
          Município e bairro ficam preenchidos para a próxima — a maioria vem da
          mesma cidade em sequência.
        </p>
      </form>
    </div>
  );
}
