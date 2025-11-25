# Tier 1 Features Implementation

## Overview
This document describes the Tier 1 critical features that have been added to the Voice Invoice application:

1. **Email Integration** - Send invoices and contracts via email with PDF attachments
2. **Payment Links** - Generate Stripe payment links for invoices
3. **Recurring Invoices** - Automatically generate recurring invoices on schedule
4. **Analytics Dashboard** - Business insights and metrics
5. **Multi-Currency Support** - Support for 18+ currencies with live exchange rates

---

## 1. Email Integration

### Features
- Send invoices and contracts via email with PDF attachments
- Professional HTML email templates
- Optional Stripe payment link inclusion
- Support for any SMTP provider (Gmail, SendGrid, etc.)

### API Endpoints
```
POST /api/invoices/:id/send-email
Body: {
  "recipientEmail": "client@example.com",
  "includePaymentLink": true  // optional
}
```

### Configuration (.env)
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_specific_password
SMTP_FROM_NAME=Invoice System
```

### Gmail Setup
1. Enable 2-factor authentication on your Gmail account
2. Generate an app-specific password at https://myaccount.google.com/apppasswords
3. Use that password in `SMTP_PASSWORD`

### Email Template Features
- Professional branded design
- Invoice/contract details summary
- Inline payment button (if Stripe payment link included)
- PDF attachment
- Customizable sender name

---

## 2. Stripe Payment Links

### Features
- Generate secure Stripe payment links for invoices
- Automatic payment status tracking
- Multi-currency support
- Webhook integration for payment events
- Redirect to success page after payment

### API Endpoints
```
POST /api/invoices/:id/payment-link
Response: {
  "success": true,
  "paymentLink": "https://pay.stripe.com/...",
  "invoiceId": "..."
}

PUT /api/invoices/:id/payment-status
Body: {
  "status": "paid|pending|overdue|cancelled",
  "paymentDate": "2024-01-15",
  "stripePaymentId": "pi_..."
}
```

### Configuration (.env)
```bash
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
# For production: sk_live_your_stripe_live_key
APP_URL=http://localhost:3000  # For payment redirect
```

### Stripe Setup
1. Sign up at https://stripe.com
2. Get your test API key from https://dashboard.stripe.com/test/apikeys
3. Add to `.env` as `STRIPE_SECRET_KEY`
4. For production, switch to live keys

### Payment Flow
1. Generate payment link via API
2. Send link to client (via email or manually)
3. Client pays via Stripe
4. Webhook updates invoice status to "paid"
5. Client redirected to success page

### Invoice Model Changes
New fields added:
- `currency` (String, default: 'USD')
- `paymentStatus` (enum: 'pending', 'paid', 'overdue', 'cancelled')
- `paymentLink` (String)
- `paymentDate` (Date)
- `stripePaymentId` (String)

---

## 3. Recurring Invoices

### Features
- Automatic recurring invoice generation
- Multiple frequency options (weekly, bi-weekly, monthly, quarterly, yearly)
- Optional end date
- Cron job runs daily at 2:00 AM
- Preserves all line items and pricing from original
- Auto-increments invoice numbers

### API Endpoints
```
POST /api/invoices/:id/recurring/setup
Body: {
  "frequency": "monthly",  // weekly|bi-weekly|monthly|quarterly|yearly
  "endDate": "2024-12-31"  // optional
}

DELETE /api/invoices/:id/recurring/cancel
```

### How It Works
1. Create a regular invoice
2. Set up recurring schedule via API
3. System automatically generates new invoices on schedule
4. Each generated invoice:
   - Gets new invoice number (e.g., INV-0001-R1, INV-0001-R2)
   - Has same line items and pricing
   - Has fresh date and due date (30 days out)
   - Starts with "pending" payment status

### Invoice Model Changes
New fields added:
- `isRecurring` (Boolean)
- `recurringSchedule` (Object):
  - `frequency` (enum)
  - `nextInvoiceDate` (Date)
  - `endDate` (Date, optional)
  - `lastGeneratedDate` (Date)
- `parentInvoiceId` (ObjectId ref)

### Cron Job
- Runs daily at 2:00 AM
- Checks for invoices due for generation
- Automatically creates new invoices
- Updates parent invoice's next generation date
- Logs all activity

---

## 4. Analytics Dashboard

### Features
- Revenue overview (total, pending, overdue)
- Revenue trends (last 12 months)
- Top clients by revenue
- Payment status breakdown
- Recent activity feed
- Multi-currency breakdown

### API Endpoints
```
GET /api/analytics/overview
GET /api/analytics/revenue-trends
GET /api/analytics/top-clients?limit=10
GET /api/analytics/payment-status
GET /api/analytics/recent-activity?limit=10
GET /api/analytics/currency-breakdown
```

### Overview Response
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

### Revenue Trends Response
```json
{
  "trends": [
    { "month": "2024-01", "revenue": "2500.00" },
    { "month": "2024-02", "revenue": "3200.00" },
    ...
  ]
}
```

### Top Clients Response
```json
{
  "topClients": [
    {
      "name": "Acme Corp",
      "email": "acme@example.com",
      "totalRevenue": "8500.00",
      "invoiceCount": 12,
      "paidAmount": "7000.00",
      "pendingAmount": "1500.00"
    },
    ...
  ]
}
```

### Payment Status Breakdown
```json
{
  "breakdown": {
    "paid": { "count": 30, "amount": "15000.00" },
    "pending": { "count": 12, "amount": "5000.00" },
    "overdue": { "count": 3, "amount": "1200.00" },
    "cancelled": { "count": 0, "amount": "0.00" }
  }
}
```

---

## 5. Multi-Currency Support

### Features
- Support for 18+ major currencies
- Live exchange rates via API
- Currency symbols in PDFs
- Currency conversion utilities
- 1-hour rate caching to minimize API calls

### Supported Currencies
- USD ($) - US Dollar
- EUR (€) - Euro
- GBP (£) - British Pound
- INR (₹) - Indian Rupee
- CAD (C$) - Canadian Dollar
- AUD (A$) - Australian Dollar
- JPY (¥) - Japanese Yen
- CNY (¥) - Chinese Yuan
- CHF (Fr) - Swiss Franc
- SGD (S$) - Singapore Dollar
- HKD (HK$) - Hong Kong Dollar
- NZD (NZ$) - New Zealand Dollar
- SEK (kr) - Swedish Krona
- NOK (kr) - Norwegian Krone
- MXN ($) - Mexican Peso
- BRL (R$) - Brazilian Real
- ZAR (R) - South African Rand
- AED (د.إ) - UAE Dirham

### API
```javascript
const { 
  convertCurrency, 
  getCurrencySymbol, 
  getSupportedCurrencies 
} = require('./utils/currencyService');

// Convert 100 USD to EUR
const eurAmount = await convertCurrency(100, 'USD', 'EUR');

// Get currency symbol
const symbol = getCurrencySymbol('USD'); // Returns '$'

// List all currencies
const currencies = getSupportedCurrencies();
```

### Configuration (.env)
```bash
# Optional - without this, uses free tier (1500 requests/month)
EXCHANGE_RATE_API_KEY=your_exchange_rate_api_key
```

### Exchange Rate API Setup (Optional)
1. Sign up at https://www.exchangerate-api.com/
2. Get your free API key (1500 requests/month)
3. Add to `.env` as `EXCHANGE_RATE_API_KEY`
4. If not provided, app uses open.er-api.com (also free, also limited)

### Rate Caching
- Rates cached for 1 hour
- Minimizes API calls
- Falls back to cached rates if API fails
- Uses fallback rates if no cache available

### Invoice Model Changes
- `currency` field added (String, default: 'USD')
- PDFs now show currency symbols
- All monetary calculations respect currency

---

## Testing the Features

### 1. Test Email (without configuration)
```bash
curl -X POST http://localhost:3000/api/invoices/INVOICE_ID/send-email \
  -H "Content-Type: application/json" \
  -d '{"recipientEmail": "test@example.com"}'

# Expected: Error message about missing SMTP config
```

### 2. Test Payment Link (without configuration)
```bash
curl -X POST http://localhost:3000/api/invoices/INVOICE_ID/payment-link

# Expected: Error message about missing Stripe config
```

### 3. Test Recurring Setup
```bash
curl -X POST http://localhost:3000/api/invoices/INVOICE_ID/recurring/setup \
  -H "Content-Type: application/json" \
  -d '{"frequency": "monthly", "endDate": "2024-12-31"}'

# Expected: Success (no config needed)
```

### 4. Test Analytics
```bash
curl http://localhost:3000/api/analytics/overview

# Expected: Revenue and invoice stats
```

### 5. Test Currency Conversion
```bash
# In Node.js console:
const { convertCurrency } = require('./utils/currencyService');
convertCurrency(100, 'USD', 'EUR').then(console.log);

# Expected: ~92 (depending on current rates)
```

---

## UI Integration TODO

The backend is complete. Here's what needs to be added to the frontend:

### Dashboard (`dashboard.html`)
- [ ] Add analytics charts (Chart.js)
  - Revenue trends line chart
  - Payment status pie chart
  - Top clients bar chart
- [ ] Add overview metrics cards
  - Total revenue
  - Pending amount
  - Overdue amount
  - Invoice/contract counts
- [ ] Add recent activity feed

### Invoice View (`invoice.html`)
- [ ] Add "Send via Email" button
  - Modal for recipient email
  - Checkbox for "Include payment link"
- [ ] Add "Generate Payment Link" button
  - Display generated link
  - Copy to clipboard button
- [ ] Add "Setup Recurring" button
  - Modal for frequency selection
  - Optional end date picker
- [ ] Add currency dropdown (when creating/editing)
- [ ] Display payment status badge
- [ ] Show recurring schedule info (if applicable)

### Example UI Code

#### Send Email Modal
```html
<button onclick="sendInvoiceEmail()">Send via Email</button>

<script>
async function sendInvoiceEmail() {
  const email = prompt('Recipient email:');
  const includePayment = confirm('Include payment link?');
  
  const response = await fetch(`/api/invoices/${invoiceId}/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipientEmail: email,
      includePaymentLink: includePayment
    })
  });
  
  const result = await response.json();
  alert(result.success ? 'Email sent!' : `Error: ${result.error}`);
}
</script>
```

#### Analytics Dashboard
```html
<canvas id="revenueChart"></canvas>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
async function loadAnalytics() {
  // Get data
  const overview = await fetch('/api/analytics/overview').then(r => r.json());
  const trends = await fetch('/api/analytics/revenue-trends').then(r => r.json());
  
  // Display metrics
  document.getElementById('totalRevenue').textContent = `$${overview.overview.totalRevenue}`;
  
  // Create chart
  new Chart(document.getElementById('revenueChart'), {
    type: 'line',
    data: {
      labels: trends.trends.map(t => t.month),
      datasets: [{
        label: 'Revenue',
        data: trends.trends.map(t => t.revenue),
        borderColor: '#2563eb',
        tension: 0.4
      }]
    }
  });
}

loadAnalytics();
</script>
```

---

## Package Dependencies

New packages added:
```json
{
  "nodemailer": "^6.9.7",
  "stripe": "^14.8.0",
  "node-cron": "^3.0.3",
  "axios": "^1.6.2"
}
```

Install with:
```bash
npm install nodemailer stripe node-cron axios
```

---

## Architecture Changes

### New Files Created
- `utils/emailService.js` - Email sending functionality
- `utils/paymentService.js` - Stripe payment link generation
- `utils/recurringService.js` - Recurring invoice logic + cron job
- `utils/currencyService.js` - Currency conversion and formatting
- `controllers/analyticsController.js` - Analytics endpoints
- `routes/analyticsRoutes.js` - Analytics route definitions

### Modified Files
- `models/Invoice.js` - Added payment, currency, and recurring fields
- `controllers/invoiceController.js` - Added email/payment/recurring endpoints
- `routes/invoiceRoutes.js` - Added new endpoint routes
- `routes/index.js` - Exported analytics routes
- `server.js` - Registered analytics routes, started cron job, test integrations
- `.env.example` - Documented new environment variables

---

## Production Checklist

Before deploying to production:

1. **Email Setup**
   - [ ] Configure SMTP credentials
   - [ ] Test email delivery
   - [ ] Configure SMTP_FROM_NAME

2. **Stripe Setup**
   - [ ] Switch to live Stripe API key
   - [ ] Configure webhook endpoint
   - [ ] Test payment flow end-to-end
   - [ ] Set correct APP_URL for redirects

3. **Currency API**
   - [ ] Sign up for API key (optional but recommended)
   - [ ] Test rate fetching
   - [ ] Verify caching works

4. **Recurring Invoices**
   - [ ] Verify cron job runs on server
   - [ ] Test invoice generation manually
   - [ ] Set up monitoring/alerts

5. **Analytics**
   - [ ] Add authentication to all endpoints (already done)
   - [ ] Test with production data
   - [ ] Consider adding date range filters

6. **Security**
   - [ ] Validate all user inputs
   - [ ] Rate limit API endpoints
   - [ ] Add webhook signature verification for Stripe
   - [ ] Use HTTPS in production
   - [ ] Secure session cookies

---

## Future Enhancements

These features could be added as Tier 2:

- **Email Templates**: Customizable email templates per user
- **Payment Reminders**: Automatic reminders for overdue invoices
- **Bulk Operations**: Send multiple invoices at once
- **Invoice Templates**: Save and reuse invoice templates
- **Client Portal**: Allow clients to view/pay invoices directly
- **Expense Tracking**: Track expenses against revenue
- **Tax Calculations**: Automatic tax calculation by region
- **Reporting**: Export analytics to PDF/Excel
- **Notifications**: In-app notifications for payments received
- **Multi-language**: Internationalization support

---

## Support & Troubleshooting

### Email not sending
1. Check SMTP credentials in `.env`
2. For Gmail, ensure app-specific password is used
3. Check firewall/network doesn't block port 587
4. Test with: `node -e "require('./utils/emailService').testEmailConfig()"`

### Payment links not working
1. Verify STRIPE_SECRET_KEY in `.env`
2. Check key starts with `sk_test_` (test) or `sk_live_` (production)
3. Ensure APP_URL is set correctly for redirects
4. Test with: `node -e "require('./utils/paymentService').testStripeConfig()"`

### Recurring invoices not generating
1. Check cron job started: Look for "Recurring invoice cron job started" in logs
2. Verify server stays running at 2:00 AM
3. Test manually: `node -e "require('./utils/recurringService').processRecurringInvoices()"`

### Currency conversion failing
1. Check internet connectivity
2. Try without API key (uses free endpoint)
3. Verify EXCHANGE_RATE_API_KEY if provided
4. Check rate cache: rates cached for 1 hour

### Analytics showing incorrect data
1. Verify MongoDB connection
2. Check invoice data has correct fields (currency, paymentStatus, paymentDate)
3. Test individual endpoints with curl
4. Check date calculations (timezone issues)

---

## Conclusion

All Tier 1 features are now implemented in the backend. The system is ready for:
- Sending professional invoices via email
- Accepting payments through Stripe
- Automatically generating recurring invoices
- Providing business analytics insights
- Supporting international currencies

Next step: Add frontend UI components to make these features accessible to users.
