# Ledger — Personal Expense & Lending Tracker

A single-page installable web app (PWA) for tracking multiple bank accounts,
credit/debit cards, a cash wallet, and money you've lent to others — including
purchases you made on your card on someone else's behalf.

## What it tracks

- **Accounts**: unlimited banks, credit cards, debit cards, and a cash wallet.
  Each shows its own balance (or amount owed, for credit cards).
- **Transactions**: expense, income, transfer between your own accounts,
  lending cash to someone, paying for someone on your card, and receiving
  a repayment.
- **Lending**: every "lend" or "pay for someone" transaction automatically
  creates a loan record. You can record partial repayments or mark a loan
  fully settled, and see total outstanding at a glance.
- **Dashboard**: net worth, cash on hand, card debt, and money owed to you,
  updated live.

All data is stored locally on your phone (`localStorage`) — nothing is sent
anywhere. There is no login and no backend.

## Run it right now (fastest, for testing)

You can't just double-click `index.html` for full PWA install support (the
service worker needs `https://` or `localhost`), but you can preview it
instantly:

```
cd expense-tracker
python3 -m http.server 8080
```

Then open `http://localhost:8080` in Chrome on your phone (same Wi-Fi) or
`http://localhost:8080` on a computer.

## Install it properly on your Motorola Edge 50 Fusion (recommended)

Deploy the folder as a static site — takes about 2 minutes with either:

### Option A: Netlify Drop (no account needed)
1. Go to https://app.netlify.com/drop on any device.
2. Drag the whole `expense-tracker` folder onto the page.
3. You'll get a live `https://…netlify.app` URL immediately.

### Option B: GitHub Pages (since you already use GitHub)
1. Create a new repo, push this folder's contents to it.
2. Repo → Settings → Pages → Deploy from branch → `main` / root.
3. Your app will be live at `https://<you>.github.io/<repo>/`.

### Then install on your phone
1. Open the live URL in **Chrome** on your Motorola.
2. Tap the **⋮** menu → **Add to Home screen** / **Install app**.
3. It now opens full-screen like a native app, with an icon on your home
   screen, and works offline after the first load.

## File structure

```
expense-tracker/
├── index.html          — app shell, all screens
├── style.css           — dark "ledger" theme
├── app.js              — all logic: accounts, transactions, loans
├── manifest.json        — PWA metadata (name, icons, colors)
├── service-worker.js   — offline caching
└── icons/              — app icons
```

## Extending it later

- **Cloud backup**: add a "Export data" button that downloads
  `localStorage` as JSON, and an "Import" button to restore it — useful
  before switching phones. Ask me to add this any time.
- **Recurring bills** (EMIs, subscriptions) as a scheduled transaction type.
- **Charts**: category-wise spending pie chart on the dashboard.
- **Multi-currency** if needed.

## Notes on the data model

- Credit card "balance" represents **amount owed**, not money you have —
  an expense on a credit card increases what you owe; paying the bill is a
  **transfer** from a bank account to the credit card account.
- "Lend money" and "Pay for someone" both create a **loan** record under
  Lending, tied back to the original transaction so deleting either stays
  consistent.
