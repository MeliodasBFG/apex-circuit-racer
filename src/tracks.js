export const TRACKS = [
  {
    id: 'arena-rojiblanca',
    name: 'Arena Rojiblanca',
    shortName: 'Arena',
    region: 'Circuito de estadio',
    surface: 'Mosaico rojiblanco',
    theme: 'stadium',
    roadStyle: 'portrait',
    width: 24,
    laps: 3,
    accent: '#e73528',
    music: { bpm: 118, root: 55, intervals: [0, 3, 7, 10] },
    points: [
      [-25, 0, -145], [75, 0, -140], [155, 2, -95], [184, 4, -12],
      [158, 2, 70], [92, 1, 118], [10, 3, 134], [-62, 6, 112],
      [-142, 3, 68], [-182, 1, 4], [-157, 0, -63], [-102, 0, -115]
    ]
  },
  {
    id: 'cumbre-plateada',
    name: 'Cumbre Plateada',
    shortName: 'Cumbre',
    region: 'Alta montana',
    surface: 'Asfalto grueso',
    theme: 'mountain',
    roadStyle: 'coarse',
    width: 23,
    laps: 3,
    accent: '#d8e2e7',
    music: { bpm: 110, root: 49, intervals: [0, 2, 7, 9] },
    points: [
      [-35, 3, -195], [70, 7, -202], [158, 14, -150], [215, 20, -54],
      [194, 13, 48], [124, 8, 122], [32, 16, 158], [-58, 24, 142],
      [-142, 15, 92], [-204, 9, 14], [-181, 6, -92], [-112, 4, -166]
    ]
  },
  {
    id: 'horizonte-rojo',
    name: 'Horizonte Rojo',
    shortName: 'Desierto',
    region: 'Desierto abierto',
    surface: 'Asfalto polvoriento',
    theme: 'desert',
    roadStyle: 'dusty',
    width: 27,
    laps: 3,
    accent: '#e08b43',
    music: { bpm: 104, root: 55, intervals: [0, 3, 5, 10] },
    points: [
      [-42, 0, -245], [92, 1, -250], [214, 5, -188], [286, 9, -74],
      [278, 7, 62], [208, 4, 174], [78, 2, 236], [-70, 3, 242],
      [-205, 6, 174], [-284, 3, 62], [-276, 1, -84], [-184, 0, -205]
    ]
  },
  {
    id: 'selva-esmeralda',
    name: 'Selva Esmeralda',
    shortName: 'Jungla',
    region: 'Jungla humeda',
    surface: 'Asfalto mojado',
    theme: 'jungle',
    roadStyle: 'wet',
    width: 22,
    laps: 4,
    accent: '#48c47a',
    music: { bpm: 112, root: 52, intervals: [0, 3, 7, 8] },
    points: [
      [-18, 2, -158], [72, 3, -151], [142, 5, -102], [126, 8, -35],
      [176, 6, 34], [132, 4, 102], [58, 7, 126], [2, 10, 91],
      [-58, 8, 143], [-132, 5, 92], [-106, 4, 24], [-158, 3, -42],
      [-113, 2, -118], [-60, 2, -92]
    ]
  },
  {
    id: 'distrito-neon',
    name: 'Distrito Neon',
    shortName: 'Ciudad',
    region: 'Ciudad nocturna',
    surface: 'Asfalto urbano',
    theme: 'city',
    roadStyle: 'urban',
    width: 25,
    laps: 4,
    accent: '#39d5ff',
    music: { bpm: 124, root: 58, intervals: [0, 3, 7, 12] },
    points: [
      [-34, 0, -150], [68, 0, -150], [142, 0, -118], [160, 0, -58],
      [114, 0, -22], [164, 0, 28], [148, 0, 104], [78, 0, 138],
      [5, 0, 112], [-44, 0, 146], [-124, 0, 116], [-153, 0, 48],
      [-112, 0, 2], [-158, 0, -52], [-132, 0, -119], [-78, 0, -132]
    ]
  },
  {
    id: 'paso-glacial',
    name: 'Paso Glacial',
    shortName: 'Glaciar',
    region: 'Cordillera nevada',
    surface: 'Asfalto frio',
    theme: 'snow',
    roadStyle: 'cold',
    width: 21,
    laps: 3,
    accent: '#a8dcff',
    music: { bpm: 96, root: 44, intervals: [0, 5, 7, 12] },
    points: [
      [-28, 5, -210], [86, 8, -206], [174, 18, -154], [228, 30, -62],
      [198, 22, 45], [137, 14, 132], [44, 26, 176], [-54, 35, 156],
      [-150, 23, 105], [-216, 14, 20], [-192, 9, -96], [-118, 6, -178]
    ]
  },
  {
    id: 'acantilado-atlantico',
    name: 'Acantilado Atlantico',
    shortName: 'Costa',
    region: 'Costa oceanica',
    surface: 'Asfalto reparado',
    theme: 'coast',
    roadStyle: 'patched',
    width: 26,
    laps: 3,
    accent: '#43b8c8',
    music: { bpm: 116, root: 55, intervals: [0, 4, 7, 11] },
    points: [
      [-55, 4, -230], [74, 5, -234], [184, 8, -174], [250, 12, -72],
      [236, 10, 45], [176, 7, 148], [70, 12, 206], [-62, 16, 212],
      [-170, 13, 158], [-242, 9, 70], [-258, 6, -42], [-198, 5, -154],
      [-126, 4, -198]
    ]
  }
];

export const THEMES = {
  stadium: {
    background: 0xa7b4bc, fog: 0xa7b4bc, fogDensity: .0025, exposure: 1.06,
    hemiSky: 0xe9f5ff, hemiGround: 0x42533c, hemiIntensity: 1.65,
    sunColor: 0xfff4df, sunIntensity: 3.2, sunElevation: 58, sunAzimuth: 225,
    groundBase: '#617447', groundNoise: '#405337', runoff: 0x33383a
  },
  mountain: {
    background: 0x91a4b0, fog: 0x9aaab2, fogDensity: .003, exposure: 1.02,
    hemiSky: 0xdceeff, hemiGround: 0x3f493c, hemiIntensity: 1.5,
    sunColor: 0xfff0d5, sunIntensity: 3.4, sunElevation: 46, sunAzimuth: 214,
    groundBase: '#516247', groundNoise: '#364338', runoff: 0x34383a
  },
  desert: {
    background: 0xd5b58d, fog: 0xd8b88f, fogDensity: .0021, exposure: 1.08,
    hemiSky: 0xffe2bd, hemiGround: 0x6c4930, hemiIntensity: 1.7,
    sunColor: 0xffdfac, sunIntensity: 4.1, sunElevation: 38, sunAzimuth: 238,
    groundBase: '#a86f3f', groundNoise: '#76492c', runoff: 0x5b4c42
  },
  jungle: {
    background: 0x78938a, fog: 0x718b82, fogDensity: .0042, exposure: .95,
    hemiSky: 0xc9e4dc, hemiGround: 0x1d372a, hemiIntensity: 1.38,
    sunColor: 0xe8f4d2, sunIntensity: 2.7, sunElevation: 62, sunAzimuth: 196,
    groundBase: '#294b32', groundNoise: '#173222', runoff: 0x263530
  },
  city: {
    background: 0x101721, fog: 0x111923, fogDensity: .0045, exposure: .82,
    hemiSky: 0x4c6d8b, hemiGround: 0x11151b, hemiIntensity: 1.05,
    sunColor: 0x7fa9d2, sunIntensity: 1.25, sunElevation: 8, sunAzimuth: 252,
    groundBase: '#20252b', groundNoise: '#13171c', runoff: 0x191d22
  },
  snow: {
    background: 0xcbd7de, fog: 0xcbd7de, fogDensity: .0031, exposure: 1.12,
    hemiSky: 0xf1f8ff, hemiGround: 0x79858a, hemiIntensity: 1.72,
    sunColor: 0xe8f4ff, sunIntensity: 3.1, sunElevation: 34, sunAzimuth: 228,
    groundBase: '#dce2e2', groundNoise: '#adb9bc', runoff: 0x687177
  },
  coast: {
    background: 0x8fb4bf, fog: 0x91afb7, fogDensity: .0024, exposure: 1.05,
    hemiSky: 0xdff5ff, hemiGround: 0x41594e, hemiIntensity: 1.62,
    sunColor: 0xfff0d1, sunIntensity: 3.55, sunElevation: 43, sunAzimuth: 245,
    groundBase: '#536a50', groundNoise: '#39493c', runoff: 0x384248
  }
};

export function getSelectedTrack() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('track') || window.localStorage.getItem('apex-track') || TRACKS[0].id;
  return TRACKS.find(track => track.id === requested) || TRACKS[0];
}
