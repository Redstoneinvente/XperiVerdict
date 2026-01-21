const state = {
  all: [],
  q: '',
  category: 'All',
  tag: '',
  sort: 'featured'
};

const els = {
  container: document.getElementById('articlesContainer'),
  empty: document.getElementById('emptyState'),
  count: document.getElementById('resultsCount'),
  search: document.getElementById('articleSearch'),
  sort: document.getElementById('sortSelect'),
  tag: document.getElementById('tagSelect'),
  chips: document.getElementById('categoryChips'),
  reset: document.getElementById('clearFilters')
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

function normalize(s) {
  return String(s ?? '').toLowerCase().trim();
}


// function renderCategoryChips(categories) {
//   els.chips.innerHTML = categories.map(c => `
//     <div class="chip ${c === state.category ? 'active' : ''}" data-cat="${escapeHtml(c)}">
//       ${escapeHtml(c)}
//     </div>
//   `).join('');

//   els.chips.querySelectorAll('.chip').forEach(chip => {
//     chip.addEventListener('click', () => {
//       state.category = chip.dataset.cat;
//       els.chips.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
//       chip.classList.add('active');
//       render();
//     });
//   });
// }

const clearBtn = document.getElementById('searchClear');

function syncClearButton() {
  if (!clearBtn) return;
  clearBtn.style.visibility = state.q ? 'visible' : 'hidden';
}

els.search.addEventListener('input', (e) => {
  state.q = e.target.value;
  syncClearButton();
  render();
});

if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    state.q = '';
    els.search.value = '';
    syncClearButton();
    els.search.focus();
    render();
  });
  syncClearButton();
}


function buildCategories(items) {
  const set = new Set(['All']);
  items.forEach(a => {
    const c = a.category || a.categories?.[0];
    if (c) set.add(c);
  });
  return [...set];
}

function buildTags(items) {
  const set = new Set();
  items.forEach(a => (a.tags || []).forEach(t => set.add(t)));
  return [...set].sort((a,b) => a.localeCompare(b));
}

function renderCategoryChips(categories) {
  els.chips.innerHTML = categories.map((c, idx) => `
    <div class="chip ${c === state.category ? 'active' : ''}" data-cat="${escapeHtml(c)}">
      ${escapeHtml(c)}
    </div>
  `).join('');

  els.chips.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      state.category = chip.dataset.cat;
      // update active
      els.chips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      render();
    });
  });
}

function renderTagOptions(tags) {
  // preserve first "All tags"
  const current = state.tag;
  els.tag.innerHTML = `<option value="">All tags</option>` + tags.map(t => `
    <option value="${escapeHtml(t)}">${escapeHtml(t)}</option>
  `).join('');
  els.tag.value = current || '';
}

function matchesArticle(a) {
  // Search
  const q = normalize(state.q);
  if (q) {
    const hay = normalize([
      a.title, a.description, a.category,
      ...(a.tags || [])
    ].join(' '));
    if (!hay.includes(q)) return false;
  }

  // Category
  if (state.category && state.category !== 'All') {
    const cat = a.category || a.categories?.[0] || '';
    if (cat !== state.category) return false;
  }

  // Tag
  if (state.tag) {
    if (!Array.isArray(a.tags) || !a.tags.includes(state.tag)) return false;
  }

  return true;
}

function sortArticles(items) {
  const sorted = [...items];

  switch (state.sort) {
    case 'featured':
      sorted.sort((a, b) => {
        const af = !!a.featured, bf = !!b.featured;
        if (af !== bf) return af ? -1 : 1;
        return new Date(b.date || 0) - new Date(a.date || 0);
      });
      break;

    case 'newest':
      sorted.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      break;

    case 'oldest':
      sorted.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
      break;

    case 'az':
      sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      break;
  }

  return sorted;
}

function formatDateISO(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function renderList(items) {
  els.container.innerHTML = items.map(a => `
    <a href="${escapeHtml(a.url)}" class="m3-card article-card" style="margin:0;">
      <div class="article-row">
        <div class="article-icon">
          <span class="material-symbols-rounded">${escapeHtml(a.icon || 'menu_book')}</span>
        </div>

        <div style="flex:1; min-width:0;">
          <div class="article-title">${escapeHtml(a.title)}</div>
          <div class="article-desc">${escapeHtml(a.description || '')}</div>

          <div class="article-submeta">
            ${(a.category || a.categories?.[0]) ? `
              <span class="article-pill">${escapeHtml(a.category || a.categories?.[0])}</span>
            ` : ''}

            ${a.date ? `
              <span class="article-pill">${escapeHtml(formatDateISO(a.date))}</span>
            ` : ''}

            ${(a.tags || []).slice(0, 3).map(t => `
              <span class="article-pill">${escapeHtml(t)}</span>
            `).join('')}
          </div>
        </div>

        <span class="material-symbols-rounded" style="color:var(--m3-p); flex-shrink:0;">chevron_right</span>
      </div>
    </a>
  `).join('');
}

function render() {
  const filtered = state.all.filter(matchesArticle);
  const sorted = sortArticles(filtered);

  els.count.textContent = `${sorted.length} article${sorted.length === 1 ? '' : 's'} found`;

  if (sorted.length === 0) {
    els.container.innerHTML = '';
    els.empty.style.display = 'block';
  } else {
    els.empty.style.display = 'none';
    renderList(sorted);
  }
}

async function init() {
  els.count.textContent = 'Loading…';

  const res = await fetch('./articles.json', { cache: 'no-store' });
  const data = await res.json();

  // Expected format: { articles: [...] }
  state.all = Array.isArray(data.articles) ? data.articles : [];

  // Build dynamic UI options
  const categories = buildCategories(state.all);
  const tags = buildTags(state.all);

  renderCategoryChips(categories);
  renderTagOptions(tags);

  // Wire controls
  els.search.addEventListener('input', (e) => {
    state.q = e.target.value;
    render();
  });

  els.sort.addEventListener('change', (e) => {
    state.sort = e.target.value;
    render();
  });

  els.tag.addEventListener('change', (e) => {
    state.tag = e.target.value;
    render();
  });

  els.reset.addEventListener('click', () => {
    state.q = '';
    state.sort = 'featured';
    state.tag = '';
    state.category = 'All';

    els.search.value = '';
    els.sort.value = state.sort;
    els.tag.value = '';
    // chips reset
    els.chips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    els.chips.querySelector('.chip[data-cat="All"]')?.classList.add('active');

    render();
  });

  // Defaults
  els.sort.value = state.sort;
  render();
}

init().catch(err => {
  console.warn('[Articles] init failed:', err);
  els.count.textContent = 'Failed to load articles';
  els.container.innerHTML = '';
  els.empty.style.display = 'block';
});
