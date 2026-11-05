import * as THREE from './three.module.js';
import { LEVELS } from './levels.js';

const CELL = 4, H = 3, R = 0.4;
let LV = 0, level, MAP, rows = 1, cols = 1;

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020304);
scene.fog = new THREE.FogExp2(0x020304, 0.072);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 80);
camera.rotation.order = 'YXZ';
scene.add(camera);
const ambientLight = new THREE.AmbientLight(0x182027, 0.62); scene.add(ambientLight);

const torch = new THREE.SpotLight(0xd8e2dc, 29, 21, 0.58, 0.72, 1.6);
camera.add(torch); camera.add(torch.target);
torch.position.set(0.15, -0.1, 0); torch.target.position.set(0, 0, -5);
let torchOn = true;

function noiseTex(base, v) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const n = base + (Math.random() - .5) * v;
    g.fillStyle = `rgb(${n},${n + 4},${n + 3})`; g.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const wallMat = new THREE.MeshStandardMaterial({ map: noiseTex(120, 50), roughness: 1 });
const floorMat = new THREE.MeshStandardMaterial({ map: noiseTex(80, 40), roughness: 1 });
const doorMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 });
const lockMat = new THREE.MeshStandardMaterial({ color: 0x5a1f1f, roughness: 1 });

const levelGroup = new THREE.Group(); scene.add(levelGroup);
const isWall = (r, c) => r < 0 || c < 0 || r >= rows || c >= cols || MAP[r][c] === '#';
let doors = {}, key = null, fuse = null, breaker = null, exitLight = null, exitPos = null, start = { x: 6, z: 6 }, hideSpots = [];
let hidden = false, hideSpot = null, hideTime = 0;
let codePanel = null, codeSolved = false;
let hasKey = false, hasFuse = false, powered = true, lastPow = -9;
let battery = 100, batteryTick = 0, noiseCooldown = 0;
let batteries = [], notes = [], medkits = [], foundNotes = 0, collectedLetters = [];
let mapMarkers = [];
const addMapMarker = (type,x,z,active=true) => { const m={type,x,z,active}; mapMarkers.push(m); return m; };
let health = 3, damageCooldown = 0, scareTimer = 18;
let lastNoise = null;
const itemMat = c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: .45 });

function setPower() {
  if (breaker) breaker.userData.lamp.color.set(powered ? 0x44ff88 : 0xff3322);
  if (exitLight) exitLight.color.set(powered ? 0x88ffcc : 0xff3322);
}
function buildLevel(i) {
  LV = i; level = LEVELS[i]; MAP = level.map; rows = MAP.length; cols = MAP[0].length;
  // Distinct atmosphere per chapter: damp entry, sickly corridors, cold basement, archive amber, signal-room crimson.
  const atmos = [
    { fog: 0x080b0b, density: .066, ambient: 0x202725, amb: .62, torch: 0xd9e2d7, wall: 0x8b9288, floor: 0x858982 },
    { fog: 0x07100c, density: .078, ambient: 0x18271e, amb: .48, torch: 0xc8e4cf, wall: 0x78877a, floor: 0x727c70 },
    { fog: 0x080a13, density: .092, ambient: 0x171b30, amb: .40, torch: 0xcbd6ff, wall: 0x777d91, floor: 0x72778a },
    { fog: 0x120b07, density: .071, ambient: 0x2b2015, amb: .52, torch: 0xffd9ad, wall: 0x92806b, floor: 0x82715e },
    { fog: 0x100508, density: .086, ambient: 0x2b1018, amb: .38, torch: 0xffc9d0, wall: 0x8a6268, floor: 0x79565c }
  ][i] || { fog: 0x080b0b, density: .07, ambient: 0x202725, amb: .5, torch: 0xd9e2d7, wall: 0x888888, floor: 0x777777 };
  scene.background.setHex(atmos.fog); scene.fog.color.setHex(atmos.fog); scene.fog.density = atmos.density;
  ambientLight.color.setHex(atmos.ambient); ambientLight.intensity = atmos.amb;
  torch.color.setHex(atmos.torch);
  wallMat.color.setHex(atmos.wall); floorMat.color.setHex(atmos.floor);
  levelGroup.clear(); doors = {}; hideSpots = []; batteries = []; notes = []; medkits = []; mapMarkers = []; hidden = false; hideSpot = null; key = fuse = breaker = exitLight = exitPos = codePanel = null; hasKey = hasFuse = false; codeSolved = false;
  const add = o => (levelGroup.add(o), o);
  const floor = add(new THREE.Mesh(new THREE.PlaneGeometry(cols * CELL, rows * CELL), floorMat));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cols * CELL / 2, 0, rows * CELL / 2);
  const ceil = add(new THREE.Mesh(new THREE.PlaneGeometry(cols * CELL, rows * CELL), wallMat));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(cols * CELL / 2, H, rows * CELL / 2);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const ch = MAP[r][c], x = (c + .5) * CELL, z = (r + .5) * CELL;
    if (ch === '#') add(new THREE.Mesh(new THREE.BoxGeometry(CELL, H, CELL), wallMat)).position.set(x, H / 2, z);
    else if (ch === 'A') {
      const pack = add(new THREE.Mesh(new THREE.BoxGeometry(.28,.18,.18), itemMat(0x79d8a4))); pack.position.set(x, .9, z); batteries.push(pack); pack.userData.mapMarker=addMapMarker('battery',x,z);
    } else if (ch === 'M') {
      const med = add(new THREE.Mesh(new THREE.BoxGeometry(.32,.22,.32), itemMat(0xe85b5b))); med.position.set(x, .85, z); medkits.push(med); med.userData.mapMarker=addMapMarker('med',x,z);
    } else if (ch === 'N') {
      const note = add(new THREE.Mesh(new THREE.BoxGeometry(.28,.025,.36), itemMat(0xd8d0a8))); note.position.set(x, .85, z); notes.push({ mesh: note, text: level.noteText || 'یادداشتی نیم‌سوخته: «سیگنال از زیرزمین می‌آید...»', mapMarker:addMapMarker('note',x,z) });
    } else if (ch === 'H') {
      // A usable hiding place: a tall cabinet with a dark front seam.
      const cab = add(new THREE.Group()); cab.position.set(x, 0, z);
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 2.45, 1.05), new THREE.MeshStandardMaterial({ color: 0x29251f, roughness: 1 })); body.position.y = 1.225; cab.add(body);
      const door = new THREE.Mesh(new THREE.BoxGeometry(.06, 2.2, .82), new THREE.MeshStandardMaterial({ color: 0x40372c, roughness: 1 })); door.position.set(.69, 1.2, 0); cab.add(door);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), new THREE.MeshStandardMaterial({ color: 0x9a8060, metalness: .5, roughness: .4 })); knob.position.set(.74, 1.15, .25); cab.add(knob);
      hideSpots.push({ x, z, mesh: cab });
    }
    else if (ch === 'D' || ch === 'L') {
      const alongX = isWall(r, c - 1) && isWall(r, c + 1);
      const m = add(new THREE.Mesh(new THREE.BoxGeometry(alongX ? CELL : .3, H, alongX ? .3 : CELL), ch === 'L' ? lockMat : doorMat));
      m.position.set(x, H / 2, z); doors[r + ',' + c] = { mesh: m, open: false, locked: ch === 'L', t: 0, mapMarker: ch === 'L' ? addMapMarker('lock',x,z) : null };
    } else if (ch === 'S') start = { x, z };
    else if (ch === 'K') { key = add(new THREE.Mesh(new THREE.OctahedronGeometry(.18), itemMat(0xd9b84a))); key.position.set(x, 1, z); key.userData.mapMarker=addMapMarker('key',x,z); }
    else if (ch === 'F') { fuse = add(new THREE.Mesh(new THREE.BoxGeometry(.12, .12, .35), itemMat(0x66e0ff))); fuse.position.set(x, 1, z); fuse.userData.mapMarker=addMapMarker('fuse',x,z); }
    else if (ch === 'B') {
      breaker = add(new THREE.Mesh(new THREE.BoxGeometry(.9, 1.3, .5), new THREE.MeshStandardMaterial({ color: 0x2b3238, roughness: 1 })));
      breaker.position.set(x, 1.2, z); breaker.userData.mapMarker=addMapMarker('breaker',x,z); const lm = new THREE.MeshBasicMaterial({ color: 0xff3322 });
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(.15, .15, .08), lm); lamp.position.set(0, .4, .27); breaker.add(lamp); breaker.userData.lamp = lm;
    } else if (ch === 'E') { exitPos = { x, z }; exitLight = add(new THREE.PointLight(0x88ffcc, 6, 9)); exitLight.position.set(x, 2, z); }
  }
  // Numeric cipher panel: placed near the exit, but its code must be deduced from the level note.
  if (exitPos) {
    const candidates=[];
    for(let r=1;r<rows-1;r++) for(let c=1;c<cols-1;c++) if(MAP[r][c]==='.') {
      const x=(c+.5)*CELL,z=(r+.5)*CELL,d=Math.hypot(x-exitPos.x,z-exitPos.z);
      if(d>2.8 && d<11) candidates.push({x,z,d});
    }
    candidates.sort((a,b)=>a.d-b.d);
    const spot=candidates[0] || {x:exitPos.x-2.2,z:exitPos.z};
    codePanel=new THREE.Group(); codePanel.position.set(spot.x,0,spot.z); add(codePanel); codePanel.userData.mapMarker=addMapMarker('panel',spot.x,spot.z);
    const panelMat=new THREE.MeshStandardMaterial({color:0x20252a,metalness:.65,roughness:.5});
    const panel=new THREE.Mesh(new THREE.BoxGeometry(.42,.72,.16),panelMat); panel.position.y=1.05; codePanel.add(panel);
    const screen=new THREE.Mesh(new THREE.BoxGeometry(.27,.18,.025),new THREE.MeshBasicMaterial({color:0x8b1f24})); screen.position.set(0,1.18,-.095); codePanel.add(screen);
    for(let k=0;k<3;k++){const led=new THREE.Mesh(new THREE.SphereGeometry(.025,6,5),new THREE.MeshBasicMaterial({color:k===0?0x9c2525:0x343b3b}));led.position.set(-.09+k*.09,.91,-.1);codePanel.add(led);}
  }
  // Chapter-specific environmental dressing so areas have distinct silhouettes and mood.
  const decorMat = (color, emissive=0x000000) => new THREE.MeshStandardMaterial({color, roughness:.95, emissive, emissiveIntensity:.18});
  const theme = [
    {kind:'hanging', color:0x45433b}, {kind:'pipe', color:0x39463e},
    {kind:'puddle', color:0x252c42}, {kind:'shelf', color:0x554333},
    {kind:'machine', color:0x39232a}
  ][i] || {kind:'hanging',color:0x444444};
  let decorCount=0;
  for(let r=1;r<rows-1;r++) for(let c=1;c<cols-1;c++){
    if(MAP[r][c]!=='.') continue;
    // Place small props only at cells adjacent to a wall, away from the walkable center.
    const wallN=MAP[r-1][c]==='#', wallS=MAP[r+1][c]==='#', wallW=MAP[r][c-1]==='#', wallE=MAP[r][c+1]==='#';
    if(!(wallN||wallS||wallW||wallE) || ((r*7+c*11+i*13)%5!==0)) continue;
    const x=(c+.5)*CELL,z=(r+.5)*CELL, m=decorMat(theme.color);
    const dx=wallW?-1.25:wallE?1.25:0, dz=wallN?-1.25:wallS?1.25:0;
    if(theme.kind==='hanging' && decorCount<8){
      const lamp=new THREE.Mesh(new THREE.CylinderGeometry(.08,.16,.12,8),m); lamp.position.set(x,2.72,z); add(lamp);
      const glow=new THREE.PointLight(0x8a7960,.22,4); glow.position.set(x,2.55,z); add(glow);
    } else if(theme.kind==='pipe' && decorCount<10){
      const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,CELL*.72,8),m); pipe.rotation.z=Math.PI/2; pipe.position.set(x,2.55,z); add(pipe);
    } else if(theme.kind==='puddle' && decorCount<8){
      const puddle=new THREE.Mesh(new THREE.CircleGeometry(.55+((r+c)%3)*.18,12),new THREE.MeshStandardMaterial({color:0x101626,roughness:.22,metalness:.25})); puddle.rotation.x=-Math.PI/2; puddle.position.set(x,.018,z); add(puddle);
    } else if(theme.kind==='shelf' && decorCount<8){
      const shelf=new THREE.Mesh(new THREE.BoxGeometry(.5,1.7,.45),m); shelf.position.set(x+dx, .9,z+dz); add(shelf);
    } else if(theme.kind==='machine' && decorCount<8){
      const machine=new THREE.Mesh(new THREE.BoxGeometry(.65,1.35,.55),m); machine.position.set(x+dx,.7,z+dz); add(machine);
      const light=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.06),new THREE.MeshBasicMaterial({color:0xa31f35})); light.position.set(x+dx,.9,z+dz-.29); add(light);
    }
    // Extra chapter-specific wear: debris, stains and cables break up the clean, uniform look.
    if(decorCount<18 && ((r*13+c*5+i*17)%3===0)){
      const debrisMat=decorMat(i===2?0x202432:i===3?0x3a2b20:i===4?0x32191f:0x292b28);
      const debris=new THREE.Mesh(new THREE.BoxGeometry(.18+((r+c)%3)*.12,.06,.16+((r*2+c)%3)*.1),debrisMat);
      debris.position.set(x+dx*.7,.05,z+dz*.7); debris.rotation.y=((r+c)*.7)%Math.PI; add(debris);
    }
    if(i===2 && decorCount<20 && ((r*9+c*7)%7===0)){
      const stain=new THREE.Mesh(new THREE.CircleGeometry(.3+((r+c)%3)*.12,10),new THREE.MeshStandardMaterial({color:0x080b12,roughness:.25,metalness:.35}));stain.rotation.x=-Math.PI/2;stain.position.set(x,.025,z);add(stain);
    }
    if(i===0 && decorCount<16 && ((r*11+c*3)%9===0)){
      const cable=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,1.4,6),decorMat(0x181716));cable.rotation.z=Math.PI/2;cable.position.set(x,2.25,z);add(cable);
    }
    decorCount++;
  }
  powered = !breaker; setPower();
  battery = 100; batteryTick = 0; lastNoise = null; damageCooldown = 0; scareTimer = 35 + Math.random()*25; updateBatteryHud(); updateHealthHud(); if (storyHud) storyHud.textContent = 'یادداشت‌ها: ' + foundNotes + '/5';
  const sl = add(new THREE.PointLight(0xffe0b0, 1.5, 7)); sl.position.set(start.x, 2.4, start.z);
  P.x = start.x; P.z = start.z; P.yaw = 0; P.pitch = 0; resetEnemy();
  say('مرحله ' + (i + 1) + ': ' + level.name, 3500);
}
function finishLevel() {
  if (LV + 1 < LEVELS.length) { audio.click(); buildLevel(LV + 1); save(); return; }
  ended = true; E.active = false; E.mesh.visible = false; document.exitPointerLock();
  const goodEnding = foundNotes >= 5;
  menuText.textContent = goodEnding ? 'پایان: حقیقت آشکار شد. پیام‌ها را جمع کردی و سیگنال را برای همیشه خاموش کردی.' : 'پایان: از ساختمان فرار کردی، اما سیگنال هنوز ادامه دارد... برای حقیقت، همه یادداشت‌ها را پیدا کن.';
  btn.style.display = 'none'; menu.classList.remove('hidden');
  try { localStorage.removeItem(SAVE_KEY); } catch {}
}

// ---------- Player ----------
const P = { x: 0, z: 0, yaw: 0, pitch: 0, bob: 0 };
const keys = {};
const cellOf = v => Math.floor(v / CELL);
function blocked(x, z) {
  const r = cellOf(z), c = cellOf(x);
  if (isWall(r, c)) return true;
  const d = doors[r + ',' + c];
  return !!d && d.t < 0.8;
}
function hits(x, z) {
  return blocked(x - R, z - R) || blocked(x + R, z - R) || blocked(x - R, z + R) || blocked(x + R, z + R);
}


// ---------- Save (browser localStorage) ----------
const SAVE_KEY = 'tls_save_v1';
const loadSave = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return null; } };
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ lv: LV, hasKey, hasFuse, powered, battery, torchOn, foundNotes, health, x: P.x, z: P.z, yaw: P.yaw })); } catch {} }

// ---------- Enemy ----------
const E = { x: 0, z: 0, active: false, state: 'patrol', path: [], repath: 0, lost: 0, dist: 99, investigate: 0, attackCooldown: 0, attackWindup: 0, cueTimer: 0 };
E.mesh = new THREE.Group();
{
  // Human-shaped horror creature: layered anatomy, worn clothing and a mottled procedural fabric texture.
  const skin = new THREE.MeshStandardMaterial({ color: 0x77716a, roughness: 1, metalness: 0 });
  const skinDark = new THREE.MeshStandardMaterial({ color: 0x393333, roughness: 1 });
  const clothCanvas = document.createElement('canvas'); clothCanvas.width = 128; clothCanvas.height = 128;
  const cx = clothCanvas.getContext('2d'); cx.fillStyle = '#24201f'; cx.fillRect(0,0,128,128);
  for(let i=0;i<2400;i++){ const v=18+Math.random()*42; cx.fillStyle=`rgba(${v|0},${(v*.92)|0},${(v*.88)|0},${.12+Math.random()*.25})`; cx.fillRect(Math.random()*128,Math.random()*128,1+Math.random()*3,1+Math.random()*5); }
  for(let i=0;i<18;i++){ cx.strokeStyle='rgba(5,4,4,.45)'; cx.lineWidth=1+Math.random()*2; cx.beginPath(); const x=Math.random()*128,y=Math.random()*128; cx.moveTo(x,y); cx.lineTo(x+(Math.random()-.5)*18,y+12+Math.random()*25); cx.stroke(); }
  const clothTex = new THREE.CanvasTexture(clothCanvas); clothTex.wrapS=clothTex.wrapT=THREE.RepeatWrapping; clothTex.repeat.set(1,1);
  const cloth = new THREE.MeshStandardMaterial({ map: clothTex, color: 0xaaa09a, roughness: 1, side: THREE.DoubleSide });
  const seam = new THREE.MeshStandardMaterial({ color: 0x171313, roughness: 1 });
  const bone = new THREE.MeshStandardMaterial({ color: 0x8b8178, roughness: 1 });
  const addPart=(geo,mat,x,y,z,rx=0,ry=0,rz=0)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);E.mesh.add(m);return m;};
  // Long, gaunt body and pelvis under a dirty, torn coat.
  addPart(new THREE.SphereGeometry(.31,12,10),skin,0,1.52,0).scale.set(1.12,1.45,.72);
  addPart(new THREE.CylinderGeometry(.19,.25,.42,10),skin,0,.98,0);
  addPart(new THREE.SphereGeometry(.25,12,8),skin,0,.77,0).scale.set(1.15,.72,.8);
  addPart(new THREE.CylinderGeometry(.22,.34,1.12,10,1,true),cloth,0,1.38,.025);
  addPart(new THREE.BoxGeometry(.58,.16,.16),cloth,0,1.93,0);
  // Collar and ragged coat tails.
  addPart(new THREE.ConeGeometry(.18,.28,7),cloth,-.13,1.95,-.02,0,0,.18);
  addPart(new THREE.ConeGeometry(.18,.28,7),cloth,.13,1.95,-.02,0,0,-.18);
  for(const side of [-1,1]){
    const tail=addPart(new THREE.PlaneGeometry(.28,.78),cloth,side*.16,.66,.08,side*.08,0,side*.08); tail.material=cloth;
    addPart(new THREE.ConeGeometry(.055,.22,5),bone,side*.12,.26,.08,Math.PI,0,side*.12);
  }
  // Neck, skull, sunken face and a crooked open jaw.
  addPart(new THREE.CylinderGeometry(.095,.12,.24,9),skin,0,2.05,0);
  addPart(new THREE.SphereGeometry(.235,14,12),skin,0,2.28,-.015).scale.set(.88,1.12,.88);
  addPart(new THREE.SphereGeometry(.16,10,8),skinDark,0,2.12,-.12).scale.set(1,.55,.9);
  const socket=new THREE.MeshStandardMaterial({color:0x080707,roughness:1});
  for(const x of [-.085,.085]){
    addPart(new THREE.SphereGeometry(.052,8,6),socket,x,2.31,-.205).scale.set(1,.8,.5);
    addPart(new THREE.SphereGeometry(.018,7,5),new THREE.MeshBasicMaterial({color:0x8e1710}),x,2.31,-.238);
  }
  addPart(new THREE.BoxGeometry(.14,.035,.055),seam,0,2.19,-.205);
  // Deep, ragged mouth and exposed teeth-like fragments.
  addPart(new THREE.BoxGeometry(.13,.09,.035),new THREE.MeshStandardMaterial({color:0x050303,roughness:1}),0,2.105,-.222);
  for(let tooth=0; tooth<5; tooth++) addPart(new THREE.ConeGeometry(.018,.055,4),bone,-.052+tooth*.026,2.115,-.247,Math.PI,0,0);
  // Uneven bony ridges and shoulder silhouettes catch the flashlight briefly.
  for(let side of [-1,1]){
    addPart(new THREE.ConeGeometry(.09,.34,5),bone,side*.27,1.98,.12,0,0,side*-0.65);
    addPart(new THREE.ConeGeometry(.055,.25,5),skinDark,side*.19,1.68,.18,0,0,side*.45);
  }
  addPart(new THREE.SphereGeometry(.12,8,6),skinDark,0,2.34,.13).scale.set(1.2,.8,.7);
  addPart(new THREE.ConeGeometry(.075,.16,5),skin,0,2.14,-.2,Math.PI,0,0);
  // Pivoted arms and legs allow a visible lurching gait.
  const limbs=[];
  function limb(x,y,z,upperLen,lowerLen,r,mat,kind){
    const pivot=new THREE.Group(); pivot.position.set(x,y,z); E.mesh.add(pivot);
    const upper=new THREE.Mesh(new THREE.CylinderGeometry(r*.72,r,upperLen,9),mat); upper.position.y=-upperLen/2; pivot.add(upper);
    const joint=new THREE.Mesh(new THREE.SphereGeometry(r*.78,8,6),skin); joint.position.y=-upperLen; pivot.add(joint);
    const lower=new THREE.Mesh(new THREE.CylinderGeometry(r*.42,r*.68,lowerLen,8),mat); lower.position.y=-upperLen-lowerLen/2; pivot.add(lower);
    const end=new THREE.Mesh(new THREE.SphereGeometry(r*.55,8,6),skinDark); end.position.set(0,-upperLen-lowerLen,0); pivot.add(end);
    if(kind==='arm') for(let k=0;k<3;k++){const finger=new THREE.Mesh(new THREE.ConeGeometry(.018,.16,5),bone);finger.position.set((k-1)*.045,-upperLen-lowerLen-.09,-.015);finger.rotation.x=Math.PI; pivot.add(finger);}
    if(kind==='leg'){const foot=new THREE.Mesh(new THREE.BoxGeometry(.13,.1,.27),skinDark);foot.position.set(0,-upperLen-lowerLen-.04,-.075);pivot.add(foot);}
    limbs.push({pivot,kind,side:x<0?-1:1});
  }
  limb(-.31,1.88,0,.48,.48,.115,skin,'arm'); limb(.31,1.88,0,.48,.48,.115,skin,'arm');
  limb(-.14,.73,0,.52,.55,.14,cloth,'leg'); limb(.14,.73,0,.52,.55,.14,cloth,'leg');
  E.mesh.userData.limbs=limbs; E.mesh.userData.animTime=0;
  const eyeGlow=new THREE.PointLight(0x8e1710,.45,2.2); eyeGlow.position.set(0,2.3,-.28); E.mesh.add(eyeGlow);
  E.mesh.visible=false; scene.add(E.mesh);
}

// ======== v9 UPGRADE: scary skin, smooth gait, smart AI helpers, jumpscares ========
Object.assign(E,{ heading:0, sp:0, lx:0, lz:0, pvx:0, pvz:0, ppx:undefined, ppz:0, lastSeen:null, stalkCd:25, stalkT:0, reveal:0, chaseT:0, phase:0 });
E.rig = new THREE.Group(); [...E.mesh.children].forEach(c => E.rig.add(c)); E.mesh.add(E.rig); E.mesh.scale.setScalar(1.1);
{
  const rig = E.rig, M = (c, r = 1) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const pale = M(0xb9b2a6), dk = M(0x050404), tooth = M(0xd8d0b8), wet = M(0x2a0707, .4);
  const add = (g, m, x, y, z, rx = 0, ry = 0, rz = 0, par = rig) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); par.add(o); return o; };
  // unnaturally long arms that reach the knees, with 5 long claws each
  for (const l of E.mesh.userData.limbs) if (l.kind === 'arm') {
    l.pivot.scale.set(1, 1.45, 1);
    for (let k = 0; k < 5; k++) add(new THREE.ConeGeometry(.014, .26, 4), tooth, (k - 2) * .032, -.96 - .13, -.01, Math.PI, 0, (k - 2) * .09, l.pivot);
  }
  // stretched grin: upper teeth row + hanging jaw with long teeth
  for (let i = 0; i < 11; i++) add(new THREE.ConeGeometry(.012, .06 + Math.random() * .03, 4), tooth, -.105 + i * .021, 2.2, -.215, Math.PI, 0, 0);
  E.jaw = new THREE.Group(); E.jaw.position.set(0, 2.17, -.13); rig.add(E.jaw);
  add(new THREE.BoxGeometry(.19, .045, .2), wet, 0, -.03, -.05, 0, 0, 0, E.jaw);
  for (let i = 0; i < 9; i++) add(new THREE.ConeGeometry(.011, .07 + Math.random() * .04, 4), tooth, -.08 + i * .02, .01, -.14, 0, 0, 0, E.jaw);
  add(new THREE.BoxGeometry(.12, .02, .02), wet, 0, -.08, -.1, 0, 0, 0, E.jaw);
  // cheek splits to the ears and cracked forehead
  for (const sx of [-1, 1]) { add(new THREE.BoxGeometry(.2, .012, .01), dk, sx * .14, 2.17, -.17, 0, sx * .6, sx * -.12); add(new THREE.BoxGeometry(.012, .16, .01), dk, sx * .05, 2.4, -.2, 0, 0, sx * .35); }
  // big pale glowing eyes with tiny black pupils
  E.eyes = []; for (const sx of [-.085, .085]) {
    const em = new THREE.MeshBasicMaterial({ color: 0xffe6d6 }); const e = add(new THREE.SphereGeometry(.05, 10, 8), em, sx, 2.32, -.218); e.scale.set(1, .85, .5);
    add(new THREE.SphereGeometry(.014, 6, 5), new THREE.MeshBasicMaterial({ color: 0x000000 }), sx, 2.32, -.243); E.eyes.push({ e, em });
  }
  // long matted hair
  for (let i = 0; i < 46; i++) { const a = Math.random() * Math.PI * 2, len = .35 + Math.random() * .55;
    add(new THREE.ConeGeometry(.013, len, 4), dk, Math.cos(a) * .15, 2.42 - len / 2 + .06, Math.sin(a) * .15 + .04, Math.PI, 0, Math.cos(a) * .12); }
  // ribs and spine bursting through the back
  for (let i = 0; i < 5; i++) add(new THREE.TorusGeometry(.2 - i * .008, .012, 5, 14, Math.PI), pale, 0, 1.2 + i * .13, .02, Math.PI / 2, 0, 0).scale.set(1, 1, 1.15);
  for (let i = 0; i < 9; i++) add(new THREE.ConeGeometry(.02, .1 + (i % 2) * .05, 4), pale, 0, 1.05 + i * .1, .24, Math.PI / 2, 0, 0);
  // dried blood on the coat
  const bl = new THREE.MeshBasicMaterial({ color: 0x2e0505, side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) add(new THREE.PlaneGeometry(.08 + Math.random() * .12, .12 + Math.random() * .3), bl, (Math.random() - .5) * .3, 1.0 + Math.random() * .7, -.3, 0, Math.PI, 0);
  rig.children.find(o => o.isPointLight)?.color.set(0xff2a1a);
}
function animateEnemy(dt) {
  const U = E.mesh.userData; U.animTime = (U.animTime || 0) + dt; const t = U.animTime;
  const inst = Math.min(8, Math.hypot(E.x - E.lx, E.z - E.lz) / Math.max(dt, .001)); E.lx = E.x; E.lz = E.z;
  E.sp += (inst - E.sp) * Math.min(1, dt * 8);
  const k = Math.min(E.sp / 5, 1), chase = E.state === 'chase' || E.state === 'stalk';
  E.phase += dt * (1.2 + E.sp * 1.5);
  const sw = Math.sin(E.phase);
  for (const l of U.limbs) {
    const s = l.side < 0 ? sw : -sw;
    if (l.kind === 'leg') { l.pivot.rotation.x = s * (.08 + .66 * k); l.pivot.rotation.z = l.side * .03; }
    else { const base = chase ? .85 + Math.sin(t * 9 + l.side) * .08 : -.1 - k * .12; l.pivot.rotation.x = base - s * (chase ? .22 : .34) * k; l.pivot.rotation.z = l.side * -(.1 + .06 * Math.sin(t * 1.3 + l.side)); }
  }
  const th = -(.05 + .3 * k) * (chase ? 1.15 : 1);
  E.rig.rotation.x = th; E.rig.position.z = -.75 * Math.sin(th); E.rig.position.y = .75 * (1 - Math.cos(th)) + Math.abs(sw) * .055 * k;
  E.rig.rotation.z = Math.sin(E.phase * .5) * .06 * k + (chase ? Math.sin(t * 19) * .014 : Math.sin(t * 1.1) * .01);
  if (E.jaw) E.jaw.rotation.x = chase ? .55 + Math.sin(t * 14) * .13 : .1 + Math.sin(t * 1.3) * .04;
  for (const q of E.eyes || []) { q.e.scale.set(chase ? 1.5 : 1, chase ? 1.3 : .85, .5); q.em.color.set(chase ? 0xff4a30 : 0xffe6d6); }
}
function walkClear(ax, az, bx, bz) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / .35);
  for (let i = 1; i <= n; i++) {
    const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
    for (const [ox, oz] of [[.4, .4], [-.4, .4], [.4, -.4], [-.4, -.4]]) if (isWall(cellOf(z + oz), cellOf(x + ox))) return false;
    const d = doors[cellOf(z) + ',' + cellOf(x)]; if (d && d.locked) return false;
  }
  return true;
}
function moveEnemy(dt, speed) {
  while (E.path.length > 1) { const n = E.path[1]; if (!walkClear(E.x, E.z, (n[1] + .5) * CELL, (n[0] + .5) * CELL)) break; E.path.shift(); }
  let dx = 0, dz = 0; const n = E.path[0];
  if (n) { const vx = (n[1] + .5) * CELL - E.x, vz = (n[0] + .5) * CELL - E.z, l = Math.hypot(vx, vz); if (l < .35) E.path.shift(); else { dx = vx / l; dz = vz / l; } }
  const cur = Math.hypot(E.vx || 0, E.vz || 0), a = Math.min(1, dt * (E.state === 'chase' ? 7 : 3.5));
  E.vx = (E.vx || 0) + (dx * (n ? speed : 0) - (E.vx || 0)) * a; E.vz = (E.vz || 0) + (dz * (n ? speed : 0) - (E.vz || 0)) * a;
  const ahead = doors[cellOf(E.z + E.vz * .45) + ',' + cellOf(E.x + E.vx * .45)]; if (ahead && !ahead.open && !ahead.locked) { ahead.open = true; audio.creak(); }
  const ok = (x, z) => ![[.3, .3], [-.3, .3], [.3, -.3], [-.3, -.3]].some(([ox, oz]) => isWall(cellOf(z + oz), cellOf(x + ox)));
  const nx = E.x + E.vx * dt, nz = E.z + E.vz * dt; if (ok(nx, E.z)) E.x = nx; if (ok(E.x, nz)) E.z = nz;
  if (Math.hypot(E.vx, E.vz) > .15) { let d = (Math.atan2(E.vx, E.vz) + Math.PI) - E.heading; d = Math.atan2(Math.sin(d), Math.cos(d)); E.heading += d * Math.min(1, dt * (E.state === 'chase' ? 10 : 4.5)); }
  E.mesh.rotation.y = E.heading;
}
function pickSearch() {
  const c0 = E.lastSeen || { x: P.x, z: P.z };
  for (let i = 0; i < 25; i++) {
    const r = cellOf(c0.z) + Math.floor(Math.random() * 7) - 3, c = cellOf(c0.x) + Math.floor(Math.random() * 7) - 3;
    if (!passable(r, c)) continue; const p = findPath(cellOf(E.z), cellOf(E.x), r, c); if (p.length) { E.path = p; return; }
  }
}
function vanishEnemy() {
  audio.vanish(); blackout = .4 + Math.random() * .4;
  for (let i = 0; i < 50; i++) { const r = 1 + Math.floor(Math.random() * (rows - 2)), c = 1 + Math.floor(Math.random() * (cols - 2));
    if (passable(r, c) && Math.hypot((c + .5) * CELL - P.x, (r + .5) * CELL - P.z) > 14) { E.x = (c + .5) * CELL; E.z = (r + .5) * CELL; break; } }
  E.mesh.visible = false; E.reveal = 3.5; E.vx = E.vz = 0; E.lx = E.x; E.lz = E.z;
  E.state = 'investigate'; E.investigate = 9; E.lastSeen = { x: P.x, z: P.z }; E.path = [];
}
// ---- full-screen independent face jumpscare (not the enemy model) ----
let blackout = 0, jsTimer = 32 + Math.random() * 34, jsT = -1, jsVariant = 0;
const jsFlash = document.createElement('div');
jsFlash.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:80;opacity:0;background:#fff;mix-blend-mode:screen';
document.body.appendChild(jsFlash);
const jsCanvas = document.createElement('canvas');
jsCanvas.width = 900; jsCanvas.height = 900;
jsCanvas.style.cssText = 'position:fixed;inset:-5%;width:110%;height:110%;z-index:79;pointer-events:none;opacity:0;transform:scale(.08) rotate(0deg);filter:contrast(1.55) saturate(1.35);transform-origin:center center';
document.body.appendChild(jsCanvas);
const jctx = jsCanvas.getContext('2d');
function paintJumpscareFace() {
  const c = jctx, w = 900, h = 900, v = jsVariant;
  c.clearRect(0,0,w,h);
  const bg = c.createRadialGradient(450,430,30,450,450,620);
  bg.addColorStop(0,'#280303'); bg.addColorStop(.58,'#090304'); bg.addColorStop(1,'#000');
  c.fillStyle=bg; c.fillRect(0,0,w,h);
  // A distorted, independent face: no enemy mesh or character animation.
  c.save(); c.translate(450,450); c.rotate((Math.random()-.5)*.035);
  const skin=c.createRadialGradient(-90,-170,30,0,0,490);
  skin.addColorStop(0, v===1?'#d8c8b8':'#a99a8d'); skin.addColorStop(.55,'#59423d'); skin.addColorStop(1,'#10090b');
  c.fillStyle=skin; c.beginPath(); c.moveTo(0,-405); c.bezierCurveTo(320,-390,390,-80,330,210); c.bezierCurveTo(270,420,110,470,0,440); c.bezierCurveTo(-180,470,-310,300,-335,80); c.bezierCurveTo(-390,-220,-240,-390,0,-405); c.fill();
  // cracked forehead and torn skin
  c.strokeStyle='#170608'; c.lineWidth=13; c.beginPath(); c.moveTo(-30,-370); c.lineTo(-70,-275); c.lineTo(-25,-220); c.lineTo(-90,-150); c.moveTo(170,-300); c.lineTo(120,-235); c.lineTo(160,-170); c.stroke();
  c.strokeStyle='#a51b20'; c.lineWidth=5; c.beginPath(); c.moveTo(-70,-275); c.lineTo(-25,-220); c.lineTo(-90,-150); c.stroke();
  // sunken eye sockets
  for(const x of [-145,145]){
    const ey=c.createRadialGradient(x,-105,8,x,-105,145); ey.addColorStop(0,'#000'); ey.addColorStop(.72,'#080305'); ey.addColorStop(1,'#351014');
    c.fillStyle=ey; c.beginPath(); c.ellipse(x,-100,132,100,x*.0008,0,Math.PI*2); c.fill();
    c.fillStyle=v===2?'#e9ded0':'#b80d16'; c.shadowColor='#ff001b'; c.shadowBlur=42;
    c.beginPath(); c.ellipse(x+(Math.random()-.5)*13,-92,27,39,0,0,Math.PI*2); c.fill(); c.shadowBlur=0;
    c.fillStyle='#000'; c.beginPath(); c.ellipse(x,-92,10,31,0,0,Math.PI*2); c.fill();
    c.strokeStyle='#160507'; c.lineWidth=20; c.beginPath(); c.moveTo(x-120,-180); c.lineTo(x,-220); c.lineTo(x+115,-165); c.stroke();
  }
  // nose cavity
  c.fillStyle='#100407'; c.beginPath(); c.moveTo(-48,20); c.lineTo(0,-65); c.lineTo(55,20); c.lineTo(25,82); c.lineTo(-28,82); c.closePath(); c.fill();
  // impossibly wide screaming mouth
  c.fillStyle='#020102'; c.strokeStyle='#270609'; c.lineWidth=28;
  c.beginPath(); c.ellipse(0,205,190,v===1?175:145,(Math.random()-.5)*.08,0,Math.PI*2); c.fill(); c.stroke();
  c.fillStyle='#8d1018'; c.beginPath(); c.ellipse(0,220,125,100,0,0,Math.PI*2); c.fill();
  // uneven teeth
  for(let i=0;i<13;i++){
    const x=-158+i*26, top=-1+Math.random()*10;
    c.fillStyle=i%3===0?'#9b8a75':'#e0d6c2'; c.beginPath(); c.moveTo(x,105+top); c.lineTo(x+12,105+top); c.lineTo(x+6,165+Math.random()*18); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(x,300); c.lineTo(x+13,300); c.lineTo(x+7,245-Math.random()*20); c.closePath(); c.fill();
  }
  // blood streaks and fine veins
  for(let i=0;i<19;i++){
    const x=(Math.random()-.5)*590, y=-30+Math.random()*370;
    c.strokeStyle=i%2?'rgba(105,0,8,.8)':'rgba(18,0,2,.9)'; c.lineWidth=2+Math.random()*7;
    c.beginPath(); c.moveTo(x,y); c.bezierCurveTo(x-20,y+55,x+25,y+90,x+(Math.random()-.5)*35,y+150+Math.random()*100); c.stroke();
  }
  c.restore();
  // film grain / hard vignette
  const vg=c.createRadialGradient(450,450,180,450,450,650); vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,.92)');
  c.fillStyle=vg; c.fillRect(0,0,w,h);
}
function jumpScare() {
  if (jsT >= 0 || dead || hidden) return;
  jsVariant = Math.floor(Math.random()*3); paintJumpscareFace();
  jsT = 0; audio.jumpscare(); jsFlash.style.opacity = '.98';
  jsCanvas.style.opacity = '1'; jsCanvas.style.transform = 'scale(.08) rotate(0deg)';
}
function updateJumpScare(dt) {
  if (playing && !hidden && jsT < 0) {
    jsTimer -= dt;
    if (jsTimer <= 0 && E.state !== 'chase' && E.state !== 'stalk') {
      jsTimer = 38 + Math.random() * 55; jumpScare();
    } else if (E.state === 'chase' && E.dist < 8 && (E.chaseScareCd || 0) <= 0 && Math.random() < dt * .018) {
      E.chaseScareCd = 65 + Math.random() * 60; jumpScare();
    }
  }
  E.chaseScareCd = Math.max(0, (E.chaseScareCd || 0) - dt);
  if (jsT < 0) return;
  jsT += dt;
  const p = Math.min(jsT / .72, 1);
  // explosive rush toward the camera, brief violent shake, then snap away
  const rush = p < .42 ? 0.08 + 2.35 * Math.pow(p/.42, 2) : 2.43 - .18*((p-.42)/.58);
  const shake = (1-p) * 18;
  jsCanvas.style.transform = `scale(${rush}) rotate(${(Math.random()-.5)*shake}deg) translate(${(Math.random()-.5)*shake}px,${(Math.random()-.5)*shake}px)`;
  jsCanvas.style.filter = `contrast(${1.5+Math.random()*.65}) saturate(${1.3+Math.random()*.8})`;
  jsCanvas.style.opacity = p < .68 ? '1' : String(Math.max(0,1-(p-.68)/.32));
  jsFlash.style.opacity = p < .08 ? String(.98-p*5) : (p > .55 && p < .63 ? '.72' : '0');
  if (jsT > .82) { jsT = -1; jsCanvas.style.opacity='0'; jsFlash.style.opacity='0'; jsCanvas.style.transform='scale(.08)'; }
}
function passable(r, c) {
  if (isWall(r, c)) return false;
  const d = doors[r + ',' + c]; return !d || !d.locked;
}
function findPath(sr, sc, tr, tc) {
  const q = [[sr, sc]], prev = { [sr + ',' + sc]: null };
  while (q.length) {
    const [r, c] = q.shift();
    if (r === tr && c === tc) { const out = []; let k = r + ',' + c; while (prev[k]) { out.push(prev[k].cur); k = prev[k].from; } return out.reverse(); }
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc, k = nr + ',' + nc;
      if (k in prev || !passable(nr, nc)) continue;
      prev[k] = { from: r + ',' + c, cur: [nr, nc] }; q.push([nr, nc]);
    }
  }
  return [];
}
function lineOfSight(ax, az, bx, bz) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / .5);
  for (let i = 1; i < n; i++) {
    const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
    const r = cellOf(z), c = cellOf(x);
    if (isWall(r, c)) return false;
    const d = doors[r + ',' + c]; if (d && d.t < .8) return false;
  }
  return true;
}
function resetEnemy() { E.x = (level.enemy[1] + .5) * CELL; E.z = (level.enemy[0] + .5) * CELL; E.path = []; E.state = 'patrol'; E.lost = 0; E.investigate = 0; E.attackCooldown = 0; E.attackWindup = 0; E.cueTimer = 0; E.active = true; E.mesh.visible = true; E.lastSeen = null; E.stalkCd = 25; E.reveal = 0; E.chaseT = 0; E.chaseVanishCd = 22 + Math.random() * 18; E.chaseScareCd = 35 + Math.random() * 30; E.sp = 0; E.vx = E.vz = 0; E.lx = E.x; E.lz = E.z; E.ppx = undefined; }
function pickPatrol() {
  for (let i = 0; i < 30; i++) {
    const r = 1 + Math.floor(Math.random() * (rows - 2)), c = 1 + Math.floor(Math.random() * (cols - 2));
    if (!passable(r, c) || Math.hypot((c + .5) * CELL - E.x, (r + .5) * CELL - E.z) < 8) continue;
    const p = findPath(cellOf(E.z), cellOf(E.x), r, c); if (p.length) { E.path = p; return; }
  }
}
function updateHideSense(dt) {
  const sense = document.getElementById('hideSense');
  if (!sense || !hidden || !hideSpot) return;
  E.cueTimer -= dt;
  if (E.cueTimer > 0) return;
  E.cueTimer = .28;
  const dx = E.x - P.x, dz = E.z - P.z, dist = Math.hypot(dx, dz);
  const angle = Math.atan2(dx, -dz) - P.yaw;
  const side = Math.cos(angle) > .45 ? 'جلو' : Math.cos(angle) < -.45 ? 'پشت' : (Math.sin(angle) > 0 ? 'راست' : 'چپ');
  const range = dist < 2.2 ? 'خیلی نزدیک' : dist < 5 ? 'نزدیک' : dist < 10 ? 'در فاصله متوسط' : 'دور';
  sense.textContent = dist < 2.2 ? `⚠ صدای دشمن: ${range}، سمت ${side}` : `👣 صدای قدم‌ها: ${range}، سمت ${side}`;
  sense.classList.toggle('danger', dist < 3.2);
}
function updateEnemy(dt) {
  if (!E.active) return;
  animateEnemy(dt);
  const dx = P.x - E.x, dz = P.z - E.z, dist = Math.hypot(dx, dz); E.dist = dist;
  E.stalkCd = Math.max(0, E.stalkCd - dt); E.chaseVanishCd = Math.max(0, (E.chaseVanishCd || 0) - dt); if (E.reveal > 0) { E.reveal -= dt; if (E.reveal <= 0) E.mesh.visible = true; }
  if (E.ppx === undefined) { E.ppx = P.x; E.ppz = P.z; }
  { const k = Math.min(1, dt * 6); E.pvx += (Math.max(-6, Math.min(6, (P.x - E.ppx) / Math.max(dt, .001))) - E.pvx) * k; E.pvz += (Math.max(-6, Math.min(6, (P.z - E.ppz) / Math.max(dt, .001))) - E.pvz) * k; E.ppx = P.x; E.ppz = P.z; }
  // The enemy emits distant groans that become more frequent and louder as it approaches.
  E.cueTimer = Math.max(0, (E.cueTimer || 0) - dt);
  if (!hidden && dist < 12 && E.cueTimer <= 0 && playing) {
    const near = Math.max(0, Math.min(1, (12 - dist) / 10));
    audio.growl(.45 + near * .85);
    E.cueTimer = 5.5 + Math.random() * 4.5 - near * 2.2;
  }
  updateHideSense(dt);
  const sees = !hidden && dist < (torchOn ? 22 : 13) && lineOfSight(E.x, E.z, P.x, P.z);
  if (hidden) {
    hideTime += dt;
    if (hideTime > 18) { hidden=false; hideSpot=null; hideTime=0; document.getElementById('hideOverlay')?.classList.remove('show'); say('دیگر نمی‌توانی نفس را حبس کنی؛ مجبور شدی از مخفیگاه بیرون بیایی!',3000); camera.position.set(P.x,1.65,P.z); }
    if (E.state === 'stalk') vanishEnemy();
    E.lost += dt;
    if (E.state === 'chase' && E.lost > 1.4) {
      E.state = 'investigate'; E.investigate = 6;
      E.path = hideSpot ? findPath(cellOf(E.z), cellOf(E.x), cellOf(hideSpot.z), cellOf(hideSpot.x)) : [];
    }
    if (E.state === 'investigate' && hideSpot) {
      E.investigate -= dt;
      const cabinetDist=Math.hypot(E.x-hideSpot.x,E.z-hideSpot.z);
      // Search the cabinet briefly, then deliberately walk away instead of camping until the player's breath runs out.
      if (E.investigate <= 0) {
        E.state='patrol'; E.path=[]; E.investigate=0;
        let best=null, bestD=-1;
        for(let rr=1;rr<rows-1;rr++) for(let cc=1;cc<cols-1;cc++) if(passable(rr,cc)) {
          const tx=(cc+.5)*CELL,tz=(rr+.5)*CELL,d=Math.hypot(tx-hideSpot.x,tz-hideSpot.z);
          if(d>bestD && d>10){const p=findPath(cellOf(E.z),cellOf(E.x),rr,cc);if(p.length){best={p,d};bestD=d;}}
        }
        if(best) E.path=best.p; else pickPatrol();
      } else {
        if (!E.path.length && cabinetDist > 1.6) E.path=findPath(cellOf(E.z),cellOf(E.x),cellOf(hideSpot.z),cellOf(hideSpot.x));
        const target=E.path[0];
        if(target){const tx=(target[1]+.5)*CELL,tz=(target[0]+.5)*CELL,vx=tx-E.x,vz=tz-E.z,l=Math.hypot(vx,vz);if(l<.28)E.path.shift();else{E.x+=vx/l*1.8*dt;E.z+=vz/l*1.8*dt;E.mesh.rotation.y=Math.atan2(vx,vz)+Math.PI;}}
        if(cabinetDist<1.7 && E.investigate<1.8 && Math.random()<dt*.055){hidden=false;hideSpot=null;const ov=document.getElementById('hideOverlay');if(ov)ov.classList.remove('show');say('دستگیره کمد تکان خورد؛ پیدایت کرد!',2600);damagePlayer();}
      }
    }
    if (E.state === 'patrol' && !E.path.length) pickPatrol();
    if (E.state === 'patrol' && E.path.length) {
      const target=E.path[0], tx=(target[1]+.5)*CELL, tz=(target[0]+.5)*CELL, vx=tx-E.x, vz=tz-E.z, l=Math.hypot(vx,vz);
      if(l<.28) E.path.shift(); else { E.x+=vx/l*1.25*dt; E.z+=vz/l*1.25*dt; E.mesh.rotation.y=Math.atan2(vx,vz)+Math.PI; }
    }
    E.mesh.position.set(E.x,0,E.z); return;
  }
  // Investigate the last sound position; running and door interactions create louder noises.
  if (lastNoise && lastNoise.age < 4.5 && Math.hypot(lastNoise.x-E.x,lastNoise.z-E.z) < lastNoise.radius) {
    if (E.state !== 'chase' && E.state !== 'investigate') {
      E.state = 'investigate'; E.investigate = 4.5; E.path = [];
      E.path = findPath(cellOf(E.z), cellOf(E.x), cellOf(lastNoise.z), cellOf(lastNoise.x));
    }
  }
  if (E.state === 'stalk') {
    E.stalkT -= dt; E.repath -= dt;
    if (E.repath <= 0) { E.path = findPath(cellOf(E.z), cellOf(E.x), cellOf(P.z), cellOf(P.x)); E.repath = .3; }
    moveEnemy(dt, 2.4); E.mesh.position.set(E.x, 0, E.z);
    if (E.stalkT <= 0 || dist < 3.6) vanishEnemy();
    return;
  }
  if (sees && E.state !== 'chase' && dist > 8 && E.stalkCd <= 0 && Math.random() < .45) {
    E.state = 'stalk'; E.stalkT = 1.8; E.stalkCd = 75 + Math.random() * 60; E.repath = 0; audio.whisper();
  } else if (sees || dist < 3.2) {
    if (E.state !== 'chase') audio.scream();
    E.state = 'chase'; E.lost = 0; E.repath = 0;
  }
  E.attackCooldown = Math.max(0, E.attackCooldown - dt);
  if (E.state === 'chase') {
    E.lost = sees || dist < 6 ? 0 : E.lost + dt;
    if (E.lost > 9) { E.state = 'investigate'; E.investigate = 9; E.path = []; }
    // Close-range attack: wind up, lunge and deal damage instead of freezing face-to-face.
    if (dist < 1.75 && E.attackCooldown <= 0) {
      E.attackCooldown = 1.35;
      E.attackWindup = .22;
      audio.scream();
      say('دشمن به سمتت حمله می‌کند!', 900);
    }
    if (E.attackWindup > 0) {
      E.attackWindup -= dt;
      if (E.attackWindup <= 0 && dist < 2.15) {
        const lx = E.x + (P.x - E.x) / Math.max(.01, dist) * .55;
        const lz = E.z + (P.z - E.z) / Math.max(.01, dist) * .55;
        if (passable(cellOf(lz), cellOf(lx))) { E.x = lx; E.z = lz; }
        damagePlayer();
      }
    }
    E.repath -= dt;
    if (E.repath <= 0) {
      let tx = P.x, tz = P.z;
      if (sees) { E.lastSeen = { x: P.x, z: P.z }; const lead = Math.min(dist / 4.8, 1.3), px = P.x + E.pvx * lead, pz = P.z + E.pvz * lead; if (passable(cellOf(pz), cellOf(px))) { tx = px; tz = pz; } }
      else if (E.lastSeen) { tx = E.lastSeen.x; tz = E.lastSeen.z; }
      E.path = findPath(cellOf(E.z), cellOf(E.x), cellOf(tz), cellOf(tx)); E.repath = .2;
    }
  } else if (E.state === 'investigate') {
    E.investigate -= dt;
    if (!E.path.length && E.investigate > 0) pickSearch();
    else if (!E.path.length && E.investigate <= 0) { E.state = 'patrol'; E.path = []; E.lastSeen = null; }
  } else if (!E.path.length) pickPatrol();
  E.chaseT = E.state === 'chase' ? E.chaseT + dt : 0;
  // Rare supernatural disappearance during a sustained chase. The creature relocates,
  // remains invisible briefly, then resumes hunting from another corridor.
  if (E.state === 'chase' && E.chaseT > 7 && E.chaseVanishCd <= 0 && dist > 5.5 && Math.random() < dt * .11) {
    E.chaseVanishCd = 42 + Math.random() * 38;
    vanishEnemy();
    E.mesh.position.set(E.x, 0, E.z);
    return;
  }
  const speed = E.state === 'chase' ? Math.min(5.7, 4.5 + E.chaseT * .22 + (dist > 8 ? .7 : 0)) : E.state === 'investigate' ? 2.6 : 1.45;
  moveEnemy(dt, speed);
  E.mesh.position.set(E.x, 0, E.z);
  if (E.state === 'chase' && dist < 1.25 && E.attackCooldown <= 0) { E.attackCooldown = 1.1; E.attackWindup = .12; audio.scream(); }
}
function damagePlayer(){
  if (dead || damageCooldown > 0) return;
  health = Math.max(0, health-1); damageCooldown = 2.3; updateHealthHud(); audio.thud(.9); audio.pant(.9); showBloodSplash(); vig.style.opacity = .9;
  if (health <= 0) { die(); return; }
  // Knock the player back slightly to create a chance to escape.
  const dx=P.x-E.x, dz=P.z-E.z, len=Math.max(.01,Math.hypot(dx,dz));
  const nx=P.x+dx/len*1.4, nz=P.z+dz/len*1.4; if(!hits(nx,nz)){P.x=nx;P.z=nz;}
  E.state='chase'; E.lost=0; E.repath=0; say('آسیب دیدی! سلامتی: '+health+'/3',1800);
}
function die() {
  if (dead || hidden) return; dead = true; playing = false; audio.thud(1); document.exitPointerLock();
  menuText.textContent = 'چیزی تو را گرفت...'; btn.textContent = 'دوباره'; btn.style.display = ''; menu.classList.remove('hidden');
}
function respawn() {
  const sv = loadSave(), same = sv && (sv.lv || 0) === LV;
  buildLevel(LV);
  if (same) {
    hasKey = !!sv.hasKey; hasFuse = !!sv.hasFuse; foundNotes = Number.isFinite(sv.foundNotes) ? sv.foundNotes : foundNotes; health = Number.isFinite(sv.health) ? sv.health : 3; powered = powered || !!sv.powered; battery = Number.isFinite(sv.battery) ? sv.battery : 100; torchOn = sv.torchOn !== false && battery > 0; torch.visible = torchOn; updateBatteryHud(); updateHealthHud(); setPower();
    if (key) key.visible = !hasKey;
    if (fuse) fuse.visible = !(hasFuse || (breaker && sv.powered));
    P.x = sv.x; P.z = sv.z; P.yaw = sv.yaw || 0; resetEnemy();
  }
  health = 3; updateHealthHud(); damageCooldown = 0; dead = false; vig.style.opacity = 0;
}

// ---------- UI ----------
const menu = document.getElementById('menu'), hint = document.getElementById('hint');
const btn = document.getElementById('btnPlay'), menuText = document.getElementById('menuText');
let playing = false, ended = false, dead = false, hintTimer = 0, hbTimer = 0;
const vig = document.getElementById('vig');
const bloodSplash=document.createElement('div'); bloodSplash.id='bloodSplash'; bloodSplash.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:30;opacity:0;background:radial-gradient(ellipse at center,transparent 35%,rgba(110,0,8,.12) 56%,rgba(130,0,10,.78) 100%);transition:opacity .12s;'; document.body.appendChild(bloodSplash);
let bloodTimer=0, footstepTimer=0, pantTimer=0;
function showBloodSplash(){ bloodSplash.style.opacity='1'; bloodTimer=.75; }
const batteryHud = document.getElementById('batteryHud');
const batteryFill = document.getElementById('batteryFill');
const batteryText = document.getElementById('batteryText');
const storyHud = document.getElementById('storyHud');
// Re-readable collected-letter journal (button + J key).
const journalBtn = document.createElement('button');
journalBtn.id='journalBtn'; journalBtn.textContent='نامه‌ها (J)';
journalBtn.style.cssText='position:fixed;top:62px;left:12px;z-index:20;padding:8px 12px;background:#171b1b;color:#e8e2d2;border:1px solid #777;border-radius:4px;font:14px sans-serif;cursor:pointer';
document.body.appendChild(journalBtn);
const journal = document.createElement('div');
journal.id='journalOverlay';
journal.style.cssText='position:fixed;inset:0;z-index:60;display:none;overflow:auto;background:rgba(3,5,6,.96);color:#e7dfca;padding:5vh 7vw;box-sizing:border-box;font:16px/1.9 sans-serif;direction:rtl';
journal.innerHTML='<button id="journalClose" style="float:left;background:#292d2b;color:#fff;border:1px solid #777;padding:8px 14px;cursor:pointer">بستن (J)</button><h2 style="color:#cbbd94">دفترچه‌ی نامه‌ها و پرونده</h2><p>نامه‌های پیدا‌شده اینجا می‌مانند تا هر زمان خواستی دوباره بخوانی.</p><div id="journalEntries"></div>';
document.body.appendChild(journal);
function renderJournal(){
 const host=document.getElementById('journalEntries');
 if(!collectedLetters.length){host.innerHTML='<p>هنوز نامه‌ای پیدا نکرده‌ای.</p>';return;}
 host.innerHTML=collectedLetters.map((n,i)=>`<article style="border:1px solid #49463d;padding:14px;margin:16px 0;background:#111514"><h3>نامه ${i+1} — ${n.chapter}</h3><p>${n.story}</p><p style="white-space:pre-wrap">${n.clue}</p></article>`).join('');
}
function toggleJournal(force){
 const show=typeof force==='boolean'?force:journal.style.display==='none';
 journal.style.display=show?'block':'none';
 if(show){renderJournal(); if(document.pointerLockElement)document.exitPointerLock();}
}
journalBtn.addEventListener('click',()=>toggleJournal());
document.getElementById('journalClose').addEventListener('click',()=>toggleJournal(false));

const healthHud = document.getElementById('healthHud');
const healthText = document.getElementById('healthText');
const hideOverlay = document.createElement('div'); hideOverlay.id='hideOverlay'; hideOverlay.innerHTML='<span>داخل مخفیگاه</span><strong id="hideSense">👣 گوش کن...</strong><small>برای بیرون آمدن E را بزن</small>';  document.body.appendChild(hideOverlay);
const mapHud = document.createElement('div'); mapHud.id='mapHud';
mapHud.innerHTML='<div class="mapTitle">نقشه <span id="mapLevel"></span></div><canvas id="miniMap" width="180" height="140"></canvas><small>● تو　● دشمن<br>◆ آیتم　□ پنل/قفل</small>';
document.body.appendChild(mapHud);
const miniMap = mapHud.querySelector('canvas'), mapCtx = miniMap.getContext('2d');
let mapDrawTimer=0;
function drawMiniMap(dt=0){
  mapDrawTimer-=dt; if(mapDrawTimer>0)return; mapDrawTimer=.12;
  if(!MAP || !mapCtx)return;
  const w=miniMap.width,h=miniMap.height, cell=Math.min((w-12)/cols,(h-12)/rows), ox=(w-cols*cell)/2, oy=(h-rows*cell)/2;
  mapCtx.clearRect(0,0,w,h); mapCtx.fillStyle='rgba(2,5,6,.9)'; mapCtx.fillRect(0,0,w,h);
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const ch=MAP[r][c]; mapCtx.fillStyle=ch==='#'?'#59615d':(ch==='E'?'#79d9b0':'#18221e');
    mapCtx.fillRect(ox+c*cell,oy+r*cell,cell-.7,cell-.7);
  }
  for(const m of mapMarkers){ if(!m.active)continue; const mx=ox+(m.x/CELL)*cell, my=oy+(m.z/CELL)*cell; const colors={key:'#ffd34d',fuse:'#53e6ff',breaker:'#ff9b45',battery:'#73e6a1',med:'#ff5b68',note:'#eee0b8',panel:'#c28cff',lock:'#ff8d45'}; mapCtx.fillStyle=colors[m.type]||'#fff'; mapCtx.beginPath(); if(m.type==='panel'||m.type==='lock'){mapCtx.rect(mx-2.8,my-2.8,5.6,5.6);}else{mapCtx.arc(mx,my,2.8,0,Math.PI*2);} mapCtx.fill(); }
  const px=ox+(P.x/CELL)*cell, py=oy+(P.z/CELL)*cell;
  mapCtx.fillStyle='#e8eee9';mapCtx.beginPath();mapCtx.arc(px,py,3.4,0,Math.PI*2);mapCtx.fill();
  mapCtx.strokeStyle='#e8eee9';mapCtx.lineWidth=1.5;mapCtx.beginPath();mapCtx.moveTo(px,py);mapCtx.lineTo(px-Math.sin(P.yaw)*7,py-Math.cos(P.yaw)*7);mapCtx.stroke();
  if(E.active && (E.state==='chase'||E.dist<7)){
    const ex=ox+(E.x/CELL)*cell, ey=oy+(E.z/CELL)*cell;
    mapCtx.fillStyle='#ef3939';mapCtx.beginPath();mapCtx.arc(ex,ey,3.2,0,Math.PI*2);mapCtx.fill();
  }
  const ml=document.getElementById('mapLevel'); if(ml)ml.textContent='· '+(LV+1);
}
function updateHealthHud(){ if(healthText) healthText.textContent = '♥ '.repeat(Math.max(0,health)) + '♡ '.repeat(Math.max(0,3-health)); if(healthHud) healthHud.style.opacity = health<=1 ? '1' : '.85'; }
function updateBatteryHud() {
  if (batteryFill) batteryFill.style.width = battery + '%';
  if (batteryText) batteryText.textContent = Math.ceil(battery) + '%';
  if (batteryFill) batteryFill.style.background = battery < 20 ? '#d64b42' : '#a8c9a9';
  if (batteryHud) batteryHud.style.opacity = torchOn ? '1' : '.55';
}
function makeNoise(radius, label = '') {
  if (!playing || hidden) return;
  lastNoise = { x: P.x, z: P.z, radius, label, age: 0 };
}
function say(t, ms = 2500) {
  hint.textContent = t; hint.classList.add('show');
  clearTimeout(hintTimer); hintTimer = setTimeout(() => hint.classList.remove('show'), ms);
}
btn.onclick = () => { if (dead) respawn(); audio.start(); renderer.domElement.requestPointerLock(); };
document.addEventListener('pointerlockchange', () => {
  playing = document.pointerLockElement === renderer.domElement;
  menu.classList.toggle('hidden', playing || (ended && !dead));
  if (!playing && !ended && !dead) { menuText.textContent = 'بازی متوقف شد'; btn.textContent = 'ادامه'; }
  if (playing && !seenIntro) { seenIntro = true; say('سال ۱۹۹۸؛ ایستگاه تحقیقاتی نورس خاموش شد. تو برای یافتن رها وارد شدی. پنج نامه حقیقت سیگنال را آشکار می‌کنند.', 7000); }
});
let seenIntro = false;
document.addEventListener('mousemove', e => {
  if (!playing) return;
  P.yaw -= e.movementX * 0.0022;
  P.pitch = Math.max(-1.35, Math.min(1.35, P.pitch - e.movementY * 0.0022));
});
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyJ' && !ended) { toggleJournal(); return; }
  if (!playing) return;
  if (e.code === 'KeyF') { if (!torchOn && battery <= 0) { say('باتری چراغ‌قوه خالی است.'); return; } torchOn = !torchOn; torch.visible = torchOn; audio.click(); if (torchOn) makeNoise(5, 'چراغ‌قوه'); updateBatteryHud(); }
  if (e.code === 'KeyE') interact();
});
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

function interact() {
  if (hidden) { hidden = false; hideSpot = null; hideTime = 0; document.getElementById('hideOverlay')?.classList.remove('show'); camera.position.set(P.x, 1.65, P.z); say('از مخفیگاه بیرون آمدی.'); audio.creak(); return; }
  const nearbyHide = hideSpots.find(h => Math.hypot(h.x - P.x, h.z - P.z) < 2.5);
  if (nearbyHide) { hidden = true; hideSpot = nearbyHide; hideTime = 0; P.x = nearbyHide.x; P.z = nearbyHide.z; E.lost = 0; const ov=document.getElementById('hideOverlay'); if(ov) ov.classList.add('show'); say('داخل کمد پنهان شدی. برای بیرون آمدن E را بزن.', 5000); audio.creak(); return; }
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  if (key && key.visible && Math.hypot(key.position.x - P.x, key.position.z - P.z) < 2.6) {
    key.visible = false; if(key.userData.mapMarker)key.userData.mapMarker.active=false; hasKey = true; audio.click(); makeNoise(13, 'کلید'); resetEnemy(); save(); say('کلید قرمز را برداشتی. ... صدای قدم‌هایی از دور می‌آید.', 4000); return;
  }
  if (fuse && fuse.visible && Math.hypot(fuse.position.x - P.x, fuse.position.z - P.z) < 2.6) {
    fuse.visible = false; if(fuse.userData.mapMarker)fuse.userData.mapMarker.active=false; hasFuse = true; audio.click(); makeNoise(8, 'فیوز'); save(); say('فیوز را برداشتی.'); return;
  }
  const pack = batteries.find(b => b.visible && Math.hypot(b.position.x-P.x,b.position.z-P.z)<2.3);
  if (pack) { pack.visible = false; if(pack.userData.mapMarker)pack.userData.mapMarker.active=false; battery = Math.min(100, battery + 38); updateBatteryHud(); audio.pickup(); say('باتری پیدا شد؛ شارژ چراغ‌قوه افزایش یافت.'); save(); return; }
  const note = notes.find(n => n.mesh.visible && Math.hypot(n.mesh.position.x-P.x,n.mesh.position.z-P.z)<2.3);
  if (note) {
    note.mesh.visible = false; if(note.mapMarker)note.mapMarker.active=false; foundNotes++; audio.note();
    collectedLetters.push({chapter:level.name, story:level.storyText||'', clue:note.text});
    say((level.storyText?level.storyText+' — ':'')+note.text, 8500);
    if (storyHud) storyHud.textContent = 'نامه‌ها: ' + foundNotes + '/5';
    renderJournal(); save(); return;
  }
  const med = medkits.find(m => m.visible && Math.hypot(m.position.x-P.x,m.position.z-P.z)<2.3);
  if (med) { med.visible = false; if(med.userData.mapMarker)med.userData.mapMarker.active=false; health = Math.min(3, health + 1); updateHealthHud(); audio.pickup(); say('جعبه کمک‌های اولیه؛ یک واحد سلامتی بازیابی شد.'); save(); return; }
  if (codePanel && !codeSolved && Math.hypot(codePanel.position.x-P.x,codePanel.position.z-P.z)<2.7) {
    const answer=prompt('پنل رمزدار\nسرنخ را از یادداشت مرحله پیدا کن. رمز چهاررقمی را وارد کن:');
    if(answer===null) return;
    if(String(answer).trim()===String(level.code)) { codeSolved=true; if(codePanel.userData.mapMarker)codePanel.userData.mapMarker.active=false; audio.click(); makeNoise(10,'پنل رمز'); say('رمز پذیرفته شد؛ قفل خروج آزاد شد.',3500); const scr=codePanel.children[1]; if(scr) scr.material.color.setHex(0x38d879); save(); }
    else { audio.thud(.7); makeNoise(15,'رمز اشتباه'); say('رمز اشتباه است. پنل صدای هشدار داد!',2500); }
    return;
  }
  if (breaker && Math.hypot(breaker.position.x - P.x, breaker.position.z - P.z) < 2.8) {
    if (powered) say('برق وصل است.');
    else if (!hasFuse) { say('جعبه فیوز یک فیوز کم دارد.'); audio.thud(.4); }
    else { hasFuse = false; powered = true; setPower(); audio.thud(.9); makeNoise(16, 'جعبه فیوز'); save(); say('برق وصل شد. در خروج فعال است.', 3500); }
    return;
  }
  for (const s of [1.2, 2.2, 3.0]) {
    const d = doors[cellOf(P.z + fz * s) + ',' + cellOf(P.x + fx * s)];
    if (!d) continue;
    if (d.locked) {
      if (!hasKey) { say('این در قفل است.'); audio.thud(.4); return; }
      d.locked = false; if(d.mapMarker)d.mapMarker.active=false; say('در باز شد.');
    }
    d.open = !d.open; audio.creak(); makeNoise(d.open ? 9 : 6, 'در'); return;
  }
}

// ---------- Audio (procedural, no files needed) ----------
const audio = (() => {
  let ctx = null, master;
  // CC0 sound-file assets loaded from SFXMint; synth fallback remains for offline play.
  const realScream = new Audio('https://sfxmint.com/dl/female-scream-01.mp3');
  const realImpact = new Audio('https://sfxmint.com/dl/horror-stinger-75.mp3');
  realScream.preload = 'auto'; realImpact.preload = 'auto';
  realScream.volume = 0.96; realImpact.volume = 0.92;
  const tone = (f, type, g) => { const o = ctx.createOscillator(), a = ctx.createGain(); o.type = type; o.frequency.value = f; a.gain.value = g; o.connect(a).connect(master); o.start(); return o; };
  const burst = (f0, f1, dur, g, type = 'sawtooth') => {
    if (!ctx) return; const o = ctx.createOscillator(), a = ctx.createGain(), t = ctx.currentTime;
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    a.gain.setValueAtTime(g, t); a.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(a).connect(master); o.start(); o.stop(t + dur);
  };
  const syntheticJumpScare = () => {
    if (!ctx) return;
    burst(900, 3600, .72, .82, 'sawtooth'); burst(180, 42, .95, .78, 'square');
    burst(72, 28, 1.05, .95, 'sine'); burst(2600, 520, .62, .62, 'sawtooth');
    burst(520, 1850, .9, .58, 'triangle');
    const dur = 1.05, b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate), a = b.getChannelData(0);
    for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / a.length, .35);
    const src = ctx.createBufferSource(), g = ctx.createGain(), filter = ctx.createBiquadFilter();
    src.buffer = b; filter.type = 'bandpass'; filter.frequency.value = 1250; filter.Q.value = .65;
    g.gain.setValueAtTime(.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(.95, ctx.currentTime + .035);
    g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + dur);
    src.connect(filter).connect(g).connect(master); src.start();
  };
  return {
    start() {
      if (ctx) return; ctx = new AudioContext(); master = ctx.createGain(); master.gain.value = .18; master.connect(ctx.destination);
      tone(48, 'sine', .055); const d = tone(50.6, 'sine', .045);
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = .08; lg.gain.value = .45; lfo.connect(lg).connect(d.frequency); lfo.start();
      const scare = () => { if (playing) { const r = Math.random(); r < .7 ? this.thud(.08) : this.whisper(); } setTimeout(scare, 35000 + Math.random() * 35000); };
      setTimeout(scare, 30000);
    },
    click() { burst(900, 300, .06, .045, 'square'); },
    pickup() { burst(520, 980, .18, .045, 'sine'); burst(1040, 760, .12, .025, 'triangle'); },
    step(run=false) { if(!ctx)return; const t=ctx.currentTime; const o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter(); o.type='triangle'; o.frequency.setValueAtTime(run?105:78,t); o.frequency.exponentialRampToValueAtTime(38,t+.11); f.type='lowpass'; f.frequency.value=run?260:190; g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(run?.075:.045,t+.012); g.gain.exponentialRampToValueAtTime(.0001,t+.13); o.connect(f).connect(g).connect(master); o.start(t); o.stop(t+.14); burst(run?145:95,run?48:42,.09,run?.035:.022,'sine'); },
    pant(intensity=1) { if(!ctx)return; const t=ctx.currentTime; for(let k=0;k<2;k++){const dur=.34,buf=ctx.createBuffer(1,Math.floor(ctx.sampleRate*dur),ctx.sampleRate),a=buf.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*(1-i/a.length);const src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();src.buffer=buf;f.type='bandpass';f.frequency.value= k===0?620:430;f.Q.value=.8;g.gain.setValueAtTime(.0001,t+k*.42);g.gain.exponentialRampToValueAtTime(.028*intensity,t+k*.42+.07);g.gain.exponentialRampToValueAtTime(.0001,t+k*.42+dur);src.connect(f).connect(g).connect(master);src.start(t+k*.42);src.stop(t+k*.42+dur);} },
    note() { burst(330, 440, .28, .03, 'triangle'); burst(660, 520, .35, .015, 'sine'); },
    batteryLow() { burst(220, 110, .35, .04, 'square'); },
    creak() { burst(140, 70, .7, .055); },
    thud(g = .6) { burst(90, 30, .5, g * .22, 'sine'); },
    scream() { burst(700, 180, 1.1, .045, 'sawtooth'); burst(720, 200, 1.1, .025, 'square'); },
    // A layered, filtered, throaty monster growl; synthesized locally, no external audio file required.
    growl(intensity = 1) {
      if (!ctx) return;
      const t = ctx.currentTime, dur = 1.8 + Math.random() * .8;
      const osc = ctx.createOscillator(), sub = ctx.createOscillator();
      const filter = ctx.createBiquadFilter(), gain = ctx.createGain(), wobble = ctx.createOscillator(), wobbleGain = ctx.createGain();
      osc.type = 'sawtooth'; sub.type = 'triangle';
      osc.frequency.setValueAtTime(76 + Math.random() * 24, t);
      osc.frequency.exponentialRampToValueAtTime(31 + Math.random() * 10, t + dur);
      sub.frequency.setValueAtTime(47, t); sub.frequency.exponentialRampToValueAtTime(29, t + dur);
      filter.type = 'lowpass'; filter.frequency.setValueAtTime(430, t); filter.frequency.exponentialRampToValueAtTime(135, t + dur); filter.Q.value = 9;
      gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(.072 * intensity, t + .16);
      gain.gain.setValueAtTime(.058 * intensity, t + dur * .48); gain.gain.exponentialRampToValueAtTime(.0001, t + dur);
      wobble.frequency.value = 4.1; wobbleGain.gain.value = 19;
      wobble.connect(wobbleGain).connect(osc.frequency);
      osc.connect(filter); sub.connect(filter); filter.connect(gain).connect(master);
      const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const nd = noiseBuf.getChannelData(0); for(let i=0;i<nd.length;i++) nd[i]=(Math.random()*2-1)*Math.pow(1-i/nd.length,.7);
      const noise = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      noise.buffer=noiseBuf; nf.type='bandpass'; nf.frequency.value=260; nf.Q.value=1.2;
      ng.gain.setValueAtTime(.0001,t); ng.gain.exponentialRampToValueAtTime(.018*intensity,t+.22); ng.gain.exponentialRampToValueAtTime(.0001,t+dur);
      noise.connect(nf).connect(ng).connect(master);
      osc.start(t); sub.start(t); wobble.start(t); noise.start(t);
      osc.stop(t + dur); sub.stop(t + dur); wobble.stop(t + dur); noise.stop(t + dur);
    },
    whisper() { burst(1800, 900, 1.6, .012, 'sawtooth'); },
    jumpscare() {
      // Layer two CC0 audio files; use the local synthetic effect if network playback fails.
      try {
        realScream.pause(); realImpact.pause();
        realScream.currentTime = 0; realImpact.currentTime = 0;
        const p1 = realImpact.play(), p2 = realScream.play();
        if (p1 && p2) { Promise.all([p1, p2]).catch(() => syntheticJumpScare()); return; }
        if (p1 || p2) { Promise.resolve(p1 || p2).catch(() => syntheticJumpScare()); return; }
      } catch (_) {}
      syntheticJumpScare();
    },
    vanish() { burst(420, 38, 1.1, .35, 'sine'); burst(1900, 400, .9, .12, 'sawtooth'); },
  };
})();

// ---------- Main loop ----------
const clock = new THREE.Clock(); let saveTimer = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
  if (playing) {
    damageCooldown = Math.max(0, damageCooldown-dt);
    if(bloodTimer>0){bloodTimer-=dt; bloodSplash.style.opacity=bloodTimer>.18?'0.9':String(Math.max(0,bloodTimer/.18)*.9);}
    if(health<=2){pantTimer-=dt;if(pantTimer<=0){audio.pant(health===1?1.15:.65);pantTimer=health===1?3.2:5.2;}}
    scareTimer -= dt;
    if (scareTimer <= 0) {
      scareTimer = 40 + Math.random()*35;
      const roll=Math.random();
      if(roll<.55){ audio.whisper(); say('صدایی آرام از تاریکی شنیدی...',2200); }
      else if(roll<.9){ torch.intensity=4; setTimeout(()=>{if(torchOn) torch.intensity=25;},180+Math.random()*260); audio.creak(); say('چراغ‌قوه لرزید...',1600); }
      else { audio.scream(); say('چیزی حرکت کرد گوشه چشم...',1800); }
    }
    if (hidden) {
      // Player stays concealed and cannot move until E is pressed again.
    } else {
    const run = keys.ShiftLeft || keys.ShiftRight;
    const moving = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD;
    if (moving && !hidden) { footstepTimer-=dt; if(footstepTimer<=0){audio.step(run);footstepTimer=run?.34:.52;} noiseCooldown -= dt; if (noiseCooldown <= 0) { makeNoise(run ? 12 : 5.5, run ? 'دویدن' : 'قدم'); noiseCooldown = run ? .55 : 1.15; } }
    if(!moving) footstepTimer=0;
    const sp = (run ? 5.2 : 2.9) * dt;
    let mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), mz = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);
    const len = Math.hypot(mx, mz);
    if (len) {
      mx /= len; mz /= len;
      const c = Math.cos(P.yaw), s = Math.sin(P.yaw);
      const dx = (mx * c + mz * s) * sp, dz = (-mx * s + mz * c) * sp;
      if (!hits(P.x + dx, P.z)) P.x += dx;
      if (!hits(P.x, P.z + dz)) P.z += dz;
      P.bob += dt * (run ? 11 : 7);
    }
    if (exitPos && !ended && Math.hypot(P.x - exitPos.x, P.z - exitPos.z) < 1.6) {
      if (!powered) { if (t - lastPow > 3) { lastPow = t; say('درِ خروج برق ندارد. جعبه فیوز را پیدا کن.'); } }
      else if (!codeSolved) { if (t-lastPow>2.5) { lastPow=t; say('قفل عددی خروج فعال است؛ پنل رمز را پیدا کن.'); } }
      else finishLevel();
    }
    }
  }
  if (lastNoise) { lastNoise.age += dt; if (lastNoise.age > 5) lastNoise = null; }
  if (playing) {
    batteryTick += dt;
    if (torchOn) { battery = Math.max(0, battery - dt * 1.65); if (battery <= 0) { torchOn = false; torch.visible = false; audio.batteryLow(); say('باتری چراغ‌قوه تمام شد. با F چراغ را خاموش/روشن کن.', 3500); } }
    else battery = Math.min(100, battery + dt * .45);
    if (batteryTick > .25) { batteryTick = 0; updateBatteryHud(); }
  }
  updateEnemy(dt);
  if (E.active && playing && !hidden) {
    const near = Math.max(0, 1 - E.dist / 14);
    vig.style.opacity = (E.state === 'chase' ? .25 : E.state === 'investigate' ? .08 : 0) + near * .6;
    hbTimer -= dt; if (hbTimer <= 0) { audio.thud(.08 + near * .12); hbTimer = .8 + (1 - near) * 1.5; }
  } else vig.style.opacity = 0;
  saveTimer += dt; if (playing && hasKey && saveTimer > 10) { saveTimer = 0; save(); }
  for (const d of Object.values(doors)) {
    d.t += ((d.open ? 1 : 0) - d.t) * Math.min(1, dt * 4);
    d.mesh.position.y = H / 2 + d.t * (H - .1);
  }
  if (fuse) fuse.rotation.y = t * 1.5;
  if (key) { key.rotation.y = t * 1.5; key.position.y = 1 + Math.sin(t * 2) * .08; }
  if (torchOn) torch.intensity = (Math.random() < .015 + (E.active ? Math.max(0, 1 - E.dist / 10) * .15 : 0) + (battery < 15 ? .12 : 0) ? 3.5 : 27 * (0.35 + battery / 150)) * (0.96 + Math.sin(t * 30) * .04);
  updateJumpScare(dt);
  if (blackout > 0) { blackout -= dt; torch.intensity = 0; }
  camera.position.set(P.x, hidden ? 1.15 : 1.65 + Math.sin(P.bob) * .04, P.z);
  camera.rotation.set(P.pitch, P.yaw, 0);
  if (jsT >= 0 && jsT < .7) { camera.rotation.x += (Math.random() - .5) * .06; camera.rotation.z = (Math.random() - .5) * .1; camera.position.x += (Math.random() - .5) * .05; }
  drawMiniMap(dt);
  renderer.render(scene, camera);
}
const sv0 = loadSave();
updateHealthHud();
buildLevel(sv0 ? (sv0.lv || 0) : 0);
if (sv0 && ((sv0.lv || 0) > 0 || sv0.hasKey)) {
  menuText.textContent = 'ذخیره‌ای پیدا شد. ادامه می‌دهی؟';
  btn.textContent = 'ادامه از ذخیره';
  const nb = document.createElement('button');
  nb.type = 'button';
  nb.textContent = 'شروع از اول';
  nb.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    // Clear the previous checkpoint without reloading the document.
    try { localStorage.removeItem(SAVE_KEY); }
    catch (err) { console.warn('Could not clear old save:', err); }

    // Reset campaign, player, inventory, and HUD state.
    playing = false;
    ended = false;
    dead = false;
    hidden = false;
    hideSpot = null;
    hideTime = 0;
    hasKey = false;
    hasFuse = false;
    powered = true;
    codeSolved = false;
    foundNotes = 0;
    collectedLetters = [];
    health = 3;
    battery = 100;
    batteryTick = 0;
    torchOn = true;
    torch.visible = true;
    lastNoise = null;
    damageCooldown = 0;
    seenIntro = false;
    saveTimer = 0;

    buildLevel(0);
    updateHealthHud();
    updateBatteryHud();
    if (storyHud) storyHud.textContent = 'نامه‌ها: 0/5';

    // Save a clean level-zero checkpoint so old progress cannot reappear.
    save();

    nb.remove();
    btn.textContent = 'شروع';
    btn.style.display = '';
    menuText.textContent = 'شروع بازی از ابتدا';
    beginGame();
  }, { once: true });
  btn.after(nb);
  dead = true;
}
loop();
