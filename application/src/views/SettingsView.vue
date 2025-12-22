<template>
  <div class="dashboard" :class="themeClass">
    <!-- Debug Icon Grid -->
    <div class="debug-icon-section" style="display: none">
      <h2 class="debug-title">Icon Font Debug ({{ debugIcons.length }} icons)</h2>
      <div class="debug-icon-grid">
        <div 
          v-for="icon in debugIcons" 
          :key="icon.name" 
          class="debug-icon-item"
          :title="icon.name"
        >
          <span :class="icon.name" class="debug-icon"></span>
          <span class="debug-icon-tooltip">{{ icon.name }}<br/>{{ icon.code }}</span>
        </div>
      </div>
    </div>

    <!-- Active Scene Collection Section -->
    <div class="active-collection-section">
      
      <!-- Three.js Scene Container -->
      <div 
        class="canvas-container" 
        v-if="!activeCollectionLoading && activeSelectedSceneId"
        :style="{ height: canvasContainerHeight + 'px' }"
      >
        <!-- Hidden 2D canvas for drawing scene sources -->
        <canvas 
          ref="sceneCanvas" 
          class="scene-canvas-hidden"
          :width="canvasBaseWidth"
          :height="canvasBaseHeight"
        ></canvas>
        <!-- Three.js WebGL renderer canvas -->
        <div ref="threeContainer" class="three-container"></div>
        <!-- Resize handle -->
        <div 
          class="resize-handle"
          @mousedown="startResize"
          title="Drag to resize"
        >
          <span class="resize-handle-icon"></span>
        </div>
      </div>
      
      <div class="action-buttons-row">
        <!-- Notifications Demo Section -->
        <div class="notifications-demo" style="display: none">
          <button class="notification-btn info" @click="pushNotification('INFO')">
            <span class="icon-information"></span>
            Info
          </button>
          <button class="notification-btn warning" @click="pushNotification('WARNING')">
            <span class="icon-alert-box"></span>
            Warning
          </button>
          <button class="notification-btn success" @click="pushNotification('SUCCESS')">
            <span class="icon-check"></span>
            Success
          </button>
        </div>
        <div class="playback-controls-buttons">
          <button 
            class="playback-btn play-scenes-btn" 
            :class="{ active: isRecordingScenes }"
            :disabled="playableScenes.length <= 1 || isPreviewPlaying || isStartingRecording"
            @click="isRecordingScenes ? stopSceneCycling(true) : showRecordingModal = true"
          >
            <span v-if="isStartingRecording" class="spinner-small"></span>
            <span v-else :class="isRecordingScenes ? 'fa-solid fa-stop' : 'icon-playing'"></span>
            {{ isStartingRecording ? 'Starting...' : (isRecordingScenes ? 'Stop' : 'Record Scenes') }}
          </button>
          <button 
            v-if="lastReplayBufferFileId"
            class="playback-btn preview-btn"
            :class="{ active: isPreviewPlaying }"
            :disabled="isRecordingScenes"
            @click="isPreviewPlaying ? stopPreview() : displayPreviewOnPlane()"
          >
            <span :class="isPreviewPlaying ? 'fa-solid fa-stop' : 'icon-replay-buffer'"></span>
            {{ isPreviewPlaying ? 'Stop' : 'Preview' }}
          </button>
          <button 
            v-if="lastReplayBufferFileId"
            class="playback-btn export-btn"
            :disabled="isPreviewPlaying || isRecordingScenes || isExporting"
            @click="exportReplayToScene()"
          >
            <span v-if="isExporting" class="spinner-small"></span>
            <span v-else class="icon-share"></span>
            {{ isExporting ? 'Exporting...' : 'Export' }}
          </button>
        </div>
      </div>
      <!-- Playback Controls Section - Full Width Row -->
      <div v-if="isRecordingScenes || isPreviewPlaying" class="playback-controls-section full-width">
        <div class="playback-progress-section">
          <span :class="isPreviewPlaying ? 'icon-replay-buffer' : 'icon-playing'" class="playback-icon"></span>
          <div class="playback-progress-bar">
            <div 
              class="playback-progress-fill" 
              :style="{ width: playbackProgress + '%' }"
            ></div>
            <!-- Scene divider lines -->
            <template v-if="isRecordingScenes && scenesToCycle.length > 1">
              <div 
                v-for="n in (scenesToCycle.length - 1)" 
                :key="n" 
                class="scene-divider" 
                :style="{ left: (n / scenesToCycle.length * 100) + '%' }"
              ></div>
            </template>
          </div>
          <span class="playback-timecode">{{ formatPlaybackTime(playbackElapsed) }} / {{ formatPlaybackTime(playbackTotalDuration) }}</span>
        </div>
      </div>
      
      
      
      <div v-if="activeCollectionLoading" class="loading">
        <span class="spinner"></span>
        Loading active collection...
      </div>
      
      <div v-else class="two-column-layout">
        <!-- Left column: Active Scenes list -->
        <div class="column scenes-column">
          <div class="column-header">
            <span class="section-name">Active Scene Collection ({{ playableScenes.length }}/{{ activeScenes.length }} Scenes)</span>
            <button class="view-collections-btn icon-only" @click="showCollectionsModal = true" title="View Scene Collections">
              <span class="fas fa-folder"></span>
            </button>
          </div>
          <div class="column-content">
            <div 
              v-for="scene in activeScenes" 
              :key="scene.id" 
              class="scene-list-item"
              :class="{ 'selected': activeSelectedSceneId === scene.id, 'is-active': activeSceneData?.id === scene.id, 'is-excluded': excludedSceneIds[scene.id] }"
              @click="selectActiveScene(scene.id)"
            >
              <button 
                class="scene-visibility-btn"
                :class="{ 'excluded': excludedSceneIds[scene.id] }"
                :disabled="isRecordingScenes || isPreviewPlaying"
                @click.stop="toggleSceneExclusion(scene.id)"
                :title="excludedSceneIds[scene.id] ? 'Include in recording' : 'Exclude from playback'"
              >
                <span :class="excludedSceneIds[scene.id] ? 'icon-hide' : 'icon-view'"></span>
              </button>
              <span class="item-name">{{ scene.name }}</span>
              <span class="active-indicator" v-if="activeSceneData?.id === scene.id">●</span>
            </div>
            <div v-if="!activeScenes.length" class="empty-state">
              No scenes
            </div>
          </div>
        </div>
        
        <!-- Right column: Sources for selected active scene -->
        <div class="column sources-column">
          <div class="column-header">
            <span class="section-name">Sources</span>
            <div class="display-toggle-buttons">
              <button 
                class="display-toggle-btn" 
                :class="{ active: displayMode === 'horizontal' }"
                @click.stop="setDisplayMode('horizontal')"
                title="Show Horizontal"
              >
                <span class="icon-desktop"></span>
              </button>
              <button 
                class="display-toggle-btn" 
                :class="{ active: displayMode === 'vertical' }"
                @click.stop="setDisplayMode('vertical')"
                title="Show Vertical"
              >
                <span class="icon-phone-case"></span>
              </button>
            </div>
          </div>
          <div class="column-content">
            <template v-if="activeSelectedSceneId">
              <template v-for="item in getActiveSceneSourcesWithTransform()" :key="item.nodeId">
                <!-- Folder item -->
                <template v-if="item.isFolder">
                  <div 
                    class="source-list-item expandable folder-item"
                    :class="{ 'expanded': expandedFolders[item.nodeId] }"
                    @click="toggleFolder(item.nodeId)"
                  >
                    <div class="source-header">
                      <span class="item-icon" :class="expandedFolders[item.nodeId] ? 'fa-solid fa-folder-open' : 'fa-solid fa-folder'"></span>
                      <span class="item-name">{{ item.name }} ({{ item.children.length }})</span>
                      <span class="toggle-icon icon-down" :class="{ 'rotated': expandedFolders[item.nodeId] }"></span>
                    </div>
                  </div>
                  <!-- Folder children -->
                  <template v-if="expandedFolders[item.nodeId]">
                    <div 
                      v-for="child in item.children" 
                      :key="child.nodeId" 
                      class="source-list-item expandable folder-child"
                      :class="{ 'expanded': expandedActiveSources[child.nodeId] }"
                      @click="toggleActiveSource(child.nodeId)"
                    >
                      <div class="source-header">
                        <span class="item-icon" :class="isIconClass(getSourceIconFromSource(child.source)) ? getSourceIconFromSource(child.source) : ''">{{ isIconClass(getSourceIconFromSource(child.source)) ? '' : getSourceIconFromSource(child.source) }}</span>
                        <span class="item-name">{{ child.source.name }}</span>
                        <span class="toggle-icon icon-down" :class="{ 'rotated': expandedActiveSources[child.nodeId] }"></span>
                      </div>
                      <div v-if="expandedActiveSources[child.nodeId]" class="source-settings" @click.stop>
                        <div v-if="activeSourceSettings[child.nodeId] === 'loading'" class="settings-loading">
                          Loading settings...
                        </div>
                        <pre v-else-if="activeSourceSettings[child.nodeId]" class="settings-json">{{ formatSettingsWithTransform(activeSourceSettings[child.nodeId], child.source, child.transform) }}</pre>
                        <div v-else class="settings-empty">No settings available</div>
                      </div>
                    </div>
                  </template>
                </template>
                <!-- Regular source item -->
                <div 
                  v-else
                  class="source-list-item expandable"
                  :class="{ 'expanded': expandedActiveSources[item.nodeId] }"
                  @click="toggleActiveSource(item.nodeId)"
                >
                  <div class="source-header">
                    <span class="item-icon" :class="isIconClass(getSourceIconFromSource(item.source)) ? getSourceIconFromSource(item.source) : ''">{{ isIconClass(getSourceIconFromSource(item.source)) ? '' : getSourceIconFromSource(item.source) }}</span>
                    <span class="item-name">{{ item.source.name }}</span>
                    <span class="toggle-icon icon-down" :class="{ 'rotated': expandedActiveSources[item.nodeId] }"></span>
                  </div>
                  <div v-if="expandedActiveSources[item.nodeId]" class="source-settings" @click.stop>
                    <div v-if="activeSourceSettings[item.nodeId] === 'loading'" class="settings-loading">
                      Loading settings...
                    </div>
                    <pre v-else-if="activeSourceSettings[item.nodeId]" class="settings-json">{{ formatSettingsWithTransform(activeSourceSettings[item.nodeId], item.source, item.transform) }}</pre>
                    <div v-else class="settings-empty">No settings available</div>
                  </div>
                </div>
              </template>
              <div v-if="!getActiveSceneSourcesWithTransform().length" class="empty-state">
                No sources in this scene
              </div>
            </template>
            <div v-else class="empty-state">
              Select a scene to view its sources
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Timers Section -->
    <div class="timers-section" style="display: none;">
      <div class="timer-box" :class="{ active: isRecording }">
        <span class="timer-icon icon-rec"></span>
        <span class="timer-label">Recording</span>
        <span class="timer-value">{{ formatTime(recordingElapsed) }}</span>
        <label class="timer-toggle" title="Reset timer on start">
          <input type="checkbox" v-model="resetRecordingOnStart" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="timer-box" :class="{ active: isStreaming }">
        <span class="timer-icon icon-broadcast"></span>
        <span class="timer-label">Streaming</span>
        <span class="timer-value">{{ formatTime(streamingElapsed) }}</span>
        <label class="timer-toggle" title="Reset timer on start">
          <input type="checkbox" v-model="resetStreamingOnStart" />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <!-- Notification Log -->
    <div v-if="notificationLog.length" class="notification-log">
      <div class="notification-log-header">
        <span>Recent Notifications ({{ notificationLog.length }})</span>
        <button class="clear-log-btn" @click="notificationLog = []">
          <span class="icon-trash"></span>
        </button>
      </div>
      <div class="notification-log-items">
        <div 
          v-for="notif in notificationLog" 
          :key="notif.id" 
          class="notification-log-item"
          :class="{ 'is-read': !notif.unread }"
        >
          <span class="notif-type" :class="notif.type.toLowerCase()">{{ notif.type }}</span>
          <span class="notif-message">{{ notif.message }}</span>
          <span class="notif-id">#{{ notif.id }}</span>
          <button 
            v-if="notif.unread" 
            class="mark-read-btn" 
            @click.stop="markNotificationAsRead(notif.id)"
            title="Mark as read"
          >
            <span class="icon-check"></span>
          </button>
        </div>
      </div>
    </div>

    <!-- Scene Collections Modal -->
    <div v-if="showCollectionsModal" class="modal-overlay" @click.self="showCollectionsModal = false">
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title">Scene Collections</h2>
          <button class="modal-close" @click="showCollectionsModal = false">
            <span class="icon-close"></span>
          </button>
        </div>
        <div class="modal-body">
          <div class="tree-container">
            <div v-for="collection in sceneCollectionsSchema" :key="collection.id" class="collection">
              <div class="collection-header" @click="toggleCollection(collection.id)">
                <span class="collection-icon" :class="expandedCollections[collection.id] ? 'fas fa-folder-open' : 'fas fa-folder'"></span>
                <span class="collection-name">{{ collection.name }}</span>
                <span class="toggle-icon icon-down" :class="{ 'rotated': expandedCollections[collection.id] }"></span>
                
              </div>
              
              <div v-if="expandedCollections[collection.id]" class="collection-content">
                <!-- Two column layout -->
                <div class="two-column-layout">
                  <!-- Left column: Scenes list -->
                  <div class="column scenes-column">
                    <div class="column-header column-header-collection">
                      <span class="section-name">Scenes ({{ collection.scenes?.length || 0 }})</span>
                    </div>
                    <div class="column-content">
                      <div 
                        v-for="scene in collection.scenes" 
                        :key="scene.id" 
                        class="scene-list-item"
                        :class="{ 'selected': selectedScenes[collection.id] === scene.id }"
                        @click="selectScene(collection.id, scene.id)"
                      >
                        <span class="item-name">{{ scene.name }}</span>
                      </div>
                      <div v-if="!collection.scenes?.length" class="empty-state">
                        No scenes
                      </div>
                    </div>
                  </div>
                  
                  <!-- Right column: Sources for selected scene -->
                  <div class="column sources-column">
                    <div class="column-header column-header-collection">
                      <span class="section-name">Sources</span>
                    </div>
                    <div class="column-content">
                      <template v-if="selectedScenes[collection.id]">
                        <div 
                          v-for="item in getSelectedSceneItems(collection)" 
                          :key="item.id" 
                          class="source-list-item"
                        >
                          <span class="item-icon" :class="isIconClass(getSourceIcon(item.sourceId, collection.sources)) ? getSourceIcon(item.sourceId, collection.sources) : ''">{{ isIconClass(getSourceIcon(item.sourceId, collection.sources)) ? '' : getSourceIcon(item.sourceId, collection.sources) }}</span>
                          <span class="item-name">{{ getSourceName(item.sourceId, collection.sources) }}</span>
                        </div>
                        <div v-if="!getSelectedSceneItems(collection)?.length" class="empty-state">
                          No sources in this scene
                        </div>
                      </template>
                      <div v-else class="empty-state">
                        Select a scene to view its sources
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Recording Settings Modal -->
    <div v-if="showRecordingModal" class="modal-overlay" @click.self="showRecordingModal = false">
      <div class="modal-content recording-modal">
        <div class="modal-header">
          <h2 class="modal-title">
            <span class="icon-playing"></span>
            Record Scenes
          </h2>
          <button class="modal-close" @click="showRecordingModal = false">
            <span class="icon-close"></span>
          </button>
        </div>
        <div class="modal-body">
          <div class="recording-settings">
            <div class="setting-row">
              <label class="setting-label">
                <span class="icon-time"></span>
                Scene Duration (ms)
              </label>
              <input 
                type="number" 
                class="setting-input"
                v-model.number="sceneDuration"
                min="1000"
                max="60000"
                step="500"
              />
            </div>
            <div class="setting-row">
              <label class="setting-label">
                <span class="icon-transition"></span>
                Transition Time (ms)
              </label>
              <input 
                type="number" 
                class="setting-input"
                v-model.number="transitionTime"
                min="0"
                max="10000"
                step="1"
              />
            </div>
            <div class="setting-info">
              <span class="icon-information"></span>
              Each scene will be shown for {{ (sceneDuration / 1000).toFixed(1) }}s plus {{ (transitionTime / 1000).toFixed(1) }}s transition time, for a {{ expectedRecordingDuration }} video duration.
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <div v-if="outputFilePath" class="output-path-note">
            <span class="icon-folder"></span>
            Videos output destination: {{ outputFilePath }}
          </div>
          <div class="modal-actions">
            <button class="modal-btn cancel-btn" @click="showRecordingModal = false">
              Cancel
            </button>
            <button class="modal-btn start-btn" @click="confirmStartRecording">
              <span class="icon-playing"></span>
              Start Recording
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!-- Disclaimer -->
  <div class="disclaimer">
    <p>Have issues, feedback, or a suggestion? Reach out via <span class="modal-link" @click="openExternalLink('https://twitter.com/bonesbrokencom')">X</span> or <span class="modal-link" @click="openExternalLink('https://discord.gg/XgZKP9nYU7')">Discord</span>.</p>
  </div>
</template>

<script>
import * as THREE from 'three';
import CameraControls from 'camera-controls';
import { markRaw } from 'vue';
import gsap from 'gsap';

// Install CameraControls with THREE
CameraControls.install({ THREE: THREE });

export default {
  name: 'SettingsView',
  data() {
    return {
      streamlabs: null,
      streamlabsOBS: null,
      existingSource: null,
      // Three.js objects - stored outside of Vue reactivity
      // (actual objects stored in non-reactive properties)
      threeInitialized: false,
      animationFrameId: null,
     
      availableScenes: [],
      activeSceneId: null,
      selectedSceneId: null,
      canAddSource: false,
      currentSourceType: null,
      
      // Scene collections data
      sceneCollectionsSchema: [],
      loading: true,
      error: null,
      
      // Active collection data
      activeCollectionLoading: true,
      activeScenes: [],
      activeSceneData: null,
      activeSources: [],
      activeSelectedSceneId: null,
      expandedActiveSources: {},
      activeSourceSettings: {},
      displayMode: 'horizontal', // 'horizontal' or 'vertical'
      currentTheme: null, // 'day' or 'night' - null until API responds
      showCollectionsModal: false, // Scene collections modal visibility
      
      // Notifications demo
      notificationLog: [],
      notificationCounter: 0,
      
      // Streaming/Recording timers
      recordingElapsed: 0,
      recordingTimerInterval: null,
      isRecording: false,
      resetRecordingOnStart: true,
      streamingElapsed: 0,
      streamingTimerInterval: null,
      isStreaming: false,
      resetStreamingOnStart: true,
      
      // Scene cycling
      isRecordingScenes: false,
      isExporting: false, // Loading state for export button
      isStartingRecording: false, // Loading state for record button
      showRecordingModal: false,
      sceneCycleTimeout: null, // Timeout for first scene
      sceneCycleInterval: null,
      currentSceneIndex: 0,
      scenesToCycle: [], // Snapshot of scenes to play during a cycle
      recordingTimeline: [], // Timeline of recording events for display
      sceneDuration: 5000,
      transitionTime: 300,
      playbackProgress: 0,
      playbackStartTime: null,
      playbackAnimationId: null,
      playbackElapsed: 0,
      playbackTotalDuration: 0,
      excludedSceneIds: {}, // Track which scene IDs are excluded from cycling
      
      // Replay buffer
      lastReplayBufferFileId: null,
      replaySaveResolver: null,
      isPreviewPlaying: false,
      isExportingSave: false, // Flag to prevent updating lastReplayBufferFileId during export
      outputFilePath: '',
      
      // Canvas dimensions (1920x1080 base resolution)
      canvasBaseWidth: 1920,
      canvasBaseHeight: 1080,
      
      // Resizable canvas container
      canvasContainerHeight: 500,
      isResizing: false,
      resizeStartY: 0,
      resizeStartHeight: 0,
      
      // Tree expansion state
      expandedCollections: {},
      expandedFolders: {}, // Track which folder sources are expanded
      // Selected scene per collection
      selectedScenes: {},
      
      // Debug icons list
      debugIcons: [
        { name: 'icon-add', code: '\\e91a' },
        { name: 'icon-add-circle', code: '\\e91b' },
        { name: 'icon-add-folder', code: '\\e91c' },
        { name: 'icon-advanced', code: '\\e934' },
        { name: 'icon-ai', code: '\\ea2f' },
        { name: 'icon-alert-box', code: '\\e935' },
        { name: 'icon-align-center-horizontal', code: '\\e98b' },
        { name: 'icon-align-center-vertical', code: '\\e98c' },
        { name: 'icon-announcement', code: '\\e936' },
        { name: 'icon-audio', code: '\\e937' },
        { name: 'icon-back', code: '\\e91d' },
        { name: 'icon-badge', code: '\\e938' },
        { name: 'icon-bitrate', code: '\\e939' },
        { name: 'icon-broadcast', code: '\\e93a' },
        { name: 'icon-camera', code: '\\e93b' },
        { name: 'icon-camera-off', code: '\\e93c' },
        { name: 'icon-chat-box', code: '\\e93d' },
        { name: 'icon-check', code: '\\e91e' },
        { name: 'icon-check-mark', code: '\\e91f' },
        { name: 'icon-close', code: '\\e920' },
        { name: 'icon-cloud', code: '\\e93e' },
        { name: 'icon-cloud-backup', code: '\\e93f' },
        { name: 'icon-cloudbot', code: '\\e940' },
        { name: 'icon-community', code: '\\e941' },
        { name: 'icon-copy', code: '\\e921' },
        { name: 'icon-cpu', code: '\\e942' },
        { name: 'icon-crop', code: '\\e943' },
        { name: 'icon-dashboard', code: '\\e944' },
        { name: 'icon-date', code: '\\e945' },
        { name: 'icon-delete', code: '\\e922' },
        { name: 'icon-design', code: '\\e946' },
        { name: 'icon-desktop', code: '\\e9a1' },
        { name: 'icon-discord', code: '\\e947' },
        { name: 'icon-donation-settings', code: '\\e948' },
        { name: 'icon-down', code: '\\e923' },
        { name: 'icon-download', code: '\\e901' },
        { name: 'icon-dropped-frames', code: '\\e949' },
        { name: 'icon-dual-output', code: '\\ea2d' },
        { name: 'icon-earnings', code: '\\e94a' },
        { name: 'icon-edit', code: '\\e924' },
        { name: 'icon-editor', code: '\\e908' },
        { name: 'icon-email', code: '\\e94b' },
        { name: 'icon-error', code: '\\e94c' },
        { name: 'icon-event-list', code: '\\e94d' },
        { name: 'icon-expand', code: '\\e925' },
        { name: 'icon-facebook', code: '\\e9a7' },
        { name: 'icon-filter', code: '\\e94e' },
        { name: 'icon-fps', code: '\\e94f' },
        { name: 'icon-full-screen', code: '\\e950' },
        { name: 'icon-graph', code: '\\e952' },
        { name: 'icon-group', code: '\\e953' },
        { name: 'icon-hide', code: '\\e926' },
        { name: 'icon-hotkeys', code: '\\e954' },
        { name: 'icon-image', code: '\\e955' },
        { name: 'icon-information', code: '\\e956' },
        { name: 'icon-instagram', code: '\\e957' },
        { name: 'icon-integrations', code: '\\e958' },
        { name: 'icon-kick', code: '\\ea1c' },
        { name: 'icon-leaderboard', code: '\\e959' },
        { name: 'icon-link', code: '\\e927' },
        { name: 'icon-lock', code: '\\e95a' },
        { name: 'icon-logout', code: '\\e928' },
        { name: 'icon-loyalty', code: '\\e95b' },
        { name: 'icon-media-share', code: '\\e95c' },
        { name: 'icon-menu', code: '\\e9a6' },
        { name: 'icon-mic', code: '\\e95d' },
        { name: 'icon-more', code: '\\e929' },
        { name: 'icon-move', code: '\\e95e' },
        { name: 'icon-multistream', code: '\\e95f' },
        { name: 'icon-music', code: '\\e960' },
        { name: 'icon-mute', code: '\\e961' },
        { name: 'icon-notifications', code: '\\e962' },
        { name: 'icon-output', code: '\\e963' },
        { name: 'icon-overview', code: '\\e964' },
        { name: 'icon-pause', code: '\\e92a' },
        { name: 'icon-platforms', code: '\\e965' },
        { name: 'icon-playing', code: '\\e92b' },
        { name: 'icon-prime', code: '\\e966' },
        { name: 'icon-question', code: '\\e967' },
        { name: 'icon-record', code: '\\e968' },
        { name: 'icon-replay-buffer', code: '\\e969' },
        { name: 'icon-reset', code: '\\e92c' },
        { name: 'icon-resize', code: '\\e96a' },
        { name: 'icon-save', code: '\\e92d' },
        { name: 'icon-search', code: '\\e92e' },
        { name: 'icon-settings', code: '\\e96b' },
        { name: 'icon-share', code: '\\e96c' },
        { name: 'icon-skip', code: '\\e92f' },
        { name: 'icon-smart-record', code: '\\e96d' },
        { name: 'icon-smile', code: '\\e96e' },
        { name: 'icon-sound', code: '\\e96f' },
        { name: 'icon-stats', code: '\\e970' },
        { name: 'icon-store', code: '\\e971' },
        { name: 'icon-stream', code: '\\e972' },
        { name: 'icon-stream-labels', code: '\\e973' },
        { name: 'icon-streamlabs', code: '\\e9f8' },
        { name: 'icon-studio-mode', code: '\\e974' },
        { name: 'icon-team', code: '\\e975' },
        { name: 'icon-text', code: '\\e976' },
        { name: 'icon-themes', code: '\\e977' },
        { name: 'icon-thumbnail', code: '\\e978' },
        { name: 'icon-tiktok', code: '\\e9f9' },
        { name: 'icon-time', code: '\\e979' },
        { name: 'icon-transition', code: '\\e97a' },
        { name: 'icon-trash', code: '\\e930' },
        { name: 'icon-twitch', code: '\\e97b' },
        { name: 'icon-twitter', code: '\\e97c' },
        { name: 'icon-unlock', code: '\\e931' },
        { name: 'icon-user', code: '\\e97d' },
        { name: 'icon-view', code: '\\e932' },
        { name: 'icon-webcam', code: '\\e97e' },
        { name: 'icon-widgets', code: '\\e97f' },
        { name: 'icon-x-twitter', code: '\\ea2c' },
        { name: 'icon-youtube', code: '\\e9b8' },
        { name: 'icon-zoom', code: '\\e933' },
      ],
    }
  },
  computed: {
    themeClass() {
      // Default to night-theme until API provides the actual theme
      if (!this.currentTheme) return 'night-theme';
      return this.currentTheme === 'day' ? 'day-theme' : 'night-theme';
    },
    playableScenes() {
      // Filter out excluded scenes
      return this.activeScenes.filter(scene => !this.excludedSceneIds[scene.id]);
    },
    expectedRecordingDuration() {
      const intervalTime = this.sceneDuration + this.transitionTime;
      const totalMs = this.playableScenes.length * intervalTime;
      const totalSeconds = Math.floor(totalMs / 1000);
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    }
  },
  async mounted() {
    await this.initApp();

  },
  beforeUnmount() {
    // Cleanup Three.js
    this.disposeThreeJS();
    // Cleanup resize listeners
    document.removeEventListener('mousemove', this.doResize);
    document.removeEventListener('mouseup', this.stopResize);
    // Cleanup scene cycling (not manual - component unmounting)
    this.stopSceneCycling(false);
  },
  methods: {
    // Three.js methods
    initThreeJS() {
      const container = this.$refs.threeContainer;
      if (!container) return;
      
      // Get container dimensions
      const width = container.clientWidth || 640;
      const height = container.clientHeight || 360;
      
      // Create clock for delta time
      this._threeClock = markRaw(new THREE.Clock());
      
      // Create scene - use markRaw to prevent Vue reactivity proxy issues
      this._threeScene = markRaw(new THREE.Scene());
      this._threeScene.background = new THREE.Color(0x09161d);
      
      // Create camera - perspective for 3D camera controls
      const aspect = width / height;
      this._threeCamera = markRaw(new THREE.PerspectiveCamera(50, aspect, 0.1, 1000));
      this._threeCamera.position.z = 3;
      
      // Create renderer
      this._threeRenderer = markRaw(new THREE.WebGLRenderer({ antialias: true }));
      this._threeRenderer.setSize(width, height);
      this._threeRenderer.setPixelRatio(window.devicePixelRatio);
      container.appendChild(this._threeRenderer.domElement);
      
      // Add CameraControls
      this._threeControls = markRaw(new CameraControls(this._threeCamera, this._threeRenderer.domElement));
      this._threeControls.dollyToCursor = true;
      this._threeControls.minDistance = 0.5;
      this._threeControls.maxDistance = 20;
      
      // Create texture from 2D canvas
      const canvas2D = this.$refs.sceneCanvas;
      if (canvas2D) {
        this._threeTexture = markRaw(new THREE.CanvasTexture(canvas2D));
        this._threeTexture.minFilter = THREE.LinearFilter;
        this._threeTexture.magFilter = THREE.LinearFilter;
        
        // Create plane geometry with correct aspect ratio
        const planeAspect = this.canvasBaseWidth / this.canvasBaseHeight;
        const planeHeight = 2;
        const planeWidth = planeHeight * planeAspect;
        
        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
        const material = new THREE.MeshBasicMaterial({ 
          map: this._threeTexture,
          transparent: true,
          side: THREE.DoubleSide
        });
        
        this._threePlane = markRaw(new THREE.Mesh(geometry, material));
        this._threeScene.add(this._threePlane);
        
        // Fit camera to the plane
        this.$nextTick(() => {
          this.fitToRect(this._threePlane);
        });
      }
      
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
    
    // Resize handle methods
    startResize(e) {
      this.isResizing = true;
      this.resizeStartY = e.clientY;
      this.resizeStartHeight = this.canvasContainerHeight;
      
      document.addEventListener('mousemove', this.doResize);
      document.addEventListener('mouseup', this.stopResize);
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
    },
    
    doResize(e) {
      if (!this.isResizing) return;
      
      const deltaY = e.clientY - this.resizeStartY;
      let newHeight = this.resizeStartHeight + deltaY;
      
      // Clamp between min and max
      newHeight = Math.max(500, Math.min(1000, newHeight));
      this.canvasContainerHeight = newHeight;
      
      // Update Three.js renderer size
      this.$nextTick(() => {
        this.handleThreeResize();
      });
    },
    
    stopResize() {
      this.isResizing = false;
      document.removeEventListener('mousemove', this.doResize);
      document.removeEventListener('mouseup', this.stopResize);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
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
      
      // Cleanup replay video element and blob URL
      if (this._replayVideo) {
        this._replayVideo.pause();
        if (this._replayVideo.src) {
          URL.revokeObjectURL(this._replayVideo.src);
        }
        this._replayVideo = null;
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
    
    updateThreePlane() {
      // Update the plane geometry when canvas dimensions change
      if (!this._threePlane || !this.$refs.threeContainer) return;
      
      const planeAspect = this.canvasBaseWidth / this.canvasBaseHeight;
      const planeHeight = 2;
      const planeWidth = planeHeight * planeAspect;
      
      this._threePlane.geometry.dispose();
      this._threePlane.geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
      
      // Re-fit camera to the updated plane
      this.fitToRect(this._threePlane);
    },
    
    // Canvas methods
    getSelectedSceneNodes() {
      if (!this.activeSelectedSceneId) return [];
      const scene = this.activeScenes.find(s => s.id === this.activeSelectedSceneId);
      if (!scene?.nodes) return [];
      
      // Filter nodes by displayMode - each node is unique (same source can appear multiple times)
      return scene.nodes.filter(node => {
        // Only include nodes matching the current display mode
        if (node.display !== this.displayMode) return false;
        // Skip folders
        if (node.type === 'folder') return false;
        return true;
      });
    },
    
    setDisplayMode(mode) {
      this.displayMode = mode;
      // Update canvas dimensions based on display mode
      if (mode === 'vertical') {
        this.canvasBaseWidth = 1080;
        this.canvasBaseHeight = 1920;
      } else {
        this.canvasBaseWidth = 1920;
        this.canvasBaseHeight = 1080;
      }
      // Redraw canvas with new display mode
      this.$nextTick(() => {
        this.drawCanvas();
        // Update Three.js plane geometry for new aspect ratio
        this.updateThreePlane();
      });
    },
    
    getSourceNameById(sourceId) {
      const source = this.activeSources.find(s => s.id === sourceId);
      return source?.name || 'Unknown';
    },
    
    getSourceById(sourceId) {
      return this.activeSources.find(s => s.id === sourceId);
    },
    
    drawCanvas() {
      const canvas = this.$refs.sceneCanvas;
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      const nodes = this.getSelectedSceneNodes();
      
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw background grid
      ctx.strokeStyle = 'rgba(128, 245, 210, 0.05)';
      ctx.lineWidth = 1;
      const gridSize = canvas.width / 10;
      for (let x = 0; x <= canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y <= canvas.height; y += gridSize * (9/16)) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
      
      // Log table of node data
      /*
      console.log('Raw nodes:', nodes);
      const tableData = nodes
        .map(node => {
          const source = this.getSourceById(node.sourceId);
          if (!source?.name) return null;
          const transform = node.transform || {};
          return {
            'Source Name': source.name,
            'Position X': transform.position?.x ?? 0,
            'Position Y': transform.position?.y ?? 0,
            'Scale X': transform.scale?.x ?? 1,
            'Scale Y': transform.scale?.y ?? 1,
            'Size Width': source.size?.width || 0,
            'Size Height': source.size?.height || 0
          };
        })
        .filter(Boolean);
      
      if (tableData.length > 0) {
        console.table(tableData);
      }
        */
      
      // Draw each node
      nodes.forEach(node => {
        // Skip hidden nodes
        if (node.visible === false) return;
        
        // Get source data for name and size
        const source = this.getSourceById(node.sourceId);
        const sourceName = source?.name;
        
        // Skip nodes without a source name
        if (!sourceName) return;
        
        const t = node.transform || {};
        const baseX = t.position?.x || 0;
        const baseY = t.position?.y || 0;
        const scaleX = t.scale?.x || 1;
        const scaleY = t.scale?.y || 1;
        const rotation = t.rotation || 0;
        
        // Get crop values (in pixels)
        const crop = t.crop || {};
        const cropTop = crop.top || 0;
        const cropBottom = crop.bottom || 0;
        const cropLeft = crop.left || 0;
        const cropRight = crop.right || 0;
        
        const sourceWidth = source?.size?.width || 100;
        const sourceHeight = source?.size?.height || 100;
        
        // Calculate base dimensions with scale
        const scaledWidth = sourceWidth * scaleX;
        const scaledHeight = sourceHeight * scaleY;
        
        // Apply crop to dimensions (crop values are scaled)
        const width = scaledWidth - (cropLeft * scaleX) - (cropRight * scaleX);
        const height = scaledHeight - (cropTop * scaleY) - (cropBottom * scaleY);
        
        // Adjust position for crop (crop.left moves content left, crop.top moves content down)
        const x = baseX + (cropLeft * scaleX);
        const y = baseY + (cropTop * scaleY);
        
        ctx.save();
        
        // Apply rotation around center of node
        if (rotation !== 0) {
          const centerX = x + width / 2;
          const centerY = y + height / 2;
          ctx.translate(centerX, centerY);
          ctx.rotate(rotation * Math.PI / 180);
          ctx.translate(-centerX, -centerY);
        }
        
        // Draw rectangle - use different colors for media sources
        const sourceType = source?.type;
        let strokeColor;
        if (sourceType === 'image_source' || sourceType === 'ffmpeg_source') {
          ctx.fillStyle = 'rgba(226, 116, 116, 0.05)';
          strokeColor = 'rgb(226, 116, 116)';
        } else {
          ctx.fillStyle = 'rgba(116, 226, 172, 0.05)';
          strokeColor = 'rgb(116, 226, 172)';
        }
        ctx.lineWidth = 2;
        
        // Draw fill first (solid rectangle)
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 4);
        ctx.fill();
        
        // Draw each side separately - dashed if cropped, solid otherwise
        ctx.strokeStyle = strokeColor;
        
        // Helper to draw a line segment
        const drawLine = (x1, y1, x2, y2, isCropped) => {
          ctx.beginPath();
          ctx.setLineDash(isCropped ? [6, 4] : []);
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        };
        
        // Top line
        drawLine(x, y, x + width, y, cropTop > 0);
        // Right line
        drawLine(x + width, y, x + width, y + height, cropRight > 0);
        // Bottom line
        drawLine(x + width, y + height, x, y + height, cropBottom > 0);
        // Left line
        drawLine(x, y + height, x, y, cropLeft > 0);
        
        // Reset line dash for other drawing
        ctx.setLineDash([]);
        
        // Draw resize handles (8 small white squares on edges)
        const handleSize = 6;
        const halfHandle = handleSize / 2;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 1;
        
        const drawHandle = (hx, hy) => {
          ctx.fillRect(hx - halfHandle, hy - halfHandle, handleSize, handleSize);
          ctx.strokeRect(hx - halfHandle, hy - halfHandle, handleSize, handleSize);
        };
        
        // Top row: left, middle, right
        drawHandle(x, y);
        drawHandle(x + width / 2, y);
        drawHandle(x + width, y);
        
        // Middle row: left, right
        drawHandle(x, y + height / 2);
        drawHandle(x + width, y + height / 2);
        
        // Bottom row: left, middle, right
        drawHandle(x, y + height);
        drawHandle(x + width / 2, y + height);
        drawHandle(x + width, y + height);
        
        // Draw label
        ctx.fillStyle = '#80f5d2';
        ctx.font = '14px Roboto, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Add text shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        
        // Truncate text if too long
        const maxWidth = width - 10;
        let displayName = sourceName;
        let textWidth = ctx.measureText(displayName).width;
        if (textWidth > maxWidth && maxWidth > 20) {
          while (textWidth > maxWidth && displayName.length > 3) {
            displayName = displayName.slice(0, -1);
            textWidth = ctx.measureText(displayName + '...').width;
          }
          displayName += '...';
        }
        
        ctx.fillText(displayName, x + width / 2, y + height / 2, maxWidth);
        
        ctx.restore();
      });
    },
    
    async loadObsSettings() {
      try {
        const settings = await this.streamlabsOBS.v1.ObsSettings.getSettings();
        console.log('OBS Settings:', settings);
        
        // Parse Video.Base resolution (e.g., "1920x1080")
        if (settings?.Video?.Base) {
          const [width, height] = settings.Video.Base.split('x').map(Number);
          if (width && height) {
            this.canvasBaseWidth = width;
            this.canvasBaseHeight = height;
            //console.log(`Canvas resolution set to ${width}x${height}`);
          }
        }
        
        // Get output file path
        if (settings?.Output?.FilePath) {
          this.outputFilePath = settings.Output.FilePath;
        }
      } catch (err) {
        console.error('Error loading OBS settings:', err);
      }
    },
    
    // Active collection methods
    async loadActiveCollection() {
      try {
        this.activeCollectionLoading = true;
        
        // Get scenes, active scene, and sources in parallel
        const [scenes, activeScene, sources] = await Promise.all([
          this.streamlabsOBS.v1.Scenes.getScenes(),
          this.streamlabsOBS.v1.Scenes.getActiveScene(),
          this.streamlabsOBS.v1.Sources.getSources()
        ]);
        
        //console.log('Active Collection - Scenes:', scenes);
        //console.log('Active Collection - Active Scene:', activeScene);
        //console.log('Active Collection - Sources:', sources);
        
        this.activeScenes = scenes || [];
        this.activeSceneData = activeScene;
        this.activeSources = sources || [];
        
        // Auto-select the first scene in the array
        if (this.activeScenes.length > 0) {
          this.activeSelectedSceneId = this.activeScenes[0].id;
          
          // Draw canvas after data loads and DOM updates
          // Use double nextTick to ensure canvas element exists
          this.$nextTick(() => {
            this.$nextTick(() => {
              this.drawCanvas();
              // Initialize Three.js after first draw
              if (!this.threeInitialized) {
                this.initThreeJS();
              }
            });
          });
        }
        
      } catch (err) {
        console.error('Error loading active collection:', err);
      } finally {
        this.activeCollectionLoading = false;
      }
    },
    
    async reloadActiveCollection() {
      // Clear cached settings so they reload on expand
      this.expandedActiveSources = {};
      this.activeSourceSettings = {};
      //await this.loadObsSettings();
      
      // Dispose existing Three.js instance before reload
      // This ensures it gets properly re-initialized after navigation
      this.disposeThreeJS();
      
      await this.loadActiveCollection();
    },
    
    async selectActiveScene(sceneId) {
      this.activeSelectedSceneId = sceneId;
      
      // Redraw canvas when scene changes
      this.$nextTick(() => {
        this.drawCanvas();
        // Re-fit camera to plane after scene change
        if (this._threePlane && this._threeControls) {
          this.fitToRect(this._threePlane);
        }
      });
    },
    
    toggleSceneExclusion(sceneId) {
      this.excludedSceneIds = {
        ...this.excludedSceneIds,
        [sceneId]: !this.excludedSceneIds[sceneId]
      };
    },

    
    getActiveSceneSources() {
      if (!this.activeSelectedSceneId) return [];
      
      const scene = this.activeScenes.find(s => s.id === this.activeSelectedSceneId);
      if (!scene?.nodes) return [];
      
      // Get source IDs from scene nodes and find matching sources
      // Only include horizontal display nodes, remove duplicates by name
      const seenNames = new Set();
      return scene.nodes
        .filter(node => node.display === 'horizontal' && node.type !== 'folder')
        .map(node => this.activeSources.find(s => s.id === node.sourceId))
        .filter(source => {
          if (!source) return false;
          if (seenNames.has(source.name)) return false;
          seenNames.add(source.name);
          return true;
        });
    },
    
    getActiveSceneSourcesWithTransform() {
      if (!this.activeSelectedSceneId) return [];
      
      const scene = this.activeScenes.find(s => s.id === this.activeSelectedSceneId);
      if (!scene?.nodes) return [];
      
      // Build a set of all childrenIds (these are NODE IDs, not source IDs)
      const childrenNodeIdsSet = new Set();
      scene.nodes.forEach(node => {
        if (node.childrenIds && Array.isArray(node.childrenIds)) {
          node.childrenIds.forEach(id => childrenNodeIdsSet.add(id));
        }
      });
      
      // Get nodes with their sources and transform data
      // Each node is unique (same source can appear multiple times with different transforms)
      const result = [];
      
      scene.nodes
        .filter(node => node.display === 'horizontal')
        .forEach(node => {
          // Skip nodes that are children of a folder (they'll be nested under folder)
          if (childrenNodeIdsSet.has(node.id)) return;
          
          if (node.type === 'folder') {
            // For folders, build children from childrenIds (which are node IDs)
            const children = [];
            if (node.childrenIds && Array.isArray(node.childrenIds)) {
              node.childrenIds.forEach(childNodeId => {
                // Find the child node by its ID
                const childNode = scene.nodes.find(n => n.id === childNodeId && n.display === 'horizontal');
                if (childNode && childNode.sourceId) {
                  const childSource = this.activeSources.find(s => s.id === childNode.sourceId);
                  if (childSource) {
                    children.push({
                      nodeId: childNode.id,
                      source: childSource,
                      transform: childNode.transform || {},
                      isChild: true
                    });
                  }
                }
              });
            }
            result.push({
              nodeId: node.id,
              name: node.name, // Folders have name directly on node
              isFolder: true,
              children
            });
          } else {
            // Regular source node
            const source = this.activeSources.find(s => s.id === node.sourceId);
            if (source) {
              result.push({
                nodeId: node.id,
                source,
                transform: node.transform || {}
              });
            }
          }
        });
      
      return result;
    },
    
    toggleFolder(folderId) {
      this.expandedFolders = {
        ...this.expandedFolders,
        [folderId]: !this.expandedFolders[folderId]
      };
    },
    
    async toggleActiveSource(nodeId) {
      const isExpanding = !this.expandedActiveSources[nodeId];
      this.expandedActiveSources = {
        ...this.expandedActiveSources,
        [nodeId]: isExpanding
      };
      
      // Lazy-load settings only when expanding and not already loaded
      if (isExpanding && !this.activeSourceSettings[nodeId]) {
        this.activeSourceSettings = {
          ...this.activeSourceSettings,
          [nodeId]: 'loading'
        };
        
        try {
          // Find the source ID from the node ID
          const scene = this.activeScenes.find(s => s.id === this.activeSelectedSceneId);
          const node = scene?.nodes?.find(n => n.id === nodeId);
          const sourceId = node?.sourceId;
          
          if (sourceId) {
            const settings = await this.streamlabsOBS.v1.Sources.getObsSettings(sourceId);
            this.activeSourceSettings = {
              ...this.activeSourceSettings,
              [nodeId]: settings
            };
          } else {
            this.activeSourceSettings = {
              ...this.activeSourceSettings,
              [nodeId]: null
            };
          }
        } catch (err) {
          console.error(`Error loading settings for node ${nodeId}:`, err);
          this.activeSourceSettings = {
            ...this.activeSourceSettings,
            [nodeId]: null
          };
        }
      }
    },
    
    formatSettings(settings) {
      return JSON.stringify(settings, null, 2);
    },
    
    formatSettingsWithTransform(settings, source, transform) {
      const combined = {
        transform: {
          position: {
            x: transform.position?.x ?? 0,
            y: transform.position?.y ?? 0
          },
          scale: {
            x: transform.scale?.x ?? 1,
            y: transform.scale?.y ?? 1
          },
          rotation: transform.rotation ?? 0,
          crop: transform.crop || { top: 0, bottom: 0, left: 0, right: 0 }
        },
        size: {
          width: source.size?.width || 0,
          height: source.size?.height || 0
        },
        obsSettings: settings
      };
      return JSON.stringify(combined, null, 2);
    },
    
    // Tree toggle methods
    toggleCollection(collectionId) {
      const isExpanding = !this.expandedCollections[collectionId];
      this.expandedCollections = {
        ...this.expandedCollections,
        [collectionId]: isExpanding
      };
      
      // If expanding and no scene selected yet, select the first scene
      if (isExpanding && !this.selectedScenes[collectionId]) {
        const collection = this.sceneCollectionsSchema.find(c => c.id === collectionId);
        if (collection?.scenes?.length > 0) {
          this.selectedScenes = {
            ...this.selectedScenes,
            [collectionId]: collection.scenes[0].id
          };
        }
      }
    },
    
    selectScene(collectionId, sceneId) {
      this.selectedScenes = {
        ...this.selectedScenes,
        [collectionId]: sceneId
      };
      
      // Log sources and settings when a scene is selected
      this.logSourcesAndSettings(collectionId, sceneId);
    },
    
    async logSourcesAndSettings(collectionId, sceneId) {
      // Get all sources
      this.streamlabsOBS.v1.Sources.getSources().then(sources => {
        console.log('Got sources!', sources);
      });
      
      // Get the scene items for this scene to find source IDs
      const collection = this.sceneCollectionsSchema.find(c => c.id === collectionId);
      const scene = collection?.scenes?.find(s => s.id === sceneId);
      
      if (scene?.sceneItems?.length > 0) {
        // Get OBS settings for each source in the scene
        scene.sceneItems.forEach(item => {
          this.streamlabsOBS.v1.Sources.getObsSettings(item.sourceId)
            .then(settings => {
              console.log(`Got settings for ${item.sourceId}:`, settings);
            })
            .catch(err => {
              console.log(`Error getting settings for ${item.sourceId}:`, err);
            });
        });
      }
    },
    
    getSelectedSceneName(collection) {
      const sceneId = this.selectedScenes[collection.id];
      if (!sceneId) return null;
      const scene = collection.scenes?.find(s => s.id === sceneId);
      return scene?.name || null;
    },
    
    getSelectedSceneItems(collection) {
      const sceneId = this.selectedScenes[collection.id];
      if (!sceneId) return [];
      const scene = collection.scenes?.find(s => s.id === sceneId);
      const items = scene?.sceneItems || [];
      
      // Remove duplicates based on source name (H/V versions have same name)
      const seenNames = new Set();
      return items.filter(item => {
        //console.log(item);
        const sourceName = this.getSourceName(item.sourceId, collection.sources);
        if (seenNames.has(sourceName)) {
          return false;
        }
        seenNames.add(sourceName);
        return true;
      });
    },
    
    // Source helper methods
    getSourceName(sourceId, sources) {
      const source = sources?.find(s => s.id === sourceId);
      return source?.name || 'Unknown Source';
    },
    
    getSourceType(sourceId, sources) {
      const source = sources?.find(s => s.id === sourceId);
      return source?.type || 'unknown';
    },
    
    getSourceIcon(sourceId, sources) {
      const source = sources?.find(s => s.id === sourceId);
      return this.getSourceIconFromSource(source);
    },
    
    getSourceIconFromSource(source) {
      // Check for smart browser source
      if (source?.type === 'browser_source' && source?.managerType === 'smartBrowserSource') {
        return 'icon-ai';
      }
      return this.getSourceIconByType(source?.type);
    },
    
    getSourceIconByType(type) {
      const icons = {
        // Media sources
        'image_source': 'icon-image',
        'color_source': 'fas fa-fill',
        'ffmpeg_source': 'far fa-file-video',
        'slideshow': 'icon-image',
        'text_gdiplus': 'fas fa-font',
        'text_ft2_source': 'fas fa-font',
        'vlc_source': 'fas fa-play',
        'scene': 'far fa-object-group',
        'replay': 'icon-replay-buffer',
        'soundtrack_source': 'fas fa-file',
        'icon_library': 'fas fa-file',
        'streamlabel': 'fas fa-file',
        
        // Capture sources
        'browser_source': 'fas fa-globe',
        'monitor_capture': 'fas fa-desktop',
        'display_capture': 'fas fa-desktop',
        'window_capture': 'icon-editor-9',
        'game_capture': 'fas fa-gamepad',
        'screen_capture': 'icon-group',
        'mac_screen_capture': 'icon-group',
        'ndi_source': 'fas fa-file',
        'openvr_capture': 'fab fa-simplybuilt fa-rotate-180',
        'liv_capture': 'fab fa-simplybuilt fa-rotate-180',
        'ovrstream_dc_source': 'fas fa-file',
        'syphon-input': 'fas fa-gamepad',
        'spout_capture': 'icon-face-masks-3',
        'smart_browser_source': 'icon-ai',
        
        // AV sources
        'dshow_input': 'icon-webcam',
        'macos_avcapture': 'icon-webcam',
        'wasapi_input_capture': 'icon-mic',
        'wasapi_output_capture': 'icon-audio',
        'coreaudio_input_capture': 'icon-mic',
        'coreaudio_output_capture': 'icon-audio',
        'decklink-input': 'fas fa-file',
        'audio_line': 'fas fa-file',
        'mediasoupconnector': 'icon-team-2',
        'wasapi_process_output_capture': 'fas fa-user',
      };
      return icons[type] || 'fas fa-cube';
    },
    
    isIconClass(icon) {
      return icon && (icon.startsWith('icon-') || icon.startsWith('fas ') || icon.startsWith('far ') || icon.startsWith('fab '));
    },
    
    async loadSceneCollectionsSchema() {
      try {
        this.loading = true;
        this.error = null;
        
        const schema = await this.streamlabsOBS.v1.SceneCollections.getSceneCollectionsSchema();
        //console.log('SettingsView: Scene Collections Schema:', schema);
        
        this.sceneCollectionsSchema = schema || [];
        
        // Auto-expand the first collection and select its first scene by default
        if (this.sceneCollectionsSchema.length > 0) {
          const firstCollection = this.sceneCollectionsSchema[0];
          this.expandedCollections[firstCollection.id] = true;
          
          // Select the first scene if available
          if (firstCollection.scenes?.length > 0) {
            this.selectedScenes[firstCollection.id] = firstCollection.scenes[0].id;
          }
        }
        
      } catch (err) {
        console.error('SettingsView: Error loading scene collections schema:', err);
        this.error = 'Failed to load scene collections. Please try again.';
      } finally {
        this.loading = false;
      }
    },

    async initApp() {
      this.streamlabs = window.Streamlabs;
      const data = await this.streamlabs.init({ receiveEvents: true });
      console.log('SettingsView: Streamlabs initialized with receiveEvents: true');
      console.log('SettingsView: User data:', data);
      
      // Load user preferences
      try {
        const userPreferences = await this.streamlabs.userSettings.get('userPreferences');
        console.log('SettingsView: Raw userPreferences response:', userPreferences, typeof userPreferences);
        if (userPreferences) {
          console.log('SettingsView: Loaded user preferences:', userPreferences);
          // Handle both direct value and nested value cases
          const transitionValue = userPreferences.transitionTime ?? userPreferences?.value?.transitionTime;
          if (transitionValue !== undefined) {
            this.transitionTime = transitionValue;
            console.log('SettingsView: Set transitionTime to:', this.transitionTime);
          }
        }
      } catch (err) {
        console.log('SettingsView: No saved preferences found or error loading:', err);
      }
      
      // Get streamer name from Twitch profile
      if (data && data.profiles && data.profiles.twitch && data.profiles.twitch.name) {
        this.streamerName = data.profiles.twitch.name;
        console.log('SettingsView: Streamer name set to:', this.streamerName);
      }

      // Initialize StreamlabsOBS API for adding sources to scenes
      this.streamlabsOBS = window.streamlabsOBS;
      if (this.streamlabsOBS && this.streamlabsOBS.apiReady) {
        this.streamlabsOBS.apiReady.then(async () => {

          // Remove any existing app sources from all scenes
          try {
            const [appSources, scenes] = await Promise.all([
              this.streamlabsOBS.v1.Sources.getAppSources(),
              this.streamlabsOBS.v1.Scenes.getScenes()
            ]);
            
            if (appSources && appSources.length > 0) {
              const appSourceIds = new Set(appSources.map(s => s.id));
              console.log('SettingsView: Found app sources to clean up:', appSources.map(s => s.name));
              
              for (const scene of scenes) {
                if (scene.nodes) {
                  for (const node of scene.nodes) {
                    if (appSourceIds.has(node.sourceId)) {
                      console.log(`SettingsView: Removing app source from "${scene.name}"`);
                      await this.streamlabsOBS.v1.Scenes.removeSceneItem(scene.id, node.id);
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.error('SettingsView: Error cleaning up app sources:', err);
          }

          this.canAddSource = true;
          console.log('SettingsView: StreamlabsOBS API ready');
          
          // Get and log current theme - may be sync or async
          try {
            let currentTheme = this.streamlabsOBS.v1.Theme.getTheme();
            // Handle if getTheme returns a promise
            if (currentTheme && typeof currentTheme.then === 'function') {
              currentTheme = await currentTheme;
            }
            //console.log('SettingsView: Current theme:', currentTheme);
            this.currentTheme = currentTheme || 'night';
          } catch (err) {
            console.error('SettingsView: Error getting theme:', err);
            this.currentTheme = 'night';
          }
          
          // Listen for theme changes
          this.streamlabsOBS.v1.Theme.themeChanged((theme) => {
            //console.log('SettingsView: Theme changed to:', theme);
            this.currentTheme = theme;
          });

          // Replay Buffer
          this.streamlabsOBS.v1.Replay.stateChanged(state => {
            //console.log('Got state change', state);
          });

          this.streamlabsOBS.v1.Replay.fileSaved(async (file) => {
            console.log('New replay saved', file);
            
            // Only update lastReplayBufferFileId when not exporting (i.e., from stopSceneCycling)
            if (!this.isExportingSave) {
              this.lastReplayBufferFileId = file.id;
              
              // Store file to IndexedDB for cross-view access
              try {
                const replayFile = await this.streamlabsOBS.v1.Replay.getFileContents(file.id);
                console.log('Got replay file:', replayFile.name, 'size:', replayFile.size);
                
                // Get video duration
                const tempVideo = document.createElement('video');
                const blobUrl = URL.createObjectURL(replayFile);
                tempVideo.src = blobUrl;
                tempVideo.muted = true;
                await new Promise((resolve, reject) => {
                  tempVideo.onloadedmetadata = resolve;
                  tempVideo.onerror = reject;
                  tempVideo.load();
                });
                const durationSecs = tempVideo.duration;
                const mins = Math.floor(durationSecs / 60);
                const secs = Math.floor(durationSecs % 60);
                const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
                console.log('Replay duration:', durationStr, `(${durationSecs.toFixed(2)}s)`);
                URL.revokeObjectURL(blobUrl);
                
                // Store in IndexedDB
                await this.storeVideoInIndexedDB('latestReplay', replayFile);
                console.log('Replay stored in IndexedDB');
              } catch (err) {
                console.error('Error storing replay in IndexedDB:', err);
              }
            } else {
              console.log('Skipping lastReplayBufferFileId update (export save)');
            }
            
            // Resolve the save promise when file is saved
            if (this.replaySaveResolver) {
              this.replaySaveResolver();
              this.replaySaveResolver = null;
            }
          });

          this.streamlabsOBS.v1.StreamingRecording.getOutputState().then(state => {
            //console.log('Current output state:', state);
          });

          this.streamlabsOBS.v1.StreamingRecording.outputStateChanged(state => {
            console.log('Got new output state', state);
            
            // Handle recording timer
            if (state.recordingStatus === 'recording') {
              this.startRecordingTimer();
            } else if (state.recordingStatus === 'offline') {
              this.stopRecordingTimer();
            }
            
            // Handle streaming timer
            if (state.streamingStatus === 'live') {
              this.startStreamingTimer();
            } else if (state.streamingStatus === 'offline') {
              this.stopStreamingTimer();
            }
          });
          
          // Listen for notification read events
          this.streamlabsOBS.v1.Notifications.notificationRead((ids) => {
            //console.log('Notifications read:', ids);
            // Update our local log to mark notifications as read
            ids.forEach(id => {
              const notif = this.notificationLog.find(n => n.id === id);
              if (notif) {
                notif.unread = false;
              }
            });
          });
          
          // Load OBS settings first to get canvas resolution
          await this.loadObsSettings();
          
          // Load active collection
          await this.loadActiveCollection();
          
          // Load scene collections schema
          await this.loadSceneCollectionsSchema();
          
          // Listen for navigation events
          if (this.streamlabsOBS.v1.App && this.streamlabsOBS.v1.App.onNavigation) {
            this.streamlabsOBS.v1.App.onNavigation(async (nav) => {
              //console.log('SettingsView: Navigation event received', nav);
              this.reloadActiveCollection();

              this.streamlabsOBS.v1.Sources.getAppSources().then(sources => {
                if (!sources || sources.length === 0) return;
                console.log('Got sources!', sources);
                this.existingSource = sources[0].id;
              });
            });
          }

        });
      }
      
      // Wait for Streamlabs IO connection 
      this.streamlabs.onIOConnected(() => {
        console.log('SettingsView: Streamlabs IO connected');
      });
      
      this.streamlabs.onMessage(event => {
        // Display remote logs from SceneCollectionView
        if (event.type === 'remoteLog') {
          const { level, args } = event.data;
          const prefix = '[SceneCollectionView]';
          if (level === 'error') {
            console.error(prefix, ...args);
          } else if (level === 'warn') {
            console.warn(prefix, ...args);
          } else {
            console.log(prefix, ...args);
          }
        }
        
        // Handle video loaded confirmation from SceneCollectionView
        if (event.type === 'isVideoSourceInBrowserSourceLoaded') {
          if (event.data.isVideoSourceInBrowserSourceLoaded === true) {
            console.log('SettingsView: SceneCollectionView confirmed video loaded');
            this.isVideoSourceInBrowserSourceLoaded = true;
            // Resolve pending promise if exists
            if (this._videoLoadedResolve) {
              this._videoLoadedResolve();
              this._videoLoadedResolve = null;
            }
          }
        }
      });
    },

    // Notification methods
    async pushNotification(type = 'INFO', message = null) {
      if (!this.streamlabsOBS?.v1?.Notifications) {
        console.error('Notifications API not available');
        return;
      }
      
      this.notificationCounter++;
      const defaultMessages = {
        'INFO': `ℹ️ Info notification #${this.notificationCounter} - This is an informational message`,
        'WARNING': `⚠️ Warning notification #${this.notificationCounter} - Please pay attention`,
        'SUCCESS': `✅ Success notification #${this.notificationCounter} - Operation completed!`
      };
      
      try {
        const notification = await this.streamlabsOBS.v1.Notifications.push({
          message: message || defaultMessages[type] || defaultMessages['INFO'],
          type: type,
          unread: true,
          playSound: false,
          lifeTime: 2500,
          showTime: true
        });
        
        //console.log('Pushed notification:', notification);
        
        // Add to our local log
        this.notificationLog.unshift({
          ...notification,
          type: type
        });
        
        // Keep only the last 10 notifications in our log
        if (this.notificationLog.length > 10) {
          this.notificationLog = this.notificationLog.slice(0, 10);
        }
      } catch (err) {
        console.error('Error pushing notification:', err);
      }
    },
    
    async markNotificationAsRead(id) {
      if (!this.streamlabsOBS?.v1?.Notifications) {
        console.error('Notifications API not available');
        return;
      }
      
      try {
        await this.streamlabsOBS.v1.Notifications.markAsRead(id);
        console.log('Marked notification as read:', id);
        
        // Update local state
        const notif = this.notificationLog.find(n => n.id === id);
        if (notif) {
          notif.unread = false;
        }
      } catch (err) {
        console.error('Error marking notification as read:', err);
      }
    },

    async openSceneModal(sourceType) {
      if (!this.canAddSource) return;
      
      this.currentSourceType = sourceType;
      
      try {
        // Load scenes data
        const [scenes, activeScene] = await Promise.all([
          this.streamlabsOBS.v1.Scenes.getScenes(),
          this.streamlabsOBS.v1.Scenes.getActiveScene()
        ]);
        
        this.availableScenes = scenes;
        this.activeSceneId = activeScene.id;
        this.selectedSceneId = activeScene.id; // Pre-select active scene
        this.showSceneModal = true;
        
        console.log('SettingsView: Loaded scenes:', scenes);
        console.log('SettingsView: Source type:', sourceType);
      } catch (error) {
        console.error('SettingsView: Error loading scenes:', error);
        alert('Failed to load scenes. Please try again.');
      }
    },

    closeSceneModal() {
      this.showSceneModal = false;
      this.selectedSceneId = null;
      this.currentSourceType = null;
    },

    selectModalScene(scene) {
      this.selectedSceneId = scene.id;
      console.log('SettingsView: Selected modal scene:', scene.name);
    },

    async exportReplayToScene() {
      if (!this.lastReplayBufferFileId || !this.activeScenes.length || !this.existingSource) {
        console.error('No replay file or scenes available');
        return;
      }
      
      this.isExporting = true;
      
      try {
        // Get the first scene and make it active
        const firstScene = this.activeScenes[0];
        console.log('SettingsView: Making scene active:', firstScene.name);
        await this.streamlabsOBS.v1.Scenes.makeSceneActive(firstScene.id);
        
        // Wait for browser source to initialize after scene becomes active
        console.log('SettingsView: Waiting for browser source to initialize...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Smooth scroll to top of page
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Get the replay file and send to SceneCollectionView via postMessage
        const replayFile = await this.streamlabsOBS.v1.Replay.getFileContents(this.lastReplayBufferFileId);
        console.log('exportReplayToScene', replayFile);
        
        // Convert file to base64 for postMessage (IndexedDB not shared between views)
        // Use FileReader to avoid stack overflow with large files
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            // result is "data:video/mp4;base64,XXXX" - extract just the base64 part
            const dataUrl = reader.result;
            const base64Data = dataUrl.split(',')[1];
            resolve(base64Data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(replayFile);
        });
        console.log('SettingsView: Converted video to base64, length:', base64.length);
        
        // Create video element to get duration (use blob URL locally for duration check)
        const localBlobUrl = URL.createObjectURL(replayFile);
        const video = document.createElement('video');
        video.src = localBlobUrl;
        video.crossOrigin = 'anonymous';
        video.loop = false;
        video.muted = true;
        video.playsInline = true;
        
        // Wait for video to be ready
        await new Promise((resolve, reject) => {
          video.onloadeddata = resolve;
          video.onerror = reject;
          video.load();
        });
        
        const totalDurationMs = video.duration * 1000;
        const totalSeconds = Math.floor(video.duration);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

        // Notify SceneCollectionView with video data via postMessage
        console.log('SettingsView: Sending loadReplayFromBase64 message with video data...');
        this.streamlabs.postMessage('loadReplayFromBase64', { 
          base64: base64,
          mimeType: replayFile.type || 'video/mp4',
          fileName: replayFile.name
        });
        console.log('SettingsView: postMessage sent, waiting for response...');

        // Wait for SceneCollectionView to signal video is loaded before proceeding
        await new Promise((resolve) => {
          // Store resolver for the onMessage handler to call
          this._videoLoadedResolve = resolve;
          
          // Timeout fallback after 30 seconds (large videos take time to process)
          setTimeout(() => {
            if (this._videoLoadedResolve) {
              console.warn('SettingsView: Timeout waiting for video loaded confirmation');
              this._videoLoadedResolve = null;
              resolve();
            }
          }, 30000);
        });
        
        // Ensure replay buffer is enabled and started for the export
        const enabled = await this.streamlabsOBS.v1.Replay.getEnabled();
        if (!enabled) {
          await this.streamlabsOBS.v1.Replay.setEnabled(true);
        }
        
        // Check current buffer state
        let state = await this.streamlabsOBS.v1.Replay.getState();
        
        // Stop buffer if running (required before setDuration)
        if (state.status === 'running' || state.status === 'stopping') {
          if (state.status === 'running') {
            await this.streamlabsOBS.v1.Replay.stopBuffer();
            console.log('Replay buffer stop requested for export');
          }
          
          // Poll until buffer is actually stopped
          let attempts = 0;
          const maxAttempts = 20; // 10 seconds max
          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 500));
            state = await this.streamlabsOBS.v1.Replay.getState();
            console.log('Polling buffer state:', state.status);
            if (state.status === 'offline' || state.status === 'stopped') {
              console.log('Replay buffer fully stopped');
              break;
            }
            attempts++;
          }
        }
        
        // Set the replay buffer duration to match video duration
        await this.streamlabsOBS.v1.Replay.setDuration(totalSeconds);
        console.log('Replay buffer duration set to:', totalSeconds, 'seconds');

        
        // Start the buffer
        await this.streamlabsOBS.v1.Replay.startBuffer();
        console.log('Replay buffer started for export');
        
        // Set up playback state (similar to startSceneCycling but without cycling)
        this.isRecordingScenes = true;
        this.isExporting = false; // Loading complete, now recording
        this.playbackProgress = 0;
        this.playbackStartTime = performance.now();
        this.playbackTotalDuration = totalDurationMs;
        
        // Show notification with duration
        this.pushNotification('INFO', `📤 Exporting scene: ${durationStr}`);
        
        // Append video to DOM (hidden) to ensure it persists during navigation
        video.style.position = 'absolute';
        video.style.left = '-9999px';
        video.style.visibility = 'hidden';
        document.body.appendChild(video);
        
        // Listen for video end to stop recording
        video.onended = async () => {
          console.log('Export video ended, stopping recording');
          this.isRecordingScenes = false;
          
          // Cancel progress animation
          if (this.playbackAnimationId) {
            cancelAnimationFrame(this.playbackAnimationId);
            this.playbackAnimationId = null;
          }
          
          // Save the replay buffer (mark as export save to prevent updating lastReplayBufferFileId)
          this.isExportingSave = true;
          this.streamlabsOBS.v1.Replay.save();
          
          // Wait for replay to be saved
          await new Promise(resolve => {
            this.replaySaveResolver = resolve;
            setTimeout(() => {
              if (this.replaySaveResolver) {
                this.replaySaveResolver();
                this.replaySaveResolver = null;
              }
            }, 10000);
          });
          
          // Reset export flag
          this.isExportingSave = false;
          
          // Show success notification
          this.pushNotification('SUCCESS', `✅ Export completed successfully!`);
          
          // Display the exported preview on the plane
          await this.displayPreviewOnPlane();
          
          // Navigate to editor after export completes
          if (this.streamlabsOBS.v1.App) {
            this.streamlabsOBS.v1.App.navigate('Editor');
          }
          
          // Cleanup video element - remove from DOM
          video.pause();
          if (video.parentNode) {
            video.parentNode.removeChild(video);
          }
          URL.revokeObjectURL(localBlobUrl);
        };
        
        // Track video progress
        video.ontimeupdate = () => {
          if (video.duration) {
            this.playbackElapsed = video.currentTime * 1000;
            this.playbackProgress = (video.currentTime / video.duration) * 100;
            //console.log(`Video progress: ${video.currentTime.toFixed(1)}s / ${video.duration.toFixed(1)}s (${this.playbackProgress.toFixed(1)}%)`);
          }
        };
        
        // Also listen for other video events for debugging
        //video.onpause = () => console.log('Video paused');
        //video.onplay = () => console.log('Video playing');
        video.onerror = (e) => console.error('Video error:', e);
        
        // send postMessage to start playback in SceneCollectionView.vue
        this.streamlabs.postMessage('startVideoSourcePlaybackInBrowserSource', { isVideoSourceInBrowserSourceLoaded: true });
        // Start video playback (needed to track progress)
        await video.play();
        console.log('Export video playing:', video.videoWidth, 'x', video.videoHeight, 'duration:', video.duration);
        
        // Store video element for potential cleanup
        this._exportVideo = video;
        
      } catch (error) {
        console.error('Error exporting replay to scene:', error);
        this.pushNotification('WARNING', `⚠️ Failed to export replay`);
        this.isRecordingScenes = false;
        this.isExporting = false;
      }
    },
  
    openExternalLink(url) {
      if (this.streamlabsOBS && this.streamlabsOBS.v1 && this.streamlabsOBS.v1.External) {
        this.streamlabsOBS.v1.External.openExternalLink(url);
      } else {
        window.open(url, '_blank');
      }
    },

    // Timer methods
    formatTime(seconds) {
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    },

    startRecordingTimer() {
      if (this.recordingTimerInterval) return; // Already running
      if (this.resetRecordingOnStart) {
        this.recordingElapsed = 0;
      }
      this.isRecording = true;
      this.recordingTimerInterval = setInterval(() => {
        this.recordingElapsed++;
      }, 1000);
    },

    stopRecordingTimer() {
      this.isRecording = false;
      if (this.recordingTimerInterval) {
        clearInterval(this.recordingTimerInterval);
        this.recordingTimerInterval = null;
      }
      // Keep elapsed time at last value, don't reset to 0
    },

    startStreamingTimer() {
      if (this.streamingTimerInterval) return; // Already running
      if (this.resetStreamingOnStart) {
        this.streamingElapsed = 0;
      }
      this.isStreaming = true;
      this.streamingTimerInterval = setInterval(() => {
        this.streamingElapsed++;
      }, 1000);
    },

    stopStreamingTimer() {
      this.isStreaming = false;
      if (this.streamingTimerInterval) {
        clearInterval(this.streamingTimerInterval);
        this.streamingTimerInterval = null;
      }
      // Keep elapsed time at last value, don't reset to 0
    },

    // Scene cycling methods
    async confirmStartRecording() {
      this.showRecordingModal = false;
      this.isStartingRecording = true;
      
      // Save transitionTime to user preferences
      try {
        const currentPrefs = await this.streamlabs.userSettings.get('userPreferences') || {};
        await this.streamlabs.userSettings.set('userPreferences', {
          ...currentPrefs,
          transitionTime: this.transitionTime
        });
        console.log('SettingsView: Saved transitionTime to preferences:', this.transitionTime);
      } catch (err) {
        console.error('SettingsView: Error saving preferences:', err);
      }
      
      this.startSceneCycling();
    },

    toggleSceneCycling() {
      if (this.isRecordingScenes) {
        this.stopSceneCycling(true); // true = manual stop
      } else {
        this.startSceneCycling();
      }
    },

    async startSceneCycling() {
      if (this.playableScenes.length <= 1) return;
      
      // Capture scene snapshot at start to avoid race conditions with computed property
      this.scenesToCycle = [...this.playableScenes];
      const sceneCount = this.scenesToCycle.length;
      
      console.log('Starting scene cycling with', sceneCount, 'scenes:', this.scenesToCycle.map(s => s.name));
      
      // Smooth scroll to top of page
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      // Calculate total duration upfront (needed for replay buffer)
      const intervalTime = this.sceneDuration + this.transitionTime;
      const totalDurationMs = sceneCount * intervalTime;
      const totalSeconds = Math.floor(totalDurationMs / 1000);
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      
      console.log(`Duration calculation: ${sceneCount} scenes × ${intervalTime}ms = ${totalDurationMs}ms (${durationStr})`);

      // Generate timeline of recording events
      this.recordingTimeline = [];
      let currentTimeMs = 0;
      this.scenesToCycle.forEach((scene, index) => {
        if (index === 0) {
          this.recordingTimeline.push({
            time: this.formatPlaybackTime(currentTimeMs),
            event: `Recording starts on ${scene.name}`
          });
        } else {
          this.recordingTimeline.push({
            time: this.formatPlaybackTime(currentTimeMs),
            event: `Transition to ${scene.name}`
          });
        }
        currentTimeMs += intervalTime;
      });
      this.recordingTimeline.push({
        time: this.formatPlaybackTime(currentTimeMs),
        event: 'Save recording'
      });
      console.table(this.recordingTimeline);

      // add app source to scene if not already in it
      if(!this.existingSource) {
        const source = await this.streamlabsOBS.v1.Sources.createAppSource(`Scene Visualizer Replay Buffer`, 'scene-collection-visualizer');
        this.existingSource = source.id;

        // Add source to first scene
        const sceneItem = await this.streamlabsOBS.v1.Scenes.createSceneItem(
          this.activeScenes[0].id,
          this.existingSource
        );
      }

      
      
      // Ensure replay buffer is enabled and started
      try {
        const enabled = await this.streamlabsOBS.v1.Replay.getEnabled();
        console.log('Buffer enabled:', enabled);
        
        if (!enabled) {
          await this.streamlabsOBS.v1.Replay.setEnabled(true);
          console.log('Replay buffer enabled');
        }
        
        // Check current buffer state
        let state = await this.streamlabsOBS.v1.Replay.getState();
        console.log('Replay buffer state:', state);
        
        // Stop buffer if running (required before setDuration)
        if (state.status === 'running' || state.status === 'stopping') {
          if (state.status === 'running') {
            await this.streamlabsOBS.v1.Replay.stopBuffer();
            console.log('Replay buffer stop requested');
          }
          
          // Poll until buffer is actually stopped (not just 'stopping')
          let attempts = 0;
          const maxAttempts = 20; // 10 seconds max
          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 500));
            state = await this.streamlabsOBS.v1.Replay.getState();
            console.log('Polling buffer state:', state.status);
            if (state.status === 'offline' || state.status === 'stopped') {
              console.log('Replay buffer fully stopped');
              break;
            }
            attempts++;
          }
          
          if (attempts >= maxAttempts) {
            console.warn('Timeout waiting for replay buffer to stop');
          }
        }
        
        // Set the replay buffer duration to match total playback time
        await this.streamlabsOBS.v1.Replay.setDuration(totalSeconds);
        console.log('Replay buffer duration set to:', totalSeconds, 'seconds');
        
        // Switch to first scene BEFORE starting the buffer
        // This ensures the initial transition is not recorded
        this.currentSceneIndex = 0;
        await this.activateCurrentScene();
        
        // Wait for transition to complete before starting buffer
        if (this.transitionTime > 0) {
          await new Promise(resolve => setTimeout(resolve, this.transitionTime));
        }
        
        // Start the buffer after transition completes
        await this.streamlabsOBS.v1.Replay.startBuffer();
        console.log('Replay buffer started');
      } catch (err) {
        console.error('Error managing replay buffer:', err);
        this.isStartingRecording = false;
      }
      
      this.isRecordingScenes = true;
      this.isStartingRecording = false; // Loading complete, now recording
      this.playbackProgress = 0;
      this.playbackStartTime = performance.now();
      
      // Show notification with duration
      this.pushNotification('INFO', `▶️ Recording scenes: ${durationStr}`);

      
      // Start smooth progress animation
      this.animatePlaybackProgress(totalDurationMs);
      
      // Use setTimeout for first scene to ensure it gets full duration,
      // then setInterval for remaining scenes
      console.log(`First scene will play for ${intervalTime}ms before cycling starts`);
      this.sceneCycleTimeout = setTimeout(() => {
        // After first scene's duration, cycle to next and start interval
        this.cycleToNextScene();
        
        // Only start interval if there are more scenes to cycle
        if (this.isRecordingScenes && this.currentSceneIndex < this.scenesToCycle.length) {
          this.sceneCycleInterval = setInterval(() => {
            this.cycleToNextScene();
          }, intervalTime);
        }
      }, intervalTime);
    },

    async stopSceneCycling(isManual = false) {
      const wasRecording = this.isRecordingScenes;
      this.streamlabsOBS.v1.Replay.save();
      this.isRecordingScenes = false;
      
      // Clear timeout for first scene
      if (this.sceneCycleTimeout) {
        clearTimeout(this.sceneCycleTimeout);
        this.sceneCycleTimeout = null;
      }
      
      if (this.sceneCycleInterval) {
        clearInterval(this.sceneCycleInterval);
        this.sceneCycleInterval = null;
      }
      
      // Cancel progress animation
      if (this.playbackAnimationId) {
        cancelAnimationFrame(this.playbackAnimationId);
        this.playbackAnimationId = null;
      }
      this.playbackProgress = 0;
      this.playbackStartTime = null;
      this.playbackElapsed = 0;
      this.playbackTotalDuration = 0;
      
      // Show warning if manually interrupted while recording
      if (isManual && wasRecording) {
        this.pushNotification('WARNING', `⚠️ Scene recording interrupted!`);
      }
      
      // Wait for replay to be saved, then display it on the Three.js plane
      if (wasRecording && !isManual) {
        // Wait for fileSaved callback
        await new Promise(resolve => {
          this.replaySaveResolver = resolve;
          // Timeout fallback in case callback doesn't fire
          setTimeout(() => {
            if (this.replaySaveResolver) {
              this.replaySaveResolver();
              this.replaySaveResolver = null;
            }
          }, 10000);
        });
        //await this.displayPreviewOnPlane();
      }

      // Switch back to the first scene in the collection
      if (this.activeScenes.length > 0) {
        const firstScene = this.activeScenes[0];
        try {
          await this.streamlabsOBS.v1.Scenes.makeSceneActive(firstScene.id);
          await this.selectActiveScene(firstScene.id);
          console.log('Switched back to first scene:', firstScene.name);
        } catch (err) {
          console.error('Error switching to first scene:', err);
        }
      }
    },
    
    async displayPreviewOnPlane() {
      if (!this.lastReplayBufferFileId) {
        console.warn('No replay file ID available');
        return;
      }
      
      // Display recording timeline
      if (this.recordingTimeline.length > 0) {
        console.log('Recording Timeline:');
        console.table(this.recordingTimeline);
      }
      
      // Smooth scroll to top of page
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      try {
        const file = await this.streamlabsOBS.v1.Replay.getFileContents(this.lastReplayBufferFileId);
        console.log('Got replay file!', file.name);
        
        // Create a blob URL from the File object
        const videoUrl = URL.createObjectURL(file);
        
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
          video.onerror = reject;
          video.load();
        });
        
        // Listen for video end to return to wireframe view
        video.onended = () => {
          console.log('Preview video ended, returning to wireframe');
          this.isPreviewPlaying = false;
          this.playbackProgress = 0;
          this.playbackElapsed = 0;
          this.playbackTotalDuration = 0;
          this.restoreWireframeView();
        };
        
        // Track video progress
        video.ontimeupdate = () => {
          if (video.duration) {
            this.playbackElapsed = video.currentTime * 1000; // Convert to ms
            this.playbackProgress = (video.currentTime / video.duration) * 100;
          }
        };
        
        // Start playing
        this.isPreviewPlaying = true;
        this.playbackProgress = 0;
        this.playbackElapsed = 0;
        // Set total duration from video (metadata already loaded at this point)
        this.playbackTotalDuration = video.duration * 1000; // Convert to ms
        await video.play();
        console.log('Video playing:', video.videoWidth, 'x', video.videoHeight);
        
        // Store video element for cleanup
        this._replayVideo = video;
        
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
          this._threePlane.material.map = this._threeTexture;
          this._threePlane.material.needsUpdate = true;
          
          // Update plane geometry to match video aspect ratio
          const videoAspect = video.videoWidth / video.videoHeight;
          const planeHeight = 2;
          const planeWidth = planeHeight * videoAspect;
          
          this._threePlane.geometry.dispose();
          this._threePlane.geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
          
          // Re-fit camera to the updated plane
          this.fitToRect(this._threePlane);
          
          // Animate camera from z=-4 to current position over 3 seconds
          if (this._threeCamera && this._threeControls) {
            const targetPosition = this._threeCamera.position.clone();
            // Move camera back by 4 units for the start position
            this._threeCamera.position.z = targetPosition.z + 4;
            this._threeControls.setPosition(this._threeCamera.position.x, this._threeCamera.position.y, this._threeCamera.position.z, false);
            
            // Animate to target position
            gsap.to(this._threeCamera.position, {
              z: targetPosition.z,
              duration: 3,
              ease: 'power4.out',
              onUpdate: () => {
                if (this._threeControls) {
                  this._threeControls.setPosition(this._threeCamera.position.x, this._threeCamera.position.y, this._threeCamera.position.z, false);
                }
              }
            });
          }
        }
        
        this.pushNotification('SUCCESS', `🎬 Replay loaded on canvas!`);
      } catch (err) {
        console.error('Error displaying replay on plane:', err);
        this.pushNotification('WARNING', `⚠️ Failed to load replay video`);
      }
    },
    
    restoreWireframeView() {
      // Cleanup replay video
      if (this._replayVideo) {
        this._replayVideo.pause();
        if (this._replayVideo.src) {
          URL.revokeObjectURL(this._replayVideo.src);
        }
        this._replayVideo = null;
      }
      
      // Dispose video texture
      if (this._threeTexture) {
        this._threeTexture.dispose();
      }
      
      // Recreate canvas texture from 2D canvas
      const canvas2D = this.$refs.sceneCanvas;
      if (canvas2D && this._threePlane) {
        this._threeTexture = markRaw(new THREE.CanvasTexture(canvas2D));
        this._threeTexture.minFilter = THREE.LinearFilter;
        this._threeTexture.magFilter = THREE.LinearFilter;
        
        // Update plane material with canvas texture
        this._threePlane.material.map = this._threeTexture;
        this._threePlane.material.needsUpdate = true;
        
        // Update plane geometry to match canvas aspect ratio
        const planeAspect = this.canvasBaseWidth / this.canvasBaseHeight;
        const planeHeight = 2;
        const planeWidth = planeHeight * planeAspect;
        
        this._threePlane.geometry.dispose();
        this._threePlane.geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
        
        // Re-fit camera
        this.fitToRect(this._threePlane);
        
        // Redraw the canvas
        this.drawCanvas();
      }
      
      console.log('Restored wireframe view');
    },
    
    stopPreview() {
      if (!this.isPreviewPlaying) return;
      
      this.isPreviewPlaying = false;
      this.playbackProgress = 0;
      this.playbackElapsed = 0;
      this.playbackTotalDuration = 0;
      this.restoreWireframeView();
      console.log('Preview stopped manually');
    },

    animatePlaybackProgress(totalDurationMs) {
      this.playbackTotalDuration = totalDurationMs;
      
      const animate = () => {
        if (!this.isRecordingScenes || !this.playbackStartTime) return;
        
        const elapsed = performance.now() - this.playbackStartTime;
        const progress = Math.min((elapsed / totalDurationMs) * 100, 100);
        this.playbackProgress = progress;
        this.playbackElapsed = Math.min(elapsed, totalDurationMs);
        
        if (progress < 100) {
          this.playbackAnimationId = requestAnimationFrame(animate);
        }
      };
      
      this.playbackAnimationId = requestAnimationFrame(animate);
    },

    formatPlaybackTime(ms) {
      const totalSeconds = Math.floor(ms / 1000);
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    },

    async activateCurrentScene() {
      const scene = this.scenesToCycle[this.currentSceneIndex];
      if (scene) {
        try {
          await this.streamlabsOBS.v1.Scenes.makeSceneActive(scene.id);
          console.log('Switched to scene:', scene.name, `(${this.currentSceneIndex + 1}/${this.scenesToCycle.length})`);
          // Update the UI to reflect the new active scene
          await this.selectActiveScene(scene.id);
          //await this.reloadActiveCollection();
        } catch (err) {
          console.error('Error switching scene:', err);
        }
      }
    },

    async cycleToNextScene() {
      if (!this.scenesToCycle.length) return;
      
      // Move to next scene first
      this.currentSceneIndex++;
      
      // Check if we've gone past the last scene
      if (this.currentSceneIndex >= this.scenesToCycle.length) {
        // We've completed all scenes, stop cycling (not manual)
        this.stopSceneCycling(false);
        console.log('Scene cycling complete - all scenes played');
        
        // Show success notification
        this.pushNotification('SUCCESS', `✅ Scenes finished recording successfully!`);
        this.streamlabsOBS.v1.Notifications.push({
          message: `✅ Scenes finished recording successfully!`,
          type: 'SUCCESS',
          unread: true,
          playSound: false,
          lifeTime: 2500,
          showTime: true
        });
        return;
      }
      
      // Activate the next scene
      await this.activateCurrentScene();
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

    async storeVideoInIndexedDB(key, file) {
      const db = await this.openVideoDatabase();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(['videos'], 'readwrite');
        const store = transaction.objectStore('videos');
        const request = store.put(file, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      });
    },

  }
};
</script>

<style lang="less" scoped>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@100;300;400;500;700;900&display=swap');

@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@100;300;400;500;700;900&display=swap');
@import '@/styles/custom-icons.less';
@import '@/styles/themes.g.less';

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.dashboard {
  font-family: 'Roboto', Arial, sans-serif;
  background: var(--dashboard-bg);
  color: var(--paragraph);
  min-height: 100vh;
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

/* Disclaimer */
.disclaimer {
  bottom: 0;
  left: 0;
  right: 0;
  padding: 1rem 1.5rem;
  background: var(--dashboard-bg);
  text-align: center;
  color: #888;
  font-family: 'Inter', Arial, sans-serif;
  font-size: 0.75rem;
  line-height: 1.5;
  z-index: 100;
}


/* Debug Icon Grid */
.debug-icon-section {
  margin-bottom: 2rem;
  padding: 1rem;
  background: var(--section);
  border-radius: 10px;
  border: 1px solid var(--border);
}

.debug-title {
  font-size: 1rem;
  font-weight: 500;
  color: var(--teal);
  margin-bottom: 1rem;
}

.debug-icon-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.debug-icon-item {
  position: relative;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--teal-semi);
  border-radius: 6px;
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: var(--teal-hover);
    border-color: var(--teal);
    
    .debug-icon-tooltip {
      opacity: 1;
      visibility: visible;
      transform: translateX(-50%) translateY(0);
    }
  }
}

.debug-icon {
  font-size: 1.25rem;
  color: var(--teal);
}

.debug-icon-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(5px);
  background: var(--section);
  color: var(--paragraph);
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  border: 1px solid var(--teal);
  font-size: 0.7rem;
  white-space: nowrap;
  z-index: 100;
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s ease;
  pointer-events: none;
  text-align: center;
  line-height: 1.4;
  margin-bottom: 8px;
  
  &::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: var(--teal);
  }
}

.title {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--title);
  margin-bottom: 1.5rem;
  padding-bottom: 0.75rem;
  border-bottom: 2px solid var(--border);
}

/* Loading state */
.loading {
  display: flex;
  align-items: center;
  gap: 1rem;
  color: var(--teal);
  font-size: 1rem;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-top-color: var(--teal);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Error state */
.error {
  color: var(--warning);
  padding: 1rem;
  background: var(--warning-bg);
  border-radius: 8px;
  border: 1px solid var(--warning);
}

/* Tree container */
.tree-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* Collection */
.collection {
    background: var(--section);
    /* border-radius: 10px; */
    overflow: hidden;
    /* border: 1px solid var(--border); */
}

.collection-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  transition: background 0.2s;
}

.collection-header:hover {
  background: var(--button-hover);
}

.collection-name {
  font-weight: 600;
  font-size: 1.1rem;
  color: var(--title);
}

.collection-icon {
  font-size: 1.25rem;
}

.collection-content {
  padding: 0.75rem;
}

/* Two column layout */
.two-column-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  min-height: 200px;
}

.column {
  background: var(--dark-background);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.column-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .5rem;
    padding: 0.75rem 0;
    min-height: 60px;
    /* border-bottom: 1px solid var(--border); */
    font-weight: 500;
    color: var(--section-wrapper);
    background: var(--dashboard-bg);
}

.column-header-collection {
  padding: 0.75rem 1rem;
}
.column-content {
  flex: 1;
  overflow-y: auto;
  max-height: 300px;
}

.scene-list-item,
.source-list-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  cursor: pointer;
  transition: all 0.15s ease;
  border-left: 3px solid transparent;
}

.scene-list-item:hover {
  background: var(--list-selected);
}

.scene-list-item.selected {
  background: var(--list-selected);
}

.source-list-item {
  cursor: default;
}

.source-list-item:hover {
  background: var(--list-selected);
}

.item-count {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--midtone);
  background: var(--teal-semi);
  padding: 0.15rem 0.5rem;
  border-radius: 10px;
}

.empty-state {
  padding: 1.5rem;
  text-align: center;
  color: var(--midtone);
  font-size: 0.9rem;
}

/* Toggle icon */
.toggle-icon {
  font-size: 0.7rem;
  color: var(--midtone);
  margin-left: auto;
  transition: transform 0.2s ease;
}

.toggle-icon.rotated {
  transform: rotate(180deg);
}

/* Section styles */
.section-icon {
  font-size: 1rem;
}

.section-name {
  font-weight: 700;
  font-size: 0.95rem;
}

/* Display toggle buttons */
.display-toggle-buttons {
  display: flex;
  gap: 0.25rem;
  margin-left: auto;
}

.display-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: none;
  border: none;
  color: var(--title);
  cursor: pointer;
  transition: all 0.2s ease;
}


.display-toggle-btn.active {
  color: var(--teal);
}

.display-toggle-btn span {
  font-family: 'icomoon' !important;
  font-size: 0.9rem;
}

/* Item styles */
.item-icon {
  font-size: 0.9rem;
  min-width: 1em;
  text-align: center;
  
  /* Support for icomoon font icons */
  &[class*="icon-"] {
    font-family: 'icomoon' !important;
    font-size: 1rem;
  }
}

.item-name {
  font-size: 0.9rem;
}

.item-type {
  font-size: 0.75rem;
  color: var(--midtone);
  margin-left: auto;
  background: var(--teal-semi);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}

/* Active collection section */
.active-collection-section {
    margin-bottom: 2rem;
    gap: 1rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
}

/* Timers Section */
.timers-section {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.timer-box {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1.25rem;
  background: var(--section);
  border: 1px solid var(--border);
  border-radius: 8px;
  min-width: 180px;
  transition: all 0.2s ease;
}

.timer-box.active {
  border-color: var(--teal);
  background: var(--teal-semi);
}

.timer-box.active .timer-icon {
  color: var(--teal);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.timer-icon {
  font-size: 1.25rem;
  color: var(--midtone);
}

.timer-label {
  font-size: 0.85rem;
  color: var(--midtone);
  font-weight: 500;
}

.timer-value {
  font-size: 1.1rem;
  font-weight: 700;
  font-family: 'Roboto Mono', monospace;
  color: var(--title);
  margin-left: auto;
}

.timer-toggle {
  position: relative;
  display: inline-block;
  width: 32px;
  height: 18px;
  margin-left: 0.5rem;
  cursor: pointer;
}

.timer-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--midtone);
  border-radius: 18px;
  transition: 0.2s;
}

.toggle-slider::before {
  position: absolute;
  content: '';
  height: 12px;
  width: 12px;
  left: 3px;
  bottom: 3px;
  background-color: var(--section);
  border-radius: 50%;
  transition: 0.2s;
}

.timer-toggle input:checked + .toggle-slider {
  background-color: var(--teal);
}

.timer-toggle input:checked + .toggle-slider::before {
  transform: translateX(14px);
}

/* Scene Canvas */
.canvas-container {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
  background: var(--canvas);
  min-height: 500px;
  max-height: 1000px;
}

.three-container {
  width: 100%;
  height: 100%;
  background: var(--canvas);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.three-container canvas {
  display: block;
}

.scene-canvas-hidden {
  /* Hidden - used as texture source for Three.js */
  position: absolute;
  left: -9999px;
  visibility: hidden;
}

/* Resize handle */
.resize-handle {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 60px;
  height: 12px;
  background: var(--section);
  border: 1px solid var(--border);
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  cursor: ns-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease;
  z-index: 10;
  
  &:hover {
    background: var(--teal-semi);
    border-color: var(--teal);
  }
  
  &:active {
    background: var(--teal-hover);
  }
}

.resize-handle-icon {
  width: 24px;
  height: 4px;
  background: var(--midtone);
  border-radius: 2px;
  position: relative;
  
  &::before,
  &::after {
    content: '';
    position: absolute;
    left: 0;
    width: 100%;
    height: 2px;
    background: var(--midtone);
    border-radius: 1px;
  }
  
  &::before {
    top: -4px;
  }
  
  &::after {
    bottom: -4px;
  }
}

.resize-handle:hover .resize-handle-icon,
.resize-handle:hover .resize-handle-icon::before,
.resize-handle:hover .resize-handle-icon::after {
  background: var(--teal);
}

.section-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title-row .title {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.reload-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1rem;
  background: var(--teal-semi);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--teal);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.reload-btn:hover:not(:disabled) {
  background: var(--teal-hover);
  border-color: var(--teal);
}

.reload-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.reload-icon {
  font-size: 1rem;
}

.reload-icon.spinning {
  animation: spin 0.8s linear infinite;
}

.active-indicator {
  color: var(--teal);
  font-size: 0.6rem;
  margin-left: auto;
}

.scene-list-item.is-active {
  color: var(--title);
}

.scene-list-item.is-excluded {
  opacity: 0.5;
  
  .item-name {
    text-decoration: line-through;
  }
}

.scene-visibility-btn {
  background: transparent;
  border: none;
  padding: 0.25rem;
  cursor: pointer;
  color: var(--teal);
  opacity: 0.6;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  
  &:hover {
    opacity: 1;
  }
  
  &.excluded {
    color: var(--warning);
    opacity: 0.8;
  }
}

/* Expandable source items */
.source-list-item.expandable {
  flex-direction: column;
  align-items: stretch;
  cursor: pointer;
}

.source-list-item.folder-item {
  background: rgba(128, 245, 210, 0.03);
  border-left: 2px solid var(--teal);
}


.source-list-item.folder-child {
  margin-left: 1.5rem;
  border-left: 1px dashed var(--border);
  background: rgba(128, 245, 210, 0.02);
}

.source-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.source-settings {
  margin-top: 0.5rem;
  margin-left: 1.5rem;
  padding: 0.75rem;
  background: var(--section);
  border-radius: 6px;
  border: 1px solid var(--border);
}

.settings-json {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.75rem;
  color: var(--paragraph);
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  max-height: 100px;
  overflow-y: auto;
}

.settings-loading {
  color: var(--midtone);
  font-size: 0.8rem;
  font-style: italic;
}

.settings-empty {
  color: var(--midtone);
  font-size: 0.8rem;
}

/* Action Buttons Row */
.action-buttons-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

/* View Collections Button */
.view-collections-btn {
    display: flex;
    align-items: center;
    gap: .5rem;
    padding: .5rem .75rem;
    background: none;
    border: none;
    border-radius: 4px;
    color: var(--button);
    width: -moz-fit-content;
    width: fit-content;
    font-size: .95rem;
    font-weight: 500;
    cursor: pointer;
    transition: all .2s ease;
    font-family: Roboto,Arial,sans-serif;
}

.view-collections-btn:hover {
  color: var(--button-hover);
}

.view-collections-btn span {
  font-size: 1rem;
}

/* Play Scenes Button */
.play-scenes-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.6rem;
  background: var(--teal-semi);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--teal);
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: 'Roboto', Arial, sans-serif;
  margin-left: auto;
}

.play-scenes-btn:hover:not(:disabled) {
  background: var(--teal);
  color: var(--action-button-text);
  border-color: var(--teal);
}

.play-scenes-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.play-scenes-btn.active {
  background: var(--teal);
  color: var(--action-button-text);
  border-color: var(--teal);
}

.play-scenes-btn span {
  font-size: 1rem;
}

/* Notifications Demo */
.notifications-demo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.notification-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: 'Roboto', Arial, sans-serif;
}

.notification-btn.info {
  background: rgba(56, 189, 248, 0.1);
  color: rgb(56, 189, 248);
  border-color: rgba(56, 189, 248, 0.3);
}
.notification-btn.info:hover {
  background: rgb(56, 189, 248);
  color: #000;
}

.notification-btn.warning {
  background: rgba(251, 191, 36, 0.1);
  color: rgb(251, 191, 36);
  border-color: rgba(251, 191, 36, 0.3);
}
.notification-btn.warning:hover {
  background: rgb(251, 191, 36);
  color: #000;
}

.notification-btn.success {
  background: rgba(74, 222, 128, 0.1);
  color: rgb(74, 222, 128);
  border-color: rgba(74, 222, 128, 0.3);
}
.notification-btn.success:hover {
  background: rgb(74, 222, 128);
  color: #000;
}

.notification-btn span {
  font-size: 0.9rem;
}

/* Notification Log */
.notification-log {
  background: var(--section);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-top: 0.75rem;
  overflow: hidden;
}

.notification-log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: var(--subsection);
  border-bottom: 1px solid var(--border);
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--paragraph);
}

.clear-log-btn {
  background: transparent;
  border: none;
  color: var(--midtone);
  cursor: pointer;
  padding: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s ease;
}
.clear-log-btn:hover {
  color: var(--warning);
}

.notification-log-items {
  max-height: 200px;
  overflow-y: auto;
}

.notification-log-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border);
  font-size: 0.8rem;
}
.notification-log-item:last-child {
  border-bottom: none;
}
.notification-log-item.is-read {
  opacity: 0.5;
}

.notif-type {
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
}
.notif-type.info {
  background: rgba(56, 189, 248, 0.2);
  color: rgb(56, 189, 248);
}
.notif-type.warning {
  background: rgba(251, 191, 36, 0.2);
  color: rgb(251, 191, 36);
}
.notif-type.success {
  background: rgba(74, 222, 128, 0.2);
  color: rgb(74, 222, 128);
}

.notif-message {
  flex: 1;
  color: var(--paragraph);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.notif-id {
  color: var(--midtone);
  font-size: 0.7rem;
}

.mark-read-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--teal);
  cursor: pointer;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  transition: all 0.2s ease;
}
.mark-read-btn:hover {
  background: var(--teal);
  color: var(--action-button-text);
}

/* Playback Controls Section */
.playback-controls-section {
    background: var(--section);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    flex: 1;
    flex-direction: row;
}

.playback-controls-section.full-width {
    width: 100%;
    flex-basis: 100%;
    margin-top: 0.5rem;
}

.playback-controls-header {
  display: flex;
  align-items: center;
      justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: var(--dashboard-bg);
  border-bottom: 1px solid var(--border);
}

.playback-controls-buttons {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.playback-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: 'Roboto', Arial, sans-serif;
  background: var(--button);
  color: var(--link);
}

.playback-btn:hover:not(:disabled) {
  background: var(--button-hover);
  color: var(--link-active);
}

.playback-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.playback-btn.active {
  background: var(--teal);
  color: var(--action-button-text);
  border-color: var(--teal);
}

.playback-btn span {
  font-size: 1rem;
}

.spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(128, 245, 210, 0.3);
  border-top-color: #80f5d2;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.preview-btn {
  background: rgba(56, 189, 248, 0.1);
  color: rgb(56, 189, 248);
  border-color: rgba(56, 189, 248, 0.3);
}
.preview-btn:hover:not(:disabled) {
  background: rgb(56, 189, 248);
  color: #000;
  border-color: rgb(56, 189, 248);
}

/* Playback Progress Section */
.playback-progress-section {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0.5rem 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.playback-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.playback-icon {
  font-size: 1rem;
  color: var(--teal);
  animation: pulse 1.5s ease-in-out infinite;
}

.playback-label {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--paragraph);
}

.playback-timecode {
  margin-left: auto;
  font-size: 0.85rem;
  font-weight: 600;
  font-family: 'Roboto Mono', monospace;
  color: var(--teal);
}

.playback-progress-bar {
  position: relative;
  height: 12px;
  background: var(--border);
  border-radius: 6px;
  overflow: hidden;
  min-width: 50px;
  flex: 1;
}

.scene-divider {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--paragraph);
  opacity: 0.5;
  pointer-events: none;
}

.playback-progress-fill {
  height: 100%;
  background: var(--teal);
  border-radius: 6px;
  /* No transition - animated smoothly via requestAnimationFrame */
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--modal-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 2rem;
}

.modal-content {
  background: var(--section);
  border-radius: 12px;
  border: 1px solid var(--border);
  width: 100%;
  max-width: 900px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border);
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--title);
  margin: 0;
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  color: var(--midtone);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.modal-close:hover {
  background: var(--warning-bg);
  color: var(--warning);
}

.modal-close span {
  font-family: 'icomoon' !important;
  font-size: 1rem;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.modal-body .tree-container {
  gap: 0.5rem;
}

.modal-body .collection {
  background: var(--dark-background);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.modal-body .two-column-layout {
  min-height: 150px;
}

/* Recording Modal */
.recording-modal {
  max-width: 400px;
}

.recording-modal .modal-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.recording-modal .modal-title span {
  font-size: 1rem;
  color: var(--accent);
}

.recording-settings {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.setting-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--title);
}

.setting-label span {
  color: var(--accent);
}

.setting-input {
  width: 100px;
  padding: 0.75rem;
  background: var(--dark-background);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--title);
  font-size: 0.95rem;
  text-align: center;
  transition: border-color 0.2s ease;
}

.setting-input:focus {
  outline: none;
  border-color: var(--accent);
}

.setting-info {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem;
  background: rgba(128, 245, 210, 0.05);
  border-radius: 6px;
  font-size: 0.85rem;
  color: var(--paragraph);
}

.setting-info span {
  color: var(--accent);
  flex-shrink: 0;
}

.modal-footer {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

.output-path-note {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: var(--paragraph);
  opacity: 0.8;
  word-break: break-all;
}

.modal-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-btn {
  background: var(--button);
  border: none;
  font-weight: 600;
  color: var(--paragraph);
}

.cancel-btn:hover {
  color: var(--title);
}

.start-btn {
  background: var(--teal);
  border: none;
  font-weight: 600;
  color: var(--dark-background);
}

.start-btn:hover {
  background: var(--teal-hover);
}

.start-btn span {
  font-size: 0.85rem;
}
</style>
