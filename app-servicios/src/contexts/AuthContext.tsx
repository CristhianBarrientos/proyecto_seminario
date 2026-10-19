import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { resumePush, unregisterPush } from '../lib/pushNotifications';

type Role = 'cliente' | 'profesional';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: Role | null;
  // true = no se pudo leer el rol de profiles tras los reintentos automáticos (red, RLS, sin fila).
  // Las pantallas que gatean su render en `role` deben mostrar un error con reintento, no un spinner.
  roleError: boolean;
  retryRole: () => void;
  // null = todavía no se sabe (cargando o no aplica); false = es profesional
  // pero nunca completó "Editar perfil profesional" (sin fila en professional_profiles).
  hasProfessionalProfile: boolean | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  roleError: false,
  retryRole: () => {},
  hasProfessionalProfile: null,
  loading: true,
  signOut: async () => {},
});

const ROLE_FETCH_ATTEMPTS = 3;

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [roleError, setRoleError] = useState(false);
  // Se incrementa para volver a correr el fetch del rol (botón "Reintentar").
  const [roleAttempt, setRoleAttempt] = useState(0);
  const [hasProfessionalProfile, setHasProfessionalProfile] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Sesión actual al cargar la app (por si ya había un login guardado)
    supabase.auth.getSession()
      .then(({ data }) => {
        setSession(data.session);
      })
      .catch((err) => {
        console.error('[Auth] Error obteniendo sesión:', err);
        setSession(null);
      })
      .finally(() => {
        setLoading(false);
      });

    // Se actualiza automáticamente cuando el usuario inicia o cierra sesión
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    // Bfcache: al volver con el botón atrás/adelante del navegador, Chrome puede
    // restaurar la página desde caché sin re-ejecutar el JS de carga inicial,
    // mostrando la última pantalla protegida renderizada aunque ya no haya sesión.
    // Se revalida la sesión real cada vez que la página se restaura así.
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        supabase.auth.getSession().then(({ data }) => {
          setSession(data.session);
        });
      }
    };
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      listener.subscription.unsubscribe();
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setRole(null);
      setRoleError(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Al cambiar de usuario (A -> B sin pasar por null) no se debe seguir exponiendo el rol de A.
    setRole(null);
    setRoleError(false);

    // Reintenta con backoff (0 s, 1 s, 2 s) SOLO errores transitorios (red, 5xx): un hiccup no
    // debería dejar las pantallas gateadas por rol sin salida hasta recargar. Si el perfil no
    // existe (PGRST116) o no tiene rol, reintentar no arregla nada: falla de inmediato.
    const fetchRole = async () => {
      for (let attempt = 0; attempt < ROLE_FETCH_ATTEMPTS; attempt++) {
        if (attempt > 0) {
          await new Promise<void>((resolve) => { timer = setTimeout(resolve, attempt * 1000); });
        }
        if (cancelled) return;
        let retryable = true;
        try {
          const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).single();
          if (cancelled) return;
          if (!error && data?.role) {
            setRole(data.role);
            return;
          }
          retryable = !!error && error.code !== 'PGRST116';
          console.error(`[Auth] No se pudo leer el rol (intento ${attempt + 1}/${ROLE_FETCH_ATTEMPTS}):`, error ?? 'sin rol');
        } catch (err) {
          if (cancelled) return;
          console.error(`[Auth] Error leyendo el rol (intento ${attempt + 1}/${ROLE_FETCH_ATTEMPTS}):`, err);
        }
        if (!retryable) break;
      }
      if (!cancelled) setRoleError(true);
    };
    fetchRole();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [session?.user?.id, roleAttempt]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || role !== 'profesional') {
      setHasProfessionalProfile(null);
      return;
    }
    let cancelled = false;

    supabase
      .from('professional_profiles')
      .select('profile_id')
      .eq('profile_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        // Ante un error NO se asume "sin perfil": eso redirigiría a un profesional que sí lo tiene
        // a "completá tu perfil". Se queda en null (= todavía no se sabe).
        if (error) {
          console.error('[Auth] No se pudo leer professional_profiles:', error);
          return;
        }
        setHasProfessionalProfile(!!data);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, role]);

  const retryRole = () => setRoleAttempt((n) => n + 1);

  const signOut = async () => {
    // Antes de cerrar: el DELETE del token de push necesita la sesión vigente.
    await unregisterPush();
    const { error } = await supabase.auth.signOut();
    // Si el cierre no se concretó (p. ej. sin red) la sesión sigue viva: se devuelve el push a este usuario.
    if (error) void resumePush();
  };

  return (
    <AuthContext.Provider
      value={{
        session, user: session?.user ?? null, role, roleError, retryRole, hasProfessionalProfile, loading, signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);