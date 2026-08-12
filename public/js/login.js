(function () {
  const form = document.querySelector('[data-login-form]');
  if (!form) {
    return;
  }

  const credentialsStep = form.querySelector('[data-step="credentials"]');
  const mfaStep = form.querySelector('[data-step="mfa"]');
  const backButton = form.querySelector('[data-back-button]');
  const submitButton = form.querySelector('[data-submit-button]');
  const mfaStepInput = document.getElementById('mfaStep');
  const themeInput = document.getElementById('themePreference');

  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const mfaTokenInput = document.getElementById('mfaToken');

  // theme-init-head.ejs runs in <head> on this page and owns the theme; without
  // it the field keeps its server-rendered value.
  function syncThemePreference() {
    if (themeInput && window.zrTheme) {
      themeInput.value = window.zrTheme.get();
    }
  }

  function isMfaActive() {
    return mfaStep && mfaStep.classList.contains('is-active');
  }

  function updateFieldRequirements(mfaActive) {
    if (usernameInput) {
      usernameInput.required = !mfaActive;
    }
    if (passwordInput) {
      passwordInput.required = !mfaActive;
    }
    if (mfaTokenInput) {
      mfaTokenInput.required = mfaActive;
    }
  }

  function setActiveStep(step) {
    const mfaActive = step === 'mfa';

    if (credentialsStep) {
      credentialsStep.classList.toggle('is-active', !mfaActive);
      credentialsStep.setAttribute('aria-hidden', mfaActive ? 'true' : 'false');
    }

    if (mfaStep) {
      mfaStep.classList.toggle('is-active', mfaActive);
      mfaStep.setAttribute('aria-hidden', mfaActive ? 'false' : 'true');
    }

    if (backButton) {
      backButton.classList.toggle('hidden', !mfaActive);
    }

    if (mfaStepInput) {
      mfaStepInput.value = mfaActive ? '1' : '0';
    }

    updateFieldRequirements(mfaActive);
  }

  if (backButton) {
    backButton.addEventListener('click', function () {
      setActiveStep('credentials');
      if (mfaTokenInput) {
        mfaTokenInput.value = '';
      }
      if (usernameInput) {
        usernameInput.focus();
      }
    });
  }

  form.addEventListener('submit', function () {
    syncThemePreference();
    if (submitButton) {
      submitButton.classList.add('is-loading');
      submitButton.disabled = true;
      submitButton.setAttribute('aria-busy', 'true');
    }

    // Keep credentials available during MFA submit if browser omits disabled inputs.
    if (isMfaActive()) {
      if (passwordInput) {
        passwordInput.disabled = true;
      }
      if (usernameInput) {
        usernameInput.readOnly = true;
      }
    }
  });

  syncThemePreference();
  setActiveStep(isMfaActive() ? 'mfa' : 'credentials');
})();
