-- Troque o email abaixo pelo email do usuário desejado.
do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where email = 'gestor@reservadaserra.com.br';

  if v_user_id is null then
    raise exception 'Usuário não encontrado em auth.users. Crie o usuário no Auth antes.';
  end if;

  insert into public.accounts (user_id, name, type, bank_name, initial_balance)
  values
    (v_user_id, 'Conta PJ', 'bank', 'Conta PJ', 0),
    (v_user_id, 'Nubank', 'bank', 'Nubank', 0),
    (v_user_id, 'Itaú', 'bank', 'Itaú', 0),
    (v_user_id, 'Cartão', 'credit_card', 'Cartão', 0),
    (v_user_id, 'Carteira', 'cash', 'Dinheiro', 0)
  on conflict do nothing;

  insert into public.categories (user_id, name, type, color, icon)
  values
    (v_user_id, 'Consultoria', 'income', '#10b981', 'briefcase'),
    (v_user_id, 'Projeto', 'income', '#22c55e', 'folder'),
    (v_user_id, 'Salário', 'income', '#14b8a6', 'wallet'),
    (v_user_id, 'Alimentação', 'expense', '#f43f5e', 'utensils'),
    (v_user_id, 'Ferramentas', 'expense', '#6366f1', 'tool'),
    (v_user_id, 'Transporte', 'expense', '#f97316', 'car'),
    (v_user_id, 'Moradia', 'expense', '#8b5cf6', 'home'),
    (v_user_id, 'Saúde', 'expense', '#ef4444', 'heart'),
    (v_user_id, 'Lazer', 'expense', '#06b6d4', 'smile'),
    (v_user_id, 'Outros', 'both', '#64748b', 'circle')
  on conflict do nothing;
end $$;
