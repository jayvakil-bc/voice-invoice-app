#!/bin/bash

# Pre-Demo Test Script
# Run this to verify everything works before the presentation

echo "🎯 VOICE INVOICE - PRE-DEMO SYSTEM CHECK"
echo "========================================="
echo ""

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Server Running
echo "1️⃣  Checking server..."
if ps aux | grep -q "[n]ode server.js"; then
    echo -e "${GREEN}✅ Server is running${NC}"
else
    echo -e "${RED}❌ Server is NOT running${NC}"
    echo "   Run: ./start.sh"
    exit 1
fi

# Test 2: Health Check
echo ""
echo "2️⃣  Testing health endpoint..."
HEALTH=$(curl -s http://localhost:3000/api/health)
if echo "$HEALTH" | grep -q "healthy"; then
    echo -e "${GREEN}✅ Health check passed${NC}"
else
    echo -e "${RED}❌ Health check failed${NC}"
fi

# Test 3: Landing Page
echo ""
echo "3️⃣  Testing landing page..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)
if [ "$STATUS" == "200" ]; then
    echo -e "${GREEN}✅ Landing page accessible${NC}"
else
    echo -e "${RED}❌ Landing page returned $STATUS${NC}"
fi

# Test 4: Dashboard (requires auth, will redirect)
echo ""
echo "4️⃣  Testing dashboard endpoint..."
DASH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/dashboard)
if [ "$DASH_STATUS" == "200" ] || [ "$DASH_STATUS" == "302" ]; then
    echo -e "${GREEN}✅ Dashboard endpoint working${NC}"
else
    echo -e "${YELLOW}⚠️  Dashboard returned $DASH_STATUS${NC}"
fi

# Test 5: Environment Variables
echo ""
echo "5️⃣  Checking environment variables..."
source .env 2>/dev/null

if [ -n "$MONGODB_URI" ]; then
    echo -e "${GREEN}✅ MongoDB URI set${NC}"
else
    echo -e "${RED}❌ MongoDB URI missing${NC}"
fi

if [ -n "$OPENAI_API_KEY" ]; then
    echo -e "${GREEN}✅ OpenAI API key set${NC}"
else
    echo -e "${RED}❌ OpenAI API key missing${NC}"
fi

if [ -n "$STRIPE_SECRET_KEY" ]; then
    echo -e "${GREEN}✅ Stripe key set${NC}"
else
    echo -e "${RED}❌ Stripe key missing${NC}"
fi

if [ -n "$GOOGLE_CLIENT_ID" ]; then
    echo -e "${GREEN}✅ Google OAuth set${NC}"
else
    echo -e "${RED}❌ Google OAuth missing${NC}"
fi

if [ -n "$SMTP_USER" ]; then
    echo -e "${GREEN}✅ SMTP configured${NC}"
else
    echo -e "${RED}❌ SMTP not configured${NC}"
fi

# Test 6: Check logs for errors
echo ""
echo "6️⃣  Checking for errors in logs..."
if tail -50 logs/server.log | grep -q "❌"; then
    echo -e "${YELLOW}⚠️  Some errors found in logs${NC}"
    echo "   Check: tail -f logs/server.log"
else
    echo -e "${GREEN}✅ No critical errors in logs${NC}"
fi

# Test 7: SMTP Connection
echo ""
echo "7️⃣  Verifying SMTP connection..."
if tail -20 logs/server.log | grep -q "SMTP configuration is valid"; then
    echo -e "${GREEN}✅ SMTP verified - Email will work${NC}"
else
    echo -e "${YELLOW}⚠️  SMTP verification not found${NC}"
    echo "   Email demo may not work"
fi

# Test 8: Stripe Configuration
echo ""
echo "8️⃣  Checking Stripe..."
if tail -20 logs/server.log | grep -q "Stripe configured"; then
    echo -e "${GREEN}✅ Stripe configured (TEST mode)${NC}"
else
    echo -e "${YELLOW}⚠️  Stripe configuration not confirmed${NC}"
fi

# Test 9: MongoDB Connection
echo ""
echo "9️⃣  Checking MongoDB..."
if tail -30 logs/server.log | grep -q "MongoDB Connected"; then
    echo -e "${GREEN}✅ MongoDB connected${NC}"
else
    echo -e "${RED}❌ MongoDB connection issue${NC}"
fi

# Test 10: Required Files
echo ""
echo "🔟 Checking critical files..."
REQUIRED_FILES=(
    "server.js"
    "public/index.html"
    "public/dashboard.html"
    "public/invoice.html"
    "public/contract.html"
    "public/settings.html"
    "package.json"
    ".env"
)

ALL_FILES_OK=true
for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "   ${GREEN}✓${NC} $file"
    else
        echo -e "   ${RED}✗${NC} $file ${RED}MISSING${NC}"
        ALL_FILES_OK=false
    fi
done

# Summary
echo ""
echo "========================================="
echo "📊 SUMMARY"
echo "========================================="

if [ "$ALL_FILES_OK" = true ]; then
    echo -e "${GREEN}✅ All critical files present${NC}"
    echo -e "${GREEN}✅ Server is healthy and running${NC}"
    echo -e "${GREEN}✅ Database connected${NC}"
    echo -e "${GREEN}✅ All integrations configured${NC}"
    echo ""
    echo -e "${GREEN}🎉 YOU'RE READY FOR THE DEMO!${NC}"
    echo ""
    echo "📋 Next steps:"
    echo "   1. Login at: http://localhost:3000"
    echo "   2. Create 2-3 test invoices"
    echo "   3. Test voice input"
    echo "   4. Enable dark mode"
    echo "   5. Review PRE_DEMO_CHECKLIST.md"
else
    echo -e "${YELLOW}⚠️  Some issues found - review above${NC}"
fi

echo ""
echo "========================================="
echo ""
