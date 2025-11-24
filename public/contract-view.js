let contractData = null;
let token = null;
let signatureCanvas = null;
let signatureCtx = null;
let isDrawing = false;
let hasSignature = false;

// Get token from URL
const pathParts = window.location.pathname.split('/');
token = pathParts[pathParts.length - 1];

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    loadContract();
});

async function loadContract() {
    try {
        console.log('[Contract View] Loading contract with token:', token);
        const response = await fetch(`/api/contracts/shared/${token}`);
        
        console.log('[Contract View] Response status:', response.status);
        
        if (!response.ok) {
            const error = await response.json();
            console.error('[Contract View] Error response:', error);
            showError(error.error || 'Failed to load contract');
            return;
        }
        
        contractData = await response.json();
        console.log('[Contract View] Contract data loaded:', contractData);
        displayContract();
        initializeSignatureCanvas();
        
    } catch (error) {
        console.error('Error loading contract:', error);
        showError('Failed to load contract. Please check your connection and try again.');
    }
}

function displayContract() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('contractContent').style.display = 'block';
    
    // Header
    document.getElementById('contractTitle').textContent = contractData.contractTitle;
    document.getElementById('effectiveDate').textContent = contractData.effectiveDate;
    
    // Status badge
    const statusBadge = document.getElementById('statusBadge');
    statusBadge.textContent = contractData.status.replace('_', ' ').toUpperCase();
    statusBadge.className = `status-badge status-${contractData.status}`;
    
    // Service Provider
    document.getElementById('sp_name').textContent = contractData.parties?.serviceProvider?.name || 'N/A';
    document.getElementById('sp_address').textContent = contractData.parties?.serviceProvider?.address || 'N/A';
    document.getElementById('sp_email').textContent = contractData.parties?.serviceProvider?.email || 'N/A';
    document.getElementById('sp_phone').textContent = contractData.parties?.serviceProvider?.phone || 'N/A';
    
    // Client
    document.getElementById('client_name').textContent = contractData.parties?.client?.name || 'N/A';
    document.getElementById('client_address').textContent = contractData.parties?.client?.address || 'N/A';
    document.getElementById('client_email').textContent = contractData.parties?.client?.email || 'N/A';
    document.getElementById('client_phone').textContent = contractData.parties?.client?.phone || 'N/A';
    
    // Sections
    const sectionsContainer = document.getElementById('sectionsContainer');
    sectionsContainer.innerHTML = '';
    
    if (contractData.sections && contractData.sections.length > 0) {
        contractData.sections.sort((a, b) => a.order - b.order).forEach(section => {
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'contract-section';
            
            const title = document.createElement('h3');
            title.textContent = section.title;
            
            const content = document.createElement('div');
            content.className = 'content';
            content.textContent = section.content;
            
            sectionDiv.appendChild(title);
            sectionDiv.appendChild(content);
            sectionsContainer.appendChild(sectionDiv);
        });
    }
    
    // Check if client already signed
    if (contractData.signatures?.client?.signatureData) {
        document.getElementById('notSignedYet').style.display = 'none';
        document.getElementById('alreadySigned').style.display = 'block';
        document.getElementById('signedByName').textContent = contractData.signatures.client.signedBy;
        document.getElementById('signedDate').textContent = new Date(contractData.signatures.client.signedAt).toLocaleDateString();
        document.getElementById('signatureImage').src = contractData.signatures.client.signatureData;
    }
}

function initializeSignatureCanvas() {
    signatureCanvas = document.getElementById('signatureCanvas');
    if (!signatureCanvas) return;
    
    const rect = signatureCanvas.parentElement.getBoundingClientRect();
    signatureCanvas.width = rect.width;
    signatureCanvas.height = rect.height;
    
    signatureCtx = signatureCanvas.getContext('2d');
    signatureCtx.strokeStyle = '#000000';
    signatureCtx.lineWidth = 2;
    signatureCtx.lineCap = 'round';
    signatureCtx.lineJoin = 'round';
    
    // Mouse events
    signatureCanvas.addEventListener('mousedown', startDrawing);
    signatureCanvas.addEventListener('mousemove', draw);
    signatureCanvas.addEventListener('mouseup', stopDrawing);
    signatureCanvas.addEventListener('mouseleave', stopDrawing);
    
    // Touch events
    signatureCanvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        signatureCanvas.dispatchEvent(mouseEvent);
    });
    
    signatureCanvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        signatureCanvas.dispatchEvent(mouseEvent);
    });
    
    signatureCanvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        const mouseEvent = new MouseEvent('mouseup', {});
        signatureCanvas.dispatchEvent(mouseEvent);
    });
}

function startDrawing(e) {
    isDrawing = true;
    const rect = signatureCanvas.getBoundingClientRect();
    signatureCtx.beginPath();
    signatureCtx.moveTo(
        e.clientX - rect.left,
        e.clientY - rect.top
    );
    
    document.getElementById('signaturePlaceholder').classList.add('hidden');
}

function draw(e) {
    if (!isDrawing) return;
    
    const rect = signatureCanvas.getBoundingClientRect();
    signatureCtx.lineTo(
        e.clientX - rect.left,
        e.clientY - rect.top
    );
    signatureCtx.stroke();
    hasSignature = true;
}

function stopDrawing() {
    isDrawing = false;
}

function clearSignature() {
    if (signatureCtx && signatureCanvas) {
        signatureCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
        hasSignature = false;
        document.getElementById('signaturePlaceholder').classList.remove('hidden');
    }
}

async function signContract() {
    if (!hasSignature) {
        alert('Please draw your signature before submitting.');
        return;
    }
    
    const signedBy = document.getElementById('signedBy').value.trim();
    if (!signedBy) {
        alert('Please enter your full legal name.');
        return;
    }
    
    const signButton = document.getElementById('signButton');
    signButton.disabled = true;
    signButton.textContent = 'Signing...';
    
    try {
        const signatureData = signatureCanvas.toDataURL('image/png');
        
        const response = await fetch(`/api/contracts/shared/${token}/sign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                party: 'client',
                signatureData,
                signedBy
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to sign contract');
        }
        
        const result = await response.json();
        
        // Show success message
        document.getElementById('notSignedYet').style.display = 'none';
        document.getElementById('successMessage').style.display = 'block';
        
        // Update status badge
        const statusBadge = document.getElementById('statusBadge');
        statusBadge.textContent = result.status.replace('_', ' ').toUpperCase();
        statusBadge.className = `status-badge status-${result.status}`;
        
        // Show signed info
        setTimeout(() => {
            document.getElementById('alreadySigned').style.display = 'block';
            document.getElementById('signedByName').textContent = signedBy;
            document.getElementById('signedDate').textContent = new Date().toLocaleDateString();
            document.getElementById('signatureImage').src = signatureData;
        }, 2000);
        
    } catch (error) {
        console.error('Error signing contract:', error);
        alert(`Failed to sign contract: ${error.message}`);
        signButton.disabled = false;
        signButton.textContent = '✍️ Sign Contract';
    }
}

function downloadPDF(e) {
    e.preventDefault();
    
    if (!contractData) {
        alert('Contract data not loaded');
        return;
    }
    
    // Download PDF via contract ID
    window.location.href = `/api/contracts/${contractData.contractId}/pdf`;
}

function showError(message) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display = 'block';
    document.getElementById('errorMessage').textContent = message;
}
