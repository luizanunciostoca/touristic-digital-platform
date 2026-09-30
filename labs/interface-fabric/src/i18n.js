
export const SUPPORTED_LOCALES = ["pt-BR", "en", "es", "he"];
export const messages = {
  "pt-BR": {continue:"Continuar",back:"Voltar",retry:"Tentar novamente",save:"Salvar",search:"Buscar",openMenu:"Abrir menu",state:"Estado",theme:"Tema",language:"Idioma",prototype:"Fabric isolada",details:"Detalhes",next:"Próxima interface"},
  en: {continue:"Continue",back:"Back",retry:"Try again",save:"Save",search:"Search",openMenu:"Open menu",state:"State",theme:"Theme",language:"Language",prototype:"Isolated Fabric",details:"Details",next:"Next interface"},
  es: {continue:"Continuar",back:"Volver",retry:"Reintentar",save:"Guardar",search:"Buscar",openMenu:"Abrir menú",state:"Estado",theme:"Tema",language:"Idioma",prototype:"Fabric aislada",details:"Detalles",next:"Siguiente interfaz"},
  he: {continue:"המשך",back:"חזרה",retry:"נסה שוב",save:"שמירה",search:"חיפוש",openMenu:"פתיחת תפריט",state:"מצב",theme:"ערכת נושא",language:"שפה",prototype:"Fabric מבודד",details:"פרטים",next:"הממשק הבא"}
};
export function normalizeLocale(value){
  if(!value) return null;
  const v=String(value).replace("_","-").toLowerCase();
  if(v.startsWith("pt")) return "pt-BR";
  if(v.startsWith("en")) return "en";
  if(v.startsWith("es")) return "es";
  if(v.startsWith("he") || v.startsWith("iw")) return "he";
  return null;
}
export function resolveLocale({manualOverride=null,browserLocale=null,destinationFallback="pt-BR",safeFallback="pt-BR"}={}){
  return normalizeLocale(manualOverride) || normalizeLocale(browserLocale) || normalizeLocale(destinationFallback) || normalizeLocale(safeFallback) || "pt-BR";
}
export function t(locale,key){ return messages[locale]?.[key] ?? messages["pt-BR"][key] ?? key; }
export function applyLocale(locale){
  document.documentElement.lang=locale;
  document.documentElement.dir=locale==="he"?"rtl":"ltr";
}
