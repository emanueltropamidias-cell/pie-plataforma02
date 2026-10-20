"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();

  async function sair() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={sair}
      className={
        className ??
        // Mesma forma dos itens do menu: sair é navegação, não exceção visual.
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-barra-suave transition-colors hover:bg-barra-hover hover:text-barra-texto"
      }
    >
      <LogOut size={16} strokeWidth={1.9} className="shrink-0" />
      Sair
    </button>
  );
}
