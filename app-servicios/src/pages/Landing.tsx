import { useEffect, useState } from 'react';
import { IonPage, IonContent } from '@ionic/react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { APP_NAME, APK_RELEASE, apkReleaseProblem, isApkAvailable } from '../lib/appRelease';
import './Landing.css';

// `categories` tiene lectura pública (policy categories_select_public), así que
// la landing las puede listar sin sesión. Si falla la carga, se usa la lista fija.
const categoryRowsSchema = z.array(z.object({ id: z.number(), name: z.string() }));

// Mismos nombres que la tabla `categories` (si la carga falla, la lista fija no debe contradecir a la base).
const FALLBACK_CATEGORIES = [
  'Albañilería', 'Carpintería', 'Electricista', 'Pintura', 'Plomería',
];

const STEPS = [
  {
    title: 'Buscá',
    text: 'Filtrá por oficio y encontrá profesionales con calificaciones reales y perfil verificado.',
  },
  {
    title: 'Solicitá',
    text: 'Pedí el servicio desde la app y coordiná los detalles por chat con el profesional.',
  },
  {
    title: 'Calificá',
    text: 'Al terminar el trabajo, dejá tu reseña para que otros clientes decidan con información.',
  },
];

const INSTALL_STEPS = [
  'Descargá el archivo .apk desde tu celular Android.',
  'Al abrirlo, Android pedirá permiso para instalar apps de este origen: aceptalo solo para tu navegador.',
  'Confirmá la instalación. Si Play Protect avisa que la app no es de Play Store, es esperado: la distribuimos directamente.',
  'Abrí Ya Quedó e iniciá sesión o creá tu cuenta.',
];

const Landing: React.FC = () => {
  const { session } = useAuth();
  const [categories, setCategories] = useState<string[]>(FALLBACK_CATEGORIES);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('categories')
      .select('id, name')
      .order('name')
      .then(
        ({ data, error }) => {
          if (cancelled) return;
          if (error) {
            console.error('[Landing] no se pudieron cargar los oficios, se usa la lista fija:', error);
            return;
          }
          const parsed = categoryRowsSchema.safeParse(data);
          if (parsed.success && parsed.data.length > 0) {
            setCategories(parsed.data.map((c) => c.name));
          } else if (!parsed.success) {
            console.error('[Landing] los oficios no tienen la forma esperada, se usa la lista fija:', parsed.error.issues);
          }
        },
        (err) => {
          if (!cancelled) console.error('[Landing] fallo de red al cargar los oficios, se usa la lista fija:', err);
        },
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const { version, sizeMb, sha256 } = APK_RELEASE;
  const apkAvailable = isApkAvailable(APK_RELEASE);
  useEffect(() => {
    const problem = apkReleaseProblem(APK_RELEASE);
    if (problem) console.warn('[Landing]', problem);
  }, []);
  // Con sesion, todos los accesos llevan al feed (la ruta /login ya redirige ahi, pero se evita el salto).
  const appPath = session ? '/tabs/home' : '/login';

  return (
    <IonPage>
      <IonContent fullscreen className="landing-content">
        <header className="landing-nav">
          <span className="landing-brand">{APP_NAME}</span>
          <nav className="landing-nav__links" aria-label="Secciones">
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#profesionales">Profesionales</a>
            <a href="#descargar">Android</a>
          </nav>
          <Link className="landing-btn landing-btn--small" to={appPath}>
            {session ? 'Ir a mi cuenta' : 'Ingresar'}
          </Link>
        </header>

        <section className="landing-hero">
          <div className="landing-hero__inner">
            <p className="landing-eyebrow">Oficios cerca de ti</p>
            <h1>El profesional que necesitás, a un mensaje de distancia.</h1>
            <p className="landing-hero__lead">
              {APP_NAME} conecta a clientes con electricistas, plomeros, albañiles y más.
              Compará perfiles, solicitá el servicio y calificá el trabajo, todo en un solo lugar.
            </p>
            <div className="landing-hero__cta">
              <Link className="landing-btn" to={appPath}>
                {session ? 'Ir a mi cuenta' : 'Usar en la web'}
              </Link>
              <a className="landing-btn landing-btn--ghost" href="#descargar">
                Descargar para Android
              </a>
            </div>
          </div>
        </section>

        <section className="landing-section" id="categorias" aria-labelledby="t-categorias">
          <h2 id="t-categorias">Oficios disponibles</h2>
          <ul className="landing-chips">
            {categories.map((name) => (
              <li key={name} className="landing-chip">{name}</li>
            ))}
          </ul>
        </section>

        <section className="landing-section" id="como-funciona" aria-labelledby="t-como">
          <h2 id="t-como">Cómo funciona</h2>
          <ol className="landing-steps">
            {STEPS.map((step, i) => (
              <li key={step.title} className="landing-step">
                <span className="landing-step__num" aria-hidden="true">{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section landing-pro" id="profesionales" aria-labelledby="t-pro">
          <div>
            <h2 id="t-pro">¿Sos profesional de un oficio?</h2>
            <p>
              Creá tu perfil, publicá tus servicios con precio y recibí solicitudes de clientes
              cerca de vos. Con tu documentación verificada, tu perfil muestra la insignia de confianza.
            </p>
          </div>
          <Link className="landing-btn" to="/login?modo=registro&rol=profesional">
            Crear mi perfil profesional
          </Link>
        </section>

        <section className="landing-section" id="descargar" aria-labelledby="t-descargar">
          <h2 id="t-descargar">Descargá la app para Android</h2>
          <div className="landing-download">
            <div className="landing-download__main">
              {apkAvailable ? (
                <>
                  <a className="landing-btn" href={APK_RELEASE.url} rel="noopener">
                    Descargar APK{sizeMb ? ` (${sizeMb} MB)` : ''}
                  </a>
                  <p className="landing-meta">Versión {version}</p>
                  <p className="landing-meta">
                    SHA-256: <code>{sha256}</code>
                  </p>
                </>
              ) : (
                <>
                  <button type="button" className="landing-btn landing-btn--disabled" disabled>
                    Descarga disponible pronto
                  </button>
                  <p className="landing-meta">Mientras tanto, podés usar la versión web.</p>
                </>
              )}
            </div>
            <ol className="landing-install">
              {INSTALL_STEPS.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ol>
          </div>
        </section>

        <footer className="landing-footer">
          <span>© {new Date().getFullYear()} {APP_NAME}</span>
          <Link to={appPath}>{session ? 'Ir a mi cuenta' : 'Ingresar'}</Link>
        </footer>
      </IonContent>
    </IonPage>
  );
};

export default Landing;
