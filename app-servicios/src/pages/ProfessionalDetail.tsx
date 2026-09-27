import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonBackButton, IonButtons,
  IonIcon, IonText, IonSpinner,
} from '@ionic/react';
import { shieldCheckmarkOutline, star, hammerOutline, constructOutline, informationCircleOutline, timeOutline } from 'ionicons/icons';
import { supabase } from '../lib/supabaseClient';
import { getFriendlyErrorMessage } from '../lib/errorMessages';
import { serviceItemSchema, parseRowsOrDrop, type ServiceItem } from '../lib/supabaseSchemas';
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
  const [professional, setProfessional] = useState<ProfessionalData | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [rating, setRating] = useState<RatingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
                  <div className="pro-detail-service__body">
                    <p className="pro-detail-service__title">
                      <IonIcon icon={hammerOutline} />
                      {s.title}
                    </p>
                    <p className="pro-detail-service__category">{s.categories?.name}</p>
                  </div>
                  <span className="app-price">Q{s.price} / {s.price_unit}</span>
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

            <div className="pro-detail-notice">
              <IonIcon icon={timeOutline} color="medium" />
              <p>El botón "Solicitar servicio" llega en la Fase 5 (bookings).</p>
            </div>
          </>
        )}
      </IonContent>
    </IonPage>
  );
};

export default ProfessionalDetail;
