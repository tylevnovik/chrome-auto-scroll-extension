// State variables
let isScrolling = false;
let speed = 40; // pixels per second
let mode = 'smooth'; // 'smooth' | 'interval'
let intervalSeconds = 3;
let intervalDistance = 0.5; // pages
let stopAtBottom = true;

// Timing / loop controls
let lastTime = 0;
let rafId = null;
let intervalId = null;
let lastScrollY = 0;
let lastMovementTime = 0;
let accumulatedScrollY = 0;




// Initialize settings from storage
chrome.storage.local.get(['speed', 'mode', 'intervalSeconds', 'intervalDistance', 'stopAtBottom'], (res) => {
  if (res.speed !== undefined) speed = parseInt(res.speed);
  if (res.mode !== undefined) mode = res.mode;
  if (res.intervalSeconds !== undefined) intervalSeconds = parseInt(res.intervalSeconds);
  if (res.intervalDistance !== undefined) intervalDistance = parseFloat(res.intervalDistance);
  if (res.stopAtBottom !== undefined) stopAtBottom = res.stopAtBottom;
});

// Listener for messages from popup or background service worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'getStatus':
      sendResponse({
        isScrolling,
        speed,
        mode,
        intervalSeconds,
        intervalDistance,
        stopAtBottom
      });
      break;

    case 'start':
      startScrolling();
      sendResponse({ success: true, isScrolling: true });
      break;

    case 'stop':
      stopScrolling();
      sendResponse({ success: true, isScrolling: false });
      break;

    case 'toggle':
      if (isScrolling) {
        stopScrolling();
      } else {
        startScrolling();
      }
      sendResponse({ success: true, isScrolling });
      break;

    case 'updateSettings':
      const prevMode = mode;
      const prevInterval = intervalSeconds;
      
      if (request.settings.speed !== undefined) speed = parseInt(request.settings.speed);
      if (request.settings.mode !== undefined) mode = request.settings.mode;
      if (request.settings.intervalSeconds !== undefined) intervalSeconds = parseInt(request.settings.intervalSeconds);
      if (request.settings.intervalDistance !== undefined) intervalDistance = parseFloat(request.settings.intervalDistance);
      if (request.settings.stopAtBottom !== undefined) stopAtBottom = request.settings.stopAtBottom;

      // If scrolling is active and we changed modes or interval speed, restart the loop/interval
      if (isScrolling) {
        if (mode !== prevMode || (mode === 'interval' && intervalSeconds !== prevInterval)) {
          stopLoop();
          startLoop();
        }
      }
      sendResponse({ success: true });
      break;
  }
  return true; // Keep channel open for async response
});

// Start scrolling handler
function startScrolling() {
  if (isScrolling) return;
  isScrolling = true;
  lastScrollY = window.scrollY;
  lastMovementTime = performance.now();
  accumulatedScrollY = 0;
  startLoop();
  notifyStateChange();
}

// Stop scrolling handler
function stopScrolling() {
  if (!isScrolling) return;
  isScrolling = false;
  stopLoop();
  notifyStateChange();
}

// Start scroll execution based on mode
function startLoop() {
  if (mode === 'smooth') {
    lastTime = performance.now();
    rafId = requestAnimationFrame(smoothScrollLoop);
  } else if (mode === 'interval') {
    // Perform initial scroll immediately, then start interval
    performIntervalScroll();
    intervalId = setInterval(performIntervalScroll, intervalSeconds * 1000);
  }
}

// Stop loops
function stopLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

// Smooth scrolling loop (RequestAnimationFrame)
function smoothScrollLoop(time) {
  if (!isScrolling || mode !== 'smooth') return;

  const elapsed = (time - lastTime) / 1000; // in seconds
  lastTime = time;

  // Protect against tab switching timing pauses
  if (elapsed > 0.1) {
    rafId = requestAnimationFrame(smoothScrollLoop);
    return;
  }

  // Scroll by calculated step with subpixel accumulation
  const step = speed * elapsed;
  accumulatedScrollY += step;

  if (accumulatedScrollY >= 1) {
    const scrollPixels = Math.floor(accumulatedScrollY);
    window.scrollBy(0, scrollPixels);
    accumulatedScrollY -= scrollPixels;
  }

  // Check if we hit the bottom
  if (checkBottomReached()) {
    if (stopAtBottom) {
      stopScrolling();
      notifyReachedBottom();
      return;
    }
  }

  rafId = requestAnimationFrame(smoothScrollLoop);
}

// Interval scrolling action
function performIntervalScroll() {
  if (!isScrolling || mode !== 'interval') return;

  const scrollAmount = window.innerHeight * intervalDistance;
  
  window.scrollBy({
    top: scrollAmount,
    behavior: 'smooth'
  });

  // Since smooth scroll takes a fraction of a second, we check for bottom after a short delay
  setTimeout(() => {
    if (isScrolling && checkBottomReached()) {
      if (stopAtBottom) {
        stopScrolling();
        notifyReachedBottom();
      }
    }
  }, 600);
}

// Check if page bottom is reached
function checkBottomReached() {
  const scrollHeight = document.documentElement.scrollHeight;
  const clientHeight = document.documentElement.clientHeight;
  const currentScroll = window.scrollY || window.pageYOffset;

  // 1. Standard bottom detection (with subpixel buffer)
  const isAtBottom = (currentScroll + clientHeight) >= (scrollHeight - 4);
  
  if (isAtBottom) {
    return true;
  }

  // 2. Fallback: Check if page is not moving down despite scroll commands.
  // We use time-elapsed and expected scroll distance instead of frames (ticks) to prevent
  // false triggers when the scroll step is extremely small (fractional pixels at low speeds).
  const now = performance.now();
  const timeElapsed = (now - lastMovementTime) / 1000; // in seconds
  
  if (Math.abs(currentScroll - lastScrollY) > 0.0001) {
    // Page has scrolled, reset trackers
    lastScrollY = currentScroll;
    lastMovementTime = now;
  } else if (currentScroll > 0) {
    // Page is stuck. Only trigger bottom state if:
    // - We've been stuck for more than 1.5 seconds.
    // - We expected to scroll at least 5 pixels during this time (prevents false stops at low speed).
    const expectedMovement = speed * timeElapsed;
    if (timeElapsed > 1.5 && expectedMovement > 5) {
      return true;
    }
  }
  
  return false;
}

// Notify other components of state changes
function notifyStateChange() {
  chrome.runtime.sendMessage({
    event: 'stateChanged',
    state: {
      isScrolling,
      speed,
      mode,
      intervalSeconds,
      intervalDistance,
      stopAtBottom
    }
  }).catch(() => {
    // Ignore error when popup is closed (no active listener)
  });
}

function notifyReachedBottom() {
  chrome.runtime.sendMessage({
    event: 'reachedBottom'
  }).catch(() => {
    // Ignore error when popup is closed
  });
}

// Optional user interaction interceptor:
// If the user manually scrolls upwards, should we pause? 
// Standard UX: If user scrolls, just let them. But if we want to auto-pause on manual scroll,
// we can listen to the wheel/touch events. Let's keep it simple: we let user scroll around 
// without pausing unless they click stop, which is standard for auto-scroll.
