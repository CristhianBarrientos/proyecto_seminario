/**
 * Validaciones básicas de formulario que corren ANTES de llamar al backend.
 * El objetivo es doble: mejor UX (feedback inmediato, sin ida y vuelta al
 * servidor) y una primera línea de defensa que evita mandar requests con
 * campos vacíos o mal formados a Supabase.
 *
 * Esto no reemplaza la validación del lado del servidor (constraints de
 * columnas, RLS, etc.) - es la primera capa, no la única.
 */

/**
 * Regex de correo robusta (no RFC 5322 completo, pero cubre los defectos
 * reales encontrados en auditoría, ej. ".@..com" pasaba con el regex viejo
 * `[^\s@]+@[^\s@]+\.[^\s@]+`):
 * - parte local: empieza y termina en alfanumérico, sin puntos dobles.
 * - dominio: uno o más labels alfanuméricos (sin guiones al inicio/fin de
 *   label) separados por un solo punto cada uno.
 * - TLD: solo letras, mínimo 2 - exige un dominio de alto nivel real en vez
 *   de aceptar cualquier cosa después del último punto.
 * El `(?!.*\.\.)` global bloquea puntos dobles tanto en la parte local como
 * en el dominio de una sola vez.
 */
const EMAIL_REGEX =
  /^(?!.*\.\.)[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export const isValidEmail = (value: string): boolean => EMAIL_REGEX.test(value.trim());

/**
 * Nombre y apellido reales, no una inicial o un caracter suelto:
 * exige al menos dos palabras, cada una de al menos 2 letras (soporta
 * acentos/ñ y nombres compuestos con guion o apóstrofe: "Jean-Pierre",
 * "O'Brien"), separadas por espacios.
 */
const NAME_WORD = "[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'-]*[A-Za-zÀ-ÖØ-öø-ÿ]";
const FULL_NAME_REGEX = new RegExp(`^${NAME_WORD}(?:\\s+${NAME_WORD})+$`);

export const isValidFullName = (value: string): boolean => FULL_NAME_REGEX.test(value.trim());

/**
 * Al INICIAR sesión no se exige la política nueva: hay cuentas creadas con reglas más flojas y tienen que seguir
 * entrando. Solo se descarta lo obviamente inválido antes de llamar al servidor.
 */
export const MIN_LOGIN_PASSWORD_LENGTH = 6;

/**
 * Política de contraseña al CREAR una cuenta (y al cambiarla): 8 o más caracteres, una mayúscula, un número y un
 * carácter especial.
 *
 * DEBE coincidir con GOTRUE_PASSWORD_MIN_LENGTH y GOTRUE_PASSWORD_REQUIRED_CHARACTERS del docker-compose del
 * servicio `auth` (OCI y local): validar solo acá no protege nada, porque cualquiera puede llamar directo a
 * /auth/v1/signup. Esta copia existe para dar feedback inmediato; la que manda es la del servidor.
 *
 * Los conjuntos son ASCII a propósito (el servidor los compara byte a byte: una "Ñ" no cuenta como mayúscula).
 * Los especiales excluyen ":" (separador de grupos en GoTrue) y "\" (su escape): una clave que solo usara uno de
 * esos como carácter especial se rechaza igual en la app y en el servidor.
 */
export const MIN_PASSWORD_LENGTH = 8;
export const PASSWORD_SPECIALS = '!"#$%&\'()*+,-./;<=>?@[]^_`{|}~';

export interface PasswordRule {
  id: 'length' | 'upper' | 'number' | 'special';
  label: string;
  test: (value: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: 'length', label: `${MIN_PASSWORD_LENGTH} caracteres o más`, test: (v) => v.length >= MIN_PASSWORD_LENGTH },
  { id: 'upper', label: 'Una mayúscula (A–Z)', test: (v) => /[A-Z]/.test(v) },
  { id: 'number', label: 'Un número (0–9)', test: (v) => /[0-9]/.test(v) },
  {
    id: 'special',
    label: 'Un carácter especial (! @ # $ % …)',
    test: (v) => [...v].some((ch) => PASSWORD_SPECIALS.includes(ch)),
  },
];

/** Cada requisito con su estado para la contraseña dada (lo usa la lista que se va marcando al escribir). */
export const checkPasswordRules = (value: string) => PASSWORD_RULES.map((rule) => ({ ...rule, ok: rule.test(value) }));

export const isStrongPassword = (value: string): boolean => PASSWORD_RULES.every((rule) => rule.test(value));

/**
 * Devuelve el mensaje del primer campo requerido que esté vacío, o null si
 * todos tienen valor. `fields` es un mapa { "Nombre visible": valor }.
 */
export function firstMissingField(fields: Record<string, string>): string | null {
  for (const [label, value] of Object.entries(fields)) {
    if (!value || !value.trim()) {
      return `Completá el campo "${label}".`;
    }
  }
  return null;
}

export function isPositiveNumber(value: string): boolean {
  const n = Number(value);
  return value.trim() !== '' && Number.isFinite(n) && n > 0;
}
