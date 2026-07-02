# Ledger — Personal Expense & Lending Tracker

A single-page installable web app (PWA) for tracking multiple bank accounts,
credit/debit cards, a cash wallet, and money you've lent to others — including
purchases you made on your card on someone else's behalf.

## What it tracks

- **Accounts**: unlimited banks, credit cards, debit cards, and a cash wallet.
- **Transactions**: expense, income, transfer, lending cash, paying for
  someone on your card, and receiving a repayment.
- **Lending**: every "lend" or "pay for someone" transaction automatically
  creates a loan record you can track and settle.
- **Dashboard**: net worth, cash on hand, card debt, and money owed to you.
- **Cloud backup** (optional): sign in once and every change is automatically
  saved to the cloud, so clearing your browser storage or switching phones
  doesn't lose your data.

The app icon is embedded directly in the code (as base64), so there's no
separate icon file to upload — this avoids the folder-upload issue GitHub's
mobile web uploader has with nested folders.

## Deploy with GitHub Pages (no computer needed)

1. On github.com, create a **public** repo (e.g. `expense-tracker`).
2. **Add file → Upload files**, upload: `index.html`, `style.css`, `app.js`,
   `firebase-config.js`, `manifest.json`, `service-worker.js`. Commit.
3. **Settings → Pages** → Branch: `main`, folder `/ (root)` → Save.
4. Your app is live at `https://<you>.github.io/<repo>/`.
5. Open it in Chrome → **⋮ → Add to Home screen**.

## Setting up login (Firebase — free, ~5 minutes, phone-only)

Without this step, **anyone who has your app's URL can open it** — they
won't see your data (each browser only has its own local storage), but
they can use the app. Setting up Firebase turns on a real sign-in wall:
nobody sees anything without an email/password login.

1. Go to **console.firebase.google.com** in Chrome, sign in with any Google
   account, tap **Add project**, give it any name, finish the wizard.
2. In the project, tap **Build → Authentication → Get started**. Under
   **Sign-in method**, enable **Email/Password**.
3. Tap **Build → Firestore Database → Create database**. Choose
   **Start in production mode**, pick any region, tap **Enable**.
4. Go to **Firestore → Rules** tab, replace the contents with the rules
   below, then **Publish**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/ledger/{docId} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

5. Go to **Project settings** (gear icon, top left) → scroll to **Your
   apps** → tap the **</>** (Web) icon → register an app (any nickname,
   don't need hosting) → copy the `firebaseConfig` object it shows you.
6. Back in your GitHub repo, open `firebase-config.js`, tap the pencil
   (edit) icon, paste your keys into the matching fields, commit.
7. Reload your app's URL. You'll now see a full-screen **sign-in wall**.
   Tap **Create account**, use any email + password (this is just your own
   login, not shared with anyone). From then on, every change is backed up
   automatically, and the app is locked behind that login on any device.

### Locking out anyone else from creating an account

By default, anyone who reaches your sign-in screen could tap **Create
account** and make their own login (they'd only see their own empty data,
not yours — but it's still your Firebase project's resources). Once you've
created your one account, you can shut the door:

- Firebase Console → **Authentication → Sign-in method** → turn off
  **Email/Password** self-service — no, this would lock you out too.
- Simplest real option: after creating your account, go to
  **Authentication → Users**, and just keep an eye on the list. If you see
  an account you didn't create, delete it there.
- For stronger lockdown, ask me to add an **invite-code check** (a fixed
  secret you enter once during sign-up) so only people who know your code
  can register at all.



## File structure

```
expense-tracker/
├── index.html          — app shell, all screens, embedded app icon
├── style.css           — dark "ledger" theme
├── app.js              — all logic: accounts, transactions, loans, cloud sync
├── firebase-config.js  — paste your Firebase project keys here
├── manifest.json        — PWA metadata (icons embedded as base64)
├── service-worker.js   — offline caching
```

## Notes on the data model

- Credit card "balance" represents **amount owed**, not money you have —
  an expense on a credit card increases what you owe; paying the bill is a
  **transfer** from a bank account to the credit card account.
- "Lend money" and "Pay for someone" both create a **loan** record under
  Lending, tied back to the original transaction so deleting either stays
  consistent.
- With cloud backup on, the cloud copy is treated as the source of truth on
  sign-in — so if you're using the app on more than one device, the most
  recently opened device's sign-in will pull down whatever was last saved.

