import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonButton, IonIcon, IonToggle, IonText, IonAvatar,
} from '@ionic/react';
import {
  logOutOutline, moonOutline, sunnyOutline, briefcaseOutline,
  personOutline, createOutline, constructOutline, chevronForwardOutline,
} from 'ionicons/icons';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabaseClient';
import { getFriendlyErrorMessage } from '../lib/errorMessages';
import ReputationCard from '../components/ReputationCard';
import './Profile.css';

interface ProfileData {
  full_name: string;
  role: 'cliente' | 'profesional';
}

const Profile: React.FC = () => {
  const { user, signOut } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;

    supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (error) {
          setError(getFriendlyErrorMessage(error));
          return;
        }
        setProfile(data);
      });
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle className="app-title">Mi perfil</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {error && (
          <IonText color="danger">
            <p className="ion-padding">{error}</p>
          </IonText>
        )}

        <div className="profile-hero app-hero">
          <IonAvatar className="app-avatar profile-hero__avatar">
            <img
              src={`https://api.dicebear.com/7.x/initials/svg?seed=${profile?.full_name ?? '?'}`}
              alt={profile?.full_name ?? 'Usuario'}
            />
          </IonAvatar>
          <div>
            <p className="profile-hero__name">{profile?.full_name ?? 'Cargando...'}</p>
            <p className="profile-hero__email">{user?.email}</p>
            {profile?.role && (
              <span className="app-chip profile-hero__role">
                <IonIcon icon={profile.role === 'profesional' ? briefcaseOutline : personOutline} />
                {profile.role === 'profesional' ? 'Profesional' : 'Cliente'}
              </span>
            )}
          </div>
        </div>

        {user && profile?.role && (
          <>
            <p className="app-section-label">Mi reputación</p>
            <ReputationCard userId={user.id} role={profile.role} />
          </>
        )}

        <p className="app-section-label">Preferencias</p>
        <div className="app-card profile-row">
          <IonIcon icon={isDark ? moonOutline : sunnyOutline} color="secondary" />
          <span className="profile-row__label">Modo noche</span>
          <IonToggle checked={isDark} onIonChange={toggleTheme} />
        </div>

        {profile?.role === 'profesional' && (
          <>
            <p className="app-section-label">Panel profesional</p>
            <div className="profile-links">
              <button type="button" className="app-card profile-row profile-row--link" onClick={() => navigate('/tabs/profile/edit')}>
                <IonIcon icon={createOutline} color="secondary" />
                <span className="profile-row__label">Editar perfil profesional</span>
                <IonIcon icon={chevronForwardOutline} color="medium" />
              </button>
              <button type="button" className="app-card profile-row profile-row--link" onClick={() => navigate('/tabs/profile/services')}>
                <IonIcon icon={constructOutline} color="secondary" />
                <span className="profile-row__label">Mis servicios</span>
                <IonIcon icon={chevronForwardOutline} color="medium" />
              </button>
            </div>
          </>
        )}

        <IonButton expand="block" color="danger" fill="outline" className="ion-margin-top ion-padding-horizontal" onClick={handleSignOut}>
          <IonIcon icon={logOutOutline} slot="start" />
          Cerrar sesión
        </IonButton>
      </IonContent>
    </IonPage>
  );
};

export default Profile;
