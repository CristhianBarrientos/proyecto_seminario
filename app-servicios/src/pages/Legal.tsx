import { IonPage, IonContent } from '@ionic/react';
import { Link } from 'react-router-dom';
import { APP_NAME } from '../lib/appRelease';
import { LEGAL_DOCS, LEGAL_UPDATED, SUPPORT_EMAIL, type LegalKind } from '../lib/legalContent';
import './Legal.css';

interface Props {
  kind: LegalKind;
}

const OTHER: Record<LegalKind, { path: string; label: string }> = {
  privacidad: { path: '/terminos', label: 'Términos de uso' },
  terminos: { path: '/privacidad', label: 'Aviso de privacidad' },
};

/** Línea del canal de contacto: el correo si existe; si no, se dice con honestidad que todavía no hay uno. */
const ContactLine: React.FC = () =>
  SUPPORT_EMAIL ? (
    <p>
      Escribinos a <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
    </p>
  ) : (
    <p>
      Todavía no hay un correo de soporte. Mientras tanto, pedilo a quien administra el proyecto Ya Quedó; cuando exista
      un correo, lo publicaremos en esta página.
    </p>
  );

/**
 * Páginas públicas de texto legal (/privacidad y /terminos). El contenido sale de lib/legalContent.ts.
 * Son accesibles sin sesión (se enlazan desde el pie de la landing).
 */
const Legal: React.FC<Props> = ({ kind }) => {
  const doc = LEGAL_DOCS[kind];
  const other = OTHER[kind];

  return (
    <IonPage>
      <IonContent fullscreen className="legal-content">
        <header className="legal-nav">
          <Link className="legal-brand" to="/">{APP_NAME}</Link>
          <Link className="legal-back" to="/">Volver al inicio</Link>
        </header>

        <article className="legal-doc">
          <h1>{doc.title}</h1>
          <p className="legal-doc__summary">{doc.summary}</p>
          <p className="legal-doc__updated">Última actualización: {LEGAL_UPDATED}</p>

          {doc.sections.map((section) => (
            <section key={section.heading} className="legal-section">
              <h2>{section.heading}</h2>
              {section.paragraphs?.map((text) => <p key={text}>{text}</p>)}
              {section.items && (
                <ul>
                  {section.items.map((text) => <li key={text}>{text}</li>)}
                </ul>
              )}
              {section.contact && <ContactLine />}
            </section>
          ))}
        </article>

        <footer className="legal-footer">
          <span>© {new Date().getFullYear()} {APP_NAME}</span>
          <Link to={other.path}>{other.label}</Link>
        </footer>
      </IonContent>
    </IonPage>
  );
};

export default Legal;
