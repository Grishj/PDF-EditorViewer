// Set PDF.js worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');

const fileInput = document.getElementById('file-input');
const openBtn = document.getElementById('btn-open');
const pdfContainer = document.getElementById('pdf-container');
const colorPicker = document.getElementById('color-picker');
const brushSize = document.getElementById('brush-size');

const saveBtn = document.getElementById('btn-save');

// Tool buttons
const tools = {
    select: document.getElementById('tool-select'),

    pen: document.getElementById('tool-pen'),
    line: document.getElementById('tool-line'),
    highlighter: document.getElementById('tool-highlighter'),
    text: document.getElementById('tool-text'),
    image: document.getElementById('tool-image'),
    eraser: document.getElementById('tool-eraser')
};

const imageInput = document.getElementById('image-input');
const rotatePageBtn = document.getElementById('btn-rotate-page');
const rotateAllBtn = document.getElementById('btn-rotate-all');
const insertPageBtn = document.getElementById('btn-insert-page');
const pageInput = document.getElementById('page-input');
const pageCountSpan = document.getElementById('page-count');

let currentPDF = null;
let currentFileName = '';
let pagesState = []; // Store canvas and fabric instances for each page: { pdfCanvas, fabricCanvas, context, pageNum, rotation }
let currentTool = 'select'; // select, pen, highlighter, text, eraser, image
let currentColor = '#000000';
let currentBrushSize = 2;
let currentFont = 'Arial'; // Default font

// --- Initialization ---

openBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        if (file.type !== 'application/pdf') {
            alert('Please select a PDF file.');
            return;
        }
        currentFileName = file.name;
        await loadPDF(file);
    }
});

// --- PDF Loading & Rendering ---

async function loadPDF(file) {
    pdfContainer.innerHTML = ''; // Clear existing
    pagesState = [];

    // Load notes for this specific file
    loadNotesForFile();

    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument(arrayBuffer);

    try {
        currentPDF = await loadingTask.promise;
        console.log('PDF loaded, pages:', currentPDF.numPages);
        pageCountSpan.textContent = `/ ${currentPDF.numPages}`;
        pageInput.max = currentPDF.numPages;

        for (let i = 1; i <= currentPDF.numPages; i++) {
            await renderPage(i, 0); // initial rotation 0
        }
    } catch (error) {
        console.error('Error rendering PDF:', error);
        alert('Error parsing PDF file: ' + (error.message || error));
    }
}

async function renderPage(pageNum, rotation = 0) {
    const page = await currentPDF.getPage(pageNum);
    const scale = 1.5;
    const viewport = page.getViewport({ scale, rotation });

    // Check if page already exists and needs replacement (for rotation)
    let pageWrapper = document.getElementById(`page-wrapper-${pageNum}`);
    if (!pageWrapper) {
        pageWrapper = document.createElement('div');
        pageWrapper.id = `page-wrapper-${pageNum}`;
        pageWrapper.className = 'page-wrapper';
        pageWrapper.setAttribute('data-page-number', pageNum);
        pdfContainer.appendChild(pageWrapper);
    } else {
        pageWrapper.innerHTML = ''; // Clear existing content
    }

    pageWrapper.style.width = `${viewport.width}px`;
    pageWrapper.style.height = `${viewport.height}px`;
    pageWrapper.style.marginBottom = '20px';

    // Create Canvas for PDF content
    const pdfCanvas = document.createElement('canvas');
    pdfCanvas.className = 'pdf-canvas';
    pdfCanvas.width = viewport.width;
    pdfCanvas.height = viewport.height;
    pageWrapper.appendChild(pdfCanvas);

    // Render PDF to canvas
    const context = pdfCanvas.getContext('2d');
    const renderContext = {
        canvasContext: context,
        viewport: viewport
    };
    await page.render(renderContext).promise;

    // Create Canvas for Fabric.js (Annotation layer)
    // Create Canvas for Fabric.js (Annotation layer)
    const fabricCanvasEl = document.createElement('canvas');
    fabricCanvasEl.className = 'fabric-canvas';
    fabricCanvasEl.width = viewport.width;
    fabricCanvasEl.height = viewport.height;
    pageWrapper.appendChild(fabricCanvasEl);

    // Create Text Layer
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';
    textLayerDiv.style.width = `${viewport.width}px`;
    textLayerDiv.style.height = `${viewport.height}px`;
    pageWrapper.appendChild(textLayerDiv);

    // Render Text Layer
    page.getTextContent().then(textContent => {
        pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport: viewport,
            textDivs: []
        });
    });

    const fCanvas = new fabric.Canvas(fabricCanvasEl, {
        width: viewport.width,
        height: viewport.height,
        selection: false
    });

    // Fix position
    const upperCanvas = fCanvas.getElement().parentNode;
    upperCanvas.style.position = 'absolute';
    upperCanvas.style.top = '0';
    upperCanvas.style.left = '0';

    // Store State
    // Remove old state for this page if exists
    pagesState = pagesState.filter(p => p.pageNum !== pageNum);
    pagesState.push({
        pdfCanvas,
        fCanvas,
        pageNum,
        rotation
    });

    // sorting the state by page number just in case
    pagesState.sort((a, b) => a.pageNum - b.pageNum);

    // Hook Undo/Redo events
    hookCanvasEvents(fCanvas, pageNum);

    // Initialize Line Tool events (once)
    initLineToolEvents(fCanvas);

    // Initialize tool for this page
    setTool(currentTool, fCanvas);
}

// --- Insert Blank Page ---

insertPageBtn.addEventListener('click', () => {
    // Insert after the currently viewed page (or last page if undefined)
    // For simplicity, let's insert after the page specified in pageInput
    let targetPageNum = parseInt(pageInput.value, 10);
    if (!targetPageNum || targetPageNum < 1) targetPageNum = pagesState.length;

    insertBlankPage(targetPageNum);
});

async function insertBlankPage(afterPageNum) {
    const newPageNum = afterPageNum + 1;

    // Create wrapper
    const pageWrapper = document.createElement('div');
    pageWrapper.id = `page-wrapper-${Date.now()}`; // Temporary ID to avoid collision until re-indexed? 
    // Actually need to re-render or re-order DOM.
    pageWrapper.className = 'page-wrapper';

    // Determine size (copy from previous page or default A4)
    let width = 600;
    let height = 800;
    if (pagesState.length > 0) {
        const refPage = pagesState[afterPageNum - 1] || pagesState[0];
        width = refPage.pdfCanvas.width;
        height = refPage.pdfCanvas.height;
    }

    pageWrapper.style.width = `${width}px`;
    pageWrapper.style.height = `${height}px`;
    pageWrapper.style.marginBottom = '20px';

    // 1. Fake "PDF" canvas (white background)
    const pdfCanvas = document.createElement('canvas');
    pdfCanvas.className = 'pdf-canvas';
    pdfCanvas.width = width;
    pdfCanvas.height = height;
    const ctx = pdfCanvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    pageWrapper.appendChild(pdfCanvas);

    // 2. Fabric Canvas
    const fabricCanvasEl = document.createElement('canvas');
    fabricCanvasEl.className = 'fabric-canvas';
    fabricCanvasEl.width = width;
    fabricCanvasEl.height = height;
    pageWrapper.appendChild(fabricCanvasEl);

    // 3. Text Layer (empty but needed for structure consistency if we were reusing code, mostly optional for blank)
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer';
    textLayerDiv.style.width = '${width}px';
    textLayerDiv.style.height = '${height}px';
    pageWrapper.appendChild(textLayerDiv);

    // Insert into DOM
    const refWrapper = document.getElementById(`page-wrapper-${afterPageNum}`); // Wrapper IDs are currently 1-based index based
    // Limitation: My renderPage logic uses ID based on page number.
    // If I insert a page, I need to shift all subsequent page IDs? 
    // Or just append to pagesState and re-render everything? Re-rendering might be slow.
    // Let's insert into DOM and update pagesState, then re-assign page numbers.

    if (refWrapper && refWrapper.nextSibling) {
        pdfContainer.insertBefore(pageWrapper, refWrapper.nextSibling);
    } else {
        pdfContainer.appendChild(pageWrapper);
    }

    const fCanvas = new fabric.Canvas(fabricCanvasEl, {
        width: width,
        height: height,
        selection: false
    });

    // Fix position
    const upperCanvas = fCanvas.getElement().parentNode;
    upperCanvas.style.position = 'absolute';
    upperCanvas.style.top = '0';
    upperCanvas.style.left = '0';

    const newState = {
        pdfCanvas,
        fCanvas,
        pageNum: newPageNum, // Temp, needs re-index
        rotation: 0,
        type: 'blank'
    };

    // Insert into State
    pagesState.splice(afterPageNum, 0, newState);

    // Re-index all pages
    reindexPages();

    // Initialize tool
    hookCanvasEvents(fCanvas, newPageNum);
    initLineToolEvents(fCanvas);
    setTool(currentTool, fCanvas);

    // Update visuals
    pageCountSpan.textContent = `/ ${pagesState.length}`;
    pageInput.max = pagesState.length;
    pageInput.value = newPageNum;

    pageWrapper.scrollIntoView({ behavior: 'smooth' });
}

function reindexPages() {
    pagesState.forEach((p, index) => {
        p.pageNum = index + 1;
        // Update DOM ID if possible
        const wrapper = p.pdfCanvas.closest('.page-wrapper');
        if (wrapper) {
            wrapper.id = `page-wrapper-${p.pageNum}`;
            wrapper.setAttribute('data-page-number', p.pageNum);
        }
    });
}

// --- Undo / Redo ---

const undoStack = [];
const redoStack = [];
let isStateRestoring = false;

function hookCanvasEvents(canvas, pageNum) {
    let stateBeforeInteraction = null;

    canvas.on('mouse:down', () => {
        if (!isStateRestoring) {
            stateBeforeInteraction = canvas.toJSON();
        }
    });

    const onAction = () => {
        if (isStateRestoring || !stateBeforeInteraction) return;
        undoStack.push({ pageNum, json: stateBeforeInteraction });
        if (undoStack.length > 50) undoStack.shift();
        redoStack.length = 0;
        updateUndoRedoUI();
        stateBeforeInteraction = null;
    };

    canvas.on('object:modified', onAction);
    canvas.on('path:created', onAction);
    canvas.on('object:added', (e) => {
        if (e.target && e.target.type !== 'path') onAction();
    });
    canvas.on('object:removed', onAction);
}

document.getElementById('btn-undo').addEventListener('click', () => {
    if (undoStack.length === 0) return;

    const lastState = undoStack.pop();
    const pageState = pagesState.find(p => p.pageNum === lastState.pageNum);

    if (pageState) {
        const currentJson = pageState.fCanvas.toJSON();
        redoStack.push({ pageNum: lastState.pageNum, json: currentJson });

        isStateRestoring = true;
        pageState.fCanvas.loadFromJSON(lastState.json, () => {
            pageState.fCanvas.renderAll();
            isStateRestoring = false;
        });
    }
    updateUndoRedoUI();
});

document.getElementById('btn-redo').addEventListener('click', () => {
    if (redoStack.length === 0) return;

    const nextState = redoStack.pop();
    const pageState = pagesState.find(p => p.pageNum === nextState.pageNum);

    if (pageState) {
        const currentJson = pageState.fCanvas.toJSON();
        undoStack.push({ pageNum: nextState.pageNum, json: currentJson });

        isStateRestoring = true;
        pageState.fCanvas.loadFromJSON(nextState.json, () => {
            pageState.fCanvas.renderAll();
            isStateRestoring = false;
        });
    }
    updateUndoRedoUI();
});

function updateUndoRedoUI() {
    document.getElementById('btn-undo').disabled = undoStack.length === 0;
    document.getElementById('btn-redo').disabled = redoStack.length === 0;
    document.getElementById('btn-undo').style.opacity = undoStack.length === 0 ? 0.5 : 1;
    document.getElementById('btn-redo').style.opacity = redoStack.length === 0 ? 0.5 : 1;
}

// --- Tools Logic ---

function setAllCanvasesTool(toolName) {
    currentTool = toolName;
    updateToolUI(toolName);

    pagesState.forEach(page => {
        setTool(toolName, page.fCanvas);
    });
}

function setTool(toolName, canvas) {
    canvas.isDrawingMode = false;
    canvas.selection = false;
    canvas.defaultCursor = 'default';

    // Reset pointer events for Text Select tool
    canvas.getElement().parentNode.style.pointerEvents = 'auto';

    if (toolName === 'select') {
        canvas.selection = true;
        canvas.defaultCursor = 'default';
        canvas.forEachObject(o => o.selectable = true);

    } else if (toolName === 'pen') {
        canvas.isDrawingMode = true;
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.color = currentColor;
        canvas.freeDrawingBrush.width = parseInt(currentBrushSize, 10);
        const penIconUrl = chrome.runtime.getURL('icons/cursor-pen.png');
        canvas.freeDrawingCursor = `url("${penIconUrl}") 0 0, auto`;
        canvas.defaultCursor = `url("${penIconUrl}") 0 0, auto`;
        canvas.forEachObject(o => o.selectable = false);
    } else if (toolName === 'line') {
        canvas.isDrawingMode = false;
        canvas.defaultCursor = 'crosshair';
        canvas.selection = false;
        canvas.forEachObject(o => o.selectable = false);
    } else if (toolName === 'highlighter') {
        canvas.isDrawingMode = true;
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.color = convertHexToRGBA(currentColor, 0.4);
        canvas.freeDrawingBrush.width = 15;
        canvas.freeDrawingCursor = 'default';
        canvas.forEachObject(o => o.selectable = false);
    } else if (toolName === 'eraser') {
        const eraserIconUrl = chrome.runtime.getURL('icons/cursor-eraser.png');
        canvas.defaultCursor = `url("${eraserIconUrl}") 16 16, auto`; // Center hotspot for 32x32
        canvas.isDrawingMode = false;
        canvas.on('mouse:down', function (options) {
            if (currentTool === 'eraser' && options.target) {
                canvas.remove(options.target);
            }
        });
        canvas.forEachObject(o => o.selectable = false);
    } else if (toolName === 'text') {
        canvas.defaultCursor = 'text';
        canvas.on('mouse:down', (o) => {
            if (currentTool !== 'text') return;
            const pointer = canvas.getPointer(o.e);

            // Allow default editing if clicking existing text
            if (o.target && o.target.type === 'i-text') return;

            // Otherwise create new text
            const text = new fabric.IText('Type here', {
                left: pointer.x,
                top: pointer.y,
                fontFamily: currentFont,
                fill: currentColor,
                fontSize: 20
            });
            canvas.add(text);
            canvas.setActiveObject(text);
            text.enterEditing();
            text.selectAll();
            setAllCanvasesTool('select'); // Switch to select to type immediately without creating more boxes
        });
        canvas.forEachObject(o => o.selectable = false);
    } else if (toolName === 'image') {
        canvas.defaultCursor = 'default';
        canvas.defaultCursor = 'crosshair';
        canvas.on('mouse:down', function (options) {
            if (currentTool === 'image' && !options.target) {
                imageInput.click();
                imageInput.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (f) => {
                        const imgObj = new Image();
                        imgObj.src = f.target.result;
                        imgObj.onload = () => {
                            const imgInstance = new fabric.Image(imgObj);
                            const pointer = canvas.getPointer(options.e);
                            imgInstance.set({
                                left: pointer.x,
                                top: pointer.y,
                                scaleX: 0.5,
                                scaleY: 0.5
                            });
                            canvas.add(imgInstance);
                            canvas.setActiveObject(imgInstance);
                            setAllCanvasesTool('select');
                            imageInput.value = ''; // Reset
                        };
                    };
                    reader.readAsDataURL(file);
                };
            }
        });
        canvas.forEachObject(o => o.selectable = false);
    }
}

// --- UI Event Listeners ---

Object.keys(tools).forEach(key => {
    tools[key].addEventListener('click', () => {
        setAllCanvasesTool(key);
    });
});

// --- Tool Settings Events ---

colorPicker.addEventListener('input', (e) => {
    currentColor = e.target.value;
    updateBrushSettings();
});

brushSize.addEventListener('change', (e) => {
    currentBrushSize = e.target.value;
    updateBrushSettings();
});

const fontFamilySelect = document.getElementById('font-family');
fontFamilySelect.addEventListener('change', (e) => {
    currentFont = e.target.value;
    // Update active object if it is text
    pagesState.forEach(p => {
        const activeObj = p.fCanvas.getActiveObject();
        if (activeObj && activeObj.type === 'i-text') {
            activeObj.set('fontFamily', currentFont);
            p.fCanvas.requestRenderAll();
        }
    });
});

function updateBrushSettings() {
    pagesState.forEach(p => {
        if (p.fCanvas.freeDrawingBrush) {
            if (currentTool === 'highlighter') {
                p.fCanvas.freeDrawingBrush.color = convertHexToRGBA(currentColor, 0.4);
                p.fCanvas.freeDrawingBrush.width = 15;
            } else {
                p.fCanvas.freeDrawingBrush.color = currentColor;
                p.fCanvas.freeDrawingBrush.width = parseInt(currentBrushSize, 10);
            }
        }
    });
}

function updateToolUI(activeTool) {
    Object.keys(tools).forEach(key => {
        if (key === activeTool) tools[key].classList.add('active');
        else tools[key].classList.remove('active');
    });
}

// Helper
function convertHexToRGBA(hex, opacity) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// --- Tool Event Initialization ---

function initLineToolEvents(canvas) {
    let isDrawingLine = false;
    let line = null;

    canvas.on('mouse:down', (o) => {
        if (currentTool !== 'line') return;
        isDrawingLine = true;
        const pointer = canvas.getPointer(o.e);
        const points = [pointer.x, pointer.y, pointer.x, pointer.y];
        line = new fabric.Line(points, {
            strokeWidth: parseInt(currentBrushSize, 10),
            fill: currentColor,
            stroke: currentColor,
            originX: 'center',
            originY: 'center',
            selectable: false,
            evented: false
        });
        canvas.add(line);
    });

    canvas.on('mouse:move', (o) => {
        if (!isDrawingLine) return;
        const pointer = canvas.getPointer(o.e);
        if (line) {
            line.set({ x2: pointer.x, y2: pointer.y });
            canvas.renderAll();
        }
    });

    canvas.on('mouse:up', () => {
        if (!isDrawingLine) return;
        isDrawingLine = false;
        if (line) {
            line.setCoords();
        }
    });
}

// --- Rotation Logic ---

rotatePageBtn.addEventListener('click', async () => {
    const targetPage = parseInt(pageInput.value, 10);
    if (!targetPage || targetPage < 1 || targetPage > pagesState.length) return;

    const pageState = pagesState.find(p => p.pageNum === targetPage);
    if (pageState) {
        const newRotation = (pageState.rotation + 90) % 360;
        await renderPage(targetPage, newRotation);
    }
});

rotateAllBtn.addEventListener('click', async () => {
    for (const pageState of pagesState) {
        const newRotation = (pageState.rotation + 90) % 360;
        await renderPage(pageState.pageNum, newRotation);
    }
});

// --- Page Navigation ---

let isScrollingFromInput = false;

pageInput.addEventListener('change', () => {
    const pageNum = parseInt(pageInput.value, 10);
    if (pageNum > 0 && pageNum <= pagesState.length) {
        const wrapper = document.getElementById(`page-wrapper-${pageNum}`);
        if (wrapper) {
            isScrollingFromInput = true;
            wrapper.scrollIntoView({ behavior: 'smooth' });
            pageCountSpan.textContent = `/ ${pagesState.length}`;
            // Reset flag after scroll likely finishes (approximation)
            setTimeout(() => { isScrollingFromInput = false; }, 800);
        }
    }
});

// Update page input on scroll
const mainContainer = document.getElementById('main-container');
let scrollTimeout;

mainContainer.addEventListener('scroll', () => {
    if (isScrollingFromInput) return;
    if (scrollTimeout) clearTimeout(scrollTimeout);

    scrollTimeout = setTimeout(() => {
        const containerTop = mainContainer.scrollTop;
        const containerHeight = mainContainer.clientHeight;
        const containerCenter = containerTop + (containerHeight / 2);

        let bestPageDetails = null;
        let minDistance = Infinity;

        // Find page closest to center
        document.querySelectorAll('.page-wrapper').forEach(wrapper => {
            const pageNum = parseInt(wrapper.getAttribute('data-page-number'), 10);
            const rect = wrapper.getBoundingClientRect();
            // rect.top is relative to viewport. 
            // We need to account for container offset if container is not document body.
            // But getBoundingClientRect returns relative to viewport top-left.
            // A simple check is to see which element's center is closest to viewport center.

            const wrapperCenter = rect.top + (rect.height / 2);
            // mainContainer is the parent. We can just check rect.top relative to window vs container center?
            // Actually, if we use getBoundingClientRect inside the container, we can compare directly 
            // to the container's bounding rect center.

            const containerRect = mainContainer.getBoundingClientRect();
            const containerCenterAbs = containerRect.top + (containerRect.height / 2);

            const distance = Math.abs(wrapperCenter - containerCenterAbs);

            if (distance < minDistance) {
                minDistance = distance;
                bestPageDetails = pageNum;
            }
        });

        if (bestPageDetails) {
            pageInput.value = bestPageDetails;
            pageCountSpan.textContent = `/ ${pagesState.length}`; // Keep count static or update if needed
        }
    }, 100);
});

// --- Auto Scroll & Eye Comfort ---

const autoScrollBtn = document.getElementById('btn-auto-scroll');
const scrollUpBtn = document.getElementById('btn-scroll-up');
const scrollSpeedInput = document.getElementById('scroll-speed');
const eyeComfortBtn = document.getElementById('btn-eye-comfort');
const eyeComfortColorInput = document.getElementById('eye-comfort-color');
const eyeComfortOverlay = document.getElementById('eye-comfort-overlay');
const fullscreenBtn = document.getElementById('btn-fullscreen');

// Notes
const notesToggleBtn = document.getElementById('btn-notes-toggle');
const notesPanel = document.getElementById('notes-panel');
const notesCloseBtn = document.getElementById('btn-notes-close');
const notesArea = document.getElementById('notes-area');

let autoScrollInterval = null;
let autoScrollDirection = 1; // 1 for down, -1 for up

autoScrollBtn.addEventListener('click', () => {
    toggleAutoScroll(1);
});

scrollUpBtn.addEventListener('click', () => {
    toggleAutoScroll(-1);
});

function toggleAutoScroll(direction) {
    if (autoScrollInterval && autoScrollDirection === direction) {
        // Stop if clicking the same active direction
        stopAutoScroll();
    } else {
        // Start or switch direction
        autoScrollDirection = direction;
        startAutoScroll();
        updateAutoScrollUI();
    }
}

function stopAutoScroll() {
    if (autoScrollInterval) clearInterval(autoScrollInterval);
    autoScrollInterval = null;
    updateAutoScrollUI();
}

function startAutoScroll() {
    if (autoScrollInterval) clearInterval(autoScrollInterval);
    const speed = parseInt(scrollSpeedInput.value, 10);
    const intervalTime = 50;

    autoScrollInterval = setInterval(() => {
        const container = document.getElementById('main-container');
        container.scrollTop += (speed * autoScrollDirection);
    }, intervalTime);
}

function updateAutoScrollUI() {
    if (autoScrollInterval) {
        if (autoScrollDirection === 1) {
            autoScrollBtn.classList.add('active');
            scrollUpBtn.classList.remove('active');
            autoScrollBtn.innerHTML = '<i class="fas fa-pause"></i>';
            scrollUpBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
        } else {
            scrollUpBtn.classList.add('active');
            autoScrollBtn.classList.remove('active');
            scrollUpBtn.innerHTML = '<i class="fas fa-pause"></i>';
            autoScrollBtn.innerHTML = '<i class="fas fa-arrow-down"></i>';
        }
    } else {
        autoScrollBtn.classList.remove('active');
        scrollUpBtn.classList.remove('active');
        autoScrollBtn.innerHTML = '<i class="fas fa-arrow-down"></i>';
        scrollUpBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
    }
}

scrollSpeedInput.addEventListener('change', () => {
    if (autoScrollInterval) {
        startAutoScroll();
    }
});

// --- Notes Logic ---

notesToggleBtn.addEventListener('click', () => {
    notesPanel.classList.toggle('hidden');
    if (!notesPanel.classList.contains('hidden')) {
        notesArea.focus();
    }
});

notesCloseBtn.addEventListener('click', () => {
    notesPanel.classList.add('hidden');
});

// Load notes
function loadNotesForFile() {
    notesArea.value = ''; // Clear previous notes
    if (!currentFileName) return;

    const savedNotes = localStorage.getItem(`pdf-notes-${currentFileName}`);
    if (savedNotes) {
        notesArea.value = savedNotes;
    }
}

// Save notes (debounced)
let saveTimeout;
notesArea.addEventListener('input', () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        if (currentFileName) {
            localStorage.setItem(`pdf-notes-${currentFileName}`, notesArea.value);
        }
    }, 500);
});


eyeComfortBtn.addEventListener('click', () => {
    document.body.classList.toggle('eye-comfort-mode');
    eyeComfortBtn.classList.toggle('active');
    updateEyeComfortColor();
});

eyeComfortColorInput.addEventListener('input', updateEyeComfortColor);

function updateEyeComfortColor() {
    if (eyeComfortOverlay) {
        eyeComfortOverlay.style.marginTop = document.getElementById('toolbar').offsetHeight + 'px'; // adjust for toolbar if needed, 
        // actually overlay is fixed over everything? 
        // We want it over canvases but UNDER toolbar?
        // Z-Index of toolbar is 100. Eye comfort overlay z-index should be less?
        // In CSS I set 9999. It covers toolbar too.
        // Let's set z-index to 50 (between canvas and toolbar).
        // Toolbar is 100.
        eyeComfortOverlay.style.zIndex = '50';
        eyeComfortOverlay.style.backgroundColor = eyeComfortColorInput.value;
    }
}

fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
            fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
        }
    }
});

// --- Save / Export ---

// --- Helper Functions ---

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

// --- Save / Export / Share ---

async function generatePDFBlob() {
    const { jsPDF } = window.jspdf;
    if (pagesState.length === 0) return null;

    // Get dimensions of the first page to initialize PDF
    // For 'blank' pages, pdfCanvas might be 0x0 or uninitialized if we relied on pdf.js viewport. 
    // But in insertBlankPage we create a 'pdfCanvas' with correct width/height and fill it white.
    // So accessing .width and .height should be fine IF pdfCanvas is valid.
    // Let's ensure we use the wrapper or fabric canvas dimensions as backup.

    // First page setup
    const firstState = pagesState[0];
    const firstW = firstState.pdfCanvas.width;
    const firstH = firstState.pdfCanvas.height;

    const pdf = new jsPDF({
        orientation: firstW > firstH ? 'l' : 'p',
        unit: 'px',
        format: [firstW, firstH]
    });

    for (let i = 0; i < pagesState.length; i++) {
        const state = pagesState[i];
        const w = state.pdfCanvas.width;
        const h = state.pdfCanvas.height;

        if (i > 0) {
            pdf.addPage([w, h]);
        }

        // Use the current page as default for subsequent content operations
        pdf.setPage(i + 1);

        // 1. Draw PDF base to a temp canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const ctx = tempCanvas.getContext('2d');

        // Draw underlying PDF (or White background for blank pages)
        if (state.type === 'blank') {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);
        } else {
            // Check if pdfCanvas is valid/loaded
            if (state.pdfCanvas) {
                ctx.drawImage(state.pdfCanvas, 0, 0);
            }
        }

        // Draw Fabric overlay
        // NOTE: toDataURL is synchronous for standard canvases, but if we have external images 
        // we might need to be careful. But fabric usually handles this well.
        const fabricData = state.fCanvas.toDataURL({ format: 'png', multiplier: 1 });
        const fabricImg = await loadImage(fabricData);
        ctx.drawImage(fabricImg, 0, 0);

        // Add to PDF
        const mergedData = tempCanvas.toDataURL('image/jpeg', 0.8);
        pdf.addImage(mergedData, 'JPEG', 0, 0, w, h);
    }

    return pdf.output('blob');
}

saveBtn.addEventListener('click', async () => {
    const pdfBlob = await generatePDFBlob();
    if (!pdfBlob) return;

    // Download logic
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'edited_document.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

const shareBtn = document.getElementById('btn-share');
shareBtn.addEventListener('click', async () => {
    const pdfBlob = await generatePDFBlob();
    if (!pdfBlob) return;

    if (navigator.share && navigator.canShare) {
        const file = new File([pdfBlob], 'edited_document.pdf', { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: 'Edited PDF',
                    text: 'Here is the edited PDF document.'
                });
                console.log('Shared successfully');
            } catch (error) {
                console.error('Error sharing:', error);
            }
        } else {
            alert('Your browser supports sharing but not for this file type.');
        }
    } else {
        alert('Web Share API is not supported in this browser/environment.');
    }
});


// --- Text Selection & Highlighting ---


// --- Keyboard Shortcuts ---

document.addEventListener('keydown', (e) => {
    // Ignore if typing in an input or textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
    }

    const key = e.key.toLowerCase();
    const isCtrl = e.ctrlKey || e.metaKey;

    // Tools
    if (!isCtrl) {
        switch (key) {
            case 'v':
            case 's':
                setAllCanvasesTool('select');
                break;
            case 'p':
                setAllCanvasesTool('pen');
                break;
            case 'l':
                setAllCanvasesTool('line');
                break;
            case 'h':
                setAllCanvasesTool('highlighter');
                break;
            case 'e':
                setAllCanvasesTool('eraser');
                break;
            case 't':
                setAllCanvasesTool('text');
                break;
            case 'delete':
            case 'backspace':
                deleteSelectedObjects();
                break;
            case 'escape':
                setAllCanvasesTool('select');
                break;
        }
    }

    // Actions
    if (isCtrl) {
        if (key === 'z') {
            e.preventDefault();
            document.getElementById('btn-undo').click();
        } else if (key === 'y') {
            e.preventDefault();
            document.getElementById('btn-redo').click();
        } else if (key === 's') {
            // CRITICAL: Prevent default browser "Save As" behavior
            e.preventDefault();
            e.stopPropagation(); // Stop bubbling just in case
            document.getElementById('btn-save').click();
        }
    }
});

function deleteSelectedObjects() {
    pagesState.forEach(p => {
        const activeObj = p.fCanvas.getActiveObject();
        if (activeObj) {
            // If it's a text object currently being edited, don't delete
            if (activeObj.isEditing) return;

            p.fCanvas.remove(activeObj);
            // Trigger undo/redo stack update
            p.fCanvas.fire('object:removed', { target: activeObj });
        }
    });
}
