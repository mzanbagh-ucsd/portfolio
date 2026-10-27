console.log('IT’S ALIVE!');

export async function fetchJSON(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch JSON: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching or parsing JSON data:', error);
    return [];
  }
}

export function renderProjects(projects, containerElement, headingLevel = 'h2') {
  if (!(containerElement instanceof Element)) {
    console.error('renderProjects requires a valid container element.');
    return;
  }

  const validHeadingLevels = ['h2', 'h3', 'h4', 'h5', 'h6'];
  const headingTag = validHeadingLevels.includes(headingLevel) ? headingLevel : 'h2';
  containerElement.replaceChildren();

  if (!Array.isArray(projects) || projects.length === 0) {
    containerElement.textContent = 'No projects to display yet.';
    return;
  }

  for (const project of projects) {
    const article = document.createElement('article');
    article.className = 'project-card';

    const content = project.url ? document.createElement('a') : article;
    if (project.url) {
      content.className = 'project-card-link';
      content.href = project.url.startsWith('http') ? project.url : BASE_PATH + project.url;
      if (content.host !== location.host) {
        content.target = '_blank';
        content.rel = 'noopener noreferrer';
      }
    }

    const title = document.createElement(headingTag);
    title.textContent = project.title || 'Untitled project';
    content.append(title);

    if (project.image) {
      const image = document.createElement('img');
      image.src = project.image;
      image.alt = project.title ? `Image for ${project.title}` : 'Project image';
      content.append(image);
    }

    const description = document.createElement('p');
    description.textContent = project.description || '';
    content.append(description);

    if (project.year) {
      const year = document.createElement('p');
      year.className = 'project-year';
      year.textContent = String(project.year);
      content.append(year);
    }

    if (project.url) article.append(content);
    containerElement.append(article);
  }
}

export async function fetchGitHubData(username) {
  return fetchJSON(`https://api.github.com/users/${encodeURIComponent(username)}`);
}

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
