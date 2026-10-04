import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useIonToast } from '@ionic/react';
import { notificationsOutline } from 'ionicons/icons';
import { z } from 'zod';
import { supabase } from '../lib/supabaseClient';
import { parseRowsOrDrop } from '../lib/supabaseSchemas';
import { useAuth } from './AuthContext';

export const notificationSchema = z.object({
  id: z.string(),
  type: z.enum(['booking_requested', 'booking_status', 'new_message']),
  booking_id: z.string().nullable(),
  title: z.string(),
  body: z.string().nullable(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});

export type AppNotification = z.infer<typeof notificationSchema>;

const PAGE_SIZE = 30;

interface NotificationsContextType {
  notifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType>({
  notifications: [],
  unreadCount: 0,
  markAllRead: async () => {},
});

/**
 * Notificaciones in-app (tabla notifications, sql_docker/feature-notifications.sql).
 * Las crean triggers en la DB; acá solo se leen (últimas 30), se escucha el INSERT
 * por realtime filtrado al usuario actual y se marcan como leídas.
 */
export const NotificationsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [presentToast] = useIonToast();

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, booking_id, title, body, read_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);

    if (error) {
      console.error('[Notifications] no se pudieron cargar:', error);
      return;
    }
    setNotifications(parseRowsOrDrop(notificationSchema, data ?? [], 'Notifications.load'));
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      return;
    }
    load();

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const parsed = notificationSchema.safeParse(payload.new);
          if (!parsed.success) {
            load();
            return;
          }
          const n = parsed.data;
          setNotifications((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev].slice(0, PAGE_SIZE)));
          presentToast({
            message: n.body ? `${n.title}: ${n.body}` : n.title,
            duration: 4000,
            position: 'top',
            icon: notificationsOutline,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load, presentToast]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);

    if (error) {
      console.error('[Notifications] no se pudieron marcar como leídas:', error);
      return;
    }
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
  }, [userId]);

  const value = useMemo(
    () => ({ notifications, unreadCount: notifications.filter((n) => !n.read_at).length, markAllRead }),
    [notifications, markAllRead],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
};

export const useNotifications = () => useContext(NotificationsContext);
