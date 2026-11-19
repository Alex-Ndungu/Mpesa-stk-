const express = require('express');
const helmet = require('helmet');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.static('public'));

const isProduction = String(process.env.DARAJA_ENV).toLowerCase() === 'production';
const baseUrl = isProduction
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

async function getAccessToken() {
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;

  if (!key || !secret) {
    throw new Error('MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET are required');
  }

  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const { data } = await axios.get(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
    timeout: 15000
  });

  return data.access_token;
}

function formatPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.startsWith('7') && digits.length === 9) return `254${digits}`;
  throw new Error('Enter a valid Kenyan phone number, for example 0712345678');
}

app.post('/api/stkpush', async (req, res) => {
  try {
    const phone = formatPhone(req.body.phone);
    const amount = Number(req.body.amount);

    if (!Number.isInteger(amount) || amount < 1) {
      return res.status(400).json({ success: false, message: 'Amount must be a whole number greater than zero' });
    }

    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const callbackUrl = process.env.MPESA_CALLBACK_URL;

    if (!shortcode || !passkey || !callbackUrl) {
      throw new Error('MPESA_SHORTCODE, MPESA_PASSKEY, and MPESA_CALLBACK_URL are required');
    }

    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    const token = await getAccessToken();

    const { data } = await axios.post(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: 'STKPush',
      TransactionDesc: 'Payment'
    }, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 15000
    });

    return res.json({
      success: true,
      message: 'STK Push sent. Enter your M-Pesa PIN on the phone.',
      checkoutRequestId: data.CheckoutRequestID,
      merchantRequestId: data.MerchantRequestID
    });
  } catch (error) {
    const darajaMessage = error.response?.data?.errorMessage || error.response?.data?.error_description;
    console.error('STK Push error:', darajaMessage || error.message);
    return res.status(error.response?.status || 500).json({
      success: false,
      message: darajaMessage || error.message
    });
  }
});

app.post('/mpesa/callback', (req, res) => {
  const result = req.body?.Body?.stkCallback;

  if (result) {
    const metadata = {};
    for (const item of result.CallbackMetadata?.Item || []) {
      metadata[item.Name] = item.Value;
    }

    console.log('M-Pesa callback:', JSON.stringify({
      merchantRequestId: result.MerchantRequestID,
      checkoutRequestId: result.CheckoutRequestID,
      resultCode: result.ResultCode,
      resultDescription: result.ResultDesc,
      metadata
    }, null, 2));
  }

  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`M-Pesa STK Push server listening on http://localhost:${port}`);
});
