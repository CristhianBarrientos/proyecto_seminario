import { IonIcon } from '@ionic/react';
import { checkmarkOutline } from 'ionicons/icons';
import { checkPasswordRules } from '../lib/validation';
import './PasswordRules.css';

interface Props {
  password: string;
}

/**
 * Requisitos de la contraseña al crear una cuenta (lib/validation.ts), que se van marcando mientras se escribe,
 * con un medidor de cuántos se cumplen. Es informativo: lo que bloquea el envío es isStrongPassword y, de fondo,
 * el servidor (GoTrue). El estado se anuncia a lectores de pantalla ("cumplido" / "pendiente").
 */
const PasswordRules: React.FC<Props> = ({ password }) => {
  const rules = checkPasswordRules(password);
  const met = password ? rules.filter((r) => r.ok).length : 0;

  return (
    <div className="password-rules">
      <div
        className={`password-rules__meter password-rules__meter--${met}`}
        role="progressbar"
        aria-label="Cuántos requisitos cumple tu contraseña"
        aria-valuemin={0}
        aria-valuemax={rules.length}
        aria-valuenow={met}
      >
        <i style={{ width: `${(met / rules.length) * 100}%` }} />
      </div>
      <ul className="password-rules__list" aria-label="Requisitos de la contraseña">
        {rules.map((rule) => (
          <li key={rule.id} className={rule.ok ? 'is-ok' : undefined}>
            <span className="password-rules__tick" aria-hidden="true">
              <IonIcon icon={checkmarkOutline} />
            </span>
            {rule.label}
            <span className="password-rules__sr">{rule.ok ? ' (cumplido)' : ' (pendiente)'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default PasswordRules;
