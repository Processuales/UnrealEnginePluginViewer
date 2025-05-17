import * as UI from './ui.js';
import * as Files from './files.js';

// --- Event Listener Setup ---

// Folder Input Change
UI.folderInput.addEventListener('change', async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
        UI.setErrorMessage('No folder selected or folder is empty.');
        return;
    }
    UI.setLoading(true);
    UI.resetUIState();

    try {
        const { fileData, fileDataMap, initialWarning, error } = await Files.processFolderSelection(files);
        if (error) {
            UI.setErrorMessage(error);
            UI.fileTreeElement.innerHTML = `<li>${error}</li>`;
            return;
        }
        if (initialWarning) {
             UI.setErrorMessage(initialWarning);
        }
        const treeData = Files.buildTree(fileData);
        UI.renderTree(treeData, fileDataMap, handleTreeFileClick, UI.handleContextMenu);
    } catch (err) {
        console.error("Error processing folder:", err);
        UI.setErrorMessage(`Error processing folder: ${err.message}`);
        UI.clearTree();
    } finally {
        UI.setLoading(false);
    }
});

// Clear Button
UI.clearButton.addEventListener('click', () => {
    UI.clearViewer();
    const updatedPaths = Files.clearSelections();
    UI.updateSelectionClasses(updatedPaths);
});

// Copy All Button (New Listener)
UI.copyAllButton.addEventListener('click', UI.handleCopyAllClick);

// Toggle: Select Corresponding
UI.selectCorrespondingToggle.addEventListener('change', () => {
    if (UI.selectCorrespondingToggle.checked) {
        const currentSelectedPaths = Files.getSelectedPaths(); // Use getter that returns copy
        if (currentSelectedPaths.size > 0) {
             const fileDataMap = Files.getFileDataMap();
             const pathsToAdd = new Set();
             const currentSnapshot = Array.from(currentSelectedPaths);

             currentSnapshot.forEach(path => {
                const info = fileDataMap.get(path);
                 if (info && (info.ext === '.h' || info.ext === '.cpp')) {
                     const corr = Files.findCorrespondingPath(path);
                     if(corr && !currentSelectedPaths.has(corr)) { // Check against original set
                        pathsToAdd.add(corr);
                     }
                 }
             });

             if (pathsToAdd.size > 0) {
                 // Update the state by adding to the actual set via reference
                 // (This assumes getSelectedPaths() initially gave a reference or we handle it)
                 // Let's refine this slightly by having Files module handle the addition
                 const finalSelection = Files.addPathsToSelection(pathsToAdd); // Need to add this function to Files

                 UI.updateSelectionClasses(finalSelection); // Update UI classes
                 UI.updateCombinedView(); // Update view
             }
        }
    }
    // No action needed if unchecked currently
});


// Toggle: Sort H before CPP
UI.hBeforeCppToggle.addEventListener('change', () => {
    if (Files.getSelectedPaths().size > 0) { // Use getter
         UI.updateCombinedView();
    }
});

// Viewer Scroll Sync
UI.combinedContentPre.addEventListener('scroll', UI.updateLineNumbers);

// Context Menu Actions
UI.ctxCopy.addEventListener('click', UI.contextMenuCopy);
UI.ctxCopyCorr.addEventListener('click', UI.contextMenuCopyCorr);
UI.ctxGoto.addEventListener('click', UI.contextMenuGoto);

// Global click to hide context menu
document.addEventListener('click', (event) => {
     if (!UI.contextMenuElement.contains(event.target)) {
         UI.hideContextMenu();
     }
 });

// --- Resizer Logic ---
let isResizing = false;
let startX, startWidth;

UI.resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = UI.fileTreeContainer.offsetWidth;
    document.body.classList.add('resizing');
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
});

function handleMouseMove(e) {
    if (!isResizing) return;
    const dx = e.clientX - startX;
    let newWidth = startWidth + dx;
    const treeMinWidth = parseInt(getComputedStyle(UI.fileTreeContainer).minWidth, 10);
    const treeMaxWidthPercentage = 80;
    const mainContentWidth = UI.fileTreeContainer.parentElement.offsetWidth;
    let treeMaxWidth = mainContentWidth * (treeMaxWidthPercentage / 100);
    newWidth = Math.max(treeMinWidth, Math.min(newWidth, treeMaxWidth));
    UI.fileTreeContainer.style.width = `${newWidth}px`;
    UI.fileTreeContainer.style.flexBasis = `${newWidth}px`;
    e.preventDefault();
}

function handleMouseUp() {
    if (isResizing) {
        isResizing = false;
        document.body.classList.remove('resizing');
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }
}


// --- Helper Function for Coordinating File Clicks ---
function handleTreeFileClick(event) {
    const clickedLi = event.currentTarget;
    if (!clickedLi.classList.contains('file')) return;

    const filePath = clickedLi.dataset.filePath;
    const allListItems = Array.from(UI.fileTreeElement.querySelectorAll('li.file'));
    const allFilePathsInTree = allListItems.map(li => li.dataset.filePath);
    const isCtrlOrMeta = event.ctrlKey || event.metaKey;
    const isShift = event.shiftKey;

    // Call the logic handler in files.js to update the selection state
    const updatedSelectedPaths = Files.handleFileClickLogic(
        filePath,
        allFilePathsInTree,
        isCtrlOrMeta,
        isShift,
        UI.selectCorrespondingToggle.checked
    );

    // Update the UI classes based on the new state from Files module
    UI.updateSelectionClasses(updatedSelectedPaths);

    // Update the combined viewer content
    UI.updateCombinedView();
}


// --- Initial Setup ---
UI.updateLineNumbers();
console.log("UE Plugin Source Explorer Initialized");