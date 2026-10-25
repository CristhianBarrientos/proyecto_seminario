import { useEffect, useRef, useState } from 'react';
import {
  IonPage, IonContent,
  IonItem, IonLabel, IonInput, IonButton, IonSegment,
  IonSegmentButton, IonText, IonLoading, IonIcon,
} from '@ionic/react';
import {
  hammerOutline, mailOutline, lockClosedOutline, personOutline, briefcaseOutline,
  eyeOutline, eyeOffOutline, checkmarkOutline, arrowBackOutline,
} from 'ionicons/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { getFriendlyErrorMessage } from '../lib/errorMessages';
import { clearIdleLogoutFlag, peekIdleLogoutFlag } from '../lib/idleSession';
import {
  isStrongPassword, isValidEmail, isValidFullName, MIN_LOGIN_PASSWORD_LENGTH,
} from '../lib/validation';
import PasswordRules from '../components/PasswordRules';
import './Login.css';

type Mode = 'login' | 'signup';
type Role = 'cliente' | 'profesional';

/** Crear cuenta va en pasos; iniciar sesión es un solo formulario (no necesita flujo). */
const SIGNUP_STEPS = ['Quién sos', 'Tu correo', 'Elegí una contraseña'] as const;
const LAST_STEP = SIGNUP_STEPS.length - 1;

const ROLE_OPTIONS: { value: Role; label: string; hint: string; icon: string }[] = [
  { value: 'cliente', label: 'Cliente', hint: 'Busco quién resuelva un trabajo', icon: personOutline },
  { value: 'profesional', label: 'Profesional', hint: 'Ofrezco mis servicios por oficio', icon: briefcaseOutline },
];

const HERO_COPY: Record<Mode, string> = {
  login: 'Encontrá o publicá servicios de electricidad, plomería, albañilería y más.',
  signup: 'Creá tu cuenta en 3 pasos rápidos y empezá hoy.',
};

const Login: React.FC = () => {
  const navigate = useNavigate();
  // La landing enlaza a /login?modo=registro[&rol=profesional] para abrir directo el alta.
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(searchParams.get('modo') === 'registro' ? 'signup' : 'login');
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>(searchParams.get('rol') === 'profesional' ? 'profesional' : 'cliente');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [letterAnim, setLetterAnim] = useState(false);
  const [letterSettle, setLetterSettle] = useState(false);
  // Si la sesión se cerró por inactividad, se explica una sola vez: se lee sin efectos
  // secundarios (el inicializador debe ser puro) y la marca se borra en un efecto.
  const [idleLogoutNotice] = useState(peekIdleLogoutFlag);
  useEffect(() => {
    clearIdleLogoutFlag();
  }, []);

  const nameRef = useRef<HTMLIonInputElement>(null);
  const emailRef = useRef<HTMLIonInputElement>(null);
  const passwordRef = useRef<HTMLIonInputElement>(null);

  const signup = mode === 'signup';

  // Ionic mantiene Login montado en su pila de navegacion: los useState iniciales de arriba solo corren
  // la primera vez. Si ya se habia abierto /login y despues se llega desde la landing con
  // ?modo=registro&rol=profesional, el formulario seguia en "iniciar sesion" como cliente. Se sincroniza
  // con la URL cada vez que cambian esos parametros (sin parametros = inicio de sesion como cliente) y se
  // vuelve al primer paso.
  const modoParam = searchParams.get('modo');
  const rolParam = searchParams.get('rol');
  useEffect(() => {
    setMode(modoParam === 'registro' ? 'signup' : 'login');
    setRole(rolParam === 'profesional' ? 'profesional' : 'cliente');
    setStep(0);
    setTouched(false);
    setError('');
  }, [modoParam, rolParam]);

  // Un campo solo se marca como inválido tras un intento de avanzar/enviar (touched) y solo si está a la vista.
  const fullNameInvalid = touched && !isValidFullName(fullName);
  const emailInvalid = touched && !isValidEmail(email);
  const passwordInvalid = touched && (signup ? !isStrongPassword(password) : password.trim().length < MIN_LOGIN_PASSWORD_LENGTH);

  const fieldClass = (invalid: boolean) => `app-field${invalid ? ' app-field--invalid' : ''}`;

  const signupStepValid = (s: number): boolean => {
    if (s === 0) return isValidFullName(fullName);
    if (s === 1) return isValidEmail(email);
    return isStrongPassword(password);
  };

  const focusStep = (s: number) => {
    const target = [nameRef, emailRef, passwordRef][s];
    window.setTimeout(() => target.current?.setFocus(), 80);
  };

  const goToStep = (next: number) => {
    setStep(next);
    setTouched(false);
    setError('');
    focusStep(next);
  };

  const changeMode = (next: Mode) => {
    setMode(next);
    setStep(0);
    setError('');
    setTouched(false);
  };

  const handleLogin = async () => {
    setTouched(true);
    if (!isValidEmail(email) || password.trim().length < MIN_LOGIN_PASSWORD_LENGTH) {
      setError('Revisá los campos marcados antes de continuar.');
      return;
    }

    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError(getFriendlyErrorMessage(error));
      return;
    }
    navigate('/tabs/home');
  };

  const handleSignup = async () => {
    // Por si algo cambió desde que se validó cada paso: si falta algo, se vuelve al primer paso con error.
    const firstInvalid = [0, 1, 2].find((s) => !signupStepValid(s));
    if (firstInvalid !== undefined) {
      setStep(firstInvalid);
      setTouched(true);
      focusStep(firstInvalid);
      return;
    }

    setLoading(true);
    setError('');

    // La fila en "profiles" la crea un trigger en la misma transacción
    // del signup (ver sql_docker/fix-signup-orfano.sql) - full_name/role
    // van como metadata, no como insert separado, para que no pueda
    // quedar un usuario en auth.users sin su fila en profiles.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), role } },
    });

    setLoading(false);

    if (signUpError || !data.user) {
      setError(getFriendlyErrorMessage(signUpError ?? new Error('No se pudo crear la cuenta')));
      return;
    }

    navigate('/tabs/home');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!signup) {
      void handleLogin();
      return;
    }
    setTouched(true);
    if (!signupStepValid(step)) return;
    if (step < LAST_STEP) {
      goToStep(step + 1);
      return;
    }
    void handleSignup();
  };

  const ctaLabel = !signup ? 'Entrar' : step < LAST_STEP ? 'Continuar' : 'Crear mi cuenta';

  // Cada campo se declara una vez y se muestra según el modo/paso.
  const showName = signup && step === 0;
  const showRole = signup && step === 0;
  const showEmail = !signup || step === 1;
  const showPasswordField = !signup || step === 2;

  return (
    <IonPage>
      <IonContent fullscreen className="login-content">
        <div className="login-hero app-hero">
          <div className="app-hero-icon login-hero__icon">
            <IonIcon icon={hammerOutline} />
          </div>
          <h1 className="login-hero__title">Oficios cerca de ti</h1>
          <p className="login-hero__subtitle">{HERO_COPY[mode]}</p>
          <svg className="login-hero__wave login-hero__wave--back" viewBox="0 0 1200 60" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 30 C150 0 300 60 450 30 S750 0 900 30 S1050 60 1200 30 V60 H0Z" />
          </svg>
          <svg className="login-hero__wave login-hero__wave--front" viewBox="0 0 1200 60" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 36 C150 6 300 66 450 36 S750 6 900 36 S1050 66 1200 36 V60 H0Z" />
          </svg>
        </div>

        <form className="login-card" onSubmit={handleSubmit} noValidate>
          <IonSegment
            value={mode}
            onIonChange={(e) => changeMode(e.detail.value as Mode)}
          >
            <IonSegmentButton value="login">
              <IonLabel>Iniciar sesión</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="signup">
              <IonLabel>Crear cuenta</IonLabel>
            </IonSegmentButton>
          </IonSegment>

          {signup && (
            <div className="login-progress">
              <div className="login-progress__row">
                <span>Paso <b>{step + 1}</b> de {SIGNUP_STEPS.length}</span>
                <span>{SIGNUP_STEPS[step]}</span>
              </div>
              <div
                className="login-progress__bar"
                role="progressbar"
                aria-label="Progreso del registro"
                aria-valuemin={1}
                aria-valuemax={SIGNUP_STEPS.length}
                aria-valuenow={step + 1}
              >
                <i style={{ width: `${((step + 1) / SIGNUP_STEPS.length) * 100}%` }} />
              </div>
            </div>
          )}

          {/* La clave por paso reinicia la animación de entrada al avanzar o retroceder. */}
          <div className="login-step" key={signup ? `signup-${step}` : 'login'}>
            {showName && (
              <>
                <IonItem className={fieldClass(fullNameInvalid)}>
                  <IonIcon icon={personOutline} slot="start" color="medium" />
                  <IonLabel position="stacked">Nombre completo *</IonLabel>
                  <IonInput
                    ref={nameRef}
                    value={fullName}
                    autocomplete="name"
                    placeholder="Ej. María López"
                    onIonInput={(e) => setFullName(e.detail.value!)}
                  />
                </IonItem>
                {fullNameInvalid && (
                  <IonText color="danger">
                    <p className="field-error">Ingresá tu nombre y apellido (solo letras, sin números).</p>
                  </IonText>
                )}
              </>
            )}

            {showRole && (
              <div className="role-cards" role="radiogroup" aria-label="Tipo de cuenta">
                {ROLE_OPTIONS.map((option) => {
                  const selected = role === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`role-card${selected ? ' role-card--on' : ''}`}
                      onClick={() => setRole(option.value)}
                    >
                      <span className="role-card__icon" aria-hidden="true"><IonIcon icon={option.icon} /></span>
                      <b>{option.label}</b>
                      <small>{option.hint}</small>
                      <span className="role-card__tick" aria-hidden="true"><IonIcon icon={checkmarkOutline} /></span>
                    </button>
                  );
                })}
              </div>
            )}

            {showEmail && (
              <>
                <IonItem className={fieldClass(emailInvalid)}>
                  <IonIcon icon={mailOutline} slot="start" color="medium" />
                  <IonLabel position="stacked">Correo *</IonLabel>
                  <IonInput
                    ref={emailRef}
                    type="email"
                    autocomplete="email"
                    value={email}
                    onIonInput={(e) => setEmail(e.detail.value!)}
                  />
                </IonItem>
                {emailInvalid && (
                  <IonText color="danger"><p className="field-error">Ingresá un correo válido.</p></IonText>
                )}
              </>
            )}

            {showPasswordField && (
              <>
                <IonItem className={fieldClass(passwordInvalid)}>
                  <IonIcon icon={lockClosedOutline} slot="start" color="medium" />
                  <IonLabel position="stacked">Contraseña *</IonLabel>
                  {letterAnim ? (
                    <div className={`password-letters${letterSettle ? ' password-letters--settle' : ''}`} aria-hidden="true">
                      {[...(showPassword ? password : '•'.repeat(password.length))].map((ch, i) => (
                        <span key={i} className="password-letter" style={{ animationDelay: `${i * 35}ms` }}>
                          {ch}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <IonInput
                      ref={passwordRef}
                      key={showPassword ? 'text' : 'password'}
                      type={showPassword ? 'text' : 'password'}
                      autocomplete={signup ? 'new-password' : 'current-password'}
                      value={password}
                      onIonInput={(e) => setPassword(e.detail.value!)}
                      className="password-input"
                    />
                  )}
                  <button
                    type="button"
                    className="password-toggle"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => {
                      setShowPassword((v) => !v);
                      setLetterAnim(true);
                      setLetterSettle(false);
                      // 1) las letras revelan en cascada con su espaciado ancho,
                      // 2) ese espaciado se cierra suave (transition en CSS),
                      // 3) recién ahí vuelve el input real - nunca un corte.
                      const revealDuration = password.length * 35 + 450;
                      window.setTimeout(() => setLetterSettle(true), revealDuration);
                      window.setTimeout(() => setLetterAnim(false), revealDuration + 260);
                    }}
                    slot="end"
                  >
                    <span className="password-toggle__pulse" key={showPassword ? 'open' : 'closed'}>
                      <IonIcon
                        icon={showPassword ? eyeOutline : eyeOffOutline}
                        color="medium"
                        className="password-toggle__icon"
                      />
                    </span>
                  </button>
                </IonItem>
                {signup ? (
                  <>
                    <PasswordRules password={password} />
                    {passwordInvalid && (
                      <IonText color="danger">
                        <p className="field-error">La contraseña todavía no cumple todos los requisitos.</p>
                      </IonText>
                    )}
                  </>
                ) : (
                  passwordInvalid && (
                    <IonText color="danger">
                      <p className="field-error">La contraseña debe tener al menos {MIN_LOGIN_PASSWORD_LENGTH} caracteres.</p>
                    </IonText>
                  )
                )}
              </>
            )}
          </div>

          {idleLogoutNotice && !error && (
            <IonText color="medium">
              <p role="status">Tu sesión se cerró por inactividad. Ingresá de nuevo para continuar.</p>
            </IonText>
          )}

          {error && (
            <IonText color="danger">
              <p role="alert">{error}</p>
            </IonText>
          )}

          <div className="login-actions">
            {signup && step > 0 && (
              <IonButton fill="outline" color="medium" className="login-back" onClick={() => goToStep(step - 1)}>
                <IonIcon icon={arrowBackOutline} slot="start" />
                Atrás
              </IonButton>
            )}
            <IonButton type="submit" expand="block" className="login-cta" color="secondary">
              {ctaLabel}
            </IonButton>
          </div>

          {/* Permite enviar con Enter desde un IonInput: el botón de Ionic vive en un shadow DOM y no cuenta. */}
          <button type="submit" className="login-hidden-submit" tabIndex={-1} aria-hidden="true" />
        </form>

        <IonLoading isOpen={loading} message="Un momento..." />
      </IonContent>
    </IonPage>
  );
};

export default Login;
