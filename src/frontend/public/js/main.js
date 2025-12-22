document.addEventListener('DOMContentLoaded', function () {
    initializePageBehavior();
});

function initializePageBehavior() {
    // Handle any dynamic behavior that can't be done with pure CSS

    // Example: Auto-focus first input in modals when they open
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        const observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
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
