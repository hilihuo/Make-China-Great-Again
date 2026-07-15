import { nodesData } from './nodes.js';
import { MuseumRenderer } from './renderer.js';
import { sound } from './sound.js';
import { getArtifactVisualSpec, getVisualSpec } from './visualSpecs.js';
import { gsap } from 'gsap';
import { Capacitor } from '@capacitor/core';

const androidLayoutPreviewMode = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('android-layout-preview')
  : null;
const isAndroidLayoutPreview = androidLayoutPreviewMode !== null;
const isAndroidApp = (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android')
  || isAndroidLayoutPreview;
document.documentElement.classList.toggle('android-app', isAndroidApp);

class MuseumApp {
  constructor() {
    this.renderer = null;
    this.currentEraIndex = 0;
    this.isExploring = false;
    this.currentSpeech = null;
    this.speechRequestId = 0;
    this.speechResumeTimer = null;
    this.monologueTimeout = null;
    this.isStartingJourney = false;
    this.totalNodes = nodesData.length;
    this.activeNodeIndex = 0;
    this.imageGalleryIndex = 0;
    this.imageGalleryMode = 'human';
    this.imageGalleryNodeIndex = 0;
    this.isRenderingHumanImage = false;
    this.autoCharacterSpotlightCall = null;
    this.imageLoadRequestId = 0;
    this.characterImageRequestId = 0;
    this.spotlightImageRequestId = 0;
    this.artifactReferenceRequestId = 0;

    // UI elements
    this.introScreen = document.getElementById('intro-screen');
    this.hud = document.getElementById('hud');
    this.eraIndex = document.getElementById('era-index');
    this.eraTitle = document.getElementById('era-title');
    this.eraTagline = document.getElementById('era-tagline');
    this.progressBar = document.getElementById('progress-bar');
    this.nodeVisualCanvas = document.getElementById('node-visual-canvas');
    this.nodePeriod = document.getElementById('node-period');
    this.nodeInsightTitle = document.getElementById('node-insight-title');
    this.nodeInsightText = document.getElementById('node-insight-text');
    this.nodeCharacterCount = document.getElementById('node-character-count');
    this.nodeArtifactCount = document.getElementById('node-artifact-count');
    this.nodeImageBtn = document.getElementById('node-image-btn');
    this.nodePersonBtn = document.getElementById('node-person-btn');
    this.nodeEventBtn = document.getElementById('node-event-btn');
    this.nodeSiteBtn = document.getElementById('node-site-btn');
    this.node3dBtn = document.getElementById('node-3d-btn');
    this.imageModal = document.getElementById('image-modal');
    this.imageModalCanvas = document.getElementById('image-modal-canvas');
    this.imageModalPeriod = document.getElementById('image-modal-period');
    this.imageModalTitle = document.getElementById('image-modal-title');
    this.imageModalCaption = document.getElementById('image-modal-caption');
    this.imagePrevBtn = document.getElementById('image-prev-btn');
    this.imageNextBtn = document.getElementById('image-next-btn');
    this.closeImageBtn = document.getElementById('close-image-btn');
    this.characterSpotlight = document.getElementById('character-spotlight');
    this.characterSpotlightImg = document.getElementById('character-spotlight-img');
    this.routeStops = Array.from(document.querySelectorAll('.route-stop'));
    
    this.startBtn = document.getElementById('start-btn');
    this.audioToggleBtn = document.getElementById('audio-toggle-btn');
    this.prevBtn = document.getElementById('prev-btn');
    this.nextBtn = document.getElementById('next-btn');
    
    // Sidebar elements
    this.menuToggleBtn = document.getElementById('menu-toggle-btn');
    this.closeSidebarBtn = document.getElementById('close-sidebar-btn');
    this.timelineSidebar = document.getElementById('timeline-sidebar');
    this.sidebarList = document.getElementById('sidebar-list');

    this.charModal = document.getElementById('character-modal');
    this.charName = document.getElementById('char-name');
    this.charRole = document.getElementById('char-role');
    this.charQuote = document.getElementById('char-quote');
    this.charDescription = document.getElementById('char-description');
    this.charVoiceBtn = document.getElementById('char-voice-btn');
    this.charAvatar = document.getElementById('char-avatar');
    this.closeCharBtn = document.getElementById('close-char-btn');
    
    this.artModal = document.getElementById('artifact-modal');
    this.artName = document.getElementById('art-name');
    this.artEra = document.getElementById('art-era');
    this.artNarrative = document.getElementById('art-narrative');
    this.artPosterCanvas = document.getElementById('art-poster-canvas');
    this.artCanvasContainer = document.getElementById('art-canvas-container');
    this.artVisualStage = document.getElementById('art-visual-stage');
    this.artModelToggle = document.getElementById('art-model-toggle');
    this.artReferenceToggle = document.getElementById('art-reference-toggle');
    this.artReferencePanel = document.getElementById('art-reference-panel');
    this.artReferenceImage = document.getElementById('art-reference-image');
    this.artReferenceCaption = document.getElementById('art-reference-caption');
    this.artFeatureList = document.getElementById('art-feature-list');
    this.artVoiceBtn = document.getElementById('art-voice-btn');
    this.closeArtBtn = document.getElementById('close-art-btn');
    this.activeArtifact = null;
    
    this.transitionGate = document.getElementById('transition-gate');
    this.transitionPhrase = document.getElementById('transition-phrase');
    
    this.lookbackScreen = document.getElementById('lookback-screen');
    this.lookbackGrid = document.getElementById('lookback-grid');
    this.restartBtn = document.getElementById('restart-btn');

    this.bindEvents();
  }

  init() {
    // Hide loader loading label and show button
    const loadingStatus = document.querySelector('.loading-status');
    if (loadingStatus) loadingStatus.style.display = 'none';

    // Create 3D renderer instance
    this.renderer = new MuseumRenderer(
      'webgl-canvas',
      nodesData,
      this.onObjectInteract.bind(this)
    );

    // Populate timeline sidebar list
    this.populateSidebar();
    // Keep the compact Android landing screen unobstructed. The timeline remains
    // available from the top-right control, while desktop keeps the always-open卷册.
    this.toggleSidebar(!isAndroidApp);

    // Sync progress bar
    this.updateProgressBar();
    this.handleRoomChange(0, { showGate: false, updateSound: false });
  }

  bindEvents() {
    this.startBtn.addEventListener('click', () => this.startJourney());
    this.audioToggleBtn.addEventListener('click', () => this.toggleAudio());
    
    // Sidebar Toggles
    this.menuToggleBtn.addEventListener('click', () => this.toggleSidebar(true));
    this.closeSidebarBtn.addEventListener('click', () => this.toggleSidebar(false));
    
    // Bottom Nav buttons
    this.prevBtn.addEventListener('click', () => this.navigateEra(-1));
    this.nextBtn.addEventListener('click', () => this.navigateEra(1));
    
    // Close Modals
    this.closeImageBtn.addEventListener('click', () => this.closeImageModal());
    this.closeCharBtn.addEventListener('click', () => this.closeCharacterModal());
    this.closeArtBtn.addEventListener('click', () => this.closeArtifactModal());
    this.artVoiceBtn?.addEventListener('click', () => this.toggleArtifactVoice());
    this.artModelToggle?.addEventListener('click', () => this.setArtifactReferenceMode(false));
    this.artReferenceToggle?.addEventListener('click', () => this.setArtifactReferenceMode(true));

    // Explicit node preview actions
    this.nodeImageBtn.addEventListener('click', () => this.openImageModal('human', this.nodeImageBtn));
    this.nodePersonBtn?.addEventListener('click', () => this.openImageModal('person', this.nodePersonBtn));
    this.nodeEventBtn?.addEventListener('click', () => this.openImageModal('event', this.nodeEventBtn));
    this.nodeSiteBtn?.addEventListener('click', () => this.openImageModal('site', this.nodeSiteBtn));
    this.node3dBtn.addEventListener('click', () => this.openCurrentArtifactModal());
    this.imagePrevBtn.addEventListener('click', () => this.changeImageGallery(-1));
    this.imageNextBtn.addEventListener('click', () => this.changeImageGallery(1));
    
    // Speech synthesis triggers
    this.charVoiceBtn.addEventListener('click', () => this.speakCharacterQuote());

    // Restart App
    this.restartBtn.addEventListener('click', () => this.restartApp());

    this.bindRoutePreviewStops();

    // Wheel Scroll and Keyboard input for camera gliding
    window.addEventListener('wheel', (e) => this.onScroll(e), { passive: false });
    window.addEventListener('keydown', (e) => this.onKeyDown(e));

    // Handle touch swipe on mobile for camera gliding
    let touchStartY = 0;
    window.addEventListener('touchstart', (e) => {
      touchStartY = e.touches[0].clientY;
    }, { passive: true });
    
    window.addEventListener('touchmove', (e) => {
      if (!this.isExploring || this.renderer.focusedObject || this.isContentModalOpen()) return;
      const touchY = e.touches[0].clientY;
      const deltaY = touchStartY - touchY;
      
      // Translate touch swipe to movement
      if (Math.abs(deltaY) > 5) {
        const step = deltaY * 0.0003;
        this.moveCamera(step);
        touchStartY = touchY; // update base
      }
    }, { passive: true });

    // Listen to room change from WebGL
    window.addEventListener('roomchange', (e) => {
      this.handleRoomChange(e.detail.index);
    });
  }

  startJourney() {
    this.enterJourneyAt(this.currentEraIndex);
  }

  enterJourneyAt(index = 0) {
    if (!this.renderer) return;

    const safeIndex = Math.max(0, Math.min(this.totalNodes - 1, index));
    if (this.isExploring && this.introScreen.classList.contains('hidden')) {
      this.goToEra(safeIndex, { autoShowCharacter: true });
      return;
    }
    if (this.isStartingJourney) return;

    this.isStartingJourney = true;
    this.isExploring = true;
    this.hideCharacterSpotlight(true);

    const progress = safeIndex / (this.totalNodes - 1);
    this.renderer.setPathProgress(progress, true);
    this.handleRoomChange(safeIndex, { showGate: false, updateSound: false, autoShowCharacter: false });
    this.updateProgressBar();
    
    // Animate UI Out
    gsap.to(this.introScreen, {
      opacity: 0,
      duration: 1.0,
      onComplete: () => {
        this.introScreen.classList.add('hidden');
        this.hud.classList.remove('hidden');
        this.isStartingJourney = false;
        this.scheduleAutoCharacterSpotlight(safeIndex);
      }
    });

    // Initialize procedural audio
    sound.init();
    sound.updateEra(nodesData[safeIndex]?.ambientStyle, safeIndex);
    this.toggleAudio(false); // Unmute and start drone
  }

  bindRoutePreviewStops() {
    this.routeStops.forEach((stop, idx) => {
      stop.dataset.index = String(idx);
      stop.setAttribute('role', 'button');
      stop.setAttribute('tabindex', '0');
      stop.setAttribute('aria-label', `进入第 ${idx + 1} 纪元：${nodesData[idx]?.name || ''}`);
      stop.addEventListener('click', () => this.enterJourneyAt(idx));
      stop.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.enterJourneyAt(idx);
        }
      });
    });
  }

  toggleAudio(forceMuteState = null) {
    const isMuted = sound.toggleMute();
    
    if (isMuted) {
      this.audioToggleBtn.querySelector('.btn-icon').textContent = '🔇';
      this.audioToggleBtn.querySelector('.btn-text').textContent = '音效已关';
      this.audioToggleBtn.classList.remove('playing');
    } else {
      this.audioToggleBtn.querySelector('.btn-icon').textContent = '🔊';
      this.audioToggleBtn.querySelector('.btn-text').textContent = '音效已开';
      this.audioToggleBtn.classList.add('playing');
    }
  }

  // Toggle timeline sidebar sliding visibility
  toggleSidebar(forceState = null) {
    if (forceState === true) {
      this.timelineSidebar.classList.add('active');
    } else if (forceState === false) {
      this.timelineSidebar.classList.remove('active');
    } else {
      this.timelineSidebar.classList.toggle('active');
    }
    document.body.classList.toggle('sidebar-open', this.timelineSidebar.classList.contains('active'));
  }

  // Populate sidebar nodes list
  populateSidebar() {
    this.sidebarList.innerHTML = '';
    nodesData.forEach((node, idx) => {
      const item = document.createElement('div');
      item.className = 'sidebar-item';
      if (idx === 0) item.classList.add('active');
      item.setAttribute('data-index', idx);
      
      item.innerHTML = `
        <span class="sidebar-item-num">${String(idx + 1).padStart(2, '0')}</span>
        <span class="sidebar-item-name">${node.name}</span>
      `;
      
      item.addEventListener('click', () => {
        this.jumpToEra(idx);
        this.toggleSidebar(true);
      });
      
      this.sidebarList.appendChild(item);
    });
  }

  // Direct warp to an era node
  jumpToEra(index) {
    this.goToEra(index, { autoShowCharacter: true });
  }

  goToEra(index, options = {}) {
    if (!this.renderer) return;

    const { autoShowCharacter = false } = options;
    const safeIndex = Math.max(0, Math.min(this.totalNodes - 1, index));
    const progress = safeIndex / (this.totalNodes - 1);

    this.cancelAutoCharacterSpotlight();
    this.hideCharacterSpotlight(true);

    // Exit any open close-up before changing rooms.
    this.closeImageModal(false);
    this.closeCharacterModal(false);
    this.closeArtifactModal(false);

    this.renderer.setPathProgress(progress, true);
    this.handleRoomChange(safeIndex, {
      showGate: this.isExploring,
      updateSound: this.isExploring,
      autoShowCharacter
    });
    this.updateProgressBar();
  }

  scheduleAutoCharacterSpotlight(index) {
    this.cancelAutoCharacterSpotlight();

    this.autoCharacterSpotlightCall = gsap.delayedCall(0, () => {
      this.autoCharacterSpotlightCall = null;
      if (!this.isExploring || this.currentEraIndex !== index) return;
      if (this.imageModal && !this.imageModal.classList.contains('hidden')) return;
      if (this.charModal && !this.charModal.classList.contains('hidden')) return;
      if (this.artModal && !this.artModal.classList.contains('hidden')) return;
      this.showCharacterSpotlight(index);
    });
  }

  cancelAutoCharacterSpotlight() {
    if (this.autoCharacterSpotlightCall) {
      this.autoCharacterSpotlightCall.kill();
      this.autoCharacterSpotlightCall = null;
    }
  }

  showCharacterSpotlight(index) {
    const node = nodesData[index];
    const character = node?.characters?.[0];
    if (!node || !character || !this.characterSpotlight || !this.characterSpotlightImg) return;

    const requestId = ++this.spotlightImageRequestId;
    const src = `./images/${this.getCharacterImageKey(character, node)}.png`;
    this.characterSpotlight.classList.add('hidden');
    this.characterSpotlight.setAttribute('aria-hidden', 'true');
    this.characterSpotlightImg.style.visibility = 'hidden';
    this.characterSpotlightImg.removeAttribute('src');

    const image = new Image();
    image.onload = () => {
      if (requestId !== this.spotlightImageRequestId || this.currentEraIndex !== index) return;
      this.characterSpotlightImg.alt = `${character.name}人物图像`;
      this.characterSpotlightImg.src = src;
      this.characterSpotlightImg.style.visibility = 'visible';
      this.characterSpotlight.classList.remove('hidden');
      this.characterSpotlight.setAttribute('aria-hidden', 'false');
    };
    image.onerror = () => {
      if (requestId !== this.spotlightImageRequestId) return;
      this.characterSpotlightImg.removeAttribute('src');
    };
    image.src = src;
  }

  hideCharacterSpotlight(immediate = false) {
    if (!this.characterSpotlight) return;
    this.spotlightImageRequestId += 1;

    if (immediate) {
      this.characterSpotlight.style.transition = 'none';
      this.characterSpotlight.classList.add('hidden');
      this.characterSpotlight.setAttribute('aria-hidden', 'true');
      this.characterSpotlightImg?.removeAttribute('src');
      void this.characterSpotlight.offsetWidth;
      requestAnimationFrame(() => {
        if (this.characterSpotlight) this.characterSpotlight.style.transition = '';
      });
      return;
    }

    this.characterSpotlight.classList.add('hidden');
    this.characterSpotlight.setAttribute('aria-hidden', 'true');
  }

  restoreCurrentCharacterSpotlight() {
    if (!this.isExploring) return;
    if (this.imageModal && !this.imageModal.classList.contains('hidden')) return;
    if (this.charModal && !this.charModal.classList.contains('hidden')) return;
    if (this.artModal && !this.artModal.classList.contains('hidden')) return;

    const node = nodesData[this.currentEraIndex];
    const character = node?.characters?.[0];
    const expectedSrc = character ? `./images/${this.getCharacterImageKey(character, node)}.png` : '';
    if (expectedSrc && this.characterSpotlightImg?.getAttribute('src') === expectedSrc) {
      this.characterSpotlightImg.style.visibility = 'visible';
      this.characterSpotlight.classList.remove('hidden');
      this.characterSpotlight.setAttribute('aria-hidden', 'false');
      return;
    }

    this.showCharacterSpotlight(this.currentEraIndex);
  }

  isContentModalOpen() {
    return [this.imageModal, this.charModal, this.artModal]
      .some((modal) => modal && !modal.classList.contains('hidden'));
  }

  // Handle keyboard keys (W/S or Up/Down)
  onKeyDown(e) {
    if (!this.isExploring || this.renderer.focusedObject || this.isContentModalOpen()) return;

    if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
      this.moveCamera(0.005);
    } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
      this.moveCamera(-0.005);
    }
  }

  // Handle scroll wheel
  onScroll(e) {
    if (!this.isExploring || this.renderer.focusedObject) return;

    // Modal wheel input belongs to its image/text/3D content and must never navigate eras.
    if (this.isContentModalOpen()) return;
    
    // Prevent default scroll behaviors
    e.preventDefault();
    
    const step = e.deltaY * 0.00015;
    this.moveCamera(step);
  }

  // Update spline curve camera position based on steps
  moveCamera(step) {
    if (this.renderer) {
      let newProgress = this.renderer.targetProgress + step;
      
      // Cap at boundaries
      newProgress = Math.max(0, Math.min(1.0, newProgress));
      
      this.renderer.setPathProgress(newProgress);
      this.updateProgressBar();
    }
  }

  updateProgressBar() {
    if (this.renderer) {
      const percent = this.renderer.targetProgress * 100;
      this.progressBar.style.width = `${percent}%`;
    }
  }

  updateNavigationState(index) {
    this.prevBtn.disabled = index === 0;
    this.nextBtn.disabled = false;
    this.nextBtn.textContent = index === this.totalNodes - 1 ? '终章回望 →' : '下一纪元 →';
  }

  updateNodeInsight(data, index) {
    if (!data) return;
    this.activeNodeIndex = index;

    const artifactCount = data.artifacts?.length || 0;
    const characterCount = data.characters?.length || 0;

    const historicalUnit = this.getHistoricalUnit(index);

    if (this.nodePeriod) this.nodePeriod.textContent = `${historicalUnit} · ${data.theme}`;
    if (this.nodeInsightTitle) this.nodeInsightTitle.textContent = `${data.name} · AI 重访`;
    if (this.nodeInsightText) this.nodeInsightText.textContent = this.buildNodeInsight(data);
    if (this.nodeCharacterCount) this.nodeCharacterCount.textContent = `人物 ${characterCount}`;
    if (this.nodeArtifactCount) this.nodeArtifactCount.textContent = `展品 ${artifactCount}`;
    if (this.node3dBtn) this.node3dBtn.disabled = artifactCount === 0;
    if (this.nodeImageBtn) this.nodeImageBtn.dataset.nodeIndex = String(index);
    if (this.nodePersonBtn) this.nodePersonBtn.dataset.nodeIndex = String(index);
    if (this.nodeEventBtn) this.nodeEventBtn.dataset.nodeIndex = String(index);
    if (this.nodeSiteBtn) this.nodeSiteBtn.dataset.nodeIndex = String(index);
    if (this.node3dBtn) this.node3dBtn.dataset.nodeIndex = String(index);

    this.drawNodePreviewImage(this.nodeVisualCanvas, data, index);
  }

  openImageModal(mode = 'human', sourceButton = this.nodeImageBtn) {
    const index = this.getActionNodeIndex(sourceButton);
    const data = nodesData[index];
    if (!data) return;

    this.cancelAutoCharacterSpotlight();
    this.hideCharacterSpotlight();
    if (this.charModal && !this.charModal.classList.contains('hidden')) this.closeCharacterModal(false);
    if (this.artModal && !this.artModal.classList.contains('hidden')) this.closeArtifactModal(false);

    this.imageGalleryIndex = 0;
    this.imageGalleryMode = mode;
    this.imageGalleryNodeIndex = index;
    if (this.imageModalTitle) this.imageModalTitle.textContent = `${data.name} · ${this.getGalleryModeLabel(mode)}`;
    if (this.imageModalPeriod) this.imageModalPeriod.textContent = `${this.getHistoricalUnit(index)} · ${data.theme}`;
    this.hud?.classList.add('modal-suppressed');
    this.renderImageGallery(data);
    if (this.imageModal) this.imageModal.classList.remove('hidden');
  }

  getActionNodeIndex(button) {
    const fromButton = Number(button?.dataset?.nodeIndex);
    if (Number.isInteger(fromButton) && fromButton >= 0 && fromButton < this.totalNodes) {
      return fromButton;
    }
    return Math.max(0, Math.min(this.totalNodes - 1, this.activeNodeIndex ?? this.currentEraIndex));
  }

  renderImageGallery(data) {
    const gallery = this.getNodeImageGallery(data, this.imageGalleryMode);
    if (!gallery.length) return;

    this.imageGalleryIndex = Math.max(0, Math.min(gallery.length - 1, this.imageGalleryIndex));
    const item = gallery[this.imageGalleryIndex];

    if (this.imageModalTitle) this.imageModalTitle.textContent = `${data.name} · ${this.getGalleryModeLabel(this.imageGalleryMode)}`;
    if (this.imageModalPeriod) this.imageModalPeriod.textContent = `${this.getHistoricalUnit(data.id)} · ${data.theme}`;
    if (this.imageModalCaption) {
      this.imageModalCaption.textContent = `${this.imageGalleryIndex + 1} / ${gallery.length} · ${item.caption}`;
    }

    this.imagePrevBtn?.classList.toggle('hidden', gallery.length < 2);
    this.imageNextBtn?.classList.toggle('hidden', gallery.length < 2);

    const requestId = ++this.imageLoadRequestId;
    this.resetImageModalCanvas(item.key || `${data.id}-${this.imageGalleryIndex}`);

    this.isRenderingHumanImage = true;
    try {
      this.drawGalleryItem(item.key, this.imageModalCanvas, data, requestId);
    } catch (error) {
      console.error('Node image render failed:', error);
      this.drawNodeVisualFallback(this.imageModalCanvas, data);
    } finally {
      this.isRenderingHumanImage = false;
    }
  }

  resetImageModalCanvas(key) {
    if (!this.imageModalCanvas) return;

    const isPortrait = this.imageGalleryMode === 'person' || String(key || '').startsWith('character-');
    const container = this.imageModal?.querySelector('.image-modal-container');
    container?.classList.toggle('portrait-mode', isPortrait);
    container?.classList.toggle('detail-mode', this.imageGalleryMode !== 'human');

    this.imageModalCanvas.width = isPortrait ? 1024 : 1280;
    this.imageModalCanvas.height = isPortrait ? 1536 : 720;
    this.imageModalCanvas.dataset.galleryKey = key || '';

    const ctx = this.imageModalCanvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, this.imageModalCanvas.width, this.imageModalCanvas.height);
    this.imageModalCanvas.style.visibility = 'hidden';
  }

  adjustColorBrightness(hex, percent) {
    if (!hex || hex[0] !== '#') return hex;
    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 7), 16);

    r = Math.min(255, Math.floor(r * (1 + percent)));
    g = Math.min(255, Math.floor(g * (1 + percent)));
    b = Math.min(255, Math.floor(b * (1 + percent)));

    const rr = r.toString(16).padStart(2, '0');
    const gg = g.toString(16).padStart(2, '0');
    const bb = b.toString(16).padStart(2, '0');
    return `#${rr}${gg}${bb}`;
  }

  drawGalleryItem(key, canvas, node, requestId = this.imageLoadRequestId) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    const img = new Image();
    img.onload = () => {
      if (requestId !== this.imageLoadRequestId || canvas.dataset.galleryKey !== key) return;
      ctx.clearRect(0, 0, width, height);
      this.drawImageWithBackdrop(ctx, img, width, height);
      canvas.style.visibility = 'visible';
    };
    img.onerror = (e) => {
      if (requestId !== this.imageLoadRequestId || canvas.dataset.galleryKey !== key) return;
      console.warn(`Failed to load image: ${img.src}, falling back to vector.`, e);
      this.drawNodeVisual(canvas, node, node.id);
      canvas.style.visibility = 'visible';
    };
    img.src = `./images/${key}.png`;
  }

  drawNodePreviewImage(canvas, node, index) {
    if (!canvas || !node) return;

    const gallery = this.getNodeImageGallery(node, 'human');
    const item = gallery[0];
    const key = item?.key;
    if (!key) {
      canvas.style.visibility = 'visible';
      this.drawNodeVisual(canvas, node, index);
      return;
    }

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    canvas.style.visibility = 'hidden';
    canvas.dataset.previewKey = key;

    const img = new Image();
    img.onload = () => {
      if (canvas.dataset.previewKey !== key) return;
      ctx.clearRect(0, 0, width, height);
      this.drawImageCover(ctx, img, width, height);
      canvas.style.visibility = 'visible';
    };
    img.onerror = () => {
      if (canvas.dataset.previewKey !== key) return;
      this.drawNodeVisual(canvas, node, index);
      canvas.style.visibility = 'visible';
    };
    img.src = `./images/${key}.png`;
  }

  drawImageCover(ctx, img, width, height) {
    const scale = Math.max(width / img.width, height / img.height);
    const drawWidth = img.width * scale;
    const drawHeight = img.height * scale;
    const x = (width - drawWidth) / 2;
    const y = (height - drawHeight) / 2;
    ctx.drawImage(img, x, y, drawWidth, drawHeight);
  }

  drawImageContain(ctx, img, width, height) {
    const scale = Math.min(width / img.width, height / img.height);
    const drawWidth = img.width * scale;
    const drawHeight = img.height * scale;
    const x = (width - drawWidth) / 2;
    const y = (height - drawHeight) / 2;
    ctx.drawImage(img, x, y, drawWidth, drawHeight);
  }

  drawImageWithBackdrop(ctx, img, width, height) {
    ctx.save();
    this.drawImageCover(ctx, img, width, height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    this.drawImageContain(ctx, img, width, height);
  }

  changeImageGallery(direction) {
    const index = Number.isInteger(this.imageGalleryNodeIndex)
      ? this.imageGalleryNodeIndex
      : this.getActionNodeIndex(this.nodeImageBtn);
    const data = nodesData[index];
    if (!data) return;

    const gallery = this.getNodeImageGallery(data, this.imageGalleryMode);
    if (gallery.length < 2) return;

    this.imageGalleryIndex = (this.imageGalleryIndex + direction + gallery.length) % gallery.length;
    this.renderImageGallery(data);
  }

  getNodeImageGallery(data, mode = 'human') {
    const id = data?.id;
    if (id === undefined || id === null) return [];

    let gallery = [];

    if (id === 2) {
      gallery = [
        { key: 'shang-oracle-bone', caption: '甲骨刻辞：龟甲裂纹、刻辞与贞问痕迹' },
        { key: 'shang-bronze', caption: '青铜鸮尊：妇好出征前的青铜祭器与商代纹样' }
      ];
      return this.applyGalleryMode(data, gallery, mode);
    }

    if (id === 3) {
      gallery = [
        { key: 'zhou-da-ke-ding', caption: '大克鼎铭文：庄重鼎形、内壁长铭与西周礼制' },
        { key: 'zhou-music', caption: '钟鼎雅乐：编钟、乐悬与西周礼乐空间' }
      ];
      return this.applyGalleryMode(data, gallery, mode);
    }

    const defaultKeys = {
      0: { key: 'ancient-fire-gathering', caption: '远古聚落：族人围火、石器与野兽阴影' },
      1: { key: 'liangzhu-jade-cong', caption: '良渚玉工：水乡城邦、玉琮与神徽细刻' },
      4: { key: 'spring-autumn-bamboo', caption: '百家争鸣：竹简、讲学席与思想交锋' },
      5: { key: 'qin-soldier', caption: '秦风军阵：沉默陶俑、甲士与一统秩序' },
      6: { key: 'han-changxin-lamp', caption: '汉宫灯影：长信宫灯与丝路来客的时代气象' },
      7: { key: 'weijin-scholars-direction-fixed', caption: '魏晋风骨：兰亭水岸、竹林名士与行书墨迹' },
      8: { key: 'nanbeichao-buddha', caption: '石窟造像：云冈砂岩大佛、工匠与乱世信仰' },
      9: { key: 'sui-canal-construction', caption: '隋开运河：民夫、纤绳与贯通南北的水路' },
      10: { key: 'tang-changan-city', caption: '盛唐长安：胡商、诗人、乐舞与开放都会' },
      11: { key: 'middletang-dufu', caption: '中唐诗史：杜甫、战乱与沉郁山河' },
      12: { key: 'song-ru-porcelain', caption: '宋代风雅：汝窑天青、书案与城市生活' },
      13: { key: 'song-qingming-scroll', caption: '汴河市井：清明上河图式的桥市与人群' },
      14: { key: 'southsong-soldier', caption: '南宋风骨：边城守军、强弩与山河危局' },
      15: { key: 'yuan-blue-white-porcelain', caption: '元代青花：景德镇窑火、钴料与瓷瓶纹样' },
      16: { key: 'ming-forbidden-city', caption: '明代气象：紫禁城宫墙、海图与远航想象' },
      17: { key: 'lateming-garden-opera', caption: '晚明浮世：私家园林、昆曲水榭与版刻奇书' },
      18: { key: 'qing-siku-quanshu', caption: '文渊阁书：四库全书、线装册页与乾嘉考据' },
      19: { key: 'lateqing-warship', caption: '晚清危局：怒涛、报馆与启蒙救亡的思想现场' },
      20: { key: 'republic-luxun', caption: '民国呐喊：鲁迅书桌、油灯与新青年杂志' },
      21: { key: 'wartime-students', caption: '烽火弦歌：西南联大学生与茅草教室中的灯火' },
      22: { key: 'newchina-factory', caption: '新中国车间：炼钢炉、红旗方向盘与工人集体记忆' },
      23: { key: 'reform-shenzhen', caption: '改革浪潮：深圳厂房、绿皮火车票与南下青年' },
      24: { key: 'digital-smartphone', caption: '数字时代：程序员、智能手机与屏幕里的连接孤独' },
      25: { key: 'present-tea', caption: '此刻日常：清茶、屏幕与我们正在书写的生活史' }
    };

    const supplementalKeys = {
      0: { key: 'ancient-fire-pottery', caption: '聚落生计：河畔制陶、结网捕鱼与谷物晾晒中的协作日常' },
      1: { key: 'liangzhu-rice-ritual', caption: '水城稻作：舟运稻谷、城台祭礼与玉器共同维系良渚秩序' },
      4: { key: 'spring-autumn-travel-teaching', caption: '周游讲学：孔子与弟子在列国驿道旁讨论仁礼与治世' },
      5: { key: 'qin-standardization-market', caption: '一统入世：秦吏校验度量衡，工匠依统一尺度制造车轴与器具' },
      6: { key: 'han-silk-road-caravan', caption: '丝路相逢：汉使与西域商旅在河西驿站交换货物和消息' },
      7: { key: 'weijin-bamboo-qin', caption: '竹林任真：嵇康在锻炉与古琴之间守住不羁的生命选择' }
    };

    const keyData = defaultKeys[id];
    gallery = keyData
      ? [keyData, ...(supplementalKeys[id] ? [supplementalKeys[id]] : [])]
      : [{ key: 'default-node', caption: '节点人文图像' }];
    return this.applyGalleryMode(data, gallery, mode);
  }

  applyGalleryMode(data, gallery, mode = 'human') {
    if (mode === 'human') return gallery;

    let primary = gallery[0] || { key: 'default-node', caption: '节点人文图像' };
    const characterNames = (data.characters || []).map((char) => char.name).join('、') || '历史人物';
    const artifactNames = (data.artifacts || []).map((artifact) => artifact.name).join('、') || '关键器物';
    const keys = {
      person: `character-${data.id}-0`,
      event: `event-${data.id}`,
      site: `site-${data.id}`
    };
    const modeCaptions = {
      person: this.getPersonGalleryCaption(data),
      event: this.getEventGalleryCaption(data),
      site: this.getSiteGalleryCaption(data)
    };

    return [{ ...primary, key: keys[mode] || primary.key, caption: modeCaptions[mode] || primary.caption }];
  }

  getPersonGalleryCaption(data) {
    const captions = {
      0: `夜幕压低河面，最后一线天光被旷野吞没，火把忽然在燧人氏手中升起。火焰舔过枝束，照出他额头的皱纹、兽皮上的粗糙纤维，也照出身后洞穴里一双双仍带惧意的眼睛。

他一手高举火光，一手握着反复钻磨过的取火器。木器上的凹痕并不整齐，却像一部没有文字的生存史：寒夜、猛兽、生食、惊雷、失败的火星与终于燃起的第一束光，都沉在这些痕迹里。族人靠近火堆，影子在岩壁上忽长忽短，像一个刚学会共同呼吸的群体。

从这一刻起，夜晚不再只属于野兽。火让食物变熟，让围坐成为可能，也让讲述、守望和传承有了稳定的中心。燧人氏站在火光前，并不是把黑暗全部驱散，而是把人类第一次主动抵抗黑暗的姿态留了下来。`,
      1: `晨雾从稻田和河汊之间升起，玉工坐在低矮的作坊里，膝前放着一枚尚未完成的玉琮。青白色玉料吸着潮气，表面已有浅浅纹路，细砂和水在他指间缓慢流动。

他的掌心布满细小裂口，指节被长年磨琢磨得发硬。没有金属利刃，也没有迅疾的切削，只有砂、水、皮革和几乎耗尽一生的耐心。每一条神徽线条都要在反复推磨中显现，稍一失手，整块玉料便可能前功尽弃。

玉琮最终会离开作坊，被送往祭坛、墓葬或权力中心。可在它成为礼器之前，它先是一双手与坚硬石质的漫长较量。良渚的神性并不飘在云端，而是从湿润水乡、稻作城邦和无名匠人的伤痕里慢慢生长出来。`,
      2: `殷墟的夜火映着青铜的幽绿，妇好立在祭器与兵戈之间。龟甲已经被灼出裂痕，刻辞沿着骨面延伸；鸮尊双目圆睁，兽面纹在火光中像仍有呼吸。

她的衣袍厚重，发饰庄严，面容并不柔和。祭祀的烟气尚未散去，军阵的命令已经逼近，她站在两者之间，既能向祖先贞问，也能率军出征。青铜时代的权力并不分成清晰的礼仪与战争，它们同时落在她身上。

妇好身后的器物不是陪衬。甲骨记录疑问，青铜承载盟誓，兵戈指向远方的战场。她的沉静来自对神意的依凭，也来自亲历战争的冷硬。商代的神秘、血气与国家意志，在她的身影里压缩成一个出征前的瞬间。`,
      3: `宗庙深处，钟架垂下长影，大克鼎立在周公旦身侧，鼎腹铭文在昏金色光线中隐约可辨。乐师尚未击钟，执礼者已经各归其位，堂中的安静带着一种被制度约束过的重量。

周公旦的衣冠整肃，没有战场上的锋芒，却有平定人心的沉着。商周鼎革之后，天下需要的不只是胜利者的武力，还需要新的秩序把宗族、封国、祭祀和职责重新安放。礼器有位置，乐声有节奏，人也必须知道自己站在何处。

礼乐并非华丽仪式的堆叠，而是乱世之后重新约束权力和欲望的办法。钟声将要响起时，青铜不再只是通向鬼神的器物，也成为人间秩序的尺度。周公旦的凝视，正落在这种从神权向人伦转身的关口。`,
      4: `尘土从车辙间扬起，竹简铺在讲席旁，孔子立在弟子之间。远处城邑仍在盟誓和征伐中摇晃，近处的年轻人却屏息等待一句关于仁与礼的回答。

他并不像庙堂塑像那样遥远。风吹起衣袖，旅途的疲惫留在眉间；周游列国带来的失望没有消退，却也没有让他停止讲述。仁、礼、忠恕这些词，在破碎时代里并不轻盈，它们像一根根细线，试图把松散的人心重新系住。

孔子站在尘土中，身后不是已经完成的圣人传统，而是尚未被接纳的理想。他的坚持带着现实的艰难：如果礼崩乐坏已成事实，人是否仍能通过自我约束与相互成全，重新获得生活的秩序。`,
      5: `黄土被战靴踩得坚硬，秦国甲士立在军阵前，甲片边缘沾着尘沙。身后戈矛如林，队列整齐得近乎沉默，远处城墙的轮廓隐在灰黄色天光里。

他的面容没有夸张的豪迈，只有长期军旅留下的木然与警觉。军功授爵、严刑律令、远征和戍边，像看不见的甲胄压在身上。帝国的统一在史书里显得宏阔，落到士兵身上，却是行军的脚、握戈的手和一次次不能后退的命令。

书同文、车同轨会在战后进入土地，度量衡和户籍会让疆域变得清晰。而在这一切发生之前，首先站出来的是这些沉默甲士。他们既托起一统秩序，也把帝国代价刻进身体。`,
      6: `荒漠的风擦过脸颊，张骞握着磨旧的汉节，站在通往西域的漫长道路上。驼队的影子落在沙地里，远处山口像一道尚未开启的门。

他的衣袍被风沙磨暗，眼神却始终朝向前方。被扣留的岁月、逃脱的夜晚、陌生城邦的语言、归途上的饥渴，都没有让汉节从手中落下。后来繁盛的丝路，此刻还只是一个人孤身向西的坚持。

道路不是天生存在的。它要靠脚步试出来，靠记忆带回去，靠一次次往返让陌生变成熟悉。张骞身后的沙尘尚未落定，长安与西域之间的世界已经开始被重新打开。`,
      7: `竹林阴影压低天光，嵇康坐在琴前，指尖悬在弦上。炉火、铁砧、琴案与山风并置在身旁，使他的气质既有隐逸的清冷，也有金石般的锋利。

他并不急着说话。名教、权力、征召和审判都在远处逼近，琴声却仍保持自己的节奏。越是沉静，越能显出拒绝妥协的决绝；越是从容，越像临刑前那曲《广陵散》的余音。

魏晋风骨并不是纵酒清谈的姿态，而是在外部秩序要求人改变自己时，仍保存内心的完整。嵇康的沉默不软弱，它像一块被反复敲击仍不碎裂的铁，冷而清醒。`,
      8: `砂岩山壁在黄昏里泛出温热颜色，昙曜站在尚未完成的佛龛前。僧衣沾满石粉，身后的工匠还在脚手架上敲击岩面，凿痕沿着山体一寸寸展开。

南北分裂、迁徙、兵戈和饥馑，使人心无处安放。佛像还没有露出完整面容，信众已经在尘土中合掌。昙曜并非远离人间苦难的高僧，他更像在乱世里为恐惧寻找容器的人。

砂岩比王朝更沉默，也比人的寿命更长。把慈悲刻进山体，就是把短暂的祈求交给长久的石头。佛的眉眼从岩壁中显现时，动荡的人间终于得到一处可以仰望的安静。`,
      9: `泥水漫过脚踝，纤绳勒进肩背，运河民夫站在尚未成形的河道旁。号子声一阵阵传来，铁锹、竹筐和木桩在湿土里反复起落。

他的衣服被汗水和河泥浸透，手掌磨破，眼神里既有疲惫，也有难以说清的沉默。远处或许会有龙舟经过，史书或许会记下千里通波，但此刻真正存在的，是无数普通人日复一日搬土、筑堤、拉纤的身体。

大运河后来会让粮船、商旅和文化沿水路奔流，可最初的河床先由徭役和苦痛挖开。水流终将变得平稳，泥土下却埋着开河者的喘息。`,
      10: `长安夜色被灯火照亮，李白立在酒肆与宫阙之间，衣袍像被风吹开的云。胡乐、驼铃、金樽与异域香料的气息交织在身后，城市的喧声涌向他，又被他化成诗。

他的神情有醉意，也有不肯低头的骄傲。盛唐的开放并不只是远方货物进入长安，更是一个人敢把才气、欲望和生命热度高声说出。宫廷的光辉近在咫尺，江湖的自由也在胸中翻涌。

诗句从酒意里飞出，不是逃避现实，而是把现实推向更辽阔的想象。李白站在灯火中，像把一整个时代的自信举到月下：人可以渺小，也可以在片刻之间与天地同大。`,
      11: `风雨压着破屋，杜甫站在暗淡天光里，衣衫清瘦，眉间深锁。道路尽头有逃难的人群，远处城池像刚从战火中冷却下来。

他手里没有兵权，也没有改变局势的诏令，只有一支沉重的笔。饥民、征夫、老妇、离散的亲人和残破的山河，一次次进入他的眼睛，又从诗句中回到人间。苦难不是远方消息，而是他自己脚下的泥泞与寒冷。

杜甫的悲悯并不悬浮在百姓之上。他和他们一同挨饿、奔走、失望，也因此能把时代裂痕写得如此具体。所谓诗史，不是替历史加上文采，而是让被战争碾过的人重新拥有声音。`,
      12: `北宋书案前，范仲淹端坐在清冷灯影里，奏疏摊开，墨迹未干。窗外夜色安稳，案上文字却通向边关风雪、江湖水患和朝政积弊。

他的衣冠整肃，神情并不激昂。宋代的清雅审美、书院风气和士大夫理想，都不能让现实的重负消失。每一封奏疏都在权衡：怎样让制度少一点沉疴，让百姓多一点喘息，让读书人的道德不只停在纸上。

忧乐天下不是一句漂亮格言。它意味着在安稳生活尚可自保时，仍把远处的饥寒、边患和不公放进心里。范仲淹低头看字，灯火照着一个士大夫必须承担的沉重清醒。`,
      13: `半卷帘影落在案头，李清照坐在散乱书册与金石拓片之间。灯光轻薄，窗外风声却带着南渡后的寒意。

曾经的汴京繁华、赌书泼茶的笑声和收藏金石的雅兴，已经被战乱冲散。她的衣饰仍保持精致，眼底却有漂泊留下的清醒。词句里的花、酒、黄昏和雨，并不是柔弱的装饰，而是保存失去之物的方式。

她经历的不是单纯的个人离别，而是家国倾覆后记忆的迁徙。越是细微的词语，越能承住巨大的破碎。李清照在灯下沉默，像把故国最后的余温护在纸页之间。`,
      14: `西湖的暖风吹不到北方战场，辛弃疾立在灯下，手边放着一柄久未出鞘的剑。灯火映上剑脊，也映出他鬓边渐生的霜色。

少年时突入敌营的胆气仍在，收复失地的策论仍在，军营吹角的梦也仍在；只是朝廷的迟疑、偏安的安稳和反复落空的任用，把这些锋芒一层层压回胸中。词句因此带着铁器的冷光。

他的痛苦不在于不能言说，而在于说尽之后仍无法出发。剑安静地躺着，像一条被迫停下的河。南宋的山河之恨，便在这安静里越积越深。`,
      15: `大都戏台灯火昏黄，关汉卿站在幕侧，外面人声鼎沸，锣鼓声一阵紧过一阵。粗布衣袍并不显贵，神情却硬朗得像一粒铜豌豆。

元代文人的仕途逼仄，市井瓦舍反而成了说真话的地方。冤案、贫苦、豪侠、怒骂和笑声都从街巷涌上舞台，被他写进唱词和宾白。窦娥的雪不是奇观，而是民间冤屈终于冲破天幕的一声控诉。

关汉卿不退回清高书斋。他把笔扎进最嘈杂的人间，让戏台替沉默者开口。灯火摇晃时，他的身影带着粗粝的尊严，也带着平民文化刚刚成形的力量。`,
      16: `海风鼓起船帆，郑和站在宝船甲板上，身后桅杆重重，浪花拍打船舷。海图、罗盘、礼物和异国物产围绕着他，远方港口仍藏在雾气之外。

他的衣袍保持着明代使节的庄重，脸上却有远航者才有的风霜。七下西洋并不是一条孤独航线，而是一座移动的海上国家：水手、翻译、医官、工匠和使节都在季风中前行。

大明的目光从宫城延伸到海洋，朝贡、贸易、外交和技术被组织进同一场航行。郑和望向远处时，脚下的甲板连接着紫禁城，也连接着陌生海岸和更辽阔的世界。`,
      17: `园林水榭的暮色里，汤显祖立在戏台边，昆曲的水磨腔从廊柱间缓缓绕过。折扇、曲本、花影和灯火交叠，像《牡丹亭》里尚未醒来的梦。

他的神情温和，却有不肯向礼法退让的执拗。晚明江南的繁华养出了精致的园林、书坊和戏曲，也让被压抑的欲望与真情更急切地寻找出口。杜丽娘的梦不是荒唐，而是人心在规训中夺回自己的呼吸。

汤显祖写情，并不是把现实变轻，而是让现实中不能说的部分获得声音。戏台灯火一亮，被天理压住的人欲便从唱腔里重新活过来。`,
      18: `书斋清寒，顾炎武站在堆叠典籍与舆图之间。窗外风声低沉，案上书页被压得很平，像在努力稳住一个刚刚倾覆的世界。

明亡的痛感没有从他身上退去，反而沉成一种坚硬的治学态度。空谈心性已不足以回答山河破碎，他转向地理、制度、赋税、边防和民生，把学问重新拉回现实泥土之中。

经世致用不是口号，而是读书人在废墟前重新承担责任的方式。顾炎武的沉郁来自亡国记忆，也来自清醒：若不能明白天下如何失序，便无法知道后来的人该怎样站稳。`,
      19: `报馆油墨气味混着窗外雨声，梁启超站在书桌前，纸页上字迹密集，仿佛还带着热度。远处的海面并不可见，危机却像潮水一样逼到窗边。

甲午战败、列强环伺、变法受挫和青年求路的焦灼，都压进他的笔锋。每一篇文字都写得急，因为旧秩序留给中国的时间正在减少。少年、新民、变法、自强，这些词在纸上燃烧，不再只是概念。

梁启超的急切来自一种深重的不安：若国民仍不醒来，危舟便会继续下沉。他在雨夜里写作，如同把一支火把递向更年轻的人。`,
      20: `上海夜色沉在窗外，鲁迅坐在书桌前，灯光照出一张冷峻而疲惫的脸。烟、稿纸、杂志和旧书围在手边，笔尖停下时，屋里反而更静。

铁屋子里的沉睡、旧礼教的阴影、青年人的热血和一次次失望，都在这张桌前被反复审视。他的文字不像温和劝告，更像一把细窄的刀，切开麻木，也切开自己无法回避的疼痛。

鲁迅的冷并非无情。正因为仍对人抱有期待，才不能容忍人被愚昧和奴性继续吞没。长夜里落下的每一笔，都在试探黑暗深处是否还能传出回声。`,
      21: `防空警报远去后，西南联大学生重新坐回简陋课桌前。油灯在风里微微摇晃，茅草屋顶仍有漏雨痕迹，黑板边缘粗糙发白。

长途流亡的疲惫还留在脸上，年轻的眼睛却没有暗下去。书页被反复翻卷，讲义上沾着尘土，窗外随时可能再次响起警报；可公式、诗句、历史和实验仍在继续。课堂简陋得几乎不像课堂，却正因如此显得不可摧毁。

战争夺走校舍，却没有夺走求知的秩序。这个学生坐在灯下，不只是为了个人前程，也是在替一个民族保存未来还能开口说话的能力。`,
      22: `炉火把车间映得通红，王铁人站在钢铁、油污与汗水之间。衣服沾满尘灰，手掌粗糙开裂，脸上的坚定像被高温反复锻过。

新中国的工业化不是轻盈的蓝图，而是从缺设备、缺经验、缺资源的现实中硬扛出来的。人拉肩扛、昼夜赶工、反复试验、互相鼓劲，机器的轰鸣声里有疲惫，也有把国家支起来的朴素尊严。

他不需要昂扬姿态。站在炉火前，整个人就像一块尚在冷却的铁。那一代建设者用身体承受时代的重量，也用身体把一穷二白的土地推向现代工业的门槛。`,
      23: `深圳厂房的灯光亮到深夜，小李站在流水线与出租屋之间，背包还带着家乡路上的尘土。绿皮火车票夹在本子里，磁带收录机播放着新歌和外语课。

白天，她或他把电子元件装进机器；夜里，又把课本、工资条和给家里的信放在同一张小桌上。疲惫是真实的，兴奋也是真实的。城市年轻、嘈杂、昂贵，却每天都像刚刚开始。

改革开放进入普通人的身体，往往就是这样具体：一次离乡，一张车票，一间拥挤宿舍，一个愿意相信明天会不同的夜晚。命运不再只由出身决定，选择开始变得可触摸。`,
      24: `屏幕冷光映在阿哲脸上，深夜办公室外还有零星车流。代码窗口、手机消息和服务器告警同时亮着，他坐在无数连接的中心，也坐在一种难以命名的孤独里。

算法让支付、出行、社交和记忆变得迅速，世界似乎被压缩进一块发光玻璃。可当地铁里所有人都低头滑动屏幕，连接又显出另一面：人们靠得很近，注意力却被分散到不同的信息角落。

阿哲写下的代码改变日常，也把他自己卷进日常的变化。数字时代的矛盾不在远处，它就在每一次推送、每一次沉默和每一个深夜仍亮着的屏幕里。`,
      25: `灯光落在访客侧脸上，茶杯升起微热的白汽，屏幕仍在发亮。展厅尽头没有遥远朝代，只有此刻的呼吸、目光和正在形成的判断。

前面的玉器、青铜、诗句、战火、车间和代码并没有停在过去。它们变成语言习惯、审美趣味、制度记忆和生活方式，悄悄进入今天。你回望它们时，也在被它们塑造。

当下不是历史的尾声，而是下一段历史刚刚落笔的地方。茶仍有温度，屏幕仍在闪烁，选择仍未完成。你站在这里，既是后来者，也是即将被后来者回望的人。`
    };

    if (captions[data.id]) return captions[data.id];

    const character = data.characters?.[0];
    return character?.description || `${data.name}中的人物被放回${data.theme}的现场，服饰、姿态与神情共同指向这个时代最真实的人文处境。`;
  }

  getEventGalleryCaption(data) {
    const captions = {
      0: `夜色深到看不清河岸时，第一缕火从木与木的摩擦中挣脱出来。族人围拢过来，有人惊惧后退，有人伸手试探温度，孩子的眼睛里映着跳动的光。

这不是一次单纯的取暖，也不是一项孤立的技术。火让熟食、夜间守护、共同围坐和口耳相传成为可能；从此，人类不再只是躲避黑暗，而开始主动把黑暗向外推开。`,
      1: `良渚水乡的清晨，玉料被送进作坊，稻田、城墙与祭坛在雾气中若隐若现。匠人们用细砂反复磨琢，神徽的线条在漫长劳作中一点点显形。

这场事件不是某一件玉器的完成，而是一个城邦把信仰、权力和手工业组织到一起的过程。玉琮被举起时，人们看到的不只是美，也看到共同体对天地秩序的想象。`,
      2: `卜火燃起，龟甲在高温中发出细碎爆裂声，贞人俯身辨读裂纹，刻辞随后落在甲骨之上。祭器旁，妇好出征的讯息正在被祖先、王权和军队共同确认。

甲骨记录了疑问，青铜承载了祭祀，兵戈指向即将到来的战事。殷商的国家运转，就在这种问卜、铭刻、铸造与征伐之间显出真实形状。`,
      3: `宗庙中钟声初起，青铜鼎列于堂前，贵族、乐师与执礼者各就其位。声音沿着木梁扩散，礼器上的铭文把赏赐、血缘与职责固定下来。

这场礼乐的建立，不是一次表演，而是西周把战后天下重新编排的方式。人们在乐声中学习位置，在礼仪中确认边界，国家由此从武力征服走向制度秩序。`,
      4: `列国车马扬起尘土，旧贵族的礼制不断崩裂，学者、游士与弟子穿行其间。竹简被铺开，辩论在讲席、城门、旅舍与诸侯宫廷之间持续发生。

百家争鸣的真正现场并不安静。它来自战争压力、制度失效和人心无依，也因此逼出关于仁、道、法、名、兼爱的不同答案。思想在动荡中变得锋利。`,
      5: `关中军阵向东方推进，车轨、文字、度量衡和律令随后进入新的土地。士兵攻城，工匠烧陶，官吏登记户籍，帝国的标准被一层层压实。

统一不是一瞬间完成的口号，而是战场、道路、文书和徭役共同推动的巨大工程。它带来空前秩序，也把沉重代价留在普通人的肩背上。`,
      6: `汉使队伍离开长安，穿过河西、草原与沙漠，风沙一次次遮住道路。被扣留、逃脱、再出发之后，远方国家的名字终于进入汉朝的视野。

所谓凿空，是把不可知的西域凿出一条可往来的缝隙。张骞之后，丝绸、马匹、葡萄、乐舞与信仰沿路流动，东西方文明开始在漫长旅途中互相看见。`,
      7: `兰亭水岸，曲水流觞，士人们在春日里饮酒赋诗；另一边，竹林深处的琴声与清谈也在逃离庙堂的逼仄。山水被重新理解为安放心灵的地方。

这场风雅不是简单的闲适。魏晋人物在乱世与权力阴影下，转向个性、玄思和书法，以身体姿态和笔墨气韵保存自我。兰亭的墨迹因此带着生命无常的叹息。`,
      8: `山体被凿开，脚手架贴着岩壁层层升起，工匠的铁锤在砂岩上敲出连续回声。佛像尚未完成，信众已经在尘土中合掌祈愿。

石窟开凿把国家权力、佛教信仰与工匠技艺交织在一起。乱世越动荡，人们越需要把安慰交给更长久的石头；于是佛的面容从山中出现，替时代承受恐惧。`,
      9: `河道两岸号子声不断，民夫拉纤、挖泥、筑堤，泥水漫过脚踝。远处龙舟的想象很华丽，近处的工程却由疲惫的身体一点点推进。

大运河的开凿改变了中国南北的交通格局，也压垮了无数承担徭役的人。它既是隋亡的伤口，也是后世繁荣的水脉，历史的复杂性正流在这条河里。`,
      10: `长安西市人声鼎沸，胡商卸下香料，乐人调试琵琶，诗人和旅人在人群中相遇。不同语言、衣冠与货物在同一座城市里交错。

盛唐的气象不只是宫阙高大，而是这种开放的日常：远方被纳入城市，异域成为生活的一部分。诗歌、贸易、乐舞和信仰在长安汇聚，使帝国显出罕见的自信。`,
      11: `渔阳鼙鼓打破霓裳乐声，逃难的人群涌上道路，城池与村庄在战火中失去安宁。诗人走过废墟，听见征夫、老妇与饥民的声音。

安史之乱让盛唐的华彩骤然褪色，也迫使文学转向人间疾苦。杜甫的笔把宏大的战乱拆成一张张脸、一家家离散，使历史不再只属于帝王将相。`,
      12: `城市街巷繁忙，书院灯火安静，官员在奏疏上斟酌一字一句。市井生活的富足与理学兴起的自省，在宋代同一个空间里并行。

宋韵的形成不是单纯审美化的优雅，而是商业、教育、士大夫政治和日常生活共同作用的结果。瓷器的清淡、文章的责任和城市的烟火，构成了这个时代的层次。`,
      13: `汴河桥上车马交错，店铺灯火延伸到夜色里，勾栏瓦舍传来醒木与唱腔。画卷般的东京，不只属于官府，也属于行人、商贩、艺人与词人。

市井文化的兴起，让普通人的生活第一次如此密集地进入历史画面。繁华之中也埋着离散的伏笔，所以梦华东京既有热闹，也有日后回望时的疼。`,
      14: `临安城里歌舞未歇，北方边境却烽烟不止。将领陈兵江淮，词人夜里挑灯看剑，失地与偏安同时压在南宋人的心上。

这个事件的核心不是一次战役，而是一种长期撕裂：朝廷想保住眼前安稳，志士却记得山河未复。西湖的暖风越柔，铁马冰河的梦越沉。`,
      15: `大都街巷里，驿马传递文书，商旅带来异域货物，瓦舍戏台则聚满听曲看戏的人。失意文人把愤懑写进杂剧，让百姓在唱念之间听见自己的命运。

元代的文化现场既有辽阔交通带来的交流，也有社会等级造成的压抑。青花瓷远销海外，戏曲深入民间，粗粝与华丽在同一时代并存。`,
      16: `宝船离港时，桅杆遮住半边天空，水手、翻译、医官和使节各司其职。海图被摊开，季风将船队推向东南亚、印度洋与更远的海岸。

郑和下西洋不是孤帆远影，而是明初国家能力的一次海上展开。它把朝贡、贸易、外交和技术组织到同一航程中，也把中国人的世界想象推向大海。`,
      17: `江南园林里，昆曲水磨腔绕过廊柱，书坊中新刻的戏曲与小说被争相购买。才子、商人、读者与演员共同撑起晚明丰富而敏感的文化生活。

《牡丹亭》式的情感觉醒，发生在商品经济繁荣和礼教压抑并存的时代。人们借戏梦说真情，借园林安放心事，晚明的浮世因此既绚丽又脆弱。`,
      18: `书局与宫廷之间，典籍被搜集、校勘、抄录、分类，巨大的文化工程缓慢推进。学者伏案考据，另一些书却在禁毁名单中消失。

清前期的修书盛事同时包含保存与筛选、学术与权力。四库全书的册页很精致，但翻动它时，也能听见文字狱留下的静默回声。`,
      19: `甲午战败后的风雨里，报馆灯火彻夜不灭，译书、政论和演说迅速传播。青年读者在纸页间第一次强烈感到，世界已经逼到门前。

晚清变局不是单一失败，而是一连串被迫睁眼的时刻。师夷、自强、变法、启蒙彼此交叠，旧秩序摇晃之中，新的国民意识开始形成。`,
      20: `新文化的刊物在学生与知识分子之间传阅，白话文、民主、科学和反礼教的声音不断扩散。旧式书房与现代印刷同时出现在时代转角。

民国风雨中的思想事件，不是某篇文章单独造成的震动，而是一代人开始重新审视人、家庭、国家和未来。呐喊之所以刺耳，是因为沉睡太久。`,
      21: `炮火迫使大学南迁，师生背着书箱翻山越岭，最后在昆明简陋校舍中重新开课。空袭警报响起时，课堂转入防空洞；警报解除，讲义继续展开。

烽火中的教育延续，是一种无声抵抗。流亡没有切断知识，贫困没有压倒求学，联大的灯火因此成为抗战记忆里最坚韧的一部分。`,
      22: `车间炉火通红，工人围着设备反复试验，图纸不全就边拆边学，材料不足就想办法替代。新国家的工业基础在汗水、噪声与集体劳动中被一点点搭起。

这场建设不浪漫，却改变了国家的骨架。方向盘、搪瓷杯、钢炉和机器零件共同记录着那个年代的朴素信念：用自己的双手，把一穷二白变成可以站立的现代工业。`,
      23: `绿皮火车把青年送往南方，厂房灯光彻夜不灭，收录机里传出新歌和外语磁带的声音。人们带着行李、汇款单和不确定的希望，进入特区的速度之中。

改革浪潮改变制度，也改变个人命运的想象。流水线、夜校、市场和信箱构成新的生活节奏；在这里，努力第一次和更大的选择空间紧紧连在一起。`,
      24: `智能手机亮起，支付、导航、聊天和新闻在一块屏幕上同时发生。代码在服务器间流动，城市中的人们彼此连接，却也被算法推向各自的信息角落。

数字时代的事件不是某一项产品发布，而是生活方式被整体重写。便利、效率、孤独和焦虑一起到来，人文问题也从纸页和街巷转移到屏幕、数据与注意力之中。`,
      25: `展厅尽头没有遥远朝代，只有一杯茶、一块屏幕和正在观看的人。前面的所有历史节点在此刻汇合，变成今天的语言、审美、工具和判断。

这不是结束场景，而是把选择交还给观众的时刻。历史被重新看见之后，当下也变得不再普通：每一次记忆、创造、理解和行动，都会成为后来者回望的现场。`
    };

    if (captions[data.id]) return captions[data.id];

    return `“${data.transition}”发生在${data.theme}的历史压力之中。人物、器物与现场被重新放在同一画面里，让观众看见这个节点如何从一次具体变化，扩展成影响后世的时代转折。`;
  }

  getSiteGalleryCaption(data) {
    const captions = {
      0: `河湾旁的洞穴半隐在夜色里，洞口堆着干枝、石片和粗陶碎片。营火在中央燃着，火星升起后又落回灰烬，照亮岩壁上起伏的人影。

这里没有城墙，也没有文字，只有水源、猎物踪迹、避风的岩穴和能够守住夜晚的火。远古聚落的秩序正从这些最基本的东西里长出来：谁去拾柴，谁守洞口，谁分配熟食，谁把白天的经验说给孩子听。文明最初并不宏大，它先是一个能让人活过寒夜的地方。`,
      1: `水网、稻田和土台在晨雾里铺开，木桩支撑的房屋沿河分布，远处城墙像一圈低伏的土脊。作坊里有被水浸润的玉料，祭坛旁有等待陈设的礼器。

良渚的现场带着潮湿的气息。稻作供养人口，河道连接村落，玉器把权力和信仰固定下来。这里已经不是松散聚居，而是有工程、有分工、有祭祀中心的早期城邦。玉光温润，城土厚重，两者共同托起一套尚未写成文字的秩序。`,
      2: `殷墟宗庙里，火盆、龟甲、兽骨和青铜器摆在同一片暗金色光线中。地面有烧灼后的黑痕，骨面上裂纹细密，鼎尊表面覆着幽绿铜锈。

这里的空气里有烟、酒和泥土的味道。贞问在火中发生，结果被刻进骨头；祭祀在青铜前举行，权力借祖先之名获得确认。甲骨不是孤立文字，青铜也不是孤立器物，它们共同构成商代人理解命运、战争和国家的现场。`,
      3: `西周宗庙宽阔而克制，鼎列于堂，编钟悬在木架上，席位、阶次和行走的路径都被严格区分。光从高处落下，照见青铜铭文的凹凸。

这个空间不靠喧闹取胜，而靠位置和节奏让人感到庄重。钟声未响时，秩序已经存在；礼器未动时，身份已经分明。周礼的力量就藏在这种安排里：让人知道何处可进，何处当止，何时发声，何时沉默。`,
      4: `春秋讲席设在城邑边缘，竹简、车辙、席垫和远处的城门同时出现。道路上有使者和士人往来，尘土刚落，又被新的车马扬起。

这里不是安静书院，而是一个随时可能被战争消息打断的思想现场。旧礼制正在裂开，诸侯仍在争霸，年轻弟子却围坐在简牍旁，试图从仁、道、法与礼中寻找新的答案。百家争鸣首先是一种失序后的求生。`,
      5: `秦代军营外，夯土城墙、整齐兵器架和未干的陶俑泥坯排成冷硬的线条。道路笔直伸向远处，车辙宽度一致，木牌上写着统一后的文字。

这里的一切都指向标准：兵器有规制，陶俑有编号，文书有格式，道路有尺度。帝国不是只在宫殿里存在，它更存在于军营、工坊、驿道和郡县文书中。秦风烈烈，烈在这种把天下压成同一种尺度的力量。`,
      6: `河西走廊的驿站旁，沙地被风吹出细纹，骆驼卧在货包旁，汉节、皮囊、木简和异域器物散落在帐篷边。远处关隘被黄沙半掩，天色辽阔得近乎冷峻。

丝路最初不是繁华街市，而是补给稀少、语言陌生、方向随时会被风沙抹去的道路。驿站里短暂停留的人带来马匹、种子、乐器、玻璃和传闻，也带来对远方的重新理解。文明交流先要穿过漫长孤独。`,
      7: `兰亭水岸曲流缓缓绕过竹林，酒杯顺水而下，岸边铺着纸、砚和未干的墨迹。山石、春草、衣袂和书法线条共同显出一种松弛的风雅。

这里的山水并非单纯景色，而是士人在乱世中暂时安放生命感受的地方。流水带走酒杯，也带走关于生死无常的叹息。竹林与兰亭之间，魏晋人的精神现场从庙堂转向自然，从功业转向个体内心。`,
      8: `云冈石窟的山壁高耸，脚手架贴着岩面，石粉落满地面。未完成的佛龛旁，工匠的凿子、木槌和绳索仍在原处，佛像的眉眼从砂岩中慢慢浮出。

这里有政权的意志，也有民众的祈愿。乱世里，人们把无法安顿的恐惧交给石头，把短促生命托付给更长久的佛身。石窟不是静止景观，而是敲击声、尘土、祈祷和权力共同凿出的精神避难所。`,
      9: `运河工地上，河泥堆成湿重的坡，纤绳拖过岸边，竹筐、铁锹和木桩散在水线旁。远处新开的河道泛着浑浊水光，两岸有人拉纤，有人筑堤。

这条河尚未成为后世的黄金水道，先是一道巨大的伤口。民夫的脚印被泥水迅速吞没，号子声却一遍遍响起。南北交通的未来繁荣，正从疲惫身体和沉重徭役中被挖出来。`,
      10: `长安西市铺展开来，香料、葡萄酒、丝绸、琵琶和骆驼队挤在同一片街巷。坊门外人声鼎沸，胡商、诗人、乐伎和官员擦肩而过。

盛唐的现场不只在宫阙，也在市场。远方货物改变味觉和服饰，异域音乐进入宴席，陌生语言变成街头日常。长安的繁华不是单一中心向外辐射，而是四方来客不断汇入后形成的开放气象。`,
      11: `战乱后的道路泥泞破碎，烧毁的村舍旁有逃难者歇脚，远处城墙残缺，春草却仍从瓦砾间长出。雨水落在破屋和荒田上，显出中唐的阴冷底色。

这里没有盛唐的明亮，只剩被战争拉长的余痛。流民、征夫、空仓、断桥和荒草，让诗句中的苦难重新变成可触摸的环境。山河仍在，却已不再完整；人的生活也在废墟边艰难接续。`,
      12: `北宋城中街巷繁忙，茶坊、书铺和瓷器摊沿街展开；另一侧书院灯火安静，案上摆着经卷、砚台和天青色瓷器。市声与读书声并不互相遮蔽。

宋代生活的细密就在这种并置里。商业让城市活起来，教育和理学让士人向内追问，瓷器的清淡审美又把日常器物变得温润克制。这里既有人间烟火，也有关于道德、秩序和自我修养的长久讨论。`,
      13: `汴河两岸船只往来，虹桥上人群拥挤，酒楼、脚店、货摊和勾栏瓦舍一直延伸到夜色里。灯火照着招幌，醒木声和叫卖声混在一起。

东京的现场充满流动：货物流动，故事流动，词曲流动，人的欲望也流动。坊市边界被打破后，城市不再按白昼停下。繁华像一卷展开的长图，越热闹，越让后来失去它的人感到疼。`,
      14: `临安西湖边歌舞未歇，画舫缓缓划过水面；更远处的城防图、弩机和铁镞却静静摆在军营里。湖光与兵器之间隔着不远的路，却像隔着一整个朝廷的犹疑。

南宋的现场永远有两层：一层是偏安城市的柔美，一层是边境山河的疼痛。暖风吹过酒楼时，江淮前线仍在戒备。西湖越安逸，未复的北方就越像压在心底的铁。`,
      15: `大都街巷宽阔，驿站里马匹更换不息，瓷器、皮货、香料和文书在道路上来回流动。瓦舍戏台灯火明亮，台下百姓挤在一处听曲。

元代的现场带着辽阔和粗粝。驿道连接远方，青花瓷走向海外，杂剧却把最贴近民间的悲欢留在城中。世界变大了，人的处境未必变轻；正因如此，戏台上的一声冤、一句骂才格外有力。`,
      16: `港口晨雾未散，宝船桅杆层层竖起，码头上堆着瓷器、绸缎、香料、淡水桶和航海器具。水手拉紧绳索，海图在风中被人按住。

明初远航的现场像一座即将移动的城市。船队带着礼物、技术、语言和朝廷威仪离岸，驶向季风与陌生海岸。紫禁城的秩序在陆地上稳固，郑和的船队则把这种秩序推向海面，推向更大的世界想象。`,
      17: `江南园林水榭临池而建，曲本摊在案上，雕版书页散发墨香，戏台灯光映着花木和回廊。昆曲唱腔从水面滑过，像一阵不肯散去的梦。

晚明的现场精致而敏感。商品经济使书坊、戏班和私家园林繁盛，礼法却仍压在人心上。于是人们在曲词里说情，在小说里写欲，在园林里保存片刻自由。繁华之下，个体已经开始寻找自己的声音。`,
      18: `文渊阁内书架高立，线装册页分门别类地排列，校勘朱笔、抄写纸张和装帧工具散在长案上。窗外宫墙安静，屋内纸页翻动声细而密。

清前期的文化现场有一种矛盾的庄严。典籍被搜罗、整理、保存，考据学在青灯下日益精密；与此同时，禁毁和删改也让许多声音消失。四库全书的宏大不只来自书多，也来自保存与控制并行的沉默。`,
      19: `晚清报馆里灯火未灭，铅字、译稿、报纸和世界地图铺满桌面。窗外雨声急促，远处码头停着外国轮船，电报线从街角伸向看不见的远方。

这里的空气带着危机的速度。战败消息、译书新知、变法论说和救亡呼声在纸页间快速流动。旧式书斋已经关不住世界，新的词汇带着刺痛闯进来，逼迫人们重新理解国家、国民和未来。`,
      20: `民国书房狭窄而昏黄，桌上放着《新青年》、白话稿纸、烟灰缸和油灯。窗外街巷有学生传阅刊物，印刷机的震动仿佛仍在墙后回响。

新文化的现场并不华丽，却很紧张。旧书还在架上，新杂志已经摊开；旧礼教仍在生活里，新语言正在纸上试图挣脱。民主、科学、个人和觉醒这些词，最初就是在这样的桌面和街头之间变得滚烫。`,
      21: `昆明的草房教室低矮简陋，木桌被反复修补，油灯放在讲台旁，防空洞入口就在不远处。雨水从屋檐滴落，书声却仍从屋里传出。

烽火中的校园没有稳定边界。课堂可以在草房，也可以在山洞；课本可以被炮声打断，却不会因此合上。西南联大的现场越简陋，越显出教育延续的分量。文化火种不是被保存在库房里，而是在饥饿、迁徙和轰炸之间继续被点亮。`,
      22: `新中国车间里炉火通红，钢水、机床、方向盘模具和搪瓷杯共同构成朴素的劳动空间。墙上标语已经有些褪色，工人们的手套却沾满新鲜油污。

这个现场没有奢华，只有建设初期的热和硬。设备不足就改，经验不足就学，材料不足就替代。国家工业化的骨架不是凭空出现的，它在车间噪声、汗水、集体食堂和夜班灯光中一点点成形。`,
      23: `深圳早期厂房排列在潮湿热风里，流水线灯光通明，宿舍窗外晾着衣服。绿皮火车票、磁带收录机、汇款单和夜校课本放在一张窄桌上。

改革开放的现场不只是高楼拔地而起之前的土地，也是无数人刚到南方时的行李和睡眠不足。机器声里有疲惫，收录机里有新歌，夜校课本里有改变命运的想象。速度从厂房开始，也从普通人的生活开始。`,
      24: `城市夜晚被屏幕照亮，办公室、地铁、外卖站点和客厅都连进同一张无形网络。手机亮起时，支付码、聊天窗口、地图路线和短视频同时挤在掌心。

数字时代的现场没有固定边界。服务器在远处运转，算法在眼前分发，人的注意力被切成细小片段。便利真实存在，孤独也真实存在；连接越密，越需要重新确认人在数据洪流中还保留多少主动。`,
      25: `一杯温茶放在桌上，屏幕亮着，窗外是当下城市的普通夜色。没有祭坛、宗庙、宫阙或战场，只有正在呼吸的人和正在发生的生活。

此刻的现场看似平凡，却汇入了前面所有历史：火带来的围坐，玉带来的秩序，青铜留下的记忆，诗词保留的情感，车间和代码改变的日常。历史没有停在过去，它沉入茶香、语言、工具和选择里，继续向未来移动。`
    };

    if (captions[data.id]) return captions[data.id];

    return `${data.theme}的空间里，人物行迹、器物痕迹和日常秩序交叠在一起。风土、材料、光线与声音共同留下这个时代的气息，也让“${data.name}”不再只是一个节点名称，而成为仍可进入的生活现场。`;
  }

  getGalleryModeLabel(mode = 'human') {
    const labels = {
      human: '人文图片',
      person: '人物还原',
      event: '事件还原',
      site: '历史现场'
    };
    return labels[mode] || labels.human;
  }

  getHistoricalUnit(index) {
    if (index <= 1) return '文明起源单元';
    if (index <= 3) return '青铜礼制单元';
    if (index <= 6) return '诸子帝国单元';
    if (index <= 11) return '魏晋隋唐单元';
    if (index <= 17) return '宋元明清单元';
    if (index <= 21) return '近现代转型单元';
    return '当代生活单元';
  }


  closeImageModal(restoreSpotlight = true) {
    this.imageLoadRequestId += 1;
    if (this.imageModalCanvas) {
      this.imageModalCanvas.style.visibility = 'hidden';
      this.imageModalCanvas.getContext('2d')?.clearRect(0, 0, this.imageModalCanvas.width, this.imageModalCanvas.height);
    }
    if (this.imageModal) {
      this.imageModal.classList.add('hidden');
    }
    this.hud?.classList.remove('modal-suppressed');
    if (restoreSpotlight) this.restoreCurrentCharacterSpotlight();
  }

  openCurrentArtifactModal() {
    const index = this.getActionNodeIndex(this.node3dBtn);
    const data = nodesData[index];
    const artifact = data?.artifacts?.[0];
    if (!artifact) return;

    this.activeNodeIndex = index;
    sound.playPluck();
    this.openArtifactModal(artifact);
  }

  buildNodeInsight(data) {
    const characterNames = (data.characters || []).map((char) => char.name).join('、') || '无名之人';
    const artifactNames = (data.artifacts || []).map((artifact) => artifact.name).join('、') || '时代遗物';
    const unitName = this.getHistoricalUnit(data.id);

    return `在${unitName}中，“${data.name}”聚焦${data.theme}。这里以 AI 重访历史：把${characterNames}、关键事件与${artifactNames}放回同一现场，让制度、信仰、战争、贸易或技术变化落实到具体的人与物上。点击下方按钮可分别查看人文图片、人物还原、事件还原、历史现场与 3D 展品。`;
  }

  buildCharacterNarrative(character) {
    const node = this.findNodeForCharacter(character) || nodesData[this.currentEraIndex];
    const nodeContext = node ? `在“${node.name}”节点中，${character.name}不是被摆放在展柜旁的符号，而是这段人文经验的发声者。${node.theme}背后包含了制度、技艺、信仰和普通生活的变化；他的言说让观众看见，一个时代最真实的重量往往落在具体的人身上。` : '';

    return `${character.description}\n\n${nodeContext}`;
  }

  buildArtifactNarrative(artifact) {
    const node = this.findNodeForArtifact(artifact) || nodesData[this.activeNodeIndex] || nodesData[this.currentEraIndex];
    const base = artifact.description || '';
    const nodeName = node?.name || artifact.era;
    const theme = node?.theme || '历史现场';
    const characters = (node?.characters || []).map((char) => char.name).join('、') || '当时的人们';
    const featureData = this.getArtifactFeatureData(artifact, getArtifactVisualSpec(artifact));
    const featureText = featureData.features
      .map((feature) => `${feature.label}：${feature.detail}`)
      .join('\n');

    const extension = `从“${nodeName}”的${theme}脉络来看，${artifact.name}的意义不只在器形与材质。它把${characters}所处的精神世界、生产方式和社会压力留在了可观看的细节里：一处纹样、一种釉色、一段铭文、一件磨损，都可能说明人们怎样理解秩序、怎样面对动荡，又怎样把理想投射到日用之物中。把它放进 3D 展厅观看时，旋转的不只是一个模型，而是一段被压缩成器物的历史现场。`;

    return `${base}\n\n${featureText}\n\n${extension}`;
  }

  getArtifactFeatureData(artifact, artifactVisual = getArtifactVisualSpec(artifact)) {
    const variant = artifactVisual?.variant || artifact?.geometry || 'generic';
    const common = {
      'painted-pottery': {
        material: '夹砂红陶、黑彩纹饰、微弱烟熏边缘',
        features: [
          { label: '人面鱼纹', detail: '黑彩线条贴着盆内壁铺开，鱼纹与人面相互嵌合，像祭祀和繁衍愿望留在陶土上的暗号。' },
          { label: '手制陶壁', detail: '口沿与腹壁不追求机械对称，细小起伏保留了捏塑、修坯和烧成后的真实手感。' },
          { label: '烟熏磨痕', detail: '边缘带有暗沉火痕和泥料颗粒，提示它曾经历窑火，也曾贴近日常生活。' }
        ]
      },
      'jade-cong': {
        material: '温润玉质、局部沁色、神徽浅刻',
        features: [
          { label: '方圆结构', detail: '外方内圆的体量并不锋利，棱边被岁月磨得温和，仍保持礼器的庄重比例。' },
          { label: '神人兽面', detail: '角部浅浮雕以细线叠出眼、冠与兽面，线条深浅不一，像从玉质内部浮现。' },
          { label: '沁色与磨耗', detail: '青白玉面带有黄褐沁斑和微小划痕，削弱了新玉的光滑感。' }
        ]
      },
      'owl-zun': {
        material: '青铜锈蚀、兽面纹、羽翅纹理',
        features: [
          { label: '鸮形双目', detail: '圆眼与喙部保持强烈正面感，带有商代青铜器特有的神性凝视。' },
          { label: '夔龙饕餮', detail: '器身纹样不只是装饰，深浅凹凸与锈色共同形成祭祀器物的威压。' },
          { label: '铜绿锈层', detail: '表面有青绿、黑褐和金属暗光交叠，避免光滑新铜的廉价感。' }
        ]
      },
      'bronze-ding': {
        material: '厚重青铜、内壁铭文、宽带纹饰',
        features: [
          { label: '内壁铭文', detail: '铭文字痕带着铸造后的钝边，不像书写墨迹，而像被时间压进铜里的记录。' },
          { label: '鼎腹宽带', detail: '纹饰宽阔克制，和商代的诡谲不同，更接近西周礼制的庄重秩序。' },
          { label: '足部磨蚀', detail: '三足下缘带有暗色磨损，暗示重器长期陈设、搬运和祭祀使用。' }
        ]
      },
      'bell-rack': {
        material: '青铜编钟、木架暗纹、铭文与敲击痕',
        features: [
          { label: '钟枚排列', detail: '大小错落的钟体形成音高秩序，金属表面带着被敲击后的轻微亮边。' },
          { label: '铭文细线', detail: '钟身局部有浅刻文字与音律标记，说明它既是乐器，也是制度化知识的载体。' },
          { label: '悬挂木架', detail: '木架色泽暗沉，纹理粗粝，托住整套礼乐空间的重量。' }
        ]
      },
      'terracotta-warrior': {
        material: '陶土颗粒、甲片层次、残彩与裂纹',
        features: [
          { label: '甲片层叠', detail: '胸甲一片片压叠，边缘留有泥塑起伏，不再像平整塑料。' },
          { label: '面部差异', detail: '眉骨、鼻梁和嘴角带有手工塑造差别，回应兵马俑千人千面的真实感。' },
          { label: '残彩土痕', detail: '陶土表面保留褐红、灰黑和少量残彩，像刚从地下光线里显露出来。' }
        ]
      },
      'palace-lamp': {
        material: '鎏金青铜、烟道结构、宫灯磨损',
        features: [
          { label: '仕女执灯', detail: '人物手臂与灯体相连，优雅姿态背后藏着导烟结构。' },
          { label: '烟道接口', detail: '灯罩与手臂交接处带有微暗痕迹，提示烟尘被导入中空身体。' },
          { label: '鎏金磨蚀', detail: '金色表面不均匀，凸起处更亮，凹陷处沉着时间留下的暗色。' }
        ]
      },
      'calligraphy-scroll': {
        material: '纸本纤维、行书笔触、朱印与卷轴磨边',
        features: [
          { label: '行书墨迹', detail: '笔画有提按转折和飞白，不是印刷线条，而像墨在纸纤维中渗开。' },
          { label: '纸面纤维', detail: '浅黄纸面带有细密纹理和折痕，保留卷轴反复展开的痕迹。' },
          { label: '朱印边缘', detail: '印色略有渗散，压在纸面上形成书法之外的收藏记忆。' }
        ]
      },
      'buddha-statue': {
        material: '砂岩颗粒、凿痕、风化边缘',
        features: [
          { label: '佛面风化', detail: '眉眼和嘴角保留柔和轮廓，局部被风沙磨平，慈悲感来自石质的沉默。' },
          { label: '衣纹凿痕', detail: '衣褶有规律但不光滑，凿子留下的方向感仍可辨认。' },
          { label: '砂岩孔隙', detail: '表面布满细小颗粒与暗斑，削弱了数字模型常见的塑料感。' }
        ]
      },
      'canal-tools': {
        material: '锈铁、纤绳磨损、泥水附着',
        features: [
          { label: '铁具锈层', detail: '铁器边缘有红褐锈蚀与黑色沉积，像长期接触泥水。' },
          { label: '受力磨亮', detail: '钩扣受力处出现暗亮磨痕，说明它不是陈设物，而是被反复拖拽过。' },
          { label: '绳纤残痕', detail: '表面附着细碎纤维和泥点，把民夫拉纤的身体劳作带回物件。' }
        ]
      },
      'sancai-camel': {
        material: '三彩釉流、陶胎裂纹、乐俑细节',
        features: [
          { label: '釉色流淌', detail: '黄、绿、白釉交界处自然晕开，像窑火中流动后凝住的颜色。' },
          { label: '驼背乐队', detail: '乐俑和舞者被安置在驼背平台上，胡乐进入长安的现场感由此出现。' },
          { label: '陶胎开裂', detail: '局部细裂和釉面小坑让陶俑摆脱新制工艺品的光滑。' }
        ]
      },
      'ringed-staff': {
        material: '银锡冷光、环扣磨痕、佛教纹样',
        features: [
          { label: '十二环扣', detail: '环与环之间保留轻微碰撞磨亮的痕迹，仿佛仍能听见行旅声。' },
          { label: '杖身雕饰', detail: '细纹沿杖身排列，宗教仪式感来自重复而克制的金属线条。' },
          { label: '冷银氧化', detail: '银色不再耀眼，缝隙处有灰黑氧化层，接近地宫出土器物的清冷感。' }
        ]
      },
      'ru-tripod': {
        material: '天青釉、冰裂开片、弦纹与三足',
        features: [
          { label: '釉面开片', detail: '细密裂纹像冰面自然开裂，深浅不一，贴近汝窑天青釉的温润质地。' },
          { label: '弦纹腰线', detail: '器身横向弦纹克制而清晰，让素雅器形有了节奏。' },
          { label: '三足支撑', detail: '足部釉色略深，边缘有细小磨损，提示器物真实承重。' }
        ]
      },
      'qingming-scroll': {
        material: '长卷纸色、桥市线描、人群墨点',
        features: [
          { label: '虹桥结构', detail: '桥身弧线和木构节点交代汴河市井的空间中心。' },
          { label: '店铺人群', detail: '细小人影与招幌连成街巷节奏，繁华不靠大场面，而靠密集日常。' },
          { label: '纸卷旧色', detail: '边缘发黄、折痕与水墨轻淡，让长卷具有被反复观看的时间感。' }
        ]
      },
      'crossbow': {
        material: '黑漆木、铁镞锈斑、弩机磨损',
        features: [
          { label: '黑漆残层', detail: '弩身黑漆并不均匀，边角露出木色和擦痕。' },
          { label: '弩机铁件', detail: '金属扣件有锈蚀和受力磨亮处，指向真实发射机构。' },
          { label: '铁镞锋口', detail: '箭镞尖端保留暗亮边缘，锋利感从锈斑中透出来。' }
        ]
      },
      'blue-white-vase': {
        material: '钴蓝晕散、白瓷釉光、龙莲纹样',
        features: [
          { label: '钴料晕散', detail: '青花边缘略有渗化，呈现苏麻离青的浓淡变化。' },
          { label: '缠枝莲纹', detail: '花叶沿瓶身铺展，填满器腹的同时保持元代粗犷气势。' },
          { label: '釉面反光', detail: '白釉有轻微不平与小气泡，使瓷面接近真实高温烧成质感。' }
        ]
      },
      'world-map-scroll': {
        material: '绢本旧色、海路墨线、地名标记',
        features: [
          { label: '海岸线墨迹', detail: '地图线条有粗细变化，记录明代对外部世界的认知边界。' },
          { label: '航路标记', detail: '红色船影与海路线索把远航经验叠加到地图之上。' },
          { label: '绢本折痕', detail: '底面有纤维和暗黄旧色，像长期保存后的宫廷地图。' }
        ]
      },
      'woodblock-book': {
        material: '雕版墨色、宣纸纤维、书页磨角',
        features: [
          { label: '版刻线条', detail: '墨线边缘略粗，保留木版印刷的压印感。' },
          { label: '戏曲插图', detail: '人物轮廓和园林线条使文本与舞台想象连在一起。' },
          { label: '书角磨损', detail: '页角发暗、轻微卷起，像被反复翻阅过的晚明善本。' }
        ]
      },
      'archive-book': {
        material: '线装册页、黄绢书皮、朱印与题签',
        features: [
          { label: '线装书脊', detail: '针脚和书线清晰，显示四库册页的装帧秩序。' },
          { label: '题签分部', detail: '经史子集的分类感通过竖向题签和书架排列显现。' },
          { label: '朱印压痕', detail: '红印不只是装饰，也暗示皇家收藏和权力筛选。' }
        ]
      },
      'reform-book': {
        material: '近代铅字、旧纸酸化、海浪警示纹',
        features: [
          { label: '铅字排印', detail: '字行规整但纸面泛黄，带有晚清译本的印刷质感。' },
          { label: '页边酸化', detail: '纸边暗沉脆化，像被急切传阅后留下的时间痕迹。' },
          { label: '浪线隐喻', detail: '底纹里的波浪让救亡焦虑进入书籍表面。' }
        ]
      },
      'magazine': {
        material: '民国杂志封面、油墨颗粒、笔尖划痕',
        features: [
          { label: '红色刊头', detail: '封面红块醒目，带着新文化刊物的公共动员感。' },
          { label: '印刷颗粒', detail: '纸面和墨色略有粗糙颗粒，接近早期杂志印刷。' },
          { label: '钢笔痕迹', detail: '笔尖与稿纸并置，保留思想写作的锋利气息。' }
        ]
      },
      'wartime-desk': {
        material: '旧木桌、煤油灯烟痕、书页折角',
        features: [
          { label: '桌面刀痕', detail: '木纹里有划痕和凹坑，像临时校舍中反复使用的旧桌。' },
          { label: '油灯烟痕', detail: '灯罩周围微暗，提示昏黄灯火和简陋学习条件。' },
          { label: '课本折角', detail: '书页边缘卷起，保留流亡学生随身携带的使用痕迹。' }
        ]
      },
      'steering-cup': {
        material: '黑色方向盘、白搪瓷、红边剥落',
        features: [
          { label: '方向盘握痕', detail: '黑色表面有油亮磨损，像工人反复调试后的触感。' },
          { label: '搪瓷红边', detail: '杯口红边局部剥落，露出朴素日用品的真实年代感。' },
          { label: '工厂微尘', detail: '表面微粒和暗灰沉积，把车间空气带进展柜。' }
        ]
      },
      'cassette-ticket': {
        material: '塑料外壳、扬声器网孔、粉色车票纸',
        features: [
          { label: '扬声器网孔', detail: '密集圆孔和灰尘让收录机有了真实塑料时代的触感。' },
          { label: '磁带窗口', detail: '透明窗口里隐约可见磁带轴，带出八九十年代的声音记忆。' },
          { label: '车票折痕', detail: '粉色硬纸票面有折角和油墨偏移，像被揣在行李中一路南下。' }
        ]
      },
      'smartphone': {
        material: '玻璃划痕、指纹油膜、屏幕像素光',
        features: [
          { label: '玻璃划痕', detail: '黑色屏幕上有细碎擦痕，削弱全新产品的冰冷感。' },
          { label: '指纹油膜', detail: '触控区域有微弱指纹与手汗痕迹，连接到真实日常使用。' },
          { label: '应用网格', detail: '图标光点暗示移动互联网把生活压进一块屏幕。' }
        ]
      },
      'tea-screen': {
        material: '咖啡液面、绿色陶瓷釉、银黄色金属与屏幕蓝光',
        features: [
          { label: '咖啡与蒸汽', detail: '棕色咖啡液面带细微反光，半透明蒸汽自然上升。' },
          { label: '绿色陶瓷杯', detail: '杯壁、内壁、杯口和把手完整成形，釉面保留轻微手工不均。' },
          { label: '超薄笔记本', detail: '银黄色金属机身、黑色 QWERTY 键盘、接口与代码屏幕构成完整电脑结构。' }
        ]
      }
    };

    return common[variant] || {
      material: artifact?.materialProps?.color || '复合材质',
      features: [
        { label: '器形轮廓', detail: '主体比例与节点展品名称对应，保留可辨识的时代形制。' },
        { label: '表面肌理', detail: '粗糙度、磨损和色差被保留下来，避免过度光滑。' },
        { label: '使用痕迹', detail: '边缘与受力处加入暗色磨耗，让它更接近真实被使用过的物件。' }
      ]
    };
  }

  updateArtifactFeatures(featureData) {
    if (!this.artFeatureList) return;
    this.artFeatureList.innerHTML = '';
    featureData.features.forEach((feature, index) => {
      const item = document.createElement('div');
      item.className = 'art-feature-item';
      item.innerHTML = `<strong>${String(index + 1).padStart(2, '0')} · ${feature.label}</strong><span>${feature.detail}</span>`;
      this.artFeatureList.appendChild(item);
    });
  }

  updateArtifactReference(artifact, artifactVisual) {
    const imageKey = artifactVisual?.imageKey;
    if (!this.artReferenceImage || !imageKey) return;

    const requestId = ++this.artifactReferenceRequestId;
    this.artReferenceImage.style.visibility = 'hidden';
    this.artReferenceImage.removeAttribute('src');
    this.artReferenceImage.onload = () => {
      if (requestId !== this.artifactReferenceRequestId) return;
      this.artReferenceImage.style.visibility = 'visible';
    };
    this.artReferenceImage.onerror = () => {
      if (requestId !== this.artifactReferenceRequestId) return;
      this.artReferenceImage.removeAttribute('src');
      if (this.artReferenceCaption) this.artReferenceCaption.textContent = '参考图暂不可用，仍可查看 3D 纹理模型。';
    };
    this.artReferenceImage.src = `./images/${imageKey}.png`;
    this.artReferenceImage.alt = `${artifact.name}参考图`;
    this.artReferenceToggle?.removeAttribute('disabled');
    if (this.artReferenceCaption) {
      this.artReferenceCaption.textContent = `${artifact.name} · 参考实物图 / AI 纹理依据`;
    }
  }

  setArtifactReferenceMode(showReference) {
    this.artVisualStage?.classList.toggle('reference-visible', Boolean(showReference));
    this.artModelToggle?.classList.toggle('active', !showReference);
    this.artReferenceToggle?.classList.toggle('active', Boolean(showReference));
    requestAnimationFrame(() => this.renderer?.resizeArtifactViewer?.());
  }

  buildArtifactVoiceNarrative(artifact, featureData = this.getArtifactFeatureData(artifact)) {
    const lead = artifact.description
      .replace(/\n+/g, ' ')
      .split(/[。！？]/)
      .filter(Boolean)
      .slice(0, 2)
      .join('。');
    const humanLine = featureData.features?.[0]
      ? `请靠近看${featureData.features[0].label}，${featureData.features[0].detail}`
      : '请靠近看它的边缘，真正动人的地方，往往藏在磨损和细小痕迹里。';
    const materialLine = featureData.material ? `它的表面被处理成${featureData.material}的质感。` : '';

    return `${lead}。\n\n${materialLine}${humanLine} 这些细节提醒我们，它并不是一个孤零零的展品，而曾经和人的手、火、声音、道路或日常生活贴得很近。`;
  }

  toggleArtifactVoice() {
    const text = this.artVoiceBtn?.userData?.speechText;
    if (!text) return;

    if (this.currentSpeech) {
      this.stopSpeaking();
      this.artVoiceBtn.querySelector('.btn-text').textContent = '听讲解';
      this.artVoiceBtn.classList.remove('playing');
      return;
    }

    this.artVoiceBtn.querySelector('.btn-text').textContent = '讲解中...';
    this.artVoiceBtn.classList.add('playing');
    this.speakText(text, () => {
      this.artVoiceBtn.querySelector('.btn-text').textContent = '听讲解';
      this.artVoiceBtn.classList.remove('playing');
    }, { maxChars: 720, rate: 0.92, pitch: 1.02, volume: 0.95 });
  }

  drawNodeVisual(canvas, node, index) {
    if (!canvas || !node) return;

    if (node.id === 2) {
      this.drawShangNodeVisual(canvas, node);
      return;
    }

    if (node.id === 3) {
      this.drawZhouNodeVisual(canvas, node);
      return;
    }

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const artifact = node.artifacts?.[0];
    const visual = getVisualSpec(node);

    this.paintVisualBackground(ctx, width, height, node.color, node.fogColor);
    this.drawHistoricalScene(ctx, width, height, node, visual, index);
    this.drawPortraitCluster(ctx, node, visual, width, height);
    this.drawArtifactIcon(ctx, artifact?.geometry, width * 0.72, height * 0.55, height / 310, artifact?.materialProps?.color || node.color, node.color, visual);

  }

  drawShangNodeVisual(canvas, node) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#110b00');
    bg.addColorStop(0.5, '#21160a');
    bg.addColorStop(1, '#506354');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    this.drawNodeTitleBlock(ctx, node, width, height);

    const boneX = width * 0.48;
    const boneY = height * 0.18;
    const boneW = width * 0.17;
    const boneH = height * 0.55;
    this.drawOracleBonePanel(ctx, boneX, boneY, boneW, boneH, '#d4af37');

    ctx.save();
    ctx.translate(width * 0.76, height * 0.53);
    const s = height / 560;
    ctx.scale(s, s);
    ctx.fillStyle = '#506354';
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(0, 18, 70, 94, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -72, 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-42, -116);
    ctx.lineTo(-16, -162);
    ctx.lineTo(-2, -112);
    ctx.moveTo(42, -116);
    ctx.lineTo(16, -162);
    ctx.lineTo(2, -112);
    ctx.stroke();
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.arc(-22, -74, 10, 0, Math.PI * 2);
    ctx.arc(22, -74, 10, 0, Math.PI * 2);
    ctx.fill();
    this.drawTaotieMask(ctx, 0, 22, 0.72, '#111915');
    ctx.restore();

    this.drawHumanPortrait(ctx, node.characters[0], getVisualSpec(node).portrait, width * 0.23, height * 0.62, height / 520, node.color);
  }

  drawZhouNodeVisual(canvas, node) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#0f0c05');
    bg.addColorStop(0.52, '#201704');
    bg.addColorStop(1, '#3d473b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < 7; i++) {
      this.drawBellGlyph(ctx, width * (0.45 + i * 0.065), height * (0.24 + (i % 2) * 0.08), height / 520, '#b8860b');
    }

    ctx.save();
    ctx.translate(width * 0.72, height * 0.56);
    const s = height / 560;
    ctx.scale(s, s);
    ctx.fillStyle = '#3d473b';
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(0, -58, 84, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-72, -58, 144, 116);
    ctx.beginPath();
    ctx.ellipse(0, 58, 72, 24, 0, 0, Math.PI);
    ctx.stroke();
    this.drawTaotieMask(ctx, 0, -2, 0.78, '#111915');
    this.drawOracleGlyphs(ctx, -44, -38, 0.72, 'rgba(212, 175, 55, 0.82)');
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 48, 58);
      ctx.lineTo(i * 58, 128);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(-86, -48, 26, Math.PI * 0.45, Math.PI * 1.55);
    ctx.arc(86, -48, 26, Math.PI * 1.45, Math.PI * 0.55, true);
    ctx.stroke();
    ctx.restore();

    this.drawHumanPortrait(ctx, node.characters[0], getVisualSpec(node).portrait, width * 0.23, height * 0.62, height / 520, node.color);
  }

  drawShangOracleGallery(canvas, node) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#efd39f');
    bg.addColorStop(0.58, '#9b642e');
    bg.addColorStop(1, '#221005');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    this.drawGalleryGrain(ctx, width, height, 'rgba(67, 36, 12, 0.18)');

    ctx.save();
    ctx.fillStyle = 'rgba(55, 29, 12, 0.36)';
    ctx.fillRect(0, height * 0.76, width, height * 0.24);
    ctx.restore();

    this.drawGalleryLabel(ctx, '甲骨铭文', '殷商问卜 · 龟甲灼裂与竖列刻辞', 40, 36, '#6d3a14', '#f7e2b3');

    const boneX = width * 0.09;
    const boneY = height * 0.15;
    const boneW = width * 0.61;
    const boneH = height * 0.69;
    this.drawOracleBoneSurface(ctx, boneX, boneY, boneW, boneH);

    const columnXs = [0.23, 0.32, 0.42, 0.53, 0.64, 0.74];
    columnXs.forEach((ratio, index) => {
      this.drawOracleInscriptionColumn(
        ctx,
        boneX + boneW * ratio,
        boneY + boneH * (0.2 + (index % 2) * 0.03),
        height / 950,
        6,
        'rgba(51, 27, 11, 0.9)'
      );
    });

    const burnMarks = [
      [0.18, 0.27, 1.1],
      [0.48, 0.33, 0.9],
      [0.68, 0.52, 1],
      [0.34, 0.66, 0.85],
      [0.57, 0.76, 0.72]
    ];
    burnMarks.forEach(([x, y, s]) => {
      this.drawBurnCrack(ctx, boneX + boneW * x, boneY + boneH * y, (height / 540) * s);
    });

    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = 'rgba(17, 9, 4, 0.5)';
    ctx.fillRect(width * 0.75, height * 0.18, width * 0.18, height * 0.58);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.28)';
    ctx.lineWidth = 2;
    ctx.strokeRect(width * 0.75, height * 0.18, width * 0.18, height * 0.58);
    ctx.restore();

    ctx.save();
    ctx.translate(width * 0.84, height * 0.53);
    const visual = getVisualSpec(node);
    this.drawHumanPortrait(ctx, node.characters[0], visual.portrait, 0, 48, 0.46, '#d4af37');
    ctx.restore();
    this.drawGalleryTag(ctx, '妇好与青铜', width * 0.76, height * 0.78, '#d4af37');
  }

  drawShangBronzeGallery(canvas, node) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const bg = ctx.createRadialGradient(width * 0.5, height * 0.46, 80, width * 0.5, height * 0.5, width * 0.72);
    bg.addColorStop(0, '#6f7f6d');
    bg.addColorStop(0.46, '#27362d');
    bg.addColorStop(1, '#090604');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    this.drawGalleryGrain(ctx, width, height, 'rgba(212, 175, 55, 0.12)');

    this.drawGalleryLabel(ctx, '妇好鸮尊', '商代青铜器 · 鸮形、饕餮纹与羽纹细节', 40, 36, '#d4af37', '#151b16');

    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 0.55, height * (0.16 + i * 0.035), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    this.drawOwlZunFigure(ctx, width * 0.5, height * 0.54, height / 455);

    ctx.save();
    ctx.globalAlpha = 0.9;
    this.drawOracleBoneSurface(ctx, width * 0.075, height * 0.28, width * 0.18, height * 0.43);
    this.drawOracleInscriptionColumn(ctx, width * 0.15, height * 0.36, height / 1150, 4, 'rgba(43, 23, 10, 0.88)');
    this.drawGalleryTag(ctx, '甲骨刻辞', width * 0.085, height * 0.74, '#efd39f');
    ctx.restore();

    ctx.save();
    ctx.translate(width * 0.82, height * 0.52);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.82)';
    ctx.fillStyle = 'rgba(8, 13, 10, 0.55)';
    ctx.lineWidth = 5;
    ctx.fillRect(-94, -128, 188, 256);
    ctx.strokeRect(-94, -128, 188, 256);
    this.drawTaotieMask(ctx, 0, -24, 0.86, 'rgba(212, 175, 55, 0.76)');
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.moveTo(side * 18, 28 + i * 16);
        ctx.quadraticCurveTo(side * 52, 16 + i * 18, side * 76, 34 + i * 18);
        ctx.stroke();
      }
    }
    ctx.restore();
    this.drawGalleryTag(ctx, '饕餮与羽纹', width * 0.745, height * 0.74, '#d4af37');
  }

  drawZhouDingGallery(canvas, node) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#15110a');
    bg.addColorStop(0.5, '#303a31');
    bg.addColorStop(1, '#0c0904');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    this.drawGalleryGrain(ctx, width, height, 'rgba(184, 134, 11, 0.12)');

    this.drawGalleryLabel(ctx, '大克鼎', '西周礼器 · 大克鼎器形与内壁铭文', 40, 36, '#d4af37', '#151b16');

    ctx.save();
    ctx.fillStyle = 'rgba(184, 134, 11, 0.1)';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(width * (0.08 + i * 0.2), height * 0.18, width * 0.08, height * 0.68);
    }
    ctx.restore();

    this.drawBronzeDingFigure(ctx, width * 0.48, height * 0.56, height / 420, true);

    ctx.save();
    ctx.fillStyle = 'rgba(10, 8, 5, 0.72)';
    ctx.strokeStyle = 'rgba(184, 134, 11, 0.65)';
    ctx.lineWidth = 4;
    ctx.fillRect(width * 0.72, height * 0.23, width * 0.18, height * 0.48);
    ctx.strokeRect(width * 0.72, height * 0.23, width * 0.18, height * 0.48);
    for (let col = 0; col < 4; col++) {
      this.drawBronzeInscriptionColumn(
        ctx,
        width * (0.75 + col * 0.038),
        height * 0.31,
        height / 1050,
        5,
        'rgba(212, 175, 55, 0.88)'
      );
    }
    ctx.restore();

    ctx.save();
    ctx.translate(width * 0.81, height * 0.51);
    const visual = getVisualSpec(node);
    this.drawHumanPortrait(ctx, node.characters[0], visual.portrait, 0, 48, 0.46, '#d4af37');
    ctx.restore();
    this.drawGalleryTag(ctx, '周公旦', width * 0.72, height * 0.74, '#d4af37');
  }

  drawZhouMusicGallery(canvas, node) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#2a1608');
    bg.addColorStop(0.42, '#623c13');
    bg.addColorStop(1, '#0a0502');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    this.drawGalleryGrain(ctx, width, height, 'rgba(244, 211, 122, 0.12)');

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = '#f4d37a';
    ctx.lineWidth = 5;
    for (let ring = 0; ring < 8; ring++) {
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 0.48, height * (0.12 + ring * 0.052), Math.PI * 0.08, Math.PI * 0.92);
      ctx.stroke();
    }
    ctx.restore();

    this.drawBellRackFigure(ctx, width * 0.5, height * 0.5, height / 500);

    ctx.save();
    ctx.strokeStyle = 'rgba(244, 211, 122, 0.68)';
    ctx.lineWidth = 4;
    for (let i = 0; i < 6; i++) {
      const y = height * (0.73 + i * 0.025);
      ctx.beginPath();
      ctx.moveTo(width * 0.1, y);
      ctx.bezierCurveTo(width * 0.3, y - 66, width * 0.52, y + 52, width * 0.9, y - 44);
      ctx.stroke();
    }
    ctx.restore();

  }

  drawGalleryLabel(ctx, title, subtitle, x, y, accent, panel) {
    ctx.save();
    ctx.fillStyle = panel;
    ctx.globalAlpha = 0.92;
    ctx.fillRect(x, y, 462, 94);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 462, 94);
    ctx.fillStyle = accent === '#6d3a14' ? '#3d1d08' : 'rgba(255, 255, 255, 0.96)';
    ctx.font = '600 30px "Noto Serif SC", serif';
    ctx.fillText(title, x + 22, y + 38);
    ctx.font = '17px "Noto Serif SC", serif';
    ctx.fillStyle = accent === '#6d3a14' ? 'rgba(74, 41, 18, 0.9)' : accent;
    ctx.fillText(subtitle, x + 22, y + 68);
    ctx.restore();
  }

  drawGalleryTag(ctx, text, x, y, color) {
    ctx.save();
    ctx.font = '600 18px "Noto Serif SC", serif';
    const width = ctx.measureText(text).width + 34;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
    ctx.fillRect(x, y, width, 34);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, width, 34);
    ctx.fillStyle = color;
    ctx.fillText(text, x + 16, y + 23);
    ctx.restore();
  }

  drawGalleryGrain(ctx, width, height, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    for (let i = 0; i < 80; i++) {
      const x = (i * 149) % width;
      const y = (i * 83) % height;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 42, y - 18, x + 88, y + 24, x + 138, y + 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawOracleBoneSurface(ctx, x, y, w, h) {
    ctx.save();
    const boneGradient = ctx.createLinearGradient(x, y, x + w, y + h);
    boneGradient.addColorStop(0, '#f3d9a5');
    boneGradient.addColorStop(0.52, '#d7ad70');
    boneGradient.addColorStop(1, '#9b6632');
    ctx.fillStyle = boneGradient;
    ctx.strokeStyle = 'rgba(76, 42, 17, 0.88)';
    ctx.lineWidth = Math.max(3, w * 0.012);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.2, y + h * 0.02);
    ctx.quadraticCurveTo(x + w * 0.56, y - h * 0.02, x + w * 0.82, y + h * 0.14);
    ctx.quadraticCurveTo(x + w * 0.97, y + h * 0.44, x + w * 0.82, y + h * 0.94);
    ctx.quadraticCurveTo(x + w * 0.46, y + h * 1.03, x + w * 0.12, y + h * 0.86);
    ctx.quadraticCurveTo(x - w * 0.03, y + h * 0.42, x + w * 0.2, y + h * 0.02);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(113, 70, 28, 0.38)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, y + h * 0.08);
    ctx.lineTo(x + w * 0.49, y + h * 0.9);
    ctx.stroke();
    for (let i = 1; i <= 5; i++) {
      const yy = y + h * (0.14 + i * 0.13);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.18, yy);
      ctx.quadraticCurveTo(x + w * 0.5, yy - h * 0.04, x + w * 0.8, yy + h * 0.02);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawOracleInscriptionColumn(ctx, x, y, scale, rows, color) {
    for (let row = 0; row < rows; row++) {
      this.drawOracleSign(ctx, x, y + row * 58 * scale, scale, (row + Math.floor(x)) % 5, color);
    }
  }

  drawOracleSign(ctx, x, y, scale, type, color) {
    const signs = [
      [[0, 0, 18, 18], [18, 18, 0, 38], [18, 18, 42, 22], [21, 20, 22, 48]],
      [[8, 0, 32, 0], [20, 0, 20, 42], [4, 22, 36, 22], [8, 42, 32, 42]],
      [[4, 4, 36, 4], [4, 4, 18, 34], [36, 4, 22, 34], [10, 34, 30, 34]],
      [[20, 0, 6, 18], [20, 0, 34, 18], [6, 18, 20, 38], [34, 18, 20, 38], [8, 48, 34, 48]],
      [[4, 12, 22, 0], [22, 0, 40, 12], [22, 0, 22, 46], [8, 28, 36, 28], [10, 46, 34, 46]]
    ];

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    signs[type % signs.length].forEach(([x1, y1, x2, y2]) => {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    });
    ctx.stroke();
    ctx.restore();
  }

  drawBronzeInscriptionColumn(ctx, x, y, scale, rows, color) {
    for (let row = 0; row < rows; row++) {
      this.drawBronzeInscriptionSign(ctx, x, y + row * 50 * scale, scale, (row + Math.floor(x)) % 4, color);
    }
  }

  drawBronzeInscriptionSign(ctx, x, y, scale, type, color) {
    const signs = [
      [[2, 0, 34, 0], [18, 0, 18, 38], [4, 20, 32, 20], [6, 38, 30, 38]],
      [[4, 4, 34, 4], [4, 4, 4, 36], [34, 4, 34, 36], [4, 36, 34, 36], [12, 18, 26, 18]],
      [[18, 0, 4, 16], [18, 0, 34, 16], [4, 16, 18, 36], [34, 16, 18, 36], [8, 44, 30, 44]],
      [[2, 12, 36, 12], [10, 0, 10, 36], [28, 0, 28, 36], [2, 36, 36, 36]]
    ];

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    signs[type % signs.length].forEach(([x1, y1, x2, y2]) => {
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
    });
    ctx.stroke();
    ctx.restore();
  }

  drawBurnCrack(ctx, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(45, 21, 8, 0.72)';
    ctx.strokeStyle = 'rgba(61, 28, 10, 0.72)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 18, 0.35, 0, Math.PI * 2);
    ctx.fill();
    const cracks = [
      [0, -10, -38, -44],
      [4, -2, 42, -22],
      [-3, 8, -32, 32],
      [4, 10, 26, 46]
    ];
    cracks.forEach(([x1, y1, x2, y2]) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2 * 0.55, y2 * 0.55);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });
    ctx.restore();
  }

  drawOwlZunFigure(ctx, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    const bronze = '#506354';
    const dark = '#1a241e';
    const gold = '#d4af37';

    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.beginPath();
    ctx.ellipse(0, 174, 132, 30, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = bronze;
    ctx.strokeStyle = gold;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(0, 50, 92, 134, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = dark;
    for (let side = -1; side <= 1; side += 2) {
      ctx.beginPath();
      ctx.moveTo(side * 48, -112);
      ctx.lineTo(side * 18, -178);
      ctx.lineTo(side * 4, -108);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = bronze;
    ctx.beginPath();
    ctx.ellipse(0, -78, 76, 68, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    for (let side = -1; side <= 1; side += 2) {
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(side * 54, -10);
      ctx.quadraticCurveTo(side * 106, 20, side * 104, 108);
      ctx.quadraticCurveTo(side * 72, 88, side * 48, 32);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = gold;
      ctx.lineWidth = 4;
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.moveTo(side * 42, 0 + i * 18);
        ctx.quadraticCurveTo(side * 72, 14 + i * 16, side * 96, 28 + i * 15);
        ctx.stroke();
      }

      ctx.fillStyle = gold;
      ctx.beginPath();
      ctx.arc(side * 28, -82, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(side * 28, -82, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = dark;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(side * 32, 156);
      ctx.lineTo(side * 42, 204);
      ctx.stroke();
    }

    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.moveTo(0, -64);
    ctx.lineTo(-14, -42);
    ctx.lineTo(14, -42);
    ctx.closePath();
    ctx.fill();

    this.drawTaotieMask(ctx, 0, 48, 0.78, 'rgba(12, 17, 14, 0.78)');

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.68)';
    ctx.lineWidth = 4;
    for (let col = -2; col <= 2; col++) {
      ctx.beginPath();
      ctx.moveTo(col * 24, 10);
      ctx.lineTo(col * 18, 126);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBronzeDingFigure(ctx, x, y, scale, showInscription = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    const bronze = '#3d473b';
    const dark = '#121a16';
    const gold = '#d4af37';

    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.beginPath();
    ctx.ellipse(0, 168, 180, 34, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = gold;
    ctx.lineWidth = 7;
    for (let side = -1; side <= 1; side += 2) {
      const start = side < 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
      const end = side < 0 ? Math.PI * 0.5 : Math.PI * 1.5;
      ctx.beginPath();
      ctx.arc(side * 126, -94, 42, start, end);
      ctx.stroke();
    }

    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(0, -104, 132, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = bronze;
    ctx.beginPath();
    ctx.moveTo(-122, -102);
    ctx.lineTo(122, -102);
    ctx.lineTo(96, 72);
    ctx.quadraticCurveTo(0, 104, -96, 72);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1f2b24';
    ctx.fillRect(-108, -52, 216, 52);
    ctx.strokeRect(-108, -52, 216, 52);
    this.drawTaotieMask(ctx, 0, -28, 1.0, 'rgba(212, 175, 55, 0.74)');

    if (showInscription) {
      ctx.save();
      ctx.fillStyle = 'rgba(8, 11, 9, 0.5)';
      ctx.fillRect(-70, 8, 140, 58);
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.62)';
      ctx.strokeRect(-70, 8, 140, 58);
      for (let col = 0; col < 5; col++) {
        this.drawBronzeInscriptionColumn(ctx, -56 + col * 26, 18, 0.48, 2, 'rgba(212, 175, 55, 0.9)');
      }
      ctx.restore();
    }

    ctx.strokeStyle = gold;
    ctx.lineWidth = 9;
    [-1, 0, 1].forEach((i) => {
      ctx.beginPath();
      ctx.moveTo(i * 64, 78);
      ctx.lineTo(i * 78, 174);
      ctx.stroke();
    });
    ctx.restore();
  }

  drawBellRackFigure(ctx, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    const wood = '#3a1f0f';
    const gold = '#d4af37';
    ctx.strokeStyle = wood;
    ctx.lineWidth = 16;
    ctx.strokeRect(-330, -170, 660, 342);
    ctx.beginPath();
    ctx.moveTo(-330, -10);
    ctx.lineTo(330, -10);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(244, 211, 122, 0.62)';
    ctx.lineWidth = 4;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 92, -180);
      ctx.lineTo(i * 82, 174);
      ctx.stroke();
    }

    for (let row = 0; row < 2; row++) {
      const count = row === 0 ? 7 : 6;
      for (let i = 0; i < count; i++) {
        const bellX = -240 + i * 80 + row * 40;
        const bellY = row === 0 ? -88 : 76;
        const bellScale = 0.7 + row * 0.12 + i * 0.025;
        this.drawRitualBell(ctx, bellX, bellY, bellScale, gold);
      }
    }

    ctx.strokeStyle = wood;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(268, 168);
    ctx.lineTo(348, 108);
    ctx.stroke();
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(354, 104, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  drawRitualBell(ctx, x, y, scale, accent) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = accent;
    ctx.fillStyle = '#4f4a38';
    ctx.lineWidth = 4;

    ctx.beginPath();
    ctx.moveTo(0, -72);
    ctx.lineTo(0, -46);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-22, -46);
    ctx.lineTo(22, -46);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-34, -42);
    ctx.quadraticCurveTo(0, -58, 34, -42);
    ctx.lineTo(48, 58);
    ctx.quadraticCurveTo(0, 78, -48, 58);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(244, 211, 122, 0.76)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -34);
    ctx.lineTo(0, 66);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const yy = -16 + i * 24;
      ctx.beginPath();
      ctx.moveTo(-30, yy);
      ctx.quadraticCurveTo(0, yy + 12, 30, yy);
      ctx.stroke();
      for (let side = -1; side <= 1; side += 2) {
        ctx.beginPath();
        ctx.arc(side * 18, yy + 4, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  paintGalleryBase(ctx, width, height, start, end) {
    ctx.clearRect(0, 0, width, height);
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, start);
    bg.addColorStop(0.52, '#111115');
    bg.addColorStop(1, end);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let x = -height; x < width; x += 56) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + height * 0.48, height);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawGalleryHeader(ctx, node, title) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.58)';
    ctx.fillRect(28, 28, 430, 118);
    ctx.strokeStyle = 'rgba(212,175,55,0.35)';
    ctx.strokeRect(28, 28, 430, 118);
    ctx.fillStyle = 'rgba(255,255,255,0.94)';
    ctx.font = '600 34px "Noto Serif SC", serif';
    ctx.fillText(title, 48, 78);
    ctx.font = '17px "Noto Serif SC", serif';
    ctx.fillStyle = 'rgba(212, 175, 55, 0.95)';
    ctx.fillText(`${node.name} · ${node.theme}`, 50, 116);
    ctx.restore();
  }

  drawNodeTitleBlock(ctx, node, width, height) {
    return;
  }

  drawNodeVisualFallback(canvas, node) {
    if (!canvas || !node) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    this.paintVisualBackground(ctx, width, height, node.color, node.fogColor);
    this.drawNodeTitleBlock(ctx, node, width, height);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
    ctx.font = '24px "Noto Serif SC", serif';
    ctx.fillText(node.artifacts?.[0]?.name || '节点展品', width * 0.48, height * 0.5);
  }

  drawArtifactPoster(canvas, artifact, node) {
    if (!canvas || !artifact) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const visual = getVisualSpec(node);
    const accent = node?.color || '#d4af37';
    const bg = node?.fogColor || '#050508';

    const drawLabels = () => {
      ctx.save();
      ctx.fillStyle = 'rgba(6, 6, 10, 0.58)';
      ctx.fillRect(34, height - 176, width - 68, 130);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.strokeRect(34, height - 176, width - 68, 130);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.font = '500 34px "Noto Serif SC", serif';
      this.drawWrappedText(ctx, artifact.name, 56, height - 126, width - 112, 42, 2);
      ctx.font = '18px "Noto Serif SC", serif';
      ctx.fillStyle = 'rgba(212, 175, 55, 0.95)';
      ctx.fillText(artifact.era, 58, height - 60);
      ctx.restore();
    };

    const drawBasePoster = () => {
      this.paintVisualBackground(ctx, width, height, accent, bg);
      this.drawHistoricalScene(ctx, width, height, node, visual, node?.id || 0);
      this.drawArtifactIcon(ctx, artifact.geometry, width * 0.5, height * 0.42, 2.55, artifact.materialProps?.color || accent, accent, visual);
      drawLabels();
    };

    drawBasePoster();

    const imageKey = visual?.artifact?.imageKey;
    if (!imageKey) return;

    const img = new Image();
    img.src = `./images/${imageKey}.png`;
    img.onload = () => {
      ctx.clearRect(0, 0, width, height);
      this.paintVisualBackground(ctx, width, height, accent, bg);

      const scale = Math.max(width / img.width, height / img.height);
      const drawWidth = img.width * scale;
      const drawHeight = img.height * scale;
      const x = (width - drawWidth) / 2;
      const y = (height - drawHeight) / 2;
      ctx.drawImage(img, x, y, drawWidth, drawHeight);

      ctx.save();
      ctx.fillStyle = 'rgba(2, 2, 6, 0.18)';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      drawLabels();
    };
  }

  paintVisualBackground(ctx, width, height, accent, bg) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, bg || '#050508');
    gradient.addColorStop(0.48, '#101016');
    gradient.addColorStop(1, accent || '#d4af37');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (let x = -height; x < width; x += 54) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + height * 0.48, height);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = accent || '#d4af37';
    for (let i = 0; i < 14; i++) {
      const x = (i * 173) % width;
      const y = (i * 89) % height;
      ctx.beginPath();
      ctx.arc(x, y, 18 + (i % 4) * 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawHistoricalScene(ctx, width, height, node, visual, index) {
    const accent = node.color || '#d4af37';
    const ground = height * 0.78;

    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fillRect(0, ground, width, height - ground);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, ground);
    ctx.lineTo(width, ground - 18);
    ctx.stroke();

    const drawBoat = (x, y, s = 1) => {
      ctx.beginPath();
      ctx.moveTo(x - 64 * s, y);
      ctx.quadraticCurveTo(x, y + 28 * s, x + 76 * s, y);
      ctx.lineTo(x + 52 * s, y + 22 * s);
      ctx.lineTo(x - 46 * s, y + 22 * s);
      ctx.closePath();
      ctx.fillStyle = 'rgba(98, 61, 38, 0.85)';
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.fillRect(x - 12 * s, y - 44 * s, 24 * s, 44 * s);
    };

    const drawMountains = () => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        const x = width * (0.06 + i * 0.24);
        ctx.moveTo(x, ground);
        ctx.lineTo(x + width * 0.16, height * (0.26 + (i % 2) * 0.06));
        ctx.lineTo(x + width * 0.34, ground);
        ctx.closePath();
        ctx.fill();
      }
    };

    switch (visual.scene) {
      case 'fire-village':
        drawMountains();
        this.drawFlame(ctx, width * 0.48, ground - 34, height * 0.24);
        this.drawFishFaceMotif(ctx, width * 0.82, height * 0.28, height / 520, 'rgba(0,0,0,0.34)', 'rgba(230,92,0,0.55)');
        break;
      case 'jade-city':
        ctx.strokeStyle = 'rgba(194, 212, 190, 0.22)';
        for (let i = 0; i < 6; i++) {
          ctx.strokeRect(width * 0.46 + i * 28, ground - 84 + i * 6, width * 0.24, 34);
        }
        this.drawTaotieMask(ctx, width * 0.76, height * 0.3, height / 620, 'rgba(194, 212, 190, 0.55)');
        break;
      case 'oracle-bronze':
        this.drawOracleBonePanel(ctx, width * 0.47, height * 0.16, width * 0.18, height * 0.5, accent);
        this.drawTaotieMask(ctx, width * 0.82, height * 0.34, height / 540, 'rgba(80, 99, 84, 0.72)');
        break;
      case 'ritual-order':
        for (let i = 0; i < 5; i++) {
          this.drawBellGlyph(ctx, width * (0.48 + i * 0.08), ground - 86 + i * 7, height / 650, accent);
        }
        this.drawTaotieMask(ctx, width * 0.78, height * 0.34, height / 620, 'rgba(184, 134, 11, 0.5)');
        break;
      case 'hundred-schools':
        ctx.strokeStyle = 'rgba(232, 213, 173, 0.42)';
        ctx.lineWidth = 9;
        for (let i = 0; i < 9; i++) {
          const x = width * 0.48 + i * 22;
          ctx.beginPath();
          ctx.moveTo(x, height * 0.2);
          ctx.lineTo(x, ground - 30);
          ctx.stroke();
        }
        this.drawBellGlyph(ctx, width * 0.82, height * 0.32, height / 560, accent);
        break;
      case 'qin-army':
        for (let row = 0; row < 4; row++) {
          for (let col = 0; col < 8; col++) {
            this.drawTinySoldier(ctx, width * 0.42 + col * 34, ground - 120 + row * 30, 0.55, '#615b57');
          }
        }
        break;
      case 'silk-road':
        ctx.fillStyle = 'rgba(214, 171, 85, 0.22)';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.ellipse(width * (0.48 + i * 0.13), ground - 18 + i * 4, width * 0.16, height * 0.07, -0.08, 0, Math.PI * 2);
          ctx.fill();
        }
        this.drawCamelSilhouette(ctx, width * 0.68, ground - 54, height / 470, accent);
        break;
      case 'bamboo-lanting':
        drawMountains();
        ctx.strokeStyle = 'rgba(104, 151, 116, 0.55)';
        ctx.lineWidth = 8;
        for (let i = 0; i < 7; i++) {
          const x = width * 0.46 + i * 30;
          ctx.beginPath();
          ctx.moveTo(x, ground);
          ctx.lineTo(x + 14, height * 0.18);
          ctx.stroke();
        }
        this.drawScrollSheet(ctx, width * 0.72, height * 0.28, width * 0.22, height * 0.18, 'running-script');
        break;
      case 'grotto':
        ctx.fillStyle = 'rgba(110, 110, 102, 0.34)';
        ctx.beginPath();
        ctx.ellipse(width * 0.66, ground - 54, width * 0.24, height * 0.5, 0, Math.PI, 0);
        ctx.fill();
        this.drawBuddhaSilhouette(ctx, width * 0.66, ground - 84, height / 520, accent);
        break;
      case 'grand-canal':
        ctx.fillStyle = 'rgba(64, 224, 208, 0.22)';
        ctx.fillRect(width * 0.38, ground - 82, width * 0.62, 96);
        drawBoat(width * 0.67, ground - 68, height / 500);
        ctx.strokeStyle = 'rgba(220, 220, 220, 0.55)';
        ctx.beginPath();
        ctx.moveTo(width * 0.44, ground - 48);
        ctx.quadraticCurveTo(width * 0.34, ground - 66, width * 0.28, ground - 108);
        ctx.stroke();
        break;
      case 'tang-changan':
        ctx.fillStyle = 'rgba(255, 140, 0, 0.18)';
        for (let i = 0; i < 5; i++) ctx.fillRect(width * 0.46 + i * 70, ground - 92 - (i % 2) * 18, 52, 92 + (i % 2) * 18);
        this.drawCamelSilhouette(ctx, width * 0.72, ground - 40, height / 470, accent);
        break;
      case 'middle-tang':
        drawMountains();
        this.drawRingedStaffIcon(ctx, width * 0.72, ground - 95, height / 520, accent);
        this.drawScrollSheet(ctx, width * 0.52, height * 0.32, width * 0.2, height * 0.18, 'poem');
        break;
      case 'song-civic':
      case 'qingming-city':
        ctx.strokeStyle = 'rgba(235, 217, 192, 0.48)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(width * 0.62, ground - 16, width * 0.14, Math.PI, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 5; i++) ctx.strokeRect(width * 0.46 + i * 58, ground - 118, 42, 76);
        drawBoat(width * 0.82, ground - 38, height / 560);
        break;
      case 'southern-song-war':
        drawMountains();
        this.drawCrossbowIcon(ctx, width * 0.72, ground - 80, height / 560, '#1a1612', accent);
        break;
      case 'yuan-opera':
        ctx.fillStyle = 'rgba(80, 40, 88, 0.42)';
        ctx.fillRect(width * 0.48, ground - 126, width * 0.26, 110);
        this.drawOperaMask(ctx, width * 0.62, ground - 82, height / 540, accent);
        this.drawBlueWhiteMotif(ctx, width * 0.82, height * 0.34, height / 500);
        break;
      case 'ming-voyage':
        drawBoat(width * 0.72, ground - 58, height / 430);
        this.drawScrollSheet(ctx, width * 0.46, height * 0.22, width * 0.2, height * 0.18, 'map');
        break;
      case 'late-ming-garden':
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(width * 0.58, ground - 62, height * 0.16, 0, Math.PI * 2);
        ctx.stroke();
        this.drawOperaMask(ctx, width * 0.78, ground - 80, height / 540, accent);
        break;
      case 'qing-archive':
        ctx.fillStyle = 'rgba(90, 67, 35, 0.42)';
        for (let row = 0; row < 3; row++) {
          for (let col = 0; col < 7; col++) ctx.fillRect(width * 0.44 + col * 42, height * 0.22 + row * 58, 30, 46);
        }
        break;
      case 'late-qing-reform':
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = 3;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(width * 0.42, ground - i * 18);
          ctx.bezierCurveTo(width * 0.56, ground - 54 - i * 12, width * 0.72, ground + 12, width * 0.94, ground - 42 - i * 8);
          ctx.stroke();
        }
        this.drawScrollSheet(ctx, width * 0.55, height * 0.26, width * 0.2, height * 0.2, 'typeset');
        break;
      case 'new-culture':
        this.drawScrollSheet(ctx, width * 0.56, height * 0.22, width * 0.22, height * 0.26, 'magazine');
        ctx.strokeStyle = accent;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(width * 0.78, height * 0.18);
        ctx.lineTo(width * 0.9, ground - 38);
        ctx.stroke();
        break;
      case 'wartime-campus':
        ctx.fillStyle = 'rgba(120, 100, 76, 0.48)';
        ctx.beginPath();
        ctx.moveTo(width * 0.46, ground - 62);
        ctx.lineTo(width * 0.62, ground - 142);
        ctx.lineTo(width * 0.78, ground - 62);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(width * 0.48, ground - 62, width * 0.28, 66);
        this.drawLampIcon(ctx, width * 0.82, ground - 86, height / 600, accent);
        break;
      case 'new-china-industry':
        ctx.fillStyle = 'rgba(231, 76, 60, 0.28)';
        for (let i = 0; i < 4; i++) ctx.fillRect(width * 0.45 + i * 70, ground - 130 + i * 14, 36, 130 - i * 14);
        this.drawSteeringCupIcon(ctx, width * 0.74, ground - 72, height / 520, accent);
        break;
      case 'reform-factory':
        ctx.strokeStyle = 'rgba(46, 204, 113, 0.48)';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(width * 0.42, ground - 42);
        ctx.lineTo(width * 0.92, ground - 42);
        ctx.stroke();
        this.drawRecorderIcon(ctx, width * 0.68, ground - 95, height / 520, accent);
        break;
      case 'digital-network':
        ctx.strokeStyle = 'rgba(52, 152, 219, 0.42)';
        ctx.fillStyle = 'rgba(52, 152, 219, 0.5)';
        for (let i = 0; i < 16; i++) {
          const x = width * (0.42 + ((i * 73) % 48) / 100);
          const y = height * (0.18 + ((i * 41) % 48) / 100);
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fill();
          if (i > 0) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(width * (0.42 + (((i - 1) * 73) % 48) / 100), height * (0.18 + (((i - 1) * 41) % 48) / 100));
            ctx.stroke();
          }
        }
        break;
      case 'present-desk':
        this.drawTeaScreenIcon(ctx, width * 0.66, ground - 90, height / 520, accent);
        break;
      default:
        drawMountains();
        break;
    }
    ctx.restore();
  }

  drawPortraitCluster(ctx, node, visual, width, height) {
    const primary = node.characters?.[0];
    const secondary = node.characters?.[1];
    if (!primary) return;

    const baseScale = height / 520;
    this.drawHumanPortrait(ctx, primary, visual.portrait, width * 0.23, height * 0.58, baseScale, node.color);

    if (secondary) {
      const secondarySpec = {
        ...visual.portrait,
        headwear: secondary.name.includes('阿利斯') ? 'turban' : 'scholar-cap',
        robe: secondary.name.includes('艺人') ? '#8a3a54' : '#735133',
        prop: secondary.name.includes('艺人') ? 'opera-mask' : 'trade-bag',
        mood: 'companion'
      };
      this.drawHumanPortrait(ctx, secondary, secondarySpec, width * 0.34, height * 0.63, baseScale * 0.78, node.color, true);
    }
  }

  drawHumanPortrait(ctx, character, portrait, x, y, scale, accent, muted = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = muted ? 0.76 : 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const robe = portrait?.robe || '#5f4934';
    const face = portrait?.headwear === 'monk' ? '#cfa57e' : '#d8b08a';
    const shadow = muted ? 'rgba(0, 0, 0, 0.32)' : 'rgba(0, 0, 0, 0.46)';

    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(0, 116, 82, 18, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = robe;
    ctx.beginPath();
    ctx.moveTo(-64, 124);
    ctx.quadraticCurveTo(-46, 18, 0, 6);
    ctx.quadraticCurveTo(46, 18, 64, 124);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 5;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 18, 24);
      ctx.lineTo(i * 28, 116);
      ctx.stroke();
    }

    if (portrait?.mood?.includes('warrior') || portrait?.mood === 'soldier' || portrait?.mood === 'patriot') {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 4;
      for (let i = 0; i < 5; i++) {
        ctx.strokeRect(-44 + i * 18, 44, 12, 20);
      }
    }

    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.ellipse(0, -28, 35, 45, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(60, 42, 30, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-15, -34);
    ctx.lineTo(-4, -32);
    ctx.moveTo(15, -34);
    ctx.lineTo(4, -32);
    ctx.stroke();

    if (portrait?.headwear === 'glasses') {
      ctx.strokeStyle = '#101820';
      ctx.lineWidth = 3;
      ctx.strokeRect(-22, -38, 16, 12);
      ctx.strokeRect(6, -38, 16, 12);
      ctx.beginPath();
      ctx.moveTo(-6, -32);
      ctx.lineTo(6, -32);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(90, 54, 40, 0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.lineTo(-4, -12);
    ctx.moveTo(-10, 5);
    ctx.quadraticCurveTo(0, 12, 12, 4);
    ctx.stroke();

    this.drawHeadwear(ctx, portrait?.headwear, accent);
    this.drawPortraitProp(ctx, portrait?.prop, accent);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.font = '500 22px "Noto Serif SC", serif';
    ctx.textAlign = 'center';
    ctx.fillText(character.name, 0, 158);
    ctx.font = '14px "Noto Serif SC", serif';
    ctx.fillStyle = 'rgba(230, 210, 170, 0.86)';
    ctx.fillText(character.role, 0, 181);
    ctx.restore();
  }

  drawHeadwear(ctx, headwear, accent) {
    ctx.save();
    ctx.fillStyle = '#1f1a16';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;

    switch (headwear) {
      case 'bronze-helm':
        ctx.fillStyle = '#455449';
        ctx.beginPath();
        ctx.moveTo(-34, -54);
        ctx.quadraticCurveTo(0, -88, 34, -54);
        ctx.lineTo(28, -26);
        ctx.lineTo(-28, -26);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -82);
        ctx.lineTo(0, -108);
        ctx.stroke();
        break;
      case 'helmet':
        ctx.fillStyle = '#3d3a35';
        ctx.beginPath();
        ctx.ellipse(0, -56, 39, 22, 0, Math.PI, 0);
        ctx.lineTo(34, -36);
        ctx.lineTo(-34, -36);
        ctx.closePath();
        ctx.fill();
        break;
      case 'monk':
        ctx.fillStyle = '#b88d62';
        ctx.beginPath();
        ctx.arc(0, -61, 31, Math.PI, 0);
        ctx.fill();
        break;
      case 'turban':
        ctx.fillStyle = '#f1d0a5';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.ellipse(-18 + i * 12, -58, 22, 9, -0.35, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'worker-cap':
      case 'workshop-cap':
        ctx.fillStyle = headwear === 'worker-cap' ? '#0f3d2e' : '#2e6f46';
        ctx.fillRect(-30, -66, 60, 16);
        ctx.beginPath();
        ctx.ellipse(16, -52, 28, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'student-cap':
        ctx.fillStyle = '#1b2429';
        ctx.fillRect(-30, -64, 60, 13);
        ctx.fillRect(-9, -76, 18, 16);
        break;
      case 'admiral-hat':
      case 'official-cap':
      case 'duke-cap':
      case 'poet-cap':
      case 'scholar-cap':
      case 'dramatist-cap':
      case 'plain-cap':
      case 'reform-cap':
      case 'envoy-cap':
        ctx.fillStyle = headwear === 'admiral-hat' ? '#20130f' : '#171410';
        ctx.fillRect(-28, -66, 56, 16);
        ctx.fillRect(-12, -82, 24, 18);
        if (headwear === 'duke-cap' || headwear === 'official-cap') {
          ctx.fillRect(-56, -64, 34, 6);
          ctx.fillRect(22, -64, 34, 6);
        }
        break;
      case 'hairpin':
        ctx.fillStyle = '#16110f';
        ctx.beginPath();
        ctx.arc(0, -60, 34, Math.PI, 0);
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.beginPath();
        ctx.moveTo(-42, -64);
        ctx.lineTo(42, -72);
        ctx.stroke();
        break;
      case 'loose-hair':
      case 'short-hair':
      case 'visitor':
      default:
        ctx.fillStyle = '#1b1410';
        ctx.beginPath();
        ctx.arc(0, -58, 34, Math.PI, 0);
        ctx.fill();
        break;
    }

    ctx.restore();
  }

  drawPortraitProp(ctx, prop, accent) {
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;
    ctx.lineWidth = 5;

    switch (prop) {
      case 'torch':
        ctx.beginPath();
        ctx.moveTo(-58, 92);
        ctx.lineTo(-86, -2);
        ctx.stroke();
        this.drawFlame(ctx, -90, -18, 30);
        break;
      case 'jade':
        ctx.fillStyle = '#c2d4be';
        ctx.fillRect(-88, 34, 32, 44);
        ctx.clearRect(-78, 46, 12, 20);
        ctx.strokeRect(-88, 34, 32, 44);
        break;
      case 'axe':
      case 'spear':
        ctx.beginPath();
        ctx.moveTo(66, 112);
        ctx.lineTo(66, -72);
        ctx.stroke();
        ctx.fillStyle = prop === 'axe' ? '#6f7d70' : accent;
        ctx.beginPath();
        ctx.moveTo(66, -88);
        ctx.lineTo(98, -50);
        ctx.lineTo(66, -40);
        ctx.closePath();
        ctx.fill();
        break;
      case 'bamboo-slip':
      case 'book':
      case 'scroll':
      case 'survey-book':
      case 'newspaper':
      case 'lyric-book':
        this.drawScrollSheet(ctx, -78, 58, 52, 48, prop === 'newspaper' ? 'typeset' : 'poem');
        break;
      case 'qin':
        ctx.fillStyle = '#4c2c1b';
        ctx.fillRect(-96, 62, 70, 16);
        ctx.strokeStyle = '#e8d5ad';
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(-90, 64 + i * 3);
          ctx.lineTo(-32, 64 + i * 3);
          ctx.stroke();
        }
        break;
      case 'rope':
        ctx.beginPath();
        ctx.arc(-75, 58, 24, 0, Math.PI * 2);
        ctx.arc(-75, 58, 34, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'wine':
        ctx.fillRect(-76, 48, 24, 44);
        ctx.beginPath();
        ctx.ellipse(-64, 48, 14, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'crossbow':
        this.drawCrossbowIcon(ctx, -72, 48, 0.7, '#1a1612', accent);
        break;
      case 'compass':
        ctx.beginPath();
        ctx.arc(-72, 54, 28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-72, 28);
        ctx.lineTo(-58, 66);
        ctx.lineTo(-86, 66);
        ctx.closePath();
        ctx.fill();
        break;
      case 'opera-mask':
      case 'theatre-fan':
        this.drawOperaMask(ctx, -76, 42, 0.68, accent);
        break;
      case 'oil-lamp':
        this.drawLampIcon(ctx, -76, 62, 0.75, accent);
        break;
      case 'wrench':
        ctx.beginPath();
        ctx.moveTo(-86, 84);
        ctx.lineTo(-54, 38);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-48, 30, 12, -0.6, Math.PI * 1.4);
        ctx.stroke();
        break;
      case 'ticket':
        ctx.fillStyle = '#e7b5bc';
        ctx.fillRect(-96, 48, 56, 26);
        ctx.strokeRect(-96, 48, 56, 26);
        break;
      case 'laptop':
        ctx.fillStyle = '#0f2235';
        ctx.fillRect(-98, 36, 64, 42);
        ctx.fillStyle = 'rgba(52, 152, 219, 0.62)';
        ctx.fillRect(-91, 43, 50, 27);
        break;
      case 'tea':
        this.drawTeaScreenIcon(ctx, -74, 58, 0.5, accent);
        break;
      default:
        break;
    }

    ctx.restore();
  }

  drawArtifactIcon(ctx, geometry = 'cylinder', cx, cy, scale, color, accent, visualSpec = {}) {
    const artifactSpec = visualSpec?.artifact || {};
    const variant = artifactSpec.variant || geometry;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = color;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 5;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 18;

    const drawCylinder = () => {
      ctx.beginPath();
      ctx.ellipse(0, -42, 46, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.rect(-46, -42, 92, 84);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 42, 46, 15, 0, 0, Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -42, 46, 15, 0, 0, Math.PI * 2);
      ctx.stroke();
    };

    switch (variant) {
      case 'painted-pottery':
        ctx.fillStyle = '#8c583c';
        drawCylinder();
        this.drawFishFaceMotif(ctx, 0, -6, 1.15, '#1f1610', '#f0c08a');
        break;
      case 'jade-cong':
        ctx.fillStyle = '#c2d4be';
        ctx.fillRect(-58, -58, 116, 116);
        ctx.strokeRect(-58, -58, 116, 116);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        this.drawTaotieMask(ctx, 0, -2, 0.72, '#5b8c5a');
        break;
      case 'owl-zun':
        ctx.fillStyle = '#506354';
        ctx.beginPath();
        ctx.ellipse(0, 6, 50, 70, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -58, 42, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-32, -88);
        ctx.lineTo(-14, -124);
        ctx.lineTo(-2, -84);
        ctx.moveTo(32, -88);
        ctx.lineTo(14, -124);
        ctx.lineTo(2, -84);
        ctx.stroke();
        ctx.fillStyle = '#d4af37';
        ctx.beginPath();
        ctx.arc(-16, -58, 8, 0, Math.PI * 2);
        ctx.arc(16, -58, 8, 0, Math.PI * 2);
        ctx.fill();
        this.drawTaotieMask(ctx, 0, 8, 0.55, '#18221c');
        this.drawOracleBonePanel(ctx, -108, -66, 46, 116, accent);
        break;
      case 'bronze-ding':
        ctx.fillStyle = '#3d473b';
        drawCylinder();
        this.drawTaotieMask(ctx, 0, -2, 0.62, '#111915');
        this.drawOracleGlyphs(ctx, -28, -34, 0.55, 'rgba(212, 175, 55, 0.72)');
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(i * 34, 44);
          ctx.lineTo(i * 44, 92);
          ctx.stroke();
        }
        break;
      case 'bell-rack':
        ctx.strokeStyle = color;
        ctx.lineWidth = 8;
        ctx.strokeRect(-96, -82, 192, 134);
        for (let i = 0; i < 8; i++) {
          const x = -74 + i * 22;
          this.drawBellGlyph(ctx, x, -42 + (i % 2) * 14, 0.56, color);
        }
        break;
      case 'terracotta-warrior':
        this.drawTinySoldier(ctx, 0, 8, 2.0, color);
        ctx.strokeStyle = '#2f2b26';
        for (let i = -2; i <= 2; i++) ctx.strokeRect(-36 + i * 18, -4, 13, 18);
        break;
      case 'palace-lamp':
        this.drawTinySoldier(ctx, -20, 16, 1.35, '#d9ab55');
        ctx.fillStyle = '#d9ab55';
        ctx.fillRect(22, -28, 68, 18);
        ctx.beginPath();
        ctx.arc(72, -34, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 190, 80, 0.75)';
        ctx.beginPath();
        ctx.arc(84, -48, 18, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'buddha-statue':
        this.drawBuddhaSilhouette(ctx, 0, 16, 1.4, color);
        break;
      case 'canal-tools':
        ctx.strokeStyle = '#473b32';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(-82, -36);
        ctx.lineTo(62, -36);
        ctx.stroke();
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-38, -28);
        ctx.quadraticCurveTo(-56, 24, -30, 72);
        ctx.moveTo(34, -28);
        ctx.quadraticCurveTo(62, 18, 42, 76);
        ctx.stroke();
        ctx.strokeStyle = accent;
        ctx.beginPath();
        ctx.arc(82, 28, 25, 0.3, Math.PI * 1.7);
        ctx.stroke();
        break;
      case 'sancai-camel':
        this.drawCamelSilhouette(ctx, 0, 20, 1.25, '#d9ab55');
        ctx.fillStyle = '#2e7d63';
        ctx.fillRect(-34, -34, 68, 14);
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.arc(i * 22, -48, 9, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'ringed-staff':
        this.drawRingedStaffIcon(ctx, 0, 0, 1.25, color);
        break;
      case 'ru-tripod':
        ctx.fillStyle = '#9bb7ad';
        drawCylinder();
        ctx.strokeStyle = 'rgba(255,255,255,0.42)';
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.ellipse(0, -10 + i * 24, 48, 8, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      case 'qingming-scroll':
      case 'calligraphy-scroll':
      case 'world-map-scroll':
      case 'woodblock-book':
      case 'archive-book':
      case 'reform-book':
      case 'magazine':
        this.drawScrollSheet(ctx, 0, 0, 178, 92, variant);
        break;
      case 'crossbow':
        this.drawCrossbowIcon(ctx, 0, 0, 1.2, '#1a1612', accent);
        break;
      case 'blue-white-vase':
        ctx.fillStyle = '#e8edf2';
        ctx.beginPath();
        ctx.moveTo(-22, -76);
        ctx.bezierCurveTo(-46, -32, -66, 22, -36, 78);
        ctx.lineTo(36, 78);
        ctx.bezierCurveTo(66, 22, 46, -32, 22, -76);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        this.drawBlueWhiteMotif(ctx, 0, 8, 1.1);
        break;
      case 'wartime-desk':
        ctx.fillStyle = '#5a4d41';
        ctx.fillRect(-86, -4, 172, 25);
        ctx.fillRect(-70, 18, 12, 78);
        ctx.fillRect(58, 18, 12, 78);
        this.drawLampIcon(ctx, 36, -30, 0.9, accent);
        break;
      case 'steering-cup':
        this.drawSteeringCupIcon(ctx, 0, 8, 1.1, accent);
        break;
      case 'cassette-ticket':
        this.drawRecorderIcon(ctx, 0, -4, 1.2, accent);
        break;
      case 'smartphone':
        ctx.fillStyle = '#151a22';
        ctx.fillRect(-46, -90, 92, 180);
        ctx.strokeRect(-46, -90, 92, 180);
        ctx.fillStyle = 'rgba(52, 152, 219, 0.72)';
        ctx.fillRect(-34, -70, 68, 126);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        for (let i = 0; i < 9; i++) ctx.fillRect(-25 + (i % 3) * 24, -58 + Math.floor(i / 3) * 28, 12, 12);
        break;
      case 'tea-screen':
        this.drawTeaScreenIcon(ctx, 0, 4, 1.15, accent);
        break;
      default:
        switch (geometry) {
          case 'scroll':
            this.drawScrollSheet(ctx, 0, 0, 168, 82, 'scroll');
            break;
          case 'humanoid':
            this.drawTinySoldier(ctx, 0, 8, 1.5, color);
            break;
          case 'box':
            this.drawRecorderIcon(ctx, 0, -4, 1, accent);
            break;
          case 'glass-slab':
            ctx.fillStyle = '#151a22';
            ctx.fillRect(-44, -86, 88, 172);
            ctx.strokeRect(-44, -86, 88, 172);
            break;
          case 'cylinder-disk':
            this.drawSteeringCupIcon(ctx, 0, 8, 1, accent);
            break;
          case 'cylinder-cup':
            this.drawTeaScreenIcon(ctx, 0, 4, 1, accent);
            break;
          default:
            drawCylinder();
            break;
        }
        break;
    }

    ctx.restore();
  }

  drawOracleBonePanel(ctx, x, y, w, h, accent) {
    ctx.save();
    ctx.fillStyle = 'rgba(224, 190, 138, 0.82)';
    ctx.strokeStyle = 'rgba(88, 56, 28, 0.72)';
    ctx.lineWidth = Math.max(1, w * 0.035);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.2, y);
    ctx.quadraticCurveTo(x + w * 0.92, y + h * 0.08, x + w * 0.84, y + h * 0.96);
    ctx.quadraticCurveTo(x + w * 0.42, y + h, x + w * 0.08, y + h * 0.86);
    ctx.quadraticCurveTo(x, y + h * 0.38, x + w * 0.2, y);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = accent || '#d4af37';
    ctx.globalAlpha = 0.85;
    this.drawOracleGlyphs(ctx, x + w * 0.28, y + h * 0.2, Math.max(0.55, w / 85), 'rgba(55, 35, 18, 0.78)');
    ctx.strokeStyle = 'rgba(64, 31, 18, 0.48)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.48, y + h * 0.12);
    ctx.lineTo(x + w * 0.58, y + h * 0.42);
    ctx.lineTo(x + w * 0.42, y + h * 0.7);
    ctx.lineTo(x + w * 0.5, y + h * 0.9);
    ctx.stroke();
    ctx.restore();
  }

  drawOracleGlyphs(ctx, x, y, scale = 1, color = 'rgba(54, 32, 17, 0.75)') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    const glyphs = [
      [[0, 0], [18, 18], [0, 36], [18, 18], [36, 22]],
      [[6, 54], [30, 54], [18, 54], [18, 84], [6, 70], [30, 70]],
      [[0, 104], [34, 104], [17, 104], [17, 136], [3, 126], [31, 126]]
    ];
    glyphs.forEach((glyph) => {
      ctx.beginPath();
      for (let i = 0; i < glyph.length; i += 2) {
        ctx.moveTo(glyph[i][0], glyph[i][1]);
        ctx.lineTo(glyph[i + 1][0], glyph[i + 1][1]);
      }
      ctx.stroke();
    });
    ctx.restore();
  }

  drawTaotieMask(ctx, x, y, scale = 1, color = 'rgba(25, 25, 20, 0.74)') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 5;
    for (let side = -1; side <= 1; side += 2) {
      ctx.beginPath();
      ctx.arc(side * 36, -10, 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(side * 36, -10, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(side * 18, 8);
      ctx.quadraticCurveTo(side * 48, 34, side * 72, 8);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(side * 16, -34);
      ctx.quadraticCurveTo(side * 42, -58, side * 70, -38);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(-14, 32);
    ctx.lineTo(14, 32);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawFishFaceMotif(ctx, x, y, scale = 1, ink = '#1f1610', accent = '#e8c08d') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = ink;
    ctx.fillStyle = accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.fill();
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
      ctx.lineTo(side * 88, -10);
      ctx.lineTo(side * 88, 14);
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBellGlyph(ctx, x, y, scale = 1, color = '#d4af37') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-24, -24);
    ctx.lineTo(24, -24);
    ctx.lineTo(18, 38);
    ctx.lineTo(-18, 38);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.moveTo(-10, -4);
    ctx.lineTo(10, -4);
    ctx.moveTo(-8, 16);
    ctx.lineTo(8, 16);
    ctx.stroke();
    ctx.restore();
  }

  drawTinySoldier(ctx, x, y, scale = 1, color = '#615b57') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -40, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-20, -22, 40, 62);
    ctx.strokeRect(-20, -22, 40, 62);
    ctx.fillStyle = '#2f2b26';
    ctx.fillRect(-22, -56, 44, 14);
    ctx.beginPath();
    ctx.moveTo(28, -24);
    ctx.lineTo(28, 50);
    ctx.stroke();
    ctx.restore();
  }

  drawCamelSilhouette(ctx, x, y, scale = 1, color = '#d9ab55') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(-16, 12, 64, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-36, -14, 22, Math.PI, 0);
    ctx.arc(10, -14, 24, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(40, -4, 18, 42);
    ctx.beginPath();
    ctx.arc(64, -18, 14, 0, Math.PI * 2);
    ctx.fill();
    for (let i = -2; i <= 1; i++) ctx.fillRect(i * 26, 30, 9, 48);
    ctx.restore();
  }

  drawBuddhaSilhouette(ctx, x, y, scale = 1, color = '#8a8174') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -64, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-58, 48);
    ctx.quadraticCurveTo(0, -28, 58, 48);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -56, 54, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    ctx.restore();
  }

  drawScrollSheet(ctx, x, y, width, height, mode = 'scroll') {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = mode === 'magazine' ? '#f2ebd9' : '#e8d5ad';
    ctx.strokeStyle = 'rgba(74, 48, 30, 0.6)';
    ctx.lineWidth = 3;
    ctx.fillRect(-width / 2, -height / 2, width, height);
    ctx.strokeRect(-width / 2, -height / 2, width, height);

    ctx.strokeStyle = mode === 'map' || mode === 'world-map-scroll' ? 'rgba(40, 80, 100, 0.62)' : 'rgba(90, 62, 38, 0.55)';
    ctx.lineWidth = 2;
    if (mode === 'running-script' || mode === 'calligraphy-scroll') {
      ctx.strokeStyle = 'rgba(16, 14, 12, 0.82)';
      ctx.lineWidth = Math.max(2, width * 0.025);
      const cols = 5;
      for (let col = 0; col < cols; col++) {
        const cx = width / 2 - 28 - col * (width - 56) / (cols - 1);
        for (let row = 0; row < 4; row++) {
          const cy = -height / 2 + 22 + row * (height - 44) / 3 + (col % 2) * 4;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.bezierCurveTo(cx - 14, cy + 10, cx + 10, cy + 20, cx - 7, cy + 30);
          ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(168, 32, 26, 0.82)';
      ctx.fillRect(-width / 2 + 18, height / 2 - 32, 20, 20);
    } else if (mode === 'map' || mode === 'world-map-scroll') {
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * width / 6, -height / 2 + 8);
        ctx.lineTo(i * width / 6, height / 2 - 8);
        ctx.stroke();
      }
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-width / 2 + 10, i * height / 4);
        ctx.lineTo(width / 2 - 10, i * height / 4);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-width * 0.32, height * 0.08);
      ctx.bezierCurveTo(-width * 0.08, -height * 0.32, width * 0.14, height * 0.28, width * 0.36, -height * 0.16);
      ctx.stroke();
      ctx.fillStyle = 'rgba(140, 35, 35, 0.78)';
      ctx.beginPath();
      ctx.moveTo(width * 0.28, -height * 0.15);
      ctx.lineTo(width * 0.4, -height * 0.04);
      ctx.lineTo(width * 0.28, height * 0.05);
      ctx.closePath();
      ctx.fill();
    } else if (mode === 'qingming-scroll') {
      ctx.beginPath();
      ctx.arc(-width * 0.12, height * 0.22, width * 0.22, Math.PI, 0);
      ctx.stroke();
      for (let i = 0; i < 5; i++) ctx.strokeRect(-width * 0.42 + i * width * 0.18, -height * 0.3, width * 0.1, height * 0.42);
      ctx.fillStyle = 'rgba(64, 128, 116, 0.28)';
      ctx.fillRect(-width * 0.44, height * 0.18, width * 0.88, height * 0.18);
      ctx.strokeStyle = 'rgba(75, 50, 28, 0.7)';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-width * 0.38 + i * width * 0.26, height * 0.24);
        ctx.quadraticCurveTo(-width * 0.29 + i * width * 0.26, height * 0.34, -width * 0.18 + i * width * 0.26, height * 0.23);
        ctx.stroke();
      }
    } else if (mode === 'woodblock-book') {
      ctx.strokeStyle = 'rgba(20, 20, 18, 0.82)';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(-width * 0.32, -height * 0.34, width * 0.64, height * 0.68);
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(width, height) * 0.2, 0, Math.PI * 2);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(-width * 0.24, -height * 0.22 + i * height * 0.12);
        ctx.lineTo(width * 0.24, -height * 0.22 + i * height * 0.12);
        ctx.stroke();
      }
    } else if (mode === 'archive-book') {
      ctx.fillStyle = '#e6c886';
      ctx.fillRect(-width / 2, -height / 2, width, height);
      ctx.strokeStyle = 'rgba(72, 46, 20, 0.72)';
      for (let i = 0; i < 5; i++) {
        const bx = -width * 0.42 + i * width * 0.18;
        ctx.strokeRect(bx, -height * 0.36, width * 0.1, height * 0.72);
        ctx.beginPath();
        ctx.moveTo(bx + width * 0.05, -height * 0.3);
        ctx.lineTo(bx + width * 0.05, height * 0.3);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(170, 26, 20, 0.78)';
      ctx.beginPath();
      ctx.arc(width * 0.36, height * 0.32, Math.min(width, height) * 0.08, 0, Math.PI * 2);
      ctx.fill();
    } else if (mode === 'reform-book') {
      ctx.strokeStyle = 'rgba(40, 40, 40, 0.7)';
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.moveTo(-width * 0.38, -height * 0.34 + i * height * 0.1);
        ctx.lineTo(width * 0.38, -height * 0.34 + i * height * 0.1);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(60, 80, 100, 0.64)';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-width * 0.42, height * 0.28 + i * height * 0.08);
        ctx.bezierCurveTo(-width * 0.15, height * 0.05, width * 0.12, height * 0.45, width * 0.42, height * 0.18);
        ctx.stroke();
      }
    } else if (mode === 'magazine') {
      ctx.fillStyle = '#9b2020';
      ctx.fillRect(-width / 2 + 14, -height / 2 + 12, width - 28, 22);
      ctx.strokeStyle = '#333';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(-width / 2 + 18, -height / 2 + 54 + i * 14);
        ctx.lineTo(width / 2 - 18, -height / 2 + 54 + i * 14);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(30,30,30,0.78)';
      ctx.fillRect(-width * 0.36, -height * 0.1, width * 0.22, height * 0.42);
    } else {
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-width / 2 + 20, i * height / 6);
        ctx.lineTo(width / 2 - 20, i * height / 6);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawCrossbowIcon(ctx, x, y, scale = 1, body = '#1a1612', accent = '#d4af37') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = body;
    ctx.fillStyle = body;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-84, 0);
    ctx.quadraticCurveTo(0, -52, 84, 0);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = accent;
    ctx.beginPath();
    ctx.moveTo(-78, 0);
    ctx.lineTo(78, 0);
    ctx.stroke();
    ctx.fillRect(-12, -10, 112, 20);
    ctx.fillRect(22, -42, 15, 84);
    ctx.restore();
  }

  drawOperaMask(ctx, x, y, scale = 1, accent = '#d4af37') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#f3d6c8';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 34, 44, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#8a1d1d';
    ctx.beginPath();
    ctx.arc(-12, -8, 10, 0, Math.PI * 2);
    ctx.arc(12, -8, 10, 0, Math.PI * 2);
    ctx.moveTo(-18, 16);
    ctx.quadraticCurveTo(0, 26, 18, 16);
    ctx.stroke();
    ctx.restore();
  }

  drawRingedStaffIcon(ctx, x, y, scale = 1, color = '#d9d9d9') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = color;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(0, -84);
    ctx.lineTo(0, 96);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -70, 28, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(i * 17, -50, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBlueWhiteMotif(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = '#174f9a';
    ctx.lineWidth = 4;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(i * 16, -22, 12, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(-44, 14);
    ctx.bezierCurveTo(-14, -18, 18, 48, 44, 8);
    ctx.stroke();
    ctx.restore();
  }

  drawLampIcon(ctx, x, y, scale = 1, accent = '#d4af37') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = accent;
    ctx.strokeStyle = '#4a311d';
    ctx.lineWidth = 4;
    ctx.fillRect(-22, 10, 44, 34);
    ctx.beginPath();
    ctx.ellipse(0, 8, 30, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    this.drawFlame(ctx, 0, -18, 26);
    ctx.restore();
  }

  drawSteeringCupIcon(ctx, x, y, scale = 1, accent = '#e74c3c') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = '#1d1d1d';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(-30, 0, 48, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-30, 0);
      ctx.lineTo(-30 + Math.cos(i * Math.PI * 2 / 3) * 46, Math.sin(i * Math.PI * 2 / 3) * 46);
      ctx.stroke();
    }
    ctx.fillStyle = '#eeeeee';
    ctx.fillRect(44, -48, 42, 84);
    ctx.strokeRect(44, -48, 42, 84);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(65, -10, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawRecorderIcon(ctx, x, y, scale = 1, accent = '#2ecc71') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#a05a4c';
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 4;
    ctx.fillRect(-88, -52, 176, 104);
    ctx.strokeRect(-88, -52, 176, 104);
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(-38, -8, 25, 0, Math.PI * 2);
    ctx.arc(38, -8, 25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.26)';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-58, -8 + i * 5);
      ctx.lineTo(-18, -8 + i * 5);
      ctx.moveTo(18, -8 + i * 5);
      ctx.lineTo(58, -8 + i * 5);
      ctx.stroke();
    }
    ctx.fillStyle = '#e7b5bc';
    ctx.fillRect(-24, 58, 96, 28);
    ctx.strokeStyle = accent;
    ctx.strokeRect(-24, 58, 96, 28);
    ctx.restore();
  }

  drawTeaScreenIcon(ctx, x, y, scale = 1, accent = '#f1c40f') {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(-44, 10, 32, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-76, 10, 64, 48);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-52 + i * 10, -44);
      ctx.quadraticCurveTo(-70 + i * 18, -18, -52 + i * 12, 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#111';
    ctx.fillRect(8, -54, 112, 70);
    ctx.fillRect(-4, 18, 138, 16);
    ctx.fillStyle = 'rgba(52, 152, 219, 0.72)';
    ctx.fillRect(18, -44, 92, 50);
    ctx.restore();
  }

  drawFlame(ctx, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 80, size / 80);
    const gradient = ctx.createRadialGradient(0, 12, 4, 0, 0, 56);
    gradient.addColorStop(0, '#fff2a8');
    gradient.addColorStop(0.46, '#ff8c00');
    gradient.addColorStop(1, 'rgba(255, 60, 0, 0.1)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, -54);
    ctx.bezierCurveTo(42, -8, 26, 38, 0, 52);
    ctx.bezierCurveTo(-34, 28, -32, -14, 0, -54);
    ctx.fill();
    ctx.restore();
  }

  drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const chars = String(text || '').split('');
    let line = '';
    let lines = 0;

    for (const char of chars) {
      const testLine = line + char;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line, x, y + lines * lineHeight);
        line = char;
        lines += 1;
        if (lines >= maxLines) return;
      } else {
        line = testLine;
      }
    }

    if (line && lines < maxLines) {
      ctx.fillText(line, x, y + lines * lineHeight);
    }
  }

  // Triggered when crossing into a new room / node
  handleRoomChange(index, options = {}) {
    const {
      showGate = this.isExploring,
      updateSound = this.isExploring,
      autoShowCharacter = this.isExploring
    } = options;
    const safeIndex = Math.max(0, Math.min(this.totalNodes - 1, index));
    const previousIndex = this.currentEraIndex;
    this.currentEraIndex = safeIndex;
    const data = nodesData[safeIndex];
    if (!data) return;

    if (previousIndex !== safeIndex) {
      this.hideCharacterSpotlight(true);
    }

    // 1. Play sound transition & update synthesizers
    if (updateSound) {
      sound.updateEra(data.ambientStyle, safeIndex);
    }

    // 2. Play transition phrase gate overlay
    if (showGate) {
      this.showTransitionGate(data.transition);
    }

    // 3. Update HUD text
    gsap.to([this.eraIndex, this.eraTitle, this.eraTagline], {
      opacity: 0,
      y: -10,
      duration: 0.3,
      onComplete: () => {
        this.eraIndex.textContent = `${String(safeIndex + 1).padStart(2, '0')} / ${this.totalNodes}`;
        this.eraTitle.textContent = data.name;
        this.eraTagline.textContent = data.theme;
        
        gsap.to([this.eraIndex, this.eraTitle, this.eraTagline], {
          opacity: 1,
          y: 0,
          duration: 0.5,
          stagger: 0.1
        });
      }
    });

    // 4. Update active sidebar item class & scroll to it
    const items = this.sidebarList.querySelectorAll('.sidebar-item');
    items.forEach((item, idx) => {
      if (idx === safeIndex) {
        item.classList.add('active');
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        item.classList.remove('active');
      }
    });

    this.updateNodeInsight(data, safeIndex);
    this.updateNavigationState(safeIndex);

    // This path also runs for mouse-wheel room changes, so restore the center portrait here.
    if (autoShowCharacter && this.isExploring && !this.isContentModalOpen()) {
      this.scheduleAutoCharacterSpotlight(safeIndex);
    }
  }

  // Horizontal transition screen between rooms
  showTransitionGate(phrase) {
    if (!phrase) return;

    gsap.killTweensOf(this.transitionGate);
    if (this.transitionGateCall) {
      this.transitionGateCall.kill();
      this.transitionGateCall = null;
    }

    this.transitionPhrase.textContent = phrase;
    this.transitionGate.classList.remove('hidden');
    this.transitionGate.style.opacity = 1;

    // Auto-fade out after 1.5 seconds
    this.transitionGateCall = gsap.delayedCall(1.15, () => {
      gsap.to(this.transitionGate, {
        opacity: 0,
        duration: 0.45,
        onComplete: () => {
          this.transitionGate.classList.add('hidden');
          this.transitionGateCall = null;
        }
      });
    });
  }

  // Navigate directly using bottom HUD buttons
  navigateEra(direction) {
    if (direction > 0 && this.currentEraIndex === this.totalNodes - 1) {
      this.triggerLookbackWall();
      return;
    }

    this.goToEra(this.currentEraIndex + direction, { autoShowCharacter: true });
  }

  // --- Clicking Characters / Artifacts (Renderer callbacks) ---
  onObjectInteract(type, data) {
    // Play Guqin pluck audio effect on interaction
    sound.playPluck();

    if (type === 'character') {
      this.openCharacterModal(data);
    } else if (type === 'artifact') {
      this.openArtifactModal(data);
    }
  }

  openCharacterModal(data) {
    this.cancelAutoCharacterSpotlight();
    this.hideCharacterSpotlight();
    const node = this.findNodeForCharacter(data) || nodesData[this.activeNodeIndex] || nodesData[this.currentEraIndex];
    this.charName.textContent = data.name;
    if (this.charRole) this.charRole.textContent = data.role;
    this.charQuote.textContent = data.quote;
    this.charDescription.textContent = this.buildCharacterNarrative(data);
    this.updateCharacterAvatar(data, node);
    
    // Clear playing speech if any
    this.stopSpeaking();
    
    // Store voice speech text
    this.charVoiceBtn.userData = { speechText: data.speech };
    this.charVoiceBtn.querySelector('.btn-text').textContent = '聆听原声';
    this.charVoiceBtn.classList.remove('playing');

    this.charModal.classList.remove('hidden');
  }

  updateCharacterAvatar(character, node) {
    if (!this.charAvatar || !node) return;

    const key = this.getCharacterImageKey(character, node);
    const primarySrc = `./images/${key}.png`;
    const fallbackKey = this.getNodeImageGallery(node, 'human')?.[0]?.key;
    const fallbackSrc = fallbackKey ? `./images/${fallbackKey}.png` : '';
    const requestId = ++this.characterImageRequestId;
    this.charAvatar.style.visibility = 'hidden';
    this.charAvatar.style.backgroundImage = 'none';

    const reveal = (src) => {
      if (requestId !== this.characterImageRequestId) return;
      this.charAvatar.style.backgroundImage = `url("${src}")`;
      this.charAvatar.style.visibility = 'visible';
    };
    const image = new Image();
    image.onload = () => reveal(primarySrc);
    image.onerror = () => {
      if (!fallbackSrc || requestId !== this.characterImageRequestId) return;
      const fallback = new Image();
      fallback.onload = () => reveal(fallbackSrc);
      fallback.src = fallbackSrc;
    };
    image.src = primarySrc;
  }

  getCharacterImageKey(character, node) {
    const index = Math.max(0, (node?.characters || []).findIndex((item) => item.name === character?.name));
    return `character-${node?.id ?? this.activeNodeIndex}-${index}`;
  }

  closeCharacterModal(restoreSpotlight = true) {
    this.characterImageRequestId += 1;
    if (this.charAvatar) {
      this.charAvatar.style.visibility = 'hidden';
      this.charAvatar.style.backgroundImage = 'none';
    }
    this.charModal.classList.add('hidden');
    this.stopSpeaking();
    if (this.renderer) this.renderer.exitFocus();
    if (restoreSpotlight) this.restoreCurrentCharacterSpotlight();
  }

  openArtifactModal(data) {
    this.cancelAutoCharacterSpotlight();
    this.hideCharacterSpotlight();
    this.activeArtifact = data;
    const node = this.findNodeForArtifact(data) || nodesData[this.activeNodeIndex] || nodesData[this.currentEraIndex];
    if (node) {
      this.activeNodeIndex = node.id;
    }

    const artifactVisual = getArtifactVisualSpec(data);
    const featureData = this.getArtifactFeatureData(data, artifactVisual);

    this.applyArtifactContrastTheme(data, node);
    this.artName.textContent = data.name;
    this.artEra.textContent = `${data.era} · 珍玩`;
    this.artNarrative.textContent = this.buildArtifactNarrative(data);
    this.updateArtifactFeatures(featureData);
    this.updateArtifactReference(data, artifactVisual);
    if (this.artVoiceBtn) {
      this.artVoiceBtn.userData = { speechText: this.buildArtifactVoiceNarrative(data, featureData) };
      this.artVoiceBtn.querySelector('.btn-text').textContent = '听讲解';
      this.artVoiceBtn.classList.remove('playing');
      this.artVoiceBtn.classList.remove('voice-ready');
    }
    this.setArtifactReferenceMode(false);
    this.renderer?.destroyArtifactViewer();
    this.artModal.classList.remove('hidden');

    const posterContext = this.artPosterCanvas?.getContext('2d');
    posterContext?.clearRect(0, 0, this.artPosterCanvas.width, this.artPosterCanvas.height);
    
    // Reset timer and stop current speech
    this.stopSpeaking();
    if (this.monologueTimeout) clearTimeout(this.monologueTimeout);

    // Initialize the secondary WebGL canvas to show interactive 3D rotation of the artifact
    const container = this.artCanvasContainer || document.getElementById('art-canvas-container');
    if (this.renderer && container) {
      requestAnimationFrame(() => this.renderer.initArtifactViewer(container, data, featureData));
    }

    // Autoplayed speech is blocked by many browsers. Only draw attention to the
    // control here; narration itself always starts from an explicit user click.
    this.monologueTimeout = setTimeout(() => {
      if (!this.artModal.classList.contains('hidden') && this.artVoiceBtn) {
        this.artVoiceBtn.classList.add('voice-ready');
      }
    }, 5000);
  }

  applyArtifactContrastTheme(artifact, node) {
    if (!this.artVisualStage) return;

    const baseColor = artifact?.materialProps?.color || node?.color || '#d4af37';
    const rgb = this.parseHexColor(baseColor) || { r: 212, g: 175, b: 55 };
    const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
    const isLightObject = luminance >= 0.56;
    const glowAlpha = isLightObject ? 0.13 : 0.08;
    const glow = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${glowAlpha})`;

    const theme = isLightObject
      ? {
          panel: 'rgba(0, 0, 0, 0.42)',
          border: 'rgba(255, 255, 255, 0.09)',
          reference: 'rgba(3, 3, 6, 0.46)',
          shadow: 'rgba(0, 0, 0, 0.56)',
          posterOpacity: '0.045',
          stageBg: `radial-gradient(ellipse at 50% 34%, ${glow} 0%, transparent 34%), linear-gradient(145deg, #2a2b2e 0%, #111216 54%, #050506 100%)`
        }
      : {
          panel: 'rgba(28, 25, 21, 0.26)',
          border: 'rgba(78, 61, 36, 0.18)',
          reference: 'rgba(244, 237, 224, 0.74)',
          shadow: 'rgba(42, 33, 21, 0.28)',
          posterOpacity: '0.035',
          stageBg: `radial-gradient(ellipse at 50% 34%, ${glow} 0%, transparent 32%), linear-gradient(145deg, #f3eee5 0%, #ddd4c5 58%, #c8bda9 100%)`
        };

    const panel = this.artVisualStage.closest('.art-visual-panel');
    panel?.style.setProperty('--artifact-panel-bg', theme.panel);
    this.artVisualStage.dataset.contrast = isLightObject ? 'dark-background' : 'light-background';
    this.artVisualStage.style.setProperty('--artifact-stage-bg', theme.stageBg);
    this.artVisualStage.style.setProperty('--artifact-stage-border', theme.border);
    this.artVisualStage.style.setProperty('--artifact-stage-shadow', theme.shadow);
    this.artVisualStage.style.setProperty('--artifact-poster-opacity', theme.posterOpacity);
    this.artVisualStage.style.setProperty('--artifact-reference-bg', theme.reference);
  }

  parseHexColor(value) {
    if (!value || typeof value !== 'string') return null;
    const clean = value.trim().replace('#', '');
    const normalized = clean.length === 3
      ? clean.split('').map((char) => char + char).join('')
      : clean;
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16)
    };
  }

  findNodeForArtifact(artifact) {
    if (!artifact) return null;
    return nodesData.find((node) => (node.artifacts || []).some((item) => item.name === artifact.name)) || null;
  }

  findNodeForCharacter(character) {
    if (!character) return null;
    return nodesData.find((node) => (node.characters || []).some((item) => item.name === character.name)) || null;
  }

  closeArtifactModal(restoreSpotlight = true) {
    this.artifactReferenceRequestId += 1;
    if (this.artReferenceImage) {
      this.artReferenceImage.style.visibility = 'hidden';
      this.artReferenceImage.removeAttribute('src');
    }
    this.artModal.classList.add('hidden');
    if (this.monologueTimeout) clearTimeout(this.monologueTimeout);
    this.stopSpeaking();
    this.setArtifactReferenceMode(false);
    if (this.artVoiceBtn) {
      this.artVoiceBtn.querySelector('.btn-text').textContent = '听讲解';
      this.artVoiceBtn.classList.remove('playing');
      this.artVoiceBtn.classList.remove('voice-ready');
    }
    
    // Destroy the secondary WebGL artifact viewer
    if (this.renderer) {
      this.renderer.destroyArtifactViewer();
      this.renderer.exitFocus();
    }
    if (restoreSpotlight) this.restoreCurrentCharacterSpotlight();
  }

  drawArtifactPosterFallback(canvas, artifact, node) {
    if (!canvas || !artifact) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    this.paintVisualBackground(ctx, width, height, node?.color || '#d4af37', node?.fogColor || '#050508');
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '500 34px "Noto Serif SC", serif';
    this.drawWrappedText(ctx, artifact.name, 56, height * 0.44, width - 112, 44, 3);
    ctx.font = '18px "Noto Serif SC", serif';
    ctx.fillStyle = 'rgba(212, 175, 55, 0.95)';
    ctx.fillText(artifact.era, 58, height * 0.66);
  }

  // --- Voice Synthesis Engine (Web Speech API) ---
  speakCharacterQuote() {
    const text = this.charVoiceBtn.userData.speechText;
    if (!text) return;

    if (this.currentSpeech) {
      this.stopSpeaking();
      this.charVoiceBtn.querySelector('.btn-text').textContent = '聆听原声';
      this.charVoiceBtn.classList.remove('playing');
      return;
    }

    this.charVoiceBtn.querySelector('.btn-text').textContent = '正在朗读...';
    this.charVoiceBtn.classList.add('playing');
    this.speakText(text, () => {
      this.charVoiceBtn.querySelector('.btn-text').textContent = '聆听原声';
      this.charVoiceBtn.classList.remove('playing');
    });
  }

  // Triggered after staying on an artifact for 5 seconds
  triggerMonologueNarrative(text) {
    if (!this.isExploring) return;
    
    // Dim the artifact detail modal visual style slightly to emphasize deep focus
    const container = this.artModal.querySelector('.modal-container');
    if (container) {
      container.style.boxShadow = '0 0 50px rgba(212, 175, 55, 0.4)';
      container.style.borderColor = 'rgba(212, 175, 55, 0.6)';
    }

    // Speak the narrative monologue
    this.speakText(text, () => {
      // Restore styles when finished
      if (container) {
        container.style.boxShadow = '';
        container.style.borderColor = '';
      }
    }, { maxChars: 680, rate: 0.9, pitch: 1.0, volume: 0.92 });
  }

  speakText(text, onEndCallback, options = {}) {
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') {
      if (onEndCallback) onEndCallback();
      return false;
    }

    window.speechSynthesis.cancel();
    const requestId = ++this.speechRequestId;

    const maxChars = options.maxChars || 260;
    const cleanText = text
      .replace(/<[^>]*>/g, '')
      .replace(/[“”]/g, '')
      .replace(/([。！？；])/g, '$1 ')
      .substring(0, maxChars)
      .trim();
    if (!cleanText) {
      if (onEndCallback) onEndCallback();
      return false;
    }

    const chunks = [];
    const sentenceParts = cleanText.match(/[^。！？；]+[。！？；]?/g) || [cleanText];
    sentenceParts.forEach((part) => {
      const sentence = part.trim();
      if (!sentence) return;
      if (sentence.length <= 150) {
        chunks.push(sentence);
        return;
      }
      for (let start = 0; start < sentence.length; start += 150) {
        chunks.push(sentence.slice(start, start + 150));
      }
    });

    const voices = window.speechSynthesis.getVoices();
    const voice = this.selectNarrationVoice(voices);
    let chunkIndex = 0;
    let finished = false;
    const finish = () => {
      if (finished || requestId !== this.speechRequestId) return;
      finished = true;
      if (this.speechResumeTimer) {
        window.clearTimeout(this.speechResumeTimer);
        this.speechResumeTimer = null;
      }
      this.currentSpeech = null;
      if (onEndCallback) onEndCallback();
    };
    const speakNextChunk = () => {
      if (requestId !== this.speechRequestId) return;
      if (chunkIndex >= chunks.length) {
        finish();
        return;
      }
      const utterance = new window.SpeechSynthesisUtterance(chunks[chunkIndex]);
      utterance.lang = 'zh-CN';
      utterance.rate = options.rate || 0.88;
      utterance.pitch = options.pitch || 0.96;
      utterance.volume = options.volume || 0.95;
      if (voice) utterance.voice = voice;
      utterance.onend = () => {
        if (requestId !== this.speechRequestId) return;
        chunkIndex += 1;
        speakNextChunk();
      };
      utterance.onerror = (event) => {
        if (event.error === 'canceled' || event.error === 'interrupted') return;
        finish();
      };
      this.currentSpeech = utterance;
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(utterance);
      this.speechResumeTimer = window.setTimeout(() => {
        if (requestId === this.speechRequestId && window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 350);
    };

    // Start synchronously inside the click handler so browser user-activation is retained.
    speakNextChunk();
    return true;
  }

  getVoicesAsync() {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) return Promise.resolve(voices);

    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        window.speechSynthesis.onvoiceschanged = null;
        resolve(window.speechSynthesis.getVoices());
      }, 900);

      window.speechSynthesis.onvoiceschanged = () => {
        window.clearTimeout(timer);
        window.speechSynthesis.onvoiceschanged = null;
        resolve(window.speechSynthesis.getVoices());
      };
    });
  }

  selectNarrationVoice(voices = []) {
    if (!voices.length) return null;

    const naturalHints = [
      'Online', 'Natural', 'Neural', 'Premium',
      'Xiaoxiao', 'Yunxi', 'Yunjian', 'Yunyang', 'Xiaoyi', 'Xiaobei', 'Xiaochen', 'Xiaohan', 'Xiaomeng',
      'Tingting', 'Huihui', 'Kangkang', 'Yaoyao', 'Mandarin', '普通话', '中文'
    ];

    const scoreVoice = (voice) => {
      const name = voice.name || '';
      const lang = voice.lang || '';
      let score = 0;
      if (/zh[-_]?CN/i.test(lang)) score += 80;
      else if (/zh/i.test(lang)) score += 55;
      if (/Chinese|Mandarin|普通话|中文/i.test(name)) score += 18;
      naturalHints.forEach((hint, index) => {
        if (name.includes(hint)) score += Math.max(8, 34 - index);
      });
      if (voice.localService === false) score += 10;
      if (/Google/i.test(name)) score += 4;
      return score;
    };

    return [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || null;
  }

  stopSpeaking() {
    if (this.speechResumeTimer) {
      window.clearTimeout(this.speechResumeTimer);
      this.speechResumeTimer = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    this.speechRequestId += 1;
    this.currentSpeech = null;
  }

  // --- End Game: Lookback Wall ---
  triggerLookbackWall() {
    this.isExploring = false;
    this.cancelAutoCharacterSpotlight();
    this.hideCharacterSpotlight(true);
    this.hud.classList.add('hidden');
    this.lookbackScreen.classList.remove('hidden');

    // Populate lookback wall dynamically with silhouettes
    this.lookbackGrid.innerHTML = '';
    nodesData.forEach((node, idx) => {
      const item = document.createElement('div');
      item.className = 'lookback-item';
      
      // We represent silhouettes using custom styled calligraphic circles
      item.innerHTML = `
        <div class="lookback-silhouette" style="background: ${node.color}; border-radius: 50%;"></div>
        <div class="lookback-name">${node.name}</div>
      `;
      
      // Clicking item moves you directly to that era
      item.addEventListener('click', () => {
        this.lookbackScreen.classList.add('hidden');
        this.hud.classList.remove('hidden');
        this.isExploring = true;
        this.goToEra(idx, { autoShowCharacter: true });
      });
      
      this.lookbackGrid.appendChild(item);
    });
  }

  restartApp() {
    this.lookbackScreen.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.isExploring = true;
    this.cancelAutoCharacterSpotlight();
    this.hideCharacterSpotlight(true);

    this.renderer.setPathProgress(0, true);
    this.handleRoomChange(0, { showGate: false, updateSound: true });
    this.updateProgressBar();
  }
}

// Instantiate and start once page loaded
window.addEventListener('DOMContentLoaded', () => {
  const app = new MuseumApp();
  app.init();
  if (isAndroidLayoutPreview) {
    app.toggleSidebar(false);
    if (androidLayoutPreviewMode !== 'intro') {
      app.enterJourneyAt(0);
      window.setTimeout(() => {
        if (androidLayoutPreviewMode === 'transition') {
          app.transitionPhrase.textContent = '钻燧取火，以化腥臊';
          app.transitionGate.classList.remove('hidden');
          app.transitionGate.style.opacity = 1;
        } else if (androidLayoutPreviewMode === 'image') {
          app.openImageModal('human', app.nodeImageBtn);
        } else if (androidLayoutPreviewMode === 'artifact' || androidLayoutPreviewMode === 'reference') {
          app.openCurrentArtifactModal();
          if (androidLayoutPreviewMode === 'reference') app.setArtifactReferenceMode(true);
        }
      }, 250);
    }
  }
});
