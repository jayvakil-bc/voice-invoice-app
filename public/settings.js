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
