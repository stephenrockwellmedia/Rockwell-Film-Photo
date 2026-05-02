// ─────────────────────────────────────────────────────────────
// VENUE LIST — edit this array to add/remove venues.
// Image URLs should point to your Cloudflare R2 bucket.
// Compress images first (Squoosh.app → WebP, ~1600px wide,
// quality ~75) before uploading to R2.
// Leave `image` as empty string to show "Photo coming soon".
// ─────────────────────────────────────────────────────────────

const R2 = 'https://pub-c5287f1b50564f8680b9e8721ae173aa.r2.dev/venues/';

const VENUES = [
  {
    name: 'Oglebay Resort',
    location: 'Wheeling, WV',
    region: 'WV',
    image: '', // e.g. R2 + 'oglebay.webp'
    desc: 'Sweeping mountain views, glass-walled ballrooms, and timeless estate grounds.'
  },
  {
    name: 'The Pennsylvanian',
    location: 'Pittsburgh, PA',
    region: 'PA',
    image: '',
    desc: 'Historic grandeur in the heart of the city — soaring marble columns and gilded ceilings.'
  },
  {
    name: 'Greystone Fields',
    location: 'Gibsonia, PA',
    region: 'PA',
    image: '',
    desc: 'A romantic countryside barn venue with rolling fields and golden-hour light.'
  },
  {
    name: 'Nemacolin',
    location: 'Farmington, PA',
    region: 'PA',
    image: '',
    desc: 'Five-star luxury resort weddings — château architecture meets Laurel Highland forests.'
  },
  {
    name: 'The Pittsburgh Field Club',
    location: 'Fox Chapel, PA',
    region: 'PA',
    image: '',
    desc: 'Classic country club elegance with manicured greens and an iconic clubhouse.'
  },
  {
    name: 'Stonehouse Estate',
    location: 'Hookstown, PA',
    region: 'PA',
    image: '',
    desc: 'A storybook stone manor surrounded by gardens, vineyards, and panoramic terraces.'
  }
];

// ─────────────────────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────────────────────

const grid = document.getElementById('venueGrid');
const empty = document.getElementById('venueEmpty');

function render(venues) {
  grid.innerHTML = '';
  if (!venues.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  venues.forEach((v, i) => {
    const card = document.createElement('article');
    card.className = 'v-card';
    card.style.animationDelay = (i * 0.06) + 's';

    const imgClass = v.image ? 'v-card-img' : 'v-card-img placeholder';
    const imgStyle = v.image ? `style="background-image:url('${v.image}')"` : '';

    card.innerHTML = `
      <div class="${imgClass}" ${imgStyle}></div>
      <div class="v-card-body">
        <div class="v-card-region">${v.location.split(',').pop().trim()}</div>
        <h3 class="v-card-name">${v.name}</h3>
        <div class="v-card-loc">${v.location}</div>
        <p class="v-card-desc">${v.desc}</p>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ─────────────────────────────────────────────────────────────
// Filter
// ─────────────────────────────────────────────────────────────

const chips = document.querySelectorAll('.v-chip');
chips.forEach(chip => {
  chip.addEventListener('click', () => {
    chips.forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const region = chip.dataset.region;
    const filtered = region === 'all'
      ? VENUES
      : VENUES.filter(v => v.region === region);
    render(filtered);
  });
});

render(VENUES);
