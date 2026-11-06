import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const DATA_URL = 'data/life-expectancy.csv';
const INDICATOR = 'SP.DYN.LE00.IN';
const FIRST_YEAR = 1960;
const LAST_YEAR = 2020;
const MAX_SELECTED = 5;

const status = d3.select('#data-status');
const regionFilter = d3.select('#region-filter');
const countryPicker = d3.select('#country-picker');
const startYearControl = d3.select('#start-year');
const endYearControl = d3.select('#end-year');
const selectedList = d3.select('#selected-countries');
const trendSvg = d3.select('#trend-chart');
const rankingSvg = d3.select('#ranking-chart');
const periodLabel = d3.select('#ranking-period');
const colors = d3.scaleOrdinal(d3.schemeTableau10);

let countries = [];
let selectedCodes = ['JPN', 'USA', 'TUR'];
let startYear = 2000;
let endYear = 2020;
let activeRegion = 'all';

function normalizedKey(row, candidates) {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const match = keys.find((key) => key.replace(/^\uFEFF/, '').trim().toLowerCase() === candidate.toLowerCase());
    if (match) return match;
  }
  return null;
}

function numericValue(rawValue) {
  if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') return null;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

function readCountryObservations(rows) {
  if (!rows.length) return [];
  const sample = rows[0];
  const codeKey = normalizedKey(sample, ['Country Code', 'CountryCode', 'ISO3', 'Code']);
  const nameKey = normalizedKey(sample, ['Country Name', 'CountryName', 'Country', 'TableName']);
  const regionKey = normalizedKey(sample, ['Region', 'region']);
  const indicatorKey = normalizedKey(sample, ['Indicator Code', 'IndicatorCode']);
  const yearKey = normalizedKey(sample, ['Year', 'year']);
  const valueKey = normalizedKey(sample, ['Value', 'value', 'Life expectancy at birth, total (years)']);
  if (!codeKey || !nameKey) throw new Error('Could not identify country columns in the selected dataset.');

  const wideYears = Object.keys(sample)
    .map((key) => key.replace(/^\uFEFF/, '').trim())
    .filter((key) => /^\d{4}$/.test(key) && +key >= FIRST_YEAR && +key <= LAST_YEAR)
    .map(Number)
    .sort(d3.ascending);
  const longFormat = Boolean(yearKey && valueKey);
  const selectedRows = rows.filter((row) => !indicatorKey || row[indicatorKey] === INDICATOR);
  const observations = new Map();

  for (const row of selectedRows) {
    const code = String(row[codeKey] ?? '').trim();
    const name = String(row[nameKey] ?? '').trim();
    if (!code || !name) continue;
    if (!observations.has(code)) {
      observations.set(code, {
        code,
        name,
        region: regionKey ? String(row[regionKey] ?? '').trim() : '',
        values: new Map(),
      });
    }
    const country = observations.get(code);

    if (longFormat) {
      const year = Number(row[yearKey]);
      const value = numericValue(row[valueKey]);
      if (Number.isInteger(year) && value !== null && year >= FIRST_YEAR && year <= LAST_YEAR) {
        country.values.set(year, value);
      }
    } else {
      for (const year of wideYears) {
        const value = numericValue(row[String(year)] ?? row[` ${year}`]);
        if (value !== null) country.values.set(year, value);
      }
    }
  }
  return [...observations.values()];
}

function yearValue(country, year) {
  const value = country.values.get(year);
  return Number.isFinite(value) ? value : null;
}

function countryForCode(code) {
  return countries.find((country) => country.code === code);
}

function visibleCountries() {
  return countries.filter((country) => activeRegion === 'all' || country.region === activeRegion);
}

function populateControls() {
  const regions = [...new Set(countries.map((country) => country.region).filter(Boolean))].sort(d3.ascending);
  regionFilter.selectAll('option.region-option')
    .data(regions)
    .join('option')
    .attr('class', 'region-option')
    .attr('value', (region) => region)
    .text((region) => region);

  const years = d3.range(FIRST_YEAR, LAST_YEAR + 1);
  for (const control of [startYearControl, endYearControl]) {
    control.selectAll('option')
      .data(years)
      .join('option')
      .attr('value', (year) => year)
      .text((year) => year);
  }
  startYearControl.property('value', startYear);
  endYearControl.property('value', endYear);
  updateCountryPicker();
}

function updateCountryPicker() {
  const choices = visibleCountries()
    .filter((country) => !selectedCodes.includes(country.code))
    .sort((a, b) => d3.ascending(a.name, b.name));
  countryPicker.selectAll('option')
    .data(choices, (country) => country.code)
    .join('option')
    .attr('value', (country) => country.code)
    .text((country) => country.name);
  d3.select('#add-country').property('disabled', choices.length === 0 || selectedCodes.length >= MAX_SELECTED);
}

function renderSelectedCountries() {
  const selected = selectedCodes.map(countryForCode).filter(Boolean);
  selectedList.selectAll('li')
    .data(selected, (country) => country.code)
    .join('li')
    .each(function (country, index) {
      const button = d3.select(this).selectAll('button').data([country]).join('button')
        .attr('type', 'button')
        .style('--chip-color', colors(country.code))
        .attr('aria-label', `Remove ${country.name} from comparison`)
        .on('click', () => removeCountry(country.code));
      button.selectAll('span.country-chip-name').data([country]).join('span')
        .attr('class', 'country-chip-name').text((item) => item.name);
      button.selectAll('span.country-chip-remove').data([country]).join('span')
        .attr('class', 'country-chip-remove').attr('aria-hidden', 'true').text('×');
    });
}

function addCountry(code) {
  if (!code || selectedCodes.includes(code) || selectedCodes.length >= MAX_SELECTED) return;
  selectedCodes = [...selectedCodes, code];
  updateCountryPicker();
  render();
}

function removeCountry(code) {
  if (selectedCodes.length <= 1) return;
  selectedCodes = selectedCodes.filter((selected) => selected !== code);
  updateCountryPicker();
  render();
}

function selectedRangeRows() {
  return visibleCountries()
    .map((country) => {
      const from = yearValue(country, startYear);
      const to = yearValue(country, endYear);
      return from === null || to === null ? null : { ...country, from, to, change: to - from };
    })
    .filter(Boolean);
}

function renderTrend() {
  trendSvg.selectAll('*').remove();
  const width = 900;
  const height = 440;
  const margin = { top: 22, right: 28, bottom: 48, left: 62 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const chosen = selectedCodes.map(countryForCode).filter(Boolean);
  const series = chosen.map((country) => ({
    ...country,
    observations: [...country.values]
      .filter(([year]) => year >= startYear && year <= endYear)
      .map(([year, value]) => ({ year, value }))
      .sort((a, b) => a.year - b.year),
  }));
  const values = series.flatMap((item) => item.observations.map((point) => point.value));
  if (!values.length) {
    trendSvg.append('text').attr('x', width / 2).attr('y', height / 2).attr('text-anchor', 'middle').text('No reported values for this selection.');
    return;
  }
  const x = d3.scaleLinear().domain([startYear, endYear]).range([margin.left, margin.left + plotWidth]);
  const y = d3.scaleLinear().domain([20, 90]).range([margin.top + plotHeight, margin.top]);
  const xTicks = x.ticks(Math.min(8, endYear - startYear + 1)).map(Math.round);
  const yAxis = d3.axisLeft(y).ticks(6).tickSize(-plotWidth).tickFormat((value) => `${value}`);
  const xAxis = d3.axisBottom(x).tickValues([...new Set(xTicks)]).tickFormat(d3.format('d'));
  trendSvg.append('g').attr('class', 'grid').attr('transform', `translate(${margin.left},0)`).call(yAxis).call((group) => group.select('.domain').remove());
  trendSvg.append('g').attr('class', 'axis').attr('transform', `translate(0,${margin.top + plotHeight})`).call(xAxis);
  trendSvg.append('text').attr('x', margin.left).attr('y', 14).attr('fill', 'currentColor').attr('font-size', 12).text('Years at birth');

  const line = d3.line().defined((point) => Number.isFinite(point.value)).x((point) => x(point.year)).y((point) => y(point.value));
  for (const country of series) {
    const color = colors(country.code);
    trendSvg.append('path').datum(country.observations).attr('class', 'trend-line').attr('d', line).attr('stroke', color);
    trendSvg.selectAll(`circle.point-${country.code}`).data(country.observations)
      .join('circle').attr('class', `trend-point point-${country.code}`)
      .attr('cx', (point) => x(point.year)).attr('cy', (point) => y(point.value))
      .attr('r', (point) => point.year === startYear || point.year === endYear ? 5 : 3.5)
      .attr('tabindex', 0)
      .attr('aria-label', (point) => `${country.name}, ${point.year}: ${point.value.toFixed(1)} years`)
      .attr('fill', color)
      .append('title').text((point) => `${country.name}, ${point.year}: ${point.value.toFixed(1)} years`);
  }
}

function renderRanking() {
  rankingSvg.selectAll('*').remove();
  periodLabel.text(`${startYear}–${endYear}`);
  const width = 900;
  const height = 440;
  const margin = { top: 12, right: 70, bottom: 18, left: 190 };
  const comparable = selectedRangeRows();
  const ranked = comparable.filter((country) => country.change > 0).sort((a, b) => d3.descending(a.change, b.change)).slice(0, 12);
  if (!ranked.length) {
    const message = comparable.length ? 'No countries gained life expectancy in this period.' : 'No countries have reported values in both years.';
    rankingSvg.append('text').attr('x', width / 2).attr('y', height / 2).attr('text-anchor', 'middle').text(message);
    return;
  }
  const plotWidth = width - margin.left - margin.right;
  const rowHeight = (height - margin.top - margin.bottom) / ranked.length;
  const maxValue = Math.max(1, d3.max(ranked, (country) => country.change));
  const x = d3.scaleLinear().domain([Math.min(0, d3.min(ranked, (country) => country.change)), maxValue]).nice().range([0, plotWidth]);
  const row = rankingSvg.selectAll('g.rank-row').data(ranked, (country) => country.code).join('g')
    .attr('class', 'rank-row').attr('transform', (_country, index) => `translate(${margin.left},${margin.top + index * rowHeight})`)
    .attr('tabindex', 0).attr('role', 'button')
    .attr('aria-label', (country) => `Add ${country.name}, gain ${country.change.toFixed(1)} years, to the trend chart`)
    .on('click', (_event, country) => addCountry(country.code))
    .on('keydown', (event, country) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); addCountry(country.code); }
    });
  row.append('text').attr('class', 'rank-label').attr('x', -10).attr('y', rowHeight * 0.67).attr('text-anchor', 'end').text((country) => country.name);
  row.append('rect').attr('class', 'rank-bar').attr('x', 0).attr('y', rowHeight * 0.2).attr('height', Math.max(7, rowHeight * 0.58)).attr('width', (country) => Math.max(0, x(country.change) - x(0))).attr('rx', 3).attr('fill', (_country, index) => index < 3 ? 'var(--life-accent)' : 'color-mix(in srgb, var(--life-accent) 55%, CanvasText)');
  row.append('text').attr('class', 'rank-value').attr('x', (country) => x(country.change) + 6).attr('y', rowHeight * 0.67).text((country) => `${country.change > 0 ? '+' : ''}${country.change.toFixed(1)}`);
  row.append('title').text((country) => `${country.name}: ${country.from.toFixed(1)} years in ${startYear} to ${country.to.toFixed(1)} years in ${endYear}`);
}

function render() {
  renderSelectedCountries();
  renderTrend();
  renderRanking();
}

regionFilter.on('change', (event) => {
  activeRegion = event.currentTarget.value;
  updateCountryPicker();
  renderRanking();
});

d3.select('#add-country').on('click', () => addCountry(countryPicker.property('value')));
startYearControl.on('change', (event) => {
  startYear = Number(event.currentTarget.value);
  if (startYear >= endYear) {
    if (startYear < LAST_YEAR) endYear = startYear + 1;
    else {
      startYear = LAST_YEAR - 1;
      startYearControl.property('value', startYear);
    }
    endYearControl.property('value', endYear);
  }
  render();
});
endYearControl.on('change', (event) => {
  endYear = Number(event.currentTarget.value);
  if (endYear <= startYear) {
    if (endYear > FIRST_YEAR) startYear = endYear - 1;
    else {
      startYear = FIRST_YEAR;
      endYear = FIRST_YEAR + 1;
      endYearControl.property('value', endYear);
    }
    startYearControl.property('value', startYear);
  }
  render();
});
d3.select('#reset-view').on('click', () => {
  selectedCodes = ['JPN', 'USA', 'TUR'].filter((code) => countryForCode(code));
  if (!selectedCodes.length) selectedCodes = countries.slice(0, 3).map((country) => country.code);
  startYear = 2000;
  endYear = 2020;
  activeRegion = 'all';
  regionFilter.property('value', 'all');
  startYearControl.property('value', startYear);
  endYearControl.property('value', endYear);
  updateCountryPicker();
  render();
});

try {
  const dataRows = await d3.csv(DATA_URL);
  countries = readCountryObservations(dataRows)
    .filter((country) => country.region && country.region !== 'Aggregates')
    .sort((a, b) => d3.ascending(a.name, b.name));
  if (!countries.length) throw new Error('The selected indicator was not found in the dataset.');
  selectedCodes = selectedCodes.filter((code) => countryForCode(code));
  if (!selectedCodes.length) selectedCodes = countries.slice(0, 3).map((country) => country.code);
  colors.domain(countries.map((country) => country.code));
  populateControls();
  render();
  status.text(`${countries.length} countries with regional classifications · ${INDICATOR}`);
} catch (error) {
  console.error(error);
  status.text('The dataset could not be loaded. Please open this page through a web server and try again.');
}
