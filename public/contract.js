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
            sectionDiv.innerHTML = `
                <div class="preview-section-number">${index + 1}.</div>
                <div class="preview-section-content">
                    <div class="preview-section-title" contenteditable="true" data-section-index="${index}" data-field="title">${section.title}</div>
                    <div class="preview-section-text" contenteditable="true" data-section-index="${index}" data-field="content">${section.content}</div>
                </div>
            `;
            sectionsContainer.appendChild(sectionDiv);
        });
    }
    
    modal.classList.remove('hidden');
    modal.classList.add('active');
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
            updatedData.sections.push({
                title: titleEl.textContent.trim(),
                content: contentEl.textContent.trim(),
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
