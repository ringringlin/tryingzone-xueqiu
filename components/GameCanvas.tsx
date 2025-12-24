import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { GameState, InputState } from '../types';
import { COLORS, MOVE_SPEED, WORLD_SIZE, ANIMAL_CONFIGS } from '../constants';

const GameCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Game Logic State
  const [gameState, setGameState] = useState<GameState>({
    isPlaying: false,
    isWon: false,
    envelopeOpen: false,
    letterContent: null,
    loadingLetter: false,
    score: 0
  });

  const [showSuccessUI, setShowSuccessUI] = useState(false);

  // Joystick State for UI
  const [joystickState, setJoystickState] = useState({
    active: false,
    cx: 0, cy: 0, kx: 0, ky: 0
  });

  // Blessing State
  const [blessing, setBlessing] = useState<{text: string, subtext?: string, key: number, type?: 'santa' | 'normal'} | null>(null);
  const blessingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guide UI Ref (for high performance updates)
  const guideRef = useRef<HTMLDivElement>(null);

  // Refs for 3D engine
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const playerMeshRef = useRef<THREE.Group | null>(null);
  const animalsRef = useRef<Map<string, { mesh: THREE.Group, marker: THREE.Group, light: THREE.PointLight, heart: THREE.Group, data: any }>>(new Map());
  const particlesRef = useRef<THREE.Points | null>(null);
  const smokeParticlesRef = useRef<THREE.Group | null>(null); 
  const exitRef = useRef<THREE.Group | null>(null);
  const winTriggeredRef = useRef<boolean>(false);
  const explosionsRef = useRef<{group: THREE.Group, particles: {mesh: THREE.Mesh, velocity: THREE.Vector3, life: number}[]}[]>([]);
  
  // Santa & Gifts Refs
  const santaRef = useRef<THREE.Group | null>(null);
  const giftsRef = useRef<THREE.Group | null>(null);
  const giftsVisibleRef = useRef<boolean>(false);
  
  // Phase: 'HIDDEN' | 'ARRIVING' | 'PARKED'
  const santaStateRef = useRef({ phase: 'HIDDEN', progress: 0, startPos: new THREE.Vector3(), endPos: new THREE.Vector3() });
  const prevRescuedRef = useRef(0);
  const allRescuedTimeRef = useRef<number | null>(null);
  
  // Zoom Animation State
  const zoomStateRef = useRef({ active: false, startTime: 0, duration: 1500, peak: 1.15 }); 
  
  // Camera LookAt State for smooth transitions
  const currentCameraLookAtRef = useRef(new THREE.Vector3(0, 0, 0));

  const inputRef = useRef<InputState>({ 
    left: false, right: false, up: false, down: false, 
    vector: { x: 0, y: 0 } 
  });
  
  const playerPosRef = useRef({ x: 0, z: 8, moving: false });
  const trailRef = useRef<{x: number, z: number}[]>([]);
  const frameIdRef = useRef<number>(0);

  // Camera settings
  const VIEW_SIZE = 12;

  // --- RESTART LOGIC ---
  const handleRestart = () => {
    setGameState({
        isPlaying: true, 
        isWon: false,
        envelopeOpen: false,
        letterContent: null,
        loadingLetter: false,
        score: 0
    });
    setShowSuccessUI(false);
    setBlessing(null);
    if (guideRef.current) guideRef.current.style.display = 'none';

    playerPosRef.current = { x: 0, z: 8, moving: false };
    inputRef.current = { left: false, right: false, up: false, down: false, vector: { x: 0, y: 0 } };
    trailRef.current = [];
    winTriggeredRef.current = false;
    giftsVisibleRef.current = false;
    prevRescuedRef.current = 0;
    allRescuedTimeRef.current = null;
    
    santaStateRef.current = { phase: 'HIDDEN', progress: 0, startPos: new THREE.Vector3(), endPos: new THREE.Vector3() };
    zoomStateRef.current = { active: false, startTime: 0, duration: 1500, peak: 1.15 };
    currentCameraLookAtRef.current.set(0, 0, 8); // Reset lookAt

    if (playerMeshRef.current) {
        playerMeshRef.current.position.set(0, 0, 8);
        playerMeshRef.current.rotation.set(0, 0, 0);
    }
    if (santaRef.current) santaRef.current.position.set(0, -100, 0);
    if (giftsRef.current) giftsRef.current.position.set(0, -100, 0);

    const configEntries = Object.entries(ANIMAL_CONFIGS);
    let idx = 0;
    animalsRef.current.forEach((animal) => {
         const angle = (idx / configEntries.length) * Math.PI * 2 + 1.0;
         const dist = 7 + Math.random() * 3; 
         animal.mesh.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
         animal.mesh.rotation.y = Math.random() * Math.PI * 2;
         
         animal.data.isRescued = false;
         if(animal.heart) animal.heart.visible = false;
         if(animal.marker) animal.marker.visible = true;
         if(animal.light) animal.light.intensity = 1.5;
         idx++;
    });
  };

  // --- STATIC LETTER GENERATION ---
  useEffect(() => {
    if (gameState.isWon && !gameState.letterContent && gameState.loadingLetter) {
        // Simulate a brief "writing" delay for effect, then set the static content
        const timer = setTimeout(() => {
            setGameState(prev => ({
                ...prev,
                letterContent: `Ho~Ho~Ho~
❄️ 祝圣诞快乐～希望能和你爱的毛孩子们长久、快乐地生活在一起，每天都开心！and PS:很高兴认识你，很酷的QingZheng老师！
( ੭ ˙ᗜ˙ )੭

Mimi`,
                loadingLetter: false
            }));
        }, 1500);
        return () => clearTimeout(timer);
    }
  }, [gameState.isWon, gameState.letterContent, gameState.loadingLetter]);

  // --- ASSET GENERATION ---
  const createDecoratedTree = (scale = 1, isGrand = false) => {
    const group = new THREE.Group();
    const levels = isGrand ? 6 : 3;
    const baseMat = new THREE.MeshStandardMaterial({ color: COLORS.tree_dark, flatShading: true, roughness: 0.8 });
    if (isGrand) { baseMat.color = new THREE.Color(0x2E8B57); baseMat.roughness = 0.2; baseMat.metalness = 0.1; baseMat.emissive = new THREE.Color(0x003311); baseMat.emissiveIntensity = 0.3; }
    const secondaryMat = baseMat.clone(); secondaryMat.color = new THREE.Color(COLORS.tree_light);
    for(let i=0; i<levels; i++) {
        const t = i / levels;
        const radius = isGrand ? (1.6 - t * 1.5) : (0.8 - i * 0.15);
        const height = isGrand ? 1.3 : 1.0;
        const y = isGrand ? (0.6 + i * 1.0) : (0.6 + i * 0.6);
        const mat = i % 2 === 0 ? baseMat : secondaryMat;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(radius * scale, height * scale, 8), mat);
        cone.position.y = y * scale; cone.castShadow = true; cone.receiveShadow = true; group.add(cone);
        const ornDensity = isGrand ? 0.9 : 0.3;
        const shouldDecorate = isGrand || Math.random() < ornDensity;
        if (shouldDecorate) {
            const ornCount = isGrand ? 8 : 3;
            for(let j=0; j<ornCount; j++) {
                const angle = (j / ornCount) * Math.PI * 2 + (i * 0.5);
                const ox = Math.cos(angle) * radius * 0.85 * scale;
                const oz = Math.sin(angle) * radius * 0.85 * scale;
                const oy = (y - height * 0.35) * scale;
                const getDeterministicRand = (seedOffset: number) => { if (!isGrand) return Math.random(); const x = i * 13 + j * 7 + seedOffset; return Math.abs(Math.sin(x * 12.9898)); };
                let type = 0;
                if (isGrand) { const r = getDeterministicRand(0); if (r > 0.7) type = 1; else if (r > 0.4) type = 2; }
                let ornament;
                if (type === 0) { const rCol = getDeterministicRand(1); const ornColor = rCol > 0.6 ? COLORS.ornament_gold : (rCol > 0.5 ? COLORS.ornament_red : COLORS.ornament_blue); ornament = new THREE.Mesh(new THREE.SphereGeometry(0.12 * scale, 6, 6), new THREE.MeshStandardMaterial({ color: ornColor, roughness: 0.3, metalness: 0.4 })); }
                else if (type === 1) { ornament = new THREE.Mesh(new THREE.OctahedronGeometry(0.1 * scale), new THREE.MeshStandardMaterial({ color: COLORS.gold, emissive: COLORS.gold, emissiveIntensity: 0.5 })); }
                else { ornament = new THREE.Mesh(new THREE.SphereGeometry(0.08 * scale, 4, 4), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffee, emissiveIntensity: 2.0 })); }
                ornament.position.set(ox, oy, oz); group.add(ornament);
            }
        }
    }
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * scale, 0.3 * scale, 0.8 * scale, 6), new THREE.MeshStandardMaterial({ color: COLORS.wood }));
    trunk.position.y = 0.4 * scale; trunk.castShadow = true; group.add(trunk);
    return group;
  };

  const createBush = () => {
    const group = new THREE.Group();
    // Dead/Winter bush: A few rotated sticks
    const mat = new THREE.MeshStandardMaterial({ color: 0x4E342E, flatShading: true });
    for(let i=0; i<6; i++) {
        const h = 0.3 + Math.random() * 0.3;
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, h, 4), mat);
        branch.position.y = h / 2 - 0.1;
        // Random rotation outward from center
        branch.rotation.x = (Math.random() - 0.5) * 1.5;
        branch.rotation.z = (Math.random() - 0.5) * 1.5;
        branch.castShadow = true;
        group.add(branch);
    }
    return group;
  };

  const createMushroom = () => {
    const group = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.2, 5), new THREE.MeshStandardMaterial({color: 0xffffff}));
    stem.position.y = 0.1;
    stem.castShadow = true;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.15, 7, 6, 0, Math.PI * 2, 0, Math.PI / 1.8), new THREE.MeshStandardMaterial({color: 0xD32F2F, roughness: 0.3}));
    cap.position.y = 0.2;
    cap.castShadow = true;
    group.add(stem, cap);
    return group;
  };

  const createSantaGroup = () => {
    const group = new THREE.Group();
    const content = new THREE.Group();
    const sleighGroup = new THREE.Group();
    const sleighBody = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.4), new THREE.MeshStandardMaterial({color: 0xB71C1C, roughness: 0.3}));
    sleighBody.position.y = 0.6;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.15, 1.5), new THREE.MeshStandardMaterial({color: 0xFFD700, metalness: 0.8, roughness: 0.2}));
    trim.position.y = 1.0;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 1.2), new THREE.MeshStandardMaterial({color: 0x5D4037, roughness: 0.9}));
    seat.position.set(-0.3, 1.0, 0);
    const runnerMat = new THREE.MeshStandardMaterial({color: 0xC0C0C0, metalness: 0.5}); 
    const runnerL = new THREE.Group();
    const rCurve = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.05, 6, 12, Math.PI), runnerMat); rCurve.rotation.y = Math.PI; rCurve.position.set(0.5, 0, 0);
    const rBase = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.1), runnerMat); rBase.position.set(0, -0.8, 0);
    const strut1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8), runnerMat); strut1.position.set(0.8, -0.4, 0);
    const strut2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8), runnerMat); strut2.position.set(-0.8, -0.4, 0);
    runnerL.add(rCurve, rBase, strut1, strut2); runnerL.position.set(0, 0.6, 0.6);
    const runnerR = runnerL.clone(); runnerR.position.set(0, 0.6, -0.6);
    const lantern = new THREE.Group(); lantern.position.set(1.2, 1.2, 0);
    const lCase = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.2), new THREE.MeshStandardMaterial({color: 0x333333}));
    const lGlass = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.15), new THREE.MeshBasicMaterial({color: 0xFFFACD}));
    const lLight = new THREE.PointLight(0xFFFACD, 2, 4); lantern.add(lCase, lGlass, lLight);
    sleighGroup.add(sleighBody, trim, seat, runnerL, runnerR, lantern);
    const santaGroup = new THREE.Group();
    santaGroup.position.set(-0.3, 1.3, 0); 
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 0.8, 8), new THREE.MeshStandardMaterial({color: 0xD32F2F}));
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.48, 0.15, 8), new THREE.MeshStandardMaterial({color: 0x212121}));
    belt.position.y = -0.1;
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.1), new THREE.MeshStandardMaterial({color: 0xFFD700, metalness: 0.8}));
    buckle.position.set(0, -0.1, 0.45);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshStandardMaterial({color: 0xFFCCBC}));
    head.position.y = 0.6;
    const beard = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8, 0, Math.PI * 2, 0, Math.PI/1.8), new THREE.MeshStandardMaterial({color: 0xFFFFFF}));
    beard.position.set(0, 0.55, 0.1); beard.scale.set(1, 1, 0.6); beard.rotation.x = -0.3;
    const hatBase = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.12, 4, 12), new THREE.MeshStandardMaterial({color: 0xFFFFFF}));
    hatBase.position.y = 0.8; hatBase.rotation.x = Math.PI/2;
    const hatTop = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 8), new THREE.MeshStandardMaterial({color: 0xD32F2F}));
    hatTop.position.set(0, 1.15, -0.1); hatTop.rotation.x = -0.4;
    const hatPom = new THREE.Mesh(new THREE.SphereGeometry(0.12), new THREE.MeshStandardMaterial({color: 0xFFFFFF}));
    hatPom.position.set(0, 1.45, -0.4);
    const armGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.5);
    const armL = new THREE.Mesh(armGeo, new THREE.MeshStandardMaterial({color: 0xD32F2F})); armL.position.set(0.45, 0.2, 0.2); armL.rotation.z = -0.5; armL.rotation.x = -0.5;
    const armR = new THREE.Mesh(armGeo, new THREE.MeshStandardMaterial({color: 0xD32F2F})); armR.position.set(-0.45, 0.2, 0.2); armR.rotation.z = 0.5; armR.rotation.x = -0.5;
    const gloveMat = new THREE.MeshStandardMaterial({color: 0xFFFFFF});
    const gloveL = new THREE.Mesh(new THREE.SphereGeometry(0.15), gloveMat); gloveL.position.set(0, -0.3, 0); armL.add(gloveL);
    const gloveR = new THREE.Mesh(new THREE.SphereGeometry(0.15), gloveMat); gloveR.position.set(0, -0.3, 0); armR.add(gloveR);
    santaGroup.add(body, belt, buckle, head, beard, hatBase, hatTop, hatPom, armL, armR);
    const bag = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7), new THREE.MeshStandardMaterial({color: 0x8D6E63}));
    bag.position.set(-1.1, 1.4, 0); bag.scale.set(1, 0.8, 1);
    content.add(sleighGroup, santaGroup, bag);
    for(let i=1; i<=2; i++) {
        const deer = new THREE.Group(); deer.position.set(2 + i*1.8, 0.5, 0);
        const dBody = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.4), new THREE.MeshStandardMaterial({color: 0x8D6E63}));
        const dHead = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.3), new THREE.MeshStandardMaterial({color: 0x8D6E63})); dHead.position.set(0.5, 0.4, 0);
        const isRudolph = (i === 2);
        const dNose = new THREE.Mesh(new THREE.SphereGeometry(0.08), new THREE.MeshStandardMaterial({ color: isRudolph ? 0xFF0000 : 0x212121, emissive: isRudolph ? 0xFF0000 : 0x000000, emissiveIntensity: isRudolph ? 2.0 : 0 })); 
        dNose.position.set(0.7, 0.4, 0);
        if (isRudolph) { const light = new THREE.PointLight(0xFF0000, 1, 2); light.position.set(0.8, 0.4, 0); deer.add(light); }
        const antlerL = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4), new THREE.MeshStandardMaterial({color: 0xD7CCC8})); antlerL.position.set(0.5, 0.7, 0.15); antlerL.rotation.z = -0.3; antlerL.rotation.x = 0.2;
        const antlerR = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4), new THREE.MeshStandardMaterial({color: 0xD7CCC8})); antlerR.position.set(0.5, 0.7, -0.15); antlerR.rotation.z = -0.3; antlerR.rotation.x = -0.2;
        const legMat = new THREE.MeshStandardMaterial({color: 0x5D4037}); const legGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.5);
        const l1 = new THREE.Mesh(legGeo, legMat); l1.position.set(0.3, -0.3, 0.15); const l2 = new THREE.Mesh(legGeo, legMat); l2.position.set(0.3, -0.3, -0.15);
        const l3 = new THREE.Mesh(legGeo, legMat); l3.position.set(-0.3, -0.3, 0.15); l3.rotation.z = 0.2; const l4 = new THREE.Mesh(legGeo, legMat); l4.position.set(-0.3, -0.3, -0.15); l4.rotation.z = -0.2;
        const tail = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshStandardMaterial({color: 0xFFFFFF})); tail.position.set(-0.45, 0.2, 0);
        deer.add(dBody, dHead, dNose, antlerL, antlerR, l1, l2, l3, l4, tail); content.add(deer);
        const rein = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.05), new THREE.MeshStandardMaterial({color: 0x5D4037})); rein.position.set(1.5 + (i-1)*1.8, 0.6, 0); content.add(rein);
    }
    content.rotation.y = -Math.PI / 2; group.add(content); group.scale.set(1.3, 1.3, 1.3); return group;
  };

  const createGiftBoxes = () => {
      const group = new THREE.Group();
      const createBox = (color: number, ribbonColor: number, x: number, z: number, scale: number) => {
          const box = new THREE.Group();
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: color, roughness: 0.3, metalness: 0.1 }));
          mesh.castShadow = true;
          const rib1 = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.1), new THREE.MeshStandardMaterial({ color: ribbonColor, emissive: ribbonColor, emissiveIntensity: 0.2 }));
          const rib2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.62), new THREE.MeshStandardMaterial({ color: ribbonColor, emissive: ribbonColor, emissiveIntensity: 0.2 }));
          const bow1 = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.05, 4, 8), new THREE.MeshStandardMaterial({color: ribbonColor})); bow1.position.set(0, 0.3, 0); bow1.rotation.y = Math.PI/4;
          const bow2 = bow1.clone(); bow2.rotation.y = -Math.PI/4;
          box.add(mesh, rib1, rib2, bow1, bow2); box.position.set(x, 0.3, z); box.scale.setScalar(scale); group.add(box); return box;
      };
      createBox(0xD32F2F, 0xFFD700, 0, 0, 1.0); createBox(0x2E8B57, 0xFFFFFF, -0.8, 0.3, 0.8); createBox(0x1976D2, 0xC0C0C0, 0.8, -0.2, 0.9); return group;
  };

  const createCabin = () => {
      const group = new THREE.Group();
      const walls = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2, 2), new THREE.MeshStandardMaterial({ color: COLORS.wood, flatShading: true }));
      walls.position.y = 1; walls.castShadow = true; walls.receiveShadow = true;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.2, 4), new THREE.MeshStandardMaterial({ color: COLORS.roof, flatShading: true }));
      roof.position.y = 2.6; roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.8); roof.castShadow = true;
      const snowRoof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.0, 4), new THREE.MeshStandardMaterial({ color: COLORS.snow }));
      snowRoof.position.y = 2.75; snowRoof.rotation.y = Math.PI / 4; snowRoof.scale.set(0.95, 0.95, 0.75);
      
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.4), new THREE.MeshStandardMaterial({ color: COLORS.chimney })); 
      chimney.position.set(0.6, 2.5, 0.4);
      
      // Chimney Rim (Top Cap)
      const chimneyTop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.5), new THREE.MeshStandardMaterial({ color: 0x212121 }));
      chimneyTop.position.set(0, 0.4, 0); // Position relative to chimney center
      chimney.add(chimneyTop);

      const door = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x3E2723 })); door.position.set(0, 0.6, 1.0);
      const windowFrame = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.1), new THREE.MeshStandardMaterial({ color: 0x3E2723 })); windowFrame.position.set(0.8, 1.2, 1.0);
      const windowGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ color: COLORS.window_light })); windowGlass.position.set(0.8, 1.2, 1.06);
      const houseLight = new THREE.PointLight(COLORS.window_light, 1, 5); houseLight.position.set(0.8, 1.2, 1.5);
      group.add(walls, roof, snowRoof, chimney, door, windowFrame, windowGlass, houseLight); return group;
  };
  
  const createCar = () => {
      const group = new THREE.Group();
      
      // Car Body (Lower)
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x607D8B, roughness: 0.2 }); // Blue Grey
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 2.6), bodyMat);
      body.position.y = 0.5;
      body.castShadow = true;

      // Car Cabin (Upper)
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 1.4), bodyMat);
      cabin.position.y = 0.95;
      cabin.position.z = -0.2;
      cabin.castShadow = true;

      // Windows
      const windowMat = new THREE.MeshStandardMaterial({ color: COLORS.window_light, roughness: 0.1, metalness: 0.5 });
      const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.35), windowMat);
      windshield.position.set(0, 1.0, 0.51);
      windshield.rotation.x = -0.2; // Slant
      // Rear window
      const rearWindow = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.35), windowMat);
      rearWindow.position.set(0, 1.0, -0.91);
      rearWindow.rotation.x = 0.2; 
      rearWindow.rotation.y = Math.PI;

      // Snow on top (Roof)
      const snowMat = new THREE.MeshStandardMaterial({ color: COLORS.snow });
      const roofSnow = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.1, 1.5), snowMat);
      roofSnow.position.set(0, 1.2, -0.2);
      
      // Snow on Hood
      const hoodSnow = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 0.7), snowMat);
      hoodSnow.position.set(0, 0.76, 0.85);
      hoodSnow.rotation.x = 0.05;

      // Wheels
      const wheelGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.2, 12);
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
      
      const w1 = new THREE.Mesh(wheelGeo, wheelMat); w1.rotation.z = Math.PI/2; w1.position.set(0.65, 0.25, 0.8);
      const w2 = new THREE.Mesh(wheelGeo, wheelMat); w2.rotation.z = Math.PI/2; w2.position.set(-0.65, 0.25, 0.8);
      const w3 = new THREE.Mesh(wheelGeo, wheelMat); w3.rotation.z = Math.PI/2; w3.position.set(0.65, 0.25, -0.8);
      const w4 = new THREE.Mesh(wheelGeo, wheelMat); w4.rotation.z = Math.PI/2; w4.position.set(-0.65, 0.25, -0.8);

      // Headlights
      const lightGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 8);
      const lightMat = new THREE.MeshBasicMaterial({ color: 0xFFEB3B });
      const hl1 = new THREE.Mesh(lightGeo, lightMat); hl1.rotation.x = Math.PI/2; hl1.position.set(0.5, 0.6, 1.3);
      const hl2 = new THREE.Mesh(lightGeo, lightMat); hl2.rotation.x = Math.PI/2; hl2.position.set(-0.5, 0.6, 1.3);

      group.add(body, cabin, windshield, rearWindow, roofSnow, hoodSnow, w1, w2, w3, w4, hl1, hl2);
      return group;
  };

  const createSnowPile = () => {
      const group = new THREE.Group();
      const pile1 = new THREE.Mesh(new THREE.SphereGeometry(0.6, 7, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.MeshStandardMaterial({color: COLORS.snow}));
      pile1.scale.set(1.5, 0.5, 1.2);
      const pile2 = new THREE.Mesh(new THREE.SphereGeometry(0.4, 7, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.MeshStandardMaterial({color: COLORS.snow}));
      pile2.position.set(0.5, 0.1, 0.2);
      pile2.scale.set(1.2, 0.6, 1.0);
      group.add(pile1, pile2);
      group.castShadow = true;
      group.receiveShadow = true;
      return group;
  };

  const createSnowman = () => {
      const group = new THREE.Group();
      const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.4), new THREE.MeshStandardMaterial({color: COLORS.snow})); b1.position.y = 0.3;
      const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.28), new THREE.MeshStandardMaterial({color: COLORS.snow})); b2.position.y = 0.85;
      const b3 = new THREE.Mesh(new THREE.SphereGeometry(0.2), new THREE.MeshStandardMaterial({color: COLORS.snow})); b3.position.y = 1.25;
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.3), new THREE.MeshStandardMaterial({color: 0x333333})); hat.position.y = 1.5;
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2), new THREE.MeshStandardMaterial({color: COLORS.candy_red})); nose.geometry.rotateX(Math.PI/2); nose.position.set(0, 1.25, 0.2);
      group.add(b1, b2, b3, hat, nose); group.castShadow = true; return group;
  };

  const createCandyCane = () => {
      const group = new THREE.Group();
      const caneMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
      const stripeMat = new THREE.MeshStandardMaterial({ color: 0xd32f2f });
      
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 8), caneMat);
      staff.position.y = 0.5;
      group.add(staff);

      for (let i = 0; i < 5; i++) {
          const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.08, 8), stripeMat);
          stripe.position.y = 0.1 + i * 0.2;
          group.add(stripe);
      }

      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.08, 8, 12, Math.PI), caneMat);
      hook.position.set(0.15, 1.0, 0);
      group.add(hook);
      
      group.castShadow = true;
      return group;
  };

  const createPlayer = () => {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 8), new THREE.MeshStandardMaterial({ color: COLORS.player, flatShading: true })); body.position.y = 0.45; body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12), new THREE.MeshStandardMaterial({ color: COLORS.player_skin, flatShading: true })); head.position.y = 1.0; head.castShadow = true;
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.12, 6, 8), new THREE.MeshStandardMaterial({ color: 0xffffff })); scarf.position.y = 0.85; scarf.rotation.x = Math.PI / 2;
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.6, 8), new THREE.MeshStandardMaterial({ color: COLORS.player, flatShading: true })); hat.position.y = 1.35; hat.rotation.x = -0.2;
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.12), new THREE.MeshStandardMaterial({color: 0xffffff})); pom.position.set(0, 1.6, -0.15);
    group.add(body, head, hat, scarf, pom); group.scale.set(1.3, 1.3, 1.3); return group;
  };

  const createHeartEffect = () => {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: COLORS.candy_red, emissive: 0x880000 });
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat); c.rotation.z = Math.PI / 4; c.rotation.y = Math.PI / 4;
    group.add(c); group.position.set(0, 2.0, 0); group.scale.set(0, 0, 0); return group;
  };

  const createExplosion = (pos: THREE.Vector3, colorOverride?: string | number) => {
    if (!sceneRef.current) return;
    const group = new THREE.Group(); group.position.copy(pos); sceneRef.current.add(group);
    const particles: {mesh: THREE.Mesh, velocity: THREE.Vector3, life: number}[] = [];
    const colors = [COLORS.gold, COLORS.snow, COLORS.ornament_blue, COLORS.window_light, COLORS.ornament_red]; const geometry = new THREE.SphereGeometry(0.12, 6, 6); 
    for(let i=0; i<40; i++) {
        const material = new THREE.MeshBasicMaterial({ color: colorOverride !== undefined ? colorOverride : colors[Math.floor(Math.random() * colors.length)], transparent: true, opacity: 1.0 });
        const mesh = new THREE.Mesh(geometry, material); mesh.scale.setScalar(Math.random() * 0.5 + 0.5); group.add(mesh);
        const velocity = new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() * 0.3) + 0.1, (Math.random() - 0.5) * 0.3);
        particles.push({ mesh, velocity, life: 1.0 });
    }
    explosionsRef.current.push({ group, particles });
  };

  const createBaseFeatures = (headContainer: THREE.Group, eyeColor: string | number) => {
    const eyeGeo = new THREE.SphereGeometry(0.045, 6, 6); const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(0.32, 0.05, 0.12);
    const eyeR = eyeL.clone(); eyeR.position.set(0.32, 0.05, -0.12);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), new THREE.MeshStandardMaterial({ color: COLORS.nose_pink })); nose.position.set(0.34, -0.02, 0);
    headContainer.add(eyeL, eyeR, nose); return { eyeL, eyeR, nose };
  };

  const createBlueCat = () => {
    const group = new THREE.Group(); const furColor = COLORS.fur_blue_grey; const whiteColor = 0xFFFFFF;
    const furMat = new THREE.MeshStandardMaterial({ color: furColor, flatShading: true }); const whiteMat = new THREE.MeshStandardMaterial({ color: whiteColor, flatShading: true });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), furMat); body.scale.set(1.0, 0.8, 1.1); body.position.y = 0.3; body.castShadow = true;
    const bib = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), whiteMat); bib.position.set(0.15, 0.1, 0); bib.scale.set(0.5, 0.8, 0.8); body.add(bib);
    const headGroup = new THREE.Group(); headGroup.name = 'head'; headGroup.position.set(0.3, 0.55, 0);
    const headContainer = new THREE.Group(); headContainer.name = 'headContainer'; headContainer.rotation.y = -Math.PI / 2; headGroup.add(headContainer);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), furMat);
    const muzzleL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), whiteMat); muzzleL.position.set(0.25, -0.08, 0.08);
    const muzzleR = muzzleL.clone(); muzzleR.position.set(0.25, -0.08, -0.08);
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), whiteMat); chin.position.set(0.22, -0.18, 0);
    const earGeo = new THREE.ConeGeometry(0.08, 0.15, 4); const earL = new THREE.Mesh(earGeo, furMat); earL.position.set(0, 0.28, 0.18); earL.rotation.set(0.2, 0, -0.2);
    const earR = earL.clone(); earR.position.set(0, 0.28, -0.18); earR.rotation.set(-0.2, 0, -0.2);
    headContainer.add(head, muzzleL, muzzleR, chin, earL, earR); createBaseFeatures(headContainer, COLORS.gold);
    const legGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.25, 6);
    [[0.2, 0.12, 0.15], [0.2, 0.12, -0.15], [-0.2, 0.12, 0.15], [-0.2, 0.12, -0.15]].forEach(pos => { const leg = new THREE.Mesh(legGeo, whiteMat); leg.position.set(pos[0], pos[1], pos[2]); group.add(leg); });
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.4), furMat); tail.rotation.z = Math.PI / 3; tail.position.set(-0.35, 0.4, 0); group.add(body, headGroup, tail); return group;
  };

  const createRagdoll = () => {
    const group = new THREE.Group(); const bodyColor = COLORS.fur_white; const pointColor = COLORS.fur_ragdoll_point; 
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor }); const pointMat = new THREE.MeshStandardMaterial({ color: pointColor }); 
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.5, 4, 8), bodyMat); body.rotation.z = Math.PI / 2; body.position.y = 0.35; body.castShadow = true;
    const ruff = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22), bodyMat); ruff.position.set(0.25, 0.5, 0); ruff.scale.set(1, 0.6, 1.2); group.add(ruff);
    const headGroup = new THREE.Group(); headGroup.name = 'head'; headGroup.position.set(0.35, 0.6, 0);
    const headContainer = new THREE.Group(); headContainer.name = 'headContainer'; headContainer.rotation.y = -Math.PI / 2; headGroup.add(headContainer);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 10), bodyMat); headContainer.add(head);
    const patchL = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), pointMat); patchL.position.set(0.26, 0.08, 0.12); patchL.scale.set(0.3, 1.0, 1.2); patchL.rotation.y = 0.2;
    const patchR = patchL.clone(); patchR.position.set(0.26, 0.08, -0.12); patchR.rotation.y = -0.2; headContainer.add(patchL, patchR);
    const cheekFluffL = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 4), bodyMat); cheekFluffL.rotation.z = 2.0; cheekFluffL.rotation.y = 0.5; cheekFluffL.position.set(0, -0.1, 0.28);
    const cheekFluffR = cheekFluffL.clone(); cheekFluffR.rotation.y = -0.5; cheekFluffR.position.set(0, -0.1, -0.28); headContainer.add(cheekFluffL, cheekFluffR);
    const earGeo = new THREE.ConeGeometry(0.09, 0.18, 4); const earL = new THREE.Mesh(earGeo, pointMat); earL.position.set(-0.05, 0.28, 0.15); earL.rotation.set(0.2, 0, -0.2);
    const earR = earL.clone(); earR.position.set(-0.05, 0.28, -0.15); earR.rotation.set(-0.2, 0, -0.2); headContainer.add(earL, earR); createBaseFeatures(headContainer, COLORS.eye_blue); 
    const legGeo = new THREE.CylinderGeometry(0.07, 0.06, 0.35, 6);
    [[0.3, 0.175, 0.15], [0.3, 0.175, -0.15], [-0.3, 0.175, 0.15], [-0.3, 0.175, -0.15]].forEach(pos => { const leg = new THREE.Mesh(legGeo, bodyMat); leg.position.set(pos[0], pos[1], pos[2]); group.add(leg); });
    const tailGroup = new THREE.Group(); tailGroup.position.set(-0.4, 0.45, 0); tailGroup.rotation.z = Math.PI / 3;
    for(let i=0; i<5; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.1 - i*0.012), pointMat); s.position.y = i * 0.12; tailGroup.add(s); }
    group.add(body, headGroup, tailGroup); return group;
  };

  const createBlackCat = () => {
    const group = new THREE.Group(); const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }); 
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.55, 4, 8), blackMat); body.rotation.z = Math.PI / 2; body.position.y = 0.35; body.castShadow = true;
    const ruff = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.08, 6, 10), blackMat); ruff.rotation.y = Math.PI / 2; ruff.position.set(0.3, 0.5, 0);
    const headGroup = new THREE.Group(); headGroup.name = 'head'; headGroup.position.set(0.35, 0.6, 0);
    const headContainer = new THREE.Group(); headContainer.name = 'headContainer'; headContainer.rotation.y = -Math.PI / 2; headGroup.add(headContainer);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), blackMat);
    const earGeo = new THREE.ConeGeometry(0.08, 0.18, 4); const earL = new THREE.Mesh(earGeo, blackMat); earL.position.set(0, 0.25, 0.14); earL.rotation.set(0.2, 0, -0.2);
    const earR = earL.clone(); earR.position.set(0, 0.25, -0.14); earR.rotation.set(-0.2, 0, -0.2); headContainer.add(head, earL, earR);
    const { eyeL, eyeR, nose } = createBaseFeatures(headContainer, 0xFFEB3B); eyeL.scale.set(1.2, 1.2, 1.2); eyeR.scale.set(1.2, 1.2, 1.2);
    nose.material = new THREE.MeshStandardMaterial({ color: 0x333333 }); 
    const legGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.35, 6);
    [[0.3, 0.175, 0.15], [0.3, 0.175, -0.15], [-0.3, 0.175, 0.15], [-0.3, 0.175, -0.15]].forEach(pos => { const leg = new THREE.Mesh(legGeo, blackMat); leg.position.set(pos[0], pos[1], pos[2]); group.add(leg); });
    const tailGroup = new THREE.Group(); tailGroup.position.set(-0.4, 0.4, 0); tailGroup.rotation.z = Math.PI / 3;
    for(let i=0; i<4; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.08 - i*0.01), blackMat); s.position.y = i * 0.12; tailGroup.add(s); }
    group.add(body, ruff, headGroup, tailGroup); return group;
  };

  const createTeddyDog = () => {
    const group = new THREE.Group(); const furMat = new THREE.MeshStandardMaterial({ color: COLORS.fur_teddy, roughness: 1.0 }); 
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.55), furMat); body.position.y = 0.35; body.castShadow = true;
    const headGroup = new THREE.Group(); headGroup.name = 'head'; headGroup.position.set(0, 0.65, 0.35); 
    const headContainer = new THREE.Group(); headContainer.name = 'headContainer'; headGroup.add(headContainer);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), furMat);
    const topknot = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), furMat); topknot.position.y = 0.25;
    const earL = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), furMat); earL.position.set(0.26, 0.05, 0);
    const earR = earL.clone(); earR.position.set(-0.26, 0.05, 0);
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), furMat); muzzle.position.set(0, -0.05, 0.22);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshStandardMaterial({ color: COLORS.nose_black })); nose.position.set(0, 0, 0.32);
    const eyeGeo = new THREE.SphereGeometry(0.04); const eyeMat = new THREE.MeshBasicMaterial({ color: COLORS.eye_black });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(0.1, 0.05, 0.26); const eyeR = eyeL.clone(); eyeR.position.set(-0.1, 0.05, 0.26);
    headContainer.add(head, topknot, earL, earR, muzzle, nose, eyeL, eyeR);
    const legGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.3, 6); const positions = [{x: 0.18, z: 0.18}, {x: -0.18, z: 0.18}, {x: 0.18, z: -0.18}, {x: -0.18, z: -0.18}];
    positions.forEach(pos => { const leg = new THREE.Mesh(legGeo, furMat); leg.position.set(pos.x, 0.15, pos.z); group.add(leg); const paw = new THREE.Mesh(new THREE.SphereGeometry(0.1), furMat); paw.position.set(pos.x, 0.05, pos.z); group.add(paw); });
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.12), furMat); tail.position.set(0, 0.5, -0.3);
    group.add(body, headGroup, tail); return group;
  };

  const createAnimalMesh = (type: string) => { switch (type) { case 'CAT_BLUE': return createBlueCat(); case 'CAT_RAGDOLL': return createRagdoll(); case 'CAT_BLACK': return createBlackCat(); case 'DOG_TEDDY': return createTeddyDog(); default: return createBlueCat(); } };
  
  const createMarker = () => { 
      const group = new THREE.Group(); 
      // 1. Tall Beam of Light (for visibility behind trees)
      const beamGeo = new THREE.CylinderGeometry(0.05, 0.05, 12, 8, 1, true);
      beamGeo.translate(0, 6, 0); // Move bottom to 0
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xFFF176, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      
      const glowGeo = new THREE.CylinderGeometry(0.3, 0.8, 8, 8, 1, true);
      glowGeo.translate(0, 4, 0);
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xFFAB00, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      
      // 2. Big Bouncing Arrow (Pointing Down)
      const arrowGeo = new THREE.ConeGeometry(0.4, 0.8, 4);
      arrowGeo.rotateX(Math.PI); // Point down
      arrowGeo.rotateY(Math.PI / 4); 
      const arrowMat = new THREE.MeshBasicMaterial({ color: 0xFFD700 });
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      arrow.position.y = 4.5;
      arrow.name = 'markerArrow';

      // 3. Ground Ripple Ring
      const ringGeo = new THREE.RingGeometry(0.5, 0.7, 32); 
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: COLORS.marker_ring, transparent: true, opacity: 0.8, side: THREE.DoubleSide }); 
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.05;
      ring.name = 'markerRing';

      group.add(beam, glow, arrow, ring);
      return group; 
  };
  
  const createGlassDome = () => {
      const group = new THREE.Group();
      const radius = 20;

      // 1. MAIN CRYSTAL SHELL: Fixed IOR for 100% internal clarity
      const domeGeom = new THREE.SphereGeometry(radius, 64, 64, 0, Math.PI * 2, 0, Math.PI * 0.6); 
      const domeMat = new THREE.MeshPhysicalMaterial({
          roughness: 0.05,
          metalness: 0,
          transmission: 1.0, 
          ior: 1.01,       // ABSOLUTE CLARITY inside
          thickness: 0,    // NO DOUBLE IMAGE distortion
          color: 0xffffff,
          clearcoat: 1.0, 
          clearcoatRoughness: 0,
          transparent: true,
          side: THREE.FrontSide, 
      });
      const dome = new THREE.Mesh(domeGeom, domeMat);
      dome.position.y = 1; 
      group.add(dome);

      // 2. POLAR RIM GLOW: Soft edge highlight to define shape without heavy glares
      const rimGeom = new THREE.SphereGeometry(radius + 0.1, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.6);
      const rimMat = new THREE.MeshBasicMaterial({
          color: 0x87CEEB, // Icy blue
          transparent: true,
          opacity: 0.12,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending
      });
      const rim = new THREE.Mesh(rimGeom, rimMat);
      rim.position.y = 1;
      group.add(rim);

      // 3. SURFACE SPARKLES: Subtle twinkling highlights on the glass for a magical feel
      for(let i=0; i<4; i++) {
          const sparkle = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true}));
          const angle = Math.random() * Math.PI * 2;
          const phi = Math.random() * 0.7;
          sparkle.position.set(
              radius * Math.sin(phi) * Math.cos(angle),
              radius * Math.cos(phi) + 1,
              radius * Math.sin(phi) * Math.sin(angle)
          );
          sparkle.name = "sparkle";
          sparkle.userData = { offset: Math.random() * 100 };
          group.add(sparkle);
      }

      return group;
  };

  const createOrnateBase = () => {
      const group = new THREE.Group();
      const mainBase = new THREE.Mesh(new THREE.CylinderGeometry(19.5, 21, 3, 64), new THREE.MeshStandardMaterial({ color: COLORS.base_wood, roughness: 0.6 }));
      mainBase.position.y = -2.5;
      const rimTop = new THREE.Mesh(new THREE.TorusGeometry(19.5, 0.5, 8, 64), new THREE.MeshStandardMaterial({ color: COLORS.base_gold, metalness: 0.8, roughness: 0.2 }));
      rimTop.rotation.x = Math.PI / 2; rimTop.position.y = -1.0;
      const snowFloor = new THREE.Mesh(new THREE.CylinderGeometry(18.5, 18.5, 1, 64), new THREE.MeshStandardMaterial({ color: COLORS.snow }));
      snowFloor.position.y = -0.5; snowFloor.receiveShadow = true;
      group.add(mainBase, rimTop, snowFloor); return group;
  };

  const createEnvironment = (scene: THREE.Scene) => {
     scene.add(createOrnateBase()); scene.add(createGlassDome());
     const cabin = createCabin(); cabin.position.set(-6, 0, -2); cabin.rotation.y = Math.PI / 6; cabin.scale.set(1.2, 1.2, 1.2); scene.add(cabin);
     // Car
     const car = createCar(); car.position.set(-4.5, 0, 1); car.rotation.y = Math.PI / 3; scene.add(car);

     // Increased trees for density (from 26 to 34)
     for(let i=0; i<34; i++) {
         const tree = createDecoratedTree(1 + Math.random() * 0.4);
         const angle = Math.random() * Math.PI * 2; const dist = 4 + Math.random() * 12; 
         if (dist < 8 && Math.abs(angle - Math.PI) < 0.5) continue;
         tree.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist); scene.add(tree);
     }
     // Increased Snow Piles (from 6 to 16)
     for(let i=0; i<16; i++) {
        const pile = createSnowPile();
        const angle = Math.random() * Math.PI * 2;
        const dist = 5 + Math.random() * 10;
        pile.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
        pile.rotation.y = Math.random() * Math.PI;
        scene.add(pile);
     }
     // Add Bushes (Dead Wood / Shrubs)
     for(let i=0; i<8; i++) {
        const bush = createBush();
        const angle = Math.random() * Math.PI * 2;
        const dist = 6 + Math.random() * 9;
        // Avoid center path a bit
        if (dist < 8 && Math.abs(angle - Math.PI) < 0.5) continue;
        bush.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
        bush.rotation.y = Math.random() * Math.PI;
        scene.add(bush);
     }
     // Add Mushrooms
     for(let i=0; i<6; i++) {
        const mush = createMushroom();
        const angle = Math.random() * Math.PI * 2;
        const dist = 5 + Math.random() * 10;
        mush.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
        // Tilt slightly
        mush.rotation.z = (Math.random() - 0.5) * 0.2;
        mush.rotation.x = (Math.random() - 0.5) * 0.2;
        scene.add(mush);
     }

     for(let i=0; i<5; i++) {
         const sm = createSnowman(); sm.position.set((Math.random()-0.5)*20, 0, (Math.random()-0.5)*20); if(sm.position.length() < 15) scene.add(sm);
         const cc = createCandyCane(); cc.position.set((Math.random()-0.5)*24, 0, (Math.random()-0.5)*24); cc.rotation.y = Math.random() * Math.PI; if(cc.position.length() < 15) scene.add(cc);
     }
     const exitGroup = new THREE.Group(); exitGroup.position.set(0, 0, -12); const grandScale = 1.7; 
     const bigTree = createDecoratedTree(grandScale, true); const treeTopY = 6.25 * grandScale;
     const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.4 * grandScale), new THREE.MeshStandardMaterial({ color: COLORS.gold, emissive: COLORS.gold, emissiveIntensity: 1.0 }));
     star.position.y = treeTopY; star.rotation.z = Math.PI / 4;
     const light = new THREE.PointLight(COLORS.gold, 2, 15); light.position.y = treeTopY * 0.6; exitGroup.add(bigTree, star, light);
     scene.add(exitGroup); exitRef.current = exitGroup;
     const santa = createSantaGroup(); santa.position.set(0, -100, 0); scene.add(santa); santaRef.current = santa;
     const gifts = createGiftBoxes(); gifts.position.set(0, -100, 0); scene.add(gifts); giftsRef.current = gifts;
     const particlesGeom = new THREE.BufferGeometry(); const count = 4000; const pos = new Float32Array(count * 3);
     for(let i=0; i<count*3; i+=3) { const r = Math.random() * 17; const theta = Math.random() * Math.PI * 2; pos[i] = r * Math.cos(theta); pos[i+1] = Math.random() * 18; pos[i+2] = r * Math.sin(theta); }
     particlesGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
     const snowSystem = new THREE.Points(particlesGeom, new THREE.PointsMaterial({color: 0xffffff, size: 0.12, transparent:true, opacity:0.7})); snowSystem.position.y = 1; scene.add(snowSystem); particlesRef.current = snowSystem;
     
     // Improved Smoke System with low-poly puffs
     const smokeGroup = new THREE.Group(); 
     smokeGroup.position.set(-5.3, 3.4, -1.9); // Chimney top world position
     for(let i=0; i<20; i++){ 
         const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12), new THREE.MeshBasicMaterial({color:0xeeeeee, transparent:true, opacity:0.0})); 
         p.position.set((Math.random()-0.5)*0.2, Math.random()*2, (Math.random()-0.5)*0.2);
         p.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
         p.userData = { speed: 0.01 + Math.random() * 0.015, rotateSpeed: (Math.random()-0.5) * 0.05 };
         smokeGroup.add(p); 
     }
     scene.add(smokeGroup); smokeParticlesRef.current = smokeGroup;
  };

  useEffect(() => {
    if (!containerRef.current) return;
    while(containerRef.current.firstChild) containerRef.current.removeChild(containerRef.current.firstChild);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(COLORS.background);
    const starGeo = new THREE.BufferGeometry(); const starPos = [];
    for(let i=0; i<500; i++) starPos.push((Math.random()-0.5)*200, (Math.random()-0.5)*200, (Math.random()-0.5)*200);
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({color: 0xffffff, size: 0.3, transparent: true, opacity: 0.6})));
    const aspect = window.innerWidth / window.innerHeight;
    const camera = new THREE.OrthographicCamera(-VIEW_SIZE * aspect, VIEW_SIZE * aspect, VIEW_SIZE, -VIEW_SIZE, 1, 1000); 
    // Initial camera position relative to player start at (0,0,8)
    camera.position.set(40, 40, 48); 
    camera.lookAt(0, 1, 8); 
    cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); renderer.setSize(window.innerWidth, window.innerHeight); renderer.setPixelRatio(window.devicePixelRatio); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; containerRef.current.appendChild(renderer.domElement); rendererRef.current = renderer;
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const rimLight = new THREE.PointLight(0x88ccff, 2, 50); rimLight.position.set(-20, 10, -20); scene.add(rimLight);
    scene.add(new THREE.HemisphereLight(0x87CEEB, 0x0F172A, 0.4));
    const dirLight = new THREE.DirectionalLight(0xfffce3, 1.8); dirLight.position.set(30, 45, 20); dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 4096; dirLight.shadow.mapSize.height = 4096;
    const shadowSize = 30; dirLight.shadow.camera.left = -shadowSize; dirLight.shadow.camera.right = shadowSize; dirLight.shadow.camera.top = shadowSize; dirLight.shadow.camera.bottom = -shadowSize;
    scene.add(dirLight); sceneRef.current = scene; createEnvironment(scene);
    const player = createPlayer(); scene.add(player); playerMeshRef.current = player; playerPosRef.current = { x: 0, z: 8, moving: false }; player.position.set(0, 0, 8);
    const configs = Object.entries(ANIMAL_CONFIGS);
    configs.forEach(([key, conf], idx) => {
        const animalMesh = createAnimalMesh(conf.type); animalMesh.scale.setScalar(conf.scale);
        const marker = createMarker(); animalMesh.add(marker);
        const light = new THREE.PointLight(COLORS.marker_glow, 1.5, 4); light.position.y = 0.5; animalMesh.add(light);
        const heart = createHeartEffect(); animalMesh.add(heart);
        const angle = (idx / configs.length) * Math.PI * 2 + 1.0; const dist = 7 + Math.random() * 3; animalMesh.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist); animalMesh.rotation.y = Math.random() * Math.PI * 2;
        scene.add(animalMesh); animalsRef.current.set(key, { mesh: animalMesh, marker: marker, light: light, heart: heart, data: { id: key, isRescued: false } });
    });
    const animate = () => { frameIdRef.current = requestAnimationFrame(animate); update(); renderer.render(scene, camera); }; animate();
    const handleResize = () => { if (!cameraRef.current || !rendererRef.current) return; const asp = window.innerWidth / window.innerHeight; cameraRef.current.left = -VIEW_SIZE * asp; cameraRef.current.right = VIEW_SIZE * asp; cameraRef.current.top = VIEW_SIZE; cameraRef.current.bottom = -VIEW_SIZE; cameraRef.current.updateProjectionMatrix(); rendererRef.current.setSize(window.innerWidth, window.innerHeight); };
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); cancelAnimationFrame(frameIdRef.current); if (rendererRef.current) { rendererRef.current.dispose(); if(containerRef.current && rendererRef.current.domElement) containerRef.current.innerHTML = ''; } };
  }, []);

  const playRescueSound = () => {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const now = ctx.currentTime;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(1600, now + 0.1);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
  };

  const update = () => {
     if (!playerMeshRef.current || !cameraRef.current) return;
     let dx = inputRef.current.vector.x, dy = inputRef.current.vector.y;
     if (dx === 0 && dy === 0) { if (inputRef.current.left) dx = -1; if (inputRef.current.right) dx = 1; if (inputRef.current.up) dy = -1; if (inputRef.current.down) dy = 1; if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; } }
     if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
         playerPosRef.current.x += dx * MOVE_SPEED; playerPosRef.current.z += dy * MOVE_SPEED; playerPosRef.current.moving = true;
         const targetRot = Math.atan2(dx, dy); let rotDiff = targetRot - playerMeshRef.current.rotation.y;
         while (rotDiff > Math.PI) rotDiff -= Math.PI * 2; while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
         playerMeshRef.current.rotation.y += rotDiff * 0.2; trailRef.current.unshift({ x: playerPosRef.current.x, z: playerPosRef.current.z }); if (trailRef.current.length > 500) trailRef.current.pop();
     } else playerPosRef.current.moving = false;
     const dist = Math.sqrt(playerPosRef.current.x**2 + playerPosRef.current.z**2);
     if (dist > 16.0) { const angle = Math.atan2(playerPosRef.current.z, playerPosRef.current.x); playerPosRef.current.x = Math.cos(angle) * 16.0; playerPosRef.current.z = Math.sin(angle) * 16.0; }
     playerMeshRef.current.position.x = playerPosRef.current.x; playerMeshRef.current.position.z = playerPosRef.current.z;
     const time = Date.now(); playerMeshRef.current.position.y = playerPosRef.current.moving ? Math.abs(Math.sin(time * 0.005 * 3)) * 0.2 : 0;
     
     // Update Surface Sparkles
     if (sceneRef.current) {
         sceneRef.current.traverse((obj) => {
             if (obj.name === "sparkle") {
                const mesh = obj as THREE.Mesh;
                const t = (time * 0.003) + mesh.userData.offset;
                mesh.scale.setScalar(0.7 + Math.sin(t) * 0.4);
                if (mesh.material) { (mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(t * 1.5) * 0.5; }
                mesh.rotation.set(t * 0.5, t, t * 0.3);
             }
         });
     }

     // === CINEMATIC CAMERA LOGIC ===
     let desiredCameraPos = new THREE.Vector3();
     let desiredLookAt = new THREE.Vector3();
     let desiredZoom = 1.0;

     if (santaStateRef.current.phase === 'ARRIVING' && santaRef.current) {
        const p = santaStateRef.current.progress;
        
        if (p < 0.35) {
             // STAGE 1: GRAND REVEAL (Panorama)
             desiredCameraPos.set(0, 60, 60);
             desiredLookAt.set(0, 0, 0); 
             desiredZoom = 0.55; 
        } else {
             // STAGE 2: SANTA FOLLOW (Mid-shot)
             const santaPos = santaRef.current.position;
             desiredCameraPos.copy(santaPos).add(new THREE.Vector3(30, 30, 30));
             desiredLookAt.copy(santaPos);
             desiredZoom = 0.8;
        }
     } else if (santaStateRef.current.phase === 'PARKED') {
         // STAGE 3: BACK TO PLAYER
         const playerPos = new THREE.Vector3(playerPosRef.current.x, 0, playerPosRef.current.z);
         desiredCameraPos.copy(playerPos).add(new THREE.Vector3(40, 40, 40));
         desiredLookAt.copy(playerPos).add(new THREE.Vector3(0, 1, 0));
         desiredZoom = 1.0;
     } else {
         // NORMAL: Player Follow
         const playerPos = new THREE.Vector3(playerPosRef.current.x, 0, playerPosRef.current.z);
         desiredCameraPos.copy(playerPos).add(new THREE.Vector3(40, 40, 40)); 
         desiredLookAt.copy(playerPos).add(new THREE.Vector3(0, 1, 0));
         
         if (zoomStateRef.current.active) {
            const progress = (time - zoomStateRef.current.startTime) / zoomStateRef.current.duration;
            if (progress >= 1) { zoomStateRef.current.active = false; }
            else {
                desiredZoom = 1 + Math.sin(progress * Math.PI) * (zoomStateRef.current.peak - 1);
            }
         }
     }

     cameraRef.current.position.lerp(desiredCameraPos, 0.05);
     currentCameraLookAtRef.current.lerp(desiredLookAt, 0.05);
     cameraRef.current.lookAt(currentCameraLookAtRef.current);
     cameraRef.current.zoom = THREE.MathUtils.lerp(cameraRef.current.zoom, desiredZoom, 0.05);
     cameraRef.current.updateProjectionMatrix();

     for (let i = explosionsRef.current.length - 1; i >= 0; i--) {
        const expl = explosionsRef.current[i]; let aliveCount = 0;
        expl.particles.forEach(p => { if (p.life > 0) { p.mesh.position.add(p.velocity); p.velocity.y -= 0.015; p.mesh.rotation.x += 0.1; p.mesh.rotation.z += 0.1; p.mesh.scale.setScalar(p.life); p.life -= 0.02; aliveCount++; } else p.mesh.visible = false; });
        if (aliveCount === 0) { if (sceneRef.current) sceneRef.current.remove(expl.group); explosionsRef.current.splice(i, 1); }
     }
     if (santaStateRef.current.phase !== 'HIDDEN' && santaRef.current) {
         if (santaStateRef.current.phase === 'ARRIVING') {
             // INCREASED SPEED: Adjusted to 0.0015 for faster arrival
             santaStateRef.current.progress += 0.0015; 
             const t = Math.min(santaStateRef.current.progress, 1);
             santaRef.current.position.lerpVectors(santaStateRef.current.startPos, santaStateRef.current.endPos, 1 - Math.pow(1 - t, 3));
             
             // FIXED: Manual rotation calculation to ensure Santa stays strictly upright
             if (t < 0.99) {
                const dx = santaStateRef.current.endPos.x - santaStateRef.current.startPos.x;
                const dz = santaStateRef.current.endPos.z - santaStateRef.current.startPos.z;
                const yaw = Math.atan2(dx, dz); // Calculate Y-rotation based on direction
                
                // Set rotation: Pitch(X)=0, Yaw(Y)=calculated, Roll(Z)=0
                santaRef.current.rotation.set(0, yaw, 0);
             }

             if (Math.random() > 0.2) { const offset = new THREE.Vector3((Math.random()-0.5)*1, 0.5, (Math.random()-0.5)*1).applyQuaternion(santaRef.current.quaternion); createExplosion(santaRef.current.position.clone().add(offset), COLORS.gold); }
             if (t >= 1) { 
                 santaStateRef.current.phase = 'PARKED'; 
                 // Explicitly force safe rotation when parked to prevent flip
                 santaRef.current.rotation.set(0, 0, 0); 
                 
                 if (giftsRef.current && !giftsVisibleRef.current) { giftsVisibleRef.current = true; const giftPos = santaStateRef.current.endPos.clone().add(new THREE.Vector3(2, 0, 1)); giftsRef.current.position.copy(giftPos); createExplosion(giftPos, COLORS.gold); createExplosion(giftPos.clone().add(new THREE.Vector3(0.5,0.5,0)), COLORS.candy_red); } 
            }
         } else if (santaStateRef.current.phase === 'PARKED') {
             santaRef.current.position.y = Math.sin(time * 0.002) * 0.1;
             if (giftsRef.current && giftsVisibleRef.current) giftsRef.current.children.forEach((gift, i) => { gift.position.y = 0.3 + Math.sin(time * 0.003 + i) * 0.1; gift.rotation.y += 0.02; });
         }
     }

     let rescuedCount = 0; let followIndex = 14; 
     animalsRef.current.forEach(({ mesh, marker, light, heart, data }) => {
         const headGroup = mesh.getObjectByName('head');
         if (!data.isRescued) {
             const d = Math.sqrt(Math.pow(playerPosRef.current.x - mesh.position.x, 2) + Math.pow(playerPosRef.current.z - mesh.position.z, 2));
             mesh.position.y = Math.sin(time * 0.005 + data.id.length) * 0.1 + 0.2;
             
             // MARKER ANIMATION LOGIC
             if (marker && light) { 
                 marker.visible = true; 
                 // Bounce the arrow
                 const arrow = marker.getObjectByName('markerArrow');
                 if (arrow) {
                     arrow.rotation.y += 0.02;
                     arrow.position.y = 4.0 + Math.sin(time * 0.005 * 4) * 0.5; 
                 }
                 // Pulse the ground ring
                 const ring = marker.getObjectByName('markerRing');
                 if (ring) {
                     const s = 1.0 + Math.sin(time * 0.005 * 4) * 0.2;
                     ring.scale.set(s, s, s);
                 }
                 light.intensity = 1.2 + Math.sin(time * 0.005 * 5) * 0.5; 
             }

             if (d < 2.2) {
                 data.isRescued = true; setGameState(prev => ({...prev, score: prev.score + 1}));
                 zoomStateRef.current.active = true; zoomStateRef.current.startTime = time;
                 playRescueSound();
                 if (heart) { heart.visible = true; heart.scale.set(0, 0, 0); data.heartTime = time; }
                 createExplosion(mesh.position);
                 if (blessingTimeoutRef.current) clearTimeout(blessingTimeoutRef.current);
                 const config = ANIMAL_CONFIGS[data.id as keyof typeof ANIMAL_CONFIGS];
                 setBlessing({ text: `${config.name} Found!`, subtext: "Forever Friends", key: Date.now(), type: 'normal' });
                 blessingTimeoutRef.current = setTimeout(() => setBlessing(null), 3500);
             }
         } else {
             if (marker) marker.visible = false; if (light) light.intensity = 0; rescuedCount++;
             if (trailRef.current[followIndex]) {
                 const target = trailRef.current[followIndex]; mesh.position.x += (target.x - mesh.position.x) * 0.12; mesh.position.z += (target.z - mesh.position.z) * 0.12;
                 mesh.lookAt(target.x, mesh.position.y, target.z); mesh.rotateY(-Math.PI / 2); mesh.position.y = Math.abs(Math.sin(time * 0.005 * 3 + followIndex)) * 0.2;
                 if (headGroup && playerMeshRef.current) headGroup.lookAt(new THREE.Vector3(playerMeshRef.current.position.x, 1.0, playerMeshRef.current.position.z));
             }
             followIndex += 14;
             if (heart && heart.visible && data.heartTime) { const age = time - data.heartTime; if (age < 2000) { heart.scale.setScalar((1.0 + Math.sin(age * 0.005) * 0.3) * Math.min(1, age/300)); heart.position.y = 2.0 + age * 0.001; heart.rotation.y += 0.05; } else heart.visible = false; }
         }
     });
     
     // Updated Smoke Animation
     if(smokeParticlesRef.current) {
        smokeParticlesRef.current.children.forEach((p) => { 
            const mesh = p as THREE.Mesh;
            mesh.position.y += mesh.userData.speed;
            mesh.rotation.x += mesh.userData.rotateSpeed;
            mesh.rotation.y += mesh.userData.rotateSpeed;
            
            // Wind drift
            mesh.position.x += 0.005; 
            
            // Scale and Opacity lifecycle
            const life = mesh.position.y;
            const maxLife = 2.5;
            
            if(life > maxLife) {
                // Reset
                mesh.position.y = 0;
                mesh.position.x = (Math.random()-0.5)*0.2;
                mesh.position.z = (Math.random()-0.5)*0.2;
                mesh.scale.setScalar(0.8);
                (mesh.material as THREE.MeshBasicMaterial).opacity = 0.8;
            } else {
                // Evolve
                const progress = life / maxLife;
                mesh.scale.setScalar(0.8 + progress * 1.2); // Grow
                (mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - progress); // Fade
            }
        });
     }
     if (particlesRef.current) { 
         const attr = particlesRef.current.geometry.attributes.position; const positions = attr.array as Float32Array; 
         for(let i=1; i<positions.length; i+=3) { positions[i] -= 0.05; if (positions[i] < -2) positions[i] = 12; } 
         attr.needsUpdate = true; 
     }
     if (rescuedCount === 4) {
         if (prevRescuedRef.current !== 4) { allRescuedTimeRef.current = Date.now(); }
         if (allRescuedTimeRef.current && Date.now() - allRescuedTimeRef.current > 2000 && santaStateRef.current.phase === 'HIDDEN') {
            // UPDATED: Fixed safe landing spot near center (0,0,3) instead of player-relative
            santaStateRef.current.endPos.set(0, 0, 3); 
            // Start high up and far away
            santaStateRef.current.startPos.set(-40, 30, 25); 
            
            santaStateRef.current.phase = 'ARRIVING'; santaStateRef.current.progress = 0; 
            createExplosion(playerMeshRef.current.position.clone().add(new THREE.Vector3(0,3,0)), COLORS.gold);
         }
         if (giftsVisibleRef.current && giftsRef.current && !winTriggeredRef.current && guideRef.current && cameraRef.current) {
            if (santaStateRef.current.phase === 'PARKED') {
                const p1 = playerMeshRef.current.position.clone(), p2 = giftsRef.current.position.clone(); p1.project(cameraRef.current); p2.project(cameraRef.current);
                const dist = playerMeshRef.current.position.distanceTo(giftsRef.current.position);
                if (dist > 3.0) { guideRef.current.style.display = 'flex'; const angle = Math.atan2(-(p2.y - p1.y), p2.x - p1.x); guideRef.current.style.transform = `translate(calc(-50% + ${Math.cos(angle) * 120}px), calc(-50% + ${Math.sin(angle) * 120}px))`; } else guideRef.current.style.display = 'none';
            } else { guideRef.current.style.display = 'none'; }
         } 
         if (giftsVisibleRef.current && giftsRef.current && playerMeshRef.current.position.distanceTo(giftsRef.current.position) < 3.0 && !winTriggeredRef.current) {
            winTriggeredRef.current = true; 
            createExplosion(giftsRef.current.position, COLORS.gold); createExplosion(giftsRef.current.position.clone().add(new THREE.Vector3(0,1,0)), COLORS.candy_red);
            // Trigger loading state, remove hardcoded letterContent so AI can fetch
            setGameState(prev => ({...prev, isWon: true, loadingLetter: true, letterContent: null }));
            
            // Delayed UI trigger
            setTimeout(() => {
                setShowSuccessUI(true);
            }, 1500);
         }
         if (winTriggeredRef.current && exitRef.current) {
             const star = exitRef.current.children[1], light = exitRef.current.children[2] as THREE.PointLight;
             if (star) { star.rotation.z += 0.1; star.scale.setScalar(1 + Math.sin(time * 0.005 * 8) * 0.3); }
             if (light) { light.intensity = 3 + Math.sin(time * 0.005 * 20) * 2; light.color.setHSL((time * 0.005 * 0.5) % 1, 1, 0.5); }
         }
     }
     prevRescuedRef.current = rescuedCount;
  };

  const handleJoystickStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault(); const container = e.currentTarget.getBoundingClientRect(); const cx = container.width / 2, cy = container.height / 2;
    let clientX, clientY; if ('touches' in e) { clientX = e.touches[0].clientX; clientY = e.touches[0].clientY; } else { clientX = (e as React.MouseEvent).clientX; clientY = (e as React.MouseEvent).clientY; }
    updateJoystickVector(clientX - container.left, clientY - container.top, cx, cy); setJoystickState({ active: true, cx, cy, kx: 0, ky: 0 });
  };
  const handleJoystickMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!joystickState.active) return; e.preventDefault();
    let clientX, clientY; if ('touches' in e) { clientX = e.touches[0].clientX; clientY = e.touches[0].clientY; } else { clientX = (e as React.MouseEvent).clientX; clientY = (e as React.MouseEvent).clientY; }
    const container = (e.currentTarget as HTMLElement).getBoundingClientRect(); updateJoystickVector(clientX - container.left, clientY - container.top, joystickState.cx, joystickState.cy);
  };
  const updateJoystickVector = (tx: number, ty: number, cx: number, cy: number) => {
      const dx = tx - cx, dy = ty - cy, dist = Math.sqrt(dx*dx + dy*dy), angle = Math.atan2(dy, dx), cappedDist = Math.min(dist, 50);
      const kx = Math.cos(angle) * cappedDist, ky = Math.sin(angle) * cappedDist;
      setJoystickState(prev => ({...prev, kx, ky})); inputRef.current.vector = dist > 0 ? { x: (dx / dist) * (cappedDist / 50), y: (dy / dist) * (cappedDist / 50) } : { x: 0, y: 0 };
  };
  const handleJoystickEnd = () => { setJoystickState(prev => ({...prev, active: false, kx: 0, ky: 0})); inputRef.current.vector = { x: 0, y: 0 }; };

  const playChristmasTune = () => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        const now = ctx.currentTime;
        
        // Instrument: Music Box / Celesta type sound
        // Sine wave with a bit of ring
        const play = (freq: number, offset: number, duration: number) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.value = freq;
            
            // Add a high harmonic for "tine" sound
            const osc2 = ctx.createOscillator();
            osc2.type = 'sine';
            osc2.frequency.value = freq * 4; // 2 octaves up
            const gain2 = ctx.createGain();
            gain2.gain.value = 0.05; // Quiet overtone

            osc.connect(gain);
            osc2.connect(gain2);
            gain2.connect(gain);
            gain.connect(ctx.destination);
            
            const startT = now + offset;
            osc.start(startT);
            osc2.start(startT);
            
            // Envelope: Fast attack, slow decay
            gain.gain.setValueAtTime(0, startT);
            gain.gain.linearRampToValueAtTime(0.2, startT + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, startT + duration);
            
            osc.stop(startT + duration + 0.5);
            osc2.stop(startT + duration + 0.5);
        };
        
        const unit = 0.25; // Speed
        
        // Notes: "It's Beginning to Look a Lot Like Christmas"
        // Key: G (Starting note D)
        // Melody: D | G G G F# G | A G F# | E
        
        play(293.66, 0.0, 1.0);       // It's (D4)
        
        play(392.00, unit * 1, 1.5);  // Be (G4)
        play(392.00, unit * 3, 1.0);  // gin (G4)
        play(392.00, unit * 4, 1.0);  // ning (G4)
        play(369.99, unit * 5, 1.0);  // to (F#4)
        play(392.00, unit * 6, 1.0);  // look (G4)
        
        play(440.00, unit * 7, 2.0);  // A (A4)
                                      
        play(392.00, unit * 10, 1.0); // like (G4)
        play(369.99, unit * 11, 1.0); // Christ (F#4)
        play(329.63, unit * 13, 3.0); // mas (E4)

    } catch (e) {
        console.error("Audio play failed", e);
    }
  };

  const openEnvelope = () => {
    setShowSuccessUI(false);
    setGameState(prev => ({...prev, envelopeOpen: true}));
    playChristmasTune();
  };

  useEffect(() => {
    const kd = (e: KeyboardEvent) => { const code = e.code; if(code==='ArrowLeft' || code==='KeyA') inputRef.current.left=true; if(code==='ArrowRight' || code==='KeyD') inputRef.current.right=true; if(code==='ArrowUp' || code==='KeyW') inputRef.current.up=true; if(code==='ArrowDown' || code==='KeyS') inputRef.current.down=true; };
    const ku = (e: KeyboardEvent) => { const code = e.code; if(code==='ArrowLeft' || code==='KeyA') inputRef.current.left=false; if(code==='ArrowRight' || code==='KeyD') inputRef.current.right=false; if(code==='ArrowUp' || code==='KeyW') inputRef.current.up=false; if(code==='ArrowDown' || code==='KeyS') inputRef.current.down=false; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  return (
    <div className="relative w-full h-screen bg-[#0F172A] overflow-hidden select-none">
      <div ref={containerRef} className="absolute inset-0 z-0" />
      <div className="absolute top-6 left-6 z-10 pointer-events-none">
          <div className="bg-white/90 backdrop-blur px-6 py-3 rounded-full shadow-lg border-2 border-white flex items-center gap-3">
              <span className="text-2xl">🐾</span>
              <span className="font-bold text-blue-900 text-lg">{gameState.score} / 4 Found</span>
          </div>
      </div>
      <div ref={guideRef} className="absolute top-1/2 left-1/2 z-20 hidden flex-row items-center justify-center pointer-events-none" style={{ width: '0px', height: '0px' }}>
        <div className="flex flex-col items-center justify-center">
             <div className="text-4xl animate-bounce drop-shadow-lg filter">🎁</div>
             <div className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded shadow-md mt-1 border border-white whitespace-nowrap">GIFTS</div>
        </div>
      </div>
      {blessing && (
        <div key={blessing.key} className="absolute top-24 left-0 right-0 z-50 flex justify-center pointer-events-none animate-[slideIn_0.5s_cubic-bezier(0.175,0.885,0.32,1.275)]">
            {/* Frosted Glass Pill */}
            <div className="relative flex items-center gap-3 px-6 py-3 bg-slate-800/20 backdrop-blur-xl border border-white/30 shadow-[0_4px_16px_0_rgba(255,255,255,0.2)] rounded-full overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-50"></div>
                <div className="relative flex-shrink-0 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center border border-white/40 shadow-inner"><span className="text-xl filter drop-shadow-sm">{blessing.type === 'santa' ? '🎅' : '🐾'}</span></div>
                <div className="flex flex-col relative"><span className="text-lg font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] tracking-wide leading-none">{blessing.text}</span><span className="text-[10px] font-bold text-blue-100 uppercase tracking-widest opacity-90 mt-0.5">{blessing.subtext}</span></div>
                <div className="absolute -right-2 -top-2 text-white/40 text-lg animate-pulse">❄️</div><div className="absolute -left-1 bottom-0 text-white/30 text-xs">✨</div>
            </div>
        </div>
      )}
      {showSuccessUI && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fade-in">
             <div className="absolute inset-0 overflow-hidden pointer-events-none">{[...Array(60)].map((_, i) => <div key={i} className="absolute text-white text-opacity-60 animate-fall" style={{ left: `${Math.random() * 100}%`, top: `-10%`, animationDuration: `${2.5 + Math.random() * 4}s`, animationDelay: `${Math.random() * 2}s`, fontSize: `${8 + Math.random() * 16}px` }}>❄</div>)}</div>
             
             {/* Main Frosted Card */}
             <div className="relative bg-white/10 backdrop-blur-xl border border-white/30 shadow-[0_0_50px_rgba(135,206,235,0.2)] p-10 rounded-[2.5rem] max-w-md w-full mx-4 text-center overflow-hidden transform scale-100 transition-all">
                 {/* Top Shine */}
                 <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
                 
                 <h2 className="relative text-5xl font-handwriting text-transparent bg-clip-text bg-gradient-to-br from-white to-blue-100 drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] mb-8 z-10">Wonderful!</h2>
                 
                 <div className="grid grid-cols-4 gap-4 mb-10 relative z-10">
                     {/* Winnie (Blue Cat - Geometric CSS) */}
                     <div className="flex flex-col items-center group cursor-default">
                         <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-slate-200 to-slate-400 shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),0_8px_16px_rgba(0,0,0,0.3)] flex items-center justify-center mb-2 transform group-hover:-translate-y-2 transition-transform duration-300 border border-white/40">
                             <div className="relative w-10 h-10 transform scale-110">
                                <div className="absolute top-0 left-1 w-3 h-3 bg-slate-400 rotate-45 rounded-sm" />
                                <div className="absolute top-0 right-1 w-3 h-3 bg-slate-400 rotate-45 rounded-sm" />
                                <div className="absolute inset-0 bg-slate-400 rounded-full shadow-inner" />
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-4 bg-white rounded-full opacity-90" />
                                <div className="absolute top-4 left-2 w-1.5 h-1.5 bg-yellow-400 rounded-full" />
                                <div className="absolute top-4 right-2 w-1.5 h-1.5 bg-yellow-400 rounded-full" />
                             </div>
                             <div className="absolute top-1 left-1/2 -translate-x-1/2 w-8 h-4 bg-white/40 rounded-full blur-[2px] pointer-events-none" />
                         </div>
                         <span className="text-xs font-bold text-blue-100 tracking-wide drop-shadow-md">Winnie</span>
                     </div>
                     {/* Lola (Ragdoll - Geometric CSS) */}
                     <div className="flex flex-col items-center group cursor-default">
                         <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-orange-100 to-stone-400 shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),0_8px_16px_rgba(0,0,0,0.3)] flex items-center justify-center mb-2 transform group-hover:-translate-y-2 transition-transform duration-300 border border-white/40">
                             <div className="relative w-10 h-10 transform scale-110">
                                <div className="absolute top-0 left-1 w-3 h-3 bg-[#5D4037] rotate-45 rounded-sm" />
                                <div className="absolute top-0 right-1 w-3 h-3 bg-[#5D4037] rotate-45 rounded-sm" />
                                <div className="absolute inset-0 bg-[#FAFAFA] rounded-full shadow-inner overflow-hidden">
                                   <div className="absolute top-2 left-1 w-5 h-6 bg-[#5D4037] rounded-full opacity-90 -rotate-12" />
                                </div>
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-3 bg-white rounded-full opacity-90" />
                                <div className="absolute top-4 left-2 w-1.5 h-1.5 bg-blue-400 rounded-full z-10" />
                                <div className="absolute top-4 right-2 w-1.5 h-1.5 bg-blue-400 rounded-full z-10" />
                             </div>
                             <div className="absolute top-1 left-1/2 -translate-x-1/2 w-8 h-4 bg-white/40 rounded-full blur-[2px] pointer-events-none" />
                         </div>
                         <span className="text-xs font-bold text-orange-100 tracking-wide drop-shadow-md">Lola</span>
                     </div>
                     {/* Wanwan (Black Cat - Geometric CSS) */}
                     <div className="flex flex-col items-center group cursor-default">
                         <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-gray-600 to-gray-900 shadow-[inset_0_2px_4px_rgba(255,255,255,0.2),0_8px_16px_rgba(0,0,0,0.4)] flex items-center justify-center mb-2 transform group-hover:-translate-y-2 transition-transform duration-300 border border-white/20">
                             <div className="relative w-10 h-10 transform scale-110">
                                <div className="absolute top-0 left-1 w-3 h-3 bg-gray-800 rotate-45 rounded-sm" />
                                <div className="absolute top-0 right-1 w-3 h-3 bg-gray-800 rotate-45 rounded-sm" />
                                <div className="absolute inset-0 bg-gray-800 rounded-full shadow-inner" />
                                <div className="absolute top-3 left-2 w-2.5 h-2.5 bg-yellow-400 rounded-full shadow-[0_0_2px_gold]" />
                                <div className="absolute top-3 right-2 w-2.5 h-2.5 bg-yellow-400 rounded-full shadow-[0_0_2px_gold]" />
                             </div>
                             <div className="absolute top-1 left-1/2 -translate-x-1/2 w-8 h-4 bg-white/10 rounded-full blur-[2px] pointer-events-none" />
                         </div>
                         <span className="text-xs font-bold text-gray-200 tracking-wide drop-shadow-md">Wanwan</span>
                     </div>
                     {/* Puppy (Teddy - Geometric CSS) */}
                     <div className="flex flex-col items-center group cursor-default">
                         <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-yellow-100 to-amber-300 shadow-[inset_0_2px_4px_rgba(255,255,255,0.4),0_8px_16px_rgba(0,0,0,0.3)] flex items-center justify-center mb-2 transform group-hover:-translate-y-2 transition-transform duration-300 border border-white/40">
                             <div className="relative w-10 h-10 transform scale-110">
                                <div className="absolute top-2 -left-1 w-4 h-5 bg-[#D7CCC8] rounded-full shadow-sm" />
                                <div className="absolute top-2 -right-1 w-4 h-5 bg-[#D7CCC8] rounded-full shadow-sm" />
                                <div className="absolute inset-0 bg-[#D7CCC8] rounded-full shadow-inner" />
                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-5 h-3 bg-[#D7CCC8] rounded-full" />
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-4 bg-[#D7CCC8] rounded-full mt-2">
                                    <div className="absolute top-1 left-1/2 -translate-x-1/2 w-2 h-1.5 bg-black rounded-full" />
                                </div>
                                <div className="absolute top-4 left-2.5 w-1.5 h-1.5 bg-black rounded-full" />
                                <div className="absolute top-4 right-2.5 w-1.5 h-1.5 bg-black rounded-full" />
                             </div>
                             <div className="absolute top-1 left-1/2 -translate-x-1/2 w-8 h-4 bg-white/40 rounded-full blur-[2px] pointer-events-none" />
                         </div>
                         <span className="text-xs font-bold text-yellow-100 tracking-wide drop-shadow-md">Puppy</span>
                     </div>
                 </div>
                 
                 <div className="mb-8 relative z-10">
                    <p className="text-xl font-bold text-white drop-shadow-md tracking-wide">All friends are safe!</p>
                    <p className="text-sm text-red-200 mt-2 font-semibold uppercase tracking-wider opacity-90">Incoming Christmas Magic...</p>
                 </div>
                 
                 <button onClick={openEnvelope} className="relative z-10 w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold py-4 px-6 rounded-2xl shadow-lg transform transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3 border-t border-white/20 group">
                    <span className="text-2xl group-hover:rotate-12 transition-transform">✉️</span>
                    <span className="tracking-wide">Open Christmas Letter</span>
                 </button>
             </div>
          </div>
      )}
      {!gameState.isPlaying && !gameState.isWon && gameState.score === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-20">
              <div className="text-center bg-white/95 p-10 rounded-3xl shadow-2xl max-w-sm mx-4 border-4 border-blue-100 animate-fade-in">
                  <h1 className="text-4xl font-black mb-2 text-blue-500 tracking-wider">SNOWY GLOBE</h1>
                  <p className="mb-8 text-gray-500 font-medium text-lg">WASD or Joysick to move.<br/>Rescue pets & follow the lights!</p>
                  <button onClick={() => setGameState(p => ({...p, isPlaying: true}))} className="bg-red-500 hover:bg-red-600 text-white font-bold py-4 px-12 rounded-full shadow-xl text-lg transition-transform hover:scale-105 active:scale-95">START</button>
              </div>
          </div>
      )}
      {gameState.envelopeOpen && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-30 p-4 backdrop-blur-md">
            <div className="bg-[#fffcf5] p-8 pb-12 rounded-sm shadow-2xl max-w-sm w-full relative animate-fade-in transform rotate-1" style={{ backgroundImage: 'linear-gradient(#e1e1e1 1px, transparent 1px)', backgroundSize: '100% 2em' }}>
                {/* Stamp */}
                <div className="absolute top-4 right-4 w-16 h-20 border-4 border-red-800 opacity-80 flex items-center justify-center rotate-6">
                    <div className="text-red-800 font-bold text-xs text-center leading-none">NORTH<br/>POLE<br/>POST</div>
                </div>
                
                <div className="text-center mt-6">
                    <h3 className="text-red-800 font-handwriting text-4xl mb-6 drop-shadow-sm">Merry Christmas</h3>
                    
                    {gameState.letterContent ? (
                         <div className="text-gray-800 font-chinese text-[14px] leading-loose text-left px-4 mb-8 min-h-[150px] whitespace-pre-wrap tracking-wide">
                            {gameState.letterContent}
                         </div>
                    ) : (
                        <div className="text-center py-12">
                             <div className="animate-spin text-4xl mb-4 text-red-300">❄️</div>
                             <p className="text-gray-400 font-handwriting text-xl">Writing magic...</p>
                        </div>
                    )}
                    
                    <button onClick={handleRestart} className="mt-4 bg-green-700 hover:bg-green-800 text-white font-bold py-3 px-8 rounded-full shadow-md text-lg transition-colors font-sans">
                        Play Again
                    </button>
                </div>
            </div>
        </div>
      )}
      
      {/* Credit Signature */}
      <div className="absolute bottom-4 right-6 z-10 pointer-events-none opacity-50 mix-blend-overlay">
          <span className="font-handwriting text-white text-2xl tracking-widest drop-shadow-lg transform -rotate-6 inline-block">By mimi</span>
      </div>

      <div className="absolute bottom-12 left-1/2 transform -translate-x-1/2 w-48 h-48 z-10" style={{ touchAction: 'none' }} onTouchStart={handleJoystickStart} onTouchMove={handleJoystickMove} onTouchEnd={handleJoystickEnd} onMouseDown={handleJoystickStart} onMouseMove={handleJoystickMove} onMouseUp={handleJoystickEnd} onMouseLeave={handleJoystickEnd}>
          <div className="absolute inset-4 rounded-full border border-white/20 bg-white/10 backdrop-blur-md shadow-lg flex items-center justify-center"><div className="absolute top-1/2 left-4 right-4 h-px bg-white/10"></div><div className="absolute left-1/2 top-4 bottom-4 w-px bg-white/10"></div></div>
          <div className="absolute w-16 h-16 rounded-full shadow-2xl bg-gradient-to-br from-white to-gray-200 border border-white flex items-center justify-center" style={{ top: '50%', left: '50%', marginLeft: -32, marginTop: -32, transform: `translate(${joystickState.kx}px, ${joystickState.ky}px)`, transition: joystickState.active ? 'none' : 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}><div className="w-8 h-8 rounded-full bg-gray-100/50 shadow-inner backdrop-blur-sm"></div></div>
          <div className={`absolute -bottom-12 left-1/2 transform -translate-x-1/2 transition-all duration-300 pointer-events-none ${joystickState.active ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}><div className="text-white/90 text-[10px] font-black tracking-[0.2em] drop-shadow-md animate-pulse whitespace-nowrap">WASD OR DRAG TO MOVE</div></div>
      </div>
    </div>
  );
};

export default GameCanvas;