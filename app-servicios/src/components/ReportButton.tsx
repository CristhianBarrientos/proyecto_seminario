import { useRef, useState } from 'react';
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonModal, IonSelect, IonSelectOption,
  IonText, IonTextarea, IonTitle, IonToolbar,
} from '@ionic/react';
import { flagOutline } from 'ionicons/icons';
import { supabase } from '../lib/supabaseClient';
import { getFriendlyErrorMessage } from '../lib/errorMessages';
import { REPORT_REASONS, REPORT_DETAILS_MAX_LENGTH, type ReportReason } from '../lib/constants';

interface Props {
  reporterId: string;
  reportedId: string;
  reportedName: string | null;
  bookingId: string;
}

/**
 * Botón + modal para denunciar a la otra parte de una reserva (tabla reports,
 * ver sql_docker/feature-reports.sql). Las reglas de fondo (solo con reserva
 * compartida, límite diario, una denuncia abierta por reserva) las impone la
 * DB; acá solo se valida lo básico y se muestra el mensaje del trigger tal cual.
 */
const ReportButton: React.FC<Props> = ({ reporterId, reportedId, reportedName, bookingId }) => {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  // Se incrementa al cerrar el modal: una respuesta tardía de un envío anterior no debe
  // mostrar "Denuncia enviada" ni un error viejo en el modal reabierto.
  const attempt = useRef(0);

  const close = () => {
    attempt.current += 1;
    setSaving(false);
    setOpen(false);
    setReason('');
    setDetails('');
    setError('');
    setSent(false);
  };

  const submit = async () => {
    if (saving || !reason) return;
    const myAttempt = attempt.current;
    setSaving(true);
    setError('');
    try {
      const { error: insertError } = await supabase.from('reports').insert({
        reporter_id: reporterId,
        reported_id: reportedId,
        booking_id: bookingId,
        reason,
        details: details.trim() || null,
      });
      if (myAttempt !== attempt.current) return;
      if (insertError) {
        setError(getFriendlyErrorMessage(insertError));
        return;
      }
      setSent(true);
    } finally {
      if (myAttempt === attempt.current) setSaving(false);
    }
  };

  return (
    <>
      <IonButton fill="clear" color="medium" size="small" onClick={() => setOpen(true)}>
        <IonIcon icon={flagOutline} slot="start" />
        Denunciar
      </IonButton>

      <IonModal isOpen={open} onDidDismiss={close}>
        <IonHeader>
          <IonToolbar>
            <IonTitle>Denunciar a {reportedName ?? 'este usuario'}</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={close}>Cerrar</IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding">
          {sent ? (
            <IonText>
              <h3>Denuncia enviada</h3>
              <p>La vamos a revisar. La otra persona no ve que la enviaste.</p>
              <IonButton expand="block" onClick={close}>Listo</IonButton>
            </IonText>
          ) : (
            <>
              <IonSelect
                label="Motivo"
                labelPlacement="stacked"
                interface="popover"
                placeholder="Elegí un motivo"
                value={reason}
                disabled={saving}
                onIonChange={(e) => setReason(e.detail.value)}
              >
                {REPORT_REASONS.map((r) => (
                  <IonSelectOption key={r.value} value={r.value}>{r.label}</IonSelectOption>
                ))}
              </IonSelect>

              <IonTextarea
                label="Detalles (opcional)"
                labelPlacement="stacked"
                placeholder="Contanos qué pasó"
                value={details}
                maxlength={REPORT_DETAILS_MAX_LENGTH}
                counter
                autoGrow
                disabled={saving}
                onIonInput={(e) => setDetails(e.detail.value ?? '')}
              />

              {error && <IonText color="danger"><p>{error}</p></IonText>}

              <IonButton expand="block" color="danger" disabled={saving || !reason} onClick={submit}>
                Enviar denuncia
              </IonButton>
            </>
          )}
        </IonContent>
      </IonModal>
    </>
  );
};

export default ReportButton;
