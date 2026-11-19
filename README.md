# M-Pesa STK Push

A Node.js, Express, and vanilla JavaScript application for Safaricom Daraja M-Pesa Express (STK Push).

## Local setup

1. Create a Daraja application and copy the sandbox or production credentials.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

4. Set `DARAJA_ENV=sandbox` for sandbox testing or `production` for live payments.

5. Fill in:

   ```dotenv
   MPESA_CONSUMER_KEY=your_consumer_key
   MPESA_CONSUMER_SECRET=your_consumer_secret
   MPESA_SHORTCODE=your_shortcode
   MPESA_PASSKEY=your_passkey
   MPESA_CALLBACK_URL=https://public-domain.example/mpesa/callback
   ```

6. Expose the local server publicly when testing callbacks, for example:

   ```bash
   ngrok http 3000
   ```

   Then set `MPESA_CALLBACK_URL` to the HTTPS forwarding URL followed by `/mpesa/callback`.

7. Start the app:

   ```bash
   npm start
   ```

8. Open `http://localhost:3000`.

## API endpoints

- `GET /api/health` — server and environment status
- `POST /api/stkpush` — initiate an STK Push
- `GET /api/transactions/:checkoutRequestId` — inspect an in-memory transaction status
- `POST /mpesa/callback` — receive Daraja callback results

## Important production notes

- Never commit `.env` or Daraja credentials.
- Use HTTPS callback URLs in production.
- Use the M-Pesa shortcode/passkey supplied for the selected environment.
- Callback payloads must be validated and successful payments persisted in a database before delivery of paid goods or services.
- The callback currently updates an in-memory map. Restarting the server clears transaction state, so production deployments need persistent storage.
- Daraja IP restrictions/authentication and idempotency should be enforced on public payment callbacks in production.
