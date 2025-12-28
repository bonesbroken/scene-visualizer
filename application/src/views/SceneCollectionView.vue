<template>
  <div class="scene-collection-container">
    <div ref="threeContainer" class="three-container"></div>
    <!-- 2px progress bar at bottom -->
    <div v-if="isPlaying" class="playback-progress-overlay">
      <div class="playback-progress-fill" :style="{ width: playbackProgress + '%' }"></div>
    </div>
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
import { applyCameraIntroAnimation, executeSceneTimeline, cancelAllAnimations } from '@/utils/cameraAnimations';

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
      
      // Chunked transfer state
      chunkBuffer: [],
      chunkMetadata: null,
      receivedChunks: 0,
      totalChunks: 0,
      
      // Video element reference for message handler
      pendingVideo: null,
      
      // Pre-computed camera timeline from SettingsView
      cameraTimeline: null,
      
      // Three.js objects - stored outside of Vue reactivity
      threeInitialized: false,
      animationFrameId: null,
      
      // Video playback
      isPlaying: false,
      videoDuration: 0,
      playbackProgress: 0,
    };
  },
  computed: {
  },
  mounted() {
    this.initStreamlabs();
  },
  beforeUnmount() {
    this.clearAnimationTimeouts();
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
          
          if (event.type === 'loadReplayFromBase64') {
            //this.remoteLog('log', 'Processing loadReplayFromBase64, data length:', event.data.base64?.length || 0);
            await this.loadAndDisplayReplayFromBase64(event.data);
          } else if (event.type === 'loadReplayChunkStart') {
            // Start of chunked transfer
            this.chunkBuffer = [];
            this.chunkMetadata = event.data;
            this.receivedChunks = 0;
            this.totalChunks = event.data.totalChunks;
            const sizeMB = ((event.data.totalSize * 0.75) / (1024 * 1024)).toFixed(1);
            //this.remoteLog('log', `Starting chunked receive: ${this.totalChunks} chunks, ${sizeMB}MB`);
          } else if (event.type === 'loadReplayChunk') {
            // Receive a chunk
            this.chunkBuffer[event.data.chunkIndex] = event.data.chunk;
            this.receivedChunks++;
          } else if (event.type === 'loadReplayChunkEnd') {
            // All chunks received, reassemble and process
            //this.remoteLog('log', `Received ${this.receivedChunks}/${this.totalChunks} chunks, reassembling...`);
            
            // Validate all chunks are present
            let missingChunks = [];
            for (let i = 0; i < this.totalChunks; i++) {
              if (!this.chunkBuffer[i]) {
                missingChunks.push(i);
              }
            }
            
            if (missingChunks.length > 0) {
              this.remoteLog('error', `Missing ${missingChunks.length} chunks: ${missingChunks.slice(0, 5).join(', ')}${missingChunks.length > 5 ? '...' : ''}`);
              this.loading = false;
              this.error = 'Video transfer incomplete';
              this.chunkBuffer = [];
              this.chunkMetadata = null;
              return;
            }
            
            const base64 = this.chunkBuffer.join('');
            const expectedSize = this.chunkMetadata.totalSize;
            this.remoteLog('log', `Reassembled base64: ${base64.length} chars (expected: ${expectedSize})`);
            
            this.chunkBuffer = []; // Clear buffer
            
            // Process the reassembled data
            await this.loadAndDisplayReplayFromBase64({
              base64: base64,
              mimeType: this.chunkMetadata.mimeType,
              fileName: this.chunkMetadata.fileName,
              cameraTimeline: this.chunkMetadata.cameraTimeline
            });
            this.chunkMetadata = null;
          } else if (event.type === 'startVideoSourcePlaybackInBrowserSource') {
            this.remoteLog('log', 'Processing startVideoSourcePlaybackInBrowserSource...');
            if (event.data.isVideoSourceInBrowserSourceLoaded === true && this.pendingVideo) {
              await this.startVideoPlayback();
            }
          }
        });
        
        // Send a test message to confirm SceneCollectionView is alive
        this.remoteLog('log', 'SceneCollectionView ready, onMessage registered');
        
        // Initialize Three.js
        this.initThreeJS();
        
        this.loading = false;
      } catch (err) {
        this.remoteLog('error', 'Error initializing:', err.message);
        this.error = 'Failed to initialize';
        this.loading = false;
      }
    },
    
    async startVideoPlayback() {
      if (!this.pendingVideo) {
        console.warn('SceneCollectionView: startVideoPlayback called but no pendingVideo');
        return;
      }
      
      const video = this.pendingVideo;
      this.pendingVideo = null;
      
      // Store video for cleanup
      this._video = video;
      
      try {
        this._threeRenderer.setClearColor(0x000000, 1); // Black background
        this._threeScene.background = new THREE.Color(0x000000); // Black background
        // Start playing and animate camera simultaneously
        this.isPlaying = true;
        this.videoDuration = video.duration * 1000;
        
        // Schedule camera animations from pre-computed timeline
        if (this.cameraTimeline && this.cameraTimeline.scenes && this.cameraTimeline.scenes.length > 0) {
          //this.remoteLog('log', `Starting timeline animations for ${this.cameraTimeline.scenes.length} scenes`);
          this.scheduleCameraTimeline(video);
        } else {
          // Fallback to simple intro animation
          //this.remoteLog('log', 'No camera timeline, using simple intro animation');
          applyCameraIntroAnimation(this._threeCamera, this._threeControls);
        }
        
        // Start video playback
        await video.play();
        //this.remoteLog('log', 'Video playing:', video.videoWidth, 'x', video.videoHeight);
        
        // Track playback progress
        video.ontimeupdate = () => {
          if (video.duration > 0) {
            this.playbackProgress = (video.currentTime / video.duration) * 100;
          }
        };
        
        // Listen for video end and notify SettingsView
        video.onended = () => {
          //this.remoteLog('log', 'Playback ended!');
          this.isPlaying = false;
          this.playbackProgress = 0;
          // Clear any pending animation timeouts
          this.clearAnimationTimeouts();
          // Signal to SettingsView that playback has finished
          this.streamlabs.postMessage('videoPlaybackEnded', { ended: true });
          this._threeRenderer.setClearColor(0x000000, 0); // Black background
          this._threeScene.background = null; // Black background
          this._threePlane.visible = false;
        };
        
        this.loading = false;
        //this.remoteLog('log', 'Playback started!');
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
      
      // Create renderer with clear background
      this._threeRenderer = markRaw(new THREE.WebGLRenderer({ antialias: true }));
      this._threeRenderer.setClearColor(0x000000, 0); // Clear background
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
        
        const { base64, mimeType, fileName, cameraTimeline } = data;
        
        // Store pre-computed camera timeline for playback
        if (cameraTimeline) {
          this.cameraTimeline = cameraTimeline;
          this.remoteLog('log', `Received camera timeline for ${cameraTimeline.scenes?.length || 0} scenes`);
        }
        
        if (!base64) {
          this.remoteLog('error', 'No base64 data received');
          this.loading = false;
          return;
        }
        
        //this.remoteLog('log', `Converting base64 to blob, length: ${base64.length}`);
        
        // Convert base64 back to blob with error handling
        let binaryString;
        try {
          binaryString = atob(base64);
        } catch (e) {
          this.remoteLog('error', `Base64 decode failed: ${e.message}`);
          this.loading = false;
          this.error = 'Failed to decode video data';
          return;
        }
        
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mimeType || 'video/mp4' });
        
        this.remoteLog('log', `Created blob, size: ${(blob.size / (1024 * 1024)).toFixed(2)}MB`);
        const videoUrl = URL.createObjectURL(blob);
        //this.remoteLog('log', `Created blob URL: ${videoUrl}`);
        
        // Store blob URL for cleanup
        this._currentBlobUrl = videoUrl;
        
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
        
        this.remoteLog('log', 'Video data loaded, setting up Three.js');
        
        // === SET UP THREE.JS BEFORE SIGNALING READY ===
        // This ensures the first frame is rendered when replay buffer starts recording
        
        // Dispose old texture if exists
        if (this._threeTexture) {
          this._threeTexture.dispose();
        }
        
        // Create VideoTexture from the video element
        this._threeTexture = markRaw(new THREE.VideoTexture(video));
        this._threeTexture.minFilter = THREE.LinearFilter;
        this._threeTexture.magFilter = THREE.LinearFilter;
        this._threeTexture.format = THREE.RGBAFormat;
        this._threeTexture.colorSpace = THREE.SRGBColorSpace;
        
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
          
          // Re-fit camera to the target position (animation will start from further back)
          this.fitToRect(this._threePlane);
          
          // Wait a frame for camera position to be fully set
          await new Promise(resolve => requestAnimationFrame(resolve));
          
          console.log('SceneCollectionView: Three.js setup complete, camera.z =', this._threeCamera.position.z);
        }
        
        // Store video for when we receive start playback message
        this.pendingVideo = video;
        this._video = video; // Also store for cleanup in disposeThreeJS
        
        // Signal to SettingsView that video is loaded and Three.js is ready
        this.streamlabs.postMessage('isVideoSourceInBrowserSourceLoaded', { isVideoSourceInBrowserSourceLoaded: true });
        //this.remoteLog('log', 'Sent ready signal to SettingsView');
        
      } catch (err) {
        this.remoteLog('error', 'Error loading video from base64:', err.message);
        this.error = 'Failed to load replay video';
        this.loading = false;
      }
    },
    
    /**
     * Clear any scheduled animation timeouts
     */
    clearAnimationTimeouts() {
      if (this._animationTimeouts) {
        this._animationTimeouts.forEach(t => clearTimeout(t));
        this._animationTimeouts = [];
      }
    },
    
    /**
     * Schedule camera animations to match scene timing during video playback
     * Uses the scene timing data passed from SettingsView
     */
    scheduleCameraTimeline(video) {
      // Clear any existing scheduled animations
      this.clearAnimationTimeouts();
      this._animationTimeouts = [];
      
      const { scenes } = this.cameraTimeline;
      
      scenes.forEach((sceneTimeline) => {
        const { name, startTimeMs } = sceneTimeline;
        
        //this.remoteLog('log', `Scheduling timeline for scene "${name}" at ${startTimeMs}ms`);
        
        // Schedule animation to trigger when video reaches this scene's start time
        const timeout = setTimeout(() => {
          // Only trigger if video is still playing
          if (!this.isPlaying || !video || video.paused) return;
          
          const videoTimeMs = video.currentTime * 1000;
          //this.remoteLog('log', `Executing timeline for scene "${name}" at video time ${videoTimeMs}ms`);
          
          // Execute the pre-computed animation sequence
          executeSceneTimeline(this._threeControls, sceneTimeline);
        }, startTimeMs);
        
        this._animationTimeouts.push(timeout);
      });
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

/* 2px progress bar overlay at bottom */
.playback-progress-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: rgba(0, 0, 0, 0.5);
  z-index: 10;
  display: none;
}

.playback-progress-overlay .playback-progress-fill {
  height: 100%;
  background: #80f5d2;
  transition: width 0.1s linear;
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