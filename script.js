const btn = document.getElementById('themeToggle');
const root = document.getElementById('root');

btn.addEventListener('click', () => {
  root.classList.toggle('dark');
  btn.textContent = root.classList.contains('dark') ? '☀️' : '🌙';
});
