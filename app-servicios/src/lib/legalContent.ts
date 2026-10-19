/**
 * Textos del aviso de privacidad y de los términos de uso (páginas /privacidad y /terminos).
 *
 * Cada afirmación describe algo que la app HACE hoy (se comprobó contra el esquema SQL y el código): qué datos
 * guarda, quién ve qué, qué proveedores intervienen. Si cambia la app, hay que cambiar acá y subir
 * LEGAL_UPDATED. No es asesoría legal: conviene que alguien con criterio jurídico lo revise antes de
 * presentarlo como definitivo.
 */

export const LEGAL_UPDATED = '18 de octubre de 2026';

/**
 * Canal para pedir la eliminación de la cuenta y otras solicitudes de datos. Todavía no hay un correo de
 * soporte: mientras sea null, las páginas lo dicen con honestidad en vez de inventar un contacto.
 * Al definirlo (p. ej. 'soporte@yaquedo.shop') aparece como enlace en ambas páginas.
 */
export const SUPPORT_EMAIL: string | null = null;

export type LegalKind = 'privacidad' | 'terminos';

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  items?: string[];
  /** Agrega al final la línea del canal de contacto (SUPPORT_EMAIL, o el aviso de que aún no existe). */
  contact?: boolean;
}

export interface LegalDoc {
  title: string;
  /** Una línea bajo el título: qué es este documento. */
  summary: string;
  sections: LegalSection[];
}

export const LEGAL_DOCS: Record<LegalKind, LegalDoc> = {
  privacidad: {
    title: 'Aviso de privacidad',
    summary: 'Qué datos guarda Ya Quedó, para qué los usa y quién puede verlos.',
    sections: [
      {
        heading: 'Quiénes somos',
        paragraphs: [
          'Ya Quedó es un proyecto académico que conecta a clientes con profesionales de oficios (electricistas, plomeros, albañiles y más). Este aviso explica de forma sencilla qué información se guarda cuando usás la web o la app Android.',
        ],
      },
      {
        heading: 'Qué datos guardamos',
        items: [
          'Tu cuenta: correo electrónico y contraseña. La contraseña se guarda como un hash que no se puede revertir: ni el equipo puede leerla.',
          'Tu perfil: nombre completo y rol (cliente o profesional). El teléfono y la foto son opcionales.',
          'Si sos profesional: descripción, ubicación de trabajo y radio de servicio (ambos opcionales), los servicios que ofrecés con su precio, y los documentos de verificación que subas (DPI, licencia o certificación).',
          'Tu actividad: solicitudes, mensajes de chat, calificaciones, denuncias y notificaciones.',
          'Si activás las notificaciones en la app Android: un identificador del dispositivo (token de Firebase Cloud Messaging) para poder enviarte los avisos. Se borra al cerrar sesión.',
        ],
      },
      {
        heading: 'Lo que no hacemos',
        items: [
          'No accedemos al GPS ni a la ubicación de tu teléfono. La ubicación de un profesional es una zona de trabajo que él mismo escribe en su perfil.',
          'No usamos publicidad ni herramientas de analítica de terceros.',
          'No vendemos tus datos.',
        ],
      },
      {
        heading: 'Para qué los usamos',
        paragraphs: [
          'Solo para que la app funcione: mostrar perfiles y servicios, coordinar solicitudes y chats, avisarte de novedades, verificar profesionales, revisar denuncias y mantener el servicio seguro.',
        ],
      },
      {
        heading: 'Quién puede ver qué',
        items: [
          'Los demás usuarios de la app pueden ver el nombre, la foto, la descripción, los servicios con su precio, las calificaciones y el sello de los profesionales.',
          'Los mensajes de una solicitud solo los ven las dos personas que participan en ella.',
          'Los documentos de verificación son privados: desde la app solo los ve quien los subió. Los revisa el proceso de verificación autorizado.',
          'Cuando alguien denuncia a otra persona, la persona denunciada nunca ve quién la denunció.',
        ],
      },
      {
        heading: 'Proveedores que intervienen',
        items: [
          'Google Firebase Cloud Messaging: entrega las notificaciones push a la app Android.',
          'Cloudflare: protege el sitio y su tráfico pasa por su red.',
          'Oracle Cloud Infrastructure: servidores donde se alojan la aplicación y la base de datos.',
        ],
      },
      {
        heading: 'Seguridad',
        paragraphs: [
          'Las conexiones van cifradas (HTTPS) y la base de datos aplica reglas de acceso por usuario. Tu sesión se cierra sola después de 30 minutos sin actividad. Ningún sistema es infalible: cuidá tu contraseña y no la compartas.',
        ],
      },
      {
        heading: 'Tus derechos',
        items: [
          'Podés corregir tu perfil y tus servicios desde la app cuando quieras.',
          'Podés borrar tus documentos de verificación desde tu perfil profesional.',
          'La eliminación completa de la cuenta todavía no tiene un botón en la app: hay que solicitarla.',
        ],
        contact: true,
      },
      {
        heading: 'Cambios en este aviso',
        paragraphs: [
          'Si cambia lo que la app hace con tus datos, actualizamos este texto y la fecha de arriba.',
        ],
      },
    ],
  },

  terminos: {
    title: 'Términos de uso',
    summary: 'Las reglas básicas para usar Ya Quedó, en lenguaje claro.',
    sections: [
      {
        heading: 'Qué es Ya Quedó',
        paragraphs: [
          'Ya Quedó es una plataforma, desarrollada como proyecto académico, que facilita el contacto entre clientes y profesionales de oficios. Ya Quedó no presta los servicios ni es parte del acuerdo entre quien los pide y quien los realiza.',
        ],
      },
      {
        heading: 'Tu cuenta',
        items: [
          'Los datos que ingresás deben ser verdaderos y estar al día.',
          'Sos responsable de lo que se haga con tu cuenta: cuidá tu contraseña y no la compartas.',
          'Por seguridad, la sesión se cierra sola tras 30 minutos sin actividad.',
        ],
      },
      {
        heading: 'Servicios y precios',
        paragraphs: [
          'Cada profesional publica sus servicios y sus precios en quetzales. El precio final y la forma de pago se acuerdan directamente entre el cliente y el profesional: Ya Quedó no procesa pagos.',
        ],
      },
      {
        heading: 'Qué podemos y qué no podemos garantizar',
        items: [
          'Facilitamos el contacto, pero no garantizamos la calidad, la puntualidad ni el resultado de un trabajo.',
          'El sello "Verificado" indica que el profesional pasó por un proceso de verificación de documentos. No es una garantía sobre el trabajo que haga.',
          'Las calificaciones son opiniones de otros usuarios, no nuestras.',
          'En la medida que la ley lo permita, Ya Quedó no responde por daños derivados del trato entre usuarios.',
        ],
      },
      {
        heading: 'Conducta esperada',
        paragraphs: ['Para cuidar a todos, no está permitido:'],
        items: [
          'Cometer fraude, acosar o suplantar a otra persona.',
          'Publicar contenido inapropiado, ni calificaciones o documentos falsos.',
          'Intentar acceder a cuentas o datos ajenos, o saturar o dañar el servicio.',
        ],
      },
      {
        heading: 'Tu contenido',
        paragraphs: [
          'Lo que publicás (descripción, servicios, mensajes, calificaciones) sigue siendo tuyo. Al publicarlo, nos autorizás a mostrarlo dentro de la app para que funcione.',
        ],
      },
      {
        heading: 'Calificaciones, reseñas y desacuerdos',
        paragraphs: [
          'Ya Quedó no arbitra ni interviene en los acuerdos o desacuerdos entre usuarios: si algo sale mal, lo primero es aclararlo por el chat de la solicitud. Las calificaciones y las reseñas son la herramienta de la comunidad para dejar constancia de cómo fue una experiencia. Escribilas con honestidad y respeto, y solo sobre trabajos que realmente ocurrieron.',
        ],
      },
      {
        heading: 'Disponibilidad y la app Android',
        paragraphs: [
          'Por ser un proyecto académico, el servicio puede tener interrupciones o cambios sin aviso previo. La app Android se distribuye directamente, no por Play Store: antes de instalarla podés comprobar la huella SHA-256 que publicamos junto a la descarga. Instalarla es decisión tuya.',
        ],
      },
      {
        heading: 'Cambios y contacto',
        paragraphs: [
          'Si cambian estos términos, actualizamos este texto y la fecha de arriba. Seguir usando la app después significa que los aceptás.',
        ],
        contact: true,
      },
    ],
  },
};
