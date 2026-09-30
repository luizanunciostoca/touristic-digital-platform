import { decideSavedIntegration } from "../src/saved-options.mjs";
const $ = (id) => document.getElementById(id);
let choice = "A";
function sync() {
  document.documentElement.dataset.p07HeaderApproved = $("header-preview")
    .checked
    ? "true"
    : "false";
  const active = decideSavedIntegration(choice, {
    explicitUserDecision: false,
  });
  $("screen").dataset.savedPending = active.state;
  $("assistant-copy").textContent =
    choice === "A"
      ? "Posso ajudar a explorar Morro. Abra Salvos sem sair da conversa."
      : "Posso ajudar a explorar Morro. Salvos abre em um painel da Home.";
  $("assistant-saved").classList.add("hidden");
  $("home-saved-panel").classList.add("hidden");
}
$("saved-option").addEventListener("change", (e) => {
  choice = e.target.value;
  sync();
});
$("saved-button").addEventListener("click", () => {
  if (choice === "A") {
    $("assistant-saved").classList.toggle("hidden");
    $("home-saved-panel").classList.add("hidden");
  } else {
    $("home-saved-panel").classList.toggle("hidden");
    $("assistant-saved").classList.add("hidden");
  }
});
$("close-saved").addEventListener("click", () => {
  $("home-saved-panel").classList.add("hidden");
});
$("header-preview").addEventListener("change", sync);
$("reset").addEventListener("click", () => {
  choice = "A";
  $("saved-option").value = "A";
  $("header-preview").checked = false;
  sync();
});
sync();
