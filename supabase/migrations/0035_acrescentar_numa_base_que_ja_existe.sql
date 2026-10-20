-- ============================================================================
-- ACRESCENTAR NUMA BASE QUE JÁ EXISTE
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- 15/09, noite: "Vou lhe mandar algumas bases de manassés, você vai
-- acrescentando na conta dele."
--
-- A 0029 só sabia CRIAR base: nome repetido era recusado, de propósito, para
-- ninguém misturar duas bases diferentes sem perceber. Mas a base de um
-- candidato costuma chegar em pedaços — um arquivo por município, por chip, por
-- pessoa que mandou. Sem acrescentar, cada pedaço virava uma gaveta, e a
-- pergunta "quantos números o Manassés tem?" passava a exigir somar cartões na
-- tela.
--
-- `base_externa_reabrir` põe a base de volta em "subindo" e soma as linhas do
-- arquivo novo às que já estavam. Daí o caminho é o mesmo de sempre:
-- `base_externa_adicionar` em lotes e `base_externa_concluir` no fim — e o
-- telefone repetido continua sendo juntado DENTRO da base (índice único de
-- 0029), então mandar o mesmo arquivo duas vezes não duplica ninguém.
--
-- Continua sendo coisa de admin, e continua sem misturar base com base: a
-- escolha é de UMA gaveta, pelo id.

create or replace function public.base_externa_reabrir(p_base uuid, p_arquivo text, p_linhas integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
begin
  if not public.perfil_admin() then
    raise exception 'Só a coordenação sobe base.' using errcode = '42501';
  end if;

  update bases_externas
     set situacao       = 'subindo',
         arquivo        = case when coalesce(btrim(p_arquivo), '') = '' then arquivo
                               when arquivo is null or arquivo = p_arquivo then p_arquivo
                               else arquivo || ' + ' || p_arquivo end,
         linhas_arquivo = linhas_arquivo + coalesce(p_linhas, 0)
   where id = p_base
  returning nome into v_nome;

  if v_nome is null then
    raise exception 'Essa base não existe.';
  end if;
  return jsonb_build_object('ok', true, 'nome', v_nome);
end $$;

revoke all on function public.base_externa_reabrir(uuid, text, integer) from public, anon;
grant execute on function public.base_externa_reabrir(uuid, text, integer) to authenticated;
