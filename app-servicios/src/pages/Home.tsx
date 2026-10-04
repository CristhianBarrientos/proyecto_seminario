import { useEffect, useMemo, useState } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonIcon,
  IonSearchbar, IonSpinner, IonText, IonSelect, IonSelectOption,
} from '@ionic/react';
import { shieldCheckmarkOutline, hammerOutline, funnelOutline, cashOutline, searchOutline } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { getFriendlyErrorMessage } from '../lib/errorMessages';
import { feedServiceRowSchema, parseRowsOrDrop } from '../lib/supabaseSchemas';
import { useAuth } from '../contexts/AuthContext';
import ProfessionalDashboard from '../components/ProfessionalDashboard';
import ProfessionalAvatar from '../components/ProfessionalAvatar';
import './Home.css';

interface ServiceFeedItem {
  id: string;
  title: string;
  price: number;
  price_unit: string;
  category_id: number;
  professional_id: string;
  professional_profiles: {
    profile_id: string;
    is_verified: boolean;
    profiles: { full_name: string } | null;
  } | null;
  categories: { name: string } | null;
}

interface Category {
  id: number;
  name: string;
}

const Home: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [services, setServices] = useState<ServiceFeedItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [role, setRole] = useState<'cliente' | 'profesional' | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (!cancelled) setRole(data?.role ?? null);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      // Un solo round-trip para el feed (RPC feed_services: services + categoría + nombre +
      // verificación ya unidos) en paralelo con la lista de categorías del filtro. Antes eran
      // 2 oleadas secuenciales y los ids de profesionales viajaban en la URL con .in().
      const [servicesResult, categoriesResult] = await Promise.all([
        supabase.rpc('feed_services'),
        supabase.from('categories').select('id, name'),
      ]);

      if (servicesResult.error) {
        if (!cancelled) {
          setError(getFriendlyErrorMessage(servicesResult.error));
          setLoading(false);
        }
        return;
      }

      const rows = parseRowsOrDrop(feedServiceRowSchema, servicesResult.data ?? [], 'Home.feed_services');

      const merged: ServiceFeedItem[] = rows.map((r) => ({
        id: r.id,
        title: r.title,
        price: r.price,
        price_unit: r.price_unit,
        category_id: r.category_id,
        professional_id: r.professional_id,
        categories: r.category_name ? { name: r.category_name } : null,
        professional_profiles: {
          profile_id: r.professional_id,
          is_verified: r.is_verified,
          profiles: r.professional_name ? { full_name: r.professional_name } : null,
        },
      }));

      if (!cancelled) {
        setServices(merged);
        setCategories(categoriesResult.data ?? []);
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredServices = useMemo(() => {
    const text = searchText.trim().toLowerCase();

    return services.filter((s) => {
      const matchesCategory = categoryFilter === 'all' || s.category_id === Number(categoryFilter);
      const matchesText = text
        ? s.title.toLowerCase().includes(text) ||
          (s.professional_profiles?.profiles?.full_name?.toLowerCase().includes(text) ?? false) ||
          (s.categories?.name?.toLowerCase().includes(text) ?? false)
        : true;
      return matchesCategory && matchesText;
    });
  }, [services, searchText, categoryFilter]);

  if (role === 'profesional' && user) {
    return (
      <IonPage>
        <IonHeader>
          <IonToolbar>
            <IonTitle className="app-title">
              Así va tu <span className="app-title--accent">negocio</span>
            </IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent fullscreen>
          <ProfessionalDashboard userId={user.id} />
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle className="app-title">
            Servicios <span className="app-title--accent">cerca de ti</span>
          </IonTitle>
        </IonToolbar>
        <IonToolbar>
          <IonSearchbar
            placeholder="Buscar plomero, electricista..."
            value={searchText}
            onIonInput={(e) => setSearchText(e.detail.value ?? '')}
          />
        </IonToolbar>
        <IonToolbar className="home-filter-bar">
          <IonIcon icon={funnelOutline} slot="start" color="medium" className="home-filter-bar__icon" />
          <IonSelect
            interface="popover"
            value={categoryFilter}
            onIonChange={(e) => setCategoryFilter(e.detail.value)}
          >
            <IonSelectOption value="all">Todas las categorías</IonSelectOption>
            {categories.map((c) => (
              <IonSelectOption key={c.id} value={String(c.id)}>{c.name}</IonSelectOption>
            ))}
          </IonSelect>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        {loading && (
          <div className="ion-text-center ion-padding">
            <IonSpinner />
          </div>
        )}

        {error && (
          <IonText color="danger">
            <p className="ion-padding">{error}</p>
          </IonText>
        )}

        {!loading && !error && filteredServices.length === 0 && (
          <div className="app-empty">
            <IonIcon icon={searchOutline} />
            <h3>No encontramos servicios</h3>
            <p>Probá con otra búsqueda o cambiá la categoría del filtro.</p>
          </div>
        )}

        <div className="home-feed">
          {filteredServices.map((s) => (
            <button
              type="button"
              key={s.id}
              className="service-card app-card"
              onClick={() => {
                if (s.professional_profiles?.profile_id) {
                  navigate(`/tabs/home/${s.professional_profiles.profile_id}`);
                }
              }}
            >
              <ProfessionalAvatar
                fullName={s.professional_profiles?.profiles?.full_name}
                isVerified={s.professional_profiles?.is_verified ?? false}
              />

              <div className="service-card__body">
                <p className="service-card__name">{s.professional_profiles?.profiles?.full_name ?? 'Profesional'}</p>
                <p className="service-card__title">
                  <IonIcon icon={hammerOutline} />
                  {s.title}{s.categories?.name ? ` · ${s.categories.name}` : ''}
                </p>
                {s.professional_profiles?.is_verified && (
                  <span className="app-chip app-chip--verified">
                    <IonIcon icon={shieldCheckmarkOutline} />
                    Verificado
                  </span>
                )}
              </div>

              <div className="service-card__price">
                <span className="app-price">
                  <IonIcon icon={cashOutline} />
                  Q{s.price}
                </span>
                <span className="service-card__unit">{s.price_unit}</span>
              </div>
            </button>
          ))}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Home;
