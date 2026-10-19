import { IonButton, IonSpinner, IonText } from '@ionic/react';
import StarRating from './StarRating';
import { useProfessionalReviews } from '../lib/useProfessionalReviews';
import './Reviews.css';

interface Props {
  professionalId: string | undefined;
  /** Texto cuando todavía no hay reseñas. */
  emptyText?: string;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-GT', { year: 'numeric', month: 'short', day: 'numeric' });

/**
 * Lista pública de reseñas de un profesional (perfil público y "Mi reputación" de un profesional). El nombre
 * del autor ya viene abreviado desde la base ("María D."): acá no hay ids de personas.
 */
const ProfessionalReviews: React.FC<Props> = ({ professionalId, emptyText = 'Todavía no tiene reseñas.' }) => {
  const { reviews, loading, loadingMore, hasMore, error, loadMore } = useProfessionalReviews(professionalId);

  if (loading) {
    return (
      <div className="ion-text-center ion-padding">
        <IonSpinner />
      </div>
    );
  }

  return (
    <div className="review-list-wrap">
      {error && <IonText color="danger"><p className="review-list__msg">{error}</p></IonText>}

      {!error && reviews.length === 0 && <p className="review-list__msg review-list__empty">{emptyText}</p>}

      {reviews.length > 0 && (
        <ul className="review-list">
          {reviews.map((r) => (
            <li key={r.id} className="app-card review-item">
              <div className="review-item__head">
                <StarRating value={r.rating} label="Calificación" />
                <span className="review-item__who">{r.reviewer_name}</span>
                {r.is_mine && <span className="app-chip review-item__mine">Tu reseña</span>}
              </div>
              <p className="review-item__meta">
                {formatDate(r.created_at)}
                {r.updated_at && ' · editada'}
                {r.service_title && ` · ${r.service_title}`}
              </p>
              {r.comment && <p className="review-item__comment">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}

      {hasMore && (
        <div className="ion-text-center">
          <IonButton fill="clear" disabled={loadingMore} onClick={loadMore}>
            {loadingMore ? 'Cargando…' : 'Ver más reseñas'}
          </IonButton>
        </div>
      )}
    </div>
  );
};

export default ProfessionalReviews;
