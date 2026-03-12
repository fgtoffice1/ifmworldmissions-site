document.addEventListener('DOMContentLoaded', () => {

    // --- State Management ---
    // In a real app, this would come from a server/database.
    // Here we use localStorage to demonstrate the capability locally.
    const STORAGE_KEY = 'ifm_newsletters';
    let newsletters = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    let isAdmin = false;

    // --- DOM Elements ---
    const toggleAdminBtn = document.getElementById('toggleAdminBtn');
    const adminSection = document.getElementById('adminSection');
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const loadingIndicator = document.getElementById('loadingIndicator');
    
    const latestContainer = document.getElementById('latestNewsletterContainer');
    const archiveGrid = document.getElementById('archiveGrid');
    
    const pdfModal = document.getElementById('pdfModal');
    const pdfViewer = document.getElementById('pdfViewer');
    const closeModalBtn = document.querySelector('.close-modal');

    // --- Initialization ---
    renderNewsletters();

    // --- Admin Toggle --
    if(toggleAdminBtn) {
        toggleAdminBtn.addEventListener('click', () => {
            if(adminSection.style.display === 'none') {
                const pass = prompt("Enter Admin Password:");
                if (pass !== "IFM2026") {
                    alert("Incorrect password.");
                    return;
                }
                isAdmin = true;
                adminSection.style.display = 'block';
                toggleAdminBtn.innerText = 'Hide Admin Panel';
                renderNewsletters();
            } else {
                isAdmin = false;
                adminSection.style.display = 'none';
                toggleAdminBtn.innerText = 'Admin Login';
                renderNewsletters();
            }
        });
    }

    // --- Drag and Drop Handling ---
    if(dropzone) {
        // Prevent default browser behavior (opening the file)
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, () => dropzone.classList.add('dragover'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragover'), false);
        });

        dropzone.addEventListener('drop', (e) => {
            let dt = e.dataTransfer;
            let files = dt.files;
            handleFiles(files);
        });

        // Click to open file dialog
        dropzone.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', function() {
            handleFiles(this.files);
        });
    }

    function handleFiles(files) {
        if (files.length === 0) return;
        const file = files[0];
        
        if (file.type !== 'application/pdf') {
            alert('Please upload a PDF file.');
            return;
        }

        processPDF(file);
    }

    // --- PDF Processing ---
    async function processPDF(file) {
        loadingIndicator.style.display = 'block';
        dropzone.style.display = 'none';

        try {
            // 1. Read file as ArrayBuffer for PDF.js
            const arrayBuffer = await file.arrayBuffer();
            
            // 2. Load PDF document
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            // 3. Get first page
            const page = await pdf.getPage(1);
            
            // 4. Set scale and viewport
            const scale = 1.5; // High enough res for a good thumbnail
            const viewport = page.getViewport({ scale: scale });

            // 5. Prepare canvas
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            // 6. Render PDF page into canvas context
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            await page.render(renderContext).promise;

            // 7. Convert canvas to base64 Image
            const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.8);

            // 8. Extract Date from PDF text
            let extractedDate = new Date().toLocaleDateString(); // fallback
            try {
                const textContent = await page.getTextContent();
                const textItems = textContent.items.map(item => item.str);
                const fullText = textItems.join(' ');
                
                // Matches "Month Year" e.g., "April 2025"
                const monthYearRegex = /(January|February|March|April|May|June|July|August|September|October|November|December)\s*(\d{4})/i;
                const match = fullText.match(monthYearRegex);
                
                if (match) {
                    // Capitalize first letter of month just in case
                    const month = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
                    extractedDate = `${month} ${match[2]}`;
                } else {
                    // Try to guess from filename if not in text
                    const fnMatch = file.name.match(monthYearRegex);
                    if (fnMatch) {
                        const month = fnMatch[1].charAt(0).toUpperCase() + fnMatch[1].slice(1).toLowerCase();
                        extractedDate = `${month} ${fnMatch[2]}`;
                    }
                }
            } catch(e) {
                console.warn("Could not extract text for date, falling back to current date.", e);
            }

            // 9. Convert raw PDF to base64 so we can save it in localStorage
            // NOTE: In production, upload the file to a server instead of Base64 encoding it into memory.
            const pdfBase64 = await toBase64(file);

            // 10. Save to our "database"
            const newNewsletter = {
                id: Date.now(),
                filename: file.name,
                dateAdded: extractedDate,
                thumbnail: thumbnailDataUrl,
                pdfData: pdfBase64
            };

            // Add to beginning of array (newest first)
            newsletters.unshift(newNewsletter);

            // Save to localStorage
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newsletters));

            // Refresh UI
            renderNewsletters();

        } catch (error) {
            console.error('Error processing PDF:', error);
            alert('There was an error processing the PDF. See console for details.');
        } finally {
            loadingIndicator.style.display = 'none';
            dropzone.style.display = 'block';
            fileInput.value = ''; // reset input
        }
    }

    function toBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

    // --- Rendering UI ---
    function renderNewsletters() {
        if (newsletters.length === 0) {
            latestContainer.innerHTML = '<p class="empty-state">No newsletters uploaded yet.</p>';
            archiveGrid.innerHTML = '';
            return;
        }

        // --- Render Latest (First item) ---
        const latest = newsletters[0];
        const latestDeleteBtn = isAdmin ? `<button class="delete-btn" onclick="deletePDF('${latest.id}', event)" title="Delete Newsletter">&times;</button>` : '';
        
        latestContainer.innerHTML = `
            <div class="paper-stack" onclick="openPDF('${latest.id}')" title="Click to read ${latest.filename}">
                ${latestDeleteBtn}
                <div class="paper-layer layer-2"></div>
                <div class="paper-layer layer-1"></div>
                <div class="paper-main">
                    <img src="${latest.thumbnail}" alt="Latest Newsletter">
                </div>
            </div>
            <p style="margin-top: 1.5rem; font-weight: 500; font-family: var(--font-serif); font-size: 1.5rem; color: var(--primary-color);">${latest.dateAdded}</p>
        `;

        // --- Render Archive (Remaining items) ---
        archiveGrid.innerHTML = '';
        if (newsletters.length > 1) {
            for (let i = 1; i < newsletters.length; i++) {
                const item = newsletters[i];
                const archiveDeleteBtn = isAdmin ? `<button class="delete-btn" onclick="deletePDF('${item.id}', event)" title="Delete Newsletter">&times;</button>` : '';
                const archiveHtml = `
                    <div class="archive-item" onclick="openPDF('${item.id}')" style="position: relative;">
                        ${archiveDeleteBtn}
                        <img src="${item.thumbnail}" alt="Newsletter thumbnail" class="archive-thumb">
                        <p class="archive-date">${item.dateAdded}</p>
                    </div>
                `;
                archiveGrid.innerHTML += archiveHtml;
            }
        }
    }

    // --- Delete Functionality ---
    window.deletePDF = function(id, event) {
        event.stopPropagation(); // prevent modal from opening
        if(confirm("Are you sure you want to delete this newsletter?")) {
            newsletters = newsletters.filter(n => n.id.toString() !== id.toString());
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newsletters));
            renderNewsletters();
        }
    };

    // --- Modal Viewing ---
    // Attach to window so onclick handlers in HTML string can reach it
    window.openPDF = function(id) {
        // Find the matching newsletter
        const item = newsletters.find(n => n.id.toString() === id.toString());
        if(item) {
            // Set iframe src to the base64 string
            pdfViewer.src = item.pdfData;
            pdfModal.classList.add('show');
            document.body.style.overflow = 'hidden'; // prevent background scrolling
        }
    };

    if(closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            pdfModal.classList.remove('show');
            pdfViewer.src = ''; // clear memory
            document.body.style.overflow = 'auto'; // restore scrolling
        });
    }

    if(pdfModal) {
        // Close if clicking outside the modal content
        pdfModal.addEventListener('click', (e) => {
            if(e.target === pdfModal) {
                closeModalBtn.click();
            }
        });
    }
});
