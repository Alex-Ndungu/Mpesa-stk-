const express = require('express');
const helmet = require('helmet');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static('public'));

const darajaEnvironment = String(process.env.DARAJA_ENV || 'sandbox').trim().toLowerCase();

if (!['sandbox', 'production'].includes(darajaEnvironment)) {
  throw new Error('DARAJA_ENV must be either sandbox or production');
}

const baseUrl = darajaEnvironment === 'production'
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
    timeout: 15000,
    validateStatus: status => status >= 200 && status < 300
  });

  if (!data.access_token) {
    throw new Error('Daraja did not return an access token');
  }

  return data.access_token;
}

function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');

  if (/^254(?:[17]\d)\d{7}$/.test(digits)) return digits;
  if (/^07\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^01\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;

  throw new Error('Enter a valid Kenyan phone number, for example 0712345678');
}

function formatDarajaTimestamp(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');

  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

const transactions = new Map();

app.post('/api/stkpush', async (req, res) => {
  try {
    const phone = formatPhone(req.body?.phone);
    const amount = Number(req.body?.amount);

    if (!Number.isInteger(amount) || amount < 1) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a whole number greater than zero'
      });
    }

    const shortcode = process.env.MPESA_SHORTCODE?.trim();
    const passkey = process.env.MPESA_PASSKEY?.trim();
    const callbackUrl = process.env.MPESA_CALLBACK_URL?.trim();

    if (!shortcode || !passkey || !callbackUrl) {
      throw new Error('MPESA_SHORTCODE, MPESA_PASSKEY, and MPESA_CALLBACK_URL are required');
    }

    if (!/^https:\/\//i.test(callbackUrl)) {
      throw new Error('MPESA_CALLBACK_URL must be a public HTTPS URL');
    }

    const timestamp = formatDarajaTimestamp();
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
      AccountReference: String(req.body.accountReference || 'STKPush').slice(0, 12),
      TransactionDesc: String(req.body.transactionDesc || 'Payment').slice(0, 13)
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    if (data.ResponseCode !== '0' && data.ResponseCode !== 0) {
      throw new Error(data.errorMessage || data.ResponseDescription || 'Daraja rejected the STK Push request');
    }

    transactions.set(data.CheckoutRequestID, {
      checkoutRequestId: data.CheckoutRequestID,
      merchantRequestId: data.MerchantRequestID,
      status: 'pending',
      amount,
      phone,
      updatedAt: new Date().toISOString()
    });

    return res.json({
      success: true,
      message: 'STK Push sent. Enter your M-Pesa PIN on the phone.',
      checkoutRequestId: data.CheckoutRequestID,
      merchantRequestId: data.MerchantRequestID
    });
  } catch (error) {
    const darajaMessage = error.response?.data?.errorMessage
      || error.response?.data?.error_description
      || error.response?.data?.ResponseDescription;

    console.error('STK Push error:', darajaMessage || error.message);

    const status = error.response?.status || (error.message.includes('required') || error.message.includes('valid') || error.message.includes('HTTPS') ? 400 : 500);

    return res.status(status).json({
      success: false,
      message: darajaMessage || error.message
    });
  }
});

app.post('/mpesa/callback', (req, res) => {
  const callback = req.body?.Body?.stkCallback;

  if (!callback) {
    console.warn('Received invalid M-Pesa callback payload');
    return res.status(400).json({ ResultCode: 1, ResultDesc: 'Rejected' });
  }

  const metadata = {};
  for (const item of callback.CallbackMetadata?.Item || []) {
    metadata[item.Name] = item.Value;
  }

  const transaction = transactions.get(callback.CheckoutRequestID);
  if (transaction) {
    transaction.status = callback.ResultCode === 0 ? 'success' : 'failed';
    transaction.resultCode = callback.ResultCode;
    transaction.resultDescription = callback.ResultDesc;
    transaction.receiptNumber = metadata.MpesaReceiptNumber;
    transaction.updatedAt = new Date().toISOString();
  }

  console.log('M-Pesa callback:', JSON.stringify({
    merchantRequestId: callback.MerchantRequestID,
    checkoutRequestId: callback.CheckoutRequestID,
    resultCode: callback.ResultCode,
    resultDescription: callback.ResultDesc,
    metadata
  }, null, 2));

  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

app.get('/api/transactions/:checkoutRequestId', (req, res) => {
  const transaction = transactions.get(req.params.checkoutRequestId);

  if (!transaction) {
    return res.status(404).json({ success: false, message: 'Transaction not found' });
  }

  return res.json({ success: true, transaction });
});

app.get('/api/health', (_req, res) => res.json({
  status: 'ok',
  environment: darajaEnvironment
}));

const port = Number(process.env.PORT) || 3000;

if (require.main === module) {
  app.listen(port, () => {
    console.log(`M-Pesa STK Push server listening on http://localhost:${port}`);
  });
}

module.exports = app;
