import { Fragment, useEffect, useState } from 'react';
import { IonPage, IonContent, IonIcon, IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton } from '@ionic/react';
import { hammerOutline, homeOutline, calendarOutline, personOutline } from 'ionicons/icons';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { APP_NAME, APK_RELEASE, apkReleaseProblem, isApkAvailable } from '../lib/appRelease';
import './Landing.css';

// Palabras del titular: cada una entra con su retraso (ver .landing-word en el CSS). `necesitás` va resaltada.
const HEADLINE: { text: string; hl?: boolean }[] = [
  { text: 'El' }, { text: 'profesional' }, { text: 'que' }, { text: 'necesitás,', hl: true }, { text: 'a' },
  { text: 'un' }, { text: 'mensaje' }, { text: 'de' }, { text: 'distancia.' },
];

// Muestra decorativa para la maqueta del teléfono del hero (no son datos de la base).
const PHONE_ROWS = [
  { initials: 'MR', name: 'Marvin R.', trade: 'Electricista', rating: '4.9' },
  { initials: 'LM', name: 'Lucía M.', trade: 'Plomería', rating: '4.8' },
  { initials: 'JP', name: 'Jorge P.', trade: 'Pintura', rating: '4.7' },
  { initials: 'CT', name: 'Carlos T.', trade: 'Carpintería', rating: '4.9' },
];

// Filtros de la maqueta. El seleccionado es "Todos" porque las filas muestran varios oficios: un oficio
// resaltado (p. ej. el primero de la base, Albañilería) contradiría la lista. Son fijos a propósito, no
// vienen de `categories`: la maqueta debe verse igual haya o no carga de la base.
const PHONE_CHIPS = ['Todos', ...PHONE_ROWS.slice(0, 3).map((row) => row.trade)];

// El hero tiene varias animaciones infinitas (gradiente, luces difusas, telefono): fuera de pantalla se pausan
// con data-offscreen (ver el CSS) para no repintar capas grandes sin que nadie las vea.
function usePauseHeroOffscreen() {
  useEffect(() => {
    const hero = document.querySelector<HTMLElement>('.landing-hero');
    if (!hero || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) hero.removeAttribute('data-offscreen');
      else hero.setAttribute('data-offscreen', '');
    });
    io.observe(hero);
    return () => io.disconnect();
  }, []);
}

// Tiempo en que una transicion de revelado termina (0.8 s + holgura) y escalon maximo por hijo (ver .landing-steps).
const REVEAL_SETTLE_MS = 1700;
const REVEAL_STAGGER_MS = 110;

// Revela con una animacion los bloques marcados con `data-reveal` cuando entran en pantalla. Al terminar se
// les quita la marca para que su hover/transform propio no quede pisado. Sin IntersectionObserver o con
// "reducir movimiento" se muestran de una vez.
function useReveal() {
  useEffect(() => {
    const root = document.querySelector('.landing-content');
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof IntersectionObserver === 'undefined' || reduce) {
      els.forEach((el) => el.removeAttribute('data-reveal'));
      return;
    }
    const timers: number[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          io.unobserve(el);
          el.classList.add('is-in');
          // Base + el retraso del ultimo hijo (el CSS escalona --i * 70..110 ms): con muchas categorias, un tiempo fijo
          // retiraria la marca a mitad de la transicion y los ultimos elementos saltarian.
          const settleMs = REVEAL_SETTLE_MS + Math.max(0, el.children.length - 1) * REVEAL_STAGGER_MS;
          timers.push(
            window.setTimeout(() => {
              el.removeAttribute('data-reveal');
              el.classList.remove('is-in');
            }, settleMs),
          );
        }
      },
      { threshold: 0.15 },
    );
    els.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);
}

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

// Preguntas frecuentes. Cada respuesta describe algo que la app hace hoy (comprobado contra el codigo y el esquema):
// estados de una solicitud (trigger validate_booking_update), botones de cada pantalla, chat por solicitud, sello solo
// por proceso autorizado (protect_is_verified), reseñas 1-5 con comentario (tabla reviews).
//
// OJO - "¿Qué hago si algo sale mal?" describe la reseña del CLIENTE hacia el profesional y su visibilidad en el perfil.
// La base ya lo soporta (tabla reviews, lectura publica, solo sobre trabajos completados, editable), pero el front
// todavia NO tiene el formulario para que el cliente la escriba ni la lista de reseñas en el perfil (solo el promedio de
// estrellas). Hasta que existan, ese texto adelanta una funcion: no publicar sin resolverlo.
interface FaqItem {
  q: string;
  a: string;
  link?: { to: string; label: string };
  /** 'install' agrega un boton que abre la ventana con el paso a paso de instalacion. */
  action?: 'install';
}

const FAQ: FaqItem[] = [
  {
    q: '¿Cómo pido un servicio?',
    a: 'Buscá un profesional por oficio, entrá a su perfil y tocá "Solicitar servicio" en el que necesitás. El profesional acepta o rechaza tu solicitud; si la acepta, coordinan los detalles por el chat, él inicia el trabajo y, cuando termina, lo marca como completado. Seguís cada paso desde "Mis solicitudes".',
  },
  {
    q: '¿Cómo me hago profesional?',
    a: 'Creá tu cuenta eligiendo el rol Profesional, completá tu perfil (descripción, zona de trabajo y radio de servicio) y publicá tus servicios con su precio desde "Mis servicios". Subir tus documentos para obtener el sello "Verificado" es opcional.',
    link: { to: '/login?modo=registro&rol=profesional', label: 'Registrarme como profesional' },
  },
  {
    q: '¿Cómo me comunico con el profesional o con el cliente?',
    a: 'Cada solicitud tiene su propio chat, solo entre el cliente y el profesional: lo abrís con el botón "Chat" de la tarjeta de la solicitud y queda disponible mientras no esté cancelada. Cuando te escriben, te avisamos con una notificación dentro de la app.',
  },
  {
    q: '¿Puedo cancelar una solicitud?',
    a: 'Como cliente podés cancelarla con el botón "Cancelar solicitud" mientras esté solicitada o aceptada. Si el trabajo ya está en curso, coordinalo con el profesional por el chat: es él quien puede cancelarlo o marcarlo como completado.',
  },
  {
    q: '¿Qué significa el sello "Verificado"?',
    a: 'Los profesionales pueden subir su DPI, licencia o certificación desde su perfil. El sello lo otorga únicamente un proceso de verificación autorizado: nadie puede darse el sello a sí mismo ni cambiarlo desde la app.',
  },
  {
    q: '¿Qué hago si algo sale mal?',
    a: 'Ya Quedó no interviene en los acuerdos entre las personas, así que lo primero es aclararlo por el chat de la solicitud. Cuando el trabajo termina, tu calificación de 1 a 5 estrellas y tu reseña son tu voz: sirven para contar tu caso, desahogarte con respeto y avisar a quienes vengan después. El promedio de estrellas de cada profesional se ve en su perfil. Solo se puede reseñar un trabajo completado y podés editar tu reseña después. Los profesionales también califican a sus clientes.',
  },
  {
    q: '¿Cómo instalo la app en mi celular?',
    a: 'Descargás el archivo APK desde esta página, permitís que tu navegador instale apps y confirmás. Como la app no está en Play Store, Android te pide un par de confirmaciones extra: es normal.',
    action: 'install',
  },
  {
    q: '¿Qué pasa con mis datos?',
    a: 'Guardamos solo lo necesario para que la app funcione, sin publicidad ni analítica de terceros, y tu sesión se cierra sola tras 30 minutos sin actividad. El detalle está en el aviso de privacidad.',
    link: { to: '/privacidad', label: 'Leer el aviso de privacidad' },
  },
];

// Paso a paso de la ventana de instalacion. Android cambia los nombres segun marca y version: el texto da la idea
// general y la ventana lo aclara.
const INSTALL_GUIDE = [
  {
    title: 'Descargá el APK',
    text: 'Desde tu celular Android, tocá el botón de descarga. Si el navegador pregunta si querés conservar el archivo, aceptá.',
    short: 'Descargá el archivo .apk desde tu celular Android.',
  },
  {
    title: 'Permití la instalación',
    text: 'Al abrir el archivo, Android avisa que no puede instalar apps desconocidas desde ese origen. Tocá "Configuración", activá "Permitir desde esta fuente" (solo afecta a tu navegador) y volvé atrás.',
    short: 'Al abrirlo, Android pedirá permiso para instalar apps de este origen: aceptalo solo para tu navegador.',
  },
  {
    title: 'Confirmá la instalación',
    text: 'Tocá "Instalar". Si Play Protect avisa que la app no es de Play Store, tocá "Más detalles" y luego "Instalar de todos modos": es esperado, la distribuimos directamente.',
    short: 'Confirmá la instalación. Si Play Protect avisa que la app no es de Play Store, es esperado: la distribuimos directamente.',
  },
  {
    title: 'Abrí Ya Quedó',
    text: 'Tocá "Abrir" e iniciá sesión o creá tu cuenta. Después, si querés, podés volver a desactivar el permiso de instalar apps desconocidas de tu navegador.',
    short: 'Abrí Ya Quedó e iniciá sesión o creá tu cuenta.',
  },
];

// Version corta de la guia, para la lista de la seccion de descarga: una sola fuente, no dos textos que puedan divergir.
const INSTALL_STEPS = INSTALL_GUIDE.map((step) => step.short);

const Landing: React.FC = () => {
  const { session } = useAuth();
  useReveal();
  usePauseHeroOffscreen();
  const [categories, setCategories] = useState<string[]>(FALLBACK_CATEGORIES);
  const [installOpen, setInstallOpen] = useState(false);

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
            <a href="#preguntas">Preguntas</a>
            <a href="#descargar">Android</a>
          </nav>
          <Link className="landing-btn landing-btn--small" to={appPath}>
            {session ? 'Ir a mi cuenta' : 'Ingresar'}
          </Link>
        </header>

        <section className="landing-hero">
          <div className="landing-hero__inner">
            <div className="landing-hero__copy">
              <div className="app-hero-icon landing-hero__icon landing-rise">
                <IonIcon icon={hammerOutline} />
              </div>
              <p className="landing-eyebrow landing-rise" style={{ '--d': 1 } as React.CSSProperties}>Oficios cerca de ti</p>
              <h1>
                {HEADLINE.map(({ text, hl }, i) => (
                  <Fragment key={i}>
                    <span className="landing-word">
                      <span className={hl ? 'landing-word__hl' : undefined} style={{ '--i': i } as React.CSSProperties}>
                        {text}
                      </span>
                    </span>{' '}
                  </Fragment>
                ))}
              </h1>
              <p className="landing-hero__lead landing-rise" style={{ '--d': 4 } as React.CSSProperties}>
                {APP_NAME} conecta a clientes con electricistas, plomeros, albañiles y más.
                Compará perfiles, solicitá el servicio y calificá el trabajo, todo en un solo lugar.
              </p>
              <div className="landing-hero__cta landing-rise" style={{ '--d': 5 } as React.CSSProperties}>
                <Link className="landing-btn" to={appPath}>
                  {session ? 'Ir a mi cuenta' : 'Usar en la web'}
                </Link>
                <a className="landing-btn landing-btn--ghost" href="#descargar">
                  Descargar para Android
                </a>
              </div>
            </div>

            {/* Maqueta decorativa de la app: no es interactiva ni accesible. */}
            <div className="landing-phone" style={{ '--d': 3 } as React.CSSProperties} aria-hidden="true">
              <div className="landing-phone__screen">
                <span className="landing-phone__notch" />
                <div className="landing-phone__top">
                  <div className="landing-phone__logo"><IonIcon icon={hammerOutline} /></div>
                  <strong>Oficios cerca de ti</strong>
                  <div className="landing-phone__chips">
                    {PHONE_CHIPS.map((name, i) => (
                      <span key={name} className={i === 0 ? 'is-on' : undefined}>{name}</span>
                    ))}
                  </div>
                </div>
                <div className="landing-phone__list">
                  {PHONE_ROWS.map((row, i) => (
                    <div key={row.name} className="landing-phone__row" style={{ '--i': i } as React.CSSProperties}>
                      <span className="landing-phone__avatar">{row.initials}</span>
                      <div>
                        <b>{row.name}</b>
                        <small>{row.trade} · <i>★</i> {row.rating}</small>
                      </div>
                      <span className="landing-phone__go">Solicitar</span>
                    </div>
                  ))}
                </div>
                <div className="landing-phone__tabs">
                  <IonIcon icon={homeOutline} className="is-on" />
                  <IonIcon icon={calendarOutline} />
                  <IonIcon icon={personOutline} />
                </div>
              </div>
              <div className="landing-phone__toast">
                <span>Nueva solicitud<small>Plomería · hace un momento</small></span>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section" id="categorias" aria-labelledby="t-categorias">
          <h2 id="t-categorias" data-reveal>Oficios disponibles</h2>
          <ul className="landing-chips" data-reveal>
            {categories.map((name, i) => (
              <li key={name} className="landing-chip" style={{ '--i': i } as React.CSSProperties}>{name}</li>
            ))}
            {/* Fijo y siempre al final: los oficios de arriba son solo los que ya estan cargados, hay mas. */}
            <li className="landing-chip landing-chip--more" style={{ '--i': categories.length } as React.CSSProperties}>Otros</li>
          </ul>
        </section>

        <section className="landing-section" id="como-funciona" aria-labelledby="t-como">
          <h2 id="t-como" data-reveal>Cómo funciona</h2>
          <ol className="landing-steps" data-reveal>
            {STEPS.map((step, i) => (
              <li key={step.title} className="landing-step" style={{ '--i': i } as React.CSSProperties}>
                <span className="landing-step__num" aria-hidden="true">{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section" id="preguntas" aria-labelledby="t-preguntas">
          <h2 id="t-preguntas" data-reveal>Preguntas frecuentes</h2>
          <div className="landing-faq" data-reveal>
            {FAQ.map((item, i) => (
              <details key={item.q} className="landing-faq__item" style={{ '--i': i } as React.CSSProperties}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
                {(item.link || item.action) && (
                  <div className="landing-faq__extra">
                    {item.link && <Link to={item.link.to}>{item.link.label}</Link>}
                    {item.action === 'install' && (
                      <button type="button" className="landing-btn landing-btn--small" onClick={() => setInstallOpen(true)}>
                        Ver paso a paso
                      </button>
                    )}
                  </div>
                )}
              </details>
            ))}
          </div>
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
          <h2 id="t-descargar" data-reveal>Descargá la app para Android</h2>
          <div className="landing-download">
            <div className="landing-download__main" data-reveal>
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
          <nav className="landing-footer__links" aria-label="Información legal">
            <Link to="/privacidad">Privacidad</Link>
            <Link to="/terminos">Términos</Link>
            <Link to={appPath}>{session ? 'Ir a mi cuenta' : 'Ingresar'}</Link>
          </nav>
        </footer>
      </IonContent>

      <IonModal isOpen={installOpen} onDidDismiss={() => setInstallOpen(false)} className="landing-install-modal">
        <IonHeader>
          <IonToolbar>
            <IonTitle>Instalar la app</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setInstallOpen(false)}>Cerrar</IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="ion-padding">
          <ol className="landing-install-guide">
            {INSTALL_GUIDE.map((step, i) => (
              <li key={step.title}>
                <span className="landing-install-guide__num" aria-hidden="true">{i + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                  {i === 0 && (apkAvailable ? (
                    <a className="landing-btn landing-btn--small" href={APK_RELEASE.url} rel="noopener">
                      Descargar APK{sizeMb ? ` (${sizeMb} MB)` : ''}
                    </a>
                  ) : (
                    <p className="landing-install-guide__soon">La descarga estará disponible pronto. Mientras tanto, podés usar la versión web.</p>
                  ))}
                </div>
              </li>
            ))}
          </ol>
          <p className="landing-install-guide__note">
            Los nombres exactos de los botones cambian un poco según la marca y la versión de Android.
          </p>
          {apkAvailable && (
            <p className="landing-install-guide__note">
              ¿Querés comprobar que el archivo es el original? Compará su huella SHA-256 con esta: <code>{sha256}</code>
            </p>
          )}
        </IonContent>
      </IonModal>
    </IonPage>
  );
};

export default Landing;
