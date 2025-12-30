/**
 * Camera animation configurations and utilities
 * Shared between SettingsView and SceneCollectionView
 */

// Animation configuration constants
export const CAMERA_INTRO = {
  zOffset: 3,      // How far back camera starts from target
  duration: 3,     // Animation duration in seconds
  ease: 'power4.out'
};

// Scene transition animation settings
export const SCENE_TRANSITION = {
  duration: 2,           // Duration of each lerpLookAt animation in seconds
  webcamFocusDuration: 1.5, // Duration for webcam focus animation
  focusDelay: 0.5        // Delay between first and second animation (for gameplay scenes)
};

/**
 * Calculate zoom mode animation durations based on scene duration and number of targets
 * Ensures all animations fit within the scene duration with no overflow
 * 
 * @param {number} sceneDuration - Total scene duration in ms
 * @param {number} numTargets - Number of source targets to focus on (default 1)
 * @returns {Object} Duration values for each animation phase
 */
export function getZoomDurations(sceneDuration, numTargets = 1) {
  // Ensure at least 1 target
  numTargets = Math.max(1, numTargets);
  
  // Animation phase proportions (must sum to 1.0)
  // firstAnim: 25%, then for each target: focusAnim + focusHold + return
  // With 1 target: 25% first, 5% delay, 20% focus, 15% hold, 20% return, 15% buffer = 100%
  // With N targets: need to scale down per-target portions
  
  // Base proportions for single target
  const firstAnimProportion = 0.25;
  const focusDelayProportion = 0.05;
  
  // Remaining time after first anim and delay
  const remainingProportion = 1.0 - firstAnimProportion - focusDelayProportion;
  
  // Each target needs: focus + hold + return (with last return being final)
  // Proportions per target: focus=0.20, hold=0.15, return=0.20 = 0.55 per target
  // But last target doesn't need separate return, it's shared
  // Actually: focus + hold for each, then one final return
  // perTarget = focusAnim + focusHold, then one final returnAnim
  
  const focusAnimProportion = 0.20 / numTargets;
  const focusHoldProportion = 0.15 / numTargets;
  const returnAnimProportion = 0.20;
  
  // Scale to fit remaining proportion
  const totalPerTargetNeeded = numTargets * (focusAnimProportion + focusHoldProportion) + returnAnimProportion;
  const scale = remainingProportion / totalPerTargetNeeded;
  
  // Apply speed factor for very short/long scenes
  const durationFactor = Math.min(1.2, Math.max(0.8, sceneDuration / 5000));
  
  return {
    firstAnimDuration: Math.min(sceneDuration * firstAnimProportion * durationFactor, 2500),
    focusDelay: Math.min(sceneDuration * focusDelayProportion * durationFactor, 500),
    focusAnimDuration: Math.min(sceneDuration * focusAnimProportion * scale * durationFactor, 2000),
    focusHoldTime: sceneDuration * focusHoldProportion * scale,
    returnAnimDuration: Math.min(sceneDuration * returnAnimProportion * scale * durationFactor, 2000),
    numTargets
  };
}

/**
 * Calculate the total duration for zoom mode animations for a scene
 * Used by expectedRecordingDuration to add proper buffer time
 * 
 * @param {number} sceneDuration - Base scene duration in ms
 * @param {number} numTargets - Number of source targets (0 if no targets)
 * @returns {number} Total animation duration in ms (should equal sceneDuration for proper fit)
 */
export function getZoomTotalDuration(sceneDuration, numTargets) {
  if (numTargets === 0) return sceneDuration;
  
  const durations = getZoomDurations(sceneDuration, numTargets);
  // Total: firstAnim + focusDelay + (focusAnim + focusHold) * numTargets + returnAnim
  const total = durations.firstAnimDuration + 
                durations.focusDelay + 
                (durations.focusAnimDuration + durations.focusHoldTime) * numTargets + 
                durations.returnAnimDuration;
  return total;
}

// Easing function types for timeline
export const EASING = {
  POWER3_OUT: 'power3.out',
  POWER2_INOUT: 'power2.inOut',
  POWER4_OUT: 'power4.out'
};

// Global animation cancellation flag - set to true to stop all running animations
let animationsCancelled = false;
let cancellationGeneration = 0;

/**
 * Cancel all running camera animations
 * Animations will stop at their current position
 */
export function cancelAllAnimations() {
  animationsCancelled = true;
  cancellationGeneration++;
  const currentGeneration = cancellationGeneration;
  // Reset after 100ms to allow all animation frames to see the cancellation
  setTimeout(() => {
    // Only reset if no new cancellation has been requested
    if (cancellationGeneration === currentGeneration) {
      animationsCancelled = false;
    }
  }, 100);
}

/**
 * Check if animations have been cancelled
 */
function isAnimationCancelled() {
  return animationsCancelled;
}

/**
 * Get a random value between min and max
 */
function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Get a random point on the plane (in normalized Three.js coordinates)
 * The plane is typically 2 units tall with aspect-ratio width
 */
function getRandomPointOnPlane(planeWidth, planeHeight) {
  const halfWidth = planeWidth / 2;
  const halfHeight = planeHeight / 2;
  return {
    x: randomBetween(-halfWidth * 0.8, halfWidth * 0.8),
    y: randomBetween(-halfHeight * 0.8, halfHeight * 0.8),
    z: 0
  };
}

/**
 * Convert canvas coordinates to Three.js plane coordinates
 * Canvas: (0,0) top-left, (canvasWidth, canvasHeight) bottom-right
 * Plane: (-planeWidth/2, planeHeight/2) top-left, (planeWidth/2, -planeHeight/2) bottom-right
 */
export function canvasToPlaneCoords(canvasX, canvasY, canvasWidth, canvasHeight, planeWidth, planeHeight) {
  // Normalize to 0-1 range
  const normalizedX = canvasX / canvasWidth;
  const normalizedY = canvasY / canvasHeight;
  
  // Convert to plane coordinates (centered, Y inverted)
  const planeX = (normalizedX - 0.5) * planeWidth;
  const planeY = (0.5 - normalizedY) * planeHeight; // Invert Y
  
  return { x: planeX, y: planeY, z: 0 };
}

/**
 * Calculate the center of a source in Three.js plane coordinates
 */
export function getSourceCenterOnPlane(node, source, canvasWidth, canvasHeight, planeWidth, planeHeight) {
  const t = node.transform || {};
  const baseX = t.position?.x || 0;
  const baseY = t.position?.y || 0;
  const scaleX = t.scale?.x || 1;
  const scaleY = t.scale?.y || 1;
  
  const crop = t.crop || {};
  const cropTop = crop.top || 0;
  const cropLeft = crop.left || 0;
  const cropRight = crop.right || 0;
  const cropBottom = crop.bottom || 0;
  
  const sourceWidth = source?.size?.width || 100;
  const sourceHeight = source?.size?.height || 100;
  
  // Calculate dimensions with scale and crop
  const scaledWidth = sourceWidth * scaleX;
  const scaledHeight = sourceHeight * scaleY;
  const width = scaledWidth - (cropLeft * scaleX) - (cropRight * scaleX);
  const height = scaledHeight - (cropTop * scaleY) - (cropBottom * scaleY);
  
  // Calculate position with crop offset
  const x = baseX + (cropLeft * scaleX);
  const y = baseY + (cropTop * scaleY);
  
  // Get center in canvas coordinates
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  
  // Convert to plane coordinates
  return canvasToPlaneCoords(centerX, centerY, canvasWidth, canvasHeight, planeWidth, planeHeight);
}

/**
 * Calculate appropriate camera distance to frame a source
 */
export function getCameraDistanceForSource(node, source, canvasWidth, canvasHeight, baseDistance = 2) {
  const t = node.transform || {};
  const scaleX = t.scale?.x || 1;
  const scaleY = t.scale?.y || 1;
  
  const crop = t.crop || {};
  const cropLeft = crop.left || 0;
  const cropRight = crop.right || 0;
  const cropTop = crop.top || 0;
  const cropBottom = crop.bottom || 0;
  
  const sourceWidth = source?.size?.width || 100;
  const sourceHeight = source?.size?.height || 100;
  
  // Calculate final dimensions
  const scaledWidth = sourceWidth * scaleX;
  const scaledHeight = sourceHeight * scaleY;
  const width = scaledWidth - (cropLeft * scaleX) - (cropRight * scaleX);
  const height = scaledHeight - (cropTop * scaleY) - (cropBottom * scaleY);
  
  // Calculate what fraction of canvas this source takes
  const widthRatio = width / canvasWidth;
  const heightRatio = height / canvasHeight;
  const maxRatio = Math.max(widthRatio, heightRatio);
  
  // Smaller sources need closer camera (larger distance factor)
  // Larger sources need further camera (smaller distance factor)
  // Use inverse relationship with some bounds
  const distanceFactor = Math.max(0.5, Math.min(2, 1 / maxRatio * 0.3));
  
  return baseDistance * distanceFactor;
}

/**
 * Check if a scene is a "gameplay" or "live" scene (contains Game Capture source)
 */
export function isGameplayScene(nodes, sources) {
  return nodes.some(node => {
    const source = sources.find(s => s.id === node.sourceId);
    if (!source) return false;
    
    // Check for game_capture type or "Game Capture" in name
    return source.type === 'game_capture' || 
           (source.name && source.name.toLowerCase().includes('game capture'));
  });
}

/**
 * Find source targets in a scene (sources that camera should focus on)
 * Includes: dshow_input, macos_avcapture (video capture devices/webcams), and custom targets
 * @param {Array} nodes - Scene nodes
 * @param {Array} sources - All sources
 * @param {Object} customSourceTargets - Object mapping sourceId to true/false for custom targets
 */
export function findSourceTargets(nodes, sources, customSourceTargets = {}) {
  return nodes.filter(node => {
    if (node.visible === false) return false;
    
    const source = sources.find(s => s.id === node.sourceId);
    if (!source) return false;
    
    const sourceType = source.type;
    const isDefaultTarget = sourceType === 'dshow_input' || sourceType === 'macos_avcapture';
    
    // Check if there's an explicit custom setting (true or false)
    if (node.sourceId in customSourceTargets) {
      return customSourceTargets[node.sourceId];
    }
    
    // Fall back to default behavior
    return isDefaultTarget;
  }).map(node => ({
    node,
    source: sources.find(s => s.id === node.sourceId)
  }));
}

/**
 * Animate camera from a pulled-back position to its target position
 * Creates a smooth "zoom in" intro effect
 * 
 * @param {THREE.PerspectiveCamera} camera - The Three.js camera to animate
 * @param {CameraControls} controls - The CameraControls instance
 * @param {Object} options - Optional overrides for animation config
 */
export function applyCameraIntroAnimation(camera, controls, options = {}) {
  if (!camera || !controls) {
    console.warn('applyCameraIntroAnimation: Missing camera or controls');
    return;
  }
  
  const config = { ...CAMERA_INTRO, ...options };
  
  const targetPosition = camera.position.clone();
  console.log('applyCameraIntroAnimation: target z =', targetPosition.z, ', will start from z =', targetPosition.z + config.zOffset);
  
  // Move camera back by offset for the start position
  camera.position.z = targetPosition.z + config.zOffset;
  controls.setPosition(camera.position.x, camera.position.y, camera.position.z, false);
  
  // Use lerpLookAt for smooth animation
  const startZ = targetPosition.z + config.zOffset;
  const endZ = targetPosition.z;
  
  // Animate using t parameter
  let startTime = null;
  const duration = config.duration * 1000; // Convert to ms
  
  function animate(timestamp) {
    if (!startTime) startTime = timestamp;
    const elapsed = timestamp - startTime;
    const t = Math.min(elapsed / duration, 1);
    
    // Apply easing (power4.out approximation)
    const easedT = 1 - Math.pow(1 - t, 4);
    
    controls.lerpLookAt(
      0, 0, startZ,  // positionA
      0, 0, 0,       // targetA (center)
      0, 0, endZ,    // positionB
      0, 0, 0,       // targetB (center)
      easedT,
      false
    );
    
    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      console.log('applyCameraIntroAnimation: Animation completed');
    }
  }
  
  requestAnimationFrame(animate);
}

/**
 * Perform a scene transition camera animation using lerpLookAt
 * Animates from a random offset position to the center of the plane
 * 
 * @param {CameraControls} controls - The CameraControls instance
 * @param {number} planeWidth - Width of the Three.js plane
 * @param {number} planeHeight - Height of the Three.js plane
 * @param {Object} options - Animation options
 * @returns {Promise} Resolves when animation completes
 */
export function animateSceneTransition(controls, planeWidth, planeHeight, options = {}) {
  return new Promise((resolve) => {
    if (!controls) {
      console.warn('animateSceneTransition: Missing controls');
      resolve();
      return;
    }
    
    const duration = (options.duration || SCENE_TRANSITION.duration) * 1000;
    const centerZ = options.centerZ || 2.25;
    
    // Random starting position and target
    const randomStart = generateRandomStartPosition(planeWidth, planeHeight);
    const posA = randomStart.position;
    const targetA = randomStart.target;
    
    // End position: centered, at calculated distance from plane
    const posB = { x: 0, y: 0, z: centerZ };
    
    // End target: center of plane
    const targetB = { x: 0, y: 0, z: 0 };
    
    console.log('animateSceneTransition: Starting animation');
    console.log('From position:', posA, 'looking at:', targetA);
    console.log('To position:', posB, 'looking at:', targetB);
    
    let startTime = null;
    
    function animate(timestamp) {
      // Check for cancellation
      if (isAnimationCancelled()) {
        console.log('animateSceneTransition: Animation cancelled');
        resolve();
        return;
      }
      
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const t = Math.min(elapsed / duration, 1);
      
      // Apply easing (power3.out)
      const easedT = 1 - Math.pow(1 - t, 3);
      
      controls.lerpLookAt(
        posA.x, posA.y, posA.z,
        targetA.x, targetA.y, targetA.z,
        posB.x, posB.y, posB.z,
        targetB.x, targetB.y, targetB.z,
        easedT,
        false
      );
      
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        console.log('animateSceneTransition: Animation completed');
        resolve();
      }
    }
    
    requestAnimationFrame(animate);
  });
}

/**
 * Perform a camera animation focusing on a specific source (webcam/facecam)
 * 
 * @param {CameraControls} controls - The CameraControls instance
 * @param {Object} targetCenter - Center of the target source in plane coords {x, y, z}
 * @param {number} targetDistance - Camera distance for framing the source
 * @param {number} planeWidth - Width of the Three.js plane
 * @param {number} planeHeight - Height of the Three.js plane
 * @param {Object} options - Animation options
 * @returns {Promise} Resolves when animation completes
 */
export function animateToSource(controls, targetCenter, targetDistance, planeWidth, planeHeight, options = {}) {
  return new Promise((resolve) => {
    if (!controls) {
      console.warn('animateToSource: Missing controls');
      resolve();
      return;
    }
    
    const duration = (options.duration || SCENE_TRANSITION.webcamFocusDuration) * 1000;
    
    // Get current camera state as starting point
    const currentPos = controls.getPosition();
    const currentTarget = controls.getTarget();
    
    // Starting position (current camera state)
    const posA = {
      x: currentPos.x,
      y: currentPos.y,
      z: currentPos.z
    };
    
    const targetA = {
      x: currentTarget.x,
      y: currentTarget.y,
      z: currentTarget.z
    };
    
    // End position: in front of the source at appropriate distance
    const posB = {
      x: targetCenter.x,
      y: targetCenter.y,
      z: targetDistance
    };
    
    // End target: the source center
    const targetB = {
      x: targetCenter.x,
      y: targetCenter.y,
      z: 0
    };
    
    console.log('animateToSource: Focusing on source');
    console.log('  From position:', posA, 'looking at:', targetA);
    console.log('  To position:', posB, 'looking at:', targetB);
    
    let startTime = null;
    
    function animate(timestamp) {
      // Check for cancellation
      if (isAnimationCancelled()) {
        console.log('animateToSource: Animation cancelled');
        resolve();
        return;
      }
      
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const t = Math.min(elapsed / duration, 1);
      
      // Apply easing (power2.inOut for smooth focus)
      const easedT = t < 0.5 
        ? 2 * t * t 
        : 1 - Math.pow(-2 * t + 2, 2) / 2;
      
      controls.lerpLookAt(
        posA.x, posA.y, posA.z,
        targetA.x, targetA.y, targetA.z,
        posB.x, posB.y, posB.z,
        targetB.x, targetB.y, targetB.z,
        easedT,
        false
      );
      
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        console.log('animateToSource: Animation completed');
        resolve();
      }
    }
    
    requestAnimationFrame(animate);
  });
}

/**
 * Animate back from source focus to full plane view
 * 
 * @param {CameraControls} controls - The CameraControls instance
 * @param {Object} options - Animation options
 * @returns {Promise} Resolves when animation completes
 */
export function animateBackToCenter(controls, options = {}) {
  return new Promise((resolve) => {
    if (!controls) {
      console.warn('animateBackToCenter: Missing controls');
      resolve();
      return;
    }
    
    const duration = (options.duration || SCENE_TRANSITION.webcamFocusDuration) * 1000;
    const centerZ = options.centerZ || 2.25;
    
    // Get current camera state as starting point
    const currentPos = controls.getPosition();
    const currentTarget = controls.getTarget();
    
    const posA = {
      x: currentPos.x,
      y: currentPos.y,
      z: currentPos.z
    };
    
    const targetA = {
      x: currentTarget.x,
      y: currentTarget.y,
      z: currentTarget.z
    };
    
    // End position: centered view
    const posB = { x: 0, y: 0, z: centerZ };
    const targetB = { x: 0, y: 0, z: 0 };
    
    console.log('animateBackToCenter: Returning to center view');
    
    let startTime = null;
    
    function animate(timestamp) {
      // Check for cancellation
      if (isAnimationCancelled()) {
        console.log('animateBackToCenter: Animation cancelled');
        resolve();
        return;
      }
      
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const t = Math.min(elapsed / duration, 1);
      
      // Apply easing
      const easedT = 1 - Math.pow(1 - t, 3);
      
      controls.lerpLookAt(
        posA.x, posA.y, posA.z,
        targetA.x, targetA.y, targetA.z,
        posB.x, posB.y, posB.z,
        targetB.x, targetB.y, targetB.z,
        easedT,
        false
      );
      
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        console.log('animateBackToCenter: Animation completed');
        resolve();
      }
    }
    
    requestAnimationFrame(animate);
  });
}

/**
 * Master function to perform all camera animations for a scene
 * Handles both regular scenes (1 animation) and gameplay scenes (2 animations)
 * 
 * @param {CameraControls} controls - The CameraControls instance
 * @param {Array} nodes - Scene nodes (from scene.nodes)
 * @param {Array} sources - All sources (from activeSources)
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} canvasHeight - Canvas height in pixels
 * @param {number} planeWidth - Three.js plane width
 * @param {number} planeHeight - Three.js plane height
 * @param {number} sceneDuration - Total time for this scene in ms
 * @returns {Promise} Resolves when all animations complete
 */
export async function performSceneCameraAnimation(controls, nodes, sources, canvasWidth, canvasHeight, planeWidth, planeHeight, sceneDuration) {
  if (!controls || !nodes) {
    console.warn('performSceneCameraAnimation: Missing required parameters');
    return;
  }
  
  const isGameplay = isGameplayScene(nodes, sources);
  const sourceTargets = findSourceTargets(nodes, sources);
  
  console.log(`performSceneCameraAnimation: isGameplay=${isGameplay}, sourceTargets=${sourceTargets.length}, sceneDuration=${sceneDuration}ms`);
  
  if (sourceTargets.length > 0) {
    // Scene with source target: do multi-stage animation
    // First: random to center (takes ~40% of scene time)
    // Then: focus on target (takes ~30% of scene time)
    // Finally: back to center (takes ~30% of scene time)
    
    const firstAnimDuration = Math.min(2, sceneDuration * 0.35 / 1000); // 35% of scene, max 2s
    const focusAnimDuration = Math.min(1.5, sceneDuration * 0.25 / 1000); // 25% of scene, max 1.5s
    const returnAnimDuration = Math.min(1.5, sceneDuration * 0.25 / 1000); // 25% of scene, max 1.5s
    const focusHoldTime = sceneDuration * 0.15; // 15% hold time on target
    
    // First animation: random to center
    await animateSceneTransition(controls, planeWidth, planeHeight, { duration: firstAnimDuration });
    
    // Small pause before focusing
    await new Promise(r => setTimeout(r, SCENE_TRANSITION.focusDelay * 1000));
    
    // Pick the first source target
    const { node: targetNode, source: targetSource } = sourceTargets[0];
    
    // Calculate target position on plane
    const targetCenter = getSourceCenterOnPlane(targetNode, targetSource, canvasWidth, canvasHeight, planeWidth, planeHeight);
    const targetDistance = getCameraDistanceForSource(targetNode, targetSource, canvasWidth, canvasHeight, 2);
    
    console.log('  Source target center:', targetCenter, 'distance:', targetDistance);
    
    // Second animation: focus on target
    await animateToSource(controls, targetCenter, targetDistance, planeWidth, planeHeight, { duration: focusAnimDuration });
    
    // Hold on target for a moment
    await new Promise(r => setTimeout(r, focusHoldTime));
    
    // Third animation: return to center
    await animateBackToCenter(controls, { duration: returnAnimDuration });
    
  } else {
    // Regular scene: just do the standard transition animation
    const animDuration = Math.min(2.5, sceneDuration * 0.5 / 1000); // 50% of scene, max 2.5s
    await animateSceneTransition(controls, planeWidth, planeHeight, { duration: animDuration });
  }
}

// ============================================================================
// CAMERA TIMELINE SYSTEM
// Pre-computed animation data sent from SettingsView to SceneCollectionView
// ============================================================================

/**
 * Apply easing function to a 0-1 progress value
 */
export function applyEasing(t, easingType) {
  switch (easingType) {
    case EASING.POWER4_OUT:
      return 1 - Math.pow(1 - t, 4);
    case EASING.POWER3_OUT:
      return 1 - Math.pow(1 - t, 3);
    case EASING.POWER2_INOUT:
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    default:
      return 1 - Math.pow(1 - t, 3); // Default to power3.out
  }
}

/**
 * Generate a random starting position for scene transitions
 * Called in SettingsView so randomness is baked into timeline
 */
function generateRandomStartPosition(planeWidth, planeHeight) {
  const halfWidth = planeWidth / 2;
  const halfHeight = planeHeight / 2;
  
  return {
    position: {
      x: randomBetween(-2, 2),
      y: randomBetween(-1, 1),
      z: randomBetween(1.5, 2.5)
    },
    target: {
      x: randomBetween(-halfWidth * 0.8, halfWidth * 0.8),
      y: randomBetween(-halfHeight * 0.8, halfHeight * 0.8),
      z: 0
    }
  };
}

/**
 * Build a complete camera timeline for all scenes
 * This is called in SettingsView and the result is sent to SceneCollectionView
 * 
 * @param {Object} params - Parameters for building the timeline
 * @param {Array} params.scenes - Array of scene data from scenesToCycle
 * @param {Array} params.activeScenes - Full scene data array
 * @param {Array} params.activeSources - All sources
 * @param {string} params.displayMode - Current display mode
 * @param {number} params.sceneDuration - Duration per scene in ms
 * @param {number} params.transitionTime - Transition time between scenes in ms
 * @param {number} params.bufferStartDelay - Delay before first scene in ms
 * @param {number} params.canvasWidth - Canvas width in pixels
 * @param {number} params.canvasHeight - Canvas height in pixels
 * @param {number} params.planeWidth - Three.js plane width (usually ~3.55 for 16:9)
 * @param {number} params.planeHeight - Three.js plane height (usually 2)
 * @param {string} params.targetBehavior - 'zoom' or 'cut'
 * @param {Object} params.customSourceTargets - Custom source target IDs
 * @returns {Object} Complete timeline data to send via postMessage
 */
export function buildCameraTimeline(params) {
  const {
    scenes,
    activeScenes,
    activeSources,
    displayMode,
    sceneDuration,
    transitionTime,
    bufferStartDelay,
    canvasWidth,
    canvasHeight,
    planeWidth,
    planeHeight,
    centerZ = 2.25, // Camera distance to fit plane in view (calculated from fitToRect)
    targetBehavior = 'zoom',
    customSourceTargets = {}
  } = params;
  
  const timeline = {
    planeWidth,
    planeHeight,
    centerZ,
    targetBehavior,
    scenes: []
  };
  
  let currentTimeMs = bufferStartDelay;
  
  scenes.forEach((scene, index) => {
    // Get scene nodes
    const sceneData = activeScenes.find(s => s.id === scene.id);
    const nodes = sceneData?.nodes?.filter(n => n.display === displayMode && n.type !== 'folder') || [];
    
    // Build sources lookup for this scene
    const nodesWithSources = nodes.map(node => {
      const source = activeSources.find(s => s.id === node.sourceId);
      return { node, source };
    }).filter(n => n.source);
    
    // Analyze scene type
    const isGameplay = isGameplayScene(nodes, activeSources);
    const sourceTargets = findSourceTargets(nodes, activeSources, customSourceTargets);
    
    // Build animation sequence for this scene
    const sceneEntry = {
      name: scene.name,
      startTimeMs: currentTimeMs,
      isGameplay,
      hasSourceTarget: sourceTargets.length > 0,
      targetBehavior,
      animations: []
    };
    
    // Center position (used as end point for most animations)
    const centerPos = { x: 0, y: 0, z: centerZ };
    const centerTarget = { x: 0, y: 0, z: 0 };
    
    if (sourceTargets.length > 0) {
      if (targetBehavior === 'cut') {
        // CUT MODE: Equal time for each target + center, use transition-style animations
        // Number of segments = number of targets + 1 (for final center view)
        const numSegments = sourceTargets.length + 1;
        const segmentDuration = sceneDuration / numSegments;
        
        // Each cut transition gets ~50% of segment for animation, 50% for holding
        const cutAnimDuration = segmentDuration * 0.5;
        const holdDuration = segmentDuration * 0.5;
        
        // Animate through each source target with cut transitions
        sourceTargets.forEach((targetData, targetIndex) => {
          const { node: targetNode, source: targetSource } = targetData;
          
          // Calculate target position on plane
          const targetCenter = getSourceCenterOnPlane(targetNode, targetSource, canvasWidth, canvasHeight, planeWidth, planeHeight);
          const targetDistance = getCameraDistanceForSource(targetNode, targetSource, canvasWidth, canvasHeight, 2);
          
          const targetPos = { x: targetCenter.x, y: targetCenter.y, z: targetDistance };
          const targetLookAt = { x: targetCenter.x, y: targetCenter.y, z: 0 };
          
          // Generate random start position for the cut transition
          const randomStart = generateRandomStartPosition(planeWidth, planeHeight);
          
          // Cut transition to this target (like scene transitions - random to target)
          sceneEntry.animations.push({
            type: 'animate',
            durationMs: cutAnimDuration,
            startPos: randomStart.position,
            startTarget: randomStart.target,
            endPos: targetPos,
            endTarget: targetLookAt,
            easing: EASING.POWER3_OUT
          });
          
          // Hold on target
          sceneEntry.animations.push({
            type: 'wait',
            durationMs: holdDuration
          });
        });
        
        // Final cut transition to center/full plane view
        const randomStart = generateRandomStartPosition(planeWidth, planeHeight);
        sceneEntry.animations.push({
          type: 'animate',
          durationMs: cutAnimDuration,
          startPos: randomStart.position,
          startTarget: randomStart.target,
          endPos: centerPos,
          endTarget: centerTarget,
          easing: EASING.POWER3_OUT
        });
        
        // Hold on center for remaining time
        sceneEntry.animations.push({
          type: 'wait',
          durationMs: holdDuration
        });
        
      } else {
        // ZOOM MODE: Smooth multi-stage animation with smart durations
        // Now supports multiple source targets
        const durations = getZoomDurations(sceneDuration, sourceTargets.length);
        
        // Generate random start position (baked into timeline)
        const randomStart = generateRandomStartPosition(planeWidth, planeHeight);
        
        // Animation 1: Random position to center
        sceneEntry.animations.push({
          type: 'animate',
          durationMs: durations.firstAnimDuration,
          startPos: randomStart.position,
          startTarget: randomStart.target,
          endPos: centerPos,
          endTarget: centerTarget,
          easing: EASING.POWER3_OUT
        });
        
        // Wait before focusing on target
        sceneEntry.animations.push({
          type: 'wait',
          durationMs: durations.focusDelay
        });
        
        // Focus on each source target in sequence
        sourceTargets.forEach((targetData, targetIndex) => {
          const { node: targetNode, source: targetSource } = targetData;
          
          // Calculate source target focus position
          const targetCenter = getSourceCenterOnPlane(targetNode, targetSource, canvasWidth, canvasHeight, planeWidth, planeHeight);
          const targetDistance = getCameraDistanceForSource(targetNode, targetSource, canvasWidth, canvasHeight, 2);
          
          const targetPos = { x: targetCenter.x, y: targetCenter.y, z: targetDistance };
          const targetLookAt = { x: targetCenter.x, y: targetCenter.y, z: 0 };
          
          // Animation: Focus on source target (starts from current position)
          sceneEntry.animations.push({
            type: 'animate',
            durationMs: durations.focusAnimDuration,
            fromCurrent: true,
            endPos: targetPos,
            endTarget: targetLookAt,
            easing: EASING.POWER2_INOUT
          });
          
          // Hold on target
          sceneEntry.animations.push({
            type: 'wait',
            durationMs: durations.focusHoldTime
          });
        });
        
        // Final Animation: Return to center
        sceneEntry.animations.push({
          type: 'animate',
          durationMs: durations.returnAnimDuration,
          fromCurrent: true,
          endPos: centerPos,
          endTarget: centerTarget,
          easing: EASING.POWER2_INOUT
        });
      }
      
    } else {
      // Regular scene (no source targets): single transition animation
      // Use smarter duration based on scene length
      const durationFactor = Math.min(1.5, Math.max(0.6, sceneDuration / 5000));
      const animDuration = Math.min(2500 * durationFactor, sceneDuration * 0.5);
      
      // Generate random start position
      const randomStart = generateRandomStartPosition(planeWidth, planeHeight);
      
      sceneEntry.animations.push({
        type: 'animate',
        durationMs: animDuration,
        startPos: randomStart.position,
        startTarget: randomStart.target,
        endPos: centerPos,
        endTarget: centerTarget,
        easing: EASING.POWER3_OUT
      });
    }
    
    timeline.scenes.push(sceneEntry);
    
    // Move to next scene
    currentTimeMs += sceneDuration;
    if (index < scenes.length - 1) {
      currentTimeMs += transitionTime;
    }
  });
  
  console.log('Built camera timeline:', timeline);
  return timeline;
}

/**
 * Execute a single animation step from the timeline
 * Called by SceneCollectionView for each animation in a scene
 * 
 * @param {CameraControls} controls - The CameraControls instance
 * @param {Object} animation - Animation step from timeline
 * @returns {Promise} Resolves when animation completes
 */
export function executeTimelineAnimation(controls, animation) {
  return new Promise((resolve) => {
    if (!controls) {
      resolve();
      return;
    }
    
    if (animation.type === 'wait') {
      setTimeout(resolve, animation.durationMs);
      return;
    }
    
    if (animation.type !== 'animate') {
      console.warn('executeTimelineAnimation: Unknown animation type:', animation.type);
      resolve();
      return;
    }
    
    const duration = animation.durationMs;
    
    // Determine start position
    let posA, targetA;
    if (animation.fromCurrent) {
      const currentPos = controls.getPosition();
      const currentTarget = controls.getTarget();
      posA = { x: currentPos.x, y: currentPos.y, z: currentPos.z };
      targetA = { x: currentTarget.x, y: currentTarget.y, z: currentTarget.z };
    } else {
      posA = animation.startPos;
      targetA = animation.startTarget;
    }
    
    const posB = animation.endPos;
    const targetB = animation.endTarget;
    const easingType = animation.easing;
    
    let startTime = null;
    
    function animate(timestamp) {
      if (isAnimationCancelled()) {
        resolve();
        return;
      }
      
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const t = Math.min(elapsed / duration, 1);
      const easedT = applyEasing(t, easingType);
      
      controls.lerpLookAt(
        posA.x, posA.y, posA.z,
        targetA.x, targetA.y, targetA.z,
        posB.x, posB.y, posB.z,
        targetB.x, targetB.y, targetB.z,
        easedT,
        false
      );
      
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        resolve();
      }
    }
    
    requestAnimationFrame(animate);
  });
}

/**
 * Execute all animations for a scene from the timeline
 * 
 * @param {CameraControls} controls - The CameraControls instance
 * @param {Object} sceneTimeline - Scene entry from timeline.scenes
 * @returns {Promise} Resolves when all animations complete
 */
export async function executeSceneTimeline(controls, sceneTimeline) {
  if (!controls || !sceneTimeline || !sceneTimeline.animations) {
    return;
  }
  
  for (const animation of sceneTimeline.animations) {
    if (isAnimationCancelled()) break;
    await executeTimelineAnimation(controls, animation);
  }
}
