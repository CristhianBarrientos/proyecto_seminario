import { useEffect, useState } from 'react';
import { IonIcon, IonText, IonSpinner, IonButton } from '@ionic/react';
import {
  hourglassOutline, checkmarkCircleOutline, constructOutline, banOutline,
  closeCircleOutline, calendarOutline, cashOutline, chatbubbleOutline,
  thumbsUpOutline, playOutline, checkmarkDoneOutline,
} from 'ionicons/icons';
import { supabase } from '../lib/supabaseClient';
import { getFriendlyErrorMessage } from '../lib/errorMessages';
import { bookingRowSchema, parseRowsOrDrop, type BookingRow, type BookingStatus } from '../lib/supabaseSchemas';
import './Bookings.css';

interface Props {
  userId: string;
}

interface ProfessionalBookingItem extends BookingRow {
  clientName: string | null;
}

const STATUS_META: Record<BookingStatus, { label: string; icon: string }> = {
  solicitado: { label: 'Solicitado', icon: hourglassOutline },
  aceptado: { label: 'Aceptado', icon: checkmarkCircleOutline },
  en_curso: { label: 'En curso', icon: constructOutline },
  completado: { label: 'Completado', icon: checkmarkCircleOutline },
  cancelado: { label: 'Cancelado', icon: banOutline },
};

const ProfessionalBookings: React.FC<Props> = ({ userId }) => {
  const [bookings, setBookings] = useState<ProfessionalBookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const load = async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, status, scheduled_at, price_agreed, notes, created_at, client_id, professional_id, services ( title, price_unit )')
      .eq('professional_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      setError(getFriendlyErrorMessage(error));
      setLoading(false);
      return;
    }

    const rows = parseRowsOrDrop(bookingRowSchema, data ?? [], 'ProfessionalBookings.bookings');
    const clientIds = [...new Set(rows.map((r) => r.client_id))];

    const { data: profilesData } = clientIds.length
      ? await supabase.from('profiles_public').select('id, full_name').in('id', clientIds)
      : { data: [] as { id: string; full_name: string }[] };

    const nameById = new Map((profilesData ?? []).map((p) => [p.id, p.full_name]));

    setBookings(rows.map((r) => ({ ...r, clientName: nameById.get(r.client_id) ?? null })));
    setLoading(false);
  };

  useEffect(() => {
    load();

    const channel = supabase
      .channel(`professional-bookings-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `professional_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const withPending = async (id: string, fn: () => Promise<void>) => {
    if (pendingIds.has(id)) return;
    setPendingIds((prev) => new Set(prev).add(id));
    try {
      await fn();
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const setStatus = (id: string, status: BookingStatus) => withPending(id, async () => {
    const { data, error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', id)
      .select('id');

    if (error) {
      setError(getFriendlyErrorMessage(error));
      return;
    }
    if (!data || data.length === 0) {
      setError('No se pudo actualizar la solicitud (no tenés permiso o ya no existe).');
      return;
    }
    setError('');
    load();
  });

  if (loading) {
    return (
      <div className="ion-text-center ion-padding">
        <IonSpinner />
      </div>
    );
  }

  return (
    <div className="bookings-list">
      {error && <IonText color="danger"><p className="ion-padding-horizontal">{error}</p></IonText>}

      {bookings.length === 0 && (
        <div className="app-empty">
          <IonIcon icon={hourglassOutline} />
          <h3>Todavía no tenés solicitudes</h3>
          <p>Cuando un cliente te pida un servicio, va a aparecer acá.</p>
        </div>
      )}

      {bookings.map((b) => (
        <div key={b.id} className="app-card booking-item">
          <div className="booking-item__header">
            <p className="booking-item__title">
              <IonIcon icon={constructOutline} />
              {b.services?.title ?? 'Servicio'}
            </p>
            <span className={`app-chip booking-status booking-status--${b.status}`}>
              <IonIcon icon={STATUS_META[b.status].icon} />
              {STATUS_META[b.status].label}
            </span>
          </div>

          <p className="booking-item__party">De {b.clientName ?? 'Cliente'}</p>

          {b.scheduled_at && (
            <p className="booking-item__meta">
              <IonIcon icon={calendarOutline} color="medium" />
              {new Date(b.scheduled_at).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          )}

          {b.price_agreed !== null && (
            <p className="booking-item__meta">
              <IonIcon icon={cashOutline} color="medium" />
              Precio acordado: Q{b.price_agreed}
            </p>
          )}

          {b.notes && (
            <p className="booking-item__meta booking-item__notes">
              <IonIcon icon={chatbubbleOutline} color="medium" />
              {b.notes}
            </p>
          )}

          <div className="booking-item__actions">
            {b.status === 'solicitado' && (
              <>
                <IonButton
                  fill="solid"
                  color="tertiary"
                  disabled={pendingIds.has(b.id)}
                  onClick={() => setStatus(b.id, 'aceptado')}
                >
                  <IonIcon icon={thumbsUpOutline} slot="start" />
                  Aceptar
                </IonButton>
                <IonButton
                  fill="clear"
                  color="danger"
                  disabled={pendingIds.has(b.id)}
                  onClick={() => setStatus(b.id, 'cancelado')}
                >
                  <IonIcon icon={closeCircleOutline} slot="start" />
                  Rechazar
                </IonButton>
              </>
            )}

            {b.status === 'aceptado' && (
              <>
                <IonButton
                  fill="solid"
                  color="tertiary"
                  disabled={pendingIds.has(b.id)}
                  onClick={() => setStatus(b.id, 'en_curso')}
                >
                  <IonIcon icon={playOutline} slot="start" />
                  Iniciar trabajo
                </IonButton>
                <IonButton
                  fill="clear"
                  color="danger"
                  disabled={pendingIds.has(b.id)}
                  onClick={() => setStatus(b.id, 'cancelado')}
                >
                  <IonIcon icon={closeCircleOutline} slot="start" />
                  Cancelar
                </IonButton>
              </>
            )}

            {b.status === 'en_curso' && (
              <>
                <IonButton
                  fill="solid"
                  color="tertiary"
                  disabled={pendingIds.has(b.id)}
                  onClick={() => setStatus(b.id, 'completado')}
                >
                  <IonIcon icon={checkmarkDoneOutline} slot="start" />
                  Marcar completado
                </IonButton>
                <IonButton
                  fill="clear"
                  color="danger"
                  disabled={pendingIds.has(b.id)}
                  onClick={() => setStatus(b.id, 'cancelado')}
                >
                  <IonIcon icon={closeCircleOutline} slot="start" />
                  Cancelar
                </IonButton>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ProfessionalBookings;
