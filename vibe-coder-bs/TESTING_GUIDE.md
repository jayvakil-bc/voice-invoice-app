# 🚀 Quick Start Guide - Testing Tier 1 Features

## Part 1: Environment Setup (.env Configuration)

### Step 1: Copy the example file
```bash
cp .env.example .env
```

### Step 2: Configure Basic Settings (Already Working)
Open `.env` and make sure these are set:
```bash
# Server
PORT=3000
NODE_ENV=development
CLIENT_URL=http://localhost:3000
APP_URL=http://localhost:3000

# MongoDB - Use your existing connection
MONGODB_URI=your_mongodb_connection_string_here

# Session Secret - Use a random string
SESSION_SECRET=your-random-secret-key-here

# Google OAuth - Your existing credentials
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# OpenAI - Your existing key
OPENAI_API_KEY=sk-your-openai-api-key
```

### Step 3: Configure Tier 1 Features (OPTIONAL - Skip for Now)

#### A. Email Setup (OPTIONAL - For Testing Email Features)
```bash
# Gmail SMTP (Recommended for testing)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_gmail_app_password
SMTP_FROM_NAME=Invoice System
```

**How to get Gmail App Password:**
1. Go to https://myaccount.google.com/apppasswords
2. Enable 2-Factor Authentication first (if not enabled)
3. Generate an app password named "Invoice App"
4. Copy the 16-character password
5. Paste it in `SMTP_PASSWORD` (no spaces)

#### B. Stripe Setup (OPTIONAL - For Testing Payments)
```bash
STRIPE_SECRET_KEY=sk_test_your_test_key_here
```

**How to get Stripe Test Key:**
1. Sign up at https://stripe.com
2. Go to https://dashboard.stripe.com/test/apikeys
3. Copy the "Secret key" (starts with `sk_test_`)
4. Paste it in `STRIPE_SECRET_KEY`

#### C. Currency API (OPTIONAL - Uses Free Fallback)
```bash
EXCHANGE_RATE_API_KEY=your_api_key
```

**How to get Currency API Key:**
1. Go to https://www.exchangerate-api.com/
2. Sign up for free (1500 requests/month)
3. Copy your API key
4. Paste it in `EXCHANGE_RATE_API_KEY`

**Note:** Currency conversion works WITHOUT this key using free endpoints!

---

## Part 2: Testing the Application

### Starting the Server
```bash
# Option 1: Using start script
./start.sh

# Option 2: Manual start
npm start

# Option 3: Development mode
npm run dev
```

Server should show:
```
✅ MongoDB Connected
✅ Auth routes ready
✅ Invoice routes ready
✅ Contract routes ready
✅ Analytics routes ready
✅ Recurring invoice cron job started
```

### Testing Basic Features (Already Working)

#### 1. Login & Dashboard
1. Go to http://localhost:3000
2. Click "Sign in with Google"
3. You should see the dashboard

#### 2. Create Invoice (Test Existing Feature)
1. Click "New Invoice" or go to http://localhost:3000/create
2. Speak or type your invoice details
3. Click "Generate Invoice"
4. Invoice should appear in preview

#### 3. Download Invoice (Fix This)
1. In dashboard, click the ↓ button on any invoice
2. PDF should download
3. **If not working, check browser console for errors**

---

## Part 3: Testing Tier 1 Features

### A. Test Multi-Currency (Works WITHOUT Config)

#### Using Browser Console:
```javascript
// Test currency conversion
fetch('/api/analytics/currency-breakdown')
  .then(r => r.json())
  .then(console.log);
```

#### Using curl:
```bash
# Get supported currencies
curl http://localhost:3000/api/analytics/currency-breakdown
```

**Expected:** List of currencies with amounts

---

### B. Test Analytics Dashboard (Works WITHOUT Config)

```bash
# 1. Get overview stats
curl http://localhost:3000/api/analytics/overview

# 2. Get revenue trends
curl http://localhost:3000/api/analytics/revenue-trends

# 3. Get top clients
curl http://localhost:3000/api/analytics/top-clients

# 4. Get payment status breakdown
curl http://localhost:3000/api/analytics/payment-status

# 5. Get recent activity
curl http://localhost:3000/api/analytics/recent-activity
```

**Expected Response Example:**
```json
{
  "overview": {
    "totalRevenue": "15000.00",
    "pendingAmount": "5000.00",
    "overdueAmount": "1200.00",
    "totalInvoices": 45,
    "paidInvoices": 30,
    "pendingInvoices": 12,
    "overdueInvoices": 3,
    "totalContracts": 8
  }
}
```

---

### C. Test Recurring Invoices (Works WITHOUT Config)

```bash
# 1. First, create a regular invoice through the UI

# 2. Setup recurring schedule (replace INVOICE_ID with actual ID)
curl -X POST http://localhost:3000/api/invoices/INVOICE_ID/recurring/setup \
  -H "Content-Type: application/json" \
  -d '{
    "frequency": "monthly",
    "endDate": "2026-12-31"
  }'

# 3. Check the invoice was updated
curl http://localhost:3000/api/invoices/INVOICE_ID

# 4. Manually trigger cron job (for testing)
# In Node.js console:
node -e "require('./utils/recurringService').processRecurringInvoices().then(console.log)"
```

**Expected:** 
- Invoice marked as recurring
- Next generation date set
- Cron job will auto-generate on schedule

---

### D. Test Email Sending (Requires SMTP Setup)

**Prerequisites:** SMTP credentials configured in `.env`

```bash
# 1. Send invoice via email (replace INVOICE_ID)
curl -X POST http://localhost:3000/api/invoices/INVOICE_ID/send-email \
  -H "Content-Type: application/json" \
  -d '{
    "recipientEmail": "your_test_email@gmail.com",
    "includePaymentLink": false
  }'
```

**Expected if SMTP configured:**
```json
{
  "success": true,
  "messageId": "...",
  "paymentLink": null
}
```

**Expected if SMTP NOT configured:**
```json
{
  "error": "Email service not configured. Please add SMTP credentials to .env"
}
```

---

### E. Test Payment Links (Requires Stripe Setup)

**Prerequisites:** `STRIPE_SECRET_KEY` configured in `.env`

```bash
# 1. Create payment link (replace INVOICE_ID)
curl -X POST http://localhost:3000/api/invoices/INVOICE_ID/payment-link

# 2. Send invoice with payment link
curl -X POST http://localhost:3000/api/invoices/INVOICE_ID/send-email \
  -H "Content-Type: application/json" \
  -d '{
    "recipientEmail": "client@example.com",
    "includePaymentLink": true
  }'
```

**Expected if Stripe configured:**
```json
{
  "success": true,
  "paymentLink": "https://pay.stripe.com/...",
  "invoiceId": "..."
}
```

**Expected if Stripe NOT configured:**
```json
{
  "error": "Stripe not configured. Please add STRIPE_SECRET_KEY to .env"
}
```

---

## Part 4: Fixing Download/Save Buttons

### Common Issues & Solutions:

#### Issue 1: "Download button does nothing"

**Fix:** Check browser console (F12) for errors

```javascript
// Test download directly in browser console
fetch('/api/invoices/YOUR_INVOICE_ID/pdf')
  .then(r => r.blob())
  .then(blob => {
    console.log('PDF size:', blob.size);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'test.pdf';
    a.click();
  });
```

#### Issue 2: "PDF downloads but is empty or corrupted"

**Check server logs:**
```bash
tail -f logs/server.log | grep PDF
```

**Test PDF generation directly:**
```bash
curl http://localhost:3000/api/invoices/YOUR_INVOICE_ID/pdf -o test.pdf
open test.pdf  # macOS
# or
xdg-open test.pdf  # Linux
```

#### Issue 3: "Save & Download button in invoice.html not working"

**Check if invoice was saved:**
```javascript
// In browser console on invoice.html
console.log('Current invoice ID:', invoiceId);
```

If `invoiceId` is undefined, the invoice wasn't saved properly.

**Fix:** Make sure to save invoice first before downloading:
1. Click "Generate Invoice" 
2. Wait for preview to load
3. Then click "Save & Download"

---

## Part 5: Testing with Browser Console

### Open browser console (F12) and run these tests:

#### Test 1: Check Authentication
```javascript
fetch('/auth/user', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log);
```
**Expected:** User object with your Google profile

#### Test 2: Get All Invoices
```javascript
fetch('/api/invoices', { credentials: 'include' })
  .then(r => r.json())
  .then(invoices => {
    console.log('Total invoices:', invoices.length);
    console.log('First invoice:', invoices[0]);
  });
```

#### Test 3: Download First Invoice
```javascript
fetch('/api/invoices', { credentials: 'include' })
  .then(r => r.json())
  .then(invoices => {
    const id = invoices[0]._id;
    return fetch(`/api/invoices/${id}/pdf`);
  })
  .then(r => r.blob())
  .then(blob => {
    console.log('PDF downloaded, size:', blob.size, 'bytes');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'test-invoice.pdf';
    a.click();
  });
```

#### Test 4: Get Analytics
```javascript
fetch('/api/analytics/overview', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log);
```

---

## Part 6: Quick Debug Checklist

### If downloads aren't working:

- [ ] Check browser console for errors (F12)
- [ ] Check Network tab for failed requests
- [ ] Verify server is running (`ps aux | grep node`)
- [ ] Check server logs (`tail -f logs/server.log`)
- [ ] Try downloading from different page (dashboard vs invoice view)
- [ ] Clear browser cache and try again
- [ ] Test with curl to isolate browser issues

### If Tier 1 features show errors:

- [ ] Feature works without config (Analytics, Currency, Recurring)
- [ ] Feature needs config (Email needs SMTP, Payments need Stripe)
- [ ] Check `.env` file exists and has correct values
- [ ] Restart server after changing `.env`
- [ ] Check server startup logs for integration warnings

### If server won't start:

```bash
# Kill any existing node processes
pkill -f "node server.js"

# Check what's using port 3000
lsof -i :3000

# Start fresh
./start.sh
```

---

## Part 7: Visual Testing (UI)

### What Works NOW (No Config Needed):
1. ✅ Login with Google
2. ✅ Dashboard shows invoices/contracts
3. ✅ Create invoice from voice/text
4. ✅ Create contract from voice/text
5. ✅ Download PDFs
6. ✅ Edit/Delete invoices
7. ✅ View invoice details
8. ✅ Analytics API endpoints (backend ready)
9. ✅ Multi-currency support (backend ready)
10. ✅ Recurring invoices (backend ready)

### What Needs UI Updates (Backend Ready):
1. ⏳ Email send button (backend ready, needs UI button)
2. ⏳ Payment link generator (backend ready, needs UI button)
3. ⏳ Recurring schedule form (backend ready, needs UI modal)
4. ⏳ Analytics charts (backend ready, needs Chart.js integration)
5. ⏳ Currency selector (backend ready, needs dropdown)

---

## Part 8: Sample Test Script

Save this as `test-tier1.sh`:

```bash
#!/bin/bash

echo "🧪 Testing Tier 1 Features..."
echo ""

# Test 1: Analytics Overview
echo "📊 Test 1: Analytics Overview"
curl -s http://localhost:3000/api/analytics/overview | jq .
echo ""

# Test 2: Revenue Trends
echo "📈 Test 2: Revenue Trends"
curl -s http://localhost:3000/api/analytics/revenue-trends | jq .
echo ""

# Test 3: Top Clients
echo "👥 Test 3: Top Clients"
curl -s http://localhost:3000/api/analytics/top-clients | jq .
echo ""

# Test 4: Payment Status
echo "💰 Test 4: Payment Status"
curl -s http://localhost:3000/api/analytics/payment-status | jq .
echo ""

# Test 5: Currency Breakdown
echo "💱 Test 5: Currency Breakdown"
curl -s http://localhost:3000/api/analytics/currency-breakdown | jq .
echo ""

echo "✅ All tests complete!"
```

Make it executable and run:
```bash
chmod +x test-tier1.sh
./test-tier1.sh
```

---

## Need Help?

### Server logs location:
```bash
tail -f logs/server.log
```

### Check if server is running:
```bash
ps aux | grep "node server.js"
```

### Restart server:
```bash
./stop.sh
./start.sh
```

### Common ports:
- Server: http://localhost:3000
- Dashboard: http://localhost:3000/dashboard
- Create Invoice: http://localhost:3000/create
- Create Contract: http://localhost:3000/create-contract

---

## Summary

**To test Tier 1 features RIGHT NOW (no config needed):**
1. Start server: `./start.sh`
2. Open browser: http://localhost:3000
3. Login with Google
4. Try creating an invoice
5. Try downloading the PDF
6. Test analytics in browser console (see Part 5)

**To enable Email & Payments:**
1. Add SMTP credentials to `.env`
2. Add Stripe key to `.env`
3. Restart server
4. Test with curl commands above

**If downloads don't work:**
1. Open browser console (F12)
2. Look for red errors
3. Share the error message
4. I'll help debug!
