-- ============================================================
-- FIX: una sola solicitud activa por cliente y servicio
--
-- Antes no había ningún límite: un cliente podía crear N reservas para el mismo
-- servicio (doble clic, spam al profesional con una notificación por cada una).
--
-- Regla: mientras exista una reserva en solicitado / aceptado / en_curso para el
-- par (client_id, service_id), no se puede crear otra. Al completarse o cancelarse
-- (estados terminales) el cliente puede volver a solicitar el servicio.
--
-- PRECONDICIÓN: no deben existir duplicados activos, o el CREATE INDEX falla.
-- Verificar antes con:
--   select client_id, service_id, count(*) from public.bookings
--   where status in ('solicitado','aceptado','en_curso')
--   group by 1, 2 having count(*) > 1;
-- ============================================================

create unique index if not exists bookings_one_active_per_service_idx
  on public.bookings (client_id, service_id)
  where status in ('solicitado', 'aceptado', 'en_curso');
