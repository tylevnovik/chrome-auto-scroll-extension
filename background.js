// Background Service Worker for Auto Scroll Pro

// Listen for keyboard commands defined in manifest.json
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-scroll') {
    toggleActiveTabScroll();
  }
});

// Helper to toggle scrolling on current active tab
function toggleActiveTabScroll() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) return;
    const activeTab = tabs[0];
    
    // Verify if it's a valid webpage (allow http, https, and local file paths if granted)
    const isScrollableProtocol = activeTab.url && (
      activeTab.url.startsWith('http://') || 
      activeTab.url.startsWith('https://') || 
      activeTab.url.startsWith('file://')
    );

    if (!isScrollableProtocol) {
      return;
    }

    // Send toggle message to content script
    chrome.tabs.sendMessage(activeTab.id, { action: 'toggle' }, (response) => {
      // Handle potential errors (e.g. content script not loaded yet)
      if (chrome.runtime.lastError) {
        console.warn('Could not toggle scroll: ', chrome.runtime.lastError.message);
        // Inject content script on demand if it wasn't loaded (fallback)
        injectAndToggle(activeTab.id);
      }
    });
  });
}

// Fallback dynamic injection if content script is not yet active on the tab
function injectAndToggle(tabId) {
  if (!chrome.scripting) {
    console.error('chrome.scripting is undefined. Please reload the extension on the extension management page.');
    return;
  }
  
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['content.js']
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('Failed to inject content script:', chrome.runtime.lastError.message);
      return;
    }
    // Try sending toggle again after small delay
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, { action: 'toggle' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Failed to send toggle after injection:', chrome.runtime.lastError.message);
        }
      });
    }, 100);
  });
}

// Listen to messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : null;

  if (message.action === 'injectScript') {
    if (!chrome.scripting) {
      sendResponse({ success: false, error: 'scripting_undefined' });
      return true;
    }
    chrome.scripting.executeScript({
      target: { tabId: message.tabId },
      files: ['content.js']
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Failed to inject via popup message:', chrome.runtime.lastError.message);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true });
      }
    });
    return true; // Keep async response channel open
  }

  if (!tabId) return;

  if (message.event === 'stateChanged') {
    if (message.state.isScrolling) {
      chrome.action.setBadgeText({ text: '运行', tabId: tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#00e5ff', tabId: tabId });
      // Text color is white by default, which matches cyan badge nicely
    } else {
      chrome.action.setBadgeText({ text: '', tabId: tabId });
    }
  } else if (message.event === 'reachedBottom') {
    chrome.action.setBadgeText({ text: '完成', tabId: tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#7c4dff', tabId: tabId });
    
    // Clear the "完成" badge after 3 seconds
    setTimeout(() => {
      chrome.tabs.get(tabId, (tab) => {
        if (!chrome.runtime.lastError && tab) {
          chrome.action.setBadgeText({ text: '', tabId: tabId });
        }
      });
    }, 3000);
  }
});


