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
        const tabCount = document.getElementById('tabCount');
        
        // Store all invoices for search
        allInvoices = invoices;
        
        // Store invoice count
        window.invoiceCountValue = invoices.length;
        
        // Update tab count if invoices tab is active
        const tabCountNumber = document.getElementById('tabCountNumber');
        if (tabCount && tabCountNumber && document.getElementById('invoicesTab') && document.getElementById('invoicesTab').classList.contains('active')) {
            tabCountNumber.textContent = invoices.length;
        }
        
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
            const currencySymbol = getCurrencySymbol(invoice.currency || 'USD');
            
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
                    <div class="invoice-card-amount">${currencySymbol}${invoice.total?.toFixed(2) || '0.00'}</div>
                    <div class="invoice-card-date">Due: ${new Date(invoice.dueDate).toLocaleDateString()}</div>
                </div>
                <div class="invoice-card-divider"></div>
                <div class="invoice-card-footer" onclick="event.stopPropagation()">
                    <button class="card-icon-btn" onclick="event.stopPropagation(); downloadInvoice('${invoice._id}', '${invoice.invoiceNumber}')" title="Download">↓</button>
                    <div class="card-menu">
                        <button class="card-icon-btn" onclick="event.stopPropagation(); toggleCardMenu(this)" title="More options">⋯</button>
                        <div class="card-menu-dropdown">
                            <button class="card-menu-item" onclick="event.stopPropagation(); showSidePreview('invoice', '${invoice._id}', '${invoice.invoiceNumber}')">Preview</button>
                            <button class="card-menu-item" onclick="event.stopPropagation(); sendInvoiceEmail('${invoice._id}', '${invoice.invoiceNumber}')">Send via Email</button>
                            <button class="card-menu-item" onclick="event.stopPropagation(); generatePaymentLink('${invoice._id}', '${invoice.invoiceNumber}')">Payment Link</button>
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

// Get currency symbol
function getCurrencySymbol(currency) {
    const symbols = {
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'INR': '₹',
        'CAD': 'C$',
        'AUD': 'A$',
        'JPY': '¥',
        'CNY': '¥',
        'CHF': 'Fr',
        'SGD': 'S$',
        'HKD': 'HK$',
        'NZD': 'NZ$',
        'SEK': 'kr',
        'NOK': 'kr',
        'MXN': '$',
        'BRL': 'R$',
        'ZAR': 'R',
        'AED': 'د.إ'
    };
    return symbols[currency] || currency;
}

// Send invoice via email
async function sendInvoiceEmail(id, invoiceNumber) {
    const email = prompt(`Send Invoice ${invoiceNumber} via email\n\nEnter recipient email address:`);
    
    if (!email) return;
    
    // Basic email validation
    if (!email.includes('@') || !email.includes('.')) {
        alert('Please enter a valid email address');
        return;
    }
    
    const includePayment = confirm('Include payment link in email?');
    
    try {
        const response = await fetch(`/api/invoices/${id}/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
                recipientEmail: email,
                includePaymentLink: includePayment
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to send email');
        }
        
        alert(`Invoice sent successfully to ${email}!\n\nThe recipient will receive a professional email with the invoice PDF attached.`);
        
    } catch (error) {
        console.error('[Email] Error:', error);
        if (error.message.includes('not configured')) {
            alert('Email not configured.\n\nPlease add SMTP settings to your .env file.\nSee: vibe-coder-bs/STRIPE_EMAIL_SETUP.md');
        } else {
            alert('Failed to send email: ' + error.message);
        }
    }
}

// Generate Stripe payment link
async function generatePaymentLink(id, invoiceNumber) {
    if (!confirm(`Create Payment Link for ${invoiceNumber}?\n\nThis will create a Stripe payment link that you can share with your client.`)) {
            return;
        }
        
    try {
        const response = await fetch(`/api/invoices/${id}/payment-link`, {
            method: 'POST',
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            if (result.needsStripeSetup) {
                const goToSettings = confirm('Stripe not connected.\n\nYou need to connect your Stripe account first to accept payments.\n\nGo to Settings now?');
                if (goToSettings) {
                    window.location.href = '/settings';
                }
                return;
            }
            throw new Error(result.error || 'Failed to create payment link');
        }
        
        // Copy to clipboard
        await navigator.clipboard.writeText(result.paymentLink);
        
        alert(`Payment link created and copied to clipboard!\n\nLink: ${result.paymentLink}\n\nShare this link with your client. They can pay with credit/debit card, and the money goes directly to your Stripe account.`);
        
        // Reload to show updated invoice
        loadInvoices();
        
    } catch (error) {
        console.error('[Payment] Error:', error);
        if (error.message.includes('not configured')) {
            alert('Stripe not configured.\n\nPlease add your Stripe credentials or connect your account in Settings.');
        } else {
            alert('Failed to create payment link: ' + error.message);
        }
    }
}

// Save to Google Drive
async function saveToGoogleDrive(id, invoiceNumber) {
    try {
        console.log('[Drive] Saving invoice to Drive:', id);
        
        const response = await fetch(`/api/invoices/${id}/save-to-drive`, {
            method: 'POST',
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to save to Drive');
        }
        
        console.log('[Drive] Success:', result);
        alert(`Saved to Google Drive!\n\nFile: ${result.drive.fileName}\n\nYou can view it in your Drive under the "Invoices" folder.`);
        
        // Optionally open Drive link
        if (result.drive.viewLink) {
            const openDrive = confirm('Open in Google Drive?');
            if (openDrive) {
                window.open(result.drive.viewLink, '_blank');
            }
        }
        
    } catch (error) {
        console.error('[Drive] Error:', error);
        if (error.message.includes('not available')) {
            alert('Google Drive access not available.\n\nPlease re-login to grant Drive permissions.');
        } else {
            alert('Failed to save to Drive: ' + error.message);
        }
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
        
        // Populate preview fields (static display)
        document.getElementById('preview_invoiceNumber').textContent = invoice.invoiceNumber || '-';
        document.getElementById('preview_date').textContent = invoice.date || '-';
        document.getElementById('preview_dueDate').textContent = invoice.dueDate || '-';
        
        // From fields
        document.getElementById('preview_from_name').textContent = invoice.from?.name || '-';
        document.getElementById('preview_from_address').textContent = invoice.from?.address || '-';
        document.getElementById('preview_from_phone').textContent = invoice.from?.phone || '-';
        document.getElementById('preview_from_email').textContent = invoice.from?.email || '-';
        
        // To fields
        document.getElementById('preview_to_name').textContent = invoice.to?.name || '-';
        document.getElementById('preview_to_address').textContent = invoice.to?.address || '-';
        document.getElementById('preview_to_phone').textContent = invoice.to?.phone || '-';
        document.getElementById('preview_to_email').textContent = invoice.to?.email || '-';
        
        // Items
        const itemsTbody = document.getElementById('preview_items_tbody');
        itemsTbody.innerHTML = '';
        if (invoice.items && invoice.items.length > 0) {
            invoice.items.forEach((item, index) => {
                const row = document.createElement('tr');
                row.style.borderBottom = '1px solid #e5e7eb';
                row.innerHTML = `
                    <td style="padding: 0.75rem; color: #1f2937;">${item.description || '-'}</td>
                    <td style="padding: 0.75rem; text-align: center; color: #4b5563;">${item.quantity || 1}</td>
                    <td style="padding: 0.75rem; text-align: right; color: #4b5563;">$${(item.rate || 0).toFixed(2)}</td>
                    <td style="padding: 0.75rem; text-align: right; color: #1f2937; font-weight: 500;">$${(item.amount || 0).toFixed(2)}</td>
                `;
                itemsTbody.appendChild(row);
            });
        } else {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="4" style="padding: 1rem; text-align: center; color: #9ca3af;">No items</td>
            `;
            itemsTbody.appendChild(row);
        }
        
        // Totals
        const subtotal = invoice.subtotal || 0;
        const tax = invoice.tax || 0;
        const total = invoice.total || 0;
        document.getElementById('preview_subtotal_display').textContent = `$${subtotal.toFixed(2)}`;
        document.getElementById('preview_tax_display').textContent = `$${tax.toFixed(2)}`;
        document.getElementById('preview_total_display').textContent = `$${total.toFixed(2)}`;
        
        // Notes
        document.getElementById('preview_notes').textContent = invoice.notes || '-';
        
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
        // Close all dropdown menus
        document.querySelectorAll('.card-menu-dropdown').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
        
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
    
    // Download directly (static preview, no changes to save)
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

// Load contracts
async function loadContracts() {
    try {
        const response = await fetch('/api/contracts', {
            credentials: 'include'
        });
        
        const contracts = await response.json();
        const contractsList = document.getElementById('contractsList');
        const contractCount = document.getElementById('contractCount');
        const tabCount = document.getElementById('tabCount');
        
        if (!contractsList) {
            console.error('contractsList element not found');
            return;
        }
        
        // Store all contracts for search
        allContracts = contracts;
        
        // Store contract count
        window.contractCountValue = contracts.length;
        
        // Update tab count if contracts tab is active
        const tabCountNumber = document.getElementById('tabCountNumber');
        if (tabCount && tabCountNumber && document.getElementById('contractsTab') && document.getElementById('contractsTab').classList.contains('active')) {
            tabCountNumber.textContent = contracts.length;
        }
        
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
            const providerName = contract.parties?.serviceProvider?.name || 'N/A';
            const truncatedProviderName = providerName.length > 12 ? providerName.substring(0, 12) + '...' : providerName;
            
            return `
            <div class="invoice-card" data-contract-id="${contract._id}" onclick="showSidePreview('contract', '${contract._id}', '${contract.contractTitle}')" style="cursor: pointer;">
                <div class="invoice-card-header">
                    <h3 class="invoice-card-title">${truncatedClientName}</h3>
                </div>
                <div class="invoice-card-info">
                    <div class="invoice-card-info-item">
                        <span class="invoice-card-info-label">Provider</span>
                        <span class="invoice-card-info-value">${truncatedProviderName}</span>
                    </div>
                    <div class="invoice-card-info-item">
                        <span class="invoice-card-info-label">Status</span>
                        <span class="invoice-card-info-value">${hasShareLink ? 'Shared' : 'Private'}</span>
                    </div>
                </div>
                <div class="invoice-card-divider"></div>
                <div class="invoice-card-amount-section">
                    <div class="invoice-card-amount" style="visibility: hidden; height: 1.1rem; margin-bottom: 0.25rem;">—</div>
                    <div class="invoice-card-date">Effective: ${contract.effectiveDate ? new Date(contract.effectiveDate).toLocaleDateString() : 'N/A'}</div>
                </div>
                <div class="invoice-card-divider"></div>
                <div class="invoice-card-footer" onclick="event.stopPropagation()">
                    <button class="card-icon-btn" onclick="event.stopPropagation(); downloadContract('${contract._id}', '${contract.contractTitle}')" title="Download">↓</button>
                    <div class="card-menu">
                        <button class="card-icon-btn" onclick="event.stopPropagation(); toggleCardMenu(this)" title="More options">⋯</button>
                        <div class="card-menu-dropdown">
                            <button class="card-menu-item" onclick="event.stopPropagation(); showSidePreview('contract', '${contract._id}', '${contract.contractTitle}')">Preview</button>
                            <button class="card-menu-item" onclick="event.stopPropagation(); saveContractToDrive('${contract._id}', '${contract.contractTitle}')">Save to Drive</button>
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
        const contractsList = document.getElementById('contractsList');
        if (contractsList) {
            contractsList.innerHTML = `<div style="padding: 2rem; text-align: center; color: #ef4444;">Error loading contracts. Please refresh the page.</div>`;
        }
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

// Save contract to Google Drive
async function saveContractToDrive(id, contractTitle) {
    try {
        console.log('[Drive] Saving contract to Drive:', id);
        
        const response = await fetch(`/api/contracts/${id}/save-to-drive`, {
            method: 'POST',
            credentials: 'include'
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to save to Drive');
        }
        
        console.log('[Drive] Success:', result);
        alert(`Saved to Google Drive!\n\nFile: ${result.drive.fileName}\n\nYou can view it in your Drive under the "Contracts" folder.`);
        
        // Optionally open Drive link
        if (result.drive.viewLink) {
            const openDrive = confirm('Open in Google Drive?');
            if (openDrive) {
                window.open(result.drive.viewLink, '_blank');
            }
        }
        
    } catch (error) {
        console.error('[Drive] Error:', error);
        if (error.message.includes('not available')) {
            alert('Google Drive access not available.\n\nPlease re-login to grant Drive permissions.');
        } else {
            alert('Failed to save to Drive: ' + error.message);
        }
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
// Search functionality
let allInvoices = [];
let allContracts = [];
let currentSearchQuery = '';

function handleDashboardSearch(query) {
    currentSearchQuery = query.toLowerCase().trim();
    filterAndDisplayItems();
}

function filterAndDisplayItems() {
    const invoicesList = document.getElementById('invoicesList');
    const contractsList = document.getElementById('contractsList');
    const invoicesTab = document.getElementById('invoicesTab');
    const contractsTab = document.getElementById('contractsTab');
    
    if (currentSearchQuery === '') {
        // Show all items - reload from original data
        if (invoicesList && invoicesTab && invoicesTab.classList.contains('active')) {
            loadInvoices();
        }
        if (contractsList && contractsTab && contractsTab.classList.contains('active')) {
            loadContracts();
        }
    } else {
        // Filter invoices
        if (invoicesList && invoicesTab && invoicesTab.classList.contains('active')) {
            const filteredInvoices = allInvoices.filter(invoice => {
                const searchFields = [
                    invoice.invoiceNumber || '',
                    invoice.to?.name || '',
                    invoice.to?.email || '',
                    invoice.from?.name || '',
                    invoice.items?.map(item => item.description || '').join(' ') || '',
                    invoice.notes || ''
                ].join(' ').toLowerCase();
                return searchFields.includes(currentSearchQuery);
            });
            
            if (filteredInvoices.length === 0) {
                invoicesList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon"></div>
                        <h3>No invoices found</h3>
                        <p>Try a different search term</p>
                    </div>
                `;
            } else {
                invoicesList.innerHTML = filteredInvoices.map(invoice => {
                    const clientName = invoice.to?.name || 'N/A';
                    const truncatedClientName = clientName.length > 12 ? clientName.substring(0, 12) + '...' : clientName;
                    const currencySymbol = getCurrencySymbol(invoice.currency || 'USD');
                    
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
                            <div class="invoice-card-amount">${currencySymbol}${invoice.total?.toFixed(2) || '0.00'}</div>
                            <div class="invoice-card-date">Due: ${new Date(invoice.dueDate).toLocaleDateString()}</div>
                        </div>
                        <div class="invoice-card-divider"></div>
                        <div class="invoice-card-footer" onclick="event.stopPropagation()">
                            <button class="card-icon-btn" onclick="event.stopPropagation(); downloadInvoice('${invoice._id}', '${invoice.invoiceNumber}')" title="Download">↓</button>
                            <div class="card-menu">
                                <button class="card-icon-btn" onclick="event.stopPropagation(); toggleCardMenu(this)" title="More options">⋯</button>
                                <div class="card-menu-dropdown">
                                    <button class="card-menu-item" onclick="event.stopPropagation(); showSidePreview('invoice', '${invoice._id}', '${invoice.invoiceNumber}')">Preview</button>
                                    <button class="card-menu-item" onclick="event.stopPropagation(); sendInvoiceEmail('${invoice._id}', '${invoice.invoiceNumber}')">Send via Email</button>
                                    <button class="card-menu-item" onclick="event.stopPropagation(); generatePaymentLink('${invoice._id}', '${invoice.invoiceNumber}')">Payment Link</button>
                                    <button class="card-menu-item" onclick="event.stopPropagation(); editInvoice('${invoice._id}')">Edit</button>
                                    <button class="card-menu-item" onclick="event.stopPropagation(); saveToGoogleDrive('${invoice._id}', '${invoice.invoiceNumber}')">Save to Drive</button>
                                    <button class="card-menu-item" onclick="event.stopPropagation(); deleteInvoice('${invoice._id}')" style="color: #ef4444;">Delete</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    `;
                }).join('');
            }
        }
        
        // Filter contracts
        if (contractsList && contractsTab && contractsTab.classList.contains('active')) {
            const filteredContracts = allContracts.filter(contract => {
                const searchFields = [
                    contract.contractTitle || contract.title || '',
                    contract.parties?.client?.name || contract.party1?.name || '',
                    contract.parties?.serviceProvider?.name || contract.party2?.name || '',
                    contract.terms || ''
                ].join(' ').toLowerCase();
                return searchFields.includes(currentSearchQuery);
            });
            
            if (filteredContracts.length === 0) {
                contractsList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon"></div>
                        <h3>No contracts found</h3>
                        <p>Try a different search term</p>
                    </div>
                `;
            } else {
                contractsList.innerHTML = filteredContracts.map(contract => {
                    const hasShareLink = contract.shareableLink && contract.shareableLink.token;
                    const clientName = contract.parties?.client?.name || 'N/A';
                    const truncatedClientName = clientName.length > 12 ? clientName.substring(0, 12) + '...' : clientName;
                    const providerName = contract.parties?.serviceProvider?.name || 'N/A';
                    const truncatedProviderName = providerName.length > 12 ? providerName.substring(0, 12) + '...' : providerName;
                    
                    return `
                    <div class="invoice-card" data-contract-id="${contract._id}" onclick="showSidePreview('contract', '${contract._id}', '${contract.contractTitle}')" style="cursor: pointer;">
                        <div class="invoice-card-header">
                            <h3 class="invoice-card-title">${truncatedClientName}</h3>
                        </div>
                        <div class="invoice-card-info">
                            <div class="invoice-card-info-item">
                                <span class="invoice-card-info-label">Provider</span>
                                <span class="invoice-card-info-value">${truncatedProviderName}</span>
                            </div>
                            <div class="invoice-card-info-item">
                                <span class="invoice-card-info-label">Status</span>
                                <span class="invoice-card-info-value">${hasShareLink ? 'Shared' : 'Private'}</span>
                            </div>
                        </div>
                        <div class="invoice-card-divider"></div>
                        <div class="invoice-card-amount-section">
                            <div class="invoice-card-amount" style="visibility: hidden; height: 1.1rem; margin-bottom: 0.25rem;">—</div>
                            <div class="invoice-card-date">Effective: ${contract.effectiveDate ? new Date(contract.effectiveDate).toLocaleDateString() : 'N/A'}</div>
                        </div>
                        <div class="invoice-card-divider"></div>
                        <div class="invoice-card-footer" onclick="event.stopPropagation()">
                            <button class="card-icon-btn" onclick="event.stopPropagation(); downloadContract('${contract._id}', '${contract.contractTitle}')" title="Download">↓</button>
                            <div class="card-menu">
                                <button class="card-icon-btn" onclick="event.stopPropagation(); toggleCardMenu(this)" title="More options">⋯</button>
                                <div class="card-menu-dropdown">
                                    <button class="card-menu-item" onclick="event.stopPropagation(); showSidePreview('contract', '${contract._id}', '${contract.contractTitle}')">Preview</button>
                                    <button class="card-menu-item" onclick="event.stopPropagation(); saveContractToDrive('${contract._id}', '${contract.contractTitle}')">Save to Drive</button>
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
            }
        }
    }
    
    // Update counts
    updateTabCounts();
}


function updateTabCounts() {
    const tabCountNumber = document.getElementById('tabCountNumber');
    const invoicesTab = document.getElementById('invoicesTab');
    const contractsTab = document.getElementById('contractsTab');
    const invoicesList = document.getElementById('invoicesList');
    const contractsList = document.getElementById('contractsList');
    
    if (!tabCountNumber) return;
    
    if (invoicesTab && invoicesTab.classList.contains('active')) {
        const count = currentSearchQuery === '' ? allInvoices.length : (invoicesList ? invoicesList.children.length : 0);
        tabCountNumber.textContent = count;
    } else if (contractsTab && contractsTab.classList.contains('active')) {
        const count = currentSearchQuery === '' ? allContracts.length : (contractsList ? contractsList.children.length : 0);
        tabCountNumber.textContent = count;
    }
}

function switchTab(tabName) {
    const tabsContainer = document.querySelector('.dashboard-tabs');
    const tabCount = document.getElementById('tabCount');
    const invoiceCount = document.getElementById('invoiceCount');
    const contractCount = document.getElementById('contractCount');
    
    // Remove active class from all tabs and content
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Add active class to selected tab
    event.target.classList.add('active');
    
    // Update sliding capsule position and count
    if (tabName === 'invoices') {
        tabsContainer.classList.remove('tab-contracts');
        document.getElementById('invoicesTab').classList.add('active');
        updateTabCounts();
    } else if (tabName === 'contracts') {
        tabsContainer.classList.add('tab-contracts');
        document.getElementById('contractsTab').classList.add('active');
        updateTabCounts();
        
        // Ensure contracts are loaded if not already
        const contractsList = document.getElementById('contractsList');
        if (contractsList && contractsList.children.length === 0) {
            loadContracts();
        }
    }
    
    // Re-apply search filter when switching tabs
    if (currentSearchQuery) {
        filterAndDisplayItems();
    }
}

// Toggle New menu dropdown
function toggleNewMenu(event) {
    if (event) {
        event.stopPropagation();
    }
    const dropdown = document.getElementById('newMenuDropdown');
    if (!dropdown) {
        console.error('[New Menu] Dropdown element not found!');
        return;
    }
    
    const isHidden = dropdown.classList.contains('hidden');
    dropdown.classList.toggle('hidden');
    
    // Force display update
    if (!dropdown.classList.contains('hidden')) {
        dropdown.style.display = 'block';
        dropdown.style.visibility = 'visible';
    } else {
        dropdown.style.display = 'none';
        dropdown.style.visibility = 'hidden';
    }
}

// Close New menu when clicking outside
document.addEventListener('click', function(event) {
    const newMenu = document.querySelector('.new-menu');
    const dropdown = document.getElementById('newMenuDropdown');
    const newBtn = document.querySelector('.new-btn');
    
    // Don't close if clicking the button or inside the menu
    if (newMenu && dropdown && !newMenu.contains(event.target) && event.target !== newBtn) {
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
    
    // If sidebar is completely hidden (closed), show it collapsed
    if (sidebar.classList.contains('closed')) {
        sidebar.classList.remove('closed');
        sidebar.classList.add('collapsed');
        body.classList.remove('sidebar-closed');
        localStorage.setItem('sidebarState', 'collapsed');
    } 
    // If sidebar is collapsed, expand it
    else if (sidebar.classList.contains('collapsed')) {
        sidebar.classList.remove('collapsed');
        sidebar.classList.add('expanded');
        body.classList.add('sidebar-expanded');
        body.classList.remove('sidebar-closed');
        localStorage.setItem('sidebarState', 'expanded');
    } 
    // If sidebar is expanded, collapse it
    else if (sidebar.classList.contains('expanded')) {
        sidebar.classList.remove('expanded');
        sidebar.classList.add('collapsed');
        body.classList.remove('sidebar-expanded');
        localStorage.setItem('sidebarState', 'collapsed');
    }
    // Default: start collapsed
    else {
        sidebar.classList.add('collapsed');
        localStorage.setItem('sidebarState', 'collapsed');
    }
}

// Restore sidebar state from localStorage
function restoreSidebarState() {
    const sidebar = document.getElementById('sidebar');
    const body = document.body;
    
    if (!sidebar) return;
    
    const savedState = localStorage.getItem('sidebarState') || 'collapsed';
    
    // Disable transitions during restore to prevent animation
    sidebar.style.transition = 'none';
    const sidebarLogo = sidebar.querySelector('.sidebar-logo');
    if (sidebarLogo) {
        sidebarLogo.style.transition = 'none';
    }
    const mainContentWrapper = document.querySelector('.main-content-wrapper');
    if (mainContentWrapper) {
        mainContentWrapper.style.transition = 'none';
    }
    
    // Remove all state classes
    sidebar.classList.remove('closed', 'collapsed', 'expanded');
    body.classList.remove('sidebar-closed', 'sidebar-expanded');
    
    // Apply saved state
    if (savedState === 'closed') {
        sidebar.classList.add('closed');
        body.classList.add('sidebar-closed');
    } else if (savedState === 'expanded') {
        sidebar.classList.add('expanded');
        body.classList.add('sidebar-expanded');
    } else {
        // Default to collapsed
        sidebar.classList.add('collapsed');
    }
    
    // Re-enable transitions after a short delay
    setTimeout(() => {
        sidebar.style.transition = '';
        if (sidebarLogo) {
            sidebarLogo.style.transition = '';
        }
        if (mainContentWrapper) {
            mainContentWrapper.style.transition = '';
        }
    }, 50);
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
        const profileIcon = document.querySelector('.sidebar-icon[title="Profile"]');
        if (profileIcon) profileIcon.classList.add('active');
    }
}

// Dark Mode Functions
function initDarkMode() {
    try {
        const darkMode = localStorage.getItem('darkMode');
        if (darkMode === 'enabled' && document.body) {
            document.body.classList.add('dark-mode');
            updateDarkModeIcon(true);
        }
    } catch (error) {
        console.error('[Dark Mode] Init error:', error);
    }
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    
    if (isDark) {
        localStorage.setItem('darkMode', 'enabled');
    } else {
        localStorage.setItem('darkMode', 'disabled');
    }
    
    updateDarkModeIcon(isDark);
}

function updateDarkModeIcon(isDark) {
    try {
        const sunIcon = document.querySelector('.sun-icon');
        const moonIcon = document.querySelector('.moon-icon');
        
        if (sunIcon && moonIcon) {
            if (isDark) {
                sunIcon.style.display = 'none';
                moonIcon.style.display = 'block';
            } else {
                sunIcon.style.display = 'block';
                moonIcon.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('[Dark Mode] Icon update error:', error);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        restoreSidebarState();
        initDarkMode();
checkAuth();
        setActiveSidebarIcon();
    });

// Toggle Calendar
function toggleCalendar() {
    const dropdown = document.getElementById('calendarDropdown');
    const toggleText = document.getElementById('calendarToggleText');
    
    if (!dropdown || !toggleText) return;
    
    if (dropdown.classList.contains('hidden')) {
        dropdown.classList.remove('hidden');
        toggleText.textContent = 'Hide Calendar';
        initCalendar();
    } else {
        dropdown.classList.add('hidden');
        toggleText.textContent = 'Show Calendar';
    }
}

// Initialize Calendar
function initCalendar() {
    const calendarGrid = document.getElementById('calendarDropdown')?.querySelector('.calendar-grid');
    if (!calendarGrid) return;
    
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    
    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    // Clear existing days (except headers)
    const headers = calendarGrid.querySelectorAll('.calendar-day-header');
    const existingDays = calendarGrid.querySelectorAll('.calendar-day');
    existingDays.forEach(day => day.remove());
    
    // Add previous month's trailing days
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = document.createElement('div');
        day.className = 'calendar-day other-month';
        day.textContent = daysInPrevMonth - i;
        calendarGrid.appendChild(day);
    }
    
    // Add current month's days
    for (let i = 1; i <= daysInMonth; i++) {
        const day = document.createElement('div');
        day.className = 'calendar-day';
        if (i === today.getDate()) {
            day.classList.add('today');
        }
        day.textContent = i;
        calendarGrid.appendChild(day);
    }
    
    // Add next month's leading days to fill the grid
    const totalCells = headers.length + firstDay + daysInMonth;
    const remainingCells = 42 - totalCells; // 6 rows × 7 days = 42
    for (let i = 1; i <= remainingCells; i++) {
        const day = document.createElement('div');
        day.className = 'calendar-day other-month';
        day.textContent = i;
        calendarGrid.appendChild(day);
    }
}
} else {
    // DOM is already loaded
    restoreSidebarState();
    initDarkMode();
    checkAuth();
    setActiveSidebarIcon();
}
