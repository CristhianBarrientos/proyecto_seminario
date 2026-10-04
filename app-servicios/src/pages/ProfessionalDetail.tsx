import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonBackButton, IonButtons,
  IonIcon, IonText, IonSpinner, IonButton, IonTextarea,
} from '@ionic/react';
import {
  shieldCheckmarkOutline, star, hammerOutline, constructOutline, informationCircleOutline,
  paperPlaneOutline, closeOutline, checkmarkCircleOutline,
} from 'ionicons/icons';
import { supabase } from '../lib/supabaseClient';
import { getFriendlyErrorMessage } from '../lib/errorMessages';
import { serviceItemSchema, parseRowsOrDrop, type ServiceItem } from '../lib/supabaseSchemas';
import { useAuth } from '../contexts/AuthContext';
import ProfessionalAvatar from '../components/ProfessionalAvatar';
import './ProfessionalDetail.css';

interface ProfessionalData {
  profile_id: string;
  bio: string | null;
  is_verified: boolean;
  profiles: { full_name: string } | null;
}

interface RatingData {
  rating_avg: number;
  rating_count: number;
}

const ProfessionalDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [professional, setProfessional] = useState<ProfessionalData | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [rating, setRating] = useState<RatingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [sentServiceIds, setSentServiceIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const load = async () => {
      // professional_profiles/profiles ya no son legibles para terceros (RLS: solo el
      // dueño ve su propia fila) - el perfil público se arma desde las vistas *_public.
      const [profProfileResult, profileResult, servicesResult, ratingResult] = await Promise.all([
        supabase
          .from('professional_profiles_public')
          .select('profile_id, bio, is_verified')
          .eq('profile_id', id)
          .maybeSingle(),
        supabase
          .from('profiles_public')
          .select('full_name')
          .eq('id', id)
          .maybeSingle(),
        supabase
          .from('services')
          .select('id, title, price, price_unit, categories ( name )')
          .eq('professional_id', id)
          .eq('is_active', true),
        supabase
          .from('professional_ratings')
          .select('rating_avg, rating_count')
          .eq('professional_id', id)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (profProfileResult.error) {
        setError(getFriendlyErrorMessage(profProfileResult.error));
        setLoading(false);
        return;
      }

      setProfessional(
        profProfileResult.data
          ? {
              ...profProfileResult.data,
              profiles: profileResult.data ? { full_name: profileResult.data.full_name } : null,
            }
          : null,
      );
      setServices(parseRowsOrDrop(serviceItemSchema, servicesResult.data ?? [], 'ProfessionalDetail.services'));
      setRating(ratingResult.data as RatingData | null);
      setLoading(false);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const openRequestForm = (serviceId: string) => {
    setRequestingId(serviceId);
    setNotes('');
    setRequestError('');
  };

  const closeRequestForm = () => {
    setRequestingId(null);
    setNotes('');
    setRequestError('');
  };

  const handleSendRequest = async (serviceId: string) => {
    if (submitting || !user || !id) return;
    setSubmitting(true);
    setRequestError('');

    const { error } = await supabase.from('bookings').insert({
      client_id: user.id,
      professional_id: id,
      service_id: serviceId,
      notes: notes.trim() || null,
    });

    setSubmitting(false);

    if (error) {
      // Índice único parcial (sql_docker/fix-solicitud-unica-por-servicio.sql): ya hay una solicitud activa.
      if (error.code === '23505' && error.message.includes('bookings_one_active_per_service_idx')) {
        console.error('[Error real]', error);
        setRequestError('Ya tenés una solicitud activa para este servicio. Podés verla en Solicitudes.');
        return;
      }
      setRequestError(getFriendlyErrorMessage(error));
      return;
    }

    setRequestingId(null);
    setNotes('');
    setSentServiceIds((prev) => new Set(prev).add(serviceId));
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/tabs/home" />
          </IonButtons>
          <IonTitle>Perfil del profesional</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {loading && (
          <div className="ion-text-center ion-padding">
            <IonSpinner />
          </div>
        )}

        {error && <IonText color="danger"><p className="ion-padding">{error}</p></IonText>}

        {!loading && professional && (
          <>
            <div className="pro-detail-hero app-hero">
              <div className="pro-detail-hero__row">
                <ProfessionalAvatar
                  fullName={professional.profiles?.full_name}
                  isVerified={professional.is_verified}
                  className="pro-detail-hero__avatar"
                />
                <div>
                  <h1 className="pro-detail-hero__name">{professional.profiles?.full_name ?? 'Profesional'}</h1>
                  <div className="pro-detail-hero__badges">
                    {professional.is_verified && (
                      <span className="app-chip app-chip--verified">
                        <IonIcon icon={shieldCheckmarkOutline} />
                        Verificado
                      </span>
                    )}
                    {rating && rating.rating_count > 0 && (
                      <span className="app-chip app-chip--rating">
                        <IonIcon icon={star} />
                        {rating.rating_avg} ({rating.rating_count})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {professional.bio && (
              <div className="pro-detail-bio">
                <IonIcon icon={informationCircleOutline} color="medium" />
                <p>{professional.bio}</p>
              </div>
            )}

            <p className="app-section-label">
              <IonIcon icon={constructOutline} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Servicios
            </p>

            <div className="pro-detail-services">
              {services.map((s) => (
                <div key={s.id} className="app-card pro-detail-service">
                  <div className="pro-detail-service__row">
                    <div className="pro-detail-service__body">
                      <p className="pro-detail-service__title">
                        <IonIcon icon={hammerOutline} />
                        {s.title}
                      </p>
                      <p className="pro-detail-service__category">{s.categories?.name}</p>
                    </div>
                    <span className="app-price">Q{s.price} / {s.price_unit}</span>
                  </div>

                  {role === 'cliente' && (
                    sentServiceIds.has(s.id) ? (
                      <div className="pro-detail-service__sent">
                        <p>
                          <IonIcon icon={checkmarkCircleOutline} color="success" />
                          Solicitud enviada.
                        </p>
                        <IonButton fill="clear" size="small" onClick={() => navigate('/tabs/bookings')}>
                          Ver mis solicitudes
                        </IonButton>
                      </div>
                    ) : requestingId === s.id ? (
                      <div className="pro-detail-service__form">
                        <IonTextarea
                          placeholder="Contale al profesional qué necesitás (opcional)"
                          value={notes}
                          onIonInput={(e) => setNotes(e.detail.value ?? '')}
                          autoGrow
                        />
                        {requestError && (
                          <IonText color="danger"><p className="pro-detail-service__error">{requestError}</p></IonText>
                        )}
                        <div className="pro-detail-service__form-actions">
                          <IonButton fill="clear" color="medium" disabled={submitting} onClick={closeRequestForm}>
                            <IonIcon icon={closeOutline} slot="start" />
                            Cancelar
                          </IonButton>
                          <IonButton color="secondary" disabled={submitting} onClick={() => handleSendRequest(s.id)}>
                            <IonIcon icon={paperPlaneOutline} slot="start" />
                            Enviar solicitud
                          </IonButton>
                        </div>
                      </div>
                    ) : (
                      <IonButton
                        expand="block"
                        fill="outline"
                        color="secondary"
                        className="pro-detail-service__request-btn"
                        onClick={() => openRequestForm(s.id)}
                      >
                        <IonIcon icon={paperPlaneOutline} slot="start" />
                        Solicitar servicio
                      </IonButton>
                    )
                  )}
                </div>
              ))}
              {services.length === 0 && (
                <div className="app-empty">
                  <IonIcon icon={constructOutline} />
                  <h3>Sin servicios activos</h3>
                  <p>Este profesional todavía no publicó servicios.</p>
                </div>
              )}
            </div>
          </>
        )}
      </IonContent>
    </IonPage>
  );
};

export default ProfessionalDetail;
