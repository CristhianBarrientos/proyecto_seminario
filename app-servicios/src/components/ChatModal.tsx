import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonModal, IonSpinner,
  IonText, IonTextarea, IonTitle, IonToolbar,
} from '@ionic/react';
import { sendOutline } from 'ionicons/icons';
import { z } from 'zod';
import { supabase } from '../lib/supabaseClient';
import { getFriendlyErrorMessage } from '../lib/errorMessages';
import { parseRowsOrDrop } from '../lib/supabaseSchemas';
import { useAuth } from '../contexts/AuthContext';
import './Chat.css';

const messageSchema = z.object({
  id: z.string(),
  booking_id: z.string(),
  sender_id: z.string(),
  body: z.string(),
  created_at: z.string(),
  read_at: z.string().nullable(),
});

type ChatMessage = z.infer<typeof messageSchema>;

const MAX_BODY = 2000;
const HISTORY_LIMIT = 200;
const SELECT_COLUMNS = 'id, booking_id, sender_id, body, created_at, read_at';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  otherName: string | null;
}

/**
 * Chat de una reserva (tabla messages, sql_docker/feature-chat.sql): historial
 * (últimos 200) + mensajes nuevos por realtime filtrados a esta reserva. Las
 * reglas (solo participantes, no en reservas canceladas, límite por minuto) las
 * impone la DB; los errores del trigger se muestran tal cual.
 */
const ChatModal: React.FC<Props> = ({ isOpen, onClose, bookingId, otherName }) => {
  const { user } = useAuth();
  const userId = user?.id;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const contentRef = useRef<HTMLIonContentElement>(null);

  const addMessage = useCallback((m: ChatMessage) => {
    setMessages((prev) => (prev.some((p) => p.id === m.id) ? prev : [...prev, m]));
  }, []);

  const markIncomingRead = useCallback(async () => {
    if (!userId) return;
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('booking_id', bookingId)
      .neq('sender_id', userId)
      .is('read_at', null);
  }, [bookingId, userId]);

  useEffect(() => {
    if (!isOpen || !userId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setMessages([]);

    (async () => {
      const { data, error: loadError } = await supabase
        .from('messages')
        .select(SELECT_COLUMNS)
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT);

      if (cancelled) return;
      if (loadError) {
        setError(getFriendlyErrorMessage(loadError));
      } else {
        const rows = parseRowsOrDrop(messageSchema, data ?? [], 'ChatModal.load');
        setMessages(rows.reverse());
        markIncomingRead();
      }
      setLoading(false);
    })();

    const channel = supabase
      .channel(`chat-${bookingId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `booking_id=eq.${bookingId}` },
        (payload) => {
          const parsed = messageSchema.safeParse(payload.new);
          if (!parsed.success) return;
          addMessage(parsed.data);
          if (parsed.data.sender_id !== userId) markIncomingRead();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [isOpen, bookingId, userId, addMessage, markIncomingRead]);

  useEffect(() => {
    contentRef.current?.scrollToBottom(150);
  }, [messages]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending || !userId) return;
    setSending(true);
    setError('');
    try {
      const { data, error: insertError } = await supabase
        .from('messages')
        .insert({ booking_id: bookingId, sender_id: userId, body })
        .select(SELECT_COLUMNS)
        .single();

      if (insertError) {
        setError(getFriendlyErrorMessage(insertError));
        return;
      }
      const parsed = messageSchema.safeParse(data);
      if (parsed.success) addMessage(parsed.data);
      setText('');
    } finally {
      setSending(false);
    }
  };

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>{otherName ?? 'Chat'}</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose}>Cerrar</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>

      <IonContent ref={contentRef} className="ion-padding">
        {loading && (
          <div className="ion-text-center"><IonSpinner /></div>
        )}

        {!loading && messages.length === 0 && !error && (
          <p className="chat__empty">Todavía no hay mensajes. Escribí el primero.</p>
        )}

        <div className="chat__list">
          {messages.map((m) => {
            const mine = m.sender_id === userId;
            return (
              <div key={m.id} className={`chat__bubble ${mine ? 'chat__bubble--mine' : 'chat__bubble--theirs'}`}>
                <p className="chat__body">{m.body}</p>
                <span className="chat__time">
                  {new Date(m.created_at).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}
                  {mine && m.read_at ? ' · Visto' : ''}
                </span>
              </div>
            );
          })}
        </div>
      </IonContent>

      <IonFooter>
        {error && <IonText color="danger"><p className="chat__error">{error}</p></IonText>}
        <IonToolbar>
          <div className="chat__composer">
            <IonTextarea
              placeholder="Escribí un mensaje"
              value={text}
              maxlength={MAX_BODY}
              autoGrow
              rows={1}
              disabled={sending}
              onIonInput={(e) => setText(e.detail.value ?? '')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <IonButton onClick={send} disabled={sending || !text.trim()} aria-label="Enviar mensaje">
              <IonIcon icon={sendOutline} slot="icon-only" />
            </IonButton>
          </div>
        </IonToolbar>
      </IonFooter>
    </IonModal>
  );
};

export default ChatModal;
