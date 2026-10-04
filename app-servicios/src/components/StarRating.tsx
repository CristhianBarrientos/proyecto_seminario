import { IonIcon } from '@ionic/react';
import { star, starOutline } from 'ionicons/icons';

interface Props {
  value: number;
  /** Si se pasa, las estrellas son botones y devuelven la nueva calificación. */
  onChange?: (value: number) => void;
  disabled?: boolean;
  label?: string;
}

const StarRating: React.FC<Props> = ({ value, onChange, disabled = false, label = 'Calificación' }) => (
  <span className="star-rating" role={onChange ? 'radiogroup' : 'img'} aria-label={`${label}: ${value} de 5`}>
    {[1, 2, 3, 4, 5].map((n) => {
      const icon = <IonIcon icon={n <= value ? star : starOutline} color={n <= value ? 'warning' : 'medium'} />;
      if (!onChange) return <span key={n}>{icon}</span>;
      return (
        <button
          key={n}
          type="button"
          className="star-rating__btn"
          role="radio"
          aria-checked={n === value}
          aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`}
          disabled={disabled}
          onClick={() => onChange(n)}
        >
          {icon}
        </button>
      );
    })}
  </span>
);

export default StarRating;
