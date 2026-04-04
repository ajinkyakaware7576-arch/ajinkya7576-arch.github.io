// DARK MODE
const toggle = document.getElementById("themeToggle");
const root = document.getElementById("root");

toggle.addEventListener("click", () => {
  root.classList.toggle("dark");
});

// SEARCH
const input = document.querySelector(".search-wrap input");
const cards = document.querySelectorAll(".card");
const noResults = document.getElementById("noResults");

input.addEventListener("input", () => {
  const value = input.value.toLowerCase();
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
