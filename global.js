console.log('IT’S ALIVE!');

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

const BASE_PATH =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? '/'
    : '/portfolio/';

const pages = [
  { url: '', title: 'Home' },
  { url: 'projects/', title: 'Projects' },
  { url: 'cv/', title: 'CV' },
  { url: 'contact/', title: 'Contact' },
  { url: 'https://github.com/mzanbagh-ucsd', title: 'GitHub' },
];

const siteHeader = document.createElement('div');
siteHeader.className = 'site-header';

const nav = document.createElement('nav');

for (const page of pages) {
  const url = page.url.startsWith('http')
    ? page.url
    : BASE_PATH + page.url;

  const link = document.createElement('a');
  link.href = url;
  link.textContent = page.title;

  if (link.host === location.host && link.pathname === location.pathname) {
    link.classList.add('current');
  }

  if (link.host !== location.host) {
    link.target = '_blank';
  }

  nav.append(link);
}

siteHeader.append(nav);

const label = document.createElement('label');
label.className = 'color-scheme';
label.textContent = 'Theme: ';

const select = document.createElement('select');

for (const [value, text] of [
  ['light dark', 'Automatic'],
  ['light', 'Light'],
  ['dark', 'Dark'],
]) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  select.append(option);
}

label.append(select);
siteHeader.append(label);
document.body.prepend(siteHeader);

function setTheme(theme) {
  document.documentElement.style.colorScheme = theme;
  select.value = theme;
  localStorage.colorScheme = theme;
}

setTheme(localStorage.colorScheme || 'light dark');

select.addEventListener('input', () => {
  setTheme(select.value);
});

const contactForm = document.querySelector('.contact-form');

contactForm?.addEventListener('submit', (event) => {
  event.preventDefault();

  const formData = new FormData(contactForm);
  const parameters = [...formData]
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('&');

  location.href = `${contactForm.action}?${parameters}`;
});
