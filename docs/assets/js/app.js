const currentYear = new Date().getFullYear();
const yearEl = document.getElementById("current-year");
if (yearEl) {
  yearEl.textContent = currentYear.toString();
}

// Auto-hide Header on Scroll
let lastScrollY = window.scrollY;
const header = document.querySelector('header');

if (header) {
  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY;
    
    if (currentScrollY > lastScrollY && currentScrollY > 100) {
      // Scrolling down & past top
      header.classList.add('header-hidden');
    } else {
      // Scrolling up
      header.classList.remove('header-hidden');
    }
    
    lastScrollY = currentScrollY;
  });
}
