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
                    <strong>Tip:</strong> Your business info is saved! You can just say: 
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

// Wait for DOM to be ready
let micBtn, status, loading, textInput, generateBtn, clearBtn, uploadAudioBtn, audioFileInput, transcribingLoader;

window.addEventListener('DOMContentLoaded', () => {
    // Initialize dark mode
    const darkMode = localStorage.getItem('darkMode');
    if (darkMode === 'enabled') {
        document.body.classList.add('dark-mode');
    }
    
    micBtn = document.getElementById('micBtn');
    status = document.getElementById('status');
    loading = document.getElementById('loading');
    textInput = document.getElementById('textInput');
    generateBtn = document.getElementById('generateBtn');
    clearBtn = document.getElementById('clearBtn');
    uploadAudioBtn = document.getElementById('uploadAudioBtn');
    audioFileInput = document.getElementById('audioFileInput');
    transcribingLoader = document.getElementById('transcribing');
    
    if (!micBtn) {
        console.error('Mic button not found!');
        return;
    }
    
    if (!status) {
        console.error('Status element not found!');
        return;
    }
    
    // Set up mic button click handler
    micBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Add clicked class for dark grey state
        micBtn.classList.add('clicked');
        toggleRecording();
        
        // Remove clicked class after a short delay to allow visual feedback
        setTimeout(() => {
            if (!isRecording) {
                micBtn.classList.remove('clicked');
            }
        }, 200);
    });
    
    console.log('Mic button event listener attached');
    
    // Set up recognition event handlers if recognition is available
    if (recognition) {
        setupRecognitionHandlers();
    } else {
        console.warn('Recognition not available on DOMContentLoaded, will retry...');
        // Retry after a short delay
        setTimeout(() => {
            if (recognition) {
                setupRecognitionHandlers();
                console.log('Recognition handlers set up on retry');
            } else {
                console.error('Recognition still not available after retry');
            }
        }, 100);
    }
    
    // Audio file upload handler
    if (uploadAudioBtn && audioFileInput) {
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
    status.textContent = 'Transcribing audio...';
    
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
        status.textContent = 'Audio transcribed! Review and edit if needed, then generate invoice.';
        
    } catch (error) {
        console.error('Transcription error:', error);
        status.textContent = 'Failed to transcribe audio. Please try again.';
        alert('Failed to transcribe audio file. Please try again or use voice input instead.');
    } finally {
            if (transcribingLoader) transcribingLoader.classList.add('hidden');
            if (uploadAudioBtn) uploadAudioBtn.disabled = false;
            if (audioFileInput) audioFileInput.value = ''; // Reset file input
        }
        });
    }
    
    // Check mic permissions on load
    if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'microphone' }).then((result) => {
            console.log('Microphone permission:', result.state);
            if (result.state === 'denied' && status) {
                status.textContent = 'Microphone access denied. Please enable it in browser settings.';
            }
        }).catch(() => {
            // Permissions API not supported
        });
    }
    
    // Clear button
    if (clearBtn && textInput && status) {
        clearBtn.addEventListener('click', () => {
            textInput.value = '';
            transcript = '';
            status.textContent = 'Press to speak';
        });
    }
    
    // Generate invoice from text input
    if (generateBtn && textInput && status && loading) {
        generateBtn.addEventListener('click', () => {
            // Get text from either textInput or transcript variable
            const textFromInput = textInput ? textInput.value.trim() : '';
            const textToUse = textFromInput || transcript.trim();
            
            console.log('Generate button clicked, text:', textToUse);
            
            if (textToUse) {
                status.textContent = 'Processing your invoice...';
                loading.classList.remove('hidden');
                generateBtn.disabled = true;
                
                // If business context exists and input is short, prepend business info
                let fullTranscript = textToUse;
                if (businessContext && businessContext.companyName && textToUse.length < 200 && !textToUse.toLowerCase().includes('from')) {
                    fullTranscript = `Invoice from ${businessContext.companyName}`;
                    if (businessContext.email) fullTranscript += `, email ${businessContext.email}`;
                    if (businessContext.phone) fullTranscript += `, phone ${businessContext.phone}`;
                    if (businessContext.address) fullTranscript += `, address ${businessContext.address}`;
                    fullTranscript += `. ${textToUse}`;
                    
                    if (businessContext.defaultPaymentTerms && !textToUse.toLowerCase().includes('payment')) {
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
        console.log('Generate button event listener attached');
    } else {
        console.error('Generate button or required elements not found:', {
            generateBtn: !!generateBtn,
            textInput: !!textInput,
            status: !!status,
            loading: !!loading
        });
    }
});

// Mic button click handler is now set up in DOMContentLoaded

function toggleRecording() {
    console.log('toggleRecording called, recognition:', recognition, 'isRecording:', isRecording);
    
    if (!recognition) {
        console.error('Recognition not available, attempting to reinitialize...');
        // Try to reinitialize
        if (initializeSpeechRecognition()) {
            setupRecognitionHandlers();
            if (status) status.textContent = 'Ready! Click mic again to start recording.';
            return;
        } else {
            if (status) status.textContent = 'Speech recognition not available. Please type below.';
            if (textInput) textInput.focus();
            return;
        }
    }
    
    if (!isRecording) {
        startRecording();
    } else {
        stopRecording();
    }
}

function startRecording() {
    if (!recognition) {
        if (status) status.textContent = 'Speech recognition not initialized. Please reload the page.';
        console.error('Recognition not available');
        return;
    }
    
    if (!micBtn || !status) {
        console.error('Mic button or status element not found');
        return;
    }
    
    try {
        transcript = '';
        if (textInput) textInput.value = '';
        recognition.start();
        isRecording = true;
        micBtn.classList.add('recording');
        status.textContent = 'Listening... Speak now!';
        status.classList.add('listening');
        
        // Safety timeout - if no results after 30 seconds, remind user
        recognitionTimeout = setTimeout(() => {
            if (isRecording && transcript.length === 0 && status) {
                status.textContent = 'Still listening... Make sure your microphone is on';
            }
        }, 30000);
        
        console.log('Started recording');
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
            if (micBtn) micBtn.classList.remove('recording');
            if (status) status.textContent = 'Reinitializing... Click mic again';
            
            setTimeout(() => {
                if (initializeSpeechRecognition()) {
                    setupRecognitionHandlers();
                    if (status) status.textContent = 'Press mic to speak';
                }
            }, 500);
        }
    }
}

function stopRecording() {
    if (!recognition) return;
    
    if (!micBtn || !status) {
        console.error('Mic button or status element not found');
        return;
    }
    
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
        if (textInput) {
            textInput.value = transcript;
            textInput.focus();
        }
        status.textContent = 'Review and edit above, then click "Generate Invoice"';
    } else {
        status.textContent = 'No speech detected. Try again or type below!';
        if (textInput) textInput.focus();
    }
}

// Set up recognition event handlers
function setupRecognitionHandlers() {
    if (!recognition) {
        console.error('Cannot set up handlers: recognition is null');
        return;
    }
    
    console.log('Setting up recognition handlers...');
    
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
        if (textInput) textInput.value = transcript + interimTranscript;
        
        console.log('Recognition result:', transcript, interimTranscript);
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error, event);
        
        if (!status) return;
        
        // Clear timeout
        if (recognitionTimeout) {
            clearTimeout(recognitionTimeout);
            recognitionTimeout = null;
        }
        
        isRecording = false;
        if (micBtn) micBtn.classList.remove('recording');
        status.classList.remove('listening');
        
        // Handle network errors with aggressive retry
        if (event.error === 'network') {
            networkErrorCount++;
            console.warn(`Network error ${networkErrorCount} - attempting recovery`);
            
            if (networkErrorCount <= 3) {
                status.textContent = `Network hiccup... Retrying (${networkErrorCount}/3)`;
                
                // Aggressive retry after brief delay
                setTimeout(() => {
                    console.log('Reinitializing speech recognition after network error');
                    if (initializeSpeechRecognition()) {
                        setupRecognitionHandlers();
                        status.textContent = 'Reconnected! Click mic to speak';
                        networkErrorCount = 0; // Reset counter on successful init
                    }
                }, 1000);
            } else {
                // After 3 tries, show typing option but keep voice available
                status.textContent = 'Connection unstable. Try clicking mic again or type below';
                networkErrorCount = 0; // Reset for next attempt
                if (textInput) textInput.focus();
            }
            return;
        }
        
        // Handle other errors
        if (event.error === 'no-speech') {
            status.textContent = 'No speech detected. Click mic to try again!';
        } else if (event.error === 'audio-capture') {
            status.textContent = 'Microphone not detected. Check connection and try again.';
        } else if (event.error === 'not-allowed') {
            status.textContent = 'Microphone blocked! Allow access in browser settings.';
            setTimeout(() => {
                alert('Microphone Permission Required:\n\n' +
                      '1. Click the lock icon in the address bar\n' +
                      '2. Change microphone setting to "Allow"\n' +
                      '3. Refresh the page (⌘+R or Ctrl+R)\n' +
                      '4. Try clicking the mic button again');
            }, 500);
        } else if (event.error === 'aborted') {
            status.textContent = 'Recording stopped. Click mic to start again!';
        } else {
            status.textContent = `${event.error} - Click mic to retry`;
        }
        
        setTimeout(() => {
            if (!isRecording && status) {
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
                        setupRecognitionHandlers();
                        try {
                            recognition.start();
                        } catch (e) {
                            console.error('Failed to restart even after reinit:', e);
                            isRecording = false;
                            if (micBtn) micBtn.classList.remove('recording');
                            if (status) {
                                status.classList.remove('listening');
                                status.textContent = 'Click mic to start again';
                            }
                        }
                    }
                }
            }, 100);
        } else {
            // Recording was intentionally stopped
            if (micBtn) micBtn.classList.remove('recording');
            if (status) status.classList.remove('listening');
        }
    };
    
    console.log('Recognition event handlers set up');
}

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

        // Generate returns JSON with invoiceId and invoiceData
        const result = await response.json();
        console.log('[App] Invoice generated:', result);
        
        // Show preview modal with the invoice data
        showPreviewModal(result.invoiceId, result.invoiceData);
        
        status.textContent = 'Review your invoice below';
        loading.classList.add('hidden');
        generateBtn.disabled = false;

    } catch (error) {
        console.error('Error generating invoice:', error);
        status.textContent = 'Error generating invoice. Please try again.';
        loading.classList.add('hidden');
        generateBtn.disabled = false;
    }
}

// Global variable to store current invoice ID
let currentInvoiceId = null;

function showPreviewModal(invoiceId, invoiceData) {
    currentInvoiceId = invoiceId;
    
    // Populate preview fields
    document.getElementById('prev_invoiceNumber').textContent = invoiceData.invoiceNumber || '';
    document.getElementById('prev_date').value = invoiceData.date || '';
    document.getElementById('prev_dueDate').value = invoiceData.dueDate || '';
    
    // From fields
    document.getElementById('prev_from_name').textContent = invoiceData.from?.name || '';
    document.getElementById('prev_from_address').textContent = invoiceData.from?.address || '';
    document.getElementById('prev_from_phone').textContent = invoiceData.from?.phone || '';
    document.getElementById('prev_from_email').textContent = invoiceData.from?.email || '';
    
    // To fields
    document.getElementById('prev_to_name').textContent = invoiceData.to?.name || '';
    document.getElementById('prev_to_address').textContent = invoiceData.to?.address || '';
    document.getElementById('prev_to_phone').textContent = invoiceData.to?.phone || '';
    document.getElementById('prev_to_email').textContent = invoiceData.to?.email || '';
    
    // Items
    const tbody = document.getElementById('prev_items_tbody');
    tbody.innerHTML = '';
    if (invoiceData.items && invoiceData.items.length > 0) {
        invoiceData.items.forEach((item, index) => {
            addItemRow(item.description, item.quantity, item.rate, item.amount);
        });
    }
    
    // Totals
    document.getElementById('prev_subtotal_display').textContent = `$${(invoiceData.subtotal || 0).toFixed(2)}`;
    document.getElementById('prev_tax').textContent = `$${(invoiceData.tax || 0).toFixed(2)}`;
    document.getElementById('prev_total_display').textContent = `$${(invoiceData.total || 0).toFixed(2)}`;
    
    // Notes
    document.getElementById('prev_notes').textContent = invoiceData.notes || '';
    
    // Show modal
    document.getElementById('invoicePreviewModal').classList.remove('hidden');
    
    // Add event listeners for real-time calculations
    addCalculationListeners();
}

function addItemRow(description = '', quantity = 1, rate = 0, amount = 0) {
    const tbody = document.getElementById('prev_items_tbody');
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><div contenteditable="true" class="preview-item-desc" data-placeholder="Service description">${description}</div></td>
        <td><div contenteditable="true" class="preview-item-qty" data-type="number">${quantity}</div></td>
        <td><div contenteditable="true" class="preview-item-rate" data-type="currency">$${rate.toFixed(2)}</div></td>
        <td><div class="preview-item-amount">$${amount.toFixed(2)}</div></td>
        <td><button class="preview-btn-remove-item" onclick="removeItemRow(this)">×</button></td>
    `;
    tbody.appendChild(row);
}

function addPreviewItem() {
    addItemRow('', 1, 0, 0);
    addCalculationListeners();
}

function removeItemRow(button) {
    button.closest('tr').remove();
    recalculateTotals();
}

function addCalculationListeners() {
    // Listen to quantity and rate changes
    document.querySelectorAll('.preview-item-qty, .preview-item-rate').forEach(field => {
        field.addEventListener('input', function() {
            const row = this.closest('tr');
            const qtyField = row.querySelector('.preview-item-qty');
            const rateField = row.querySelector('.preview-item-rate');
            const amountField = row.querySelector('.preview-item-amount');
            
            const qty = parseFloat(qtyField.textContent.trim()) || 0;
            const rate = parseFloat(rateField.textContent.replace('$', '').trim()) || 0;
            const amount = qty * rate;
            
            amountField.textContent = `$${amount.toFixed(2)}`;
            
            recalculateTotals();
        });
    });
    
    // Listen to tax changes
    document.getElementById('prev_tax').addEventListener('input', recalculateTotals);
}

function recalculateTotals() {
    let subtotal = 0;
    
    // Sum all amounts
    document.querySelectorAll('.preview-item-amount').forEach(field => {
        const amount = parseFloat(field.textContent.replace('$', '').trim()) || 0;
        subtotal += amount;
    });
    
    const taxText = document.getElementById('prev_tax').textContent.replace('$', '').trim();
    const tax = parseFloat(taxText) || 0;
    const total = subtotal + tax;
    
    document.getElementById('prev_subtotal_display').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('prev_total_display').textContent = `$${total.toFixed(2)}`;
}

function closePreviewModal() {
    document.getElementById('invoicePreviewModal').classList.add('hidden');
    currentInvoiceId = null;
    
    // Reset form
    transcript = '';
    textInput.value = '';
    status.textContent = 'Press to speak';
}

async function saveAndDownloadInvoice() {
    if (!currentInvoiceId) return;
    
    try {
        // Collect all data from preview
        const items = [];
        document.querySelectorAll('#prev_items_tbody tr').forEach(row => {
            const desc = row.querySelector('.preview-item-desc').textContent.trim();
            const qty = parseFloat(row.querySelector('.preview-item-qty').textContent.trim()) || 1;
            const rate = parseFloat(row.querySelector('.preview-item-rate').textContent.replace('$', '').trim()) || 0;
            const amount = parseFloat(row.querySelector('.preview-item-amount').textContent.replace('$', '').trim()) || 0;
            
            items.push({
                description: desc,
                quantity: qty,
                rate: rate,
                amount: amount
            });
        });
        
        const invoiceData = {
            invoiceNumber: document.getElementById('prev_invoiceNumber').textContent.trim(),
            date: document.getElementById('prev_date').value,
            dueDate: document.getElementById('prev_dueDate').value,
            from: {
                name: document.getElementById('prev_from_name').textContent.trim(),
                address: document.getElementById('prev_from_address').textContent.trim(),
                phone: document.getElementById('prev_from_phone').textContent.trim(),
                email: document.getElementById('prev_from_email').textContent.trim()
            },
            to: {
                name: document.getElementById('prev_to_name').textContent.trim(),
                address: document.getElementById('prev_to_address').textContent.trim(),
                phone: document.getElementById('prev_to_phone').textContent.trim(),
                email: document.getElementById('prev_to_email').textContent.trim()
            },
            items: items,
            subtotal: parseFloat(document.getElementById('prev_subtotal_display').textContent.replace('$', '').trim()) || 0,
            tax: parseFloat(document.getElementById('prev_tax').textContent.replace('$', '').trim()) || 0,
            total: parseFloat(document.getElementById('prev_total_display').textContent.replace('$', '').trim()) || 0,
            notes: document.getElementById('prev_notes').textContent.trim()
        };
        
        // Update invoice in database
        const updateResponse = await fetch(`/api/invoices/${currentInvoiceId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(invoiceData)
        });
        
        if (!updateResponse.ok) {
            throw new Error('Failed to save invoice changes');
        }
        
        // Now download the PDF
        const pdfResponse = await fetch(`/api/invoices/${currentInvoiceId}/download`, {
            credentials: 'include'
        });
        
        if (!pdfResponse.ok) {
            throw new Error('Failed to download PDF');
        }
        
        const blob = await pdfResponse.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${invoiceData.invoiceNumber || 'invoice'}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        // Close modal and reset
        closePreviewModal();
        
        // Show success message
        status.textContent = 'Invoice saved and downloaded!';
        setTimeout(() => {
            status.textContent = 'Press to speak';
        }, 3000);
        
    } catch (error) {
        console.error('Error saving invoice:', error);
        alert('Failed to save invoice. Please try again.');
    }
}

// Initialize
loadBusinessContext();

