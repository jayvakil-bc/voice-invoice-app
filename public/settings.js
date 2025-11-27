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
        // User info is now in sidebar, no need to set it here
        
        // Initialize dark mode
        initDarkMode();
        
        loadBusinessInfo();
    } catch (error) {
        console.error('Error checking auth:', error);
        window.location.href = '/';
    }
}

// Load business info
async function loadBusinessInfo() {
    try {
        const response = await fetch('/api/user/business-info', {
            credentials: 'include'
        });
        
        const data = await response.json();
        const info = data.businessInfo;
        
        if (info) {
            // Fill form fields with business info
            document.getElementById('companyName').value = info.businessName || '';
            document.getElementById('address').value = info.businessAddress || '';
            document.getElementById('phone').value = info.businessPhone || '';
            document.getElementById('email').value = info.businessEmail || '';
        }
        
        // Note: We're keeping currency/payment terms for backward compatibility
        // but focusing on the core business info from onboarding
        
    } catch (error) {
        console.error('Error loading business info:', error);
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
    
    const businessInfo = {
        businessName: document.getElementById('companyName').value.trim(),
        businessAddress: document.getElementById('address').value.trim(),
        businessPhone: document.getElementById('phone').value.trim(),
        businessEmail: document.getElementById('email').value.trim()
    };
    
    try {
        const response = await fetch('/api/user/business-info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(businessInfo)
        });
        
        if (response.ok) {
            const successMsg = document.getElementById('successMessage');
            successMsg.classList.add('show');
            setTimeout(() => {
                successMsg.classList.remove('show');
            }, 3000);
        } else {
            const error = await response.json();
            alert(error.error || 'Failed to save settings');
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

// Dark Mode Functions
function initDarkMode() {
    const darkMode = localStorage.getItem('darkMode');
    if (darkMode === 'enabled') {
        document.body.classList.add('dark-mode');
        updateDarkModeIcon(true);
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
}

// Initialize
checkAuth();
