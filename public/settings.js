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
        
        loadBusinessContext();
    } catch (error) {
        console.error('Error checking auth:', error);
        window.location.href = '/';
    }
}

// Load business context
async function loadBusinessContext() {
    try {
        const response = await fetch('/api/business-context', {
            credentials: 'include'
        });
        
        const context = await response.json();
        
        // Fill form fields
        document.getElementById('companyName').value = context.companyName || '';
        document.getElementById('address').value = context.address || '';
        document.getElementById('phone').value = context.phone || '';
        document.getElementById('email').value = context.email || '';
        document.getElementById('defaultCurrency').value = context.defaultCurrency || 'USD';
        document.getElementById('defaultPaymentTerms').value = context.defaultPaymentTerms || '';
        
        // Display frequent clients
        displayFrequentClients(context.frequentClients || []);
        
        // Display common services
        displayCommonServices(context.commonServices || []);
    } catch (error) {
        console.error('Error loading business context:', error);
    }
}

// Display frequent clients
function displayFrequentClients(clients) {
    const container = document.getElementById('frequentClients');
    
    if (clients.length === 0) {
        container.innerHTML = '<p style="color: #999; font-style: italic;">No clients saved yet. They will appear here after you create invoices.</p>';
        return;
    }
    
    // Sort by last used
    clients.sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed));
    
    container.innerHTML = clients.map((client, index) => `
        <div class="saved-item">
            <div class="saved-item-info">
                <strong>${client.name}</strong>
                <span>${client.company ? client.company + ' • ' : ''}${client.email || 'No email'}</span>
            </div>
            <button class="btn-remove" onclick="removeClient(${index})">Remove</button>
        </div>
    `).join('');
}

// Display common services
function displayCommonServices(services) {
    const container = document.getElementById('commonServices');
    
    if (services.length === 0) {
        container.innerHTML = '<p style="color: #999; font-style: italic;">No services saved yet. They will appear here after you create invoices.</p>';
        return;
    }
    
    // Sort by last used
    services.sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed));
    
    container.innerHTML = services.map((service, index) => `
        <div class="saved-item">
            <div class="saved-item-info">
                <strong>${service.description}</strong>
                <span>Rate: $${service.rate.toFixed(2)}</span>
            </div>
            <button class="btn-remove" onclick="removeService(${index})">Remove</button>
        </div>
    `).join('');
}

// Remove client
async function removeClient(index) {
    try {
        const response = await fetch('/api/business-context', {
            credentials: 'include'
        });
        const context = await response.json();
        
        context.frequentClients.splice(index, 1);
        
        await fetch('/api/business-context', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(context)
        });
        
        displayFrequentClients(context.frequentClients);
    } catch (error) {
        console.error('Error removing client:', error);
        alert('Failed to remove client');
    }
}

// Remove service
async function removeService(index) {
    try {
        const response = await fetch('/api/business-context', {
            credentials: 'include'
        });
        const context = await response.json();
        
        context.commonServices.splice(index, 1);
        
        await fetch('/api/business-context', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(context)
        });
        
        displayCommonServices(context.commonServices);
    } catch (error) {
        console.error('Error removing service:', error);
        alert('Failed to remove service');
    }
}

// Save business settings
document.getElementById('businessForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const settings = {
        companyName: document.getElementById('companyName').value,
        address: document.getElementById('address').value,
        phone: document.getElementById('phone').value,
        email: document.getElementById('email').value,
        defaultCurrency: document.getElementById('defaultCurrency').value,
        defaultPaymentTerms: document.getElementById('defaultPaymentTerms').value
    };
    
    try {
        const response = await fetch('/api/business-context', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(settings)
        });
        
        if (response.ok) {
            const successMsg = document.getElementById('successMessage');
            successMsg.classList.add('show');
            setTimeout(() => {
                successMsg.classList.remove('show');
            }, 3000);
        } else {
            alert('Failed to save settings');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        alert('Failed to save settings');
    }
});

// Logout
function logout() {
    window.location.href = '/auth/logout';
}

// Initialize
checkAuth();
