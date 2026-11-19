# M-Pesa STK Push

A simple Node.js, Express, and vanilla JavaScript application for Safaricom Daraja STK Push.

## Setup

1. Create a Daraja application and copy your sandbox or production credentials.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

4. Fill in `.env`. Use a public HTTPS callback URL when testing the callback, for example through ngrok:

   ```bash
   ngrok http 3000
   ```

5. Start the app:

   ```bash
   npm start
   ```

6. Open `http://localhost:3000`.

## Daraja environment

- Sandbox: set `DARaja_ENV=sandbox`.
- Production: set `DARaja_ENV=production` and use production credentials and shortcode.

## Security

Never commit `.env` or Daraja credentials. The callback currently logs payment metadata to the server; for a real application, verify and persist successful payments securely and add authentication where needed.
