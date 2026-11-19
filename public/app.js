const form = document.querySelector('#payment-form');
const status = document.querySelector('#status');
const submitButton = document.querySelector('#submit-button');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  status.className = '';
  status.textContent = 'Sending request...';
  submitButton.disabled = true;

  try {
    const data = new FormData(form);
    const response = await fetch('/api/stkpush', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: data.get('phone'),
        amount: Number(data.get('amount'))
      })
    });

    const result = await response.json();
    status.textContent = result.message;
    status.className = response.ok ? 'success' : 'error';

    if (response.ok && result.checkoutRequestId) {
      pollTransaction(result.checkoutRequestId);
    }
  } catch (error) {
    status.textContent = 'Could not connect to the payment server.';
    status.className = 'error';
  } finally {
    submitButton.disabled = false;
  }
});

async function pollTransaction(checkoutRequestId) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const response = await fetch(`/api/transactions/${encodeURIComponent(checkoutRequestId)}`);
      if (!response.ok) continue;

      const result = await response.json();
      const transaction = result.transaction;

      if (transaction.status === 'success') {
        status.textContent = `Payment successful${transaction.receiptNumber ? `. Receipt: ${transaction.receiptNumber}` : '.'}`;
        status.className = 'success';
        return;
      }

      if (transaction.status === 'failed') {
        status.textContent = transaction.resultDescription || 'Payment failed or was cancelled.';
        status.className = 'error';
        return;
      }

      status.textContent = 'Waiting for M-Pesa confirmation...';
    } catch (error) {
      // The next poll is allowed to retry the status request.
    }
  }
}
