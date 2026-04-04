const root = document.getElementById('root');
const themeBtn = document.getElementById('themeToggle');
const searchInput = document.getElementById('searchInput');
const grid = document.getElementById('grid');
const noResults = document.getElementById('no-results');
const noResultQuery = document.getElementById('noResultQuery');
const sectionTitle = document.getElementById('sectionTitle');
const resultCount = document.getElementById('resultCount');
const sortSelect = document.getElementById('sortSelect');
const filterBtns = document.querySelectorAll('.f-btn');
const allCards = Array.from(document.querySelectorAll('.card'));
const favCountEl = document.getElementById('favCount');

let favSet = new Set();
let activeFilter = 'all';
let activeSort = 'default';
let activeSearch = '';

// THEME TOGGLE
themeBtn.addEventListener('click', () => {
  root.classList.toggle('dark');
  document.body.style.background = root.classList.contains('dark') ? '#111010' : '#f7f5f2';
  themeBtn.textContent = root.classList.contains('dark') ? '☀️' : '🌙';
});

// FAVOURITE SYNC — keeps heart button + action button + counter in sync
function syncFav(item, on) {
  if (on) { favSet.add(item); } else { favSet.delete(item); }
  favCountEl.textContent = favSet.size;

  document.querySelectorAll('.fav-btn[data-item="' + item + '"]').forEach(b => {
    b.classList.toggle('active', on);
    b.textContent = on ? '♥' : '♡';
  });

  document.querySelectorAll('.fav-action-btn[data-item="' + item + '"]').forEach(b => {
    b.classList.toggle('faved', on);
    b.textContent = on ? '♥ Saved' : '♡ Save to Favourites';
  });
}

// ATTACH FAVOURITE LISTENERS
document.querySelectorAll('.fav-btn, .fav-action-btn').forEach(btn => {
  btn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const item = btn.dataset.item;
    syncFav(item, !favSet.has(item));
  });
});

// FILTER BUTTONS
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    applyAll();
  });
});

// SORT
sortSelect.addEventListener('change', () => {
  activeSort = sortSelect.value;
  applyAll();
});

// SEARCH
searchInput.addEventListener('input', () => {
  activeSearch = searchInput.value.trim().toLowerCase();
  applyAll();
});

// MAIN FUNCTION — filters, searches, sorts all at once
function applyAll() {
  let visible = [];

  allCards.forEach(c => {
    const name = c.dataset.name || '';
    const partner = c.dataset.partner || '';
    const tags = c.dataset.tags || '';
    const full = name + ' ' + partner + ' ' + tags;

    const matchFilter = activeFilter === 'all' || tags.includes(activeFilter) || partner === activeFilter;
    const matchSearch = !activeSearch || full.includes(activeSearch);

    if (matchFilter && matchSearch) {
      c.classList.remove('hidden');
      visible.push(c);
    } else {
      c.classList.add('hidden');
    }
  });

  // SORT visible cards
  if (activeSort === 'price-asc') visible.sort((a, b) => +a.dataset.price - +b.dataset.price);
  else if (activeSort === 'price-desc') visible.sort((a, b) => +b.dataset.price - +a.dataset.price);
  else if (activeSort === 'name') visible.sort((a, b) => a.dataset.name.localeCompare(b.dataset.name));

  visible.forEach((c, i) => { c.style.order = i; });
  allCards.filter(c => c.classList.contains('hidden')).forEach(c => { c.style.order = 999; });

  // SHOW / HIDE no-results state
  if (visible.length === 0) {
    grid.style.display = 'none';
    noResultQuery.textContent = activeSearch || activeFilter;
    noResults.style.display = 'flex';
    sectionTitle.textContent = 'No results found';
    resultCount.textContent = '';
  } else {
    grid.style.display = 'grid';
    noResults.style.display = 'none';
    sectionTitle.textContent = activeSearch
      ? 'Results for "' + searchInput.value.trim() + '"'
      : activeFilter === 'all'
        ? 'Top Picks This Week'
        : activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1);
    resultCount.textContent = visible.length + ' item' + (visible.length !== 1 ? 's' : '');
  }
}

// RUN ONCE ON LOAD
applyAll();
