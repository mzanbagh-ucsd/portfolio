import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const DATA_URL = 'data/life-expectancy.csv';
const FIRST_YEAR = 1960;
const LAST_YEAR = 2020;
const MAX_COUNTRIES = 5;
const YEARS = d3.range(FIRST_YEAR, LAST_YEAR + 1);
const status = d3.select('#data-status');
const regionFilter = d3.select('#region-filter');
const startControl = d3.select('#start-year');
const endControl = d3.select('#end-year');
const countryPicker = d3.select('#country-picker');
const selectedList = d3.select('#selected-countries');
const colors = d3.scaleOrdinal(d3.schemeTableau10);
const regionColors = d3.scaleOrdinal(d3.schemeTableau10);
const globalSvg = d3.select('#global-chart');
const regionSvg = d3.select('#region-chart');
const gapSvg = d3.select('#gap-chart');
const countrySvg = d3.select('#country-chart');
const rankingSvg = d3.select('#ranking-chart');
const heatmapSvg = d3.select('#heatmap-chart');

let countries = [];
let regionNames = [];
let selectedCodes = ['RWA', 'JPN', 'USA'];
let activeRegion = 'all';
let startYear = FIRST_YEAR;
let endYear = LAST_YEAR;

function parseRow(row) {
  const year = Number(row.Year);
  const value = row.Value === '' ? null : Number(row.Value);
  return {
    name: row['Country Name'],
    code: row['Country Code'],
    region: row.Region,
    year,
    value: Number.isFinite(value) ? value : null,
  };
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort(d3.ascending);
  return sorted.length ? d3.quantileSorted(sorted, 0.5) : null;
}

function groupedByYear(rows) {
  return d3.groups(rows.filter((row) => row.value !== null), (row) => row.year)
    .map(([year, observations]) => {
      const values = observations.map((row) => row.value).sort(d3.ascending);
      return {
        year: Number(year),
        median: d3.quantileSorted(values, 0.5),
        low: d3.quantileSorted(values, 0.25),
        high: d3.quantileSorted(values, 0.75),
      };
    })
    .sort((a, b) => a.year - b.year);
}

function buildCountries(rows) {
  return d3.groups(rows, (row) => row.code)
    .map(([code, observations]) => {
      const first = observations[0];
      return {
        code,
        name: first.name,
        region: first.region,
        values: new Map(observations.filter((row) => row.value !== null).map((row) => [row.year, row.value])),
      };
    })
    .filter((country) => country.region && country.region !== 'Aggregates')
    .sort((a, b) => d3.ascending(a.name, b.name));
}

function countryForCode(code) {
  return countries.find((country) => country.code === code);
}

function setEmpty(svg, width, height, message) {
  svg.selectAll('*').remove();
  svg.append('text').attr('class', 'empty-message')
    .attr('x', width / 2).attr('y', height / 2)
    .attr('text-anchor', 'middle').text(message);
}

function axes(svg, x, y, width, height, margin, yLabel, yFormat = (value) => value) {
  svg.append('g').attr('class', 'grid-axis')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(6).tickSize(-width).tickFormat(yFormat))
    .call((group) => group.select('.domain').remove());
  svg.append('g').attr('class', 'x-axis')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(8).tickFormat(d3.format('d')));
  svg.append('text').attr('class', 'axis-label')
    .attr('x', margin.left + width / 2).attr('y', height - 10)
    .attr('text-anchor', 'middle').text('Year');
  if (yLabel) {
    svg.append('text').attr('class', 'axis-label')
      .attr('transform', `translate(18,${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle').text(yLabel);
  }
}

function globalSummary() {
  return groupedByYear(countries.flatMap((country) => [...country.values].map(([year, value]) => ({ year, value }))));
}

function renderGlobal(summary) {
  globalSvg.selectAll('*').remove();
  const width = 1000;
  const height = 470;
  const margin = { top: 30, right: 42, bottom: 58, left: 74 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const x = d3.scaleLinear().domain([FIRST_YEAR, LAST_YEAR]).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([35, 85]).range([height - margin.bottom, margin.top]);
  axes(globalSvg, x, y, plotWidth, height, margin, 'Years at birth', (value) => value);
  const area = d3.area().x((d) => x(d.year)).y0((d) => y(d.low)).y1((d) => y(d.high));
  const line = d3.line().x((d) => x(d.year)).y((d) => y(d.median));
  globalSvg.append('path').datum(summary).attr('class', 'global-band').attr('d', area);
  globalSvg.append('path').datum(summary).attr('class', 'global-line').attr('d', line);
  const endpoints = [summary[0], summary.at(-1)].filter(Boolean);
  globalSvg.selectAll('.global-endpoint').data(endpoints).join('circle')
    .attr('class', 'global-endpoint')
    .attr('cx', (d) => x(d.year)).attr('cy', (d) => y(d.median)).attr('r', 6)
    .append('title').text((d) => `${d.year}: median ${d.median.toFixed(1)} years; middle half ${d.low.toFixed(1)}–${d.high.toFixed(1)}`);
  const first = summary.find((d) => d.year === FIRST_YEAR);
  const last = summary.find((d) => d.year === LAST_YEAR);
  if (first && last) {
    globalSvg.append('text').attr('class', 'chart-annotation')
      .attr('x', x(FIRST_YEAR) + 8).attr('y', y(first.median) - 14)
      .text(`${first.median.toFixed(1)} years`);
    globalSvg.append('text').attr('class', 'chart-annotation')
      .attr('x', x(LAST_YEAR) - 8).attr('y', y(last.median) - 14)
      .attr('text-anchor', 'end').text(`${last.median.toFixed(1)} years`);
  }
}

function regionalSummaries() {
  const output = new Map();
  for (const region of regionNames) {
    const observations = countries.filter((country) => country.region === region)
      .flatMap((country) => [...country.values].map(([year, value]) => ({ year, value })));
    output.set(region, groupedByYear(observations));
  }
  return output;
}

function renderRegionCharts(globalData, regionalData) {
  const width = 1000;
  const height = 500;
  const margin = { top: 28, right: 190, bottom: 56, left: 72 };
  const plotWidth = width - margin.left - margin.right;
  const x = d3.scaleLinear().domain([FIRST_YEAR, LAST_YEAR]).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([30, 90]).range([height - margin.bottom, margin.top]);
  regionSvg.selectAll('*').remove();
  axes(regionSvg, x, y, plotWidth, height, margin, 'Years at birth');
  const line = d3.line().x((d) => x(d.year)).y((d) => y(d.median));
  for (const region of regionNames) {
    const series = regionalData.get(region) || [];
    regionSvg.append('path').datum(series).attr('class', `region-line${activeRegion === region ? ' is-focused' : ''}`)
      .attr('stroke', regionColors(region)).attr('d', line)
      .append('title').text(`${region}: ${series[0]?.median.toFixed(1) ?? '—'} to ${series.at(-1)?.median.toFixed(1) ?? '—'} years`);
  }
  const legend = d3.select('#region-legend').selectAll('li').data(regionNames).join('li');
  legend.selectAll('button').data((region) => [region]).join('button')
    .attr('type', 'button').attr('aria-pressed', (region) => String(activeRegion === region))
    .on('click', (_event, region) => {
      activeRegion = activeRegion === region ? 'all' : region;
      regionFilter.property('value', activeRegion);
      updateCountryPicker();
      renderAll(globalData, regionalData);
    })
    .each(function (region) {
      const button = d3.select(this);
      button.selectAll('span').data([region]).join('span').attr('class', 'legend-swatch').style('--swatch', regionColors(region));
      button.selectAll('span.legend-name').data([region]).join('span').attr('class', 'legend-name').text(region);
    });

  gapSvg.selectAll('*').remove();
  const gapHeight = 430;
  const gapMargin = { top: 24, right: 160, bottom: 54, left: 72 };
  const gapWidth = width - gapMargin.left - gapMargin.right;
  const globalByYear = new Map(globalData.map((point) => [point.year, point.median]));
  const gapRows = regionNames.map((region) => ({
    region,
    values: (regionalData.get(region) || []).flatMap((point) => {
      const world = globalByYear.get(point.year);
      return Number.isFinite(world) ? [{ year: point.year, gap: point.median - world }] : [];
    }),
  }));
  const gapExtent = d3.extent(gapRows.flatMap((row) => row.values.map((d) => d.gap)));
  const gapY = d3.scaleLinear().domain([Math.min(-18, gapExtent[0]), Math.max(18, gapExtent[1])]).nice().range([gapHeight - gapMargin.bottom, gapMargin.top]);
  const gapX = d3.scaleLinear().domain([FIRST_YEAR, LAST_YEAR]).range([gapMargin.left, width - gapMargin.right]);
  gapSvg.append('g').attr('class', 'grid-axis').attr('transform', `translate(${gapMargin.left},0)`)
    .call(d3.axisLeft(gapY).ticks(6).tickSize(-gapWidth)).call((group) => group.select('.domain').remove());
  gapSvg.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${gapHeight - gapMargin.bottom})`)
    .call(d3.axisBottom(gapX).ticks(8).tickFormat(d3.format('d')));
  gapSvg.append('text').attr('class', 'axis-label').attr('x', gapMargin.left + gapWidth / 2).attr('y', gapHeight - 9).attr('text-anchor', 'middle').text('Year');
  gapSvg.append('text').attr('class', 'axis-label').attr('transform', `translate(18,${gapHeight / 2}) rotate(-90)`).attr('text-anchor', 'middle').text('Years from global median');
  gapSvg.append('line').attr('class', 'zero-line').attr('x1', gapMargin.left).attr('x2', width - gapMargin.right).attr('y1', gapY(0)).attr('y2', gapY(0));
  const gapLine = d3.line().x((d) => gapX(d.year)).y((d) => gapY(d.gap));
  for (const row of gapRows) {
    gapSvg.append('path').datum(row.values)
      .attr('class', `gap-line${activeRegion === row.region ? ' is-focused' : ''}`)
      .attr('stroke', regionColors(row.region)).attr('d', gapLine)
      .append('title').text(`${row.region}: ${row.values.at(-1)?.gap.toFixed(1) ?? '—'} years from the global median in ${LAST_YEAR}`);
  }
}

function updateCountryPicker() {
  const available = countries.filter((country) =>
    (activeRegion === 'all' || country.region === activeRegion) && !selectedCodes.includes(country.code),
  );
  countryPicker.selectAll('option').data(available, (country) => country.code).join('option')
    .attr('value', (country) => country.code).text((country) => country.name);
  d3.select('#add-country').property('disabled', !available.length || selectedCodes.length >= MAX_COUNTRIES);
}

function addCountry(code) {
  if (!code || selectedCodes.includes(code)) return;
  if (selectedCodes.length >= MAX_COUNTRIES) selectedCodes = selectedCodes.slice(1);
  selectedCodes = [...selectedCodes, code];
  updateCountryPicker();
  renderCountryChart();
}

function renderSelectedCountries() {
  selectedList.selectAll('li').data(selectedCodes.map(countryForCode).filter(Boolean), (country) => country.code)
    .join('li').each(function (country) {
      d3.select(this).selectAll('button').data([country]).join('button')
        .attr('type', 'button').style('--country-color', colors(country.code))
        .attr('aria-label', `Remove ${country.name} from comparison`)
        .on('click', () => {
          if (selectedCodes.length > 1) selectedCodes = selectedCodes.filter((code) => code !== country.code);
          updateCountryPicker();
          renderCountryChart();
        })
        .text(`${country.name}  ×`);
    });
}

function renderCountryChart() {
  const width = 1000;
  const height = 500;
  const margin = { top: 28, right: 32, bottom: 58, left: 72 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const series = selectedCodes.map(countryForCode).filter(Boolean).map((country) => ({
    ...country,
    points: YEARS.filter((year) => year >= startYear && year <= endYear && country.values.has(year))
      .map((year) => ({ year, value: country.values.get(year) })),
  }));
  countrySvg.selectAll('*').remove();
  const points = series.flatMap((country) => country.points.map((point) => point.value));
  if (!points.length) return setEmpty(countrySvg, width, height, 'No reported values in this year range.');
  const x = d3.scaleLinear().domain([startYear, endYear]).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([Math.max(20, d3.min(points) - 4), Math.min(90, d3.max(points) + 4)]).nice().range([height - margin.bottom, margin.top]);
  axes(countrySvg, x, y, plotWidth, height, margin, 'Years at birth');
  const line = d3.line().defined((point) => Number.isFinite(point.value)).x((point) => x(point.year)).y((point) => y(point.value));
  for (const country of series) {
    const color = colors(country.code);
    countrySvg.append('path').datum(country.points).attr('class', 'country-line').attr('stroke', color).attr('d', line);
    countrySvg.selectAll(`.country-point-${country.code}`).data(country.points).join('circle')
      .attr('class', `country-point country-point-${country.code}`).attr('cx', (point) => x(point.year))
      .attr('cy', (point) => y(point.value)).attr('r', 3.2).attr('fill', color)
      .append('title').text((point) => `${country.name}, ${point.year}: ${point.value.toFixed(1)} years`);
  }
  renderSelectedCountries();
}

function rankedCountries() {
  return countries.filter((country) => activeRegion === 'all' || country.region === activeRegion)
    .flatMap((country) => {
      const start = country.values.get(startYear);
      const end = country.values.get(endYear);
      return Number.isFinite(start) && Number.isFinite(end)
        ? [{ ...country, start, end, change: end - start }]
        : [];
    })
    .sort((a, b) => d3.descending(a.change, b.change));
}

function renderRanking() {
  const width = 1000;
  const height = 520;
  const margin = { top: 16, right: 80, bottom: 24, left: 210 };
  const ranked = rankedCountries().slice(0, 12);
  rankingSvg.selectAll('*').remove();
  d3.select('#ranking-period').text(`${startYear}–${endYear}`);
  if (!ranked.length) return setEmpty(rankingSvg, width, height, 'No countries have data in both selected years.');
  const plotWidth = width - margin.left - margin.right;
  const rowHeight = (height - margin.top - margin.bottom) / ranked.length;
  const extent = d3.extent(ranked, (country) => country.change);
  const x = d3.scaleLinear().domain([Math.min(0, extent[0]), Math.max(1, extent[1])]).nice().range([0, plotWidth]);
  const rows = rankingSvg.selectAll('g.rank-row').data(ranked, (country) => country.code).join('g')
    .attr('class', 'rank-row').attr('transform', (_country, index) => `translate(${margin.left},${margin.top + index * rowHeight})`)
    .attr('tabindex', 0).attr('role', 'button')
    .attr('aria-label', (country) => `Compare ${country.name}, life expectancy gain ${country.change.toFixed(1)} years`)
    .on('click', (_event, country) => addCountry(country.code))
    .on('keydown', (event, country) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); addCountry(country.code); }
    });
  rows.append('text').attr('class', 'rank-country').attr('x', -12).attr('y', rowHeight * 0.67).attr('text-anchor', 'end').text((country) => country.name);
  rows.append('rect').attr('class', 'rank-bar').attr('x', 0).attr('y', rowHeight * 0.18)
    .attr('height', Math.max(7, rowHeight * 0.62)).attr('width', (country) => Math.max(0, x(country.change) - x(0))).attr('rx', 3);
  rows.append('text').attr('class', 'rank-value').attr('x', (country) => x(country.change) + 7).attr('y', rowHeight * 0.67)
    .text((country) => `${country.change > 0 ? '+' : ''}${country.change.toFixed(1)}`);
  rows.append('title').text((country) => `${country.name}: ${country.start.toFixed(1)} in ${startYear}, ${country.end.toFixed(1)} in ${endYear}`);
  const leading = ranked[0];
  d3.select('#ranking-takeaway').text(leading
    ? `${leading.name} leads this view with a ${leading.change.toFixed(1)}-year gain from ${startYear} to ${endYear}.`
    : 'Choose another region or year range to compare gains.');
}

function renderHeatmap() {
  const width = 1000;
  const margin = { top: 46, right: 20, bottom: 24, left: 210 };
  const rowHeight = activeRegion === 'all' ? 9.4 : 18;
  const rowGap = activeRegion === 'all' ? 1 : 2;
  const visible = countries.filter((country) => activeRegion === 'all' || country.region === activeRegion)
    .sort((a, b) => d3.ascending(a.region, b.region) || d3.ascending(a.name, b.name));
  const height = margin.top + margin.bottom + visible.length * (rowHeight + rowGap);
  const plotWidth = width - margin.left - margin.right;
  const cellWidth = plotWidth / YEARS.length;
  heatmapSvg.attr('viewBox', `0 0 ${width} ${height}`).attr('height', height).selectAll('*').remove();
  const x = d3.scaleBand().domain(YEARS).range([margin.left, width - margin.right]).paddingInner(0.12);
  const color = d3.scaleSequential().domain([35, 85]).interpolator(d3.interpolateYlGnBu);
  heatmapSvg.append('g').attr('class', 'heatmap-x-axis').attr('transform', `translate(0,${margin.top - 6})`)
    .call(d3.axisTop(x).tickValues(YEARS.filter((year) => year % 5 === 0)).tickFormat(d3.format('d')).tickSize(0));
  const row = heatmapSvg.selectAll('g.heatmap-row').data(visible, (country) => country.code).join('g')
    .attr('class', 'heatmap-row').attr('transform', (_country, index) => `translate(0,${margin.top + index * (rowHeight + rowGap)})`);
  row.append('text').attr('class', 'heatmap-country').attr('x', margin.left - 8).attr('y', rowHeight * 0.78)
    .attr('text-anchor', 'end').text((country) => country.name);
  row.selectAll('rect').data((country) => YEARS.map((year) => ({
    country,
    year,
    value: country.values.get(year) ?? null,
  }))).join('rect')
    .attr('x', (d) => x(d.year)).attr('y', 0).attr('width', Math.max(1, cellWidth - 0.8)).attr('height', rowHeight)
    .attr('rx', 1.4).attr('class', (d) => `heat-cell${d.value === null ? ' is-missing' : ''}`)
    .attr('fill', (d) => d.value === null ? 'transparent' : color(d.value))
    .attr('tabindex', -1).attr('role', 'button')
    .attr('aria-label', (d) => `${d.country.name}, ${d.year}: ${d.value === null ? 'no reported value' : `${d.value.toFixed(1)} years`}. Select to compare this country.`)
    .on('click', (_event, d) => { if (d.value !== null) addCountry(d.country.code); })
    .append('title').text((d) => `${d.country.name} · ${d.year}: ${d.value === null ? 'no reported value' : `${d.value.toFixed(1)} years`}`);
}

function renderAll(globalData, regionalData) {
  renderRegionCharts(globalData, regionalData);
  renderCountryChart();
  renderRanking();
  renderHeatmap();
}

function updateYears() {
  startYear = Number(startControl.property('value'));
  endYear = Number(endControl.property('value'));
  if (startYear >= endYear) {
    if (startControl.node() === document.activeElement) {
      endYear = Math.min(LAST_YEAR, startYear + 1);
      startControl.property('value', startYear);
      endControl.property('value', endYear);
    } else {
      startYear = Math.max(FIRST_YEAR, endYear - 1);
      startControl.property('value', startYear);
      endControl.property('value', endYear);
    }
  }
  renderCountryChart();
  renderRanking();
}

async function main() {
  try {
    const rows = await d3.csv(DATA_URL, parseRow);
    countries = buildCountries(rows);
    if (!countries.length) throw new Error('No country observations were found in the dataset.');
    regionNames = [...new Set(countries.map((country) => country.region))].sort(d3.ascending);
    regionColors.domain(regionNames);
    const globalData = globalSummary();
    const regionalData = regionalSummaries();
    renderGlobal(globalData);
    regionFilter.selectAll('option.region-option').data(regionNames).join('option')
      .attr('class', 'region-option').attr('value', (region) => region).text((region) => region);
    for (const control of [startControl, endControl]) {
      control.selectAll('option').data(YEARS).join('option').attr('value', (year) => year).text((year) => year);
    }
    startControl.property('value', startYear);
    endControl.property('value', endYear);
    selectedCodes = selectedCodes.filter((code) => countryForCode(code));
    if (!selectedCodes.length) selectedCodes = countries.slice(0, 3).map((country) => country.code);
    regionFilter.on('change', (event) => {
      activeRegion = event.currentTarget.value;
      updateCountryPicker();
      renderAll(globalData, regionalData);
      const regionalChanges = regionNames.map((region) => {
        const values = regionalData.get(region) || [];
        const start = values.find((point) => point.year === FIRST_YEAR)?.median;
        const end = values.find((point) => point.year === LAST_YEAR)?.median;
        return Number.isFinite(start) && Number.isFinite(end) ? { region, change: end - start } : null;
      }).filter(Boolean).sort((a, b) => d3.descending(a.change, b.change));
      if (regionalChanges.length) {
        d3.select('#regional-takeaway').text(`${regionalChanges[0].region} gained the most (${regionalChanges[0].change.toFixed(1)} years); ${regionalChanges.at(-1).region} gained the least (${regionalChanges.at(-1).change.toFixed(1)} years).`);
      }
    });
    startControl.on('change', updateYears);
    endControl.on('change', updateYears);
    d3.select('#add-country').on('click', () => addCountry(countryPicker.property('value')));
    d3.select('#reset-view').on('click', () => {
      activeRegion = 'all';
      startYear = FIRST_YEAR;
      endYear = LAST_YEAR;
      selectedCodes = ['RWA', 'JPN', 'USA'].filter((code) => countryForCode(code));
      regionFilter.property('value', activeRegion);
      startControl.property('value', startYear);
      endControl.property('value', endYear);
      updateCountryPicker();
      renderAll(globalData, regionalData);
      d3.select('#regional-takeaway').text('South Asia and Middle East & North Africa gained about 30 years, compared with fewer than 12 years in Europe & Central Asia and North America.');
    });
    updateCountryPicker();
    renderAll(globalData, regionalData);
    const first = globalData.find((point) => point.year === FIRST_YEAR);
    const last = globalData.find((point) => point.year === LAST_YEAR);
    if (first && last) {
      d3.select('#regional-takeaway').text(`South Asia and Middle East & North Africa gained about 30 years, compared with fewer than 12 years in Europe & Central Asia and North America.`);
    }
    status.text(`${countries.length} countries · ${regionNames.length} regions · World Bank indicator SP.DYN.LE00.IN`);
  } catch (error) {
    console.error('Unable to render the final project:', error);
    status.text(`The life-expectancy data could not be loaded: ${error.message}`);
  }
}

main();
