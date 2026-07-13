import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Sky } from 'three/addons/objects/Sky.js';
import './style.css';

const TOTAL_LAPS = 3;
const ROAD_WIDTH = 15;
const TRACK_SAMPLES = 720;
const BARRIER_OFFSET = ROAD_WIDTH / 2 + 3.25;
const BARRIER_DRIVE_LIMIT = BARRIER_OFFSET - 1.2;
const UP = new THREE.Vector3(0, 1, 0);

const ui = Object.fromEntries([
  'start-screen', 'start-button', 'hud', 'position', 'lap', 'race-time', 'best-time',
  'countdown', 'message', 'minimap', 'speed', 'gear', 'rpm-bar', 'surface',
  'audio-button', 'finish-screen', 'restart-button', 'result-title', 'final-position',
  'final-time', 'final-best'
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
renderer.toneMappingExposure = 1.05;
document.getElementById('game').appendChild(renderer.domElement);

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

const portraitRoadTexture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/road-portrait.jpeg`);
portraitRoadTexture.colorSpace = THREE.SRGBColorSpace;
portraitRoadTexture.wrapS = portraitRoadTexture.wrapT = THREE.RepeatWrapping;
portraitRoadTexture.repeat.set(1, 1);
portraitRoadTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

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

const runoff = new THREE.Mesh(ribbonGeometry(ROAD_WIDTH / 2 + 3, .035, 42), new THREE.MeshStandardMaterial({ color: 0x34383a, roughness: .92, side: THREE.DoubleSide }));
runoff.receiveShadow = true; scene.add(runoff);
const road = new THREE.Mesh(ribbonGeometry(ROAD_WIDTH / 2, .065, 48), new THREE.MeshStandardMaterial({ map: portraitRoadTexture, roughness: .76, metalness: .02, side: THREE.DoubleSide }));
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
  for (let x = -6; x < 6; x++) for (let z = 0; z < 2; z++) {
    const tile = new THREE.Mesh(tileGeo, mats[(x + z + 20) % 2]); tile.position.set(x * 1.2 + .6, 0, z * 1.2); group.add(tile);
  }
  const p = centers[0], t = tangents[0], s = sides[0];
  group.position.copy(p).add(new THREE.Vector3(0, .095, 0));
  group.rotation.y = Math.atan2(t.x, t.z);
  scene.add(group);

  const gantry = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x202326, metalness: .7, roughness: .35 });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH + 5, .5, .5), dark); beam.position.y = 6; gantry.add(beam);
  for (const x of [-ROAD_WIDTH/2-2, ROAD_WIDTH/2+2]) { const post = new THREE.Mesh(new THREE.BoxGeometry(.45, 6, .45), dark); post.position.set(x, 3, 0); gantry.add(post); }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(7, 1.7, .28), new THREE.MeshStandardMaterial({ color: 0x17191b })); sign.position.set(0, 5.6, .05); gantry.add(sign);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(6.4, .18, .3), new THREE.MeshBasicMaterial({ color: 0xef3e2f })); stripe.position.set(0, 5.05, .21); gantry.add(stripe);
  gantry.position.copy(p); gantry.position.y += .1; gantry.rotation.y = Math.atan2(t.x, t.z); scene.add(gantry);
}
addStartLine();

function createCar(color, number = 27) {
  const car = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: .62, roughness: .2, clearcoat: 1, clearcoatRoughness: .1 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x090a0b, roughness: .27, metalness: .72 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x090909, roughness: .96 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x777b7e, roughness: .22, metalness: .92 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x102631, roughness: .06, metalness: .12, transmission: .32, transparent: true, opacity: .86, clearcoat: 1 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(2.08, .5, 4.28, 5, .18), paint); body.position.y = .64; body.castShadow = true; car.add(body);
  const hood = new THREE.Mesh(new RoundedBoxGeometry(1.9, .25, 1.55, 4, .12), paint); hood.position.set(0, .93, -1.2); hood.rotation.x = -.055; hood.castShadow = true; car.add(hood);
  const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.58, .7, 1.72, 5, .16), glass); cabin.position.set(0, 1.2, .17); cabin.scale.set(1, 1, .84); cabin.castShadow = true; car.add(cabin);
  const roof = new THREE.Mesh(new RoundedBoxGeometry(1.42, .1, 1.12, 3, .06), paint); roof.position.set(0, 1.57, .25); car.add(roof);
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(2.22, .09, .5), carbon); splitter.position.set(0, .34, -2.16); car.add(splitter);
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(2.1, .13, .45), carbon); diffuser.position.set(0, .36, 2.08); car.add(diffuser);
  const wing = new THREE.Mesh(new RoundedBoxGeometry(2.3, .11, .42, 3, .045), carbon); wing.position.set(0, 1.08, 1.9); car.add(wing);
  for (const x of [-.82, .82]) { const support = new THREE.Mesh(new THREE.BoxGeometry(.08, .48, .08), carbon); support.position.set(x, .82, 1.82); car.add(support); }
  const wheelGeo = new THREE.CylinderGeometry(.42, .42, .34, 28);
  const rimGeo = new THREE.CylinderGeometry(.235, .235, .355, 12);
  for (const x of [-1.03, 1.03]) for (const z of [-1.35, 1.35]) {
    const wheel = new THREE.Group(); wheel.position.set(x, .47, z); wheel.name = 'wheel';
    const tire = new THREE.Mesh(wheelGeo, tireMat); tire.rotation.z = Math.PI / 2; tire.castShadow = true; wheel.add(tire);
    const rim = new THREE.Mesh(rimGeo, rimMat); rim.rotation.z = Math.PI / 2; wheel.add(rim); car.add(wheel);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff1710 });
  for (const x of [-.68, .68]) { const tail = new THREE.Mesh(new THREE.BoxGeometry(.48, .13, .06), tailMat); tail.position.set(x, .72, 2.14); car.add(tail); }
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xe9f7ff });
  for (const x of [-.68, .68]) { const lamp = new THREE.Mesh(new RoundedBoxGeometry(.5, .15, .045, 3, .04), headlightMat); lamp.position.set(x, .73, -2.145); car.add(lamp); }
  const numberPlate = new THREE.Mesh(new THREE.BoxGeometry(.68, .27, .04), new THREE.MeshBasicMaterial({ color: number === 27 ? 0xffffff : 0xdddddd })); numberPlate.position.set(0, .63, 2.17); car.add(numberPlate);
  car.userData.wheels = car.children.filter(c => c.name === 'wheel');
  car.scale.setScalar(1.03);
  return car;
}

const player = createCar(0xe1241b);
scene.add(player);
const rivalColors = [0x1966cc, 0xf2b705, 0xe5e5e5, 0x202428];
const rivals = rivalColors.map((color, i) => ({
  car: createCar(color, i + 7), progress: (TRACK_SAMPLES - 12 - i * 9) / TRACK_SAMPLES,
  speed: 42 + i * 1.2, lane: [-2.5, 2.3, -2.1, 2.6][i], laps: 0
}));
rivals.forEach(r => scene.add(r.car));

function addEnvironment() {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x574a39, roughness: 1 });
  const leafMats = [0x274b2f, 0x365f36, 0x476b3b].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
  const trunkGeo = new THREE.CylinderGeometry(.28, .42, 3.5, 7);
  const crownGeo = new THREE.ConeGeometry(2.1, 5.5, 9);
  for (let i = 0; i < 130; i++) {
    const a = Math.random() * Math.PI * 2, rad = 225 + Math.random() * 320;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.y = 1.75; tree.add(trunk);
    const crown = new THREE.Mesh(crownGeo, leafMats[i % leafMats.length]); crown.position.y = 5; crown.castShadow = true; tree.add(crown);
    tree.position.set(x, 0, z); tree.scale.setScalar(.75 + Math.random() * .8); scene.add(tree);
  }

  const hillMat = new THREE.MeshStandardMaterial({ color: 0x63705d, roughness: 1 });
  for (let i = 0; i < 14; i++) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(90 + Math.random()*70, 80 + Math.random()*70, 8), hillMat);
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
  toggle() { this.muted = !this.muted; ui['audio-button'].classList.toggle('muted', this.muted); }
}
const audio = new EngineAudio();

function placeCarOnTrack(car, progress, lane = 0) {
  const i = Math.floor(((progress % 1) + 1) % 1 * TRACK_SAMPLES);
  const p = centers[i], t = tangents[i], s = sides[i];
  car.position.copy(p).addScaledVector(s, lane); car.position.y += .12;
  car.rotation.y = Math.atan2(-t.x, -t.z);
}

function resetRace() {
  lap = 1; speed = 0; steering = 0; playerIndex = TRACK_SAMPLES - 2; previousIndex = playerIndex; bestLap = Infinity;
  const p = centers[playerIndex], t = tangents[playerIndex], s = sides[playerIndex];
  player.position.copy(p).addScaledVector(s, -2.1); player.position.y += .12; heading = Math.atan2(-t.x, -t.z); player.rotation.y = heading;
  rivals.forEach((r, i) => { r.progress = (TRACK_SAMPLES - 12 - i * 9) / TRACK_SAMPLES; r.laps = 0; placeCarOnTrack(r.car, r.progress, r.lane); });
  ui.lap.textContent = `1 / ${TOTAL_LAPS}`; ui['best-time'].textContent = '--:--.---'; ui.message.textContent = '';
  camera.position.copy(player.position).add(new THREE.Vector3(0, 4.8, 9));
}

function startRace() {
  audio.init(); resetRace(); state = 'countdown'; countdownStart = performance.now();
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
  const [nearIndex, centerDistance] = nearestTrackIndex(player.position);
  previousIndex = playerIndex; playerIndex = nearIndex;
  const onRoad = centerDistance < ROAD_WIDTH / 2 + .5;
  const maxSpeed = onRoad ? 71 : 30;
  if (accelerating) speed += (20.5 * (1 - Math.abs(speed)/82)) * dt;
  else speed -= Math.sign(speed) * Math.min(Math.abs(speed), 5.2 * dt);
  if (braking) speed -= (speed > 1 ? 33 : 12) * dt;
  speed = THREE.MathUtils.clamp(speed, -12, maxSpeed);
  if (!onRoad) speed *= Math.pow(.975, dt * 60);

  const input = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
  steering = THREE.MathUtils.lerp(steering, input, 1 - Math.pow(.0008, dt));
  const steerPower = THREE.MathUtils.clamp(Math.abs(speed) / 18, .15, 1) * (1 - Math.max(0, Math.abs(speed)-55)/100);
  heading += steering * steerPower * 1.85 * dt * Math.sign(speed || 1);
  player.rotation.y = heading;
  player.position.x -= Math.sin(heading) * speed * dt;
  player.position.z -= Math.cos(heading) * speed * dt;
  player.position.y = THREE.MathUtils.lerp(player.position.y, centers[playerIndex].y + .14, .12);
  player.userData.wheels.forEach(w => w.rotation.x -= speed * dt / .42);

  const lateralOffset = player.position.clone().sub(centers[playerIndex]).dot(sides[playerIndex]);
  if (Math.abs(lateralOffset) > BARRIER_DRIVE_LIMIT) {
    const penetration = Math.abs(lateralOffset) - BARRIER_DRIVE_LIMIT;
    player.position.addScaledVector(sides[playerIndex], -Math.sign(lateralOffset) * penetration);
    if (Math.abs(speed) > 8) { speed *= .55; cameraShake = .36; audio.hit(); }
  }

  for (const rival of rivals) {
    const dist = player.position.distanceTo(rival.car.position);
    if (dist < 2.55) {
      const push = player.position.clone().sub(rival.car.position).setY(0).normalize();
      player.position.addScaledVector(push, (2.55-dist)*.6); speed *= .86; cameraShake = .2;
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
  rivals.forEach((r, idx) => {
    const old = r.progress;
    const target = r.speed + Math.sin(performance.now()*.0007 + idx)*2.4;
    r.progress += target * dt / 1120;
    if (Math.floor(old) < Math.floor(r.progress)) r.laps++;
    const wobble = Math.sin(r.progress * 50 + idx * 1.7) * .25;
    placeCarOnTrack(r.car, r.progress, r.lane + wobble);
    r.car.userData.wheels.forEach(w => w.rotation.x -= target * dt / .42);
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
  camera.fov = THREE.MathUtils.lerp(camera.fov, 61 + speedFactor*9, 1-Math.pow(.02,dt)); camera.updateProjectionMatrix();
}

function standingsPosition() {
  const playerScore = (lap - 1) + playerIndex / TRACK_SAMPLES;
  return 1 + rivals.filter(r => r.laps + (r.progress % 1) > playerScore).length;
}

function finishRace(now) {
  state = 'finished'; finishTime = now - raceStart; speed *= .7;
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
ui['audio-button'].addEventListener('click', () => audio.toggle());
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyR' && state !== 'menu') resetToTrack();
  if (e.code === 'KeyM') audio.toggle();
  if (e.code === 'Enter' && (state === 'menu' || state === 'finished')) startRace();
});
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('resize', () => { camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });

resetRace();
animate();
