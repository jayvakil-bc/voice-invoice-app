console.log('[Onboarding] Script loaded');

document.getElementById('onboardingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Setting up...';
    
    const businessInfo = {
        businessName: document.getElementById('businessName').value.trim(),
        businessAddress: document.getElementById('businessAddress').value.trim(),
        businessEmail: document.getElementById('businessEmail').value.trim(),
        businessPhone: document.getElementById('businessPhone').value.trim(),
        website: document.getElementById('website').value.trim() || null,
        taxId: document.getElementById('taxId').value.trim() || null
    };
    
    console.log('[Onboarding] Submitting business info:', businessInfo);
    
    try {
        const response = await fetch('/api/user/business-info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(businessInfo)
        });
        
        console.log('[Onboarding] Response status:', response.status);
        
        if (response.ok) {
            const data = await response.json();
            console.log('[Onboarding] Setup successful:', data);
            
            // Show success animation
            submitBtn.textContent = '✅ Success!';
            submitBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            
            // Redirect to dashboard after short delay
            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 1000);
        } else {
            const error = await response.json();
            console.error('[Onboarding] Setup failed:', error);
            alert(error.error || 'Failed to save business information. Please try again.');
            submitBtn.disabled = false;
            submitBtn.textContent = '🚀 Complete Setup';
        }
    } catch (error) {
        console.error('[Onboarding] Error:', error);
        alert('An error occurred. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = '🚀 Complete Setup';
    }
});

// Auto-focus first field
document.getElementById('businessName').focus();
