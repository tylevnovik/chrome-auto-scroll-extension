// DOM Elements
const playBtn = document.getElementById('play-btn');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const controlLabel = document.getElementById('control-label');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');

const speedSlider = document.getElementById('speed-slider');
const speedVal = document.getElementById('speed-val');

const modeSmooth = document.getElementById('mode-smooth');
const modeInterval = document.getElementById('mode-interval');
const intervalSettingsGroup = document.getElementById('interval-settings-group');
const intervalSlider = document.getElementById('interval-slider');
const intervalVal = document.getElementById('interval-val');
const distSlider = document.getElementById('dist-slider');
const distVal = document.getElementById('dist-val');

const stopBottomToggle = document.getElementById('stop-bottom-toggle');

// Extension state
let isCurrentlyScrolling = false;
let currentTabId = null;
let currentMode = 'smooth';

// Initialize Popup
document.addEventListener('DOMContentLoaded', () => {
  initSettings();
  connectToActiveTab();
  setupEventListeners();
});

// Load settings from storage and apply to UI
function initSettings() {
  chrome.storage.local.get({
    speed: 40,
    mode: 'smooth',
    intervalSeconds: 3,
    intervalDistance: 0.5,
    stopAtBottom: true
  }, (settings) => {
    // Speed
    speedSlider.value = settings.speed;
    speedVal.textContent = `${settings.speed} px/s`;

    // Mode
    setModeUI(settings.mode);

    // Interval settings
    intervalSlider.value = settings.intervalSeconds;
    intervalVal.textContent = `${settings.intervalSeconds} 秒`;
    
    distSlider.value = settings.intervalDistance;
    distVal.textContent = `${settings.intervalDistance} 屏`;

    // Toggle
    stopBottomToggle.checked = settings.stopAtBottom;
  });
}

// Check active tab state
function connectToActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      showErrorState("无活动标签页");
      return;
    }

    const activeTab = tabs[0];
    currentTabId = activeTab.id;

    // Verify if it's a valid webpage (allow http, https, and local file paths if granted)
    const isScrollableProtocol = activeTab.url && (
      activeTab.url.startsWith('http://') || 
      activeTab.url.startsWith('https://') || 
      activeTab.url.startsWith('file://')
    );

    if (!isScrollableProtocol) {
      showErrorState("受限页面");
      return;
    }

    // Query active tab scrolling status
    chrome.tabs.sendMessage(currentTabId, { action: 'getStatus' }, (response) => {
      if (chrome.runtime.lastError) {
        // Content script might not be injected. Let's dynamically inject it!
        injectContentScript(currentTabId);
      } else if (response) {
        syncUIWithState(response);
      }
    });
  });
}

// Inject content script on demand if not already loaded
function injectContentScript(tabId) {
  chrome.runtime.sendMessage({ action: 'injectScript', tabId: tabId }, (response) => {
    // Check if error response represents scripting undefined
    const isScriptingUndefined = response && response.error === 'scripting_undefined';
    
    if (chrome.runtime.lastError || !response || !response.success) {
      if (isScriptingUndefined) {
        showErrorState("请刷新插件以更新权限");
      } else {
        showErrorState("不支持滚动");
      }
      console.warn("Script injection failed:", chrome.runtime.lastError || (response && response.error));
      return;
    }
    
    // Query state again after injection
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, { action: 'getStatus' }, (response) => {
        if (response) {
          syncUIWithState(response);
        }
      });
    }, 100);
  });
}

// Synchronize all UI settings and states with content script values
function syncUIWithState(state) {
  isCurrentlyScrolling = state.isScrolling;
  updatePlayButtonUI(isCurrentlyScrolling);
  
  if (state.speed !== undefined) {
    speedSlider.value = state.speed;
    speedVal.textContent = `${state.speed} px/s`;
  }
  if (state.mode !== undefined) {
    setModeUI(state.mode);
  }
  if (state.intervalSeconds !== undefined) {
    intervalSlider.value = state.intervalSeconds;
    intervalVal.textContent = `${state.intervalSeconds} 秒`;
  }
  if (state.intervalDistance !== undefined) {
    distSlider.value = state.intervalDistance;
    distVal.textContent = `${state.intervalDistance} 屏`;
  }
  if (state.stopAtBottom !== undefined) {
    stopBottomToggle.checked = state.stopAtBottom;
  }
}

// Display error message and disable buttons for restricted pages
function showErrorState(reason) {
  playBtn.disabled = true;
  playBtn.style.opacity = '0.5';
  playBtn.style.cursor = 'not-allowed';
  
  statusBadge.className = 'status-badge';
  statusText.textContent = '已禁用';
  
  if (reason === "受限页面") {
    controlLabel.textContent = "受系统限制，无法在浏览器自带页面运行";
    controlLabel.style.color = 'var(--text-muted)';
  } else if (reason === "请刷新插件以更新权限") {
    controlLabel.textContent = "请在浏览器扩展管理页刷新本插件以更新权限";
    controlLabel.style.color = '#ff1744'; // Red warning color
  } else {
    controlLabel.textContent = "请刷新当前页面以启动自动滚动";
  }
}

// Mode UI Switch helper
function setModeUI(mode) {
  currentMode = mode;
  if (mode === 'smooth') {
    modeSmooth.classList.add('active');
    modeInterval.classList.remove('active');
    intervalSettingsGroup.style.display = 'none';
  } else {
    modeSmooth.classList.remove('active');
    modeInterval.classList.add('active');
    intervalSettingsGroup.style.display = 'flex';
  }
}

// Play/Pause state UI updater
function updatePlayButtonUI(scrolling) {
  if (scrolling) {
    playBtn.classList.add('active');
    iconPlay.style.display = 'none';
    iconPause.style.display = 'block';
    
    statusBadge.className = 'status-badge active';
    statusText.textContent = '滚动中';
    
    if (currentMode === 'smooth') {
      controlLabel.textContent = `正在以 ${speedSlider.value} px/s 平滑滚动`;
    } else {
      controlLabel.textContent = `每隔 ${intervalSlider.value} 秒滚动一次`;
    }
  } else {
    playBtn.classList.remove('active');
    iconPlay.style.display = 'block';
    iconPause.style.display = 'none';
    
    statusBadge.className = 'status-badge';
    statusText.textContent = '未运行';
    
    controlLabel.textContent = "点击开始自动滚动";
  }
}

// Send current settings to the content script in active tab
function saveAndSendSettings() {
  const settings = {
    speed: parseInt(speedSlider.value),
    mode: currentMode,
    intervalSeconds: parseInt(intervalSlider.value),
    intervalDistance: parseFloat(distSlider.value),
    stopAtBottom: stopBottomToggle.checked
  };

  // Sync to chrome storage
  chrome.storage.local.set(settings);

  // Update label if active
  if (isCurrentlyScrolling) {
    if (currentMode === 'smooth') {
      controlLabel.textContent = `正在以 ${settings.speed} px/s 平滑滚动`;
    } else {
      controlLabel.textContent = `每隔 ${settings.intervalSeconds} 秒滚动一次`;
    }
  }

  // Send to content script
  if (currentTabId) {
    chrome.tabs.sendMessage(currentTabId, {
      action: 'updateSettings',
      settings: settings
    }, () => {
      // Catch error if tab was closed/navigated
      if (chrome.runtime.lastError) {
        console.warn("Couldn't update active tab settings");
      }
    });
  }
}

// Setup popup listeners
function setupEventListeners() {
  // Play/Pause Action
  playBtn.addEventListener('click', () => {
    if (!currentTabId) return;
    
    const action = isCurrentlyScrolling ? 'stop' : 'start';
    chrome.tabs.sendMessage(currentTabId, { action: action }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Communication error:", chrome.runtime.lastError.message);
        return;
      }
      if (response) {
        isCurrentlyScrolling = response.isScrolling;
        updatePlayButtonUI(isCurrentlyScrolling);
      }
    });
  });

  // Speed Slider input
  speedSlider.addEventListener('input', () => {
    speedVal.textContent = `${speedSlider.value} px/s`;
    saveAndSendSettings();
  });

  // Interval Time Slider input
  intervalSlider.addEventListener('input', () => {
    intervalVal.textContent = `${intervalSlider.value} 秒`;
    saveAndSendSettings();
  });

  // Interval Distance Slider input
  distSlider.addEventListener('input', () => {
    distVal.textContent = `${distSlider.value} 屏`;
    saveAndSendSettings();
  });

  // Stop at bottom Toggle input
  stopBottomToggle.addEventListener('change', () => {
    saveAndSendSettings();
  });

  // Mode Selection Tabs
  modeSmooth.addEventListener('click', () => {
    if (currentMode === 'smooth') return;
    setModeUI('smooth');
    saveAndSendSettings();
  });

  modeInterval.addEventListener('click', () => {
    if (currentMode === 'interval') return;
    setModeUI('interval');
    saveAndSendSettings();
  });

  // Listen to messages from content script to sync scrolling status
  chrome.runtime.onMessage.addListener((message) => {
    if (message.event === 'stateChanged') {
      syncUIWithState(message.state);
    } else if (message.event === 'reachedBottom') {
      isCurrentlyScrolling = false;
      updatePlayButtonUI(false);
      
      statusBadge.className = 'status-badge paused';
      statusText.textContent = '已结束';
      controlLabel.textContent = "已滚动到页面底部！";
    }
  });
}

