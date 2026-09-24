export type ConversationVoiceLanguage = "pt" | "en" | "es" | "he";

export interface ConversationVoiceComposerInput {
  readonly messageKey: string;
  readonly language: ConversationVoiceLanguage;
  readonly fallback: string;
  readonly category?: string | null;
  readonly place?: string | null;
  readonly count?: number | null;
}

function valueOr(value: string | null | undefined, fallback: string): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

export function composeConversationVoice(
  input: ConversationVoiceComposerInput,
): string {
  const category = valueOr(
    input.category,
    input.language === "pt" ? "essa categoria" : "this category",
  );
  const place = valueOr(
    input.place,
    input.language === "pt" ? "esse lugar" : "this place",
  );
  const count = Number.isFinite(input.count)
    ? Math.max(0, Math.trunc(Number(input.count)))
    : 0;

  const byLanguage: Readonly<
    Record<ConversationVoiceLanguage, Readonly<Record<string, string>>>
  > = {
    pt: {
      category_selected: `${category}. Quer filtrar ou ver todas?`,
      results_found: `Encontrei ${count} opções. Quer escolher uma?`,
      no_results: "Não encontrei resultados. Tente ajustar os filtros.",
      place_selected: `Essa é ${place}. Posso mostrar detalhes ou preparar uma rota.`,
      action_available: `O que você quer fazer em ${place}?`,
      navigation_starting: `Preparando a rota para ${place}.`,
      navigation_active: `Estamos a caminho de ${place}.`,
      payment_started: "Pagamento iniciado. Vou acompanhar a confirmação.",
      payment_approved: "Pagamento confirmado. Compra concluída.",
      payment_declined:
        "O pagamento não foi confirmado. Você pode tentar novamente.",
      timeout: "Isso demorou mais que o esperado. Você pode tentar novamente.",
      offline: "A conexão caiu. O que já carregou continua disponível.",
      online_restored: "Conexão de volta. Podemos continuar.",
      provider_error:
        "Esse serviço está indisponível agora. Tente novamente em instantes.",
      geolocation_allowed:
        "Localização ativada. Agora consigo usar sua posição.",
      geolocation_denied:
        "Tudo bem. Você pode continuar sem compartilhar sua localização.",
    },
    en: {
      category_selected: `${category}. Would you like to filter or see all options?`,
      results_found: `I found ${count} options. Want to choose one?`,
      no_results: "I couldn't find results. Try adjusting the filters.",
      place_selected: `This is ${place}. I can show details or prepare a route.`,
      action_available: `What would you like to do at ${place}?`,
      navigation_starting: `Preparing the route to ${place}.`,
      navigation_active: `We're on the way to ${place}.`,
      payment_started: "Payment started. I'll follow the confirmation.",
      payment_approved: "Payment confirmed. Your purchase is complete.",
      payment_declined: "Payment wasn't confirmed. You can try again.",
      timeout: "That took longer than expected. You can try again.",
      offline:
        "The connection dropped. What is already loaded remains available.",
      online_restored: "Connection restored. We can continue.",
      provider_error:
        "That service is unavailable right now. Try again shortly.",
      geolocation_allowed: "Location is on. I can now use your position.",
      geolocation_denied:
        "That's okay. You can continue without sharing your location.",
    },
    es: {
      category_selected: `${category}. ¿Quieres filtrar o ver todas las opciones?`,
      results_found: `Encontré ${count} opciones. ¿Quieres elegir una?`,
      no_results: "No encontré resultados. Prueba ajustando los filtros.",
      place_selected: `Este es ${place}. Puedo mostrar detalles o preparar una ruta.`,
      action_available: `¿Qué quieres hacer en ${place}?`,
      navigation_starting: `Preparando la ruta a ${place}.`,
      navigation_active: `Vamos camino a ${place}.`,
      payment_started: "El pago comenzó. Voy a seguir la confirmación.",
      payment_approved: "Pago confirmado. La compra está completa.",
      payment_declined:
        "El pago no fue confirmado. Puedes intentarlo de nuevo.",
      timeout: "Esto tardó más de lo esperado. Puedes intentarlo de nuevo.",
      offline: "Se perdió la conexión. Lo que ya cargó sigue disponible.",
      online_restored: "La conexión volvió. Podemos continuar.",
      provider_error:
        "Ese servicio no está disponible ahora. Inténtalo en unos instantes.",
      geolocation_allowed: "Ubicación activada. Ahora puedo usar tu posición.",
      geolocation_denied:
        "Está bien. Puedes continuar sin compartir tu ubicación.",
    },
    he: {
      category_selected: `${category}. לסנן או לראות את כל האפשרויות?`,
      results_found: `מצאתי ${count} אפשרויות. לבחור אחת?`,
      no_results: "לא מצאתי תוצאות. אפשר לשנות את המסננים.",
      place_selected: `זה ${place}. אפשר לראות פרטים או להכין מסלול.`,
      action_available: `מה תרצה לעשות ב-${place}?`,
      navigation_starting: `מכין מסלול אל ${place}.`,
      navigation_active: `אנחנו בדרך אל ${place}.`,
      payment_started: "התשלום התחיל. אעקוב אחרי האישור.",
      payment_approved: "התשלום אושר. הרכישה הושלמה.",
      payment_declined: "התשלום לא אושר. אפשר לנסות שוב.",
      timeout: "זה לקח יותר מהצפוי. אפשר לנסות שוב.",
      offline: "החיבור נותק. מה שכבר נטען עדיין זמין.",
      online_restored: "החיבור חזר. אפשר להמשיך.",
      provider_error: "השירות לא זמין כרגע. נסה שוב בעוד רגע.",
      geolocation_allowed: "המיקום הופעל. עכשיו אפשר להשתמש במיקום שלך.",
      geolocation_denied: "זה בסדר. אפשר להמשיך בלי לשתף מיקום.",
    },
  };

  return byLanguage[input.language][input.messageKey] ?? input.fallback;
}
