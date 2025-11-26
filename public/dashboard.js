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
        // Set user name in menu
        const menuUserName = document.getElementById('menuUserName');
        if (menuUserName) {
            menuUserName.textContent = data.user.name;
        }
        
        loadInvoices();
        loadContracts();
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
                    <div class="empty-state-icon"></div>
                    <h3>No invoices yet</h3>
                    <p>Create your first invoice to get started!</p>
                    <a href="/create" class="create-btn">New Invoice</a>
                </div>
            `;
            return;
        }
        
        invoicesList.innerHTML = invoices.map(invoice => {
            const clientName = invoice.to?.name || 'N/A';
            const truncatedClientName = clientName.length > 12 ? clientName.substring(0, 12) + '...' : clientName;
            
            return `
            <div class="invoice-card" data-invoice-id="${invoice._id}" onclick="showSidePreview('invoice', '${invoice._id}', '${invoice.invoiceNumber}')" style="cursor: pointer;">
                <div class="invoice-card-header">
                    <h3 class="invoice-card-title">${truncatedClientName}</h3>
                </div>
                <div class="invoice-card-info">
                    <div class="invoice-card-info-item">
                        <span class="invoice-card-info-label">Number</span>
                        <span class="invoice-card-info-value">${invoice.invoiceNumber}</span>
                    </div>
                    <div class="invoice-card-info-item">
                        <span class="invoice-card-info-label">Service</span>
                        <span class="invoice-card-info-value">${invoice.serviceName || 'N/A'}</span>
                    </div>
                </div>
                <div class="invoice-card-divider"></div>
                <div class="invoice-card-amount-section">
                    <div class="invoice-card-amount">$${invoice.total?.toFixed(2) || '0.00'}</div>
                    <div class="invoice-card-date">Due: ${new Date(invoice.dueDate).toLocaleDateString()}</div>
                </div>
                <div class="invoice-card-divider"></div>
                <div class="invoice-card-footer" onclick="event.stopPropagation()">
                    <button class="card-icon-btn" onclick="event.stopPropagation(); downloadInvoice('${invoice._id}', '${invoice.invoiceNumber}')" title="Download">↓</button>
                    <div class="card-menu">
                        <button class="card-icon-btn" onclick="event.stopPropagation(); toggleCardMenu(this)" title="More options">⋯</button>
                        <div class="card-menu-dropdown">
                            <button class="card-menu-item" onclick="event.stopPropagation(); showSidePreview('invoice', '${invoice._id}', '${invoice.invoiceNumber}')">Preview</button>
                            <button class="card-menu-item" onclick="event.stopPropagation(); editInvoice('${invoice._id}')">Edit</button>
                            <button class="card-menu-item" onclick="event.stopPropagation(); saveToGoogleDrive('${invoice._id}', '${invoice.invoiceNumber}')">Save to Drive</button>
                            <button class="card-menu-item" onclick="event.stopPropagation(); deleteInvoice('${invoice._id}')" style="color: #ef4444;">Delete</button>
                        </div>
                    </div>
                </div>
            </div>
            `;
        }).join('');
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
        const response = await fetch(`/api/invoices/${id}/pdf`, {
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
        const response = await fetch(`/api/invoices/${id}/pdf`, {
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
            alert('Invoice saved to Google Drive successfully!');
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

// Preview Invoice Modal
let currentPreviewId = null;
let currentPreviewInvoiceNumber = null;

async function previewInvoice(id, invoiceNumber) {
    try {
        const response = await fetch(`/api/invoices/${id}`, {
            credentials: 'include'
        });
        
        const invoice = await response.json();
        currentPreviewId = id;
        currentPreviewInvoiceNumber = invoiceNumber;
        
        // Populate preview fields
        document.getElementById('preview_invoiceNumber').value = invoice.invoiceNumber || '';
        document.getElementById('preview_date').value = invoice.date || '';
        document.getElementById('preview_dueDate').value = invoice.dueDate || '';
        
        // From fields
        document.getElementById('preview_from_name').value = invoice.from?.name || '';
        document.getElementById('preview_from_address').value = invoice.from?.address || '';
        document.getElementById('preview_from_phone').value = invoice.from?.phone || '';
        document.getElementById('preview_from_email').value = invoice.from?.email || '';
        
        // To fields
        document.getElementById('preview_to_name').value = invoice.to?.name || '';
        document.getElementById('preview_to_address').value = invoice.to?.address || '';
        document.getElementById('preview_to_phone').value = invoice.to?.phone || '';
        document.getElementById('preview_to_email').value = invoice.to?.email || '';
        
        // Items
        const itemsList = document.getElementById('preview_items_list');
        itemsList.innerHTML = '';
        if (invoice.items && invoice.items.length > 0) {
            invoice.items.forEach((item, index) => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'preview-item';
                itemDiv.innerHTML = `
                    <input type="text" value="${item.description || ''}" placeholder="Description" data-item="${index}" data-field="description">
                    <input type="number" value="${item.quantity || 1}" placeholder="Qty" data-item="${index}" data-field="quantity" min="1" step="1">
                    <input type="number" value="${item.rate || 0}" placeholder="Rate" data-item="${index}" data-field="rate" min="0" step="0.01">
                    <input type="number" value="${item.amount || 0}" placeholder="Amount" data-item="${index}" data-field="amount" min="0" step="0.01" readonly style="background: #f5f5f5;">
                    <button class="btn-remove-item" onclick="removePreviewItem(${index})">×</button>
                `;
                itemsList.appendChild(itemDiv);
            });
        }
        
        // Totals
        document.getElementById('preview_subtotal').value = invoice.subtotal || 0;
        document.getElementById('preview_tax').value = invoice.tax || 0;
        document.getElementById('preview_total').value = invoice.total || 0;
        
        // Notes
        document.getElementById('preview_notes').value = invoice.notes || '';
        
        // Add event listeners for real-time calculations
        addPreviewCalculationListeners();
        
        // Show modal
        document.getElementById('previewModal').classList.remove('hidden');
    } catch (error) {
        console.error('Error loading invoice for preview:', error);
        alert('Failed to load invoice. Please try again.');
    }
}

function addPreviewCalculationListeners() {
    // Listen to quantity and rate changes to update amounts
    document.querySelectorAll('[data-field="quantity"], [data-field="rate"]').forEach(input => {
        input.addEventListener('input', function() {
            const itemIndex = this.dataset.item;
            const qtyInput = document.querySelector(`[data-item="${itemIndex}"][data-field="quantity"]`);
            const rateInput = document.querySelector(`[data-item="${itemIndex}"][data-field="rate"]`);
            const amountInput = document.querySelector(`[data-item="${itemIndex}"][data-field="amount"]`);
            
            const qty = parseFloat(qtyInput.value) || 0;
            const rate = parseFloat(rateInput.value) || 0;
            const amount = qty * rate;
            
            amountInput.value = amount.toFixed(2);
            
            // Recalculate totals
            recalculatePreviewTotals();
        });
    });
    
    // Listen to tax changes
    document.getElementById('preview_tax').addEventListener('input', recalculatePreviewTotals);
}

function recalculatePreviewTotals() {
    let subtotal = 0;
    
    // Sum all amounts
    document.querySelectorAll('[data-field="amount"]').forEach(input => {
        subtotal += parseFloat(input.value) || 0;
    });
    
    const tax = parseFloat(document.getElementById('preview_tax').value) || 0;
    const total = subtotal + tax;
    
    document.getElementById('preview_subtotal').value = subtotal.toFixed(2);
    document.getElementById('preview_total').value = total.toFixed(2);
}

function removePreviewItem(index) {
    const itemDiv = document.querySelector(`[data-item="${index}"]`).closest('.preview-item');
    itemDiv.remove();
    recalculatePreviewTotals();
}

function closePreviewModal() {
    document.getElementById('previewModal').classList.add('hidden');
    currentPreviewId = null;
    currentPreviewInvoiceNumber = null;
}

// Show side preview panel
async function showSidePreview(type, id, title) {
    try {
        const isInvoice = type === 'invoice';
        const previewPanel = isInvoice 
            ? document.getElementById('sidePreviewPanel')
            : document.getElementById('sidePreviewPanelContracts');
        const previewContent = isInvoice
            ? document.getElementById('sidePreviewContent')
            : document.getElementById('sidePreviewContentContracts');
        const gridContainer = isInvoice
            ? document.querySelector('#invoicesTab .dashboard-grid-container')
            : document.querySelector('#contractsTab .dashboard-grid-container');
        const cardsList = isInvoice
            ? document.getElementById('invoicesList')
            : document.getElementById('contractsList');
        
        if (!previewPanel || !previewContent || !gridContainer || !cardsList) return;
        
        // Hide all cards and mark the selected one
        const allCards = cardsList.querySelectorAll('.invoice-card');
        allCards.forEach(card => {
            card.classList.remove('preview-selected');
        });
        
        // Find and mark the clicked card
        const clickedCard = Array.from(allCards).find(card => {
            const cardId = card.getAttribute('data-invoice-id') || card.getAttribute('data-contract-id');
            return cardId === id;
        });
        
        if (clickedCard) {
            clickedCard.classList.add('preview-selected');
        }
        
        // Show loading state
        previewContent.innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--dark-grey);">Loading...</div>';
        previewPanel.classList.remove('hidden');
        gridContainer.classList.add('preview-active');
        
        if (isInvoice) {
            // Load invoice data
            const response = await fetch(`/api/invoices/${id}`, {
                credentials: 'include'
            });
            
            if (!response.ok) throw new Error('Failed to load invoice');
            
            const invoice = await response.json();
            
            // Render invoice preview
            previewContent.innerHTML = `
                <div class="preview-section">
                    <div class="preview-header">
                        <div>
                            <label>Invoice Number:</label>
                            <input type="text" class="preview-input" value="${invoice.invoiceNumber || ''}" readonly>
                        </div>
                        <div>
                            <label>Date:</label>
                            <input type="text" class="preview-input" value="${invoice.date || ''}" readonly>
                        </div>
                        <div>
                            <label>Due Date:</label>
                            <input type="text" class="preview-input" value="${invoice.dueDate || ''}" readonly>
                        </div>
                    </div>
                    
                    <div class="preview-parties">
                        <div class="preview-party">
                            <h3>From:</h3>
                            <input type="text" class="preview-input" value="${invoice.from?.name || ''}" readonly>
                            <textarea class="preview-input" rows="2" readonly>${invoice.from?.address || ''}</textarea>
                            <input type="text" class="preview-input" value="${invoice.from?.phone || ''}" readonly>
                            <input type="text" class="preview-input" value="${invoice.from?.email || ''}" readonly>
                        </div>
                        <div class="preview-party">
                            <h3>Bill To:</h3>
                            <input type="text" class="preview-input" value="${invoice.to?.name || ''}" readonly>
                            <textarea class="preview-input" rows="2" readonly>${invoice.to?.address || ''}</textarea>
                            <input type="text" class="preview-input" value="${invoice.to?.phone || ''}" readonly>
                            <input type="text" class="preview-input" value="${invoice.to?.email || ''}" readonly>
                        </div>
                    </div>
                    
                    <div class="preview-items">
                        <h3>Items:</h3>
                        ${invoice.items && invoice.items.length > 0 ? invoice.items.map(item => `
                            <div class="preview-item">
                                <input type="text" class="preview-input" value="${item.description || ''}" readonly>
                                <input type="text" class="preview-input" value="Qty: ${item.quantity || 1}" readonly>
                                <input type="text" class="preview-input" value="Rate: $${(item.rate || 0).toFixed(2)}" readonly>
                                <input type="text" class="preview-input" value="$${(item.amount || 0).toFixed(2)}" readonly>
                            </div>
                        `).join('') : '<div style="color: var(--dark-grey); opacity: 0.6;">No items</div>'}
                    </div>
                    
                    <div class="preview-totals">
                        <div class="total-row">
                            <span>Subtotal:</span>
                            <input type="text" class="preview-input" value="$${(invoice.subtotal || 0).toFixed(2)}" readonly style="width: auto; text-align: right;">
                        </div>
                        <div class="total-row">
                            <span>Tax:</span>
                            <input type="text" class="preview-input" value="$${(invoice.tax || 0).toFixed(2)}" readonly style="width: auto; text-align: right;">
                        </div>
                        <div class="total-row total-final">
                            <span>Total:</span>
                            <input type="text" class="preview-input" value="$${(invoice.total || 0).toFixed(2)}" readonly style="width: auto; text-align: right; font-weight: 400; color: var(--text-color);">
                        </div>
                    </div>
                    
                    ${invoice.notes ? `
                        <div class="preview-notes">
                            <label>Notes:</label>
                            <textarea class="preview-input" rows="3" readonly>${invoice.notes}</textarea>
                        </div>
                    ` : ''}
                </div>
            `;
        } else {
            // Load contract data
            const response = await fetch(`/api/contracts/${id}`, {
                credentials: 'include'
            });
            
            if (!response.ok) throw new Error('Failed to load contract');
            
            const contract = await response.json();
            
            // Render contract preview
            previewContent.innerHTML = `
                <div class="preview-section">
                    <div class="preview-header">
                        <div>
                            <label>Contract Title:</label>
                            <input type="text" class="preview-input" value="${contract.contractTitle || ''}" readonly>
                        </div>
                        <div>
                            <label>Effective Date:</label>
                            <input type="text" class="preview-input" value="${contract.effectiveDate || ''}" readonly>
                        </div>
                    </div>
                    
                    <div class="preview-parties">
                        <div class="preview-party">
                            <h3>Service Provider:</h3>
                            <input type="text" class="preview-input" value="${contract.parties?.serviceProvider?.name || ''}" readonly>
                            <textarea class="preview-input" rows="2" readonly>${contract.parties?.serviceProvider?.address || ''}</textarea>
                        </div>
                        <div class="preview-party">
                            <h3>Client:</h3>
                            <input type="text" class="preview-input" value="${contract.parties?.client?.name || ''}" readonly>
                            <textarea class="preview-input" rows="2" readonly>${contract.parties?.client?.address || ''}</textarea>
                        </div>
                    </div>
                    
                    ${contract.total ? `
                        <div class="preview-totals">
                            <div class="total-row total-final">
                                <span>Total Amount:</span>
                                <input type="text" class="preview-input" value="$${(contract.total || 0).toFixed(2)}" readonly style="width: auto; text-align: right; font-weight: 400; color: var(--text-color);">
                            </div>
                        </div>
                    ` : ''}
                    
                    ${contract.terms ? `
                        <div class="preview-notes">
                            <label>Terms:</label>
                            <textarea class="preview-input" rows="6" readonly>${contract.terms}</textarea>
                        </div>
                    ` : ''}
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading preview:', error);
        const previewContent = type === 'invoice'
            ? document.getElementById('sidePreviewContent')
            : document.getElementById('sidePreviewContentContracts');
        if (previewContent) {
            previewContent.innerHTML = '<div style="padding: 2rem; text-align: center; color: #ef4444;">Failed to load preview</div>';
        }
    }
}

// Close side preview
function closeSidePreview() {
    const previewPanel = document.getElementById('sidePreviewPanel');
    const previewPanelContracts = document.getElementById('sidePreviewPanelContracts');
    const gridContainers = document.querySelectorAll('.dashboard-grid-container');
    const allCards = document.querySelectorAll('.invoice-card');
    
    // Remove preview-selected class from all cards
    allCards.forEach(card => {
        card.classList.remove('preview-selected');
    });
    
    if (previewPanel) previewPanel.classList.add('hidden');
    if (previewPanelContracts) previewPanelContracts.classList.add('hidden');
    gridContainers.forEach(container => container.classList.remove('preview-active'));
}

async function savePreviewChanges() {
    if (!currentPreviewId) return;
    
    try {
        // Collect all data
        const items = [];
        const itemsContainer = document.getElementById('preview_items_list');
        itemsContainer.querySelectorAll('.preview-item').forEach((itemDiv, index) => {
            const desc = itemDiv.querySelector('[data-field="description"]').value;
            const qty = parseFloat(itemDiv.querySelector('[data-field="quantity"]').value) || 1;
            const rate = parseFloat(itemDiv.querySelector('[data-field="rate"]').value) || 0;
            const amount = parseFloat(itemDiv.querySelector('[data-field="amount"]').value) || 0;
            
            items.push({
                description: desc,
                quantity: qty,
                rate: rate,
                amount: amount
            });
        });
        
        const invoiceData = {
            invoiceNumber: document.getElementById('preview_invoiceNumber').value,
            date: document.getElementById('preview_date').value,
            dueDate: document.getElementById('preview_dueDate').value,
            from: {
                name: document.getElementById('preview_from_name').value,
                address: document.getElementById('preview_from_address').value,
                phone: document.getElementById('preview_from_phone').value,
                email: document.getElementById('preview_from_email').value
            },
            to: {
                name: document.getElementById('preview_to_name').value,
                address: document.getElementById('preview_to_address').value,
                phone: document.getElementById('preview_to_phone').value,
                email: document.getElementById('preview_to_email').value
            },
            items: items,
            subtotal: parseFloat(document.getElementById('preview_subtotal').value) || 0,
            tax: parseFloat(document.getElementById('preview_tax').value) || 0,
            total: parseFloat(document.getElementById('preview_total').value) || 0,
            notes: document.getElementById('preview_notes').value
        };
        
        // Save via API
        const response = await fetch(`/api/invoices/${currentPreviewId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(invoiceData)
        });
        
        if (!response.ok) {
            throw new Error('Failed to save changes');
        }
        
        alert('Changes saved successfully!');
        loadInvoices(); // Refresh the list
    } catch (error) {
        console.error('Error saving changes:', error);
        alert('Failed to save changes. Please try again.');
    }
}

async function downloadFromPreview() {
    if (!currentPreviewId || !currentPreviewInvoiceNumber) return;
    
    // Save changes first
    await savePreviewChanges();
    
    // Then download
    await downloadInvoice(currentPreviewId, currentPreviewInvoiceNumber);
    
    // Close modal
    closePreviewModal();
}

// Toggle sidebar menu
function toggleMenu() {
    const sidebar = document.getElementById('sidebarMenu');
    const overlay = document.getElementById('sidebarOverlay');
    
    const isHidden = sidebar.classList.contains('hidden');
    
    sidebar.classList.toggle('hidden');
    overlay.classList.toggle('hidden');
    
    // Prevent body scroll when sidebar is open
    if (!isHidden) {
        document.body.style.overflow = '';
    } else {
        document.body.style.overflow = 'hidden';
    }
}

// Go to profile (placeholder - can be customized)
function goToProfile() {
    // You can add navigation to a profile page here if needed
    // Menu will be closed by the onclick handler
}

// Logout
function logout() {
    window.location.href = '/auth/logout';
}

// Tab switching
function switchTab(tabName) {
    // Remove active class from all tabs and content
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Add active class to selected tab
    event.target.classList.add('active');
    
    // Show corresponding content
    if (tabName === 'invoices') {
        document.getElementById('invoicesTab').classList.add('active');
    } else if (tabName === 'contracts') {
        document.getElementById('contractsTab').classList.add('active');
    }
}

// Load contracts
async function loadContracts() {
    try {
        const response = await fetch('/api/contracts', {
            credentials: 'include'
        });
        
        const contracts = await response.json();
        const contractsList = document.getElementById('contractsList');
        const contractCount = document.getElementById('contractCount');
        
        contractCount.textContent = contracts.length;
        
        if (contracts.length === 0) {
            contractsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"></div>
                    <h3>No contracts yet</h3>
                    <p>Create your first contract to get started!</p>
                    <a href="/create-contract" class="create-btn create-btn-contract">New Contract</a>
                </div>
            `;
            return;
        }
        
        contractsList.innerHTML = contracts.map(contract => {
            const hasShareLink = contract.shareableLink && contract.shareableLink.token;
            const clientName = contract.parties?.client?.name || 'N/A';
            const truncatedClientName = clientName.length > 12 ? clientName.substring(0, 12) + '...' : clientName;
            
            return `
            <div class="invoice-card" data-contract-id="${contract._id}" onclick="showSidePreview('contract', '${contract._id}', '${contract.contractTitle}')" style="cursor: pointer;">
                <div class="invoice-card-header">
                    <h3 class="invoice-card-title">${truncatedClientName}</h3>
                </div>
                <div class="invoice-card-info">
                    <div class="invoice-card-info-item">
                        <span class="invoice-card-info-label">Provider</span>
                        <span class="invoice-card-info-value">${contract.parties?.serviceProvider?.name || 'N/A'}</span>
                    </div>
                </div>
                <div class="invoice-card-divider"></div>
                <div class="invoice-card-amount-section">
                    <div class="invoice-card-date">Effective: ${new Date(contract.effectiveDate).toLocaleDateString()}</div>
                    ${hasShareLink ? `<div style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--primary-color); text-align: right; opacity: 0.8;">Shared</div>` : ''}
                </div>
                <div class="invoice-card-divider"></div>
                <div class="invoice-card-footer" onclick="event.stopPropagation()">
                    <button class="card-icon-btn" onclick="event.stopPropagation(); downloadContract('${contract._id}', '${contract.contractTitle}')" title="Download">↓</button>
                    <div class="card-menu">
                        <button class="card-icon-btn" onclick="event.stopPropagation(); toggleCardMenu(this)" title="More options">⋯</button>
                        <div class="card-menu-dropdown">
                            ${hasShareLink ? `
                                <button class="card-menu-item" onclick="event.stopPropagation(); copyContractLink('${contract.shareableLink.token}')">Copy Link</button>
                            ` : `
                                <button class="card-menu-item" onclick="event.stopPropagation(); shareContractFromDashboard('${contract._id}')">Share</button>
                            `}
                            <button class="card-menu-item" onclick="event.stopPropagation(); editContract('${contract._id}')">Edit</button>
                            <button class="card-menu-item" onclick="event.stopPropagation(); deleteContract('${contract._id}')" style="color: #ef4444;">Delete</button>
                        </div>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading contracts:', error);
    }
}

// Download contract
async function downloadContract(id, contractTitle) {
    try {
        console.log('[Dashboard] Downloading contract:', id);
        const response = await fetch(`/api/contracts/${id}/pdf`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to download contract');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${contractTitle.replace(/\s+/g, '_')}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        console.log('[Dashboard] Download completed');
    } catch (error) {
        console.error('Error downloading contract:', error);
        alert('Failed to download contract: ' + error.message);
    }
}

// Edit contract
function editContract(id) {
    // Redirect to contract page with the contract ID
    window.location.href = `/contract.html?edit=${id}`;
}

// Delete contract
async function deleteContract(id) {
    if (!confirm('Are you sure you want to delete this contract?')) return;
    
    try {
        await fetch(`/api/contracts/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        loadContracts();
    } catch (error) {
        console.error('Error deleting contract:', error);
        alert('Failed to delete contract');
    }
}

// Show copy notification (global helper)
function showCopyNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-weight: 400;
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.transition = 'opacity 0.3s';
        notification.style.opacity = '0';
        setTimeout(() => document.body.removeChild(notification), 300);
    }, 2000);
}

// Copy contract shareable link
function copyContractLink(token) {
    const baseUrl = window.location.origin;
    const shareUrl = `${baseUrl}/contract/view/${token}`;
    
    // Try to copy to clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl)
            .then(() => {
                showCopyNotification('Link copied to clipboard!');
            })
            .catch(() => {
                fallbackCopy(shareUrl);
            });
    } else {
        fallbackCopy(shareUrl);
    }
    
    function fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showCopyNotification('Link copied to clipboard!');
        } catch (err) {
            prompt('Copy this link:', text);
        }
        document.body.removeChild(textarea);
    }
}

// Share contract from dashboard
async function shareContractFromDashboard(contractId) {
    try {
        console.log('[Dashboard] Sharing contract:', contractId);
        
        const response = await fetch(`/api/contracts/${contractId}/share`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        
        console.log('[Dashboard] Share response status:', response.status);
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('[Dashboard] Share error:', errorData);
            throw new Error(errorData.error || 'Failed to generate shareable link');
        }
        
        const result = await response.json();
        console.log('[Dashboard] Share result:', result);
        
        // Copy the link automatically
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(result.shareableUrl);
        }
        
        showCopyNotification('Link created and copied to clipboard!');
        
        // Reload contracts to show the updated share status
        setTimeout(() => loadContracts(), 500);
        
    } catch (error) {
        console.error('[Dashboard] Error sharing contract:', error);
        alert('Failed to generate shareable link: ' + error.message);
    }
}

// Toggle card menu
function toggleCardMenu(btn) {
    const dropdown = btn.nextElementSibling;
    const allDropdowns = document.querySelectorAll('.card-menu-dropdown');
    
    // Close all other dropdowns
    allDropdowns.forEach(d => {
        if (d !== dropdown) {
            d.classList.remove('show');
        }
    });
    
    // Toggle current dropdown
    dropdown.classList.toggle('show');
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(event) {
    if (!event.target.closest('.card-menu')) {
        document.querySelectorAll('.card-menu-dropdown').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
    }
});

// Tab switching
function switchTab(tabName) {
    const tabsContainer = document.querySelector('.dashboard-tabs');
    
    // Remove active class from all tabs and content
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Add active class to selected tab
    event.target.classList.add('active');
    
    // Update sliding capsule position
    if (tabName === 'invoices') {
        tabsContainer.classList.remove('tab-contracts');
        document.getElementById('invoicesTab').classList.add('active');
    } else if (tabName === 'contracts') {
        tabsContainer.classList.add('tab-contracts');
        document.getElementById('contractsTab').classList.add('active');
    }
}

// Toggle New menu dropdown
function toggleNewMenu() {
    const dropdown = document.getElementById('newMenuDropdown');
    dropdown.classList.toggle('hidden');
}

// Close New menu when clicking outside
document.addEventListener('click', function(event) {
    const newMenu = document.querySelector('.new-menu');
    const dropdown = document.getElementById('newMenuDropdown');
    if (newMenu && !newMenu.contains(event.target)) {
        dropdown.classList.add('hidden');
    }
});

// Color picker functionality
function initColorPicker() {
    const colorPicker = document.getElementById('colorPicker');
    if (!colorPicker) return;
    
    // Load saved color from localStorage, default to brand blue
    const savedColor = localStorage.getItem('themeColor') || '#4542FF';
    colorPicker.value = savedColor;
    updateThemeColor(savedColor);
    
    // Handle color change
    colorPicker.addEventListener('input', function(e) {
        const newColor = e.target.value;
        updateThemeColor(newColor);
        localStorage.setItem('themeColor', newColor);
    });
}

// Update theme color throughout the app
function updateThemeColor(color) {
    const root = document.documentElement;
    const rgb = hexToRgb(color);
    
    // Set primary color
    root.style.setProperty('--primary-color', color);
    root.style.setProperty('--text-color', color);
    
    // Calculate darker shades
    const dark = darkenColor(color, 0.15);
    const darker = darkenColor(color, 0.25);
    
    root.style.setProperty('--primary-dark', dark);
    root.style.setProperty('--primary-darker', darker);
}

// Helper function to convert hex to RGB
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

// Helper function to darken a color
function darkenColor(hex, percent) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    
    const r = Math.max(0, Math.floor(rgb.r * (1 - percent)));
    const g = Math.max(0, Math.floor(rgb.g * (1 - percent)));
    const b = Math.max(0, Math.floor(rgb.b * (1 - percent)));
    
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// Toggle Sidebar
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const body = document.body;
    
    if (sidebar.classList.contains('closed')) {
        sidebar.classList.remove('closed');
        sidebar.classList.add('open');
        body.classList.remove('sidebar-closed');
    } else {
        sidebar.classList.remove('open');
        sidebar.classList.add('closed');
        body.classList.add('sidebar-closed');
    }
}

// Set active sidebar icon based on current page
function setActiveSidebarIcon() {
    const currentPath = window.location.pathname;
    const icons = document.querySelectorAll('.sidebar-icon');
    
    icons.forEach(icon => {
        icon.classList.remove('active');
    });
    
    if (currentPath === '/dashboard' || currentPath === '/') {
        const dashboardIcon = document.querySelector('.sidebar-icon[title="Dashboard"]');
        if (dashboardIcon) dashboardIcon.classList.add('active');
    } else if (currentPath === '/settings') {
        const settingsIcon = document.querySelector('.sidebar-icon[title="Settings"]');
        if (settingsIcon) settingsIcon.classList.add('active');
    }
}

// Initialize
checkAuth();
setActiveSidebarIcon();
