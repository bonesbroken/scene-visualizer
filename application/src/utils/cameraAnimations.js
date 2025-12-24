import gsap from 'gsap';

/**
 * Camera animation configurations and utilities
 * Shared between SettingsView and SceneCollectionView
 */

// Animation configuration constants
export const CAMERA_INTRO = {
  zOffset: 4,      // How far back camera starts from target
  duration: 3,     // Animation duration in seconds
  ease: 'power4.out'
};

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
  
  // Animate to target position
  gsap.to(camera.position, {
    z: targetPosition.z,
    duration: config.duration,
    ease: config.ease,
    onStart: () => {
      console.log('applyCameraIntroAnimation: Animation started');
    },
    onUpdate: () => {
      if (controls) {
        controls.setPosition(camera.position.x, camera.position.y, camera.position.z, false);
      }
    },
    onComplete: () => {
      console.log('applyCameraIntroAnimation: Animation completed, camera.z =', camera.position.z);
    }
  });
}
