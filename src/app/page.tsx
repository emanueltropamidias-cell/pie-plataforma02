import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Abrir o site vai direto ao login (ou ao dashboard, se já estiver logado).
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/dashboard" : "/login");
}
