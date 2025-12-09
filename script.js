// Initialize Icons
lucide.createIcons();

// Elements
const canvas = document.getElementById('graphCanvas');
const ctx = canvas.getContext('2d');
const wrapper = document.getElementById('canvas-wrapper');
const instructions = document.getElementById('instructions');
const logBox = document.getElementById('logBox');

// State
let nodes = [];
let edges = [];
let mode = 'node'; 
let selectedNode = null;
let nodeCounter = 1;
let isAnimating = false;
let view = { x: 0, y: 0, scale: 1 };

// Mouse Tracking
let isDragging = false;
let lastMouse = { x: 0, y: 0 };
let pendingNodeCoords = { x: 0, y: 0 };

function init() {
    resize();
    window.addEventListener('resize', resize);
    wrapper.addEventListener('wheel', handleWheel, { passive: false });
    wrapper.addEventListener('mousedown', handleDown);
    wrapper.addEventListener('mousemove', handleMove);
    wrapper.addEventListener('mouseup', handleUp);
    document.getElementById('nodeNameInput').addEventListener('keypress', e => {
        if(e.key === 'Enter') confirmAddNode();
    });
    
    loadDemo();
    animateLoop(); // Start the animation loop for glow effects
}

function resize() {
    canvas.width = wrapper.clientWidth;
    canvas.height = wrapper.clientHeight;
    // No draw() here, handled by animateLoop
}

function loadDemo() {
    // Reset View
    view = { x: 0, y: 0, scale: 1 };
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    
    addNodeData(cx, cy - 150, "Library");
    addNodeData(cx - 150, cy, "Hostel");
    addNodeData(cx + 150, cy, "Cafeteria");
    addNodeData(cx, cy + 150, "Gym");
    addNodeData(cx, cy, "Admin");

    addEdgeData(0, 4); addEdgeData(1, 4); addEdgeData(2, 4);
    addEdgeData(3, 4); addEdgeData(0, 2);
    
    log("Demo map loaded.");
}

// --- Interaction ---

function setMode(newMode) {
    if(isAnimating) return;
    mode = newMode;
    selectedNode = null;

    // UI Updates
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${mode}`).classList.add('active');
    
    wrapper.className = ''; // Reset cursor
    
    if (mode === 'node') {
        instructions.textContent = "Click anywhere to add a Node";
        instructions.style.backgroundColor = "var(--primary)";
    } else if (mode === 'edge') {
        instructions.textContent = "Select two nodes to connect";
        instructions.style.backgroundColor = "var(--primary)";
    } else if (mode === 'pan') {
        instructions.textContent = "Drag to move • Scroll to zoom";
        wrapper.classList.add('pan-mode');
        instructions.style.backgroundColor = "var(--text-muted)";
    } else if (mode === 'delete') {
        instructions.textContent = "Click a node to delete it";
        wrapper.classList.add('delete-mode');
        instructions.style.backgroundColor = "var(--accent)";
    }
}

function getWorldCoords(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left - view.x) / view.scale,
        y: (e.clientY - rect.top - view.y) / view.scale
    };
}

function handleDown(e) {
    if(e.target.closest('.glass-panel') || e.target.closest('.zoom-controls')) return;
    
    const coords = getWorldCoords(e);
    const clickedIdx = getHoveredNode(coords.x, coords.y);
    
    if (mode === 'pan') {
        isDragging = true;
        lastMouse = { x: e.clientX, y: e.clientY };
        return;
    }

    if (mode === 'node') {
        if (clickedIdx === -1) {
            pendingNodeCoords = coords;
            openModal();
        }
    } else if (mode === 'edge') {
        if (clickedIdx !== -1) {
            if (selectedNode === null) {
                selectedNode = clickedIdx;
            } else {
                if (selectedNode !== clickedIdx) addEdgeData(selectedNode, clickedIdx);
                selectedNode = null;
            }
        } else {
            selectedNode = null;
        }
    } else if (mode === 'delete') {
        if (clickedIdx !== -1) deleteNode(clickedIdx);
    }
}

function handleMove(e) {
    if (isDragging) {
        const dx = e.clientX - lastMouse.x;
        const dy = e.clientY - lastMouse.y;
        view.x += dx;
        view.y += dy;
        lastMouse = { x: e.clientX, y: e.clientY };
    }
}

function handleUp() { 
    isDragging = false; 
}

function handleWheel(e) {
    e.preventDefault();
    const zoomSpeed = 0.1;
    const dir = e.deltaY < 0 ? 1 : -1;
    zoomAt(e.clientX, e.clientY, dir * zoomSpeed);
}

function zoomCanvas(dir) {
    const rect = canvas.getBoundingClientRect();
    const cx = canvas.width / 2 + rect.left;
    const cy = canvas.height / 2 + rect.top;
    zoomAt(cx, cy, dir * 0.3);
}

function zoomAt(screenX, screenY, amount) {
    const rect = canvas.getBoundingClientRect();
    const worldX = (screenX - rect.left - view.x) / view.scale;
    const worldY = (screenY - rect.top - view.y) / view.scale;
    
    let newScale = view.scale + amount;
    if (newScale < 0.2) newScale = 0.2;
    if (newScale > 5) newScale = 5;
    
    view.x = (screenX - rect.left) - worldX * newScale;
    view.y = (screenY - rect.top) - worldY * newScale;
    view.scale = newScale;
}

function resetView() {
    view = { x: 0, y: 0, scale: 1 };
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    if(nodes.length > 0) {
        let avgX = 0, avgY = 0;
        nodes.forEach(n => { avgX += n.x; avgY += n.y; });
        avgX /= nodes.length;
        avgY /= nodes.length;
        view.x = cx - avgX;
        view.y = cy - avgY;
    }
}

// --- Data Ops ---

function addNodeData(x, y, label) {
    nodes.push({ x, y, label, state: 'default' });
    log(`Created: ${label}`);
    updateSelect();
}

function addEdgeData(u, v) {
    if (edges.some(e => (e.u === u && e.v === v) || (e.u === v && e.v === u))) {
        showToast("Path already exists!");
        return;
    }
    edges.push({ u, v });
    log(`Linked: ${nodes[u].label} ↔ ${nodes[v].label}`);
}

function deleteNode(idx) {
    const name = nodes[idx].label;
    edges = edges.filter(e => e.u !== idx && e.v !== idx);
    edges.forEach(e => {
        if (e.u > idx) e.u--;
        if (e.v > idx) e.v--;
    });
    nodes.splice(idx, 1);
    log(`Deleted: ${name}`);
    updateSelect();
}

function getHoveredNode(x, y) {
    const r = 35;
    for(let i=0; i<nodes.length; i++) {
        const dx = x - nodes[i].x;
        const dy = y - nodes[i].y;
        if (dx*dx + dy*dy < r*r) return i;
    }
    return -1;
}

// --- Drawing System ---

let time = 0;
function animateLoop() {
    time += 0.05;
    draw();
    requestAnimationFrame(animateLoop);
}

function draw() {
    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Grid
    drawGrid();

    // Apply Camera
    ctx.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);

    // Draw Edges
    ctx.lineWidth = 2 / view.scale;
    if (ctx.lineWidth < 1) ctx.lineWidth = 1;

    edges.forEach(e => {
        const n1 = nodes[e.u];
        const n2 = nodes[e.v];
        
        ctx.beginPath();
        ctx.moveTo(n1.x, n1.y);
        ctx.lineTo(n2.x, n2.y);
        
        // Neon effect
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
        ctx.shadowBlur = 0;
        ctx.stroke();
    });

    // Draw Nodes
    const r = 24; 
    nodes.forEach((n, i) => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        
        // Base fill
        ctx.fillStyle = '#1e293b';
        
        // Selection / State Styles
        if (n.state === 'visited') {
            ctx.strokeStyle = '#34d399';
            ctx.shadowColor = '#34d399';
            ctx.shadowBlur = 15;
            ctx.fillStyle = '#064e3b';
        } else if (n.state === 'visiting') {
            ctx.strokeStyle = '#fbbf24';
            ctx.shadowColor = '#fbbf24';
            ctx.shadowBlur = 20 + Math.sin(time * 5) * 5; // Pulse
            ctx.fillStyle = '#78350f';
        } else {
            ctx.strokeStyle = (selectedNode === i) ? '#6366f1' : '#cbd5e1';
            ctx.shadowColor = (selectedNode === i) ? '#6366f1' : 'transparent';
            ctx.shadowBlur = (selectedNode === i) ? 20 : 0;
        }

        ctx.lineWidth = (selectedNode === i || n.state !== 'default') ? 3 : 2;
        ctx.lineWidth = ctx.lineWidth / view.scale < 1 ? 1 : ctx.lineWidth / view.scale;

        ctx.fill();
        ctx.stroke();
        
        // Reset shadow
        ctx.shadowBlur = 0;

        // Label
        ctx.fillStyle = '#f1f5f9';
        ctx.font = `600 ${12/view.scale + 4}px Inter`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.label.substring(0, 10), n.x, n.y);
    });
}

function drawGrid() {
    const step = 50 * view.scale;
    const offsetX = view.x % step;
    const offsetY = view.y % step;
    
    ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
    
    for (let x = offsetX; x < canvas.width; x += step) {
        for (let y = offsetY; y < canvas.height; y += step) {
            ctx.beginPath();
            ctx.arc(x, y, 1 * view.scale, 0, Math.PI*2);
            ctx.fill();
        }
    }
}

// --- UI Logic ---

function toggleMenu() {
    const panel = document.getElementById('mainPanel');
    const icon = document.getElementById('toggleIcon');
    panel.classList.toggle('collapsed');
    
    if (panel.classList.contains('collapsed')) {
        icon.setAttribute('data-lucide', 'menu');
    } else {
        icon.setAttribute('data-lucide', 'chevrons-left');
    }
    lucide.createIcons();
}

function updateSelect() {
    const sel = document.getElementById('startNodeSelect');
    const curr = sel.value === '' ? null : parseInt(sel.value, 10); // remember previous selection as number
    sel.innerHTML = '<option value="">Select Start Node...</option>';
    nodes.forEach((n, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.text = n.label;
        sel.appendChild(opt);
    });
    if (curr !== null && !Number.isNaN(curr) && curr < nodes.length) sel.value = curr;
}

function log(msg) {
    const d = document.createElement('div');
    d.className = 'log-entry';
    d.textContent = msg;
    logBox.appendChild(d);
    logBox.scrollTop = logBox.scrollHeight;
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', 3000);
}

// Modal
const modal = document.getElementById('modalOverlay');
const nameInput = document.getElementById('nodeNameInput');

function openModal() {
    nameInput.value = `Node ${nodeCounter}`;
    modal.style.display = 'flex';
    requestAnimationFrame(() => modal.classList.add('modal-active'));
    nameInput.focus();
    nameInput.select();
}

function closeModal() {
    modal.classList.remove('modal-active');
    setTimeout(() => modal.style.display = 'none', 300);
}

function confirmAddNode() {
    const name = nameInput.value.trim();
    if(name) {
        addNodeData(pendingNodeCoords.x, pendingNodeCoords.y, name);
        nodeCounter++;
        closeModal();
    }
}

// --- Algorithms ---

async function runBFS() {
    if(isAnimating) return;
    const start = parseInt(document.getElementById('startNodeSelect').value);
    if(isNaN(start)) { showToast("Select a start node!"); return; }
    
    startAlgo("BFS");
    let q = [start];
    let visited = new Set([start]);
    nodes[start].state = 'visiting';
    
    while(q.length > 0) {
        const u = q.shift();
        await sleep(500);
        nodes[u].state = 'visited';
        
        const neighbors = edges
            .filter(e => e.u === u || e.v === u)
            .map(e => e.u === u ? e.v : e.u);
            
        for(let v of neighbors) {
            if(!visited.has(v)) {
                visited.add(v);
                nodes[v].state = 'visiting';
                q.push(v);
                await sleep(300);
            }
        }
    }
    endAlgo();
}

async function runDFS() {
    if(isAnimating) return;
    const start = parseInt(document.getElementById('startNodeSelect').value);
    if(isNaN(start)) { showToast("Select a start node!"); return; }

    startAlgo("DFS");
    await dfsRec(start, new Set());
    endAlgo();
}

async function dfsRec(u, visited) {
    visited.add(u);
    nodes[u].state = 'visiting';
    await sleep(600);
    nodes[u].state = 'visited';
    
    const neighbors = edges
        .filter(e => e.u === u || e.v === u)
        .map(e => e.u === u ? e.v : e.u);
        
    for(let v of neighbors) {
        if(!visited.has(v)) {
            await dfsRec(v, visited);
        }
    }
}

function startAlgo(name) {
    isAnimating = true;
    resetStates();
    log(`Running ${name}...`);
    document.body.style.cursor = "wait";
}

function endAlgo() {
    isAnimating = false;
    document.body.style.cursor = "default";
    log("Done.");
}

function sleep(ms) { 
    return new Promise(r => setTimeout(r, ms)); 
}

function resetStates() {
    nodes.forEach(n => n.state = 'default');
}

function clearVisualization() {
    if(isAnimating) return;
    resetStates();
    log("Colors reset.");
}

function resetGraph() {
    if(isAnimating) return;
    nodes = [];
    edges = [];
    nodeCounter = 1;
    updateSelect();
    view = { x: 0, y: 0, scale: 1 };
    log("Map Cleared.");
}

// Start
init();
