// options.js

const urlItems = document.getElementById("urlItems");
const newUrlInput = document.getElementById("newUrl");
const groupSelect = document.getElementById("groupSelect");
const addBtn = document.getElementById("addBtn");
const toast = document.getElementById("toast");

// Modal elements
const confirmModal = document.getElementById("confirmModal");
const confirmFavicon = document.getElementById("confirmFavicon");
const confirmSiteName = document.getElementById("confirmSiteName");
const confirmSiteUrl = document.getElementById("confirmSiteUrl");
const confirmCancel = document.getElementById("confirmCancel");
const confirmDelete = document.getElementById("confirmDelete");

let urls = []; // array of objects {url,title,favicon,group,pinned}
let deletingUrl = null;

// simple toast
function showToast(message, type = "success") {
  toast.textContent = message;
  toast.className = "";
  toast.classList.add(type);
  toast.style.display = "block";
  setTimeout(() => { toast.style.display = "none"; }, 3000);
}

// normalize a typed URL (returns absolute string or null)
function normalizeUrl(input) {
  if (!input) return null;
  input = input.trim();
  try { return new URL(input).href; }
  catch { try { return new URL("https://" + input).href; } catch { return null; } }
}

// fallback favicon
function getFavicon(url) {
  try {
    return `https://www.google.com/s2/favicons?sz=64&domain=${new URL(url).hostname}`;
  } catch {
    return "https://via.placeholder.com/16?text=?";
  }
}

// fallback site name
function getSiteName(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

// Render list (create elements)
function renderList() {
  urlItems.innerHTML = "";
  urls.forEach((item) => {
    const { url, title, favicon, group, pinned } = item;

    const li = document.createElement("li");
    li.dataset.url = url;

    const handle = document.createElement("div");
    handle.className = "drag-handle";
    handle.innerText = "☰";
    li.appendChild(handle);

    const siteInfo = document.createElement("div");
    siteInfo.className = "site-info";

    // favicon (skip for chrome-extension://)
    if (!url.startsWith("chrome-extension://")) {
      const img = document.createElement("img");
      img.src = favicon || getFavicon(url);
      img.onerror = () => (img.src = "https://via.placeholder.com/16?text=?");
      siteInfo.appendChild(img);
    }

    const textWrapper = document.createElement("div");
    textWrapper.className = "site-text";

    const titleDiv = document.createElement("div");
    titleDiv.className = "site-title";
    titleDiv.textContent = title || getSiteName(url);

    const shortUrl = document.createElement("div");
    shortUrl.className = "site-url";
    shortUrl.textContent = url;

    // group label
    const groupDiv = document.createElement("div");
    groupDiv.className = "site-group";
    groupDiv.style.marginTop = "6px";
    groupDiv.style.fontSize = "12px";
    groupDiv.style.opacity = "0.85";
    groupDiv.textContent = `Group ${group || 1}`;

    textWrapper.appendChild(titleDiv);
    textWrapper.appendChild(shortUrl);
    textWrapper.appendChild(groupDiv);

    siteInfo.appendChild(textWrapper);

    // group select per item
    const itemGroupSelect = document.createElement("select");
    itemGroupSelect.innerHTML = `<option value="1" ${(group || 1) === 1 ? "selected" : ""}>Group 1</option>
                                 <option value="2" ${(group || 1) === 2 ? "selected" : ""}>Group 2</option>`;
    itemGroupSelect.style.marginRight = "10px";
    itemGroupSelect.addEventListener("change", (e) => {
      item.group = parseInt(e.target.value, 10);
      saveUrls(false);
      renderList();
    });

    // pin checkbox
    const pinCheckbox = document.createElement("input");
    pinCheckbox.type = "checkbox";
    pinCheckbox.checked = !!pinned;
    pinCheckbox.title = "Pin this tab on open";
    pinCheckbox.style.marginRight = "10px";
    pinCheckbox.addEventListener("change", (e) => {
      item.pinned = e.target.checked;
      saveUrls(false);
    });

    // remove button
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      deletingUrl = url;
      confirmFavicon.src = item.favicon || getFavicon(url);
      confirmSiteName.textContent = item.title || getSiteName(url);
      confirmSiteUrl.textContent = url;
      confirmModal.classList.add("visible");
    });

    li.appendChild(siteInfo);
    li.appendChild(itemGroupSelect);
    li.appendChild(pinCheckbox);
    li.appendChild(removeBtn);

    urlItems.appendChild(li);
  });
}

// Save to chrome.storage
function saveUrls(showMessage = true) {
  chrome.storage.sync.set({ urls }, () => {
    if (showMessage) showToast("✅ URLs saved successfully!", "success");
  });
}

// Load from storage and migrate old format if needed
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get(["urls"], (data) => {
    const raw = data.urls || [];
    urls = raw.map(it => {
      if (typeof it === "string") {
        const url = it;
        return {
          url,
          title: getSiteName(url),
          favicon: getFavicon(url),
          group: 1,
          pinned: false
        };
      } else {
        return {
          url: it.url,
          title: it.title || getSiteName(it.url),
          favicon: it.favicon || getFavicon(it.url),
          group: it.group || 1,
          pinned: !!it.pinned
        };
      }
    });
    renderList();

    if (typeof Sortable !== "undefined") {
      new Sortable(urlItems, {
        animation: 150,
        handle: ".drag-handle",
        onEnd: () => {
          const newOrder = Array.from(urlItems.querySelectorAll("li")).map(li => {
            return urls.find(u => u.url === li.dataset.url) || {
              url: li.dataset.url,
              title: getSiteName(li.dataset.url),
              favicon: getFavicon(li.dataset.url),
              group: 1,
              pinned: false
            };
          });
          urls = newOrder;
          saveUrls(false);
          showToast("✅ Order updated", "success");
        }
      });
    }
  });

  // Init Vanta safely
  try {
    if (typeof VANTA !== "undefined" && VANTA.RINGS) {
      VANTA.RINGS({
        el: "#vanta-bg",
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200.00,
        minWidth: 200.00,
        scale: 1.00,
        scaleMobile: 1.00,
        backgroundColor: 0x0d0d0d,
        color: 0x3f51b5
      });
    }
  } catch (e) {
    console.warn("Vanta init failed:", e);
  }
});

// Add new URL
addBtn.addEventListener("click", () => {
  const normalized = normalizeUrl(newUrlInput.value);
  if (!normalized) { showToast("❌ Invalid URL", "error"); return; }

  if (urls.some(it => it.url === normalized)) { showToast("❌ URL already exists", "error"); return; }

  const group = parseInt(groupSelect?.value || "1", 10);
  chrome.runtime.sendMessage({ action: "fetchMetadata", url: normalized }, (meta) => {
    const hostname = new URL(normalized).hostname;
    const newEntry = {
      url: normalized,
      title: meta?.title || hostname,
      favicon: `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`,
      group,
      pinned: false
    };
    urls.push(newEntry);
    newUrlInput.value = "";
    renderList();
    saveUrls(false);
    showToast("✅ URL added", "success");
  });
});

// Modal actions
confirmCancel.addEventListener("click", () => {
  confirmModal.classList.remove("visible");
  deletingUrl = null;
});
confirmDelete.addEventListener("click", () => {
  if (deletingUrl) {
    urls = urls.filter(u => u.url !== deletingUrl);
    renderList();
    saveUrls(false);
    showToast("✅ URL removed", "success");
    deletingUrl = null;
  }
  confirmModal.classList.remove("visible");
});
