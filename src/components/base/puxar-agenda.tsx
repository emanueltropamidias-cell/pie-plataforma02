"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Unplug, Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lerVcf } from "@/lib/vcard";

// Trazer a agenda de um aparelho para dentro da plataforma.
//
// ── POR QUE O QR SAIU ───────────────────────────────────────────────────────
//
// A tela nasceu em 28/09 lendo a agenda pelo WhatsApp: a pessoa lia um QR, a
// agenda vinha, virava base. Funcionou para o Pedro — 704 números.
//
// Falhou para o Walter, e a medição explicou por quê: dos 2.010 contatos dele,
// 2.009 chegaram como `27299030286568@lid`, o identificador interno que o
// WhatsApp passou a usar no lugar do telefone. Nenhum número.
//
// Não é defeito da ferramenta nem da Evolution. É mudança de privacidade do
// WhatsApp, e está avançando: nos 19 chips da campanha, entre 23% e 53% dos
// contatos JÁ vieram assim. Procurei saída no banco da Evolution, no Redis, na
// sessão do Baileys e em três chamadas da API — não há mapa que devolva o
// telefone.
//
// Então o QR saiu em 29/09, a pedido dele. Ficar na tela um caminho que às
// vezes traz zero é pior que não ter caminho nenhum: gasta o tempo de quem
// tentou e o do dono do celular que leu o código à toa.
//
// O arquivo .vcf não tem esse problema porque não passa pelo WhatsApp — ele lê
// a agenda do próprio celular, onde o número está.

export function PuxarAgenda() {
  return (
    <div className="flex flex-col gap-4">
      <SessoesAbertas />
      <PorArquivo />
    </div>
  );
}

// ── OS APARELHOS QUE FICARAM CONECTADOS ─────────────────────────────────────
//
// A importação grava a base e só DEPOIS derruba a sessão. Se o servidor não
// responder nesse instante, a base fica pronta e o WhatsApp de um terceiro
// continua conectado ao nosso servidor — com a tela dizendo "feito".
//
// Isso é um buraco que a própria tela de puxar agenda abriu. Aqui ele fica
// visível e tem botão.
//
// Só aparece quando há o que mostrar: caixa vazia permanente na tela ensina a
// ignorar o lugar, e aí o dia em que houver algo ninguém vê.
type Sessao = { instancia: string; estado: string; numero: string | null; perfil: string | null };

function SessoesAbertas() {
  const [sessoes, setSessoes] = useState<Sessao[]>([]);
  const [soltando, setSoltando] = useState<string | null>(null);

  async function carregar() {
    try {
      const r = await fetch("/api/base/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "listar" }),
      });
      const j = await r.json();
      if (r.ok) setSessoes(j.sessoes ?? []);
    } catch { /* sem rede: a próxima carga tenta */ }
  }

  useEffect(() => {
    void carregar();
    const t = setInterval(carregar, 15_000);
    return () => clearInterval(t);
  }, []);

  async function soltar(instancia: string) {
    setSoltando(instancia);
    try {
      await fetch("/api/base/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "encerrar", instancia }),
      });
      await carregar();
    } finally { setSoltando(null); }
  }

  if (sessoes.length === 0) return null;

  return (
    <div className="rounded-xl border border-[#f0dcc0] bg-[#fdf6ea] p-4">
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-tinta-900">
        <Unplug size={14} /> {sessoes.length === 1 ? "Um aparelho continua conectado" : `${sessoes.length} aparelhos continuam conectados`}
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-tinta-600">
        Sessão de agenda que não foi desfeita. Enquanto estiver assim, o WhatsApp
        dessa pessoa segue ligado ao nosso servidor.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {sessoes.map((s) => (
          <li key={s.instancia} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold text-tinta-900">
                {s.perfil ?? s.instancia}
              </span>
              <span className="block truncate text-[11.5px] text-tinta-500">
                {s.numero ? `${s.numero} · ` : ""}{s.estado === "open" ? "conectado" : s.estado}
              </span>
            </span>
            <Button variant="outline" onClick={() => soltar(s.instancia)} disabled={soltando === s.instancia}>
              {soltando === s.instancia ? <Loader2 size={14} className="animate-spin" /> : <Unplug size={14} />}
              Desconectar
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── A AGENDA EXPORTADA DO PRÓPRIO CELULAR ───────────────────────────────────
//
// 29/09, Emanuel: "a própria agenda do celular dá essa opção de exportar todos
// os contatos, ela envia em um documento vcf. Eu quero subir o documento,
// colocar o nome, e você limpa ele."
//
// Vem ANTES do QR na tela, e não é ordem arbitrária: é o caminho que funciona
// sempre. O QR depende do WhatsApp entregar o telefone, e desde a migração
// para LID ele já não entrega — na agenda do Walter vieram 2.000 contatos e
// nenhum número. O arquivo é lido do celular, onde o número está.
//
// Três vantagens sobre o QR, e todas foram medidas:
//
//   · traz TODOS os contatos, inclusive quem não tem WhatsApp
//   · não pareia aparelho nenhum — risco de banimento: zero
//   · o dono não precisa estar junto na hora
function PorArquivo() {
  const router = useRouter();
  const refArquivo = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState("");
  const [fase, setFase] = useState<"parado" | "lendo" | "enviando" | "feito">("parado");
  const [erro, setErro] = useState("");
  const [r, setR] = useState<{
    lidos: number; validos: number; repetidos: number; bahia: number; fora: number;
    novos: number; jaNaCampanha: number; jaEmOutraBase: number;
    recusas: Record<string, number>;
  } | null>(null);

  async function subir(fs: FileList | null) {
    if (!fs?.length) return;
    if (nome.trim().length < 2) { setErro("Dê um nome à base primeiro."); return; }
    setErro(""); setFase("lendo");
    try {
      // O arquivo é lido AQUI, no navegador. Nada dele sobe além de nome e
      // telefone — foto, e-mail, endereço e aniversário ficam na máquina.
      const contatos: { nome: string; telefone: string }[] = [];
      for (const f of Array.from(fs)) {
        for (const c of lerVcf(await f.text())) contatos.push({ nome: c.nome, telefone: c.telefone });
      }
      if (contatos.length === 0) throw new Error("Não achei contato nenhum nesse arquivo.");

      setFase("enviando");
      const resp = await fetch("/api/base/agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "arquivo", nome: nome.trim(), contatos }),
      });
      const j = await resp.json();
      if (!resp.ok) throw new Error(j?.erro ?? "Não consegui subir.");
      setR(j); setFase("feito"); router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui subir.");
      setFase("parado");
    }
  }

  if (fase === "feito" && r)
    return (
      <div className="rounded-xl border border-[#cbe3d4] bg-[#eef7f1] p-5">
        <p className="flex items-center gap-2 text-[14px] font-bold text-[#12703c]">
          <Check size={16} /> {nome} — pronta
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ["Veio no arquivo", r.lidos, "contatos no celular"],
            ["Entraram", r.validos, "depois de limpar"],
            ["DDD da Bahia", r.bahia, "dá para baixar só eles"],
            ["DDD de fora", r.fora, r.fora > 0 ? "ficam na mesma base" : "nenhum"],
            ["Gente nova", r.novos, "a campanha não tinha"],
          ].map(([t, v, nota]) => (
            <div key={String(t)} className="rounded-lg bg-white px-3 py-2.5">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-tinta-400">{t}</p>
              <p className="tabular mt-0.5 text-[22px] font-extrabold leading-none text-tinta-900">
                {Number(v).toLocaleString("pt-BR")}
              </p>
              <p className="mt-0.5 text-[11px] text-tinta-500">{nota}</p>
            </div>
          ))}
        </div>
        {/* O que foi jogado fora, item por item. Descarte sem motivo vira
            número que some da conta sem ninguém saber por quê. */}
        <p className="mt-3 text-[12px] leading-relaxed text-tinta-500">
          Dos {r.lidos.toLocaleString("pt-BR")} que vieram, saíram{" "}
          <b>{(r.lidos - r.validos).toLocaleString("pt-BR")}</b> na limpeza:
          {r.repetidos > 0 && <> {r.repetidos.toLocaleString("pt-BR")} repetidos</>}
          {Object.entries(r.recusas).map(([m, q]) => (
            <span key={m}> · {q} {m}</span>
          ))}
          . Já conhecidos da campanha: {(r.jaNaCampanha + r.jaEmOutraBase).toLocaleString("pt-BR")} —
          eles ficam na base, e o total de Outras bases não os conta duas vezes.
        </p>
        <button
          onClick={() => { setFase("parado"); setR(null); setNome(""); }}
          className="mt-3 text-[13px] font-semibold text-tema hover:underline"
        >
          Subir outra agenda
        </button>
      </div>
    );

  const ocupado = fase !== "parado";
  return (
    <div className="rounded-xl border border-tinta-200 bg-white p-6">
      <p className="flex items-center gap-2 text-[14px] font-bold text-tinta-900">
        <FileText size={15} /> Subir a agenda em arquivo (.vcf)
      </p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-tinta-500">
        O jeito que funciona sempre: a pessoa exporta a agenda no próprio celular e te
        manda o arquivo. Traz todos os contatos, inclusive quem não tem WhatsApp, e não
        conecta aparelho nenhum.
      </p>

      <div className="mt-4 flex max-w-[520px] flex-col gap-3">
        <div>
          <label htmlFor="nomeArq" className="text-[13px] font-semibold text-tinta-800">
            Nome da base
          </label>
          <input
            id="nomeArq"
            value={nome}
            maxLength={60}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Agenda Walter"
            className="mt-1.5 h-10 w-full rounded-lg border border-tinta-200 px-3 text-[14px] outline-none focus:border-tema"
          />
        </div>

        <p className="rounded-lg border border-tinta-200 bg-tinta-50 px-3.5 py-2.5 text-[12px] leading-relaxed text-tinta-600">
          <b className="text-tinta-800">O que eu faço com o arquivo:</b> tiro telefone fixo e
          número estrangeiro, acrescento o nono dígito onde falta, removo os repetidos, e{" "}
          <b>conto quantos são da Bahia pelo DDD</b>. Todos ficam na mesma base — na hora
          de baixar você escolhe: completa, só os da Bahia, ou só os de fora.
        </p>

        {erro && <p className="text-[13px] text-[#c02020]">{erro}</p>}

        <input
          ref={refArquivo}
          type="file"
          accept=".vcf,text/vcard,text/x-vcard"
          multiple
          className="hidden"
          onChange={(e) => subir(e.target.files)}
        />
        <div>
          <Button onClick={() => refArquivo.current?.click()} disabled={ocupado || nome.trim().length < 2}>
            {ocupado ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {fase === "lendo" ? "Lendo o arquivo…" : fase === "enviando" ? "Subindo…" : "Escolher o arquivo .vcf"}
          </Button>
        </div>
      </div>
    </div>
  );
}
