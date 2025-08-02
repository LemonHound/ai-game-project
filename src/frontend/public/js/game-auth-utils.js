class GameAuthUtils {
  static async waitForAuthManager(maxWaitTime = 5000) {
    if (window.authManager && window.authManager.isReady) {
      return true;
    }

    if (!window.authManager) {
      // Wait for AuthManager to be created
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('AuthManager never initialized');
          resolve(false);
        }, maxWaitTime);

        const checkForAuthManager = () => {
          if (window.authManager) {
            clearTimeout(timeout);
            resolve(window.authManager.waitForReady(maxWaitTime));
          } else {
            setTimeout(checkForAuthManager, 50);
          }
        };

        checkForAuthManager();
      });
    }

    return window.authManager.waitForReady(maxWaitTime);
  }

  static async checkAuthBeforeAction(
    actionName = 'play',
    aiThoughtsElementId = 'ai-thoughts'
  ) {
    const isReady = await this.waitForAuthManager();

    if (!isReady || !window.authManager) {
      this.updateAIThoughts(
        aiThoughtsElementId,
        'Authentication system is loading... Please wait.'
      );
      return false;
    }

    return window.authManager.checkAuthBeforeGameAction(
      actionName,
      aiThoughtsElementId
    );
  }

  static async handleGameApiCall(apiCall, aiThoughtsElementId = 'ai-thoughts') {
    const isReady = await this.waitForAuthManager();

    if (!isReady || !window.authManager) {
      this.updateAIThoughts(
        aiThoughtsElementId,
        'Authentication system is loading... Please wait.'
      );
      return null;
    }

    return await window.authManager.handleGameApiCall(
      apiCall,
      aiThoughtsElementId
    );
  }

  static updateAIThoughts(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = message;
    }
  }

  static showLoginRequiredModal() {
    if (window.authManager) {
      window.authManager.showLoginRequiredModal();
    }
  }

  static async isAuthenticated() {
    const isReady = await this.waitForAuthManager();
    return (
      isReady &&
      window.authManager &&
      window.authManager.isAuthenticatedForGames()
    );
  }
}

window.GameAuthUtils = GameAuthUtils;
