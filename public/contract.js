let recognition;
let isRecording = false;
let transcript = '';
let networkErrorCount = 0;
let recognitionTimeout = null;
let currentContractId = null;
let currentContractData = null;

// Initialize speech recognition
function initializeSpeechRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        
        console.log('Speech recognition initialized successfully');
        return true;
    } else {
        console.error('Speech recognition not supported in this browser');
        alert('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
        return false;
    }
}

// Initialize on load
const speechAvailable = initializeSpeechRecognition();

const micBtn = document.getElementById('micBtn');
const status = document.getElementById('status');
const loading = document.getElementById('loading');
const toggleGuide = document.getElementById('toggleGuide');
const guideContent = document.getElementById('guideContent');
const textInput = document.getElementById('textInput');
const generateBtn = document.getElementById('generateBtn');
const clearBtn = document.getElementById('clearBtn');
const uploadAudioBtn = document.getElementById('uploadAudioBtn');
const audioFileInput = document.getElementById('audioFileInput');
const transcribingLoader = document.getElementById('transcribing');

// Audio file upload handler
uploadAudioBtn.addEventListener('click', () => {
    audioFileInput.click();
});

audioFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validate file size (25MB limit for Whisper API)
    if (file.size > 25 * 1024 * 1024) {
        alert('File too large! Please upload a file smaller than 25MB.');
        return;
    }
    
    // Show transcribing loader
    transcribingLoader.classList.remove('hidden');
    uploadAudioBtn.disabled = true;
    status.textContent = '🎵 Transcribing audio...';
    
    try {
        // Create FormData to send file
        const formData = new FormData();
        formData.append('audio', file);
        
        // Send to backend for transcription
        const response = await fetch('/api/transcribe-audio', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Transcription failed');
        }
        
        const data = await response.json();
        
        // Set transcribed text in textarea
        textInput.value = data.transcription;
        transcript = data.transcription;
        status.textContent = '✅ Audio transcribed! Review and edit if needed, then generate contract.';
        
    } catch (error) {
        console.error('Transcription error:', error);
        status.textContent = '❌ Failed to transcribe audio. Please try again.';
        alert('Failed to transcribe audio file. Please try again or use voice input instead.');
    } finally {
        transcribingLoader.classList.add('hidden');
        uploadAudioBtn.disabled = false;
        audioFileInput.value = ''; // Reset file input
    }
});

// Check mic permissions on load
navigator.permissions.query({ name: 'microphone' }).then((result) => {
    console.log('Microphone permission:', result.state);
    if (result.state === 'denied') {
        status.textContent = '⚠️ Microphone access denied. Please enable it in browser settings.';
    }
});

// Toggle guidelines
toggleGuide.addEventListener('click', () => {
    guideContent.classList.toggle('hidden');
    toggleGuide.textContent = guideContent.classList.contains('hidden') 
        ? '📋 Speaking Guidelines' 
        : '✕ Hide Guidelines';
});

// Clear button
clearBtn.addEventListener('click', () => {
    textInput.value = '';
    transcript = '';
    status.textContent = 'Press to speak';
});

// Generate contract from text input
generateBtn.addEventListener('click', () => {
    const text = textInput.value.trim();
    if (text) {
        status.textContent = '⏳ Processing your contract...';
        loading.classList.remove('hidden');
        generateBtn.disabled = true;
        
        generateContract(text);
    } else {
        status.textContent = 'Please enter contract details first!';
        setTimeout(() => {
            status.textContent = 'Press to speak';
        }, 2000);
    }
});

micBtn.addEventListener('click', toggleRecording);

function toggleRecording() {
    if (!recognition) {
        status.textContent = 'Speech recognition not available. Please type below.';
        textInput.focus();
        return;
    }
    
    if (!isRecording) {
        startRecording();
    } else {
        stopRecording();
    }
}

function startRecording() {
    if (!recognition) {
        status.textContent = 'Speech recognition not initialized. Please reload the page.';
        return;
    }
    
    try {
        transcript = '';
        textInput.value = '';
        recognition.start();
        isRecording = true;
        micBtn.classList.add('recording');
        status.textContent = '🎙️ Listening... Speak now!';
        status.classList.add('listening');
        
        recognitionTimeout = setTimeout(() => {
            if (isRecording) {
                status.textContent = '🎙️ Still listening... Keep going!';
            }
        }, 30000);
        
        console.log('Started recording');
    } catch (error) {
        console.error('Error starting recognition:', error);
        status.textContent = `Error: ${error.message}`;
        isRecording = false;
        micBtn.classList.remove('recording');
        status.classList.remove('listening');
    }
}

function stopRecording() {
    if (!recognition) return;
    
    try {
        recognition.stop();
        isRecording = false;
        micBtn.classList.remove('recording');
        status.classList.remove('listening');
        if (recognitionTimeout) clearTimeout(recognitionTimeout);
        
        if (transcript) {
            status.textContent = '✅ Processing your contract...';
            loading.classList.remove('hidden');
            generateContract(transcript);
        } else {
            status.textContent = 'No speech detected. Try again or type below.';
        }
        
        console.log('Stopped recording');
    } catch (error) {
        console.error('Error stopping recognition:', error);
        isRecording = false;
        micBtn.classList.remove('recording');
        status.classList.remove('listening');
    }
}

// Speech recognition event handlers
if (recognition) {
    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcriptPiece = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcriptPiece + ' ';
            } else {
                interimTranscript += transcriptPiece;
            }
        }
        
        transcript += finalTranscript;
        textInput.value = transcript + interimTranscript;
        
        if (transcript) {
            status.textContent = '🎙️ Listening... (Click mic again when done)';
        }
    };
    
    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        
        if (event.error === 'no-speech') {
            status.textContent = 'No speech detected. Try again or type below.';
        } else if (event.error === 'network') {
            networkErrorCount++;
            if (networkErrorCount > 2) {
                status.textContent = 'Network error. Please check your connection and try again.';
            } else {
                status.textContent = 'Connection issue. Retrying...';
                setTimeout(() => {
                    if (!isRecording) {
                        startRecording();
                    }
                }, 1000);
            }
        } else {
            status.textContent = `Error: ${event.error}. Please try again.`;
        }
        
        isRecording = false;
        micBtn.classList.remove('recording');
        status.classList.remove('listening');
    };
    
    recognition.onend = () => {
        console.log('Recognition ended, isRecording:', isRecording);
        
        if (isRecording) {
            try {
                recognition.start();
                console.log('Restarted recognition');
            } catch (error) {
                console.error('Error restarting recognition:', error);
                isRecording = false;
                micBtn.classList.remove('recording');
                status.classList.remove('listening');
            }
        }
    };
}

// Generate contract via API
async function generateContract(transcriptText) {
    try {
        const response = await fetch('/api/generate-contract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ transcript: transcriptText })
        });
        
        if (!response.ok) {
            throw new Error('Failed to generate contract');
        }
        
        const data = await response.json();
        console.log('Contract generated:', data);
        
        loading.classList.add('hidden');
        generateBtn.disabled = false;
        status.textContent = '✅ Contract generated! Review and edit below.';
        
        // Store contract ID and data
        currentContractId = data.contractId;
        currentContractData = data.contractData;
        
        // Show preview modal
        showPreviewModal(data.contractData);
        
    } catch (error) {
        console.error('Error:', error);
        loading.classList.add('hidden');
        generateBtn.disabled = false;
        status.textContent = '❌ Error generating contract. Please try again.';
        setTimeout(() => {
            status.textContent = 'Press to speak';
        }, 3000);
    }
}

// Show preview modal with contract data
function showPreviewModal(contractData) {
    const modal = document.getElementById('contractPreviewModal');
    
    // Populate contract title and date
    document.getElementById('prev_contractTitle').textContent = contractData.contractTitle || 'Service Agreement';
    document.getElementById('prev_effectiveDate').value = contractData.effectiveDate || new Date().toISOString().split('T')[0];
    
    // Populate service provider
    document.getElementById('prev_sp_name').textContent = contractData.parties?.serviceProvider?.name || '';
    document.getElementById('prev_sp_address').textContent = contractData.parties?.serviceProvider?.address || '';
    document.getElementById('prev_sp_email').textContent = contractData.parties?.serviceProvider?.email || '';
    document.getElementById('prev_sp_phone').textContent = contractData.parties?.serviceProvider?.phone || '';
    
    // Populate client
    document.getElementById('prev_client_name').textContent = contractData.parties?.client?.name || '';
    document.getElementById('prev_client_address').textContent = contractData.parties?.client?.address || '';
    document.getElementById('prev_client_email').textContent = contractData.parties?.client?.email || '';
    document.getElementById('prev_client_phone').textContent = contractData.parties?.client?.phone || '';
    
    // Populate sections
    const sectionsContainer = document.getElementById('contractSectionsContainer');
    sectionsContainer.innerHTML = '';
    
    if (contractData.sections && contractData.sections.length > 0) {
        contractData.sections.forEach((section, index) => {
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'preview-contract-section';
            
            // Convert \n to <br> for proper display
            const formattedContent = (section.content || '').replace(/\\n/g, '\n').replace(/\n/g, '<br>');
            
            sectionDiv.innerHTML = `
                <div class="preview-section-number">${index + 1}.</div>
                <div class="preview-section-content">
                    <div class="preview-section-title" contenteditable="true" data-section-index="${index}" data-field="title">${section.title}</div>
                    <div class="preview-section-text" contenteditable="true" data-section-index="${index}" data-field="content">${formattedContent}</div>
                </div>
            `;
            sectionsContainer.appendChild(sectionDiv);
        });
    }
    
    // Auto-detect and highlight uncertain/ambiguous fields that need confirmation
    highlightUncertainFields(contractData);
    
    // Add click listeners for confirmation
    addConfirmationListeners();
    
    modal.classList.remove('hidden');
    modal.classList.add('active');
}

// Auto-detect uncertain fields that need user confirmation
function highlightUncertainFields(contractData) {
    const uncertainPatterns = [
        /to be determined/gi,
        /tbd/gi,
        /pending/gi,
        /unclear/gi,
        /not specified/gi,
        /to be confirmed/gi,
        /\[.*?\]/g,  // [placeholder text]
        /\{.*?\}/g,  // {placeholder text}
        /___+/g,     // underscores
        /\?\?+/g,    // question marks
        /AMBIGUOUS/gi,
        /MISSING/gi
    ];
    
    // Check all contenteditable elements
    const editableElements = document.querySelectorAll('[contenteditable="true"]');
    
    editableElements.forEach(element => {
        const text = element.textContent || element.innerHTML;
        let hasUncertainty = false;
        
        // Check for uncertain patterns
        for (const pattern of uncertainPatterns) {
            if (pattern.test(text)) {
                hasUncertainty = true;
                break;
            }
        }
        
        // Check if field is empty or too short
        if (text.trim().length < 3) {
            hasUncertainty = true;
        }
        
        // Add needs-confirmation class if uncertain
        if (hasUncertainty) {
            element.classList.add('needs-confirmation');
            element.setAttribute('data-needs-confirmation', 'true');
        }
    });
}

// Add click listeners to confirm fields
function addConfirmationListeners() {
    const uncertainFields = document.querySelectorAll('.needs-confirmation');
    
    uncertainFields.forEach(field => {
        // Double-click to confirm
        field.addEventListener('dblclick', function() {
            if (this.classList.contains('needs-confirmation')) {
                this.classList.remove('needs-confirmation');
                this.classList.add('confirmed');
                this.setAttribute('data-needs-confirmation', 'false');
                this.setAttribute('data-confirmed', 'true');
                
                // Remove confirmed class after 3 seconds
                setTimeout(() => {
                    this.classList.remove('confirmed');
                }, 3000);
            }
        });
        
        // Show tooltip on hover
        field.setAttribute('title', 'Double-click to confirm this field is correct');
    });
}

// Close preview modal
function closePreviewModal() {
    const modal = document.getElementById('contractPreviewModal');
    modal.classList.remove('active');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

// Save and download contract
async function saveAndDownloadContract() {
    try {
        // Gather updated data from preview
        const updatedData = {
            contractTitle: document.getElementById('prev_contractTitle').textContent.trim(),
            effectiveDate: document.getElementById('prev_effectiveDate').value,
            parties: {
                serviceProvider: {
                    name: document.getElementById('prev_sp_name').textContent.trim(),
                    address: document.getElementById('prev_sp_address').textContent.trim(),
                    email: document.getElementById('prev_sp_email').textContent.trim(),
                    phone: document.getElementById('prev_sp_phone').textContent.trim()
                },
                client: {
                    name: document.getElementById('prev_client_name').textContent.trim(),
                    address: document.getElementById('prev_client_address').textContent.trim(),
                    email: document.getElementById('prev_client_email').textContent.trim(),
                    phone: document.getElementById('prev_client_phone').textContent.trim()
                }
            },
            sections: []
        };
        
        // Get all sections
        const sectionTitles = document.querySelectorAll('[data-section-index][data-field="title"]');
        const sectionContents = document.querySelectorAll('[data-section-index][data-field="content"]');
        
        sectionTitles.forEach((titleEl, index) => {
            const contentEl = sectionContents[index];
            // Convert <br> back to \n and get innerHTML to preserve formatting
            const contentText = contentEl.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '');
            
            updatedData.sections.push({
                title: titleEl.textContent.trim(),
                content: contentText.trim(),
                order: index + 1
            });
        });
        
        // Update contract via API
        const updateResponse = await fetch(`/api/contracts/${currentContractId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(updatedData)
        });
        
        if (!updateResponse.ok) {
            throw new Error('Failed to update contract');
        }
        
        console.log('Contract updated successfully');
        
        // Download PDF
        const downloadResponse = await fetch(`/api/contracts/${currentContractId}/download`, {
            method: 'GET',
            credentials: 'include'
        });
        
        if (!downloadResponse.ok) {
            throw new Error('Failed to download PDF');
        }
        
        const blob = await downloadResponse.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Contract_${updatedData.contractTitle.replace(/\s+/g, '_')}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        console.log('PDF downloaded successfully');
        
        // Close modal and redirect to dashboard
        closePreviewModal();
        setTimeout(() => {
            window.location.href = '/dashboard';
        }, 500);
        
    } catch (error) {
        console.error('Error saving/downloading contract:', error);
        alert('Failed to save or download contract. Please try again.');
    }
}

// ==================== SIGNATURE FUNCTIONALITY ====================

// Signature canvas state
const signatureState = {
    serviceProvider: {
        canvas: null,
        ctx: null,
        isDrawing: false,
        hasSignature: false
    },
    client: {
        canvas: null,
        ctx: null,
        isDrawing: false,
        hasSignature: false
    }
};

// Initialize signature canvases
function initializeSignatureCanvases() {
    ['serviceProvider', 'client'].forEach(party => {
        const canvasId = party === 'serviceProvider' ? 'signatureCanvasSP' : 'signatureCanvasClient';
        const canvas = document.getElementById(canvasId);
        
        if (!canvas) return;
        
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        signatureState[party].canvas = canvas;
        signatureState[party].ctx = ctx;
        
        // Mouse events
        canvas.addEventListener('mousedown', (e) => startDrawing(e, party));
        canvas.addEventListener('mousemove', (e) => draw(e, party));
        canvas.addEventListener('mouseup', () => stopDrawing(party));
        canvas.addEventListener('mouseleave', () => stopDrawing(party));
        
        // Touch events for mobile
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            canvas.dispatchEvent(mouseEvent);
        });
        
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            canvas.dispatchEvent(mouseEvent);
        });
        
        canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const mouseEvent = new MouseEvent('mouseup', {});
            canvas.dispatchEvent(mouseEvent);
        });
    });
}

function startDrawing(e, party) {
    signatureState[party].isDrawing = true;
    const rect = signatureState[party].canvas.getBoundingClientRect();
    signatureState[party].ctx.beginPath();
    signatureState[party].ctx.moveTo(
        e.clientX - rect.left,
        e.clientY - rect.top
    );
    
    // Hide placeholder
    const placeholderId = party === 'serviceProvider' ? 'signaturePlaceholderSP' : 'signaturePlaceholderClient';
    document.getElementById(placeholderId).classList.add('hidden');
}

function draw(e, party) {
    if (!signatureState[party].isDrawing) return;
    
    const rect = signatureState[party].canvas.getBoundingClientRect();
    signatureState[party].ctx.lineTo(
        e.clientX - rect.left,
        e.clientY - rect.top
    );
    signatureState[party].ctx.stroke();
    signatureState[party].hasSignature = true;
}

function stopDrawing(party) {
    if (signatureState[party].isDrawing) {
        signatureState[party].isDrawing = false;
        updateSignatureStatus(party);
    }
}

function clearSignature(party) {
    const state = signatureState[party];
    if (state.ctx && state.canvas) {
        state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
        state.hasSignature = false;
        
        // Show placeholder again
        const placeholderId = party === 'serviceProvider' ? 'signaturePlaceholderSP' : 'signaturePlaceholderClient';
        document.getElementById(placeholderId).classList.remove('hidden');
        
        updateSignatureStatus(party);
    }
}

function updateSignatureStatus(party) {
    const statusId = party === 'serviceProvider' ? 'signatureStatusSP' : 'signatureStatusClient';
    const statusEl = document.getElementById(statusId);
    
    if (signatureState[party].hasSignature) {
        statusEl.textContent = '✓ Signature captured';
        statusEl.className = 'signature-status signed';
    } else {
        statusEl.textContent = '⚠ Not signed';
        statusEl.className = 'signature-status unsigned';
    }
}

async function saveSignatures() {
    const signatures = {};
    
    for (const party of ['serviceProvider', 'client']) {
        if (signatureState[party].hasSignature) {
            const nameInputId = party === 'serviceProvider' ? 'signedBySP' : 'signedByClient';
            const signedBy = document.getElementById(nameInputId).value.trim();
            
            if (!signedBy) {
                alert(`Please enter the full name for ${party === 'serviceProvider' ? 'Service Provider' : 'Client'} signature.`);
                return false;
            }
            
            const signatureData = signatureState[party].canvas.toDataURL('image/png');
            
            try {
                const response = await fetch(`/api/contracts/${currentContractId}/sign`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        party,
                        signatureData,
                        signedBy
                    })
                });
                
                if (!response.ok) {
                    throw new Error(`Failed to save ${party} signature`);
                }
                
                console.log(`${party} signature saved successfully`);
            } catch (error) {
                console.error(`Error saving ${party} signature:`, error);
                alert(`Failed to save ${party} signature. Please try again.`);
                return false;
            }
        }
    }
    
    return true;
}

// Update saveAndDownloadContract to include signatures
const originalSaveAndDownload = saveAndDownloadContract;
saveAndDownloadContract = async function() {
    // Save signatures first if any exist
    const hasServiceProviderSig = signatureState.serviceProvider?.hasSignature;
    const hasClientSig = signatureState.client?.hasSignature;
    
    if (hasServiceProviderSig || hasClientSig) {
        const sigsSaved = await saveSignatures();
        if (!sigsSaved) return; // Don't proceed if signature save failed
    }
    
    // Call original function
    await originalSaveAndDownload();
};

// Initialize when preview modal opens
const originalShowPreview = showContractPreview;
showContractPreview = function(data) {
    originalShowPreview(data);
    
    // Initialize signature canvases after a short delay to ensure DOM is ready
    setTimeout(() => {
        initializeSignatureCanvases();
        updateSignatureStatus('serviceProvider');
        updateSignatureStatus('client');
    }, 100);
};

