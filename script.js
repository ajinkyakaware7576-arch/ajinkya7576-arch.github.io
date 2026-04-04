const toggle = document.getElementById("themeToggle");
const root = document.getElementById("root");

toggle.addEventListener("click", () => {
  root.classList.toggle("dark");

  if (root.classList.contains("dark")) {
    toggle.innerText = "☀️";
  } else {
    toggle.innerText = "🌙";
  }
});
