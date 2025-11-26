# 🎣 STRIPE WEBHOOK SETUP - Payment Email Notifications

## What This Does
When a customer pays an invoice via Stripe, the system will:
1. ✅ Mark the invoice as "PAID" in the database
2. 📧 Send YOU an email notification that payment was received
3. 🎉 Show customer a success page

---

## 🚀 SETUP STEPS

### Option A: Testing Locally (Stripe CLI - Recommended for Dev)

#### Step 1: Install Stripe CLI
```bash
# macOS
brew install stripe/stripe-cli/stripe

# Or download from: https://stripe.com/docs/stripe-cli
```

#### Step 2: Login to Stripe
```bash
stripe login
```
This will open your browser to authenticate.

#### Step 3: Forward Webhooks to Your Local Server
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

You'll see output like:
```
> Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxx
```

#### Step 4: Copy the Webhook Secret
Add to your `.env` file:
```bash
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

#### Step 5: Test It!
1. Keep the `stripe listen` command running
2. Create an invoice in your app
3. Generate a payment link
4. Use test card: `4242 4242 4242 4242`
5. Complete payment
6. Check your email! 📧

---

### Option B: Production Setup (Stripe Dashboard)

#### Step 1: Go to Webhooks
https://dashboard.stripe.com/webhooks

#### Step 2: Add Endpoint
1. Click "Add endpoint"
2. Enter your endpoint URL:
   ```
   https://yourdomain.com/api/stripe/webhook
   ```

#### Step 3: Select Events
Add these events:
- ✅ `checkout.session.completed`
- ✅ `payment_intent.succeeded`

#### Step 4: Copy Signing Secret
After creating the endpoint, click "Reveal" on the signing secret.

Add to your production `.env`:
```bash
STRIPE_WEBHOOK_SECRET=whsec_your_production_webhook_secret
```

#### Step 5: Test with Real Payment
Use Stripe test mode first before going live!

---

## 🧪 TESTING THE WEBHOOK

### Manual Test with Stripe CLI
```bash
# Send a test webhook event
stripe trigger checkout.session.completed
```

### Test with Real Payment
1. Create an invoice
2. Click "..." → "Generate Payment Link"
3. Copy the payment link
4. Open in new browser window
5. Use test card:
   ```
   Card: 4242 4242 4242 4242
   Exp: Any future date
   CVC: Any 3 digits
   ZIP: Any 5 digits
   ```
6. Complete payment
7. Should redirect to success page: `/invoice-success?invoice=INV-XXX`
8. Check your email for payment confirmation! 📧

---

## 📧 EMAIL YOU'LL RECEIVE

When payment succeeds, you get an email like:

```
Subject: 🎉 Payment Received - Invoice INV-001

💰 Payment Received!

Great news! A payment has been received for your invoice.

Invoice Number: INV-001
Customer: John Doe
Payment Date: Nov 25, 2025 3:45 PM
Amount Paid: USD 500.00

✅ The invoice has been automatically marked as PAID in your dashboard.
```

---

## 🐛 TROUBLESHOOTING

### "Webhook signature verification failed"
```bash
# Make sure STRIPE_WEBHOOK_SECRET is set correctly in .env
# If using Stripe CLI, copy the secret from the `stripe listen` output
# If using dashboard webhooks, copy from webhook settings page
```

### No email received after payment
```bash
# 1. Check server logs
tail -f logs/server.log

# 2. Make sure SMTP is configured in .env
SMTP_HOST=smtp.gmail.com
SMTP_USER=your@email.com
SMTP_PASS=your_app_password

# 3. Check webhook is being received
# Look for: [Stripe Webhook] Event received: checkout.session.completed
```

### Payment link doesn't work
```bash
# Make sure user has connected their Stripe account
# Go to Settings → Connect Stripe
# Complete onboarding before generating payment links
```

### "Route not found" on /invoice-success
Server needs to be restarted after adding the route. Run:
```bash
./stop.sh && ./start.sh
```

---

## 💡 PRO TIPS

1. **Keep Stripe CLI Running**: When testing locally, keep `stripe listen` running in a separate terminal

2. **Check Logs**: Server logs show webhook events:
   ```bash
   tail -f logs/server.log | grep Webhook
   ```

3. **Test Mode First**: Always test webhooks in Stripe test mode before going live

4. **Webhook Secret is Different**: 
   - Local (Stripe CLI): `whsec_...`
   - Production (Dashboard): Different `whsec_...`
   - You need both in .env for different environments

5. **No Webhook Secret = Still Works**: The webhook will work even without the secret (for testing), but won't be verified. For production, ALWAYS use the secret!

---

## 🎯 QUICK TEST CHECKLIST

- [ ] Stripe CLI installed and logged in
- [ ] `stripe listen --forward-to localhost:3000/api/stripe/webhook` running
- [ ] STRIPE_WEBHOOK_SECRET added to .env
- [ ] Server restarted (`./stop.sh && ./start.sh`)
- [ ] SMTP configured (for email notifications)
- [ ] Create invoice
- [ ] Generate payment link
- [ ] Pay with test card (4242 4242 4242 4242)
- [ ] Redirected to /invoice-success page ✅
- [ ] Invoice marked as PAID in dashboard ✅
- [ ] Email notification received 📧 ✅

---

## 📚 USEFUL COMMANDS

```bash
# Start Stripe webhook forwarding
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Trigger test webhook
stripe trigger checkout.session.completed

# View webhook events in dashboard
open https://dashboard.stripe.com/test/webhooks

# Check server logs
tail -f logs/server.log

# Test payment with CLI
stripe checkout sessions create \
  --mode payment \
  --line-items="price_1234,1" \
  --success-url="http://localhost:3000/invoice-success"
```

---

## 🎉 YOU'RE DONE!

Now when customers pay your invoices:
- 🎯 Payment processed automatically
- 📧 You get notified via email
- ✅ Invoice marked as paid
- 🤑 Money goes to your (or your user's) Stripe account

Happy invoicing! 💰
