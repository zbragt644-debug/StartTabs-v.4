// Initialize particles
particlesJS("particles-js", {
  particles: {
    number: { value: 70, density: { enable: true, value_area: 800 } },
    color: { value: "#ffffff" },
    shape: { type: "circle" },
    opacity: { value: 0.5, random: true },
    size: { value: 3, random: true },
    line_linked: {
      enable: true,
      distance: 120,
      color: "#ffffff",
      opacity: 0.3,
      width: 1
    },
    move: { enable: true, speed: 2, direction: "none", out_mode: "out" }
  },
  interactivity: {
    events: {
      onhover: { enable: false }, // ❌ disable hover
      onclick: { enable: false }  // ❌ disable click
    }
  },
  retina_detect: true
});

// Ensure DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  // Manage URLs button
  document.getElementById("optionsBtn").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // Link Start button
  document.getElementById("openTabs").addEventListener("click", () => {
    // Portal animation
    const portal = document.createElement("div");
    portal.className = "portal";
    document.body.appendChild(portal);
    setTimeout(() => portal.remove(), 700);

    // Send message to background.js
    chrome.runtime.sendMessage({ action: "openTabs" }, (response) => {
      console.log("Tabs opened:", response);
    });
  });
});
