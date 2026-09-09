
(function () {

    const REACTIVE_THEMES = ["ENTHROPY", "GENESIS"];

    /* =========================
        BOOT SCREEN
    ========================= */

    const BOOT_TEXT = {
        ENTHROPY: {
            lines: ["ENTHROPY // SYSTEM", "RECOVERING LAST STATE...", "ENTROPY RISING"],
            bg: "#050505",
            fg: "#b6ae9e"
        },
        GENESIS: {
            lines: ["GENESIS // SYSTEM", "LOADING ROOM...", "LIGHTS UP"],
            bg: "#f2efe6",
            fg: "#1c1c1a"
        }
    };

    let bootEl = null;

    function playBootScreen(themeName) {
        const cfg = BOOT_TEXT[themeName];
        if (!cfg) return;

        if (bootEl) bootEl.remove();

        bootEl = document.createElement("div");
        bootEl.id = "theme-boot-screen";
        bootEl.dataset.boot = themeName;
        bootEl.style.background = cfg.bg;
        bootEl.style.color = cfg.fg;

        bootEl.innerHTML = `
            <div class="boot-lines">
                ${cfg.lines.map(l => `<div class="boot-line">${l}</div>`).join("")}
            </div>
            <div class="boot-bar"><div class="boot-bar-fill"></div></div>
        `;

        document.body.appendChild(bootEl);

        requestAnimationFrame(() => bootEl.classList.add("boot-in"));

        setTimeout(() => {
            if (!bootEl) return;
            bootEl.classList.add("boot-out");
            setTimeout(() => {
                bootEl?.remove();
                bootEl = null;
            }, 450);
        }, 1700);
    }

    /* =========================
        WRAP setTheme()
        (function declarations in classic scripts are global,
        so this replaces every call site, including the one
        initializeApp() makes on boot)
    ========================= */

    const originalSetTheme = window.setTheme;
    window.setTheme = function (colorthemes) {
        originalSetTheme(colorthemes);
        if (REACTIVE_THEMES.includes(colorthemes)) {
            playBootScreen(colorthemes);
        }
        updateMeshVisibility(colorthemes);
    };
/* =========================
    TECH MESH CANVAS
========================= */

const canvas = document.createElement("canvas");
canvas.id = "theme-mesh";
document.body.prepend(canvas);

const ctx = canvas.getContext("2d");
let nodes = [];
let raf = null;
let palette = ["#76CB65", "#4CAF50", "#8FD97F"]; // Added more green variations

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function initNodes() {
    const count = Math.round((canvas.width * canvas.height) / 28000); // Reduced divisor for more nodes
    nodes = Array.from({ length: Math.max(30, Math.min(count, 120)) }, () => ({ // Increased min/max
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - .5) * .4,  // Faster movement
        vy: (Math.random() - .5) * .4,
        c: palette[Math.floor(Math.random() * palette.length)],
        size: Math.random() * 2 + 1.5  // Variable node sizes
    }));
}

resizeCanvas();
initNodes();
window.addEventListener("resize", () => {
    resizeCanvas();
    initNodes();
});

function step() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    nodes.forEach(n => {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > canvas.width) n.vx *= -1;
        if (n.y < 0 || n.y > canvas.height) n.vy *= -1;
    });

    // Draw lines
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d < 200) { // Increased connection distance
                const opacity = (1 - d / 200) * .65; // Increased opacity
                
                // Create gradient for lines
                const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
                gradient.addColorStop(0, a.c);
                gradient.addColorStop(1, b.c);
                
                ctx.strokeStyle = gradient;
                ctx.globalAlpha = opacity;
                ctx.lineWidth = 1.5; // Thicker lines
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }
        }
    }

    // Draw nodes with glow
    nodes.forEach(n => {
        ctx.globalAlpha = 1;
        
        // Outer glow
        ctx.fillStyle = n.c;
        ctx.shadowColor = n.c;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner bright core
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.size * 0.4, 0, Math.PI * 2);
        ctx.fill();
    });

    raf = requestAnimationFrame(step);
}

function updateMeshVisibility(themeName) {
    const active = REACTIVE_THEMES.includes(themeName);
    canvas.classList.toggle("active", active);
    if (active && !raf) step();
    if (!active && raf) {
        cancelAnimationFrame(raf);
        raf = null;
    }
}

updateMeshVisibility(settings?.theme);

    /* =========================
        PALETTE EXTRACTION FROM COVER ART
    ========================= */

    function quantize(imgData) {
        const buckets = {};
        const step = 32;

        for (let i = 0; i < imgData.length; i += 4 * 6) { // sample every 6th pixel
            const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2], a = imgData[i + 3];
            if (a < 128) continue;
            const key = [
                Math.round(r / step) * step,
                Math.round(g / step) * step,
                Math.round(b / step) * step
            ].join(",");
            buckets[key] = (buckets[key] || 0) + 1;
        }

        return Object.entries(buckets)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([key]) => `rgb(${key})`);
    }

    function extractPalette(imgEl) {
        try {
            const c = document.createElement("canvas");
            c.width = 48;
            c.height = 48;
            const cctx = c.getContext("2d");
            cctx.drawImage(imgEl, 0, 0, 48, 48);

            const data = cctx.getImageData(0, 0, 48, 48).data;
            const colors = quantize(data);

            if (colors.length) {
                palette = colors;
                initNodes();
            }
        } catch (err) {
            // Remote/cross-origin cover art without CORS headers taints
            // the canvas — silently keep whatever palette we already had.
        }
    }

    function watchCover(imgGetter) {
        const observer = new MutationObserver(() => {
            const img = imgGetter();
            if (!img) return;
            if (img.complete && img.naturalWidth) {
                extractPalette(img);
            } else {
                img.addEventListener("load", () => extractPalette(img), { once: true });
            }
        });
        return observer;
    }

    if (DOM.library?.cover) {
        watchCover(() => DOM.library.cover.querySelector("img"))
            .observe(DOM.library.cover, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["src"]
            });
    }

    if (DOM.miniPlayer?.cover) {
        watchCover(() => DOM.miniPlayer.cover)
            .observe(DOM.miniPlayer.cover, {
                attributes: true,
                attributeFilter: ["src"]
            });
    }

})();
