import { IonSpinner, IonText } from '@ionic/react';
import StarRating from './StarRating';
import ProfessionalReviews from './ProfessionalReviews';
import { useMyReputation } from '../lib/useMyReputation';
import './Reviews.css';

interface Props {
  userId: string;
  role: 'cliente' | 'profesional';
}

const COPY = {
  profesional: {
    unit: (n: number) => `reseña${n === 1 ? '' : 's'}`,
    none: 'Todavía no tenés reseñas',
    note: 'Es lo que ven los clientes en tu perfil. Las reseñas las dejan los clientes al completar un trabajo.',
  },
  cliente: {
    unit: (n: number) => `calificación${n === 1 ? '' : 'es'}`,
    none: 'Todavía no te calificó ningún profesional',
    note: 'Es el promedio con el que te califican los profesionales con los que trabajás. Solo lo ven ellos y vos, y los comentarios no se muestran.',
  },
} as const;

/** "Mi reputación" en el perfil: el promedio propio y, para un profesional, la lista de reseñas que recibió. */
const ReputationCard: React.FC<Props> = ({ userId, role }) => {
  const { reputation, error } = useMyReputation(userId, role);
  const copy = COPY[role];

  if (error) {
    return <IonText color="danger"><p className="review-list__msg">{error}</p></IonText>;
  }

  if (!reputation) {
    return (
      <div className="ion-text-center ion-padding">
        <IonSpinner />
      </div>
    );
  }

  const hasRatings = reputation.count > 0;

  return (
    <>
      <div className="app-card reputation-card">
        <div className="reputation-card__score">
          <span className="reputation-card__value">{hasRatings ? reputation.avg.toFixed(1) : '—'}</span>
          <div>
            {hasRatings && <StarRating value={Math.round(reputation.avg)} label="Promedio" />}
            <p className="reputation-card__count">
              {hasRatings ? `${reputation.count} ${copy.unit(reputation.count)}` : copy.none}
            </p>
          </div>
        </div>
        <p className="reputation-card__note">{copy.note}</p>
      </div>

      {role === 'profesional' && (
        <>
          <p className="app-section-label">Reseñas que recibiste</p>
          <ProfessionalReviews professionalId={userId} emptyText="Cuando un cliente reseñe un trabajo tuyo, va a aparecer acá." />
        </>
      )}
    </>
  );
};

export default ReputationCard;
