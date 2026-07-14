import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { gsap } from 'gsap';
import { getArtifactVisualSpec, getVisualSpec } from './visualSpecs.js';

export class MuseumRenderer {
  constructor(canvasId, nodesData, onInteract) {
    this.canvas = document.getElementById(canvasId);
    this.nodesData = nodesData;
    this.onInteract = onInteract; // Callback when user clicks character or artifact

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.rooms = [];
    this.particles = [];
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    // Animation/Movement variables
    this.pathCurve = null;
    this.cameraProgress = 0; // 0 to 1
    this.targetProgress = 0;
    this.currentRoomIndex = 0;
    this.lookTarget = new THREE.Vector3();
    this.cameraRotation = { x: 0, y: 0 };
    this.isUserDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.dragRotationStart = { x: 0, y: 0 };
    
    // Interaction focus
    this.focusedObject = null;
    this.originalCameraPos = new THREE.Vector3();
    this.originalCameraLook = new THREE.Vector3();

    this.init();
  }

  init() {
    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2('#050508', 0.015);

    // 2. Camera setup
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
    
    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // 4. Lights
    const ambientLight = new THREE.AmbientLight('#ffffff', 0.05);
    this.scene.add(ambientLight);

    // 5. Generate Camera Path and Rooms
    this.createTimeCorridor();

    // 6. Event listeners
    window.addEventListener('resize', this.onWindowResize.bind(this));
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('click', this.onClick.bind(this));
    
    // Touch events for mobile
    this.canvas.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: true });
    this.canvas.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: true });
    this.canvas.addEventListener('touchend', this.onTouchEnd.bind(this));

    // 7. Start Render Loop
    this.animate();
  }

  createTimeCorridor() {
    const points = [];
    const roomSpacing = 50;

    // Generate spline points for a winding corridor
    for (let i = 0; i < this.nodesData.length; i++) {
      // Wind the path in a serpentine pattern
      const x = Math.sin(i * 0.8) * 15;
      const y = 0;
      const z = -i * roomSpacing;
      points.push(new THREE.Vector3(x, y + 2, z));
      
      // Build the room at this position
      this.createRoom(i, x, y, z);
    }

    // Create a smooth spline through the points
    this.pathCurve = new THREE.CatmullRomCurve3(points);
    
    // Initial camera position
    const startPoint = this.pathCurve.getPointAt(0);
    this.camera.position.copy(startPoint);
    this.lookTarget.copy(this.pathCurve.getPointAt(0.01));
    this.camera.lookAt(this.lookTarget);
  }

  // Room Builder (Procedural architecture, lighting, particles, exhibits)
  createRoom(index, rx, ry, rz) {
    const data = this.nodesData[index];
    const roomGroup = new THREE.Group();
    roomGroup.position.set(rx, ry, rz);
    roomGroup.userData = { nodeIndex: index };

    const roomWidth = 32;
    const roomLength = 40;
    const roomHeight = 16;

    // 1. Floor & Ceiling
    const floorGeo = new THREE.PlaneGeometry(roomWidth, roomLength);
    const floorMat = new THREE.MeshStandardMaterial({
      color: data.fogColor,
      roughness: 0.8,
      metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    roomGroup.add(floor);

    const ceilingGeo = new THREE.PlaneGeometry(roomWidth, roomLength);
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: '#111115',
      roughness: 0.9
    });
    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = roomHeight;
    roomGroup.add(ceiling);

    // 2. Walls (Left, Right, Front/Back columns to simulate continuous passage)
    const wallMat = new THREE.MeshStandardMaterial({
      color: '#0a0a0d',
      roughness: 0.9,
      metalness: 0.05
    });
    const wallGeo = new THREE.PlaneGeometry(roomLength, roomHeight);
    
    // Left Wall
    const leftWall = new THREE.Mesh(wallGeo, wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-roomWidth / 2, roomHeight / 2, 0);
    leftWall.receiveShadow = true;
    roomGroup.add(leftWall);

    // Right Wall
    const rightWall = new THREE.Mesh(wallGeo, wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(roomWidth / 2, roomHeight / 2, 0);
    rightWall.receiveShadow = true;
    roomGroup.add(rightWall);

    // 3. Calligraphy wall projection (Canvas Texture on wall)
    this.createWallCalligraphy(roomGroup, data.wallText, roomWidth, roomHeight);

    // 4. Colorful ambient spot lights matching the era's tone
    const roomLight = new THREE.PointLight(data.color, 1.5, 35);
    roomLight.position.set(0, roomHeight - 2, 0);
    roomGroup.add(roomLight);

    // 5. Spawning Characters (Floating Billboard Spirits)
    data.characters.forEach((char, charIdx) => {
      const { x: posX, y: posY, z: posZ } = this.getCharacterPlacement(index, charIdx);
      
      this.createCharacterSpirit(roomGroup, char, posX, posY, posZ, data.color, data);
    });

    // 6. Spawning Artifacts on Pedestals
    data.artifacts.forEach((art, artIdx) => {
      // Place artifact on the opposite side (e.g. right side of the room)
      const posX = 7 + (artIdx * 2);
      const posZ = -8 + (artIdx * 14);
      const posY = 0;
      
      this.createArtifactExhibit(roomGroup, art, posX, posY, posZ, data.color, data);
    });

    // 7. Local particle emitter
    this.createRoomParticles(roomGroup, data.particleType, data.color, roomWidth, roomHeight, roomLength);

    this.scene.add(roomGroup);
    this.rooms.push(roomGroup);
  }

  getCharacterPlacement(nodeIndex, charIdx) {
    if (nodeIndex === 25) {
      return {
        x: 3 + (charIdx * 1.2),
        y: 1.5,
        z: 8 + (charIdx * 2.5)
      };
    }

    const needsLeftTrack = [2, 3, 4, 5, 10, 11, 12, 13, 18, 19, 20, 21].includes(nodeIndex);

    if (needsLeftTrack) {
      return {
        x: -7.2 - (charIdx * 1.2),
        y: 1.45 + ((charIdx % 2) * 0.28),
        z: -9.5 + (charIdx * 8.5)
      };
    }

    return {
      x: -3.4 - (charIdx * 1.65),
      y: 1.5,
      z: -10 + (charIdx * 12)
    };
  }

  createWallCalligraphy(roomGroup, text, roomWidth, roomHeight) {
    if (!text) return;
    
    // Render text to canvas to create texture
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw calligraphy
    ctx.font = '28px "Ma Shan Zheng", cursive, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255, 255, 255, 0.1)';
    ctx.shadowBlur = 10;
    
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    
    const texture = new THREE.CanvasTexture(canvas);
    const textGeo = new THREE.PlaneGeometry(24, 6);
    const textMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    
    const textMesh = new THREE.Mesh(textGeo, textMat);
    // Project on the right wall
    textMesh.position.set(roomWidth / 2 - 0.1, roomHeight / 2 + 1, 0);
    textMesh.rotation.y = -Math.PI / 2;
    roomGroup.add(textMesh);
  }

  // Create Character Spirit as a floating glass slab with a period-specific portrait.
  createCharacterSpirit(roomGroup, char, x, y, z, themeColor, nodeData) {
    const spiritGroup = new THREE.Group();
    spiritGroup.position.set(x, y, z);
    spiritGroup.userData = { type: 'character', data: char };
    spiritGroup.visible = false;

    // Glass panel
    const panelGeo = new THREE.BoxGeometry(2.35, 3.65, 0.1);
    const panelMat = new THREE.MeshPhysicalMaterial({
      color: '#1a1a24',
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.9,
      thickness: 0.5,
      transparent: true,
      opacity: 0.85
    });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.castShadow = true;
    spiritGroup.add(panel);

    const decalGeo = new THREE.PlaneGeometry(2.16, 3.24);
    const decalMat = new THREE.MeshBasicMaterial({
      map: null,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide
    });
    const decal = new THREE.Mesh(decalGeo, decalMat);
    decal.position.z = 0.06;
    spiritGroup.add(decal);

    const charIndex = Math.max(0, (nodeData?.characters || []).findIndex((item) => item.name === char.name));
    const portraitKey = `character-${nodeData?.id ?? 0}-${charIndex}`;
    new THREE.TextureLoader().load(
      `./images/${portraitKey}.png`,
      (loadedTexture) => {
        loadedTexture.colorSpace = THREE.SRGBColorSpace;
        loadedTexture.anisotropy = Math.min(8, this.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
        decalMat.map = loadedTexture;
        decalMat.opacity = 1;
        decalMat.needsUpdate = true;
        spiritGroup.visible = true;
      },
      undefined,
      () => {}
    );

    // Add a soft glow point light underneath
    const glow = new THREE.PointLight(themeColor, 1.2, 8);
    glow.position.set(0, -1.5, 0);
    spiritGroup.add(glow);

    // Ambient floating animation using GSAP
    gsap.to(spiritGroup.position, {
      y: y + 0.3,
      duration: 3 + Math.random() * 2,
      yoyo: true,
      repeat: -1,
      ease: 'power1.inOut'
    });

    roomGroup.add(spiritGroup);
  }

  createCharacterPortraitTexture(char, visual, themeColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 768;
    const ctx = canvas.getContext('2d');
    const portrait = visual?.portrait || {};

    const bg = ctx.createLinearGradient(0, 0, 512, 768);
    bg.addColorStop(0, 'rgba(20, 20, 30, 0.82)');
    bg.addColorStop(1, 'rgba(5, 5, 10, 0.92)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 512, 768);

    ctx.strokeStyle = `${themeColor}88`;
    ctx.lineWidth = 5;
    ctx.strokeRect(28, 28, 456, 712);
    ctx.fillStyle = `${themeColor}22`;
    ctx.fillRect(44, 44, 424, 680);

    ctx.save();
    ctx.translate(256, 330);
    ctx.scale(2.25, 2.25);
    this.drawPortraitFigureOnCanvas(ctx, portrait, themeColor);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px "Ma Shan Zheng", "Noto Serif SC", serif';
    ctx.fillText(char.name, 256, 610);
    ctx.fillStyle = themeColor;
    ctx.font = '26px "Noto Serif SC", serif';
    ctx.fillText(char.role, 256, 660);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  drawPortraitFigureOnCanvas(ctx, portrait, themeColor) {
    const robe = portrait?.robe || '#5b4630';
    const face = portrait?.headwear === 'monk' ? '#cfa57e' : '#d9b089';

    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath();
    ctx.ellipse(0, 116, 74, 17, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = robe;
    ctx.beginPath();
    ctx.moveTo(-58, 122);
    ctx.quadraticCurveTo(-38, 20, 0, 6);
    ctx.quadraticCurveTo(38, 20, 58, 122);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-18, 28);
    ctx.lineTo(-28, 116);
    ctx.moveTo(18, 28);
    ctx.lineTo(28, 116);
    ctx.stroke();

    if (portrait?.mood?.includes('warrior') || portrait?.mood === 'soldier' || portrait?.mood === 'patriot') {
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 3;
      for (let i = -2; i <= 2; i++) ctx.strokeRect(-34 + i * 17, 44, 11, 18);
    }

    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.ellipse(0, -26, 32, 42, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(58, 36, 24, 0.82)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-14, -32);
    ctx.lineTo(-4, -31);
    ctx.moveTo(14, -32);
    ctx.lineTo(4, -31);
    ctx.moveTo(0, -22);
    ctx.lineTo(-4, -8);
    ctx.moveTo(-10, 5);
    ctx.quadraticCurveTo(0, 11, 12, 4);
    ctx.stroke();

    this.drawPortraitHeadwearOnCanvas(ctx, portrait?.headwear, themeColor);
    this.drawPortraitPropOnCanvas(ctx, portrait?.prop, themeColor);
  }

  drawPortraitHeadwearOnCanvas(ctx, headwear, themeColor) {
    ctx.save();
    ctx.fillStyle = '#171410';
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 2.5;

    switch (headwear) {
      case 'bronze-helm':
        ctx.fillStyle = '#455449';
        ctx.beginPath();
        ctx.moveTo(-32, -53);
        ctx.quadraticCurveTo(0, -84, 32, -53);
        ctx.lineTo(27, -28);
        ctx.lineTo(-27, -28);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -82);
        ctx.lineTo(0, -106);
        ctx.stroke();
        break;
      case 'helmet':
        ctx.fillStyle = '#3d3a35';
        ctx.beginPath();
        ctx.ellipse(0, -55, 37, 21, 0, Math.PI, 0);
        ctx.lineTo(32, -37);
        ctx.lineTo(-32, -37);
        ctx.closePath();
        ctx.fill();
        break;
      case 'monk':
        ctx.fillStyle = '#b88d62';
        ctx.beginPath();
        ctx.arc(0, -61, 29, Math.PI, 0);
        ctx.fill();
        break;
      case 'turban':
        ctx.fillStyle = '#f1d0a5';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.ellipse(-18 + i * 12, -58, 21, 8, -0.35, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'worker-cap':
      case 'workshop-cap':
        ctx.fillStyle = headwear === 'worker-cap' ? '#0f3d2e' : '#2e6f46';
        ctx.fillRect(-28, -64, 56, 15);
        ctx.beginPath();
        ctx.ellipse(16, -52, 26, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'student-cap':
        ctx.fillStyle = '#1b2429';
        ctx.fillRect(-28, -64, 56, 12);
        ctx.fillRect(-8, -76, 16, 15);
        break;
      case 'hairpin':
        ctx.fillStyle = '#16110f';
        ctx.beginPath();
        ctx.arc(0, -60, 33, Math.PI, 0);
        ctx.fill();
        ctx.strokeStyle = themeColor;
        ctx.beginPath();
        ctx.moveTo(-40, -64);
        ctx.lineTo(40, -72);
        ctx.stroke();
        break;
      case 'loose-hair':
      case 'short-hair':
      case 'visitor':
      default:
        if (headwear !== 'loose-hair' && headwear !== 'short-hair' && headwear !== 'visitor') {
          ctx.fillRect(-27, -65, 54, 15);
          ctx.fillRect(-11, -80, 22, 17);
        } else if (chromaKey === 'green') {
          for (let offset = 0; offset < data.length; offset += 4) {
            const red = data[offset];
            const green = data[offset + 1];
            const blue = data[offset + 2];
            const greenDominance = Math.max(0, green - Math.max(red, blue));
            const greenPurity = greenDominance / Math.max(green, 1);
            const screenStrength = THREE.MathUtils.smoothstep(greenPurity, 0.3, 0.84)
              * THREE.MathUtils.smoothstep(green, 26, 138);
            const retainedAlpha = 1 - screenStrength;

            data[offset + 3] = Math.round(data[offset + 3] * retainedAlpha);
            if (data[offset + 3] === 0) continue;

            const neutralGreen = (red + blue) * 0.5;
            const spillStrength = THREE.MathUtils.smoothstep(greenDominance, 2, 38);
            const correctedGreen = green - (green - neutralGreen) * spillStrength;
            const edgeDesaturation = THREE.MathUtils.smoothstep(screenStrength, 0.06, 0.72) * 0.82;
            const luminance = red * 0.299 + correctedGreen * 0.587 + blue * 0.114;

            data[offset] = Math.round(THREE.MathUtils.lerp(red, luminance, edgeDesaturation));
            data[offset + 1] = Math.round(THREE.MathUtils.lerp(correctedGreen, luminance, edgeDesaturation));
            data[offset + 2] = Math.round(THREE.MathUtils.lerp(blue, luminance, edgeDesaturation));
          }
        } else {
          ctx.beginPath();
          ctx.arc(0, -57, 32, Math.PI, 0);
          ctx.fill();
        }
        break;
    }

    ctx.restore();
  }

  drawPortraitPropOnCanvas(ctx, prop, themeColor) {
    ctx.save();
    ctx.strokeStyle = themeColor;
    ctx.fillStyle = themeColor;
    ctx.lineWidth = 4;

    switch (prop) {
      case 'torch':
        ctx.beginPath();
        ctx.moveTo(-52, 92);
        ctx.lineTo(-76, 2);
        ctx.stroke();
        ctx.fillStyle = '#ff8c00';
        ctx.beginPath();
        ctx.moveTo(-78, -28);
        ctx.bezierCurveTo(-52, -2, -62, 24, -78, 30);
        ctx.bezierCurveTo(-102, 12, -94, -10, -78, -28);
        ctx.fill();
        break;
      case 'jade':
        ctx.fillStyle = '#c2d4be';
        ctx.fillRect(-82, 36, 28, 40);
        ctx.clearRect(-72, 48, 8, 16);
        ctx.strokeRect(-82, 36, 28, 40);
        break;
      case 'axe':
      case 'spear':
        ctx.beginPath();
        ctx.moveTo(58, 112);
        ctx.lineTo(58, -66);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(58, -82);
        ctx.lineTo(88, -48);
        ctx.lineTo(58, -38);
        ctx.closePath();
        ctx.fill();
        break;
      case 'rope':
        ctx.beginPath();
        ctx.arc(-68, 58, 23, 0, Math.PI * 2);
        ctx.arc(-68, 58, 32, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'laptop':
        ctx.fillStyle = '#0f2235';
        ctx.fillRect(-88, 42, 58, 38);
        ctx.fillStyle = 'rgba(52,152,219,0.65)';
        ctx.fillRect(-82, 48, 46, 24);
        break;
      default:
        ctx.fillRect(-82, 54, 46, 34);
        ctx.strokeRect(-82, 54, 46, 34);
        break;
    }

    ctx.restore();
  }

  // Create Artifact Exhibit: Pedestal + Procedural 3D Model + Spot Light
  createArtifactExhibit(roomGroup, art, x, y, z, themeColor, nodeData) {
    const exhibitGroup = new THREE.Group();
    exhibitGroup.position.set(x, y, z);
    const visual = getVisualSpec(nodeData);
    
    // 1. Pedestal (Column)
    const pedGeo = new THREE.CylinderGeometry(1.2, 1.4, 2.2, 8);
    const pedMat = new THREE.MeshStandardMaterial({
      color: '#15151b',
      roughness: 0.7,
      metalness: 0.2
    });
    const pedestal = new THREE.Mesh(pedGeo, pedMat);
    pedestal.position.y = 1.1;
    pedestal.receiveShadow = true;
    pedestal.castShadow = true;
    exhibitGroup.add(pedestal);

    // 2. Procedural Artifact Mesh based on geometry config
    const artMesh = this.buildProceduralArtifact(art, visual);
    artMesh.position.y = 2.7; // resting on pedestal
    artMesh.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    artMesh.userData = { type: 'artifact', data: art };
    exhibitGroup.add(artMesh);

    // 3. Overhead Spot Light
    const spot = new THREE.SpotLight(themeColor, 8, 12, Math.PI / 6, 0.5, 1);
    spot.position.set(0, 8, 0);
    spot.target = pedestal;
    spot.castShadow = true;
    exhibitGroup.add(spot);

    roomGroup.add(exhibitGroup);
  }

  createArtifactMaterial(art, artifactVisual) {
    const props = { ...(art.materialProps || {}) };
    const texture = this.createArtifactDetailTexture(artifactVisual, props.color || '#d4af37');
    if (texture) {
      props.map = texture;
      props.bumpMap = texture;
      props.bumpScale = artifactVisual?.variant === 'qingming-scroll' ? 0.004 : 0.032;
      props.roughnessMap = texture;
    }
    props.side = THREE.DoubleSide;
    const material = new THREE.MeshStandardMaterial(props);

    const textureKey = artifactVisual?.textureKey || artifactVisual?.imageKey;
    if (textureKey) {
      let resolveTextureReady;
      material.userData.readyPromise = new Promise((resolve) => {
        resolveTextureReady = resolve;
      });
      const loader = new THREE.TextureLoader();
      loader.load(
        `./images/${textureKey}.png`,
        (loadedTexture) => {
          loadedTexture.colorSpace = THREE.SRGBColorSpace;
          loadedTexture.wrapS = THREE.RepeatWrapping;
          loadedTexture.wrapT = THREE.RepeatWrapping;
          const maxAnisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() || 1;
          loadedTexture.anisotropy = artifactVisual?.variant === 'qingming-scroll'
            ? maxAnisotropy
            : Math.min(8, maxAnisotropy);
          loadedTexture.minFilter = THREE.LinearMipmapLinearFilter;
          loadedTexture.magFilter = THREE.LinearFilter;
          material.map = loadedTexture;
          material.needsUpdate = true;
          resolveTextureReady();
        },
        undefined,
        () => {
          material.map = texture;
          material.needsUpdate = true;
          resolveTextureReady();
        }
      );
    } else {
      material.userData.readyPromise = Promise.resolve();
    }

    return material;
  }

  shouldDirectMapReferenceImage(variant = '') {
    return false;
  }

  getArtifactReferenceReliefProfile(variant = '') {
    const flatPage = { width: 2.12, height: 1.04, y: 0.36, z: 0.09, cutout: false, backing: true, bumpScale: 0.014, displacementScale: 0.006 };
    const profiles = {
      'jade-cong': { width: 1.22, height: 1.5, y: 0.2, z: 0.64, cutout: true, bumpScale: 0.038, displacementScale: 0.035 },
      'owl-zun': { width: 1.28, height: 1.68, y: 0.62, z: 0.82, cutout: true, bumpScale: 0.042, displacementScale: 0.035 },
      'bronze-ding': { width: 1.68, height: 1.36, y: 0.36, z: 0.88, cutout: true, bumpScale: 0.045, displacementScale: 0.032 },
      'bell-rack': { width: 2.45, height: 1.36, y: 0.52, z: 0.28, cutout: true, bumpScale: 0.034, displacementScale: 0.022 },
      'terracotta-warrior': { width: 1.04, height: 1.9, y: 0.55, z: 0.48, cutout: true, bumpScale: 0.036, displacementScale: 0.028 },
      'palace-lamp': { width: 1.46, height: 1.52, y: 0.62, z: 0.48, cutout: true, bumpScale: 0.032, displacementScale: 0.024 },
      'buddha-statue': { width: 1.28, height: 1.9, y: 0.64, z: 0.48, cutout: true, bumpScale: 0.042, displacementScale: 0.034 },
      'canal-tools': { width: 1.74, height: 1.12, y: 0.36, z: 0.34, cutout: true, bumpScale: 0.03, displacementScale: 0.022 },
      'sancai-camel': { width: 1.96, height: 1.38, y: 0.54, z: 0.5, cutout: true, bumpScale: 0.034, displacementScale: 0.024 },
      'ringed-staff': { width: 0.92, height: 2.16, y: 0.28, z: 0.18, cutout: true, bumpScale: 0.032, displacementScale: 0.02 },
      'ru-tripod': { width: 1.42, height: 1.2, y: 0.28, z: 0.72, cutout: true, bumpScale: 0.038, displacementScale: 0.03 },
      'crossbow': { width: 2.16, height: 0.92, y: 0.42, z: 0.24, cutout: true, bumpScale: 0.032, displacementScale: 0.018 },
      'blue-white-vase': { width: 1.24, height: 1.92, y: 0.66, z: 0.62, cutout: true, bumpScale: 0.03, displacementScale: 0.026 },
      'wartime-desk': { width: 1.86, height: 1.22, y: 0.42, z: 0.5, cutout: true, bumpScale: 0.03, displacementScale: 0.02 },
      'steering-cup': { width: 1.9, height: 1.12, y: 0.32, z: 0.42, cutout: true, bumpScale: 0.03, displacementScale: 0.02 },
      'cassette-ticket': { width: 1.96, height: 1.16, y: 0.34, z: 0.34, cutout: true, bumpScale: 0.026, displacementScale: 0.018 },
      'calligraphy-scroll': { ...flatPage, width: 2.08, height: 1.02 },
      'qingming-scroll': { ...flatPage, width: 2.36, height: 0.88 },
      'world-map-scroll': { ...flatPage, width: 2.24, height: 1.04 },
      'woodblock-book': { ...flatPage, width: 1.46, height: 1.06, y: 0.32, z: 0.12 },
      'archive-book': { ...flatPage, width: 1.62, height: 1.08, y: 0.36, z: 0.16 },
      'reform-book': { ...flatPage, width: 1.48, height: 1.04, y: 0.32, z: 0.14 },
      'magazine': { ...flatPage, width: 1.36, height: 1.62, y: 0.36, z: 0.14 },
      'smartphone': { ...flatPage, width: 0.96, height: 1.68, y: 0.02, z: 0.08, backing: false, bumpScale: 0.012, displacementScale: 0.004 },
      'tea-screen': { ...flatPage, width: 1.78, height: 1.12, y: 0.42, z: 0.12, backing: false, bumpScale: 0.016, displacementScale: 0.006 }
    };
    return profiles[variant] || null;
  }

  enhanceArtifactWithReferenceRelief(group, artifactVisual) {
    const variant = artifactVisual?.variant || '';
    if (!group || !artifactVisual?.imageKey || variant === 'painted-pottery') return group;

    const profile = this.getArtifactReferenceReliefProfile(variant);
    if (!profile) return group;

    const reliefGeometry = new THREE.PlaneGeometry(
      profile.width,
      profile.height,
      profile.cutout ? 54 : 28,
      profile.cutout ? 54 : 18
    );
    const reliefMaterial = this.createArtifactReferenceReliefMaterial(artifactVisual.imageKey, profile);
    const relief = new THREE.Mesh(reliefGeometry, reliefMaterial);
    relief.position.set(profile.x || 0, profile.y || 0, profile.z || 0.18);
    relief.renderOrder = 6;
    relief.castShadow = true;
    relief.receiveShadow = true;
    group.add(relief);

    if (profile.backing) {
      const backing = new THREE.Mesh(
        new THREE.BoxGeometry(profile.width * 1.015, profile.height * 1.015, 0.045),
        new THREE.MeshStandardMaterial({
          color: '#17120d',
          roughness: 0.82,
          metalness: 0.08,
          transparent: true,
          opacity: 0.68
        })
      );
      backing.position.set(profile.x || 0, profile.y || 0, (profile.z || 0.18) - 0.035);
      group.add(backing);
    }

    return group;
  }

  createArtifactReferenceReliefMaterial(imageKey, profile) {
    const material = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: profile.cutout ? 0.46 : 0.58,
      metalness: profile.cutout ? 0.08 : 0.02,
      transparent: true,
      opacity: 0.98,
      alphaTest: profile.cutout ? 0.08 : 0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });

    const image = new Image();
    image.onload = () => {
      const maxEdge = 1024;
      const scale = Math.min(maxEdge / image.naturalWidth, maxEdge / image.naturalHeight, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(32, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(32, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      if (profile.cutout) this.applyReferenceCutoutAlpha(ctx, canvas.width, canvas.height);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = Math.min(8, this.renderer?.capabilities?.getMaxAnisotropy?.() || 1);

      material.map = texture;
      material.bumpMap = texture;
      material.bumpScale = profile.bumpScale || 0.024;
      material.displacementMap = texture;
      material.displacementScale = profile.displacementScale || 0.012;
      material.needsUpdate = true;
    };
    image.src = `./images/${imageKey}.png`;

    return material;
  }

  applyReferenceCutoutAlpha(ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const sampleStep = Math.max(1, Math.floor(Math.min(width, height) / 80));
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let count = 0;

    const addSample = (x, y) => {
      const idx = (y * width + x) * 4;
      rSum += data[idx];
      gSum += data[idx + 1];
      bSum += data[idx + 2];
      count += 1;
    };

    for (let x = 0; x < width; x += sampleStep) {
      addSample(x, 0);
      addSample(x, height - 1);
    }
    for (let y = 0; y < height; y += sampleStep) {
      addSample(0, y);
      addSample(width - 1, y);
    }

    const bg = {
      r: rSum / Math.max(1, count),
      g: gSum / Math.max(1, count),
      b: bSum / Math.max(1, count)
    };
    const bgLuma = (bg.r + bg.g + bg.b) / 3;
    if (bgLuma > 112) {
      ctx.putImageData(imageData, 0, 0);
      return;
    }

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luma = (r + g + b) / 3;
      const distance = Math.hypot(r - bg.r, g - bg.g, b - bg.b);
      const isLikelyBackground = distance < 34 && luma < 92;
      const isSoftEdge = distance < 58 && luma < 112;

      if (isLikelyBackground) {
        data[i + 3] = 0;
      } else if (isSoftEdge) {
        data[i + 3] = Math.min(data[i + 3], Math.round((distance - 34) * 9));
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  createArtifactDetailTexture(artifactVisual, baseColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    const variant = artifactVisual?.variant || 'generic';

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 512, 512);

    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 80; i++) {
      const x = (i * 67) % 512;
      const y = (i * 131) % 512;
      ctx.fillRect(x, y, 2 + (i % 5), 1 + (i % 3));
    }
    ctx.globalAlpha = 1;

    if (variant.includes('bronze') || variant === 'owl-zun' || variant === 'bell-rack') {
      ctx.strokeStyle = 'rgba(12, 22, 16, 0.72)';
      ctx.fillStyle = 'rgba(12, 22, 16, 0.44)';
      ctx.lineWidth = 9;
      this.drawTextureTaotie(ctx, 256, 230, 1.35);
      ctx.strokeStyle = 'rgba(214, 175, 55, 0.48)';
      ctx.lineWidth = 5;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(62, 70 + i * 88);
        ctx.lineTo(450, 70 + i * 88);
        ctx.stroke();
      }
      this.drawTextureScript(ctx, 96, 84, 1.4, 'rgba(214, 175, 55, 0.58)');
    } else if (variant === 'painted-pottery') {
      ctx.fillStyle = 'rgba(60, 32, 18, 0.78)';
      this.drawTextureFishFace(ctx, 256, 250, 2.1);
    } else if (variant === 'jade-cong') {
      ctx.strokeStyle = 'rgba(28, 86, 56, 0.72)';
      ctx.lineWidth = 8;
      for (let i = 0; i < 4; i++) {
        ctx.strokeRect(72 + i * 20, 72 + i * 20, 368 - i * 40, 368 - i * 40);
      }
      this.drawTextureTaotie(ctx, 256, 256, 1.08);
    } else if (variant === 'blue-white-vase') {
      ctx.fillStyle = '#e8edf2';
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = '#174f9a';
      ctx.lineWidth = 8;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(86 + i * 84, 118, 32, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(56, 300);
      ctx.bezierCurveTo(150, 180, 278, 400, 452, 226);
      ctx.stroke();
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.arc(70 + i * 62, 384, 20, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (variant.includes('scroll') || variant.includes('book') || variant === 'magazine' || variant === 'reform-book') {
      ctx.fillStyle = '#eadbbf';
      ctx.fillRect(0, 0, 512, 512);
      if (!['qingming-scroll', 'world-map-scroll', 'woodblock-book', 'archive-book', 'reform-book', 'magazine'].includes(variant)) {
        ctx.strokeStyle = 'rgba(70, 42, 22, 0.55)';
        ctx.lineWidth = 5;
        ctx.strokeRect(42, 42, 428, 428);
      }

      if (variant === 'calligraphy-scroll') {
        ctx.strokeStyle = 'rgba(20, 18, 15, 0.82)';
        ctx.lineWidth = 9;
        const columns = [382, 324, 266, 208, 150, 92];
        columns.forEach((x, col) => {
          for (let i = 0; i < 5; i++) {
            const y = 96 + i * 64 + (col % 2) * 10;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(x - 26, y + 18, x + 18, y + 42, x - 10, y + 58);
            ctx.stroke();
          }
        });
        ctx.fillStyle = 'rgba(168, 32, 26, 0.82)';
        ctx.fillRect(76, 370, 42, 42);
      } else if (variant === 'qingming-scroll') {
        // The painting texture carries all visual detail. Keep this layer free
        // of drawn motifs so no obsolete bridge, shop or frame embossing appears.
      } else if (variant === 'world-map-scroll') {
        // The reference map supplies its own cartographic detail. Do not add
        // synthetic grids or frames that can remain as embossed artifacts.
      } else if (variant === 'woodblock-book') {
        // The cover photograph supplies the title and paper detail. Do not
        // emboss a generic woodcut frame or grid into either side of the book.
      } else if (variant === 'archive-book') {
        // The reference image supplies the silk cover and catalogue page.
        // Avoid generic boxes or a raised seal that can flash before loading.
      } else if (variant === 'reform-book') {
        // The reference scan supplies the text and binding. Do not add waves,
        // rectangular frames or grids to either side of the volume.
      } else if (variant === 'magazine') {
        // The restored cover supplies all typography and wear. Avoid generic
        // panels that can resemble a wooden shipping board during loading.
      } else {
        for (let i = 0; i < 11; i++) {
          ctx.beginPath();
          ctx.moveTo(82, 92 + i * 30);
          ctx.lineTo(430, 92 + i * 30);
          ctx.stroke();
        }
      }
    } else if (variant === 'ru-tripod') {
      for (let i = 0; i < 30; i++) {
        const x = (i * 83) % 512;
        const y = (i * 137) % 512;
        const radius = 22 + (i % 5) * 9;
        const glaze = ctx.createRadialGradient(x, y, 2, x, y, radius);
        glaze.addColorStop(0, 'rgba(232, 245, 241, 0.11)');
        glaze.addColorStop(1, 'rgba(92, 125, 116, 0)');
        ctx.fillStyle = glaze;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (variant === 'smartphone') {
      ctx.fillStyle = '#09131d';
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = '#3498db';
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          ctx.fillRect(86 + col * 84, 76 + row * 82, 42, 42);
        }
      }
    }

    this.applyArtifactSurfaceAging(ctx, variant);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, this.renderer?.capabilities?.getMaxAnisotropy?.() || 1);
    return texture;
  }

  applyArtifactSurfaceAging(ctx, variant) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 360; i++) {
      const x = (i * 83 + (i % 17) * 19) % 512;
      const y = (i * 149 + (i % 23) * 11) % 512;
      const alpha = 0.025 + (i % 5) * 0.006;
      ctx.fillStyle = `rgba(30, 24, 18, ${alpha})`;
      ctx.fillRect(x, y, 1 + (i % 4), 1 + (i % 3));
    }

    if (variant.includes('bronze') || variant === 'owl-zun' || variant === 'bell-rack') {
      this.drawVerdigrisPatina(ctx);
    } else if (variant === 'ru-tripod' || variant === 'blue-white-vase' || variant === 'sancai-camel' || variant === 'tea-screen') {
      const crackleColor = variant === 'blue-white-vase'
        ? 'rgba(20, 70, 120, 0.22)'
        : variant === 'ru-tripod'
          ? 'rgba(54, 77, 72, 0.34)'
          : 'rgba(245, 255, 250, 0.24)';
      this.drawGlazeCrackle(ctx, crackleColor);
    } else if (variant.includes('scroll') || variant.includes('book') || variant === 'magazine' || variant === 'reform-book') {
      this.drawPaperFibers(ctx);
    } else if (variant === 'crossbow' || variant === 'canal-tools' || variant === 'ringed-staff') {
      this.drawMetalWear(ctx);
    } else if (variant === 'wartime-desk' || variant === 'steering-cup' || variant === 'cassette-ticket') {
      this.drawHandledObjectWear(ctx);
    } else if (variant === 'smartphone') {
      this.drawGlassFingerprints(ctx);
    } else if (variant === 'painted-pottery' || variant === 'terracotta-warrior') {
      this.drawClayGrain(ctx);
    } else if (variant === 'jade-cong') {
      this.drawJadeClouding(ctx);
    } else if (variant === 'buddha-statue') {
      this.drawStonePitting(ctx);
    }

    ctx.restore();
  }

  drawVerdigrisPatina(ctx) {
    for (let i = 0; i < 34; i++) {
      const x = (i * 71) % 512;
      const y = (i * 113) % 512;
      const r = 18 + (i % 5) * 7;
      const grad = ctx.createRadialGradient(x, y, 2, x, y, r);
      grad.addColorStop(0, 'rgba(88, 145, 110, 0.5)');
      grad.addColorStop(1, 'rgba(10, 22, 18, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawGlazeCrackle(ctx, color = 'rgba(255,255,255,0.24)') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 52; i++) {
      const x = (i * 47) % 512;
      const y = (i * 91) % 512;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 18 + (i % 4) * 8, y + 10);
      ctx.lineTo(x + 10, y + 24 + (i % 5) * 6);
      ctx.stroke();
    }
  }

  drawPaperFibers(ctx) {
    ctx.strokeStyle = 'rgba(80, 56, 34, 0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 130; i++) {
      const y = (i * 37) % 512;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(160, y + (i % 9) - 4, 310, y - (i % 7), 512, y + (i % 5));
      ctx.stroke();
    }
  }

  drawMetalWear(ctx) {
    ctx.strokeStyle = 'rgba(235, 225, 190, 0.28)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 44; i++) {
      const x = (i * 59) % 512;
      const y = (i * 101) % 512;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 42, y + (i % 2 ? 8 : -8));
      ctx.stroke();
    }
  }

  drawHandledObjectWear(ctx) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 70; i++) {
      const x = (i * 43) % 512;
      const y = (i * 67) % 512;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 18, y + 5);
      ctx.stroke();
    }
  }

  drawGlassFingerprints(ctx) {
    ctx.strokeStyle = 'rgba(190, 220, 255, 0.16)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      const cx = 120 + i * 48;
      const cy = 142 + (i % 3) * 72;
      for (let r = 8; r < 34; r += 6) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * 0.72, r, 0.4, 0, Math.PI * 1.65);
        ctx.stroke();
      }
    }
  }

  drawClayGrain(ctx) {
    ctx.fillStyle = 'rgba(60, 32, 18, 0.16)';
    for (let i = 0; i < 180; i++) {
      ctx.beginPath();
      ctx.arc((i * 41) % 512, (i * 89) % 512, 1 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawJadeClouding(ctx) {
    for (let i = 0; i < 16; i++) {
      const x = (i * 97) % 512;
      const y = (i * 53) % 512;
      const grad = ctx.createRadialGradient(x, y, 4, x, y, 80);
      grad.addColorStop(0, 'rgba(236, 255, 230, 0.22)');
      grad.addColorStop(1, 'rgba(80, 120, 80, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - 80, y - 80, 160, 160);
    }
  }

  drawStonePitting(ctx) {
    ctx.fillStyle = 'rgba(30, 30, 28, 0.18)';
    for (let i = 0; i < 150; i++) {
      ctx.beginPath();
      ctx.arc((i * 73) % 512, (i * 109) % 512, 1 + (i % 4), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawTextureTaotie(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    for (let side = -1; side <= 1; side += 2) {
      ctx.beginPath();
      ctx.arc(side * 54, -12, 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(side * 54, -12, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(side * 22, 22);
      ctx.quadraticCurveTo(side * 62, 64, side * 104, 20);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(side * 24, -52);
      ctx.quadraticCurveTo(side * 68, -86, side * 112, -48);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, -34);
    ctx.lineTo(-22, 52);
    ctx.lineTo(22, 52);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawTextureFishFace(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-10, -4, 4, 0, Math.PI * 2);
    ctx.arc(10, -4, 4, 0, Math.PI * 2);
    ctx.stroke();
    for (let side = -1; side <= 1; side += 2) {
      ctx.beginPath();
      ctx.ellipse(side * 48, 2, 28, 12, side * 0.18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(side * 70, 2);
      ctx.lineTo(side * 90, -12);
      ctx.lineTo(side * 90, 16);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  drawTextureScript(ctx, x, y, scale = 1, color = 'rgba(45, 28, 16, 0.72)') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    for (let row = 0; row < 3; row++) {
      const yy = row * 78;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(24, yy + 22);
      ctx.lineTo(0, yy + 44);
      ctx.moveTo(24, yy + 22);
      ctx.lineTo(54, yy + 26);
      ctx.moveTo(10, yy + 60);
      ctx.lineTo(50, yy + 60);
      ctx.moveTo(30, yy + 60);
      ctx.lineTo(30, yy + 92);
    ctx.stroke();
    }
    ctx.restore();
  }

  createBeveledBox(width, height, depth, material, bevel = 0.025, segments = 5) {
    const r = Math.min(bevel, width / 2 - 0.001, height / 2 - 0.001);
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2 + r, -height / 2);
    shape.lineTo(width / 2 - r, -height / 2);
    shape.quadraticCurveTo(width / 2, -height / 2, width / 2, -height / 2 + r);
    shape.lineTo(width / 2, height / 2 - r);
    shape.quadraticCurveTo(width / 2, height / 2, width / 2 - r, height / 2);
    shape.lineTo(-width / 2 + r, height / 2);
    shape.quadraticCurveTo(-width / 2, height / 2, -width / 2, height / 2 - r);
    shape.lineTo(-width / 2, -height / 2 + r);
    shape.quadraticCurveTo(-width / 2, -height / 2, -width / 2 + r, -height / 2);

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSize: r,
      bevelThickness: r,
      bevelSegments: segments,
      curveSegments: 12
    });
    geometry.translate(0, 0, -depth / 2);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, material);
  }

  createLatheMesh(points, material, segments = 80) {
    const geometry = new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, material);
  }

  addFaceBar(group, x, y, z, width, height, material, depth = 0.018) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    bar.position.set(x, y, z);
    group.add(bar);
    return bar;
  }

  addFaceRect(group, x, y, z, width, height, material, thickness = 0.018, depth = 0.018) {
    this.addFaceBar(group, x, y + height / 2, z, width, thickness, material, depth);
    this.addFaceBar(group, x, y - height / 2, z, width, thickness, material, depth);
    this.addFaceBar(group, x - width / 2, y, z, thickness, height, material, depth);
    this.addFaceBar(group, x + width / 2, y, z, thickness, height, material, depth);
  }

  addFaceCircle(group, x, y, z, radius, material, tube = 0.012, scaleY = 1) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 40), material);
    ring.position.set(x, y, z);
    ring.scale.y = scaleY;
    group.add(ring);
    return ring;
  }

  addReliefStroke(group, points, material, radius = 0.014) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    const stroke = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, radius, 8, false), material);
    group.add(stroke);
    return stroke;
  }

  addShortInscription(group, originX, originY, z, material, scale = 1) {
    const strokes = [
      [[0, 0], [0.08, 0.05], [0.02, 0.12]],
      [[0.14, 0.02], [0.24, 0.02], [0.19, 0.11]],
      [[0.03, -0.12], [0.11, -0.06], [0.2, -0.12]],
      [[0.24, -0.1], [0.24, -0.22], [0.12, -0.22]]
    ];
    strokes.forEach((stroke, index) => {
      this.addReliefStroke(
        group,
        stroke.map(([x, y]) => [originX + x * scale, originY + y * scale - index * 0.055 * scale, z]),
        material,
        0.008 * scale
      );
    });
  }

  addTaotieFaceRelief(group, centerX, centerY, z, material, scale = 1) {
    this.addFaceCircle(group, centerX - 0.16 * scale, centerY + 0.03 * scale, z, 0.075 * scale, material, 0.01 * scale, 0.85);
    this.addFaceCircle(group, centerX + 0.16 * scale, centerY + 0.03 * scale, z, 0.075 * scale, material, 0.01 * scale, 0.85);
    this.addFaceCircle(group, centerX - 0.16 * scale, centerY + 0.03 * scale, z + 0.004, 0.025 * scale, material, 0.007 * scale, 1);
    this.addFaceCircle(group, centerX + 0.16 * scale, centerY + 0.03 * scale, z + 0.004, 0.025 * scale, material, 0.007 * scale, 1);
    this.addFaceBar(group, centerX, centerY - 0.06 * scale, z, 0.06 * scale, 0.16 * scale, material, 0.018 * scale);
    for (const side of [-1, 1]) {
      this.addReliefStroke(group, [
        [centerX + side * 0.08 * scale, centerY - 0.08 * scale, z],
        [centerX + side * 0.24 * scale, centerY - 0.16 * scale, z],
        [centerX + side * 0.34 * scale, centerY - 0.04 * scale, z]
      ], material, 0.011 * scale);
      this.addReliefStroke(group, [
        [centerX + side * 0.06 * scale, centerY + 0.15 * scale, z],
        [centerX + side * 0.2 * scale, centerY + 0.23 * scale, z],
        [centerX + side * 0.32 * scale, centerY + 0.14 * scale, z]
      ], material, 0.011 * scale);
    }
  }

  createOwlZunArtifact(mat) {
    const group = new THREE.Group();
    const createOwlSurfaceTexture = (isHeight = false) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = isHeight ? '#808080' : '#526158';
      ctx.fillRect(0, 0, 512, 512);

      for (let i = 0; i < 170; i++) {
        const x = (i * 79) % 512;
        const y = (i * 149) % 512;
        const radius = 1 + (i % 8);
        ctx.fillStyle = isHeight
          ? (i % 4 === 0 ? 'rgba(72,72,72,0.32)' : 'rgba(171,171,171,0.25)')
          : (i % 4 === 0 ? 'rgba(35,79,62,0.42)' : 'rgba(159,144,96,0.22)');
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = isHeight ? '#bcbcbc' : '#8e947b';
      ctx.lineWidth = isHeight ? 12 : 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const y of [82, 252, 422]) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y);
        ctx.stroke();
      }

      ctx.strokeStyle = isHeight ? '#a9a9a9' : '#7c8873';
      ctx.lineWidth = isHeight ? 10 : 7;
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 6; col++) {
          const x = 18 + col * 86;
          const y = 106 + row * 168;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 54, y);
          ctx.lineTo(x + 54, y + 54);
          ctx.lineTo(x + 12, y + 54);
          ctx.lineTo(x + 12, y + 18);
          ctx.lineTo(x + 40, y + 18);
          ctx.lineTo(x + 40, y + 40);
          ctx.lineTo(x + 26, y + 40);
          ctx.stroke();
        }
      }

      ctx.fillStyle = isHeight ? '#d1d1d1' : '#9b9d82';
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 8; col++) {
          ctx.beginPath();
          ctx.arc(22 + col * 66, 58 + row * 170, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2.2, 2.0);
      if (!isHeight) texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };

    const owlColor = createOwlSurfaceTexture(false);
    const owlHeight = createOwlSurfaceTexture(true);
    const bronzeMain = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: owlColor,
      bumpMap: owlHeight,
      displacementMap: owlHeight,
      displacementScale: 0.018,
      displacementBias: -0.009,
      roughness: 0.62,
      metalness: 0.76,
      bumpScale: 0.052,
      emissive: '#0e1712',
      emissiveIntensity: 0.1,
      side: THREE.DoubleSide
    });
    const bronzeDark = new THREE.MeshStandardMaterial({ color: '#293a32', roughness: 0.7, metalness: 0.78, side: THREE.DoubleSide });
    const bronzeRelief = new THREE.MeshStandardMaterial({ color: '#85917d', roughness: 0.56, metalness: 0.8 });
    const bronzeEdge = new THREE.MeshStandardMaterial({ color: '#3b5046', roughness: 0.66, metalness: 0.78 });

    const bodyProfileKeys = [
      [0.32, -0.42],
      [0.56, -0.24],
      [0.66, 0.18],
      [0.61, 0.58],
      [0.48, 0.84],
      [0.36, 0.98]
    ];
    const bodyProfile = [];
    for (let key = 0; key < bodyProfileKeys.length - 1; key++) {
      const [r0, y0] = bodyProfileKeys[key];
      const [r1, y1] = bodyProfileKeys[key + 1];
      for (let step = 0; step < 8; step++) {
        const t = step / 8;
        bodyProfile.push([THREE.MathUtils.lerp(r0, r1, t), THREE.MathUtils.lerp(y0, y1, t)]);
      }
    }
    bodyProfile.push(bodyProfileKeys[bodyProfileKeys.length - 1]);
    const body = this.createLatheMesh(bodyProfile, bronzeMain, 112);
    body.scale.set(0.92, 1, 0.72);
    body.position.y = 0.28;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.46, 48, 24), bronzeMain);
    head.scale.set(1.1, 0.86, 0.76);
    head.position.set(0, 1.18, 0.08);
    group.add(head);

    const neckBand = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.025, 12, 72), bronzeEdge);
    neckBand.scale.set(1.06, 0.72, 1);
    neckBand.rotation.x = Math.PI / 2;
    neckBand.position.set(0, 0.88, 0.04);
    group.add(neckBand);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 12, 80), bronzeDark);
    rim.scale.set(1.16, 0.72, 1);
    rim.position.y = 1.54;
    rim.rotation.x = Math.PI / 2;
    group.add(rim);

    for (let side = -1; side <= 1; side += 2) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 4), bronzeEdge);
      ear.scale.set(0.72, 1.0, 0.5);
      ear.position.set(side * 0.34, 1.58, 0.02);
      ear.rotation.z = side * -0.28;
      group.add(ear);

      const wing = new THREE.Mesh(new THREE.SphereGeometry(0.42, 64, 40), bronzeMain);
      wing.scale.set(0.62, 1.18, 0.38);
      wing.position.set(side * 0.57, 0.36, 0.08);
      wing.rotation.z = side * -0.12;
      group.add(wing);

      const eyePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.055, 64), bronzeRelief);
      eyePlate.rotation.x = Math.PI / 2;
      eyePlate.scale.x = 1.08;
      eyePlate.position.set(side * 0.2, 1.23, 0.43);
      group.add(eyePlate);

      const eyeRing = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.021, 12, 64), bronzeEdge);
      eyeRing.scale.x = 1.08;
      eyeRing.position.set(side * 0.2, 1.23, 0.466);
      group.add(eyeRing);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.047, 24, 16), bronzeDark);
      pupil.scale.z = 0.58;
      pupil.position.set(side * 0.2, 1.23, 0.49);
      group.add(pupil);

      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.115, 0.3, 32, 5), bronzeMain);
      leg.position.set(side * 0.22, -0.24, 0.16);
      group.add(leg);

      const legSocket = new THREE.Mesh(new THREE.SphereGeometry(0.13, 32, 20), bronzeMain);
      legSocket.scale.set(1.05, 0.52, 0.82);
      legSocket.position.set(side * 0.22, -0.1, 0.16);
      group.add(legSocket);

      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 20), bronzeMain);
      foot.scale.set(1.25, 0.42, 0.85);
      foot.position.set(side * 0.22, -0.4, 0.27);
      group.add(foot);

      for (let toe = -1; toe <= 1; toe++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 12), bronzeEdge);
        claw.rotation.x = Math.PI / 2;
        claw.rotation.z = toe * 0.16;
        claw.position.set(side * 0.22 + toe * 0.065, -0.4, 0.37);
        group.add(claw);
      }
    }

    const beakShape = new THREE.Shape();
    beakShape.moveTo(0, -0.12);
    beakShape.lineTo(-0.105, 0.08);
    beakShape.quadraticCurveTo(0, 0.12, 0.105, 0.08);
    beakShape.lineTo(0, -0.12);
    const beakGeo = new THREE.ExtrudeGeometry(beakShape, {
      depth: 0.055,
      bevelEnabled: true,
      bevelSize: 0.012,
      bevelThickness: 0.012,
      bevelSegments: 3,
      curveSegments: 10
    });
    beakGeo.translate(0, 0, -0.0275);
    beakGeo.computeVertexNormals();
    const beakTop = new THREE.Mesh(beakGeo, bronzeRelief);
    beakTop.position.set(0, 1.16, 0.485);
    group.add(beakTop);

    return group;
  }

  createOracleBoneTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#dfbd8c';
    ctx.fillRect(0, 0, 256, 512);
    ctx.strokeStyle = 'rgba(70, 38, 18, 0.82)';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(120, 42);
    ctx.lineTo(148, 190);
    ctx.lineTo(102, 328);
    ctx.lineTo(130, 470);
    ctx.stroke();
    this.drawTextureScript(ctx, 70, 72, 0.9, 'rgba(42, 24, 12, 0.82)');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  createPaintedPotteryArtifact(mat) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.46, 0.58, 36), mat);
    body.position.y = 0.18;
    group.add(body);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), mat);
    bowl.scale.y = 0.42;
    bowl.rotation.x = Math.PI;
    bowl.position.y = 0.48;
    group.add(bowl);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 36), mat);
    rim.position.y = 0.5;
    rim.rotation.x = Math.PI / 2;
    group.add(rim);
    return group;
  }

  createTerracottaWarriorArtifact(mat) {
    const group = new THREE.Group();
    const headMaterial = new THREE.MeshStandardMaterial({
      color: '#9b7657', roughness: 0.93, metalness: 0.01, side: THREE.DoubleSide
    });
    const armorMaterial = new THREE.MeshStandardMaterial({
      color: '#80634d', roughness: 0.94, metalness: 0.01, side: THREE.DoubleSide
    });
    const detailMaterial = new THREE.MeshStandardMaterial({
      color: '#765844', roughness: 0.95, metalness: 0.005
    });
    const hairMaterial = new THREE.MeshStandardMaterial({
      color: '#513c30', roughness: 0.96, metalness: 0.005
    });
    const plainClayMaterial = new THREE.MeshStandardMaterial({
      color: '#987357', roughness: 0.94, metalness: 0.005
    });

    const createTorsoGeometry = () => {
      const rings = [
        { y: 0.08, rx: 0.48, rz: 0.24 },
        { y: 0.18, rx: 0.57, rz: 0.29 },
        { y: 0.38, rx: 0.62, rz: 0.33 },
        { y: 0.6, rx: 0.65, rz: 0.35 },
        { y: 0.78, rx: 0.57, rz: 0.32 },
        { y: 0.9, rx: 0.4, rz: 0.27 },
        { y: 1.02, rx: 0.24, rz: 0.2 },
        { y: 1.09, rx: 0.2, rz: 0.17 }
      ];
      const segments = 128;
      const positions = [];
      const uvs = [];
      const indices = [];
      rings.forEach((ring, ringIndex) => {
        for (let segment = 0; segment <= segments; segment++) {
          const theta = (segment / segments) * Math.PI * 2;
          const shoulderSoftening = 1 - 0.025 * Math.cos(theta * 2);
          positions.push(
            Math.sin(theta) * ring.rx * shoulderSoftening,
            ring.y,
            Math.cos(theta) * ring.rz
          );
          uvs.push(segment / segments, ringIndex / (rings.length - 1));
        }
      });
      for (let ring = 0; ring < rings.length - 1; ring++) {
        for (let segment = 0; segment < segments; segment++) {
          const a = ring * (segments + 1) + segment;
          const b = a + segments + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      const bottomCenter = positions.length / 3;
      positions.push(0, rings[0].y, 0);
      uvs.push(0.5, 0);
      const topCenter = positions.length / 3;
      positions.push(0, rings[rings.length - 1].y, 0);
      uvs.push(0.5, 1);
      const topRingStart = (rings.length - 1) * (segments + 1);
      for (let segment = 0; segment < segments; segment++) {
        indices.push(bottomCenter, segment + 1, segment);
        indices.push(topCenter, topRingStart + segment, topRingStart + segment + 1);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return geometry;
    };

    const torso = new THREE.Mesh(createTorsoGeometry(), armorMaterial);
    torso.castShadow = true;
    torso.receiveShadow = true;
    group.add(torso);

    const headGeometry = new THREE.SphereGeometry(1, 128, 96);
    const headPositions = headGeometry.attributes.position;
    const headUvs = headGeometry.attributes.uv;
    for (let index = 0; index < headPositions.count; index++) {
      const unitX = headPositions.getX(index);
      const unitY = headPositions.getY(index);
      const unitZ = headPositions.getZ(index);
      const jaw = 0.82 + 0.18 * Math.max(0, 1 - Math.pow((unitY + 0.08) / 0.8, 2));
      let x = unitX * 0.245 * jaw;
      const y = unitY * 0.33 + 1.34;
      let z = unitZ * 0.22;
      const front = Math.max(0, unitZ);
      const nose = Math.exp(-Math.pow(x / 0.052, 2) - Math.pow((unitY - 0.03) / 0.16, 2));
      const brow = Math.exp(-Math.pow((unitY - 0.25) / 0.11, 2)) * Math.exp(-Math.pow(x / 0.2, 4));
      const chin = Math.exp(-Math.pow((unitY + 0.72) / 0.18, 2)) * Math.exp(-Math.pow(x / 0.15, 4));
      z += front * front * (nose * 0.062 + brow * 0.012 + chin * 0.018);
      if (unitY < -0.55) x *= 0.92;
      headPositions.setXYZ(index, x, y, z);
      const angle = Math.atan2(x, z);
      const u = ((angle / (Math.PI * 2)) + 1) % 1;
      headUvs.setXY(index, u, (unitY + 1) * 0.5);
    }
    headPositions.needsUpdate = true;
    headUvs.needsUpdate = true;
    headGeometry.computeVertexNormals();
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.castShadow = true;
    head.receiveShadow = true;
    group.add(head);

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.078, 36, 28), plainClayMaterial);
      ear.scale.set(0.34, 0.88, 0.5);
      ear.position.set(side * 0.235, 1.34, 0);
      ear.castShadow = true;
      group.add(ear);
    }

    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.145, 64, 40), hairMaterial);
    bun.scale.set(0.86, 0.78, 0.82);
    bun.position.set(-0.015, 1.71, -0.035);
    bun.castShadow = true;
    group.add(bun);
    const bunWrap = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.018, 14, 64), hairMaterial);
    bunWrap.rotation.x = Math.PI / 2;
    bunWrap.position.set(-0.015, 1.69, -0.035);
    group.add(bunWrap);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.052, 36, 24), hairMaterial);
    knot.scale.set(1.3, 0.72, 0.7);
    knot.position.set(0.09, 1.67, 0.015);
    group.add(knot);

    const addCollarRing = (height, radiusX, radiusZ, tubeRadius) => {
      const points = [];
      for (let i = 0; i < 48; i++) {
        const theta = (i / 48) * Math.PI * 2;
        points.push(new THREE.Vector3(
          Math.sin(theta) * radiusX,
          height - Math.max(0, Math.cos(theta)) * 0.018,
          Math.cos(theta) * radiusZ
        ));
      }
      const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.45);
      const band = new THREE.Mesh(new THREE.TubeGeometry(curve, 144, tubeRadius, 14, true), detailMaterial);
      band.castShadow = true;
      group.add(band);
    };
    addCollarRing(1.015, 0.255, 0.215, 0.026);
    addCollarRing(1.055, 0.232, 0.196, 0.024);
    addCollarRing(1.09, 0.21, 0.178, 0.022);

    const overlapCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.31, 0.86, 0.285),
      new THREE.Vector3(-0.18, 0.91, 0.315),
      new THREE.Vector3(-0.04, 0.96, 0.335),
      new THREE.Vector3(0.12, 1.02, 0.285),
      new THREE.Vector3(0.22, 1.075, 0.19)
    ]);
    const overlap = new THREE.Mesh(new THREE.TubeGeometry(overlapCurve, 96, 0.026, 14, false), detailMaterial);
    overlap.castShadow = true;
    group.add(overlap);

    let resolveWarriorReady;
    group.userData.readyPromise = new Promise((resolve) => {
      resolveWarriorReady = resolve;
    });
    const loader = new THREE.TextureLoader();
    loader.load('./images/artifact-terracotta-warrior-multiview.png', (sourceTexture) => {
      const source = sourceTexture.image;
      const tileWidth = source.width / 4;
      const tileHeight = source.height / 2;
      const sourceOrder = [0, 7, 6, 5, 4, 3, 2, 1];

      const createRingAtlas = (cropTop, cropHeight, stripFraction, baseColor) => {
        const canvas = document.createElement('canvas');
        canvas.width = 2048;
        canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const segmentWidth = canvas.width / 8;

        sourceOrder.forEach((sourceIndex, angleIndex) => {
          const tileColumn = sourceIndex % 4;
          const tileRow = Math.floor(sourceIndex / 4);
          const strip = document.createElement('canvas');
          strip.width = 320;
          strip.height = 1024;
          const stripContext = strip.getContext('2d');
          const sourceWidth = tileWidth * stripFraction;
          stripContext.drawImage(
            source,
            tileColumn * tileWidth + (tileWidth - sourceWidth) * 0.5,
            tileRow * tileHeight + tileHeight * cropTop,
            sourceWidth,
            tileHeight * cropHeight,
            0,
            0,
            strip.width,
            strip.height
          );
          const pixels = stripContext.getImageData(0, 0, strip.width, strip.height);
          for (let offset = 0; offset < pixels.data.length; offset += 4) {
            const pixel = offset / 4;
            const x = pixel % strip.width;
            const maxChannel = Math.max(pixels.data[offset], pixels.data[offset + 1], pixels.data[offset + 2]);
            const edge = Math.min(1, x / 56, (strip.width - 1 - x) / 56);
            const subject = Math.max(0, Math.min(1, (maxChannel - 30) / 30));
            pixels.data[offset + 3] = Math.round(255 * edge * subject);
          }
          stripContext.putImageData(pixels, 0, 0);
          const center = angleIndex * segmentWidth;
          const destination = center - strip.width / 2;
          ctx.drawImage(strip, destination, 0);
          ctx.drawImage(strip, destination + canvas.width, 0);
          ctx.drawImage(strip, destination - canvas.width, 0);
        });
        return canvas;
      };

      const createHeightTexture = (colorCanvas) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(colorCanvas, 0, 0, canvas.width, canvas.height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let offset = 0; offset < pixels.data.length; offset += 4) {
          const luminance = pixels.data[offset] * 0.2126 + pixels.data[offset + 1] * 0.7152 + pixels.data[offset + 2] * 0.0722;
          const value = Math.max(92, Math.min(166, 128 + (luminance - 112) * 0.25));
          pixels.data[offset] = value;
          pixels.data[offset + 1] = value;
          pixels.data[offset + 2] = value;
          pixels.data[offset + 3] = 255;
        }
        ctx.putImageData(pixels, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        return texture;
      };

      const headCanvas = createRingAtlas(0.015, 0.61, 0.34, '#9b7657');
      const armorCanvas = createRingAtlas(0.43, 0.55, 0.48, '#80634d');
      const headTexture = new THREE.CanvasTexture(headCanvas);
      headTexture.colorSpace = THREE.SRGBColorSpace;
      headTexture.wrapS = THREE.RepeatWrapping;
      headTexture.wrapT = THREE.ClampToEdgeWrapping;
      const armorTexture = new THREE.CanvasTexture(armorCanvas);
      armorTexture.colorSpace = THREE.SRGBColorSpace;
      armorTexture.wrapS = THREE.RepeatWrapping;
      armorTexture.wrapT = THREE.ClampToEdgeWrapping;

      headMaterial.map = headTexture;
      headMaterial.bumpMap = createHeightTexture(headCanvas);
      headMaterial.bumpScale = 0.026;
      headMaterial.needsUpdate = true;
      armorMaterial.map = armorTexture;
      armorMaterial.bumpMap = createHeightTexture(armorCanvas);
      armorMaterial.bumpScale = 0.04;
      armorMaterial.needsUpdate = true;
      detailMaterial.map = armorTexture;
      detailMaterial.bumpMap = armorMaterial.bumpMap;
      detailMaterial.bumpScale = 0.022;
      detailMaterial.needsUpdate = true;
      sourceTexture.dispose();
      resolveWarriorReady();
    }, undefined, () => resolveWarriorReady());
    return group;
  }

  createPalaceLampArtifact(mat) {
    const group = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color: '#d9ab55', roughness: 0.3, metalness: 0.86, map: mat.map });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 0.72, 16), gold);
    body.position.y = 0.36;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), gold);
    head.position.y = 0.86;
    group.add(head);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.62, 12), gold);
    arm.position.set(0.42, 0.62, 0);
    arm.rotation.z = Math.PI / 2;
    group.add(arm);
    const lampBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.16, 24), gold);
    lampBowl.position.set(0.82, 0.62, 0);
    group.add(lampBowl);
    const glow = new THREE.PointLight('#ffb347', 1.4, 4);
    glow.position.set(0.82, 0.82, 0);
    group.add(glow);
    return group;
  }

  createBuddhaArtifact(mat) {
    const group = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: '#6e6e66', roughness: 0.92, metalness: 0.0, map: mat.map });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.72, 0.18, 32), stone);
    base.position.y = 0.05;
    group.add(base);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 24, 16), stone);
    body.scale.set(1, 1.2, 0.72);
    body.position.y = 0.58;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), stone);
    head.position.y = 1.18;
    group.add(head);
    return group;
  }

  createCanalToolsArtifact(mat) {
    const group = new THREE.Group();
    const iron = new THREE.MeshStandardMaterial({ color: '#473b32', roughness: 0.82, metalness: 0.55, map: mat.map });
    const yoke = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.28, 12), iron);
    yoke.rotation.z = Math.PI / 2;
    yoke.position.y = 0.62;
    group.add(yoke);
    for (let side = -1; side <= 1; side += 2) {
      const rope = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 8, 24), iron);
      rope.position.set(side * 0.48, 0.42, 0);
      rope.rotation.x = Math.PI / 2;
      group.add(rope);
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 8, 24, Math.PI * 1.35), iron);
      hook.position.set(side * 0.44, 0.08, 0);
      hook.rotation.z = side * 0.6;
      group.add(hook);
    }
    return group;
  }

  createCrossbowArtifact(mat) {
    const group = new THREE.Group();
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = 512;
    textureCanvas.height = 512;
    const textureContext = textureCanvas.getContext('2d');
    textureContext.fillStyle = '#17130f';
    textureContext.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 320; i++) {
      const x = (i * 83 + (i % 13) * 17) % 512;
      const y = (i * 151 + (i % 19) * 11) % 512;
      const length = 8 + (i % 9) * 5;
      textureContext.strokeStyle = i % 4 === 0
        ? `rgba(174, 116, 69, ${0.08 + (i % 5) * 0.025})`
        : `rgba(239, 193, 128, ${0.035 + (i % 3) * 0.018})`;
      textureContext.lineWidth = 0.8 + (i % 3) * 0.55;
      textureContext.beginPath();
      textureContext.moveTo(x, y);
      textureContext.lineTo(x + length, y + ((i % 5) - 2) * 1.5);
      textureContext.stroke();
    }
    const lacquerTexture = new THREE.CanvasTexture(textureCanvas);
    lacquerTexture.colorSpace = THREE.SRGBColorSpace;
    lacquerTexture.wrapS = THREE.RepeatWrapping;
    lacquerTexture.wrapT = THREE.RepeatWrapping;
    lacquerTexture.repeat.set(2.8, 2.8);

    const lacqueredWood = new THREE.MeshPhysicalMaterial({
      color: '#d8cec2',
      map: lacquerTexture,
      bumpMap: lacquerTexture,
      bumpScale: 0.018,
      roughness: 0.62,
      metalness: 0.02,
      clearcoat: 0.16,
      clearcoatRoughness: 0.7
    });
    const iron = new THREE.MeshStandardMaterial({
      color: '#2c2925',
      roughness: 0.58,
      metalness: 0.72,
      bumpMap: mat?.bumpMap || null,
      bumpScale: 0.01
    });
    const cord = new THREE.MeshStandardMaterial({ color: '#74543a', roughness: 0.96, metalness: 0 });
    const darkInset = new THREE.MeshStandardMaterial({ color: '#080706', roughness: 0.9, metalness: 0.05 });

    const addRoundedBeam = (width, height, depth, x, y, z, material = lacqueredWood, radius = 0.035) => {
      const beam = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 4, radius), material);
      beam.position.set(x, y, z);
      beam.castShadow = true;
      beam.receiveShadow = true;
      group.add(beam);
      return beam;
    };
    const addCylinderBetween = (start, end, radius, material, radialSegments = 12) => {
      const delta = new THREE.Vector3().subVectors(end, start);
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, delta.length(), radialSegments),
        material
      );
      beam.position.copy(start).add(end).multiplyScalar(0.5);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
      beam.castShadow = true;
      group.add(beam);
      return beam;
    };

    // Lacquered stock, paired side rails and recessed bolt channel.
    addRoundedBeam(0.34, 1.82, 0.24, 0, -0.08, 0, lacqueredWood, 0.055);
    addRoundedBeam(0.12, 1.35, 0.17, -0.23, -0.03, 0.015, lacqueredWood, 0.035);
    addRoundedBeam(0.12, 1.35, 0.17, 0.23, -0.03, 0.015, lacqueredWood, 0.035);
    addRoundedBeam(0.1, 1.5, 0.035, 0, 0.02, 0.145, darkInset, 0.015);
    addRoundedBeam(0.5, 0.16, 0.3, 0, -0.985, -0.005, lacqueredWood, 0.055);
    addRoundedBeam(0.58, 0.14, 0.28, 0, 0.51, 0.01, lacqueredWood, 0.045);

    // Curved, thick bow limbs built as continuous 3D tubes.
    const leftBowCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.61, 0.01),
      new THREE.Vector3(-0.36, 0.58, 0.01),
      new THREE.Vector3(-0.72, 0.45, 0.01),
      new THREE.Vector3(-1.04, 0.19, 0.01)
    ]);
    const rightBowCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.61, 0.01),
      new THREE.Vector3(0.36, 0.58, 0.01),
      new THREE.Vector3(0.72, 0.45, 0.01),
      new THREE.Vector3(1.04, 0.19, 0.01)
    ]);
    for (const curve of [leftBowCurve, rightBowCurve]) {
      const limb = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.062, 12, false), lacqueredWood);
      limb.castShadow = true;
      limb.receiveShadow = true;
      group.add(limb);
    }
    addRoundedBeam(0.18, 0.16, 0.2, -1.04, 0.19, 0.01, lacqueredWood, 0.035);
    addRoundedBeam(0.18, 0.16, 0.2, 1.04, 0.19, 0.01, lacqueredWood, 0.035);

    // Bowstring converges on the central catch instead of cutting straight across.
    const catchPoint = new THREE.Vector3(0, -0.05, 0.16);
    addCylinderBetween(new THREE.Vector3(-1.04, 0.19, 0.09), catchPoint, 0.011, cord, 10);
    addCylinderBetween(new THREE.Vector3(1.04, 0.19, 0.09), catchPoint, 0.011, cord, 10);
    for (let i = 0; i < 7; i++) {
      const binding = new THREE.Mesh(new THREE.TorusGeometry(0.11 + i * 0.004, 0.009, 7, 24), cord);
      binding.position.set(0, 0.57 - i * 0.018, 0.015);
      binding.rotation.x = Math.PI / 2;
      group.add(binding);
    }

    // Trigger housing, catch wheel, pins and lower trigger lever.
    addRoundedBeam(0.54, 0.3, 0.31, 0, -0.16, 0.01, lacqueredWood, 0.045);
    addRoundedBeam(0.28, 0.17, 0.055, 0, -0.15, 0.18, darkInset, 0.018);
    const catchWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.34, 24), iron);
    catchWheel.position.set(0, -0.1, 0.02);
    catchWheel.rotation.x = Math.PI / 2;
    group.add(catchWheel);
    for (const x of [-0.25, 0.25]) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.36, 18), iron);
      pin.position.set(x, -0.16, 0.015);
      pin.rotation.x = Math.PI / 2;
      group.add(pin);
    }
    addRoundedBeam(0.11, 0.34, 0.1, 0, -0.55, -0.09, iron, 0.025).rotation.z = -0.12;
    addRoundedBeam(0.38, 0.1, 0.12, 0.02, -0.72, -0.09, lacqueredWood, 0.035);

    // Loaded bolt and a separate group of iron-tipped bolts shown beside the weapon.
    addCylinderBetween(new THREE.Vector3(0, -0.65, 0.19), new THREE.Vector3(0, 0.79, 0.19), 0.016, cord, 12);
    const loadedHead = new THREE.Mesh(new THREE.ConeGeometry(0.058, 0.18, 4), iron);
    loadedHead.position.set(0, 0.87, 0.19);
    loadedHead.rotation.y = Math.PI / 4;
    group.add(loadedHead);

    for (let i = 0; i < 4; i++) {
      const x = 0.58 + i * 0.1;
      const lowerY = -0.78 + i * 0.035;
      const upperY = 0.06 + i * 0.035;
      addCylinderBetween(new THREE.Vector3(x, lowerY, -0.08), new THREE.Vector3(x, upperY, -0.08), 0.013, iron, 10);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.16, 4), iron);
      head.position.set(x, upperY + 0.08, -0.08);
      head.rotation.y = Math.PI / 4;
      head.castShadow = true;
      group.add(head);
      for (let wrap = 0; wrap < 3; wrap++) {
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 14), cord);
        collar.position.set(x, lowerY + 0.13 + wrap * 0.025, -0.08);
        collar.rotation.x = Math.PI / 2;
        group.add(collar);
      }
    }

    group.rotation.z = -0.08;
    group.rotation.x = -0.08;
    return group;
  }

  createBlueWhiteVaseArtifact(mat) {
    const group = new THREE.Group();
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ece9df';
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 1500; i++) {
      const x = (i * 73 + (i % 19) * 31) % size;
      const y = (i * 137 + (i % 23) * 17) % size;
      ctx.fillStyle = `rgba(104, 85, 57, ${0.018 + (i % 5) * 0.006})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.7 + (i % 4) * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }

    const cobalt = '#174d91';
    ctx.strokeStyle = cobalt;
    ctx.fillStyle = cobalt;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const drawBand = (y, h, drawMotif) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y, size, h);
      ctx.clip();
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(0, y + 7);
      ctx.lineTo(size, y + 7);
      ctx.moveTo(0, y + h - 7);
      ctx.lineTo(size, y + h - 7);
      ctx.stroke();
      drawMotif(y, h);
      ctx.restore();
    };

    drawBand(18, 108, (y, h) => {
      for (let x = -30; x < size + 90; x += 120) {
        ctx.beginPath();
        ctx.moveTo(x, y + h * 0.7);
        ctx.bezierCurveTo(x + 28, y + h * 0.18, x + 67, y + h * 0.18, x + 94, y + h * 0.7);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x + 47, y + h * 0.5, 17, 27, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
    drawBand(132, 82, (y, h) => {
      for (let x = -20; x < size + 100; x += 104) {
        ctx.beginPath();
        ctx.moveTo(x, y + h * 0.68);
        ctx.quadraticCurveTo(x + 26, y + h * 0.2, x + 53, y + h * 0.58);
        ctx.quadraticCurveTo(x + 79, y + h * 0.92, x + 104, y + h * 0.34);
        ctx.stroke();
      }
    });

    ctx.save();
    ctx.translate(520, 455);
    ctx.lineWidth = 24;
    ctx.beginPath();
    ctx.moveTo(-360, -95);
    ctx.bezierCurveTo(-250, -230, -120, 70, 5, -45);
    ctx.bezierCurveTo(110, -145, 230, 85, 355, -75);
    ctx.stroke();
    ctx.lineWidth = 5;
    for (let i = -300; i <= 300; i += 34) {
      const yy = Math.sin(i * 0.025) * 48 - 32;
      ctx.beginPath();
      ctx.arc(i, yy, 16, 0.12, Math.PI - 0.12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i - 5, yy - 17);
      ctx.quadraticCurveTo(i + 5, yy - 47, i + 17, yy - 20);
      ctx.stroke();
    }
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.ellipse(-372, -104, 50, 38, -0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-390, -137);
    ctx.quadraticCurveTo(-430, -185, -410, -210);
    ctx.moveTo(-364, -140);
    ctx.quadraticCurveTo(-375, -190, -342, -212);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-392, -109, 6, 0, Math.PI * 2);
    ctx.fill();
    for (const [x, y, flip] of [[-135, 15, -1], [80, -74, 1], [268, 12, -1]]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 18 * flip, y + 55);
      ctx.lineTo(x + 48 * flip, y + 72);
      ctx.moveTo(x + 17 * flip, y + 54);
      ctx.lineTo(x + 5 * flip, y + 85);
      ctx.moveTo(x + 18 * flip, y + 55);
      ctx.lineTo(x + 34 * flip, y + 90);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(25, 78, 145, 0.78)';
    ctx.lineWidth = 7;
    for (let i = 0; i < 18; i++) {
      const x = 40 + (i * 137) % 930;
      const y = 270 + (i * 83) % 390;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 18, y - 28, x + 38, y + 24, x + 64, y - 4);
      ctx.stroke();
    }

    ctx.strokeStyle = cobalt;
    ctx.fillStyle = cobalt;
    drawBand(665, 190, (y, h) => {
      for (let x = 35; x < size + 120; x += 210) {
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(x - 55, y + h - 18);
        ctx.quadraticCurveTo(x, y + h * 0.38, x + 58, y + h - 18);
        ctx.stroke();
        for (let p = 0; p < 8; p++) {
          const a = p / 8 * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(x + Math.cos(a) * 25, y + 75 + Math.sin(a) * 22, 13, 27, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(x, y + 75, 15, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    drawBand(862, 142, (y) => {
      ctx.lineWidth = 8;
      for (let x = -70; x < size + 80; x += 92) {
        ctx.beginPath();
        ctx.arc(x, y + 62, 58, Math.PI, Math.PI * 2);
        ctx.arc(x + 46, y + 94, 42, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() || 8;

    const porcelain = new THREE.MeshPhysicalMaterial({
      color: '#f3f0e7', map: texture, roughness: 0.26, metalness: 0,
      clearcoat: 0.55, clearcoatRoughness: 0.24, side: THREE.DoubleSide
    });
    const profile = [
      [0.34, 0], [0.36, 0.035], [0.38, 0.09], [0.40, 0.18],
      [0.44, 0.34], [0.49, 0.58], [0.54, 0.84], [0.58, 1.08],
      [0.61, 1.30], [0.62, 1.48], [0.60, 1.62], [0.55, 1.76],
      [0.47, 1.87], [0.36, 1.94], [0.265, 2.00], [0.22, 2.10],
      [0.205, 2.27], [0.205, 2.43], [0.235, 2.47], [0.245, 2.52]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const vessel = new THREE.Mesh(new THREE.LatheGeometry(profile, 128), porcelain);
    vessel.castShadow = true;
    vessel.receiveShadow = true;
    group.add(vessel);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.018, 12, 96), porcelain);
    rim.position.y = 2.51;
    rim.rotation.x = Math.PI / 2;
    group.add(rim);
    const innerMat = new THREE.MeshPhysicalMaterial({ color: '#d9d4c8', roughness: 0.42, clearcoat: 0.18, side: THREE.DoubleSide });
    const innerNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.193, 0.193, 0.19, 96, 1, true), innerMat);
    innerNeck.position.y = 2.405;
    group.add(innerNeck);
    const innerDark = new THREE.Mesh(new THREE.CircleGeometry(0.192, 96), new THREE.MeshStandardMaterial({ color: '#35332f', roughness: 0.9 }));
    innerDark.position.y = 2.315;
    innerDark.rotation.x = -Math.PI / 2;
    group.add(innerDark);
    const foot = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.022, 10, 96), innerMat);
    foot.position.y = 0.026;
    foot.rotation.x = Math.PI / 2;
    group.add(foot);

    group.position.y = -1.26;
    return group;
  }

  createJadeCongArtifact(mat) {
    const group = new THREE.Group();
    const createSeamlessJadeTexture = (isHeight = false) => {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const imageData = ctx.createImageData(size, size);
      for (let y = 0; y < size; y++) {
        const v = y / (size - 1) * Math.PI * 2;
        for (let x = 0; x < size; x++) {
          const u = x / (size - 1) * Math.PI * 2;
          const broad = Math.sin(u * 2 + Math.sin(v)) * 0.52 + Math.cos(v * 3 - u) * 0.34;
          const fine = Math.sin(u * 7 + v * 5) * 0.16 + Math.cos(u * 11 - v * 9) * 0.09;
          const mineral = broad + fine;
          const index = (y * size + x) * 4;
          if (isHeight) {
            const value = Math.round(Math.max(102, Math.min(154, 128 + mineral * 18)));
            imageData.data[index] = value;
            imageData.data[index + 1] = value;
            imageData.data[index + 2] = value;
          } else {
            imageData.data[index] = Math.round(Math.max(102, Math.min(164, 133 + mineral * 18)));
            imageData.data[index + 1] = Math.round(Math.max(112, Math.min(174, 145 + mineral * 17)));
            imageData.data[index + 2] = Math.round(Math.max(94, Math.min(151, 121 + mineral * 14)));
          }
          imageData.data[index + 3] = 255;
        }
      }
      ctx.putImageData(imageData, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      if (!isHeight) texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };

    const sideColorMap = createSeamlessJadeTexture(false);
    const sideHeightMap = createSeamlessJadeTexture(true);
    const faceJade = new THREE.MeshPhysicalMaterial({
      color: '#aeb8a7',
      bumpMap: mat?.bumpMap,
      bumpScale: 0.012,
      roughness: 0.52,
      metalness: 0.05,
      clearcoat: 0.12,
      clearcoatRoughness: 0.68,
      transmission: 0.025,
      thickness: 0.7,
      side: THREE.DoubleSide
    });
    const sideJade = new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      map: sideColorMap,
      bumpMap: sideHeightMap,
      bumpScale: 0.018,
      roughness: 0.54,
      metalness: 0.03,
      clearcoat: 0.12,
      clearcoatRoughness: 0.68,
      side: THREE.DoubleSide
    });

    const half = 0.76;
    const radius = 0.085;
    const shape = new THREE.Shape();
    shape.moveTo(-half + radius, -half);
    shape.lineTo(half - radius, -half);
    shape.quadraticCurveTo(half, -half, half, -half + radius);
    shape.lineTo(half, half - radius);
    shape.quadraticCurveTo(half, half, half - radius, half);
    shape.lineTo(-half + radius, half);
    shape.quadraticCurveTo(-half, half, -half, half - radius);
    shape.lineTo(-half, -half + radius);
    shape.quadraticCurveTo(-half, -half, -half + radius, -half);

    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.285, 0, Math.PI * 2, true);
    shape.holes.push(hole);

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.38,
      steps: 1,
      bevelEnabled: true,
      bevelSize: 0.035,
      bevelThickness: 0.035,
      bevelSegments: 6,
      curveSegments: 64
    });
    geometry.translate(0, 0, -0.19);
    geometry.computeVertexNormals();

    const cong = new THREE.Mesh(geometry, [faceJade, sideJade]);
    cong.castShadow = true;
    cong.receiveShadow = true;
    group.add(cong);

    const alphaCanvas = document.createElement('canvas');
    alphaCanvas.width = 512;
    alphaCanvas.height = 512;
    const alphaCtx = alphaCanvas.getContext('2d');
    alphaCtx.fillStyle = '#ffffff';
    alphaCtx.fillRect(0, 0, 512, 512);
    alphaCtx.fillStyle = '#000000';
    alphaCtx.beginPath();
    alphaCtx.arc(256, 256, 101, 0, Math.PI * 2);
    alphaCtx.fill();
    const alphaMap = new THREE.CanvasTexture(alphaCanvas);

    const reliefMaterial = new THREE.MeshStandardMaterial({
      color: '#aeb8a7',
      roughness: 0.54,
      metalness: 0.03,
      alphaMap,
      alphaTest: 0.5,
      transparent: true,
      bumpScale: 0.058,
      displacementScale: 0.034,
      displacementBias: -0.017,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      side: THREE.DoubleSide
    });
    const reliefGeometry = new THREE.PlaneGeometry(1.47, 1.47, 144, 144);
    const frontRelief = new THREE.Mesh(reliefGeometry, reliefMaterial);
    frontRelief.position.z = 0.227;
    frontRelief.castShadow = true;
    frontRelief.receiveShadow = true;
    group.add(frontRelief);

    const backRelief = new THREE.Mesh(reliefGeometry, reliefMaterial);
    backRelief.position.z = -0.227;
    backRelief.rotation.y = Math.PI;
    backRelief.castShadow = true;
    backRelief.receiveShadow = true;
    group.add(backRelief);

    let resolveJadeReady;
    group.userData.readyPromise = new Promise((resolve) => {
      resolveJadeReady = resolve;
    });
    const loader = new THREE.TextureLoader();
    loader.load('./images/artifact-jade-cong.png', (sourceTexture) => {
      const source = sourceTexture.image;
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = 1024;
      cropCanvas.height = 1024;
      const cropCtx = cropCanvas.getContext('2d');
      const cropX = source.width * 0.067;
      const cropY = source.height * 0.055;
      const cropSize = Math.min(source.width * 0.873, source.height * 0.873);
      cropCtx.drawImage(source, cropX, cropY, cropSize, cropSize, 0, 0, 1024, 1024);

      const colorTexture = new THREE.CanvasTexture(cropCanvas);
      colorTexture.colorSpace = THREE.SRGBColorSpace;
      colorTexture.anisotropy = Math.min(8, this.renderer?.capabilities?.getMaxAnisotropy?.() || 1);

      const heightCanvas = document.createElement('canvas');
      heightCanvas.width = 512;
      heightCanvas.height = 512;
      const heightCtx = heightCanvas.getContext('2d');
      heightCtx.drawImage(cropCanvas, 0, 0, 512, 512);
      const imageData = heightCtx.getImageData(0, 0, 512, 512);
      const pixels = imageData.data;
      for (let i = 0; i < pixels.length; i += 4) {
        const luminance = pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
        const height = Math.max(74, Math.min(188, 128 + (luminance - 138) * 0.5));
        pixels[i] = height;
        pixels[i + 1] = height;
        pixels[i + 2] = height;
        pixels[i + 3] = 255;
      }
      heightCtx.putImageData(imageData, 0, 0);
      const heightTexture = new THREE.CanvasTexture(heightCanvas);

      reliefMaterial.map = colorTexture;
      reliefMaterial.bumpMap = heightTexture;
      reliefMaterial.displacementMap = heightTexture;
      reliefMaterial.needsUpdate = true;
      sourceTexture.dispose();
      resolveJadeReady();
    }, undefined, () => resolveJadeReady());

    return group;
  }

  createBronzeDingSurfaceTextures() {
    const drawSurface = (ctx, isBump) => {
      ctx.fillStyle = isBump ? '#8d8d8d' : '#647168';
      ctx.fillRect(0, 0, 1024, 512);

      for (let i = 0; i < 180; i++) {
        const x = (i * 83) % 1024;
        const y = (i * 137) % 512;
        const radius = 2 + (i % 7);
        ctx.fillStyle = isBump
          ? (i % 3 === 0 ? 'rgba(98,98,98,0.45)' : 'rgba(164,164,164,0.3)')
          : (i % 3 === 0 ? 'rgba(57,92,77,0.38)' : 'rgba(147,137,100,0.2)');
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = isBump ? '#505050' : '#263a31';
      ctx.fillStyle = isBump ? '#555555' : '#30443a';
      ctx.lineWidth = isBump ? 11 : 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let panel = 0; panel < 4; panel++) {
        const centerX = 128 + panel * 256;
        this.drawTextureTaotie(ctx, centerX, 300, 0.72);
        ctx.strokeRect(centerX - 112, 205, 224, 188);
      }

      ctx.lineWidth = isBump ? 9 : 6;
      ctx.beginPath();
      ctx.moveTo(0, 112);
      ctx.lineTo(1024, 112);
      ctx.moveTo(0, 184);
      ctx.lineTo(1024, 184);
      ctx.stroke();

      for (let x = -18; x < 1042; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 126);
        ctx.lineTo(x + 42, 126);
        ctx.lineTo(x + 42, 168);
        ctx.lineTo(x + 14, 168);
        ctx.lineTo(x + 14, 146);
        ctx.lineTo(x + 30, 146);
        ctx.stroke();
      }

      ctx.lineWidth = isBump ? 7 : 5;
      for (let x = 12; x < 1024; x += 46) {
        ctx.beginPath();
        ctx.moveTo(x, 420);
        ctx.lineTo(x + 18, 438);
        ctx.lineTo(x + 4, 456);
        ctx.lineTo(x + 26, 474);
        ctx.stroke();
      }
    };

    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = 1024;
    colorCanvas.height = 512;
    drawSurface(colorCanvas.getContext('2d'), false);
    const colorMap = new THREE.CanvasTexture(colorCanvas);
    colorMap.colorSpace = THREE.SRGBColorSpace;
    colorMap.wrapS = THREE.RepeatWrapping;
    colorMap.wrapT = THREE.ClampToEdgeWrapping;

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = 1024;
    bumpCanvas.height = 512;
    drawSurface(bumpCanvas.getContext('2d'), true);
    const bumpMap = new THREE.CanvasTexture(bumpCanvas);
    bumpMap.wrapS = THREE.RepeatWrapping;
    bumpMap.wrapT = THREE.ClampToEdgeWrapping;

    return { colorMap, bumpMap };
  }

  createBronzeDingArtifact(mat) {
    const group = new THREE.Group();
    const surfaceTextures = this.createBronzeDingSurfaceTextures();
    const bronze = new THREE.MeshStandardMaterial({
      color: '#687469',
      roughness: 0.58,
      metalness: 0.8,
      bumpMap: mat?.bumpMap,
      bumpScale: 0.028,
      emissive: '#111813',
      emissiveIntensity: 0.16,
      side: THREE.DoubleSide
    });
    const bronzeDark = new THREE.MeshStandardMaterial({ color: '#344039', roughness: 0.7, metalness: 0.76, side: THREE.DoubleSide });
    const bronzeRelief = new THREE.MeshStandardMaterial({ color: '#9aa187', roughness: 0.56, metalness: 0.82, emissive: '#16180f', emissiveIntensity: 0.1 });
    const bodyBronze = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: surfaceTextures.colorMap,
      bumpMap: surfaceTextures.bumpMap,
      bumpScale: 0.052,
      roughness: 0.63,
      metalness: 0.76,
      emissive: '#101712',
      emissiveIntensity: 0.12,
      side: THREE.DoubleSide
    });

    const body = this.createLatheMesh([
      [0.43, 0.0],
      [0.56, 0.08],
      [0.69, 0.28],
      [0.76, 0.55],
      [0.77, 0.82],
      [0.75, 1.0],
      [0.71, 1.1]
    ], bodyBronze, 112);
    body.scale.set(1.08, 1, 0.82);
    body.position.y = 0.13;
    group.add(body);

    const mouthShadow = new THREE.Mesh(new THREE.CylinderGeometry(0.73, 0.69, 0.055, 112), bronzeDark);
    mouthShadow.scale.set(1.08, 1, 0.82);
    mouthShadow.position.y = 1.245;
    group.add(mouthShadow);

    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.735, 0.052, 16, 112), bronzeRelief);
    mouth.scale.set(1.08, 0.82, 1);
    mouth.rotation.x = Math.PI / 2;
    mouth.position.y = 1.27;
    group.add(mouth);

    const lowerBand = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.016, 10, 96), bronzeRelief);
    lowerBand.scale.set(1.08, 0.82, 1);
    lowerBand.rotation.x = Math.PI / 2;
    lowerBand.position.y = 0.5;
    group.add(lowerBand);

    const upperBand = new THREE.Mesh(new THREE.TorusGeometry(0.742, 0.022, 10, 96), bronzeRelief);
    upperBand.scale.set(1.08, 0.82, 1);
    upperBand.rotation.x = Math.PI / 2;
    upperBand.position.y = 0.98;
    group.add(upperBand);

    const legPositions = [
      [-0.49, -0.12],
      [0.49, -0.12],
      [0, 0.34]
    ];
    legPositions.forEach(([x, z], index) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.155, 0.68, 32), bronze);
      leg.position.set(x, -0.18, z);
      leg.rotation.z = x * -0.08;
      leg.rotation.x = index === 2 ? -0.03 : 0.025;
      group.add(leg);

      const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.13, 0.18, 32), bronze);
      shoulder.position.set(x, 0.17, z);
      shoulder.rotation.z = leg.rotation.z;
      shoulder.rotation.x = leg.rotation.x;
      group.add(shoulder);

      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.155, 0.085, 32), bronzeDark);
      foot.position.set(x, -0.555, z);
      foot.rotation.z = leg.rotation.z;
      foot.rotation.x = leg.rotation.x;
      group.add(foot);

      const legBand = new THREE.Mesh(new THREE.TorusGeometry(0.137, 0.009, 8, 40), bronzeRelief);
      legBand.position.set(x, -0.02, z);
      legBand.rotation.x = Math.PI / 2;
      group.add(legBand);

    });

    for (let side = -1; side <= 1; side += 2) {
      const ear = new THREE.Group();
      const outerX = side * 0.68;
      const earPostA = this.createBeveledBox(0.085, 0.46, 0.16, bronze, 0.025, 5);
      earPostA.position.set(outerX - side * 0.105, 1.49, 0);
      earPostA.rotation.z = side * -0.055;
      ear.add(earPostA);
      const earPostB = this.createBeveledBox(0.085, 0.46, 0.16, bronze, 0.025, 5);
      earPostB.position.set(outerX + side * 0.105, 1.49, 0);
      earPostB.rotation.z = side * 0.055;
      ear.add(earPostB);
      const earTop = this.createBeveledBox(0.27, 0.09, 0.16, bronze, 0.025, 5);
      earTop.position.set(outerX, 1.71, 0);
      ear.add(earTop);
      const earRoot = this.createBeveledBox(0.29, 0.11, 0.19, bronzeRelief, 0.025, 5);
      earRoot.position.set(outerX, 1.27, 0);
      ear.add(earRoot);
      this.addFaceRect(ear, outerX, 1.5, 0.091, 0.18, 0.28, bronzeRelief, 0.014, 0.016);
      group.add(ear);
    }

    return group;
  }

  createBellRackArtifact(mat) {
    const group = new THREE.Group();
    const createBellSurfaceTexture = (isHeight = false) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = isHeight ? '#808080' : '#536057';
      ctx.fillRect(0, 0, 512, 512);

      for (let i = 0; i < 110; i++) {
        const x = (i * 71) % 512;
        const y = (i * 127) % 512;
        const r = 1 + (i % 6);
        ctx.fillStyle = isHeight
          ? (i % 3 ? 'rgba(154,154,154,0.28)' : 'rgba(82,82,82,0.3)')
          : (i % 3 ? 'rgba(137,143,111,0.22)' : 'rgba(37,70,57,0.34)');
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = isHeight ? '#b8b8b8' : '#92977f';
      ctx.lineWidth = 12;
      for (const y of [78, 226, 390]) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(512, y);
        ctx.stroke();
      }

      ctx.strokeStyle = isHeight ? '#505050' : '#2d3d35';
      ctx.lineWidth = 7;
      for (let x = -24; x < 536; x += 72) {
        ctx.beginPath();
        ctx.moveTo(x, 104);
        ctx.lineTo(x + 44, 104);
        ctx.lineTo(x + 44, 154);
        ctx.lineTo(x + 12, 154);
        ctx.lineTo(x + 12, 128);
        ctx.lineTo(x + 31, 128);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 8, 302);
        ctx.lineTo(x + 54, 302);
        ctx.lineTo(x + 54, 354);
        ctx.lineTo(x + 22, 354);
        ctx.lineTo(x + 22, 328);
        ctx.lineTo(x + 42, 328);
        ctx.stroke();
      }

      ctx.fillStyle = isHeight ? '#d6d6d6' : '#9b9d82';
      for (const y of [178, 270]) {
        for (let x = 24; x < 512; x += 48) {
          ctx.beginPath();
          ctx.arc(x, y, 10, 0, Math.PI * 2);
          ctx.fill();
          if (!isHeight) {
            ctx.fillStyle = '#647267';
            ctx.beginPath();
            ctx.arc(x - 3, y + 3, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#9b9d82';
          }
        }
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      if (!isHeight) texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };

    const createFrameTexture = (isHeight = false) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = isHeight ? '#777777' : '#24130f';
      ctx.fillRect(0, 0, 512, 256);
      for (let x = 12; x < 512; x += 82) {
        ctx.fillStyle = isHeight ? '#969696' : '#65231d';
        ctx.fillRect(x, 28, 66, 200);
        ctx.strokeStyle = isHeight ? '#b8b8b8' : '#9d7c42';
        ctx.lineWidth = isHeight ? 8 : 5;
        ctx.strokeRect(x + 7, 38, 52, 180);
        ctx.beginPath();
        ctx.moveTo(x + 15, 68);
        ctx.lineTo(x + 48, 68);
        ctx.lineTo(x + 48, 112);
        ctx.lineTo(x + 26, 112);
        ctx.lineTo(x + 26, 92);
        ctx.lineTo(x + 40, 92);
        ctx.stroke();
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2, 1);
      if (!isHeight) texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };

    const frameColor = createFrameTexture(false);
    const frameHeight = createFrameTexture(true);
    const bellColor = createBellSurfaceTexture(false);
    const bellHeight = createBellSurfaceTexture(true);
    const lacquer = new THREE.MeshStandardMaterial({ color: '#ffffff', map: frameColor, bumpMap: frameHeight, bumpScale: 0.022, roughness: 0.6, metalness: 0.2 });
    const cinnabar = lacquer;
    const bronze = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: bellColor,
      bumpMap: bellHeight,
      displacementMap: bellHeight,
      bumpScale: 0.048,
      displacementScale: 0.014,
      displacementBias: -0.007,
      roughness: 0.58,
      metalness: 0.76,
      emissive: '#101511',
      emissiveIntensity: 0.1,
      side: THREE.DoubleSide
    });
    const bronzeDark = new THREE.MeshStandardMaterial({ color: '#313a35', roughness: 0.68, metalness: 0.74 });
    const bronzeRelief = new THREE.MeshStandardMaterial({ color: '#92977e', roughness: 0.52, metalness: 0.82 });

    const beamLevels = [1.42, 0.79, 0.14];
    beamLevels.forEach((y, row) => {
      const width = row === 2 ? 2.2 : 2.58;
      const beam = this.createBeveledBox(width, 0.13, 0.15, row === 1 ? cinnabar : lacquer, 0.025, 4);
      beam.position.set(0, y, 0);
      group.add(beam);
    });

    for (const side of [-1, 1]) {
      const post = this.createBeveledBox(0.15, 1.82, 0.17, lacquer, 0.03, 5);
      post.position.set(side * 1.31, 0.64, 0);
      group.add(post);
      const cap = this.createBeveledBox(0.31, 0.17, 0.2, cinnabar, 0.035, 5);
      cap.position.set(side * 1.31, 1.54, 0);
      group.add(cap);
      const foot = this.createBeveledBox(0.4, 0.16, 0.42, lacquer, 0.04, 5);
      foot.position.set(side * 1.31, -0.28, 0.02);
      group.add(foot);
      const beast = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 16), bronzeDark);
      beast.scale.set(1.2, 0.86, 0.8);
      beast.position.set(side * 1.31, -0.16, 0.13);
      group.add(beast);
    }

    const createBell = (scale, x, y) => {
      const bellGroup = new THREE.Group();
      const profile = [];
      const profileKeys = [
        [0.12, 0.28],
        [0.19, 0.2],
        [0.22, 0.02],
        [0.25, -0.22],
        [0.285, -0.34]
      ];
      for (let key = 0; key < profileKeys.length - 1; key++) {
        const [r0, y0] = profileKeys[key];
        const [r1, y1] = profileKeys[key + 1];
        for (let step = 0; step < 7; step++) {
          const t = step / 7;
          profile.push([THREE.MathUtils.lerp(r0, r1, t), THREE.MathUtils.lerp(y0, y1, t)]);
        }
      }
      profile.push(profileKeys[profileKeys.length - 1]);
      const bellBody = this.createLatheMesh(profile, bronze, 72);
      bellBody.scale.set(0.82, 1, 0.58);
      bellGroup.add(bellBody);

      const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.282, 0.018, 10, 56), bronzeDark);
      mouth.scale.set(0.82, 0.58, 1);
      mouth.rotation.x = Math.PI / 2;
      mouth.position.y = -0.34;
      bellGroup.add(mouth);

      const crown = this.createBeveledBox(0.11, 0.11, 0.1, bronzeRelief, 0.018, 4);
      crown.position.y = 0.31;
      bellGroup.add(crown);
      const hanger = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.018, 8, 24), bronzeDark);
      hanger.position.y = 0.42;
      bellGroup.add(hanger);
      bellGroup.scale.setScalar(scale);
      bellGroup.position.set(x, y, 0.035);
      return bellGroup;
    };

    const rows = [
      { count: 10, y: 1.09, scale: 0.48, span: 1.98 },
      { count: 10, y: 0.46, scale: 0.58, span: 2.02 },
      { count: 5, y: -0.02, scale: 0.86, span: 1.48 }
    ];
    rows.forEach(({ count, y, scale, span }) => {
      for (let i = 0; i < count; i++) {
        const x = count === 1 ? 0 : -span / 2 + i * span / (count - 1);
        group.add(createBell(scale, x, y));
      }
    });

    const base = this.createBeveledBox(1.25, 0.08, 0.28, lacquer, 0.025, 4);
    base.position.set(0, -0.38, 0.18);
    group.add(base);
    const malletHead = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.28, 18), lacquer);
    malletHead.rotation.z = Math.PI / 2;
    malletHead.position.set(0.24, -0.26, 0.35);
    group.add(malletHead);
    const malletHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.72, 12), lacquer);
    malletHandle.position.set(-0.1, -0.32, 0.33);
    malletHandle.rotation.z = Math.PI / 2.3;
    group.add(malletHandle);
    return group;
  }

  createSancaiCamelArtifact(mat) {
    const group = new THREE.Group();
    const sancai = new THREE.MeshStandardMaterial({ color: '#d9ab55', roughness: 0.32, metalness: 0.28, map: mat.map, side: THREE.DoubleSide });
    const green = new THREE.MeshStandardMaterial({ color: '#2e7d63', roughness: 0.3, metalness: 0.15 });
    const cream = new THREE.MeshStandardMaterial({ color: '#f0d0a0', roughness: 0.62 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 12), sancai);
    body.scale.set(1.45, 0.55, 0.45);
    body.position.y = 0.45;
    group.add(body);

    for (const x of [-0.28, 0.24]) {
      const hump = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.42, 12), sancai);
      hump.position.set(x, 0.92, 0);
      group.add(hump);
    }

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.72, 12), sancai);
    neck.position.set(0.82, 0.82, 0);
    neck.rotation.z = -0.55;
    group.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), sancai);
    head.position.set(1.08, 1.17, 0);
    group.add(head);

    for (let i = -1; i <= 1; i += 2) {
      for (let j = -1; j <= 1; j += 2) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.7, 8), sancai);
        leg.position.set(i * 0.42, 0, j * 0.16);
        group.add(leg);
      }
    }

    const stage = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.54), green);
    stage.position.y = 1.12;
    group.add(stage);

    for (let i = 0; i < 5; i++) {
      const performer = new THREE.Group();
      const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), cream);
      headMesh.position.y = 0.12;
      performer.add(headMesh);
      const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.18, 8), i % 2 ? green : sancai);
      performer.add(robe);
      performer.position.set(-0.34 + i * 0.17, 1.28, (i % 2) * 0.08 - 0.04);
      group.add(performer);
    }

    return group;
  }

  createRingedStaffArtifact(mat) {
    const group = new THREE.Group();
    const silver = new THREE.MeshStandardMaterial({ color: '#d7d4ca', roughness: 0.24, metalness: 0.88, map: mat.map, side: THREE.DoubleSide });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 16), silver);
    pole.position.y = 0.18;
    group.add(pole);

    for (const y of [1.05, 1.25]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.022, 8, 36), silver);
      ring.position.y = y;
      group.add(ring);
    }

    for (let i = 0; i < 12; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.01, 6, 18), silver);
      const angle = (i / 12) * Math.PI * 2;
      ring.position.set(Math.cos(angle) * 0.26, 1.15 + Math.sin(angle) * 0.13, 0);
      ring.rotation.y = Math.PI / 2;
      group.add(ring);
    }

    return group;
  }

  createRuTripodArtifact(mat) {
    const group = new THREE.Group();
    const detailTexture = mat.bumpMap || mat.map || null;
    if (detailTexture) {
      detailTexture.wrapS = THREE.RepeatWrapping;
      detailTexture.wrapT = THREE.RepeatWrapping;
      detailTexture.repeat.set(2.2, 1.45);
    }

    const celadon = new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      roughness: 0.2,
      metalness: 0,
      clearcoat: 0.62,
      clearcoatRoughness: 0.22,
      map: detailTexture,
      bumpMap: detailTexture,
      bumpScale: 0.012,
      side: THREE.DoubleSide
    });

    // Closed profile at the base, open at the mouth. The two exterior swells
    // form the string bands as part of the vessel wall instead of floating rings.
    const profile = [
      new THREE.Vector2(0, 0.02),
      new THREE.Vector2(0.42, 0.02),
      new THREE.Vector2(0.51, 0.06),
      new THREE.Vector2(0.6, 0.16),
      new THREE.Vector2(0.665, 0.3),
      new THREE.Vector2(0.69, 0.415),
      new THREE.Vector2(0.705, 0.445),
      new THREE.Vector2(0.718, 0.46),
      new THREE.Vector2(0.692, 0.485),
      new THREE.Vector2(0.67, 0.595),
      new THREE.Vector2(0.692, 0.625),
      new THREE.Vector2(0.716, 0.645),
      new THREE.Vector2(0.69, 0.67),
      new THREE.Vector2(0.665, 0.76),
      new THREE.Vector2(0.672, 0.83),
      new THREE.Vector2(0.705, 0.852),
      new THREE.Vector2(0.71, 0.875),
      new THREE.Vector2(0.62, 0.875),
      new THREE.Vector2(0.61, 0.835),
      new THREE.Vector2(0.605, 0.74),
      new THREE.Vector2(0.615, 0.62),
      new THREE.Vector2(0.625, 0.48),
      new THREE.Vector2(0.615, 0.31),
      new THREE.Vector2(0.575, 0.18),
      new THREE.Vector2(0.49, 0.105),
      new THREE.Vector2(0, 0.105)
    ];
    const vessel = new THREE.Mesh(new THREE.LatheGeometry(profile, 72), celadon);
    vessel.castShadow = true;
    vessel.receiveShadow = true;
    group.add(vessel);

    for (let i = 0; i < 3; i++) {
      const angle = Math.PI / 2 + (i * Math.PI * 2) / 3;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.078, 0.48, 24, 4), celadon);
      leg.position.set(Math.cos(angle) * 0.455, -0.18, Math.sin(angle) * 0.455);
      leg.castShadow = true;
      leg.receiveShadow = true;
      group.add(leg);

      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 12), celadon);
      shoulder.position.set(Math.cos(angle) * 0.455, 0.045, Math.sin(angle) * 0.455);
      shoulder.scale.y = 0.72;
      shoulder.castShadow = true;
      group.add(shoulder);
    }

    return group;
  }

  createCalligraphyScrollArtifact(mat) {
    return this.createScrollPlaneGroup(mat, 1.95, 0.92);
  }

  createQingmingScrollArtifact(mat) {
    return this.createScrollPlaneGroup(mat, 2.4, 0.82);
  }

  createWorldMapScrollArtifact(mat) {
    const group = new THREE.Group();
    const width = 2.1;
    const height = 1.62;
    const centerY = 0.36;

    const frontMaterial = new THREE.MeshStandardMaterial({
      color: '#d3ad6b',
      roughness: 0.76,
      metalness: 0,
      side: THREE.FrontSide
    });
    const backMaterial = new THREE.MeshStandardMaterial({
      color: '#9a743f',
      roughness: 0.9,
      metalness: 0,
      side: THREE.FrontSide
    });

    const paperGeometry = new THREE.PlaneGeometry(width, height, 48, 30);
    const position = paperGeometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i) / (width * 0.5);
      const y = position.getY(i) / (height * 0.5);
      const edgeCurl = Math.pow(Math.abs(x), 5) * 0.026;
      const hangingWave = Math.sin((x + 1) * Math.PI) * 0.008 * (1 - Math.abs(y) * 0.45);
      position.setZ(i, edgeCurl + hangingWave);
    }
    paperGeometry.computeVertexNormals();

    const front = new THREE.Mesh(paperGeometry, frontMaterial);
    front.position.set(0, centerY, 0.018);
    front.castShadow = true;
    front.receiveShadow = true;
    group.add(front);

    const back = new THREE.Mesh(paperGeometry.clone(), backMaterial);
    back.position.set(0, centerY, -0.018);
    back.rotation.y = Math.PI;
    back.castShadow = true;
    back.receiveShadow = true;
    group.add(back);

    const edgeMaterial = new THREE.MeshStandardMaterial({ color: '#6d4a27', roughness: 0.82 });
    for (const x of [-width * 0.5, width * 0.5]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.022, height, 0.045), edgeMaterial);
      edge.position.set(x, centerY, 0);
      group.add(edge);
    }

    const rollerCanvas = document.createElement('canvas');
    rollerCanvas.width = 512;
    rollerCanvas.height = 128;
    const rollerCtx = rollerCanvas.getContext('2d');
    const rollerGradient = rollerCtx.createLinearGradient(0, 0, 0, 128);
    rollerGradient.addColorStop(0, '#4a2f18');
    rollerGradient.addColorStop(0.28, '#a77a3e');
    rollerGradient.addColorStop(0.55, '#6e4823');
    rollerGradient.addColorStop(0.8, '#b78a4a');
    rollerGradient.addColorStop(1, '#3b2413');
    rollerCtx.fillStyle = rollerGradient;
    rollerCtx.fillRect(0, 0, 512, 128);
    rollerCtx.strokeStyle = 'rgba(47, 25, 10, 0.66)';
    rollerCtx.lineWidth = 4;
    for (let x = -30; x < 550; x += 42) {
      rollerCtx.beginPath();
      rollerCtx.moveTo(x, 18);
      rollerCtx.bezierCurveTo(x + 24, 38, x - 8, 76, x + 24, 110);
      rollerCtx.stroke();
    }
    const rollerTexture = new THREE.CanvasTexture(rollerCanvas);
    rollerTexture.colorSpace = THREE.SRGBColorSpace;
    rollerTexture.wrapS = THREE.RepeatWrapping;
    rollerTexture.wrapT = THREE.ClampToEdgeWrapping;
    rollerTexture.repeat.set(2.4, 1);
    const rollerMaterial = new THREE.MeshStandardMaterial({
      color: '#b1844c',
      map: rollerTexture,
      roughness: 0.64,
      metalness: 0.04
    });

    const rollerY = height * 0.5 + 0.105;
    for (const side of [-1, 1]) {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, width + 0.22, 48, 3), rollerMaterial);
      roller.position.set(0, centerY + side * rollerY, 0);
      roller.rotation.z = Math.PI / 2;
      roller.castShadow = true;
      roller.receiveShadow = true;
      group.add(roller);

      for (const x of [-width * 0.5 - 0.14, width * 0.5 + 0.14]) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.075, 40), edgeMaterial);
        cap.position.set(x, centerY + side * rollerY, 0);
        cap.rotation.z = Math.PI / 2;
        group.add(cap);
      }
    }

    let resolveReady;
    group.userData.readyPromise = new Promise((resolve) => { resolveReady = resolve; });
    new THREE.TextureLoader().load(
      './images/artifact-ming-world-map.png',
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.anisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() || 8;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        frontMaterial.map = texture;
        frontMaterial.color.set('#ffffff');
        frontMaterial.needsUpdate = true;
        resolveReady();
      },
      undefined,
      () => resolveReady()
    );
    return group;
  }

  createWoodblockBookArtifact(mat) {
    const group = new THREE.Group();
    const bookWidth = 0.96;
    const bookHeight = 1.42;
    const bookDepth = 0.17;

    const coverBase = new THREE.MeshStandardMaterial({
      color: '#6e4e2e',
      roughness: 0.9,
      metalness: 0
    });
    const pageMaterial = new THREE.MeshStandardMaterial({
      color: '#d8c69d',
      roughness: 0.96,
      metalness: 0
    });
    const pageDark = new THREE.MeshStandardMaterial({
      color: '#8b744d',
      roughness: 0.92,
      metalness: 0
    });
    const frontMaterial = new THREE.MeshStandardMaterial({
      color: '#71502f',
      roughness: 0.88,
      metalness: 0,
      side: THREE.FrontSide
    });
    const backMaterial = new THREE.MeshStandardMaterial({
      color: '#70502f',
      roughness: 0.92,
      metalness: 0,
      side: THREE.FrontSide
    });

    const pages = new THREE.Mesh(
      new RoundedBoxGeometry(bookWidth - 0.065, bookHeight - 0.055, bookDepth, 5, 0.025),
      pageMaterial
    );
    pages.castShadow = true;
    pages.receiveShadow = true;
    group.add(pages);

    // Thin flexible covers replace the previous thick wooden slab.
    for (const z of [-bookDepth * 0.5 - 0.016, bookDepth * 0.5 + 0.016]) {
      const cover = new THREE.Mesh(
        new RoundedBoxGeometry(bookWidth, bookHeight, 0.035, 5, 0.028),
        coverBase
      );
      cover.position.z = z;
      cover.castShadow = true;
      cover.receiveShadow = true;
      group.add(cover);
    }

    const front = new THREE.Mesh(new THREE.PlaneGeometry(bookWidth - 0.025, bookHeight - 0.025), frontMaterial);
    front.position.z = bookDepth * 0.5 + 0.036;
    front.renderOrder = 3;
    group.add(front);

    const back = new THREE.Mesh(new THREE.PlaneGeometry(bookWidth - 0.025, bookHeight - 0.025), backMaterial);
    back.position.z = -bookDepth * 0.5 - 0.036;
    back.rotation.y = Math.PI;
    back.renderOrder = 3;
    group.add(back);

    // Uneven page edges are individual recessed lines, not printed grids.
    for (let i = 0; i < 15; i++) {
      const y = -bookHeight * 0.46 + i * (bookHeight * 0.92 / 14);
      const edgeLine = new THREE.Mesh(
        new THREE.BoxGeometry(bookWidth - 0.09, 0.006, bookDepth + 0.006),
        i % 3 === 0 ? pageDark : pageMaterial
      );
      edgeLine.position.set(-0.018, y, 0);
      edgeLine.castShadow = true;
      group.add(edgeLine);
    }

    const cordMaterial = new THREE.MeshStandardMaterial({
      color: '#b39762',
      roughness: 0.98,
      metalness: 0
    });
    const bindingX = bookWidth * 0.43;
    const knotGeometry = new THREE.TorusGeometry(0.045, 0.012, 8, 28);
    for (const y of [-0.52, -0.26, 0, 0.26, 0.52]) {
      const wrapCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(bindingX - 0.035, y, bookDepth * 0.5 + 0.062),
        new THREE.Vector3(bindingX + 0.075, y, bookDepth * 0.5 + 0.025),
        new THREE.Vector3(bindingX + 0.09, y, 0),
        new THREE.Vector3(bindingX + 0.075, y, -bookDepth * 0.5 - 0.025),
        new THREE.Vector3(bindingX - 0.035, y, -bookDepth * 0.5 - 0.062)
      ]);
      const wrap = new THREE.Mesh(new THREE.TubeGeometry(wrapCurve, 28, 0.014, 9, false), cordMaterial);
      wrap.castShadow = true;
      group.add(wrap);

      const knot = new THREE.Mesh(knotGeometry, cordMaterial);
      knot.position.set(bindingX - 0.03, y, bookDepth * 0.5 + 0.067);
      knot.rotation.x = Math.PI / 2;
      knot.scale.y = 0.62;
      knot.castShadow = true;
      group.add(knot);
    }

    // A narrow worn spine strip follows the reference volume's right binding edge.
    const spine = new THREE.Mesh(
      new RoundedBoxGeometry(0.105, bookHeight - 0.035, 0.045, 4, 0.018),
      new THREE.MeshStandardMaterial({ color: '#5a4027', roughness: 0.96 })
    );
    spine.position.set(bindingX + 0.018, 0, bookDepth * 0.5 + 0.036);
    group.add(spine);

    let resolveReady;
    group.userData.readyPromise = new Promise((resolve) => { resolveReady = resolve; });
    const image = new Image();
    image.onload = () => {
      const textureCanvas = document.createElement('canvas');
      textureCanvas.width = 768;
      textureCanvas.height = 1120;
      const textureCtx = textureCanvas.getContext('2d');
      const sourceX = Math.round(image.naturalWidth * 0.515);
      const sourceWidth = image.naturalWidth - sourceX;
      textureCtx.drawImage(
        image,
        sourceX, 0, sourceWidth, image.naturalHeight,
        0, 0, textureCanvas.width, textureCanvas.height
      );
      const texture = new THREE.CanvasTexture(textureCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() || 8;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      frontMaterial.map = texture;
      frontMaterial.color.set('#ffffff');
      frontMaterial.needsUpdate = true;
      resolveReady();
    };
    image.onerror = () => resolveReady();
    image.src = './images/artifact-woodblock-book.png';

    group.rotation.z = -0.025;
    return group;
  }

  createArchiveBookArtifact(options = {}) {
    const group = new THREE.Group();
    const palette = {
      paperLight: '#ded0ad',
      paperMid: '#c9b58c',
      paperShade: '#e2d4b2',
      page: '#d5c29b',
      agedPage: '#b99f72',
      leftBack: '#c6b084',
      rightBack: '#a8791e',
      leftFront: '#d8c8a6',
      rightFront: '#b98c28',
      cord: '#bca375',
      ...options.palette
    };
    const bookWidth = options.bookWidth ?? 0.76;
    const bookHeight = options.bookHeight ?? 1.2;
    const bookDepth = options.bookDepth ?? 0.105;
    const gap = options.gap ?? 0.035;
    const singleVolume = options.singleVolume === true;

    const paperCanvas = document.createElement('canvas');
    paperCanvas.width = 512;
    paperCanvas.height = 512;
    const paperCtx = paperCanvas.getContext('2d');
    const paperGradient = paperCtx.createLinearGradient(0, 0, 512, 512);
    paperGradient.addColorStop(0, palette.paperLight);
    paperGradient.addColorStop(0.55, palette.paperMid);
    paperGradient.addColorStop(1, palette.paperShade);
    paperCtx.fillStyle = paperGradient;
    paperCtx.fillRect(0, 0, 512, 512);
    this.drawPaperFibers(paperCtx);
    for (let i = 0; i < 110; i++) {
      paperCtx.fillStyle = i % 3 === 0 ? 'rgba(92,65,35,0.11)' : 'rgba(246,234,197,0.12)';
      paperCtx.beginPath();
      paperCtx.arc((i * 71) % 512, (i * 109) % 512, 0.6 + (i % 3) * 0.45, 0, Math.PI * 2);
      paperCtx.fill();
    }
    const paperTexture = new THREE.CanvasTexture(paperCanvas);
    paperTexture.colorSpace = THREE.SRGBColorSpace;
    paperTexture.wrapS = THREE.RepeatWrapping;
    paperTexture.wrapT = THREE.RepeatWrapping;
    paperTexture.repeat.set(1.25, 1.7);

    const pageMaterial = new THREE.MeshStandardMaterial({
      color: palette.page, map: paperTexture, bumpMap: paperTexture,
      bumpScale: 0.006, roughness: 0.98, side: THREE.DoubleSide
    });
    const agedPageMaterial = new THREE.MeshStandardMaterial({
      color: palette.agedPage, map: paperTexture, roughness: 1, side: THREE.DoubleSide
    });
    const leftBackMaterial = new THREE.MeshStandardMaterial({
      color: palette.leftBack, map: paperTexture, roughness: 0.99, side: THREE.DoubleSide
    });
    const rightBackMaterial = new THREE.MeshStandardMaterial({
      color: palette.rightBack, map: paperTexture, roughness: 0.94, side: THREE.DoubleSide
    });
    const leftFrontMaterial = new THREE.MeshStandardMaterial({
      color: palette.leftFront, roughness: 0.96, side: THREE.DoubleSide
    });
    const rightFrontMaterial = new THREE.MeshStandardMaterial({
      color: palette.rightFront, roughness: 0.9, metalness: 0, side: THREE.DoubleSide
    });

    const makeSoftSheet = (width, height, phase = 0, curl = 0.01) => {
      const geometry = new THREE.PlaneGeometry(width, height, 16, 22);
      const position = geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const nx = x / (width * 0.5);
        const ny = y / (height * 0.5);
        const outerCurl = Math.pow(Math.max(0, Math.abs(nx) - 0.72) / 0.28, 2) * curl;
        const cornerCurl = Math.pow(Math.max(0, Math.abs(ny) - 0.78) / 0.22, 2) * curl * 0.72;
        const paperWave = Math.sin(nx * Math.PI * 2.2 + phase) * 0.0025 + Math.cos(ny * Math.PI * 1.7 + phase) * 0.0018;
        position.setZ(i, outerCurl + cornerCurl + paperWave);
      }
      geometry.computeVertexNormals();
      return geometry;
    };

    const addSoftVolume = (x, frontMaterial, backMaterial, phase) => {
      const volume = new THREE.Group();
      volume.position.x = x;

      const pageCount = 13;
      for (let i = 0; i < pageCount; i++) {
        const depthRatio = i / (pageCount - 1);
        const sheet = new THREE.Mesh(
          makeSoftSheet(bookWidth - 0.035 + (i % 3) * 0.002, bookHeight - 0.03, phase + i * 0.31, 0.007 + (i % 4) * 0.0015),
          i % 4 === 0 ? agedPageMaterial : pageMaterial
        );
        sheet.position.z = -bookDepth * 0.5 + depthRatio * bookDepth;
        sheet.rotation.z = (i % 2 ? 1 : -1) * 0.0018 * (i % 3);
        sheet.castShadow = true;
        sheet.receiveShadow = true;
        volume.add(sheet);

        const edgeColor = i % 4 === 0 ? agedPageMaterial : pageMaterial;
        for (const y of [-bookHeight * 0.5 + 0.018, bookHeight * 0.5 - 0.018]) {
          const edge = new THREE.Mesh(new THREE.BoxGeometry(bookWidth - 0.05, 0.004, 0.004), edgeColor);
          edge.position.set(0, y, sheet.position.z);
          volume.add(edge);
        }
        for (const edgeX of [-bookWidth * 0.5 + 0.018, bookWidth * 0.5 - 0.018]) {
          const edge = new THREE.Mesh(new THREE.BoxGeometry(0.004, bookHeight - 0.05, 0.004), edgeColor);
          edge.position.set(edgeX, 0, sheet.position.z);
          volume.add(edge);
        }
      }

      const front = new THREE.Mesh(makeSoftSheet(bookWidth, bookHeight, phase + 1.7, 0.018), frontMaterial);
      front.position.z = bookDepth * 0.5 + 0.008;
      front.castShadow = true;
      front.renderOrder = 3;
      volume.add(front);

      const back = new THREE.Mesh(makeSoftSheet(bookWidth, bookHeight, phase + 2.4, 0.012), backMaterial);
      back.position.z = -bookDepth * 0.5 - 0.008;
      back.rotation.y = Math.PI;
      back.castShadow = true;
      volume.add(back);
      return volume;
    };

    const leftX = singleVolume ? 0 : -(bookWidth + gap) * 0.5;
    const rightX = singleVolume ? 0 : (bookWidth + gap) * 0.5;
    if (!singleVolume) {
      const leftBook = addSoftVolume(leftX, leftFrontMaterial, leftBackMaterial, 0.4);
      leftBook.rotation.y = 0.022;
      leftBook.rotation.z = 0.006;
      group.add(leftBook);
    }
    const rightBook = addSoftVolume(rightX, rightFrontMaterial, rightBackMaterial, 1.2);
    rightBook.rotation.y = singleVolume ? -0.035 : -0.022;
    rightBook.rotation.z = singleVolume ? -0.012 : -0.006;
    group.add(rightBook);

    // Cotton thread hugs the paper edge directly; there is no rigid spine or case.
    const cordMaterial = new THREE.MeshStandardMaterial({ color: palette.cord, roughness: 1, metalness: 0 });
    const bindingSide = options.bindingSide ?? 1;
    const bindingX = rightX + bindingSide * bookWidth * 0.465;
    const stitchYs = [-0.4, -0.2, 0, 0.2, 0.4].map((ratio) => ratio * bookHeight);
    for (const y of stitchYs) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(bindingX - bindingSide * 0.04, y, bookDepth * 0.5 + 0.018),
        new THREE.Vector3(bindingX + bindingSide * 0.012, y, bookDepth * 0.5 + 0.012),
        new THREE.Vector3(bindingX + bindingSide * 0.025, y, 0),
        new THREE.Vector3(bindingX + bindingSide * 0.012, y, -bookDepth * 0.5 - 0.012),
        new THREE.Vector3(bindingX - bindingSide * 0.04, y, -bookDepth * 0.5 - 0.018)
      ]);
      const cord = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.0085, 9, false), cordMaterial);
      cord.castShadow = true;
      group.add(cord);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 10), cordMaterial);
      knot.scale.set(1.2, 0.7, 0.65);
      knot.position.set(bindingX - bindingSide * 0.035, y, bookDepth * 0.5 + 0.023);
      group.add(knot);
    }
    const verticalCordCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(bindingX - bindingSide * 0.035, -bookHeight * 0.41, bookDepth * 0.5 + 0.021),
      new THREE.Vector3(bindingX - bindingSide * 0.035, 0, bookDepth * 0.5 + 0.023),
      new THREE.Vector3(bindingX - bindingSide * 0.035, bookHeight * 0.41, bookDepth * 0.5 + 0.021)
    ]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(verticalCordCurve, 40, 0.007, 8, false), cordMaterial));

    let resolveReady;
    group.userData.readyPromise = new Promise((resolve) => { resolveReady = resolve; });
    const image = new Image();
    image.onload = () => {
      const makeTexture = (sourceX, sourceWidth) => {
        const canvas = document.createElement('canvas');
        canvas.width = 704;
        canvas.height = 1100;
        const ctx = canvas.getContext('2d');
        const sourceY = Math.round(image.naturalHeight * (options.cropYRatio ?? 0.125));
        const sourceHeight = Math.round(image.naturalHeight * (options.cropHeightRatio ?? 0.845));
        ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.anisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() || 8;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        return texture;
      };
      if (!singleVolume) {
        const split = Math.round(image.naturalWidth * (options.splitRatio ?? 0.495));
        leftFrontMaterial.map = makeTexture(0, split);
        leftFrontMaterial.color.set('#ffffff');
        leftFrontMaterial.needsUpdate = true;
        rightFrontMaterial.map = makeTexture(split, image.naturalWidth - split);
      } else {
        const sourceX = Math.round(image.naturalWidth * (options.cropXRatio ?? 0));
        const sourceWidth = Math.round(image.naturalWidth * (options.cropWidthRatio ?? 1));
        rightFrontMaterial.map = makeTexture(sourceX, sourceWidth);
      }
      rightFrontMaterial.color.set('#ffffff');
      rightFrontMaterial.needsUpdate = true;
      resolveReady();
    };
    image.onerror = () => resolveReady();
    image.src = options.imageSrc || './images/artifact-siku-archive-book.png';

    group.rotation.z = options.rotationZ ?? -0.008;
    return group;
  }

  createReformBookArtifact() {
    return this.createArchiveBookArtifact({
      imageSrc: './images/artifact-tianyanlun-book.png',
      splitRatio: 0.521,
      cropYRatio: 0.118,
      cropHeightRatio: 0.77,
      palette: {
        paperLight: '#c7b184',
        paperMid: '#9d835a',
        paperShade: '#d2bf98',
        page: '#c5ad82',
        agedPage: '#896b42',
        leftBack: '#a68b61',
        rightBack: '#55422c',
        leftFront: '#c7b184',
        rightFront: '#685137',
        cord: '#947b54'
      }
    });
  }

  createMagazineArtifact() {
    return this.createArchiveBookArtifact({
      singleVolume: true,
      bindingSide: -1,
      bookWidth: 0.94,
      bookHeight: 1.14,
      bookDepth: 0.09,
      imageSrc: './images/artifact-new-youth-magazine.png',
      cropXRatio: 0.102,
      cropYRatio: 0.022,
      cropWidthRatio: 0.795,
      cropHeightRatio: 0.946,
      rotationZ: -0.018,
      palette: {
        paperLight: '#d0bd93',
        paperMid: '#a28a60',
        paperShade: '#d8c8a4',
        page: '#c8b486',
        agedPage: '#836b43',
        rightBack: '#907a54',
        rightFront: '#c3af85',
        cord: '#695537'
      }
    });
  }

  createWartimeDeskArtifact() {
    const group = new THREE.Group();
    const maxAnisotropy = Math.min(12, this.renderer?.capabilities?.getMaxAnisotropy?.() || 8);
    const woodCanvas = document.createElement('canvas');
    woodCanvas.width = 2048;
    woodCanvas.height = 2048;
    const woodCtx = woodCanvas.getContext('2d');
    const woodBase = woodCtx.createLinearGradient(0, 0, 0, woodCanvas.height);
    woodBase.addColorStop(0, '#4b3020');
    woodBase.addColorStop(0.36, '#2d1d15');
    woodBase.addColorStop(0.68, '#513421');
    woodBase.addColorStop(1, '#211610');
    woodCtx.fillStyle = woodBase;
    woodCtx.fillRect(0, 0, woodCanvas.width, woodCanvas.height);
    woodCtx.lineCap = 'round';
    for (let i = 0; i < 520; i++) {
      const y = (i * 83 + (i % 17) * 19) % woodCanvas.height;
      const shade = 36 + (i % 9) * 6;
      woodCtx.strokeStyle = `rgba(${shade + 39}, ${shade + 15}, ${Math.max(13, shade - 9)}, ${0.13 + (i % 5) * 0.045})`;
      woodCtx.lineWidth = 1 + (i % 5) * 0.85;
      woodCtx.beginPath();
      woodCtx.moveTo(0, y);
      woodCtx.bezierCurveTo(420, y + (i % 29) - 14, 1160, y - (i % 23), 2048, y + (i % 17) - 8);
      woodCtx.stroke();
    }
    for (let i = 0; i < 28; i++) {
      const x = 90 + (i * 317) % 1870;
      const y = 70 + (i * 491) % 1880;
      const rx = 34 + (i % 7) * 16;
      const ry = 11 + (i % 5) * 7;
      woodCtx.strokeStyle = 'rgba(20, 12, 8, 0.72)';
      woodCtx.lineWidth = 8 + i % 5;
      for (let ring = 0; ring < 5; ring++) {
        woodCtx.beginPath();
        woodCtx.ellipse(x, y, rx + ring * 15, ry + ring * 6, 0.08 * (i % 3), 0, Math.PI * 2);
        woodCtx.stroke();
      }
      woodCtx.fillStyle = 'rgba(8, 6, 5, 0.84)';
      woodCtx.beginPath();
      woodCtx.ellipse(x, y, rx * 0.45, ry * 0.58, 0, 0, Math.PI * 2);
      woodCtx.fill();
    }
    for (let i = 0; i < 310; i++) {
      const x = (i * 239 + (i % 23) * 61) % 2048;
      const y = (i * 419 + (i % 13) * 37) % 2048;
      const length = 20 + (i % 11) * 19;
      woodCtx.strokeStyle = i % 6 === 0 ? 'rgba(226, 183, 116, 0.32)' : 'rgba(15, 10, 7, 0.58)';
      woodCtx.lineWidth = 1.3 + (i % 4) * 1.1;
      woodCtx.beginPath();
      woodCtx.moveTo(x, y);
      woodCtx.lineTo(x + length, y + (i % 9) - 4);
      woodCtx.stroke();
    }
    for (let i = 0; i < 11; i++) {
      const x = (i * 379 + 180) % 2048;
      const y = (i * 277 + 240) % 2048;
      const stain = woodCtx.createRadialGradient(x, y, 8, x, y, 90 + i % 4 * 38);
      stain.addColorStop(0, 'rgba(12, 8, 5, 0.38)');
      stain.addColorStop(0.58, 'rgba(38, 22, 12, 0.24)');
      stain.addColorStop(1, 'rgba(30, 18, 10, 0)');
      woodCtx.fillStyle = stain;
      woodCtx.fillRect(x - 170, y - 170, 340, 340);
    }
    const woodTexture = new THREE.CanvasTexture(woodCanvas);
    woodTexture.colorSpace = THREE.SRGBColorSpace;
    woodTexture.wrapS = THREE.RepeatWrapping;
    woodTexture.wrapT = THREE.RepeatWrapping;
    woodTexture.repeat.set(1.16, 0.92);
    woodTexture.anisotropy = maxAnisotropy;
    const woodBumpCanvas = document.createElement('canvas');
    woodBumpCanvas.width = 1024;
    woodBumpCanvas.height = 1024;
    const woodBumpCtx = woodBumpCanvas.getContext('2d');
    woodBumpCtx.fillStyle = '#8c8c8c';
    woodBumpCtx.fillRect(0, 0, 1024, 1024);
    woodBumpCtx.lineCap = 'round';
    for (let i = 0; i < 390; i++) {
      const y = (i * 47) % 1024;
      woodBumpCtx.strokeStyle = i % 7 === 0 ? '#3d3d3d' : '#6e6e6e';
      woodBumpCtx.lineWidth = 1 + i % 5;
      woodBumpCtx.beginPath();
      woodBumpCtx.moveTo(0, y);
      woodBumpCtx.bezierCurveTo(280, y + i % 17 - 8, 710, y - i % 13, 1024, y + i % 11 - 5);
      woodBumpCtx.stroke();
    }
    for (let i = 0; i < 96; i++) {
      const x = (i * 137) % 1024;
      const y = (i * 283) % 1024;
      woodBumpCtx.strokeStyle = i % 4 === 0 ? '#252525' : '#575757';
      woodBumpCtx.lineWidth = 2 + i % 4;
      woodBumpCtx.beginPath();
      woodBumpCtx.moveTo(x, y);
      woodBumpCtx.lineTo(x + 16 + i % 74, y + i % 7 - 3);
      woodBumpCtx.stroke();
    }
    const woodBumpTexture = new THREE.CanvasTexture(woodBumpCanvas);
    woodBumpTexture.wrapS = THREE.RepeatWrapping;
    woodBumpTexture.wrapT = THREE.RepeatWrapping;
    woodBumpTexture.repeat.set(1.16, 0.92);
    woodBumpTexture.anisotropy = maxAnisotropy;
    const wood = new THREE.MeshStandardMaterial({
      color: '#745039', map: woodTexture, bumpMap: woodBumpTexture,
      bumpScale: 0.052, roughness: 0.97, metalness: 0
    });
    const darkWood = new THREE.MeshStandardMaterial({
      color: '#39271c', map: woodTexture, bumpMap: woodBumpTexture,
      bumpScale: 0.045, roughness: 0.99
    });
    const ironCanvas = document.createElement('canvas');
    ironCanvas.width = 512;
    ironCanvas.height = 512;
    const ironCtx = ironCanvas.getContext('2d');
    ironCtx.fillStyle = '#282724';
    ironCtx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 190; i++) {
      const x = (i * 73) % 512;
      const y = (i * 131) % 512;
      ironCtx.fillStyle = i % 4 === 0 ? 'rgba(139,82,43,0.34)' : 'rgba(187,171,137,0.1)';
      ironCtx.beginPath();
      ironCtx.arc(x, y, 1 + (i % 6) * 0.8, 0, Math.PI * 2);
      ironCtx.fill();
    }
    ironCtx.strokeStyle = 'rgba(210,188,146,0.18)';
    ironCtx.lineWidth = 1.4;
    for (let i = 0; i < 46; i++) {
      const x = (i * 101) % 512;
      const y = (i * 59) % 512;
      ironCtx.beginPath();
      ironCtx.moveTo(x, y);
      ironCtx.lineTo(x + 16 + (i % 5) * 7, y + (i % 2 ? 4 : -5));
      ironCtx.stroke();
    }
    const ironTexture = new THREE.CanvasTexture(ironCanvas);
    ironTexture.colorSpace = THREE.SRGBColorSpace;
    ironTexture.wrapS = THREE.RepeatWrapping;
    ironTexture.wrapT = THREE.RepeatWrapping;
    ironTexture.repeat.set(2.4, 1.8);
    const iron = new THREE.MeshStandardMaterial({
      color: '#4a4640', map: ironTexture, bumpMap: ironTexture,
      bumpScale: 0.018, roughness: 0.72, metalness: 0.62
    });

    const paperCanvas = document.createElement('canvas');
    paperCanvas.width = 512;
    paperCanvas.height = 512;
    const paperCtx = paperCanvas.getContext('2d');
    paperCtx.fillStyle = '#c7b28a';
    paperCtx.fillRect(0, 0, 512, 512);
    this.drawPaperFibers(paperCtx);
    for (let i = 0; i < 95; i++) {
      paperCtx.fillStyle = i % 3 === 0 ? 'rgba(86,60,35,0.12)' : 'rgba(238,220,180,0.12)';
      paperCtx.beginPath();
      paperCtx.arc((i * 89) % 512, (i * 127) % 512, 0.7 + (i % 3) * 0.5, 0, Math.PI * 2);
      paperCtx.fill();
    }
    const paperTexture = new THREE.CanvasTexture(paperCanvas);
    paperTexture.colorSpace = THREE.SRGBColorSpace;
    paperTexture.wrapS = THREE.RepeatWrapping;
    paperTexture.wrapT = THREE.RepeatWrapping;
    paperTexture.repeat.set(1.3, 1.6);
    const paper = new THREE.MeshStandardMaterial({
      color: '#c9b58e', map: paperTexture, bumpMap: paperTexture,
      bumpScale: 0.006, roughness: 0.98
    });
    const ink = new THREE.MeshBasicMaterial({ color: '#514431', transparent: true, opacity: 0.62 });

    const createBookTexture = (label, baseColor, labelColor = '#b49a6c') => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = i % 3 === 0 ? 'rgba(221,185,123,0.09)' : 'rgba(15,11,8,0.12)';
        ctx.beginPath();
        ctx.arc((i * 137) % 640, (i * 211) % 1024, 1 + (i % 7), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(220,190,135,0.13)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 120; i++) {
        const y = (i * 67) % 1024;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(180, y + i % 9 - 4, 430, y - i % 7, 640, y + i % 5 - 2);
        ctx.stroke();
      }
      for (const [x, y, radius] of [[76, 112, 56], [540, 860, 82], [118, 740, 46]]) {
        const stain = ctx.createRadialGradient(x, y, 3, x, y, radius);
        stain.addColorStop(0, 'rgba(29,20,13,0.46)');
        stain.addColorStop(1, 'rgba(29,20,13,0)');
        ctx.fillStyle = stain;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
      ctx.fillStyle = labelColor;
      ctx.fillRect(208, 92, 224, 840);
      ctx.strokeStyle = '#56432c';
      ctx.lineWidth = 7;
      ctx.strokeRect(220, 106, 200, 812);
      ctx.fillStyle = '#30271d';
      ctx.font = 'bold 70px serif';
      ctx.textAlign = 'center';
      const chars = Array.from(label);
      chars.forEach((char, i) => ctx.fillText(char, 320, 196 + i * Math.min(102, 620 / Math.max(1, chars.length - 1))));
      ctx.strokeStyle = 'rgba(18,12,8,0.56)';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(128, 2);
      ctx.lineTo(194, 18);
      ctx.moveTo(640, 1016);
      ctx.lineTo(502, 1008);
      ctx.lineTo(438, 1024);
      ctx.stroke();
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = maxAnisotropy;
      return texture;
    };

    const deskTopGeometry = new RoundedBoxGeometry(2.28, 0.14, 1.28, 10, 0.035);
    const deskTopPositions = deskTopGeometry.getAttribute('position');
    for (let i = 0; i < deskTopPositions.count; i++) {
      const x = deskTopPositions.getX(i);
      const y = deskTopPositions.getY(i);
      const z = deskTopPositions.getZ(i);
      const warp = Math.sin(x * 4.7 + z * 2.1) * 0.0035 + Math.sin(z * 8.4) * 0.002;
      const wornEdge = Math.pow(Math.min(1, Math.abs(x) / 1.14), 5) * 0.004;
      deskTopPositions.setY(i, y + Math.sign(y || 1) * (warp - wornEdge));
    }
    deskTopGeometry.computeVertexNormals();
    const deskTop = new THREE.Mesh(deskTopGeometry, wood);
    deskTop.position.y = -0.16;
    deskTop.castShadow = true;
    deskTop.receiveShadow = true;
    group.add(deskTop);
    for (const x of [-0.39, 0.38]) {
      const plankSeam = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.007, 1.17),
        new THREE.MeshStandardMaterial({ color: '#160f0b', roughness: 1 })
      );
      plankSeam.position.set(x, -0.086, 0);
      plankSeam.receiveShadow = true;
      group.add(plankSeam);
    }

    for (const x of [-0.96, 0.96]) {
      for (const z of [-0.48, 0.48]) {
        const leg = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.92, 0.15, 4, 0.02), wood);
        leg.position.set(x, -0.68, z);
        leg.castShadow = true;
        group.add(leg);
      }
    }
    const apron = new THREE.Mesh(new RoundedBoxGeometry(2.02, 0.4, 0.11, 4, 0.02), darkWood);
    apron.position.set(0, -0.49, 0.585);
    apron.castShadow = true;
    group.add(apron);
    const apronCanvas = document.createElement('canvas');
    apronCanvas.width = 1200;
    apronCanvas.height = 260;
    const apronCtx = apronCanvas.getContext('2d');
    apronCtx.fillStyle = '#2a1d15';
    apronCtx.fillRect(0, 0, apronCanvas.width, apronCanvas.height);
    apronCtx.drawImage(woodCanvas, 0, 0, woodCanvas.width, woodCanvas.height, 0, 0, apronCanvas.width, apronCanvas.height);
    apronCtx.fillStyle = 'rgba(205,173,112,0.5)';
    apronCtx.font = '58px serif';
    apronCtx.textAlign = 'center';
    apronCtx.fillText('国立西南联合大学', 600, 104);
    apronCtx.font = '43px serif';
    apronCtx.fillText('四十年度第二学期', 600, 184);
    const apronTexture = new THREE.CanvasTexture(apronCanvas);
    apronTexture.colorSpace = THREE.SRGBColorSpace;
    apronTexture.anisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() || 8;
    const apronFace = new THREE.Mesh(
      new THREE.PlaneGeometry(1.86, 0.31),
      new THREE.MeshStandardMaterial({ color: '#ffffff', map: apronTexture, roughness: 0.94 })
    );
    apronFace.position.set(0, -0.49, 0.647);
    group.add(apronFace);
    const lowerBrace = new THREE.Mesh(new RoundedBoxGeometry(2.0, 0.1, 0.1, 4, 0.018), wood);
    lowerBrace.position.set(0, -0.82, 0.54);
    group.add(lowerBrace);

    // Glass chimney oil lamp with worn copper reservoir and a visible flame.
    const bronzeCanvas = document.createElement('canvas');
    bronzeCanvas.width = 1024;
    bronzeCanvas.height = 1024;
    const bronzeCtx = bronzeCanvas.getContext('2d');
    bronzeCtx.fillStyle = '#463428';
    bronzeCtx.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 520; i++) {
      const x = (i * 97 + i % 17 * 23) % 1024;
      const y = (i * 181 + i % 13 * 31) % 1024;
      bronzeCtx.fillStyle = i % 5 === 0
        ? `rgba(62,119,91,${0.13 + i % 4 * 0.045})`
        : `rgba(188,105,54,${0.06 + i % 5 * 0.018})`;
      bronzeCtx.beginPath();
      bronzeCtx.ellipse(x, y, 3 + i % 14, 2 + i % 9, i * 0.19, 0, Math.PI * 2);
      bronzeCtx.fill();
    }
    bronzeCtx.strokeStyle = 'rgba(226,188,128,0.24)';
    bronzeCtx.lineWidth = 2;
    for (let i = 0; i < 130; i++) {
      const x = (i * 149) % 1024;
      const y = (i * 307) % 1024;
      bronzeCtx.beginPath();
      bronzeCtx.moveTo(x, y);
      bronzeCtx.lineTo(x + 18 + i % 62, y + i % 5 - 2);
      bronzeCtx.stroke();
    }
    const bronzeTexture = new THREE.CanvasTexture(bronzeCanvas);
    bronzeTexture.colorSpace = THREE.SRGBColorSpace;
    bronzeTexture.wrapS = THREE.RepeatWrapping;
    bronzeTexture.wrapT = THREE.RepeatWrapping;
    bronzeTexture.repeat.set(1.4, 1.7);
    bronzeTexture.anisotropy = maxAnisotropy;
    const lampMetal = new THREE.MeshStandardMaterial({
      color: '#71503a', map: bronzeTexture, bumpMap: bronzeTexture,
      bumpScale: 0.034, roughness: 0.78, metalness: 0.64
    });
    const lampX = -0.82;
    const lampZ = -0.12;
    const lampBaseProfile = [
      [0.18, 0], [0.2, 0.035], [0.18, 0.08], [0.15, 0.13],
      [0.17, 0.19], [0.2, 0.25], [0.18, 0.33], [0.12, 0.37], [0.1, 0.42]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const lampBase = new THREE.Mesh(new THREE.LatheGeometry(lampBaseProfile, 96), lampMetal);
    lampBase.position.set(lampX, -0.08, lampZ);
    lampBase.castShadow = true;
    group.add(lampBase);
    const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.105, 0.12, 56), lampMetal);
    burner.position.set(lampX, 0.37, lampZ);
    group.add(burner);
    const wickTube = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.045, 0.09, 40), lampMetal);
    wickTube.position.set(lampX, 0.46, lampZ);
    group.add(wickTube);
    const wick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.014, 0.07, 16),
      new THREE.MeshStandardMaterial({ color: '#17110c', roughness: 1 })
    );
    wick.position.set(lampX, 0.505, lampZ);
    group.add(wick);
    const adjustStem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 20), lampMetal);
    adjustStem.rotation.z = Math.PI / 2;
    adjustStem.position.set(lampX + 0.14, 0.38, lampZ);
    group.add(adjustStem);
    const adjustWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.018, 36), lampMetal);
    adjustWheel.rotation.z = Math.PI / 2;
    adjustWheel.position.set(lampX + 0.205, 0.38, lampZ);
    group.add(adjustWheel);
    for (let i = 0; i < 14; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 0.022), lampMetal);
      const angle = i / 14 * Math.PI * 2;
      tooth.position.set(lampX + 0.214, 0.38 + Math.cos(angle) * 0.058, lampZ + Math.sin(angle) * 0.058);
      tooth.rotation.x = angle;
      group.add(tooth);
    }
    const smokeCanvas = document.createElement('canvas');
    smokeCanvas.width = 1024;
    smokeCanvas.height = 1024;
    const smokeCtx = smokeCanvas.getContext('2d');
    const smokeGradient = smokeCtx.createLinearGradient(0, 0, 0, 1024);
    smokeGradient.addColorStop(0, '#3a3028');
    smokeGradient.addColorStop(0.2, '#65564a');
    smokeGradient.addColorStop(0.5, '#b5a588');
    smokeGradient.addColorStop(0.82, '#786452');
    smokeGradient.addColorStop(1, '#44352b');
    smokeCtx.fillStyle = smokeGradient;
    smokeCtx.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 430; i++) {
      const x = (i * 109) % 1024;
      const y = (i * 233) % 1024;
      smokeCtx.fillStyle = i % 3 === 0 ? 'rgba(18,14,11,0.38)' : 'rgba(235,218,181,0.12)';
      smokeCtx.beginPath();
      smokeCtx.arc(x, y, 1 + i % 8, 0, Math.PI * 2);
      smokeCtx.fill();
    }
    const smokeTexture = new THREE.CanvasTexture(smokeCanvas);
    smokeTexture.colorSpace = THREE.SRGBColorSpace;
    smokeTexture.wrapS = THREE.RepeatWrapping;
    smokeTexture.wrapT = THREE.ClampToEdgeWrapping;
    smokeTexture.repeat.set(1.5, 1);
    smokeTexture.anisotropy = maxAnisotropy;
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: '#9d8b70', map: smokeTexture, bumpMap: smokeTexture,
      bumpScale: 0.012, transparent: true, opacity: 0.48,
      roughness: 0.43, transmission: 0.3, thickness: 0.045,
      clearcoat: 0.12, clearcoatRoughness: 0.78,
      side: THREE.DoubleSide, depthWrite: false
    });
    const chimneyProfile = [
      [0.095, 0], [0.13, 0.08], [0.18, 0.2], [0.19, 0.38],
      [0.15, 0.55], [0.1, 0.67], [0.085, 0.92]
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const chimney = new THREE.Mesh(new THREE.LatheGeometry(chimneyProfile, 96), glassMaterial);
    chimney.position.set(lampX, 0.39, lampZ);
    chimney.renderOrder = 5;
    group.add(chimney);
    const chimneyBottomRim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.009, 10, 64), glassMaterial);
    chimneyBottomRim.rotation.x = Math.PI / 2;
    chimneyBottomRim.position.set(lampX, 0.4, lampZ);
    chimneyBottomRim.renderOrder = 6;
    group.add(chimneyBottomRim);
    const chimneyTopRim = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.007, 10, 64), glassMaterial);
    chimneyTopRim.rotation.x = Math.PI / 2;
    chimneyTopRim.position.set(lampX, 1.31, lampZ);
    chimneyTopRim.renderOrder = 6;
    group.add(chimneyTopRim);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.052, 24, 18),
      new THREE.MeshBasicMaterial({ color: '#ffb33a', transparent: true, opacity: 0.95 })
    );
    flame.scale.set(0.7, 1.8, 0.7);
    flame.position.set(lampX, 0.5, lampZ);
    group.add(flame);
    const flameCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.027, 20, 14),
      new THREE.MeshBasicMaterial({ color: '#fff1b0', transparent: true, opacity: 0.96 })
    );
    flameCore.scale.set(0.65, 1.55, 0.65);
    flameCore.position.set(lampX, 0.49, lampZ + 0.004);
    group.add(flameCore);
    const lampGlow = new THREE.PointLight('#ffad55', 2.15, 4.2);
    lampGlow.position.set(lampX, 0.55, lampZ + 0.04);
    lampGlow.castShadow = true;
    lampGlow.shadow.mapSize.set(1024, 1024);
    lampGlow.shadow.bias = -0.00018;
    group.add(lampGlow);

    // Upright textbooks at the back of the desk.
    const bookColors = ['#24211d', '#65543e', '#2c2924', '#38322a', '#252724'];
    const bookLabels = ['大学国文', '西南联大文法笔记', '南宋史稿', '近代史', '国文读本'];
    const standingBooks = [
      [-0.28, 0.63, 0.16], [-0.06, 0.57, 0.13], [0.13, 0.52, 0.12],
      [0.31, 0.44, 0.105], [0.47, 0.48, 0.11]
    ];
    standingBooks.forEach(([x, h, w], i) => {
      const coverMat = new THREE.MeshStandardMaterial({
        color: '#ffffff', map: createBookTexture(bookLabels[i], bookColors[i]),
        bumpMap: paperTexture, bumpScale: 0.006, roughness: 0.96
      });
      const book = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.34, 4, 0.018), coverMat);
      book.position.set(x, -0.03 + h * 0.5, -0.38);
      book.rotation.z = (i - 2) * 0.025;
      book.castShadow = true;
      group.add(book);
      for (let layer = 0; layer < 7; layer++) {
        const pageEdge = new THREE.Mesh(
          new THREE.BoxGeometry(Math.max(0.035, w - 0.018), 0.004, 0.285),
          layer % 3 === 0 ? new THREE.MeshStandardMaterial({ color: '#8b7352', roughness: 1 }) : paper
        );
        pageEdge.position.set(x, -0.025 + h - layer * 0.006, -0.38);
        pageEdge.rotation.z = book.rotation.z;
        group.add(pageEdge);
      }
    });

    const largeBook = new THREE.Mesh(
      new RoundedBoxGeometry(0.48, 0.66, 0.12, 4, 0.025),
      new THREE.MeshStandardMaterial({
        color: '#ffffff', map: createBookTexture('中国通史简编', '#262724'),
        bumpMap: paperTexture, bumpScale: 0.007, roughness: 0.97
      })
    );
    largeBook.position.set(0.79, 0.17, -0.32);
    largeBook.rotation.z = -0.035;
    largeBook.castShadow = true;
    group.add(largeBook);

    // Worn horizontal book stack beside the lamp.
    for (let i = 0; i < 4; i++) {
      const stacked = new THREE.Mesh(
        new RoundedBoxGeometry(0.55 - i * 0.025, 0.065, 0.4, 4, 0.018),
        i % 2 ? paper : new THREE.MeshStandardMaterial({ color: '#6f5a3d', roughness: 0.96 })
      );
      stacked.position.set(-0.28 + i * 0.012, -0.04 + i * 0.07, -0.04);
      stacked.rotation.y = -0.14 + i * 0.025;
      stacked.castShadow = true;
      group.add(stacked);
      for (let layer = 0; layer < 5; layer++) {
        const pageLine = new THREE.Mesh(new THREE.BoxGeometry(0.48 - i * 0.022, 0.003, 0.375), layer % 2 ? paper : new THREE.MeshStandardMaterial({ color: '#8b7451', roughness: 1 }));
        pageLine.position.set(-0.28 + i * 0.012, -0.065 + i * 0.07 + layer * 0.01, -0.04);
        pageLine.rotation.y = stacked.rotation.y;
        group.add(pageLine);
      }
    }

    // Open notebook in the foreground.
    const notebookCanvas = document.createElement('canvas');
    notebookCanvas.width = 1200;
    notebookCanvas.height = 680;
    const notebookCtx = notebookCanvas.getContext('2d');
    notebookCtx.drawImage(paperCanvas, 0, 0, paperCanvas.width, paperCanvas.height, 0, 0, notebookCanvas.width, notebookCanvas.height);
    notebookCtx.strokeStyle = 'rgba(86,66,44,0.28)';
    notebookCtx.lineWidth = 2;
    for (let x = 42; x < 1158; x += 44) {
      notebookCtx.beginPath();
      notebookCtx.moveTo(x, 34);
      notebookCtx.lineTo(x, 646);
      notebookCtx.stroke();
    }
    notebookCtx.strokeStyle = 'rgba(75,55,35,0.42)';
    notebookCtx.lineWidth = 4;
    notebookCtx.beginPath();
    notebookCtx.moveTo(600, 18);
    notebookCtx.quadraticCurveTo(590, 340, 600, 662);
    notebookCtx.stroke();
    const noteColumns = [
      '水资源与社会调查', '联大课程札记', '山河虽破学脉不绝', '课堂讨论摘要',
      '国文史料摘录', '一九四〇年春', '校舍灯火如豆', '读书救国'
    ];
    notebookCtx.fillStyle = '#4c4032';
    notebookCtx.font = '25px serif';
    notebookCtx.textAlign = 'center';
    noteColumns.forEach((text, column) => {
      const x = column < 4 ? 86 + column * 118 : 704 + (column - 4) * 118;
      Array.from(text).forEach((char, row) => notebookCtx.fillText(char, x, 86 + row * 38));
    });
    notebookCtx.strokeStyle = 'rgba(76,58,38,0.56)';
    notebookCtx.lineWidth = 2;
    notebookCtx.strokeRect(286, 390, 145, 116);
    notebookCtx.strokeRect(745, 418, 162, 102);
    const notebookTexture = new THREE.CanvasTexture(notebookCanvas);
    notebookTexture.colorSpace = THREE.SRGBColorSpace;
    notebookTexture.anisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() || 8;
    const notebookMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff', map: notebookTexture, bumpMap: paperTexture,
      bumpScale: 0.004, roughness: 0.98, side: THREE.DoubleSide
    });
    const notebookGeometry = new THREE.PlaneGeometry(1.16, 0.66, 22, 12);
    const notebookPositions = notebookGeometry.attributes.position;
    for (let i = 0; i < notebookPositions.count; i++) {
      const x = notebookPositions.getX(i);
      const y = notebookPositions.getY(i);
      const edgeCurl = Math.pow(Math.abs(x) / 0.58, 3) * 0.026;
      const cornerCurl = Math.pow(Math.abs(y) / 0.33, 3) * 0.012;
      const crease = -0.018 * Math.exp(-Math.pow(x / 0.055, 2));
      notebookPositions.setZ(i, edgeCurl + cornerCurl + crease);
    }
    notebookGeometry.computeVertexNormals();
    for (let layer = 0; layer < 5; layer++) {
      const underPage = new THREE.Mesh(notebookGeometry.clone(), paper);
      underPage.rotation.x = -Math.PI / 2;
      underPage.position.set(0.04 + (layer % 2 ? 0.004 : -0.003), -0.052 - layer * 0.006, 0.32 + layer * 0.002);
      underPage.rotation.z = (layer - 2) * 0.002;
      underPage.castShadow = true;
      group.add(underPage);
    }
    const notebook = new THREE.Mesh(notebookGeometry, notebookMaterial);
    notebook.rotation.x = -Math.PI / 2;
    notebook.position.set(0.04, -0.018, 0.32);
    notebook.castShadow = true;
    notebook.receiveShadow = true;
    group.add(notebook);

    // A thin stitched centre reinforces the fold without becoming a rigid spine.
    const notebookThread = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.58, 12),
      new THREE.MeshStandardMaterial({ color: '#776247', roughness: 1 })
    );
    notebookThread.rotation.x = Math.PI / 2;
    notebookThread.position.set(0.04, 0.008, 0.32);
    group.add(notebookThread);
    const penBlack = new THREE.MeshPhysicalMaterial({
      color: '#171817', roughness: 0.48, metalness: 0.22,
      clearcoat: 0.08, clearcoatRoughness: 0.72
    });
    const penMetal = new THREE.MeshStandardMaterial({ color: '#777873', roughness: 0.5, metalness: 0.86 });
    const makeRodBetween = (start, end, radius, material, radialSegments = 20) => {
      const direction = end.clone().sub(start);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), radialSegments), material);
      rod.position.copy(start).add(end).multiplyScalar(0.5);
      rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
      rod.castShadow = true;
      return rod;
    };
    const penStart = new THREE.Vector3(0.29, 0.034, 0.16);
    const penEnd = new THREE.Vector3(0.68, 0.034, 0.52);
    const penDirection = penEnd.clone().sub(penStart).normalize();
    group.add(makeRodBetween(penStart, penEnd, 0.014, penBlack, 24));
    const penRingStart = penStart.clone().lerp(penEnd, 0.72).addScaledVector(penDirection, -0.012);
    const penRingEnd = penStart.clone().lerp(penEnd, 0.72).addScaledVector(penDirection, 0.012);
    group.add(makeRodBetween(penRingStart, penRingEnd, 0.017, penMetal, 24));
    const nibStart = penStart.clone().addScaledVector(penDirection, -0.045);
    const nib = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.09, 24), penMetal);
    nib.position.copy(nibStart.clone().add(penStart).multiplyScalar(0.5));
    nib.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), penDirection.clone());
    nib.castShadow = true;
    group.add(nib);
    const clipStart = penStart.clone().lerp(penEnd, 0.67).add(new THREE.Vector3(0, 0.012, 0));
    const clipEnd = penStart.clone().lerp(penEnd, 0.96).add(new THREE.Vector3(0, 0.012, 0));
    group.add(makeRodBetween(clipStart, clipEnd, 0.003, penMetal, 10));

    // Chipped enamel cup with oxidation, dents, a hollow rim and side handle.
    const enamelCanvas = document.createElement('canvas');
    enamelCanvas.width = 1024;
    enamelCanvas.height = 1024;
    const enamelCtx = enamelCanvas.getContext('2d');
    const enamelGradient = enamelCtx.createLinearGradient(0, 0, 0, 1024);
    enamelGradient.addColorStop(0, '#c6c0ae');
    enamelGradient.addColorStop(0.55, '#a9a18e');
    enamelGradient.addColorStop(1, '#756a59');
    enamelCtx.fillStyle = enamelGradient;
    enamelCtx.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 420; i++) {
      const x = (i * 127 + i % 13 * 31) % 1024;
      const y = (i * 211 + i % 17 * 19) % 1024;
      enamelCtx.fillStyle = i % 5 === 0 ? 'rgba(78,42,25,0.48)' : 'rgba(38,30,23,0.16)';
      enamelCtx.beginPath();
      enamelCtx.ellipse(x, y, 2 + i % 11, 1 + i % 7, i * 0.23, 0, Math.PI * 2);
      enamelCtx.fill();
    }
    for (const [x, y, rx, ry] of [[90, 850, 100, 78], [390, 930, 146, 92], [710, 780, 88, 64], [970, 900, 118, 86]]) {
      enamelCtx.fillStyle = '#3d2a20';
      enamelCtx.beginPath();
      enamelCtx.ellipse(x, y, rx, ry, 0.17, 0, Math.PI * 2);
      enamelCtx.fill();
      enamelCtx.strokeStyle = '#8d6e50';
      enamelCtx.lineWidth = 12;
      enamelCtx.stroke();
      enamelCtx.fillStyle = '#6a3722';
      enamelCtx.beginPath();
      enamelCtx.ellipse(x, y, rx * 0.7, ry * 0.64, -0.12, 0, Math.PI * 2);
      enamelCtx.fill();
    }
    const enamelTexture = new THREE.CanvasTexture(enamelCanvas);
    enamelTexture.colorSpace = THREE.SRGBColorSpace;
    enamelTexture.wrapS = THREE.RepeatWrapping;
    enamelTexture.wrapT = THREE.RepeatWrapping;
    enamelTexture.anisotropy = maxAnisotropy;
    const oldEnamel = new THREE.MeshPhysicalMaterial({
      color: '#afa692', map: enamelTexture, bumpMap: enamelTexture,
      bumpScale: 0.028, roughness: 0.8, metalness: 0.16,
      clearcoat: 0.015, clearcoatRoughness: 0.94, side: THREE.DoubleSide
    });
    const enamelBlue = new THREE.MeshStandardMaterial({ color: '#18283b', roughness: 0.78, metalness: 0.28 });
    const cupRust = new THREE.MeshStandardMaterial({ color: '#4e2a1e', roughness: 0.96, metalness: 0.3 });
    const cupGeometry = new THREE.CylinderGeometry(0.17, 0.145, 0.34, 80, 12, true);
    const cupPositions = cupGeometry.getAttribute('position');
    for (let i = 0; i < cupPositions.count; i++) {
      const x = cupPositions.getX(i);
      const y = cupPositions.getY(i);
      const z = cupPositions.getZ(i);
      const angle = Math.atan2(x, z);
      const dent = Math.exp(-Math.pow((angle - 0.8) / 0.24, 2) - Math.pow((y + 0.04) / 0.09, 2));
      cupPositions.setXYZ(i, x * (1 - dent * 0.06), y, z * (1 - dent * 0.06));
    }
    cupGeometry.computeVertexNormals();
    const cup = new THREE.Mesh(cupGeometry, oldEnamel);
    cup.position.set(0.91, 0.04, 0.18);
    cup.castShadow = true;
    group.add(cup);
    const cupRim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.012, 10, 80), enamelBlue);
    cupRim.position.set(0.91, 0.21, 0.18);
    cupRim.rotation.x = Math.PI / 2;
    group.add(cupRim);
    const cupInterior = new THREE.Mesh(
      new THREE.CylinderGeometry(0.145, 0.145, 0.01, 48),
      new THREE.MeshStandardMaterial({ color: '#28231c', roughness: 0.9, metalness: 0.16 })
    );
    cupInterior.position.set(0.91, 0.205, 0.18);
    group.add(cupInterior);
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.07, 0.16, 0.18), new THREE.Vector3(1.17, 0.13, 0.18),
      new THREE.Vector3(1.19, -0.01, 0.18), new THREE.Vector3(1.07, -0.06, 0.18)
    ]);
    const cupHandle = new THREE.Mesh(new THREE.TubeGeometry(handleCurve, 48, 0.018, 12, false), oldEnamel);
    cupHandle.castShadow = true;
    group.add(cupHandle);
    const cupFoot = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.011, 9, 64), cupRust);
    cupFoot.position.set(0.91, -0.13, 0.18);
    cupFoot.rotation.x = Math.PI / 2;
    group.add(cupFoot);

    // Canvas pencil roll and historic photograph complete the reference ensemble.
    const clothCanvas = document.createElement('canvas');
    clothCanvas.width = 512;
    clothCanvas.height = 256;
    const clothCtx = clothCanvas.getContext('2d');
    clothCtx.fillStyle = '#76664d';
    clothCtx.fillRect(0, 0, 512, 256);
    clothCtx.strokeStyle = 'rgba(37,29,21,0.38)';
    clothCtx.lineWidth = 2;
    for (let i = 0; i < 70; i++) {
      clothCtx.beginPath();
      clothCtx.moveTo(0, i * 8);
      clothCtx.lineTo(512, i * 8 + (i % 3) - 1);
      clothCtx.stroke();
      clothCtx.beginPath();
      clothCtx.moveTo(i * 8, 0);
      clothCtx.lineTo(i * 8 + (i % 4) - 2, 256);
      clothCtx.stroke();
    }
    const clothTexture = new THREE.CanvasTexture(clothCanvas);
    clothTexture.colorSpace = THREE.SRGBColorSpace;
    clothTexture.wrapS = THREE.RepeatWrapping;
    clothTexture.wrapT = THREE.RepeatWrapping;
    clothTexture.repeat.set(1.7, 1.2);
    const pouch = new THREE.Mesh(
      new RoundedBoxGeometry(0.48, 0.08, 0.2, 4, 0.025),
      new THREE.MeshStandardMaterial({
        color: '#74634b', map: clothTexture, bumpMap: clothTexture,
        bumpScale: 0.034, roughness: 1
      })
    );
    pouch.position.set(-0.78, -0.04, 0.43);
    pouch.rotation.y = -0.24;
    group.add(pouch);
    const pouchStrap = new THREE.Mesh(new RoundedBoxGeometry(0.37, 0.025, 0.08, 3, 0.008), new THREE.MeshStandardMaterial({ color: '#654b32', roughness: 0.98 }));
    pouchStrap.position.set(-0.78, 0.012, 0.43);
    pouchStrap.rotation.y = -0.24;
    group.add(pouchStrap);
    for (let i = 0; i < 3; i++) {
      const tool = new THREE.Mesh(
        new THREE.CylinderGeometry(0.009 + i * 0.0015, 0.009 + i * 0.0015, 0.42, 12),
        new THREE.MeshStandardMaterial({ color: i === 1 ? '#26221d' : '#9a7137', roughness: 0.78 })
      );
      tool.rotation.z = Math.PI / 2;
      tool.rotation.y = -0.24;
      tool.position.set(-0.71 + i * 0.022, 0.02 + i * 0.008, 0.44 + i * 0.025);
      group.add(tool);
    }

    const photoBase = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.018, 0.44, 4, 0.012), new THREE.MeshStandardMaterial({ color: '#a99268', roughness: 0.94 }));
    photoBase.position.set(0.77, -0.055, 0.48);
    photoBase.rotation.y = 0.12;
    group.add(photoBase);
    const photoMaterial = new THREE.MeshStandardMaterial({ color: '#a99268', roughness: 0.94, side: THREE.DoubleSide });
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.315, 0.41), photoMaterial);
    photo.rotation.x = -Math.PI / 2;
    photo.position.set(0.77, -0.043, 0.48);
    photo.rotation.z = 0.12;
    group.add(photo);

    let resolveReady;
    group.userData.readyPromise = new Promise((resolve) => { resolveReady = resolve; });
    const referenceImage = new Image();
    referenceImage.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 820;
      const ctx = canvas.getContext('2d');
      const sx = Math.round(referenceImage.naturalWidth * 0.774);
      const sy = Math.round(referenceImage.naturalHeight * 0.626);
      const sw = Math.round(referenceImage.naturalWidth * 0.22);
      const sh = Math.round(referenceImage.naturalHeight * 0.18);
      ctx.drawImage(referenceImage, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() || 8;
      photoMaterial.map = texture;
      photoMaterial.color.set('#ffffff');
      photoMaterial.needsUpdate = true;
      resolveReady();
    };
    referenceImage.onerror = () => resolveReady();
    referenceImage.src = './images/artifact-wartime-desk.png';

    group.rotation.x = -0.08;
    return group;
  }

  createSteeringCupArtifact() {
    const group = new THREE.Group();
    const maxAnisotropy = Math.min(12, this.renderer?.capabilities?.getMaxAnisotropy?.() || 8);
    const makeTexture = (canvas, { repeatX = 1, repeatY = 1, colorSpace = true } = {}) => {
      const texture = new THREE.CanvasTexture(canvas);
      if (colorSpace) texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.anisotropy = maxAnisotropy;
      return texture;
    };

    // Aged ivory lacquer: continuous cream color, ingrained dirt and fine crackle.
    const ivoryCanvas = document.createElement('canvas');
    ivoryCanvas.width = 2048;
    ivoryCanvas.height = 512;
    const ivoryCtx = ivoryCanvas.getContext('2d');
    const ivoryGradient = ivoryCtx.createLinearGradient(0, 0, 0, ivoryCanvas.height);
    ivoryGradient.addColorStop(0, '#e4d39f');
    ivoryGradient.addColorStop(0.48, '#cdb880');
    ivoryGradient.addColorStop(1, '#a78e5e');
    ivoryCtx.fillStyle = ivoryGradient;
    ivoryCtx.fillRect(0, 0, ivoryCanvas.width, ivoryCanvas.height);
    for (let i = 0; i < 1300; i++) {
      const x = (i * 173 + (i % 29) * 47) % ivoryCanvas.width;
      const y = (i * 97 + (i % 17) * 31) % ivoryCanvas.height;
      const radius = 0.7 + (i % 5) * 0.55;
      ivoryCtx.fillStyle = `rgba(${56 + i % 18}, ${42 + i % 12}, ${24 + i % 8}, ${0.035 + (i % 4) * 0.014})`;
      ivoryCtx.beginPath();
      ivoryCtx.arc(x, y, radius, 0, Math.PI * 2);
      ivoryCtx.fill();
    }
    ivoryCtx.lineCap = 'round';
    for (let i = 0; i < 88; i++) {
      const x = (i * 211) % ivoryCanvas.width;
      const y = 32 + (i * 83) % (ivoryCanvas.height - 64);
      ivoryCtx.strokeStyle = `rgba(63, 45, 27, ${0.14 + (i % 4) * 0.035})`;
      ivoryCtx.lineWidth = 1 + (i % 3) * 0.45;
      ivoryCtx.beginPath();
      ivoryCtx.moveTo(x, y);
      ivoryCtx.bezierCurveTo(x + 16, y - 17, x + 33, y + 20, x + 56 + (i % 4) * 12, y - 4);
      ivoryCtx.stroke();
      if (i % 3 === 0) {
        ivoryCtx.beginPath();
        ivoryCtx.moveTo(x + 28, y + 7);
        ivoryCtx.lineTo(x + 42, y + 25);
        ivoryCtx.stroke();
      }
    }
    const ivoryBumpCanvas = document.createElement('canvas');
    ivoryBumpCanvas.width = ivoryCanvas.width;
    ivoryBumpCanvas.height = ivoryCanvas.height;
    const ivoryBumpCtx = ivoryBumpCanvas.getContext('2d');
    ivoryBumpCtx.fillStyle = '#929292';
    ivoryBumpCtx.fillRect(0, 0, ivoryBumpCanvas.width, ivoryBumpCanvas.height);
    ivoryBumpCtx.drawImage(ivoryCanvas, 0, 0);
    const ivoryTexture = makeTexture(ivoryCanvas, { repeatX: 2.4 });
    const ivoryBump = makeTexture(ivoryBumpCanvas, { repeatX: 2.4, colorSpace: false });

    // Polished but work-worn steel shared by the inner ring, spokes and hub.
    const steelCanvas = document.createElement('canvas');
    steelCanvas.width = 1024;
    steelCanvas.height = 512;
    const steelCtx = steelCanvas.getContext('2d');
    const steelGradient = steelCtx.createLinearGradient(0, 0, steelCanvas.width, 0);
    steelGradient.addColorStop(0, '#090a0a');
    steelGradient.addColorStop(0.14, '#242628');
    steelGradient.addColorStop(0.27, '#0b0c0d');
    steelGradient.addColorStop(0.48, '#3c3f41');
    steelGradient.addColorStop(0.62, '#111213');
    steelGradient.addColorStop(0.82, '#45484a');
    steelGradient.addColorStop(1, '#090a0b');
    steelCtx.fillStyle = steelGradient;
    steelCtx.fillRect(0, 0, steelCanvas.width, steelCanvas.height);
    for (let i = 0; i < 360; i++) {
      const x = (i * 79) % steelCanvas.width;
      const y = (i * 151) % steelCanvas.height;
      const length = 16 + (i % 7) * 13;
      steelCtx.strokeStyle = i % 5 === 0 ? 'rgba(0,0,0,0.72)' : 'rgba(220,225,224,0.28)';
      steelCtx.lineWidth = 0.65 + (i % 3) * 0.42;
      steelCtx.beginPath();
      steelCtx.moveTo(x, y);
      steelCtx.lineTo(x + length, y + (i % 3) - 1);
      steelCtx.stroke();
    }
    const steelTexture = makeTexture(steelCanvas, { repeatX: 1.8, repeatY: 1.3 });
    const steel = new THREE.MeshPhysicalMaterial({
      color: '#4e5051', map: steelTexture, bumpMap: steelTexture, bumpScale: 0.019,
      roughness: 0.31, metalness: 0.97, clearcoat: 0.035, clearcoatRoughness: 0.5,
      envMapIntensity: 1.35
    });
    const steelDark = new THREE.MeshPhysicalMaterial({
      color: '#292b2c', map: steelTexture, bumpMap: steelTexture, bumpScale: 0.016,
      roughness: 0.42, metalness: 0.96, clearcoat: 0.02, clearcoatRoughness: 0.62,
      envMapIntensity: 1.2
    });
    const silverCanvas = document.createElement('canvas');
    silverCanvas.width = 1024;
    silverCanvas.height = 512;
    const silverCtx = silverCanvas.getContext('2d');
    const silverGradient = silverCtx.createLinearGradient(0, 0, silverCanvas.width, 0);
    silverGradient.addColorStop(0, '#696d6e');
    silverGradient.addColorStop(0.16, '#d4d6d3');
    silverGradient.addColorStop(0.34, '#7b7e7e');
    silverGradient.addColorStop(0.54, '#ecece6');
    silverGradient.addColorStop(0.72, '#858888');
    silverGradient.addColorStop(0.9, '#c7c9c6');
    silverGradient.addColorStop(1, '#646768');
    silverCtx.fillStyle = silverGradient;
    silverCtx.fillRect(0, 0, silverCanvas.width, silverCanvas.height);
    for (let i = 0; i < 430; i++) {
      const x = (i * 73 + (i % 19) * 29) % silverCanvas.width;
      const y = (i * 137 + (i % 11) * 17) % silverCanvas.height;
      silverCtx.strokeStyle = i % 6 === 0 ? 'rgba(24,25,25,0.56)' : 'rgba(255,255,249,0.3)';
      silverCtx.lineWidth = 0.55 + i % 3 * 0.38;
      silverCtx.beginPath();
      silverCtx.moveTo(x, y);
      silverCtx.lineTo(x + 24 + i % 74, y + i % 3 - 1);
      silverCtx.stroke();
    }
    const silverTexture = makeTexture(silverCanvas, { repeatX: 1.9, repeatY: 1.25 });
    const silver = new THREE.MeshPhysicalMaterial({
      color: '#d1d2cf', map: silverTexture, bumpMap: silverTexture, bumpScale: 0.014,
      roughness: 0.29, metalness: 0.96, clearcoat: 0.025,
      clearcoatRoughness: 0.5, envMapIntensity: 1.4
    });
    const ivory = new THREE.MeshPhysicalMaterial({
      color: '#d3c08d', map: ivoryTexture, bumpMap: ivoryBump, bumpScale: 0.028,
      roughness: 0.5, clearcoat: 0.28, clearcoatRoughness: 0.58
    });

    const wheelX = -0.24;
    const wheelY = 0.13;
    const outerRim = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.071, 32, 192), ivory);
    outerRim.position.set(wheelX, wheelY, 0);
    outerRim.castShadow = true;
    outerRim.receiveShadow = true;
    group.add(outerRim);

    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.455, 0.017, 14, 160), silver);
    innerRing.position.set(wheelX, wheelY, 0.035);
    innerRing.castShadow = true;
    group.add(innerRing);

    // Three tapered, solid spokes match the early Red Flag wheel construction.
    const spokeAngles = [0, Math.PI * 0.82, Math.PI * 1.34];
    spokeAngles.forEach((angle) => {
      const spokeGroup = new THREE.Group();
      spokeGroup.position.set(wheelX, wheelY, 0.045);
      spokeGroup.rotation.z = angle - Math.PI / 2;

      const spokeShape = new THREE.Shape();
      spokeShape.moveTo(-0.088, 0.11);
      spokeShape.lineTo(0.088, 0.11);
      spokeShape.lineTo(0.062, 0.64);
      spokeShape.lineTo(-0.062, 0.64);
      spokeShape.closePath();
      const spokeGeometry = new THREE.ExtrudeGeometry(spokeShape, {
        depth: 0.07, steps: 1, bevelEnabled: true,
        bevelSegments: 4, bevelSize: 0.009, bevelThickness: 0.009
      });
      spokeGeometry.translate(0, 0, -0.035);
      const spoke = new THREE.Mesh(spokeGeometry, silver);
      spoke.castShadow = true;
      spoke.receiveShadow = true;
      spokeGroup.add(spoke);

      const insetPanel = new THREE.Mesh(new RoundedBoxGeometry(0.135, 0.19, 0.026, 5, 0.018), steelDark);
      insetPanel.position.set(0, 0.31, 0.046);
      spokeGroup.add(insetPanel);
      for (let i = -2; i <= 2; i++) {
        const flute = new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.145, 0.012, 3, 0.004), silver);
        flute.position.set(i * 0.022, 0.31, 0.064);
        spokeGroup.add(flute);
      }
      group.add(spokeGroup);
    });

    // Deep steering-column mount makes the wheel read as a complete object from every angle.
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 0.32, 64), steelDark);
    column.position.set(wheelX, wheelY, -0.13);
    column.rotation.x = Math.PI / 2;
    column.castShadow = true;
    group.add(column);
    const rearCollar = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.028, 14, 96), steelDark);
    rearCollar.position.set(wheelX, wheelY, -0.03);
    group.add(rearCollar);
    const hubBody = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.18, 0.16, 72), steelDark);
    hubBody.position.set(wheelX, wheelY, 0.075);
    hubBody.rotation.x = Math.PI / 2;
    hubBody.castShadow = true;
    group.add(hubBody);
    const hubRing = new THREE.Mesh(new THREE.TorusGeometry(0.177, 0.026, 16, 96), silver);
    hubRing.position.set(wheelX, wheelY, 0.172);
    group.add(hubRing);
    for (let i = 0; i < 48; i++) {
      const angle = i / 48 * Math.PI * 2;
      const notch = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.025, 0.014), steelDark);
      notch.position.set(wheelX + Math.cos(angle) * 0.177, wheelY + Math.sin(angle) * 0.177, 0.181);
      notch.rotation.z = angle;
      group.add(notch);
    }

    const emblemCanvas = document.createElement('canvas');
    emblemCanvas.width = 512;
    emblemCanvas.height = 512;
    const emblemCtx = emblemCanvas.getContext('2d');
    const emblemGradient = emblemCtx.createRadialGradient(210, 170, 24, 256, 256, 245);
    emblemGradient.addColorStop(0, '#a85545');
    emblemGradient.addColorStop(0.6, '#792b25');
    emblemGradient.addColorStop(1, '#4a1d19');
    emblemCtx.fillStyle = emblemGradient;
    emblemCtx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 180; i++) {
      const x = (i * 89) % 512;
      const y = (i * 137) % 512;
      emblemCtx.fillStyle = `rgba(34,22,16,${0.04 + (i % 4) * 0.018})`;
      emblemCtx.fillRect(x, y, 2 + i % 4, 1 + i % 3);
    }
    emblemCtx.lineCap = 'round';
    for (let i = 0; i < 34; i++) {
      const x = 46 + (i * 97) % 410;
      const y = 58 + (i * 151) % 392;
      emblemCtx.strokeStyle = i % 4 === 0 ? 'rgba(205,184,145,0.5)' : 'rgba(22,18,16,0.64)';
      emblemCtx.lineWidth = 1.2 + i % 3;
      emblemCtx.beginPath();
      emblemCtx.moveTo(x, y);
      emblemCtx.lineTo(x + 18 + i % 21, y + (i % 5) - 2);
      emblemCtx.stroke();
    }
    emblemCtx.fillStyle = 'rgba(22,24,24,0.84)';
    for (let i = 0; i < 13; i++) {
      const angle = i / 13 * Math.PI * 2;
      emblemCtx.beginPath();
      emblemCtx.ellipse(
        256 + Math.cos(angle) * (218 - i % 3 * 5),
        256 + Math.sin(angle) * (218 - i % 4 * 4),
        8 + i % 9, 4 + i % 6, angle, 0, Math.PI * 2
      );
      emblemCtx.fill();
    }
    emblemCtx.font = 'bold 132px "STKaiti", "KaiTi", serif';
    emblemCtx.textAlign = 'center';
    emblemCtx.textBaseline = 'middle';
    emblemCtx.fillStyle = '#d2c5a4';
    emblemCtx.strokeStyle = '#5e584d';
    emblemCtx.lineWidth = 5;
    emblemCtx.strokeText('红旗', 256, 268);
    emblemCtx.fillText('红旗', 256, 268);
    const emblemTexture = makeTexture(emblemCanvas);
    const emblem = new THREE.Mesh(
      new THREE.CircleGeometry(0.135, 72),
      new THREE.MeshPhysicalMaterial({
        map: emblemTexture, bumpMap: emblemTexture, bumpScale: 0.008,
        roughness: 0.58, metalness: 0.72,
        clearcoat: 0.035, clearcoatRoughness: 0.78, envMapIntensity: 1.1
      })
    );
    emblem.position.set(wheelX, wheelY, 0.19);
    group.add(emblem);

    // Cup label, enamel wear and chips are painted into the curved body surface.
    const cupCanvas = document.createElement('canvas');
    cupCanvas.width = 2048;
    cupCanvas.height = 1024;
    const cupCtx = cupCanvas.getContext('2d');
    const cupGradient = cupCtx.createLinearGradient(0, 0, 0, cupCanvas.height);
    cupGradient.addColorStop(0, '#d8d0be');
    cupGradient.addColorStop(0.45, '#c3b8a2');
    cupGradient.addColorStop(0.78, '#a99b83');
    cupGradient.addColorStop(1, '#82715b');
    cupCtx.fillStyle = cupGradient;
    cupCtx.fillRect(0, 0, cupCanvas.width, cupCanvas.height);
    for (let i = 0; i < 900; i++) {
      const x = (i * 181 + (i % 13) * 37) % cupCanvas.width;
      const y = (i * 113 + (i % 19) * 23) % cupCanvas.height;
      cupCtx.fillStyle = `rgba(${49 + i % 28}, ${39 + i % 18}, ${28 + i % 12}, ${0.04 + (i % 5) * 0.017})`;
      cupCtx.beginPath();
      cupCtx.arc(x, y, 0.8 + (i % 4) * 0.75, 0, Math.PI * 2);
      cupCtx.fill();
    }
    cupCtx.strokeStyle = 'rgba(82,63,45,0.18)';
    cupCtx.lineWidth = 2;
    for (let i = 0; i < 52; i++) {
      const x = (i * 239) % cupCanvas.width;
      const y = 80 + (i * 97) % 760;
      cupCtx.beginPath();
      cupCtx.moveTo(x, y);
      cupCtx.lineTo(x + 24 + (i % 5) * 9, y + 13 - (i % 3) * 9);
      cupCtx.stroke();
    }
    const drawEnamelFlake = (cx, cy, rx, ry, seed) => {
      cupCtx.save();
      cupCtx.translate(cx, cy);
      cupCtx.beginPath();
      for (let i = 0; i < 18; i++) {
        const angle = i / 18 * Math.PI * 2;
        const jitter = 0.72 + ((i * 17 + seed * 13) % 31) / 100;
        const x = Math.cos(angle) * rx * jitter;
        const y = Math.sin(angle) * ry * (0.76 + ((i * 11 + seed * 7) % 27) / 100);
        if (i === 0) cupCtx.moveTo(x, y); else cupCtx.lineTo(x, y);
      }
      cupCtx.closePath();
      cupCtx.fillStyle = '#30231d';
      cupCtx.fill();
      cupCtx.lineWidth = 9;
      cupCtx.strokeStyle = '#8d7158';
      cupCtx.stroke();
      cupCtx.scale(0.78, 0.72);
      cupCtx.fillStyle = '#713a24';
      cupCtx.fill();
      cupCtx.globalAlpha = 0.68;
      cupCtx.fillStyle = '#b26734';
      for (let i = 0; i < 14; i++) {
        const angle = i * 2.17 + seed;
        cupCtx.beginPath();
        cupCtx.arc(Math.cos(angle) * rx * 0.58, Math.sin(angle) * ry * 0.5, 3 + i % 7, 0, Math.PI * 2);
        cupCtx.fill();
      }
      cupCtx.restore();
    };
    [
      [95, 820, 145, 104], [330, 915, 205, 128], [620, 805, 128, 92],
      [905, 936, 168, 92], [1280, 860, 196, 120], [1640, 930, 224, 132],
      [1950, 760, 142, 108], [1760, 330, 86, 68], [520, 260, 72, 56],
      [170, 470, 82, 66], [780, 620, 110, 76], [1460, 535, 126, 90]
    ].forEach(([cx, cy, rx, ry], index) => drawEnamelFlake(cx, cy, rx, ry, index + 1));
    const labelX = cupCanvas.width / 2;
    const labelY = 410;
    cupCtx.save();
    cupCtx.translate(labelX, labelY);
    cupCtx.fillStyle = '#96352c';
    cupCtx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const radius = i % 2 === 0 ? 132 : 54;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) cupCtx.moveTo(x, y); else cupCtx.lineTo(x, y);
    }
    cupCtx.closePath();
    cupCtx.fill();
    cupCtx.font = 'bold 72px "STKaiti", "KaiTi", serif';
    cupCtx.textAlign = 'center';
    cupCtx.fillText('为人民服务', 0, 230);
    cupCtx.restore();
    cupCtx.fillStyle = 'rgba(76, 55, 38, 0.14)';
    cupCtx.fillRect(0, 0, cupCanvas.width, cupCanvas.height);
    cupCtx.lineCap = 'round';
    for (let i = 0; i < 76; i++) {
      const x = 690 + (i * 109) % 690;
      const y = 175 + (i * 67) % 520;
      cupCtx.strokeStyle = i % 4 === 0 ? 'rgba(66,39,27,0.76)' : 'rgba(214,205,187,0.88)';
      cupCtx.lineWidth = 2 + i % 5;
      cupCtx.beginPath();
      cupCtx.moveTo(x, y);
      cupCtx.lineTo(x + 10 + i % 44, y + i % 7 - 3);
      cupCtx.stroke();
    }
    for (let i = 0; i < 22; i++) {
      const x = 760 + (i * 131) % 520;
      const y = 245 + (i * 83) % 420;
      cupCtx.fillStyle = i % 3 === 0 ? '#543024' : '#b8ad99';
      cupCtx.beginPath();
      cupCtx.ellipse(x, y, 5 + i % 13, 3 + i % 8, i * 0.37, 0, Math.PI * 2);
      cupCtx.fill();
    }
    const chipColor = '#43281f';
    cupCtx.fillStyle = chipColor;
    for (let i = 0; i < 34; i++) {
      const x = (i * 163) % cupCanvas.width;
      const y = 900 + (i % 5) * 18;
      cupCtx.beginPath();
      cupCtx.ellipse(x, y, 8 + i % 13, 5 + i % 8, i * 0.3, 0, Math.PI * 2);
      cupCtx.fill();
    }
    const cupTexture = makeTexture(cupCanvas);
    const cupBump = makeTexture(cupCanvas, { colorSpace: false });
    const enamel = new THREE.MeshPhysicalMaterial({
      color: '#bfb5a4', map: cupTexture, bumpMap: cupBump, bumpScale: 0.032,
      roughness: 0.78, metalness: 0.16, clearcoat: 0.018,
      clearcoatRoughness: 0.94, side: THREE.DoubleSide
    });
    const innerEnamel = new THREE.MeshPhysicalMaterial({
      color: '#aaa08f', roughness: 0.82, metalness: 0.1,
      clearcoat: 0.015, clearcoatRoughness: 0.94, side: THREE.DoubleSide
    });
    const blueEnamel = new THREE.MeshPhysicalMaterial({
      color: '#14213d', roughness: 0.78, metalness: 0.24,
      clearcoat: 0.015, clearcoatRoughness: 0.92
    });
    const rust = new THREE.MeshStandardMaterial({ color: '#522a1c', roughness: 0.96, metalness: 0.3 });
    const handleTexture = cupTexture.clone();
    handleTexture.repeat.set(0.19, 1);
    handleTexture.offset.set(0.02, 0);
    handleTexture.needsUpdate = true;
    const handleBump = cupBump.clone();
    handleBump.repeat.set(0.19, 1);
    handleBump.offset.set(0.02, 0);
    handleBump.needsUpdate = true;
    const handleEnamel = new THREE.MeshPhysicalMaterial({
      color: '#b9ae9d', map: handleTexture, bumpMap: handleBump, bumpScale: 0.027,
      roughness: 0.8, metalness: 0.15, clearcoat: 0.012, clearcoatRoughness: 0.94
    });
    const cupX = 0.67;
    const cupY = -0.25;
    const cupZ = 0.34;
    const cupGeometry = new THREE.CylinderGeometry(0.215, 0.18, 0.54, 128, 16, true);
    const cupPositions = cupGeometry.getAttribute('position');
    for (let i = 0; i < cupPositions.count; i++) {
      const x = cupPositions.getX(i);
      const y = cupPositions.getY(i);
      const z = cupPositions.getZ(i);
      const angle = Math.atan2(x, z);
      const dentA = Math.exp(-Math.pow((angle - 1.02) / 0.2, 2) - Math.pow((y + 0.08) / 0.11, 2));
      const dentB = Math.exp(-Math.pow((angle + 1.8) / 0.17, 2) - Math.pow((y - 0.12) / 0.08, 2));
      const radialScale = 1 - dentA * 0.055 - dentB * 0.035;
      cupPositions.setXYZ(i, x * radialScale, y, z * radialScale);
    }
    cupGeometry.computeVertexNormals();
    const cup = new THREE.Mesh(cupGeometry, enamel);
    cup.position.set(cupX, cupY, cupZ);
    cup.rotation.y = Math.PI;
    cup.castShadow = true;
    cup.receiveShadow = true;
    group.add(cup);
    const innerWall = new THREE.Mesh(new THREE.CylinderGeometry(0.187, 0.162, 0.515, 96, 6, true), innerEnamel);
    innerWall.position.set(cupX, cupY + 0.004, cupZ);
    innerWall.castShadow = true;
    group.add(innerWall);
    const cupBottom = new THREE.Mesh(new THREE.CircleGeometry(0.162, 72), innerEnamel);
    cupBottom.position.set(cupX, cupY - 0.255, cupZ);
    cupBottom.rotation.x = -Math.PI / 2;
    group.add(cupBottom);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.016, 12, 96), blueEnamel);
    rim.position.set(cupX, cupY + 0.27, cupZ);
    rim.rotation.x = Math.PI / 2;
    rim.castShadow = true;
    group.add(rim);
    const foot = new THREE.Mesh(new THREE.TorusGeometry(0.177, 0.013, 10, 80), rust);
    foot.position.set(cupX, cupY - 0.27, cupZ);
    foot.rotation.x = Math.PI / 2;
    group.add(foot);

    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(cupX + 0.198, cupY + 0.15, cupZ),
      new THREE.Vector3(cupX + 0.35, cupY + 0.14, cupZ),
      new THREE.Vector3(cupX + 0.39, cupY - 0.08, cupZ),
      new THREE.Vector3(cupX + 0.335, cupY - 0.17, cupZ),
      new THREE.Vector3(cupX + 0.185, cupY - 0.17, cupZ)
    ]);
    const handle = new THREE.Mesh(new THREE.TubeGeometry(handleCurve, 72, 0.022, 16, false), handleEnamel);
    handle.castShadow = true;
    group.add(handle);
    for (const y of [cupY + 0.145, cupY - 0.17]) {
      const handleSocket = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.065, 20), handleEnamel);
      handleSocket.position.set(cupX + 0.19, y, cupZ);
      handleSocket.rotation.z = Math.PI / 2;
      group.add(handleSocket);
    }
    for (const y of [cupY + 0.145, cupY - 0.17]) {
      const rustCollar = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.006, 8, 22), rust);
      rustCollar.position.set(cupX + 0.205, y, cupZ);
      rustCollar.rotation.y = Math.PI / 2;
      group.add(rustCollar);
    }

    const coolLight = new THREE.PointLight('#dce6ef', 0.38, 3.2);
    coolLight.position.set(-0.4, 1.0, 1.25);
    group.add(coolLight);
    const warmLight = new THREE.PointLight('#f2cf9d', 0.28, 2.8);
    warmLight.position.set(0.85, 0.65, 0.85);
    group.add(warmLight);

    group.rotation.x = -0.035;
    group.rotation.y = -0.055;
    return group;
  }

  createCassetteTicketArtifact() {
    const group = new THREE.Group();
    const maxAnisotropy = Math.min(12, this.renderer?.capabilities?.getMaxAnisotropy?.() || 8);
    const bodyCanvas = document.createElement('canvas');
    bodyCanvas.width = 1024;
    bodyCanvas.height = 1024;
    const bodyCtx = bodyCanvas.getContext('2d');
    const plasticGradient = bodyCtx.createLinearGradient(0, 0, 1024, 1024);
    plasticGradient.addColorStop(0, '#d1c9b2');
    plasticGradient.addColorStop(0.32, '#bdb49d');
    plasticGradient.addColorStop(0.68, '#a49b84');
    plasticGradient.addColorStop(1, '#847b68');
    bodyCtx.fillStyle = plasticGradient;
    bodyCtx.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 980; i++) {
      const x = (i * 167 + i % 19 * 41) % 1024;
      const y = (i * 293 + i % 23 * 31) % 1024;
      const v = 48 + (i % 7) * 9;
      bodyCtx.fillStyle = i % 6 === 0
        ? `rgba(55,43,32,${0.08 + i % 5 * 0.018})`
        : `rgba(${v + 63},${v + 58},${v + 43},${0.032 + i % 4 * 0.014})`;
      bodyCtx.beginPath();
      bodyCtx.arc(x, y, 0.8 + (i % 7) * 0.65, 0, Math.PI * 2);
      bodyCtx.fill();
    }
    bodyCtx.lineCap = 'round';
    for (let i = 0; i < 160; i++) {
      const x = (i * 197) % 1024;
      const y = (i * 331) % 1024;
      bodyCtx.strokeStyle = i % 5 === 0 ? 'rgba(225,219,190,0.31)' : 'rgba(48,39,31,0.35)';
      bodyCtx.lineWidth = 0.8 + i % 4 * 0.65;
      bodyCtx.beginPath();
      bodyCtx.moveTo(x, y);
      bodyCtx.lineTo(x + 18 + (i % 9) * 13, y + i % 7 - 3);
      bodyCtx.stroke();
    }
    for (let i = 0; i < 14; i++) {
      const x = (i * 271 + 110) % 1024;
      const y = (i * 183 + 90) % 1024;
      const grime = bodyCtx.createRadialGradient(x, y, 4, x, y, 34 + i % 5 * 18);
      grime.addColorStop(0, 'rgba(24,20,16,0.34)');
      grime.addColorStop(1, 'rgba(24,20,16,0)');
      bodyCtx.fillStyle = grime;
      bodyCtx.fillRect(x - 120, y - 120, 240, 240);
    }
    const bodyTexture = new THREE.CanvasTexture(bodyCanvas);
    bodyTexture.colorSpace = THREE.SRGBColorSpace;
    bodyTexture.wrapS = THREE.RepeatWrapping;
    bodyTexture.wrapT = THREE.RepeatWrapping;
    bodyTexture.repeat.set(1.25, 1.05);
    bodyTexture.anisotropy = maxAnisotropy;

    const shell = new THREE.MeshStandardMaterial({
      color: '#f2eee3', map: bodyTexture, bumpMap: bodyTexture,
      bumpScale: 0.026, roughness: 0.9, metalness: 0.025
    });
    const edge = new THREE.MeshStandardMaterial({ color: '#888173', map: bodyTexture, bumpMap: bodyTexture, bumpScale: 0.018, roughness: 0.86, metalness: 0.08 });
    const black = new THREE.MeshStandardMaterial({ color: '#292824', roughness: 0.8, metalness: 0.3 });
    const recessedMetal = new THREE.MeshStandardMaterial({ color: '#403e37', roughness: 0.82, metalness: 0.45, side: THREE.DoubleSide });
    const blackGlass = new THREE.MeshPhysicalMaterial({
      color: '#46443d', roughness: 0.38, metalness: 0.12,
      transparent: true, opacity: 0.64, clearcoat: 0.18, clearcoatRoughness: 0.64
    });
    const wornRed = new THREE.MeshStandardMaterial({ color: '#71352c', roughness: 0.9, metalness: 0.12 });

    const body = new THREE.Mesh(new RoundedBoxGeometry(1.75, 1.0, 0.32, 7, 0.065), shell);
    body.position.y = 0.2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const rearCase = new THREE.Mesh(new RoundedBoxGeometry(1.69, 0.94, 0.19, 6, 0.05), edge);
    rearCase.position.set(0, 0.2, -0.19);
    rearCase.castShadow = true;
    group.add(rearCase);

    // Left perforated speaker grille with real tunnel depth and a dark acoustic cavity.
    const speakerCavity = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.06, 72), recessedMetal);
    speakerCavity.position.set(-0.54, 0.255, 0.1);
    speakerCavity.rotation.x = Math.PI / 2;
    group.add(speakerCavity);
    const speakerPanel = new THREE.Mesh(new RoundedBoxGeometry(0.57, 0.64, 0.025, 8, 0.035), shell);
    speakerPanel.position.set(-0.54, 0.255, 0.145);
    speakerPanel.receiveShadow = true;
    group.add(speakerPanel);
    const holeCountX = 13;
    const holeCountY = 15;
    const holeTunnelGeometry = new THREE.CylinderGeometry(0.0105, 0.0105, 0.038, 16, 1, true);
    holeTunnelGeometry.rotateX(Math.PI / 2);
    const holeBackGeometry = new THREE.CircleGeometry(0.0105, 16);
    const holeTunnels = new THREE.InstancedMesh(holeTunnelGeometry, recessedMetal, holeCountX * holeCountY);
    const holeBacks = new THREE.InstancedMesh(holeBackGeometry, new THREE.MeshBasicMaterial({ color: '#070807' }), holeCountX * holeCountY);
    const holeMatrix = new THREE.Matrix4();
    let holeIndex = 0;
    for (let row = 0; row < holeCountY; row++) {
      for (let col = 0; col < holeCountX; col++) {
        const x = -0.798 + col * 0.043;
        const y = -0.045 + row * 0.043;
        holeMatrix.makeTranslation(x, y, 0.142);
        holeTunnels.setMatrixAt(holeIndex, holeMatrix);
        holeMatrix.makeTranslation(x, y, 0.16035);
        holeBacks.setMatrixAt(holeIndex, holeMatrix);
        holeIndex++;
      }
    }
    holeTunnels.instanceMatrix.needsUpdate = true;
    holeBacks.instanceMatrix.needsUpdate = true;
    holeTunnels.castShadow = false;
    group.add(holeTunnels, holeBacks);

    // Lower microphone vent.
    const ventPanel = new THREE.Mesh(new RoundedBoxGeometry(0.38, 0.16, 0.022, 5, 0.025), shell);
    ventPanel.position.set(-0.61, -0.18, 0.146);
    group.add(ventPanel);
    for (let i = 0; i < 5; i++) {
      const slit = new THREE.Mesh(new RoundedBoxGeometry(0.29, 0.013, 0.002, 3, 0.004), black);
      slit.position.set(-0.61, -0.225 + i * 0.025, 0.16035);
      slit.castShadow = false;
      group.add(slit);
    }

    // Cassette bay has a deep cavity, a thick clear door and a complete cassette inside.
    const bayCavity = new THREE.Mesh(new RoundedBoxGeometry(0.91, 0.65, 0.12, 8, 0.05), recessedMetal);
    bayCavity.position.set(0.35, 0.265, 0.105);
    bayCavity.castShadow = true;
    group.add(bayCavity);
    const bay = new THREE.Mesh(new RoundedBoxGeometry(0.89, 0.63, 0.032, 8, 0.045), edge);
    bay.position.set(0.35, 0.265, 0.142);
    bay.castShadow = true;
    group.add(bay);
    const bayFace = new THREE.Mesh(new RoundedBoxGeometry(0.83, 0.57, 0.026, 8, 0.038), shell);
    bayFace.position.set(0.35, 0.265, 0.157);
    group.add(bayFace);

    const cassettePlastic = new THREE.MeshPhysicalMaterial({
      color: '#4a4b43', roughness: 0.45, metalness: 0.04,
      transparent: true, opacity: 0.76, clearcoat: 0.12, clearcoatRoughness: 0.66
    });
    const amberTape = new THREE.MeshPhysicalMaterial({
      color: '#c66b2d', emissive: '#6d2d0f', emissiveIntensity: 0.06,
      roughness: 0.46, metalness: 0.02, transparent: true, opacity: 0.72,
      clearcoat: 0.16, clearcoatRoughness: 0.58
    });
    const cassetteBody = new THREE.Mesh(new RoundedBoxGeometry(0.66, 0.3, 0.034, 7, 0.032), cassettePlastic);
    cassetteBody.position.set(0.35, 0.295, 0.145);
    cassetteBody.castShadow = true;
    group.add(cassetteBody);
    const reelIvory = new THREE.MeshStandardMaterial({
      color: '#d8d1bd', roughness: 0.58, metalness: 0.12
    });
    const reelEdge = new THREE.MeshStandardMaterial({
      color: '#aaa48f', roughness: 0.64, metalness: 0.2
    });
    const reelCavity = new THREE.MeshStandardMaterial({
      color: '#171815', roughness: 0.82, metalness: 0.18
    });
    const reelSpindle = new THREE.MeshStandardMaterial({
      color: '#080907', roughness: 0.38, metalness: 0.58
    });
    for (const x of [0.16, 0.54]) {
      const tapePack = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.018, 16, 72), amberTape);
      tapePack.position.set(x, 0.315, 0.158);
      tapePack.castShadow = true;
      group.add(tapePack);

      // Thick ivory reel frame, matching the pale six-point drive holes in the reference.
      const reelOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.014, 64), reelEdge);
      reelOuter.position.set(x, 0.315, 0.154);
      reelOuter.rotation.x = Math.PI / 2;
      reelOuter.castShadow = true;
      group.add(reelOuter);

      const whiteFrame = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.01, 18, 72), reelIvory);
      whiteFrame.position.set(x, 0.315, 0.168);
      whiteFrame.castShadow = true;
      group.add(whiteFrame);

      const innerOpening = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.009, 48), reelCavity);
      innerOpening.position.set(x, 0.315, 0.166);
      innerOpening.rotation.x = Math.PI / 2;
      group.add(innerOpening);

      const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0045, 12, 48), reelIvory);
      innerRing.position.set(x, 0.315, 0.172);
      group.add(innerRing);

      // The black spindle core remains exposed; the six ivory drive lugs stop short of it.
      const reelHub = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.016, 32), reelSpindle);
      reelHub.position.set(x, 0.315, 0.174);
      reelHub.rotation.x = Math.PI / 2;
      reelHub.castShadow = true;
      group.add(reelHub);

      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        const driveLug = new THREE.Mesh(new RoundedBoxGeometry(0.011, 0.014, 0.009, 3, 0.0035), reelIvory);
        driveLug.position.set(
          x + Math.cos(angle) * 0.031,
          0.315 + Math.sin(angle) * 0.031,
          0.174
        );
        driveLug.rotation.z = angle - Math.PI / 2;
        driveLug.castShadow = true;
        group.add(driveLug);
      }
    }
    for (const y of [0.24, 0.39]) {
      const tapeSpan = new THREE.Mesh(new RoundedBoxGeometry(0.38, 0.012, 0.018, 3, 0.004), amberTape);
      tapeSpan.position.set(0.35, y, 0.162);
      group.add(tapeSpan);
    }
    const tapeLabel = new THREE.Mesh(new RoundedBoxGeometry(0.63, 0.064, 0.014, 3, 0.008), wornRed);
    tapeLabel.position.set(0.35, 0.187, 0.164);
    group.add(tapeLabel);
    for (let i = 0; i < 15; i++) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.025 + (i % 5 === 0 ? 0.018 : 0), 0.008), new THREE.MeshStandardMaterial({ color: '#b9b19f', roughness: 0.62, metalness: 0.25 }));
      tick.position.set(0.18 + i * 0.024, 0.345, 0.169);
      group.add(tick);
    }
    const window = new THREE.Mesh(new RoundedBoxGeometry(0.69, 0.33, 0.012, 8, 0.034), blackGlass);
    window.position.set(0.35, 0.295, 0.176);
    window.renderOrder = 4;
    window.castShadow = true;
    group.add(window);

    // Six shallow mechanical controls, only slightly proud of the recorder fascia.
    const controlRecess = new THREE.Mesh(new RoundedBoxGeometry(0.94, 0.205, 0.018, 6, 0.022), recessedMetal);
    controlRecess.position.set(0.39, -0.2, 0.149);
    group.add(controlRecess);
    const buttonColors = ['#713127', '#242423', '#242423', '#242423', '#242423', '#242423'];
    for (let i = 0; i < 6; i++) {
      const control = new THREE.Group();
      control.position.set(0.03 + i * 0.145, -0.2, 0.15);
      control.rotation.x = -0.035 + (i % 3) * 0.018;
      const button = new THREE.Mesh(
        new RoundedBoxGeometry(0.125, 0.15, 0.034, 6, 0.018),
        new THREE.MeshStandardMaterial({ color: buttonColors[i], roughness: 0.75, metalness: 0.14 })
      );
      button.castShadow = true;
      control.add(button);
      const wornCap = new THREE.Mesh(
        new RoundedBoxGeometry(0.103, 0.126, 0.008, 5, 0.013),
        new THREE.MeshStandardMaterial({
          color: i === 0 ? '#8f4032' : '#34342f',
          roughness: 0.83,
          metalness: 0.18
        })
      );
      wornCap.position.z = 0.021;
      wornCap.castShadow = true;
      control.add(wornCap);
      const icon = new THREE.Mesh(
        i === 0 ? new THREE.CylinderGeometry(0.018, 0.018, 0.005, 24) : new RoundedBoxGeometry(0.03, 0.026, 0.004, 2, 0.004),
        new THREE.MeshStandardMaterial({ color: i === 0 ? '#4a1814' : '#aaa593', roughness: 0.72, metalness: 0.36 })
      );
      icon.position.set(0, 0.006, 0.028);
      if (i === 0) icon.rotation.x = Math.PI / 2;
      if (i === 3 || i === 4) icon.scale.y = 0.45;
      control.add(icon);
      group.add(control);
    }

    // Brand and model marks above the controls.
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 1024;
    labelCanvas.height = 128;
    const labelCtx = labelCanvas.getContext('2d');
    labelCtx.clearRect(0, 0, 1024, 128);
    labelCtx.fillStyle = '#40392f';
    labelCtx.font = '700 42px "Noto Serif SC", "Songti SC", serif';
    labelCtx.fillText('珠 江 牌  501型', 28, 72);
    labelCtx.fillText('盒式录音机', 720, 72);
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    labelTexture.colorSpace = THREE.SRGBColorSpace;
    const labelPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.52, 0.12),
      new THREE.MeshBasicMaterial({
        map: labelTexture, transparent: true, alphaTest: 0.02,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
      })
    );
    labelPlane.position.set(0, 0.61, 0.1602);
    labelPlane.renderOrder = 2;
    group.add(labelPlane);

    const controlLabelCanvas = document.createElement('canvas');
    controlLabelCanvas.width = 1024;
    controlLabelCanvas.height = 128;
    const controlLabelCtx = controlLabelCanvas.getContext('2d');
    controlLabelCtx.clearRect(0, 0, 1024, 128);
    controlLabelCtx.fillStyle = '#463e32';
    controlLabelCtx.textAlign = 'center';
    controlLabelCtx.font = '700 36px "Noto Serif SC", "Songti SC", serif';
    ['话筒', '录音', '播放', '快进', '停止', '弹出'].forEach((text, index) => {
      controlLabelCtx.fillText(text, 95 + index * 166, 78);
    });
    const controlLabelTexture = new THREE.CanvasTexture(controlLabelCanvas);
    controlLabelTexture.colorSpace = THREE.SRGBColorSpace;
    const controlLabelPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.94, 0.075),
      new THREE.MeshBasicMaterial({
        map: controlLabelTexture, transparent: true, alphaTest: 0.02,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
      })
    );
    controlLabelPlane.position.set(0.39, -0.087, 0.1602);
    controlLabelPlane.renderOrder = 2;
    group.add(controlLabelPlane);

    // Slim top carry handle, kept close to the silhouette in the reference.
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.55, 0.71, -0.08), new THREE.Vector3(-0.48, 0.88, -0.08),
      new THREE.Vector3(0.48, 0.88, -0.08), new THREE.Vector3(0.55, 0.71, -0.08)
    ]);
    group.add(new THREE.Mesh(new THREE.TubeGeometry(handleCurve, 36, 0.028, 10, false), edge));

    // Keep the recorder as one rigid assembly so the reference objects can be laid out beside it.
    const recorderAssembly = new THREE.Group();
    [...group.children].forEach((child) => recorderAssembly.add(child));
    recorderAssembly.position.set(-0.25, 0.31, 0);
    group.add(recorderAssembly);

    const createPrintedTexture = (width, height, draw) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      draw(ctx, width, height);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = maxAnisotropy;
      return texture;
    };
    const drawPaperFibers = (ctx, width, height, dark = false) => {
      ctx.lineCap = 'round';
      for (let i = 0; i < 1150; i++) {
        const x = (i * 97 + i % 17 * 23) % width;
        const y = (i * 181 + i % 29 * 13) % height;
        ctx.strokeStyle = dark
          ? `rgba(230,190,125,${0.025 + i % 5 * 0.01})`
          : `rgba(74,58,39,${0.018 + i % 6 * 0.009})`;
        ctx.lineWidth = 0.5 + i % 3 * 0.45;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 4 + i % 16, y + (i % 5 - 2) * 0.5);
        ctx.stroke();
      }
    };

    // Label on the cassette visible behind the recorder door.
    const tapeStripTexture = createPrintedTexture(900, 120, (ctx, width, height) => {
      ctx.fillStyle = '#7d3c31';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#c8b58b';
      ctx.textAlign = 'center';
      ctx.font = '700 54px "Noto Serif SC", "Songti SC", serif';
      ctx.fillText('中 国 唱 片 总 公 司', width / 2, 78);
    });
    wornRed.map = tapeStripTexture;
    wornRed.color.set('#ffffff');
    wornRed.needsUpdate = true;

    // Separate China Record C-90 case from the reference, with a real clear shell and thick insert.
    const recordCaseTexture = createPrintedTexture(820, 1280, (ctx, width, height) => {
      const insertGradient = ctx.createLinearGradient(0, 0, width, height);
      insertGradient.addColorStop(0, '#292824');
      insertGradient.addColorStop(0.55, '#1f201d');
      insertGradient.addColorStop(1, '#151613');
      ctx.fillStyle = insertGradient;
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = i % 4 === 0 ? 'rgba(210,184,133,0.1)' : 'rgba(0,0,0,0.16)';
        ctx.fillRect((i * 113) % width, (i * 197) % height, 1 + i % 6, 1 + i % 4);
      }
      ctx.strokeStyle = 'rgba(191,164,105,0.6)';
      ctx.lineWidth = 5;
      ctx.strokeRect(35, 34, width - 70, height - 68);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#bda36c';
      ctx.font = '700 82px "Noto Serif SC", "Songti SC", serif';
      ctx.fillText('中 国 唱 片', width / 2, 235);
      ctx.font = '700 47px Arial, sans-serif';
      ctx.fillText('CHINA RECORD', width / 2, 315);
      ctx.font = '700 78px Arial, sans-serif';
      ctx.fillText('C-90', width / 2, 545);
      ctx.font = '28px Arial, sans-serif';
      ctx.fillText('TYPE I (NORMAL) POSITION', width / 2, 615);
      ctx.fillStyle = '#944430';
      ctx.fillRect(45, 930, width - 90, 42);
      ctx.fillStyle = '#ac8c54';
      ctx.fillRect(45, 987, width - 90, 34);
    });
    const caseEdgeMaterial = new THREE.MeshStandardMaterial({ color: '#756f61', roughness: 0.72, metalness: 0.08 });
    const caseInsertMaterial = new THREE.MeshStandardMaterial({ map: recordCaseTexture, bumpMap: recordCaseTexture, bumpScale: 0.006, roughness: 0.82 });
    const caseInsert = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.84, 0.042),
      [caseEdgeMaterial, caseEdgeMaterial, caseEdgeMaterial, caseEdgeMaterial, caseInsertMaterial, caseEdgeMaterial]
    );
    caseInsert.castShadow = true;
    const clearCaseMaterial = new THREE.MeshPhysicalMaterial({
      color: '#c9c3b2', roughness: 0.32, metalness: 0.0,
      transparent: true, opacity: 0.28, transmission: 0.18,
      clearcoat: 0.75, clearcoatRoughness: 0.28, side: THREE.DoubleSide
    });
    const clearCase = new THREE.Mesh(new RoundedBoxGeometry(0.54, 0.91, 0.085, 7, 0.025), clearCaseMaterial);
    clearCase.castShadow = true;
    const chinaRecordCase = new THREE.Group();
    chinaRecordCase.add(caseInsert, clearCase);
    chinaRecordCase.position.set(0.98, 0.43, 0.18);
    chinaRecordCase.rotation.set(-0.015, -0.055, -0.012);
    group.add(chinaRecordCase);

    // 1988 Guangzhou-Beijing hard-card ticket with physical thickness and a bent fold.
    const ticketTexture = createPrintedTexture(1400, 520, (ctx, width, height) => {
      const paper = ctx.createLinearGradient(0, 0, width, height);
      paper.addColorStop(0, '#a8b49d');
      paper.addColorStop(0.5, '#879982');
      paper.addColorStop(1, '#667961');
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, width, height);
      drawPaperFibers(ctx, width, height);
      const edgeFade = ctx.createLinearGradient(0, 0, width, 0);
      edgeFade.addColorStop(0, 'rgba(92,67,37,0.48)');
      edgeFade.addColorStop(0.07, 'rgba(92,67,37,0)');
      edgeFade.addColorStop(0.92, 'rgba(92,67,37,0)');
      edgeFade.addColorStop(1, 'rgba(92,67,37,0.52)');
      ctx.fillStyle = edgeFade;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(54,65,48,0.78)';
      ctx.lineWidth = 9;
      ctx.strokeRect(24, 24, width - 48, height - 48);
      ctx.fillStyle = 'rgba(24,45,31,0.86)';
      ctx.textAlign = 'left';
      ctx.font = '48px "STKaiti", "KaiTi", serif';
      ctx.fillText('京广线', 90, 98);
      ctx.textAlign = 'right';
      ctx.fillText('0152次', width - 90, 98);
      ctx.textAlign = 'center';
      ctx.font = '700 72px "STKaiti", "KaiTi", serif';
      ctx.fillText('北  京   →   广  州', width * 0.5, 205);
      ctx.font = '48px "STKaiti", "KaiTi", serif';
      ctx.textAlign = 'left';
      ctx.fillText('北京  08:20开', 95, 300);
      ctx.textAlign = 'right';
      ctx.fillText('广州  19:30到', width - 95, 300);
      ctx.textAlign = 'left';
      ctx.fillText('硬座  ¥54.00', 95, 392);
      ctx.textAlign = 'right';
      ctx.fillText('03车  028号', width - 95, 392);
      ctx.textAlign = 'left';
      ctx.font = '43px "STKaiti", "KaiTi", serif';
      ctx.fillText('1988年 6月12日   有效', 95, 470);
      ctx.strokeStyle = 'rgba(75,66,48,0.38)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(width * 0.58, 16);
      ctx.quadraticCurveTo(width * 0.565, height * 0.52, width * 0.59, height - 18);
      ctx.stroke();
    });
    const ticketEdge = new THREE.MeshStandardMaterial({ color: '#6f745f', roughness: 0.98, metalness: 0.0 });
    const ticketFrontMaterial = new THREE.MeshStandardMaterial({ map: ticketTexture, bumpMap: ticketTexture, bumpScale: 0.009, roughness: 0.96, metalness: 0.0 });
    const ticketBackMaterial = new THREE.MeshStandardMaterial({ color: '#7b876f', map: ticketTexture, bumpMap: ticketTexture, bumpScale: 0.007, roughness: 0.98 });
    const ticketGeometry = new THREE.BoxGeometry(1.26, 0.48, 0.035, 12, 4, 1);
    const ticketPosition = ticketGeometry.attributes.position;
    for (let i = 0; i < ticketPosition.count; i++) {
      const x = ticketPosition.getX(i);
      const y = ticketPosition.getY(i);
      const z = ticketPosition.getZ(i);
      ticketPosition.setZ(i, z + Math.sin((x + 0.62) * 6.2) * 0.006 + y * 0.012);
    }
    ticketPosition.needsUpdate = true;
    ticketGeometry.computeVertexNormals();
    const ticket = new THREE.Mesh(ticketGeometry, [ticketEdge, ticketEdge, ticketEdge, ticketEdge, ticketFrontMaterial, ticketBackMaterial]);
    ticket.position.set(-0.485, -0.48, 0.29);
    ticket.rotation.set(-0.045, -0.07, -0.032);
    ticket.castShadow = true;
    ticket.receiveShadow = true;
    group.add(ticket);

    // Rusted reform-era slogan plate, including raised bolts and pitted metal.
    const signTexture = createPrintedTexture(1200, 520, (ctx, width, height) => {
      const rust = ctx.createLinearGradient(0, 0, width, height);
      rust.addColorStop(0, '#7d6547');
      rust.addColorStop(0.12, '#b4a27f');
      rust.addColorStop(0.58, '#c0ad88');
      rust.addColorStop(0.9, '#9a8060');
      rust.addColorStop(1, '#634832');
      ctx.fillStyle = rust;
      ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 380; i++) {
        const x = (i * 137) % width;
        const y = (i * 223) % height;
        ctx.fillStyle = i % 4 === 0 ? 'rgba(57,35,24,0.38)' : 'rgba(151,74,35,0.2)';
        ctx.beginPath();
        ctx.arc(x, y, 2 + i % 13, 0, Math.PI * 2);
        ctx.fill();
      }
      drawPaperFibers(ctx, width, height, true);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(143,49,31,0.88)';
      ctx.font = '700 78px "STKaiti", "KaiTi", serif';
      ctx.fillText('时间就是金钱', width / 2, 210);
      ctx.font = '700 67px "STKaiti", "KaiTi", serif';
      ctx.fillText('效率就是生命', width / 2, 350);
    });
    const signMaterial = new THREE.MeshStandardMaterial({ map: signTexture, bumpMap: signTexture, bumpScale: 0.026, color: '#ffffff', roughness: 0.92, metalness: 0.32 });
    const signEdge = new THREE.MeshStandardMaterial({ color: '#3c2a20', map: signTexture, bumpMap: signTexture, bumpScale: 0.025, roughness: 0.9, metalness: 0.62 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.34, 0.045), [signEdge, signEdge, signEdge, signEdge, signMaterial, signEdge]);
    sign.position.set(-0.575, -0.95, 0.286);
    sign.rotation.set(-0.03, 0.08, 0.015);
    sign.castShadow = true;
    group.add(sign);
    const boltMaterial = new THREE.MeshStandardMaterial({ color: '#30251d', roughness: 0.72, metalness: 0.78 });
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.018, 20, 12), boltMaterial);
        bolt.scale.z = 0.46;
        bolt.position.set(-0.575 + sx * 0.49, -0.95 + sy * 0.14, 0.317);
        group.add(bolt);
      }
    }

    // Yellowed factory work card with layered cardstock, fold and raised eyelet.
    const badgeTexture = createPrintedTexture(760, 1040, (ctx, width, height) => {
      const card = ctx.createLinearGradient(0, 0, width, height);
      card.addColorStop(0, '#c6b47f');
      card.addColorStop(0.6, '#9d8858');
      card.addColorStop(1, '#77613c');
      ctx.fillStyle = card;
      ctx.fillRect(0, 0, width, height);
      drawPaperFibers(ctx, width, height);
      ctx.strokeStyle = 'rgba(74,48,25,0.74)';
      ctx.lineWidth = 10;
      ctx.strokeRect(26, 28, width - 52, height - 56);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(72,38,22,0.84)';
      ctx.font = '700 90px "STKaiti", "KaiTi", serif';
      ctx.fillText('工作证', width / 2, 175);
      ctx.font = '48px "STKaiti", "KaiTi", serif';
      ctx.fillText('上海市国营红星机械厂', width / 2, 305);
      ctx.textAlign = 'left';
      ctx.font = '45px "STKaiti", "KaiTi", serif';
      ctx.fillText('姓 名', 88, 515);
      ctx.fillText('编 号', 88, 660);
      ctx.strokeStyle = 'rgba(72,38,22,0.66)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(250, 525);
      ctx.lineTo(width - 88, 525);
      ctx.moveTo(250, 670);
      ctx.lineTo(width - 88, 670);
      ctx.stroke();
      ctx.font = '74px "STKaiti", "KaiTi", serif';
      ctx.fillText('张 建 国', 300, 510);
      ctx.font = '64px "STKaiti", "KaiTi", serif';
      ctx.fillText('0 2 6 5 7', 300, 655);
      ctx.save();
      ctx.translate(width / 2, 835);
      ctx.fillStyle = 'rgba(139,51,31,0.78)';
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? 58 : 23;
        const angle = -Math.PI / 2 + i * Math.PI / 5;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(0, 920);
      ctx.lineTo(width, 895);
      ctx.stroke();
    });
    const badgeFace = new THREE.MeshStandardMaterial({ map: badgeTexture, bumpMap: badgeTexture, bumpScale: 0.012, roughness: 0.97 });
    const badgeEdge = new THREE.MeshStandardMaterial({ color: '#6f5735', roughness: 0.98 });
    const badge = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.91, 0.032), [badgeEdge, badgeEdge, badgeEdge, badgeEdge, badgeFace, badgeEdge]);
    badge.position.set(0.71, -0.695, 0.335);
    badge.rotation.set(-0.04, 0.11, -0.075);
    badge.castShadow = true;
    group.add(badge);
    const warmTopLight = new THREE.PointLight('#d99b60', 0.42, 4.2, 1.8);
    warmTopLight.position.set(-0.65, 1.35, 1.1);
    warmTopLight.castShadow = true;
    warmTopLight.shadow.mapSize.set(512, 512);
    group.add(warmTopLight);

    group.rotation.x = -0.025;
    return group;
  }

  createSmartphoneArtifact() {
    const group = new THREE.Group();
    const frame = new THREE.MeshStandardMaterial({
      color: '#595750', roughness: 0.48, metalness: 0.76
    });
    const wornEdge = new THREE.MeshStandardMaterial({
      color: '#817a6d', roughness: 0.58, metalness: 0.7
    });
    const frontFaceMaterial = new THREE.MeshPhysicalMaterial({
      color: '#080909', roughness: 0.16, metalness: 0.08,
      clearcoat: 1, clearcoatRoughness: 0.08
    });
    const rubber = new THREE.MeshStandardMaterial({
      color: '#111210', roughness: 0.78, metalness: 0.04
    });
    const lensGlass = new THREE.MeshPhysicalMaterial({
      color: '#101820', roughness: 0.12, metalness: 0.18,
      clearcoat: 1, clearcoatRoughness: 0.08
    });

    // Thick rounded metal chassis and inset black front panel match the early handset.
    const chassis = new THREE.Mesh(new RoundedBoxGeometry(1.08, 1.93, 0.19, 8, 0.075), frame);
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    group.add(chassis);

    const frontPanel = new THREE.Mesh(new RoundedBoxGeometry(1.015, 1.865, 0.075, 8, 0.06), frontFaceMaterial);
    frontPanel.position.z = 0.102;
    frontPanel.castShadow = true;
    group.add(frontPanel);

    const backPanel = new THREE.Mesh(new RoundedBoxGeometry(1.01, 1.86, 0.045, 8, 0.06), rubber);
    backPanel.position.z = -0.112;
    backPanel.castShadow = true;
    group.add(backPanel);

    // Slim but distinct side controls and bottom charging/audio details.
    const volumeKey = new THREE.Mesh(new RoundedBoxGeometry(0.035, 0.25, 0.075, 4, 0.012), wornEdge);
    volumeKey.position.set(-0.555, 0.35, 0.005);
    volumeKey.castShadow = true;
    group.add(volumeKey);
    const powerKey = new THREE.Mesh(new RoundedBoxGeometry(0.035, 0.15, 0.075, 4, 0.012), wornEdge);
    powerKey.position.set(0.555, 0.44, 0.005);
    powerKey.castShadow = true;
    group.add(powerKey);
    const chargePort = new THREE.Mesh(new RoundedBoxGeometry(0.25, 0.03, 0.085, 4, 0.01), rubber);
    chargePort.position.set(0, -0.975, 0.005);
    group.add(chargePort);
    for (const x of [-0.31, -0.26, 0.26, 0.31]) {
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.025, 12), rubber);
      vent.position.set(x, -0.976, 0.01);
      group.add(vent);
    }

    // Rear camera and flash remain visible when the visitor rotates the phone.
    const rearCameraRim = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.025, 40), wornEdge);
    rearCameraRim.rotation.x = Math.PI / 2;
    rearCameraRim.position.set(-0.31, 0.72, -0.148);
    group.add(rearCameraRim);
    const rearLens = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.029, 40), lensGlass);
    rearLens.rotation.x = Math.PI / 2;
    rearLens.position.set(-0.31, 0.72, -0.165);
    group.add(rearLens);
    const flash = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.018, 32), new THREE.MeshStandardMaterial({ color: '#d9d2a9', emissive: '#8d8155', emissiveIntensity: 0.25, roughness: 0.34 }));
    flash.rotation.x = Math.PI / 2;
    flash.position.set(-0.16, 0.72, -0.158);
    group.add(flash);

    let resolveReady;
    group.userData.readyPromise = new Promise((resolve) => { resolveReady = resolve; });
    const referenceImage = new Image();
    referenceImage.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 1600;
      const ctx = canvas.getContext('2d');
      const sx = Math.round(referenceImage.naturalWidth * 0.228);
      const sy = Math.round(referenceImage.naturalHeight * 0.032);
      const sw = Math.round(referenceImage.naturalWidth * 0.52);
      const sh = Math.round(referenceImage.naturalHeight * 0.925);
      ctx.drawImage(referenceImage, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const frontTexture = new THREE.CanvasTexture(canvas);
      frontTexture.colorSpace = THREE.SRGBColorSpace;
      frontTexture.wrapS = THREE.ClampToEdgeWrapping;
      frontTexture.wrapT = THREE.ClampToEdgeWrapping;
      frontTexture.anisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() || 8;
      frontFaceMaterial.map = frontTexture;
      frontFaceMaterial.color.set('#ffffff');
      frontFaceMaterial.needsUpdate = true;
      resolveReady();
    };
    referenceImage.onerror = () => resolveReady();
    referenceImage.src = './images/artifact-smartphone.png';

    group.rotation.x = -0.035;
    group.rotation.y = -0.12;
    return group;
  }

  createTeaScreenArtifact(mat) {
    const group = new THREE.Group();

    const surfaceY = 0.08;
    const maxAnisotropy = this.renderer?.capabilities?.getMaxAnisotropy?.() || 8;

    const woodCanvas = document.createElement('canvas');
    woodCanvas.width = 1024;
    woodCanvas.height = 512;
    const woodCtx = woodCanvas.getContext('2d');
    const woodGradient = woodCtx.createLinearGradient(0, 0, 0, 512);
    woodGradient.addColorStop(0, '#5a281c');
    woodGradient.addColorStop(0.46, '#321711');
    woodGradient.addColorStop(1, '#6b3524');
    woodCtx.fillStyle = woodGradient;
    woodCtx.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 112; i++) {
      const y = (i * 43) % 512;
      const offset = ((i * 17) % 21) - 10;
      woodCtx.strokeStyle = i % 4 === 0 ? 'rgba(18,7,4,0.42)' : 'rgba(190,111,71,0.18)';
      woodCtx.lineWidth = 0.8 + (i % 5) * 0.45;
      woodCtx.beginPath();
      woodCtx.moveTo(0, y);
      woodCtx.bezierCurveTo(250, y + offset, 720, y - offset * 0.7, 1024, y + offset * 0.25);
      woodCtx.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const x = 90 + ((i * 263) % 850);
      const y = 70 + ((i * 137) % 360);
      woodCtx.strokeStyle = 'rgba(24,9,5,0.48)';
      woodCtx.lineWidth = 3;
      woodCtx.beginPath();
      woodCtx.ellipse(x, y, 35 + (i % 3) * 10, 8 + (i % 2) * 4, 0, 0, Math.PI * 2);
      woodCtx.stroke();
    }
    for (let i = 0; i < 26; i++) {
      const x = 40 + ((i * 181) % 920);
      const y = 20 + ((i * 97) % 460);
      woodCtx.strokeStyle = 'rgba(231,173,124,0.12)';
      woodCtx.lineWidth = 1;
      woodCtx.beginPath();
      woodCtx.moveTo(x, y);
      woodCtx.lineTo(x + 28 + (i % 5) * 13, y + ((i % 3) - 1) * 5);
      woodCtx.stroke();
    }
    const woodTexture = new THREE.CanvasTexture(woodCanvas);
    woodTexture.colorSpace = THREE.SRGBColorSpace;
    woodTexture.wrapS = THREE.RepeatWrapping;
    woodTexture.wrapT = THREE.RepeatWrapping;
    woodTexture.repeat.set(1.45, 1.15);
    woodTexture.anisotropy = maxAnisotropy;
    const woodMat = new THREE.MeshStandardMaterial({
      color: '#6a3424',
      map: woodTexture,
      bumpMap: woodTexture,
      bumpScale: 0.026,
      roughness: 0.7,
      metalness: 0.02
    });
    const table = this.createBeveledBox(2.86, 0.16, 1.56, woodMat, 0.06, 8);
    table.position.set(0, 0, 0.04);
    table.castShadow = true;
    table.receiveShadow = true;
    group.add(table);

    const brushedCanvas = document.createElement('canvas');
    brushedCanvas.width = 512;
    brushedCanvas.height = 512;
    const brushedCtx = brushedCanvas.getContext('2d');
    const metalGradient = brushedCtx.createLinearGradient(0, 0, 512, 512);
    metalGradient.addColorStop(0, '#c8bd8d');
    metalGradient.addColorStop(0.48, '#9f9164');
    metalGradient.addColorStop(1, '#d1c69b');
    brushedCtx.fillStyle = metalGradient;
    brushedCtx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 180; i++) {
      const y = (i * 31) % 512;
      brushedCtx.strokeStyle = i % 3 ? 'rgba(255,248,214,0.12)' : 'rgba(65,57,35,0.1)';
      brushedCtx.lineWidth = 0.5 + (i % 2) * 0.5;
      brushedCtx.beginPath();
      brushedCtx.moveTo(0, y);
      brushedCtx.lineTo(512, y + (i % 5) - 2);
      brushedCtx.stroke();
    }
    const brushedTexture = new THREE.CanvasTexture(brushedCanvas);
    brushedTexture.colorSpace = THREE.SRGBColorSpace;
    brushedTexture.wrapS = THREE.RepeatWrapping;
    brushedTexture.wrapT = THREE.RepeatWrapping;
    brushedTexture.repeat.set(1.8, 1.2);
    brushedTexture.anisotropy = maxAnisotropy;
    const laptopBaseMat = new THREE.MeshPhysicalMaterial({
      color: '#b9aa77',
      map: brushedTexture,
      bumpMap: brushedTexture,
      bumpScale: 0.006,
      roughness: 0.29,
      metalness: 0.86,
      clearcoat: 0.18,
      clearcoatRoughness: 0.3
    });
    const laptopCenterX = 0.42;
    const laptopBase = this.createBeveledBox(1.52, 0.082, 0.9, laptopBaseMat, 0.038, 8);
    laptopBase.position.set(laptopCenterX, surfaceY + 0.062, 0.01);
    group.add(laptopBase);

    const undersideMat = new THREE.MeshStandardMaterial({ color: '#796f52', roughness: 0.42, metalness: 0.78 });
    const underside = this.createBeveledBox(1.36, 0.012, 0.75, undersideMat, 0.022, 5);
    underside.position.set(laptopCenterX, surfaceY + 0.019, 0.015);
    group.add(underside);
    const rubberMat = new THREE.MeshStandardMaterial({ color: '#181a1d', roughness: 0.86, metalness: 0.02 });
    for (const fx of [-0.61, 0.61]) {
      for (const fz of [-0.33, 0.33]) {
        const foot = this.createBeveledBox(0.15, 0.024, 0.055, rubberMat, 0.012, 4);
        foot.position.set(laptopCenterX + fx, surfaceY + 0.012, fz);
        group.add(foot);
      }
    }
    const screwMat = new THREE.MeshStandardMaterial({ color: '#34383e', roughness: 0.28, metalness: 0.92 });
    for (const sx of [-0.53, 0.53]) {
      for (const sz of [-0.27, 0.27]) {
        const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.006, 24), screwMat);
        screw.position.set(laptopCenterX + sx, surfaceY + 0.009, sz);
        group.add(screw);
      }
    }

    const portMat = new THREE.MeshStandardMaterial({ color: '#111419', roughness: 0.7, metalness: 0.35 });
    const addSidePort = (side, z, width, height) => {
      const port = this.createBeveledBox(0.009, height, width, portMat, 0.004, 3);
      port.position.set(laptopCenterX + side * 0.762, surfaceY + 0.061, z);
      group.add(port);
    };
    addSidePort(-1, -0.18, 0.13, 0.026);
    addSidePort(-1, 0.02, 0.08, 0.023);
    addSidePort(-1, 0.16, 0.055, 0.021);
    addSidePort(1, -0.16, 0.11, 0.025);
    addSidePort(1, 0.12, 0.075, 0.021);
    const audioJack = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.008, 24), portMat);
    audioJack.rotation.z = Math.PI / 2;
    audioJack.position.set(laptopCenterX + 0.764, surfaceY + 0.061, 0.255);
    group.add(audioJack);
    for (let i = 0; i < 15; i++) {
      const vent = this.createBeveledBox(0.052, 0.006, 0.012, portMat, 0.003, 2);
      vent.position.set(laptopCenterX - 0.39 + i * 0.056, surfaceY + 0.105, -0.418);
      group.add(vent);
    }

    const hingeMat = new THREE.MeshStandardMaterial({ color: '#292b2e', roughness: 0.33, metalness: 0.82 });
    for (const hx of [-0.42, 0.42]) {
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.3, 24), hingeMat);
      hinge.rotation.z = Math.PI / 2;
      hinge.position.set(laptopCenterX + hx, surfaceY + 0.135, -0.41);
      group.add(hinge);
    }

    const screenGroup = new THREE.Group();
    screenGroup.position.set(laptopCenterX, 0.6, -0.49);
    screenGroup.rotation.x = -0.11;
    const screenBack = this.createBeveledBox(1.38, 0.86, 0.068, laptopBaseMat, 0.036, 8);
    screenGroup.add(screenBack);
    const backLogoMat = new THREE.MeshStandardMaterial({ color: '#81754f', roughness: 0.36, metalness: 0.86 });
    const backLogo = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.008, 12, 48), backLogoMat);
    backLogo.position.z = -0.041;
    screenGroup.add(backLogo);

    const bezelMat = new THREE.MeshStandardMaterial({ color: '#05070a', roughness: 0.4, metalness: 0.22 });
    const bezel = this.createBeveledBox(1.26, 0.74, 0.014, bezelMat, 0.022, 5);
    bezel.position.z = 0.043;
    screenGroup.add(bezel);

    const editorCanvas = document.createElement('canvas');
    editorCanvas.width = 1600;
    editorCanvas.height = 900;
    const editorCtx = editorCanvas.getContext('2d');
    const editorGradient = editorCtx.createLinearGradient(0, 0, 1600, 900);
    editorGradient.addColorStop(0, '#071019');
    editorGradient.addColorStop(1, '#0a1726');
    editorCtx.fillStyle = editorGradient;
    editorCtx.fillRect(0, 0, 1600, 900);
    editorCtx.fillStyle = '#121d29';
    editorCtx.fillRect(0, 0, 1600, 62);
    editorCtx.fillStyle = '#0d1621';
    editorCtx.fillRect(0, 62, 240, 838);
    ['#e7655b', '#e7b84c', '#59bd78'].forEach((color, i) => {
      editorCtx.fillStyle = color;
      editorCtx.beginPath();
      editorCtx.arc(28 + i * 34, 31, 9, 0, Math.PI * 2);
      editorCtx.fill();
    });
    editorCtx.fillStyle = '#8ca0b5';
    editorCtx.font = '24px monospace';
    editorCtx.fillText('HUMANITIES / NOW', 140, 41);
    const fileNames = ['history.js', 'memory.ts', 'archive.json', 'museum.css', 'README.md'];
    editorCtx.font = '22px monospace';
    fileNames.forEach((name, i) => {
      editorCtx.fillStyle = i === 0 ? '#8dd7ff' : '#6f8194';
      editorCtx.fillText(name, 28, 112 + i * 52);
    });
    const codeLines = [
      [['const ', '#c4b5fd'], ['journey', '#7dd3fc'], [' = ', '#d8dee9'], ['createHistory', '#f7c873'], ['({', '#d8dee9']],
      [['  nodes', '#9ae6b4'], [': ', '#d8dee9'], ['26', '#f5a6a6'], [', preserve: ', '#d8dee9'], ['true', '#c4b5fd']],
      [['  focus', '#9ae6b4'], [": 'humanities'", '#f7c873'], [',', '#d8dee9']],
      [['});', '#d8dee9']],
      [[], []],
      [['function ', '#c4b5fd'], ['remember', '#7dd3fc'], ['(moment) {', '#d8dee9']],
      [['  const ', '#c4b5fd'], ['detail', '#7dd3fc'], [' = moment.', '#d8dee9'], ['observe', '#9ae6b4'], ['();', '#d8dee9']],
      [['  archive.', '#d8dee9'], ['write', '#f7c873'], ['({', '#d8dee9']],
      [["    light: 'warm'", '#f7c873'], [',', '#d8dee9']],
      [['    memory: detail,', '#d8dee9']],
      [['    timestamp: ', '#d8dee9'], ['Date.now', '#7dd3fc'], ['()', '#d8dee9']],
      [['  });', '#d8dee9']],
      [['  return ', '#c4b5fd'], ['detail;', '#d8dee9']],
      [['}', '#d8dee9']],
      [[], []],
      [['journey.', '#d8dee9'], ['on', '#9ae6b4'], ["('present', remember);", '#f7c873']],
      [['export default ', '#c4b5fd'], ['journey;', '#d8dee9']]
    ];
    editorCtx.font = '22px "Cascadia Mono", Consolas, monospace';
    codeLines.forEach((tokens, row) => {
      const y = 112 + row * 39;
      editorCtx.fillStyle = '#3e5267';
      editorCtx.fillText(String(row + 1).padStart(2, '0'), 270, y);
      let x = 342;
      tokens.forEach(([text, color]) => {
        if (!text) return;
        editorCtx.fillStyle = color;
        editorCtx.fillText(text, x, y);
        x += editorCtx.measureText(text).width;
      });
    });
    editorCtx.fillStyle = '#0b263f';
    editorCtx.fillRect(1270, 76, 300, 750);
    for (let i = 0; i < 34; i++) {
      const width = 46 + ((i * 71) % 165);
      editorCtx.fillStyle = i % 5 === 0 ? '#326e94' : '#23455f';
      editorCtx.fillRect(1300 + (i % 3) * 18, 95 + i * 20, width, 5);
    }
    editorCtx.fillStyle = '#123d66';
    editorCtx.fillRect(850, 604, 380, 218);
    editorCtx.fillStyle = '#0d2a47';
    editorCtx.fillRect(870, 626, 340, 42);
    editorCtx.fillStyle = '#b6d9ee';
    editorCtx.font = '18px "Cascadia Mono", Consolas, monospace';
    editorCtx.fillText('HISTORY PREVIEW', 890, 655);
    for (let i = 0; i < 6; i++) {
      editorCtx.fillStyle = i % 2 ? '#70bdf0' : '#b2d8f2';
      editorCtx.fillRect(890, 700 + i * 19, 140 + (i % 4) * 42, 5);
    }
    editorCtx.fillStyle = '#19547e';
    editorCtx.fillRect(240, 862, 1360, 38);
    const editorTexture = new THREE.CanvasTexture(editorCanvas);
    editorTexture.colorSpace = THREE.SRGBColorSpace;
    editorTexture.anisotropy = maxAnisotropy;
    const displayMat = new THREE.MeshBasicMaterial({ color: '#ffffff', map: editorTexture });
    const display = this.createBeveledBox(1.12, 0.6, 0.01, displayMat, 0.014, 4);
    display.position.set(0, -0.015, 0.053);
    screenGroup.add(display);

    const screenGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(1.105, 0.585),
      new THREE.MeshPhysicalMaterial({
        color: '#d9effa', transparent: true, opacity: 0.075,
        roughness: 0.035, metalness: 0.02, clearcoat: 1,
        clearcoatRoughness: 0.025, transmission: 0.12,
        depthWrite: false
      })
    );
    screenGlass.position.set(0, -0.015, 0.065);
    screenGlass.renderOrder = 4;
    screenGroup.add(screenGlass);

    const cameraDot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.007, 20),
      new THREE.MeshPhysicalMaterial({ color: '#101820', roughness: 0.22, clearcoat: 0.8 })
    );
    cameraDot.rotation.x = Math.PI / 2;
    cameraDot.position.set(0, 0.352, 0.059);
    screenGroup.add(cameraDot);
    group.add(screenGroup);

    const keyboardWellMat = new THREE.MeshStandardMaterial({ color: '#111318', roughness: 0.58, metalness: 0.28 });
    const keyboardWell = this.createBeveledBox(1.2, 0.014, 0.42, keyboardWellMat, 0.018, 5);
    keyboardWell.position.set(laptopCenterX, surfaceY + 0.09, -0.09);
    group.add(keyboardWell);
    const keyMat = new THREE.MeshStandardMaterial({ color: '#0a0c10', roughness: 0.5, metalness: 0.18 });
    const keyRows = [
      [['Esc', 1.15], ['1', 1], ['2', 1], ['3', 1], ['4', 1], ['5', 1], ['6', 1], ['7', 1], ['8', 1], ['9', 1], ['0', 1], ['-', 1], ['=', 1], ['Back', 1.65]],
      [['Tab', 1.45], ['Q', 1], ['W', 1], ['E', 1], ['R', 1], ['T', 1], ['Y', 1], ['U', 1], ['I', 1], ['O', 1], ['P', 1], ['[', 1], [']', 1], ['\\', 1.35]],
      [['Caps', 1.75], ['A', 1], ['S', 1], ['D', 1], ['F', 1], ['G', 1], ['H', 1], ['J', 1], ['K', 1], ['L', 1], [';', 1], ["'", 1], ['Enter', 1.85]],
      [['Shift', 2.15], ['Z', 1], ['X', 1], ['C', 1], ['V', 1], ['B', 1], ['N', 1], ['M', 1], [',', 1], ['.', 1], ['/', 1], ['Shift', 2.35]],
      [['Ctrl', 1.2], ['Fn', 1], ['Alt', 1.15], ['', 5.1], ['Alt', 1.15], ['Ctrl', 1.2], ['←', 1], ['↑↓', 1], ['→', 1]]
    ];
    const legendCache = new Map();
    const getLegendMaterial = (label) => {
      if (legendCache.has(label)) return legendCache.get(label);
      const canvas = document.createElement('canvas');
      canvas.width = 192;
      canvas.height = 96;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#eef2f6';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${label.length > 4 ? 30 : label.length > 2 ? 38 : 48}px Arial, sans-serif`;
      ctx.fillText(label || ' ', canvas.width / 2, canvas.height / 2 + 2);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = maxAnisotropy;
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
      legendCache.set(label, material);
      return material;
    };
    const keyboardWidth = 1.14;
    const keyGap = 0.007;
    keyRows.forEach((row, rowIndex) => {
      const totalWeight = row.reduce((sum, [, weight]) => sum + weight, 0);
      const unit = (keyboardWidth - keyGap * (row.length - 1)) / totalWeight;
      let xCursor = -keyboardWidth / 2;
      row.forEach(([label, weight]) => {
        const keyWidth = unit * weight;
        const offsetX = xCursor + keyWidth / 2;
        const keyDepth = 0.054;
        const key = this.createBeveledBox(keyWidth, 0.018, keyDepth, keyMat, 0.006, 3);
        const z = -0.245 + rowIndex * 0.075;
        key.position.set(laptopCenterX + offsetX, surfaceY + 0.105, z);
        group.add(key);
        if (label) {
          const legend = new THREE.Mesh(
            new THREE.PlaneGeometry(Math.max(0.018, keyWidth * 0.72), keyDepth * 0.62),
            getLegendMaterial(label)
          );
          legend.rotation.x = -Math.PI / 2;
          legend.position.set(laptopCenterX + offsetX, surfaceY + 0.115, z);
          legend.renderOrder = 3;
          group.add(legend);
        }
        xCursor += keyWidth + keyGap;
      });
    });

    const trackpadMat = new THREE.MeshPhysicalMaterial({
      color: '#a79a70',
      map: brushedTexture,
      roughness: 0.34,
      metalness: 0.78
    });
    const trackpad = this.createBeveledBox(0.43, 0.008, 0.17, trackpadMat, 0.014, 4);
    trackpad.position.set(laptopCenterX, surfaceY + 0.103, 0.3);
    group.add(trackpad);
    const frontNotch = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.006, 8, 32, Math.PI), portMat);
    frontNotch.rotation.set(Math.PI / 2, 0, Math.PI);
    frontNotch.position.set(laptopCenterX, surfaceY + 0.075, 0.455);
    group.add(frontNotch);
    const speakerMat = new THREE.MeshBasicMaterial({ color: '#30343a' });
    for (const sx of [-0.57, 0.57]) {
      for (let i = 0; i < 7; i++) {
        const slot = this.createBeveledBox(0.08, 0.004, 0.006, speakerMat, 0.002, 2);
        slot.position.set(laptopCenterX + sx, surfaceY + 0.108, 0.19 + i * 0.025);
        group.add(slot);
      }
    }

    const cupX = -0.85;
    const cupZ = 0.14;
    const glazeCanvas = document.createElement('canvas');
    glazeCanvas.width = 512;
    glazeCanvas.height = 512;
    const glazeCtx = glazeCanvas.getContext('2d');
    const glazeGradient = glazeCtx.createLinearGradient(0, 0, 512, 512);
    glazeGradient.addColorStop(0, '#4f7b5f');
    glazeGradient.addColorStop(0.48, '#28513d');
    glazeGradient.addColorStop(1, '#6c8b6a');
    glazeCtx.fillStyle = glazeGradient;
    glazeCtx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 58; i++) {
      const x = (i * 83) % 512;
      const y = (i * 137) % 512;
      const radius = 13 + (i % 7) * 8;
      const cloud = glazeCtx.createRadialGradient(x, y, 2, x, y, radius);
      cloud.addColorStop(0, i % 2 ? 'rgba(224,235,202,0.12)' : 'rgba(12,39,28,0.16)');
      cloud.addColorStop(1, 'rgba(30,70,48,0)');
      glazeCtx.fillStyle = cloud;
      glazeCtx.beginPath();
      glazeCtx.arc(x, y, radius, 0, Math.PI * 2);
      glazeCtx.fill();
    }
    let crackSeed = 271828;
    const nextCrackValue = () => {
      crackSeed = (crackSeed * 1664525 + 1013904223) >>> 0;
      return crackSeed / 4294967296;
    };
    glazeCtx.lineCap = 'round';
    for (let i = 0; i < 155; i++) {
      let x = nextCrackValue() * 512;
      let y = nextCrackValue() * 512;
      glazeCtx.beginPath();
      glazeCtx.moveTo(x, y);
      const segments = 2 + Math.floor(nextCrackValue() * 4);
      for (let segment = 0; segment < segments; segment++) {
        x += (nextCrackValue() - 0.5) * 58;
        y += (nextCrackValue() - 0.5) * 58;
        glazeCtx.lineTo(x, y);
      }
      glazeCtx.strokeStyle = `rgba(20, 45, 34, ${0.12 + nextCrackValue() * 0.16})`;
      glazeCtx.lineWidth = 0.55 + nextCrackValue() * 0.7;
      glazeCtx.stroke();
    }
    const glazeTexture = new THREE.CanvasTexture(glazeCanvas);
    glazeTexture.colorSpace = THREE.SRGBColorSpace;
    glazeTexture.wrapS = THREE.RepeatWrapping;
    glazeTexture.wrapT = THREE.RepeatWrapping;
    glazeTexture.repeat.set(1.5, 1.15);
    glazeTexture.anisotropy = maxAnisotropy;
    const ceramicMat = new THREE.MeshPhysicalMaterial({
      color: '#3e6b50',
      map: glazeTexture,
      bumpMap: glazeTexture,
      bumpScale: 0.014,
      roughness: 0.24,
      metalness: 0,
      clearcoat: 0.78,
      clearcoatRoughness: 0.17
    });
    const coasterMat = new THREE.MeshPhysicalMaterial({
      color: '#4f281c', map: woodTexture, bumpMap: woodTexture,
      bumpScale: 0.018, roughness: 0.48, metalness: 0.01,
      clearcoat: 0.28, clearcoatRoughness: 0.38
    });
    const coaster = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.43, 0.055, 96, 2), coasterMat);
    coaster.position.set(cupX, surfaceY + 0.028, cupZ);
    group.add(coaster);
    const coasterRim = new THREE.Mesh(new THREE.TorusGeometry(0.405, 0.018, 12, 96), coasterMat);
    coasterRim.rotation.x = Math.PI / 2;
    coasterRim.position.set(cupX, surfaceY + 0.058, cupZ);
    group.add(coasterRim);
    const coasterFoot = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.012, 10, 72),
      new THREE.MeshStandardMaterial({ color: '#21130f', roughness: 0.9 })
    );
    coasterFoot.rotation.x = Math.PI / 2;
    coasterFoot.position.set(cupX, surfaceY + 0.004, cupZ);
    group.add(coasterFoot);

    const cupBaseY = surfaceY + 0.065;
    const cup = this.createLatheMesh([
      [0.17, 0], [0.205, 0.012], [0.22, 0.045], [0.29, 0.085],
      [0.335, 0.19], [0.345, 0.35], [0.33, 0.47], [0.305, 0.53]
    ], ceramicMat, 96);
    cup.position.set(cupX, cupBaseY, cupZ);
    group.add(cup);
    const cupBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.17, 0.07, 80), ceramicMat);
    cupBottom.position.set(cupX, cupBaseY + 0.035, cupZ);
    group.add(cupBottom);
    const footRing = new THREE.Mesh(new THREE.TorusGeometry(0.195, 0.014, 12, 80), ceramicMat);
    footRing.rotation.x = Math.PI / 2;
    footRing.position.set(cupX, cupBaseY + 0.016, cupZ);
    group.add(footRing);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.305, 0.018, 16, 96), ceramicMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(cupX, cupBaseY + 0.53, cupZ);
    group.add(rim);
    const innerWall = new THREE.Mesh(
      new THREE.CylinderGeometry(0.285, 0.258, 0.12, 96, 2, true),
      new THREE.MeshPhysicalMaterial({
        color: '#315a43', map: glazeTexture, roughness: 0.26,
        clearcoat: 0.66, side: THREE.DoubleSide
      })
    );
    innerWall.position.set(cupX, cupBaseY + 0.475, cupZ);
    group.add(innerWall);
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(cupX - 0.29, cupBaseY + 0.45, cupZ),
      new THREE.Vector3(cupX - 0.47, cupBaseY + 0.44, cupZ),
      new THREE.Vector3(cupX - 0.54, cupBaseY + 0.31, cupZ),
      new THREE.Vector3(cupX - 0.48, cupBaseY + 0.18, cupZ),
      new THREE.Vector3(cupX - 0.27, cupBaseY + 0.17, cupZ)
    ]);
    const handle = new THREE.Mesh(new THREE.TubeGeometry(handleCurve, 64, 0.038, 20, false), ceramicMat);
    group.add(handle);
    const coffeeMat = new THREE.MeshPhysicalMaterial({
      color: '#4b2514', roughness: 0.16, metalness: 0,
      transparent: true, opacity: 0.94, clearcoat: 0.9, clearcoatRoughness: 0.06
    });
    const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.274, 0.274, 0.014, 96), coffeeMat);
    coffee.position.set(cupX, cupBaseY + 0.505, cupZ);
    group.add(coffee);

    const steamWisps = [];
    const createTaperedSteamGeometry = (curve, baseRadius, segments = 56, radialSegments = 10) => {
      const frames = curve.computeFrenetFrames(segments, false);
      const vertices = [];
      const normals = [];
      const uvs = [];
      const indices = [];
      const point = new THREE.Vector3();
      const radial = new THREE.Vector3();
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        curve.getPointAt(t, point);
        const envelope = Math.pow(Math.max(0.001, Math.sin(Math.PI * t)), 0.48);
        const radius = baseRadius * envelope * (1 - t * 0.46) * (0.9 + Math.sin(t * Math.PI * 5) * 0.1);
        for (let j = 0; j < radialSegments; j++) {
          const angle = (j / radialSegments) * Math.PI * 2;
          radial.copy(frames.normals[i]).multiplyScalar(Math.cos(angle));
          radial.addScaledVector(frames.binormals[i], Math.sin(angle)).normalize();
          vertices.push(
            point.x + radial.x * radius,
            point.y + radial.y * radius,
            point.z + radial.z * radius
          );
          normals.push(radial.x, radial.y, radial.z);
          uvs.push(j / radialSegments, t);
        }
      }
      for (let i = 0; i < segments; i++) {
        for (let j = 0; j < radialSegments; j++) {
          const nextJ = (j + 1) % radialSegments;
          const a = i * radialSegments + j;
          const b = (i + 1) * radialSegments + j;
          const c = (i + 1) * radialSegments + nextJ;
          const d = i * radialSegments + nextJ;
          indices.push(a, b, d, b, c, d);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeBoundingSphere();
      return geometry;
    };
    for (let i = 0; i < 9; i++) {
      const phase = i * 0.83;
      const points = [];
      for (let step = 0; step < 8; step++) {
        const t = step / 7;
        points.push(new THREE.Vector3(
          Math.sin(phase + t * Math.PI * (1.35 + (i % 3) * 0.18)) * (0.035 + t * 0.07),
          t * (0.62 + (i % 4) * 0.055),
          Math.cos(phase * 0.7 + t * Math.PI * 1.65) * (0.022 + t * 0.045)
        ));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const opacity = 0.06 + (i % 4) * 0.016;
      const steamMat = new THREE.MeshPhysicalMaterial({
        color: '#f2eee6', transparent: true, opacity,
        roughness: 0.72, metalness: 0, transmission: 0.34,
        thickness: 0.018, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.NormalBlending
      });
      const wisp = new THREE.Mesh(
        createTaperedSteamGeometry(curve, 0.018 + (i % 3) * 0.004),
        steamMat
      );
      const basePosition = new THREE.Vector3(
        cupX + Math.sin(phase * 1.3) * 0.055,
        cupBaseY + 0.525,
        cupZ + Math.cos(phase) * 0.045
      );
      wisp.position.copy(basePosition);
      wisp.rotation.y = phase * 0.14;
      wisp.renderOrder = 5;
      wisp.userData = { basePosition, phase, baseOpacity: opacity };
      steamWisps.push(wisp);
      group.add(wisp);
    }

    const bookMaterials = [
      new THREE.MeshStandardMaterial({ color: '#3b2c24', roughness: 0.94 }),
      new THREE.MeshStandardMaterial({ color: '#26383b', roughness: 0.9 })
    ];
    const pageEdgeMat = new THREE.MeshStandardMaterial({ color: '#a58d69', roughness: 1 });
    [
      { y: surfaceY + 0.045, z: -0.38, width: 0.72, depth: 0.34, material: bookMaterials[0], rotation: -0.025 },
      { y: surfaceY + 0.12, z: -0.405, width: 0.66, depth: 0.31, material: bookMaterials[1], rotation: 0.035 }
    ].forEach((spec) => {
      const pages = new THREE.Mesh(new RoundedBoxGeometry(spec.width - 0.035, 0.06, spec.depth - 0.025, 4, 0.012), pageEdgeMat);
      pages.position.set(-0.82, spec.y, spec.z);
      pages.rotation.y = spec.rotation;
      group.add(pages);
      for (const coverY of [-0.04, 0.04]) {
        const cover = new THREE.Mesh(new RoundedBoxGeometry(spec.width, 0.016, spec.depth, 4, 0.012), spec.material);
        cover.position.set(-0.82, spec.y + coverY, spec.z);
        cover.rotation.y = spec.rotation;
        group.add(cover);
      }
    });

    const noteCanvas = document.createElement('canvas');
    noteCanvas.width = 1024;
    noteCanvas.height = 768;
    const noteCtx = noteCanvas.getContext('2d');
    const noteGradient = noteCtx.createLinearGradient(0, 0, 1024, 768);
    noteGradient.addColorStop(0, '#eee0c4');
    noteGradient.addColorStop(0.55, '#d9c39d');
    noteGradient.addColorStop(1, '#c8ac7e');
    noteCtx.fillStyle = noteGradient;
    noteCtx.fillRect(0, 0, 1024, 768);
    for (let i = 0; i < 520; i++) {
      const x = (i * 149) % 1024;
      const y = (i * 263) % 768;
      noteCtx.strokeStyle = `rgba(105, 79, 47, ${0.025 + (i % 5) * 0.009})`;
      noteCtx.lineWidth = 0.5;
      noteCtx.beginPath();
      noteCtx.moveTo(x, y);
      noteCtx.lineTo(x + 10 + (i % 9) * 3, y + ((i % 3) - 1) * 2);
      noteCtx.stroke();
    }
    noteCtx.fillStyle = '#705943';
    noteCtx.font = '34px "Microsoft YaHei", serif';
    noteCtx.fillText('此刻 · 生活札记', 86, 104);
    noteCtx.font = '24px "Microsoft YaHei", serif';
    const noteLines = ['在日常的微光里记录时间', '一杯热饮，一行代码', '也是我们正在经历的历史', '记忆并不遥远，它就在此刻'];
    noteLines.forEach((line, index) => noteCtx.fillText(line, 92, 190 + index * 82));
    noteCtx.strokeStyle = 'rgba(113, 83, 54, 0.28)';
    noteCtx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      noteCtx.beginPath();
      noteCtx.moveTo(76, 155 + i * 82);
      noteCtx.lineTo(940, 155 + i * 82);
      noteCtx.stroke();
    }
    const noteTexture = new THREE.CanvasTexture(noteCanvas);
    noteTexture.colorSpace = THREE.SRGBColorSpace;
    noteTexture.anisotropy = maxAnisotropy;
    const pageMat = new THREE.MeshStandardMaterial({
      color: '#e2cfaa', map: noteTexture, bumpMap: noteTexture,
      bumpScale: 0.006, roughness: 0.9, metalness: 0
    });
    const noteGroup = new THREE.Group();
    noteGroup.position.set(-0.08, surfaceY + 0.016, 0.48);
    noteGroup.rotation.y = 0.08;
    const pageEdgeMaterial = new THREE.MeshStandardMaterial({ color: '#b99d72', roughness: 0.98 });
    for (let i = 0; i < 5; i++) {
      const sheet = this.createBeveledBox(0.5 - i * 0.003, 0.006, 0.42 - i * 0.002, pageEdgeMaterial, 0.006, 2);
      sheet.position.y = i * 0.004;
      sheet.rotation.y = (i - 2) * 0.004;
      noteGroup.add(sheet);
    }
    const topPageGeometry = new THREE.PlaneGeometry(0.495, 0.415, 18, 14);
    const topPagePositions = topPageGeometry.getAttribute('position');
    for (let i = 0; i < topPagePositions.count; i++) {
      const x = topPagePositions.getX(i);
      const y = topPagePositions.getY(i);
      const cornerCurl = Math.pow(Math.max(0, Math.abs(x) - 0.17), 2) * 0.42
        + Math.pow(Math.max(0, Math.abs(y) - 0.145), 2) * 0.34;
      topPagePositions.setZ(i, cornerCurl);
    }
    topPageGeometry.computeVertexNormals();
    const topPage = new THREE.Mesh(topPageGeometry, pageMat);
    topPage.rotation.x = -Math.PI / 2;
    topPage.position.y = 0.028;
    noteGroup.add(topPage);
    group.add(noteGroup);

    const penGroup = new THREE.Group();
    const penBodyMat = new THREE.MeshPhysicalMaterial({ color: '#17202b', roughness: 0.28, metalness: 0.42, clearcoat: 0.6 });
    const penMetalMat = new THREE.MeshStandardMaterial({ color: '#aeb6bf', roughness: 0.2, metalness: 0.9 });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.5, 24), penBodyMat);
    barrel.rotation.z = Math.PI / 2;
    penGroup.add(barrel);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.09, 24), penMetalMat);
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = 0.295;
    penGroup.add(tip);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.006, 16, 10), penMetalMat);
    ball.position.x = 0.342;
    penGroup.add(ball);
    const gripMat = new THREE.MeshStandardMaterial({ color: '#20252a', roughness: 0.72, metalness: 0.08 });
    for (let i = 0; i < 5; i++) {
      const gripRing = new THREE.Mesh(new THREE.TorusGeometry(0.0185, 0.0024, 8, 24), gripMat);
      gripRing.rotation.y = Math.PI / 2;
      gripRing.position.x = 0.17 + i * 0.022;
      penGroup.add(gripRing);
    }
    const clicker = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 18), penMetalMat);
    clicker.rotation.z = Math.PI / 2;
    clicker.position.x = -0.282;
    penGroup.add(clicker);
    for (const x of [-0.24, 0.24]) {
      const seam = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0022, 8, 24), penMetalMat);
      seam.rotation.y = Math.PI / 2;
      seam.position.x = x;
      penGroup.add(seam);
    }
    const clip = this.createBeveledBox(0.17, 0.006, 0.012, penMetalMat, 0.003, 2);
    clip.position.set(-0.14, 0.025, 0);
    penGroup.add(clip);
    penGroup.position.set(-0.12, surfaceY + 0.035, 0.69);
    penGroup.rotation.y = -0.3;
    group.add(penGroup);

    const screenGlow = new THREE.PointLight('#65bdf2', 0.52, 3.2);
    screenGlow.position.set(0.4, 0.65, -0.08);
    group.add(screenGlow);
    const warmDeskLight = new THREE.PointLight('#e5a36c', 0.58, 3.2);
    warmDeskLight.position.set(-0.92, 1.2, -0.46);
    group.add(warmDeskLight);

    group.userData.updateArtifact = (time) => {
      steamWisps.forEach((wisp, index) => {
        const { basePosition, phase, baseOpacity } = wisp.userData;
        const lift = (time * 0.045 + index * 0.019) % 0.14;
        wisp.position.y = basePosition.y + lift;
        wisp.position.x = basePosition.x + Math.sin(time * 0.42 + phase) * (0.018 + index * 0.0015);
        wisp.position.z = basePosition.z + Math.cos(time * 0.31 + phase) * 0.014;
        wisp.rotation.y = phase * 0.14 + Math.sin(time * 0.27 + phase) * 0.08;
        wisp.scale.setScalar(0.96 + Math.sin(time * 0.36 + phase) * 0.035);
        wisp.material.opacity = baseOpacity * (0.72 + 0.25 * Math.sin(time * 0.52 + phase));
      });
    };
    group.rotation.y = -0.08;
    return group;
  }

  createScrollPlaneGroup(mat, width, height) {
    const group = new THREE.Group();
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(width, height, 8, 3), mat);
    paper.position.y = 0.34;
    group.add(paper);
    const rollMat = new THREE.MeshStandardMaterial({ color: '#5c4033', roughness: 0.6 });
    for (const side of [-1, 1]) {
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, height + 0.1, 12), rollMat);
      roll.position.set(side * (width / 2 + 0.04), 0.34, 0);
      group.add(roll);
    }
    return group;
  }

  // Procedural Modeling Engine for Artifacts
  buildProceduralArtifact(art, visualSpec = null) {
    let geo;
    const artifactVisual = visualSpec?.artifact || getArtifactVisualSpec(art);
    const variant = artifactVisual?.variant || art.geometry;
    let mat = this.createArtifactMaterial(art, artifactVisual);
    const withReference = (group) => {
      if (!group) return group;
      const pending = [];
      if (mat?.userData?.readyPromise) pending.push(mat.userData.readyPromise);
      if (group.userData?.readyPromise) pending.push(group.userData.readyPromise);
      group.userData.readyPromise = pending.length ? Promise.all(pending) : Promise.resolve();
      return group;
    };

    if (variant === 'owl-zun') return withReference(this.createOwlZunArtifact(mat, artifactVisual));
    if (variant === 'painted-pottery') return withReference(this.createPaintedPotteryArtifact(mat));
    if (variant === 'jade-cong') return withReference(this.createJadeCongArtifact(mat));
    if (variant === 'bronze-ding') return withReference(this.createBronzeDingArtifact(mat));
    if (variant === 'bell-rack') return withReference(this.createBellRackArtifact(mat));
    if (variant === 'terracotta-warrior') return withReference(this.createTerracottaWarriorArtifact(mat));
    if (variant === 'palace-lamp') return withReference(this.createPalaceLampArtifact(mat));
    if (variant === 'buddha-statue') return withReference(this.createBuddhaArtifact(mat));
    if (variant === 'canal-tools') return withReference(this.createCanalToolsArtifact(mat));
    if (variant === 'sancai-camel') return withReference(this.createSancaiCamelArtifact(mat));
    if (variant === 'ringed-staff') return withReference(this.createRingedStaffArtifact(mat));
    if (variant === 'ru-tripod') return withReference(this.createRuTripodArtifact(mat));
    if (variant === 'calligraphy-scroll') return withReference(this.createCalligraphyScrollArtifact(mat));
    if (variant === 'qingming-scroll') return withReference(this.createQingmingScrollArtifact(mat));
    if (variant === 'world-map-scroll') return withReference(this.createWorldMapScrollArtifact(mat));
    if (variant === 'woodblock-book') return withReference(this.createWoodblockBookArtifact(mat));
    if (variant === 'archive-book') return withReference(this.createArchiveBookArtifact());
    if (variant === 'reform-book') return withReference(this.createReformBookArtifact());
    if (variant === 'magazine') return withReference(this.createMagazineArtifact());
    if (variant === 'crossbow') return withReference(this.createCrossbowArtifact(mat));
    if (variant === 'blue-white-vase') return withReference(this.createBlueWhiteVaseArtifact(mat));
    if (variant === 'wartime-desk') return withReference(this.createWartimeDeskArtifact());
    if (variant === 'steering-cup') return withReference(this.createSteeringCupArtifact());
    if (variant === 'cassette-ticket') return this.createCassetteTicketArtifact();
    if (variant === 'smartphone') return withReference(this.createSmartphoneArtifact());
    if (variant === 'tea-screen') return withReference(this.createTeaScreenArtifact());
    
    switch(art.geometry) {
      case 'box-hollow': // Jade Cong
        const congGroup = new THREE.Group();
        // Inner cylinder
        const innerGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 16);
        const innerMesh = new THREE.Mesh(innerGeo, mat);
        congGroup.add(innerMesh);
        // Outer square column
        const outerGeo = new THREE.BoxGeometry(0.9, 1.0, 0.9);
        const outerMesh = new THREE.Mesh(outerGeo, mat);
        congGroup.add(outerMesh);
        
        return congGroup;

      case 'cylinder-tripod': // Bronze Ding
        const dingGroup = new THREE.Group();
        // Main vessel
        const bowlGeo = new THREE.CylinderGeometry(0.8, 0.6, 0.7, 16);
        const bowl = new THREE.Mesh(bowlGeo, mat);
        dingGroup.add(bowl);
        // Legs
        for (let i = 0; i < 3; i++) {
          const legGeo = new THREE.CylinderGeometry(0.1, 0.07, 0.5, 8);
          const leg = new THREE.Mesh(legGeo, mat);
          const angle = (i * Math.PI * 2) / 3;
          leg.position.set(Math.cos(angle) * 0.5, -0.5, Math.sin(angle) * 0.5);
          leg.rotation.z = -Math.cos(angle) * 0.2;
          leg.rotation.x = Math.sin(angle) * 0.2;
          dingGroup.add(leg);
        }
        // Handles (ears)
        const earGeo = new THREE.TorusGeometry(0.2, 0.05, 8, 12, Math.PI);
        const ear1 = new THREE.Mesh(earGeo, mat);
        ear1.position.set(-0.7, 0.35, 0);
        ear1.rotation.z = -Math.PI / 2;
        const ear2 = ear1.clone();
        ear2.position.x = 0.7;
        ear2.rotation.z = Math.PI / 2;
        dingGroup.add(ear1);
        dingGroup.add(ear2);
        
        return dingGroup;

      case 'cylinder': // Pottery, tools, arrows
        const cylGroup = new THREE.Group();
        const cylBody = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.68, 0.9, 32), mat);
        cylBody.position.y = 0.1;
        cylGroup.add(cylBody);

        const cylRim = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.035, 8, 32), mat);
        cylRim.position.y = 0.58;
        cylRim.rotation.x = Math.PI / 2;
        cylGroup.add(cylRim);

        const cylBandMat = new THREE.MeshStandardMaterial({ color: '#1f1a16', roughness: 0.8, metalness: 0.1 });
        for (let i = 0; i < 3; i++) {
          const cylBand = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.012, 6, 32), cylBandMat);
          cylBand.position.y = -0.18 + i * 0.22;
          cylBand.rotation.x = Math.PI / 2;
          cylGroup.add(cylBand);
        }

        return cylGroup;

      case 'cylinder-tripod-small': // Ru ware vessel
        const smallTripodGroup = new THREE.Group();
        const smallBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.5, 0.48, 32), mat);
        smallBowl.position.y = 0.24;
        smallTripodGroup.add(smallBowl);

        const smallRim = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.03, 8, 32), mat);
        smallRim.position.y = 0.5;
        smallRim.rotation.x = Math.PI / 2;
        smallTripodGroup.add(smallRim);

        for (let i = 0; i < 3; i++) {
          const smallLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.36, 10), mat);
          const angle = (i * Math.PI * 2) / 3;
          smallLeg.position.set(Math.cos(angle) * 0.38, -0.12, Math.sin(angle) * 0.38);
          smallTripodGroup.add(smallLeg);
        }

        return smallTripodGroup;

      case 'rack': // Bronze bell rack
        const rackGroup = new THREE.Group();
        const rackWoodMat = new THREE.MeshStandardMaterial({ color: '#2a1710', roughness: 0.65, metalness: 0.25 });
        const rackTop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.08), rackWoodMat);
        rackTop.position.y = 1.1;
        rackGroup.add(rackTop);
        const rackBottom = rackTop.clone();
        rackBottom.position.y = -0.15;
        rackGroup.add(rackBottom);

        for (let i = -1; i <= 1; i += 2) {
          const rackPost = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.35, 0.08), rackWoodMat);
          rackPost.position.set(i * 1.2, 0.45, 0);
          rackGroup.add(rackPost);
        }

        for (let row = 0; row < 2; row++) {
          for (let i = 0; i < 5; i++) {
            const bell = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 4), mat);
            bell.position.set(-0.78 + i * 0.39, 0.78 - row * 0.55, 0);
            bell.rotation.y = Math.PI / 4;
            rackGroup.add(bell);
          }
        }

        return rackGroup;

      case 'scroll': // Book/Scroll
        const scrollGroup = new THREE.Group();
        const scrollGeo = new THREE.PlaneGeometry(1.72, 0.82, 12, 3);
        const paper = new THREE.Mesh(scrollGeo, mat);
        paper.position.y = 0.32;
        scrollGroup.add(paper);
        
        // Handles/Rolls at left & right
        const rollGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.92, 12);
        const rollMat = new THREE.MeshStandardMaterial({ color: '#5c4033', roughness: 0.6 });
        const leftRoll = new THREE.Mesh(rollGeo, rollMat);
        leftRoll.position.set(-0.92, 0.32, 0);
        const rightRoll = leftRoll.clone();
        rightRoll.position.x = 0.92;
        
        scrollGroup.add(leftRoll);
        scrollGroup.add(rightRoll);
        return scrollGroup;

      case 'humanoid': // Terracotta Warrior or Buddha statue
        const bodyGroup = new THREE.Group();
        // Base / pedestal connect
        const baseGeo = new THREE.BoxGeometry(0.8, 0.1, 0.8);
        const base = new THREE.Mesh(baseGeo, mat);
        bodyGroup.add(base);
        // Torso/Robe (Cone)
        const bodyGeo = new THREE.ConeGeometry(0.5, 1.2, 8);
        const body = new THREE.Mesh(bodyGeo, mat);
        body.position.y = 0.6;
        bodyGroup.add(body);
        // Head
        const headGeo = new THREE.SphereGeometry(0.22, 12, 12);
        const head = new THREE.Mesh(headGeo, mat);
        head.position.y = 1.35;
        bodyGroup.add(head);
        
        return bodyGroup;

      case 'cylinder-vase': // Porcelain Vase
        const vaseGroup = new THREE.Group();
        // Base
        const vBase = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 16), mat);
        vaseGroup.add(vBase);
        // Bulbous body
        const vBody = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 16), mat);
        vBody.position.y = 0.55;
        vBody.scale.y = 1.1;
        vaseGroup.add(vBody);
        // Neck
        const vNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.6, 16), mat);
        vNeck.position.y = 1.1;
        vaseGroup.add(vNeck);
        // Lip
        const vLip = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 16), mat);
        vLip.position.y = 1.4;
        vLip.rotation.x = Math.PI / 2;
        vaseGroup.add(vLip);

        for (let side = -1; side <= 1; side += 2) {
          const handle = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 18, Math.PI), mat);
          handle.position.set(side * 0.5, 0.94, 0);
          handle.rotation.z = side * Math.PI / 2;
          vaseGroup.add(handle);
        }
        
        return vaseGroup;

      case 'camel-stage': // Tang sancai camel with performers
        const camelGroup = new THREE.Group();
        const camelBody = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), mat);
        camelBody.scale.set(1.45, 0.55, 0.45);
        camelBody.position.y = 0.45;
        camelGroup.add(camelBody);

        const camelHump1 = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.42, 12), mat);
        camelHump1.position.set(-0.28, 0.92, 0);
        const camelHump2 = camelHump1.clone();
        camelHump2.position.x = 0.24;
        camelGroup.add(camelHump1, camelHump2);

        const camelNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.72, 12), mat);
        camelNeck.position.set(0.82, 0.82, 0);
        camelNeck.rotation.z = -0.55;
        camelGroup.add(camelNeck);

        const camelHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), mat);
        camelHead.position.set(1.08, 1.17, 0);
        camelGroup.add(camelHead);

        for (let i = -1; i <= 1; i += 2) {
          for (let j = -1; j <= 1; j += 2) {
            const camelLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.7, 8), mat);
            camelLeg.position.set(i * 0.42, 0.0, j * 0.16);
            camelGroup.add(camelLeg);
          }
        }

        const camelStage = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 0.52), new THREE.MeshStandardMaterial({ color: '#8b3f20', roughness: 0.5, metalness: 0.1 }));
        camelStage.position.y = 1.12;
        camelGroup.add(camelStage);

        for (let i = 0; i < 3; i++) {
          const performer = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshStandardMaterial({ color: '#f0d0a0', roughness: 0.6 }));
          performer.position.set(-0.24 + i * 0.24, 1.28, 0);
          camelGroup.add(performer);
        }

        return camelGroup;

      case 'cylinder-ringed': // Buddhist staff
        const staffGroup = new THREE.Group();
        const staffPole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.85, 12), mat);
        staffPole.position.y = 0.2;
        staffGroup.add(staffPole);

        const staffHead = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.025, 8, 32), mat);
        staffHead.position.y = 1.18;
        staffGroup.add(staffHead);

        for (let i = 0; i < 6; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 6, 16), mat);
          const angle = (i / 6) * Math.PI * 2;
          ring.position.set(Math.cos(angle) * 0.23, 1.18 + Math.sin(angle) * 0.1, 0);
          staffGroup.add(ring);
        }

        return staffGroup;

      case 'desk': // Southwest classroom table
        return this.createWartimeDeskArtifact();

      case 'cylinder-disk': // Steering wheel and enamel cup
        return this.createSteeringCupArtifact();

      case 'box': // Cassette recorder and train ticket
        return this.createCassetteTicketArtifact();

      case 'glass-slab': // Smartphone
        return this.createSmartphoneArtifact();

      case 'cylinder-cup': // Tea cup and glowing screen
        return this.createTeaScreenArtifact();

      default: // generic cylinder
        geo = new THREE.CylinderGeometry(0.6, 0.6, 1.0, 16);
        return new THREE.Mesh(geo, mat);
    }
  }

  // Room Particle Emitters (Embers, Petals, Leaves, Rain, Matrix Code)
  createRoomParticles(roomGroup, type, color, w, h, l) {
    const count = type === 'digital' ? 300 : 150;
    const geo = new THREE.BufferGeometry();
    const positions = [];
    const velocities = [];

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * w;
      const y = Math.random() * h;
      const z = (Math.random() - 0.5) * l;
      positions.push(x, y, z);
      
      // particle velocity
      const vx = (Math.random() - 0.5) * 0.02;
      let vy = -0.01 - Math.random() * 0.02;
      const vz = (Math.random() - 0.5) * 0.02;
      
      if (type === 'embers' || type === 'light-beams') {
        vy = 0.01 + Math.random() * 0.02; // embers rise
      }
      
      velocities.push(vx, vy, vz);
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    // Material matching type
    let mat;
    if (type === 'embers') {
      mat = new THREE.PointsMaterial({
        color: '#ff4400',
        size: 0.15,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
      });
    } else if (type === 'blossoms') {
      mat = new THREE.PointsMaterial({
        color: '#ffb6c1', // Cherry blossoms pink
        size: 0.2,
        transparent: true,
        opacity: 0.7
      });
    } else if (type === 'leaves') {
      mat = new THREE.PointsMaterial({
        color: '#8b5a2b', // falling brown/gold leaves
        size: 0.22,
        transparent: true,
        opacity: 0.7
      });
    } else if (type === 'digital') {
      mat = new THREE.PointsMaterial({
        color: '#2ecc71',
        size: 0.12,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending
      });
    } else {
      mat = new THREE.PointsMaterial({
        color: color,
        size: 0.1,
        transparent: true,
        opacity: 0.5
      });
    }

    const points = new THREE.Points(geo, mat);
    roomGroup.add(points);
    
    this.particles.push({
      mesh: points,
      velocities: velocities,
      type: type,
      height: h,
      width: w,
      length: l
    });
  }

  // Camera Timeline Slider Control
  setPathProgress(progress, immediate = false) {
    // Keep between 0 and 1
    this.targetProgress = Math.max(0, Math.min(1, progress));

    if (immediate) {
      gsap.killTweensOf(this.camera.position);
      this.focusedObject = null;
      this.cameraProgress = this.targetProgress;
      this.updateCameraFromPath();
      this.currentRoomIndex = this.getRoomIndexFromProgress(this.cameraProgress);
    }
  }

  getRoomIndexFromProgress(progress) {
    const scaled = progress * (this.nodesData.length - 1);
    return Math.max(0, Math.min(this.nodesData.length - 1, Math.round(scaled)));
  }

  updateCameraFromPath() {
    const pos = this.pathCurve.getPointAt(this.cameraProgress);
    this.camera.position.copy(pos);

    const lookT = Math.min(this.cameraProgress + 0.015, 0.999);
    const pathLookTarget = this.pathCurve.getPointAt(lookT);
    const pathDirection = pathLookTarget.clone().sub(this.camera.position).normalize();
    const yawAxis = new THREE.Vector3(0, 1, 0);
    const lookDir = pathDirection.clone().applyAxisAngle(yawAxis, this.cameraRotation.y);
    lookDir.y += Math.sin(this.cameraRotation.x) * 0.65;
    lookDir.normalize();

    this.lookTarget.copy(this.camera.position).add(lookDir);
    this.camera.lookAt(this.lookTarget);
  }

  // Window Resize
  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // --- Mouse / Touch View Controls (Drag to rotate look around) ---
  onMouseDown(e) {
    if (this.focusedObject) return; // disable during close-up inspect
    this.isUserDragging = true;
    this.dragStart.x = e.clientX;
    this.dragStart.y = e.clientY;
    this.dragRotationStart.x = this.cameraRotation.x;
    this.dragRotationStart.y = this.cameraRotation.y;
  }

  onMouseMove(e) {
    if (!this.isUserDragging) return;
    
    const deltaX = e.clientX - this.dragStart.x;
    const deltaY = e.clientY - this.dragStart.y;
    
    // Sensitivity
    this.cameraRotation.y = this.dragRotationStart.y - deltaX * 0.003;
    this.cameraRotation.x = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, this.dragRotationStart.x - deltaY * 0.003));
  }

  onMouseUp() {
    this.isUserDragging = false;
  }

  onTouchStart(e) {
    if (e.touches.length === 1) {
      if (this.focusedObject) return;
      this.isUserDragging = true;
      this.dragStart.x = e.touches[0].clientX;
      this.dragStart.y = e.touches[0].clientY;
      this.dragRotationStart.x = this.cameraRotation.x;
      this.dragRotationStart.y = this.cameraRotation.y;
    }
  }

  onTouchMove(e) {
    if (!this.isUserDragging || e.touches.length !== 1) return;
    const deltaX = e.touches[0].clientX - this.dragStart.x;
    const deltaY = e.touches[0].clientY - this.dragStart.y;
    
    this.cameraRotation.y = this.dragRotationStart.y - deltaX * 0.005;
    this.cameraRotation.x = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, this.dragRotationStart.x - deltaY * 0.005));
  }

  onTouchEnd() {
    this.isUserDragging = false;
  }

  // --- Clicking objects (Raycaster) ---
  onClick(e) {
    // Only raycast if we weren't just dragging view
    if (this.isUserDragging) return;
    
    // Calculate normalized device coordinates (-1 to 1)
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Intersect objects in rooms
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    
    for (let i = 0; i < intersects.length; i++) {
      let obj = intersects[i].object;
      
      // Find parent group that holds our character or artifact metadata
      let interactiveParent = null;
      let current = obj;
      while (current && current !== this.scene) {
        if (current.userData && (current.userData.type === 'character' || current.userData.type === 'artifact')) {
          interactiveParent = current;
          break;
        }
        current = current.parent;
      }
      
      if (interactiveParent) {
        this.focusOnExhibit(interactiveParent);
        break;
      }
    }
  }

  // Focus camera close-up on Character / Artifact
  focusOnExhibit(object) {
    if (this.focusedObject) return;
    
    this.focusedObject = object;
    this.originalCameraPos.copy(this.camera.position);
    
    // Calculate target camera focus position
    const type = object.userData.type;
    const targetPos = new THREE.Vector3();
    object.getWorldPosition(targetPos);
    
    const offset = new THREE.Vector3();
    if (type === 'character') {
      offset.set(0, 0.5, 3.5); // float directly in front
    } else {
      offset.set(0, 1.2, 2.5); // focus close on artifact pedestal
    }
    
    // Apply offset based on object local orientation
    const cameraTargetPos = targetPos.clone().add(offset);

    // Dim the ambient rooms (except the spotlight on this object)
    gsap.to(this.scene.fog, { density: 0.05, duration: 1.0 });

    // Animate camera
    gsap.to(this.camera.position, {
      x: cameraTargetPos.x,
      y: cameraTargetPos.y,
      z: cameraTargetPos.z,
      duration: 1.2,
      ease: 'power2.inOut',
      onUpdate: () => {
        this.camera.lookAt(targetPos);
      },
      onComplete: () => {
        // Trigger UI event callback
        this.onInteract(type, object.userData.data);
      }
    });
  }

  // Zoom back out to corridor view
  exitFocus() {
    if (!this.focusedObject) return;

    gsap.to(this.scene.fog, { density: 0.015, duration: 1.2 });

    gsap.to(this.camera.position, {
      x: this.originalCameraPos.x,
      y: this.originalCameraPos.y,
      z: this.originalCameraPos.z,
      duration: 1.2,
      ease: 'power2.inOut',
      onUpdate: () => {
        // Look ahead along spline curve
        const t = Math.min(this.cameraProgress + 0.01, 0.999);
        this.camera.lookAt(this.pathCurve.getPointAt(t));
      },
      onComplete: () => {
        this.focusedObject = null;
        // reset camera angles to look forward
        this.cameraRotation.x = 0;
        this.cameraRotation.y = 0;
      }
    });
  }

  // --- Render/Frame Loop ---
  animate() {
    requestAnimationFrame(this.animate.bind(this));

    // 1. Camera Spline Follow (Interpolating progress towards target)
    if (!this.focusedObject) {
      this.cameraProgress += (this.targetProgress - this.cameraProgress) * 0.08;
      this.updateCameraFromPath();

      // Determine which room index we are currently in
      const activeIdx = this.getRoomIndexFromProgress(this.cameraProgress);
      
      if (activeIdx !== this.currentRoomIndex) {
        this.currentRoomIndex = activeIdx;
        // Dispatch event if room changes (to update ambient style / HUD)
        window.dispatchEvent(new CustomEvent('roomchange', { detail: { index: activeIdx } }));
      }
    }

    // 2. Animate local particles
    this.particles.forEach(p => {
      const posArr = p.mesh.geometry.attributes.position.array;
      const count = posArr.length / 3;

      for (let i = 0; i < count; i++) {
        // velocities
        const idx = i * 3;
        posArr[idx] += p.velocities[idx];     // dx
        posArr[idx + 1] += p.velocities[idx + 1]; // dy
        posArr[idx + 2] += p.velocities[idx + 2]; // dz

        // Bounds wrapping
        if (p.type === 'embers' || p.type === 'light-beams') {
          if (posArr[idx + 1] > p.height) posArr[idx + 1] = 0; // rise from bottom
        } else {
          if (posArr[idx + 1] < 0) posArr[idx + 1] = p.height; // fall from top
        }
        
        if (Math.abs(posArr[idx]) > p.width / 2) posArr[idx] = (Math.random() - 0.5) * p.width;
        if (Math.abs(posArr[idx + 2]) > p.length / 2) posArr[idx + 2] = (Math.random() - 0.5) * p.length;
      }
      p.mesh.geometry.attributes.position.needsUpdate = true;
    });

    // 3. Rotate artifacts on pedestals for dynamic showcase
    this.rooms.forEach(room => {
      room.children.forEach(exhibit => {
        // Artifact mesh is at index 1 of the exhibit group
        if (exhibit.children && exhibit.children[1] && exhibit.children[1].userData && exhibit.children[1].userData.type === 'artifact') {
          exhibit.children[1].rotation.y += 0.005;
        }
      });
    });

    this.renderer.render(this.scene, this.camera);
  }

  // --- Secondary Viewer for Artifact Modal (3D Inspect Panel) ---
  getArtifactViewerContrastProfile(art) {
    const variant = getArtifactVisualSpec(art)?.variant;
    if (variant === 'tea-screen') {
      return {
        isLightObject: false,
        ambientIntensity: 0.46,
        keyColor: '#ffe2bd',
        keyIntensity: 1.28,
        fillColor: '#9bc7dd',
        fillIntensity: 0.34,
        rimColor: '#d58d58',
        rimIntensity: 0.52,
        shadowOpacity: 0.38,
        exposure: 1.08
      };
    }
    if (variant === 'wartime-desk') {
      return {
        isLightObject: false,
        ambientIntensity: 0.12,
        keyColor: '#5f5144',
        keyIntensity: 0.18,
        fillColor: '#3a2c23',
        fillIntensity: 0.035,
        rimColor: '#9c5d32',
        rimIntensity: 0.11,
        shadowOpacity: 0.5,
        exposure: 0.9
      };
    }
    if (variant === 'cassette-ticket') {
      return {
        isLightObject: false,
        ambientIntensity: 0.56,
        keyColor: '#ffe5bd',
        keyIntensity: 1.42,
        fillColor: '#f2d2a7',
        fillIntensity: 0.46,
        rimColor: '#d59457',
        rimIntensity: 0.38,
        shadowOpacity: 0.32,
        exposure: 1.12
      };
    }
    const baseColor = art?.materialProps?.color || '#d4af37';
    const color = new THREE.Color(baseColor);
    const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    const isLightObject = luminance >= 0.56;

    return {
      isLightObject,
      ambientIntensity: isLightObject ? 0.68 : 0.82,
      keyColor: '#ffffff',
      keyIntensity: isLightObject ? 1.65 : 1.35,
      fillColor: '#fff4e1',
      fillIntensity: isLightObject ? 0.28 : 0.5,
      rimColor: isLightObject ? '#d4af37' : baseColor,
      rimIntensity: isLightObject ? 0.85 : 0.65,
      shadowOpacity: isLightObject ? 0.26 : 0.18
    };
  }

  initArtifactViewer(container, art, featureData = null) {
    this.destroyArtifactViewer(); // clear any previous sub-renderers

    const visual = getArtifactVisualSpec(art);
    if (visual?.variant === 'terracotta-warrior') {
      this.initArtifactTurntableViewer(container, {
        imagePath: './images/artifact-terracotta-warrior-multiview.png',
        label: '秦始皇陵兵马俑'
      });
      return;
    }
    if (visual?.variant === 'palace-lamp') {
      this.initArtifactTurntableViewer(container, {
        imagePath: './images/artifact-changxin-lamp-multiview.png',
        label: '长信宫灯'
      });
      return;
    }
    if (visual?.variant === 'buddha-statue') {
      this.initArtifactTurntableViewer(container, {
        imagePath: './images/artifact-yungang-buddha-multiview.png',
        label: '云冈石窟佛像',
        columns: 5,
        rows: 4,
        frameSequence: Array.from({ length: 15 }, (_, index) => index),
        elevationSequence: [15, 16, 17, 18, 19],
        maxInitialUpscale: 1.55
      });
      return;
    }
    if (visual?.variant === 'canal-tools') {
      this.initArtifactTurntableViewer(container, {
        imagePath: './images/artifact-canal-tools-multiview.png',
        label: '隋代运河拉纤铁具',
        columns: 4,
        rows: 4,
        frameSequence: [0, 1, 2, 3, 7, 11, 12, 13, 14, 15, 6, 5, 4],
        elevationSequence: [8, 9, 10],
        maxInitialUpscale: 1.6,
        removeBackground: true
      });
      return;
    }
    if (visual?.variant === 'sancai-camel') {
      this.initArtifactTurntableViewer(container, {
        imagePath: './images/artifact-sancai-camel-multiview-v2.png',
        label: '唐三彩驼载乐舞俑',
        columns: 4,
        rows: 4,
        frameSequence: Array.from({ length: 16 }, (_, index) => index),
        maxInitialUpscale: 1.5,
        removeCheckerboard: true
      });
      return;
    }
    if (visual?.variant === 'ringed-staff') {
      this.initArtifactTurntableViewer(container, {
        imagePath: './images/artifact-ringed-staff-multiview-keyed.png',
        label: '十二环银锡杖',
        columns: 4,
        rows: 2,
        frameSequence: Array.from({ length: 8 }, (_, index) => index),
        maxInitialUpscale: 1.45
      });
      return;
    }

    this.artViewerContainer = container;
    container.replaceChildren();

    const rect = container.getBoundingClientRect();
    const width = Math.max(280, Math.floor(rect.width || container.clientWidth || 420));
    const height = Math.max(260, Math.floor(rect.height || container.clientHeight || 360));

    try {
      const contrastProfile = this.getArtifactViewerContrastProfile(art);

      // 1. Create sub-renderer
      this.artViewerRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.artViewerRenderer.setSize(width, height);
      this.artViewerRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.artViewerRenderer.setClearColor(0x000000, 0);
      this.artViewerRenderer.shadowMap.enabled = true;
      this.artViewerRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.artViewerRenderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.artViewerRenderer.toneMappingExposure = contrastProfile.exposure || 1.1;
      this.artViewerRenderer.domElement.setAttribute('aria-label', '展品 3D 交互预览');
      this.artViewerRenderer.domElement.style.visibility = 'hidden';
      this.artViewerRenderer.domElement.style.transition = 'none';
      this.artViewerRenderer.domElement.style.animation = 'none';
      container.replaceChildren(this.artViewerRenderer.domElement);

      // 2. Create sub-scene & camera
      this.artViewerScene = new THREE.Scene();
      if (visual?.variant === 'tea-screen') {
        const backdrop = document.createElement('canvas');
        backdrop.width = 1024;
        backdrop.height = 1024;
        const backdropCtx = backdrop.getContext('2d');
        const backdropGradient = backdropCtx.createRadialGradient(390, 350, 40, 520, 520, 760);
        backdropGradient.addColorStop(0, '#493126');
        backdropGradient.addColorStop(0.46, '#211713');
        backdropGradient.addColorStop(1, '#090b0e');
        backdropCtx.fillStyle = backdropGradient;
        backdropCtx.fillRect(0, 0, backdrop.width, backdrop.height);
        for (let i = 0; i < 140; i++) {
          const x = (i * 137) % backdrop.width;
          const y = (i * 223) % backdrop.height;
          backdropCtx.fillStyle = `rgba(255, 214, 166, ${0.008 + (i % 4) * 0.003})`;
          backdropCtx.fillRect(x, y, 1, 1);
        }
        const backdropTexture = new THREE.CanvasTexture(backdrop);
        backdropTexture.colorSpace = THREE.SRGBColorSpace;
        this.artViewerScene.background = backdropTexture;
      }
      this.artViewerCamera = new THREE.PerspectiveCamera(42, width / height, 0.1, 20);
      this.artViewerCamera.position.set(0, 0.15, 4.0);

      // 3. Add lights to sub-scene
      const ambient = new THREE.AmbientLight('#ffffff', contrastProfile.ambientIntensity);
      this.artViewerScene.add(ambient);

      const keyLight = new THREE.DirectionalLight(contrastProfile.keyColor || '#ffffff', contrastProfile.keyIntensity);
      keyLight.position.set(2.5, 4, 3);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 12;
      keyLight.shadow.bias = -0.00025;
      this.artViewerScene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(contrastProfile.fillColor || '#fff4e1', contrastProfile.fillIntensity);
      fillLight.position.set(-3, 1.8, 1.6);
      this.artViewerScene.add(fillLight);

      const rimLight = new THREE.PointLight(contrastProfile.rimColor, contrastProfile.rimIntensity, 8);
      rimLight.position.set(-2, 1.5, 2);
      this.artViewerScene.add(rimLight);

      // 4. Generate artifact mesh clone and fit it to the viewer
      this.artViewerMesh = this.buildProceduralArtifact(art);
      this.artViewerMesh.traverse((obj) => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });

      const box = new THREE.Box3().setFromObject(this.artViewerMesh);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      this.artViewerMesh.position.sub(center);
      const isPaintedPottery = visual?.variant === 'painted-pottery';
      const initialScaleFactor = isPaintedPottery
        ? 0.78
        : visual?.variant === 'ru-tripod'
        ? 0.82
        : visual?.variant === 'blue-white-vase'
          ? 0.82
          : visual?.variant === 'wartime-desk'
            ? 0.78
          : 1;
      // Fit both axes independently so every artifact starts fully inside the viewer.
      const safeWidth = Math.max(size.x, 0.001);
      const safeHeight = Math.max(size.y, 0.001);
      const fitHeight = 2.35;
      const fitWidth = fitHeight * this.artViewerCamera.aspect;
      const viewerScale = Math.min(fitWidth / safeWidth, fitHeight / safeHeight, 2.85)
        * initialScaleFactor
        * 0.94;
      this.artViewerMesh.scale.setScalar(viewerScale);
      if (isPaintedPottery) {
        // Align the complete wide bowl with the camera center and preserve edge breathing room.
        this.artViewerMesh.position.y += this.artViewerCamera.position.y;
      }

      const scaledMinY = (box.min.y - center.y) * viewerScale;
      const shadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(5.2, 5.2),
        new THREE.ShadowMaterial({
          color: 0x000000,
          opacity: contrastProfile.shadowOpacity,
          transparent: true
        })
      );
      shadowPlane.rotation.x = -Math.PI / 2;
      shadowPlane.position.set(0, scaledMinY - 0.04, 0.05);
      shadowPlane.receiveShadow = true;
      this.artViewerScene.add(shadowPlane);

      this.artViewerScene.add(this.artViewerMesh);

      const viewerRenderer = this.artViewerRenderer;
      const viewerCanvas = viewerRenderer.domElement;
      const revealViewer = () => {
        if (this.artViewerRenderer !== viewerRenderer || !this.artViewerScene || !this.artViewerCamera) return;
        viewerRenderer.render(this.artViewerScene, this.artViewerCamera);
        viewerCanvas.style.visibility = 'visible';
      };
      const readyPromise = this.artViewerMesh.userData?.readyPromise;
      if (readyPromise && typeof readyPromise.finally === 'function') {
        readyPromise.finally(revealViewer);
      } else {
        revealViewer();
      }

      // 5. Interactive drag-to-rotate handlers
      let isDragging = false;
      let dragMode = 'rotate';
      let previousMousePosition = { x: 0, y: 0 };

      this.artViewerDragStart = (e) => {
        if (e.button != null && e.button !== 0 && e.button !== 2) return;
        isDragging = true;
        dragMode = e.button === 2 ? 'pan' : 'rotate';
        previousMousePosition = { x: e.clientX, y: e.clientY };
        if (container.setPointerCapture && e.pointerId != null) {
          container.setPointerCapture(e.pointerId);
        }
        e.preventDefault();
      };

      this.artViewerDragMove = (e) => {
        if (!isDragging) return;
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;

        if (this.artViewerMesh && dragMode === 'rotate') {
          this.artViewerMesh.rotation.y += deltaX * 0.01;
          this.artViewerMesh.rotation.x = Math.max(
            -Math.PI / 3,
            Math.min(Math.PI / 3, this.artViewerMesh.rotation.x + deltaY * 0.01)
          );
        } else if (this.artViewerMesh && dragMode === 'pan') {
          this.artViewerMesh.position.x += deltaX * 0.004;
          this.artViewerMesh.position.y -= deltaY * 0.004;
        }

        previousMousePosition = { x: e.clientX, y: e.clientY };
      };

      this.artViewerDragEnd = () => {
        isDragging = false;
      };

      this.artViewerWheel = (e) => {
        if (!this.artViewerCamera) return;
        e.preventDefault();
        this.artViewerCamera.position.z = THREE.MathUtils.clamp(
          this.artViewerCamera.position.z + e.deltaY * 0.0025,
          2.25,
          6.2
        );
      };

      this.artViewerContextMenu = (e) => e.preventDefault();

      // Bind event listeners on the container
      container.addEventListener('pointerdown', this.artViewerDragStart);
      container.addEventListener('pointermove', this.artViewerDragMove);
      container.addEventListener('wheel', this.artViewerWheel, { passive: false });
      container.addEventListener('contextmenu', this.artViewerContextMenu);
      window.addEventListener('pointerup', this.artViewerDragEnd);
      window.addEventListener('pointercancel', this.artViewerDragEnd);

      // 6. Sub-scene render frame loop
      const animateSub = () => {
        this.artViewerAnimFrame = requestAnimationFrame(animateSub);

        if (this.artViewerMesh?.userData?.updateArtifact) {
          this.artViewerMesh.userData.updateArtifact(performance.now() * 0.001);
        }

        // Auto-rotate slowly when not dragging
        if (!isDragging && this.artViewerMesh) {
          this.artViewerMesh.rotation.y += 0.005;
        }

        if (this.artViewerRenderer && this.artViewerScene && this.artViewerCamera) {
          this.artViewerRenderer.render(this.artViewerScene, this.artViewerCamera);
        }
      };

      animateSub();
    } catch (error) {
      console.error('Artifact viewer failed to initialize:', error);
      container.innerHTML = '<div class="viewer-state">3D 预览暂不可用，请确认浏览器已启用 WebGL。</div>';
    }
  }

  initArtifactTurntableViewer(container, {
    imagePath,
    label,
    columns = 4,
    rows = 2,
    frameSequence = null,
    elevationSequence = null,
    maxInitialUpscale = Number.POSITIVE_INFINITY,
    removeBackground = false,
    removeCheckerboard = false,
    chromaKey = null
  }) {
    this.artViewerContainer = container;
    container.replaceChildren();

    const canvas = document.createElement('canvas');
    canvas.className = 'artifact-turntable-canvas';
    canvas.setAttribute('aria-label', `${label}多角度旋转预览`);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.visibility = 'hidden';
    canvas.style.cursor = 'grab';
    container.replaceChildren(canvas);

    const image = new Image();
    const orbitSequence = frameSequence || Array.from({ length: columns * rows }, (_, index) => index);
    const verticalSequence = elevationSequence || [];
    const frameCache = new Map();
    const state = {
      orbitFrame: 0,
      elevationFrame: Math.floor(verticalSequence.length / 2),
      viewMode: 'orbit',
      scale: 1,
      panX: 0,
      panY: 0,
      dragging: false,
      mode: 'rotate',
      lastX: 0,
      lastY: 0,
      frameDrag: 0,
      axisX: 0,
      axisY: 0,
      dragAxis: null
    };

    const createFrameCanvas = (sourceFrame) => {
      if (frameCache.has(sourceFrame)) return frameCache.get(sourceFrame);
      const tileWidth = Math.floor(image.naturalWidth / columns);
      const tileHeight = Math.floor(image.naturalHeight / rows);
      const sourceColumn = sourceFrame % columns;
      const sourceRow = Math.floor(sourceFrame / columns);
      const inset = Math.max(6, Math.min(10, Math.round(Math.min(tileWidth, tileHeight) * 0.022)));
      const frame = document.createElement('canvas');
      frame.width = tileWidth - inset * 2;
      frame.height = tileHeight - inset * 2;
      const frameContext = frame.getContext('2d', { willReadFrequently: removeBackground || removeCheckerboard });
      frameContext.drawImage(
        image,
        sourceColumn * (image.naturalWidth / columns) + inset,
        sourceRow * (image.naturalHeight / rows) + inset,
        image.naturalWidth / columns - inset * 2,
        image.naturalHeight / rows - inset * 2,
        0,
        0,
        frame.width,
        frame.height
      );

      if (removeBackground || removeCheckerboard) {
        const pixels = frameContext.getImageData(0, 0, frame.width, frame.height);
        const data = pixels.data;
        if (removeCheckerboard) {
          for (let offset = 0; offset < data.length; offset += 4) {
            const red = data[offset];
            const green = data[offset + 1];
            const blue = data[offset + 2];
            const maximum = Math.max(red, green, blue);
            const minimum = Math.min(red, green, blue);
            const chroma = maximum - minimum;
            const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
            const neutral = 1 - THREE.MathUtils.smoothstep(chroma, 8, 26);
            const bright = THREE.MathUtils.smoothstep(luminance, 188, 232);
            const alpha = 1 - neutral * bright;
            data[offset + 3] = Math.round(data[offset + 3] * alpha);
          }
        } else {
          const sampleSize = Math.max(4, Math.floor(Math.min(frame.width, frame.height) * 0.035));
          let red = 0;
          let green = 0;
          let blue = 0;
          let samples = 0;
          const sampleCorner = (startX, startY) => {
            for (let y = startY; y < startY + sampleSize; y++) {
              for (let x = startX; x < startX + sampleSize; x++) {
                const offset = (y * frame.width + x) * 4;
                red += data[offset];
                green += data[offset + 1];
                blue += data[offset + 2];
                samples += 1;
              }
            }
          };
          sampleCorner(0, 0);
          sampleCorner(frame.width - sampleSize, 0);
          sampleCorner(0, frame.height - sampleSize);
          sampleCorner(frame.width - sampleSize, frame.height - sampleSize);
          const background = {
            r: red / samples,
            g: green / samples,
            b: blue / samples
          };

          for (let offset = 0; offset < data.length; offset += 4) {
            const dr = data[offset] - background.r;
            const dg = data[offset + 1] - background.g;
            const db = data[offset + 2] - background.b;
            const distance = Math.sqrt(dr * dr + dg * dg + db * db);
            const alpha = THREE.MathUtils.smoothstep(distance, 10, 38);
            data[offset + 3] = Math.round(data[offset + 3] * alpha);
          }
        }

        const edgeBand = Math.max(2, Math.round(Math.min(frame.width, frame.height) * 0.008));
        for (let y = 0; y < frame.height; y++) {
          for (let x = 0; x < frame.width; x++) {
            if (x >= edgeBand && x < frame.width - edgeBand && y >= edgeBand && y < frame.height - edgeBand) continue;
            data[(y * frame.width + x) * 4 + 3] = 0;
          }
        }
        frameContext.putImageData(pixels, 0, 0);
      }

      frameCache.set(sourceFrame, frame);
      return frame;
    };

    const drawFrame = () => {
      if (!image.complete || !image.naturalWidth) return;
      const rect = container.getBoundingClientRect();
      const cssWidth = Math.max(280, Math.floor(rect.width || container.clientWidth || 420));
      const cssHeight = Math.max(260, Math.floor(rect.height || container.clientHeight || 360));
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.floor(cssWidth * pixelRatio);
      const height = Math.floor(cssHeight * pixelRatio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const context = canvas.getContext('2d');
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, cssWidth, cssHeight);
      context.fillStyle = '#141517';
      context.fillRect(0, 0, cssWidth, cssHeight);

      const activeSequence = state.viewMode === 'elevation' && verticalSequence.length
        ? verticalSequence
        : orbitSequence;
      const activeFrame = state.viewMode === 'elevation' ? state.elevationFrame : state.orbitFrame;
      const sourceFrame = activeSequence[activeFrame];
      const frame = createFrameCanvas(sourceFrame);
      const tileWidth = frame.width;
      const tileHeight = frame.height;
      const availableWidth = cssWidth * 0.9;
      const availableHeight = cssHeight * 0.9;
      const nativeFitScale = Math.min(availableWidth / tileWidth, availableHeight / tileHeight);
      const fitScale = Math.min(nativeFitScale, maxInitialUpscale) * state.scale;
      const drawWidth = tileWidth * fitScale;
      const drawHeight = tileHeight * fitScale;
      const drawX = (cssWidth - drawWidth) * 0.5 + state.panX;
      const drawY = (cssHeight - drawHeight) * 0.5 + state.panY;

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(
        frame,
        0,
        0,
        tileWidth,
        tileHeight,
        drawX,
        drawY,
        drawWidth,
        drawHeight
      );
      canvas.style.visibility = 'visible';
    };

    this.artViewerDrawFrame = drawFrame;
    this.artViewerDragStart = (event) => {
      if (event.button != null && event.button !== 0 && event.button !== 2) return;
      state.dragging = true;
      state.mode = event.button === 2 ? 'pan' : 'rotate';
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      state.frameDrag = 0;
      state.axisX = 0;
      state.axisY = 0;
      state.dragAxis = null;
      canvas.style.cursor = 'grabbing';
      if (container.setPointerCapture && event.pointerId != null) container.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    this.artViewerDragMove = (event) => {
      if (!state.dragging) return;
      const deltaX = event.clientX - state.lastX;
      const deltaY = event.clientY - state.lastY;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      if (state.mode === 'pan') {
        state.panX += deltaX;
        state.panY += deltaY;
      } else {
        state.axisX += deltaX;
        state.axisY += deltaY;
        if (!state.dragAxis && Math.hypot(state.axisX, state.axisY) >= 8) {
          state.dragAxis = verticalSequence.length && Math.abs(state.axisY) > Math.abs(state.axisX)
            ? 'vertical'
            : 'horizontal';
          state.frameDrag = 0;
        }
        if (!state.dragAxis) return;

        const isVertical = state.dragAxis === 'vertical';
        const sequence = isVertical ? verticalSequence : orbitSequence;
        state.viewMode = isVertical ? 'elevation' : 'orbit';
        state.frameDrag += isVertical ? deltaY : deltaX;
        while (Math.abs(state.frameDrag) >= 34) {
          const direction = state.frameDrag > 0 ? 1 : -1;
          if (isVertical) {
            state.elevationFrame = THREE.MathUtils.clamp(
              state.elevationFrame + direction,
              0,
              sequence.length - 1
            );
          } else {
            state.orbitFrame = (state.orbitFrame + direction + sequence.length) % sequence.length;
          }
          state.frameDrag -= direction * 34;
        }
      }
      drawFrame();
    };
    this.artViewerDragEnd = () => {
      state.dragging = false;
      canvas.style.cursor = 'grab';
    };
    this.artViewerWheel = (event) => {
      event.preventDefault();
      state.scale = THREE.MathUtils.clamp(state.scale - event.deltaY * 0.001, 0.72, 2.4);
      drawFrame();
    };
    this.artViewerContextMenu = (event) => event.preventDefault();

    container.addEventListener('pointerdown', this.artViewerDragStart);
    container.addEventListener('pointermove', this.artViewerDragMove);
    container.addEventListener('wheel', this.artViewerWheel, { passive: false });
    container.addEventListener('contextmenu', this.artViewerContextMenu);
    window.addEventListener('pointerup', this.artViewerDragEnd);
    window.addEventListener('pointercancel', this.artViewerDragEnd);

    image.onload = () => {
      [...new Set([...orbitSequence, ...verticalSequence])].forEach((frame) => createFrameCanvas(frame));
      drawFrame();
    };
    image.onerror = () => {
      container.innerHTML = '<div class="viewer-state">多视角预览图加载失败。</div>';
    };
    image.src = imagePath;
  }

  destroyArtifactViewer() {
    // 1. Cancel animation frame
    if (this.artViewerAnimFrame) {
      cancelAnimationFrame(this.artViewerAnimFrame);
      this.artViewerAnimFrame = null;
    }

    // 2. Remove listeners
    if (this.artViewerContainer) {
      this.artViewerContainer.removeEventListener('pointerdown', this.artViewerDragStart);
      this.artViewerContainer.removeEventListener('pointermove', this.artViewerDragMove);
      this.artViewerContainer.removeEventListener('wheel', this.artViewerWheel);
      this.artViewerContainer.removeEventListener('contextmenu', this.artViewerContextMenu);
      window.removeEventListener('pointerup', this.artViewerDragEnd);
      window.removeEventListener('pointercancel', this.artViewerDragEnd);
      
      this.artViewerContainer.innerHTML = '';
      this.artViewerContainer = null;
    }
    this.artViewerDrawFrame = null;
    this.artViewerMesh = null;

    // 3. Clear scene objects
    if (this.artViewerScene) {
      this.artViewerScene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      this.artViewerScene = null;
    }

    // 4. Dispose renderer
    if (this.artViewerRenderer) {
      this.artViewerRenderer.dispose();
      this.artViewerRenderer = null;
    }
  }

  resizeArtifactViewer() {
    if (this.artViewerDrawFrame) {
      this.artViewerDrawFrame();
      return;
    }
    if (!this.artViewerRenderer || !this.artViewerCamera || !this.artViewerContainer) return;
    const rect = this.artViewerContainer.getBoundingClientRect();
    const width = Math.max(280, Math.floor(rect.width || this.artViewerContainer.clientWidth || 420));
    const height = Math.max(260, Math.floor(rect.height || this.artViewerContainer.clientHeight || 360));
    this.artViewerRenderer.setSize(width, height);
    this.artViewerCamera.aspect = width / height;
    this.artViewerCamera.updateProjectionMatrix();
  }
}
