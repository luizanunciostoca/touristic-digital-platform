const marketplacePath = "/tickets.html";

export interface HomeCommerceController {
  destroy(): void;
}

/**
 * Adds Commerce as an independent Assistant CTA without joining the audited V1
 * category button contract. It deliberately does not emit assistant messages,
 * mutate category state, touch map markers or intercept navigation.
 */
export function installHomeCommerce({
  document,
}: {
  readonly document: Document;
}): HomeCommerceController {
  const options = document.querySelector<HTMLElement>(
    "#assistant-messages .assistant-options",
  );
  if (!options) return Object.freeze({ destroy() {} });

  const existing = document.getElementById("assistant-commerce-cta");
  if (existing) {
    return Object.freeze({
      destroy(): void {
        existing.remove();
      },
    });
  }

  const cta = document.createElement("a");
  cta.id = "assistant-commerce-cta";
  cta.className = "assistant-commerce-cta";
  cta.href = marketplacePath;
  cta.setAttribute("aria-label", "Abrir ingressos, passeios e experiências");
  cta.innerHTML =
    '<span aria-hidden="true">🎟️</span><span>Ingressos & passeios</span>';
  options.append(cta);

  return Object.freeze({
    destroy(): void {
      cta.remove();
    },
  });
}
