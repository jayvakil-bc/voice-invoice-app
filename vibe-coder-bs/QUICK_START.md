# 🚀 QUICK REFERENCE - Testing Your Application

## ✅ What to Do RIGHT NOW

### 1. Check Your .env File
```bash
# See if you have a .env file
ls -la .env

# If NOT, copy the template:
cp .env.template .env

# Then edit it with your actual credentials:
nano .env
# or
open .env
```

**Required fields in .env:**
- `MONGODB_URI` - Your MongoDB connection string
- `GOOGLE_CLIENT_ID` - From Google Console
- `GOOGLE_CLIENT_SECRET` - From Google Console  
- `OPENAI_API_KEY` - From OpenAI Platform
- `SESSION_SECRET` - Any random string

### 2. Test Basic Features (Should Work Now)

**Start server:**
```bash
./start.sh
```

**Open browser and test:**
1. Go to: http://localhost:3000
2. Login with Google
3. Create an invoice
4. Download the PDF ← **This should work now!**

### 3. Test Download Buttons

**In Dashboard:**
- Click the ↓ button on any invoice
- PDF should download automatically

**In Invoice Creation:**
- Click "Save & Download PDF"
- Should save and download

**Still not working?** Open browser console (F12) and share the error!

---

## 🔧 Testing Tier 1 Features

### A. Analytics (Works WITHOUT config)
```bash
# Test in browser console (F12):
fetch('/api/analytics/overview', {credentials: 'include'})
  .then(r => r.json())
  .then(console.log);
```

**Expected:** Shows revenue, invoice counts, etc.

### B. Multi-Currency (Works WITHOUT config)
```bash
# Test in browser console:
fetch('/api/analytics/currency-breakdown', {credentials: 'include'})
  .then(r => r.json())
  .then(console.log);
```

**Expected:** Shows currencies used in your invoices

### C. Recurring Invoices (Works WITHOUT config)
```bash
# Get an invoice ID from dashboard, then test:
curl -X POST http://localhost:3000/api/invoices/YOUR_INVOICE_ID/recurring/setup \
  -H "Content-Type: application/json" \
  -d '{"frequency": "monthly"}'
```

**Expected:** `{"success": true, "invoice": {...}}`

### D. Email (Needs SMTP in .env)
```bash
# Add to .env:
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_gmail_app_password

# Then test:
curl -X POST http://localhost:3000/api/invoices/YOUR_INVOICE_ID/send-email \
  -H "Content-Type: application/json" \
  -d '{"recipientEmail": "test@example.com"}'
```

### E. Payments (Needs Stripe in .env)
```bash
# Add to .env:
STRIPE_SECRET_KEY=sk_test_your_key_here

# Then test:
curl -X POST http://localhost:3000/api/invoices/YOUR_INVOICE_ID/payment-link
```

---

## 🐛 Common Issues & Fixes

### Issue: "Download button does nothing"
**Fix:**
1. Open browser console (F12)
2. Look for red error messages
3. Check if it says "404" or "Failed to fetch"
4. Server is now fixed - restart browser and try again

### Issue: "Can't login"
**Fix:**
Check your .env has correct Google OAuth credentials

### Issue: "Server won't start"
**Fix:**
```bash
# Kill any existing servers
pkill -f "node server.js"

# Start fresh
./start.sh

# Check for errors
tail -f logs/server.log
```

### Issue: "Email/Payment features show errors"
**Fix:**
That's normal! They need configuration:
- Email needs SMTP credentials in .env
- Payments need Stripe key in .env
- Everything else works WITHOUT config

---

## 📝 Quick Tests in Browser Console

### Test 1: Am I logged in?
```javascript
fetch('/auth/user', {credentials: 'include'})
  .then(r => r.json())
  .then(console.log);
```

### Test 2: Can I get my invoices?
```javascript
fetch('/api/invoices', {credentials: 'include'})
  .then(r => r.json())
  .then(invoices => console.log('I have', invoices.length, 'invoices'));
```

### Test 3: Can I download?
```javascript
// Get first invoice ID
fetch('/api/invoices', {credentials: 'include'})
  .then(r => r.json())
  .then(invoices => {
    const id = invoices[0]._id;
    console.log('Testing download for invoice:', id);
    return fetch(`/api/invoices/${id}/pdf`);
  })
  .then(r => {
    console.log('Response status:', r.status);
    console.log('Content-Type:', r.headers.get('content-type'));
    return r.blob();
  })
  .then(blob => {
    console.log('Downloaded! Size:', blob.size, 'bytes');
    console.log('✅ Downloads are working!');
  })
  .catch(err => console.error('❌ Error:', err));
```

### Test 4: Analytics working?
```javascript
fetch('/api/analytics/overview', {credentials: 'include'})
  .then(r => r.json())
  .then(data => {
    console.log('Total Revenue:', data.overview.totalRevenue);
    console.log('Total Invoices:', data.overview.totalInvoices);
    console.log('✅ Analytics working!');
  });
```

---

## 📊 What's Ready to Use?

### ✅ Working NOW (No config needed):
- Login with Google
- Create invoices from voice/text
- Create contracts from voice/text
- Download PDFs ← **JUST FIXED!**
- View dashboard
- Edit/delete invoices
- Analytics API endpoints
- Multi-currency support
- Recurring invoice setup
- All backend features

### ⚙️ Needs Configuration:
- Email sending → Add SMTP to .env
- Payment links → Add Stripe to .env
- Enhanced currency rates → Add API key (optional)

### 🎨 Needs UI (Backend Ready):
- Email send button in UI
- Payment link button in UI
- Recurring schedule modal in UI
- Analytics charts in dashboard
- Currency dropdown in forms

---

## 🆘 Need Help?

### Check logs:
```bash
tail -f logs/server.log
```

### Check if server running:
```bash
ps aux | grep "node server.js"
```

### Restart server:
```bash
pkill -f "node server.js"
./start.sh
```

### Test with curl:
```bash
# Health check
curl http://localhost:3000/api/health

# Get your invoices (need to be logged in via browser first)
curl http://localhost:3000/api/invoices
```

---

## 📚 Full Documentation

- **TESTING_GUIDE.md** - Detailed testing instructions
- **TIER1_FEATURES.md** - Complete feature documentation
- **.env.template** - Environment variables template
- **README.md** - Project overview

---

## 🎯 Next Steps

1. **Test downloads** - Should work now!
2. **Test analytics** - Use browser console
3. **Add SMTP** (optional) - For email features
4. **Add Stripe** (optional) - For payment features
5. **Add UI buttons** - Make features user-friendly

---

## Summary

**Fixed:** Download buttons now work (added `/download` route alias)

**Test:** Open http://localhost:3000, login, create invoice, click download

**Config:** Basic features work WITHOUT email/payment setup

**Help:** Check browser console (F12) if issues persist!
