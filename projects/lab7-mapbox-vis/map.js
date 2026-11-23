import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Replace with your public Mapbox token from your account dashboard.
const accessToken = window.MAPBOX_ACCESS_TOKEN;
if (accessToken) mapboxgl.accessToken = accessToken;
else d3.select('#status').text('Map needs a public Mapbox token. Copy config.example.js to config.js and add your token.');

if (accessToken) initializeMap();

function initializeMap() {

const STATIONS_URL = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
const TRIPS_URL = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';
const LANES_URL = 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson';
const map = new mapboxgl.Map({container:'map', style:'mapbox://styles/mapbox/streets-v12', center:[-71.09415,42.36027], zoom:12, minZoom:10, maxZoom:18});
map.addControl(new mapboxgl.NavigationControl(), 'top-left');
const svg = d3.select('#map').append('svg');
const layer = svg.append('g');
const slider = d3.select('#time-slider');
const formatTime = (minute) => `${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
let stations = [], departuresByMinute = Array.from({length:1440},()=>[]), arrivalsByMinute = Array.from({length:1440},()=>[]), timeFilter = -1;

function minuteOf(value) { const d = new Date(value); return d.getHours()*60+d.getMinutes(); }
function nearMinute(buckets, minute) {
  if (minute === -1) return buckets.flat();
  const out=[];
  for(let offset=-60; offset<=60; offset++) out.push(...buckets[(minute+offset+1440)%1440]);
  return out;
}
function update() {
  const dep = d3.rollup(nearMinute(departuresByMinute,timeFilter), v=>v.length, d=>d.start_station_id);
  const arr = d3.rollup(nearMinute(arrivalsByMinute,timeFilter), v=>v.length, d=>d.end_station_id);
  const computed=stations.map(s=>({...s,departures:dep.get(String(s.short_name))||dep.get(String(s.station_id))||0,arrivals:arr.get(String(s.short_name))||arr.get(String(s.station_id))||0}));
  const max=d3.max(computed,d=>d.departures+d.arrivals)||1, radius=d3.scaleSqrt().domain([0,max]).range(timeFilter===-1?[0,25]:[3,42]);
  const flowColor=d3.scaleQuantize().domain([0,1]).range(['#ed8a36','#9a8271','#2878b5']);
  const circles=layer.selectAll('circle').data(computed,d=>d.station_id||d.short_name).join('circle')
    .attr('cx',d=>map.project([+d.lon,+d.lat]).x).attr('cy',d=>map.project([+d.lon,+d.lat]).y)
    .attr('r',d=>radius(d.departures+d.arrivals)).style('--departure-ratio',d=>{const n=d.departures+d.arrivals; return n?d.departures/n:.5;})
    .style('--station-color',d=>{const n=d.departures+d.arrivals; return flowColor(n?d.departures/n:.5);})
    .attr('aria-label',d=>`${d.name}: ${d.departures} departures and ${d.arrivals} arrivals`);
  circles.selectAll('title').data(d=>[d]).join('title').text(d=>`${d.name}\n${d.departures} departures · ${d.arrivals} arrivals`);
  d3.select('#status').text(`${computed.length} stations · ${timeFilter===-1?'all day':formatTime(timeFilter)+' ± 1 hour'}`);
}
function projectLanes() {
  if(!map.getSource('bike-lanes')) return;
  const features=map.querySourceFeatures('composite',{sourceLayer:'existing-bike-network-2022'});
  // Bike lanes are also rendered by Mapbox as a native GeoJSON line layer.
  return features;
}
function reposition() { layer.selectAll('circle').attr('cx',d=>map.project([+d.lon,+d.lat]).x).attr('cy',d=>map.project([+d.lon,+d.lat]).y); }
slider.on('input',function(){timeFilter=+this.value; d3.select('#time-label').text(timeFilter<0?'All day':formatTime(timeFilter)); update();});
map.on('load',async()=>{
  try {
    const [stationData,trips]=await Promise.all([d3.json(STATIONS_URL),d3.csv(TRIPS_URL)]);
    stations=stationData.data.stations;
    for(const t of trips){if(t.started_at) departuresByMinute[minuteOf(t.started_at)].push(t); if(t.ended_at) arrivalsByMinute[minuteOf(t.ended_at)].push(t);}
    try {
      const lanes=await d3.json(LANES_URL);
      map.addSource('bike-lanes',{type:'geojson',data:lanes});
      map.addLayer({id:'bike-lanes',type:'line',source:'bike-lanes',paint:{'line-color':'#32a878','line-width':2.5,'line-opacity':.8}});
    } catch(e) { console.warn('Bike lane layer could not be loaded',e); }
    update();
  } catch(error) { d3.select('#status').text(`Could not load bike data: ${error.message}. Check the data connection and Mapbox token.`); console.error(error); }
});
map.on('move',reposition); map.on('zoom',reposition); map.on('resize',reposition);
}
