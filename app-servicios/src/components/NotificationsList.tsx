import { IonButton, IonIcon } from '@ionic/react';
import { notificationsOutline, notificationsCircle } from 'ionicons/icons';
import { useNotifications } from '../contexts/NotificationsContext';
import './Bookings.css';

const VISIBLE = 5;

const NotificationsList: React.FC = () => {
  const { notifications, unreadCount, markAllRead } = useNotifications();

  if (notifications.length === 0) return null;

  return (
    <section className="app-card notifications" aria-label="Notificaciones">
      <div className="notifications__header">
        <h3 className="notifications__title">
          <IonIcon icon={notificationsOutline} />
          Notificaciones{unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}
        </h3>
        {unreadCount > 0 && (
          <IonButton fill="clear" size="small" onClick={markAllRead}>
            Marcar leídas
          </IonButton>
        )}
      </div>

      <ul className="notifications__list">
        {notifications.slice(0, VISIBLE).map((n) => (
          <li key={n.id} className={`notifications__item${n.read_at ? '' : ' notifications__item--unread'}`}>
            {!n.read_at && <IonIcon icon={notificationsCircle} color="danger" aria-label="Sin leer" />}
            <div>
              <p className="notifications__item-title">{n.title}</p>
              {n.body && <p className="notifications__item-body">{n.body}</p>}
              <p className="notifications__item-time">
                {new Date(n.created_at).toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default NotificationsList;
