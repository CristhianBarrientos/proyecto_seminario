import { useEffect, useState } from 'react';
import { IonIcon, IonText, IonSpinner, IonButton } from '@ionic/react';
import {
  hourglassOutline, checkmarkCircleOutline, constructOutline, banOutline,
  closeCircleOutline, calendarOutline, cashOutline, chatbubbleOutline,
} from 'ionicons/icons';
import { supabase } from '../lib/supabaseClient';
import { getFriendlyErrorMessage } from '../lib/errorMessages';
import { bookingRowSchema, parseRowsOrDrop, type BookingRow, type BookingStatus } from '../lib/supabaseSchemas';
import './Bookings.css';

interface Props {
  userId: string;
}

interface ClientBookingItem extends BookingRow {
  professionalName: string | null;
}

const STATUS_META: Record<BookingStatus, { label: string; icon: string }> = {
  solicitado: { label: 'Solicitado', icon: hourglassOutline },
  aceptado: { label: 'Aceptado', icon: checkmarkCircleOutline },
  en_curso: { label: 'En curso', icon: constructOutline },
  completado: { label: 'Completado', icon: checkmarkCircleOutline },
  cancelado: { label: 'Cancelado', icon: banOutline },
};

const ClientBookings: React.FC<Props> = ({ userId }) => {
  const [bookings, setBookings] = useState<ClientBookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const load = async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, status, scheduled_at, price_agreed, notes, created_at, client_id, professional_id, services ( title, price_unit )')
      .eq('client_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      setError(getFriendlyErrorMessage(error));
      setLoading(false);
      return;
    }

    const rows = parseRowsOrDrop(bookingRowSchema, data ?? [], 'ClientBookings.bookings');
    const professionalIds = [...new Set(rows.map((r) => r.professional_id))];

    const { data: profilesData } = professionalIds.length
      ? await supabase.from('profiles_public').select('id, full_name').in('id', professionalIds)
      : { data: [] as { id: string; full_name: string }[] };

    const nameById = new Map((profilesData ?? []).map((p) => [p.id, p.full_name]));

    setBookings(rows.map((r) => ({ ...r, professionalName: nameById.get(r.professional_id) ?? null })));
    setLoading(false);
  };

  useEffect(() => {
    load();

    const channel = supabase
      .channel(`client-bookings-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `client_id=eq.${userId}` },
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

  const handleCancel = (id: string) => withPending(id, async () => {
    const { data, error } = await supabase
      .from('bookings')
      .update({ status: 'cancelado' })
      .eq('id', id)
      .select('id');

    if (error) {
      setError(getFriendlyErrorMessage(error));
      return;
    }
    if (!data || data.length === 0) {
      setError('No se pudo cancelar la solicitud (no tenés permiso o ya no existe).');
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
          <h3>Todavía no pediste ningún servicio</h3>
          <p>Cuando solicités un servicio a un profesional, el estado va a aparecer acá.</p>
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

          <p className="booking-item__party">Con {b.professionalName ?? 'Profesional'}</p>

          {b.scheduled_at && (
            <p className="booking-item__meta">
              <IonIcon icon={calendarOutline} color="medium" />
              {new Date(b.scheduled_at).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          )}

          {b.price_agreed !== null && (
            <p className="booking-item__meta">
              <IonIcon icon={cashOutline} color="medium" />
              Precio acordado: Q{b.price_agreed.toLocaleString('es-GT')}
            </p>
          )}

          {b.notes && (
            <p className="booking-item__meta booking-item__notes">
              <IonIcon icon={chatbubbleOutline} color="medium" />
              {b.notes}
            </p>
          )}

          {(b.status === 'solicitado' || b.status === 'aceptado') && (
            <div className="booking-item__actions">
              <IonButton
                fill="clear"
                color="danger"
                disabled={pendingIds.has(b.id)}
                onClick={() => handleCancel(b.id)}
              >
                <IonIcon icon={closeCircleOutline} slot="start" />
                Cancelar solicitud
              </IonButton>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ClientBookings;
