import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonBackButton, IonButtons,
  IonItem, IonLabel, IonTextarea, IonInput, IonButton, IonLoading, IonText, IonNote,
  IonIcon,
} from '@ionic/react';
import {
  documentAttachOutline, trashOutline, cloudUploadOutline, personOutline,
  locationOutline, navigateCircleOutline, checkmarkCircleOutline, shieldCheckmarkOutline,
} from 'ionicons/icons';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { getFriendlyErrorMessage } from '../lib/errorMessages';
import { isPositiveNumber } from '../lib/validation';
import { MAX_PROFESSIONAL_BIO } from '../lib/limits';
import './EditProfessionalProfile.css';

interface VerificationDoc {
  path: string;
  name: string;
}

const MAX_DOC_SIZE_MB = 10;
const ALLOWED_DOC_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

const EditProfessionalProfile: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const cameFromIncompleteProfile = (location.state as { reason?: string } | null)?.reason === 'complete-profile-first';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bio, setBio] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [radius, setRadius] = useState('10');
  const [docs, setDocs] = useState<VerificationDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [touched, setTouched] = useState(false);

  const radiusInvalid = touched && !isPositiveNumber(radius);
  const coordsMismatch = touched && (lat.trim() === '') !== (lng.trim() === '');
  const latOutOfRange = touched && lat.trim() !== '' && (Number(lat) < -90 || Number(lat) > 90);
  const lngOutOfRange = touched && lng.trim() !== '' && (Number(lng) < -180 || Number(lng) > 180);
  const fieldClass = (invalid: boolean) => `app-field${invalid ? ' app-field--invalid' : ''}`;

  const loadProfile = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('professional_profiles')
      .select('bio, service_radius_km, verification_docs')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (error) {
      setError(getFriendlyErrorMessage(error));
      return;
    }
    if (data) {
      setBio(data.bio ?? '');
      setRadius(String(data.service_radius_km ?? 10));
      setDocs((data.verification_docs as VerificationDoc[]) ?? []);
    }
  };

  useEffect(() => {
    loadProfile();
  }, [user]);

  const handleSave = async () => {
    setTouched(true);
    if (!user) return;

    if (!isPositiveNumber(radius)) {
      setError('El radio de servicio debe ser un número mayor a cero.');
      return;
    }
    if ((lat.trim() === '') !== (lng.trim() === '')) {
      setError('Completá tanto latitud como longitud, o dejá ambas vacías.');
      return;
    }
    if (lat.trim() !== '' && (Number(lat) < -90 || Number(lat) > 90)) {
      setError('La latitud debe estar entre -90 y 90.');
      return;
    }
    if (lng.trim() !== '' && (Number(lng) < -180 || Number(lng) > 180)) {
      setError('La longitud debe estar entre -180 y 180.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess(false);

    const payload: Record<string, unknown> = {
      profile_id: user.id,
      bio: bio.trim(),
      service_radius_km: Number(radius),
    };

    // Formato EWKT: "SRID=4326;POINT(longitud latitud)" - longitud primero
    if (lat && lng) {
      payload.location = `SRID=4326;POINT(${lng} ${lat})`;
    }

    const { error } = await supabase
      .from('professional_profiles')
      .upsert(payload, { onConflict: 'profile_id' });

    setLoading(false);

    if (error) {
      setError(getFriendlyErrorMessage(error));
      return;
    }

    setSuccess(true);
  };

  const handleFileUpload = async (file: File) => {
    if (!user) return;

    if (!ALLOWED_DOC_TYPES.includes(file.type)) {
      setError('Formato no permitido. Subí un PDF, PNG, JPG o WEBP.');
      return;
    }
    if (file.size > MAX_DOC_SIZE_MB * 1024 * 1024) {
      setError(`El archivo pesa demasiado. El máximo permitido es ${MAX_DOC_SIZE_MB}MB.`);
      return;
    }

    setUploading(true);
    setError('');

    const path = `${user.id}/${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('verification-docs')
      .upload(path, file);

    if (uploadError) {
      setUploading(false);
      setError(getFriendlyErrorMessage(uploadError));
      return;
    }

    const newDocs = [...docs, { path, name: file.name }];

    const { error: updateError } = await supabase
      .from('professional_profiles')
      .upsert({ profile_id: user.id, verification_docs: newDocs }, { onConflict: 'profile_id' });

    setUploading(false);

    if (updateError) {
      setError(getFriendlyErrorMessage(updateError));
      return;
    }

    setDocs(newDocs);
  };

  const handleDeleteDoc = async (doc: VerificationDoc) => {
    if (!user) return;

    const { error: removeError } = await supabase.storage.from('verification-docs').remove([doc.path]);

    if (removeError) {
      setError(getFriendlyErrorMessage(removeError));
      return;
    }

    const newDocs = docs.filter((d) => d.path !== doc.path);

    const { error } = await supabase
      .from('professional_profiles')
      .upsert({ profile_id: user.id, verification_docs: newDocs }, { onConflict: 'profile_id' });

    if (error) {
      setError(getFriendlyErrorMessage(error));
      return;
    }

    setDocs(newDocs);
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/tabs/profile" />
          </IonButtons>
          <IonTitle>Perfil profesional</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {cameFromIncompleteProfile && (
          <IonText color="warning">
            <p className="ion-padding-horizontal">
              Completá y guardá tu perfil profesional antes de publicar servicios.
            </p>
          </IonText>
        )}
        <p className="app-section-label">Sobre ti</p>
        <div className="app-card edit-pro-block">
          <IonItem className="app-field" lines="none">
            <IonIcon icon={personOutline} slot="start" color="medium" />
            <IonLabel position="stacked">Sobre ti / tu experiencia</IonLabel>
            <IonTextarea value={bio} onIonInput={(e) => setBio(e.detail.value!)} maxlength={MAX_PROFESSIONAL_BIO} autoGrow />
          </IonItem>
        </div>

        <p className="app-section-label">Ubicación y cobertura</p>
        <div className="app-card edit-pro-block">
          <IonItem className={fieldClass(coordsMismatch || latOutOfRange)} lines="none">
            <IonIcon icon={locationOutline} slot="start" color="medium" />
            <IonLabel position="stacked">Latitud</IonLabel>
            <IonInput type="number" value={lat} onIonInput={(e) => setLat(e.detail.value!)} placeholder="ej. 14.6349" />
          </IonItem>
          <IonItem className={fieldClass(coordsMismatch || lngOutOfRange)} lines="none">
            <IonIcon icon={locationOutline} slot="start" color="medium" />
            <IonLabel position="stacked">Longitud</IonLabel>
            <IonInput type="number" value={lng} onIonInput={(e) => setLng(e.detail.value!)} placeholder="ej. -90.5231" />
          </IonItem>
          <IonNote className="edit-pro-note">
            Tip: en Google Maps, clic derecho sobre tu ubicación → copia las coordenadas.
          </IonNote>

          <IonItem className={fieldClass(radiusInvalid)} lines="none">
            <IonIcon icon={navigateCircleOutline} slot="start" color="medium" />
            <IonLabel position="stacked">Radio de servicio (km) *</IonLabel>
            <IonInput type="number" min="0.1" step="0.1" value={radius} onIonInput={(e) => setRadius(e.detail.value!)} />
          </IonItem>
        </div>

        {error && <IonText color="danger"><p className="ion-padding-horizontal">{error}</p></IonText>}
        {success && (
          <IonText color="success">
            <p className="ion-padding-horizontal">
              <IonIcon icon={checkmarkCircleOutline} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Perfil guardado correctamente.
            </p>
          </IonText>
        )}

        <IonButton expand="block" color="secondary" className="ion-margin-horizontal" onClick={handleSave}>
          Guardar
        </IonButton>

        <p className="app-section-label">
          <IonIcon icon={shieldCheckmarkOutline} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Documentos de verificación
        </p>
        <p className="edit-pro-hint">Sube tu DPI, licencia o certificación para obtener el sello "Verificado".</p>

        <div className="edit-pro-docs">
          {docs.map((doc) => (
            <div key={doc.path} className="app-card edit-pro-doc">
              <IonIcon icon={documentAttachOutline} color="secondary" />
              <span className="edit-pro-doc__name">{doc.name}</span>
              <IonButton fill="clear" color="danger" onClick={() => handleDeleteDoc(doc)}>
                <IonIcon icon={trashOutline} slot="icon-only" />
              </IonButton>
            </div>
          ))}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
          }}
        />
        <IonButton
          expand="block"
          fill="outline"
          className="ion-margin-horizontal ion-margin-top"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <IonIcon icon={cloudUploadOutline} slot="start" />
          {uploading ? 'Subiendo...' : 'Subir documento'}
        </IonButton>

        <IonLoading isOpen={loading} message="Guardando..." />
      </IonContent>
    </IonPage>
  );
};

export default EditProfessionalProfile;
