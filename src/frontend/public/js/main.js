// Simple, minimal JavaScript for basic functionality
document.addEventListener('DOMContentLoaded', function() {
    // Initialize infinite scroll for games
    initializeGamesScroll();

    // Initialize basic UI interactions
    initializeUIInteractions();
});

function initializeGamesScroll() {
    const gamesContainer = document.getElementById('games-container');
    if (!gamesContainer){
        console.log("no games container found");
        return;
    }

    const gameCards = Array.from(gamesContainer.children);

    // Clone game cards for infinite scroll
    gameCards.forEach(card => {
        const clone = card.cloneNode(true);
        gamesContainer.appendChild(clone);
    });

    // Set up infinite scroll
    let isScrolling = false;

    gamesContainer.addEventListener('scroll', function() {
        if (isScrolling) return;

        const scrollTop = gamesContainer.scrollTop;
        const scrollHeight = gamesContainer.scrollHeight;
        const clientHeight = gamesContainer.clientHeight;

        // When near bottom, reset scroll to create infinite loop
        if (scrollTop + clientHeight >= scrollHeight - 100) {
            isScrolling = true;
            setTimeout(() => {
                gamesContainer.scrollTop = 100;
                isScrolling = false;
            }, 50);
        }

        // When near top, jump to middle
        if (scrollTop <= 50) {
            isScrolling = true;
            setTimeout(() => {
                gamesContainer.scrollTop = scrollHeight / 2;
                isScrolling = false;
            }, 50);
        }
    });

    // Auto-scroll functionality
    let autoScrollInterval;

    function startAutoScroll() {
        autoScrollInterval = setInterval(() => {
            if (!isScrolling) {
                gamesContainer.scrollTop += 1;
            }
        }, 50);
    }

    function stopAutoScroll() {
        clearInterval(autoScrollInterval);
    }

    // Pause auto-scroll on hover
    gamesContainer.addEventListener('mouseenter', stopAutoScroll);
    gamesContainer.addEventListener('mouseleave', startAutoScroll);

    // Start auto-scroll initially
    startAutoScroll();
}

function initializeUIInteractions() {
    // Login button functionality
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', function() {
            // TODO: Implement actual login modal/page
            alert('Login functionality would be implemented here');
        });
    }

    // Get started button functionality
    const getStartedBtn = document.getElementById('get-started-btn');
    if (getStartedBtn) {
        getStartedBtn.addEventListener('click', function() {
            alert("no");
            // TODO: Implement getting started logic modal/page
        });
    }

    // Game card click handlers
    const gameCards = document.getElementById('games-container').children;
    console.log("game cards:", gameCards);
    Array.from(gameCards).forEach(card => {
        card.addEventListener('click', function() {
            // TODO: Navigate to individual game pages
            alert('Game functionality would navigate to a separate game page');
        });
    });
}