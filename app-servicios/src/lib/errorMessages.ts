/**
 * Convierte errores técnicos de Supabase (Auth o Postgres/PostgREST) en un
 * mensaje entendible para el usuario final.
 *
 * El error TÉCNICO completo siempre se imprime en la consola del navegador
 * (F12 → Console) para que tú, como developer, puedas ver exactamente qué
 * pasó (status, code, detalles, hint) — el usuario nunca ve eso, solo el
 * mensaje traducido. El mensaje visible NUNCA debe incluir el texto crudo
 * del backend, códigos internos, ni pedirle al usuario que revise la consola.
 */
export function getFriendlyErrorMessage(error: unknown): string {
  // Log completo para debugging - esto es lo que TÚ revisas en consola
  console.error('[Error real]', error);

  const err = error as { message?: string; code?: string; status?: number };
  const rawMessage = (err?.message ?? '').toLowerCase();
  const code = err?.code ?? err?.status;

  // --- Errores de autenticación (Supabase Auth) ---
  if (rawMessage.includes('sending confirmation email') || rawMessage.includes('email_config')) {
    return 'No pudimos completar el registro en este momento. Probá de nuevo en unos minutos.';
  }
  if (rawMessage.includes('invalid login credentials')) {
    return 'El correo o la contraseña no son correctos.';
  }
  if (rawMessage.includes('already registered') || rawMessage.includes('already exists') || rawMessage.includes('user already registered')) {
    return 'Ya existe una cuenta con ese correo. Probá iniciar sesión.';
  }
  if (rawMessage.includes('email not confirmed')) {
    return 'Tu correo todavía no ha sido confirmado. Revisá tu bandeja de entrada.';
  }
  if (rawMessage.includes('password') && (rawMessage.includes('6') || rawMessage.includes('short') || rawMessage.includes('weak'))) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  if (rawMessage.includes('invalid') && rawMessage.includes('email')) {
    return 'El correo ingresado no es válido.';
  }
  if (rawMessage.includes('anonymous') && rawMessage.includes('disabled')) {
    return 'Completá el correo y la contraseña antes de continuar.';
  }
  if (rawMessage.includes('rate limit') || rawMessage.includes('too many requests') || rawMessage.includes('after ')) {
    return 'Hiciste demasiados intentos seguidos. Esperá un momento antes de volver a intentar.';
  }
  if (rawMessage.includes('signups not allowed') || rawMessage.includes('signup is disabled')) {
    return 'En este momento no se pueden crear cuentas nuevas. Intentá más tarde.';
  }
  if (rawMessage.includes('jwt') || rawMessage.includes('session') || code === 401) {
    return 'Tu sesión expiró. Iniciá sesión de nuevo.';
  }

  // --- Errores de la base de datos (códigos estándar de Postgres/PostgREST) ---
  if (code === '42501' || code === 403) {
    return 'No tenés permiso para realizar esta acción.';
  }
  if (code === '23505') {
    return 'Ya existe un registro con esos datos.';
  }
  if (code === '23503') {
    return 'Falta información relacionada necesaria para completar la acción.';
  }
  if (code === '23514' || code === '22P02') {
    return 'Alguno de los datos ingresados no es válido.';
  }
  // RAISE EXCEPTION de nuestros propios triggers (máquina de estados de bookings,
  // guard de is_verified, guard de reviews) - código por defecto P0001. A diferencia
  // de los demás errores de Postgres, ya vienen redactados en español para el usuario
  // final, así que se muestran tal cual en vez de mapearlos a un mensaje genérico.
  if (code === 'P0001' && err?.message) {
    return err.message;
  }

  // --- Error de red (servidor apagado, sin conexión, etc.) ---
  if (error instanceof TypeError && rawMessage.includes('fetch')) {
    return 'No se pudo conectar con el servidor. Verificá tu conexión e intentá de nuevo.';
  }

  // --- Cualquier otro caso no mapeado todavía ---
  // Nunca mostramos el código ni el texto crudo acá: ya quedó en la consola arriba.
  return 'Ocurrió un problema al procesar tu solicitud. Intentá de nuevo en unos minutos.';
}
