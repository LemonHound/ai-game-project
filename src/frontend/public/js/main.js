// main.js - Minimal JavaScript for behavior only, no HTML rendering
document.addEventListener('DOMContentLoaded', function () {
  initializePageBehavior();
});

function initializePageBehavior() {
  // Handle any dynamic behavior that can't be done with pure CSS
  // For example, handling complex form submissions, API calls, etc.

  // Example: Auto-focus first input in modals when they open
  const modals = document.querySelectorAll('.modal');
  modals.forEach((modal) => {
    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'class'
        ) {
          if (modal.classList.contains('modal-open')) {
            const firstInput = modal.querySelector('input');
            if (firstInput) {
              setTimeout(() => firstInput.focus(), 100);
            }
          }
        }
      });
    });

    observer.observe(modal, {
      attributes: true,
      attributeFilter: ['class'],
    });
  });
}

// Utility functions for common interactions
function handleFormSubmission(formId, callback) {
  const form = document.getElementById(formId);
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (callback) callback(new FormData(form));
    });
  }
}

// Example API helper function
async function apiCall(endpoint, method = 'GET', data = null) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(endpoint, options);
    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
}
