# 🎉 Business Onboarding Feature

## Overview
New users are now required to provide minimal business information during their first login. This information is automatically used in ALL future contracts and invoices.

## How It Works

### 1. First-Time User Flow
1. User signs in with Google OAuth
2. System detects `businessInfo.setupCompleted = false`
3. **Automatically redirects to `/onboarding.html`** (not `/dashboard`)
4. User fills out business information form
5. Info is saved to their user profile
6. Redirects to dashboard

### 2. Returning User Flow
1. User signs in with Google OAuth
2. System detects `businessInfo.setupCompleted = true`
3. **Directly redirects to `/dashboard`** 
4. Business info automatically used in contracts

## Required Business Information

### Mandatory Fields:
- **Business Name** - Your company/business name
- **Business Address** - Full street address, city, state, ZIP
- **Business Email** - Primary contact email
- **Business Phone** - Contact phone number

### Optional Fields:
- **Website** - Business website URL
- **Tax ID / EIN** - For invoices and tax purposes

## Where Business Info Is Used

### Contracts
- **Service Provider Section** - Auto-filled with your business info
- Eliminates need to manually enter your details every time
- Client information still needs to be specified per contract

### Future Features
- Invoices will also use this information
- PDF generation will include your business details
- Email signatures and correspondence

## User Model Changes

```javascript
const userSchema = new mongoose.Schema({
    googleId: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    name: String,
    picture: String,
    businessInfo: {
        businessName: String,
        businessAddress: String,
        businessEmail: String,
        businessPhone: String,
        website: String,
        taxId: String,
        setupCompleted: { type: Boolean, default: false }
    },
    createdAt: { type: Date, default: Date.now }
});
```

## API Endpoints

### POST `/api/user/business-info`
Save or update business information.

**Auth Required:** Yes (requireAuth)

**Request Body:**
```json
{
    "businessName": "ABC Design Studio",
    "businessAddress": "123 Main St, City, State 12345",
    "businessEmail": "contact@abcdesign.com",
    "businessPhone": "(555) 123-4567",
    "website": "https://abcdesign.com",
    "taxId": "12-3456789"
}
```

**Response:**
```json
{
    "success": true,
    "message": "Business information saved successfully",
    "businessInfo": { ... }
}
```

### GET `/api/user/business-info`
Retrieve current user's business information.

**Auth Required:** Yes (requireAuth)

**Response:**
```json
{
    "businessInfo": {
        "businessName": "ABC Design Studio",
        "businessAddress": "123 Main St, City, State 12345",
        "businessEmail": "contact@abcdesign.com",
        "businessPhone": "(555) 123-4567",
        "website": "https://abcdesign.com",
        "taxId": "12-3456789",
        "setupCompleted": true
    }
}
```

## Settings Page Integration

Users can update their business information anytime at `/settings.html`:

- View current business info
- Update any field
- Changes immediately apply to new contracts
- Existing contracts are NOT modified (preserves historical data)

## Backend Logic

### Auth Callback
```javascript
app.get('/auth/google/callback',
    passport.authenticate('google', { ... }),
    (req, res) => {
        // Check if user needs onboarding
        if (!req.user.businessInfo || !req.user.businessInfo.setupCompleted) {
            console.log('[Auth] New user detected, redirecting to onboarding');
            res.redirect('/onboarding.html');
        } else {
            console.log('[Auth] Existing user, redirecting to dashboard');
            res.redirect('/dashboard');
        }
    }
);
```

### Contract Generation
```javascript
// Get user's business info for auto-filling service provider details
const user = await User.findById(userId);

if (user && user.businessInfo && user.businessInfo.setupCompleted) {
    console.log('[Contract Service] Auto-filling service provider from business info');
    serviceProviderInfo = {
        name: user.businessInfo.businessName,
        address: user.businessInfo.businessAddress,
        email: user.businessInfo.businessEmail,
        phone: user.businessInfo.businessPhone
    };
}
```

## Benefits

### For Users
✅ **One-time setup** - Enter business info once, use forever
✅ **Automatic population** - No manual entry for every contract
✅ **Consistency** - Your business info is always accurate
✅ **Time savings** - Focus on client details, not your own
✅ **Professional** - Always shows complete, professional information

### For System
✅ **Better data quality** - Ensures all users have complete profiles
✅ **Reduced errors** - No typos in business names/addresses
✅ **Historical tracking** - User profile preserves original business info
✅ **Easy updates** - Users can change info in one place

## Files Modified/Created

### New Files:
- `public/onboarding.html` - Onboarding form UI
- `public/onboarding.js` - Onboarding form logic
- `ONBOARDING_FEATURE.md` - This documentation

### Modified Files:
- `server.js`:
  - Updated User schema with `businessInfo` field
  - Modified `/auth/google/callback` to redirect to onboarding
  - Added `POST /api/user/business-info` endpoint
  - Added `GET /api/user/business-info` endpoint
  - Modified `/api/contracts/generate` to auto-fill service provider
  - Updated `/auth/user` to include businessInfo in response
- `public/settings.js`:
  - Updated to load/save business info from new API
  - Simplified to focus on core business data

## Testing

### Test New User Flow:
1. Clear your user's businessInfo in MongoDB:
   ```javascript
   db.users.updateOne(
       { email: "your@email.com" },
       { $unset: { businessInfo: "" } }
   )
   ```
2. Logout and login again
3. Should redirect to onboarding page
4. Fill out form and submit
5. Should redirect to dashboard

### Test Contract Generation:
1. Create a new contract
2. Check preview modal
3. Service Provider section should show YOUR business info
4. Client section should be extracted from transcript or "To be determined"

### Test Settings Update:
1. Go to `/settings.html`
2. Update business information
3. Create new contract
4. Verify updated info appears

## Future Enhancements

- [ ] Add business logo upload
- [ ] Support multiple business profiles (freelancers with multiple LLCs)
- [ ] Add default payment terms to business info
- [ ] Use business info in invoice generation
- [ ] Add email signature generation from business info
- [ ] Support for international address formats
- [ ] Business info verification (optional)
- [ ] Integration with business registries

## Commit Info

**Commit:** 69d8838  
**Message:** "Add business onboarding: new users provide business info once, auto-fills service provider in all contracts"  
**Files Changed:** 4 files, 375 insertions(+), 36 deletions(-)
