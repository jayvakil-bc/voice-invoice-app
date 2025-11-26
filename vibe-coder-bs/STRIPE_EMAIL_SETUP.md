# 🚀 STRIPE CONNECT & EMAIL SETUP GUIDE

Complete step-by-step guide for setting up Stripe Connect (so each user gets paid directly) and Email notifications.

---

## 📦 PART 1: STRIPE CONNECT SETUP

### Why Stripe Connect?
- **Without Connect**: All payments go to YOUR Stripe account (bad!)
- **With Connect**: Each user connects THEIR OWN Stripe account and receives payments directly ✅

### Step 1: Create Stripe Account
1. Go to https://stripe.com
2. Click "Sign up" (if you don't have an account)
3. Complete the signup process

### Step 2: Get Your Platform API Keys
1. Go to https://dashboard.stripe.com/test/apikeys
2. You'll see two keys:
   - **Publishable key** (starts with `pk_test_...`) - Not needed for backend
   - **Secret key** (starts with `sk_test_...`) - ⚠️ COPY THIS!

### Step 3: Enable Connect in Stripe Dashboard
1. Go to https://dashboard.stripe.com/settings/connect
2. Click **"Get started with Connect"**
3. Choose **"Platform or marketplace"** (you're building a platform where users receive payments)
4. Fill in basic info:
   - Platform name: "Voice Invoice"
   - Business type: SaaS Platform
   - What you're building: "Invoice and contract management platform"
5. Click **Save**

### Step 4: Configure Connect Settings
1. Still in Connect settings (https://dashboard.stripe.com/settings/connect)
2. Under **"Branding"**:
   - Upload a logo (optional)
   - Set brand color (optional)
3. Under **"Client application settings"**:
   - ✅ Enable "OAuth for Standard accounts"
   - ✅ Enable "Express accounts"
   
### Step 5: Set Redirect URLs
1. In Connect settings, go to **"Redirects"**
2. Add these URLs:
   ```
   http://localhost:3000/settings
   https://yourdomain.com/settings (for production later)
   ```

### Step 6: Add to .env File
Open your `.env` file and add:
```bash
# Stripe Connect (YOUR platform keys)
STRIPE_SECRET_KEY=sk_test_paste_your_secret_key_here

# Your app URL (important for redirects)
APP_URL=http://localhost:3000
```

⚠️ **IMPORTANT**: The `STRIPE_SECRET_KEY` is YOUR platform key, not your users' keys!

### Step 7: How Users Will Connect Their Stripe

**For Each User:**
1. User logs into your app
2. Goes to **Settings** page
3. Clicks **"Connect Stripe Account"** button
4. Redirected to Stripe onboarding
5. User creates/connects their Stripe account
6. Stripe redirects back to your app
7. User can now create payment links that go to THEIR account! 🎉

### Step 8: Testing Stripe Connect

**Test with Multiple Accounts:**
```bash
# Start your server
./start.sh

# In browser:
# 1. Log in as User A
# 2. Go to Settings → Connect Stripe
# 3. Complete onboarding (use test info)
# 4. Create an invoice → Generate payment link
# 5. Payment goes to User A's Stripe account ✅

# 6. Log out, log in as User B
# 7. Repeat steps 2-4
# 8. Payment goes to User B's Stripe account ✅
```

**Stripe Test Card Numbers:**
```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
3D Secure: 4000 0025 0000 3155

Any future date (exp)
Any 3-digit CVC
Any ZIP code
```

### Step 9: Platform Fees (Optional)

If you want to take a 1% fee from each payment (already set in code):
```javascript
// In utils/paymentService.js (line ~156)
application_fee_amount: Math.round(amount * 0.01), // 1% fee

// Change 0.01 to:
// 0.02 = 2%
// 0.03 = 3%
// 0 = no fee
```

### Step 10: Going Live (Production)

When ready for real money:
1. Complete Stripe account verification (https://dashboard.stripe.com/account/onboarding)
2. Get LIVE API keys: https://dashboard.stripe.com/apikeys
3. Update `.env`:
   ```bash
   STRIPE_SECRET_KEY=sk_live_your_live_key_here
   APP_URL=https://yourdomain.com
   ```
4. Update redirect URLs in Stripe dashboard to production domain
5. Test with small real payment first! 💰

---

## 📧 PART 2: EMAIL SETUP (SMTP)

### Option A: Gmail (Easiest for Testing)

#### Step 1: Enable 2-Factor Authentication
1. Go to https://myaccount.google.com/security
2. Enable **2-Step Verification**

#### Step 2: Create App Password
1. Go to https://myaccount.google.com/apppasswords
2. Select app: **Mail**
3. Select device: **Other (Custom name)** → Type "Voice Invoice"
4. Click **Generate**
5. Copy the 16-character password (no spaces)

#### Step 3: Add to .env
```bash
# Email Settings (Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=youremail@gmail.com
SMTP_PASS=your_16_char_app_password_here

EMAIL_FROM=youremail@gmail.com
EMAIL_FROM_NAME=Voice Invoice
```

### Option B: Outlook/Hotmail

#### Step 1: Enable App Passwords
1. Go to https://account.microsoft.com/security
2. Enable **Two-step verification**
3. Go to https://account.live.com/proofs/AppPassword
4. Create app password

#### Step 2: Add to .env
```bash
# Email Settings (Outlook)
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=youremail@outlook.com
SMTP_PASS=your_app_password_here

EMAIL_FROM=youremail@outlook.com
EMAIL_FROM_NAME=Voice Invoice
```

### Option C: SendGrid (Best for Production)

#### Step 1: Create SendGrid Account
1. Go to https://signup.sendgrid.com/
2. Sign up (free tier = 100 emails/day)
3. Verify your email

#### Step 2: Create API Key
1. Go to https://app.sendgrid.com/settings/api_keys
2. Click **Create API Key**
3. Name: "Voice Invoice"
4. Permissions: **Full Access**
5. Copy the API key (starts with `SG.`)

#### Step 3: Verify Sender Email
1. Go to https://app.sendgrid.com/settings/sender_auth/senders
2. Click **Create New Sender**
3. Fill in your info
4. Verify email address

#### Step 4: Add to .env
```bash
# Email Settings (SendGrid)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=SG.your_sendgrid_api_key_here

EMAIL_FROM=verified@yourdomain.com
EMAIL_FROM_NAME=Voice Invoice
```

### Option D: Mailgun (Alternative)

```bash
# Email Settings (Mailgun)
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@yourdomain.mailgun.org
SMTP_PASS=your_mailgun_password

EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=Voice Invoice
```

---

## 🧪 TESTING EMAIL

### Step 1: Start Server
```bash
./start.sh
```

### Step 2: Check Email Config
Server startup will show:
```
✅ Email service configured (Gmail/SendGrid/etc)
```

### Step 3: Send Test Invoice Email
1. Log into app
2. Create an invoice
3. Click "..." menu on invoice card
4. Click **"Send via Email"**
5. Enter recipient email
6. Check inbox! 📬

### Step 4: Email Features
- ✅ Invoice PDF attached
- ✅ Professional HTML email
- ✅ Payment link included (if Stripe connected)
- ✅ Your business info in footer

---

## 🔥 QUICK START CHECKLIST

### Stripe Connect ✅
- [ ] Sign up at stripe.com
- [ ] Enable Connect in dashboard
- [ ] Copy secret key (sk_test_...)
- [ ] Add to .env: `STRIPE_SECRET_KEY=sk_test_...`
- [ ] Set `APP_URL=http://localhost:3000`
- [ ] Restart server
- [ ] Test: Settings → Connect Stripe

### Email ✅
- [ ] Choose provider (Gmail/SendGrid/etc)
- [ ] Get SMTP credentials
- [ ] Add to .env:
  ```
  SMTP_HOST=...
  SMTP_USER=...
  SMTP_PASS=...
  EMAIL_FROM=...
  ```
- [ ] Restart server
- [ ] Test: Create invoice → Send email

---

## 🐛 TROUBLESHOOTING

### Stripe Issues

**"Stripe not configured" error**
```bash
# Check .env has:
STRIPE_SECRET_KEY=sk_test_51...
# Must start with sk_test_ or sk_live_
```

**"User has not connected their Stripe account"**
- User needs to go to Settings → Connect Stripe first
- Complete Stripe onboarding flow
- Check Settings page shows "Connected" status

**Connect button doesn't work**
```bash
# Check server.js has:
app.use('/api/stripe', routes.stripeRoutes);

# Restart server:
./stop.sh && ./start.sh
```

### Email Issues

**"Email service not configured"**
```bash
# Check .env has ALL of these:
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your_password
EMAIL_FROM=your@email.com
```

**"Invalid login" (Gmail)**
- Must use App Password, not regular password!
- Enable 2FA first
- Generate app password at https://myaccount.google.com/apppasswords

**"Authentication failed" (SendGrid)**
- User must be `apikey` (literally the word "apikey")
- Password is your SendGrid API key (starts with SG.)

**Emails going to spam**
- Use professional sender name
- Verify domain with SendGrid/Mailgun
- Add SPF/DKIM records to DNS (production)

---

## 💡 PRO TIPS

### Stripe
- Test mode is FREE - use it liberally
- Users can disconnect/reconnect anytime
- Platform fees go to your account automatically
- Express accounts = easiest onboarding (recommended)

### Email
- **Gmail** = Easy for testing, 500 emails/day limit
- **SendGrid** = Best for production, 100/day free, scales well
- **Mailgun** = Good alternative to SendGrid
- Always test emails with spam checker before going live

### Security
- NEVER commit .env file to git (it's in .gitignore)
- Use different keys for test/production
- Keep secret keys... secret! 🤫

---

## 📚 USEFUL LINKS

**Stripe:**
- Dashboard: https://dashboard.stripe.com
- API Keys: https://dashboard.stripe.com/test/apikeys
- Connect Settings: https://dashboard.stripe.com/settings/connect
- Test Cards: https://stripe.com/docs/testing

**Email:**
- Gmail App Passwords: https://myaccount.google.com/apppasswords
- SendGrid: https://signup.sendgrid.com
- Mailgun: https://signup.mailgun.com
- Outlook App Passwords: https://account.microsoft.com/security

**Testing:**
- Temp Email for Testing: https://temp-mail.org
- Email Spam Checker: https://www.mail-tester.com

---

## 🎉 YOU'RE READY!

Once both are set up:
1. Users connect their Stripe → receive payments directly 💰
2. Send invoices via email → professional PDFs 📧
3. Payment links included → clients pay instantly 🚀

Questions? Check the logs: `logs/app.log`

Happy invoicing! 🎊
