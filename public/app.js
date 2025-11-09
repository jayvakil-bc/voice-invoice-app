let recognition;
let isRecording = false;
let transcript = '';
let businessContext = null;
let networkErrorCount = 0;
let recognitionTimeout = null;

// Load business context on page load
async function loadBusinessContext() {
    try {
        const response = await fetch('/api/business-context', {
            credentials: 'include'
        });
        businessContext = await response.json();
        
        // Update placeholder with business context hint
        if (businessContext.companyName) {
            const hint = document.createElement('div');
            hint.className = 'business-hint';
            hint.innerHTML = `
                <p style="background: #e7f3ff; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; border-left: 4px solid #667eea;">
                    💡 <strong>Tip:</strong> Your business info is saved! You can just say: 
                    "Invoice to [client name] at [client company] for [service/product], [amount], due in [days]"
                    <br><br>
                    <strong>Your business:</strong> ${businessContext.companyName}
                    ${businessContext.email ? ' • ' + businessContext.email : ''}
                </p>
            `;
            textInput.parentElement.insertBefore(hint, textInput);
        }
    } catch (error) {
        console.error('Error loading business context:', error);
    }
}

// Initialize speech recognition with aggressive retry logic
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

// Generate invoice from text input
generateBtn.addEventListener('click', () => {
    const text = textInput.value.trim();
    if (text) {
        status.textContent = '⏳ Processing your invoice...';
        loading.classList.remove('hidden');
        generateBtn.disabled = true;
        
        // If business context exists and input is short, prepend business info
        let fullTranscript = text;
        if (businessContext && businessContext.companyName && text.length < 200 && !text.toLowerCase().includes('from')) {
            fullTranscript = `Invoice from ${businessContext.companyName}`;
            if (businessContext.email) fullTranscript += `, email ${businessContext.email}`;
            if (businessContext.phone) fullTranscript += `, phone ${businessContext.phone}`;
            if (businessContext.address) fullTranscript += `, address ${businessContext.address}`;
            fullTranscript += `. ${text}`;
            
            if (businessContext.defaultPaymentTerms && !text.toLowerCase().includes('payment')) {
                fullTranscript += `. ${businessContext.defaultPaymentTerms}`;
            }
        }
        
        generateInvoice(fullTranscript);
    } else {
        status.textContent = 'Please enter invoice details first!';
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
        
        // Safety timeout - if no results after 30 seconds, remind user
        recognitionTimeout = setTimeout(() => {
            if (isRecording && transcript.length === 0) {
                status.textContent = '🎙️ Still listening... Make sure your microphone is on';
            }
        }, 30000);
        
    } catch (error) {
        console.error('Error starting recognition:', error);
        
        // If already started, stop and restart
        if (error.message && error.message.includes('already started')) {
            recognition.stop();
            setTimeout(() => {
                startRecording();
            }, 200);
        } else {
            // Try to reinitialize
            isRecording = false;
            micBtn.classList.remove('recording');
            status.textContent = '🔄 Reinitializing... Click mic again';
            
            setTimeout(() => {
                if (initializeSpeechRecognition()) {
                    status.textContent = 'Press mic to speak';
                }
            }, 500);
        }
    }
}

function stopRecording() {
    if (recognitionTimeout) {
        clearTimeout(recognitionTimeout);
        recognitionTimeout = null;
    }
    
    recognition.stop();
    isRecording = false;
    micBtn.classList.remove('recording');
    status.classList.remove('listening');
    
    if (transcript.trim()) {
        // Fill the text input with the transcript so user can edit
        textInput.value = transcript;
        status.textContent = '✏️ Review and edit above, then click "Generate Invoice"';
        // Scroll to text input
        textInput.focus();
    } else {
        status.textContent = 'No speech detected. Try again or type below!';
        textInput.focus();
    }
}

recognition.onresult = (event) => {
    let interimTranscript = '';
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPiece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
            transcript += transcriptPiece + ' ';
        } else {
            interimTranscript += transcriptPiece;
        }
    }
    
    // Update text input in real-time
    textInput.value = transcript + interimTranscript;
};

recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error, event);
    
    // Clear timeout
    if (recognitionTimeout) {
        clearTimeout(recognitionTimeout);
        recognitionTimeout = null;
    }
    
    isRecording = false;
    micBtn.classList.remove('recording');
    status.classList.remove('listening');
    
    // Handle network errors with aggressive retry
    if (event.error === 'network') {
        networkErrorCount++;
        console.warn(`Network error ${networkErrorCount} - attempting recovery`);
        
        if (networkErrorCount <= 3) {
            status.textContent = `🔄 Network hiccup... Retrying (${networkErrorCount}/3)`;
            
            // Aggressive retry after brief delay
            setTimeout(() => {
                console.log('Reinitializing speech recognition after network error');
                if (initializeSpeechRecognition()) {
                    status.textContent = '✅ Reconnected! Click mic to speak';
                    networkErrorCount = 0; // Reset counter on successful init
                }
            }, 1000);
        } else {
            // After 3 tries, show typing option but keep voice available
            status.textContent = '🌐 Connection unstable. Try clicking mic again or type below';
            networkErrorCount = 0; // Reset for next attempt
            textInput.focus();
        }
        return;
    }
    
    // Handle other errors
    if (event.error === 'no-speech') {
        status.textContent = 'No speech detected. Click mic to try again!';
    } else if (event.error === 'audio-capture') {
        status.textContent = '🎤 Microphone not detected. Check connection and try again.';
    } else if (event.error === 'not-allowed') {
        status.textContent = '🚫 Microphone blocked! Allow access in browser settings.';
        setTimeout(() => {
            alert('Microphone Permission Required:\n\n' +
                  '1. Click the 🔒 lock icon in the address bar\n' +
                  '2. Change microphone setting to "Allow"\n' +
                  '3. Refresh the page (⌘+R or Ctrl+R)\n' +
                  '4. Try clicking the mic button again');
        }, 500);
    } else if (event.error === 'aborted') {
        status.textContent = 'Recording stopped. Click mic to start again!';
    } else {
        status.textContent = `⚠️ ${event.error} - Click mic to retry`;
    }
    
    setTimeout(() => {
        if (!isRecording) {
            status.textContent = 'Press to speak (or type below)';
        }
    }, 4000);
};

recognition.onend = () => {
    console.log('Recognition ended, isRecording:', isRecording);
    
    // Clear timeout
    if (recognitionTimeout) {
        clearTimeout(recognitionTimeout);
        recognitionTimeout = null;
    }
    
    if (isRecording) {
        // Automatically restart if still in recording mode
        console.log('Auto-restarting recognition...');
        setTimeout(() => {
            try {
                recognition.start();
            } catch (error) {
                console.error('Error restarting recognition:', error);
                // Try to reinitialize
                if (initializeSpeechRecognition()) {
                    try {
                        recognition.start();
                    } catch (e) {
                        console.error('Failed to restart even after reinit:', e);
                        isRecording = false;
                        micBtn.classList.remove('recording');
                        status.classList.remove('listening');
                        status.textContent = 'Click mic to start again';
                    }
                }
            }
        }, 100);
    } else {
        // Recording was intentionally stopped
        micBtn.classList.remove('recording');
        status.classList.remove('listening');
    }
};

async function generateInvoice(text) {
    try {
        const response = await fetch('/api/generate-invoice', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // Important: send cookies with request
            body: JSON.stringify({ transcript: text })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        // Generate returns JSON with invoiceId, not a PDF
        const result = await response.json();
        console.log('[App] Invoice generated:', result);
        
        // Now download the PDF
        const pdfResponse = await fetch(`/api/invoices/${result.invoiceId}/download`, {
            credentials: 'include'
        });
        
        if (!pdfResponse.ok) {
            throw new Error('Failed to download PDF');
        }
        
        const blob = await pdfResponse.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${result.invoiceData.invoiceNumber || 'invoice'}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        status.textContent = '✅ Invoice generated successfully!';
        loading.classList.add('hidden');
        generateBtn.disabled = false;
        
        // Reset after 3 seconds
        setTimeout(() => {
            status.textContent = 'Press to speak';
            transcript = '';
            textInput.value = '';
        }, 3000);

    } catch (error) {
        console.error('Error generating invoice:', error);
        status.textContent = '❌ Error generating invoice. Please try again.';
        loading.classList.add('hidden');
        generateBtn.disabled = false;
    }
}

// Initialize
loadBusinessContext();
