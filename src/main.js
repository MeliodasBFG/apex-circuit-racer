import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ModernRaceAudio } from './audio.js';
import { TRACKS, THEMES, getSelectedTrack } from './tracks.js';
import './style.css';

const CURRENT_TRACK = getSelectedTrack();
const THEME = THEMES[CURRENT_TRACK.theme];
const TOTAL_LAPS = CURRENT_TRACK.laps;
const ROAD_WIDTH = CURRENT_TRACK.width;
const TRACK_SAMPLES = 720;
const BARRIER_OFFSET = ROAD_WIDTH / 2 + 4;
const BARRIER_DRIVE_LIMIT = BARRIER_OFFSET - 1.15;
const UP = new THREE.Vector3(0, 1, 0);

document.documentElement.style.setProperty('--accent', CURRENT_TRACK.accent);

const ui = Object.fromEntries([
  'start-screen', 'start-button', 'hud', 'position', 'lap', 'race-time', 'best-time',
  'countdown', 'message', 'minimap', 'speed', 'gear', 'rpm-bar', 'surface',
  'audio-button', 'finish-screen', 'restart-button', 'menu-button', 'result-title',
  'final-position', 'final-time', 'final-best', 'item-slot', 'item-icon', 'item-name',
  'item-icon-2', 'item-name-2', 'item-hint', 'effect-status', 'track-title',
  'track-subtitle', 'track-eyebrow', 'track-selector', 'track-count', 'guide-button',
  'guide-close', 'item-guide', 'item-guide-list'
].map(id => [id, document.getElementById(id)]));

const scene = new THREE.Scene();
scene.background = new THREE.Color(THEME.background);
scene.fog = new THREE.FogExp2(THEME.fog, THEME.fogDensity);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, .1, 1800);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = THEME.exposure;
document.getElementById('game').appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  CURRENT_TRACK.theme === 'city' ? .34 : .16,
  .52,
  CURRENT_TRACK.theme === 'city' ? .72 : .9
);
composer.addPass(bloomPass);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
pmrem.dispose();

const sky = new Sky();
sky.scale.setScalar(1500);
sky.material.uniforms.turbidity.value = CURRENT_TRACK.theme === 'desert' ? 11 : 7.2;
sky.material.uniforms.rayleigh.value = CURRENT_TRACK.theme === 'city' ? .35 : 1.55;
sky.material.uniforms.mieCoefficient.value = CURRENT_TRACK.theme === 'jungle' ? .014 : .006;
sky.material.uniforms.mieDirectionalG.value = .82;
const skySun = new THREE.Vector3().setFromSphericalCoords(
  1,
  THREE.MathUtils.degToRad(90 - THEME.sunElevation),
  THREE.MathUtils.degToRad(THEME.sunAzimuth)
);
sky.material.uniforms.sunPosition.value.copy(skySun);
sky.visible = CURRENT_TRACK.theme !== 'city';
scene.add(sky);

const hemi = new THREE.HemisphereLight(THEME.hemiSky, THEME.hemiGround, THEME.hemiIntensity);
scene.add(hemi);
const sun = new THREE.DirectionalLight(THEME.sunColor, THEME.sunIntensity);
sun.position.copy(skySun).multiplyScalar(310);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -310;
sun.shadow.camera.right = 310;
sun.shadow.camera.top = 310;
sun.shadow.camera.bottom = -310;
sun.shadow.camera.near = 20;
sun.shadow.camera.far = 780;
sun.shadow.bias = -.00035;
scene.add(sun);

function seededRandom(seedText) {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) seed = Math.imul(seed ^ seedText.charCodeAt(i), 16777619);
  return () => {
    seed += 0x6D2B79F5;
    let value = seed;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const worldRandom = seededRandom(CURRENT_TRACK.id);

function canvasTexture(size, draw, repeat = [1, 1], colorSpace = THREE.SRGBColorSpace) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  draw(context, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = Math.min(12, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function makeGroundTexture() {
  return canvasTexture(512, (context, size) => {
    context.fillStyle = THEME.groundBase;
    context.fillRect(0, 0, size, size);
    for (let i = 0; i < 23000; i++) {
      const alpha = .08 + worldRandom() * .2;
      context.globalAlpha = alpha;
      context.fillStyle = worldRandom() > .5 ? THEME.groundNoise : THEME.groundBase;
      const grain = worldRandom() > .9 ? 3 : 1;
      context.fillRect(worldRandom() * size, worldRandom() * size, grain, grain);
    }
    context.globalAlpha = 1;
  }, [30, 30]);
}

function makeRoadTexture(style) {
  if (style === 'portrait') {
    const texture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}assets/road-athletic.png`);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(12, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  const palettes = {
    coarse: [48, 51, 52],
    dusty: [73, 63, 54],
    wet: [31, 39, 38],
    urban: [36, 39, 44],
    cold: [61, 68, 72],
    patched: [47, 52, 53]
  };
  const base = palettes[style] || palettes.coarse;
  const random = seededRandom(`${CURRENT_TRACK.id}-road`);

  return canvasTexture(512, (context, size) => {
    const image = context.createImageData(size, size);
    for (let i = 0; i < image.data.length; i += 4) {
      const noise = (random() - .5) * (style === 'coarse' ? 34 : 22);
      image.data[i] = base[0] + noise;
      image.data[i + 1] = base[1] + noise;
      image.data[i + 2] = base[2] + noise;
      image.data[i + 3] = 255;
    }
    context.putImageData(image, 0, 0);

    const edge = context.createLinearGradient(0, 0, size, 0);
    const edgeColor = style === 'dusty' ? 'rgba(181,122,72,.44)' : style === 'cold' ? 'rgba(212,226,232,.25)' : 'rgba(0,0,0,.18)';
    edge.addColorStop(0, edgeColor);
    edge.addColorStop(.09, 'transparent');
    edge.addColorStop(.91, 'transparent');
    edge.addColorStop(1, edgeColor);
    context.fillStyle = edge;
    context.fillRect(0, 0, size, size);

    context.lineCap = 'round';
    if (style === 'wet') {
      for (let i = 0; i < 20; i++) {
        context.strokeStyle = `rgba(185,215,205,${.025 + random() * .05})`;
        context.lineWidth = 2 + random() * 8;
        context.beginPath();
        context.moveTo(random() * size, 0);
        context.lineTo(random() * size, size);
        context.stroke();
      }
    } else {
      context.strokeStyle = 'rgba(9,11,12,.28)';
      for (let i = 0; i < 24; i++) {
        let x = random() * size;
        let y = random() * size;
        context.lineWidth = .5 + random() * 1.4;
        context.beginPath();
        context.moveTo(x, y);
        for (let p = 0; p < 5; p++) {
          x += (random() - .5) * 22;
          y += 8 + random() * 24;
          context.lineTo(x, y);
        }
        context.stroke();
      }
    }

    if (style === 'urban' || style === 'patched') {
      for (let i = 0; i < 14; i++) {
        const shade = style === 'urban' ? 27 : 38;
        context.fillStyle = `rgba(${shade},${shade + 2},${shade + 3},${.24 + random() * .24})`;
        context.fillRect(random() * size, random() * size, 35 + random() * 90, 22 + random() * 65);
      }
    }
  });
}

const groundTexture = makeGroundTexture();
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(1800, 1800),
  new THREE.MeshStandardMaterial({ map: groundTexture, color: 0xffffff, roughness: 1, envMapIntensity: .35 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -.03;
ground.receiveShadow = true;
scene.add(ground);

const trackPoints = CURRENT_TRACK.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
const trackCurve = new THREE.CatmullRomCurve3(trackPoints, true, 'centripetal', .42);
const trackLength = trackCurve.getLength();

function getTrackPoint(u) {
  const point = trackCurve.getPointAt(((u % 1) + 1) % 1);
  point.y = Math.max(.08, point.y);
  return point;
}

const centers = Array.from({ length: TRACK_SAMPLES }, (_, index) => getTrackPoint(index / TRACK_SAMPLES));
const tangents = Array.from({ length: TRACK_SAMPLES }, (_, index) => trackCurve.getTangentAt(index / TRACK_SAMPLES).normalize());
const sides = tangents.map(tangent => new THREE.Vector3().crossVectors(UP, tangent).normalize());

function ribbonGeometry(width, yOffset = 0, uvRepeat = 1) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let index = 0; index <= TRACK_SAMPLES; index++) {
    const u = index / TRACK_SAMPLES;
    const point = getTrackPoint(u);
    const tangent = trackCurve.getTangentAt(u).normalize();
    const side = new THREE.Vector3().crossVectors(UP, tangent).normalize();
    for (const sign of [-1, 1]) {
      positions.push(point.x + side.x * width * sign, point.y + yOffset, point.z + side.z * width * sign);
      uvs.push(sign < 0 ? 0 : 1, u * uvRepeat);
    }
  }
  for (let index = 0; index < TRACK_SAMPLES; index++) {
    indices.push(index * 2, index * 2 + 2, index * 2 + 1, index * 2 + 1, index * 2 + 2, index * 2 + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const roadTexture = makeRoadTexture(CURRENT_TRACK.roadStyle);
const roadBumpTexture = canvasTexture(128, (context, size) => {
  const image = context.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const shade = 92 + Math.random() * 76;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = shade;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}, [5, 1], THREE.NoColorSpace);

const roadRoughness = { portrait: .66, coarse: .84, dusty: .9, wet: .34, urban: .72, cold: .78, patched: .81 }[CURRENT_TRACK.roadStyle];
const runoff = new THREE.Mesh(
  ribbonGeometry(ROAD_WIDTH / 2 + 4, .035, Math.max(30, trackLength / 22)),
  new THREE.MeshStandardMaterial({ color: THEME.runoff, roughness: .9, side: THREE.DoubleSide })
);
runoff.receiveShadow = true;
scene.add(runoff);
const road = new THREE.Mesh(
  ribbonGeometry(ROAD_WIDTH / 2, .07, Math.max(30, trackLength / 22)),
  new THREE.MeshStandardMaterial({
    map: roadTexture,
    bumpMap: roadBumpTexture,
    bumpScale: CURRENT_TRACK.roadStyle === 'wet' ? .045 : .095,
    roughness: roadRoughness,
    metalness: CURRENT_TRACK.roadStyle === 'wet' ? .11 : .025,
    envMapIntensity: CURRENT_TRACK.roadStyle === 'wet' ? 1.35 : .8,
    side: THREE.DoubleSide
  })
);
road.receiveShadow = true;
scene.add(road);

function addTrackMarkings() {
  const white = new THREE.MeshStandardMaterial({ color: CURRENT_TRACK.theme === 'snow' ? 0x8ec9e8 : 0xf1f0e8, roughness: .74 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(CURRENT_TRACK.accent), roughness: .7 });
  const curbGeometry = new THREE.BoxGeometry(2.45, .16, .62);
  for (let index = 0; index < TRACK_SAMPLES; index += 8) {
    const point = centers[index];
    const tangent = tangents[index];
    const side = sides[index];
    const angle = Math.atan2(tangent.x, tangent.z);
    for (const sign of [-1, 1]) {
      const curb = new THREE.Mesh(curbGeometry, (index / 8) % 2 ? accent : white);
      curb.position.copy(point).addScaledVector(side, sign * (ROAD_WIDTH / 2 + .12));
      curb.position.y += .15;
      curb.rotation.y = angle;
      curb.castShadow = curb.receiveShadow = true;
      scene.add(curb);
    }
  }
}
addTrackMarkings();

function addStartLine() {
  const line = new THREE.Group();
  const tileSize = 1.2;
  const tileCount = Math.ceil(ROAD_WIDTH / tileSize);
  const tileGeometry = new THREE.BoxGeometry(tileSize, .025, tileSize);
  const materials = [new THREE.MeshBasicMaterial({ color: 0xf4f4f0 }), new THREE.MeshBasicMaterial({ color: 0x151719 })];
  for (let x = 0; x < tileCount; x++) {
    for (let z = 0; z < 2; z++) {
      const tile = new THREE.Mesh(tileGeometry, materials[(x + z) % 2]);
      tile.position.set((x - tileCount / 2 + .5) * tileSize, 0, z * tileSize);
      line.add(tile);
    }
  }
  const point = centers[0];
  const tangent = tangents[0];
  line.position.copy(point).add(new THREE.Vector3(0, .098, 0));
  line.rotation.y = Math.atan2(tangent.x, tangent.z);
  scene.add(line);

  const gantry = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x171b1f, metalness: .78, roughness: .28 });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(ROAD_WIDTH + 5, .38, .38), dark);
  beam.position.y = 7.4;
  gantry.add(beam);
  for (const x of [-ROAD_WIDTH / 2 - 2, ROAD_WIDTH / 2 + 2]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(.38, 7.4, .38), dark);
    post.position.set(x, 3.7, 0);
    post.castShadow = true;
    gantry.add(post);
  }

  const bannerCanvas = document.createElement('canvas');
  bannerCanvas.width = 1200;
  bannerCanvas.height = 190;
  const bannerContext = bannerCanvas.getContext('2d');
  bannerContext.fillStyle = '#111418';
  bannerContext.fillRect(0, 0, bannerCanvas.width, bannerCanvas.height);
  bannerContext.fillStyle = CURRENT_TRACK.accent;
  bannerContext.fillRect(0, 0, bannerCanvas.width, 14);
  bannerContext.fillStyle = '#f4f6f7';
  bannerContext.font = `700 ${CURRENT_TRACK.name.length > 18 ? 64 : 76}px Arial`;
  bannerContext.textAlign = 'center';
  bannerContext.textBaseline = 'middle';
  bannerContext.fillText(CURRENT_TRACK.name.toUpperCase(), bannerCanvas.width / 2, bannerCanvas.height / 2 + 7);
  const bannerTexture = new THREE.CanvasTexture(bannerCanvas);
  bannerTexture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(10.8, 1.72),
    new THREE.MeshBasicMaterial({ map: bannerTexture, side: THREE.DoubleSide })
  );
  sign.position.set(0, 6.55, .24);
  sign.rotation.y = Math.PI;
  gantry.add(sign);
  const gantryIndex = 11;
  gantry.position.copy(centers[gantryIndex]);
  gantry.position.y += .1;
  gantry.rotation.y = Math.atan2(tangents[gantryIndex].x, tangents[gantryIndex].z);
  scene.add(gantry);
}
addStartLine();

function createCar(color) {
  const car = new THREE.Group();
  const bodyGroup = new THREE.Group();
  car.add(bodyGroup);
  const paint = new THREE.MeshPhysicalMaterial({
    color,
    metalness: .58,
    roughness: .16,
    clearcoat: 1,
    clearcoatRoughness: .055,
    envMapIntensity: 1.55,
    transparent: true
  });
  const carbon = new THREE.MeshStandardMaterial({
    color: 0x07090a,
    roughness: .19,
    metalness: .8,
    envMapIntensity: 1.25,
    transparent: true
  });
  const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x050606, roughness: .94, metalness: .03 });
  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xaeb4b8, roughness: .15, metalness: .97 });
  const brakeMaterial = new THREE.MeshStandardMaterial({ color: 0x3f4447, roughness: .35, metalness: .9 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0a1d29,
    roughness: .035,
    metalness: .08,
    transmission: .42,
    transparent: true,
    opacity: .88,
    clearcoat: 1,
    envMapIntensity: 1.7
  });
  const headlightMaterial = new THREE.MeshStandardMaterial({ color: 0xdff4ff, emissive: 0xb8e8ff, emissiveIntensity: 4.2, toneMapped: false });
  const tailMaterial = new THREE.MeshStandardMaterial({ color: 0xff3028, emissive: 0xff0900, emissiveIntensity: 2.8, toneMapped: false });
  const addBody = mesh => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    bodyGroup.add(mesh);
    return mesh;
  };

  const chassis = addBody(new THREE.Mesh(new RoundedBoxGeometry(2.12, .44, 4.3, 6, .17), paint));
  chassis.position.y = .63;
  const shoulder = addBody(new THREE.Mesh(new RoundedBoxGeometry(2.25, .25, 2.45, 5, .13), paint));
  shoulder.position.set(0, .86, .33);
  const hood = addBody(new THREE.Mesh(new RoundedBoxGeometry(1.86, .22, 1.62, 5, .11), paint));
  hood.position.set(0, .94, -1.25);
  hood.rotation.x = -.06;
  const cabin = addBody(new THREE.Mesh(new RoundedBoxGeometry(1.55, .72, 1.7, 6, .16), glass));
  cabin.position.set(0, 1.23, .18);
  cabin.scale.set(1, 1, .84);
  const roof = addBody(new THREE.Mesh(new RoundedBoxGeometry(1.42, .1, 1.08, 4, .05), paint));
  roof.position.set(0, 1.6, .28);

  const fenderGeometry = new RoundedBoxGeometry(.55, .34, 1.18, 4, .14);
  for (const x of [-.91, .91]) {
    for (const z of [-1.28, 1.28]) {
      const fender = addBody(new THREE.Mesh(fenderGeometry, paint));
      fender.position.set(x, .78, z);
    }
  }
  for (const x of [-1.08, 1.08]) {
    const skirt = addBody(new THREE.Mesh(new RoundedBoxGeometry(.1, .18, 2.75, 3, .04), carbon));
    skirt.position.set(x, .39, .12);
  }
  const splitter = addBody(new THREE.Mesh(new RoundedBoxGeometry(2.28, .08, .55, 3, .035), carbon));
  splitter.position.set(0, .31, -2.17);
  const diffuser = addBody(new THREE.Mesh(new RoundedBoxGeometry(2.12, .13, .5, 3, .05), carbon));
  diffuser.position.set(0, .34, 2.08);
  const grille = addBody(new THREE.Mesh(new RoundedBoxGeometry(1.15, .3, .06, 3, .03), carbon));
  grille.position.set(0, .56, -2.17);
  const wing = addBody(new THREE.Mesh(new RoundedBoxGeometry(2.3, .1, .42, 4, .045), carbon));
  wing.position.set(0, 1.12, 1.94);
  for (const x of [-.78, .78]) {
    const support = addBody(new THREE.Mesh(new THREE.BoxGeometry(.07, .48, .07), carbon));
    support.position.set(x, .87, 1.88);
  }

  const tailLights = [];
  for (const x of [-.67, .67]) {
    const lamp = addBody(new THREE.Mesh(new RoundedBoxGeometry(.52, .16, .045, 3, .04), headlightMaterial));
    lamp.position.set(x, .76, -2.145);
    const tail = addBody(new THREE.Mesh(new RoundedBoxGeometry(.52, .14, .045, 3, .035), tailMaterial));
    tail.position.set(x, .75, 2.145);
    tailLights.push(tail);
  }

  const wheelGeometry = new THREE.CylinderGeometry(.43, .43, .35, 32);
  const rimGeometry = new THREE.CylinderGeometry(.25, .25, .365, 12);
  const brakeGeometry = new THREE.CylinderGeometry(.19, .19, .375, 24);
  const wheelSpinners = [];
  const wheelPivots = [];
  const frontWheelPivots = [];
  for (const x of [-1.03, 1.03]) {
    for (const z of [-1.35, 1.35]) {
      const steerPivot = new THREE.Group();
      steerPivot.position.set(x, .47, z);
      steerPivot.userData.baseY = .47;
      car.add(steerPivot);
      const spinner = new THREE.Group();
      steerPivot.add(spinner);
      const tire = new THREE.Mesh(wheelGeometry, tireMaterial);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      spinner.add(tire);
      const brake = new THREE.Mesh(brakeGeometry, brakeMaterial);
      brake.rotation.z = Math.PI / 2;
      spinner.add(brake);
      const rim = new THREE.Mesh(rimGeometry, rimMaterial);
      rim.rotation.z = Math.PI / 2;
      spinner.add(rim);
      wheelSpinners.push(spinner);
      wheelPivots.push(steerPivot);
      if (z < 0) frontWheelPivots.push(steerPivot);
    }
  }

  const numberPlate = addBody(new THREE.Mesh(
    new RoundedBoxGeometry(.7, .26, .035, 2, .02),
    new THREE.MeshBasicMaterial({ color: 0xf4f4f4 })
  ));
  numberPlate.position.set(0, .61, 2.17);

  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(2.72, 32, 20),
    new THREE.MeshBasicMaterial({ color: 0x43e7ff, transparent: true, opacity: .16, wireframe: true, depthWrite: false })
  );
  shield.position.y = .75;
  shield.visible = false;
  car.add(shield);

  const turboFlames = new THREE.Group();
  const flameMaterial = new THREE.MeshBasicMaterial({ color: 0x56cfff, transparent: true, opacity: .82, toneMapped: false });
  for (const x of [-.52, .52]) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.16, .8, 16), flameMaterial);
    flame.position.set(x, .45, 2.55);
    flame.rotation.x = Math.PI / 2;
    turboFlames.add(flame);
  }
  turboFlames.visible = false;
  car.add(turboFlames);

  const magnetField = new THREE.Mesh(
    new THREE.TorusGeometry(2.75, .045, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0xb96dff, transparent: true, opacity: .72, toneMapped: false, depthWrite: false })
  );
  magnetField.position.y = .12;
  magnetField.rotation.x = Math.PI / 2;
  magnetField.visible = false;
  car.add(magnetField);

  const ghostMaterials = [paint, carbon, glass];
  ghostMaterials.forEach(material => {
    material.userData.baseOpacity = material.opacity;
    material.userData.baseDepthWrite = material.depthWrite;
  });

  car.userData.body = bodyGroup;
  car.userData.wheels = wheelSpinners;
  car.userData.wheelPivots = wheelPivots;
  car.userData.frontWheels = frontWheelPivots;
  car.userData.tailLights = tailLights;
  car.userData.tailMaterial = tailMaterial;
  car.userData.shield = shield;
  car.userData.turboFlames = turboFlames;
  car.userData.magnetField = magnetField;
  car.userData.wing = wing;
  car.userData.ghostMaterials = ghostMaterials;
  car.userData.ghostActive = false;
  car.scale.setScalar(1.05);
  return car;
}

const player = createCar(0xe1241b);
scene.add(player);

const playerHeadlight = new THREE.SpotLight(0xd9f4ff, CURRENT_TRACK.theme === 'city' ? 78 : 18, 85, .48, .72, 1.45);
playerHeadlight.position.set(0, 1.05, -1.55);
playerHeadlight.castShadow = CURRENT_TRACK.theme === 'city';
const headlightTarget = new THREE.Object3D();
headlightTarget.position.set(0, .25, -24);
player.add(playerHeadlight, headlightTarget);
playerHeadlight.target = headlightTarget;

const rivalColors = [0x1966cc, 0xf2b705, 0xe5e5e5, 0x202428];
const rivalLanes = [-ROAD_WIDTH * .2, ROAD_WIDTH * .18, -ROAD_WIDTH * .16, ROAD_WIDTH * .21];
const rivals = rivalColors.map((color, index) => ({
  car: createCar(color),
  progress: (TRACK_SAMPLES - 12 - index * 9) / TRACK_SAMPLES,
  speed: 42 + index * 1.2,
  lane: rivalLanes[index],
  laps: 0,
  slowUntil: 0,
  slowFactor: 1
}));
rivals.forEach(rival => scene.add(rival.car));

const terrainBelt = new THREE.Mesh(
  ribbonGeometry(ROAD_WIDTH / 2 + 42, -.22, Math.max(18, trackLength / 30)),
  new THREE.MeshStandardMaterial({ map: groundTexture, color: 0xffffff, roughness: 1, side: THREE.DoubleSide })
);
terrainBelt.receiveShadow = true;
scene.add(terrainBelt);

const ITEM_TYPES = [
  {
    id: 'turbo', name: 'TURBO', icon: 'N2O', color: '#30d5ff', duration: 4500, category: 'VELOCIDAD',
    description: 'Aumenta mucho la aceleracion y la velocidad maxima durante 4,5 segundos.'
  },
  {
    id: 'shield', name: 'ESCUDO', icon: 'SHD', color: '#67f2ff', duration: 7000, category: 'DEFENSA',
    description: 'Evita perder velocidad al golpear rivales o barreras durante 7 segundos.'
  },
  {
    id: 'grip', name: 'AGARRE', icon: 'GRP', color: '#78e66d', duration: 8000, category: 'CONTROL',
    description: 'Mejora la direccion y conserva mas velocidad fuera del asfalto durante 8 segundos.'
  },
  {
    id: 'pulse', name: 'PULSO EMP', icon: 'EMP', color: '#ffca3a', duration: 5000, category: 'ATAQUE',
    description: 'Reduce temporalmente la velocidad de todos los rivales durante 5 segundos.'
  },
  {
    id: 'missile', name: 'MISIL', icon: 'RKT', color: '#ff5148', duration: 5000, category: 'ATAQUE',
    description: 'Frena al rival mas cercano durante 5 segundos.'
  },
  {
    id: 'magnet', name: 'IMAN', icon: 'MAG', color: '#c078ff', duration: 8000, category: 'TACTICA',
    description: 'Atrae las cajas cercanas hacia el coche durante 8 segundos.'
  },
  {
    id: 'overdrive', name: 'OVERDRIVE', icon: 'MAX', color: '#ff4fc8', duration: 6000, category: 'VELOCIDAD',
    description: 'Combina turbo y agarre reforzado durante 6 segundos.'
  },
  {
    id: 'repair', name: 'REPARACION', icon: 'FIX', color: '#a4ffb5', duration: 0, category: 'RECUPERACION',
    description: 'Devuelve el coche a la pista, lo estabiliza y recupera velocidad al instante.'
  },
  {
    id: 'oil', name: 'ACEITE', icon: 'OIL', color: '#f0a43c', duration: 16000, category: 'TRAMPA',
    description: 'Deja una mancha detras; el primer rival que la pisa queda ralentizado.'
  },
  {
    id: 'ghost', name: 'FASE', icon: 'GHO', color: '#d7c7ff', duration: 6000, category: 'DEFENSA',
    description: 'Permite atravesar rivales y barreras sin colision durante 6 segundos.'
  },
  {
    id: 'drs', name: 'DRS', icon: 'DRS', color: '#5e9cff', duration: 10000, category: 'VELOCIDAD',
    description: 'Eleva la velocidad maxima sobre el asfalto durante 10 segundos.'
  },
  {
    id: 'anchor', name: 'ANCLA', icon: 'ANC', color: '#ff8a45', duration: 7000, category: 'ATAQUE',
    description: 'Reduce durante 7 segundos la velocidad del rival que lidera la carrera.'
  }
];
const MAX_INVENTORY = 2;
const inventory = [];
let boostUntil = 0;
let shieldUntil = 0;
let gripUntil = 0;
let pulseUntil = 0;
let magnetUntil = 0;
let ghostUntil = 0;
let drsUntil = 0;
let overdriveUntil = 0;

function renderItemGuide() {
  ui['item-guide-list'].replaceChildren();
  ITEM_TYPES.forEach(item => {
    const article = document.createElement('article');
    article.className = 'guide-item';
    article.style.setProperty('--item-color', item.color);

    const icon = document.createElement('strong');
    icon.className = 'guide-item-icon';
    icon.textContent = item.icon;

    const copy = document.createElement('div');
    const category = document.createElement('span');
    category.className = 'guide-item-category';
    category.textContent = item.category;
    const title = document.createElement('h3');
    title.textContent = item.name;
    const description = document.createElement('p');
    description.textContent = item.description;
    copy.append(category, title, description);
    article.append(icon, copy);
    ui['item-guide-list'].appendChild(article);
  });
}

function openItemGuide() {
  ui['item-guide'].classList.add('open');
  ui['item-guide'].setAttribute('aria-hidden', 'false');
  ui['guide-close'].focus();
}

function closeItemGuide() {
  ui['item-guide'].classList.remove('open');
  ui['item-guide'].setAttribute('aria-hidden', 'true');
  ui['guide-button'].focus();
}

renderItemGuide();

const pickupIconTexture = canvasTexture(128, (context, size) => {
  context.clearRect(0, 0, size, size);
  context.fillStyle = '#ffffff';
  context.font = '900 92px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('?', size / 2, size / 2 + 5);
});

function createPickup(trackIndex, lane) {
  const pickup = new THREE.Group();
  const shellGeometry = new RoundedBoxGeometry(1.55, 1.55, 1.55, 5, .16);
  const shell = new THREE.Mesh(
    shellGeometry,
    new THREE.MeshPhysicalMaterial({
      color: 0x35d8ff,
      emissive: 0x087da1,
      emissiveIntensity: 2.5,
      metalness: .28,
      roughness: .12,
      transparent: true,
      opacity: .48,
      transmission: .2,
      depthWrite: false
    })
  );
  const cage = new THREE.LineSegments(
    new THREE.EdgesGeometry(shellGeometry),
    new THREE.LineBasicMaterial({ color: 0xd5fbff, transparent: true, opacity: .92, toneMapped: false })
  );
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(.46, 1),
    new THREE.MeshBasicMaterial({ color: 0x8bedff, transparent: true, opacity: .72, toneMapped: false })
  );
  const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: pickupIconTexture, transparent: true, depthTest: false }));
  icon.scale.set(.76, .76, 1);
  icon.position.z = .82;
  pickup.add(shell, cage, core, icon);
  pickup.position.copy(centers[trackIndex]).addScaledVector(sides[trackIndex], lane);
  pickup.position.y += 1.18;
  const homePosition = pickup.position.clone();
  pickup.userData = {
    trackIndex,
    lane,
    baseY: pickup.position.y,
    homePosition,
    active: true,
    respawnAt: 0,
    shell,
    cage,
    core
  };
  scene.add(pickup);
  return pickup;
}

const pickupCount = THREE.MathUtils.clamp(Math.round(trackLength / 64), 16, 24);
const pickupLanes = [-ROAD_WIDTH * .28, 0, ROAD_WIDTH * .28, -ROAD_WIDTH * .14, ROAD_WIDTH * .14];
const pickupSpacing = Math.floor(TRACK_SAMPLES / pickupCount);
const pickups = Array.from({ length: pickupCount }, (_, index) => (
  createPickup((34 + index * pickupSpacing) % TRACK_SAMPLES, pickupLanes[index % pickupLanes.length])
));

const pickupEffects = [];
const effectsGroup = new THREE.Group();
scene.add(effectsGroup);

function updateInventoryUI() {
  const icons = [ui['item-icon'], ui['item-icon-2']];
  const names = [ui['item-name'], ui['item-name-2']];
  for (let index = 0; index < MAX_INVENTORY; index++) {
    const item = inventory[index];
    const cell = icons[index].parentElement;
    icons[index].textContent = item?.icon || '--';
    names[index].textContent = item?.name || 'VACIO';
    cell.classList.toggle('filled', Boolean(item));
    cell.style.setProperty('--slot-color', item?.color || '#596168');
    cell.title = item?.description || 'Hueco de inventario vacio';
    cell.setAttribute('aria-label', item ? `${item.name}: ${item.description}` : 'Hueco de inventario vacio');
  }
  ui['item-slot'].classList.toggle('empty', inventory.length === 0);
  ui['item-hint'].textContent = inventory.length === MAX_INVENTORY
    ? 'ESPACIO: USAR PRIMER OBJETO'
    : inventory.length
      ? 'ESPACIO: USAR / QUEDA UN HUECO'
      : 'CAJA = OBJETO ALEATORIO';
}

function spawnPickupBurst(position, color) {
  const group = new THREE.Group();
  group.position.copy(position);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .95, toneMapped: false });
  for (let index = 0; index < 14; index++) {
    const fragment = new THREE.Mesh(new THREE.TetrahedronGeometry(.13 + Math.random() * .12), material);
    fragment.userData.velocity = new THREE.Vector3(
      (Math.random() - .5) * 6.5,
      2.2 + Math.random() * 4.2,
      (Math.random() - .5) * 6.5
    );
    fragment.userData.spin = new THREE.Vector3(Math.random() * 7, Math.random() * 7, Math.random() * 7);
    group.add(fragment);
  }
  const ringMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, side: THREE.DoubleSide, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(.7, .82, 32), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.userData.shockwave = true;
  group.add(ring);
  effectsGroup.add(group);
  pickupEffects.push({ group, material, ringMaterial, life: .78, maxLife: .78 });
}

function collectPickup(pickup, now) {
  if (inventory.length >= MAX_INVENTORY) return;
  const item = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
  inventory.push(item);
  pickup.visible = false;
  pickup.userData.active = false;
  pickup.userData.respawnAt = now + 8500;
  spawnPickupBurst(pickup.position, item.color);
  updateInventoryUI();
  showMessage(`OBJETO ALEATORIO / ${item.name}`, 1350);
  audio.itemSfx(item.id);
}

const oilSlicks = [];

function slowRival(rival, now, duration, factor) {
  if (!rival) return;
  rival.slowFactor = now < rival.slowUntil ? Math.min(rival.slowFactor, factor) : factor;
  rival.slowUntil = Math.max(rival.slowUntil, now + duration);
}

function nearestRival() {
  return rivals.reduce((nearest, rival) => (
    !nearest || player.position.distanceToSquared(rival.car.position) < player.position.distanceToSquared(nearest.car.position)
      ? rival
      : nearest
  ), null);
}

function leadingRival() {
  return rivals.reduce((leader, rival) => {
    const score = rival.laps + (rival.progress % 1);
    const leaderScore = leader ? leader.laps + (leader.progress % 1) : -Infinity;
    return score > leaderScore ? rival : leader;
  }, null);
}

function removeOilSlick(index) {
  const [slick] = oilSlicks.splice(index, 1);
  if (!slick) return;
  scene.remove(slick.group);
  slick.group.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  });
}

function deployOil(now) {
  const group = new THREE.Group();
  const oil = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 40),
    new THREE.MeshPhysicalMaterial({
      color: 0x08090a,
      roughness: .08,
      metalness: .18,
      clearcoat: 1,
      clearcoatRoughness: .04,
      transparent: true,
      opacity: .9
    })
  );
  oil.rotation.x = -Math.PI / 2;
  oil.scale.y = .62;
  const sheen = new THREE.Mesh(
    new THREE.RingGeometry(1.45, 2.05, 40),
    new THREE.MeshBasicMaterial({ color: 0x8c5b9f, transparent: true, opacity: .22, side: THREE.DoubleSide, toneMapped: false })
  );
  sheen.rotation.x = -Math.PI / 2;
  sheen.scale.y = .62;
  sheen.position.y = .012;
  group.add(oil, sheen);

  const forward = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
  group.position.copy(player.position).addScaledVector(forward, -3.7);
  group.position.y = centers[playerIndex].y + .16;
  scene.add(group);
  oilSlicks.push({ group, armedAt: now + 450, expiresAt: now + 16000 });
}

function updateOilSlicks(now) {
  for (let index = oilSlicks.length - 1; index >= 0; index--) {
    const slick = oilSlicks[index];
    slick.group.rotation.y += .004;
    if (now >= slick.expiresAt) {
      removeOilSlick(index);
      continue;
    }
    if (now < slick.armedAt) continue;
    const hitRival = rivals.find(rival => {
      const dx = rival.car.position.x - slick.group.position.x;
      const dz = rival.car.position.z - slick.group.position.z;
      return Math.hypot(dx, dz) < 2.65;
    });
    if (!hitRival) continue;
    slowRival(hitRival, now, 5200, .4);
    spawnPickupBurst(slick.group.position, '#f0a43c');
    audio.itemSfx('oil', true);
    removeOilSlick(index);
  }
}

function useHeldItem() {
  if (!inventory.length || state !== 'racing') return;
  const item = inventory.shift();
  const now = performance.now();
  let activationMessage = `${item.name} ACTIVADO`;

  switch (item.id) {
    case 'turbo':
      boostUntil = Math.max(boostUntil, now) + item.duration;
      break;
    case 'shield':
      shieldUntil = Math.max(shieldUntil, now) + item.duration;
      break;
    case 'grip':
      gripUntil = Math.max(gripUntil, now) + item.duration;
      break;
    case 'pulse':
      pulseUntil = Math.max(pulseUntil, now) + item.duration;
      spawnPickupBurst(player.position, item.color);
      break;
    case 'missile': {
      const target = nearestRival();
      slowRival(target, now, item.duration, .42);
      if (target) spawnPickupBurst(target.car.position, item.color);
      activationMessage = 'MISIL / RIVAL MAS CERCANO ALCANZADO';
      break;
    }
    case 'magnet':
      magnetUntil = Math.max(magnetUntil, now) + item.duration;
      break;
    case 'overdrive':
      overdriveUntil = Math.max(overdriveUntil, now) + item.duration;
      boostUntil = Math.max(boostUntil, overdriveUntil);
      gripUntil = Math.max(gripUntil, overdriveUntil);
      break;
    case 'repair': {
      const restoredSpeed = Math.max(38, Math.abs(speed));
      resetToTrack();
      speed = restoredSpeed;
      cameraShake = 0;
      spawnPickupBurst(player.position, item.color);
      activationMessage = 'REPARACION / COCHE ESTABILIZADO';
      break;
    }
    case 'oil':
      deployOil(now);
      activationMessage = 'ACEITE DESPLEGADO';
      break;
    case 'ghost':
      ghostUntil = Math.max(ghostUntil, now) + item.duration;
      break;
    case 'drs':
      drsUntil = Math.max(drsUntil, now) + item.duration;
      break;
    case 'anchor': {
      const target = leadingRival();
      slowRival(target, now, item.duration, .48);
      if (target) spawnPickupBurst(target.car.position, item.color);
      activationMessage = 'ANCLA / LIDER RALENTIZADO';
      break;
    }
  }
  updateInventoryUI();
  showMessage(activationMessage, 1500);
  audio.itemSfx(item.id, true);
}

function distancePointToSegmentXZ(point, start, end) {
  const abX = end.x - start.x;
  const abZ = end.z - start.z;
  const lengthSquared = abX * abX + abZ * abZ;
  const t = lengthSquared > .0001
    ? THREE.MathUtils.clamp(((point.x - start.x) * abX + (point.z - start.z) * abZ) / lengthSquared, 0, 1)
    : 0;
  const closestX = start.x + abX * t;
  const closestZ = start.z + abZ * t;
  return Math.hypot(point.x - closestX, point.z - closestZ);
}

function updatePickups(dt, now, frameStart) {
  for (const pickup of pickups) {
    if (!pickup.userData.active && now >= pickup.userData.respawnAt) {
      pickup.userData.active = true;
      pickup.visible = true;
      pickup.scale.setScalar(1);
      pickup.position.copy(pickup.userData.homePosition);
    }
    if (!pickup.userData.active) continue;
    pickup.rotation.y += dt * .82;
    pickup.userData.cage.rotation.x += dt * .45;
    pickup.userData.core.rotation.x += dt * 1.2;
    pickup.userData.core.rotation.z += dt * .9;
    const magnetActive = state === 'racing' && now < magnetUntil && inventory.length < MAX_INVENTORY;
    const dx = player.position.x - pickup.position.x;
    const dz = player.position.z - pickup.position.z;
    const distanceToPlayer = Math.hypot(dx, dz);
    if (magnetActive && distanceToPlayer < 17) {
      const pull = 1 - Math.exp(-8.5 * dt);
      pickup.position.x = THREE.MathUtils.lerp(pickup.position.x, player.position.x, pull);
      pickup.position.z = THREE.MathUtils.lerp(pickup.position.z, player.position.z, pull);
    } else {
      const settle = 1 - Math.exp(-4 * dt);
      pickup.position.x = THREE.MathUtils.lerp(pickup.position.x, pickup.userData.homePosition.x, settle);
      pickup.position.z = THREE.MathUtils.lerp(pickup.position.z, pickup.userData.homePosition.z, settle);
    }
    pickup.position.y = pickup.userData.baseY + Math.sin(now * .0025 + pickup.userData.trackIndex) * .16;
    const collisionDistance = distancePointToSegmentXZ(pickup.position, frameStart, player.position);
    const collectionRadius = magnetActive ? 6.2 : 3.25;
    if (state === 'racing' && inventory.length < MAX_INVENTORY && collisionDistance < collectionRadius) collectPickup(pickup, now);
  }

  for (let index = pickupEffects.length - 1; index >= 0; index--) {
    const effect = pickupEffects[index];
    effect.life -= dt;
    const progress = 1 - effect.life / effect.maxLife;
    effect.group.children.forEach(child => {
      if (child.userData.shockwave) {
        child.scale.setScalar(1 + progress * 5.5);
        return;
      }
      child.position.addScaledVector(child.userData.velocity, dt);
      child.userData.velocity.y -= 8.5 * dt;
      child.rotation.x += child.userData.spin.x * dt;
      child.rotation.y += child.userData.spin.y * dt;
      child.rotation.z += child.userData.spin.z * dt;
    });
    effect.material.opacity = Math.max(0, effect.life / effect.maxLife);
    effect.ringMaterial.opacity = Math.max(0, (1 - progress) * .75);
    if (effect.life <= 0) {
      effectsGroup.remove(effect.group);
      effect.group.children.forEach(child => child.geometry.dispose());
      effect.material.dispose();
      effect.ringMaterial.dispose();
      pickupEffects.splice(index, 1);
    }
  }
}

function updateActiveEffects(now) {
  const active = [];
  const overdriveActive = now < overdriveUntil;
  if (overdriveActive) active.push(`OVERDRIVE ${((overdriveUntil - now) / 1000).toFixed(1)}s`);
  if (now < boostUntil && !overdriveActive) active.push(`TURBO ${((boostUntil - now) / 1000).toFixed(1)}s`);
  if (now < shieldUntil) active.push(`ESCUDO ${((shieldUntil - now) / 1000).toFixed(1)}s`);
  if (now < gripUntil && !overdriveActive) active.push(`AGARRE ${((gripUntil - now) / 1000).toFixed(1)}s`);
  if (now < pulseUntil) active.push(`PULSO ${((pulseUntil - now) / 1000).toFixed(1)}s`);
  if (now < magnetUntil) active.push(`IMAN ${((magnetUntil - now) / 1000).toFixed(1)}s`);
  if (now < ghostUntil) active.push(`FASE ${((ghostUntil - now) / 1000).toFixed(1)}s`);
  if (now < drsUntil) active.push(`DRS ${((drsUntil - now) / 1000).toFixed(1)}s`);
  ui['effect-status'].textContent = active.join(' / ');
  player.userData.shield.visible = now < shieldUntil;
  player.userData.turboFlames.visible = now < boostUntil;
  player.userData.magnetField.visible = now < magnetUntil;
  if (player.userData.shield.visible) player.userData.shield.rotation.y += .028;
  if (player.userData.turboFlames.visible) player.userData.turboFlames.scale.z = .86 + Math.random() * .3;
  if (player.userData.magnetField.visible) {
    player.userData.magnetField.rotation.z += .035;
    player.userData.magnetField.scale.setScalar(.95 + Math.sin(now * .008) * .06);
  }

  const ghostActive = now < ghostUntil;
  if (ghostActive !== player.userData.ghostActive) {
    player.userData.ghostActive = ghostActive;
    player.userData.ghostMaterials.forEach(material => {
      material.opacity = ghostActive ? material.userData.baseOpacity * .3 : material.userData.baseOpacity;
      material.depthWrite = ghostActive ? false : material.userData.baseDepthWrite;
      material.needsUpdate = true;
    });
  }
  const wingTarget = now < drsUntil ? -.2 : 0;
  player.userData.wing.rotation.x = THREE.MathUtils.lerp(player.userData.wing.rotation.x, wingTarget, .12);
}

const environmentGroup = new THREE.Group();
scene.add(environmentGroup);

function trackSidePosition(index, sign, offset) {
  return centers[index].clone().addScaledVector(sides[index], sign * offset);
}

function addBarriers() {
  const barrierMaterial = new THREE.MeshStandardMaterial({ color: 0xd4d9db, metalness: .68, roughness: .32 });
  const postGeometry = new THREE.BoxGeometry(.14, 1.18, .14);
  const postCount = Math.ceil(TRACK_SAMPLES / 7);
  const dummy = new THREE.Object3D();
  for (const sign of [-1, 1]) {
    for (const railHeight of [.4, .72, 1.04]) {
      const railPoints = centers.map((point, index) => (
        point.clone().addScaledVector(sides[index], sign * BARRIER_OFFSET).add(new THREE.Vector3(0, railHeight, 0))
      ));
      const railCurve = new THREE.CatmullRomCurve3(railPoints, true, 'centripetal', .45);
      const rail = new THREE.Mesh(new THREE.TubeGeometry(railCurve, TRACK_SAMPLES, .085, 8, true), barrierMaterial);
      rail.castShadow = rail.receiveShadow = true;
      environmentGroup.add(rail);
    }
    const posts = new THREE.InstancedMesh(postGeometry, barrierMaterial, postCount);
    let instance = 0;
    for (let index = 0; index < TRACK_SAMPLES; index += 7) {
      dummy.position.copy(centers[index]).addScaledVector(sides[index], sign * BARRIER_OFFSET);
      dummy.position.y += .59;
      dummy.rotation.set(0, Math.atan2(tangents[index].x, tangents[index].z), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      posts.setMatrixAt(instance++, dummy.matrix);
    }
    posts.count = instance;
    posts.castShadow = true;
    environmentGroup.add(posts);
  }
}

function addTrees(count, mode = 'conifer') {
  const trunkGeometry = new THREE.CylinderGeometry(.2, .3, 1, 8);
  const canopyGeometry = mode === 'jungle' ? new THREE.DodecahedronGeometry(1.2, 1) : new THREE.ConeGeometry(1.2, 3.5, 12);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: mode === 'jungle' ? 0x443629 : 0x4d3c30, roughness: 1 });
  const canopyColor = mode === 'snow' ? 0x9eb7ac : mode === 'jungle' ? 0x245f35 : 0x315840;
  const canopyMaterial = new THREE.MeshStandardMaterial({ color: canopyColor, roughness: .96 });
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, count);
  const canopies = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, count);
  const dummy = new THREE.Object3D();

  for (let instance = 0; instance < count; instance++) {
    const trackIndex = Math.floor(worldRandom() * TRACK_SAMPLES);
    const sign = worldRandom() > .5 ? 1 : -1;
    const offset = BARRIER_OFFSET + 11 + worldRandom() * (mode === 'jungle' ? 75 : 105);
    const point = trackSidePosition(trackIndex, sign, offset);
    const trunkHeight = mode === 'jungle' ? 3.6 + worldRandom() * 4.2 : 3.8 + worldRandom() * 3.6;
    const radius = mode === 'jungle' ? 1.9 + worldRandom() * 2.1 : 1.2 + worldRandom() * 1.25;

    dummy.position.set(point.x, point.y + trunkHeight / 2 - .2, point.z);
    dummy.rotation.set(0, worldRandom() * Math.PI, 0);
    dummy.scale.set(1, trunkHeight, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(instance, dummy.matrix);

    dummy.position.set(point.x, point.y + trunkHeight + (mode === 'jungle' ? .8 : 1.5), point.z);
    dummy.rotation.set(0, worldRandom() * Math.PI, 0);
    dummy.scale.set(radius, mode === 'jungle' ? 1.25 + worldRandom() * .7 : 1.15 + worldRandom() * .65, radius);
    dummy.updateMatrix();
    canopies.setMatrixAt(instance, dummy.matrix);
  }
  trunks.castShadow = canopies.castShadow = true;
  environmentGroup.add(trunks, canopies);
}

function addMountains(snowy = false) {
  const mountainMaterial = new THREE.MeshStandardMaterial({ color: snowy ? 0x8e9ca0 : 0x68766d, roughness: 1 });
  const snowMaterial = new THREE.MeshStandardMaterial({ color: 0xdfe7e8, roughness: .92 });
  for (let index = 0; index < 16; index++) {
    const radius = 100 + worldRandom() * 72;
    const height = 100 + worldRandom() * 95;
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 32), mountainMaterial);
    const angle = index / 16 * Math.PI * 2;
    const distance = 480 + worldRandom() * 125;
    mountain.position.set(Math.cos(angle) * distance, height / 2 - 12, Math.sin(angle) * distance);
    mountain.rotation.y = worldRandom() * Math.PI;
    environmentGroup.add(mountain);
    if (snowy) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(radius * .47, height * .34, 32), snowMaterial);
      cap.position.set(mountain.position.x, mountain.position.y + height * .36, mountain.position.z);
      cap.rotation.y = mountain.rotation.y;
      environmentGroup.add(cap);
    }
  }
}

function addStadium() {
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9bcba, roughness: .86 });
  const seat = new THREE.MeshStandardMaterial({ color: 0x283d50, roughness: .74 });
  for (const [trackIndex, sign] of [[110, 1], [385, -1], [570, 1]]) {
    const stand = new THREE.Group();
    for (let row = 0; row < 7; row++) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(32, .48, 2), row % 2 ? seat : concrete);
      bench.position.set(0, row * .62, row * 1.52);
      bench.castShadow = bench.receiveShadow = true;
      stand.add(bench);
    }
    stand.position.copy(trackSidePosition(trackIndex, sign, BARRIER_OFFSET + 18));
    stand.position.y += .15;
    stand.rotation.y = Math.atan2(-tangents[trackIndex].z, tangents[trackIndex].x) + (sign < 0 ? Math.PI : 0);
    environmentGroup.add(stand);
  }
  addTrees(90, 'conifer');
  addMountains(false);
}

function addDesert() {
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x83543a, roughness: .98 });
  for (let index = 0; index < 72; index++) {
    const trackIndex = Math.floor(worldRandom() * TRACK_SAMPLES);
    const sign = worldRandom() > .5 ? 1 : -1;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4 + worldRandom() * 3.8, 1), rockMaterial);
    rock.position.copy(trackSidePosition(trackIndex, sign, BARRIER_OFFSET + 13 + worldRandom() * 100));
    rock.position.y += 1.1;
    rock.scale.y = .45 + worldRandom() * 1.2;
    rock.rotation.set(worldRandom(), worldRandom() * Math.PI, worldRandom());
    rock.castShadow = true;
    environmentGroup.add(rock);
  }
  const mesaMaterial = new THREE.MeshStandardMaterial({ color: 0x955f3d, roughness: 1 });
  for (let index = 0; index < 12; index++) {
    const mesa = new THREE.Mesh(new THREE.CylinderGeometry(42 + worldRandom() * 34, 64 + worldRandom() * 46, 45 + worldRandom() * 65, 18), mesaMaterial);
    const angle = index / 12 * Math.PI * 2;
    mesa.position.set(Math.cos(angle) * 520, 18, Math.sin(angle) * 520);
    environmentGroup.add(mesa);
  }
}

function addCity() {
  const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0x1c2631, roughness: .45, metalness: .28, emissive: 0x070c12, emissiveIntensity: 1.2 });
  const lightColors = [0x39d5ff, 0xff557c, 0xffd26a];
  for (let index = 0; index < 84; index++) {
    const trackIndex = Math.floor(worldRandom() * TRACK_SAMPLES);
    const sign = worldRandom() > .5 ? 1 : -1;
    const width = 8 + worldRandom() * 14;
    const depth = 8 + worldRandom() * 15;
    const height = 18 + worldRandom() * 72;
    const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), buildingMaterial);
    building.position.copy(trackSidePosition(trackIndex, sign, BARRIER_OFFSET + 22 + worldRandom() * 72));
    building.position.y += height / 2 - .2;
    building.rotation.y = Math.atan2(tangents[trackIndex].x, tangents[trackIndex].z) + (worldRandom() - .5) * .25;
    building.castShadow = building.receiveShadow = true;
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(.12, height * .58, depth * .64),
      new THREE.MeshBasicMaterial({ color: lightColors[index % lightColors.length], transparent: true, opacity: .46, toneMapped: false })
    );
    strip.position.x = width / 2 + .07;
    building.add(strip);
    environmentGroup.add(building);
  }

  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x313a43, metalness: .8, roughness: .28 });
  const lampMaterial = new THREE.MeshBasicMaterial({ color: 0xc7f0ff, toneMapped: false });
  for (let index = 0; index < TRACK_SAMPLES; index += 18) {
    for (const sign of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.07, .1, 5.8, 10), poleMaterial);
      pole.position.copy(trackSidePosition(index, sign, BARRIER_OFFSET + 1.8));
      pole.position.y += 2.9;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(.22, 12, 8), lampMaterial);
      lamp.position.y = 2.85;
      pole.add(lamp);
      environmentGroup.add(pole);
    }
  }
}

function addCoast() {
  addTrees(105, 'conifer');
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(850, 1500, 1, 1),
    new THREE.MeshPhysicalMaterial({ color: 0x246b83, roughness: .22, metalness: .08, transparent: true, opacity: .92, envMapIntensity: 1.5 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(570, .06, 0);
  environmentGroup.add(water);
  const cliffMaterial = new THREE.MeshStandardMaterial({ color: 0x6a6a61, roughness: .98 });
  for (let index = 0; index < 54; index++) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(3 + worldRandom() * 7, 1), cliffMaterial);
    const trackIndex = Math.floor(worldRandom() * TRACK_SAMPLES);
    rock.position.copy(trackSidePosition(trackIndex, worldRandom() > .5 ? 1 : -1, BARRIER_OFFSET + 15 + worldRandom() * 65));
    rock.scale.y = .55 + worldRandom() * 1.8;
    rock.rotation.set(worldRandom(), worldRandom() * Math.PI, worldRandom());
    rock.castShadow = true;
    environmentGroup.add(rock);
  }
}

addBarriers();
if (CURRENT_TRACK.theme === 'stadium') addStadium();
if (CURRENT_TRACK.theme === 'mountain') { addTrees(190, 'conifer'); addMountains(false); }
if (CURRENT_TRACK.theme === 'desert') addDesert();
if (CURRENT_TRACK.theme === 'jungle') addTrees(340, 'jungle');
if (CURRENT_TRACK.theme === 'city') addCity();
if (CURRENT_TRACK.theme === 'snow') { addTrees(170, 'snow'); addMountains(true); }
if (CURRENT_TRACK.theme === 'coast') addCoast();

function renderTrackMenu() {
  const currentIndex = TRACKS.findIndex(track => track.id === CURRENT_TRACK.id);
  ui['track-eyebrow'].textContent = `${CURRENT_TRACK.region.toUpperCase()}  ·  ${ROAD_WIDTH} M DE ANCHO`;
  ui['track-title'].textContent = CURRENT_TRACK.name;
  ui['track-subtitle'].textContent = `${TOTAL_LAPS} vueltas  ·  5 pilotos  ·  ${(trackLength / 1000).toFixed(2)} km  ·  ${CURRENT_TRACK.surface}`;
  ui['track-count'].textContent = `${String(currentIndex + 1).padStart(2, '0')} / ${String(TRACKS.length).padStart(2, '0')}`;
  document.title = `${CURRENT_TRACK.name} · Apex Circuit`;
  ui['track-selector'].replaceChildren();

  TRACKS.forEach((track, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `track-option${track.id === CURRENT_TRACK.id ? ' selected' : ''}`;
    button.style.setProperty('--track-color', track.accent);
    button.setAttribute('aria-label', `Seleccionar ${track.name}`);
    if (track.id === CURRENT_TRACK.id) button.setAttribute('aria-current', 'true');

    const number = document.createElement('span');
    number.className = 'track-index';
    number.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('strong');
    name.textContent = track.name;
    const details = document.createElement('span');
    details.textContent = `${track.region} · ${track.laps} vueltas`;
    button.append(number, name, details);
    button.addEventListener('click', () => {
      if (track.id === CURRENT_TRACK.id) return;
      window.localStorage.setItem('apex-track', track.id);
      const url = new URL(window.location.href);
      url.searchParams.set('track', track.id);
      window.location.assign(url);
    });
    ui['track-selector'].appendChild(button);
  });
}
renderTrackMenu();

const keys = {};
const audio = new ModernRaceAudio();
const playerFrameStart = new THREE.Vector3();
let state = 'menu';
let countdownStart = 0;
let raceStart = 0;
let finishTime = 0;
let speed = 0;
let heading = 0;
let steering = 0;
let playerIndex = 0;
let previousIndex = 0;
let lap = 1;
let lapStart = 0;
let bestLap = Infinity;
let messageTimer = 0;
let cameraShake = 0;

function toggleAllAudio() {
  ui['audio-button'].classList.toggle('muted', audio.toggle());
}

function placeCarOnTrack(car, progress, lane = 0) {
  const index = Math.floor(((progress % 1) + 1) % 1 * TRACK_SAMPLES);
  const point = centers[index];
  const tangent = tangents[index];
  const side = sides[index];
  car.position.copy(point).addScaledVector(side, lane);
  car.position.y += .13;
  car.rotation.y = Math.atan2(-tangent.x, -tangent.z);
}

function resetRace() {
  lap = 1;
  speed = 0;
  steering = 0;
  playerIndex = TRACK_SAMPLES - 2;
  previousIndex = playerIndex;
  bestLap = Infinity;
  inventory.length = 0;
  boostUntil = shieldUntil = gripUntil = pulseUntil = magnetUntil = ghostUntil = drsUntil = overdriveUntil = 0;
  while (oilSlicks.length) removeOilSlick(oilSlicks.length - 1);
  updateInventoryUI();
  ui['effect-status'].textContent = '';
  pickups.forEach(pickup => {
    pickup.userData.active = true;
    pickup.userData.respawnAt = 0;
    pickup.visible = true;
    pickup.scale.setScalar(1);
    pickup.position.copy(pickup.userData.homePosition);
  });
  player.userData.body.rotation.set(0, 0, 0);
  player.userData.body.position.y = 0;
  player.userData.shield.visible = false;
  player.userData.turboFlames.visible = false;
  player.userData.magnetField.visible = false;
  player.userData.wing.rotation.x = 0;
  player.userData.ghostActive = false;
  player.userData.ghostMaterials.forEach(material => {
    material.opacity = material.userData.baseOpacity;
    material.depthWrite = material.userData.baseDepthWrite;
    material.needsUpdate = true;
  });
  player.userData.tailMaterial.emissiveIntensity = 2.8;
  const point = centers[playerIndex];
  const tangent = tangents[playerIndex];
  const side = sides[playerIndex];
  player.position.copy(point).addScaledVector(side, -ROAD_WIDTH * .16);
  player.position.y += .13;
  heading = Math.atan2(-tangent.x, -tangent.z);
  player.rotation.y = heading;
  playerFrameStart.copy(player.position);
  rivals.forEach((rival, index) => {
    rival.progress = (TRACK_SAMPLES - 12 - index * 9) / TRACK_SAMPLES;
    rival.laps = 0;
    rival.slowUntil = 0;
    rival.slowFactor = 1;
    placeCarOnTrack(rival.car, rival.progress, rival.lane);
  });
  ui.lap.textContent = `1 / ${TOTAL_LAPS}`;
  ui['best-time'].textContent = '--:--.---';
  ui['race-time'].textContent = '00:00.000';
  ui.message.textContent = '';
  camera.position.copy(player.position).add(new THREE.Vector3(0, 4.2, 9));
}

function startRace() {
  audio.init();
  audio.playMusic(CURRENT_TRACK.music);
  resetRace();
  state = 'countdown';
  countdownStart = performance.now();
  ui['start-screen'].classList.remove('active');
  ui['finish-screen'].classList.remove('active');
  ui.hud.classList.remove('hidden');
}

function returnToMenu() {
  audio.stopMusic();
  state = 'menu';
  resetRace();
  ui.hud.classList.add('hidden');
  ui['finish-screen'].classList.remove('active');
  ui['start-screen'].classList.add('active');
}

function nearestTrackIndex(position, around = playerIndex) {
  let best = around;
  let bestDistance = Infinity;
  for (let offset = -42; offset <= 42; offset++) {
    const index = (around + offset + TRACK_SAMPLES) % TRACK_SAMPLES;
    const dx = position.x - centers[index].x;
    const dz = position.z - centers[index].z;
    const distance = dx * dx + dz * dz;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return [best, Math.sqrt(bestDistance)];
}

function resetToTrack() {
  const point = centers[playerIndex];
  const tangent = tangents[playerIndex];
  player.position.copy(point);
  player.position.y += .15;
  heading = Math.atan2(-tangent.x, -tangent.z);
  player.rotation.y = heading;
  speed *= .32;
  showMessage('VEHICULO RECOLOCADO', 1200);
}

function showMessage(text, duration = 1500) {
  ui.message.textContent = text;
  messageTimer = performance.now() + duration;
}

function formatTime(milliseconds) {
  if (!Number.isFinite(milliseconds)) return '--:--.---';
  const minutes = Math.floor(milliseconds / 60000);
  const seconds = Math.floor(milliseconds / 1000) % 60;
  const milli = Math.floor(milliseconds % 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
}

function updatePlayer(dt, now) {
  const accelerating = keys.KeyW || keys.ArrowUp;
  const braking = keys.KeyS || keys.ArrowDown;
  const isBoosting = now < boostUntil;
  const isShielded = now < shieldUntil;
  const hasGripPower = now < gripUntil;
  const isGhosted = now < ghostUntil;
  const isDrsActive = now < drsUntil;
  const [nearIndex, centerDistance] = nearestTrackIndex(player.position);
  previousIndex = playerIndex;
  playerIndex = nearIndex;
  const onRoad = centerDistance < ROAD_WIDTH / 2 + .65;
  const surfaceGrip = hasGripPower ? 1.12 : CURRENT_TRACK.roadStyle === 'wet' ? .86 : CURRENT_TRACK.roadStyle === 'cold' ? .82 : CURRENT_TRACK.roadStyle === 'dusty' ? .93 : 1;
  const maxSpeed = isBoosting ? 96 : isDrsActive && onRoad ? 88 : onRoad ? 78 : hasGripPower ? 54 : 31;
  const acceleration = 21 + (isBoosting ? 23 : 0);

  if (accelerating) speed += acceleration * (1 - Math.abs(speed) / 106) * dt;
  else speed -= Math.sign(speed) * Math.min(Math.abs(speed), 5.4 * dt);
  if (isBoosting) speed += 24 * dt;
  if (braking) speed -= (speed > 1 ? 34 : 12) * dt;
  speed = THREE.MathUtils.clamp(speed, -12, maxSpeed);
  if (!onRoad && !hasGripPower) speed *= Math.pow(.971, dt * 60);

  const input = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
  steering = THREE.MathUtils.lerp(steering, input, 1 - Math.pow(.001, dt));
  const speedRatio = THREE.MathUtils.clamp(Math.abs(speed) / 20, .16, 1);
  const highSpeedReduction = 1 - Math.max(0, Math.abs(speed) - 58) / 125;
  const steerPower = speedRatio * highSpeedReduction * surfaceGrip;
  heading += steering * steerPower * 1.74 * dt * Math.sign(speed || 1);

  if (onRoad && Math.abs(speed) > 18) {
    const trackHeading = Math.atan2(-tangents[playerIndex].x, -tangents[playerIndex].z);
    const headingError = Math.atan2(Math.sin(trackHeading - heading), Math.cos(trackHeading - heading));
    const stability = Math.abs(input) < .1 ? .16 : .045;
    heading += headingError * stability * surfaceGrip * dt;
  }

  player.rotation.y = heading;
  player.position.x -= Math.sin(heading) * speed * dt;
  player.position.z -= Math.cos(heading) * speed * dt;
  player.position.y = THREE.MathUtils.lerp(player.position.y, centers[playerIndex].y + .14, 1 - Math.pow(.0005, dt));

  player.userData.wheels.forEach(wheel => { wheel.rotation.x -= speed * dt / .42; });
  player.userData.frontWheels.forEach(wheel => {
    wheel.rotation.y = THREE.MathUtils.lerp(wheel.rotation.y, -steering * .35, 1 - Math.pow(.001, dt));
  });
  const motion = THREE.MathUtils.clamp(Math.abs(speed) / 78, 0, 1);
  player.userData.wheelPivots.forEach((pivot, index) => {
    const suspension = Math.sin(now * .016 + index * 1.7) * .012 * motion;
    pivot.position.y = pivot.userData.baseY + suspension;
  });
  player.userData.body.rotation.z = THREE.MathUtils.lerp(
    player.userData.body.rotation.z,
    -steering * motion * .082,
    1 - Math.pow(.004, dt)
  );
  player.userData.body.rotation.x = THREE.MathUtils.lerp(
    player.userData.body.rotation.x,
    braking && speed > 2 ? -.038 : accelerating ? .021 : 0,
    1 - Math.pow(.012, dt)
  );
  player.userData.body.position.y = Math.sin(now * .014) * .008 * motion;
  player.userData.tailMaterial.emissiveIntensity = braking && speed > 2 ? 7.5 : 2.8;

  const lateralOffset = player.position.clone().sub(centers[playerIndex]).dot(sides[playerIndex]);
  if (!isGhosted && Math.abs(lateralOffset) > BARRIER_DRIVE_LIMIT) {
    const penetration = Math.abs(lateralOffset) - BARRIER_DRIVE_LIMIT;
    player.position.addScaledVector(sides[playerIndex], -Math.sign(lateralOffset) * penetration);
    if (Math.abs(speed) > 8 && !isShielded) {
      speed *= .54;
      cameraShake = .32;
      audio.hit();
    }
  }

  if (!isGhosted) {
    for (const rival of rivals) {
      const distance = player.position.distanceTo(rival.car.position);
      if (distance < 2.5) {
        const push = player.position.clone().sub(rival.car.position).setY(0);
        if (push.lengthSq() < .0001) push.set(1, 0, 0);
        push.normalize();
        player.position.addScaledVector(push, (2.5 - distance) * .62);
        if (!isShielded) {
          speed *= .86;
          cameraShake = .16;
        }
      }
    }
  }

  if (state === 'racing' && previousIndex > TRACK_SAMPLES * .88 && playerIndex < TRACK_SAMPLES * .12 && speed > 5) {
    const lapTime = now - lapStart;
    if (lap > 1) {
      bestLap = Math.min(bestLap, lapTime);
      ui['best-time'].textContent = formatTime(bestLap);
      showMessage(`VUELTA ${lap - 1}  ·  ${formatTime(lapTime)}`);
    }
    lap++;
    if (lap > TOTAL_LAPS) finishRace(now);
    else {
      ui.lap.textContent = `${lap} / ${TOTAL_LAPS}`;
      lapStart = now;
    }
  }

  const kmh = Math.max(0, Math.round(speed * 3.6));
  ui.speed.textContent = kmh;
  ui.gear.textContent = kmh < 3 ? 'N' : Math.min(6, Math.max(1, Math.floor(kmh / 42) + 1));
  ui['rpm-bar'].style.width = `${Math.min(100, 24 + (kmh % 42) / 42 * 76)}%`;
  ui.surface.textContent = onRoad ? 'PISTA' : 'TERRENO';
  ui.surface.style.color = onRoad ? '#7ce080' : '#ffca3a';
  audio.update(kmh, accelerating ? 1 : 0);
}

function updateRivals(dt) {
  const now = performance.now();
  const pulseFactor = now < pulseUntil ? .64 : 1;
  rivals.forEach((rival, index) => {
    const oldProgress = rival.progress;
    if (now >= rival.slowUntil) rival.slowFactor = 1;
    const targetSpeed = (rival.speed + Math.sin(now * .0007 + index) * 2.2) * pulseFactor * rival.slowFactor;
    rival.progress += targetSpeed * dt / trackLength;
    if (Math.floor(oldProgress) < Math.floor(rival.progress)) rival.laps++;
    const laneMovement = Math.sin(rival.progress * 48 + index * 1.7) * .18;
    placeCarOnTrack(rival.car, rival.progress, rival.lane + laneMovement);
    rival.car.userData.wheels.forEach(wheel => { wheel.rotation.x -= targetSpeed * dt / .42; });
    rival.car.userData.frontWheels.forEach(wheel => { wheel.rotation.y = Math.sin(rival.progress * 34 + index) * .045; });
    rival.car.userData.wheelPivots.forEach((pivot, wheelIndex) => {
      pivot.position.y = pivot.userData.baseY + Math.sin(now * .013 + wheelIndex + index) * .008;
    });
    rival.car.userData.body.rotation.z = THREE.MathUtils.lerp(
      rival.car.userData.body.rotation.z,
      Math.sin(rival.progress * 40 + index) * .022,
      .07
    );
    rival.car.userData.body.position.y = Math.sin(now * .011 + index) * .007;
    rival.car.userData.tailMaterial.emissiveIntensity = now < rival.slowUntil || now < pulseUntil ? 7.2 : 2.8;
  });
}

function updateCamera(dt) {
  const forward = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
  const side = new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading));
  const speedFactor = THREE.MathUtils.clamp(Math.abs(speed) / 76, 0, 1);
  const desired = player.position.clone()
    .addScaledVector(forward, -8.8 - speedFactor * 2.2)
    .add(new THREE.Vector3(0, 3.55 + speedFactor * .68, 0))
    .addScaledVector(side, steering * .48);
  if (cameraShake > 0) {
    desired.x += (Math.random() - .5) * cameraShake;
    desired.y += (Math.random() - .5) * cameraShake;
    cameraShake = Math.max(0, cameraShake - dt * 1.7);
  }
  camera.position.lerp(desired, 1 - Math.pow(.0018, dt));
  const lookAt = player.position.clone()
    .addScaledVector(forward, 7.5 + speedFactor * 5)
    .add(new THREE.Vector3(0, 1.02, 0));
  camera.lookAt(lookAt);
  camera.rotateZ(-steering * speedFactor * .012);
  const boostFov = performance.now() < boostUntil ? 5 : 0;
  camera.fov = THREE.MathUtils.lerp(camera.fov, 58 + speedFactor * 7 + boostFov, 1 - Math.pow(.02, dt));
  camera.updateProjectionMatrix();
}

function standingsPosition() {
  const playerScore = (lap - 1) + playerIndex / TRACK_SAMPLES;
  return 1 + rivals.filter(rival => rival.laps + (rival.progress % 1) > playerScore).length;
}

function finishRace(now) {
  state = 'finished';
  finishTime = now - raceStart;
  speed *= .68;
  audio.stopMusic();
  const finalLap = now - lapStart;
  bestLap = Math.min(bestLap, finalLap);
  const position = standingsPosition();
  ui['final-position'].textContent = `${position}º`;
  ui['result-title'].textContent = position === 1 ? 'Victoria' : position <= 3 ? 'Podio' : 'Completado';
  ui['final-time'].textContent = formatTime(finishTime);
  ui['final-best'].textContent = formatTime(bestLap);
  window.setTimeout(() => {
    ui.hud.classList.add('hidden');
    ui['finish-screen'].classList.add('active');
  }, 1200);
}

function drawMinimap() {
  const canvas = ui.minimap;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  const xs = centers.map(point => point.x);
  const zs = centers.map(point => point.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const scale = Math.min(180 / (maxX - minX), 140 / (maxZ - minZ));
  const offsetX = (canvas.width - (maxX - minX) * scale) / 2;
  const offsetY = (canvas.height - (maxZ - minZ) * scale) / 2;
  const pointOnMap = point => [offsetX + (point.x - minX) * scale, offsetY + (point.z - minZ) * scale];

  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.beginPath();
  centers.forEach((point, index) => {
    const [x, y] = pointOnMap(point);
    if (index) context.lineTo(x, y);
    else context.moveTo(x, y);
  });
  context.closePath();
  context.strokeStyle = 'rgba(7,8,9,.58)';
  context.lineWidth = 11;
  context.stroke();
  context.strokeStyle = '#c8ccce';
  context.lineWidth = 3;
  context.stroke();
  rivals.forEach(rival => {
    const [x, y] = pointOnMap(rival.car.position);
    context.fillStyle = '#e8eaeb';
    context.beginPath();
    context.arc(x, y, 2.5, 0, Math.PI * 2);
    context.fill();
  });
  const [playerX, playerY] = pointOnMap(player.position);
  context.fillStyle = CURRENT_TRACK.accent;
  context.beginPath();
  context.arc(playerX, playerY, 4, 0, Math.PI * 2);
  context.fill();
}

function updateCountdown(now) {
  const elapsed = now - countdownStart;
  if (elapsed < 1000) ui.countdown.textContent = '3';
  else if (elapsed < 2000) ui.countdown.textContent = '2';
  else if (elapsed < 3000) ui.countdown.textContent = '1';
  else if (elapsed < 3700) {
    ui.countdown.textContent = 'GO';
    ui.countdown.classList.add('go');
    if (state === 'countdown') {
      state = 'racing';
      raceStart = now;
      lapStart = now;
    }
  } else {
    ui.countdown.textContent = '';
    ui.countdown.classList.remove('go');
  }
}

function animate(now = performance.now()) {
  requestAnimationFrame(animate);
  const dt = Math.min(.033, (now - (animate.last || now)) / 1000);
  animate.last = now;
  playerFrameStart.copy(player.position);

  if (state === 'menu') {
    const point = centers[TRACK_SAMPLES - 2];
    const tangent = tangents[TRACK_SAMPLES - 2];
    const side = sides[TRACK_SAMPLES - 2];
    const forward = new THREE.Vector3(-tangent.x, 0, -tangent.z);
    const menuCamera = point.clone().addScaledVector(side, 14).addScaledVector(forward, -8).add(new THREE.Vector3(0, 5.2, 0));
    camera.position.lerp(menuCamera, .025);
    camera.lookAt(point.clone().addScaledVector(forward, 4).add(new THREE.Vector3(0, 1, 0)));
  } else {
    if (state === 'countdown' || (state === 'racing' && ui.countdown.textContent)) updateCountdown(now);
    if (state === 'racing' || state === 'finished') updatePlayer(dt, now);
    if (state === 'racing' || state === 'finished') updateRivals(dt);
    updateCamera(dt);
    drawMinimap();
    if (state === 'racing') {
      ui['race-time'].textContent = formatTime(now - raceStart);
      ui.position.textContent = standingsPosition();
    }
    if (messageTimer && now > messageTimer) {
      ui.message.textContent = '';
      messageTimer = 0;
    }
  }

  updatePickups(dt, now, playerFrameStart);
  updateOilSlicks(now);
  updateActiveEffects(now);
  composer.render();
}

ui['start-button'].addEventListener('click', startRace);
ui['restart-button'].addEventListener('click', startRace);
ui['menu-button'].addEventListener('click', returnToMenu);
ui['audio-button'].addEventListener('click', toggleAllAudio);
ui['guide-button'].addEventListener('click', openItemGuide);
ui['guide-close'].addEventListener('click', closeItemGuide);
ui['item-guide'].addEventListener('click', event => {
  if (event.target === ui['item-guide']) closeItemGuide();
});

addEventListener('keydown', event => {
  if (ui['item-guide'].classList.contains('open')) {
    if (event.code === 'Escape') closeItemGuide();
    event.preventDefault();
    return;
  }
  keys[event.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  if (event.code === 'KeyR' && state !== 'menu') resetToTrack();
  if (event.code === 'KeyM') toggleAllAudio();
  if (event.code === 'Space' && !event.repeat) useHeldItem();
  if (event.code === 'Enter' && (state === 'menu' || state === 'finished')) startRace();
});
addEventListener('keyup', event => { keys[event.code] = false; });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

resetRace();
animate();
