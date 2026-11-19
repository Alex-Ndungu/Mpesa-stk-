const form = document.querySelector('#payment-form');
const status = document.querySelector('#status');
const submitButton = document.querySelector('#submit-button');

form.addEventListener('submit', async (event) => {
  event.preventEvent();
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
  } catch (error) {
    status.textContent = 'Could not connect to the payment server.';
    status.className = 'error';
  } finally {
    submitButton.disabled = false;
  }
});
