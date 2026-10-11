import { useState } from 'react';
import { IonBadge, IonButton, IonFabButton, IonIcon, IonPopover } from '@ionic/react';
import { notificationsOutline } from 'ionicons/icons';
import { useNotifications, type AppNotification } from '../contexts/NotificationsContext';
import './Bookings.css';

interface Props {
  /** Si la notificación es de un mensaje nuevo, pide abrir el chat de esa reserva. */
  onOpenChat: (bookingId: string) => void;
}

/**
 * Botón flotante de notificaciones, solo en la pestaña de Solicitudes. Reemplaza la lista fija
 * de antes (notifications/NotificationsList): esa card siempre visible crecía con el historial y
 * terminaba empujando las solicitudes varias pantallas hacia abajo. Acá solo se muestran las NO
 * leídas - al leerse desaparecen, así que la lista nunca acumula. El botón ni aparece si no hay
 * nada pendiente.
 */
const NotificationsFab: React.FC<Props> = ({ onOpenChat }) => {
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications();
  const [popoverEvent, setPopoverEvent] = useState<Event | undefined>(undefined);

  const unread = notifications.filter((n) => !n.read_at);
  // Si no queda nada sin leer el botón se oculta, salvo que el popover esté abierto (p. ej. se vació
  // por un markRead en otra pestaña). El IonPopover SIEMPRE queda montado: si el componente
  // devolviera null al tocar la última notificación, se desmontaría en pleno cierre y Ionic podría
  // dejar el overlay colgado.
  const showFab = unread.length > 0 || !!popoverEvent;

  const handleClick = (n: AppNotification) => {
    markRead(n.id);
    if (n.type === 'new_message' && n.booking_id) {
      onOpenChat(n.booking_id);
      setPopoverEvent(undefined);
    }
  };

  return (
    <>
      {showFab && (
        <div className="notifications-fab">
          <IonFabButton
            size="small"
            color="light"
            onClick={(e) => setPopoverEvent(e.nativeEvent)}
            aria-label={`Notificaciones (${unreadCount} sin leer)`}
          >
            <IonIcon icon={notificationsOutline} />
          </IonFabButton>
          {unreadCount > 0 && (
            <IonBadge color="danger" className="notifications-fab__badge">{unreadCount > 9 ? '9+' : unreadCount}</IonBadge>
          )}
        </div>
      )}

      <IonPopover
        isOpen={!!popoverEvent}
        event={popoverEvent}
        onDidDismiss={() => setPopoverEvent(undefined)}
        className="notifications-popover"
      >
        <div className="notifications-popover__header">
          <span>Notificaciones</span>
          <IonButton fill="clear" size="small" onClick={() => { markAllRead(); setPopoverEvent(undefined); }}>
            Marcar todas leídas
          </IonButton>
        </div>
        {unread.length === 0 && <p className="notifications-popover__empty">Ya no hay notificaciones sin leer.</p>}
        <ul className="notifications__list">
          {unread.map((n) => (
            <li key={n.id}>
              <button type="button" className="notifications__item notifications__item--unread" onClick={() => handleClick(n)}>
                <div>
                  <p className="notifications__item-title">{n.title}</p>
                  {n.body && <p className="notifications__item-body">{n.body}</p>}
                  <p className="notifications__item-time">
                    {new Date(n.created_at).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </IonPopover>
    </>
  );
};

export default NotificationsFab;
