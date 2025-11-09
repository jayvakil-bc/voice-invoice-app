# 📚 How Voice Invoice Generator Works

## 🗂️ Where Everything is Saved

```
MongoDB Atlas Cloud Database
├── Users Collection (your account)
│   ├── googleId: "your-google-id"
│   ├── email: "cringebros8@gmail.com"
│   ├── name: "Your Name"
│   ├── picture: "profile-pic-url"
│   └── businessContext: {
│       ├── companyName: "Your Business Name"
│       ├── address: "Your Address"
│       ├── email: "business@email.com"
│       ├── phone: "555-1234"
│       ├── defaultCurrency: "USD"
│       ├── defaultPaymentTerms: "Payment due in 30 days"
│       ├── frequentClients: [
│       │   { name: "John", company: "ABC", email: "john@abc.com" },
│       │   { name: "Sarah", company: "XYZ", email: "sarah@xyz.com" }
│       │ ]
│       └── commonServices: [
│           { description: "Web Development", rate: 150 },
│           { description: "Logo Design", rate: 500 }
│         ]
│     }
│
└── Invoices Collection (all your invoices)
    ├── Invoice 1
    │   ├── _id: "unique-id-1"
    │   ├── userId: "your-user-id" (links to your account)
    │   ├── invoiceNumber: "INV-123456"
    │   ├── serviceName: "Web Development"
    │   ├── from: { name, address, email, phone }
    │   ├── to: { name, company, email }
    │   ├── items: [{ description, qty, rate, amount }]
    │   ├── total: 3000
    │   ├── transcript: "original voice/text input"
    │   └── createdAt: "2025-11-03"
    │
    └── Invoice 2
        └── ... (same structure)
```

---

## 🎙️ Voice Recording Issue (Network Error)

### Why the "Network Error" Happens:

```
Your Browser → Web Speech API → Google Servers → Speech-to-Text
                                      ❌
                                Network Error
```

**The Web Speech API is built into your browser BUT:**
- It sends audio to Google's cloud servers for processing
- Requires active internet connection
- Can fail if:
  - ❌ Firewall blocking Google servers
  - ❌ VPN interfering
  - ❌ Browser doesn't have proper permissions
  - ❌ Google servers are unreachable

### ✅ SOLUTION: Just Type Instead!

You don't need voice! Just type in the text box:

```
Example:
"Invoice to John Smith at ABC Corp for consulting services, 
5 hours at $100/hour, total $500, due in 30 days"
```

---

## ✏️ How to Edit an Invoice (Step by Step)

### Step 1: Go to Dashboard
```
http://localhost:3000/dashboard
```

### Step 2: Find Your Invoice
You'll see cards like this:
```
┌─────────────────────────────────────────────────┐
│ INV-123456                                      │
│ Service: Web Development                        │
│ To: John Smith (ABC Corp)                       │
│ Amount: $3,000.00                               │
│ Date: 11/3/2025                                 │
│                                                 │
│ [📥 Download] [✏️ Edit] [💾 Drive] [🗑️ Delete] │
└─────────────────────────────────────────────────┘
```

### Step 3: Click "✏️ Edit" Button

### Step 4: Modal Opens with Original Text
```
┌────────────────────────────────────────┐
│  Edit Invoice                      ✕   │
├────────────────────────────────────────┤
│                                        │
│  ┌──────────────────────────────────┐ │
│  │ Invoice from ABC Design Studio,  │ │
│  │ email contact@abc.com, to John   │ │
│  │ Smith at XYZ Corp for website    │ │
│  │ development, 20 hours at $150/hr │ │
│  │ total $3000, due in 30 days      │ │
│  └──────────────────────────────────┘ │
│                                        │
│  Edit the text above, then regenerate │
│                                        │
│  [Cancel] [Regenerate Invoice]         │
└────────────────────────────────────────┘
```

### Step 5: Make Your Changes
Example - Change the amount:
```
Before: "20 hours at $150/hr total $3000"
After:  "25 hours at $150/hr total $3750"
```

### Step 6: Click "Regenerate Invoice"

### What Happens Next:
```
1. Your edited text → Sent to OpenAI API
2. OpenAI extracts invoice data from your text
3. Updated invoice saved to MongoDB
4. New PDF generated
5. PDF downloads automatically
6. Dashboard refreshes with updated invoice
```

---

## 💾 Where Files Are Saved

### PDFs (Invoice Files)
```
NOT saved on server! 
PDFs are generated on-the-fly and downloaded to:
  → Your computer's Downloads folder
  → Example: Downloads/invoice-INV-123456.pdf
```

### Invoice Data (in MongoDB)
```
MongoDB Atlas (Cloud)
  → Database: jaysCluster
  → Collection: invoices
  → Documents: Each invoice as JSON
  → Accessible from anywhere (cloud-based)
```

### Business Context (in MongoDB)
```
MongoDB Atlas (Cloud)
  → Database: jaysCluster
  → Collection: users
  → Field: businessContext
  → Updated every time you create an invoice
```

---

## 🔄 Complete Flow Diagram

### Creating an Invoice:
```
1. You type/speak invoice details
   ↓
2. Text sent to backend (/api/generate-invoice)
   ↓
3. Backend sends to OpenAI API
   ↓
4. OpenAI extracts structured data (JSON)
   ↓
5. Backend extracts business context:
   - Your company info → Saved to User.businessContext
   - Client info → Saved to User.businessContext.frequentClients
   - Service info → Saved to User.businessContext.commonServices
   ↓
6. Invoice saved to MongoDB (Invoices collection)
   ↓
7. PDF generated with PDFKit
   ↓
8. PDF sent to browser
   ↓
9. Browser downloads PDF to your Downloads folder
```

### Editing an Invoice:
```
1. Click "Edit" on dashboard
   ↓
2. Frontend fetches invoice from: GET /api/invoices/:id
   ↓
3. Modal shows original transcript
   ↓
4. You edit the text
   ↓
5. Click "Regenerate"
   ↓
6. Edited text sent to: POST /api/invoices/:id/regenerate
   ↓
7. Backend sends to OpenAI API (same as create)
   ↓
8. Updated data replaces old invoice in MongoDB
   ↓
9. New PDF generated and downloaded
   ↓
10. Dashboard refreshes automatically
```

---

## 🔍 Finding Your Data

### In MongoDB Compass (if you want to see it):
```
1. Download MongoDB Compass
2. Connect to: mongodb+srv://coccoccoc:coccoccoc@jayscluster.veogpzm.mongodb.net/
3. Database: test (or your database name)
4. Collections:
   - users (your account + businessContext)
   - invoices (all your invoices)
```

### In Your Application:
```
Dashboard: http://localhost:3000/dashboard
  → Shows all invoices
  → Each invoice card has Edit/Download buttons

Settings: http://localhost:3000/settings
  → Shows your business context
  → Shows saved clients
  → Shows saved services
```

---

## 🛠️ Troubleshooting

### Voice Not Working?
✅ **Just type instead!** The text box works perfectly.

### Can't Edit?
1. Make sure you're logged in
2. Check if server is running (Terminal shows "Server running...")
3. Click Edit button on any invoice card
4. Modal should open with editable text

### Where's My PDF?
PDFs download to your **Downloads folder**:
- Mac: `~/Downloads/`
- Filename: `invoice-INV-123456.pdf`

### Business Context Not Saving?
Check in Settings page:
```
http://localhost:3000/settings
```
You should see your saved:
- Company info
- Frequent clients
- Common services

---

## 📝 Quick Tips

1. **Voice not working? Just type!** - Works the same way
2. **Edit anytime** - All invoices can be edited from dashboard
3. **Auto-saves business info** - After first invoice, less typing needed
4. **Check Settings** - See what's been saved automatically
5. **All data in cloud** - MongoDB Atlas, accessible from anywhere

---

## 🎯 Summary

**Where Things Are Saved:**
- ✅ Invoice data → MongoDB Atlas (cloud)
- ✅ Business context → MongoDB Atlas (cloud)  
- ✅ User account → MongoDB Atlas (cloud)
- ✅ PDF files → Your Downloads folder (local)

**How to Edit:**
1. Dashboard → Click "Edit" → Change text → Click "Regenerate"

**Voice Not Working?**
- Just use the text box instead! Works perfectly.
