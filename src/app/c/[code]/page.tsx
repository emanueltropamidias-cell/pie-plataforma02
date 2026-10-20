"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { linkWhatsApp as montarWA } from "@/lib/whatsapp";
import { MARCA } from "@/lib/candidato";

// Trava contra contagem dupla. Só localStorage não basta: o navegador interno
// do Instagram/WhatsApp costuma descartá-lo ao fechar, e a mesma pessoa voltando
// depois virava um contato novo. O cookie sobrevive a isso.
function jaRegistrou(code: string) {
  const chave = `contato_wa_${code}`;
  try {
    if (localStorage.getItem(chave)) return true;
  } catch {
    /* modo privado pode bloquear o localStorage */
  }
  return document.cookie.split("; ").some((c) => c.startsWith(`${chave}=`));
}

function marcarRegistrado(code: string) {
  const chave = `contato_wa_${code}`;
  const agora = String(Date.now());
  try {
    localStorage.setItem(chave, agora);
  } catch {
    /* segue só com o cookie */
  }
  // 1 ano: a mesma pessoa não conta de novo nem meses depois
  document.cookie = `${chave}=${agora}; path=/; max-age=31536000; SameSite=Lax`;
}

export default function PonteWhatsApp() {
  const params = useParams();
  const code = String(params?.code ?? "");
  const [url, setUrl] = useState(() => montarWA());

  useEffect(() => {
    let jaFoi = false;
    let destino = montarWA();
    const irParaWA = () => {
      if (jaFoi) return;
      jaFoi = true;
      window.location.replace(destino);
    };
    // fallback: redireciona de qualquer jeito se o registro travar
    const fallback = setTimeout(irParaWA, 3500);

    (async () => {
      try {
        const supabase = createClient();
        // Nome de quem indicou -> vai na mensagem (a Boneca sabe a origem e confirma)
        // ── A LIDERANÇA PODE TER A FRASE DELA ────────────────────────────
        //
        // O padrão — "vim pela indicação de FULANA" — descreve alguém
        // indicando uma pessoa. Não descreve um COLETIVO: quem escaneia o QR do
        // "Mulheres que Governam" não veio pela indicação de ninguém, veio pelo
        // movimento.
        //
        // Quando a liderança tem mensagem própria, ela vai INTEIRA e sem o
        // crédito colado atrás: a frase foi escrita para ser lida como está.
        const { data: quem } = await supabase.rpc("lideranca_por_code", {
          p_code: code,
        });
        const info = quem as { nome?: string; mensagem?: string | null } | null;
        if (info?.mensagem?.trim()) {
          destino = montarWA(null, info.mensagem.trim());
          setUrl(destino);
        } else if (info?.nome) {
          destino = montarWA(String(info.nome));
          setUrl(destino); // o botão manual precisa do mesmo link
        }
        // Registra o contato, deduplicado por aparelho (recarga/re-clique não inflam)
        if (code && typeof window !== "undefined" && !jaRegistrou(code)) {
          await supabase.rpc("registrar_contato_wa", { p_code: code });
          marcarRegistrado(code);
        }
      } catch {
        // ignora — o importante é levar pro WhatsApp
      }
      clearTimeout(fallback);
      irParaWA();
    })();

    return () => clearTimeout(fallback);
  }, [code]);

  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center p-6 text-center text-white"
      style={{ background: "#0525f7" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={MARCA.branca} alt="Talita Oliveira" className="mb-6 h-7 w-auto opacity-95" />
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-white/30 border-t-white" />
      <p className="mt-5 text-[15px] font-semibold">Abrindo o WhatsApp…</p>

      {/* Toque de verdade num link tem tratamento diferente de redirecionamento
          automático na hora de abrir outro app. Se o automático travar ou pedir
          confirmação, este botão é o caminho limpo. */}
      <a
        href={url}
        className="mt-6 rounded-full bg-white px-7 py-3 text-[15px] font-bold text-[#0525f7] shadow-lg active:scale-95"
      >
        Abrir conversa
      </a>

      <p className="mt-6 text-[12.5px] text-white/80">Talita Oliveira · Bahia</p>
    </main>
  );
}
