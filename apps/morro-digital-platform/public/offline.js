(() => {
  const copy = {
    pt: {
      lang: "pt-BR",
      title: "Conteúdo offline",
      description:
        "Apenas conteúdo público e arquivos estáticos previamente salvos podem estar disponíveis offline. Pagamentos, reservas e ingressos exigem conexão e confirmação do servidor.",
      offline:
        "Sem conexão de rede. Reconecte-se e tente abrir o Morro Digital novamente.",
      online:
        "O dispositivo indica uma conexão de rede. Tente abrir o Morro Digital para verificar a disponibilidade do serviço.",
      retry: "Tentar abrir Morro Digital",
    },
    en: {
      lang: "en-US",
      title: "Offline content",
      description:
        "Only previously saved public content and static files may be available offline. Payments, reservations and tickets require a connection and server confirmation.",
      offline:
        "No network connection. Reconnect and try opening Morro Digital again.",
      online:
        "Your device reports a network connection. Try opening Morro Digital to check service availability.",
      retry: "Try opening Morro Digital",
    },
    es: {
      lang: "es-ES",
      title: "Contenido sin conexión",
      description:
        "Solo el contenido público y los archivos estáticos guardados previamente pueden estar disponibles sin conexión. Los pagos, las reservas y las entradas requieren conexión y confirmación del servidor.",
      offline:
        "Sin conexión de red. Vuelve a conectarte e intenta abrir Morro Digital de nuevo.",
      online:
        "El dispositivo indica una conexión de red. Intenta abrir Morro Digital para comprobar la disponibilidad del servicio.",
      retry: "Intentar abrir Morro Digital",
    },
    he: {
      lang: "he-IL",
      title: "תוכן ללא חיבור לרשת",
      description:
        "ייתכן שרק תוכן ציבורי וקבצים סטטיים שנשמרו מראש יהיו זמינים ללא חיבור לרשת. תשלומים, הזמנות וכרטיסים דורשים חיבור ואישור מהשרת.",
      offline:
        "אין חיבור לרשת. יש להתחבר מחדש ולנסות לפתוח שוב את Morro Digital.",
      online:
        "המכשיר מציג חיבור לרשת. יש לנסות לפתוח את Morro Digital כדי לבדוק אם השירות זמין.",
      retry: "לנסות לפתוח את Morro Digital",
    },
  };
  function render() {
    let override = "";
    try {
      override = localStorage.getItem("morro-digital-language") || "";
    } catch {
      // Keep the destination default when preference storage is unavailable.
    }
    const language = override
      .trim()
      .toLowerCase()
      .replaceAll("_", "-")
      .split("-")[0];
    const key = language === "iw" ? "he" : language;
    const text = Object.hasOwn(copy, key) ? copy[key] : copy.pt;
    document.documentElement.lang = text.lang;
    document.documentElement.dir = text.lang === "he-IL" ? "rtl" : "ltr";
    document.title = `Morro Digital — ${text.title}`;
    document.getElementById("offline-title").textContent = text.title;
    document.getElementById("offline-description").textContent =
      text.description;
    document.getElementById("offline-retry").textContent = text.retry;
    document.getElementById("offline-status").textContent = navigator.onLine
      ? text.online
      : text.offline;
  }
  document
    .getElementById("offline-retry")
    .addEventListener("click", () => location.assign("/"));
  window.addEventListener("online", render);
  window.addEventListener("offline", render);
  window.addEventListener("storage", (event) => {
    if (event.key === "morro-digital-language" || event.key === null) render();
  });
  render();
})();
