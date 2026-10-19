import { useState } from 'react';
import { IonButton, IonIcon, IonTextarea } from '@ionic/react';
import { starOutline } from 'ionicons/icons';
import StarRating from './StarRating';
import { MAX_REVIEW_COMMENT, type MyReview } from '../lib/useMyReviews';
import './Reviews.css';

interface Props {
  /** Reseña ya publicada para esta reserva, si existe. */
  existing: MyReview | undefined;
  /** Para el aviso de que la reseña es pública ("el perfil de ..."). */
  professionalName: string | null;
  onSubmit: (rating: number, comment: string) => Promise<boolean>;
  onUpdate: (review: MyReview, rating: number, comment: string) => Promise<boolean>;
  onDelete: (review: MyReview) => Promise<boolean>;
}

type Mode = 'idle' | 'editing' | 'confirmDelete';

/**
 * Reseña del CLIENTE sobre un trabajo completado: 1 a 5 estrellas y un comentario opcional. Es pública (la ve
 * quien mire el perfil del profesional), editable y se puede eliminar. Espejo de RateClientForm, que es la
 * calificación en sentido contrario (profesional -> cliente, definitiva y sin comentario visible).
 */
const ReviewForm: React.FC<Props> = ({ existing, professionalName, onSubmit, onUpdate, onDelete }) => {
  const [mode, setMode] = useState<Mode>('idle');
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const startEditing = () => {
    setRating(existing?.rating ?? 0);
    setComment(existing?.comment ?? '');
    setMode('editing');
  };

  const run = async (action: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(true);
    try {
      if (await action()) setMode('idle');
    } finally {
      setBusy(false);
    }
  };

  const handleSave = () => {
    if (rating < 1) return;
    run(() => (existing ? onUpdate(existing, rating, comment) : onSubmit(rating, comment)));
  };

  if (mode === 'editing') {
    return (
      <div className="review-box review-box--form">
        <p className="review-box__title">{existing ? 'Editar tu reseña' : `¿Cómo te fue con ${professionalName ?? 'este profesional'}?`}</p>
        <StarRating value={rating} onChange={setRating} disabled={busy} label="Tu calificación" />
        <IonTextarea
          aria-label="Comentario de tu reseña"
          placeholder="Contá cómo te fue (opcional)"
          value={comment}
          maxlength={MAX_REVIEW_COMMENT}
          counter
          autoGrow
          disabled={busy}
          onIonInput={(e) => setComment(e.detail.value ?? '')}
        />
        <p className="review-box__hint">
          Tu reseña es pública: la verá cualquiera que mire el perfil de {professionalName ?? 'este profesional'}. Escribila con
          honestidad y respeto.
        </p>
        <div className="review-box__actions">
          <IonButton fill="solid" color="tertiary" disabled={busy || rating < 1} onClick={handleSave}>
            {existing ? 'Guardar cambios' : 'Publicar reseña'}
          </IonButton>
          <IonButton fill="clear" color="medium" disabled={busy} onClick={() => setMode('idle')}>
            Cancelar
          </IonButton>
        </div>
      </div>
    );
  }

  if (existing && mode === 'confirmDelete') {
    return (
      <div className="review-box">
        <p className="review-box__title">¿Eliminar tu reseña?</p>
        <p className="review-box__hint">Dejará de verse en el perfil del profesional y cuenta de nuevo para el promedio.</p>
        <div className="review-box__actions">
          <IonButton fill="solid" color="danger" disabled={busy} onClick={() => run(() => onDelete(existing))}>
            Sí, eliminar
          </IonButton>
          <IonButton fill="clear" color="medium" disabled={busy} onClick={() => setMode('idle')}>
            Conservarla
          </IonButton>
        </div>
      </div>
    );
  }

  if (existing) {
    return (
      <div className="review-box">
        <p className="review-box__title">
          Tu reseña {existing.edited && <span className="review-box__edited">(editada)</span>}
        </p>
        <StarRating value={existing.rating} label="Tu calificación" />
        {existing.comment && <p className="review-box__comment">{existing.comment}</p>}
        <div className="review-box__actions">
          <IonButton fill="clear" size="small" onClick={startEditing}>Editar</IonButton>
          <IonButton fill="clear" size="small" color="danger" onClick={() => setMode('confirmDelete')}>Eliminar</IonButton>
        </div>
      </div>
    );
  }

  return (
    <IonButton fill="outline" color="tertiary" onClick={startEditing}>
      <IonIcon icon={starOutline} slot="start" />
      Calificar profesional
    </IonButton>
  );
};

export default ReviewForm;
