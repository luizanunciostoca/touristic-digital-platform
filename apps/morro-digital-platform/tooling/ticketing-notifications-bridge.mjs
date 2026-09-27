const notificationChannels = Object.freeze(["email", "push", "sms"]);

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function allowedTicketChannels(preferences) {
  const channels = new Set();
  for (const preference of Array.isArray(preferences) ? preferences : []) {
    if (
      preference?.topic === "ticket" &&
      preference?.allowed === true &&
      notificationChannels.includes(preference?.channel)
    ) {
      channels.add(preference.channel);
    }
  }
  return Object.freeze([...channels]);
}

export function createTicketingNotificationsBridge({
  notificationsRuntime,
  destinationService,
} = {}) {
  return Object.freeze({
    async ticketIssued(input = {}) {
      if (
        typeof notificationsRuntime?.listPreferences !== "function" ||
        typeof notificationsRuntime?.enqueueEvent !== "function" ||
        typeof destinationService?.read !== "function"
      ) {
        return "unavailable";
      }

      const tenantId = normalizedText(input.tenantId);
      const destinationId = normalizedText(input.destinationId);
      const recipientReference = normalizedText(input.recipientReference);
      const ticketReference = normalizedText(input.ticketReference);
      const experienceName = normalizedText(input.experienceName);
      const occurredAt = normalizedText(input.occurredAt);

      if (
        !tenantId ||
        !destinationId ||
        !recipientReference ||
        !ticketReference ||
        !experienceName ||
        !occurredAt
      ) {
        return "rejected";
      }

      const destination = await destinationService.read(destinationId);
      if (destination?.status !== "found") return "unavailable";

      const locale = normalizedText(destination.data?.locale);
      if (!locale) return "unavailable";

      const preferences = await notificationsRuntime.listPreferences({
        destinationId,
        recipientReference,
      });
      const channels = allowedTicketChannels(preferences);

      if (channels.length === 0) return "suppressed";
      if (channels.length !== 1) return "ambiguous_preferences";

      return notificationsRuntime.enqueueEvent({
        tenantId,
        event: Object.freeze({
          type: "ticket_issued",
          eventId: `ticket-issued:${ticketReference}`,
          destinationId,
          recipientReference,
          locale,
          occurredAt,
          channel: channels[0],
          ticketReference,
          experienceName,
        }),
      });
    },
  });
}
