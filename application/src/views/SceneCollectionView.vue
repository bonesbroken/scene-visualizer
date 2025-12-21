<template>
  <div class="scene-collection-container">
    <div ref="threeContainer" class="three-container"></div>
    <div v-if="loading" class="loading-overlay">
      <span class="spinner"></span>
      Loading video...
    </div>
    <div v-if="error" class="error-overlay">
      {{ error }}
    </div>
  </div>
</template>

<script>
import * as THREE from 'three';
import CameraControls from 'camera-controls';
import { markRaw } from 'vue';

// Install CameraControls with THREE
CameraControls.install({ THREE: THREE });

export default {
  name: 'SceneCollectionView',
  data() {
    return {
      streamlabs: null,
      loading: true,
      error: null,
      
      // Settings from app source (currently unused - communication via postMessage)
      
      // Video element reference for message handler
      pendingVideo: null,
      
      // Three.js objects - stored outside of Vue reactivity
      threeInitialized: false,
      animationFrameId: null,
      
      // Video playback
      isPlaying: false,
      videoDuration: 0,
    };
  },
  computed: {
  },
  mounted() {
    this.initStreamlabs();
  },
  beforeUnmount() {
    this.disposeThreeJS();
  },
  methods: {
    // Remote logging - sends critical logs to SettingsView for debugging
    // Use sparingly - postMessage has 30/min rate limit!
    remoteLog(level, ...args) {
      // Log locally
      if (level === 'error') {
        console.error('SceneCollectionView:', ...args);
      } else if (level === 'warn') {
        console.warn('SceneCollectionView:', ...args);
      } else {
        console.log('SceneCollectionView:', ...args);
      }
      
      // Send to SettingsView
      if (this.streamlabs) {
        try {
          const serializedArgs = args.map(arg => {
            if (typeof arg === 'object') {
              try { return JSON.stringify(arg); } catch { return String(arg); }
            }
            return arg;
          });
          this.streamlabs.postMessage('remoteLog', { level, args: serializedArgs });
        } catch (err) {
          // Ignore serialization errors
        }
      }
    },

    async initStreamlabs() {
      // Check if Streamlabs SDK is available
      if (!window.Streamlabs) {
        console.warn('SceneCollectionView: Streamlabs SDK not available, running in standalone mode');
        return;
      }

      try {
        this.streamlabs = window.Streamlabs;
        const data = await this.streamlabs.init({ receiveEvents: true });
        console.log('SceneCollectionView: Streamlabs initialized', data);
        
        // Register message listener once for receiving start playback command
        this.streamlabs.onMessage(async (event) => {
          // Log ALL incoming messages for debugging (temporarily)
          this.remoteLog('log', 'onMessage received:', event.type);
          
          if (event.type === 'loadReplayFromBase64') {
            this.remoteLog('log', 'Processing loadReplayFromBase64, data length:', event.data.base64?.length || 0);
            await this.loadAndDisplayReplayFromBase64(event.data);
          } else if (event.type === 'loadReplayFromIndexedDB') {
            // Legacy fallback
            this.remoteLog('log', 'Processing loadReplayFromIndexedDB...');
            await this.loadAndDisplayReplay();
          } else if (event.type === 'startVideoSourcePlaybackInBrowserSource') {
            this.remoteLog('log', 'Processing startVideoSourcePlaybackInBrowserSource...');
            if (event.data.isVideoSourceInBrowserSourceLoaded === true && this.pendingVideo) {
              await this.startVideoPlayback();
            }
          }
        });
        
        // Send a test message to confirm SceneCollectionView is alive
        this.remoteLog('log', 'SceneCollectionView ready, onMessage registered');
        
        // Initialize Three.js first
        this.initThreeJS();
        
        // Try to load replay from IndexedDB if available
        this.loadAndDisplayReplay();
      } catch (err) {
        this.remoteLog('error', 'Error initializing:', err.message);
        this.error = 'Failed to initialize';
        this.loading = false;
      }
    },
    
    async startVideoPlayback() {
      if (!this.pendingVideo) return;
      
      const video = this.pendingVideo;
      
      try {
        // Start playing
        this.isPlaying = true;
        this.videoDuration = video.duration * 1000;
        await video.play();
        console.log('SceneCollectionView: Video playing:', video.videoWidth, 'x', video.videoHeight);
        
        // Store video element for cleanup
        this._video = video;
        this.pendingVideo = null;
        
        // Dispose old texture if exists
        if (this._threeTexture) {
          this._threeTexture.dispose();
        }
        
        // Create VideoTexture from the video element
        this._threeTexture = markRaw(new THREE.VideoTexture(video));
        this._threeTexture.minFilter = THREE.LinearFilter;
        this._threeTexture.magFilter = THREE.LinearFilter;
        this._threeTexture.format = THREE.RGBAFormat;
        
        // Update the plane material with the new video texture
        if (this._threePlane) {
          this._threePlane.visible = true; // Show plane now that video is ready
          this._threePlane.material.map = this._threeTexture;
          this._threePlane.material.color = new THREE.Color(0xffffff);
          this._threePlane.material.needsUpdate = true;
          
          // Update plane geometry to match video aspect ratio
          const videoAspect = video.videoWidth / video.videoHeight;
          const planeHeight = 2;
          const planeWidth = planeHeight * videoAspect;
          
          this._threePlane.geometry.dispose();
          this._threePlane.geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
          
          // Re-fit camera to the updated plane
          this.fitToRect(this._threePlane);
        }
        
        this.loading = false;
        console.log('SceneCollectionView: Replay loaded on canvas!');
      } catch (err) {
        this.remoteLog('error', 'Error starting video playback:', err.message);
        this.error = 'Failed to start video playback';
        this.loading = false;
      }
    },
    
    initThreeJS() {
      const container = this.$refs.threeContainer;
      if (!container) return;
      
      // Get container dimensions
      const width = container.clientWidth || 640;
      const height = container.clientHeight || 360;
      
      // Create clock for delta time
      this._threeClock = markRaw(new THREE.Clock());
      
      // Create scene
      this._threeScene = markRaw(new THREE.Scene());
      this._threeScene.background = null;
      
      // Create camera - perspective for 3D camera controls
      const aspect = width / height;
      this._threeCamera = markRaw(new THREE.PerspectiveCamera(50, aspect, 0.1, 1000));
      this._threeCamera.position.z = 3;
      
      // Create renderer with transparent background
      this._threeRenderer = markRaw(new THREE.WebGLRenderer({ antialias: true, alpha: true }));
      this._threeRenderer.setClearColor(0x000000, 0); // Fully transparent
      this._threeRenderer.setSize(width, height);
      this._threeRenderer.setPixelRatio(window.devicePixelRatio);
      container.appendChild(this._threeRenderer.domElement);
      
      // Add CameraControls
      this._threeControls = markRaw(new CameraControls(this._threeCamera, this._threeRenderer.domElement));
      this._threeControls.dollyToCursor = true;
      this._threeControls.minDistance = 0.5;
      this._threeControls.maxDistance = 20;
      
      // Create a placeholder plane (will be updated when video loads)
      const planeHeight = 2;
      const planeWidth = planeHeight * (16/9); // Default 16:9 aspect
      const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
      const material = new THREE.MeshBasicMaterial({ 
        color: 0x1a2a35,
        transparent: true,
        side: THREE.DoubleSide
      });
      
      this._threePlane = markRaw(new THREE.Mesh(geometry, material));
      this._threePlane.visible = false; // Hidden until video loads
      this._threeScene.add(this._threePlane);
      
      // Fit camera to the plane
      this.$nextTick(() => {
        this.fitToRect(this._threePlane);
      });
      
      this.threeInitialized = true;
      
      // Start animation loop
      this.animateThreeJS();
      
      // Handle resize
      window.addEventListener('resize', this.handleThreeResize);
    },
    
    fitToRect(rect) {
      if (!this._threeControls || !rect) return;
      
      const rectWidth = rect.geometry.parameters.width;
      const rectHeight = rect.geometry.parameters.height;
      
      rect.updateMatrixWorld();
      const rectCenterPosition = new THREE.Vector3().copy(rect.position);
      const rectNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(rect.quaternion);
      const distance = this._threeControls.getDistanceToFitBox(rectWidth, rectHeight, 0);
      const cameraPosition = new THREE.Vector3().copy(rectNormal).multiplyScalar(distance).add(rectCenterPosition);
      
      this._threeControls.setLookAt(
        cameraPosition.x, cameraPosition.y, cameraPosition.z,
        rectCenterPosition.x, rectCenterPosition.y, rectCenterPosition.z,
        true
      );
    },
    
    animateThreeJS() {
      this.animationFrameId = requestAnimationFrame(this.animateThreeJS);
      
      if (this._threeRenderer && this._threeScene && this._threeCamera) {
        // Update controls with delta time
        if (this._threeControls && this._threeClock) {
          const delta = this._threeClock.getDelta();
          this._threeControls.update(delta);
        }
        
        // Update texture if needed
        if (this._threeTexture) {
          this._threeTexture.needsUpdate = true;
        }
        
        this._threeRenderer.render(this._threeScene, this._threeCamera);
      }
    },
    
    handleThreeResize() {
      const container = this.$refs.threeContainer;
      if (!container || !this._threeRenderer || !this._threeCamera) return;
      
      const width = container.clientWidth;
      const height = container.clientHeight;
      const aspect = width / height;
      
      // Update perspective camera
      this._threeCamera.aspect = aspect;
      this._threeCamera.updateProjectionMatrix();
      
      this._threeRenderer.setSize(width, height);
    },
    
    disposeThreeJS() {
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      
      window.removeEventListener('resize', this.handleThreeResize);
      
      if (this._threeControls) {
        this._threeControls.dispose();
      }
      
      if (this._threePlane) {
        this._threePlane.geometry.dispose();
        this._threePlane.material.dispose();
      }
      
      if (this._threeTexture) {
        this._threeTexture.dispose();
      }
      
      // Cleanup video element and blob URL
      if (this._video) {
        this._video.pause();
        if (this._video.src) {
          URL.revokeObjectURL(this._video.src);
        }
        this._video = null;
      }
      
      if (this._threeRenderer) {
        this._threeRenderer.dispose();
        const container = this.$refs.threeContainer;
        if (container && this._threeRenderer.domElement) {
          container.removeChild(this._threeRenderer.domElement);
        }
      }
      
      this._threeScene = null;
      this._threeCamera = null;
      this._threeRenderer = null;
      this._threeControls = null;
      this._threePlane = null;
      this._threeTexture = null;
      this._threeClock = null;
      this.threeInitialized = false;
    },
    
    async loadAndDisplayReplay() {
      this.loading = true;
      this.error = null;
      
      try {
        // Cleanup previous video if exists
        if (this._video) {
          this._video.pause();
          if (this._video.src) {
            URL.revokeObjectURL(this._video.src);
          }
        }
        
        // Load video from IndexedDB
        const videoFile = await this.getVideoFromIndexedDB('latestReplay');
        if (!videoFile) {
          this.remoteLog('warn', 'No video available in IndexedDB');
          this.loading = false;
          return;
        }
        
        this.remoteLog('log', 'Loaded video from IndexedDB, size:', videoFile.size);
        const videoUrl = URL.createObjectURL(videoFile);
        
        // Create video element
        const video = document.createElement('video');
        video.src = videoUrl;
        video.crossOrigin = 'anonymous';
        video.loop = true; // Loop the video
        video.muted = true; // Required for autoplay
        video.playsInline = true;
        
        // Wait for video to be ready
        await new Promise((resolve, reject) => {
          video.onloadeddata = resolve;
          video.onerror = reject;
          video.load();
        });
        
        this.remoteLog('log', 'Video ready, sending confirmation');
        
        // Store video for when we receive start playback message
        this.pendingVideo = video;
        
        // Signal to SettingsView that video is loaded and ready (this is the critical message!)
        this.streamlabs.postMessage('isVideoSourceInBrowserSourceLoaded', { isVideoSourceInBrowserSourceLoaded: true });
        
      } catch (err) {
        this.remoteLog('error', 'Error displaying replay:', err.message);
        this.error = 'Failed to load replay video';
        this.loading = false;
      }
    },
    
    async loadAndDisplayReplayFromBase64(data) {
      this.loading = true;
      this.error = null;
      
      try {
        // Cleanup previous video if exists
        if (this._video) {
          this._video.pause();
          if (this._video.src) {
            URL.revokeObjectURL(this._video.src);
          }
        }
        
        const { base64, mimeType, fileName } = data;
        
        if (!base64) {
          this.remoteLog('error', 'No base64 data received');
          this.loading = false;
          return;
        }
        
        this.remoteLog('log', 'Converting base64 to blob, length:', base64.length);
        
        // Convert base64 back to blob
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mimeType || 'video/mp4' });
        
        this.remoteLog('log', 'Created blob, size:', blob.size);
        const videoUrl = URL.createObjectURL(blob);
        
        // Create video element
        const video = document.createElement('video');
        video.src = videoUrl;
        video.crossOrigin = 'anonymous';
        video.loop = false; // Play once only
        video.muted = true; // Required for autoplay
        video.playsInline = true;
        
        // Wait for video to be ready
        await new Promise((resolve, reject) => {
          video.onloadeddata = resolve;
          video.onerror = (e) => {
            this.remoteLog('error', 'Video load error:', e.message || 'unknown');
            reject(e);
          };
          video.load();
        });
        
        this.remoteLog('log', 'Video ready, sending confirmation');
        
        // Store video for when we receive start playback message
        this.pendingVideo = video;
        
        // Signal to SettingsView that video is loaded and ready
        this.streamlabs.postMessage('isVideoSourceInBrowserSourceLoaded', { isVideoSourceInBrowserSourceLoaded: true });
        
      } catch (err) {
        this.remoteLog('error', 'Error loading video from base64:', err.message);
        this.error = 'Failed to load replay video';
        this.loading = false;
      }
    },

    // IndexedDB helpers for cross-view video sharing
    openVideoDatabase() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('SceneVisualizerVideos', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('videos')) {
            db.createObjectStore('videos');
          }
        };
      });
    },

    async getVideoFromIndexedDB(key) {
      try {
        const db = await this.openVideoDatabase();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(['videos'], 'readonly');
          const store = transaction.objectStore('videos');
          const request = store.get(key);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
          transaction.oncomplete = () => db.close();
        });
      } catch (err) {
        this.remoteLog('error', 'Error reading from IndexedDB:', err.message);
        return null;
      }
    }
  }
};
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.scene-collection-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.three-container {
  width: 100%;
  height: 100%;
}

.loading-overlay,
.error-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #80f5d2;
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.error-overlay {
  color: #e27474;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(128, 245, 210, 0.3);
  border-top-color: #80f5d2;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
