// O QR que mudou de instalação.
//
// ── O CASO ──────────────────────────────────────────────────────────────────
//
// 15/09: o QR da dobradinha "Talita e Manassés" foi criado no PIE da Talita e
// impresso em panfleto — o endereço `talitaoliveiraoficial.com/l/talitaemanasses`
// está no papel e não muda mais. O Emanuel quis o QR no PIE do Manassés: é lá
// que ele acompanha, e o WhatsApp de destino já era o dele.
//
// A solução é o link da Talita apontar para o link do Manassés
// (`https://<site dele>/l/talitaemanasses`). Quem escaneia passa pelos dois
// sem perceber, e a leitura é contada UMA vez, lá.
//
// ── POR QUE NÃO CONTAR AQUI TAMBÉM ───────────────────────────────────────────
//
// Contando nos dois, o placar da Talita continuaria subindo com um QR que não
// é mais dela, e a soma das duas instalações daria o dobro das pessoas.
//
// É repasse quando o destino é um `/l/` de OUTRO domínio. Link para o próprio
// site, ou para o WhatsApp, continua o caminho normal.

export function repasseDoLink(destino: string, site: string): string | null {
  try {
    const d = new URL(destino);
    const s = new URL(site);
    const semWww = (h: string) => h.replace(/^www\./i, "").toLowerCase();
    if (!d.pathname.startsWith("/l/") || semWww(d.host) === semWww(s.host)) return null;
    d.pathname = d.pathname.replace(/\/+$/, "");
    return d.toString();
  } catch {
    return null;
  }
}

/** O endereço de repasse com um pedaço a mais no caminho (o código da liderança). */
export function comCaminho(repasse: string, extra: string): string {
  const u = new URL(repasse);
  u.pathname = `${u.pathname}/${encodeURIComponent(extra)}`;
  return u.toString();
}
