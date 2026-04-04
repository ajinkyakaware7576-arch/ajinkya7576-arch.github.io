const toggle = document.getElementById("themeToggle");
const root = document.getElementById("root");

toggle.addEventListener("click", () => {
  root.classList.toggle("dark");

  if (root.classList.contains("dark")) {
    toggle.innerText = "☀️";
  } else {
    toggle.innerText = "🌙";
  }
  const searchInput = document.querySelector(".search-wrap input");
const cards = document.querySelectorAll(".card");

searchInput.addEventListener("input", () => {
  const value = searchInput.value.toLowerCase();

  cards.forEach(card => {
    const text = card.innerText.toLowerCase();

    if (text.includes(value)) {
      card.style.display = "flex";
    } else {
      card.style.display = "none";
    }
    const noResults = document.getElementById("noResults");

searchInput.addEventListener("input", () => {
  const value = searchInput.value.toLowerCase();
  let visible = 0;

  cards.forEach(card => {
    const text = card.innerText.toLowerCase();

    if (text.includes(value)) {
      card.style.display = "flex";
      visible++;
    } else {
      card.style.display = "none";
    }
  });

  noResults.style.display = visible === 0 ? "block" : "none";
});


