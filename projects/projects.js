import { fetchJSON, renderProjects } from '../global.js';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const projects = await fetchJSON('../lib/projects.json');
const projectsContainer = document.querySelector('.projects');
const searchInput = document.querySelector('.searchBar');
const clearYearFilterButton = document.querySelector('#clear-year-filter');
const svg = d3.select('#projects-pie-plot');
const legend = d3.select('.legend');
const color = d3
  .scaleOrdinal(d3.schemeTableau10)
  .domain(
    [...new Set(projects.map((project) => String(project.year ?? 'Unknown')))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
  );
const arcGenerator = d3.arc().innerRadius(0).outerRadius(50);

let query = '';
let selectedYear = null;

function matchesQuery(project) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const metadata = Object.values(project).join('\n').toLowerCase();
  return metadata.includes(normalizedQuery);
}

function toggleYear(year) {
  selectedYear = selectedYear === year ? null : year;
  updateProjects();
}

function renderPieChart(projectsToPlot) {
  svg.selectAll('*').remove();
  legend.selectAll('*').remove();

  const data = d3
    .rollups(
      projectsToPlot,
      (yearProjects) => yearProjects.length,
      (project) => String(project.year ?? 'Unknown'),
    )
    .map(([year, count]) => ({ label: year, value: count }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

  if (data.length === 0) {
    legend.append('li').attr('class', 'legend-empty').text('No projects to chart.');
    return;
  }

  const slices = svg
    .selectAll('path')
    .data(d3.pie().sort(null).value((datum) => datum.value)(data))
    .join('path')
    .attr('class', (datum) =>
      datum.data.label === selectedYear ? 'year-slice selected' : 'year-slice',
    )
    .attr('d', arcGenerator)
    .attr('fill', (datum) => color(datum.data.label))
    .attr('tabindex', 0)
    .attr('role', 'button')
    .attr(
      'aria-label',
      (datum) =>
        `${datum.data.label}: ${datum.data.value} project${datum.data.value === 1 ? '' : 's'}`,
    )
    .attr('aria-pressed', (datum) => String(datum.data.label === selectedYear))
    .on('click', (_event, datum) => toggleYear(datum.data.label))
    .on('keydown', (event, datum) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleYear(datum.data.label);
      }
    });

  slices
    .append('title')
    .text(
      (datum) =>
        `${datum.data.label}: ${datum.data.value} project${datum.data.value === 1 ? '' : 's'}`,
    );

  const legendItems = legend
    .selectAll('li')
    .data(data, (datum) => datum.label)
    .join('li')
    .attr('class', (datum) =>
      datum.label === selectedYear ? 'year-legend-item selected' : 'year-legend-item',
    );

  const legendButtons = legendItems
    .append('button')
    .attr('type', 'button')
    .attr('class', 'year-legend-button')
    .attr('aria-pressed', (datum) => String(datum.label === selectedYear))
    .on('click', (_event, datum) => toggleYear(datum.label));

  legendButtons
    .append('span')
    .attr('class', 'swatch')
    .attr('aria-hidden', 'true')
    .style('--color', (datum) => color(datum.label));

  legendButtons
    .append('span')
    .attr('class', 'legend-label')
    .text((datum) => `${datum.label} (${datum.value})`);
}

function updateProjects() {
  const searchFilteredProjects = projects.filter(matchesQuery);
  const displayedProjects =
    selectedYear === null
      ? searchFilteredProjects
      : searchFilteredProjects.filter(
          (project) => String(project.year ?? 'Unknown') === selectedYear,
        );

  renderProjects(displayedProjects, projectsContainer, 'h2');
  renderPieChart(displayedProjects);

  clearYearFilterButton.hidden = selectedYear === null;
  clearYearFilterButton.textContent =
    selectedYear === null ? 'Clear year filter' : `Clear ${selectedYear} filter`;
}

searchInput.addEventListener('input', () => {
  query = searchInput.value;
  updateProjects();
});

clearYearFilterButton.addEventListener('click', () => {
  selectedYear = null;
  updateProjects();
});

updateProjects();
