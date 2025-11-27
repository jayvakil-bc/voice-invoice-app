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
        checkStripeStatus();
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

// ========== STRIPE CONNECT FUNCTIONS ==========

// Check Stripe connection status
async function checkStripeStatus() {
    try {
        const response = await fetch('/api/stripe/connect/status', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to check Stripe status');
        }
        
        const data = await response.json();
        
        const statusText = document.getElementById('stripeStatusText');
        const statusDetails = document.getElementById('stripeStatusDetails');
        const statusIcon = document.getElementById('stripeStatusIcon');
        const connectBtn = document.getElementById('connectStripeBtn');
        const disconnectBtn = document.getElementById('disconnectStripeBtn');
        
        if (!statusText || !statusDetails || !statusIcon || !connectBtn || !disconnectBtn) {
            console.error('[Stripe] Required elements not found');
            return;
        }
        
        if (data.connected && data.chargesEnabled) {
            // Fully connected and can accept payments
            statusText.textContent = '✅ Stripe Connected';
            statusDetails.textContent = 'You can now accept payments from clients!';
            statusIcon.textContent = '✅';
            statusIcon.parentElement.style.background = '#d4edda';
            statusIcon.parentElement.style.borderLeft = '4px solid #28a745';
            
            connectBtn.style.display = 'none';
            disconnectBtn.style.display = 'inline-block';
            
        } else if (data.connected && !data.chargesEnabled) {
            // Connected but onboarding incomplete
            statusText.textContent = '⚠️ Stripe Setup Incomplete';
            statusDetails.textContent = 'Please complete your Stripe onboarding to accept payments.';
            statusIcon.textContent = '⚠️';
            statusIcon.parentElement.style.background = '#fff3cd';
            statusIcon.parentElement.style.borderLeft = '4px solid #ffc107';
            
            connectBtn.style.display = 'inline-block';
            connectBtn.textContent = 'Complete Stripe Setup';
            disconnectBtn.style.display = 'inline-block';
            
        } else {
            // Not connected
            statusText.textContent = '❌ Stripe Not Connected';
            statusDetails.textContent = 'Connect your Stripe account to receive payments from clients.';
            statusIcon.textContent = '❌';
            statusIcon.parentElement.style.background = '#f8d7da';
            statusIcon.parentElement.style.borderLeft = '4px solid #dc3545';
            
            connectBtn.style.display = 'inline-block';
            connectBtn.textContent = 'Connect Stripe Account';
            disconnectBtn.style.display = 'none';
        }
        
        // Check for return from Stripe
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('stripe_setup') === 'success') {
            alert('✅ Stripe account connected successfully! You can now create payment links.');
            // Clean up URL
            window.history.replaceState({}, document.title, '/settings');
            // Recheck status
            setTimeout(() => checkStripeStatus(), 1000);
        } else if (urlParams.get('stripe_refresh') === 'true') {
            alert('⚠️ Stripe setup was interrupted. Please try again.');
            window.history.replaceState({}, document.title, '/settings');
        }
        
    } catch (error) {
        console.error('[Stripe] Error checking status:', error);
        const statusText = document.getElementById('stripeStatusText');
        const statusDetails = document.getElementById('stripeStatusDetails');
        const statusIcon = document.getElementById('stripeStatusIcon');
        
        if (statusText) statusText.textContent = '⚠️ Error checking Stripe status';
        if (statusDetails) statusDetails.textContent = 'Please refresh the page';
        if (statusIcon) statusIcon.textContent = '⚠️';
    }
}

// Connect Stripe account
async function connectStripe() {
    const connectBtn = document.getElementById('connectStripeBtn');
    if (!connectBtn) return;
    
    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting...';
    
    try {
        const response = await fetch('/api/stripe/connect/onboard', {
            method: 'POST',
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success && data.onboardingUrl) {
            // Redirect to Stripe onboarding
            window.location.href = data.onboardingUrl;
        } else {
            throw new Error(data.error || 'Failed to start Stripe onboarding');
        }
        
    } catch (error) {
        console.error('[Stripe] Connection error:', error);
        alert('Failed to connect Stripe: ' + error.message);
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect Stripe Account';
    }
}

// Disconnect Stripe account
async function disconnectStripe() {
    if (!confirm('Are you sure you want to disconnect your Stripe account? You will no longer be able to accept payments until you reconnect.')) {
        return;
    }
    
    try {
        const response = await fetch('/api/stripe/connect/disconnect', {
            method: 'POST',
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('✅ Stripe account disconnected');
            checkStripeStatus();
        } else {
            throw new Error(data.error || 'Failed to disconnect Stripe');
        }
        
    } catch (error) {
        console.error('[Stripe] Disconnect error:', error);
        alert('Failed to disconnect Stripe: ' + error.message);
    }
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

// Add event listeners for Stripe buttons
// Note: These elements are created in the HTML, so they should exist when this script runs
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        const connectBtn = document.getElementById('connectStripeBtn');
        const disconnectBtn = document.getElementById('disconnectStripeBtn');
        
        if (connectBtn) {
            connectBtn.addEventListener('click', connectStripe);
        }
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', disconnectStripe);
        }
    });
} else {
    // DOM is already loaded
    const connectBtn = document.getElementById('connectStripeBtn');
    const disconnectBtn = document.getElementById('disconnectStripeBtn');
    
    if (connectBtn) {
        connectBtn.addEventListener('click', connectStripe);
    }
    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', disconnectStripe);
    }
}
