// Check auth and load user
async function checkAuth() {
    try {
        const response = await fetch('/auth/user', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            window.location.href = '/';
            return;
        }
        
        const data = await response.json();
        document.getElementById('userName').textContent = data.user.name;
        document.getElementById('userAvatar').src = data.user.picture;
        
        loadInvoices();
    } catch (error) {
        console.error('Error checking auth:', error);
        window.location.href = '/';
    }
}

// Load invoices
async function loadInvoices() {
    try {
        const response = await fetch('/api/invoices', {
            credentials: 'include'
        });
        
        const invoices = await response.json();
        const invoicesList = document.getElementById('invoicesList');
        const invoiceCount = document.getElementById('invoiceCount');
        
        invoiceCount.textContent = invoices.length;
        
        if (invoices.length === 0) {
            invoicesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📄</div>
                    <h3>No invoices yet</h3>
                    <p>Create your first invoice to get started!</p>
                    <a href="/create" class="create-btn">+ Create Invoice</a>
                </div>
            `;
            return;
        }
        
        invoicesList.innerHTML = invoices.map(invoice => `
            <div class="invoice-card">
                <div class="invoice-info">
                    <h3>${invoice.invoiceNumber}</h3>
                    <p><strong>Service:</strong> ${invoice.serviceName || 'N/A'}</p>
                    <p><strong>To:</strong> ${invoice.to?.name || 'N/A'} ${invoice.to?.company ? '(' + invoice.to.company + ')' : ''}</p>
                    <p><strong>Amount:</strong> $${invoice.total?.toFixed(2) || '0.00'}</p>
                    <p><strong>Date:</strong> ${new Date(invoice.date).toLocaleDateString()}</p>
                    <p><strong>Due:</strong> ${new Date(invoice.dueDate).toLocaleDateString()}</p>
                </div>
                <div class="invoice-actions">
                    <button class="btn-action btn-download" onclick="downloadInvoice('${invoice._id}', '${invoice.invoiceNumber}')">
                        📥 Download
                    </button>
                    <button class="btn-action btn-edit" onclick="editInvoice('${invoice._id}')">
                        ✏️ Edit
                    </button>
                    <button class="btn-action btn-drive" onclick="saveToGoogleDrive('${invoice._id}', '${invoice.invoiceNumber}')">
                        💾 Save to Drive
                    </button>
                    <button class="btn-action btn-delete" onclick="deleteInvoice('${invoice._id}')">
                        🗑️ Delete
                    </button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading invoices:', error);
    }
}

function getCurrencySymbol(currency) {
    const symbols = {
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'CAD': 'CA$',
        'AUD': 'A$'
    };
    return symbols[currency] || currency;
}

// Download invoice
async function downloadInvoice(id, invoiceNumber) {
    try {
        console.log('[Dashboard] Downloading invoice:', id);
        const response = await fetch(`/api/invoices/${id}/download`, {
            credentials: 'include'
        });
        
        console.log('[Dashboard] Download response status:', response.status);
        const contentType = response.headers.get('content-type');
        console.log('[Dashboard] Content-Type:', contentType);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Dashboard] Download error response:', errorText);
            throw new Error('Failed to download invoice: ' + errorText);
        }
        
        // Check if we actually got a PDF
        if (!contentType || !contentType.includes('application/pdf')) {
            const text = await response.text();
            console.error('[Dashboard] Expected PDF but got:', contentType, text);
            throw new Error('Server did not return a PDF. Got: ' + text);
        }
        
        const blob = await response.blob();
        console.log('[Dashboard] Blob created, size:', blob.size, 'type:', blob.type);
        
        if (blob.size === 0) {
            throw new Error('Downloaded PDF is empty');
        }
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${invoiceNumber}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        console.log('[Dashboard] Download completed');
    } catch (error) {
        console.error('Error downloading invoice:', error);
        alert('Failed to download invoice: ' + error.message);
    }
}

// Edit invoice
let currentEditId = null;

async function editInvoice(id) {
    try {
        const response = await fetch(`/api/invoices/${id}`, {
            credentials: 'include'
        });
        
        const invoice = await response.json();
        currentEditId = id;
        
        document.getElementById('editTranscript').value = invoice.transcript || '';
        document.getElementById('editModal').classList.remove('hidden');
    } catch (error) {
        console.error('Error loading invoice for edit:', error);
        alert('Failed to load invoice. Please try again.');
    }
}

function closeEditModal() {
    document.getElementById('editModal').classList.add('hidden');
    currentEditId = null;
}

async function saveAndRegenerate() {
    if (!currentEditId) return;
    
    const newTranscript = document.getElementById('editTranscript').value.trim();
    
    if (!newTranscript) {
        alert('Please enter invoice details');
        return;
    }
    
    try {
        const response = await fetch(`/api/invoices/${currentEditId}/regenerate`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ transcript: newTranscript })
        });
        
        if (!response.ok) {
            throw new Error('Failed to regenerate invoice');
        }
        
        // Regenerate returns JSON, not PDF
        const updatedInvoice = await response.json();
        console.log('[Dashboard] Invoice regenerated:', updatedInvoice);
        
        closeEditModal();
        loadInvoices(); // Reload the list
        
        alert('Invoice regenerated successfully!');
    } catch (error) {
        console.error('Error regenerating invoice:', error);
        alert('Failed to regenerate invoice. Please try again.');
    }
}

// Save to Google Drive
async function saveToGoogleDrive(id, invoiceNumber) {
    try {
        // First, get the PDF blob
        const response = await fetch(`/api/invoices/${id}/download`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to get invoice');
        }
        
        const blob = await response.blob();
        
        // Check if Google Drive API is available
        if (!window.gapi) {
            alert('Loading Google Drive... Please try again in a moment.');
            loadGoogleDriveAPI();
            return;
        }
        
        // Upload to Google Drive
        const metadata = {
            name: `${invoiceNumber}.pdf`,
            mimeType: 'application/pdf'
        };
        
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob);
        
        const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${await getGoogleAccessToken()}`
            },
            body: form
        });
        
        if (uploadResponse.ok) {
            alert('✅ Invoice saved to Google Drive successfully!');
        } else {
            throw new Error('Upload failed');
        }
    } catch (error) {
        console.error('Error saving to Google Drive:', error);
        alert('Failed to save to Google Drive. Please make sure you\'ve granted the necessary permissions.');
    }
}

// Google Drive API helpers
function loadGoogleDriveAPI() {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
        gapi.load('client:auth2', () => {
            console.log('Google Drive API loaded');
        });
    };
    document.body.appendChild(script);
}

async function getGoogleAccessToken() {
    // This would need proper OAuth implementation
    // For now, we'll use the session token from Google OAuth
    return new Promise((resolve, reject) => {
        if (gapi.auth2) {
            const authInstance = gapi.auth2.getAuthInstance();
            if (authInstance && authInstance.isSignedIn.get()) {
                const user = authInstance.currentUser.get();
                const token = user.getAuthResponse().access_token;
                resolve(token);
            } else {
                reject(new Error('Not signed in to Google'));
            }
        } else {
            reject(new Error('Google API not loaded'));
        }
    });
}

// Delete invoice
async function deleteInvoice(id) {
    if (!confirm('Are you sure you want to delete this invoice?')) return;
    
    try {
        await fetch(`/api/invoices/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        loadInvoices();
    } catch (error) {
        console.error('Error deleting invoice:', error);
        alert('Failed to delete invoice');
    }
}

// Logout
function logout() {
    window.location.href = '/auth/logout';
}

// Initialize
checkAuth();
