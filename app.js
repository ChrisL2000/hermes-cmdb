/* CMDB · OSI stack viewer
 *
 * 7 layers along Y, each layer a slab holding its sub-layers as thin plates.
 * Data comes from data/osi.json (the model) and data/cmdb.json (the CIs).
 * Click a slab to select the layer; click a plate (or a sub-layer in the panel)
 * to focus one sub-layer.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const SLAB_W = 16;
const SLAB_D = 9;
const BASE_SPACING = 2.45;
const SUB_GAP = 0.26;

const state = {
  osi: null,
  cmdb: null,
  selectedLayer: null,
  selectedSub: null,
  explode: 1,
  spin: true,
  hover: null,
  filter: '',
  host: '',
};

const layers = [];           // { data, group, slab, edges, plates: Map<subId, mesh>, label }
const pickables = [];

init();

async function init() {
  const [osi, cmdb] = await Promise.all([
    fetch('data/osi.json').then((r) => r.json()),
    fetch('data/cmdb.json').then((r) => r.json()),
  ]);
  state.osi = osi;
  state.cmdb = cmdb;

  document.getElementById('scope').textContent = cmdb.scope || '';
  buildLegend();
  buildHostFilter();

  if (!window.WebGLRenderingContext || !hasWebGL()) {
    document.getElementById('fallback').hidden = false;
    document.getElementById('scene').style.display = 'none';
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07090c);
  scene.fog = new THREE.Fog(0x07090c, 26, 62);

  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 300);
  camera.position.set(14, 10, 17);

  const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('scene'),
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.target.set(0, 7.4, 0);
  controls.minDistance = 9;
  controls.maxDistance = 46;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.autoRotate = state.spin;
  controls.autoRotateSpeed = 0.5;

  scene.add(new THREE.HemisphereLight(0x9fd8ff, 0x0a0f14, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(9, 18, 12);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x66e0ff, 0.5);
  rim.position.set(-12, 6, -10);
  scene.add(rim);

  const grid = new THREE.GridHelper(70, 70, 0x1b2733, 0x131a22);
  grid.position.y = -0.65;
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  scene.add(grid);

  buildStack(scene);
  buildPanel(null);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function setPointer(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  }

  renderer.domElement.addEventListener('pointermove', (ev) => {
    setPointer(ev);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    setHover(hit ? hit.object.userData : null);
  });

  renderer.domElement.addEventListener('pointerdown', (ev) => {
    setPointer(ev);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    if (!hit) return;
    const ud = hit.object.userData;
    if (ud.sub) selectSub(ud.layerId, ud.sub);
    else selectLayer(ud.layerId);
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  document.getElementById('btn-explode').addEventListener('click', (e) => {
    state.explode = state.explode === 1 ? 1.75 : 1;
    e.currentTarget.classList.toggle('on', state.explode !== 1);
    layout();
  });
  document.getElementById('btn-spin').addEventListener('click', (e) => {
    state.spin = !state.spin;
    controls.autoRotate = state.spin;
    e.currentTarget.classList.toggle('on', state.spin);
  });
  document.getElementById('btn-reset').addEventListener('click', () => {
    camera.position.set(14, 10, 17);
    controls.target.set(0, 7.4, 0);
    controls.update();
    selectLayer(null);
  });
  document.getElementById('search').addEventListener('input', (e) => {
    state.filter = e.target.value.trim().toLowerCase();
    applyFilter();
    if (state.selectedLayer) buildPanel(state.selectedLayer);
  });
  document.getElementById('host-filter').addEventListener('change', (e) => {
    state.host = e.target.value;
    applyFilter();
    if (state.selectedLayer) buildPanel(state.selectedLayer);
  });

  // focus animation
  const focus = { active: false, to: new THREE.Vector3(), lookAt: new THREE.Vector3() };

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    if (focus.active) {
      controls.target.lerp(focus.lookAt, 0.12);
      camera.position.lerp(focus.to, 0.08);
      if (controls.target.distanceTo(focus.lookAt) < 0.02) focus.active = false;
    }
    for (const L of layers) {
      const targetY = layerY(L.data.num);
      L.group.position.y += (targetY - L.group.position.y) * 0.12;
      const open = state.selectedLayer === L.data.id;
      for (const [subId, plate] of L.plates) {
        const idx = L.data.sublayers.findIndex((s) => s.id === subId);
        const spread = open ? (idx - (L.data.sublayers.length - 1) / 2) * SUB_GAP : 0;
        plate.position.y += (spread - plate.position.y) * 0.14;
        const focusThis = state.selectedSub && state.selectedSub.id === subId;
        const op = focusThis ? 0.5 : open ? 0.22 : 0.1;
        plate.material.opacity += (op - plate.material.opacity) * 0.14;
      }
    }
    renderer.render(scene, camera);
  }
  animate();

  function selectLayer(layerId) {
    state.selectedLayer = layerId;
    state.selectedSub = null;
    buildPanel(layerId);
    if (!layerId) return;
    const L = layers.find((x) => x.data.id === layerId);
    if (!L) return;
    const y = layerY(L.data.num);
    focus.lookAt.set(0, y, 0);
    focus.to.set(SLAB_W * 0.62, y + 5.2, SLAB_D * 1.55);
    focus.active = true;
    controls.autoRotate = false;
  }

  function selectSub(layerId, subId) {
    state.selectedLayer = layerId;
    const L = layers.find((x) => x.data.id === layerId);
    state.selectedSub = L ? L.data.sublayers.find((s) => s.id === subId) || null : null;
    buildPanel(layerId);
  }

  function setHover(ud) {
    if (state.hover && state.hover.mesh) state.hover.mesh.material.emissiveIntensity = 0;
    state.hover = null;
    if (!ud) {
      document.body.style.cursor = '';
      return;
    }
    const L = layers.find((x) => x.data.id === ud.layerId);
    const mesh = ud.sub ? L?.plates.get(ud.sub) : L?.slab;
    if (mesh) {
      state.hover = { mesh };
      mesh.material.emissiveIntensity = 0.55;
    }
    document.body.style.cursor = 'pointer';
  }

  // expose for the panel's sub-layer buttons
  window.__cmdb = {
    selectLayer,
    selectSub,
    layers: () => layers,
  };
}

/* ------------------------------------------------------------ geometry */
function layerY(num) {
  return (num - 1) * BASE_SPACING * state.explode;
}

function buildStack(scene) {
  for (const layer of state.osi.layers) {
    const group = new THREE.Group();
    group.position.y = layerY(layer.num);
    scene.add(group);

    const color = new THREE.Color(layer.color);

    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(SLAB_W, 0.16, SLAB_D),
      new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: 0.16,
        metalness: 0.1,
        roughness: 0.55,
        emissive: color,
        emissiveIntensity: 0,
      }),
    );
    slab.userData = { layerId: layer.id };
    group.add(slab);
    pickables.push(slab);

    const edgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(SLAB_W, 0.16, SLAB_D));
    const edges = new THREE.LineSegments(
      edgeGeo,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }),
    );
    group.add(edges);

    const plates = new Map();
    layer.sublayers.forEach((sub) => {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(SLAB_W * 0.94, 0.03, SLAB_D * 0.9),
        new THREE.MeshStandardMaterial({
          color: color.clone().offsetHSL(0, -0.05, 0.06),
          transparent: true,
          opacity: 0.1,
          emissive: color,
          emissiveIntensity: 0,
          roughness: 0.6,
        }),
      );
      plate.userData = { layerId: layer.id, sub: sub.id };
      plate.position.y = 0;
      group.add(plate);
      plates.set(sub.id, plate);
      pickables.push(plate);

      const subEdge = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(SLAB_W * 0.94, 0.03, SLAB_D * 0.9)),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 }),
      );
      plate.add(subEdge);
    });

    const ciCount = state.cmdb.cis.filter((c) => c.layer === layer.num).length;
    const label = makeLabel(
      `L${layer.num}  ${layer.name}`,
      `${layer.discipline}  ·  ${layer.sublayers.length} sub-layers  ·  ${ciCount} CIs`,
      layer.color,
    );
    label.position.set(-SLAB_W / 2 - 3.4, 0.25, 0);
    group.add(label);

    layers.push({ data: layer, group, slab, edges, plates, label });
  }
}

function makeLabel(title, subtitle, colorHex) {
  const pad = 26;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontTitle = '600 44px "Segoe UI", system-ui, sans-serif';
  const fontSub = '400 24px "Segoe UI", system-ui, sans-serif';
  ctx.font = fontTitle;
  const w1 = ctx.measureText(title).width;
  ctx.font = fontSub;
  const w2 = ctx.measureText(subtitle).width;
  const width = Math.ceil(Math.max(w1, w2) + pad * 2);
  const height = 128;
  canvas.width = width;
  canvas.height = height;

  const c = canvas.getContext('2d');
  c.clearRect(0, 0, width, height);
  c.fillStyle = 'rgba(10,14,18,0.55)';
  roundRect(c, 0, 8, width, height - 16, 14);
  c.fill();
  c.strokeStyle = colorHex;
  c.globalAlpha = 0.55;
  c.lineWidth = 2;
  roundRect(c, 1, 9, width - 2, height - 18, 14);
  c.stroke();
  c.globalAlpha = 1;
  c.fillStyle = colorHex;
  c.font = fontTitle;
  c.fillText(title, pad, 58);
  c.fillStyle = '#9aa9b8';
  c.font = fontSub;
  c.fillText(subtitle, pad, 94);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  const scale = 0.0075;
  sprite.scale.set(width * scale, height * scale, 1);
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function layout() {
  for (const L of layers) L.group.position.y = layerY(L.data.num);
}

/* --------------------------------------------------------------- panel */
function cisFor(layerNum, subId) {
  return state.cmdb.cis.filter(
    (c) => c.layer === layerNum && (!subId || c.sublayer === subId),
  );
}

function matchesFilter(ci) {
  if (state.host && ci.host !== state.host) return false;
  if (!state.filter) return true;
  const hay = [ci.name, ci.type, ci.host, ci.address, ci.notes, ci.state]
    .filter(Boolean).join(' ').toLowerCase();
  return hay.includes(state.filter);
}

function buildPanel(layerId) {
  const body = document.getElementById('panel-body');
  if (!layerId) {
    const total = state.cmdb.cis.length;
    body.innerHTML = `
      <p class="hint">Click a layer in the stack. Each layer holds its sub-layers;
      each sub-layer lists the CIs filed under it.</p>
      <h3>Inventory</h3>
      <p class="muted">${state.cmdb.hosts.length} hosts · ${total} configuration items ·
      ${state.cmdb.links.length} relationships</p>
      <h3>Hosts</h3>
      ${state.cmdb.hosts.map((h) => `
        <div class="ci">
          <span class="name">${esc(h.name)}<br><span class="small muted">${esc(h.role)}</span></span>
          <span class="addr">${esc(h.overlay || h.lan || '')}</span>
          <span class="state ${esc(h.state)}">${esc(h.state)}</span>
        </div>`).join('')}`;
    return;
  }

  const layer = state.osi.layers.find((l) => l.id === layerId);
  if (!layer) return;
  const c = new THREE.Color(layer.color).getStyle();

  const subs = layer.sublayers.map((sub) => {
    const cis = cisFor(layer.num, sub.id).filter(matchesFilter);
    const all = cisFor(layer.num, sub.id);
    const focus = state.selectedSub && state.selectedSub.id === sub.id;
    return `
      <div class="sub" style="border-left-color:${c}${focus ? '' : '44'}">
        <div class="sub-name">${esc(sub.name)}
          <span class="chip">${esc(sub.discipline)}</span>
          <span class="chip">${all.length} CI${all.length === 1 ? '' : 's'}</span>
        </div>
        <div class="sub-detail">${esc(sub.detail)}</div>
        <div class="muted small">${(sub.standards || []).map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>
        ${cis.map((ci) => `
          <div class="ci">
            <span class="name">${esc(ci.name)}</span>
            <span class="hosttag">${esc(ci.host)}</span>
            <span class="addr">${esc(ci.address || '')}</span>
            <span class="state ${esc(ci.state)}">${esc(ci.state)}</span>
          </div>`).join('') || '<div class="muted small">no CI filed here yet</div>'}
      </div>`;
  }).join('');

  body.innerHTML = `
    <div class="layer-head">
      <span class="layer-num" style="color:${c}">L${layer.num}</span>
      <h2>${esc(layer.name)}</h2>
    </div>
    <div class="chip" style="border-color:${c}66;color:${c}">${esc(layer.discipline)}</div>
    <p class="muted">${esc(layer.summary)}</p>
    <h3>Sub-layers</h3>
    ${subs}`;
}

function buildLegend() {
  document.getElementById('legend').innerHTML = state.osi.layers.map(
    (l) => `<span><i style="background:${l.color}"></i>L${l.num} ${esc(l.name)}</span>`,
  ).join('');
  const n = state.cmdb.cis.length;
  document.getElementById('meta').textContent =
    `${n} CIs · ${state.cmdb.hosts.length} hosts · drag to orbit · scroll to zoom`;
}

function buildHostFilter() {
  const sel = document.getElementById('host-filter');
  for (const h of state.cmdb.hosts) {
    const o = document.createElement('option');
    o.value = h.id;
    o.textContent = h.name;
    sel.appendChild(o);
  }
}

function applyFilter() {
  // dim layers that have no matching CI
  for (const L of layers) {
    const hits = state.cmdb.cis.filter((c) => c.layer === L.data.num && matchesFilter(c)).length;
    const dim = (state.filter || state.host) && hits === 0;
    L.slab.material.opacity = dim ? 0.05 : 0.16;
    L.edges.material.opacity = dim ? 0.18 : 0.85;
  }
}

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
));

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) ||
      !!(window.WebGLRenderingContext && c.getContext('webgl'));
  } catch {
    return false;
  }
}
