import * as Files from './files.js';

// --- DOM Elements --- (Add copyAllButton)
export const folderInput = document.getElementById('folderInput');
export const fileTreeContainer = document.getElementById('fileTreeContainer');
export const resizer = document.getElementById('resizer');
export const combinedViewerContainer = document.getElementById('combinedViewerContainer');
export const fileTreeElement = document.getElementById('fileTree');
export const combinedContentPre = document.getElementById('combinedContentPre');
export const combinedContentCode = document.getElementById('combinedContentCode');
export const combinedTokenCountElement = document.getElementById('combinedTokenCount');
export const lineNumbersElement = document.getElementById('lineNumbers');
export const loadingIndicator = document.getElementById('loadingIndicator');
export const errorMessageElement = document.getElementById('errorMessage');
export const clearButton = document.getElementById('clearButton');
export const copyAllButton = document.getElementById('copyAllButton'); // Added
export const selectCorrespondingToggle = document.getElementById('selectCorrespondingToggle');
export const hBeforeCppToggle = document.getElementById('hBeforeCppToggle');
export const contextMenuElement = document.getElementById('contextMenu');
export const ctxCopy = document.getElementById('ctx-copy');
export const ctxCopyCorr = document.getElementById('ctx-copy-corr');
export const ctxGoto = document.getElementById('ctx-goto');

// --- UI State ---
let contextMenuFilePath = null;
let highlightTimeout = null;

// --- Path Shortening for Display ---
export function getDisplayPath(fullPath) {
    const parts = fullPath.split('/');
    let sourceIndex = parts.map(p => p.toLowerCase()).indexOf('source');
    if (sourceIndex !== -1 && sourceIndex + 1 < parts.length) {
        return parts.slice(sourceIndex + 1).join('/');
    }
    sourceIndex = parts.map(p => p.toLowerCase()).indexOf('shaders');
     if (sourceIndex !== -1 && sourceIndex + 1 < parts.length) {
         return parts.slice(sourceIndex + 1).join('/');
     }
     if (parts.length === 2 && parts[0].length > 0) {
         return parts[1];
     }
    return fullPath;
}


// --- Tree Rendering ---
export function renderTree(treeData, fileDataMap, fileClickHandler, contextMenuHandler) {
    fileTreeElement.innerHTML = '';
    const rootUl = fileTreeElement;

    function renderNode(node, parentUl) {
        Object.keys(node).sort((a, b) => {
            const valueA = node[a]; const valueB = node[b];
            const isAFile = valueA.file instanceof File;
            const isBFile = valueB.file instanceof File;
            if (!isAFile && isBFile) return -1;
            if (isAFile && !isBFile) return 1;
            return a.localeCompare(b);
        }).forEach(key => {
            const value = node[key];
            const li = document.createElement('li');
            if (value.file instanceof File) {
                const span = document.createElement('span'); span.textContent = key; li.appendChild(span);
                const tokenSpan = document.createElement('span');
                tokenSpan.className = 'token-count';
                if (value.tokenCount === -1) { tokenSpan.textContent = `(Error)`; }
                else if (value.tokenCount !== undefined) { tokenSpan.textContent = `(${value.tokenCount.toLocaleString()} tokens)`; }
                else { tokenSpan.textContent = `(...)`; }
                li.appendChild(tokenSpan);
                li.className = 'file';
                li.dataset.filePath = value.path;
                value.element = li;
                value.tokenSpan = tokenSpan;
                li.addEventListener('click', fileClickHandler);
                li.addEventListener('contextmenu', contextMenuHandler);
            } else {
                li.className = 'folder';
                const labelSpan = document.createElement('span');
                labelSpan.className = 'folder-label';
                labelSpan.onclick = toggleFolder;
                const toggleSpan = document.createElement('span');
                toggleSpan.className = 'folder-toggle';
                labelSpan.appendChild(toggleSpan);
                const nameSpan = document.createElement('span');
                nameSpan.textContent = key;
                nameSpan.className = 'folder-name';
                labelSpan.appendChild(nameSpan);
                li.appendChild(labelSpan);
                const ul = document.createElement('ul');
                renderNode(value, ul);
                li.appendChild(ul);
            }
            parentUl.appendChild(li);
        });
    }
    renderNode(treeData, rootUl);
}

// --- Toggle Folder ---
export function toggleFolder(event) {
     const li = event.currentTarget.closest('li.folder');
     if (li) {
        li.classList.toggle('collapsed');
     }
     event.stopPropagation();
}

// --- Update Selection Classes ---
export function updateSelectionClasses(selectedPaths) {
    const allListItems = Array.from(fileTreeElement.querySelectorAll('li.file'));
    allListItems.forEach(li => {
        const path = li.dataset.filePath;
        if (selectedPaths.has(path)) {
            li.classList.add('selected');
        } else {
            li.classList.remove('selected');
        }
    });
}


// --- Update Line Numbers (Using Divs for Highlighting) ---
export function updateLineNumbers() {
      requestAnimationFrame(() => {
        const currentText = combinedContentCode.textContent || '';
        const lineCount = currentText.split('\n').length;
        const targetLineCount = lineCount || 1;

        // Only update DOM if necessary
        if (lineNumbersElement.childElementCount !== targetLineCount) {
            lineNumbersElement.innerHTML = ''; // Clear existing
            for (let i = 1; i <= targetLineCount; i++) {
                const div = document.createElement('div');
                div.dataset.line = i; // Store line number
                div.textContent = i;
                lineNumbersElement.appendChild(div);
            }
        }
        lineNumbersElement.scrollTop = combinedContentPre.scrollTop;
    });
}


// --- Update Combined View ---
export async function updateCombinedView() {
    let combinedText = "";
    let totalTokens = 0;
    // Use the getter that returns a *copy* to avoid accidental modification
    const currentSelectedPaths = Files.getSelectedPaths();
    const fileDataMap = Files.getFileDataMap();

    const allListItems = Array.from(fileTreeElement.querySelectorAll('li.file'));
    let orderedSelectedPaths = allListItems
        .map(li => li.dataset.filePath)
        .filter(path => currentSelectedPaths.has(path));

    // --- Sorting ---
    if (hBeforeCppToggle.checked && orderedSelectedPaths.length > 1) {
        const originalIndexMap = new Map(orderedSelectedPaths.map((path, index) => [path, index]));
        const selectedPathsSetForSort = new Set(orderedSelectedPaths); // Use the filtered set
        orderedSelectedPaths.sort((pathA, pathB) => {
            const infoA = fileDataMap.get(pathA); const infoB = fileDataMap.get(pathB);
            if (!infoA || !infoB) { return (originalIndexMap.get(pathA) ?? Infinity) - (originalIndexMap.get(pathB) ?? Infinity); }
            const repIndexA = Files.getRepresentativeIndex(pathA, selectedPathsSetForSort, originalIndexMap);
            const repIndexB = Files.getRepresentativeIndex(pathB, selectedPathsSetForSort, originalIndexMap);
            if (repIndexA !== repIndexB) { return repIndexA - repIndexB; }
            const isAHeader = infoA.ext === '.h'; const isBHeader = infoB.ext === '.h';
            const isACpp = infoA.ext === '.cpp'; const isBCpp = infoB.ext === '.cpp';
            if ((isAHeader || isACpp) && (isBHeader || isBCpp)) {
                if (isAHeader && isBCpp) return -1; if (isACpp && isBHeader) return 1;
            }
            const indexA = originalIndexMap.get(pathA) ?? Infinity; const indexB = originalIndexMap.get(pathB) ?? Infinity;
            if (indexA !== indexB) return indexA - indexB;
            return pathA.localeCompare(pathB);
        });
    }

    // --- Content Fetching ---
    const contentPromises = orderedSelectedPaths.map(path => {
        const fileInfo = fileDataMap.get(path);
        if (!fileInfo || !fileInfo.file) return Promise.resolve({ path, content: `// Error: File info/object missing for ${path}\n` });
        return Files.readFileContent(fileInfo.file)
            .then(content => ({ path, content }))
            .catch(err => ({ path, content: `// Error reading ${getDisplayPath(path)}: ${err.message}\n` }));
    });

    try {
        const results = await Promise.all(contentPromises);
        combinedText = results.map(({ path, content }) => {
            const displayPath = getDisplayPath(path);
            const formattedContent = content.endsWith('\n') ? content : content + '\n';
            return `// ${displayPath}\n\n${formattedContent}\n// End of ${displayPath}\n//------------------------------------\n\n`;
        }).join('');

        totalTokens = Files.estimateTokens(combinedText);

        // Update content and token count
        combinedContentCode.textContent = combinedText;
        combinedTokenCountElement.textContent = totalTokens.toLocaleString();

    } catch (error) {
        console.error("Error processing file contents:", error);
        combinedContentCode.textContent = "// Error loading content.";
        combinedTokenCountElement.textContent = '0';
        setErrorMessage(`Error processing contents: ${error.message}`);
    } finally {
        // Apply highlighting
        combinedContentCode.className = '';
        if (combinedContentCode.textContent && combinedContentCode.textContent !== "// Error loading content.") {
            try {
                 const result = hljs.highlightAuto(combinedContentCode.textContent);
                 combinedContentCode.innerHTML = result.value;
            } catch (highlightError) {
                 console.error("Highlight.js error:", highlightError);
                 combinedContentCode.className = 'plaintext';
            }
        } else {
             combinedContentCode.innerHTML = '';
        }
        updateLineNumbers();
    }
}

// --- Context Menu Handling ---
export function handleContextMenu(event) {
     event.preventDefault();
     hideContextMenu();
    const targetLi = event.target.closest('li.file');
     if (!targetLi) return;
    contextMenuFilePath = targetLi.dataset.filePath;
     if (!contextMenuFilePath) return;

     const fileDataMap = Files.getFileDataMap();
     const currentSelectedPaths = Files.getSelectedPaths(); // Use getter
     const fileInfo = fileDataMap.get(contextMenuFilePath);
     const isHCpp = fileInfo && (fileInfo.ext === '.h' || fileInfo.ext === '.cpp');

    ctxGoto.classList.toggle('disabled', !currentSelectedPaths.has(contextMenuFilePath));
     const correspondingExists = isHCpp && !!Files.findCorrespondingPath(contextMenuFilePath);
     ctxCopyCorr.classList.toggle('disabled', !correspondingExists);

    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    contextMenuElement.style.top = `${event.clientY + scrollY}px`;
    contextMenuElement.style.left = `${event.clientX + scrollX}px`;
    contextMenuElement.style.display = 'block';
}

export function hideContextMenu() {
     contextMenuElement.style.display = 'none';
     contextMenuFilePath = null;
}

// --- Context Menu Actions ---
export async function contextMenuCopy() {
     if (!contextMenuFilePath) return;
     const fileDataMap = Files.getFileDataMap();
     const info = fileDataMap.get(contextMenuFilePath);
     if (info && info.file) {
         try {
            const content = await Files.readFileContent(info.file);
            await navigator.clipboard.writeText(content);
            console.log('Copied:', contextMenuFilePath);
            setErrorMessage(''); // Clear previous errors on success
         } catch (err) {
             console.error('Failed to copy single file:', err);
             // Use setErrorMessage instead of alert
             setErrorMessage(`Failed to copy: ${err.message} (Check permissions/HTTPS)`);
         }
     }
     hideContextMenu();
}

export async function contextMenuCopyCorr() {
      if (!contextMenuFilePath || ctxCopyCorr.classList.contains('disabled')) {
          hideContextMenu(); return;
      }
      const fileDataMap = Files.getFileDataMap();
      const fileInfo1 = fileDataMap.get(contextMenuFilePath);
      const correspondingPath = Files.findCorrespondingPath(contextMenuFilePath);
      const fileInfo2 = correspondingPath ? fileDataMap.get(correspondingPath) : null;

      if (!fileInfo1 || !fileInfo1.file || !fileInfo2 || !fileInfo2.file) {
          hideContextMenu(); return;
      }
      try {
         const [content1, content2] = await Promise.all([
             Files.readFileContent(fileInfo1.file),
             Files.readFileContent(fileInfo2.file)
         ]);
         let firstFileContent = content1, firstFilePath = fileInfo1.path;
         let secondFileContent = content2, secondFilePath = fileInfo2.path;
         const hBefore = hBeforeCppToggle.checked;
         const info1IsH = fileInfo1.ext === '.h';
         if (hBefore && !info1IsH) {
             [firstFileContent, secondFileContent] = [secondFileContent, firstFileContent];
             [firstFilePath, secondFilePath] = [secondFilePath, firstFilePath];
         }
         const displayPath1 = getDisplayPath(firstFilePath);
         const formattedContent1 = firstFileContent.endsWith('\n') ? firstFileContent : firstFileContent + '\n';
         const displayPath2 = getDisplayPath(secondFilePath);
         const formattedContent2 = secondFileContent.endsWith('\n') ? secondFileContent : secondFileContent + '\n';
         const combined = `// ${displayPath1}\n\n${formattedContent1}\n// End of ${displayPath1}\n//------------------------------------\n\n` +
                        `// ${displayPath2}\n\n${formattedContent2}\n// End of ${displayPath2}\n//------------------------------------\n\n`;
         await navigator.clipboard.writeText(combined);
         console.log('Copied with corresponding:', contextMenuFilePath, correspondingPath);
         setErrorMessage(''); // Clear previous errors
      } catch (err) {
         console.error('Failed to copy with corresponding:', err);
         // Use setErrorMessage
         setErrorMessage(`Failed to copy: ${err.message} (Check permissions/HTTPS)`);
      }
      hideContextMenu();
}

// --- Context Menu Go To ---
export function contextMenuGoto() {
    if (!contextMenuFilePath || ctxGoto.classList.contains('disabled')) {
        hideContextMenu(); return;
    }
    const currentSelectedPaths = Files.getSelectedPaths(); // Use getter
    if (currentSelectedPaths.has(contextMenuFilePath)) {
        const displayPath = getDisplayPath(contextMenuFilePath);
        const headerLine = `// ${displayPath}`;
        const combined = combinedContentCode.textContent || '';
        const startIndex = combined.indexOf(headerLine);

        if (startIndex !== -1) {
            const lineStartIndex = combined.lastIndexOf('\n', startIndex) + 1;
            combinedContentPre.focus();

            const linesUpToHeader = combined.substring(0, lineStartIndex).split('\n');
            const targetLineIndex = linesUpToHeader.length - 1;
            const totalLines = combined.split('\n').length;
            const avgLineHeight = combinedContentPre.scrollHeight / (totalLines || 1);
            const targetScrollTop = Math.max(0, targetLineIndex * avgLineHeight - (combinedContentPre.clientHeight * 0.1));
            combinedContentPre.scrollTop = targetScrollTop;

            if (highlightTimeout) {
                clearTimeout(highlightTimeout);
                const prevHighlighted = lineNumbersElement.querySelector('.line-highlight');
                if (prevHighlighted) prevHighlighted.classList.remove('line-highlight');
                highlightTimeout = null;
            }

            const targetLineNumber = targetLineIndex + 1;
            const lineElementToHighlight = lineNumbersElement.querySelector(`div[data-line="${targetLineNumber}"]`);

             if (lineElementToHighlight) {
                lineElementToHighlight.classList.add('line-highlight');
                 highlightTimeout = setTimeout(() => {
                     lineElementToHighlight?.classList.remove('line-highlight');
                     highlightTimeout = null;
                 }, 1500);
             } else {
                 console.warn(`Could not find line number element for line ${targetLineNumber} to highlight.`);
             }

            requestAnimationFrame(updateLineNumbers);

        } else {
            // Use setErrorMessage
            setErrorMessage(`"Go to" failed: File header for ${displayPath} not found in the current view.`);
            console.warn('"Go to" failed: Header line not found.');
        }
    } else {
         setErrorMessage('"Go to" failed: The file must be selected first.');
         console.warn('"Go to" failed: File is not selected.');
    }
    hideContextMenu();
}

// --- Copy All Handler ---
export async function handleCopyAllClick() {
    const contentToCopy = combinedContentCode.textContent;
    if (!contentToCopy) {
        setErrorMessage("Nothing to copy.");
        return;
    }
    try {
        await navigator.clipboard.writeText(contentToCopy);
        console.log("Copied all content.");
        setErrorMessage("Content copied!"); // Provide feedback
        // Optional: Clear message after a delay
        setTimeout(() => setErrorMessage(''), 2000);
    } catch (err) {
        console.error("Failed to copy all content:", err);
        setErrorMessage(`Failed to copy: ${err.message} (Check permissions/HTTPS)`);
    }
}


// --- UI Updates ---
export function setLoading(isLoading) {
    loadingIndicator.style.display = isLoading ? 'inline' : 'none';
}

export function setErrorMessage(message) {
    errorMessageElement.textContent = message || '';
}

export function clearViewer() {
    combinedContentCode.textContent = '';
    combinedContentCode.innerHTML = '';
    combinedContentCode.className = '';
    combinedTokenCountElement.textContent = '0';
    updateLineNumbers();
}

export function clearTree() {
     fileTreeElement.innerHTML = '<li>Select a folder above...</li>';
}

export function resetUIState() {
     clearViewer();
     clearTree();
     setErrorMessage('');
}