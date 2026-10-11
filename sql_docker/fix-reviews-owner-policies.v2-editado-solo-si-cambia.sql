-- ============================================================
-- FIX #30: touch_review_updated_at marcaba "editado" aunque no cambiara nada
--
-- ORDEN: aplicar DESPUES de fix-reviews-owner-policies.sql (que crea la funcion, la columna
-- updated_at, el trigger y las politicas). El nombre lleva ".v2" para que ordene despues de ese
-- archivo; este archivo solo reemplaza la funcion y NO toca la columna, el trigger ni las politicas.
--
-- Problema: la funcion hacia `new.updated_at = now()` en CADA UPDATE. Un cliente que abre su resena,
-- pulsa "Guardar" sin tocar nada y la deja igual, pasaba de updated_at NULL a now(): el indicador
-- "(editado)" (basado en updated_at IS NOT NULL) marcaria como editada una resena cuyo contenido
-- nunca cambio.
--
-- Cambio: updated_at solo avanza si cambio el rating o el comentario.
--
-- Ojo con la proteccion que ya daba el comportamiento anterior: authenticated tiene UPDATE sobre la
-- columna updated_at (privilegio de tabla), y el trigger pisaba siempre el valor, lo que impedia que
-- un cliente lo falseara o lo pusiera en NULL para ocultar una edicion. Por eso, cuando el contenido
-- NO cambia, no basta con "no tocarlo": se restaura explicitamente al valor anterior. Los campos
-- inmutables (booking_id, client_id, professional_id, created_at) siguen congelados.
--
-- Idempotente. Misma firma y mismas propiedades que la funcion original.
-- ============================================================

create or replace function public.touch_review_updated_at()
returns trigger
language plpgsql
as $$
begin
  if new.rating is distinct from old.rating or new.comment is distinct from old.comment then
    new.updated_at = now();
  else
    -- Sin cambio de contenido: se conserva el valor anterior, ignorando lo que haya mandado el
    -- cliente (no puede adelantarlo, falsearlo ni borrarlo).
    new.updated_at = old.updated_at;
  end if;

  -- Campos inmutables tras la creacion: no se puede reasignar una resena a otro
  -- booking/cliente/profesional ni cambiarle la fecha de creacion; solo se edita el texto y el
  -- rating de la resena propia.
  new.booking_id = old.booking_id;
  new.client_id = old.client_id;
  new.professional_id = old.professional_id;
  new.created_at = old.created_at;
  return new;
end;
$$;
