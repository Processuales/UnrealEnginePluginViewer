// --- State ---
let fileData = [];
let fileDataMap = new Map();
let selectedPaths = new Set();
let lastClickedIndex = -1;

// --- Path Helpers ---
export function getDirectory(path) {
    const lastSlash = path.lastIndexOf('/');
    return lastSlash === -1 ? '' : path.substring(0, lastSlash);
}
export function getBaseName(path) {
    const fileName = path.substring(path.lastIndexOf('/') + 1);
    const dotIndex = fileName.lastIndexOf('.');
    return dotIndex === -1 ? fileName : fileName.substring(0, dotIndex);
}
export function getExtension(path) {
    const dotIndex = path.lastIndexOf('.');
    return dotIndex === -1 ? '' : path.substring(dotIndex).toLowerCase();
}

// --- Token Estimation ---
export function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

// --- File Reading ---
export async function readFileContent(file) {
    return new Promise((resolve, reject) => {
        if (!file) { return reject(new Error("Invalid file object provided")); }
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsText(file);
    });
}

// --- Tree Data Building ---
export function buildTree(files) {
    const tree = {};
    files.forEach(fileInfo => {
        const pathParts = fileInfo.path.split('/');
        let currentLevel = tree;
        pathParts.forEach((part, index) => {
            if (index === pathParts.length - 1) {
                currentLevel[part] = fileInfo;
            } else {
                if (!currentLevel[part]) currentLevel[part] = {};
                currentLevel = currentLevel[part];
            }
        });
    });
    return tree;
}

// --- Find Corresponding H/CPP ---
export function findCorrespondingPath(filePath) {
    const fileInfo = fileDataMap.get(filePath);
    if (!fileInfo || (fileInfo.ext !== '.h' && fileInfo.ext !== '.cpp')) {
        return null;
    }
    const isHeader = fileInfo.ext === '.h';
    const targetExt = isHeader ? '.cpp' : '.h';
    const sourceSegment = isHeader ? '/public/' : '/private/';
    const targetSegment = isHeader ? '/private/' : '/public/';
    const dirParts = fileInfo.dir.toLowerCase().split('/');
    let segmentIndex = -1;
    for(let i = dirParts.length -1; i >= 0; i--) {
        if (`/${dirParts[i]}/` === sourceSegment) {
            segmentIndex = i; break;
        }
    }
    if (segmentIndex !== -1) {
        const originalDirParts = fileInfo.dir.split('/');
        const targetDirParts = originalDirParts.slice(0, segmentIndex);
        targetDirParts.push(isHeader ? 'Private' : 'Public');
        targetDirParts.push(...originalDirParts.slice(segmentIndex + 1));
        const targetDir = targetDirParts.join('/');
        const potentialPath = `${targetDir}/${fileInfo.baseName}${targetExt}`;
        if (fileDataMap.has(potentialPath)) return potentialPath;
    }
    const fallbackPath = `${fileInfo.dir}/${fileInfo.baseName}${targetExt}`;
    if (fileDataMap.has(fallbackPath)) return fallbackPath;
    return null;
}

// --- Process Folder Input ---
export async function processFolderSelection(files) {
    fileData = [];
    fileDataMap.clear();
    selectedPaths.clear();
    lastClickedIndex = -1;
    const sourceFiles = [];
    let hasUpluginFile = false;
    // Updated: ignoredFolderNames list and case-insensitive check
    const ignoredFolderNames = ['intermediate', 'binaries']; // Folders to ignore (lowercase)
    const pluginRootPrefix = files[0]?.webkitRelativePath?.split('/')[0] + '/' || '';

    for (const file of files) {
        const relativePath = file.webkitRelativePath;
        if (!relativePath) { console.warn("File skipped, missing relative path:", file.name); continue; }
        
        const lowerPath = relativePath.toLowerCase();
        // Skip common archive files early
        if (lowerPath.endsWith('.zip') || lowerPath.endsWith('.rar') || lowerPath.endsWith('.7z')) { continue; }
        
        const pathParts = lowerPath.split('/');
        // Updated: Check against multiple ignored folder names
        if (ignoredFolderNames.some(ignoredFolder => pathParts.includes(ignoredFolder))) {
            continue;
        }

        if (relativePath.startsWith(pluginRootPrefix) && relativePath.indexOf('/') === relativePath.lastIndexOf('/') && lowerPath.endsWith('.uplugin')) {
            hasUpluginFile = true;
        }

        // Updated: validExtensions list
        const validExtensions = [
            '.h', '.cpp', '.usf', '.ush', '.build.cs', '.uplugin', // Original UE specific
            '.dark', '.light', '.cjs', '.gitignore', '.html', '.json', 
            '.js', '.lock', '.ini', '.jsx', '.css' // Added general types
        ];

        if (validExtensions.some(ext => lowerPath.endsWith(ext))) {
             const fileInfo = {
                file: file,
                path: relativePath,
                element: null,
                tokenSpan: null,
                tokenCount: 0,
                dir: getDirectory(relativePath),
                baseName: getBaseName(relativePath),
                ext: getExtension(relativePath)
            };
            sourceFiles.push(fileInfo);
            fileDataMap.set(relativePath, fileInfo);
        }
    }

    let initialWarning = '';
    const hasCodeFiles = sourceFiles.some(f => f.ext === '.h' || f.ext === '.cpp');
    const hasShaderFiles = sourceFiles.some(f => f.ext === '.usf' || f.ext === '.ush');
    if (!hasUpluginFile && hasCodeFiles) {
        initialWarning = 'Warning: C++/H files found, but no .uplugin file in the root. Is this a standard UE plugin?';
    } else if (!hasUpluginFile && hasShaderFiles && !hasCodeFiles) {
        initialWarning = 'Info: Shader files detected.';
    } else if (!hasUpluginFile && sourceFiles.length > 0 && !hasCodeFiles && !hasShaderFiles) {
        initialWarning = 'Info: Project files detected. No .uplugin file found in the root.';
    }


    if (sourceFiles.length === 0) {
        const ignoredFoldersString = ignoredFolderNames.map(f => `'${f}'`).join(', ');
        return { error: `No compatible files (${validExtensions.join(', ')}) found (excluding folders ${ignoredFoldersString}, .zip, .rar, .7z).` };
    }

    sourceFiles.sort((a, b) => a.path.localeCompare(b.path));
    fileData = sourceFiles;

    const tokenPromises = fileData.map(async (fileInfo) => {
        try {
            const content = await readFileContent(fileInfo.file);
            fileInfo.tokenCount = estimateTokens(content);
        } catch (error) {
            console.error(`Error reading file ${fileInfo.path} for token count:`, error);
            fileInfo.tokenCount = -1; // Indicate error in token count
        }
    });
    try {
        await Promise.all(tokenPromises);
    } catch (error) {
        // This catch might be redundant if individual errors are handled above,
        // but kept for safety for Promise.all level rejections.
        console.error("Error during token calculation for some files.");
    }

    return { fileData, fileDataMap, initialWarning };
}


// --- Handle File Click Logic (Updates State) ---
export function handleFileClickLogic(filePath, allFilePathsInTree, isCtrlOrMeta, isShift, selectCorresponding) {
    const clickedIndex = allFilePathsInTree.indexOf(filePath);
    const currentlySelected = selectedPaths.has(filePath);

     if (isShift && lastClickedIndex !== -1) {
        const start = Math.min(lastClickedIndex, clickedIndex);
        const end = Math.max(lastClickedIndex, clickedIndex);
         if (!isCtrlOrMeta) { selectedPaths.clear(); }
        for (let i = start; i <= end; i++) { if (allFilePathsInTree[i]) { selectedPaths.add(allFilePathsInTree[i]); } }
    } else if (isCtrlOrMeta) {
        if (currentlySelected) { selectedPaths.delete(filePath); } else { selectedPaths.add(filePath); }
        lastClickedIndex = clickedIndex;
    } else {
        selectedPaths.clear();
        selectedPaths.add(filePath);
        lastClickedIndex = clickedIndex;
    }

     if (selectCorresponding) {
         const pathsToAdd = new Set();
         const currentSelectionSnapshot = Array.from(selectedPaths);
         for (const selectedPath of currentSelectionSnapshot) {
             const info = fileDataMap.get(selectedPath);
             if (info && (info.ext === '.h' || info.ext === '.cpp')) {
                 const correspondingPath = findCorrespondingPath(selectedPath);
                 if (correspondingPath && !selectedPaths.has(correspondingPath)) { pathsToAdd.add(correspondingPath); }
             }
         }
         pathsToAdd.forEach(p => selectedPaths.add(p)); // Add directly to the state set
     }

    return new Set(selectedPaths); // Return a copy for UI update
}

// --- Sorting Helper ---
export function getRepresentativeIndex(path, selectedPathsSet, originalIndexMap) {
    const info = fileDataMap.get(path);
    const ownIndex = originalIndexMap.get(path);
    if (!info || ownIndex === undefined) return Infinity;
    if (info.ext === '.h' || info.ext === '.cpp') {
        const correspondingPath = findCorrespondingPath(path);
        if (correspondingPath && selectedPathsSet.has(correspondingPath)) {
            const correspondingIndex = originalIndexMap.get(correspondingPath);
            if (correspondingIndex !== undefined) { return Math.min(ownIndex, correspondingIndex); }
        }
    }
    return ownIndex;
}

// --- State Modification for Corresponding Toggle ---
// Added function to encapsulate adding paths to the selection state
export function addPathsToSelection(pathsToAdd) {
    pathsToAdd.forEach(p => {
        if (!selectedPaths.has(p)) { // Avoid duplicates if logic calling this is redundant
            selectedPaths.add(p);
        }
    });
    return new Set(selectedPaths); // Return updated copy
}


// --- Getters for State ---
export function getSelectedPaths() {
    // Return a *copy* to prevent external mutation of the internal state Set
    return new Set(selectedPaths);
}

export function getFileDataMap() {
    // Map is usually okay to return by reference if not mutated externally,
    // but could return a copy if needed: return new Map(fileDataMap);
    return fileDataMap;
}

// --- Clear Selections ---
export function clearSelections() {
    selectedPaths.clear();
    lastClickedIndex = -1;
    return new Set(); // Return empty set for UI update
}