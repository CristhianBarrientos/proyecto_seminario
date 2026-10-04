import { useState } from 'react';
import { IonButton, IonIcon, IonTextarea } from '@ionic/react';
import { starOutline } from 'ionicons/icons';
import StarRating from './StarRating';

interface Props {
  /** Calificación ya enviada para esta reserva, si existe. */
  existingRating: number | undefined;
  onSubmit: (rating: number, comment: string) => Promise<boolean>;
}

const MAX_COMMENT = 500;

const RateClientForm: React.FC<Props> = ({ existingRating, onSubmit }) => {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  if (existingRating !== undefined) {
    return (
      <p className="booking-item__meta">
        Calificaste al cliente: <StarRating value={existingRating} label="Tu calificación" />
      </p>
    );
  }

  if (!open) {
    return (
      <IonButton fill="outline" color="tertiary" onClick={() => setOpen(true)}>
        <IonIcon icon={starOutline} slot="start" />
        Calificar cliente
      </IonButton>
    );
  }

  const handleSubmit = async () => {
    if (saving || rating < 1) return;
    setSaving(true);
    try {
      await onSubmit(rating, comment);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rate-client-form">
      <StarRating value={rating} onChange={setRating} disabled={saving} label="Tu calificación" />
      <IonTextarea
        placeholder="Comentario (opcional)"
        value={comment}
        maxlength={MAX_COMMENT}
        counter
        autoGrow
        disabled={saving}
        onIonInput={(e) => setComment(e.detail.value ?? '')}
      />
      <IonButton fill="solid" color="tertiary" disabled={saving || rating < 1} onClick={handleSubmit}>
        Enviar calificación
      </IonButton>
      <IonButton fill="clear" color="medium" disabled={saving} onClick={() => setOpen(false)}>
        Cancelar
      </IonButton>
    </div>
  );
};

export default RateClientForm;
