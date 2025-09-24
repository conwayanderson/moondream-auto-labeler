class MoondreamAutoLabeler {
    constructor() {
        this.currentImages = [];
        this.isBatchMode = false;
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        const folderInput = document.getElementById('folder-input');
        const selectFiles = document.getElementById('select-files');
        const selectFolder = document.getElementById('select-folder');
        const analyzeBtn = document.getElementById('analyze-btn');
        const promptInput = document.getElementById('prompt');

        // File input events
        dropZone.addEventListener('click', (e) => {
            // Only trigger file input if not clicking on the specific links
            if (!e.target.matches('.select-files, .select-folder')) {
                fileInput.click();
            }
        });
        selectFiles.addEventListener('click', () => fileInput.click());
        selectFolder.addEventListener('click', () => folderInput.click());
        
        fileInput.addEventListener('change', (e) => this.handleFilesSelect(e.target.files));
        folderInput.addEventListener('change', (e) => this.handleFilesSelect(e.target.files));

        // Drag and drop events
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            await this.handleDrop(e);
        });

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
            document.getElementById('analyze-btn').disabled = false;
            
            // Update drop zone and file count
            const dropZone = document.getElementById('drop-zone');
            const fileCount = document.getElementById('file-count');
            
            if (this.isBatchMode) {
                dropZone.innerHTML = `
                    <div class="drop-content">
                        <div class="drop-icon">✓</div>
                        <p><strong>${imageFiles.length} images</strong> selected</p>
                        <p style="font-size: 0.9em; color: #666;">Click to select different images</p>
                        <input type="file" id="file-input" accept="image/*" multiple hidden data-testid="input-file">
                        <input type="file" id="folder-input" webkitdirectory hidden data-testid="folder-input">
                    </div>
                `;
                fileCount.textContent = `${imageFiles.length} images ready for processing`;
            } else {
                dropZone.innerHTML = `
                    <div class="drop-content">
                        <div class="drop-icon">✓</div>
                        <p><strong>${imageFiles[0].name}</strong> selected</p>
                        <p style="font-size: 0.9em; color: #666;">Click to select a different image</p>
                        <input type="file" id="file-input" accept="image/*" multiple hidden data-testid="input-file">
                        <input type="file" id="folder-input" webkitdirectory hidden data-testid="folder-input">
                    </div>
                `;
                fileCount.textContent = '';
            }

            // Re-attach event listeners after updating innerHTML
            this.reattachFileInputListeners();

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
                
                // Update loading text to show progress
                const loadingText = document.querySelector('#loading p');
                if (this.currentImages.length > 1) {
                    loadingText.textContent = `Processing ${i + 1} of ${this.currentImages.length}: ${image.name}`;
                } else {
                    loadingText.textContent = 'Auto-labeling with Moondream...';
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
    }

    drawBoundingBoxesOnSVG(svg, img, objects) {
        if (!objects || objects.length === 0) {
            return;
        }
        
        const imageWidth = img.naturalWidth;
        const imageHeight = img.naturalHeight;

        svg.setAttribute('viewBox', `0 0 ${imageWidth} ${imageHeight}`);

        objects.forEach((obj, index) => {
            const colorClass = `bbox-${index % 8}`;
            
            const x = obj.x_min * imageWidth;
            const y = obj.y_min * imageHeight;
            const width = (obj.x_max - obj.x_min) * imageWidth;
            const height = (obj.y_max - obj.y_min) * imageHeight;

            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', x);
            rect.setAttribute('y', y);
            rect.setAttribute('width', width);
            rect.setAttribute('height', height);
            rect.setAttribute('class', `bbox ${colorClass}`);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x + 5);
            text.setAttribute('y', y - 5);
            text.setAttribute('class', 'bbox-label');
            text.textContent = obj.label;

            const textBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            textBg.setAttribute('x', x);
            textBg.setAttribute('y', y - 25);
            textBg.setAttribute('width', obj.label.length * 8 + 10);
            textBg.setAttribute('height', 25);
            textBg.setAttribute('class', `${colorClass}`);
            textBg.setAttribute('fill', 'currentColor');
            textBg.setAttribute('opacity', '0.8');

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
        document.getElementById('loading').style.display = 'block';
    }

    hideLoading() {
        document.getElementById('loading').style.display = 'none';
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
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MoondreamAutoLabeler();
});