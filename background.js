// background.js
// Group 1 => current window
// Group 2 => new window (placed on other screen if possible, then maximized)

// ---- small wrappers for callbacks -> Promises ----
function getLastFocusedWindow() {
  return new Promise((res) => chrome.windows.getLastFocused({ populate: true }, res));
}
function createWindow(opts) {
  return new Promise((res) => chrome.windows.create(opts, res));
}
function updateWindow(id, opts) {
  return new Promise((res) => chrome.windows.update(id, opts, res));
}
function createTab(opts) {
  return new Promise((res) => chrome.tabs.create(opts, res));
}
function queryTabs(query) {
  return new Promise((res) => chrome.tabs.query(query, res));
}
async function tryExecuteScript(tabId, func) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func
    });
    return results?.[0]?.result ?? null;
  } catch (e) {
    console.warn("executeScript failed:", e);
    return null;
  }
}

// ---- Fetch metadata (title) for a URL (used by options.js) ----
async function fetchMetadata(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const match = html.match(/<title>(.*?)<\/title>/i);
    const title = match ? match[1].trim() : new URL(url).hostname;
    return { url, title };
  } catch (error) {
    console.warn("fetchMetadata failed for:", url, error);
    return { url, title: new URL(url).hostname };
  }
}

// ---- Message handler (fetchMetadata or openTabs) ----
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "fetchMetadata") {
    fetchMetadata(message.url).then((meta) => sendResponse(meta));
    return true; // async
  }

  if (message.action === "openTabs") {
    chrome.storage.sync.get(["urls"], (data) => {
      const stored = data.urls || [];
      openTabsByGroup(stored).then(() => sendResponse({ success: true }))
        .catch((err) => {
          console.error("openTabs error:", err);
          sendResponse({ success: false, error: err?.message || "failed" });
        });
    });
    return true; // async
  }
});

// ---- Helper: normalize stored entries ----
function normalizeStoredItems(stored) {
  return (stored || []).map((it) => {
    if (typeof it === "string") {
      const url = it;
      return {
        url,
        title: new URL(url).hostname,
        favicon: `https://www.google.com/s2/favicons?sz=64&domain=${new URL(url).hostname}`,
        group: 1,
        pinned: false
      };
    } else {
      return {
        url: it.url,
        title: it.title || new URL(it.url).hostname,
        favicon: it.favicon || `https://www.google.com/s2/favicons?sz=64&domain=${new URL(it.url).hostname}`,
        group: it.group || 1,
        pinned: !!it.pinned
      };
    }
  });
}

// ---- Open tabs grouped by `group` ----
async function openTabsByGroup(stored) {
  const items = normalizeStoredItems(stored);
  const group1Items = items.filter(i => (i.group || 1) === 1);
  const group2Items = items.filter(i => (i.group || 1) === 2);

  // --- Group 1: open in current focused window ---
  if (group1Items.length > 0) {
    const currentWindow = await getLastFocusedWindow();
    await new Promise((resolve) => {
      chrome.tabs.query({ active: true, windowId: currentWindow.id }, (tabs) => {
        const activeTab = tabs && tabs[0];
        if (activeTab) {
          // replace active tab with first URL, add others
          chrome.tabs.update(activeTab.id, { url: group1Items[0].url, pinned: group1Items[0].pinned }, () => {
            for (let i = 1; i < group1Items.length; i++) {
              chrome.tabs.create({ url: group1Items[i].url, windowId: currentWindow.id, pinned: group1Items[i].pinned });
            }
            resolve();
          });
        } else {
          // fallback: create new window
          chrome.windows.create({
            url: group1Items.map(it => it.url),
            focused: true
          }, (win) => {
            // apply pinned state
            group1Items.forEach((it, idx) => {
              if (it.pinned && win.tabs[idx]) {
                chrome.tabs.update(win.tabs[idx].id, { pinned: true });
              }
            });
            resolve();
          });
        }
      });
    });
  }

  // --- Group 2: open in new window (placed & maximized) ---
  if (group2Items.length > 0) {
    const currentWindow = await getLastFocusedWindow();

    // try to read screen size via script injection (best effort)
    const activeTab = (currentWindow.tabs && currentWindow.tabs.find(t => t.active)) || (currentWindow.tabs && currentWindow.tabs[0]);
    let screenInfo = null;
    if (activeTab && /^https?:\/\//.test(activeTab.url)) {
      screenInfo = await tryExecuteScript(activeTab.id, () => {
        return { availWidth: window.screen.availWidth, availHeight: window.screen.availHeight };
      });
    }

    // fallback if detection fails
    const screenAvailWidth = screenInfo?.availWidth || 1920;
    const screenAvailHeight = screenInfo?.availHeight || 1080;

    const desiredWidth = Math.min(1280, screenAvailWidth);
    const desiredHeight = screenAvailHeight;

    let left = (currentWindow.left ?? 0) + (currentWindow.width ?? desiredWidth);
    let top = currentWindow.top ?? 0;

    try {
      // create new window at calculated position
      let newWin = await createWindow({
        url: group2Items[0].url,
        focused: true,
        left,
        top
      });

      // pin first tab if needed
      if (group2Items[0].pinned && newWin.tabs && newWin.tabs[0]) {
        chrome.tabs.update(newWin.tabs[0].id, { pinned: true });
      }

      // add other tabs
      for (let i = 1; i < group2Items.length; i++) {
        await createTab({ url: group2Items[i].url, windowId: newWin.id, pinned: group2Items[i].pinned });
      }

      // maximize it on that monitor
      await updateWindow(newWin.id, { state: "maximized" });

    } catch (err) {
      console.warn("Group2 window positioning failed, fallback:", err);
      // fallback: just open and maximize
      const fallbackWin = await createWindow({ url: group2Items[0].url, focused: true });
      if (group2Items[0].pinned && fallbackWin.tabs && fallbackWin.tabs[0]) {
        chrome.tabs.update(fallbackWin.tabs[0].id, { pinned: true });
      }
      for (let i = 1; i < group2Items.length; i++) {
        await createTab({ url: group2Items[i].url, windowId: fallbackWin.id, pinned: group2Items[i].pinned });
      }
      await updateWindow(fallbackWin.id, { state: "maximized" });
    }
  }
}

// ---- Auto-open on startup/install ----
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.sync.get(["urls"], (data) => {
    if (data.urls && data.urls.length > 0) {
      openTabsByGroup(data.urls).catch(e => console.warn(e));
    }
  });
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(["urls"], (data) => {
    if (data.urls && data.urls.length > 0) {
      openTabsByGroup(data.urls).catch(e => console.warn(e));
    }
  });
});
