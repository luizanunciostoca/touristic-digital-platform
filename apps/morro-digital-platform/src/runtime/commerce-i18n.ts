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
  validThrough(formattedDate: string): string;
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
  if (
    language === "he" ||
    language === "iw" ||
    language.startsWith("he-") ||
    language.startsWith("iw-")
  )
    return "he-IL";
  if (language === "es" || language.startsWith("es-")) return "es-ES";
  if (language === "en" || language.startsWith("en-")) return "en-US";
  return "pt-BR";
}

const TICKETING_COPY: Readonly<
  Record<MorroDocumentLocale, TicketingPresentationCopy>
> = Object.freeze({
  "pt-BR": Object.freeze({
    static: Object.freeze({
      documentTitle: "Ingressos · Morro Digital",
      mainTitle: "Ingressos e reservas",
      lead: "Reserve com preço congelado, finalize pelo checkout seguro e apresente o QR emitido após a confirmação do pagamento.",
      returnToMap: "← Voltar ao mapa",
      heroEyebrow: "Experiência em Morro de São Paulo",
      productTitle: "Escolha sua experiência",
      productLead:
        "Selecione uma experiência, confira data e preço e reserve com checkout seguro.",
      selectionStep: "1 · Selecione",
      selectionTitle: "Data e experiência",
      quantityStep: "2 · Quantidade",
      selectionSummaryTitle: "Sua seleção",
      ticketsLabel: "Ingressos",
      summaryEyebrow: "Resumo",
      summaryTitle: "Estimativa da compra",
      inventoryPrice: "Preço do inventário",
      unitPrice: "Preço unitário",
      subtotalEstimate: "Subtotal estimado",
      authorityNote:
        "O valor final, moeda, disponibilidade e status de pagamento são confirmados pelo servidor no momento da reserva e do checkout.",
      identityStep: "3 · Identificação",
      identityTitle: "Dados para a reserva",
      selectedExperience: "Experiência selecionada",
      afterPurchase: "Depois da compra",
      myTickets: "Meus ingressos",
      brightnessHint:
        "Aumente o brilho da tela para facilitar a leitura no acesso.",
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
      qrAfterPayment:
        "O QR só é emitido após confirmação Financial verificada.",
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
    paymentConfirmedFinalizing:
      "Pagamento confirmado. O ingresso está finalizando a emissão; atualize em instantes.",
    checkingPayment: "Verificando a confirmação do pagamento…",
    paymentConfirmedIssuing: "Pagamento confirmado. Emitindo seu ingresso…",
    paymentNotCompleted:
      "O pagamento não foi concluído. A reserva será atualizada conforme o estado verificado.",
    confirmationPending:
      "A confirmação continua pendente. Você pode fechar esta página e voltar depois.",
    selectExperienceFirst: "Selecione uma experiência antes de reservar.",
    fillFields: "Preencha nome, e-mail e quantidade corretamente.",
    creatingReservation: "Criando uma reserva segura…",
    reservationCreated: "Reserva criada. Abrindo o checkout seguro…",
    createReservationFailed: "Não foi possível criar a reserva.",
    updateFailed: "Não foi possível atualizar.",
    ticketingUnavailable: "Ticketing indisponível.",
    pricePer: (amount: string, unit: string) => `${amount} por ${unit}`,
    availableCount: (count: number) => `${count} disponíveis`,
    issuedAt: (date: string) => `emitido em ${date}`,
    each: (amount: string) => `${amount} cada`,
    validUntil: (date: string) => `Reserva válida até ${date}`,
    validThrough: (date: string) => `válido até ${date}`,
    createdAt: (date: string) => `Criada em ${date}`,
  }),
  "en-US": Object.freeze({
    static: Object.freeze({
      documentTitle: "Tickets · Morro Digital",
      mainTitle: "Tickets and reservations",
      lead: "Hold the current price, complete the secure checkout, and present the QR issued after verified payment confirmation.",
      returnToMap: "← Back to the map",
      heroEyebrow: "Experience in Morro de São Paulo",
      productTitle: "Choose your experience",
      productLead:
        "Select an experience, review the date and price, then reserve with secure checkout.",
      selectionStep: "1 · Select",
      selectionTitle: "Date and experience",
      quantityStep: "2 · Quantity",
      selectionSummaryTitle: "Your selection",
      ticketsLabel: "Tickets",
      summaryEyebrow: "Summary",
      summaryTitle: "Purchase estimate",
      inventoryPrice: "Inventory price",
      unitPrice: "Unit price",
      subtotalEstimate: "Estimated subtotal",
      authorityNote:
        "Final price, currency, availability, and payment status are confirmed by the server when the reservation and checkout are created.",
      identityStep: "3 · Identification",
      identityTitle: "Reservation details",
      selectedExperience: "Selected experience",
      afterPurchase: "After purchase",
      myTickets: "My tickets",
      brightnessHint:
        "Increase screen brightness to make the access code easier to scan.",
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
      qrAfterPayment:
        "The QR is issued only after verified Financial confirmation.",
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
    paymentConfirmedFinalizing:
      "Payment confirmed. Your ticket is being finalized; refresh in a moment.",
    checkingPayment: "Checking payment confirmation…",
    paymentConfirmedIssuing: "Payment confirmed. Issuing your ticket…",
    paymentNotCompleted:
      "Payment was not completed. The reservation will follow the verified payment state.",
    confirmationPending:
      "Confirmation is still pending. You can close this page and return later.",
    selectExperienceFirst: "Select an experience before reserving.",
    fillFields: "Enter a valid name, email, and quantity.",
    creatingReservation: "Creating a secure reservation…",
    reservationCreated: "Reservation created. Opening secure checkout…",
    createReservationFailed: "Could not create the reservation.",
    updateFailed: "Could not refresh the data.",
    ticketingUnavailable: "Ticketing is unavailable.",
    pricePer: (amount: string, unit: string) => `${amount} per ${unit}`,
    availableCount: (count: number) => `${count} available`,
    issuedAt: (date: string) => `issued on ${date}`,
    each: (amount: string) => `${amount} each`,
    validUntil: (date: string) => `Reservation valid until ${date}`,
    validThrough: (date: string) => `valid until ${date}`,
    createdAt: (date: string) => `Created on ${date}`,
  }),
  "es-ES": Object.freeze({
    static: Object.freeze({
      documentTitle: "Entradas · Morro Digital",
      mainTitle: "Entradas y reservas",
      lead: "Reserva con el precio actual, completa el checkout seguro y presenta el QR emitido después de la confirmación verificada del pago.",
      returnToMap: "← Volver al mapa",
      heroEyebrow: "Experiencia en Morro de São Paulo",
      productTitle: "Elige tu experiencia",
      productLead:
        "Selecciona una experiencia, revisa la fecha y el precio y reserva con checkout seguro.",
      selectionStep: "1 · Selecciona",
      selectionTitle: "Fecha y experiencia",
      quantityStep: "2 · Cantidad",
      selectionSummaryTitle: "Tu selección",
      ticketsLabel: "Entradas",
      summaryEyebrow: "Resumen",
      summaryTitle: "Estimación de compra",
      inventoryPrice: "Precio del inventario",
      unitPrice: "Precio unitario",
      subtotalEstimate: "Subtotal estimado",
      authorityNote:
        "El precio final, la moneda, la disponibilidad y el estado del pago son confirmados por el servidor al crear la reserva y el checkout.",
      identityStep: "3 · Identificación",
      identityTitle: "Datos de la reserva",
      selectedExperience: "Experiencia seleccionada",
      afterPurchase: "Después de la compra",
      myTickets: "Mis entradas",
      brightnessHint:
        "Aumenta el brillo de la pantalla para facilitar la lectura del código de acceso.",
      availabilityEyebrow: "Disponibilidad en tiempo real",
      offersTitle: "Experiencias disponibles",
      refresh: "Actualizar",
      reservationEyebrow: "Reserva",
      reservationTitle: "Tus datos",
      securePayment:
        "El pago se procesa mediante el servicio canónico de Payments.",
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
      qrAfterPayment:
        "El QR se emite solo tras la confirmación verificada de Financial.",
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
    paymentConfirmedFinalizing:
      "Pago confirmado. La entrada se está terminando de emitir; actualiza en unos instantes.",
    checkingPayment: "Verificando la confirmación del pago…",
    paymentConfirmedIssuing: "Pago confirmado. Emitiendo tu entrada…",
    paymentNotCompleted:
      "El pago no se completó. La reserva se actualizará según el estado verificado.",
    confirmationPending:
      "La confirmación sigue pendiente. Puedes cerrar esta página y volver más tarde.",
    selectExperienceFirst: "Selecciona una experiencia antes de reservar.",
    fillFields: "Completa correctamente nombre, correo y cantidad.",
    creatingReservation: "Creando una reserva segura…",
    reservationCreated: "Reserva creada. Abriendo el checkout seguro…",
    createReservationFailed: "No se pudo crear la reserva.",
    updateFailed: "No se pudo actualizar.",
    ticketingUnavailable: "Ticketing no está disponible.",
    pricePer: (amount: string, unit: string) => `${amount} por ${unit}`,
    availableCount: (count: number) => `${count} disponibles`,
    issuedAt: (date: string) => `emitido el ${date}`,
    each: (amount: string) => `${amount} cada uno`,
    validUntil: (date: string) => `Reserva válida hasta ${date}`,
    validThrough: (date: string) => `válido hasta ${date}`,
    createdAt: (date: string) => `Creada el ${date}`,
  }),
  "he-IL": Object.freeze({
    static: Object.freeze({
      documentTitle: "כרטיסים · Morro Digital",
      mainTitle: "כרטיסים והזמנות",
      lead: "שמרו את המחיר הנוכחי, השלימו תשלום מאובטח והציגו את קוד ה-QR שמונפק לאחר אימות התשלום.",
      returnToMap: "← חזרה למפה",
      heroEyebrow: "חוויה במורו דה סאו פאולו",
      productTitle: "בחרו את החוויה שלכם",
      productLead: "בחרו חוויה, בדקו תאריך ומחיר והמשיכו להזמנה מאובטחת.",
      selectionStep: "1 · בחירה",
      selectionTitle: "תאריך וחוויה",
      quantityStep: "2 · כמות",
      selectionSummaryTitle: "הבחירה שלכם",
      ticketsLabel: "כרטיסים",
      summaryEyebrow: "סיכום",
      summaryTitle: "הערכת רכישה",
      inventoryPrice: "מחיר מלאי",
      unitPrice: "מחיר ליחידה",
      subtotalEstimate: "סכום ביניים משוער",
      authorityNote:
        "המחיר הסופי, המטבע, הזמינות ומצב התשלום מאומתים על ידי השרת בעת יצירת ההזמנה והתשלום.",
      identityStep: "3 · זיהוי",
      identityTitle: "פרטי ההזמנה",
      selectedExperience: "חוויה שנבחרה",
      afterPurchase: "לאחר הרכישה",
      myTickets: "הכרטיסים שלי",
      brightnessHint: "הגבירו את בהירות המסך כדי להקל על סריקת קוד הכניסה.",
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
    paymentConfirmedFinalizing:
      "התשלום אושר. הכרטיס נמצא בהפקה; רעננו בעוד רגע.",
    checkingPayment: "בודק אישור תשלום…",
    paymentConfirmedIssuing: "התשלום אושר. מפיק את הכרטיס…",
    paymentNotCompleted: "התשלום לא הושלם. ההזמנה תעודכן לפי המצב המאומת.",
    confirmationPending:
      "האישור עדיין ממתין. אפשר לסגור את הדף ולחזור מאוחר יותר.",
    selectExperienceFirst: "יש לבחור חוויה לפני ההזמנה.",
    fillFields: "יש למלא שם, דוא״ל וכמות תקינים.",
    creatingReservation: "יוצר הזמנה מאובטחת…",
    reservationCreated: "ההזמנה נוצרה. פותח תשלום מאובטח…",
    createReservationFailed: "לא ניתן ליצור את ההזמנה.",
    updateFailed: "לא ניתן לרענן את הנתונים.",
    ticketingUnavailable: "Ticketing אינו זמין.",
    pricePer: (amount: string, unit: string) => `${amount} לכל ${unit}`,
    availableCount: (count: number) => `${count} זמינים`,
    issuedAt: (date: string) => `הונפק ב-${date}`,
    each: (amount: string) => `${amount} לכל אחד`,
    validUntil: (date: string) => `ההזמנה תקפה עד ${date}`,
    validThrough: (date: string) => `תקף עד ${date}`,
    createdAt: (date: string) => `נוצרה ב-${date}`,
  }),
});

const EXPERIENCE_COPY: Readonly<
  Record<MorroDocumentLocale, ExperiencePresentationCopy>
> = Object.freeze({
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
    loadFailed:
      "Não foi possível carregar esta experiência agora. Tente novamente em instantes.",
    reserveNow: "Reservar agora",
    viewAvailability: "Ver disponibilidade",
    description: (kind: string, reference: string) =>
      `${kind} disponível no Morro Digital. ${reference}. Reserve com disponibilidade e preço confirmados pelo inventário oficial da plataforma.`,
    fallbackDescription: () =>
      "Reserve esta experiência pelo inventário oficial do Morro Digital.",
    availableCount: (count: number) => `${count} disponíveis`,
    salesWindow: (start: string, end: string) => `${start} até ${end}`,
    documentTitle: (label: string) => `${label} · Morro Digital`,
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
    loadFailed:
      "Could not load this experience right now. Please try again shortly.",
    reserveNow: "Reserve now",
    viewAvailability: "View availability",
    description: (kind: string, reference: string) =>
      `${kind} available on Morro Digital. ${reference}. Reserve with availability and pricing confirmed by the platform's official inventory.`,
    fallbackDescription: () =>
      "Reserve this experience through Morro Digital's official inventory.",
    availableCount: (count: number) => `${count} available`,
    salesWindow: (start: string, end: string) => `${start} to ${end}`,
    documentTitle: (label: string) => `${label} · Morro Digital`,
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
    loadFailed:
      "No se pudo cargar esta experiencia ahora. Inténtalo de nuevo en unos instantes.",
    reserveNow: "Reservar ahora",
    viewAvailability: "Ver disponibilidad",
    description: (kind: string, reference: string) =>
      `${kind} disponible en Morro Digital. ${reference}. Reserva con disponibilidad y precio confirmados por el inventario oficial de la plataforma.`,
    fallbackDescription: () =>
      "Reserva esta experiencia mediante el inventario oficial de Morro Digital.",
    availableCount: (count: number) => `${count} disponibles`,
    salesWindow: (start: string, end: string) => `${start} hasta ${end}`,
    documentTitle: (label: string) => `${label} · Morro Digital`,
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
    description: (kind: string, reference: string) =>
      `${kind} זמין ב-Morro Digital. ${reference}. ההזמנה מתבצעת לפי זמינות ומחיר המאומתים במלאי הרשמי של הפלטפורמה.`,
    fallbackDescription: () =>
      "הזמינו את החוויה דרך המלאי הרשמי של Morro Digital.",
    availableCount: (count: number) => `${count} זמינים`,
    salesWindow: (start: string, end: string) => `${start} עד ${end}`,
    documentTitle: (label: string) => `${label} · Morro Digital`,
  }),
});

export function commerceIntlLocale(
  locale?: string | null,
): MorroDocumentLocale {
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

function setText(document: Document, selector: string, value?: string): void {
  if (!value) return;
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.textContent = value;
}

function setAriaLabel(
  document: Document,
  selector: string,
  value?: string,
): void {
  if (!value) return;
  document
    .querySelector<HTMLElement>(selector)
    ?.setAttribute("aria-label", value);
}

function replaceLeadingLabelText(
  document: Document,
  inputSelector: string,
  value?: string,
  optionalValue?: string,
): void {
  if (!value) return;
  const input = document.querySelector<HTMLInputElement>(inputSelector);
  const label = input?.closest("label");
  if (!label) return;

  const textNode = Array.from(label.childNodes).find(
    (node) =>
      node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
  );
  if (textNode) textNode.textContent = `\n            ${value}\n            `;
  const optional = label.querySelector<HTMLElement>("span");
  if (optional && optionalValue) optional.textContent = optionalValue;
}

function applyTicketingStaticCopy(
  document: Document,
  copy: Readonly<Record<string, string>>,
): void {
  setText(document, "[data-ticketing-return]", copy.returnToMap);
  setText(document, ".ticketing-product-stage .eyebrow", copy.heroEyebrow);
  setText(document, "#ticketing-title", copy.productTitle);
  setText(document, "#product-lead", copy.productLead);
  setText(
    document,
    '.panel[aria-labelledby="offers-title"] > .section-heading .eyebrow',
    copy.selectionStep,
  );
  setText(document, "#offers-title", copy.selectionTitle);
  setText(document, "#refresh-button", copy.refresh);
  setText(document, ".selection-copy .eyebrow", copy.quantityStep);
  setText(document, "#selected-summary-title", copy.selectionSummaryTitle);
  setText(document, "#quantity-label", copy.ticketsLabel);
  setText(document, ".price-summary .eyebrow", copy.summaryEyebrow);
  setText(document, "#price-summary-title", copy.summaryTitle);
  setText(document, "#quote-badge", copy.inventoryPrice);
  setText(document, ".price-breakdown > div:nth-child(1) dt", copy.unitPrice);
  setText(document, ".price-breakdown > div:nth-child(2) dt", copy.quantity);
  setText(
    document,
    ".price-breakdown > div:nth-child(3) dt",
    copy.subtotalEstimate,
  );
  setText(document, ".authority-note", copy.authorityNote);
  setText(
    document,
    '.panel[aria-labelledby="reservation-title"] .eyebrow',
    copy.identityStep,
  );
  setText(document, "#reservation-title", copy.identityTitle);
  setText(document, ".wallet-heading .eyebrow", copy.afterPurchase);
  setText(document, "#my-tickets-title", copy.myTickets);
  setText(document, ".ticket-dialog-hint", copy.brightnessHint);

  const secureNotes = document.querySelectorAll<HTMLElement>(".secure-note");
  if (secureNotes[0] && copy.securePayment)
    secureNotes[0].textContent = copy.securePayment;
  if (secureNotes[1] && copy.qrAfterPayment)
    secureNotes[1].textContent = copy.qrAfterPayment;

  replaceLeadingLabelText(document, "#selected-offer", copy.selectedExperience);
  replaceLeadingLabelText(document, "#holder-name", copy.fullName);
  replaceLeadingLabelText(document, "#holder-email", copy.email);
  replaceLeadingLabelText(document, "#holder-phone", copy.phone, copy.optional);
  replaceLeadingLabelText(
    document,
    "#holder-document",
    copy.document,
    copy.optional,
  );

  const selectedOffer =
    document.querySelector<HTMLInputElement>("#selected-offer");
  if (selectedOffer && copy.experiencePlaceholder)
    selectedOffer.placeholder = copy.experiencePlaceholder;

  setText(document, "#reserve-button", copy.reserveAndPay);
  setAriaLabel(document, "#ticket-close", copy.close);
  setText(document, ".ticket-dialog > .eyebrow", copy.confirmedTicket);
  setText(document, "#ticket-title", copy.yourTicket);
  setAriaLabel(document, "#ticket-qr", copy.ticketQrLabel);
}

function applyExperienceStaticCopy(
  document: Document,
  copy: Readonly<Record<string, string>>,
): void {
  setText(document, ".commerce-detail-back", copy.back);
  setText(document, ".commerce-detail-loading-copy", copy.loading);
  setText(document, "#experience-kind", copy.experience);
  setText(document, "#experience-reserve", copy.reserveNow);
  setText(document, ".commerce-detail-actions .secondary", copy.viewAll);
  setAriaLabel(document, ".commerce-detail-meta", copy.infoAria);

  const meta = [
    ["#experience-start", copy.when],
    ["#experience-end", copy.until],
    ["#experience-price", copy.value],
    ["#experience-availability", copy.availability],
    ["#experience-sales-window", copy.sales],
  ] as const;
  for (const [selector, value] of meta) {
    const strong = document.querySelector<HTMLElement>(selector);
    const label = strong?.parentElement?.querySelector<HTMLElement>("span");
    if (label && value) label.textContent = value;
  }
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

  document
    .querySelectorAll<HTMLElement>("[data-commerce-i18n]")
    .forEach((element) => {
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

  if (surface === "ticketing") applyTicketingStaticCopy(document, copy);
  else applyExperienceStaticCopy(document, copy);

  if (copy.documentTitle) document.title = copy.documentTitle;
}
