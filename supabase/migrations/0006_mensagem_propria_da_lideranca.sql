-- ============================================================================
-- UMA LIDERANÇA PODE TER A MENSAGEM DELA NO QR
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── O QUE MUDA ──────────────────────────────────────────────────────────────
--
-- O link pessoal de cada liderança (`/c/<código>`) abre o WhatsApp com uma
-- frase montada sempre igual:
--
--     Oii Talita! Vim pela indicação de FULANA. 💙
--
-- Serve para quem indica uma pessoa por vez. Não serve para um COLETIVO: quem
-- escaneia o QR do "Mulheres que Governam" não veio pela indicação de alguém,
-- veio pelo movimento — e a frase certa é outra.
--
-- ── POR QUE COLUNA, E NÃO UM SE NO CÓDIGO ───────────────────────────────────
--
-- O caminho curto seria um `if` com o código dela no código do site. Isso
-- funciona hoje e cobra depois: no dia em que houver um segundo coletivo, a
-- resposta é editar o código e publicar — e quem quiser mudar a frase depende
-- de programador para trocar uma palavra.
--
-- Como coluna, a frase é dado: qualquer liderança pode ter a sua, muda-se sem
-- publicar nada, e o padrão continua valendo para as outras 207.

alter table public.liderancas
  add column if not exists mensagem_qr text;

comment on column public.liderancas.mensagem_qr is
  'A frase que já chega escrita quando alguém abre o WhatsApp por este QR. Vazio = a frase padrão de indicação. Existe para coletivos, em que "vim pela indicação de" não descreve o que aconteceu.';

-- ─────────────────────────────────────────────────────────────────────────────
-- A CONSULTA QUE A PÁGINA DO QR FAZ
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Antes devolvia só o nome, e a página montava a frase. Agora devolve os dois:
-- o nome (para o crédito de quem indicou) e a mensagem própria quando existir.
--
-- Uma consulta só, e não duas: esta roda no celular de quem acabou de escanear,
-- no meio da rua, antes de abrir o WhatsApp. Cada ida ao servidor aqui é gente
-- desistindo.
--
-- `security definer` porque quem escaneia NÃO TEM CONTA: a tabela é fechada
-- para o navegador e só esta função a alcança — e devolve exatamente dois
-- campos, de uma linha, achada por um código que a pessoa já tem na mão.
create or replace function public.lideranca_por_code(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'nome', l.nome,
           'mensagem', l.mensagem_qr
         )
    from public.liderancas l
   where l.link_code = p_code
   limit 1;
$$;

comment on function public.lideranca_por_code is
  'Nome e mensagem própria de uma liderança pelo código do QR. Uma consulta só: roda no celular de quem escaneou, antes de abrir o WhatsApp.';

revoke all on function public.lideranca_por_code(text) from public;
grant execute on function public.lideranca_por_code(text) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- A MENSAGEM DO MULHERES QUE GOVERNAM
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Achada pelo NOME, e não pelo id: id de uma instalação não existe na outra, e
-- este arquivo precisa poder rodar nas duas sem editar nada.
update public.liderancas
   set mensagem_qr = 'Olá Talita, vim pelo QR code do Mulheres que Governam ❤️'
 where nome ilike '%mulheres%governam%';

-- ── conferência ─────────────────────────────────────────────────────────────
select nome, link_code, mensagem_qr
  from public.liderancas
 where mensagem_qr is not null;
