import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

const loadStatus = document.querySelector('#load-status');
const tooltip = document.querySelector('#commit-tooltip');
const clearSelectionButton = document.querySelector('#clear-selection');
const selectionCount = document.querySelector('#selection-count');
const languageBreakdown = document.querySelector('#language-breakdown');
const progressSlider = document.querySelector('#commit-progress');
const progressTime = document.querySelector('#timeline-date');
const fileList = d3.select('#files');
let commits = [];
let progressScale;
let activeCutoff;

function parseLine(row, index) {
  const line = Number(row.line);
  const depth = Number(row.depth);
  const length = Number(row.length);

  if (
    !row.file ||
    !row.commit ||
    !row.date ||
    !row.time ||
    !row.datetime ||
    !Number.isFinite(line) ||
    !Number.isFinite(depth) ||
    !Number.isFinite(length) ||
    Number.isNaN(+new Date(row.datetime))
  ) {
    throw new Error(`Invalid code-history data on CSV row ${index + 2}.`);
  }

  return {
    ...row,
    line,
    depth,
    length,
    type: row.type || 'unknown',
    datetime: new Date(row.datetime),
  };
}

async function loadData() {
  const data = await d3.csv('./loc.csv', parseLine);
  if (data.length === 0) {
    throw new Error('The code-history file contains no rows.');
  }
  return data;
}

function processCommits(data) {
  return d3
    .groups(
      data.filter((line) => line.commit !== '00000000'),
      (line) => line.commit,
    )
    .map(([id, lines]) => {
      const first = lines[0];
      if (Number.isNaN(+first.datetime)) {
        throw new Error(`Invalid timestamp for commit ${id}.`);
      }
      const [hours, minutes, seconds = 0] = first.time.split(':').map(Number);
      if (![hours, minutes, seconds].every(Number.isFinite)) {
        throw new Error(`Invalid time for commit ${id}.`);
      }

      const commit = {
        id,
        url: `https://github.com/mzanbagh-ucsd/portfolio/commit/${encodeURIComponent(id)}`,
        author: first.author || 'Unknown author',
        date: first.date,
        time: first.time,
        timezone: first.timezone || '',
        datetime: first.datetime,
        hourFrac: hours + minutes / 60 + seconds / 3600,
        totalLines: lines.length,
      };

      Object.defineProperty(commit, 'lines', { value: lines });
      return commit;
    })
    .sort((a, b) => a.datetime - b.datetime);
}

function renderCommitInfo(data, commits) {
  const fileLengths = d3.rollups(
    data,
    (lines) => d3.max(lines, (line) => line.line),
    (line) => line.file,
  );
  const longestFile = d3.greatest(fileLengths, (file) => file[1]);
  const weekdayCounts = d3.rollups(
    commits,
    (items) => items.length,
    (commit) => commit.datetime.getUTCDay(),
  );
  const busiestWeekday = d3.greatest(weekdayCounts, (day) => day[1]);
  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const metrics = [
    { label: 'Total LOC', value: d3.format(',')(data.length) },
    { label: 'Commits represented', value: d3.format(',')(commits.length) },
    { label: 'Files touched', value: d3.format(',')(fileLengths.length) },
    {
      label: 'Longest file',
      value: longestFile?.[0].split('/').pop() || '—',
      detail: longestFile ? `${longestFile[0]} · ${d3.format(',')(longestFile[1])} lines` : '',
    },
    {
      label: 'Average line length',
      value: `${d3.format('.1f')(d3.mean(data, (line) => line.length) || 0)} chars`,
    },
    {
      label: 'Maximum nesting depth',
      value: d3.format(',')(d3.max(data, (line) => line.depth) || 0),
    },
    {
      label: 'Most active weekday',
      value: busiestWeekday ? weekdayNames[busiestWeekday[0]] : '—',
      detail: busiestWeekday ? `${busiestWeekday[1]} commits` : '',
    },
  ];

  const cards = d3
    .select('#stats')
    .selectAll('.stat-card')
    .data(metrics)
    .join('div')
    .attr('class', 'stat-card');

  cards.append('dt').text((metric) => metric.label);
  const values = cards.append('dd');
  values.append('span').text((metric) => metric.value);
  values
    .filter((metric) => metric.detail)
    .append('span')
    .attr('class', 'stat-detail')
    .text((metric) => metric.detail);
}

function updateTooltipContent(commit) {
  const link = document.querySelector('#commit-link');
  link.href = commit.url;
  link.textContent = commit.id;
  document.querySelector('#commit-date').textContent = commit.date;
  document.querySelector('#commit-time').textContent =
    `${commit.time} ${commit.timezone}`.trim();
  document.querySelector('#commit-author').textContent = commit.author;
  document.querySelector('#commit-lines').textContent =
    `${d3.format(',')(commit.totalLines)} lines`;
}

function updateTooltipPosition(event) {
  const targetBounds = event.currentTarget.getBoundingClientRect();
  const x = Number.isFinite(event.clientX) && event.clientX > 0
    ? event.clientX
    : targetBounds.left + targetBounds.width / 2;
  const y = Number.isFinite(event.clientY) && event.clientY > 0
    ? event.clientY
    : targetBounds.top + targetBounds.height / 2;

  tooltip.hidden = false;
  const bounds = tooltip.getBoundingClientRect();
  const left = Math.max(12, Math.min(x + 16, window.innerWidth - bounds.width - 12));
  const top = Math.max(12, Math.min(y + 16, window.innerHeight - bounds.height - 12));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function showTooltip(event, commit) {
  updateTooltipContent(commit);
  updateTooltipPosition(event);
}

function hideTooltip() {
  tooltip.hidden = true;
}

function isCommitSelected(selection, commit, xScale, yScale) {
  if (!selection) return false;

  const [[x0, y0], [x1, y1]] = selection;
  const x = xScale(commit.datetime);
  const y = yScale(commit.hourFrac);
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function renderSelectionDetails(selection, commits) {
  const selectedCommits = selection
    ? commits.filter((commit) =>
        isCommitSelected(selection, commit, chartState.xScale, chartState.yScale),
      )
    : [];
  const count = selectedCommits.length;

  selectionCount.textContent = selection
    ? `${count} commit${count === 1 ? '' : 's'} selected`
    : 'No commits selected — drag to select commits.';
  clearSelectionButton.hidden = !selection;

  const lines = selectedCommits.flatMap((commit) => commit.lines);
  const breakdown = lines.length
    ? d3
        .rollups(lines, (items) => items.length, (line) => line.type)
        .map(([language, lineCount]) => ({
          language,
          lineCount,
          proportion: lineCount / lines.length,
        }))
        .sort((a, b) => d3.descending(a.lineCount, b.lineCount))
    : [];

  const entries = d3
    .select(languageBreakdown)
    .selectAll('.language-entry')
    .data(breakdown, (item) => item.language)
    .join(
      (enter) => {
        const entry = enter.append('div').attr('class', 'language-entry');
        entry.append('dt');
        entry.append('dd');
        return entry;
      },
      (update) => update,
      (exit) => exit.remove(),
    );

  entries.select('dt').text((item) => item.language);
  if (!breakdown.length) {
    entries.select('dd').text('No lines selected');
    d3.select(languageBreakdown).attr('aria-label', 'No lines in the selected commits');
  } else {
    const values = entries
      .select('dd')
      .text(
        (item) => `${d3.format(',')(item.lineCount)} lines (${d3.format('.1%')(item.proportion)})`,
      );
    values
      .selectAll('span')
      .data((item) => [item])
      .join('span')
      .style('width', (item) => `${item.proportion * 100}%`);
    d3.select(languageBreakdown).attr(
      'aria-label',
      `Language breakdown for ${count} selected commits`,
    );
  }
}

const chartState = { xScale: null, yScale: null, svg: null, brush: null, width: 1000, height: 560 };

function renderScatterPlot() {
  const width = 1000;
  const height = 560;
  const margin = { top: 24, right: 24, bottom: 64, left: 74 };
  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };
  chartState.xScale = d3
    .scaleUtc()
    .domain(d3.extent(commits, (commit) => commit.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();
  chartState.yScale = d3
    .scaleLinear()
    .domain([0, 24])
    .range([usableArea.bottom, usableArea.top]);

  const svg = d3
    .select('#chart')
    .append('svg')
    .attr('class', 'meta-chart')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-labelledby', 'chart-title chart-description');

  svg
    .append('desc')
    .attr('id', 'chart-description')
    .text('Commits over time. Brush the plot to select commits and compare the languages changed.');

  svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(
      d3
        .axisLeft(chartState.yScale)
        .tickValues(d3.range(0, 25, 4))
        .tickFormat('')
        .tickSize(-usableArea.width),
    );

  svg
    .append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .call(d3.axisBottom(chartState.xScale).ticks(width / 120));

  svg
    .append('g')
    .attr('class', 'axis')
    .attr('transform', `translate(${usableArea.left}, 0)`)
    .call(
      d3
        .axisLeft(chartState.yScale)
        .tickValues(d3.range(0, 25, 4))
        .tickFormat((hour) => `${hour % 12 || 12} ${hour < 12 || hour === 24 ? 'am' : 'pm'}`),
    );

  svg
    .append('text')
    .attr('class', 'axis-label')
    .attr('x', usableArea.left + usableArea.width / 2)
    .attr('y', height - 14)
    .attr('text-anchor', 'middle')
    .text('Commit date');

  svg
    .append('text')
    .attr('class', 'axis-label')
    .attr('transform', `translate(18, ${usableArea.top + usableArea.height / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle')
    .text('Local time of day');

  svg.append('g').attr('class', 'dots');
  chartState.svg = svg;
  chartState.brush = d3
    .brush()
    .extent([
      [usableArea.left, usableArea.top],
      [usableArea.right, usableArea.bottom],
    ])
    .on('brush end', (event) => {
      const visibleCommits = commits.filter((commit) => commit.datetime <= activeCutoff);
      svg.select('.dots').selectAll('circle').classed('selected', (commit) =>
        isCommitSelected(event.selection, commit, chartState.xScale, chartState.yScale),
      );
      renderSelectionDetails(event.selection, visibleCommits);
    });

  svg.append('g').attr('class', 'brush').call(chartState.brush);
  updateScatterPlot(commits[commits.length - 1].datetime, usableArea);

  clearSelectionButton.addEventListener('click', () => {
    svg.select('.brush').call(chartState.brush.move, null);
  });
}

function updateScatterPlot(cutoff, area) {
  activeCutoff = cutoff;
  const svg = chartState.svg;
  const width = chartState.width;
  const height = chartState.height;
  const margin = { top: 24, right: 24, bottom: 64, left: 74 };
  const usableArea = area || {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };
  const visibleCommits = commits.filter((commit) => commit.datetime <= cutoff);
  const firstDate = commits[0].datetime;
  const domainEnd = cutoff > firstDate ? cutoff : new Date(+firstDate + 60 * 60 * 1000);
  chartState.xScale.domain([firstDate, domainEnd]).nice();
  svg.select('.axis').filter((_, index) => index === 0)
    .transition().duration(350).call(d3.axisBottom(chartState.xScale).ticks(width / 120));

  const lineExtent = d3.extent(commits, (commit) => commit.totalLines);
  const radiusScale = d3.scaleSqrt()
    .domain([Math.min(0, lineExtent[0]), Math.max(1, lineExtent[1])])
    .range([4, 14]);
  const colorScale = d3.scaleThreshold()
    .domain([6, 18])
    .range(['#3b82f6', '#d97706', '#3b82f6']);
  const dots = svg.select('.dots');
  const circles = dots.selectAll('circle')
    .data(d3.sort(visibleCommits, (commit) => -commit.totalLines), (commit) => commit.id)
    .join(
      (enter) => enter.append('circle')
        .attr('class', 'dot')
        .attr('cx', (commit) => chartState.xScale(commit.datetime))
        .attr('cy', (commit) => chartState.yScale(commit.hourFrac))
        .attr('r', (commit) => radiusScale(commit.totalLines))
        .attr('fill', (commit) => colorScale(commit.hourFrac))
        .attr('fill-opacity', 0)
        .attr('tabindex', 0)
        .attr('role', 'button')
        .attr('aria-label', (commit) => `${commit.date} at ${commit.time}, ${commit.totalLines} lines changed by ${commit.author}`)
        .on('mouseenter focus', showTooltip)
        .on('mousemove', updateTooltipPosition)
        .on('mouseleave blur', hideTooltip)
        .call((selection) => selection.append('title')
          .text((commit) => `${commit.date} · ${commit.totalLines} lines · ${commit.author}`))
        .call((selection) => selection.transition().duration(350).attr('fill-opacity', 0.72)),
      (update) => update,
      (exit) => exit.transition().duration(200).attr('fill-opacity', 0).remove(),
    );

  circles.transition().duration(350)
    .attr('cx', (commit) => chartState.xScale(commit.datetime))
    .attr('cy', (commit) => chartState.yScale(commit.hourFrac))
    .attr('r', (commit) => radiusScale(commit.totalLines))
    .attr('fill', (commit) => colorScale(commit.hourFrac))
    .attr('fill-opacity', 0.72);
  svg.select('.brush').call(chartState.brush.move, null);
  dots.raise();
  renderSelectionDetails(null, visibleCommits);
  const progress = progressScale(cutoff);
  progressSlider.value = String(progress);
  progressTime.dateTime = cutoff.toISOString();
  progressTime.textContent = cutoff.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' });
}

function onTimeSliderChange() {
  const cutoff = progressScale.invert(Number(progressSlider.value));
  updateScatterPlot(cutoff);
}

function renderFileRace(data) {
  const files = d3.groups(data, (line) => line.file)
    .map(([name, lines]) => ({
      name,
      lines,
      type: lines[0]?.type || 'unknown',
    }))
    .sort((a, b) => b.lines.length - a.lines.length);
  const colors = d3.scaleOrdinal(d3.schemeTableau10);
  const rows = fileList.selectAll('.file-row')
    .data(files, (file) => file.name)
    .join((enter) => {
      const row = enter.append('div').attr('class', 'file-row');
      row.append('dt');
      row.append('dd');
      return row;
    })
    .style('--file-color', (file) => colors(file.type));
  rows.select('dt').html((file) => `<code>${file.name}</code><small>${d3.format(',')(file.lines.length)} lines · ${file.type}</small>`);
  rows.select('dd').selectAll('.loc')
    .data((file) => file.lines)
    .join('span')
    .attr('class', 'loc')
    .attr('aria-hidden', 'true');
}

function renderStory(commits) {
  d3.select('#scatter-story').selectAll('.step')
    .data(commits, (commit) => commit.id)
    .join('div')
    .attr('class', 'step')
    .html((commit, index) => `
      <p class="eyebrow">Commit ${index + 1} of ${commits.length}</p>
      <p>On ${commit.datetime.toLocaleString('en', { dateStyle: 'full', timeStyle: 'short' })},
      I made <a href="${commit.url}" target="_blank" rel="noopener noreferrer">${index ? 'another change' : 'my first recorded change'}</a>.
      I touched ${d3.format(',')(commit.totalLines)} lines across ${d3.rollups(commit.lines, (lines) => lines.length, (line) => line.file).length} files.</p>
    `);
  const scroller = scrollama();
  scroller.setup({ container: '#scrolly-1', step: '#scrolly-1 .step', offset: 0.55 })
    .onStepEnter(({ element }) => {
      const commit = element.__data__;
      const progress = progressScale(commit.datetime);
      progressSlider.value = String(progress);
      updateScatterPlot(commit.datetime);
      d3.selectAll('#scatter-story .step').classed('is-active', (item) => item.id === commit.id);
    });
  window.addEventListener('resize', scroller.resize);
}

async function main() {
  try {
    const data = await loadData();
    commits = processCommits(data);
    if (commits.length === 0) {
      throw new Error('No commits could be derived from the code-history file.');
    }

    renderCommitInfo(data, commits);
    progressScale = d3.scaleTime()
      .domain(d3.extent(commits, (commit) => commit.datetime))
      .range([0, 100]);
    renderFileRace(data);
    renderScatterPlot();
    progressSlider.addEventListener('input', onTimeSliderChange);
    renderStory(commits);
    updateScatterPlot(commits[commits.length - 1].datetime);
    loadStatus.hidden = true;
  } catch (error) {
    console.error('Unable to render code activity:', error);
    loadStatus.dataset.state = 'error';
    loadStatus.textContent = `Unable to load code history: ${error.message}`;
  }
}

main();
