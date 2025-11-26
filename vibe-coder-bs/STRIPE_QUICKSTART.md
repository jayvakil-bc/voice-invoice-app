# 🚀 STRIPE CONNECT & EMAIL - QUICK REFERENCE

## ⚡ WHAT CHANGED?

### Before (Old Way) ❌
- All payments went to YOUR Stripe account
- Users couldn't receive money directly
- Not scalable for multi-user platform

### After (New Way with Stripe Connect) ✅
- Each user connects THEIR OWN Stripe account
- Payments go directly to the user who created the invoice
- You can optionally take a platform fee (1% default)
- Fully scalable SaaS model!

---

## 📋 SETUP CHECKLIST

### Part 1: Stripe Connect (10 minutes)

```bash
☐ 1. Go to https://stripe.com → Sign up
☐ 2. Go to https://dashboard.stripe.com/settings/connect
☐ 3. Click "Get started with Connect"
☐ 4. Choose "Platform or marketplace"
☐ 5. Enable "Express accounts"
☐ 6. Go to https://dashboard.stripe.com/test/apikeys
☐ 7. Copy your SECRET key (sk_test_...)
☐ 8. Add to .env:
      STRIPE_SECRET_KEY=sk_test_your_key_here
      APP_URL=http://localhost:3000
☐ 9. Restart server: ./stop.sh && ./start.sh
☐ 10. Done! Users can now connect in Settings
```

### Part 2: Email Setup (5 minutes)

**Option A - Gmail (Easiest)**
```bash
☐ 1. Go to https://myaccount.google.com/security
☐ 2. Enable "2-Step Verification"
☐ 3. Go to https://myaccount.google.com/apppasswords
☐ 4. Select "Mail" → "Other" → Generate
☐ 5. Copy the 16-character password
☐ 6. Add to .env:
      SMTP_HOST=smtp.gmail.com
      SMTP_PORT=587
      SMTP_SECURE=false
      SMTP_USER=youremail@gmail.com
      SMTP_PASS=paste_16_char_password_here
      EMAIL_FROM=youremail@gmail.com
      EMAIL_FROM_NAME=Your Business Name
☐ 7. Restart server: ./stop.sh && ./start.sh
☐ 8. Test: Create invoice → Send Email
```

**Option B - SendGrid (Best for Production)**
```bash
☐ 1. Sign up at https://signup.sendgrid.com
☐ 2. Go to https://app.sendgrid.com/settings/api_keys
☐ 3. Create API Key → Copy it (starts with SG.)
☐ 4. Add to .env:
      SMTP_HOST=smtp.sendgrid.net
      SMTP_PORT=587
      SMTP_SECURE=false
      SMTP_USER=apikey
      SMTP_PASS=SG.your_key_here
      EMAIL_FROM=verified@yourdomain.com
      EMAIL_FROM_NAME=Your Business Name
☐ 5. Restart server
```

---

## 🎯 HOW TO USE

### Stripe Connect Flow

**1. Platform Owner (You)**
```
Set up once:
- Add STRIPE_SECRET_KEY to .env
- This is YOUR platform key
- Users will connect their own accounts
```

**2. User Journey**
```
Login → Settings → Connect Stripe Button
  ↓
Stripe Onboarding (2-3 minutes)
  ↓
User enters their business info
  ↓
Stripe verifies identity
  ↓
Return to app - "Connected ✅"
  ↓
Create invoices → Generate payment links
  ↓
Money goes to USER'S Stripe account! 💰
```

**3. Creating Payment Links**
```javascript
// As a user:
1. Create an invoice
2. Click "..." menu on invoice card
3. Click "Generate Payment Link"
4. Share link with client
5. Client pays → Money goes to YOUR Stripe account
```

### Email Flow

**1. Send Invoice via Email**
```
Create invoice → "..." menu → "Send via Email"
  ↓
Enter client's email
  ↓
Professional email sent with:
  - Your branding
  - PDF attachment
  - Payment link (if Stripe connected)
  - Your business details in footer
```

**2. What Client Receives**
```
Subject: Invoice #INV-001 from [Your Business]

Email includes:
✅ Professional HTML design
✅ Invoice details
✅ PDF attachment
✅ "Pay Now" button (if Stripe connected)
✅ Your contact info
```

---

## 🧪 TESTING

### Test Stripe Connect

```bash
# 1. Open two browser windows
# 2. Window 1: Login as User A
#    - Settings → Connect Stripe
#    - Complete onboarding (use fake info in test mode)
#    - Create invoice → Generate payment link
#    - Copy link

# 3. Window 2 (incognito): Open payment link
#    - Use test card: 4242 4242 4242 4242
#    - Exp: 12/34, CVC: 123
#    - Pay → Success!

# 4. Check User A's Stripe dashboard
#    - Login at dashboard.stripe.com
#    - See the payment! 💰

# 5. Repeat with User B
#    - User B gets THEIR own Stripe account
#    - Payments go to User B, not User A ✅
```

### Test Email

```bash
# 1. Make sure .env has email config
# 2. Create invoice
# 3. Click "..." → "Send via Email"
# 4. Enter your email
# 5. Check inbox (check spam folder too)
# 6. Should receive professional email with PDF
```

### Stripe Test Cards

```
✅ Success:     4242 4242 4242 4242
❌ Declined:    4000 0000 0000 0002
🔐 3D Secure:   4000 0025 0000 3155
💳 Debit:       4000 0566 5566 5556

Exp: Any future date (12/34)
CVC: Any 3 digits (123)
ZIP: Any (12345)
```

---

## 🔥 FEATURES NOW AVAILABLE

### For Users

✅ **Connect their own Stripe account**
- Receive payments directly
- Keep 99% of payment (1% platform fee optional)
- Full control over their money

✅ **Send invoices via email**
- Professional branded emails
- PDF attachments
- Payment links included
- Track sent status

✅ **Generate payment links**
- Share via email, SMS, or chat
- Clients pay with card
- Instant payment confirmation

✅ **Multi-currency support**
- Create invoices in 18+ currencies
- Payment links support all currencies
- Automatic exchange rates

✅ **Recurring invoices**
- Set up monthly/weekly/yearly billing
- Automatic invoice generation
- Email notifications

✅ **Analytics dashboard**
- Revenue tracking
- Payment status
- Top clients
- Currency breakdown

---

## 🐛 COMMON ISSUES

### Stripe

**"Stripe not configured"**
```bash
# Check .env has:
STRIPE_SECRET_KEY=sk_test_51...

# Must start with sk_test_ (test) or sk_live_ (live)
# Restart server after adding
```

**"User has not connected Stripe"**
```bash
# User needs to:
1. Go to Settings
2. Click "Connect Stripe Account"
3. Complete onboarding
4. See "Connected ✅" status
```

**Connect button doesn't work**
```bash
# Check server logs for errors
# Make sure routes are loaded:
grep "stripeRoutes" server.js

# Should see: app.use('/api/stripe', routes.stripeRoutes);
```

### Email

**"Email not configured"**
```bash
# Check .env has ALL of these:
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your_app_password
EMAIL_FROM=your@email.com
EMAIL_FROM_NAME=Your Business

# Restart server
```

**"Authentication failed" (Gmail)**
```bash
# NOT your Gmail password!
# Must use App Password:
1. Enable 2FA first
2. Generate app password
3. Use 16-character password (no spaces)
```

**Emails going to spam**
```bash
# For testing: Check spam folder
# For production:
- Use SendGrid or Mailgun
- Verify your domain
- Add SPF/DKIM records
```

---

## 💡 PRO TIPS

### Stripe
- 🧪 Test mode is completely free - use it!
- 💰 Platform fee is optional (set to 0 if you don't want it)
- 🔄 Users can disconnect/reconnect anytime
- 📊 View all connected accounts in Stripe dashboard

### Email
- 📧 Gmail limit: 500 emails/day
- 🚀 SendGrid: 100/day free, then pay as you go
- ✅ Always test emails before going live
- 📱 Emails are mobile-responsive

### Production
- 🔒 Use live keys (sk_live_...) for real money
- 🌐 Update APP_URL to your domain
- 📝 Complete Stripe verification
- 💳 Test with small real payment first

---

## 📚 FULL DOCUMENTATION

For detailed step-by-step guide with screenshots:
👉 **See: `vibe-coder-bs/STRIPE_EMAIL_SETUP.md`**

For testing all features:
👉 **See: `vibe-coder-bs/TESTING_GUIDE.md`**

---

## ✅ YOU'RE READY!

Once both are set up:
1. ✅ Each user connects their Stripe
2. ✅ Payments go directly to them
3. ✅ Professional emails with PDFs
4. ✅ Payment links included
5. ✅ Platform is fully functional! 🎉

**Questions?** Check the logs: `tail -f logs/app.log`

**Need help?** All docs are in `vibe-coder-bs/` folder

Happy invoicing! 🚀💰
