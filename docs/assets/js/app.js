const currentYear = new Date().getFullYear();
const yearEl = document.getElementById("current-year");
if (yearEl) {
  yearEl.textContent = currentYear.toString();
}
