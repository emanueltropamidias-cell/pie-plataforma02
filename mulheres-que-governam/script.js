/* =========================================================
   Mulheres que Governam · captura para WhatsApp
   ========================================================= */

// Número que recebe as inscrições (só dígitos, com DDI 55)
const WHATSAPP = '557192330000'; // +55 71 9233-0000
// (Opcional) link do grupo/comunidade no WhatsApp. Deixe null para usar o formulário.
const LINK_COMUNIDADE = 'https://chat.whatsapp.com/LUBxNrnDaEmKF9MA2SdGC0';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('form');
  const btn  = document.getElementById('enviar');
  const zap  = document.getElementById('whatsapp');

  /* Máscara de WhatsApp (71) 99999-9999 */
  zap.addEventListener('input', (e) => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 6)      v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
    else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
    else if (v.length > 0) v = `(${v}`;
    e.target.value = v;
    validar();
  });

  /* Habilita o botão só quando o formulário está válido (inclui LGPD) */
  function valido() {
    const tipo = form.querySelector('input[name="tipo"]:checked');
    const nome = form.nome.value.trim().length >= 2;
    const wpp  = zap.value.replace(/\D/g, '').length >= 10;
    const mun  = form.municipio.value.trim().length >= 2;
    const lgpd = form.lgpd.checked;
    return tipo && nome && wpp && mun && lgpd;
  }
  function validar() { btn.disabled = !valido(); }
  form.addEventListener('input', validar);
  form.addEventListener('change', validar);

  /* Envio → abre o WhatsApp com a mensagem pronta */
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!valido()) { validar(); return; }

    const d = new FormData(form);
    const tipo = d.get('tipo');
    const nome = (d.get('nome') || '').trim();
    const wpp  = (d.get('whatsapp') || '').trim();
    const mun  = (d.get('municipio') || '').trim();
    const msg  = (d.get('mensagem') || '').trim();

    let texto =
`✦ *Mulheres que Governam*
Novo cadastro

Quero participar como: *${tipo}*
Nome: ${nome}
WhatsApp: ${wpp}
Município: ${mun} (BA)`;
    if (msg) texto += `\nPor que quero governar: ${msg}`;
    texto += `\n\nA paz! Quero entrar na comunidade. 🌸`;

    const url = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;

    const sucesso = document.getElementById('sucesso');
    const link = document.getElementById('linkZap');
    if (link) link.href = url;
    if (sucesso) sucesso.hidden = false;

    window.open(url, '_blank', 'noopener');
  });

  /* Botão "Entrar na comunidade": grupo direto (se houver) ou rola pro form */
  const btnGrupo = document.getElementById('btnGrupo');
  if (btnGrupo && LINK_COMUNIDADE) {
    btnGrupo.href = LINK_COMUNIDADE;
    btnGrupo.target = '_blank';
    btnGrupo.rel = 'noopener';
  }

  validar();
});
