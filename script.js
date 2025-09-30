class MoondreamAutoLabeler {
    constructor() {
        this.currentImages = [];
        this.isBatchMode = false;
        this.eventListenersAttached = false;
        this.initializeEventListeners();
        
        // Ensure button starts disabled
        document.getElementById('analyze-btn').disabled = true;
    }

    initializeEventListeners() {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        const folderInput = document.getElementById('folder-input');
        const selectFiles = document.getElementById('select-files');
        const selectFolder = document.getElementById('select-folder');
        const analyzeBtn = document.getElementById('analyze-btn');
        const promptInput = document.getElementById('prompt');

        // File input events - use event delegation to persist through DOM changes
        if (!this.eventListenersAttached) {
            const self = this;
            document.body.addEventListener('click', function(e) {
                // Handle remove button clicks
                if (e.target.matches('.remove-btn')) {
                    e.stopPropagation();
                    e.preventDefault();
                    const index = parseInt(e.target.getAttribute('data-index'));
                    console.log('Remove button clicked, index:', index);
                    self.removeImage(index);
                    return;
                }
                
                // Handle drop zone clicks
                if (e.target.closest('.drop-zone') && !e.target.matches('.select-files, .select-folder, .remove-btn')) {
                    const currentFileInput = document.getElementById('file-input');
                    if (currentFileInput) currentFileInput.click();
                }
                
                // Handle select files/folder clicks
                if (e.target.matches('.select-files')) {
                    const currentFileInput = document.getElementById('file-input');
                    if (currentFileInput) currentFileInput.click();
                }
                if (e.target.matches('.select-folder')) {
                    const currentFolderInput = document.getElementById('folder-input');
                    if (currentFolderInput) currentFolderInput.click();
                }
            });

            // Drag and drop events - attach to document body to persist
            document.body.addEventListener('dragover', function(e) {
                e.preventDefault();
                if (e.target.closest('.drop-zone')) {
                    dropZone.classList.add('drag-over');
                }
            });

            document.body.addEventListener('dragleave', function(e) {
                if (!e.target.closest('.drop-zone')) {
                    dropZone.classList.remove('drag-over');
                }
            });

            document.body.addEventListener('drop', async function(e) {
                e.preventDefault();
                dropZone.classList.remove('drag-over');
                if (e.target.closest('.drop-zone')) {
                    await self.handleDrop(e);
                }
            });

            this.eventListenersAttached = true;
        }
        
        fileInput.addEventListener('change', (e) => this.handleFilesSelect(e.target.files));
        folderInput.addEventListener('change', (e) => this.handleFilesSelect(e.target.files));

        // Analyze button
        analyzeBtn.addEventListener('click', () => this.analyzeImages());

        // Enter key in prompt
        promptInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !analyzeBtn.disabled) {
                this.analyzeImages();
            }
        });
    }

    async handleDrop(e) {
        const items = e.dataTransfer.items;
        const files = [];

        if (items) {
            // Use the more advanced DataTransferItemList API
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === 'file') {
                    const entry = item.webkitGetAsEntry();
                    if (entry) {
                        if (entry.isDirectory) {
                            // Handle folder
                            const folderFiles = await this.readFolderRecursively(entry);
                            files.push(...folderFiles);
                        } else if (entry.isFile) {
                            // Handle individual file
                            const file = item.getAsFile();
                            if (file && file.type.startsWith('image/')) {
                                files.push(file);
                            }
                        }
                    }
                }
            }
        }

        if (files.length > 0) {
            // Convert to FileList-like object
            const fileList = this.createFileList(files);
            this.handleFilesSelect(fileList);
        } else {
            // Fallback to standard file handling
            this.handleFilesSelect(e.dataTransfer.files);
        }
    }

    async readFolderRecursively(dirEntry) {
        const files = [];
        const dirReader = dirEntry.createReader();
        
        const readEntries = () => {
            return new Promise((resolve) => {
                dirReader.readEntries(async (entries) => {
                    if (entries.length === 0) {
                        resolve();
                        return;
                    }
                    
                    for (const entry of entries) {
                        if (entry.isFile) {
                            const file = await this.getFileFromEntry(entry);
                            if (file && file.type.startsWith('image/')) {
                                files.push(file);
                            }
                        } else if (entry.isDirectory) {
                            const subFiles = await this.readFolderRecursively(entry);
                            files.push(...subFiles);
                        }
                    }
                    
                    // Continue reading if there might be more entries
                    const moreFiles = await readEntries();
                    resolve();
                });
            });
        };

        await readEntries();
        return files;
    }

    getFileFromEntry(fileEntry) {
        return new Promise((resolve) => {
            fileEntry.file(resolve, () => resolve(null));
        });
    }

    createFileList(files) {
        // Create a FileList-like object
        const fileList = {
            length: files.length,
            item: (index) => files[index],
            [Symbol.iterator]: function* () {
                for (let i = 0; i < files.length; i++) {
                    yield files[i];
                }
            }
        };
        
        // Add indexed properties
        files.forEach((file, index) => {
            fileList[index] = file;
        });
        
        return fileList;
    }

    async handleFilesSelect(files) {
        if (!files || files.length === 0) {
            return;
        }

        // Filter for image files only
        const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
        
        if (imageFiles.length === 0) {
            this.showError('Please select valid image files');
            return;
        }

        try {
            this.currentImages = [];
            for (const file of imageFiles) {
                const base64 = await this.fileToBase64(file);
                this.currentImages.push({
                    name: file.name,
                    data: base64
                });
            }

            this.isBatchMode = imageFiles.length > 1;
            
            // Update button state based on images
            this.updateButtonState();
            
            // Update drop zone and file count
            const dropZone = document.getElementById('drop-zone');
            const dropContent = document.getElementById('drop-content');
            const imagePreview = document.getElementById('image-preview');
            const imageOverlay = document.getElementById('image-overlay');
            const imageFilename = document.getElementById('image-filename');
            const fileCount = document.getElementById('file-count');
            
            // Always hide the original drop content and show images inside drop zone
            dropContent.style.display = 'none';
            
            if (this.isBatchMode) {
                // Show image grid inside drop zone for multiple images
                dropZone.classList.add('has-images');
                dropZone.classList.remove('has-image');
                imagePreview.classList.remove('visible');
                imageOverlay.classList.remove('visible');
                
                // Create image grid inside drop zone
                const imageGrid = document.createElement('div');
                imageGrid.className = 'image-grid';
                imageGrid.innerHTML = '';
                
                this.currentImages.forEach((image, index) => {
                    const gridItem = document.createElement('div');
                    gridItem.className = 'image-grid-item';
                    gridItem.innerHTML = `
                        <img src="${image.data}" alt="${image.name}">
                        <button class="remove-btn" data-index="${index}">×</button>
                        <div class="image-overlay">
                            <p class="image-filename">${image.name}</p>
                        </div>
                    `;
                    
                    // Remove functionality handled by event delegation
                    
                    imageGrid.appendChild(gridItem);
                });
                
                // Clear drop zone and add grid
                dropZone.innerHTML = '';
                dropZone.appendChild(imageGrid);
                
                fileCount.textContent = '';
            } else {
                // Show single image preview in drop zone
                dropZone.classList.add('has-image');
                dropZone.classList.remove('has-images');
                
                dropZone.innerHTML = `
                    <div class="single-image-container">
                        <img class="image-preview visible" src="${this.currentImages[0].data}" alt="Preview">
                        <button class="remove-btn" data-index="0">×</button>
                        <div class="image-overlay visible">
                            <p class="image-filename">${imageFiles[0].name}</p>
                        </div>
                    </div>
                `;
                
                // Remove functionality handled by event delegation
                
                fileCount.textContent = '';
            }
            
            // Re-add file inputs to drop zone
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.id = 'file-input';
            fileInput.accept = 'image/*';
            fileInput.multiple = true;
            fileInput.hidden = true;
            fileInput.setAttribute('data-testid', 'input-file');
            
            const folderInput = document.createElement('input');
            folderInput.type = 'file';
            folderInput.id = 'folder-input';
            folderInput.setAttribute('webkitdirectory', '');
            folderInput.hidden = true;
            folderInput.setAttribute('data-testid', 'folder-input');
            
            dropZone.appendChild(fileInput);
            dropZone.appendChild(folderInput);
            
            // Re-attach file input listeners
            fileInput.addEventListener('change', (e) => this.handleFilesSelect(e.target.files));
            folderInput.addEventListener('change', (e) => this.handleFilesSelect(e.target.files));

            this.hideError();
            this.hideResults();
        } catch (error) {
            this.showError('Failed to process the images');
            console.error('File processing error:', error);
        }
    }

    reattachFileInputListeners() {
        const fileInput = document.getElementById('file-input');
        const folderInput = document.getElementById('folder-input');
        
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFilesSelect(e.target.files));
        }
        if (folderInput) {
            folderInput.addEventListener('change', (e) => this.handleFilesSelect(e.target.files));
        }
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async analyzeImages() {
        if (!this.currentImages || this.currentImages.length === 0) {
            this.showError('Please select images first');
            return;
        }

        const prompt = document.getElementById('prompt').value;
        
        this.showLoading();
        this.hideError();
        this.hideResults();

        try {
            // Process all images the same way - whether 1 or many
            const results = [];
            
            for (let i = 0; i < this.currentImages.length; i++) {
                const image = this.currentImages[i];
                
                // Update modal progress text
                const modalProgress = document.getElementById('modal-progress');
                const progressDetails = document.getElementById('progress-details');
                const progressFill = document.getElementById('progress-fill');
                const progressText = document.getElementById('progress-text');
                
                if (this.currentImages.length > 1) {
                    // Show progress bar for multiple images
                    progressDetails.style.display = 'block';
                    const progressPercent = ((i + 1) / this.currentImages.length) * 100;
                    progressFill.style.width = `${progressPercent}%`;
                    progressText.textContent = `${i + 1} of ${this.currentImages.length} images processed`;
                    modalProgress.textContent = `Processing: ${image.name}`;
                } else {
                    modalProgress.textContent = 'Auto-labeling with Moondream';
                }
                
                try {
                    const response = await fetch('/auto-label', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            image: image.data,
                            prompt: prompt
                        })
                    });

                    if (response.ok) {
                        const result = await response.json();
                        results.push({
                            name: image.name,
                            success: true,
                            data: result
                        });
                    } else {
                        results.push({
                            name: image.name,
                            success: false,
                            error: `Request failed: ${response.status}`
                        });
                    }
                } catch (error) {
                    results.push({
                        name: image.name,
                        success: false,
                        error: error.message
                    });
                }
            }

            // Display all results the same way
            this.displayResults(results);

        } catch (error) {
            this.showError('Auto-labeling failed: ' + error.message);
            console.error('Analysis error:', error);
        } finally {
            this.hideLoading();
        }
    }

    displayResults(results) {
        // Show results section
        const resultsSection = document.getElementById('results');
        resultsSection.style.display = 'block';

        // Clear both containers and hide global filter pills
        document.getElementById('single-result').style.display = 'none';
        document.getElementById('batch-results').innerHTML = '';
        document.getElementById('batch-results').style.display = 'block';
        document.getElementById('filter-pills').style.display = 'none';

        // Store results for reference
        this.allResults = results.filter(r => r.success);

        // Display each result
        const batchResultsContainer = document.getElementById('batch-results');
        results.forEach((result, index) => {
            const resultItem = document.createElement('div');
            resultItem.className = 'batch-result-item';
            resultItem.setAttribute('data-result-index', index);

            if (result.success) {
                const { objects } = result.data;
                
                if (objects && objects.length > 0) {
                    // Create label-to-color mapping for consistent colors
                    const labelColorMap = {};
                    const uniqueLabels = [...new Set(objects.map(obj => obj.label))];
                    uniqueLabels.forEach((label, labelIndex) => {
                        labelColorMap[label] = labelIndex % 8;
                    });
                    
                    // Assign consistent color indices to objects based on their labels
                    objects.forEach(obj => {
                        obj.colorIndex = labelColorMap[obj.label];
                    });
                    
                    // Create filter pills for this specific result
                    const filterPillsHtml = this.createFilterPillsHTML(objects, index);
                    
                    resultItem.innerHTML = `
                        <h3>${result.name}</h3>
                        <p style="color: #28a745; margin-bottom: 10px;">✓ Found ${objects.length} objects</p>
                        <div class="filter-pills" data-result-index="${index}">
                            ${filterPillsHtml}
                        </div>
                        <div class="image-container" style="position: relative; display: inline-block;">
                            <img src="${result.data.originalImage}" style="max-width: 100%; height: auto; border-radius: 4px;">
                            <svg class="result-overlay" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;"></svg>
                        </div>
                    `;

                    // Add event listeners to filter pills
                    this.attachFilterPillListeners(resultItem, objects, index);

                    // Draw bounding boxes for this result
                    const img = resultItem.querySelector('img');
                    const svg = resultItem.querySelector('.result-overlay');
                    
                    img.onload = () => {
                        this.drawBoundingBoxesOnSVG(svg, img, objects);
                    };
                } else {
                    // No objects found
                    resultItem.innerHTML = `
                        <h3>${result.name}</h3>
                        <p style="color: #ffc107; margin-bottom: 10px;">⚠ No objects found</p>
                        <div class="image-container" style="position: relative; display: inline-block;">
                            <img src="${result.data.originalImage}" style="max-width: 100%; height: auto; border-radius: 4px;">
                        </div>
                    `;
                }
            } else {
                resultItem.innerHTML = `
                    <h3>${result.name}</h3>
                    <p style="color: #dc3545;">✗ Failed: ${result.error}</p>
                `;
            }

            batchResultsContainer.appendChild(resultItem);
        });

        // Auto-scroll to the bottom of the page
        setTimeout(() => {
            window.scrollTo({ 
                top: document.body.scrollHeight, 
                behavior: 'smooth' 
            });
        }, 100); // Small delay to ensure DOM is updated
    }

    drawBoundingBoxesOnSVG(svg, img, objects) {
        if (!objects || objects.length === 0) {
            return;
        }
        
        const imageWidth = img.naturalWidth;
        const imageHeight = img.naturalHeight;

        svg.setAttribute('viewBox', `0 0 ${imageWidth} ${imageHeight}`);

        objects.forEach((obj, index) => {
            // Use colorIndex if available (from label mapping), otherwise originalIndex, otherwise current index
            const colorIndex = obj.colorIndex !== undefined ? obj.colorIndex : 
                              (obj.originalIndex !== undefined ? obj.originalIndex : index);
            const colorClass = `bbox-${colorIndex % 8}`;
            
            const x = obj.x_min * imageWidth;
            const y = obj.y_min * imageHeight;
            const width = (obj.x_max - obj.x_min) * imageWidth;
            const height = (obj.y_max - obj.y_min) * imageHeight;

            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', x);
            rect.setAttribute('y', y);
            rect.setAttribute('width', width);
            rect.setAttribute('height', height);
            rect.setAttribute('rx', 4);
            rect.setAttribute('ry', 4);
            rect.setAttribute('class', `bbox ${colorClass}`);

            // Create temporary text element to measure width
            const tempText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            tempText.setAttribute('class', 'bbox-label');
            tempText.textContent = obj.label;
            tempText.style.visibility = 'hidden';
            svg.appendChild(tempText);
            const textWidth = tempText.getBBox().width;
            svg.removeChild(tempText);
            
            const padding = 24;
            const bgWidth = textWidth + padding;
            const bgHeight = 40;
            
            const textBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            textBg.setAttribute('x', x);
            textBg.setAttribute('y', y - 44);
            textBg.setAttribute('width', bgWidth);
            textBg.setAttribute('height', bgHeight);
            textBg.setAttribute('rx', 8);
            textBg.setAttribute('ry', 8);
            textBg.setAttribute('class', `${colorClass}`);
            textBg.setAttribute('fill', 'currentColor');
            textBg.setAttribute('opacity', '0.9');

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x + padding/2);
            text.setAttribute('y', y - 44 + bgHeight/2 + 8);
            text.setAttribute('class', 'bbox-label');
            text.textContent = obj.label;

            svg.appendChild(textBg);
            svg.appendChild(rect);
            svg.appendChild(text);
        });
    }

    createFilterPillsHTML(objects, resultIndex) {
        if (!objects || objects.length === 0) {
            return '';
        }
        
        // Get unique labels for this result
        const uniqueLabels = [...new Set(objects.map(obj => obj.label))];
        
        let html = '<button class="filter-pill active" data-filter="all" data-result-index="' + resultIndex + '">All</button>';
        
        uniqueLabels.forEach(label => {
            html += '<button class="filter-pill" data-filter="' + label + '" data-result-index="' + resultIndex + '">' + label + '</button>';
        });
        
        return html;
    }

    attachFilterPillListeners(resultItem, objects, resultIndex) {
        const pills = resultItem.querySelectorAll('.filter-pill');
        pills.forEach(pill => {
            pill.addEventListener('click', () => {
                this.filterSingleResult(resultIndex, pill.getAttribute('data-filter'), objects);
            });
        });
    }

    filterSingleResult(resultIndex, filterLabel, objects) {
        // Update active pill for this result only
        const resultItem = document.querySelector(`[data-result-index="${resultIndex}"]`);
        if (!resultItem) return;
        
        const pills = resultItem.querySelectorAll('.filter-pill');
        pills.forEach(pill => {
            pill.classList.remove('active');
            if (pill.getAttribute('data-filter') === filterLabel) {
                pill.classList.add('active');
            }
        });
        
        // Filter objects for this specific result
        let filteredObjects;
        if (filterLabel === 'all') {
            filteredObjects = objects;
        } else {
            filteredObjects = objects.filter(obj => obj.label === filterLabel);
        }
        
        // Clear and redraw this result's overlay
        const svg = resultItem.querySelector('.result-overlay');
        if (!svg) return;
        
        svg.innerHTML = '';
        const img = resultItem.querySelector('img');
        if (img && img.complete) {
            this.drawBoundingBoxesOnSVG(svg, img, filteredObjects);
        }
    }


    showLoading() {
        // Show modal instead of inline loading
        document.getElementById('modal-overlay').style.display = 'flex';
        this.setButtonLoading(true);
        
        // Reset modal text and hide progress details initially
        document.getElementById('modal-progress').textContent = 'Auto-labeling with Moondream';
        document.getElementById('progress-details').style.display = 'none';
    }

    hideLoading() {
        // Hide modal with fade out animation
        const modal = document.getElementById('modal-overlay');
        modal.style.animation = 'modalFadeOut 0.3s ease-out';
        
        setTimeout(() => {
            modal.style.display = 'none';
            modal.style.animation = ''; // Reset animation
        }, 300);
        
        this.setButtonLoading(false);
    }

    setButtonLoading(isLoading) {
        const btn = document.getElementById('analyze-btn');
        const arrow = btn.querySelector('.btn-arrow');
        const spinner = btn.querySelector('.btn-spinner');
        
        if (isLoading) {
            arrow.style.display = 'none';
            spinner.style.display = 'block';
            btn.disabled = true;
        } else {
            arrow.style.display = 'block';
            spinner.style.display = 'none';
            btn.disabled = false;
        }
    }

    showError(message) {
        const errorDiv = document.getElementById('error');
        const errorMessage = document.getElementById('error-message');
        errorMessage.textContent = message;
        errorDiv.style.display = 'block';
    }

    hideError() {
        document.getElementById('error').style.display = 'none';
    }

    hideResults() {
        document.getElementById('results').style.display = 'none';
    }

    resetDropZone() {
        const dropZone = document.getElementById('drop-zone');
        const fileCount = document.getElementById('file-count');
        
        // Reset classes
        dropZone.classList.remove('has-image', 'has-images');
        
        // Clear file count
        if (fileCount) fileCount.textContent = '';
        
        // Rebuild the original drop zone HTML
        dropZone.innerHTML = `
            <div class="drop-content" id="drop-content">
                <div class="drop-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7,10 12,5 17,10"/>
                        <line x1="12" y1="5" x2="12" y2="15"/>
                    </svg>
                </div>
            </div>
            <img class="image-preview" id="image-preview" alt="Preview">
            <div class="image-overlay" id="image-overlay">
                <p class="image-filename" id="image-filename"></p>
            </div>
            <input type="file" id="file-input" accept="image/*" multiple hidden data-testid="input-file">
            <input type="file" id="folder-input" webkitdirectory hidden data-testid="folder-input">
        `;
        
        // Re-attach file input listeners
        const fileInput = document.getElementById('file-input');
        const folderInput = document.getElementById('folder-input');
        fileInput.addEventListener('change', (e) => this.handleFilesSelect(e.target.files));
        folderInput.addEventListener('change', (e) => this.handleFilesSelect(e.target.files));
        
        // Disable the button when no images
        this.updateButtonState();
    }

    updateButtonState() {
        const analyzeBtn = document.getElementById('analyze-btn');
        if (analyzeBtn) {
            analyzeBtn.disabled = this.currentImages.length === 0;
        }
    }

    removeImage(index) {
        console.log('removeImage called with index:', index, 'currentImages length:', this.currentImages.length);
        
        // Remove image from array
        this.currentImages.splice(index, 1);
        
        console.log('After removal, currentImages length:', this.currentImages.length);
        
        if (this.currentImages.length === 0) {
            // No images left, reset to empty state
            console.log('No images left, resetting drop zone');
            this.resetDropZone();
        } else {
            // Rebuild display with remaining images directly
            console.log('Rebuilding display with remaining images');
            this.rebuildImageDisplay();
        }
    }

    rebuildImageDisplay() {
        const dropZone = document.getElementById('drop-zone');
        const fileCount = document.getElementById('file-count');
        
        this.isBatchMode = this.currentImages.length > 1;
        this.updateButtonState();
        
        if (this.isBatchMode) {
            // Show image grid inside drop zone for multiple images
            dropZone.classList.add('has-images');
            dropZone.classList.remove('has-image');
            
            // Create image grid inside drop zone
            const imageGrid = document.createElement('div');
            imageGrid.className = 'image-grid';
            imageGrid.innerHTML = '';
            
            this.currentImages.forEach((image, newIndex) => {
                const gridItem = document.createElement('div');
                gridItem.className = 'image-grid-item';
                gridItem.innerHTML = `
                    <img src="${image.data}" alt="${image.name}">
                    <button class="remove-btn" data-index="${newIndex}">×</button>
                    <div class="image-overlay">
                        <p class="image-filename">${image.name}</p>
                    </div>
                `;
                imageGrid.appendChild(gridItem);
            });
            
            // Clear drop zone and add grid
            dropZone.innerHTML = '';
            dropZone.appendChild(imageGrid);
            
            if (fileCount) fileCount.textContent = '';
        } else {
            // Show single image preview in drop zone
            dropZone.classList.add('has-image');
            dropZone.classList.remove('has-images');
            
            dropZone.innerHTML = `
                <div class="single-image-container">
                    <img class="image-preview visible" src="${this.currentImages[0].data}" alt="Preview">
                    <button class="remove-btn" data-index="0">×</button>
                    <div class="image-overlay visible">
                        <p class="image-filename">${this.currentImages[0].name}</p>
                    </div>
                </div>
            `;
            
            if (fileCount) fileCount.textContent = '';
        }
        
        // Re-add file inputs to drop zone
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'file-input';
        fileInput.accept = 'image/*';
        fileInput.multiple = true;
        fileInput.hidden = true;
        fileInput.setAttribute('data-testid', 'input-file');
        
        const folderInput = document.createElement('input');
        folderInput.type = 'file';
        folderInput.id = 'folder-input';
        folderInput.setAttribute('webkitdirectory', '');
        folderInput.hidden = true;
        folderInput.setAttribute('data-testid', 'folder-input');
        
        dropZone.appendChild(fileInput);
        dropZone.appendChild(folderInput);
        
        // Re-attach file input listeners
        fileInput.addEventListener('change', (e) => this.handleFilesSelect(e.target.files));
        folderInput.addEventListener('change', (e) => this.handleFilesSelect(e.target.files));
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MoondreamAutoLabeler();
});