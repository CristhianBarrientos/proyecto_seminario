-- ============================================================
-- FIX #22 del audit QA: reviews no tenía política de UPDATE/DELETE
-- - un cliente no podía corregir ni borrar su propia reseña.
-- Decisión de producto (confirmada): SÍ se permite, pero debe quedar
-- visible que la reseña fue editada (igual que reviews de Amazon o
-- comentarios de la mayoría de apps) - se agrega `updated_at`, seteado
-- solo por un trigger BEFORE UPDATE, nunca por el cliente directamente.
-- ============================================================

alter table public.reviews
  add column if not exists updated_at timestamptz;

create or replace function public.touch_review_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- Campos inmutables tras la creacion: no se puede reasignar una resena a otro
  -- booking/cliente/profesional ni cambiarle la fecha de creacion; solo se edita el contenido
  -- de la resena propia. Se congelan ANTES de comparar para que un intento de tocarlos (que se
  -- revierte) no cuente como edicion.
  new.booking_id = old.booking_id;
  new.client_id = old.client_id;
  new.professional_id = old.professional_id;
  new.created_at = old.created_at;

  -- "Editada" = cambio el contenido. Se compara la FILA completa salvo updated_at (no solo
  -- rating/comment): si manana se agrega otra columna editable, tambien marca la edicion.
  if (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
    new.updated_at = now();
  else
    -- Sin cambio de contenido: se conserva el valor anterior, ignorando lo que haya mandado el
    -- cliente (no puede adelantarlo, falsearlo ni borrarlo).
    new.updated_at = old.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists review_update_touch on public.reviews;

create trigger review_update_touch
before update on public.reviews
for each row execute function public.touch_review_updated_at();

-- Solo el cliente dueño puede editar (rating/comment) su propia reseña.
-- El trigger de arriba ya congela booking_id/client_id/professional_id/
-- created_at, así que el WITH CHECK solo necesita seguir confirmando la
-- propiedad, no cada columna individual.
drop policy if exists "reviews_update_own_client" on public.reviews;

create policy "reviews_update_own_client"
on public.reviews for update
to authenticated
using (client_id = auth.uid())
with check (client_id = auth.uid());

-- Solo el cliente dueño puede borrar su propia reseña.
drop policy if exists "reviews_delete_own_client" on public.reviews;

create policy "reviews_delete_own_client"
on public.reviews for delete
to authenticated
using (client_id = auth.uid());
