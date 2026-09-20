import type { MorroDocumentLocale } from "./browser-locale.js";

export type CommerceSurface = "ticketing" | "experience";

export interface TicketingPresentationCopy {
  readonly static: Readonly<Record<string, string>>;
  readonly secureGuest: string;
  readonly kindTour: string;
  readonly kindTransport: string;
  readonly kindExperience: string;
  readonly ticketSingular: string;
  readonly ticketPlural: string;
  readonly passSingular: string;
  readonly passPlural: string;
  readonly noOffers: string;
  readonly details: string;
  readonly reserve: string;
  readonly soldOut: string;
  readonly status: Readonly<Record<string, string>>;
  readonly noReservations: string;
  readonly viewPass: string;
  readonly viewTicket: string;
  readonly yourPass: string;
  readonly yourTicket: string;
  readonly passUnavailable: string;
  readonly ticketUnavailable: string;
  readonly cancelReservation: string;
  readonly cancelFailed: string;
  readonly paymentConfirmedFinalizing: string;
  readonly checkingPayment: string;
  readonly paymentConfirmedIssuing: string;
  readonly paymentNotCompleted: string;
  readonly confirmationPending: string;
  readonly selectExperienceFirst: string;
  readonly fillFields: string;
  readonly creatingReservation: string;
  readonly reservationCreated: string;
  readonly createReservationFailed: string;
  readonly updateFailed: string;
  readonly ticketingUnavailable: string;
  pricePer(formattedAmount: string, unit: string): string;
  availableCount(count: number): string;
  issuedAt(formattedDate: string): string;
  each(formattedAmount: string): string;
  validUntil(formattedDate: string): string;
  createdAt(formattedDate: string): string;
}

export interface ExperiencePresentationCopy {
  readonly static: Readonly<Record<string, string>>;
  readonly confirmLater: string;
  readonly kindTour: string;
  readonly kindTransport: string;
  readonly kindExperience: string;
  readonly missingExperience: string;
  readonly unavailableNow: string;
  readonly loadFailed: string;
  readonly reserveNow: string;
  readonly viewAvailability: string;
  description(kind: string, reference: string): string;
  fallbackDescription(kind: string): string;
  availableCount(count: number): string;
  salesWindow(start: string, end: string): string;
  documentTitle(label: string): string;
}

function normalizedLocale(locale?: string | null): MorroDocumentLocale {
  const language = locale?.trim().toLowerCase().replaceAll("_", "-") ?? "";
  if (language === "he" || language === "iw" || language.startsWith("he-") || language.startsWith("iw-"))
    return "he-IL";
  if (language === "es" || language.startsWith("es-")) return "es-ES";
  if (language === "en" || language.startsWith("en-")) return "en-US";
  return "pt-BR";
}

const TICKETING_COPY: Readonly<Record<MorroDocumentLocale, TicketingPresentationCopy>> =
  Object.freeze({
    "pt-BR": Object.freeze({
      static: Object.freeze({
        documentTitle: "Ingressos · Morro Digital",
        mainTitle: "Ingressos e reservas",
        lead: "Reserve com preço congelado, finalize pelo checkout seguro e apresente o QR emitido após a confirmação do pagamento.",
        availabilityEyebrow: "Disponibilidade em tempo real",
        offersTitle: "Experiências disponíveis",
        refresh: "Atualizar",
        reservationEyebrow: "Reserva",
        reservationTitle: "Seus dados",
        securePayment: "Pagamento processado pelo Payments canônico.",
        experienceLabel: "Experiência",
        experiencePlaceholder: "Selecione uma experiência acima",
        fullName: "Nome completo",
        email: "E-mail",
        phone: "Telefone",
        optional: "opcional",
        document: "Documento",
        quantity: "Quantidade",
        reserveAndPay: "Reservar e ir para pagamento",
        walletEyebrow: "Sua carteira",
        walletTitle: "Reservas e ingressos",
        qrAfterPayment: "O QR só é emitido após confirmação Financial verificada.",
        close: "Fechar",
        confirmedTicket: "Ingresso confirmado",
        yourTicket: "Seu ingresso",
        ticketQrLabel: "QR code do ingresso",
      }),
      secureGuest: "Compra segura · visitante",
      kindTour: "Passeio",
      kindTransport: "Transporte",
      kindExperience: "Experiência",
      ticketSingular: "ingresso",
      ticketPlural: "ingressos",
      passSingular: "passagem",
      passPlural: "passagens",
      noOffers: "Nenhuma oferta está disponível para reserva agora.",
      details: "Ver detalhes",
      reserve: "Reservar",
      soldOut: "Esgotado",
      status: Object.freeze({
        held: "Aguardando pagamento",
        confirmed: "Confirmada",
        expired: "Expirada",
        cancelled: "Cancelada",
      }),
      noReservations: "Você ainda não possui reservas neste navegador.",
      viewPass: "Ver passagem",
      viewTicket: "Ver ingresso",
      yourPass: "Sua passagem",
      yourTicket: "Seu ingresso",
      passUnavailable: "Passagem indisponível.",
      ticketUnavailable: "Ingresso indisponível.",
      cancelReservation: "Cancelar reserva",
      cancelFailed: "Não foi possível cancelar.",
      paymentConfirmedFinalizing: "Pagamento confirmado. O ingresso está finalizando a emissão; atualize em instantes.",
      checkingPayment: "Verificando a confirmação do pagamento…",
      paymentConfirmedIssuing: "Pagamento confirmado. Emitindo seu ingresso…",
      paymentNotCompleted: "O pagamento não foi concluído. A reserva será atualizada conforme o estado verificado.",
      confirmationPending: "A confirmação continua pendente. Você pode fechar esta página e voltar depois.",
      selectExperienceFirst: "Selecione uma experiência antes de reservar.",
      fillFields: "Preencha nome, e-mail e quantidade corretamente.",
      creatingReservation: "Criando uma reserva segura…",
      reservationCreated: "Reserva criada. Abrindo o checkout seguro…",
      createReservationFailed: "Não foi possível criar a reserva.",
      updateFailed: "Não foi possível atualizar.",
      ticketingUnavailable: "Ticketing indisponível.",
      pricePer: (amount, unit) => `${amount} por ${unit}`,
      availableCount: (count) => `${count} disponíveis`,
      issuedAt: (date) => `emitido em ${date}`,
      each: (amount) => `${amount} cada`,
      validUntil: (date) => `Reserva válida até ${date}`,
      createdAt: (date) => `Criada em ${date}`,
    }),
    "en-US": Object.freeze({
      static: Object.freeze({
        documentTitle: "Tickets · Morro Digital",
        mainTitle: "Tickets and reservations",
        lead: "Hold the current price, complete the secure checkout, and present the QR issued after verified payment confirmation.",
        availabilityEyebrow: "Real-time availability",
        offersTitle: "Available experiences",
        refresh: "Refresh",
        reservationEyebrow: "Reservation",
        reservationTitle: "Your details",
        securePayment: "Payment is processed by the canonical Payments service.",
        experienceLabel: "Experience",
        experiencePlaceholder: "Select an experience above",
        fullName: "Full name",
        email: "Email",
        phone: "Phone",
        optional: "optional",
        document: "Document",
        quantity: "Quantity",
        reserveAndPay: "Reserve and continue to payment",
        walletEyebrow: "Your wallet",
        walletTitle: "Reservations and tickets",
        qrAfterPayment: "The QR is issued only after verified Financial confirmation.",
        close: "Close",
        confirmedTicket: "Confirmed ticket",
        yourTicket: "Your ticket",
        ticketQrLabel: "Ticket QR code",
      }),
      secureGuest: "Secure purchase · guest",
      kindTour: "Tour",
      kindTransport: "Transport",
      kindExperience: "Experience",
      ticketSingular: "ticket",
      ticketPlural: "tickets",
      passSingular: "pass",
      passPlural: "passes",
      noOffers: "No offers are available for reservation right now.",
      details: "View details",
      reserve: "Reserve",
      soldOut: "Sold out",
      status: Object.freeze({
        held: "Awaiting payment",
        confirmed: "Confirmed",
        expired: "Expired",
        cancelled: "Cancelled",
      }),
      noReservations: "You do not have reservations in this browser yet.",
      viewPass: "View pass",
      viewTicket: "View ticket",
      yourPass: "Your pass",
      yourTicket: "Your ticket",
      passUnavailable: "Pass unavailable.",
      ticketUnavailable: "Ticket unavailable.",
      cancelReservation: "Cancel reservation",
      cancelFailed: "Could not cancel the reservation.",
      paymentConfirmedFinalizing: "Payment confirmed. Your ticket is being finalized; refresh in a moment.",
      checkingPayment: "Checking payment confirmation…",
      paymentConfirmedIssuing: "Payment confirmed. Issuing your ticket…",
      paymentNotCompleted: "Payment was not completed. The reservation will follow the verified payment state.",
      confirmationPending: "Confirmation is still pending. You can close this page and return later.",
      selectExperienceFirst: "Select an experience before reserving.",
      fillFields: "Enter a valid name, email, and quantity.",
      creatingReservation: "Creating a secure reservation…",
      reservationCreated: "Reservation created. Opening secure checkout…",
      createReservationFailed: "Could not create the reservation.",
      updateFailed: "Could not refresh the data.",
      ticketingUnavailable: "Ticketing is unavailable.",
      pricePer: (amount, unit) => `${amount} per ${unit}`,
      availableCount: (count) => `${count} available`,
      issuedAt: (date) => `issued on ${date}`,
      each: (amount) => `${amount} each`,
      validUntil: (date) => `Reservation valid until ${date}`,
      createdAt: (date) => `Created on ${date}`,
    }),
    "es-ES": Object.freeze({
      static: Object.freeze({
        documentTitle: "Entradas · Morro Digital",
        mainTitle: "Entradas y reservas",
        lead: "Reserva con el precio actual, completa el checkout seguro y presenta el QR emitido después de la confirmación verificada del pago.",
        availabilityEyebrow: "Disponibilidad en tiempo real",
        offersTitle: "Experiencias disponibles",
        refresh: "Actualizar",
        reservationEyebrow: "Reserva",
        reservationTitle: "Tus datos",
        securePayment: "El pago se procesa mediante el servicio canónico de Payments.",
        experienceLabel: "Experiencia",
        experiencePlaceholder: "Selecciona una experiencia arriba",
        fullName: "Nombre completo",
        email: "Correo electrónico",
        phone: "Teléfono",
        optional: "opcional",
        document: "Documento",
        quantity: "Cantidad",
        reserveAndPay: "Reservar y continuar al pago",
        walletEyebrow: "Tu cartera",
        walletTitle: "Reservas y entradas",
        qrAfterPayment: "El QR se emite solo tras la confirmación verificada de Financial.",
        close: "Cerrar",
        confirmedTicket: "Entrada confirmada",
        yourTicket: "Tu entrada",
        ticketQrLabel: "Código QR de la entrada",
      }),
      secureGuest: "Compra segura · visitante",
      kindTour: "Paseo",
      kindTransport: "Transporte",
      kindExperience: "Experiencia",
      ticketSingular: "entrada",
      ticketPlural: "entradas",
      passSingular: "pasaje",
      passPlural: "pasajes",
      noOffers: "No hay ofertas disponibles para reservar ahora.",
      details: "Ver detalles",
      reserve: "Reservar",
      soldOut: "Agotado",
      status: Object.freeze({
        held: "Esperando pago",
        confirmed: "Confirmada",
        expired: "Expirada",
        cancelled: "Cancelada",
      }),
      noReservations: "Todavía no tienes reservas en este navegador.",
      viewPass: "Ver pasaje",
      viewTicket: "Ver entrada",
      yourPass: "Tu pasaje",
      yourTicket: "Tu entrada",
      passUnavailable: "Pasaje no disponible.",
      ticketUnavailable: "Entrada no disponible.",
      cancelReservation: "Cancelar reserva",
      cancelFailed: "No se pudo cancelar la reserva.",
      paymentConfirmedFinalizing: "Pago confirmado. La entrada se está terminando de emitir; actualiza en unos instantes.",
      checkingPayment: "Verificando la confirmación del pago…",
      paymentConfirmedIssuing: "Pago confirmado. Emitiendo tu entrada…",
      paymentNotCompleted: "El pago no se completó. La reserva se actualizará según el estado verificado.",
      confirmationPending: "La confirmación sigue pendiente. Puedes cerrar esta página y volver más tarde.",
      selectExperienceFirst: "Selecciona una experiencia antes de reservar.",
      fillFields: "Completa correctamente nombre, correo y cantidad.",
      creatingReservation: "Creando una reserva segura…",
      reservationCreated: "Reserva creada. Abriendo el checkout seguro…",
      createReservationFailed: "No se pudo crear la reserva.",
      updateFailed: "No se pudo actualizar.",
      ticketingUnavailable: "Ticketing no está disponible.",
      pricePer: (amount, unit) => `${amount} por ${unit}`,
      availableCount: (count) => `${count} disponibles`,
      issuedAt: (date) => `emitido el ${date}`,
      each: (amount) => `${amount} cada uno`,
      validUntil: (date) => `Reserva válida hasta ${date}`,
      createdAt: (date) => `Creada el ${date}`,
    }),
    "he-IL": Object.freeze({
      static: Object.freeze({
        documentTitle: "כרטיסים · Morro Digital",
        mainTitle: "כרטיסים והזמנות",
        lead: "שמרו את המחיר הנוכחי, השלימו תשלום מאובטח והציגו את קוד ה-QR שמונפק לאחר אימות התשלום.",
        availabilityEyebrow: "זמינות בזמן אמת",
        offersTitle: "חוויות זמינות",
        refresh: "רענון",
        reservationEyebrow: "הזמנה",
        reservationTitle: "הפרטים שלך",
        securePayment: "התשלום מעובד באמצעות שירות Payments הקנוני.",
        experienceLabel: "חוויה",
        experiencePlaceholder: "בחרו חוויה למעלה",
        fullName: "שם מלא",
        email: "דוא״ל",
        phone: "טלפון",
        optional: "אופציונלי",
        document: "מסמך",
        quantity: "כמות",
        reserveAndPay: "הזמנה והמשך לתשלום",
        walletEyebrow: "הארנק שלך",
        walletTitle: "הזמנות וכרטיסים",
        qrAfterPayment: "קוד ה-QR מונפק רק לאחר אישור Financial מאומת.",
        close: "סגירה",
        confirmedTicket: "כרטיס מאושר",
        yourTicket: "הכרטיס שלך",
        ticketQrLabel: "קוד QR של הכרטיס",
      }),
      secureGuest: "רכישה מאובטחת · אורח",
      kindTour: "סיור",
      kindTransport: "תחבורה",
      kindExperience: "חוויה",
      ticketSingular: "כרטיס",
      ticketPlural: "כרטיסים",
      passSingular: "כרטיס נסיעה",
      passPlural: "כרטיסי נסיעה",
      noOffers: "אין כרגע הצעות זמינות להזמנה.",
      details: "פרטים",
      reserve: "הזמנה",
      soldOut: "אזל",
      status: Object.freeze({
        held: "ממתין לתשלום",
        confirmed: "מאושרת",
        expired: "פגה",
        cancelled: "בוטלה",
      }),
      noReservations: "עדיין אין הזמנות בדפדפן הזה.",
      viewPass: "הצגת כרטיס נסיעה",
      viewTicket: "הצגת כרטיס",
      yourPass: "כרטיס הנסיעה שלך",
      yourTicket: "הכרטיס שלך",
      passUnavailable: "כרטיס הנסיעה אינו זמין.",
      ticketUnavailable: "הכרטיס אינו זמין.",
      cancelReservation: "ביטול הזמנה",
      cancelFailed: "לא ניתן לבטל את ההזמנה.",
      paymentConfirmedFinalizing: "התשלום אושר. הכרטיס נמצא בהפקה; רעננו בעוד רגע.",
      checkingPayment: "בודק אישור תשלום…",
      paymentConfirmedIssuing: "התשלום אושר. מפיק את הכרטיס…",
      paymentNotCompleted: "התשלום לא הושלם. ההזמנה תעודכן לפי המצב המאומת.",
      confirmationPending: "האישור עדיין ממתין. אפשר לסגור את הדף ולחזור מאוחר יותר.",
      selectExperienceFirst: "יש לבחור חוויה לפני ההזמנה.",
      fillFields: "יש למלא שם, דוא״ל וכמות תקינים.",
      creatingReservation: "יוצר הזמנה מאובטחת…",
      reservationCreated: "ההזמנה נוצרה. פותח תשלום מאובטח…",
      createReservationFailed: "לא ניתן ליצור את ההזמנה.",
      updateFailed: "לא ניתן לרענן את הנתונים.",
      ticketingUnavailable: "Ticketing אינו זמין.",
      pricePer: (amount, unit) => `${amount} לכל ${unit}`,
      availableCount: (count) => `${count} זמינים`,
      issuedAt: (date) => `הונפק ב-${date}`,
      each: (amount) => `${amount} לכל אחד`,
      validUntil: (date) => `ההזמנה תקפה עד ${date}`,
      createdAt: (date) => `נוצרה ב-${date}`,
    }),
  });

const EXPERIENCE_COPY: Readonly<Record<MorroDocumentLocale, ExperiencePresentationCopy>> =
  Object.freeze({
    "pt-BR": Object.freeze({
      static: Object.freeze({
        documentTitle: "Experiência · Morro Digital",
        back: "← Voltar ao Morro Digital",
        loading: "Carregando experiência…",
        experience: "Experiência",
        reserveNow: "Reservar agora",
        viewAll: "Ver todas as experiências",
        infoAria: "Informações da experiência",
        when: "Quando",
        until: "Até",
        value: "Valor",
        availability: "Disponibilidade",
        sales: "Vendas",
      }),
      confirmLater: "A confirmar",
      kindTour: "Passeio",
      kindTransport: "Transporte",
      kindExperience: "Experiência",
      missingExperience: "Experiência não informada.",
      unavailableNow: "Esta experiência não está disponível no momento.",
      loadFailed: "Não foi possível carregar esta experiência agora. Tente novamente em instantes.",
      reserveNow: "Reservar agora",
      viewAvailability: "Ver disponibilidade",
      description: (kind, reference) =>
        `${kind} disponível no Morro Digital. ${reference}. Reserve com disponibilidade e preço confirmados pelo inventário oficial da plataforma.`,
      fallbackDescription: () =>
        "Reserve esta experiência pelo inventário oficial do Morro Digital.",
      availableCount: (count) => `${count} disponíveis`,
      salesWindow: (start, end) => `${start} até ${end}`,
      documentTitle: (label) => `${label} · Morro Digital`,
    }),
    "en-US": Object.freeze({
      static: Object.freeze({
        documentTitle: "Experience · Morro Digital",
        back: "← Back to Morro Digital",
        loading: "Loading experience…",
        experience: "Experience",
        reserveNow: "Reserve now",
        viewAll: "View all experiences",
        infoAria: "Experience information",
        when: "When",
        until: "Until",
        value: "Price",
        availability: "Availability",
        sales: "Sales",
      }),
      confirmLater: "To be confirmed",
      kindTour: "Tour",
      kindTransport: "Transport",
      kindExperience: "Experience",
      missingExperience: "No experience was provided.",
      unavailableNow: "This experience is not available right now.",
      loadFailed: "Could not load this experience right now. Please try again shortly.",
      reserveNow: "Reserve now",
      viewAvailability: "View availability",
      description: (kind, reference) =>
        `${kind} available on Morro Digital. ${reference}. Reserve with availability and pricing confirmed by the platform's official inventory.`,
      fallbackDescription: () =>
        "Reserve this experience through Morro Digital's official inventory.",
      availableCount: (count) => `${count} available`,
      salesWindow: (start, end) => `${start} to ${end}`,
      documentTitle: (label) => `${label} · Morro Digital`,
    }),
    "es-ES": Object.freeze({
      static: Object.freeze({
        documentTitle: "Experiencia · Morro Digital",
        back: "← Volver a Morro Digital",
        loading: "Cargando experiencia…",
        experience: "Experiencia",
        reserveNow: "Reservar ahora",
        viewAll: "Ver todas las experiencias",
        infoAria: "Información de la experiencia",
        when: "Cuándo",
        until: "Hasta",
        value: "Valor",
        availability: "Disponibilidad",
        sales: "Ventas",
      }),
      confirmLater: "A confirmar",
      kindTour: "Paseo",
      kindTransport: "Transporte",
      kindExperience: "Experiencia",
      missingExperience: "No se indicó una experiencia.",
      unavailableNow: "Esta experiencia no está disponible en este momento.",
      loadFailed: "No se pudo cargar esta experiencia ahora. Inténtalo de nuevo en unos instantes.",
      reserveNow: "Reservar ahora",
      viewAvailability: "Ver disponibilidad",
      description: (kind, reference) =>
        `${kind} disponible en Morro Digital. ${reference}. Reserva con disponibilidad y precio confirmados por el inventario oficial de la plataforma.`,
      fallbackDescription: () =>
        "Reserva esta experiencia mediante el inventario oficial de Morro Digital.",
      availableCount: (count) => `${count} disponibles`,
      salesWindow: (start, end) => `${start} hasta ${end}`,
      documentTitle: (label) => `${label} · Morro Digital`,
    }),
    "he-IL": Object.freeze({
      static: Object.freeze({
        documentTitle: "חוויה · Morro Digital",
        back: "← חזרה ל-Morro Digital",
        loading: "טוען חוויה…",
        experience: "חוויה",
        reserveNow: "הזמנה עכשיו",
        viewAll: "כל החוויות",
        infoAria: "מידע על החוויה",
        when: "מתי",
        until: "עד",
        value: "מחיר",
        availability: "זמינות",
        sales: "מכירה",
      }),
      confirmLater: "יאושר בהמשך",
      kindTour: "סיור",
      kindTransport: "תחבורה",
      kindExperience: "חוויה",
      missingExperience: "לא נבחרה חוויה.",
      unavailableNow: "החוויה הזו אינה זמינה כרגע.",
      loadFailed: "לא ניתן לטעון את החוויה כרגע. נסו שוב בעוד רגע.",
      reserveNow: "הזמנה עכשיו",
      viewAvailability: "בדיקת זמינות",
      description: (kind, reference) =>
        `${kind} זמין ב-Morro Digital. ${reference}. ההזמנה מתבצעת לפי זמינות ומחיר המאומתים במלאי הרשמי של הפלטפורמה.`,
      fallbackDescription: () =>
        "הזמינו את החוויה דרך המלאי הרשמי של Morro Digital.",
      availableCount: (count) => `${count} זמינים`,
      salesWindow: (start, end) => `${start} עד ${end}`,
      documentTitle: (label) => `${label} · Morro Digital`,
    }),
  });

export function commerceIntlLocale(locale?: string | null): MorroDocumentLocale {
  return normalizedLocale(locale);
}

export function getTicketingPresentationCopy(
  locale?: string | null,
): TicketingPresentationCopy {
  return TICKETING_COPY[normalizedLocale(locale)];
}

export function getExperiencePresentationCopy(
  locale?: string | null,
): ExperiencePresentationCopy {
  return EXPERIENCE_COPY[normalizedLocale(locale)];
}

export function applyCommerceDocumentCopy(
  document: Document,
  surface: CommerceSurface,
  locale?: string | null,
): void {
  const copy =
    surface === "ticketing"
      ? getTicketingPresentationCopy(locale).static
      : getExperiencePresentationCopy(locale).static;

  document.querySelectorAll<HTMLElement>("[data-commerce-i18n]").forEach((element) => {
    const key = element.dataset.commerceI18n;
    if (key && copy[key]) element.textContent = copy[key];
  });
  document
    .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      "[data-commerce-i18n-placeholder]",
    )
    .forEach((element) => {
      const key = element.dataset.commerceI18nPlaceholder;
      if (key && copy[key]) element.placeholder = copy[key];
    });
  document
    .querySelectorAll<HTMLElement>("[data-commerce-i18n-aria]")
    .forEach((element) => {
      const key = element.dataset.commerceI18nAria;
      if (key && copy[key]) element.setAttribute("aria-label", copy[key]);
    });

  if (copy.documentTitle) document.title = copy.documentTitle;
}
