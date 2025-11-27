# 🚀 QUICK START - 5 Minutes to Demo-Ready

## 1. Start Server (30 seconds)
```bash
cd /Users/yatharthvasania/Desktop/Invoice-Thingy/my-project
./start.sh
```

## 2. Verify Health (30 seconds)
```bash
./test-demo.sh
```

Should see: **"🎉 YOU'RE READY FOR THE DEMO!"**

## 3. Open Browser Tabs (1 minute)
Open these in separate tabs:
1. http://localhost:3000 (Landing)
2. http://localhost:3000/dashboard (Dashboard)
3. http://localhost:3000/create (New Invoice)
4. http://localhost:3000/create-contract (New Contract)
5. http://localhost:3000/settings (Settings)

## 4. Login (1 minute)
- Go to tab #1 (landing page)
- Click "Continue with Google"
- Login with your account
- Should redirect to dashboard

## 5. Test Voice (2 minutes)
- Go to "New Invoice" tab
- Click mic button
- Say: "Invoice for John Doe, $1000 for consulting, due in 30 days"
- Verify invoice generates

## ✅ YOU'RE READY!

If anything fails:
1. Check logs: `tail -f logs/server.log`
2. Restart: `./stop.sh && ./start.sh`
3. Re-run tests: `./test-demo.sh`

---

## 🆘 Emergency Fixes

### Server not starting:
```bash
./stop.sh
killall node
./start.sh
```

### Port 3000 in use:
```bash
lsof -ti:3000 | xargs kill -9
./start.sh
```

### Missing dependencies:
```bash
npm install
./start.sh
```

---

## 📞 Contact During Demo

If something breaks mid-demo:
1. Stay calm - smile and say "technical difficulties"
2. Use backup tab or pre-made invoice
3. Talk through what WOULD happen
4. Keep energy up!

**YOU'VE GOT THIS! 💪🔥**
