import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import './style.css';

const TOTAL_LAPS = 3;
const ROAD_WIDTH = 23;
const TRACK_SAMPLES = 720;
const BARRIER_OFFSET = ROAD_WIDTH / 2 + 4;
const BARRIER_DRIVE_LIMIT = BARRIER_OFFSET - 1.2;
const UP = new THREE.Vector3(0, 1, 0);

const ui = Object.fromEntries([
  'start-screen', 'start-button', 'hud', 'position', 'lap', 'race-time', 'best-time',
  'countdown', 'message', 'minimap', 'speed', 'gear', 'rpm-bar', 'surface',
  'audio-button', 'finish-screen', 'restart-button', 'result-title', 'final-position',
  'final-time', 'final-best', 'item-slot', 'item-icon', 'item-name', 'item-hint', 'effect-status'
].map(id => [id, document.getElementById(id)]));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x94a4af);
scene.fog = new THREE.FogExp2(0xa5b2b8, 0.0027);

const camera = new THREE.PerspectiveCamera(61, innerWidth / innerHeight, 0.1, 1600);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.getElementById('game').appendChild(renderer.domElement);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
pmrem.dispose();

const sky = new Sky();
sky.scale.setScalar(1200);
sky.material.uniforms.turbidity.value = 7.5;
sky.material.uniforms.rayleigh.value = 1.7;
sky.material.uniforms.mieCoefficient.value = .006;
sky.material.uniforms.mieDirectionalG.value = .82;
const skySun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(62), THREE.MathUtils.degToRad(225));
sky.material.uniforms.sunPosition.value.copy(skySun);
scene.add(sky);

const hemi = new THREE.HemisphereLight(0xe5f2ff, 0x40523a, 1.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff5df, 3.4);
sun.position.set(-120, 190, 80);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -230;
sun.shadow.camera.right = 230;
sun.shadow.camera.top = 230;
sun.shadow.camera.bottom = -230;
sun.shadow.camera.far = 500;
sun.shadow.bias = -0.0004;
scene.add(sun);

function canvasTexture(size, draw, repeat = [1, 1]) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

const grassTexture = canvasTexture(256, (ctx, s) => {
  ctx.fillStyle = '#617447'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 7000; i++) {
    const shade = 70 + Math.random() * 55;
    ctx.fillStyle = `rgb(${shade * .72},${shade},${shade * .5})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 1, 2);
  }
}, [22, 22]);

const portraitRoadTexture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/road-athletic.png`);
portraitRoadTexture.colorSpace = THREE.SRGBColorSpace;
portraitRoadTexture.wrapS = portraitRoadTexture.wrapT = THREE.RepeatWrapping;
portraitRoadTexture.repeat.set(1, 1);
portraitRoadTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

const roadBumpTexture = canvasTexture(128, (ctx, s) => {
  ctx.fillStyle = '#7f7f7f'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 10000; i++) {
    const shade = 90 + Math.random() * 75;
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 1, 1);
  }
}, [4, 1]);
roadBumpTexture.colorSpace = THREE.NoColorSpace;

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(1300, 1300),
  new THREE.MeshStandardMaterial({ map: grassTexture, color: 0x718653, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const trackPoints = [
  [-25, 0, -145], [75, 0, -140], [155, 2, -95], [184, 4, -12],
  [158, 2, 70], [92, 1, 118], [10, 3, 134], [-62, 6, 112],
  [-142, 3, 68], [-182, 1, 4], [-157, 0, -63], [-102, 0, -115]
].map(([x, y, z]) => new THREE.Vector3(x, y, z));
const trackCurve = new THREE.CatmullRomCurve3(trackPoints, true, 'centripetal', .42);

function getTrackPoint(u) {
  const point = trackCurve.getPointAt(u);
  point.y = Math.max(.05, point.y);
  return point;
}

const centers = Array.from({ length: TRACK_SAMPLES }, (_, i) => getTrackPoint(i / TRACK_SAMPLES));
const tangents = Array.from({ length: TRACK_SAMPLES }, (_, i) => trackCurve.getTangentAt(i / TRACK_SAMPLES).normalize());
const sides = tangents.map(t => new THREE.Vector3().crossVectors(UP, t).normalize());

function ribbonGeometry(width, yOffset = 0, uvRepeat = 1) {
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= TRACK_SAMPLES; i++) {
    const u = i / TRACK_SAMPLES;
    const p = getTrackPoint(u);
    const tangent = trackCurve.getTangentAt(u).normalize();
    const side = new THREE.Vector3().crossVectors(UP, tangent).normalize();
    for (const sign of [-1, 1]) {
      positions.push(p.x + side.x * width * sign, p.y + yOffset, p.z + side.z * width * sign);
      uvs.push(sign < 0 ? 0 : 1, (i / TRACK_SAMPLES) * uvRepeat);
    }
  }
  for (let i = 0; i < TRACK_SAMPLES; i++) indices.push(i*2, i*2+2, i*2+1, i*2+1, i*2+2, i*2+3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices); geo.computeVertexNormals();
  return geo;
}

const runoff = new THREE.Mesh(ribbonGeometry(ROAD_WIDTH / 2 + 4, .035, 42), new THREE.MeshStandardMaterial({ color: 0x34383a, roughness: .92, side: THREE.DoubleSide }));
runoff.receiveShadow = true; scene.add(runoff);
const road = new THREE.Mesh(ribbonGeometry(ROAD_WIDTH / 2, .065, 48), new THREE.MeshStandardMaterial({ map: portraitRoadTexture, bumpMap: roadBumpTexture, bumpScale: .09, roughness: .68, metalness: .025, side: THREE.DoubleSide }));
road.receiveShadow = true; scene.add(road);

function addTrackMarkings() {
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f1df, roughness: .75 });
  const red = new THREE.MeshStandardMaterial({ color: 0xd42b23, roughness: .7 });
  const curbGeo = new THREE.BoxGeometry(2.4, .16, .6);
  for (let i = 0; i < TRACK_SAMPLES; i += 8) {
    const p = centers[i], t = tangents[i], s = sides[i];
    const angle = Math.atan2(t.x, t.z);
    for (const sign of [-1, 1]) {
      const curb = new THREE.Mesh(curbGeo, ((i / 8) % 2) ? red : white);
      curb.position.copy(p).addScaledVector(s, sign * (ROAD_WIDTH / 2 + .1));
      curb.position.y += .14; curb.rotation.y = angle; curb.castShadow = curb.receiveShadow = true; scene.add(curb);
    }
  }
}
addTrackMarkings();

function addStartLine() {
  const group = new THREE.Group();
  const tileGeo = new THREE.BoxGeometry(1.2, .025, 1.2);
  const mats = [new THREE.MeshBasicMaterial({ color: 0xf4f4f0 }), new THREE.MeshBasicMaterial({ color: 0x161719 })];
  for (let x = -10; x < 10; x++) for (let z = 0; z < 2; z++) {
    const tile = new THREE.Mesh(tileGeo, mats[(x + z + 20) % 2]); tile.position.set(x * 1.2 + .6, 0, z * 1.2); group.add(tile);
  }
  const p = centers[0], t = tangents[0], s = sides[0];
  group.position.copy(p).add(new THREE.Vector3(0, .095, 0));
  group.rotation.y = Math.atan2(t.x, t.z);
  scene.add(group);

  const gantry = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x202326, metalness: .7, roughness: .35 });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH + 5, .4, .4), dark); beam.position.y = 7.2; gantry.add(beam);
  for (const x of [-ROAD_WIDTH/2-2, ROAD_WIDTH/2+2]) { const post = new THREE.Mesh(new THREE.BoxGeometry(.4, 7.2, .4), dark); post.position.set(x, 3.6, 0); gantry.add(post); }
  const bannerCanvas = document.createElement('canvas'); bannerCanvas.width = 1024; bannerCanvas.height = 180;
  const bannerCtx = bannerCanvas.getContext('2d'); bannerCtx.fillStyle = '#17191b'; bannerCtx.fillRect(0, 0, bannerCanvas.width, bannerCanvas.height);
  bannerCtx.fillStyle = '#ef3e2f'; bannerCtx.fillRect(0, 0, bannerCanvas.width, 15); bannerCtx.fillStyle = '#f4f4f0'; bannerCtx.font = '700 82px Arial';
  bannerCtx.textAlign = 'center'; bannerCtx.textBaseline = 'middle'; bannerCtx.fillText('APEX CIRCUIT', bannerCanvas.width / 2, bannerCanvas.height / 2 + 5);
  const bannerTexture = new THREE.CanvasTexture(bannerCanvas); bannerTexture.colorSpace = THREE.SRGBColorSpace; bannerTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 1.48), new THREE.MeshBasicMaterial({ map: bannerTexture, side: THREE.DoubleSide })); sign.position.set(0, 6.45, .24); sign.rotation.y = Math.PI; gantry.add(sign);
  const gantryIndex = 10, gantryPoint = centers[gantryIndex], gantryTangent = tangents[gantryIndex];
  gantry.position.copy(gantryPoint); gantry.position.y += .1; gantry.rotation.y = Math.atan2(gantryTangent.x, gantryTangent.z); scene.add(gantry);
}
addStartLine();

function createCar(color, number = 27) {
  const car = new THREE.Group();
  const bodyGroup = new THREE.Group(); car.add(bodyGroup);
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: .55, roughness: .18, clearcoat: 1, clearcoatRoughness: .065, envMapIntensity: 1.45 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x08090a, roughness: .2, metalness: .78, envMapIntensity: 1.2 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x070707, roughness: .92, metalness: .04 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x9da3a8, roughness: .18, metalness: .96 });
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x44484b, roughness: .35, metalness: .9 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0b202e, roughness: .04, metalness: .08, transmission: .42, transparent: true, opacity: .88, clearcoat: 1, envMapIntensity: 1.6 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xcceeff, emissive: 0x9edfff, emissiveIntensity: 4, toneMapped: false });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff281f, emissive: 0xff0800, emissiveIntensity: 3, toneMapped: false });
  const addBody = mesh => { mesh.castShadow = true; mesh.receiveShadow = true; bodyGroup.add(mesh); return mesh; };

  const chassis = addBody(new THREE.Mesh(new RoundedBoxGeometry(2.12, .44, 4.3, 6, .17), paint)); chassis.position.y = .63;
  const shoulder = addBody(new THREE.Mesh(new RoundedBoxGeometry(2.25, .25, 2.45, 5, .13), paint)); shoulder.position.set(0, .86, .33);
  const hood = addBody(new THREE.Mesh(new RoundedBoxGeometry(1.86, .22, 1.62, 5, .11), paint)); hood.position.set(0, .94, -1.25); hood.rotation.x = -.06;
  const cabin = addBody(new THREE.Mesh(new RoundedBoxGeometry(1.55, .72, 1.7, 6, .16), glass)); cabin.position.set(0, 1.23, .18); cabin.scale.set(1, 1, .84);
  const roof = addBody(new THREE.Mesh(new RoundedBoxGeometry(1.42, .1, 1.08, 4, .05), paint)); roof.position.set(0, 1.6, .28);

  const fenderGeo = new RoundedBoxGeometry(.55, .34, 1.18, 4, .14);
  for (const x of [-.91, .91]) for (const z of [-1.28, 1.28]) {
    const fender = addBody(new THREE.Mesh(fenderGeo, paint)); fender.position.set(x, .78, z);
  }
  for (const x of [-1.08, 1.08]) {
    const skirt = addBody(new THREE.Mesh(new RoundedBoxGeometry(.1, .18, 2.75, 3, .04), carbon)); skirt.position.set(x, .39, .12);
  }
  const splitter = addBody(new THREE.Mesh(new RoundedBoxGeometry(2.28, .08, .55, 3, .035), carbon)); splitter.position.set(0, .31, -2.17);
  const diffuser = addBody(new THREE.Mesh(new RoundedBoxGeometry(2.12, .13, .5, 3, .05), carbon)); diffuser.position.set(0, .34, 2.08);
  const grille = addBody(new THREE.Mesh(new RoundedBoxGeometry(1.15, .3, .06, 3, .03), carbon)); grille.position.set(0, .56, -2.17);
  const wing = addBody(new THREE.Mesh(new RoundedBoxGeometry(2.3, .1, .42, 4, .045), carbon)); wing.position.set(0, 1.12, 1.94);
  for (const x of [-.78, .78]) { const support = addBody(new THREE.Mesh(new THREE.BoxGeometry(.07, .48, .07), carbon)); support.position.set(x, .87, 1.88); }

  for (const x of [-.67, .67]) {
    const lamp = addBody(new THREE.Mesh(new RoundedBoxGeometry(.52, .16, .045, 3, .04), lampMat)); lamp.position.set(x, .76, -2.145);
    const tail = addBody(new THREE.Mesh(new RoundedBoxGeometry(.52, .14, .045, 3, .035), tailMat)); tail.position.set(x, .75, 2.145);
  }

  const wheelGeo = new THREE.CylinderGeometry(.43, .43, .35, 32);
  const rimGeo = new THREE.CylinderGeometry(.25, .25, .365, 10);
  const brakeGeo = new THREE.CylinderGeometry(.19, .19, .375, 24);
  const wheelSpinners = [], frontWheelPivots = [];
  for (const x of [-1.03, 1.03]) for (const z of [-1.35, 1.35]) {
    const steerPivot = new THREE.Group(); steerPivot.position.set(x, .47, z); car.add(steerPivot);
    const spinner = new THREE.Group(); steerPivot.add(spinner);
    const tire = new THREE.Mesh(wheelGeo, tireMat); tire.rotation.z = Math.PI / 2; tire.castShadow = true; spinner.add(tire);
    const brake = new THREE.Mesh(brakeGeo, brakeMat); brake.rotation.z = Math.PI / 2; spinner.add(brake);
    const rim = new THREE.Mesh(rimGeo, rimMat); rim.rotation.z = Math.PI / 2; spinner.add(rim);
    wheelSpinners.push(spinner); if (z < 0) frontWheelPivots.push(steerPivot);
  }

  const numberPlate = addBody(new THREE.Mesh(new RoundedBoxGeometry(.7, .26, .035, 2, .02), new THREE.MeshBasicMaterial({ color: 0xf4f4f4 })));
  numberPlate.position.set(0, .61, 2.17);
  const shield = new THREE.Mesh(new THREE.SphereGeometry(2.75, 28, 18), new THREE.MeshBasicMaterial({ color: 0x43e7ff, transparent: true, opacity: .18, wireframe: true, depthWrite: false }));
  shield.position.y = .75; shield.visible = false; car.add(shield);
  const turboFlames = new THREE.Group();
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x38dfff, transparent: true, opacity: .9, toneMapped: false });
  for (const x of [-.52, .52]) { const flame = new THREE.Mesh(new THREE.ConeGeometry(.18, .9, 12), flameMat); flame.position.set(x, .45, 2.55); flame.rotation.x = Math.PI / 2; turboFlames.add(flame); }
  turboFlames.visible = false; car.add(turboFlames);

  car.userData.body = bodyGroup;
  car.userData.wheels = wheelSpinners;
  car.userData.frontWheels = frontWheelPivots;
  car.userData.shield = shield;
  car.userData.turboFlames = turboFlames;
  car.scale.setScalar(1.05);
  return car;
}

const player = createCar(0xe1241b);
scene.add(player);
const rivalColors = [0x1966cc, 0xf2b705, 0xe5e5e5, 0x202428];
const rivals = rivalColors.map((color, i) => ({
  car: createCar(color, i + 7), progress: (TRACK_SAMPLES - 12 - i * 9) / TRACK_SAMPLES,
  speed: 42 + i * 1.2, lane: [-4.6, 4.2, -4.1, 4.8][i], laps: 0
}));
rivals.forEach(r => scene.add(r.car));

const ITEM_TYPES = [
  { id: 'turbo', name: 'TURBO', icon: 'N2O', color: '#30d5ff', duration: 4500 },
  { id: 'shield', name: 'ESCUDO', icon: 'DEF', color: '#67f2ff', duration: 7000 },
  { id: 'grip', name: 'AGARRE', icon: 'GRP', color: '#78e66d', duration: 8000 },
  { id: 'pulse', name: 'PULSO', icon: 'EMP', color: '#ffca3a', duration: 5000 }
];
let heldItem = null, boostUntil = 0, shieldUntil = 0, gripUntil = 0, pulseUntil = 0;

const pickupIconTexture = canvasTexture(128, (ctx, s) => {
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 92px Arial';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('?', s / 2, s / 2 + 5);
});

function createPickup(trackIndex, lane) {
  const pickup = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(.9, 1),
    new THREE.MeshPhysicalMaterial({ color: 0x4bdcff, emissive: 0x087da1, emissiveIntensity: 2.8, metalness: .3, roughness: .12, transparent: true, opacity: .58, transmission: .18 })
  );
  const cage = new THREE.Mesh(new THREE.IcosahedronGeometry(.95, 1), new THREE.MeshBasicMaterial({ color: 0xcaf8ff, wireframe: true, transparent: true, opacity: .75 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, .055, 8, 32), new THREE.MeshBasicMaterial({ color: 0x5ee8ff, toneMapped: false }));
  ring.rotation.x = Math.PI / 2;
  const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: pickupIconTexture, transparent: true, depthTest: false })); icon.scale.set(.82, .82, 1);
  pickup.add(shell, cage, ring, icon);
  pickup.position.copy(centers[trackIndex]).addScaledVector(sides[trackIndex], lane); pickup.position.y += 1.55;
  pickup.userData = { trackIndex, lane, baseY: pickup.position.y, active: true, respawnAt: 0, ring, cage };
  scene.add(pickup); return pickup;
}

const pickupLanes = [-3.8, 0, 3.8, -6.5, 6.5];
const pickups = Array.from({ length: 14 }, (_, i) => createPickup((42 + i * 49) % TRACK_SAMPLES, pickupLanes[i % pickupLanes.length]));

function updateItemSlot() {
  ui['item-slot'].classList.toggle('empty', !heldItem);
  ui['item-slot'].classList.toggle('ready', !!heldItem);
  ui['item-icon'].textContent = heldItem?.icon || '?';
  ui['item-name'].textContent = heldItem?.name || 'SIN OBJETO';
  ui['item-hint'].textContent = heldItem ? 'ESPACIO PARA USAR' : 'RECOGE UNA CAJA';
  ui['item-slot'].style.borderTopColor = heldItem?.color || '#747a80';
}

function collectPickup(pickup, now) {
  heldItem = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
  pickup.visible = false; pickup.userData.active = false; pickup.userData.respawnAt = now + 9000;
  updateItemSlot(); showMessage(`OBJETO · ${heldItem.name}`, 1300); audio.itemSfx(heldItem.id);
}

function useHeldItem() {
  if (!heldItem || state !== 'racing') return;
  const now = performance.now(), item = heldItem; heldItem = null;
  if (item.id === 'turbo') boostUntil = Math.max(boostUntil, now) + item.duration;
  if (item.id === 'shield') shieldUntil = Math.max(shieldUntil, now) + item.duration;
  if (item.id === 'grip') gripUntil = Math.max(gripUntil, now) + item.duration;
  if (item.id === 'pulse') pulseUntil = Math.max(pulseUntil, now) + item.duration;
  updateItemSlot(); showMessage(`${item.name} ACTIVADO`, 1400); audio.itemSfx(item.id, true);
}

function updatePickups(dt, now) {
  for (const pickup of pickups) {
    if (!pickup.userData.active && now >= pickup.userData.respawnAt) {
      pickup.userData.active = true; pickup.visible = true;
    }
    if (!pickup.userData.active) continue;
    pickup.rotation.y += dt * 1.25;
    pickup.userData.cage.rotation.x += dt * .8;
    pickup.userData.ring.rotation.z += dt * 1.7;
    pickup.position.y = pickup.userData.baseY + Math.sin(now * .003 + pickup.userData.trackIndex) * .22;
    if (state === 'racing' && !heldItem && player.position.distanceTo(pickup.position) < 2.15) collectPickup(pickup, now);
  }
}

function updateActiveEffects(now) {
  const active = [];
  if (now < boostUntil) active.push(`TURBO ${((boostUntil-now)/1000).toFixed(1)}s`);
  if (now < shieldUntil) active.push(`ESCUDO ${((shieldUntil-now)/1000).toFixed(1)}s`);
  if (now < gripUntil) active.push(`AGARRE ${((gripUntil-now)/1000).toFixed(1)}s`);
  if (now < pulseUntil) active.push(`PULSO ${((pulseUntil-now)/1000).toFixed(1)}s`);
  ui['effect-status'].textContent = active.join('  ·  ');
  player.userData.shield.visible = now < shieldUntil;
  player.userData.turboFlames.visible = now < boostUntil;
  if (player.userData.shield.visible) player.userData.shield.rotation.y += .035;
  if (player.userData.turboFlames.visible) player.userData.turboFlames.scale.z = .85 + Math.random() * .45;
}

function addEnvironment() {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x574a39, roughness: 1 });
  const leafMats = [0x274b2f, 0x365f36, 0x476b3b].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
  const trunkGeo = new THREE.CylinderGeometry(.28, .42, 3.8, 10);
  const crownGeos = [
    new THREE.ConeGeometry(2.25, 3.6, 12),
    new THREE.ConeGeometry(1.75, 3.1, 12),
    new THREE.ConeGeometry(1.22, 2.6, 12)
  ];
  for (let i = 0; i < 130; i++) {
    const a = Math.random() * Math.PI * 2, rad = 225 + Math.random() * 320;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.y = 1.9; tree.add(trunk);
    crownGeos.forEach((geometry, layer) => {
      const crown = new THREE.Mesh(geometry, leafMats[(i + layer) % leafMats.length]);
      crown.position.y = 4.6 + layer * 1.45; crown.castShadow = true; tree.add(crown);
    });
    tree.position.set(x, 0, z); tree.scale.setScalar(.75 + Math.random() * .8); scene.add(tree);
  }

  const hillMat = new THREE.MeshStandardMaterial({ color: 0x63705d, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(90 + Math.random()*70, 80 + Math.random()*70, 24), hillMat);
    const a = i / 14 * Math.PI * 2; hill.position.set(Math.cos(a)*520, 25, Math.sin(a)*520); hill.rotation.y = Math.random(); scene.add(hill);
  }

  const concrete = new THREE.MeshStandardMaterial({ color: 0xb7b9b5, roughness: .88 });
  const seat = new THREE.MeshStandardMaterial({ color: 0x314457, roughness: .8 });
  for (const [trackIndex, sign] of [[105, 1], [405, -1]]) {
    const p = centers[trackIndex], t = tangents[trackIndex], s = sides[trackIndex];
    const stand = new THREE.Group();
    for (let j = 0; j < 5; j++) { const row = new THREE.Mesh(new THREE.BoxGeometry(28, .5, 2), j % 2 ? seat : concrete); row.position.set(0, j*.65, j*1.55); stand.add(row); }
    stand.position.copy(p).addScaledVector(s, sign * 30); stand.position.y += .2;
    stand.rotation.y = Math.atan2(-t.z, t.x) + (sign < 0 ? Math.PI : 0); scene.add(stand);
  }

  const barrierMat = new THREE.MeshStandardMaterial({ color: 0xd5d8d8, metalness: .55, roughness: .45 });
  const postGeo = new THREE.BoxGeometry(.14, 1.15, .14);
  for (const sign of [-1, 1]) {
    for (const railHeight of [.38, .68, .98]) {
      const railPoints = centers.map((p, i) => p.clone().addScaledVector(sides[i], sign * BARRIER_OFFSET).add(new THREE.Vector3(0, railHeight, 0)));
      const railCurve = new THREE.CatmullRomCurve3(railPoints, true, 'centripetal', .45);
      const rail = new THREE.Mesh(new THREE.TubeGeometry(railCurve, TRACK_SAMPLES, .09, 6, true), barrierMat);
      rail.castShadow = rail.receiveShadow = true; scene.add(rail);
    }
    for (let i = 0; i < TRACK_SAMPLES; i += 8) {
      const post = new THREE.Mesh(postGeo, barrierMat);
      post.position.copy(centers[i]).addScaledVector(sides[i], sign * BARRIER_OFFSET);
      post.position.y += .57; post.castShadow = true; scene.add(post);
    }
  }
}
addEnvironment();

const keys = {};
let state = 'menu', countdownStart = 0, raceStart = 0, finishTime = 0;
let speed = 0, heading = 0, steering = 0, playerIndex = 0, previousIndex = 0, lap = 1;
let lapStart = 0, bestLap = Infinity, messageTimer = 0, cameraShake = 0;

class EngineAudio {
  constructor() { this.ctx = null; this.master = null; this.osc = []; this.muted = false; }
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain(); this.master.gain.value = .25; this.master.connect(this.ctx.destination);
    const low = this.ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 850; low.Q.value = 1.8; low.connect(this.master);
    for (const [type, gain] of [['sawtooth', .18], ['square', .045]]) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; g.gain.value = gain; o.connect(g).connect(low); o.start(); this.osc.push(o);
    }
  }
  update(kmh, throttle) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime, rpm = 42 + kmh * 1.35 + throttle * 35;
    this.osc[0].frequency.setTargetAtTime(rpm, now, .05); this.osc[1].frequency.setTargetAtTime(rpm * 2.01, now, .05);
    this.master.gain.setTargetAtTime(this.muted ? 0 : .12 + throttle * .16, now, .08);
  }
  hit() {
    if (!this.ctx || this.muted) return;
    const len = this.ctx.sampleRate * .18, b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i=0;i<len;i++) d[i]=(Math.random()*2-1)*(1-i/len);
    const src=this.ctx.createBufferSource(), g=this.ctx.createGain(); src.buffer=b; g.gain.value=.35; src.connect(g).connect(this.master); src.start();
  }
  itemSfx(id, activate = false) {
    if (!this.ctx || this.muted) return;
    const notes = { turbo: [260, 420, 680], shield: [520, 660, 820], grip: [300, 380, 470], pulse: [740, 430, 260] }[id] || [360, 520];
    notes.forEach((frequency, i) => {
      const start = this.ctx.currentTime + i * .065;
      const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
      osc.type = activate ? 'sawtooth' : 'sine'; osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(.11, start + .018); gain.gain.exponentialRampToValueAtTime(.0001, start + .16);
      osc.connect(gain).connect(this.master); osc.start(start); osc.stop(start + .18);
    });
  }
  toggle() { this.muted = !this.muted; ui['audio-button'].classList.toggle('muted', this.muted); return this.muted; }
}
const audio = new EngineAudio();

class RaceMusic {
  constructor() {
    this.player = null;
    this.ready = false;
    this.pendingPlay = false;
    this.muted = false;
    window.onYouTubeIframeAPIReady = () => this.createPlayer();
    const api = document.createElement('script');
    api.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(api);
  }
  createPlayer() {
    if (this.player || !window.YT?.Player) return;
    this.player = new window.YT.Player('youtube-player', {
      width: 320,
      height: 200,
      videoId: 'UYc5tQ85Ps8',
      playerVars: { controls: 1, playsinline: 1, rel: 0, loop: 1, playlist: 'UYc5tQ85Ps8' },
      events: {
        onReady: event => {
          this.ready = true;
          event.target.setVolume(38);
          if (this.muted) event.target.mute();
          if (this.pendingPlay) event.target.playVideo();
        },
        onStateChange: event => {
          document.getElementById('music-panel').dataset.playerState = String(event.data);
        },
        onAutoplayBlocked: () => {
          document.getElementById('music-panel').dataset.autoplayBlocked = 'true';
        }
      }
    });
  }
  play() {
    this.pendingPlay = true;
    document.getElementById('music-panel').dataset.autoplayBlocked = 'false';
    if (this.ready) {
      if (!this.muted) this.player.unMute();
      this.player.playVideo();
    }
  }
  pause() {
    this.pendingPlay = false;
    if (this.ready) this.player.pauseVideo();
  }
  setMuted(muted) {
    this.muted = muted;
    if (!this.ready) return;
    if (muted) this.player.mute(); else this.player.unMute();
  }
}
const raceMusic = new RaceMusic();

function toggleAllAudio() {
  raceMusic.setMuted(audio.toggle());
}

function placeCarOnTrack(car, progress, lane = 0) {
  const i = Math.floor(((progress % 1) + 1) % 1 * TRACK_SAMPLES);
  const p = centers[i], t = tangents[i], s = sides[i];
  car.position.copy(p).addScaledVector(s, lane); car.position.y += .12;
  car.rotation.y = Math.atan2(-t.x, -t.z);
}

function resetRace() {
  lap = 1; speed = 0; steering = 0; playerIndex = TRACK_SAMPLES - 2; previousIndex = playerIndex; bestLap = Infinity;
  heldItem = null; boostUntil = shieldUntil = gripUntil = pulseUntil = 0; updateItemSlot(); ui['effect-status'].textContent = '';
  pickups.forEach(pickup => { pickup.userData.active = true; pickup.userData.respawnAt = 0; pickup.visible = true; });
  player.userData.body.rotation.set(0, 0, 0); player.userData.body.position.y = 0;
  player.userData.shield.visible = false; player.userData.turboFlames.visible = false;
  const p = centers[playerIndex], t = tangents[playerIndex], s = sides[playerIndex];
  player.position.copy(p).addScaledVector(s, -3.8); player.position.y += .12; heading = Math.atan2(-t.x, -t.z); player.rotation.y = heading;
  rivals.forEach((r, i) => { r.progress = (TRACK_SAMPLES - 12 - i * 9) / TRACK_SAMPLES; r.laps = 0; placeCarOnTrack(r.car, r.progress, r.lane); });
  ui.lap.textContent = `1 / ${TOTAL_LAPS}`; ui['best-time'].textContent = '--:--.---'; ui.message.textContent = '';
  camera.position.copy(player.position).add(new THREE.Vector3(0, 4.8, 9));
}

function startRace() {
  audio.init(); raceMusic.play(); resetRace(); state = 'countdown'; countdownStart = performance.now();
  ui['start-screen'].classList.remove('active'); ui['finish-screen'].classList.remove('active'); ui.hud.classList.remove('hidden');
}

function nearestTrackIndex(pos, around = playerIndex) {
  let best = around, bestD = Infinity;
  for (let o = -35; o <= 35; o++) {
    const i = (around + o + TRACK_SAMPLES) % TRACK_SAMPLES;
    const dx = pos.x - centers[i].x, dz = pos.z - centers[i].z, d = dx*dx + dz*dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return [best, Math.sqrt(bestD)];
}

function resetToTrack() {
  const p = centers[playerIndex], t = tangents[playerIndex];
  player.position.copy(p); player.position.y += .15; heading = Math.atan2(-t.x, -t.z); player.rotation.y = heading; speed *= .35;
  showMessage('VEHÍCULO RECOLOCADO', 1200);
}

function showMessage(text, duration = 1500) { ui.message.textContent = text; messageTimer = performance.now() + duration; }
function formatTime(ms) {
  if (!Number.isFinite(ms)) return '--:--.---';
  const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, milli = Math.floor(ms % 1000);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(milli).padStart(3,'0')}`;
}

function updatePlayer(dt, now) {
  const accelerating = keys.KeyW || keys.ArrowUp, braking = keys.KeyS || keys.ArrowDown;
  const isBoosting = now < boostUntil, isShielded = now < shieldUntil, hasGrip = now < gripUntil;
  const [nearIndex, centerDistance] = nearestTrackIndex(player.position);
  previousIndex = playerIndex; playerIndex = nearIndex;
  const onRoad = centerDistance < ROAD_WIDTH / 2 + .5;
  const maxSpeed = isBoosting ? 94 : onRoad ? 76 : hasGrip ? 52 : 32;
  const acceleration = 21.5 + (isBoosting ? 22 : 0);
  if (accelerating) speed += (acceleration * (1 - Math.abs(speed)/104)) * dt;
  else speed -= Math.sign(speed) * Math.min(Math.abs(speed), 5.2 * dt);
  if (isBoosting) speed += 25 * dt;
  if (braking) speed -= (speed > 1 ? 33 : 12) * dt;
  speed = THREE.MathUtils.clamp(speed, -12, maxSpeed);
  if (!onRoad && !hasGrip) speed *= Math.pow(.973, dt * 60);

  const input = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
  steering = THREE.MathUtils.lerp(steering, input, 1 - Math.pow(.0008, dt));
  const steerPower = THREE.MathUtils.clamp(Math.abs(speed) / 18, .15, 1) * (1 - Math.max(0, Math.abs(speed)-60)/115) * (hasGrip ? 1.28 : 1);
  heading += steering * steerPower * 1.85 * dt * Math.sign(speed || 1);
  player.rotation.y = heading;
  player.position.x -= Math.sin(heading) * speed * dt;
  player.position.z -= Math.cos(heading) * speed * dt;
  player.position.y = THREE.MathUtils.lerp(player.position.y, centers[playerIndex].y + .14, .12);
  player.userData.wheels.forEach(w => w.rotation.x -= speed * dt / .42);
  player.userData.frontWheels.forEach(w => w.rotation.y = THREE.MathUtils.lerp(w.rotation.y, -steering * .38, .2));
  const motion = THREE.MathUtils.clamp(Math.abs(speed) / 76, 0, 1);
  player.userData.body.rotation.z = THREE.MathUtils.lerp(player.userData.body.rotation.z, -steering * motion * .105, 1 - Math.pow(.003, dt));
  player.userData.body.rotation.x = THREE.MathUtils.lerp(player.userData.body.rotation.x, braking ? -.045 : accelerating ? .026 : 0, 1 - Math.pow(.01, dt));
  player.userData.body.position.y = Math.sin(now * .018) * .014 * motion;

  const lateralOffset = player.position.clone().sub(centers[playerIndex]).dot(sides[playerIndex]);
  if (Math.abs(lateralOffset) > BARRIER_DRIVE_LIMIT) {
    const penetration = Math.abs(lateralOffset) - BARRIER_DRIVE_LIMIT;
    player.position.addScaledVector(sides[playerIndex], -Math.sign(lateralOffset) * penetration);
    if (Math.abs(speed) > 8 && !isShielded) { speed *= .55; cameraShake = .36; audio.hit(); }
  }

  for (const rival of rivals) {
    const dist = player.position.distanceTo(rival.car.position);
    if (dist < 2.55) {
      const push = player.position.clone().sub(rival.car.position).setY(0).normalize();
      player.position.addScaledVector(push, (2.55-dist)*.6);
      if (!isShielded) { speed *= .86; cameraShake = .2; }
    }
  }

  if (state === 'racing' && previousIndex > TRACK_SAMPLES * .88 && playerIndex < TRACK_SAMPLES * .12 && speed > 5) {
    const lapTime = now - lapStart;
    if (lap > 1) { bestLap = Math.min(bestLap, lapTime); ui['best-time'].textContent = formatTime(bestLap); showMessage(`VUELTA ${lap-1} · ${formatTime(lapTime)}`); }
    lap++;
    if (lap > TOTAL_LAPS) finishRace(now); else { ui.lap.textContent = `${lap} / ${TOTAL_LAPS}`; lapStart = now; }
  }

  const kmh = Math.max(0, Math.round(speed * 3.6));
  ui.speed.textContent = kmh;
  const gear = kmh < 3 ? 'N' : Math.min(6, Math.max(1, Math.floor(kmh / 40) + 1));
  ui.gear.textContent = gear;
  ui['rpm-bar'].style.width = `${Math.min(100, 28 + (kmh % 40) / 40 * 72)}%`;
  ui.surface.textContent = onRoad ? 'PISTA' : 'CÉSPED'; ui.surface.style.color = onRoad ? '#7ce080' : '#ffca3a';
  audio.update(kmh, accelerating ? 1 : 0);
}

function updateRivals(dt) {
  const now = performance.now(), pulseFactor = now < pulseUntil ? .64 : 1;
  rivals.forEach((r, idx) => {
    const old = r.progress;
    const target = (r.speed + Math.sin(now*.0007 + idx)*2.4) * pulseFactor;
    r.progress += target * dt / 1120;
    if (Math.floor(old) < Math.floor(r.progress)) r.laps++;
    const wobble = Math.sin(r.progress * 50 + idx * 1.7) * .25;
    placeCarOnTrack(r.car, r.progress, r.lane + wobble);
    r.car.userData.wheels.forEach(w => w.rotation.x -= target * dt / .42);
    r.car.userData.frontWheels.forEach(w => w.rotation.y = Math.sin(r.progress * 36 + idx) * .055);
    r.car.userData.body.rotation.z = THREE.MathUtils.lerp(r.car.userData.body.rotation.z, Math.sin(r.progress * 42 + idx) * .028, .08);
    r.car.userData.body.position.y = Math.sin(now * .012 + idx) * .012;
  });
}

function updateCamera(dt) {
  const forward = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
  const side = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
  const speedFactor = THREE.MathUtils.clamp(Math.abs(speed)/70, 0, 1);
  const desired = player.position.clone().addScaledVector(forward, -8.3 - speedFactor*2.5).add(new THREE.Vector3(0, 3.9 + speedFactor*.8, 0)).addScaledVector(side, steering*.6);
  if (cameraShake > 0) { desired.x += (Math.random()-.5)*cameraShake; desired.y += (Math.random()-.5)*cameraShake; cameraShake = Math.max(0, cameraShake-dt); }
  camera.position.lerp(desired, 1 - Math.pow(.002, dt));
  const look = player.position.clone().addScaledVector(forward, 7 + speedFactor*5).add(new THREE.Vector3(0,1.15,0));
  camera.lookAt(look);
  const boostFov = performance.now() < boostUntil ? 7 : 0;
  camera.fov = THREE.MathUtils.lerp(camera.fov, 61 + speedFactor*9 + boostFov, 1-Math.pow(.02,dt)); camera.updateProjectionMatrix();
}

function standingsPosition() {
  const playerScore = (lap - 1) + playerIndex / TRACK_SAMPLES;
  return 1 + rivals.filter(r => r.laps + (r.progress % 1) > playerScore).length;
}

function finishRace(now) {
  state = 'finished'; finishTime = now - raceStart; speed *= .7; raceMusic.pause();
  const finalLap = now - lapStart; bestLap = Math.min(bestLap, finalLap);
  const pos = standingsPosition();
  ui['final-position'].textContent = `${pos}º`; ui['result-title'].textContent = pos === 1 ? 'Victoria' : pos <= 3 ? 'Podio' : 'Completado';
  ui['final-time'].textContent = formatTime(finishTime); ui['final-best'].textContent = formatTime(bestLap);
  setTimeout(() => { ui.hud.classList.add('hidden'); ui['finish-screen'].classList.add('active'); }, 1200);
}

function drawMinimap() {
  const c = ui.minimap, ctx = c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height);
  const xs=centers.map(p=>p.x), zs=centers.map(p=>p.z), minX=Math.min(...xs), maxX=Math.max(...xs), minZ=Math.min(...zs), maxZ=Math.max(...zs);
  const scale=Math.min(180/(maxX-minX),140/(maxZ-minZ)), ox=(c.width-(maxX-minX)*scale)/2, oy=(c.height-(maxZ-minZ)*scale)/2;
  const pt=p=>[ox+(p.x-minX)*scale,oy+(p.z-minZ)*scale];
  ctx.lineJoin='round'; ctx.lineCap='round'; ctx.beginPath(); centers.forEach((p,i)=>{const [x,y]=pt(p); i?ctx.lineTo(x,y):ctx.moveTo(x,y)}); ctx.closePath(); ctx.strokeStyle='rgba(7,8,9,.55)';ctx.lineWidth=11;ctx.stroke();ctx.strokeStyle='#c8ccce';ctx.lineWidth=3;ctx.stroke();
  rivals.forEach(r=>{const [x,y]=pt(r.car.position);ctx.fillStyle='#e8eaeb';ctx.beginPath();ctx.arc(x,y,2.5,0,Math.PI*2);ctx.fill()});
  const [x,y]=pt(player.position);ctx.fillStyle='#ef3e2f';ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();
}

function updateCountdown(now) {
  const elapsed = now - countdownStart;
  if (elapsed < 1000) ui.countdown.textContent = '3';
  else if (elapsed < 2000) ui.countdown.textContent = '2';
  else if (elapsed < 3000) ui.countdown.textContent = '1';
  else if (elapsed < 3700) { ui.countdown.textContent = 'GO'; ui.countdown.classList.add('go'); if (state === 'countdown') { state='racing'; raceStart=now; lapStart=now; } }
  else { ui.countdown.textContent=''; ui.countdown.classList.remove('go'); }
}

function animate(now = performance.now()) {
  requestAnimationFrame(animate);
  const dt = Math.min(.033, (now - (animate.last || now)) / 1000); animate.last = now;
  updatePickups(dt, now);
  updateActiveEffects(now);
  if (state === 'menu') {
    const p=centers[TRACK_SAMPLES-2], t=tangents[TRACK_SAMPLES-2]; camera.position.lerp(p.clone().add(new THREE.Vector3(15,5,13)),.03); camera.lookAt(p.clone().addScaledVector(t,5));
  } else {
    if (state === 'countdown' || (state === 'racing' && ui.countdown.textContent)) updateCountdown(now);
    if (state === 'racing' || state === 'finished') updatePlayer(dt,now);
    if (state === 'racing' || state === 'finished') updateRivals(dt);
    updateCamera(dt); drawMinimap();
    if (state === 'racing') { ui['race-time'].textContent=formatTime(now-raceStart); ui.position.textContent=standingsPosition(); }
    if (messageTimer && now > messageTimer) { ui.message.textContent=''; messageTimer=0; }
  }
  renderer.render(scene,camera);
}

ui['start-button'].addEventListener('click', startRace);
ui['restart-button'].addEventListener('click', startRace);
ui['audio-button'].addEventListener('click', toggleAllAudio);
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyR' && state !== 'menu') resetToTrack();
  if (e.code === 'KeyM') toggleAllAudio();
  if (e.code === 'Space' && !e.repeat) useHeldItem();
  if (e.code === 'Enter' && (state === 'menu' || state === 'finished')) startRace();
});
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('resize', () => { camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });

resetRace();
animate();
